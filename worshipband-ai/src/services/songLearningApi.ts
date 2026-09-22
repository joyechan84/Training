import { SetlistSong } from "@/types";
import { SongLearningApi } from "@/services/types";

/**
 * backend/ 에 설계된 FastAPI 학습 서버와 통신하는 실제 클라이언트.
 * API 계약(요청/응답 형식)은 backend/README.md 와 정확히 일치해야 한다.
 *
 *   POST   {API_BASE}/songs        { title, youtubeUrl } -> SetlistSong (status: PENDING)
 *   GET    {API_BASE}/songs        -> SetlistSong[]
 *   GET    {API_BASE}/songs/:id    -> SetlistSong
 *
 * 서버 주소는 EXPO_PUBLIC_API_BASE_URL 환경변수로 주입한다 (app.config 또는 .env).
 * 이 리포지토리에는 백엔드가 아직 배포되어 있지 않으므로, 기본적으로는
 * src/services/index.ts 가 이 클라이언트 대신 mockSongLearningApi 를 사용하도록
 * 되어 있다. 실제 백엔드를 띄운 뒤 EXPO_PUBLIC_API_BASE_URL 을 설정하면 자동으로
 * 이 클라이언트로 전환된다.
 */
export function createSongLearningApi(apiBase: string): SongLearningApi {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${apiBase}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`학습 서버 요청 실패 (${res.status}): ${body}`);
    }
    return res.json() as Promise<T>;
  }

  return {
    registerYoutubeSong({ title, youtubeUrl, rightsConfirmed }) {
      return request<SetlistSong>("/songs", {
        method: "POST",
        body: JSON.stringify({ title, youtubeUrl, rightsConfirmed }),
      });
    },
    listSetlist() {
      return request<SetlistSong[]>("/songs");
    },
    getSong(songId) {
      return request<SetlistSong>(`/songs/${songId}`);
    },
  };
}
