# WorshipBand AI (MVP)

반주자가 없는 소규모/시골 교회를 위해, 찬양 인도자의 마이크 멘트를 인식해서
자동으로 밴드 반주(드럼/베이스/일렉기타/피아노/신디사이저)를 이끌어가는
React Native(Expo) 앱의 초기 MVP.

인도자가 유튜브 찬양 영상을 "콘티"로 등록하면, 백엔드 학습 파이프라인이
곡 구조(인트로/절/후렴/브릿지/**기타 솔로**/엔딩)를 분석해서, AI가 진행에
맞춰 자동으로 반주 — 특히 원곡의 실제 기타 솔로 구간까지 — 이어가도록
설계되어 있다 (백엔드는 설계 초안 / 레퍼런스 구현, 아래 4장 참고).

## 1. 디렉토리 구조

```
worshipband-ai/
├── App.tsx                        # 진입점: "찬양 진행" / "콘티 관리" 탭 스위치
├── app.json                       # Expo 설정 (마이크/음성인식 권한, 플러그인)
├── babel.config.js
├── package.json
├── tsconfig.json
├── assets/
│   └── tracks/
│       ├── drums.wav / bass.wav / guitar.wav / piano.wav / synth.wav
│       │                                 # loop 모드 데모 곡의 2초 루프 placeholder
│       └── learned-demo/                # timeline 모드 데모 곡 (24초, 16~20초 구간에
│                                         # 실제 "기타 솔로" 프레이즈 포함 — mock 학습 결과용)
├── src/
│   ├── types.ts                   # SectionId / InstrumentId / SongConfig / SetlistSong 등
│   ├── constants/
│   │   ├── sections.ts            # 파트별(SECTION_MIX) 악기 목표 볼륨 프리셋
│   │   ├── triggers.ts            # 멘트 키워드 → intent 매핑 테이블 + 매칭 함수
│   │   ├── demoSong.ts            # loop 모드 데모 곡
│   │   └── mockLearnedSong.ts     # timeline 모드 데모 곡 (기타 솔로 seek 시연용)
│   ├── hooks/
│   │   └── useVoiceIntentEngine.ts # 마이크 권한 + 실시간 STT + 키워드 인식 훅
│   ├── audio/
│   │   ├── AudioEngine.ts         # 5트랙 동시 재생 + loop/timeline 두 모드 지원 엔진
│   │   └── useAudioEngine.ts      # AudioEngine 을 React 생명주기에 연결하는 훅
│   ├── services/
│   │   ├── types.ts               # SongLearningApi 인터페이스 (앱 ↔ 백엔드 계약)
│   │   ├── songLearningApi.ts     # 실제 backend/ 서버를 호출하는 fetch 클라이언트
│   │   ├── mockSongLearningApi.ts # 백엔드 없이 등록→분석중→완료 흐름을 흉내내는 mock
│   │   └── index.ts               # EXPO_PUBLIC_API_BASE_URL 유무로 실제/mock 자동 선택
│   ├── components/
│   │   ├── BigActionButton.tsx    # 인도자용 대형 수동 버튼
│   │   ├── NowPlayingHeader.tsx   # BPM / Key / 현재 파트 표시
│   │   └── InstrumentIndicator.tsx# 악기별(드럼/베이스/기타/피아노/신디) 활성화 표시
│   └── screens/
│       ├── MainScreen.tsx         # 음성 인식 + 오디오 엔진 조립, 수동 버튼 UI
│       └── SetlistScreen.tsx      # 유튜브 콘티 등록/목록/학습 상태/곡 선택 화면
└── backend/                       # 콘티 학습 파이프라인 설계 초안 (FastAPI, 별도 README)
```

## 2. 필수 라이브러리

| 목적 | 라이브러리 |
|---|---|
| 앱 프레임워크 | `expo`, `expo-dev-client` (네이티브 모듈 때문에 **Expo Go 불가**, dev-client 빌드 필요) |
| 멀티트랙 오디오 재생/볼륨 제어 | `expo-av` |
| 실시간 STT (온디바이스, Apple Speech / Android SpeechRecognizer) | `expo-speech-recognition` |
| 상태 관리(선택) | `zustand` |
| 언어 | TypeScript |

설치:

```bash
cd worshipband-ai
npx expo install expo-av expo-speech-recognition expo-dev-client
npm install zustand
npx expo prebuild
npx expo run:ios   # 또는 run:android
```

`expo-speech-recognition`은 네이티브 권한/모듈을 포함하므로 **Expo Go 앱에서는 동작하지 않는다.**
`expo-dev-client`로 커스텀 개발 빌드를 만들어야 마이크 STT 기능을 테스트할 수 있다.
(오디오 재생 자체만 테스트하려면 Expo Go 에서도 `expo-av` 부분은 동작한다.)

