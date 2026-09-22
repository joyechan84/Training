declare namespace NodeJS {
  interface ProcessEnv {
    /** 설정되어 있으면 콘티 학습에 mock 대신 실제 backend/ 서버를 사용한다 (src/services/index.ts). */
    EXPO_PUBLIC_API_BASE_URL?: string;
  }
}
