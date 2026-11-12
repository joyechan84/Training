#!/usr/bin/env python3
"""매일 새 축산 사업아이템 1건을 Claude 로 생성해 data/business_ai.json 에 추가한다.

- ANTHROPIC_API_KEY 환경변수가 없으면 아무것도 하지 않고 정상 종료한다
  (이 경우 앱은 큐레이션된 data/business.json 만 사용).
- 최근 수집된 뉴스 헤드라인을 맥락으로 주어 '지금' 시의성 있는 아이템을 만든다.

    pip install anthropic
    ANTHROPIC_API_KEY=... python3 livestock/scripts/generate_business_item.py
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CURATED = DATA / "business.json"
AI_OUT = DATA / "business_ai.json"
NEWS = DATA / "news.json"
KST = timezone(timedelta(hours=9))
MAX_AI_ITEMS = 120

SCORE = {"type": "integer", "minimum": 1, "maximum": 5}
STR_LIST = {"type": "array", "items": {"type": "string"}}
ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "emoji": {"type": "string"},
        "title": {"type": "string"},
        "category": {"type": "string", "enum": ["가공·유통", "스마트축산", "환경·자원순환", "사료·바이오", "서비스", "6차산업", "사육"]},
        "summary": {"type": "string"},
        "whyNow": {"type": "string"},
        "target": STR_LIST,
        "targetDesc": {"type": "string"},
        "cost": {
            "type": "object",
            "properties": {"min": {"type": "integer"}, "max": {"type": "integer"}},
            "required": ["min", "max"],
            "additionalProperties": False,
        },
        "costNote": {"type": "string"},
        "scores": {
            "type": "object",
            "properties": {"feasibility": SCORE, "profitability": SCORE, "market": SCORE, "entry": SCORE},
            "required": ["feasibility", "profitability", "market", "entry"],
            "additionalProperties": False,
        },
        "risk": {"type": "string", "enum": ["하", "중하", "중", "중상", "상"]},
        "revenueModel": {"type": "string"},
        "requirements": STR_LIST,
        "supports": STR_LIST,
        "risks": STR_LIST,
        "steps": STR_LIST,
    },
    "required": ["emoji", "title", "category", "summary", "whyNow", "target", "targetDesc", "cost",
                 "costNote", "scores", "risk", "revenueModel", "requirements", "supports", "risks", "steps"],
    "additionalProperties": False,
}

SYSTEM = """당신은 한국 축산업 창업 컨설턴트입니다. 축산 전공자가 실제로 검토할 수 있는 사업아이템을 제안합니다.

원칙:
- 2026년 한국 시장 기준으로 현실적인 비용(cost.min/max, 단위: 만원)을 제시하고 costNote 에 근거(설비·인력·인허가)를 적습니다.
- scores 는 1~5점: feasibility(현실성: 개인/소규모 팀이 실행 가능한가), profitability(수익성), market(시장성·수요), entry(진입 용이성: 높을수록 쉬움). 과장하지 말고 보수적으로 평가합니다.
- requirements 에는 관련 인허가·법령(축산법, 가축분뇨법, 사료관리법, 축산물위생관리법 등)을 정확히 적고, 확실하지 않으면 '~ 여부 확인 필요'라고 씁니다.
- supports 에는 실제 존재하는 정부·공공 지원사업 이름만 적고, 이름을 확신할 수 없으면 일반적인 표현(예: '지자체 6차산업 지원사업')을 씁니다.
- whyNow 에는 제공된 최근 뉴스와 연결된 시의성을 1~2문장으로 적습니다. 뉴스와 무관하면 일반 트렌드로 설명합니다.
- 기존 아이템과 겹치지 않는 새로운 아이템이어야 합니다. 모든 텍스트는 한국어로 씁니다."""


def load(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def main() -> int:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY 미설정: AI 사업아이템 생성을 건너뜁니다.")
        return 0

    import anthropic

    today = datetime.now(KST).date().isoformat()
    ai = load(AI_OUT, {"items": []})
    if any(it.get("date") == today for it in ai["items"]):
        print("오늘 아이템이 이미 생성되어 있습니다.")
        return 0

    curated = load(CURATED, {"items": []})["items"]
    existing_titles = [it["title"] for it in curated + ai["items"]]
    headlines = [f"- [{n.get('category')}] {n['title']} ({n.get('source')})"
                 for n in load(NEWS, {"items": []})["items"][:30]]

    prompt = (
        f"오늘 날짜: {today}\n\n"
        "최근 축산 뉴스 헤드라인:\n" + ("\n".join(headlines) or "(없음)") + "\n\n"
        "이미 소개한 아이템(중복 금지):\n" + "\n".join(f"- {t}" for t in existing_titles) + "\n\n"
        "축산 전공자를 위한 새로운 사업아이템 1개를 제안하고 평가해 주세요."
    )

    client = anthropic.Anthropic()
    try:
        response = client.beta.messages.create(
            model="claude-opus-5-5",
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "medium", "format": {"type": "json_schema", "schema": ITEM_SCHEMA}},
            system=SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.RateLimitError as e:
        print(f"요청 한도 초과, 다음 실행에서 재시도: {e}", file=sys.stderr)
        return 0
    except anthropic.APIStatusError as e:
        print(f"API 오류 {e.status_code}: {e}", file=sys.stderr)
        return 0
    except anthropic.APIConnectionError as e:
        print(f"API 연결 실패: {e}", file=sys.stderr)
        return 0

    if response.stop_reason in ("refusal", "max_tokens"):
        print(f"생성 중단(stop_reason={response.stop_reason})", file=sys.stderr)
        return 0

    text = next((b.text for b in response.content if b.type == "text"), "")
    item = json.loads(text)
    item["id"] = f"ai-{today}"
    item["date"] = today
    item["aiGenerated"] = True

    ai["items"].insert(0, item)
    ai["items"] = ai["items"][:MAX_AI_ITEMS]
    ai["updated"] = datetime.now(KST).isoformat()
    AI_OUT.write_text(json.dumps(ai, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"새 아이템 추가: {item['title']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
