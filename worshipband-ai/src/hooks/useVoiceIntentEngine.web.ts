import { useCallback, useState } from "react";

import { VoiceIntent } from "@/types";

interface UseVoiceIntentEngineOptions {
  onIntent: (intent: VoiceIntent, transcript: string) => void;
  locale?: string;
}

interface UseVoiceIntentEngineResult {
  isListening: boolean;
  isAvailable: boolean;
  lastTranscript: string;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * useVoiceIntentEngine 의 웹 전용 대체 구현.
 *
 * expo-speech-recognition 의 웹 레이어는 이 프로젝트가 고정한 Expo SDK(~51)
 * 에서는 지원되지 않는 API(`NativeModule`, `registerWebModule`,
 * `useEventListener`)를 요구해서, 그대로 import 하면 `expo start --web`
 * 실행 시 앱이 렌더링 시점에 바로 크래시한다 (실제로 재현·확인했다).
 *
 * 애초에 이 앱의 음성 인식은 iOS/Android 온디바이스 STT 전용으로 설계되어
 * 있으므로(README 참고), 웹에서는 기능을 끄고 안전하게 안내만 하는 스텁을
 * 대신 쓴다. 파일명이 `.web.ts` 라서 Metro/webpack 이 웹 번들에는 이 파일만
 * 포함하고 네이티브용 `useVoiceIntentEngine.ts`(expo-speech-recognition을
 * 실제로 쓰는 쪽)는 아예 번들에 넣지 않는다.
 */
export function useVoiceIntentEngine({
  onIntent: _onIntent,
}: UseVoiceIntentEngineOptions): UseVoiceIntentEngineResult {
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError("음성 인식은 아직 웹에서 지원되지 않습니다 (iOS/Android 전용).");
  }, []);

  const stop = useCallback(() => {}, []);

  return {
    isListening: false,
    isAvailable: false,
    lastTranscript: "",
    error,
    start,
    stop,
  };
}
