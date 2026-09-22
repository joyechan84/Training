export type InstrumentId = "drums" | "bass" | "piano" | "synth";

export type SectionId =
  | "INTRO"
  | "VERSE"
  | "CHORUS"
  | "BRIDGE"
  | "QUIET"
  | "ENDING"
  | "STOP";

/** 0(무음) ~ 1(최대) 사이의 악기별 목표 볼륨 */
export type InstrumentMix = Record<InstrumentId, number>;

export interface SongConfig {
  id: string;
  title: string;
  bpm: number;
  beatsPerBar: number;
  /** 표시용 키 (예: "G", "A") — 실제 피치 변경은 MVP에서 근사치임 */
  baseKey: string;
  tracks: Record<InstrumentId, number>; // require() 로 로드된 asset 모듈 id
}

export type VoiceIntent =
  | { type: "SECTION"; section: SectionId }
  | { type: "FULL_BAND" }
  | { type: "KEY_SHIFT"; semitones: number }
  | { type: "UNKNOWN"; raw: string };

export interface EngineState {
  isLoaded: boolean;
  isPlaying: boolean;
  currentSection: SectionId;
  mix: InstrumentMix;
  bpm: number;
  keyOffsetSemitones: number;
}
