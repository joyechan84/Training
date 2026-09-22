# WorshipBand AI — 콘티 학습 백엔드 (설계 초안)

앱(`worshipband-ai/`)의 "콘티 관리" 화면에서 유튜브 링크를 등록하면, 이 서버가
① 오디오 추출 → ② 5(6)-스템 분리 → ③ 곡 구조/기타 솔로 구간 탐지 →
④ 앱이 바로 쓸 수 있는 `SongConfig` JSON 조립까지 처리한다는 **아키텍처
설계와 레퍼런스 코드**다.

> **중요**: 이 서버는 GPU와 인터넷 접속이 있는 환경에서 `yt-dlp` /
> `demucs` 모델을 실제로 내려받아 돌려야 동작한다. 이 리포지토리를 만든
> 샌드박스 환경에는 인터넷·GPU가 없어 파이프라인을 실제로 실행/검증하지
> **못했다.** 코드 구조·API 계약·알고리즘 설명은 정확하지만, 로컬 또는
> 클라우드 GPU 환경에서 직접 설치 후 검증이 반드시 필요하다.

## 1. 저작권/이용약관 주의사항 (반드시 읽을 것)

유튜브 영상을 서버로 다운로드해 오디오를 추출하는 것은 대부분의 경우
**유튜브 이용약관 및 저작권법 위반 소지**가 있다. 이 서버(와 앱의 등록
화면)는 다음 용도로만 사용해야 한다:

1. 교회가 **직접 녹음/제작**한 반주·워십 음원
2. 저작권자로부터 **명시적으로 사용 허락**을 받은 음원
3. CCLI SongSelect 등 **합법적 라이선스**로 제공되는 반주/멀티트랙 음원

앱의 등록 폼과 이 서버의 `POST /songs` 는 `rightsConfirmed=true` 가 아니면
요청 자체를 거부하도록 이미 되어 있다(`main.py: register_song`). 실제
서비스로 배포한다면 여기서 한 걸음 더 나아가, 등록자가 저작권을 보유한
음원이라는 증빙(라이선스 문서 업로드 등)을 받는 절차를 추가하는 것을
권장한다. 임의의 유튜브 커버 영상을 무단으로 반주 소스로 재활용하는 건
이 프로젝트의 의도된 사용법이 아니다.

## 2. API 계약

앱의 `src/services/songLearningApi.ts` / `src/services/types.ts` 와
1:1로 맞는 계약이다.

```
POST /songs
  body: { "title": string, "youtubeUrl": string, "rightsConfirmed": boolean }
  -> SetlistSong (status: "PENDING")

GET /songs
  -> SetlistSong[]   # 최신 등록순

GET /songs/{id}
  -> SetlistSong
```

```ts
type LearningStatus = "PENDING" | "ANALYZING" | "READY" | "FAILED";

interface SetlistSong {
  id: string;
  title: string;
  youtubeUrl: string;
  status: LearningStatus;
  songConfig?: SongConfig;   // READY 일 때만
  errorMessage?: string;     // FAILED 일 때만
  requestedAt: string;       // ISO timestamp
}

interface TimelineCue {
  section: "INTRO" | "VERSE" | "CHORUS" | "BRIDGE" | "SOLO" | "QUIET" | "ENDING" | "STOP";
  atMs: number;
  // 있으면 일반 SECTION_MIX 프리셋 대신 이 값을 쓴다 (3-2 참고).
  mix?: { drums: number; bass: number; guitar: number; piano: number; synth: number };
}
```

`songConfig.tracks` 의 각 값은 `"${API_BASE}/static/{songId}/{stem}.wav"`
형태의 URL이며, 앱은 이를 `{ uri: url }` 로 `Audio.Sound.createAsync` 에
그대로 넘긴다 (loop 모드 데모 곡의 `require()` 와 동일한 `AVPlaybackSource`
타입이라 `AudioEngine` 쪽 코드 변경이 필요 없다).

## 3. 파이프라인 아키텍처

```
유튜브 URL
   │  pipeline/extract_audio.py  (yt-dlp)
   ▼
원곡 wav
   │  pipeline/separate_stems.py  (demucs, htdemucs_6s 모델)
   ▼
6-스템: drums / bass / other / vocals / guitar / piano
   │  pipeline/detect_sections.py  (librosa)
   ▼
구조 타임라인: INTRO/VERSE/CHORUS/BRIDGE/SOLO/ENDING + BPM
   │  pipeline/build_song_config.py
   ▼
SongConfig JSON (mode: "timeline") — 앱이 바로 재생 가능
```

### 3-1. 왜 `htdemucs_6s` 인가

Demucs의 6-소스 모델(`htdemucs_6s`)은 `drums / bass / other / vocals /
guitar / piano` 를 직접 출력한다. 이 앱의 악기 구성(드럼/베이스/**일렉기타**/
피아노/신디)과 거의 그대로 맞아떨어져서, "other"(=신스/현악 등 나머지)만
`synth` 트랙에 매핑하면 된다 (`pipeline/separate_stems.py:INSTRUMENT_TO_DEMUCS_STEM`).

### 3-2. 기타 솔로 구간을 "생성"하지 않고 "재현"하는 이유

AI가 매번 새로운 즉흥 솔로를 실시간 생성하려면 전용 생성 모델과 상당한
R&D가 필요하다. 대신 이 설계는 **원곡에 실제로 있는 기타 솔로 구간을
찾아내** 그 원본 연주(분리된 guitar 스템)를 그대로 재생한다:

