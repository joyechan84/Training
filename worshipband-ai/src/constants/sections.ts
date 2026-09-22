import { InstrumentMix, SectionId } from "@/types";

/**
 * 각 파트(Section)로 전환될 때 악기별 목표 볼륨.
 * 실제 전환은 AudioEngine 이 다음 마디(bar) 경계까지 기다렸다가
 * 부드럽게 페이드(crossfade)하며 적용한다.
 */
export const SECTION_MIX: Record<SectionId, InstrumentMix> = {
  INTRO: { drums: 0.5, bass: 0.5, piano: 0.9, synth: 0.6 },
  VERSE: { drums: 0.55, bass: 0.7, piano: 0.9, synth: 0.35 },
  CHORUS: { drums: 1.0, bass: 1.0, piano: 0.9, synth: 1.0 },
  BRIDGE: { drums: 0.7, bass: 0.8, piano: 0.9, synth: 0.7 },
  QUIET: { drums: 0, bass: 0, piano: 0.55, synth: 0.45 },
  ENDING: { drums: 0.3, bass: 0.3, piano: 0.7, synth: 0.5 },
  STOP: { drums: 0, bass: 0, piano: 0, synth: 0 },
};

export const SECTION_LABEL_KO: Record<SectionId, string> = {
  INTRO: "인트로",
  VERSE: "1절",
  CHORUS: "후렴",
  BRIDGE: "브릿지",
  QUIET: "묵상",
  ENDING: "엔딩",
  STOP: "정지",
};

export const DEFAULT_FADE_MS = 900;
