# WorshipBand AI (MVP)

반주자가 없는 소규모/시골 교회를 위해, 찬양 인도자의 마이크 멘트를 인식해서
자동으로 밴드 반주(드럼/베이스/일렉기타/피아노/신디사이저)를 이끌어가는
React Native(Expo) 앱의 초기 MVP.

인도자가 유튜브 찬양 영상을 "콘티"로 등록하면, 백엔드 학습 파이프라인이
곡 구조(인트로/절/후렴/브릿지/**기타 솔로**/엔딩)와 **구간별로 실제 어떤
악기가 얼마나 연주되는지**를 분석한다. 기타 솔로는 정의상 인도자가 마이크에
대고 말을 하지 않는 순간이라 음성 트리거로 잡을 수 없기 때문에, 이렇게
학습된 곡은 재생 중 **말 없이도 원곡 흐름을 자동으로 따라간다** — 인도자가
할 일은 "처음부터"를 시작하는 것뿐이고, 그 이후 절/후렴/솔로/엔딩 전환은
학습된 타임라인이 알아서 이끈다 (수동 개입도 언제든 가능. 아래 3-2, 4장
참고. 백엔드는 설계 초안 / 레퍼런스 구현).

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
│   │   ├── useVoiceIntentEngine.ts     # 마이크 권한 + 실시간 STT + 키워드 인식 훅 (네이티브)
│   │   └── useVoiceIntentEngine.web.ts # 웹 빌드용 대체 구현 (2장 하단 참고)
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
| 브라우저 테스트(선택) | `react-dom`, `react-native-web`, `@expo/metro-runtime` — `expo start --web` 용 |

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

### 브라우저에서 빠르게 확인하기 (자동 진행 로직 검증용)

기기/시뮬레이터 없이도 오디오 엔진과 자동 진행(3-2) 로직을 바로 확인할 수 있도록
`react-dom` / `react-native-web` / `@expo/metro-runtime` 을 추가해뒀다:

```bash
npx expo start --web
```

이 방법으로 **실제 이 저장소 코드를 그대로 실행**해서 자동 진행 동작을 검증했다:
콘티 등록 → mock 학습 완료 → "처음부터" 한 번 클릭 후 **추가 조작 없이** 4초/10초/16초/20초
지점에서 절/후렴/기타 솔로/엔딩으로 자동 전환되고, 악기별 믹스(%)도 각 구간에서 학습된
값과 정확히 일치하는 걸 확인했다.