## 3. 핵심 로직 요약

### 3-1. 음성 인식 & 키워드 추출 — `src/hooks/useVoiceIntentEngine.ts`
- `ExpoSpeechRecognitionModule.requestPermissionsAsync()` 로 마이크/음성인식 권한 요청.
- `continuous: true, interimResults: true` 로 실시간 연속 인식.
- 인식된 transcript를 `src/constants/triggers.ts`의 `matchIntent()`로 넘겨
  "후렴", "조용히", "처음부터", "솔로", "키 올려" 등 키워드를 포함하는지 검사.
- 동일 intent가 3초(`INTENT_COOLDOWN_MS`) 안에 중복 발동하지 않도록 쿨다운 처리.

### 3-2. 스마트 오디오 엔진 — `src/audio/AudioEngine.ts`
`expo-av`의 `Audio.Sound` 5개(드럼/베이스/**일렉기타**/피아노/신디)를 동시 재생하며,
곡의 `mode` 에 따라 섹션 전환 방식이 달라진다.

- **`mode: "loop"`** (수동 제작 곡, `demoSong.ts`): 몇 초짜리 루프를 반복 재생하며
  섹션마다 볼륨 믹스만 바꾼다.
  1. 기준 트랙(드럼)의 현재 위치로 **다음 마디(bar) 경계까지 남은 시간**을 계산(`msUntilNextBar`).
  2. 그 시점에 맞춰 목표 악기 믹스(`SECTION_MIX`)로 부드럽게 크로스페이드(`applyMix`, 기본 900ms).
- **`mode: "timeline"`** (유튜브에서 학습된 곡, `mockLearnedSong.ts`): 5개 트랙 모두
  실제 원곡과 같은 시간축을 공유하는 풀렝스 스템이다.
  1. `goToSection("SOLO")` 등을 호출하면, 학습된 `timeline` 에서 그 섹션의 원곡
     타임스탬프를 찾아 **5개 트랙을 동시에 그 지점으로 seek**한다.
  2. 그대로 재생을 이어가며 믹스를 전환(짧은 400ms 페이드로 점프를 자연스럽게 가림).
  3. 기타 솔로는 AI가 새로 연주를 "작곡"하는 게 아니라, 백엔드가 원곡에서 분리·탐지한
     **실제 기타 솔로 구간**을 그 타이밍에 그대로 재생하는 방식이다 (4장 참고).
  4. 원곡에 없는 섹션(예: 브릿지가 없는 곡에서 "브릿지")을 요청하면 조용히 무시한다.

- `triggerFullBand()`는 즉시성이 중요한 "다같이 크게!" 같은 멘트를 위해 quantize/seek 없이 바로 믹스만 전환.
- `shiftKey(semitones)`는 `setStatusAsync({ rate, shouldCorrectPitch: false })`로 재생 속도를 바꿔
  피치를 근사적으로 올리고 내린다.

### 3-3. 콘티(유튜브 학습) 등록 — `src/screens/SetlistScreen.tsx`
- 제목 + 유튜브 링크 입력, **저작권/사용권 보유 확인 체크** (미체크 시 등록 불가 — 4장 참고).
- `songLearningApi.registerYoutubeSong()` 호출 → 상태 `PENDING` 으로 등록.
- 진행 중인 곡이 있으면 1초마다 `listSetlist()` 를 다시 불러 `PENDING → ANALYZING → READY`
  전환을 화면에 반영.
- `READY` 상태인 곡에서 "이 곡 사용하기"를 누르면 그 `SongConfig`(mode: "timeline")를
  `MainScreen` 에 넘겨 바로 재생 대상으로 전환.
- `src/services/index.ts` 는 `EXPO_PUBLIC_API_BASE_URL` 환경변수가 있으면 실제
  `backend/` 서버를, 없으면 `mockSongLearningApi`(인메모리, 3.5초 후 자동으로
  `mockLearnedSong.ts` 를 "학습 결과"로 반환)를 사용한다 — **백엔드 없이도 앱만으로
  전체 흐름을 바로 시연**할 수 있다.

## 4. 유튜브 콘티 학습 파이프라인 (백엔드, 설계 초안)

`backend/` 에 FastAPI 기반 레퍼런스 구현이 있다. 자세한 아키텍처, API 계약,
알고리즘 설명(왜 `htdemucs_6s` 모델을 쓰는지, 기타 솔로를 어떻게 "생성"이
아니라 "탐지+재현"하는지 등), 실행 방법은 **`backend/README.md`** 를 참고할 것.

