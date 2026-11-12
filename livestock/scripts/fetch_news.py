#!/usr/bin/env python3
"""축산 뉴스 수집기.

공신력 있는 기관(정부·공공기관, 국제기구)과 주요 공영/전문 언론의 RSS 를 읽어
livestock/data/news.json 을 갱신한다. 표준 라이브러리만 사용한다.

    python3 livestock/scripts/fetch_news.py

GitHub Actions(.github/workflows/livestock-daily.yml)에서 매일 실행된다.
"""
from __future__ import annotations

import email.utils
import html
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "news.json"
KST = timezone(timedelta(hours=9))
MAX_ITEMS = 300
MAX_AGE_DAYS = 45
UA = "Mozilla/5.0 (compatible; LivestockNewsBot/1.0)"


def gnews(query: str, lang: str = "ko") -> str:
    """Google News RSS 검색 URL (site: 필터로 출처를 공신력 있는 도메인으로 제한)."""
    if lang == "ko":
        params = {"q": query, "hl": "ko", "gl": "KR", "ceid": "KR:ko"}
    else:
        params = {"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"}
    return "https://news.google.com/rss/search?" + urllib.parse.urlencode(params)


KO_KW = "(축산 OR 가축 OR 한우 OR 돼지 OR 양돈 OR 낙농 OR 계란 OR 산란계 OR 가금 OR 사료 OR 가축전염병 OR 구제역 OR 조류인플루엔자 OR 럼피스킨 OR 아프리카돼지열병)"
EN_KW = "(livestock OR cattle OR swine OR pig OR poultry OR dairy OR \"animal health\" OR \"avian influenza\")"

# tier: gov = 정부·공공기관, intl = 국제기구, press = 공영·전문 언론
SOURCES = [
    # --- 국내 정부·공공기관 ---
    {"name": "농림축산식품부", "tier": "gov", "region": "kr", "filter": True,  # 부처 전체 피드 → 축산 키워드 필터
     "url": "https://www.korea.kr/rss/dept_mafra.xml"},
    {"name": "농촌진흥청", "tier": "gov", "region": "kr", "filter": True,
     "url": "https://www.korea.kr/rss/dept_rda.xml"},
    {"name": "농림축산식품부", "tier": "gov", "region": "kr", "filter": False,
     "url": gnews(f"site:mafra.go.kr {KO_KW}")},
    {"name": "농촌진흥청·국립축산과학원", "tier": "gov", "region": "kr", "filter": False,
     "url": gnews(f"(site:rda.go.kr OR site:nias.go.kr) {KO_KW}")},
    {"name": "농림축산검역본부", "tier": "gov", "region": "kr", "filter": False,
     "url": gnews(f"site:qia.go.kr {KO_KW}")},
    {"name": "축산물품질평가원", "tier": "gov", "region": "kr", "filter": False,
     "url": gnews(f"site:ekapepia.com {KO_KW}")},
    {"name": "한국농촌경제연구원", "tier": "gov", "region": "kr", "filter": False,
     "url": gnews(f"site:krei.re.kr {KO_KW}")},
    {"name": "대한민국 정책브리핑", "tier": "gov", "region": "kr", "filter": False,
     "url": gnews(f"site:korea.kr {KO_KW}")},
    # --- 국내 공영·전문 언론 ---
    {"name": "연합뉴스", "tier": "press", "region": "kr", "filter": False,
     "url": gnews(f"site:yna.co.kr {KO_KW}")},
    {"name": "농민신문", "tier": "press", "region": "kr", "filter": False,
     "url": gnews(f"site:nongmin.com {KO_KW}")},
    {"name": "축산신문", "tier": "press", "region": "kr", "filter": False,
     "url": gnews("site:chuksannews.co.kr 축산")},
    {"name": "농수축산신문", "tier": "press", "region": "kr", "filter": False,
     "url": gnews(f"site:aflnews.co.kr {KO_KW}")},
    # --- 국제기구·해외 정부 ---
    {"name": "FAO (유엔식량농업기구)", "tier": "intl", "region": "intl", "filter": False,
     "url": gnews(f"site:fao.org {EN_KW}", "en")},
    {"name": "WOAH (세계동물보건기구)", "tier": "intl", "region": "intl", "filter": False,
     "url": gnews(f"site:woah.org {EN_KW}", "en")},
    {"name": "USDA (미국 농무부)", "tier": "intl", "region": "intl", "filter": False,
     "url": gnews(f"site:usda.gov {EN_KW}", "en")},
]

LIVESTOCK_RE = re.compile(
    r"축산|가축|한우|육우|젖소|낙농|우유|원유|돼지|양돈|한돈|돈육|닭|가금|육계|산란계|계란|달걀|오리|"
    r"사료|도축|도계|축산물|방역|구제역|조류인플루엔자|고병원성|럼피스킨|아프리카돼지열병|ASF|"
    r"흑염소|양봉|꿀벌|말산업|분뇨|퇴비|동물복지|가축전염병|livestock|cattle|swine|pig|poultry|dairy|"
    r"avian|animal health|beef|pork|egg",
    re.IGNORECASE,
)