이 과정에서 실제 버그도 하나 발견해서 고쳤다: `expo-speech-recognition`의 웹 빌드는
`NativeModule`/`registerWebModule`/`useEventListener`처럼 이 프로젝트가 고정한 Expo
SDK(~51)에는 없는 API를 요구해서, 그대로 두면 `expo start --web` 실행 시 앱이 렌더링
시점에 크래시한다 (업스트림 패키지와 SDK 버전 간의 실제 호환성 문제). 이 앱의 음성 인식은
애초에 iOS/Android 온디바이스 STT 전용으로 설계되어 있으므로, `src/hooks/useVoiceIntentEngine.web.ts`
를 추가해 웹 빌드에서는 (Metro/webpack의 `.web.ts` 플랫폼 확장자 해석 규칙에 따라) 이
파일이 자동으로 대신 쓰이도록 했다 — "음성 인식은 아직 웹에서 지원되지 않습니다"라는
안내만 주고 기능은 꺼진다. 네이티브(iOS/Android) 쪽 `useVoiceIntentEngine.ts` 구현은
그대로다.

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
  실제 원곡과 같은 시간축을 공유하는 풀렝스 스템이며, 학습된 `timeline`의 각 큐는
  섹션 이름·시각뿐 아니라 **그 곡에서 실제로 측정된 악기별 믹스**(`TimelineCue.mix`,
  없으면 일반 `SECTION_MIX` 프리셋으로 대체)까지 갖고 있다.
  - **자동 진행(기본값, `autoFollowEnabled`)**: `playAll()`로 재생을 시작하거나
    `goToSection()`으로 점프할 때마다, 그 시점 이후 학습된 모든 큐를 원곡과 같은
    상대 타이밍으로 `setTimeout` 예약해둔다(`scheduleAutoFollow`). 각 큐가 도래하면
    **인도자의 어떤 멘트/버튼 없이도** 그 큐의 mix 로 자동 크로스페이드된다 —
    기타 솔로처럼 말이 없는 구간도 이렇게 원곡 그대로 자연스럽게 이어진다.
  - **수동 개입**: `goToSection("CHORUS")` 등을 호출(음성/버튼)하면, 학습된 타임라인에서
    그 섹션의 원곡 타임스탬프를 찾아 **5개 트랙을 동시에 그 지점으로 seek**하고
    믹스를 전환(짧은 400ms 페이드로 점프를 자연스럽게 가림)한 뒤, 그 지점부터
    남은 타임라인을 다시 자동 예약한다 — 즉흥으로 후렴을 반복해도 그다음부터는
    다시 자동으로 따라간다.
  - 기타 솔로는 AI가 새로 연주를 "작곡"하는 게 아니라, 백엔드가 원곡에서 분리·탐지한
    **실제 기타 솔로 구간**을 그 타이밍에 그대로 재생하는 방식이다 (4장 참고).
  - 원곡에 없는 섹션(예: 브릿지가 없는 곡에서 "브릿지")을 요청하면 조용히 무시한다.
  - `MainScreen`의 "자동 진행" 스위치(`setAutoFollow`)로 이 자동 추종 자체를
    완전히 끄고 순수 수동 조작만으로 바꿀 수 있다.

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
6. **자동 진행은 시각 기반 타이머**: `scheduleAutoFollow`는 학습된 절대 시각(ms)을 기준으로
   `setTimeout`을 예약하는 방식이라, 실제 재생 위치와 시스템 타이머 사이에 아주 약간의
   드리프트가 생길 수 있다(특히 앱이 백그라운드로 갔다 돌아오는 경우). 실서비스에서는
   `setInterval`로 실제 재생 위치를 주기적으로 확인해 보정하는 방식으로 강화하는 걸 권장한다.
7. **자동 진행 중 반복 구간**: 지금은 같은 섹션이 원곡에 여러 번 나와도 `timeline`에서
   첫 등장만 가지고 있어서, 자동 진행 자체는 문제없이 순서대로 흘러가지만 수동으로
   "후렴"을 트리거하면 항상 그 곡의 첫 번째 후렴 지점으로 점프한다(반복되는 후렴 중
   지금 있는 후렴이 아니라).

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
3. **자동 진행 확인 (버튼/음성 없이)**: "처음부터"만 누르고 아무것도 건드리지 말아보자.
   4초 뒤 절, 10초 뒤 후렴, **16초 뒤 아무 말/버튼 없이도 기타 솔로**로, 20초 뒤 엔딩으로
   자동 전환되는 걸 들을 수 있다 — 상단의 "자동 진행" 스위치를 꺼두면 이 자동 전환이
   멈추고, 이때는 버튼/음성으로만 섹션을 바꿔야 한다.
4. 재생 중 "후렴" 버튼을 눌러 수동으로 점프해보면, 5개 트랙이 그 지점으로 동시에 이동하고
   그 이후 남은 타임라인(예: 솔로→엔딩)이 다시 자동으로 이어지는 것도 확인 가능 —
   "브릿지"처럼 이 데모 곡에 없는 섹션을 누르면 아무 일도 일어나지 않는다.
5. "🎙️ 음성 인식 시작"을 눌러 마이크 권한을 허용한 뒤, "후렴 가겠습니다" 등을 실제로
   말해보면 동일한 전환이 음성으로도 트리거된다 (반대로 솔로는 원래 말이 없는
   구간이므로 음성 트리거를 굳이 쓸 필요가 없다 — 자동 진행이 알아서 처리).
