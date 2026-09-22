# WorshipBand AI (MVP)

반주자가 없는 소규모/시골 교회를 위해, 찬양 인도자의 마이크 멘트를 인식해서
자동으로 밴드 반주(드럼/베이스/피아노/신디사이저)를 이끌어가는 React Native(Expo) 앱의 초기 MVP.

## 1. 디렉토리 구조

```
worshipband-ai/
├── App.tsx                        # 진입점 (MainScreen 렌더)
├── app.json                       # Expo 설정 (마이크/음성인식 권한, 플러그인)
├── babel.config.js
├── package.json
├── tsconfig.json
├── assets/
│   └── tracks/                    # 곡별 4-스템 오디오 (demo용 placeholder wav 포함)
│       ├── drums.wav
│       ├── bass.wav
│       ├── piano.wav
│       └── synth.wav
└── src/
    ├── types.ts                   # SectionId / InstrumentId / VoiceIntent 등 공용 타입
    ├── constants/
    │   ├── sections.ts            # 파트별(SECTION_MIX) 악기 목표 볼륨 프리셋
    │   ├── triggers.ts            # 멘트 키워드 → intent 매핑 테이블 + 매칭 함수
    │   └── demoSong.ts            # 테스트용 데모 곡 설정 (require 된 wav 트랙 포함)
    ├── hooks/
    │   └── useVoiceIntentEngine.ts # 마이크 권한 + 실시간 STT + 키워드 인식 훅
    ├── audio/
    │   ├── AudioEngine.ts         # 4트랙 동시 재생 + 마디 단위 크로스페이드 엔진 (class)
    │   └── useAudioEngine.ts      # AudioEngine 을 React 생명주기에 연결하는 훅
    ├── components/
    │   ├── BigActionButton.tsx    # 인도자용 대형 수동 버튼
    │   ├── NowPlayingHeader.tsx   # BPM / Key / 현재 파트 표시
    │   └── InstrumentIndicator.tsx# 악기별 활성화 상태 아이콘 행
    └── screens/
        └── MainScreen.tsx         # 위 훅/컴포넌트를 조립하는 메인 화면
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
  "후렴", "조용히", "처음부터", "키 올려" 등 키워드를 포함하는지 검사.
- 동일 intent가 3초(`INTENT_COOLDOWN_MS`) 안에 중복 발동하지 않도록 쿨다운 처리.

### 3-2. 스마트 오디오 엔진 — `src/audio/AudioEngine.ts`
- `expo-av`의 `Audio.Sound` 4개(드럼/베이스/피아노/신디)를 동시에 루프 재생.
- `goToSection(section)` 호출 시:
  1. 기준 트랙(드럼)의 현재 재생 위치를 읽어 **다음 마디(bar) 경계까지 남은 시간**을 계산 (`msUntilNextBar`).
  2. 그 시점에 맞춰 목표 악기 믹스(`SECTION_MIX`)로 부드럽게 크로스페이드(`applyMix`, 기본 900ms).
  - 예: "후렴 가겠습니다" → `CHORUS` 믹스(전 악기 100%)로 전환.
  - 예: "조용히 묵상하겠습니다" → `QUIET` 믹스(드럼/베이스 0%, 피아노/패드만 유지)로 전환.
- `triggerFullBand()`는 즉시성이 중요한 "다같이 크게!" 같은 멘트를 위해 quantize 없이 바로 전환.
- `shiftKey(semitones)`는 `setStatusAsync({ rate, shouldCorrectPitch: false })`로 재생 속도를 바꿔
  피치를 근사적으로 올리고 내린다.

## 4. 알려진 한계 (MVP 이후 개선 포인트)

1. **정밀 동기화**: `expo-av`의 여러 `Sound` 인스턴스를 개별 재생하므로 샘플 단위 위상 동기화는 보장되지 않는다.
   프로덕션에서는 네이티브 오디오 그래프(예: 자체 네이티브 모듈, AVAudioEngine/AAudio 믹서)로 교체 권장.
2. **키(Key) 변경**: 현재는 재생 속도를 바꾸는 방식이라 **템포도 함께 변한다** (진짜 피치 시프트가 아님).
   실제 서비스에서는 전용 pitch-shift DSP(네이티브 모듈 또는 서버 사이드 전처리로 곡별 키 프리셋 제공)가 필요하다.
3. **STT 정확도**: 시골 교회의 마이크 환경(하울링, 잡음, 사투리)에서 키워드 인식률이 떨어질 수 있어
   트리거 문구는 반드시 현장 테스트 후 `src/constants/triggers.ts`를 보강해야 한다.
4. **데모 트랙**: `assets/tracks/*.wav`는 실제 찬양 스템이 아니라 배선 확인용 2초 루프(placeholder)다.
   실제 서비스 곡은 4-스템으로 분리된 오디오 세트로 교체해야 한다.

## 5. 바로 테스트해보기

```bash
cd worshipband-ai
npm install
npx expo prebuild
npx expo run:ios     # 또는: npx expo run:android
```

앱이 뜨면:
1. 트랙이 로딩된 후 "처음부터" 버튼을 눌러 데모 루프 재생 시작.
2. "후렴" / "조용히" / "엔딩" 버튼으로 악기 믹스가 부드럽게 전환되는지 확인.
3. "🎙️ 음성 인식 시작"을 눌러 마이크 권한을 허용한 뒤, "후렴 가겠습니다", "조용히 묵상하겠습니다" 등을
   실제로 말해보면 동일한 전환이 음성으로도 트리거된다.