CATEGORIES = [
    ("방역·질병", r"방역|구제역|조류인플루엔자|고병원성|AI\b|럼피스킨|아프리카돼지열병|ASF|전염병|살처분|백신|avian|influenza|disease|outbreak|animal health"),
    ("한우·소", r"한우|육우|소고기|쇠고기|송아지|beef|cattle"),
    ("양돈", r"돼지|양돈|한돈|돈육|돼지고기|pork|swine|pig"),
    ("가금·계란", r"닭|가금|육계|산란계|계란|달걀|오리|poultry|egg|chicken"),
    ("낙농", r"낙농|젖소|우유|원유|유제품|치즈|dairy|milk"),
    ("수급·가격", r"수급|가격|시세|할인|소비|수입|수출|물가|price|trade|market"),
    ("기술·연구", r"스마트|연구|기술|개발|품종|유전|ICT|AI 기반|로봇|research|technology"),
    ("환경·분뇨", r"분뇨|퇴비|악취|탄소|메탄|환경|emission|methane"),
    ("정책·제도", r"정책|법|시행령|지원|사업|예산|제도|대책|policy|regulation"),
]
CAT_RES = [(name, re.compile(p, re.IGNORECASE)) for name, p in CATEGORIES]


def categorize(text: str) -> str:
    for name, rx in CAT_RES:
        if rx.search(text):
            return name
    return "일반"


def clean(text: str | None) -> str:
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    value = value.strip()
    try:
        dt = email.utils.parsedate_to_datetime(value)
    except (TypeError, ValueError):
        dt = None
    if dt is None:
        for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                dt = datetime.strptime(value, fmt)
                break
            except ValueError:
                continue
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=KST)
    return dt


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def parse_feed(raw: bytes, src: dict) -> list[dict]:
    root = ET.fromstring(raw)
    items = []
    for it in root.iter("item"):
        title = clean(it.findtext("title"))
        link = (it.findtext("link") or "").strip()
        desc = clean(it.findtext("description"))
        pub = parse_date(it.findtext("pubDate"))
        publisher = clean(it.findtext("source")) or ""
        if not title or not link:
            continue
        # Google News 제목은 "제목 - 언론사" 형식
        if publisher and title.endswith(" - " + publisher):
            title = title[: -len(" - " + publisher)].strip()
        if not LIVESTOCK_RE.search(title + " " + desc):
            continue
        # Google News 요약은 제목 반복이 대부분이므로 버린다
        if "news.google.com" in src["url"] and desc.startswith(title[:20]):
            desc = ""
        items.append({
            "title": title,
            "link": link,
            "summary": desc[:220],
            "source": src["name"],
            "publisher": publisher or src["name"],
            "tier": src["tier"],
            "region": src["region"],
            "category": categorize(title + " " + desc),
            "published": pub.astimezone(KST).isoformat() if pub else None,
        })
    return items


def norm_title(t: str) -> str:
    return re.sub(r"[\W_]+", "", t).lower()[:60]


def main() -> int:
    now = datetime.now(KST)
    existing = []
    if OUT.exists():
        try:
            existing = json.loads(OUT.read_text(encoding="utf-8")).get("items", [])
        except json.JSONDecodeError:
            existing = []

    fresh, status = [], []
    for src in SOURCES:
        try:
            got = parse_feed(fetch(src["url"]), src)
            fresh.extend(got)
            status.append({"source": src["name"], "ok": True, "count": len(got)})
            print(f"[ok]   {src['name']}: {len(got)}")
        except Exception as e:  # 한 출처 실패가 전체를 막지 않도록
            status.append({"source": src["name"], "ok": False, "error": str(e)[:120]})
            print(f"[fail] {src['name']}: {e}", file=sys.stderr)

    cutoff = now - timedelta(days=MAX_AGE_DAYS)
    seen, merged = set(), []
    for item in fresh + existing:
        key = norm_title(item["title"])
        if key in seen:
            continue
        pub = parse_date(item.get("published"))
        if pub and pub < cutoff:
            continue
        if pub and pub > now + timedelta(days=1):
            continue
        seen.add(key)
        item.setdefault("firstSeen", now.isoformat())
        merged.append(item)

    merged.sort(key=lambda x: x.get("published") or x.get("firstSeen") or "", reverse=True)
    merged = merged[:MAX_ITEMS]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "updated": now.isoformat(),
        "sources": status,
        "items": merged,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"saved {len(merged)} items -> {OUT}")
    ok = sum(1 for s in status if s["ok"])
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
