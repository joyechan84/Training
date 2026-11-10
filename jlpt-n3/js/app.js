// JLPT N3 4주 완성 학습 앱
(function () {
  "use strict";

  // ---------- 상수 ----------
  const STUDY_DAYS = 24; // 새 내용 학습일
  const TOTAL_DAYS = 26; // + 복습 2일 (시험 전날까지)
  const PER_DAY = { k: 10, v: 20, g: 5 };
  const DAY_MS = 86400000;

  const DAY_THEMES = [
    "", // 0 미사용
    "숫자 · 사람 · 기본 문장", "수·시간 · て형①", "위치 · 장소 · ない형", "사람 · 가족 · た형",
    "자연 · 날씨 · 가능/의지", "학교 · 공부 · 수동/사역/조건", "기본 동사① · 추측/전문",
    "기본 동사② · 추측/확신", "い형용사 · 시간 표현①", "な형용사 · 시간 표현②",
    "음식·쇼핑 · 원인/이유", "교통·여행 · 목적/변화", "몸·건강 · 조건/가정", "일·회사 · 역접",
    "N3 동사① · 첨가/강조", "N3 동사② · 정도/비교", "자·타동사 · 경향/모습", "N3 명사① · 관점/기준①",
    "N3 명사② · 관점/기준②", "N3 형용사 · 변화/진행", "N3 부사① · 수수 표현", "부사②·의성어 · 당연/판단",
    "가타카나어 · こと 표현", "복합동사·표현 · 기타 빈출",
    "총복습 & 모의 퀴즈", "오답노트 총정리 & 컨디션 조절",
  ];
  const REVIEW_TASKS = {
    25: [["r1", "Day 1~12 혼합 퀴즈 30문제"], ["r2", "Day 13~24 혼합 퀴즈 30문제"], ["r3", "문법 빈칸 전체 30문제"], ["r4", "오답노트 1회독"]],
    26: [["r1", "오답노트 퀴즈 (0개 될 때까지)"], ["r2", "동사 활용표 다시 보기"], ["r3", "수험표·신분증·필기구 챙기기"], ["r4", "일찍 자기 😴"]],
  };

  // ---------- 저장소 (localStorage, 실패해도 동작) ----------
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem("jlpt3_" + key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem("jlpt3_" + key, JSON.stringify(value));
      } catch (e) { /* 무시 */ }
    },
  };

  function toISO(d) {
    const z = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
  }
  function parseISO(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function defaultExamDate() {
    // JLPT 12월 시험: 12월 첫째 일요일
    const now = new Date();
    let year = now.getFullYear();
    const firstSunday = (y) => {
      const d = new Date(y, 11, 1);
      d.setDate(1 + ((7 - d.getDay()) % 7));
      return d;
    };
    let exam = firstSunday(year);
    if (exam < new Date(now.getFullYear(), now.getMonth(), now.getDate())) exam = firstSunday(year + 1);
    return toISO(exam);
  }

  const settings = Object.assign(
    { start: toISO(new Date()), exam: defaultExamDate(), furigana: true },
    store.get("settings", {})
  );
  store.set("settings", settings);
  let tasks = store.get("tasks", {}); // { "3": { k:true, v:true, g:false, q:true } }
  let known = new Set(store.get("known", [])); // "k12", "v40", "g3"
  let wrong = store.get("wrong", {}); // { id: 틀린 횟수 }

  const saveTasks = () => store.set("tasks", tasks);
  const saveKnown = () => store.set("known", Array.from(known));
  const saveWrong = () => store.set("wrong", wrong);

  // ---------- 데이터 정리 ----------
  const KANJI = KANJI_DATA.map((r, i) => ({
    id: "k" + i, day: Math.floor(i / PER_DAY.k) + 1,
    char: r[0], on: r[1], kun: r[2], mean: r[3],
    ex: r[4].split("|").map((s) => { const p = s.split(":"); return { w: p[0], r: p[1], m: p[2] }; }),
  }));
  const VOCAB = VOCAB_DATA.map((r, i) => ({
    id: "v" + i, day: Math.floor(i / PER_DAY.v) + 1, word: r[0], read: r[1], mean: r[2],
  }));
  const GRAMMAR = GRAMMAR_DATA.map((r, i) => {
    const m = r[3].match(/^(.*)\[(.+?)\](.*)$/);
    return {
      id: "g" + i, day: Math.floor(i / PER_DAY.g) + 1,
      pat: r[0], mean: r[1], conn: r[2], ex: r[3], ko: r[4],
      before: m ? m[1] : r[3], blank: m ? m[2] : "", after: m ? m[3] : "",
    };
  });
  const BY_ID = {};
  KANJI.concat(VOCAB, GRAMMAR).forEach((x) => (BY_ID[x.id] = x));

  const HAS_KANJI = /[一-鿿々]/;

  // ---------- 유틸 ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  // "漢字{かんじ}" → <ruby>, "[...]" → 강조 표시
  function ruby(s, markBlank) {
    let h = esc(s).replace(/([一-鿿々〆ヶ0-9０-９]+)\{([^}]+)\}/g, "<ruby>$1<rt>$2</rt></ruby>");
    h = markBlank ? h.replace(/\[(.+?)\]/g, '<mark class="gp">$1</mark>') : h.replace(/[\[\]]/g, "");
    return h;
  }
  function plain(s) {
    return String(s).replace(/\{[^}]*\}/g, "").replace(/[\[\]]/g, "");
  }
  function speechText(s) {
    // 후리가나 읽기를 사용해 TTS 정확도를 높임
    return String(s).replace(/([一-鿿々〆ヶ0-9０-９]+)\{([^}]+)\}/g, "$2").replace(/[\[\]]/g, "");
  }
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function $(id) { return document.getElementById(id); }

  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 1800);
  }

  // ---------- 음성 (TTS) ----------
  const canSpeak = "speechSynthesis" in window;
  let jaVoice = null;
  function pickVoice() {
    if (!canSpeak) return;
    const vs = speechSynthesis.getVoices();
    jaVoice = vs.find((v) => /ja[-_]JP/i.test(v.lang)) || vs.find((v) => /^ja/i.test(v.lang)) || null;
  }
  if (canSpeak) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }
  function speak(text) {
    if (!canSpeak) { toast("이 브라우저는 음성을 지원하지 않아요"); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP";
      u.rate = 0.85;
      if (jaVoice) u.voice = jaVoice;
      speechSynthesis.speak(u);
    } catch (e) { /* 무시 */ }
  }
  function speakBtn(text) {
    if (!canSpeak) return "";
    return '<button type="button" class="icon-btn speak" data-say="' + esc(text) + '" title="발음 듣기">🔊</button>';
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-say]");
    if (b) { e.stopPropagation(); speak(b.getAttribute("data-say")); }
  });

  // ---------- 날짜 / Day 계산 ----------
  function todayDay() {
    const start = parseISO(settings.start);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const d = Math.floor((today - start) / DAY_MS) + 1;
    return Math.min(Math.max(d, 1), TOTAL_DAYS);
  }
  function dateOfDay(d) {
    const s = parseISO(settings.start);
    s.setDate(s.getDate() + d - 1);
    return s;
  }
  function levelOf(d) {
    if (d > STUDY_DAYS) return "복습";
    if (d <= 8) return "N5";
    if (d <= 14) return "N4";
    return "N3";
  }

  // ---------- 탭 / 라우팅 ----------
  const VIEWS = ["plan", "kanji", "vocab", "grammar", "quiz", "wrong"];
  function show(view) {
    if (!VIEWS.includes(view)) view = "plan";
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    if (view === "plan") renderPlan();
    if (view === "kanji") renderKanji();
    if (view === "vocab") renderVocab();
    if (view === "grammar") renderGrammar();
    if (view === "wrong") renderWrong();
    if (view === "quiz") updateQuizDayRow();
    window.scrollTo(0, 0);
  }
  function go(view) {
    if (location.hash === "#" + view) show(view);
    else location.hash = view;
  }
  $("tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab-btn");
    if (b) go(b.dataset.view);
  });
  window.addEventListener("hashchange", () => show(location.hash.slice(1)));

  // ---------- 후리가나 ----------
  function applyFurigana() {
    document.body.classList.toggle("no-furi", !settings.furigana);
    $("furigana-btn").textContent = "ふりがな " + (settings.furigana ? "ON" : "OFF");
    $("furigana-btn").classList.toggle("off", !settings.furigana);
  }
  $("furigana-btn").addEventListener("click", () => {
    settings.furigana = !settings.furigana;
    store.set("settings", settings);
    applyFurigana();
  });

  // ---------- Day 선택 ----------
  function fillDaySelect(sel, withAll) {
    let h = withAll ? '<option value="0">전체 보기</option>' : "";
    for (let d = 1; d <= STUDY_DAYS; d++) {
      h += '<option value="' + d + '">Day ' + d + " · " + levelOf(d) + " · " + DAY_THEMES[d] + "</option>";
    }
    sel.innerHTML = h;
  }
  ["kanji-day", "vocab-day", "grammar-day"].forEach((id) => fillDaySelect($(id), true));
  fillDaySelect($("quiz-day"), false);
  function setDefaultDays() {
    const t = todayDay();
    const d = t <= STUDY_DAYS ? t : 0;
    ["kanji-day", "vocab-day", "grammar-day"].forEach((id) => ($(id).value = String(d)));
    $("quiz-day").value = String(Math.min(t, STUDY_DAYS));
  }

  // ---------- 과제 완료 체크 ----------
  function setTask(day, key, val) {
    if (!tasks[day]) tasks[day] = {};
    tasks[day][key] = val;
    saveTasks();
  }
  function taskKeys(d) {
    return d > STUDY_DAYS ? REVIEW_TASKS[d].map((t) => t[0]) : ["k", "v", "g", "q"];
  }
  function dayDone(d) {
    const t = tasks[d] || {};
    return taskKeys(d).filter((k) => t[k]).length;
  }

  // ---------- 계획 화면 ----------
  function renderPlan() {
    $("start-date").value = settings.start;
    $("exam-date").value = settings.exam;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dd = Math.round((parseISO(settings.exam) - today) / DAY_MS);
    $("dday").textContent = dd > 0 ? "D-" + dd : dd === 0 ? "D-DAY 🔥" : "시험 종료";
    const t = todayDay();
    $("today-label").textContent = "오늘은 Day " + t + " · " + DAY_THEMES[t];

    const knownK = KANJI.filter((x) => known.has(x.id)).length;
    const knownV = VOCAB.filter((x) => known.has(x.id)).length;
    const knownG = GRAMMAR.filter((x) => known.has(x.id)).length;
    $("hero-stats").innerHTML =
      stat("한자", knownK, KANJI.length) + stat("단어", knownV, VOCAB.length) +
      stat("문법", knownG, GRAMMAR.length) +
      '<div class="stat"><div class="stat-num">' + Object.keys(wrong).length + '</div><div class="stat-label">오답</div></div>';

    let total = 0, done = 0;
    for (let d = 1; d <= TOTAL_DAYS; d++) { total += taskKeys(d).length; done += dayDone(d); }
    const pct = Math.round((done / total) * 100);
    $("overall-pct").textContent = pct + "% (" + done + "/" + total + ")";
    $("overall-bar").style.width = pct + "%";

    const weeks = [[1, 7, "1주차 · 기초 다지기 (N5)"], [8, 14, "2주차 · N4 → N3 진입"], [15, 21, "3주차 · N3 핵심"], [22, 26, "4주차 · 마무리 & 복습"]];
    let h = "";
    weeks.forEach(([a, b, title]) => {
      h += '<div class="week"><h3>' + title + '</h3><div class="day-grid">';
      for (let d = a; d <= b; d++) h += dayCard(d, d === t);
      h += "</div></div>";
    });
    $("week-list").innerHTML = h;
    const cur = $("week-list").querySelector(".day-card.today");
    if (cur && cur.scrollIntoView && !renderPlan.scrolled) {
      renderPlan.scrolled = true;
      setTimeout(() => cur.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
    }
  }
  function stat(label, n, total) {
    return '<div class="stat"><div class="stat-num">' + n + '<small>/' + total + '</small></div><div class="stat-label">외운 ' + label + "</div></div>";
  }
  function dayCard(d, isToday) {
    const t = tasks[d] || {};
    const date = dateOfDay(d);
    const dateStr = date.getMonth() + 1 + "/" + date.getDate() + " (" + "일월화수목금토"[date.getDay()] + ")";
    const keys = taskKeys(d);
    const doneN = dayDone(d);
    let items;
    if (d > STUDY_DAYS) {
      items = REVIEW_TASKS[d].map(([k, label]) => taskItem(d, k, label, t[k]));
    } else {
      items = [
        taskItem(d, "k", "한자 " + PER_DAY.k + "자", t.k, "kanji"),
        taskItem(d, "v", "단어 " + PER_DAY.v + "개", t.v, "vocab"),
        taskItem(d, "g", "문법 " + PER_DAY.g + "개", t.g, "grammar"),
        taskItem(d, "q", "복습 퀴즈", t.q, "quiz"),
      ];
    }
    const cls = "day-card" + (isToday ? " today" : "") + (doneN === keys.length ? " done" : "");
    return '<div class="' + cls + '"><div class="day-head"><span class="day-num">Day ' + d +
      '</span><span class="lv lv-' + levelOf(d) + '">' + levelOf(d) + '</span><span class="day-date">' + dateStr +
      "</span></div><div class=\"day-theme\">" + esc(DAY_THEMES[d]) + '</div><ul class="task-list">' + items.join("") +
      '</ul><div class="day-foot">' + doneN + "/" + keys.length + (isToday ? " · 오늘" : "") + "</div></div>";
  }
  function taskItem(d, key, label, checked, view) {
    const goBtn = view ? '<button type="button" class="go-btn" data-go="' + view + '" data-day="' + d + '">학습 ›</button>' : "";
    return '<li><label><input type="checkbox" data-task="' + key + '" data-day="' + d + '"' + (checked ? " checked" : "") +
      " /> " + esc(label) + "</label>" + goBtn + "</li>";
  }
  $("week-list").addEventListener("change", (e) => {
    const cb = e.target.closest("[data-task]");
    if (!cb) return;
    setTask(cb.dataset.day, cb.dataset.task, cb.checked);
    renderPlan();
  });
  $("week-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-go]");
    if (!b) return;
    const d = b.dataset.day;
    const v = b.dataset.go;
    if (v === "quiz") {
      $("quiz-day").value = d;
      setSeg("quiz-range", "upto");
      setSeg("quiz-type", "mix");
    } else {
      $(v + "-day").value = d;
      $(v + "-search").value = "";
    }
    go(v);
  });
  $("start-date").addEventListener("change", (e) => {
    if (!e.target.value) return;
    settings.start = e.target.value;
    store.set("settings", settings);
    setDefaultDays();
    renderPlan();
  });
  $("exam-date").addEventListener("change", (e) => {
    if (!e.target.value) return;
    settings.exam = e.target.value;
    store.set("settings", settings);
    renderPlan();
  });

  // ---------- 공통: 리스트 필터 ----------
  function filterItems(list, prefix, fields) {
    const day = Number($(prefix + "-day").value);
    const q = $(prefix + "-search").value.trim().toLowerCase();
    const hideKnown = $(prefix + "-hide-known").checked;
    return list.filter((x) => {
      if (day && x.day !== day) return false;
      if (hideKnown && known.has(x.id)) return false;
      if (q) return fields(x).some((f) => plain(f).toLowerCase().includes(q));
      return true;
    });
  }
  function knownBtn(id) {
    const on = known.has(id);
    return '<button type="button" class="icon-btn known' + (on ? " on" : "") + '" data-known="' + id + '" title="외웠어요">' + (on ? "✓ 외움" : "외움") + "</button>";
  }
  function doneFooter(prefix, key, label) {
    const day = Number($(prefix + "-day").value);
    if (!day) return "";
    const done = tasks[day] && tasks[day][key];
    return '<div class="list-foot"><button type="button" class="primary-btn' + (done ? " done" : "") + '" data-daydone="' + key +
      '" data-day="' + day + '">' + (done ? "✓ Day " + day + " " + label + " 완료" : "Day " + day + " " + label + " 학습 완료 체크") + "</button>" +
      (day < STUDY_DAYS ? '<button type="button" class="ghost-btn" data-nextday="' + prefix + '">다음 Day ›</button>' : "") + "</div>";
  }
  document.addEventListener("click", (e) => {
    const kb = e.target.closest("[data-known]");
    if (kb) {
      const id = kb.dataset.known;
      if (known.has(id)) known.delete(id); else known.add(id);
      saveKnown();
      const on = known.has(id);
      kb.classList.toggle("on", on);
      kb.textContent = on ? "✓ 외움" : "외움";
      return;
    }
    const db = e.target.closest("[data-daydone]");
    if (db) {
      const d = db.dataset.day, k = db.dataset.daydone;
      const now = !(tasks[d] && tasks[d][k]);
      setTask(d, k, now);
      if (now) toast("Day " + d + " 완료! 잘했어요 👏");
      rerenderCurrent();
      return;
    }
    const nb = e.target.closest("[data-nextday]");
    if (nb) {
      const p = nb.dataset.nextday;
      $(p + "-day").value = String(Number($(p + "-day").value) + 1);
      rerenderCurrent();
      window.scrollTo(0, 0);
      return;
    }
    const rv = e.target.closest(".reveal");
    if (rv) rv.classList.toggle("shown");
  });
  function rerenderCurrent() {
    show(location.hash.slice(1) || "plan");
  }

  // ---------- 한자 ----------
  function renderKanji() {
    const items = filterItems(KANJI, "kanji", (x) => [x.char, x.on, x.kun, x.mean].concat(x.ex.map((e) => e.w + e.r + e.m)));
    const hide = $("kanji-hide").checked;
    $("kanji-count").textContent = items.length + "자";
    $("kanji-list").innerHTML = items.map((k) =>
      '<article class="kcard">' +
      '<div class="kcard-top"><div class="kchar" lang="ja">' + esc(k.char) + "</div>" +
      '<div class="kinfo"><div class="kmean ' + (hide ? "reveal" : "") + '"><span>' + esc(k.mean) + "</span></div>" +
      '<div class="kread ' + (hide ? "reveal" : "") + '"><span><b>음</b> <span lang="ja">' + esc(k.on) + "</span><br /><b>훈</b> <span lang=\"ja\">" + esc(k.kun) + "</span></span></div></div></div>" +
      '<ul class="kex">' + k.ex.map((e) =>
        '<li><span class="w" lang="ja">' + rubyWord(e.w, e.r) + '</span><span class="m ' + (hide ? "reveal" : "") + '"><span>' + esc(e.m) + "</span></span>" + speakBtn(e.r) + "</li>").join("") +
      "</ul>" +
      '<div class="card-actions"><span class="day-tag">Day ' + k.day + "</span>" + knownBtn(k.id) + "</div></article>"
    ).join("") + doneFooter("kanji", "k", "한자");
  }
  // 단어 전체에 읽기를 붙임 (예: 食べる / たべる)
  function rubyWord(w, r) {
    if (!r || !HAS_KANJI.test(w)) return esc(w);
    return "<ruby>" + esc(w) + "<rt>" + esc(r) + "</rt></ruby>";
  }

  // ---------- 단어 ----------
  function renderVocab() {
    const items = filterItems(VOCAB, "vocab", (x) => [x.word, x.read, x.mean]);
    const hide = $("vocab-hide").checked;
    const hideR = $("vocab-hide-reading").checked;
    $("vocab-count").textContent = items.length + "개";
    $("vocab-list").innerHTML = items.map((v) =>
      '<article class="vrow"><div class="vmain"><div class="vword" lang="ja">' + esc(v.word) + "</div>" +
      (v.read ? '<div class="vread ' + (hideR ? "reveal" : "") + '" lang="ja"><span>' + esc(v.read) + "</span></div>" : "") +
      '</div><div class="vmean ' + (hide ? "reveal" : "") + '"><span>' + esc(v.mean) + "</span></div>" +
      '<div class="vact">' + speakBtn(v.read ? v.read.split("・")[0] : v.word) + knownBtn(v.id) + "</div></article>"
    ).join("") + doneFooter("vocab", "v", "단어");
  }

  // ---------- 문법 ----------
  function renderGrammar() {
    const items = filterItems(GRAMMAR, "grammar", (x) => [x.pat, x.mean, x.conn, x.ex, x.ko]);
    const hide = $("grammar-hide").checked;
    $("grammar-count").textContent = items.length + "개";
    $("grammar-list").innerHTML = items.map((g) =>
      '<article class="grow"><div class="ghead"><span class="gpat" lang="ja">' + esc(g.pat) + '</span><span class="day-tag">Day ' + g.day + "</span></div>" +
      '<div class="gmean">' + esc(g.mean) + "</div>" +
      '<div class="gconn">접속: <span lang="ja">' + esc(g.conn) + "</span></div>" +
      '<div class="gex" lang="ja">' + ruby(g.ex, true) + speakBtn(speechText(g.ex)) + "</div>" +
      '<div class="gko ' + (hide ? "reveal" : "") + '"><span>' + esc(g.ko) + "</span></div>" +
      '<div class="card-actions">' + knownBtn(g.id) + "</div></article>"
    ).join("") + doneFooter("grammar", "g", "문법");
  }
  function renderVerbTable() {
    const T = VERB_TABLE;
    let h = "<h4>동사 3그룹</h4><table class=\"mini-table\"><tr><th>그룹</th><th>구별법</th><th>예</th></tr>" +
      T.groups.map((r) => "<tr><td>" + esc(r[0]) + "</td><td>" + esc(r[1]) + '</td><td lang="ja">' + esc(r[2]) + "</td></tr>").join("") + "</table>";
    h += '<h4>활용표</h4><div class="table-scroll"><table class="mini-table"><tr><th>활용</th><th>書く(1)</th><th>飲む(1)</th><th>食べる(2)</th><th>する(3)</th><th>来る(3)</th></tr>' +
      T.forms.map((r) => "<tr><td>" + esc(r[0]) + "</td>" + r.slice(1).map((c) => '<td lang="ja">' + esc(c) + "</td>").join("") + "</tr>").join("") + "</table></div>";
    h += "<h4>1그룹 て형 만드는 법 (가장 중요!)</h4><table class=\"mini-table\">" +
      T.te.map((r) => '<tr><td lang="ja">' + esc(r[0]) + '</td><td lang="ja">' + esc(r[1]) + "</td></tr>").join("") + "</table>" +
      "<p>た형은 て형의 て→た, で→だ 로 바꾸면 끝! (書いて→書いた, 飲んで→飲んだ)</p>";
    $("verb-table").innerHTML = h;
  }

  ["kanji", "vocab", "grammar"].forEach((p) => {
    const r = { kanji: renderKanji, vocab: renderVocab, grammar: renderGrammar }[p];
    $(p + "-day").addEventListener("change", r);
    $(p + "-search").addEventListener("input", r);
    $(p + "-hide").addEventListener("change", r);
    $(p + "-hide-known").addEventListener("change", r);
  });
  $("vocab-hide-reading").addEventListener("change", renderVocab);

  // ---------- 세그먼트 버튼 ----------
  function setSeg(id, v) {
    $(id).querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.v === v));
  }
  function getSeg(id) {
    const b = $(id).querySelector("button.active");
    return b ? b.dataset.v : null;
  }
  ["quiz-type", "quiz-range", "quiz-count", "wrong-filter"].forEach((id) => {
    $(id).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      setSeg(id, b.dataset.v);
      if (id === "wrong-filter") renderWrong();
      if (id === "quiz-range") updateQuizDayRow();
    });
  });
  function updateQuizDayRow() {
    const r = getSeg("quiz-range");
    document.querySelector(".range-day").style.display = r === "today" || r === "upto" ? "" : "none";
  }

  // ---------- 퀴즈 ----------
  let quiz = null;

  function poolFor(range, day) {
    const inRange = (x) => range === "all" || (range === "today" ? x.day === day : x.day <= day);
    if (range === "wrong") {
      const ids = Object.keys(wrong).filter((id) => BY_ID[id]);
      return { k: ids.filter((i) => i[0] === "k").map((i) => BY_ID[i]), v: ids.filter((i) => i[0] === "v").map((i) => BY_ID[i]), g: ids.filter((i) => i[0] === "g").map((i) => BY_ID[i]) };
    }
    return { k: KANJI.filter(inRange), v: VOCAB.filter(inRange), g: GRAMMAR.filter(inRange) };
  }

  function vocabType(v, preferred) {
    const canRead = v.read && HAS_KANJI.test(v.word);
    if (preferred === "reading") return canRead ? "reading" : "meaning";
    if (preferred === "meaning" || preferred === "reverse") return preferred;
    const opts = canRead ? ["reading", "meaning", "reverse"] : ["meaning", "reverse"];
    return opts[Math.floor(Math.random() * opts.length)];
  }

  function buildQuestions(type, range, day, count) {
    const pool = poolFor(range, day);
    let entries = [];
    if (type === "kanji") entries = pool.k.map((x) => ({ item: x, t: "kanji" }));
    else if (type === "reading") entries = pool.v.filter((v) => v.read && HAS_KANJI.test(v.word)).map((x) => ({ item: x, t: "reading" }));
    else if (type === "meaning" || type === "reverse") entries = pool.v.map((x) => ({ item: x, t: type }));
    else if (type === "grammar") entries = pool.g.map((x) => ({ item: x, t: "grammar" }));
    else {
      entries = pool.k.map((x) => ({ item: x, t: "kanji" }))
        .concat(pool.v.map((x) => ({ item: x, t: vocabType(x) })))
        .concat(pool.g.map((x) => ({ item: x, t: "grammar" })));
    }
    return shuffle(entries).slice(0, count).map(makeQuestion);
  }

  // 오답 선택지 3개 고르기 (정답과 같은 텍스트는 제외)
  function distractors(all, self, key, n, prefer) {
    const ans = plain(key(self));
    const seen = new Set([ans]);
    let cands = shuffle(all.filter((x) => x !== self));
    if (prefer) cands = cands.sort((a, b) => prefer(b) - prefer(a));
    const out = [];
    for (const c of cands) {
      const v = key(c);
      const p = plain(v);
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(v);
      if (out.length >= n) break;
    }
    return out;
  }

  function makeQuestion({ item, t }) {
    let prompt, answer, opts, explain, say, optLang = "";
    if (t === "kanji") {
      prompt = '<div class="q-big" lang="ja">' + esc(item.char) + '</div><div class="q-ask">이 한자의 뜻(훈음)은?</div>';
      answer = item.mean;
      opts = distractors(KANJI, item, (x) => x.mean, 3);
      explain = '<b lang="ja">' + esc(item.char) + "</b> " + esc(item.mean) + '<br />음: <span lang="ja">' + esc(item.on) + "</span> / 훈: <span lang=\"ja\">" + esc(item.kun) + "</span><br />" +
        item.ex.map((e) => '<span lang="ja">' + esc(e.w) + "(" + esc(e.r) + ")</span> " + esc(e.m)).join(" · ");
      say = item.ex[0].r;
    } else if (t === "reading") {
      prompt = '<div class="q-big" lang="ja">' + esc(item.word) + '</div><div class="q-ask">올바른 읽기는?</div>';
      answer = item.read;
      const len = item.read.length;
      opts = distractors(VOCAB.filter((v) => v.read), item, (x) => x.read, 3, (x) => (Math.abs(x.read.length - len) <= 1 ? 1 : 0) + (x.read[0] === item.read[0] ? 1 : 0));
      optLang = "ja";
      explain = '<span lang="ja">' + rubyWord(item.word, item.read) + "</span> = " + esc(item.mean);
      say = item.read.split("・")[0];
    } else if (t === "meaning") {
      prompt = '<div class="q-big" lang="ja">' + esc(item.word) + '</div><div class="q-ask">뜻은?</div>';
      answer = item.mean;
      opts = distractors(VOCAB, item, (x) => x.mean, 3);
      explain = '<span lang="ja">' + esc(item.word) + (item.read ? " (" + esc(item.read) + ")" : "") + "</span> = " + esc(item.mean);
      say = item.read ? item.read.split("・")[0] : item.word;
    } else if (t === "reverse") {
      prompt = '<div class="q-mid">' + esc(item.mean) + '</div><div class="q-ask">이 뜻의 일본어 단어는?</div>';
      answer = item.word;
      opts = distractors(VOCAB, item, (x) => x.word, 3);
      optLang = "ja";
      explain = '<span lang="ja">' + esc(item.word) + (item.read ? " (" + esc(item.read) + ")" : "") + "</span> = " + esc(item.mean);
      say = item.read ? item.read.split("・")[0] : item.word;
    } else {
      prompt = '<div class="q-sent" lang="ja">' + ruby(item.before) + '<span class="q-blank">（　　）</span>' + ruby(item.after) + "</div>" +
        '<div class="q-ask">빈칸에 들어갈 알맞은 표현은?</div><div class="q-hint reveal"><span>💬 ' + esc(item.ko) + "</span></div>";
      answer = item.blank;
      opts = distractors(GRAMMAR.filter((g) => g.blank), item, (x) => x.blank, 3);
      optLang = "ja";
      explain = '<b lang="ja">' + esc(item.pat) + "</b> — " + esc(item.mean) + '<br /><span lang="ja">' + ruby(item.ex, true) + "</span><br />" + esc(item.ko);
      say = speechText(item.ex);
    }
    const options = shuffle([answer].concat(opts));
    return { item, t, prompt, answer, options, explain, say, optLang };
  }

  const TYPE_LABEL = { kanji: "한자", reading: "읽기", meaning: "뜻", reverse: "단어", grammar: "문법" };

  function startQuiz(opts) {
    const type = opts.type || getSeg("quiz-type");
    const range = opts.range || getSeg("quiz-range");
    const count = Number(opts.count || getSeg("quiz-count"));
    const day = Number(opts.day || $("quiz-day").value);
    const qs = opts.questions || buildQuestions(type, range, day, count);
    if (!qs.length) {
      toast(range === "wrong" ? "오답노트가 비어 있어요 🎉" : "이 범위에는 문제가 없어요");
      return;
    }
    quiz = { qs, i: 0, score: 0, wrongList: [], range, day, type, count, answered: false };
    $("quiz-setup").hidden = true;
    $("quiz-area").hidden = false;
    renderQuestion();
  }

  function renderQuestion() {
    const q = quiz.qs[quiz.i];
    quiz.answered = false;
    const pct = Math.round((quiz.i / quiz.qs.length) * 100);
    $("quiz-area").innerHTML =
      '<div class="quiz-top"><span>' + (quiz.i + 1) + " / " + quiz.qs.length + '</span><span class="q-type">' + TYPE_LABEL[q.t] +
      '</span><span>점수 ' + quiz.score + '</span><button type="button" class="ghost-btn small" id="quiz-quit">그만하기</button></div>' +
      '<div class="progress"><div class="progress-bar" style="width:' + pct + '%"></div></div>' +
      '<div class="q-card">' + q.prompt + "</div>" +
      '<div class="q-options">' + q.options.map((o, idx) =>
        '<button type="button" class="q-opt" data-idx="' + idx + '"' + (q.optLang ? ' lang="ja"' : "") + "><span class=\"q-n\">" + (idx + 1) + "</span>" +
        (q.t === "grammar" ? ruby(o) : esc(o)) + "</button>").join("") + "</div>" +
      '<div id="q-feedback"></div>';
  }

  function answer(idx) {
    if (!quiz || quiz.answered) return;
    quiz.answered = true;
    const q = quiz.qs[quiz.i];
    const chosen = q.options[idx];
    const ok = chosen === q.answer;
    document.querySelectorAll(".q-opt").forEach((b, i) => {
      b.disabled = true;
      if (q.options[i] === q.answer) b.classList.add("correct");
      else if (i === idx) b.classList.add("wrong");
    });
    const id = q.item.id;
    if (ok) {
      quiz.score++;
      if (quiz.range === "wrong" && wrong[id]) { delete wrong[id]; saveWrong(); }
    } else {
      wrong[id] = (wrong[id] || 0) + 1;
      saveWrong();
      quiz.wrongList.push(q);
    }
    const hint = document.querySelector(".q-hint");
    if (hint) hint.classList.add("shown");
    $("q-feedback").innerHTML =
      '<div class="feedback ' + (ok ? "ok" : "ng") + '"><div class="fb-title">' + (ok ? "⭕ 정답!" : "❌ 오답 — 오답노트에 저장했어요") + speakBtn(q.say) + "</div>" +
      '<div class="fb-body">' + q.explain + "</div></div>" +
      '<button type="button" class="primary-btn" id="q-next">' + (quiz.i + 1 < quiz.qs.length ? "다음 문제 ›" : "결과 보기") + "</button>";
    $("q-next").focus({ preventScroll: true });
    $("q-feedback").scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function next() {
    quiz.i++;
    if (quiz.i >= quiz.qs.length) return renderResult();
    renderQuestion();
    window.scrollTo(0, 0);
  }

  function renderResult() {
    const n = quiz.qs.length;
    const pct = Math.round((quiz.score / n) * 100);
    if ((quiz.range === "today" || quiz.range === "upto") && pct >= 60) setTask(quiz.day, "q", true);
    const msg = pct === 100 ? "완벽해요! 🎉" : pct >= 80 ? "아주 좋아요! 👍" : pct >= 60 ? "합격권이에요. 오답만 다시 보면 OK!" : "괜찮아요, 반복이 답이에요 💪";
    $("quiz-area").innerHTML =
      '<div class="result"><div class="result-score">' + quiz.score + " / " + n + '</div><div class="result-pct">' + pct + "%</div><p>" + msg + "</p>" +
      ((quiz.range === "today" || quiz.range === "upto") ? (pct >= 60 ? '<p class="hint">✓ Day ' + quiz.day + " 복습 퀴즈 완료로 체크했어요</p>" : '<p class="hint">60% 이상이면 오늘 퀴즈 완료로 체크돼요</p>') : "") +
      "</div>" +
      (quiz.wrongList.length ? '<h3 class="sec-title">틀린 문제</h3><div class="row-list">' + quiz.wrongList.map((q) => '<div class="wrow"><div class="fb-body">' + q.explain + "</div></div>").join("") + "</div>" : "") +
      '<div class="result-actions">' +
      (quiz.wrongList.length ? '<button type="button" class="primary-btn" id="retry-wrong">틀린 문제만 다시</button>' : "") +
      '<button type="button" class="ghost-btn" id="retry-same">같은 조건으로 새 퀴즈</button>' +
      '<button type="button" class="ghost-btn" id="quiz-back">설정으로</button></div>';
  }

  function quitQuiz() {
    quiz = null;
    $("quiz-area").hidden = true;
    $("quiz-area").innerHTML = "";
    $("quiz-setup").hidden = false;
  }

  $("quiz-start").addEventListener("click", () => startQuiz({}));
  $("quiz-area").addEventListener("click", (e) => {
    const opt = e.target.closest(".q-opt");
    if (opt) return answer(Number(opt.dataset.idx));
    const id = e.target.id;
    if (id === "q-next") return next();
    if (id === "quiz-quit" || id === "quiz-back") return quitQuiz();
    if (id === "retry-same") return startQuiz({ type: quiz.type, range: quiz.range, day: quiz.day, count: quiz.count });
    if (id === "retry-wrong") {
      const qs = shuffle(quiz.wrongList.map((q) => makeQuestion({ item: q.item, t: q.t })));
      return startQuiz({ questions: qs, range: "wrong", type: quiz.type, count: qs.length });
    }
  });
  document.addEventListener("keydown", (e) => {
    if (!quiz || !document.getElementById("view-quiz").classList.contains("active")) return;
    if (e.target.matches("input, select, textarea")) return;
    if (!quiz.answered && /^[1-4]$/.test(e.key)) answer(Number(e.key) - 1);
    else if (quiz.answered && (e.key === "Enter" || e.key === " ") && $("q-next")) { e.preventDefault(); next(); }
  });

  // ---------- 오답노트 ----------
  function renderWrong() {
    const f = getSeg("wrong-filter");
    const ids = Object.keys(wrong).filter((id) => BY_ID[id] && (f === "all" || id[0] === f))
      .sort((a, b) => wrong[b] - wrong[a]);
    $("wrong-count").textContent = ids.length + "개";
    $("wrong-empty").hidden = ids.length > 0;
    $("wrong-list").innerHTML = ids.map((id) => {
      const x = BY_ID[id];
      let body;
      if (id[0] === "k") body = '<span class="wtag">한자</span><b class="wbig" lang="ja">' + esc(x.char) + "</b> " + esc(x.mean) + ' <small lang="ja">' + esc(x.on) + " / " + esc(x.kun) + "</small>";
      else if (id[0] === "v") body = '<span class="wtag">단어</span><b class="wbig" lang="ja">' + rubyWord(x.word, x.read) + "</b> " + esc(x.mean);
      else body = '<span class="wtag">문법</span><b lang="ja">' + esc(x.pat) + "</b> " + esc(x.mean) + '<div class="gex" lang="ja">' + ruby(x.ex, true) + "</div><div class=\"gko\">" + esc(x.ko) + "</div>";
      return '<div class="wrow"><div class="wbody">' + body + '</div><div class="wact"><span class="wcnt">×' + wrong[id] + "</span>" +
        speakBtn(id[0] === "k" ? x.ex[0].r : id[0] === "v" ? (x.read ? x.read.split("・")[0] : x.word) : speechText(x.ex)) +
        '<button type="button" class="icon-btn" data-unwrong="' + id + '" title="오답노트에서 빼기">✕</button></div></div>';
    }).join("");
  }
  $("wrong-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-unwrong]");
    if (!b) return;
    delete wrong[b.dataset.unwrong];
    saveWrong();
    renderWrong();
  });
  $("wrong-quiz-btn").addEventListener("click", () => {
    setSeg("quiz-range", "wrong");
    setSeg("quiz-type", "mix");
    go("quiz");
    startQuiz({ type: "mix", range: "wrong", count: 30 });
  });
  let clearArmed = false;
  $("wrong-clear-btn").addEventListener("click", (e) => {
    if (!Object.keys(wrong).length) return;
    if (!clearArmed) {
      clearArmed = true;
      e.target.textContent = "한 번 더 누르면 전부 삭제";
      setTimeout(() => { clearArmed = false; e.target.textContent = "전체 비우기"; }, 3000);
      return;
    }
    clearArmed = false;
    e.target.textContent = "전체 비우기";
    wrong = {};
    saveWrong();
    renderWrong();
    toast("오답노트를 비웠어요");
  });

  // ---------- 시작 ----------
  applyFurigana();
  renderVerbTable();
  setDefaultDays();
  show(location.hash.slice(1) || "plan");
})();
