import { SongConfig } from "@/types";

/**
 * "유튜브에서 학습됨"을 흉내 낸 데모 곡 (timeline 모드).
 *
 * 실제 파이프라인(backend/ 참고)이 하는 일을 흉내 내기 위해, 24초짜리
 * 풀렝스 5-스템 오디오를 직접 만들어 assets/tracks/learned-demo/ 에 넣었다.
 * loop 모드(demoSong.ts)와 다르게 각 트랙은 "루프"가 아니라 원곡과 동일한
 * 하나의 타임라인 위에 존재하며, 특히 guitar 트랙은 16~20초 구간에
 * 실제 "기타 솔로 프레이즈"가 들어 있다 — AI가 새로 작곡하는 게 아니라
 * 원곡에서 분리된(것으로 가정한) 그 구간을 그대로 재생하는 것.
 *
 * goToSection("SOLO") 을 호출하면 AudioEngine 이 5개 트랙을 모두 16000ms
 * 지점으로 동시에 seek 해서, 원곡의 그 기타 솔로가 시작되는 순간부터
 * 자연스럽게 이어받는다. BRIDGE 는 이 데모 곡에 없으므로 timeline 에
 * 없고, 그 상태로 goToSection("BRIDGE") 를 호출하면 조용히 무시된다.
 */
export const MOCK_LEARNED_SONG: SongConfig = {
  id: "learned-mock-01",
  title: "학습된 콘티 예시 (mock)",
  bpm: 120,
  beatsPerBar: 4,
  baseKey: "A",
  mode: "timeline",
  sourceYoutubeUrl: "https://www.youtube.com/watch?v=EXAMPLE",
  tracks: {
    drums: require("../../assets/tracks/learned-demo/drums.wav"),
    bass: require("../../assets/tracks/learned-demo/bass.wav"),
    guitar: require("../../assets/tracks/learned-demo/guitar.wav"),
    piano: require("../../assets/tracks/learned-demo/piano.wav"),
    synth: require("../../assets/tracks/learned-demo/synth.wav"),
  },
  timeline: [
    { section: "INTRO", atMs: 0 },
    { section: "VERSE", atMs: 4000 },
    { section: "CHORUS", atMs: 10000 },
    { section: "SOLO", atMs: 16000 },
    { section: "ENDING", atMs: 20000 },
  ],
};