1. `detect_sections.py` 가 vocals 스템 에너지가 낮고(보컬이 거의 없고)
   guitar 스템 에너지가 평균보다 높은 구간을 `SOLO` 로 라벨링한다.
2. 같은 함수가 구간별로 drums/bass/guitar/piano/synth 각 스템의 RMS
   에너지를 그 악기가 곡 전체에서 낸 최대치로 정규화해 **구간별
   악기 mix(0~1)** 를 만든다 (`_compute_segment_mixes`). 즉 "이 곡은
   이 솔로 구간에 드럼·베이스는 받쳐주고, 피아노·신디는 거의 없다"는
   식으로, 장르 공통 프리셋이 아니라 **그 곡 고유의 편곡**을 학습한다.
3. `build_song_config.py` 가 이 mix 를 `timeline[i].mix` 에 그대로 실어
   `SongConfig` 에 포함시킨다.

### 3-3. 인도자의 멘트 없이도 자동으로 따라가는 이유

솔로 구간은 정의상 인도자가 마이크에 대고 아무 말도 하지 않는 순간이라,
음성 트리거로는 애초에 잡을 수 없다. 그래서 이 mix 정보는 "인도자가
말했을 때만" 쓰이는 게 아니라, **재생 중 자동으로** 적용된다:

- 앱의 `AudioEngine` 은 timeline 모드 곡을 재생 시작(`playAll`)하거나
  인도자가 수동으로 특정 구간으로 점프(`goToSection`)할 때마다, 그 시점
  이후에 나오는 모든 학습된 큐를 원곡과 같은 상대 타이밍으로
  `setTimeout` 예약해둔다(`scheduleAutoFollow`).
- 각 큐가 도래하면 (있다면) `timeline[i].mix` 로, 없으면 일반
  `SECTION_MIX` 프리셋으로 부드럽게 크로스페이드한다 — 버튼도, 음성도
  필요 없다.
- 인도자가 원곡과 다르게 진행하고 싶을 때(예: 후렴 한 번 더)는 언제든
  버튼/음성으로 개입할 수 있고, 개입한 시점부터 다시 남은 타임라인이
  자동으로 이어진다. MainScreen 의 "자동 진행" 스위치로 이 동작 자체를
  완전히 끌 수도 있다.

이 방식은 기술적으로 훨씬 현실적이고, 지금 아키텍처(스템 볼륨 제어)에
자연스럽게 들어맞는다. 실시간 AI 즉흥 연주는 로드맵으로 남겨둔다
(README 루트 문서의 "향후 개선" 참고).

### 3-4. 구조/믹스 탐지 알고리즘 요약

- **BPM**: `librosa.beat.beat_track`
- **구간 경계**: 크로마 특징의 자기유사도 행렬에서 인접 윈도우 간 유사도
  변화(novelty)가 큰 지점을 피크피킹 (Foote 2000 방식의 단순화 버전)
- **라벨링(휴리스틱)**: 첫 구간=INTRO, 마지막 구간=ENDING, 가장 큰 구간=CHORUS,
  보컬 없고 기타가 두드러지는 구간=SOLO, 나머지는 등장 순서로 VERSE/BRIDGE
- **구간별 악기 mix**: 위 3-2 참고 (`_compute_segment_mixes`)
- **키(Key) 추정**: 현재 `build_song_config.py` 에 TODO로 남겨둠
  (크로마 프로파일 + Krumhansl-Schmuckler 알고리즘으로 확장 가능)

이 휴리스틱은 베이스라인이다. 실제 서비스 품질을 높이려면 다수의 CCM/찬양
곡으로 검증하며 임계값을 튜닝하거나, 구조 분석 전용 모델로 교체하는 걸
권장한다.

## 4. 로컬 실행 (GPU 환경 필요)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

uvicorn main:app --reload --port 8000
```

앱 쪽에서는 `.env` 또는 `app.config.js` 에 다음을 설정하면 mock 대신 이
서버를 사용한다 (`src/services/index.ts` 참고):

```
EXPO_PUBLIC_API_BASE_URL=http://<서버-주소>:8000
```

## 5. 알려진 한계 / TODO

- **미검증**: 위에서 언급했듯 이 샌드박스에서 실제 실행 검증을 하지 못했다.
  특히 `demucs` 모델 다운로드, `htdemucs_6s` 출력 파일명, `yt-dlp` 옵션은
  버전에 따라 달라질 수 있으니 실제 설치 후 확인이 필요하다.
- **작업 큐**: 지금은 FastAPI `BackgroundTasks` 로 동기 처리한다. 여러 곡을
  동시에 등록하면 서버가 막힐 수 있으니, 실제 배포에서는 Celery/RQ +
  워커 풀로 교체해야 한다.
- **저장소**: 곡 메타데이터가 프로세스 메모리에만 있어 서버 재시작 시
  날아간다. DB로 교체 필요.
- **키(Key) 추정 미구현** (위 3-3 참고).
- **오디오 동기화**: 타임라인 모드는 "같은 원곡에서 분리된 스템이므로
  같은 위치로 seek 하면 자동으로 맞는다"는 전제에 의존한다. 트랙별 파일
  길이가 미세하게 다르면(디코더 차이 등) 롱런 시 드리프트가 생길 수 있어,
  실서비스 전 QA가 필요하다.
