export type InstrumentId = "drums" | "bass" | "guitar" | "piano" | "synth";

export type SectionId =
  | "INTRO"
  | "VERSE"
  | "CHORUS"
  | "BRIDGE"
  | "SOLO"
  | "QUIET"
  | "ENDING"
  | "STOP";

/** 0(무음) ~ 1(최대) 사이의 악기별 목표 볼륨 */
export type InstrumentMix = Record<InstrumentId, number>;

/**
 * 곡 재생 방식.
 * - "loop": 악기별 몇 초짜리 루프를 반복 재생하며 섹션마다 볼륨 믹스만 바꾼다 (수동 제작 곡).
 * - "timeline": 유튜브에서 학습되어 실제 원곡과 시간축이 동일한 풀렝스 스템을 사용한다.
 *   섹션 전환 시 모든 트랙을 해당 섹션의 원곡 타임스탬프로 동시에 seek 해서
 *   AI가 새로 연주를 "작곡"하지 않고 원곡의 실제 연주(기타 솔로 포함)를 그대로 재현한다.
 */
export type SongMode = "loop" | "timeline";

/** timeline 모드에서, 원곡 내 특정 섹션이 시작되는 지점(ms) */
export interface TimelineCue {
  section: SectionId;
  atMs: number;
  /**
   * 이 지점에서 각 악기가 실제로 얼마나 연주되고 있는지(학습 파이프라인이
   * 분리된 스템의 에너지를 분석해 산출한 값). 있으면 일반적인 SECTION_MIX
   * 프리셋 대신 이 값을 쓴다 — "이 곡은 이 후렴에 기타가 없다"처럼 곡마다
   * 실제 편곡이 다른 걸 반영하기 위함이다. 없으면 SECTION_MIX[section] 로 대체한다.
   */
  mix?: InstrumentMix;
}

export interface SongConfig {
  id: string;
  title: string;
  bpm: number;
  beatsPerBar: number;
  /** 표시용 키 (예: "G", "A") — 실제 피치 변경은 MVP에서 근사치임 */
  baseKey: string;
  mode: SongMode;
  /**
   * require() 로 번들된 로컬 asset(number) 또는 원격/캐시된 파일의 { uri } 중 하나.
   * loop 모드 데모 곡은 number, 백엔드 학습 파이프라인이 만들어낸 timeline 모드 곡은
   * 보통 다운로드된 스템의 { uri } 를 쓰게 된다 (둘 다 expo-av 의 Audio.Sound.createAsync
   * 가 그대로 받아들이는 형태라 AudioEngine 쪽 코드 변경은 필요 없다).
   */
  tracks: Record<InstrumentId, number | { uri: string }>;
  /** mode === "timeline" 일 때만 사용. 학습 파이프라인이 생성한 구간 타임스탬프. */
  timeline?: TimelineCue[];
  /** mode === "timeline" 일 때, 학습 출처가 된 유튜브 영상 링크 */
  sourceYoutubeUrl?: string;
}

/** 콘티(유튜브 학습) 등록 상태 */
export type LearningStatus = "PENDING" | "ANALYZING" | "READY" | "FAILED";

/** 인도자가 등록한 "콘티" 한 곡. 백엔드 학습 파이프라인의 진행 상태를 함께 들고 있다. */
export interface SetlistSong {
  id: string;
  title: string;
  youtubeUrl: string;
  status: LearningStatus;
  /** status === "READY" 일 때만 채워진다. */
  songConfig?: SongConfig;
  errorMessage?: string;
  requestedAt: string; // ISO timestamp
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
  /**
   * timeline 모드 곡에서, 학습된 타임라인을 따라 (인도자의 멘트 없이도)
   * 자동으로 다음 구간 믹스로 넘어갈지 여부. 기타 솔로처럼 인도자가 말을
   * 하지 않는 구간은 음성 트리거로 잡을 수 없기 때문에 기본값은 true.
   */
  autoFollowEnabled: boolean;
  /** 재생/일시정지/볼륨 등 오디오 조작 중 실패가 있었다면 그 메시지 (디버깅용, 화면에 노출). */
  playbackError: string | null;
}
