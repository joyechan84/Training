import { VoiceIntent } from "@/types";

/**
 * 인도자의 멘트(STT 결과 문자열)에 포함된 키워드를 기준으로 매칭한다.
 * 실제 교회 현장 멘트는 표현이 다양하므로, 각 의도(intent)마다
 * 여러 개의 트리거 문구(patterns)를 등록해 부분 일치로 탐지한다.
 *
 * 새로운 멘트 패턴은 이 배열에 항목을 추가하는 것만으로 확장 가능하다.
 */
export interface TriggerRule {
  patterns: string[];
  intent: VoiceIntent;
}

export const TRIGGER_RULES: TriggerRule[] = [
  {
    patterns: ["처음부터", "인트로", "다같이 시작", "다 같이 시작"],
    intent: { type: "SECTION", section: "INTRO" },
  },
  {
    patterns: ["1절", "일절"],
    intent: { type: "SECTION", section: "VERSE" },
  },
  {
    patterns: ["후렴", "코러스", "후렴 가겠습니다", "후렴으로"],
    intent: { type: "SECTION", section: "CHORUS" },
  },
  {
    patterns: ["브릿지", "다리 부분"],
    intent: { type: "SECTION", section: "BRIDGE" },
  },
  {
    patterns: ["조용히", "묵상", "잠잠히", "고요히", "낮은 목소리로"],
    intent: { type: "SECTION", section: "QUIET" },
  },
  {
    patterns: ["마무리", "엔딩", "정리하겠습니다", "마치겠습니다"],
    intent: { type: "SECTION", section: "ENDING" },
  },
  {
    patterns: ["멈춰주세요", "스톱", "그만하겠습니다"],
    intent: { type: "SECTION", section: "STOP" },
  },
  {
    patterns: ["다같이 크게", "풀밴드", "다 같이 힘차게", "다같이 힘차게"],
    intent: { type: "FULL_BAND" },
  },
  {
    patterns: ["키 올려", "키올려", "반음 올려", "한 음 올려"],
    intent: { type: "KEY_SHIFT", semitones: 1 },
  },
  {
    patterns: ["키 내려", "키내려", "반음 내려", "한 음 내려"],
    intent: { type: "KEY_SHIFT", semitones: -1 },
  },
];

/** transcript 안에 등록된 트리거 문구가 있는지 확인하고, 있다면 intent 를 반환한다. */
export function matchIntent(transcript: string): VoiceIntent {
  const normalized = transcript.replace(/\s+/g, "");
  for (const rule of TRIGGER_RULES) {
    const hit = rule.patterns.some((p) =>
      normalized.includes(p.replace(/\s+/g, ""))
    );
    if (hit) return rule.intent;
  }
  return { type: "UNKNOWN", raw: transcript };
}
