// 축산기사 필답형 암기 앱 로직
(function () {
  "use strict";

  const STORE_KEY = "chuksan_pildap_v1";
  const DAY = 24 * 60 * 60 * 1000;
  // 상자(box) 번호별 다음 복습까지의 일수. 4상자 이상이면 '암기 완료'로 본다.
  const INTERVAL_DAYS = [0, 1, 2, 4, 7, 14];
  const MASTER_BOX = 4;
  const CATS = ["번식", "영양·사료", "초지·조사료", "경영", "축산물", "육종·유전", "사양·시설"];
  const CAT_COLOR = {
    "번식": "#c0577a", "영양·사료": "#c98a12", "초지·조사료": "#3f8f4a", "경영": "#3a6fb0",
    "축산물": "#b5533c", "육종·유전": "#7a5bb0", "사양·시설": "#4f8a8b",
  };
  const BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

  // ---------- 저장소 (localStorage, 실패해도 앱은 동작) ----------
  function freshStore() {
    return { cards: {}, stars: [], exams: [], examDraft: null };
  }
  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return freshStore();
      return Object.assign(freshStore(), JSON.parse(raw));
    } catch (e) {
      return freshStore();
    }
  }
  let store = loadStore();
  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) { /* 저장 불가 환경: 이번 세션 동안만 유지 */ }
  }

  function card(id) {
    if (!store.cards[id]) store.cards[id] = { box: 0, due: 0, seen: 0, ok: 0, ng: 0 };
    return store.cards[id];
  }
  function peekCard(id) {
    return store.cards[id] || null;
  }
  function isStarred(id) {
    return store.stars.includes(id);
  }
  function toggleStar(id) {
    if (isStarred(id)) store.stars = store.stars.filter((x) => x !== id);
    else store.stars.push(id);
    saveStore();
  }

  // g: "good"(완벽) | "hard"(애매) | "again"(모름)
  function gradeCard(id, g) {
    const c = card(id);
    c.seen++;
    if (g === "good") {
      c.box = Math.min(5, c.box + 1);
      c.ok++;
      c.due = Date.now() + INTERVAL_DAYS[c.box] * DAY;
    } else if (g === "hard") {
      c.box = Math.max(1, Math.min(c.box, 3));
      c.due = Date.now() + DAY;
    } else {
      c.box = 0;
      c.ng++;
      c.due = Date.now();
    }
    saveStore();
  }

  function status(id) {
    const c = peekCard(id);
    if (!c || c.seen === 0) return "new";
    if (c.box >= MASTER_BOX) return "master";
    return "learn";
  }
  function isDue(id) {
    const c = peekCard(id);
    return !!c && c.seen > 0 && c.due <= Date.now();
  }
  function isWrong(id) {
    const c = peekCard(id);
    return !!c && c.ng > 0 && c.box < MASTER_BOX;
  }

  // ---------- 유틸 ----------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function norm(s) {
    return String(s).toLowerCase().replace(/[\s.,·:;'"“”‘’()\[\]{}~\-–—_/\\]+/g, "");
  }
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $all(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }
  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 1800);
  }

  // ---------- 핵심어 추출 ----------
  // 정답 줄에서 '(1) 용어 : 설명' 의 용어, 짧은 항목, 쉼표로 나열된 짧은 항목,
  // 화살표 단계, 계산식의 최종 답을 핵심어로 뽑는다. 서술형 정답은 주요 낱말을 고른다.
  const JOSA = ["으로", "에서", "에게", "하여", "하고", "되어", "된다", "한다", "이다", "이며", "에", "을", "를", "이", "가", "은", "는", "의", "와", "과", "로", "도"];
  const STOP = new Set(["있다", "있으며", "되는", "하는", "것이다", "통해", "위해", "이것은", "다시", "또는", "경우", "과정", "방법", "사용", "이용", "따라", "그로", "인해", "완전히", "때까지"]);
  const termCache = new Map();

  function stripMarker(s) {
    return s.replace(/^\(\d+\)\s*/, "").replace(/^[가나다라마바사아]\.\s*/, "").replace(/^@\s*/, "").trim();
  }
  function isFormula(s) {
    return /=/.test(s) && /\d/.test(s);
  }
  function stripJosa(w) {
    const j = JOSA.find((x) => w.length > x.length && w.endsWith(x));
    return j ? w.slice(0, -j.length) : w;
  }
  function contentWords(text) {
    const words = [];
    text.split(/[\s,()·:;/\[\]]+/).forEach((w) => {
      const t = stripJosa(w.replace(/\.$/, ""));
      if (/[가-힣]/.test(t) && t.length >= 2 && !STOP.has(t) && !/(다|고|며|서|면|했|되|었|는|해|하|시키|인해|까지|어야)$/.test(t) && !words.includes(t)) words.push(t);
    });
    return words;
  }
  function longest(words, n) {
    return words.slice().sort((a, b) => b.length - a.length).slice(0, n).sort((a, b) => words.indexOf(a) - words.indexOf(b));
  }
  // '원인', '장점' 같은 머리말은 핵심어로 치지 않고 뒤의 내용을 본다
  const HEADS = new Set(["원인", "증상", "대책", "정의", "장점", "단점", "공식", "정답", "위치", "기능", "개념", "목적", "이유", "시기", "종류", "유의점", "치료", "예방책", "차이점", "등급", "기타"]);
  // 괄호 안의 쉼표는 나누지 않고, 쉼표 · ' – ' · ' / ' 로 항목을 나눈다
  function splitItems(t) {
    const parts = [];
    let depth = 0, cur = "";
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (ch === "(") depth++;
      if (ch === ")") depth = Math.max(0, depth - 1);
      const rest = t.slice(i);
      const sep = depth === 0 && (ch === "," ? 1 : /^\s[–/-]\s/.test(rest) ? 3 : 0);
      if (sep) {
        parts.push(cur);
        cur = "";
        i += sep - 1;
      } else cur += ch;
    }
    parts.push(cur);
    return parts.map((p) => p.trim().replace(/\s*등\)?$/, (m) => (m.includes(")") ? ")" : ""))).filter(Boolean);
  }
  function termsOf(item) {
    if (termCache.has(item.id)) return termCache.get(item.id);
    const out = [];
    const add = (t) => {
      t = String(t).trim().replace(/^[>:=\s]+/, "").replace(/[.,]$/, "").trim();
      if (t && t.length <= 40 && !HEADS.has(t) && !out.includes(t)) out.push(t);
    };
    const splitList = (t) => {
      const parts = splitItems(t);
      if (parts.length >= 2 && parts.every((p) => p.length <= 14)) { parts.forEach(add); return true; }
      return false;
    };
    if (item.keys) item.keys.forEach(add);
    if (item.seq) item.seq.steps.forEach(add);
    if (item.atable) item.atable.rows.forEach((r) => { add(r[1]); add(r[3]); });
    item.a.forEach((line) => {
      const before = out.length;
      eachLine(stripMarker(line));
      // 아무 핵심어도 못 뽑은 서술 줄은 긴 낱말 두 개를 고른다
      const covered = out.some((t) => line.includes(t));
      if (out.length === before && !covered && !isFormula(line)) {
        longest(contentWords(stripMarker(line)).filter((w) => w.length >= 3), Math.min(6, Math.max(2, Math.round(line.length / 16)))).forEach(add);
      }
    });
    function eachLine(s) {
      if (!s) return;
      if (s.includes("->")) { s.split("->").forEach(add); return; }
      if (isFormula(s)) {
        const last = s.split("=").pop().trim();
        if (/\d/.test(last) && last.replace(/^[>\s]+/, "").length <= 14) add(last);
        else (s.match(/\d+\.\d+/g) || []).forEach(add); // 공식 속 계수(68.184, 2.25 등)
        return;
      }
      if (s.includes("=")) { // 숫자 없는 공식: 우변을 외운다
        add(s.split("=").pop());
        return;
      }
      const m = s.match(/\s:\s|:/);
      if (m && m.index > 0) {
        const head = s.slice(0, m.index).trim();
        const tail = s.slice(m.index + m[0].length).trim();
        if (head.length <= 18 && !HEADS.has(head)) { add(head); splitList(tail); }
        else eachLine(tail);
      } else if (!splitList(s) && s.length <= 40) {
        add(s);
      }
    }
    if (out.length === 0) longest(contentWords(item.a.join(" ")), 6).forEach(add);
    termCache.set(item.id, out);
    return out;
  }
  // '난포자극호르몬(FSH)' → 전체, 괄호 밖, 괄호 안 모두 정답으로 인정
  function alts(term) {
    const list = [term];
    const m = term.match(/^(.*?)\((.*?)\)(.*)$/);
    if (m) {
      list.push(m[1] + m[3]);
      m[2].split(/[,/]/).forEach((x) => list.push(x));
    }
    return list.map(norm).filter((x) => x.length > 0);
  }
  // 띄어쓰기가 있는 긴 구절은 주요 낱말의 60% 이상이 들어 있으면 맞힌 것으로 본다
  function phraseWords(term) {
    return term.split(/[\s,]+/).map(stripJosa).map(norm).filter((w) => w.length >= 2);
  }
  function textHits(text, term) {
    const n = norm(text);
    if (alts(term).some((a) => n.includes(a))) return true;
    const ws = term.length > 8 ? phraseWords(term) : [];
    return ws.length >= 2 && ws.filter((w) => n.includes(w)).length / ws.length >= 0.6;
  }
  function blankCorrect(input, term) {
    const n = norm(input);
    if (!n) return false;
    if (alts(term).some((a) => a === n || (n.length >= 2 && a.includes(n) && n.length >= a.length * 0.6) || (a.length >= 2 && n.includes(a)))) return true;
    return textHits(input, term) && term.length > 8;
  }
  // 빈칸 모드에서는 짧은 핵심어만 빈칸으로 만든다 (없으면 전부)
  function blankTerms(item) {
    const t = termsOf(item);
    const short = t.filter((x) => x.length <= 14);
    return short.length ? short : t;
  }

  // ---------- 렌더링: 문제/정답 ----------
  function tableHTML(t, opts) {
    opts = opts || {};
    const head = t.head.map((h) => `<th>${esc(h)}</th>`).join("");
    const rows = t.rows
      .map((r, ri) => "<tr>" + r.map((c, ci) => {
        if (opts.blankCols && opts.blankCols.includes(ci)) {
          return `<td><input class="blank" data-term="${esc(c)}" data-row="${ri}" aria-label="${esc(t.head[ci])} 빈칸" autocomplete="off" /></td>`;
        }
        if (opts.maskCols && opts.maskCols.includes(ci)) return `<td><span class="hint-mask">${esc(firstCharHint(c))}</span></td>`;
        const wrap = String(c).length > 16 ? ' class="wrap-cell"' : "";
        return `<td${wrap}>${esc(c)}</td>`;
      }).join("") + "</tr>")
      .join("");
    return `<div class="tbl-wrap"><table class="data"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // ---------- 힌트 ----------
  const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  function initials(t) {
    return String(t).replace(/[가-힣]/g, (c) => CHO[Math.floor((c.charCodeAt(0) - 0xac00) / 588)]);
  }
  // 낱말마다 첫 글자만 남기고 나머지는 ○ (숫자·기호는 그대로)
  function firstCharHint(t) {
    return String(t).split(/(\s+)/).map((w) => (/\s/.test(w) ? w : w.slice(0, 1) + w.slice(1).replace(/[가-힣A-Za-z]/g, "○"))).join("");
  }
  // 1단계 힌트. 서술형: 핵심어 초성과 항목 수 / 계산: 풀이식의 숫자를 □로 가린 공식 틀
  function hint1HTML(item) {
    if (item.calc) {
      const lines = item.a.map((l) => {
        const head = (l.match(/^\(\d+\)\s*/) || [""])[0];
        return esc(head) + esc(l.slice(head.length)).replace(/\d+(\.\d+)?/g, "□").replace(/-&gt;/g, " → ");
      });
      return `<p class="small muted" style="margin:0">풀이식의 숫자를 □로 가렸어요. 공식을 떠올려 숫자를 넣어 보세요.</p><ul class="alines">${lines.map((l) => `<li class="formula">${l}</li>`).join("")}</ul>`;
    }
    const terms = termsOf(item);
    const items = item.a.filter((l) => /^\(\d+\)/.test(l)).length;
    return `<p class="small muted" style="margin:0">${items ? `답은 ${items}가지 항목, ` : ""}핵심어 ${terms.length}개의 초성이에요.</p>
      <div class="row">${terms.map((t) => `<span class="hint-chip">${esc(initials(t))}</span>`).join("")}</div>`;
  }
  // 힌트 보고 쓰기 모드는 1단계 힌트를 펼친 채로 시작한다
  function hintLevel() {
    return Math.max(session.hint || 0, session.mode === "hint" ? 1 : 0);
  }
  function hintPanelHTML(item) {
    const lv = hintLevel();
    if (!lv) return "";
    let html = `<div class="hint-panel"><div class="answer-label">힌트 1</div>${hint1HTML(item)}</div>`;
    if (lv >= 2) {
      const label = item.calc ? "힌트 2 · 계산 과정 (최종 답만 □)" : "힌트 2 · 정답 틀 (핵심어는 첫 글자만)";
      const body = item.calc
        ? `<ul class="alines">${item.a.map((l) => {
          if (!isFormula(l)) return `<li>${esc(l).replace(/-&gt;/g, " → ")}</li>`;
          const cut = l.lastIndexOf("=") + 1;
          return `<li class="formula">${esc(l.slice(0, cut))} <span class="hint-mask">□</span></li>`;
        }).join("")}</ul>`
        : answerHTML(item, "mask");
      html += `<div class="hint-panel"><div class="answer-label">${label}</div>${body}</div>`;
    }
    return html;
  }

  function questionHTML(item, opts) {
    opts = opts || {};
    const tags = [`<span class="cat-tag" style="--cat:${CAT_COLOR[item.cat]}">${esc(item.cat)}</span>`];
    if (item.calc) tags.push('<span class="badge calc">계산</span>');
    const star = opts.noStar ? "" : `<button class="star ${isStarred(item.id) ? "on" : ""}" data-star="${item.id}" aria-label="별표">★</button>`;
    let html = `<div class="qhead"><span class="qno">문 ${item.id}</span>${tags.join("")}${star}</div>`;
    html += `<p class="qtext">${esc(item.q)}</p>`;
    if (item.given) html += `<ul class="given">${item.given.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>`;
    if (item.table) html += tableHTML(item.table);
    return html;
  }

  // mode: "show" (핵심어 형광펜), "check" (입력과 대조), "blank" (빈칸), "mask" (힌트: 핵심어를 첫 글자만)
  function answerHTML(item, mode, userText) {
    const terms = (mode === "blank" || mode === "mask" ? blankTerms(item) : termsOf(item)).slice().sort((a, b) => b.length - a.length);
    const lines = item.a.map((l) => esc(l));
    const slots = [];
    const used = new Set();
    terms.forEach((t) => {
      const et = esc(t);
      for (let i = 0; i < lines.length; i++) {
        const idx = lines[i].indexOf(et);
        if (idx >= 0 && !used.has(t)) {
          used.add(t);
          slots.push(t);
          lines[i] = lines[i].slice(0, idx) + `\u0001${slots.length - 1}\u0002` + lines[i].slice(idx + et.length);
          break;
        }
      }
    });
    const fill = (s) => s.replace(/\u0001(\d+)\u0002/g, (_, k) => {
      const t = slots[+k];
      if (mode === "blank") {
        const w = Math.max(4, Math.min(16, t.length + 1));
        return `<input class="blank" data-term="${esc(t)}" style="width:${w + 1}em" aria-label="빈칸" autocomplete="off" />`;
      }
      if (mode === "mask") return `<span class="hint-mask">${esc(firstCharHint(t))}</span>`;
      if (mode === "check") {
        return `<mark class="k ${textHits(userText, t) ? "hit" : "miss"}">${esc(t)}</mark>`;
      }
      return `<mark class="k">${esc(t)}</mark>`;
    });
    const lis = item.a.map((raw, i) => {
      const cls = [];
      if (/^[가나다라마바사아]\./.test(raw)) cls.push("sub");
      if (isFormula(raw) && !/^\(\d+\)\s*[^=]{12,}:/.test(raw)) cls.push("formula");
      return `<li class="${cls.join(" ")}">${fill(lines[i]).replace(/-&gt;/g, " → ")}</li>`;
    });
    let html = "";
    if (item.atable) {
      html += mode === "blank" ? tableHTML(item.atable, { blankCols: [1, 3] })
        : mode === "mask" ? tableHTML(item.atable, { maskCols: [1, 3] }) : tableHTML(item.atable);
    }
    if (lis.length) html += `<ul class="alines">${lis.join("")}</ul>`;
    return html;
  }

  function coverage(item, text) {
    const terms = termsOf(item);
    if (!text.trim() || terms.length === 0) return null;
    const hit = terms.filter((t) => textHits(text, t));
    return { pct: Math.round((hit.length / terms.length) * 100), hit, miss: terms.filter((t) => !hit.includes(t)) };
  }
  function coverageHTML(cov) {
    if (!cov) return "";
    const miss = cov.miss.length ? `<span class="miss-list">빠진 핵심어: ${cov.miss.map(esc).join(", ")}</span>` : '<span class="all-hit">핵심어를 모두 썼어요.</span>';
    return `<div class="coverage"><b>${cov.pct}%</b><span class="muted">핵심어 일치</span>${miss}</div>`;
  }
  function similarHTML(item) {
    if (!item.sim) return "";
    return `<p class="small muted" style="margin:0">비슷한 문제: ${item.sim.map((s) => `<a href="#list" data-goto="${s}">문 ${s}</a>`).join(", ")}</p>`;
  }

  // ---------- 라우터 ----------
  const VIEWS = ["home", "study", "exam", "list"];
  function currentView() {
    const h = location.hash.replace("#", "");
    return VIEWS.includes(h) ? h : "home";
  }
  function route() {
    const v = currentView();
    VIEWS.forEach((name) => $(`#view-${name}`).classList.toggle("active", name === v));
    $all(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === v));
    if (v === "home") renderHome();
    if (v === "study") renderStudy();
    if (v === "exam") renderExam();
    if (v === "list") renderList();
    window.scrollTo(0, 0);
  }
  function go(view) {
    if (location.hash === "#" + view) route();
    else location.hash = view;
  }

  // ---------- 홈 ----------
  let resetArmed = false;
  function renderHome() {
    const ids = QUESTIONS.map((q) => q.id);
    const master = ids.filter((id) => status(id) === "master").length;
    const learn = ids.filter((id) => status(id) === "learn").length;
    const fresh = ids.length - master - learn;
    const due = ids.filter(isDue).length;
    const wrong = ids.filter(isWrong).length;
    const pct = Math.round((master / ids.length) * 100);
    const C = 2 * Math.PI * 44;

    const bars = CATS.map((c) => {
      const cid = QUESTIONS.filter((q) => q.cat === c).map((q) => q.id);
      const m = cid.filter((id) => status(id) === "master").length;
      const l = cid.filter((id) => status(id) === "learn").length;
      return `<div class="cat-bar"><span class="cat-tag" style="--cat:${CAT_COLOR[c]}">${c}</span>
        <div class="bar"><i class="m" style="width:${(m / cid.length) * 100}%"></i><i class="l" style="width:${(l / cid.length) * 100}%"></i></div>
        <span class="num small muted" style="text-align:right">${m}/${cid.length}</span></div>`;
    }).join("");

    const exams = store.exams.slice(-12);
    const hist = exams.length
      ? `<div class="history" aria-label="최근 모의고사 점수">${exams.map((e) => `<div class="h ${e.score < 60 ? "fail" : ""}" style="height:${Math.max(4, e.score)}%" title="${e.date} · ${e.score}점"></div>`).join("")}</div>
         <p class="small muted" style="margin:8px 0 0">최근 ${exams.length}회 · 마지막 <b class="num">${exams[exams.length - 1].score}</b>점 · 60점 이상 합격</p>`
      : `<p class="small muted" style="margin:0">아직 본 모의고사가 없어요. 20문항을 직접 써 보고 채점해 보세요.</p>`;

    $("#view-home").innerHTML = `
      <div class="stack">
        <div class="card hero">
          <div>
            <h1>필답형 기출 ${ids.length}문항</h1>
            <p>문제를 보고 답을 떠올린 뒤 스스로 채점하면, 모르는 문제는 자주, 아는 문제는 간격을 늘려 다시 나옵니다.</p>
          </div>
          <div class="ring" role="img" aria-label="암기 완료 ${pct}%">
            <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="var(--line)" stroke-width="9"/>
              <circle cx="50" cy="50" r="44" fill="none" stroke="var(--accent)" stroke-width="9" stroke-linecap="round"
                stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - master / ids.length)}"/></svg>
            <div class="ring-label"><div><b>${pct}%</b><br><span>암기 완료</span></div></div>
          </div>
        </div>

        <div class="stat-row">
          <div class="stat"><b>${master}</b><span>암기 완료</span></div>
          <div class="stat"><b>${learn}</b><span>학습 중</span></div>
          <div class="stat"><b>${fresh}</b><span>아직 안 본 문제</span></div>
        </div>

        <div class="actions">
          <button class="action main" data-act="today"><b>오늘의 학습 시작</b><span>복습할 문제 ${due}개 + 새 문제</span></button>
          <button class="action" data-act="hint"><b>힌트 보고 써 보기</b><span>초성·공식 힌트를 보며 답안을 직접 작성</span></button>
          <button class="action" data-act="blank"><b>빈칸 채우기</b><span>정답 속 핵심어를 직접 써서 확인</span></button>
          <button class="action" data-act="exam"><b>모의고사</b><span>20문항 서술 후 자가 채점</span></button>
          <button class="action" data-act="wrong" ${wrong ? "" : "disabled"}><b>틀린 문제 다시</b><span>${wrong ? `오답 ${wrong}개` : "아직 틀린 문제가 없어요"}</span></button>
        </div>

        <div class="card">
          <h3 class="section-title">분야별 암기 현황</h3>
          <div class="cat-bars">${bars}</div>
          <div class="legend"><span><i style="background:var(--good)"></i>암기 완료</span><span><i style="background:var(--warn)"></i>학습 중</span><span><i style="background:var(--line)"></i>미학습</span></div>
        </div>

        <div class="card">
          <h3 class="section-title">모의고사 기록</h3>
          ${hist}
        </div>

        <div class="row small muted" id="reset-row">
          <span>학습 기록은 이 기기의 브라우저에 저장됩니다.</span>
          <button class="btn ghost small" data-act="reset">${resetArmed ? "정말 초기화" : "기록 초기화"}</button>
          ${resetArmed ? '<button class="btn ghost small" data-act="reset-cancel">취소</button>' : ""}
        </div>
      </div>`;
  }

  $("#view-home").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "today") startStudy({ source: "today", mode: "flash", count: 20, order: "random", cats: [], calcOnly: false });
    if (act === "blank") { setup.mode = "blank"; go("study"); }
    if (act === "hint") { setup.mode = "hint"; go("study"); }
    if (act === "exam") go("exam");
    if (act === "wrong") startStudy({ source: "wrong", mode: "flash", count: 0, order: "random", cats: [], calcOnly: false });
    if (act === "reset") {
      if (resetArmed) {
        store = freshStore();
        saveStore();
        resetArmed = false;
        toast("학습 기록을 초기화했어요");
      } else resetArmed = true;
      renderHome();
    }
    if (act === "reset-cancel") { resetArmed = false; renderHome(); }
  });

  // ---------- 암기 학습 ----------
  const setup = { source: "today", mode: "flash", count: 20, order: "random", cats: [], calcOnly: false };
  let session = null;

  function pool(cfg) {
    let items = QUESTIONS.slice();
    if (cfg.cats.length) items = items.filter((q) => cfg.cats.includes(q.cat));
    if (cfg.calcOnly) items = items.filter((q) => q.calc);
    if (cfg.mode === "seq") items = items.filter((q) => q.seq);
    if (cfg.source === "star") items = items.filter((q) => isStarred(q.id));
    if (cfg.source === "wrong") items = items.filter((q) => isWrong(q.id));
    if (cfg.source === "new") items = items.filter((q) => status(q.id) === "new");
    let ids = items.map((q) => q.id);
    if (cfg.source === "today") {
      const due = ids.filter(isDue).sort((a, b) => card(a).due - card(b).due);
      const fresh = ids.filter((id) => status(id) === "new");
      const n = cfg.count || 20;
      ids = due.slice(0, n);
      if (ids.length < n) ids = ids.concat(cfg.order === "random" ? shuffle(fresh) : fresh).slice(0, n);
      return cfg.order === "random" ? shuffle(ids) : ids;
    }
    if (cfg.order === "random") ids = shuffle(ids);
    if (cfg.count) ids = ids.slice(0, cfg.count);
    return ids;
  }

  function startStudy(cfg) {
    Object.assign(setup, cfg);
    const ids = pool(setup);
    if (!ids.length) {
      toast("조건에 맞는 문제가 없어요");
      go("study");
      return;
    }
    session = { mode: setup.mode, queue: ids, idx: 0, total: ids.length, results: {}, requeued: {}, revealed: false, typed: "" };
    go("study");
  }

  function renderStudy() {
    if (!session) return renderSetup();
    if (session.idx >= session.queue.length) return renderDone();
    const id = session.queue[session.idx];
    const item = BY_ID.get(id);
    const mode = session.mode === "seq" && !item.seq ? "flash" : session.mode;
    const doneCount = Object.keys(session.results).length;
    const top = `<div class="session-top"><span>${{ flash: "암기 카드", hint: "힌트 보고 쓰기", blank: "빈칸 채우기", seq: "순서 맞추기" }[session.mode]} · <span class="num">${Math.min(session.idx + 1, session.queue.length)}/${session.queue.length}</span></span>
      <button class="btn ghost small" data-s="quit">그만하기</button></div>
      <div class="progress"><i style="width:${(doneCount / session.total) * 100}%"></i></div>`;
    let body = "";
    if (mode === "flash") body = flashHTML(item);
    if (mode === "blank") body = blankHTML(item);
    if (mode === "hint") body = flashHTML(item);
    if (mode === "seq") body = seqHTML(item);
    $("#view-study").innerHTML = `<div class="stack">${top}<div class="card qcard" id="qcard">${body}</div></div>`;
    if ((mode === "flash" || mode === "hint") && !session.revealed) {
      const ta = $("#typed");
      if (ta) ta.value = session.typed;
    }
    if (mode === "blank" && !session.revealed) {
      const first = $("#qcard .blank");
      if (first && window.matchMedia("(hover: hover)").matches) first.focus();
    }
  }

  function gradeButtons(suggest) {
    const s = (g) => (suggest === g ? " sel" : "");
    return `<div class="grade">
      <button class="btn bad${s("again")}" data-grade="again">모름<kbd>1</kbd><small>곧 다시 나와요</small></button>
      <button class="btn warn${s("hard")}" data-grade="hard">애매<kbd>2</kbd><small>내일 복습</small></button>
      <button class="btn good${s("good")}" data-grade="good">완벽<kbd>3</kbd><small>간격 늘리기</small></button>
    </div>`;
  }

  function flashHTML(item) {
    let html = questionHTML(item);
    if (!session.revealed) {
      const lv = hintLevel();
      html += hintPanelHTML(item);
      html += `<textarea id="typed" placeholder="${lv ? "힌트를 보면서 답안을 써 보세요." : "답안을 써 보거나 머릿속으로 떠올린 뒤 정답을 확인하세요. 써 두면 핵심어를 몇 개 맞혔는지 알려 드려요."}"></textarea>
        <div class="row"><button class="btn primary big" data-s="reveal">정답 보기<kbd>Ctrl+Enter</kbd></button>
          ${lv < 2 ? `<button class="btn" data-s="hint">${lv ? "힌트 더 보기" : "힌트 보기"}<kbd>H</kbd></button>` : ""}</div>`;
      return html;
    }
    const cov = coverage(item, session.typed);
    let suggest = cov ? (cov.pct >= 80 ? "good" : cov.pct >= 40 ? "hard" : "again") : null;
    // 힌트 2단계까지 보고 맞혔다면 '완벽' 대신 '애매'를 권한다
    if (suggest === "good" && hintLevel() >= 2) suggest = "hard";
    if (session.typed.trim()) html += `<div><div class="answer-label">내 답안</div><div class="mine">${esc(session.typed)}</div></div>`;
    html += coverageHTML(cov);
    html += `<div class="answer"><div class="answer-label">정답</div>${answerHTML(item, cov ? "check" : "show", session.typed)}</div>`;
    html += similarHTML(item);
    html += gradeButtons(suggest);
    return html;
  }

  function blankHTML(item) {
    let html = questionHTML(item);
    const ans = answerHTML(item, "blank");
    if (!ans.includes("blank")) {
      // 빈칸을 만들 핵심어가 없는 문항은 정답을 보고 자가 채점
      html += `<div class="answer"><div class="answer-label">정답</div>${answerHTML(item, "show")}</div>${gradeButtons(null)}`;
      return html;
    }
    html += `<div class="answer" id="blank-area"><div class="answer-label">빈칸을 채우세요</div>${ans}</div>`;
    html += session.revealed ? session.blankResult : `<div class="row"><button class="btn primary big" data-s="check">확인<kbd>Enter</kbd></button><button class="btn ghost" data-s="giveup">모르겠어요</button></div>`;
    return html;
  }

  function checkBlanks(giveUp) {
    const inputs = $all("#blank-area .blank");
    let ok = 0;
    inputs.forEach((inp) => {
      const t = inp.dataset.term;
      const right = !giveUp && blankCorrect(inp.value, t);
      if (right) ok++;
      inp.classList.add(right ? "ok" : "no");
      inp.readOnly = true;
      if (!right) {
        const fix = document.createElement("span");
        fix.className = "fix";
        fix.textContent = "→ " + t;
        inp.after(fix);
      }
    });
    const pct = inputs.length ? Math.round((ok / inputs.length) * 100) : 0;
    const suggest = pct === 100 ? "good" : pct >= 60 ? "hard" : "again";
    session.revealed = true;
    session.blankResult = `<div class="coverage"><b>${ok}/${inputs.length}</b><span class="muted">빈칸 정답</span></div>${similarHTML(BY_ID.get(session.queue[session.idx]))}${gradeButtons(suggest)}`;
    const area = $("#blank-area");
    const tail = document.createElement("div");
    tail.className = "stack";
    tail.innerHTML = session.blankResult;
    const btnRow = area.nextElementSibling;
    if (btnRow) btnRow.remove();
    area.after(tail);
  }

  function seqHTML(item) {
    if (!session.seqState || session.seqState.id !== item.id) {
      session.seqState = { id: item.id, picked: 0, mistakes: 0, order: shuffle(item.seq.steps.map((_, i) => i)) };
    }
    const st = session.seqState;
    const steps = item.seq.steps;
    let html = questionHTML(item);
    html += `<div class="field"><span class="label">${esc(item.seq.title)} — 순서대로 누르세요</span>
      <div class="seq-picked">${steps.slice(0, st.picked).map((s, i) => `<span class="seq-chip done">${i + 1}. ${esc(s)}</span>`).join("")}</div>
      <div class="seq-pool">${st.order.filter((i) => i >= st.picked).map((i) => `<button class="seq-chip" data-seq="${i}">${esc(steps[i])}</button>`).join("")}</div></div>`;
    if (st.picked >= steps.length) {
      const suggest = st.mistakes === 0 ? "good" : st.mistakes <= 2 ? "hard" : "again";
      html += `<div class="coverage"><b>${st.mistakes}</b><span class="muted">번 틀림</span></div>`;
      html += `<div class="answer"><div class="answer-label">정답 전체</div>${answerHTML(item, "show")}</div>`;
      html += gradeButtons(suggest);
    }
    return html;
  }

  function applyGrade(g) {
    const id = session.queue[session.idx];
    gradeCard(id, g);
    session.results[id] = g;
    if (g === "again") {
      // 모르는 문제는 몇 문제 뒤에 다시 보여 준다 (한 세션에 최대 3번)
      const n = (session.requeued[id] || 0) + 1;
      if (n <= 3) {
        session.requeued[id] = n;
        const pos = Math.min(session.queue.length, session.idx + 4);
        session.queue.splice(pos, 0, id);
      }
    }
    session.idx++;
    session.revealed = false;
    session.typed = "";
    session.hint = 0;
    session.blankResult = "";
    session.seqState = null;
    renderStudy();
    window.scrollTo(0, 0);
  }

  function renderDone() {
    const vals = Object.values(session.results);
    const good = vals.filter((v) => v === "good").length;
    const hard = vals.filter((v) => v === "hard").length;
    const again = vals.filter((v) => v === "again").length;
    const notGood = Object.keys(session.results).filter((id) => session.results[id] !== "good").map(Number);
    $("#view-study").innerHTML = `<div class="card done-card stack">
      <h2>이번 학습 끝!</h2>
      <p class="muted" style="margin:0">${session.total}문항 · 마지막 평가 기준</p>
      <div class="stat-row">
        <div class="stat"><b style="color:var(--good)">${good}</b><span>완벽</span></div>
        <div class="stat"><b style="color:var(--warn)">${hard}</b><span>애매</span></div>
        <div class="stat"><b style="color:var(--bad)">${again}</b><span>모름</span></div>
      </div>
      <div class="row" style="justify-content:center">
        ${notGood.length ? `<button class="btn primary" data-s="retry">완벽하지 않은 ${notGood.length}문제 다시</button>` : ""}
        <button class="btn" data-s="setup">다른 범위 학습</button>
        <a class="btn" href="#home" style="text-decoration:none">홈으로</a>
      </div></div>`;
    session.retryIds = notGood;
  }

  function renderSetup() {
    const chip = (key, val, label) => `<button class="chip ${setup[key] === val ? "on" : ""}" data-set="${key}" data-val="${val}">${label}</button>`;
    const modeBtn = (m, title, desc) => `<button class="mode ${setup.mode === m ? "on" : ""}" data-set="mode" data-val="${m}"><b>${title}</b><span>${desc}</span></button>`;
    const n = pool(Object.assign({}, setup, { count: 0, source: setup.source === "today" ? "all" : setup.source })).length;
    $("#view-study").innerHTML = `<div class="card setup stack">
      <div><h2>암기 학습</h2><p class="muted small" style="margin:0">방식과 범위를 고르고 시작하세요. 자가 채점 결과에 따라 복습 시기가 정해집니다.</p></div>
      <div class="field"><span class="label">학습 방식</span><div class="mode-grid">
        ${modeBtn("flash", "암기 카드", "문제를 보고 답을 쓴 뒤 정답과 핵심어를 대조")}
        ${modeBtn("hint", "힌트 보고 쓰기", "초성·공식 틀 힌트를 보며 답안 작성")}
        ${modeBtn("blank", "빈칸 채우기", "정답 속 핵심어가 빈칸으로 나옴")}
        ${modeBtn("seq", "순서 맞추기", "과정·단계를 순서대로 배열 (7문항)")}
      </div></div>
      <div class="field"><span class="label">문제 범위</span><div class="row">
        ${chip("source", "today", "오늘의 복습+새 문제")}${chip("source", "all", "전체")}${chip("source", "new", "안 본 문제")}${chip("source", "wrong", "틀린 문제")}${chip("source", "star", "별표")}
      </div></div>
      <div class="field"><span class="label">분야 (선택 안 하면 전체)</span><div class="row">
        ${CATS.map((c) => `<button class="chip ${setup.cats.includes(c) ? "on" : ""}" data-cat="${c}">${c}</button>`).join("")}
        <button class="chip ${setup.calcOnly ? "on" : ""}" data-calc="1">계산 문제만</button>
      </div></div>
      <div class="field"><span class="label">문항 수 · 순서</span><div class="row">
        ${chip("count", 10, "10")}${chip("count", 20, "20")}${chip("count", 40, "40")}${chip("count", 0, "모두")}
        <span class="muted">·</span>${chip("order", "random", "무작위")}${chip("order", "seq", "번호순")}
      </div></div>
      <div class="row"><button class="btn primary big" data-s="start">학습 시작</button><span class="muted small">조건에 맞는 문제 <b class="num">${n}</b>개</span></div>
    </div>`;
  }

  $("#view-study").addEventListener("click", (e) => {
    const t = e.target;
    const star = t.closest("[data-star]");
    if (star) { toggleStar(+star.dataset.star); star.classList.toggle("on"); return; }
    const goto = t.closest("[data-goto]");
    if (goto) { e.preventDefault(); listState.open = +goto.dataset.goto; listState.q = ""; listState.cat = ""; go("list"); return; }
    const set = t.closest("[data-set]");
    if (set) {
      const v = set.dataset.val;
      setup[set.dataset.set] = set.dataset.set === "count" ? +v : v;
      renderSetup();
      return;
    }
    const cat = t.closest("[data-cat]");
    if (cat) {
      const c = cat.dataset.cat;
      setup.cats = setup.cats.includes(c) ? setup.cats.filter((x) => x !== c) : setup.cats.concat(c);
      renderSetup();
      return;
    }
    if (t.closest("[data-calc]")) { setup.calcOnly = !setup.calcOnly; renderSetup(); return; }
    const g = t.closest("[data-grade]");
    if (g) { applyGrade(g.dataset.grade); return; }
    const sq = t.closest("[data-seq]");
    if (sq) {
      const st = session.seqState;
      if (+sq.dataset.seq === st.picked) {
        st.picked++;
        renderStudy();
      } else {
        st.mistakes++;
        sq.classList.remove("shake");
        void sq.offsetWidth;
        sq.classList.add("shake");
      }
      return;
    }
    const s = t.closest("[data-s]");
    if (!s) return;
    const act = s.dataset.s;
    if (act === "start") startStudy({});
    if (act === "reveal") { session.typed = ($("#typed") || { value: "" }).value; session.revealed = true; renderStudy(); }
    if (act === "hint") {
      session.typed = ($("#typed") || { value: "" }).value;
      session.hint = hintLevel() + 1;
      renderStudy();
      const ta = $("#typed");
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }
    if (act === "check") checkBlanks(false);
    if (act === "giveup") checkBlanks(true);
    if (act === "quit") { session = Object.keys(session.results).length ? Object.assign(session, { idx: session.queue.length }) : null; renderStudy(); }
    if (act === "setup") { session = null; renderStudy(); }
    if (act === "retry") {
      const ids = shuffle(session.retryIds);
      session = { mode: session.mode, queue: ids, idx: 0, total: ids.length, results: {}, requeued: {}, revealed: false, typed: "" };
      renderStudy();
    }
  });
  $("#view-study").addEventListener("input", (e) => {
    if (e.target.id === "typed" && session) session.typed = e.target.value;
  });

  document.addEventListener("keydown", (e) => {
    if (currentView() !== "study" || !session || session.idx >= session.queue.length) return;
    const inText = e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT";
    const reveal = $('[data-s="reveal"]');
    const check = $('[data-s="check"]');
    if (reveal && ((!inText && e.key === " ") || (e.key === "Enter" && (e.ctrlKey || e.metaKey)))) {
      e.preventDefault();
      reveal.click();
      return;
    }
    const hintBtn = $('[data-s="hint"]');
    if (hintBtn && !inText && (e.key === "h" || e.key === "H")) {
      e.preventDefault();
      hintBtn.click();
      return;
    }
    if (check && e.key === "Enter") {
      e.preventDefault();
      check.click();
      return;
    }
    if (!inText || e.target.readOnly) {
      const map = { 1: "again", 2: "hard", 3: "good" };
      const btn = map[e.key] && $(`[data-grade="${map[e.key]}"]`);
      if (btn) { e.preventDefault(); btn.click(); }
    }
  });

  // ---------- 모의고사 ----------
  const examSetup = { n: 20, cats: [] };
  let examTick = null;

  function renderExam() {
    clearInterval(examTick);
    const d = store.examDraft;
    if (!d) return renderExamSetup();
    if (d.phase === "write") return renderExamWrite();
    return renderExamReview();
  }

  function renderExamSetup() {
    const chipN = (n) => `<button class="chip ${examSetup.n === n ? "on" : ""}" data-n="${n}">${n}문항</button>`;
    $("#view-exam").innerHTML = `<div class="card setup stack">
      <div><h2>모의고사</h2><p class="muted small" style="margin:0">실제 필답형처럼 답을 직접 써 내려간 뒤 제출하면, 정답과 비교해 문항마다 맞음·부분·틀림을 매깁니다. 핵심어 일치율로 채점을 미리 제안해 드려요.</p></div>
      <div class="field"><span class="label">문항 수</span><div class="row">${chipN(10)}${chipN(20)}${chipN(30)}</div></div>
      <div class="field"><span class="label">분야 (선택 안 하면 전체)</span><div class="row">
        ${CATS.map((c) => `<button class="chip ${examSetup.cats.includes(c) ? "on" : ""}" data-ecat="${c}">${c}</button>`).join("")}</div></div>
      <div class="row"><button class="btn primary big" data-e="start">시험 시작</button></div>
    </div>`;
  }

  function renderExamWrite() {
    const d = store.examDraft;
    const item = BY_ID.get(d.ids[d.cur]);
    const nav = d.ids.map((id, i) => `<button class="${d.answers[i].trim() ? "filled" : ""} ${i === d.cur ? "cur" : ""}" data-jump="${i}">${i + 1}</button>`).join("");
    const unanswered = d.answers.filter((a) => !a.trim()).length;
    $("#view-exam").innerHTML = `<div class="stack">
      <div class="session-top"><span>모의고사 · <span class="num">${d.cur + 1}/${d.ids.length}</span></span><span class="timer" id="timer"></span></div>
      <div class="exam-nav">${nav}</div>
      <div class="card qcard">${questionHTML(item, { noStar: true })}
        <textarea id="exam-answer" placeholder="답안을 작성하세요">${esc(d.answers[d.cur])}</textarea>
        <div class="row">
          <button class="btn" data-e="prev" ${d.cur === 0 ? "disabled" : ""}>이전</button>
          <button class="btn" data-e="next" ${d.cur === d.ids.length - 1 ? "disabled" : ""}>다음</button>
          <span style="flex:1"></span>
          ${d.confirmSubmit
            ? `<span class="small muted">${unanswered ? `빈 답안 ${unanswered}개가 있어요.` : ""} 제출할까요?</span><button class="btn primary" data-e="submit-yes">제출</button><button class="btn ghost" data-e="submit-no">계속 쓰기</button>`
            : `<button class="btn primary" data-e="submit">답안 제출</button>`}
        </div>
      </div>
      <div class="row"><button class="btn ghost small" data-e="abort">시험 그만두기</button></div>
    </div>`;
    const tick = () => {
      const el = $("#timer");
      if (!el) return clearInterval(examTick);
      const s = Math.floor((Date.now() - d.start) / 1000);
      el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} 경과`;
    };
    tick();
    examTick = setInterval(tick, 1000);
  }

  function examScore(d) {
    const pts = d.grades.reduce((s, g) => s + (g === "good" ? 1 : g === "hard" ? 0.5 : 0), 0);
    return Math.round((pts / d.ids.length) * 100);
  }

  function renderExamReview() {
    const d = store.examDraft;
    const graded = d.grades.filter(Boolean).length;
    const score = examScore(d);
    const nav = d.ids.map((id, i) => `<button class="${d.grades[i] === "good" ? "g-good" : d.grades[i] === "hard" ? "g-part" : d.grades[i] === "again" ? "g-bad" : ""}" data-scroll="${i}">${i + 1}</button>`).join("");
    const cards = d.ids.map((id, i) => {
      const item = BY_ID.get(id);
      const cov = coverage(item, d.answers[i]);
      const g = d.grades[i];
      const b = (val, cls, label) => `<button class="btn ${cls} ${g === val ? "sel" : ""}" data-eg="${i}" data-val="${val}" aria-pressed="${g === val}">${label}</button>`;
      return `<div class="card qcard" id="ex-${i}">
        ${questionHTML(item)}
        <div><div class="answer-label">내 답안</div><div class="mine">${d.answers[i].trim() ? esc(d.answers[i]) : '<span class="muted">(빈 답안)</span>'}</div></div>
        ${coverageHTML(cov)}
        <div class="answer"><div class="answer-label">정답</div>${answerHTML(item, cov ? "check" : "show", d.answers[i])}</div>
        <div class="grade">${b("again", "bad", "틀림")}${b("hard", "warn", "부분")}${b("good", "good", "맞음")}</div>
      </div>`;
    }).join("");
    $("#view-exam").innerHTML = `<div class="stack">
      <div class="card stack" style="position:relative">
        <div class="row" style="justify-content:space-between">
          <div><h2 style="font-size:18px">채점하기</h2><p class="small muted" style="margin:0">제안된 채점을 확인하고 필요하면 바꾸세요. 맞음 1점, 부분 0.5점.</p></div>
          <div style="text-align:right"><div class="num" style="font-size:28px;line-height:1"><span class="${score >= 60 ? "pass" : "fail"}">${score}</span><span class="small muted">/100</span></div><span class="small muted">${graded}/${d.ids.length} 채점</span></div>
        </div>
        <div class="exam-nav">${nav}</div>
        <div class="row"><button class="btn primary" data-e="finish" ${graded < d.ids.length ? "disabled" : ""}>결과 저장하고 끝내기</button>
          ${graded < d.ids.length ? '<span class="small muted">모든 문항을 채점하면 저장할 수 있어요.</span>' : ""}</div>
      </div>
      ${cards}
    </div>`;
  }

  $("#view-exam").addEventListener("click", (e) => {
    const t = e.target;
    const d = store.examDraft;
    const n = t.closest("[data-n]");
    if (n) { examSetup.n = +n.dataset.n; renderExamSetup(); return; }
    const ec = t.closest("[data-ecat]");
    if (ec) {
      const c = ec.dataset.ecat;
      examSetup.cats = examSetup.cats.includes(c) ? examSetup.cats.filter((x) => x !== c) : examSetup.cats.concat(c);
      renderExamSetup();
      return;
    }
    const star = t.closest("[data-star]");
    if (star) { toggleStar(+star.dataset.star); star.classList.toggle("on"); return; }
    const jump = t.closest("[data-jump]");
    if (jump) { d.cur = +jump.dataset.jump; d.confirmSubmit = false; saveStore(); renderExamWrite(); return; }
    const sc = t.closest("[data-scroll]");
    if (sc) { const el = $("#ex-" + sc.dataset.scroll); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const eg = t.closest("[data-eg]");
    if (eg) {
      d.grades[+eg.dataset.eg] = eg.dataset.val;
      saveStore();
      const y = window.scrollY;
      renderExamReview();
      window.scrollTo(0, y);
      return;
    }
    const b = t.closest("[data-e]");
    if (!b) return;
    const act = b.dataset.e;
    if (act === "start") {
      let items = QUESTIONS.slice();
      if (examSetup.cats.length) items = items.filter((q) => examSetup.cats.includes(q.cat));
      const ids = shuffle(items.map((q) => q.id)).slice(0, examSetup.n).sort((a, b) => a - b);
      store.examDraft = { phase: "write", ids, answers: ids.map(() => ""), grades: ids.map(() => null), cur: 0, start: Date.now() };
      saveStore();
      renderExam();
    }
    if (act === "prev" && d.cur > 0) { d.cur--; saveStore(); renderExamWrite(); }
    if (act === "next" && d.cur < d.ids.length - 1) { d.cur++; saveStore(); renderExamWrite(); }
    if (act === "submit") { d.confirmSubmit = true; renderExamWrite(); }
    if (act === "submit-no") { d.confirmSubmit = false; renderExamWrite(); }
    if (act === "submit-yes") {
      d.phase = "review";
      d.confirmSubmit = false;
      d.minutes = Math.round((Date.now() - d.start) / 60000);
      d.grades = d.ids.map((id, i) => {
        const cov = coverage(BY_ID.get(id), d.answers[i]);
        if (!cov) return "again";
        return cov.pct >= 80 ? "good" : cov.pct >= 40 ? "hard" : "again";
      });
      saveStore();
      renderExam();
      window.scrollTo(0, 0);
    }
    if (act === "abort") { store.examDraft = null; saveStore(); renderExam(); }
    if (act === "finish") {
      d.ids.forEach((id, i) => gradeCard(id, d.grades[i]));
      const score = examScore(d);
      const now = new Date();
      store.exams.push({ date: `${now.getMonth() + 1}/${now.getDate()}`, score, n: d.ids.length, minutes: d.minutes });
      store.examDraft = null;
      saveStore();
      toast(`${score}점 저장 · ${score >= 60 ? "합격선 통과!" : "60점 합격선까지 조금 더"}`);
      go("home");
    }
  });
  $("#view-exam").addEventListener("input", (e) => {
    if (e.target.id === "exam-answer" && store.examDraft) {
      store.examDraft.answers[store.examDraft.cur] = e.target.value;
      saveStore();
      const btn = $(`.exam-nav [data-jump="${store.examDraft.cur}"]`);
      if (btn) btn.classList.toggle("filled", !!e.target.value.trim());
    }
  });

  // ---------- 문제집 ----------
  const listState = { q: "", cat: "", flag: "", open: null };

  function renderList() {
    const fchip = (val, label) => `<button class="chip ${listState.flag === val ? "on" : ""}" data-flag="${val}">${label}</button>`;
    $("#view-list").innerHTML = `
      <div class="filters">
        <input type="search" id="list-search" placeholder="문제·정답 검색 (예: 옥시토신, 감가상각)" value="${esc(listState.q)}" />
        <div class="row">
          <button class="chip ${listState.cat === "" ? "on" : ""}" data-lcat="">전체</button>
          ${CATS.map((c) => `<button class="chip ${listState.cat === c ? "on" : ""}" data-lcat="${c}">${c}</button>`).join("")}
        </div>
        <div class="row">${fchip("", "모두")}${fchip("calc", "계산")}${fchip("star", "★ 별표")}${fchip("wrong", "오답")}${fchip("new", "미학습")}${fchip("master", "암기 완료")}
          <span class="small muted" id="list-count"></span></div>
      </div>
      <div class="qlist" id="qlist"></div>`;
    renderListItems();
    if (listState.open) {
      const el = $(`#qi-${listState.open}`);
      if (el) { el.open = true; fillItemBody(el); setTimeout(() => el.scrollIntoView({ block: "start" }), 0); }
      listState.open = null;
    }
  }

  function renderListItems() {
    const q = norm(listState.q);
    const items = QUESTIONS.filter((it) => {
      if (listState.cat && it.cat !== listState.cat) return false;
      if (listState.flag === "calc" && !it.calc) return false;
      if (listState.flag === "star" && !isStarred(it.id)) return false;
      if (listState.flag === "wrong" && !isWrong(it.id)) return false;
      if (listState.flag === "new" && status(it.id) !== "new") return false;
      if (listState.flag === "master" && status(it.id) !== "master") return false;
      if (q && !norm(it.id + " " + it.q + " " + it.a.join(" ")).includes(q)) return false;
      return true;
    });
    $("#list-count").textContent = `${items.length}문항`;
    $("#qlist").innerHTML = items.length
      ? items.map((it) => {
        const c = peekCard(it.id);
        const dot = isWrong(it.id) ? "ng" : c && c.seen ? "l" + c.box : "";
        return `<details class="qitem" id="qi-${it.id}" data-id="${it.id}">
          <summary><span class="qi-no">${it.id}</span>
            <span class="qi-text">${esc(it.q)}<span class="qi-meta"><span class="cat-tag" style="--cat:${CAT_COLOR[it.cat]}">${it.cat}</span>${it.calc ? '<span class="badge calc">계산</span>' : ""}${isStarred(it.id) ? '<span class="badge">★</span>' : ""}</span></span>
            <span class="dot ${dot}" title="${{ new: "미학습", learn: "학습 중", master: "암기 완료" }[status(it.id)]}"></span></summary>
          <div class="qi-body"></div></details>`;
      }).join("")
      : '<p class="empty">조건에 맞는 문제가 없어요.</p>';
  }

  function fillItemBody(det) {
    const body = det.querySelector(".qi-body");
    if (body.dataset.filled) return;
    const item = BY_ID.get(+det.dataset.id);
    let html = "";
    if (item.given) html += `<ul class="given">${item.given.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>`;
    if (item.table) html += tableHTML(item.table);
    html += `<div class="answer"><div class="answer-label">정답</div>${answerHTML(item, "show")}</div>`;
    html += similarHTML(item);
    html += `<div class="row"><button class="btn small" data-lstar="${item.id}">${isStarred(item.id) ? "★ 별표 해제" : "☆ 별표"}</button>
      <button class="btn small" data-lstudy="${item.id}">이 문제 암기 카드로</button></div>`;
    body.innerHTML = html;
    body.dataset.filled = "1";
  }

  $("#view-list").addEventListener("toggle", (e) => {
    if (e.target.matches && e.target.matches("details.qitem") && e.target.open) fillItemBody(e.target);
  }, true);
  $("#view-list").addEventListener("input", (e) => {
    if (e.target.id === "list-search") { listState.q = e.target.value; renderListItems(); }
  });
  $("#view-list").addEventListener("click", (e) => {
    const t = e.target;
    const lc = t.closest("[data-lcat]");
    if (lc) { listState.cat = lc.dataset.lcat; renderList(); return; }
    const f = t.closest("[data-flag]");
    if (f) { listState.flag = f.dataset.flag; renderList(); return; }
    const ls = t.closest("[data-lstar]");
    if (ls) {
      const id = +ls.dataset.lstar;
      toggleStar(id);
      ls.textContent = isStarred(id) ? "★ 별표 해제" : "☆ 별표";
      return;
    }
    const goto = t.closest("[data-goto]");
    if (goto) {
      e.preventDefault();
      listState.q = ""; listState.cat = ""; listState.flag = ""; listState.open = +goto.dataset.goto;
      renderList();
      return;
    }
    const st = t.closest("[data-lstudy]");
    if (st) {
      const id = +st.dataset.lstudy;
      session = { mode: "flash", queue: [id], idx: 0, total: 1, results: {}, requeued: {}, revealed: false, typed: "" };
      go("study");
    }
  });

  // 문제집 필터가 고정 헤더 바로 아래에 붙도록 헤더 높이를 CSS 변수로 넘긴다
  function syncHeaderHeight() {
    document.documentElement.style.setProperty("--hdr", $(".app-header").offsetHeight + "px");
  }
  window.addEventListener("resize", syncHeaderHeight);
  syncHeaderHeight();

  window.addEventListener("hashchange", route);
  route();
})();
