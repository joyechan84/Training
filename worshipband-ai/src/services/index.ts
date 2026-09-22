import { createSongLearningApi } from "@/services/songLearningApi";
import { mockSongLearningApi } from "@/services/mockSongLearningApi";
import { SongLearningApi } from "@/services/types";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;

/**
 * EXPO_PUBLIC_API_BASE_URL 이 설정되어 있으면 실제 backend/ 서버를 호출하고,
 * 없으면(기본값) mock 구현을 사용해 앱만으로도 콘티 등록 흐름을 바로 시연할 수 있다.
 */
export const songLearningApi: SongLearningApi = API_BASE
  ? createSongLearningApi(API_BASE)
  : mockSongLearningApi;
