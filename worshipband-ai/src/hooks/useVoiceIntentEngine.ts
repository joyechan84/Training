import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

import { matchIntent } from "@/constants/triggers";
import { VoiceIntent } from "@/types";

/** 같은 intent 가 연속으로 너무 자주 발동하지 않도록 하는 최소 간격(ms) */
const INTENT_COOLDOWN_MS = 3000;

interface UseVoiceIntentEngineOptions {
  /** 매칭된 intent 가 UNKNOWN 이 아닐 때 호출된다. */
  onIntent: (intent: VoiceIntent, transcript: string) => void;
  locale?: string; // 기본 "ko-KR"
}

interface UseVoiceIntentEngineResult {
  isListening: boolean;
  isAvailable: boolean;
  lastTranscript: string;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

function intentKey(intent: VoiceIntent): string {
  switch (intent.type) {
    case "SECTION":
      return `SECTION:${intent.section}`;
    case "KEY_SHIFT":
      return `KEY_SHIFT:${intent.semitones}`;
    default:
      return intent.type;
  }
}

/**
 * 마이크 권한을 요청하고, 실시간 음성 인식을 켜서
 * 트랜스크립트에서 트리거 키워드(intent)를 추출해 콜백으로 전달하는 훅.
 *
 * expo-speech-recognition 은 온디바이스/OS 제공 STT(Apple Speech, Android SpeechRecognizer)를
 * 사용하므로 Expo Go 에서는 동작하지 않고, expo-dev-client 빌드가 필요하다.
 *
 * 이건 네이티브(iOS/Android) 구현이다. 웹 빌드(`expo start --web`)는 대신
 * useVoiceIntentEngine.web.ts 가 쓰인다 — expo-speech-recognition 의 웹
 * 레이어가 이 프로젝트가 고정한 Expo SDK(~51)에는 없는 `NativeModule`/
 * `registerWebModule`/`useEventListener` export 를 요구해서 그대로 쓰면
 * 앱이 렌더링 시점에 크래시하기 때문이다 (실제로 `expo start --web` 로
 * 재현·확인함). Metro/webpack 의 플랫폼별 확장자 해석 규칙 덕분에, 웹
 * 번들에는 이 파일이 아예 포함되지 않고 .web.ts 쪽만 쓰인다.
 */
export function useVoiceIntentEngine({
  onIntent,
  locale = "ko-KR",
}: UseVoiceIntentEngineOptions): UseVoiceIntentEngineResult {
  const [isListening, setIsListening] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const [lastTranscript, setLastTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const lastFiredRef = useRef<{ key: string; at: number } | null>(null);

  const handleTranscript = useCallback(
    (transcript: string) => {
      setLastTranscript(transcript);
      const intent = matchIntent(transcript);
      if (intent.type === "UNKNOWN") return;

      const key = intentKey(intent);
      const now = Date.now();
      const last = lastFiredRef.current;
      if (last && last.key === key && now - last.at < INTENT_COOLDOWN_MS) {
        return; // 같은 의도가 쿨다운 안에 반복 감지됨 -> 무시
      }
      lastFiredRef.current = { key, at: now };
      onIntent(intent, transcript);
    },
    [onIntent]
  );

  useSpeechRecognitionEvent("result", (event) => {
    const best = event.results?.[0]?.transcript;
    if (best) handleTranscript(best);
  });

  useSpeechRecognitionEvent("error", (event) => {
    setError(event.message ?? String(event.error));
  });

  useSpeechRecognitionEvent("end", () => {
    setIsListening(false);
  });

  useEffect(() => {
    ExpoSpeechRecognitionModule.getStateAsync?.().catch(() => {
      setIsAvailable(false);
    });
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const permission =
      await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setError("마이크 / 음성 인식 권한이 거부되었습니다.");
      return;
    }
    ExpoSpeechRecognitionModule.start({
      lang: locale,
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: false,
      addsPunctuation: false,
    });
    setIsListening(true);
  }, [locale]);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
    setIsListening(false);
  }, []);

  return { isListening, isAvailable, lastTranscript, error, start, stop };
}
