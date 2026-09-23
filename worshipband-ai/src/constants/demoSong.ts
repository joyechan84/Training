import { SongConfig } from "@/types";
import {
  DRUMS_LOOP,
  BASS_LOOP,
  GUITAR_LOOP,
  PIANO_LOOP,
  SYNTH_LOOP,
} from "@/constants/embeddedAudio.generated";

/**
 * 테스트용 데모 곡 설정.
 * assets/tracks/*.mp3 는 실제 찬양 스템이 아니라, 배선(엔진 ↔ UI)이
 * 정상 동작하는지 바로 들어볼 수 있도록 생성한 2초짜리 루프 placeholder다.
 * (drums=킥 패턴, bass=저음 지속음, piano=1/3박 코드, synth=패드)
 *
 * require() 대신 base64 data URI(embeddedAudio.generated.ts)를 쓰는 이유는
 * 웹으로 배포했을 때 별도 asset 파일을 네트워크로 다시 받아오는 과정이
 * 호스팅 환경에 따라 실패하는 걸 실제로 겪었기 때문이다 — data URI는
 * 네트워크 요청이 아예 없어서 그 문제를 원천적으로 피한다.
 *
 * 실제 서비스에서는 이 자리에 곡별 5-스템 오디오 세트를 넣고
 * bpm / beatsPerBar / baseKey 를 그 곡에 맞게 채우면 된다.
 *
 * mode: "loop" — 짧은 루프를 반복하며 섹션마다 믹스만 바꾸는 수동 제작 곡.
 * (유튜브에서 학습되어 원곡 그대로 seek 하는 "timeline" 모드 예시는
 *  src/constants/mockLearnedSong.ts 참고)
 */
export const DEMO_SONG: SongConfig = {
  id: "demo-01",
  title: "데모 찬양 (테스트용)",
  bpm: 120,
  beatsPerBar: 4,
  baseKey: "A",
  mode: "loop",
  tracks: {
    drums: { uri: DRUMS_LOOP },
    bass: { uri: BASS_LOOP },
    guitar: { uri: GUITAR_LOOP },
    piano: { uri: PIANO_LOOP },
    synth: { uri: SYNTH_LOOP },
  },
};
