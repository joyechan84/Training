# 🐄 축산 데일리

축산 전공자를 위한 웹앱입니다. 매일 아래 두 가지를 업데이트합니다.

1. **축산 뉴스**: 공신력 있는 출처만 수집합니다.
   - 정부·공공기관: 농식품부, 농촌진흥청·국립축산과학원, 농림축산검역본부, 축산물품질평가원, 한국농촌경제연구원, 정책브리핑
   - 국제기구: FAO, WOAH, USDA
   - 공영·전문언론: 연합뉴스, 농민신문, 축산신문, 농수축산신문
2. **축산 사업아이템**: 초기비용, 현실성, 수익성, 시장성, 진입 용이성, 대상 고객, 위험도, 인허가, 지원사업, 시작 단계를 평가합니다.

## 구조

```
livestock/
├── index.html, css/, js/          # 정적 웹앱 (빌드 불필요)
├── data/news.json                 # 자동 수집 뉴스
├── data/business.json             # 큐레이션된 사업아이템 20건 + 평가
├── data/business_ai.json          # AI가 매일 추가하는 사업아이템(선택)
└── scripts/
    ├── fetch_news.py              # RSS 수집기 (표준 라이브러리만 사용)
    └── generate_business_item.py  # Claude API로 새 아이템 생성 (선택)
```

## 매일 자동 업데이트

`.github/workflows/livestock-daily.yml`이 매일 KST 05:43에 실행됩니다.

- GitHub의 예약 실행은 **기본 브랜치(main)** 에 있는 워크플로만 동작합니다. 이 브랜치를 main에 병합해야 매일 실행됩니다.
- 처음에는 Actions 탭에서 **Livestock daily update → Run workflow** 를 눌러 바로 수집할 수 있습니다.
- **AI 사업아이템(선택)**: 저장소 Settings → Secrets and variables → Actions에 `ANTHROPIC_API_KEY`를 등록하면, 최근 뉴스를 반영한 새 아이템이 매일 1건씩 추가됩니다. 키가 없으면 20건의 큐레이션 아이템이 날짜별로 순환되며 '오늘의 추천'으로 표시됩니다.

## 웹으로 보기

- GitHub Pages: Settings → Pages → Branch `main` / `(root)` 선택 후 `https://<사용자명>.github.io/<저장소>/livestock/` 접속
- 로컬: `cd livestock && python3 -m http.server` 실행 후 http://localhost:8000

> 사업아이템의 비용·점수·인허가 정보는 참고용 추정치입니다. 실제 창업 전 관련 기관에 확인하세요.
