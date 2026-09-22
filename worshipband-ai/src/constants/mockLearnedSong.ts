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
 *
 * 각 큐의 mix 값은 SECTION_MIX 의 일반 프리셋이 아니라, "이 곡은 실제로
 * 이 구간에서 이 악기가 이만큼 연주되고 있다"는 이 곡만의 학습 결과를
 * 흉내 낸 값이다 (실제 파이프라인에서는 분리된 스템의 에너지를 측정해서
 * 산출한다 — backend/pipeline/detect_sections.py 참고). 특히 인도자가
 * 마이크에 대고 아무 말도 하지 않는 SOLO 구간은, MainScreen 의 "자동 진행"
 * 토글이 켜져 있으면 AudioEngine 이 재생 중 자동으로 이 mix 로 전환한다 —
 * 음성 트리거를 기다리지 않는다.
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
    {
      section: "INTRO",
      atMs: 0,
      mix: { drums: 0.3, bass: 0.3, guitar: 0.15, piano: 0.7, synth: 0.5 },
    },
    {
      section: "VERSE",
      atMs: 4000,
      mix: { drums: 0.5, bass: 0.6, guitar: 0.2, piano: 0.8, synth: 0.35 },
    },
    {
      section: "CHORUS",
      atMs: 10000,
      mix: { drums: 1.0, bass: 1.0, guitar: 0.3, piano: 0.9, synth: 0.9 },
    },
    // 기타 솔로: 보컬(원곡)이 없고 기타가 두드러지는 구간 — 학습 파이프라인이
    // 실제로 찾아낸 지점을 그대로 재현한다. 드럼/베이스는 받쳐주는 수준으로 남기고
    // 피아노/신디는 공간을 비워준다.
    {
      section: "SOLO",
      atMs: 16000,
      mix: { drums: 0.6, bass: 0.65, guitar: 1.0, piano: 0.2, synth: 0.25 },
    },
    {
      section: "ENDING",
      atMs: 20000,
      mix: { drums: 0.25, bass: 0.25, guitar: 0.1, piano: 0.6, synth: 0.4 },
    },
  ],
};