> 이 백엔드는 인터넷·GPU가 없는 현재 개발 환경에서 실제로 돌려볼 수 없었다.
> 코드 구조와 API 계약은 앱과 정확히 맞도록 작성했지만, 로컬/클라우드 GPU
> 환경에서 `yt-dlp`/`demucs` 설치 후 직접 검증이 필요한 **설계 초안**이다.

요약 흐름: 유튜브 URL → 오디오 추출(yt-dlp) → 6-스템 분리(demucs `htdemucs_6s`:
drums/bass/other/vocals/guitar/piano) → 구조·기타 솔로 구간 탐지(librosa 기반
휴리스틱) → 앱이 쓰는 것과 동일한 `SongConfig` JSON 조립.

**저작권 주의**: 유튜브 영상을 다운로드/분석하는 것은 대부분의 경우 이용약관·
저작권 위반 소지가 있다. 이 기능은 교회가 직접 제작했거나, 명시적 허락을
받았거나, CCLI 등 합법적 라이선스가 있는 음원에만 사용해야 한다. 앱과 서버
양쪽 모두 `rightsConfirmed` 체크 없이는 등록을 거부하도록 되어 있다.

## 5. 알려진 한계 (MVP 이후 개선 포인트)

1. **정밀 동기화**: `expo-av`의 여러 `Sound` 인스턴스를 개별 재생하므로 샘플 단위 위상 동기화는 보장되지 않는다.
   프로덕션에서는 네이티브 오디오 그래프(예: 자체 네이티브 모듈, AVAudioEngine/AAudio 믹서)로 교체 권장.
2. **키(Key) 변경**: 현재는 재생 속도를 바꾸는 방식이라 **템포도 함께 변한다** (진짜 피치 시프트가 아님).
   실제 서비스에서는 전용 pitch-shift DSP(네이티브 모듈 또는 서버 사이드 전처리로 곡별 키 프리셋 제공)가 필요하다.
3. **STT 정확도**: 시골 교회의 마이크 환경(하울링, 잡음, 사투리)에서 키워드 인식률이 떨어질 수 있어
   트리거 문구는 반드시 현장 테스트 후 `src/constants/triggers.ts`를 보강해야 한다.
4. **데모 트랙**: `assets/tracks/*.wav`, `assets/tracks/learned-demo/*.wav` 는 실제 찬양
   스템이 아니라 배선 확인용 placeholder다. 실제 서비스 곡은 진짜 5-스템 오디오로 교체해야 한다.
5. **백엔드 미검증**: 4장에서 언급한 대로 학습 파이프라인은 실제로 돌려보지 못한 설계 초안이다.
6. **자동 추종 모드 없음**: 현재는 인도자가 멘트/버튼으로 섹션을 직접 트리거해야 한다.
   타임라인 정보를 활용해 "말 없이도 원곡 흐름을 그대로 따라가는" 완전 자동 모드는
   자연스러운 다음 단계지만, 오작동(엉뚱한 지점 자동 전환) 리스크가 있어 이번 MVP
   범위에서는 제외했다.

## 6. 바로 테스트해보기

```bash
cd worshipband-ai
npm install
npx expo prebuild
npx expo run:ios     # 또는: npx expo run:android
```

앱이 뜨면:
1. **찬양 진행** 탭: "처음부터" 버튼으로 데모 루프 재생 시작 → "후렴" / "기타 솔로" /
   "조용히" / "엔딩" 버튼으로 악기 믹스가 부드럽게 전환되는지 확인.
2. **콘티 관리** 탭: 아무 제목/유튜브 링크나 입력하고 저작권 확인 체크 후 "학습 요청" →
   약 1.2초 뒤 "분석중", 3.5초 뒤 "학습 완료"로 상태가 바뀌는 걸 확인 → "이 곡 사용하기"를
   누르면 찬양 진행 탭으로 돌아가 timeline 모드 데모 곡이 로드된다.
3. 그 상태에서 "기타 솔로" 버튼을 누르면, 5개 트랙이 모두 원곡의 솔로 시작 지점(16초)으로
   동시에 점프하며 기타가 도드라지는 걸 들을 수 있다 — "브릿지"처럼 이 데모 곡에 없는
   섹션을 누르면 아무 일도 일어나지 않는 것도 확인 가능.
4. "🎙️ 음성 인식 시작"을 눌러 마이크 권한을 허용한 뒤, "후렴 가겠습니다", "솔로 가겠습니다"
   등을 실제로 말해보면 동일한 전환이 음성으로도 트리거된다.
