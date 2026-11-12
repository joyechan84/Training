(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const TIER_LABEL = { gov: "정부·공공", intl: "국제기구", press: "언론" };
  const SCORE_LABEL = { feasibility: "현실성", profitability: "수익성", market: "시장성", entry: "진입 용이성" };
  const PAGE = 40;

  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
  };

  const state = {
    news: [], newsMeta: null, region: "all", tier: "all", cat: "all", q: "", shown: PAGE,
    biz: [], favs: new Set(store.get("lv-favs", [])),
  };

  const todayKST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const dayOf = (iso) => (iso ? new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10) : "날짜 미상");

  function fmtWon(manwon) {
    if (manwon >= 10000) {
      const eok = manwon / 10000;
      return (Number.isInteger(eok) ? eok : eok.toFixed(1)) + "억";
    }
    return manwon.toLocaleString("ko-KR") + "만";
  }
  const fmtCost = (c) => `${fmtWon(c.min)} ~ ${fmtWon(c.max)}원`;
  const overall = (it) => {
    const v = Object.values(it.scores);
    return v.reduce((a, b) => a + b, 0) / v.length;
  };

  async function loadJSON(path) {
    const r = await fetch(path + "?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error(path + " " + r.status);
    return r.json();
  }

  /* ---------------- 탭 ---------------- */
  $$(".tab-btn").forEach((b) => b.addEventListener("click", () => {
    $$(".tab-btn").forEach((x) => x.classList.toggle("active", x === b));
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + b.dataset.view));
    store.set("lv-tab", b.dataset.view);
  }));
  const savedTab = store.get("lv-tab", "news");
  $(`.tab-btn[data-view="${savedTab}"]`)?.click();

  /* ---------------- 뉴스 ---------------- */
  function filteredNews(ignoreCat = false) {
    const q = state.q.trim().toLowerCase();
    return state.news.filter((n) =>
      (state.region === "all" || n.region === state.region) &&
      (state.tier === "all" || n.tier === state.tier) &&
      (ignoreCat || state.cat === "all" || n.category === state.cat) &&
      (!q || (n.title + " " + (n.summary || "") + " " + n.source).toLowerCase().includes(q)));
  }

  function renderCats() {
    const base = filteredNews(true);
    const counts = {};
    base.forEach((n) => { counts[n.category] = (counts[n.category] || 0) + 1; });
    const cats = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    $("#news-cats").innerHTML =
      `<button class="chip ${state.cat === "all" ? "on" : ""}" data-c="all">전체<span class="n">${base.length}</span></button>` +
      cats.map((c) => `<button class="chip ${state.cat === c ? "on" : ""}" data-c="${esc(c)}">${esc(c)}<span class="n">${counts[c]}</span></button>`).join("");
  }

  function renderNews() {
    renderCats();
    const list = filteredNews();
    const empty = $("#news-empty");
    if (!state.news.length) {
      empty.hidden = false;
      empty.textContent = "아직 수집된 뉴스가 없습니다.\nGitHub Actions의 'Livestock daily update' 워크플로가 실행되면 매일 자동으로 채워집니다.";
    } else {
      empty.hidden = list.length > 0;
      empty.textContent = "조건에 맞는 뉴스가 없습니다.";
    }
    const today = todayKST();
    let html = "", lastDay = null;
    list.slice(0, state.shown).forEach((n) => {
      const d = dayOf(n.published || n.firstSeen);
      if (d !== lastDay) {
        html += `<div class="day-head">${d}${d === today ? '<span class="today">오늘</span>' : ""}</div>`;
        lastDay = d;
      }
      const pub = n.publisher && n.publisher !== n.source ? ` · ${esc(n.publisher)}` : "";
      html += `<a class="news-item" href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">
        <div class="meta"><span class="tier tier-${esc(n.tier)}">${TIER_LABEL[n.tier] || ""}</span>
          <span>${esc(n.source)}${pub}</span><span class="cat">${esc(n.category)}</span>
          ${n.region === "intl" ? "<span>🌐 해외</span>" : ""}</div>
        <h3>${esc(n.title)}</h3>${n.summary ? `<p>${esc(n.summary)}</p>` : ""}</a>`;
    });
    $("#news-list").innerHTML = html;
    $("#news-more").hidden = list.length <= state.shown;
  }

  $("#news-cats").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    state.cat = b.dataset.c; state.shown = PAGE; renderNews();
  });
  for (const [id, key] of [["#news-region", "region"], ["#news-tier", "tier"]]) {
    $(id).addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      $$("button", $(id)).forEach((x) => x.classList.toggle("on", x === b));
      state[key] = b.dataset.v; state.cat = "all"; state.shown = PAGE; renderNews();
    });
  }
  $("#news-search").addEventListener("input", (e) => { state.q = e.target.value; state.shown = PAGE; renderNews(); });
  $("#news-more").addEventListener("click", () => { state.shown += PAGE; renderNews(); });

  function renderSourceStatus() {
    const m = state.newsMeta;
    if (!m || !m.sources?.length) return;
    $("#source-status").innerHTML = `<h2>최근 수집 상태</h2><table class="src-table">` +
      m.sources.map((s) => `<tr><td>${esc(s.source)}</td><td>${s.ok ? `✅ ${s.count}건` : "⚠️ 실패"}</td></tr>`).join("") + "</table>";
  }

  /* ---------------- 사업아이템 ---------------- */
  const budgetOf = (it) => (it.cost.min <= 3000 ? "s" : it.cost.min <= 10000 ? "m" : "l");

  function scoreRows(it) {
    return `<div class="scores">${Object.entries(SCORE_LABEL).map(([k, label]) =>
      `<span>${label}</span><div class="bar"><i style="width:${(it.scores[k] / 5) * 100}%"></i></div><b>${it.scores[k]}</b>`).join("")}</div>`;
  }

  function bizCard(it) {
    const isNew = it.date && (Date.now() - new Date(it.date).getTime()) < 3 * 86400e3;
    return `<article class="biz-card" data-id="${esc(it.id)}">
      <button class="fav-btn ${state.favs.has(it.id) ? "on" : ""}" data-fav="${esc(it.id)}" aria-label="관심 아이템">★</button>
      <div class="biz-top">${isNew ? '<span class="badge new">NEW</span>' : ""}
        <span class="badge">${esc(it.category)}</span>${it.target.map((t) => `<span class="badge">${esc(t)}</span>`).join("")}
        ${it.aiGenerated ? '<span class="badge">AI 분석</span>' : ""}</div>
      <h3>${esc(it.emoji || "")} ${esc(it.title)}</h3>
      <p class="sum">${esc(it.summary)}</p>
      <div class="kpis"><span class="overall">${overall(it).toFixed(1)}</span>
        <span class="kpi">초기비용<br><b>${fmtCost(it.cost)}</b></span>
        <span class="kpi">위험도<br><b class="risk-${esc(it.risk)}">${esc(it.risk)}</b></span></div>
      ${scoreRows(it)}
    </article>`;
  }

  function renderBiz() {
    const cat = $("#biz-cat").value, budget = $("#biz-budget").value, target = $("#biz-target").value;
    const sort = $("#biz-sort").value, favOnly = $("#biz-fav").checked;
    let list = state.biz.filter((it) =>
      (cat === "all" || it.category === cat) &&
      (budget === "all" || budgetOf(it) === budget) &&
      (target === "all" || it.target.includes(target)) &&
      (!favOnly || state.favs.has(it.id)));
    const sorters = {
      overall: (a, b) => overall(b) - overall(a),
      feasibility: (a, b) => b.scores.feasibility - a.scores.feasibility || overall(b) - overall(a),
      cost: (a, b) => a.cost.min - b.cost.min,
      profitability: (a, b) => b.scores.profitability - a.scores.profitability || overall(b) - overall(a),
      new: (a, b) => (b.date || "").localeCompare(a.date || ""),
    };
    list.sort(sorters[sort]);
    $("#biz-list").innerHTML = list.length ? list.map(bizCard).join("") : '<p class="empty">조건에 맞는 아이템이 없습니다.</p>';
  }

  function pickFeatured() {
    const today = todayKST();
    const fresh = state.biz.find((it) => it.date === today);
    if (fresh) return { it: fresh, label: "🆕 오늘 새로 분석한 사업아이템" };
    // 날짜 기반 순환: 매일 다른 아이템이 소개된다
    const dayNum = Math.floor(new Date(today).getTime() / 86400e3);
    return { it: state.biz[dayNum % state.biz.length], label: "📌 오늘의 추천 사업아이템" };
  }

  function renderFeatured() {
    if (!state.biz.length) return;
    const { it, label } = pickFeatured();
    $("#biz-featured").innerHTML = `<div class="featured" data-id="${esc(it.id)}">
      <div class="label">${label}</div>
      <h2>${esc(it.emoji || "")} ${esc(it.title)}</h2>
      <p>${esc(it.summary)}</p>
      <div class="kpis"><span class="overall">${overall(it).toFixed(1)}</span>
        <span class="kpi">초기비용<br><b>${fmtCost(it.cost)}</b></span>
        <span class="kpi">대상<br><b>${esc(it.targetDesc)}</b></span></div></div>`;
  }

  function openDetail(id) {
    const it = state.biz.find((x) => x.id === id);
    if (!it) return;
    const li = (arr) => (arr || []).map((x) => `<li>${esc(x)}</li>`).join("");
    $("#biz-detail").innerHTML = `
      <div class="biz-top"><span class="badge">${esc(it.category)}</span>${it.aiGenerated ? `<span class="badge">AI 분석 · ${esc(it.date)}</span>` : ""}</div>
      <h2>${esc(it.emoji || "")} ${esc(it.title)}</h2>
      <p>${esc(it.summary)}</p>
      ${it.whyNow ? `<div class="why">📈 <b>왜 지금?</b> ${esc(it.whyNow)}</div>` : ""}
      <h4>종합 평가 <span class="overall">${overall(it).toFixed(1)}</span> / 5</h4>
      ${scoreRows(it)}
      <h4>💰 초기 비용</h4><p><b>${fmtCost(it.cost)}</b><br><small>${esc(it.costNote)}</small></p>
      <h4>🎯 대상 고객</h4><p>${esc(it.targetDesc)} (${it.target.map(esc).join(", ")})</p>
      <h4>⚠️ 위험도: <span class="risk-${esc(it.risk)}">${esc(it.risk)}</span></h4><ul>${li(it.risks)}</ul>
      <h4>💵 수익 모델</h4><p>${esc(it.revenueModel)}</p>
      <h4>📋 필요 인허가·자격</h4><ul>${li(it.requirements)}</ul>
      <h4>🏛️ 참고할 지원사업</h4><ul>${li(it.supports)}</ul>
      <h4>🚀 시작 단계</h4><ol>${li(it.steps)}</ol>
      <p class="note" style="margin-top:14px">비용·인허가 정보는 참고용 추정치입니다. 실제 창업 전 관련 기관에 확인하세요.</p>`;
    $("#biz-dialog").showModal();
    $("#biz-dialog").scrollTop = 0;
  }

  $("#view-biz").addEventListener("click", (e) => {
    const fav = e.target.closest("[data-fav]");
    if (fav) {
      const id = fav.dataset.fav;
      state.favs.has(id) ? state.favs.delete(id) : state.favs.add(id);
      store.set("lv-favs", [...state.favs]);
      renderBiz();
      return;
    }
    const card = e.target.closest("[data-id]");
    if (card) openDetail(card.dataset.id);
  });
  ["#biz-cat", "#biz-budget", "#biz-target", "#biz-sort", "#biz-fav"].forEach((s) => $(s).addEventListener("change", renderBiz));
  $("#biz-dialog").addEventListener("click", (e) => { if (e.target.id === "biz-dialog") e.target.close(); });

  /* ---------------- 로딩 ---------------- */
  async function init() {
    const [news, curated, ai] = await Promise.allSettled([
      loadJSON("data/news.json"), loadJSON("data/business.json"), loadJSON("data/business_ai.json"),
    ]);

    if (news.status === "fulfilled") {
      state.newsMeta = news.value;
      state.news = news.value.items || [];
      if (news.value.updated) {
        const d = new Date(news.value.updated);
        $("#updated").textContent = "뉴스 업데이트: " + d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
      }
    } else {
      $("#news-empty").hidden = false;
      $("#news-empty").textContent = "뉴스 데이터를 불러오지 못했습니다. (로컬 파일로 열었다면 웹 서버로 실행하세요: python3 -m http.server)";
    }
    renderNews();
    renderSourceStatus();

    const aiItems = ai.status === "fulfilled" ? ai.value.items || [] : [];
    const curatedItems = curated.status === "fulfilled" ? curated.value.items || [] : [];
    state.biz = [...aiItems, ...curatedItems];
    if (curated.status === "fulfilled") $("#biz-note").textContent = curated.value.note || "";
    const cats = [...new Set(state.biz.map((it) => it.category))];
    $("#biz-cat").insertAdjacentHTML("beforeend", cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join(""));
    renderFeatured();
    renderBiz();
  }

  init();
})();
