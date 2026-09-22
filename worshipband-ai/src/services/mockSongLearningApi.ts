import { MOCK_LEARNED_SONG } from "@/constants/mockLearnedSong";
import { SetlistSong } from "@/types";
import { SongLearningApi } from "@/services/types";

/**
 * 실제 백엔드(backend/) 없이도 "콘티 등록 → 분석 중 → 학습 완료" 흐름과
 * SetlistScreen UI를 바로 시연/테스트할 수 있도록 만든 인메모리 mock.
 *
 * PENDING → ANALYZING → READY 로 자동 전이시키며, READY 가 되면
 * mockLearnedSong.ts 의 timeline 모드 데모 곡(24초, 기타 솔로 포함)을
 * songConfig 로 붙여준다. 실제 학습 결과가 아니라 파이프라인이 생성했을
 * 법한 결과물의 "형태"를 보여주기 위한 자리표시자다.
 */
class MockSongLearningApi implements SongLearningApi {
  private songs: SetlistSong[] = [];

  async registerYoutubeSong({
    title,
    youtubeUrl,
    rightsConfirmed,
  }: {
    title: string;
    youtubeUrl: string;
    rightsConfirmed: boolean;
  }): Promise<SetlistSong> {
    if (!rightsConfirmed) {
      throw new Error("음원 저작권/사용권 확인이 필요합니다.");
    }

    const song: SetlistSong = {
      id: `song_${Date.now()}_${Math.round(Math.random() * 1000)}`,
      title,
      youtubeUrl,
      status: "PENDING",
      requestedAt: new Date().toISOString(),
    };
    this.songs = [song, ...this.songs];
    this.simulatePipeline(song.id);
    return song;
  }

  async listSetlist(): Promise<SetlistSong[]> {
    return this.songs;
  }

  async getSong(songId: string): Promise<SetlistSong> {
    const found = this.songs.find((s) => s.id === songId);
    if (!found) throw new Error(`곡을 찾을 수 없습니다: ${songId}`);
    return found;
  }

  private updateSong(songId: string, patch: Partial<SetlistSong>) {
    this.songs = this.songs.map((s) =>
      s.id === songId ? { ...s, ...patch } : s
    );
  }

  /** 실제 파이프라인(오디오 추출 → 스템 분리 → 구간 탐지)이 걸리는 시간을 흉내 낸다. */
  private simulatePipeline(songId: string) {
    setTimeout(() => this.updateSong(songId, { status: "ANALYZING" }), 1200);
    setTimeout(() => {
      const target = this.songs.find((s) => s.id === songId);
      if (!target) return;
      this.updateSong(songId, {
        status: "READY",
        songConfig: {
          ...MOCK_LEARNED_SONG,
          id: songId,
          title: target.title,
          sourceYoutubeUrl: target.youtubeUrl,
        },
      });
    }, 3500);
  }
}

export const mockSongLearningApi = new MockSongLearningApi();
