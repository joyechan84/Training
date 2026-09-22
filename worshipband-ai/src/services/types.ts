import { SetlistSong } from "@/types";

/** 콘티(유튜브 학습) 백엔드와 통신하는 클라이언트가 구현해야 하는 공통 인터페이스. */
export interface SongLearningApi {
  /**
   * 새 유튜브 링크를 학습 대기열에 등록한다. 즉시 PENDING 상태의 SetlistSong 을 반환한다.
   * rightsConfirmed 는 "이 음원의 저작권/사용권을 보유했음"을 사용자가 확인했다는 표시로,
   * 실제 백엔드는 이 값이 true 가 아니면 요청을 거부해야 한다 (저작권 남용 방지).
   */
  registerYoutubeSong(input: {
    title: string;
    youtubeUrl: string;
    rightsConfirmed: boolean;
  }): Promise<SetlistSong>;

  /** 등록된 전체 콘티 목록을 최신순으로 반환한다. */
  listSetlist(): Promise<SetlistSong[]>;

  /** 특정 곡의 최신 학습 상태를 조회한다 (폴링용). */
  getSong(songId: string): Promise<SetlistSong>;
}
