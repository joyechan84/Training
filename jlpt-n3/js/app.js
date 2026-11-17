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

  // 화면 코드가 쓰는 상태 (아래 rec 에서 만들어짐)
  const settings = { start: toISO(new Date()), exam: defaultExamDate(), furigana: true };
  let tasks = {}; // { "3": { k:true, v:true, g:false, q:true } }
  const known = new Set(); // "k12", "v40", "g3"
  let wrong = {}; // { id: 틀린 횟수 }
  let listened = {}; // 청해 { "L3": 1(정답) | 2(오답) }

  // ---------- 진도 기록 (항목마다 [값, 수정시각]) ----------
  // 기기 여러 대에서 따로 학습해도, 항목별로 더 나중에 바꾼 쪽을 남겨 합친다.
  function freshRec() {
    return { v: 2, settings: {}, tasks: {}, known: {}, wrong: {}, listen: {} };
  }
  let rec = Object.assign(freshRec(), store.get("rec", null) || {});
  if (!store.get("rec", null)) {
    // 예전 버전(항목별 키)에 저장된 기록을 옮겨 온다
    const t0 = 1;
    const os = store.get("settings", null);
    if (os) Object.keys(os).forEach((k) => (rec.settings[k] = [os[k], t0]));
    const ot = store.get("tasks", {});
    Object.keys(ot).forEach((d) => Object.keys(ot[d] || {}).forEach((k) => (rec.tasks[d + "." + k] = [!!ot[d][k], t0])));
    store.get("known", []).forEach((id) => (rec.known[id] = [1, t0]));
    const ow = store.get("wrong", {});
    Object.keys(ow).forEach((id) => (rec.wrong[id] = [ow[id], t0]));
  }
  if (!rec.settings.start) rec.settings.start = [settings.start, 1];

  function buildFromRec() {
    Object.keys(rec.settings).forEach((k) => (settings[k] = rec.settings[k][0]));
    tasks = {};
    Object.keys(rec.tasks).forEach((key) => {
      if (!rec.tasks[key][0]) return;
      const [d, k] = key.split(".");
      (tasks[d] = tasks[d] || {})[k] = true;
    });
    known.clear();
    Object.keys(rec.known).forEach((id) => rec.known[id][0] && known.add(id));
    wrong = {};
    Object.keys(rec.wrong).forEach((id) => rec.wrong[id][0] > 0 && (wrong[id] = rec.wrong[id][0]));
    listened = {};
    Object.keys(rec.listen || {}).forEach((id) => rec.listen[id][0] && (listened[id] = rec.listen[id][0]));
  }
  // 현재 화면 상태와 기록을 비교해 바뀐 항목만 시각을 찍는다
  function diffInto(section, current, empty) {
    const now = Date.now();
    let changed = false;
    const sec = rec[section];
    Object.keys(current).forEach((k) => {
      if (!sec[k] || sec[k][0] !== current[k]) { sec[k] = [current[k], now]; changed = true; }
    });
    Object.keys(sec).forEach((k) => {
      if (!(k in current) && sec[k][0] !== empty) { sec[k] = [empty, now]; changed = true; }
    });
    return changed;
  }
  function persist(changed) {
    if (!changed) return;
    store.set("rec", rec);
    scheduleRemote();
  }
  function saveSettings() {
    persist(diffInto("settings", { start: settings.start, exam: settings.exam, furigana: settings.furigana, rate: settings.rate || 1 }, null));
  }
  function saveTasks() {
    const flat = {};
    Object.keys(tasks).forEach((d) => Object.keys(tasks[d]).forEach((k) => tasks[d][k] && (flat[d + "." + k] = true)));
    persist(diffInto("tasks", flat, false));
  }
  function saveKnown() {
    const cur = {};
    known.forEach((id) => (cur[id] = 1));
    persist(diffInto("known", cur, 0));
  }
  function saveListen() {
    persist(diffInto("listen", Object.assign({}, listened), 0));
  }
  function saveWrong() {
    persist(diffInto("wrong", Object.assign({}, wrong), 0));
  }
  function mergeRec(a, b) {
    const out = freshRec();
    ["settings", "tasks", "known", "wrong", "listen"].forEach((s) => {
      const A = (a && a[s]) || {}, B = (b && b[s]) || {};
      new Set(Object.keys(A).concat(Object.keys(B))).forEach((k) => {
        const x = A[k], y = B[k];
        out[s][k] = !x ? y : !y ? x : y[1] > x[1] ? y : x;
      });
    });
    return out;
  }
  buildFromRec();
  store.set("rec", rec);

  // ---------- claude.ai 계정 동기화 (로그인 상태로 열면 어느 기기에서든 이어짐) ----------
  const sync = { doc: null, state: "local", writing: false, again: false, timer: null };
  function scheduleRemote() {
    if (!sync.doc) return;
    clearTimeout(sync.timer);
    sync.timer = setTimeout(writeRemote, 700);
  }
  async function writeRemote() {
    if (!sync.doc) return;
    if (sync.writing) { sync.again = true; return; }
    sync.writing = true;
    try {
      await sync.doc.set(JSON.parse(JSON.stringify(rec)));
      setSyncState("synced");
    } catch (e) {
      setSyncState(e && e.code === "quota_exceeded" ? "full" : "error");
    }
    sync.writing = false;
    if (sync.again) { sync.again = false; writeRemote(); }
  }
  function syncNoteText() {
    return {
      local: "💾 진도가 이 기기 브라우저에만 저장돼요. claude.ai에 로그인한 상태로 링크를 열면 계정에 저장되어 어느 기기에서든 이어져요.",
      connecting: "☁ 계정 기록을 불러오는 중…",
      synced: "☁ claude.ai 계정에 저장됨 · 같은 계정으로 링크를 열면 폰·PC 어디서든 이어져요.",
      error: "⚠ 계정 저장에 실패했어요. 이 기기에는 저장되어 있고, 다음 기록 때 다시 시도해요.",
      full: "⚠ 계정 저장 공간이 가득 찼어요. 이 기기에는 저장되어 있어요.",
    }[sync.state];
  }
  function setSyncState(st) {
    sync.state = st;
    const el = document.getElementById("sync-note");
    if (el) { el.textContent = syncNoteText(); el.dataset.state = st; }
  }
  function applyRemote(data) {
    const merged = mergeRec(rec, data);
    const changed = JSON.stringify(merged) !== JSON.stringify(rec);
    rec = merged;
    buildFromRec();
    store.set("rec", rec);
    return changed;
  }
  async function startSync() {
    const use = window.claude && window.claude.use;
    if (!use) return;
    try {
      const [db, user] = await Promise.all([use("db"), use("user")]);
      const uid = db && user ? await user.id() : null;
      if (!uid) return;
      sync.doc = db.doc("data/users/" + uid + "/jlpt-n3");
      setSyncState("connecting");
      const snap = await sync.doc.get();
      const had = snap.exists;
      if (had) applyRemote(snap.data());
      if (!had || JSON.stringify(snap.data()) !== JSON.stringify(rec)) await writeRemote();
      else setSyncState("synced");
      refreshQuiet();
      // 다른 기기에서 공부하면 이 화면에도 반영
      sync.doc.onSnapshot((s) => {
        if (!s.exists || s.metadata.hasPendingWrites || sync.writing) return;
        if (applyRemote(s.data())) refreshQuiet();
      }, () => setSyncState("error"));
    } catch (e) {
      sync.doc = null;
      setSyncState("local");
    }
  }

  // ---------- 데이터 정리 ----------
  const KANJI = KANJI_DATA.map((r, i) => ({
    id: "k" + i, day: Math.floor(i / PER_DAY.k) + 1,
    char: r[0], on: r[1], kun: r[2], mean: r[3],
    ex: r[4].split("|").map((s) => { const p = s.split(":"); return { w: p[0], r: p[1], m: p[2] }; }),
  }));
  const VOCAB = VOCAB_DATA.map((r, i) => ({
    id: "v" + i, day: Math.floor(i / PER_DAY.v) + 1, word: r[0], read: r[1], mean: r[2],
  }));
  // 예문 하나를 [앞, 빈칸, 뒤] 로 나눔
  function splitEx(ex, ko) {
    const m = ex.match(/^(.*)\[(.+?)\](.*)$/);
    return { ex, ko, before: m ? m[1] : ex, blank: m ? m[2] : "", after: m ? m[3] : "" };
  }
  const EXTRA = typeof GRAMMAR_EXTRA !== "undefined" ? GRAMMAR_EXTRA : [];
  const GRAMMAR = GRAMMAR_DATA.map((r, i) => {
    const exs = [splitEx(r[3], r[4])].concat((EXTRA[i] || []).map((e) => splitEx(e[0], e[1])));
    return Object.assign({
      id: "g" + i, day: Math.floor(i / PER_DAY.g) + 1,
      pat: r[0], mean: r[1], conn: r[2], exs,
    }, exs[0]);
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
  // 브라우저에 내장된 일본어 음성으로 읽어 준다. 청해 대화는 남·여 목소리를 나눠 읽는다.
  const canSpeak = "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
  let jaVoices = [];
  const MALE = /otoya|ichiro|keita|daichi|hattori|takumi|kenji|naoki|male|男/i;
  const FEMALE = /kyoko|haruka|ayumi|nanami|o-ren|sayaka|mizuki|female|女/i;
  const voice = { N: null, M: null, F: null };
  function pickVoice() {
    if (!canSpeak) return;
    jaVoices = speechSynthesis.getVoices().filter((v) => /^ja/i.test(v.lang));
    const m = jaVoices.find((v) => MALE.test(v.name));
    const f = jaVoices.find((v) => FEMALE.test(v.name));
    const first = jaVoices[0] || null;
    voice.F = f || first;
    voice.M = m || jaVoices.find((v) => v !== voice.F) || first;
    voice.N = voice.F;
    updateVoiceNote();
  }
  // 목소리가 하나뿐이면 높낮이로 남녀를 구분
  function pitchFor(role) {
    if (voice.M && voice.F && voice.M !== voice.F) return 1;
    return role === "M" ? 0.75 : role === "F" ? 1.2 : 1;
  }
  const speechRate = () => 0.9 * (Number(settings.rate) || 1);
  let speakToken = 0;
  const liveUtterances = []; // 일부 브라우저에서 끝 이벤트가 사라지지 않도록 참조 유지
  function makeUtterance(text, role) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = speechRate();
    u.pitch = pitchFor(role || "N");
    const v = voice[role || "N"];
    if (v) u.voice = v;
    return u;
  }
  function stopSpeech() {
    speakToken++;
    try { if (gplaying) stopGPlay(); } catch (e) { /* 초기화 전 */ }
    if (canSpeak) try { speechSynthesis.cancel(); } catch (e) { /* 무시 */ }
  }
  function speak(text) {
    if (!canSpeak) { toast("이 브라우저는 음성을 지원하지 않아요"); return; }
    stopSpeech();
    try { speechSynthesis.speak(makeUtterance(text, "N")); } catch (e) { /* 무시 */ }
  }
  // [{text, role}] 를 차례로 읽는다. 문장이 길면 。 단위로 나눠 끊김을 막는다.
  function speakSequence(items, hooks) {
    if (!canSpeak) { toast("이 브라우저는 음성을 지원하지 않아요"); return; }
    stopSpeech();
    const token = speakToken;
    const parts = [];
    items.forEach((it, idx) => {
      String(it.text).split(/(?<=[。？！?!])/).filter((t) => t.trim()).forEach((t) => parts.push({ text: t, role: it.role, idx }));
    });
    let i = 0;
    const next = () => {
      if (token !== speakToken) return;
      if (i >= parts.length) { hooks && hooks.onDone && hooks.onDone(); return; }
      const p = parts[i++];
      hooks && hooks.onLine && hooks.onLine(p.idx);
      if (p.role === "pause") { setTimeout(next, 900); return; }
      const u = makeUtterance(p.text, p.role);
      let done = false;
      const go = () => { if (done) return; done = true; setTimeout(next, p.role === "gap" ? 0 : 350); };
      u.onend = go;
      u.onerror = go;
      liveUtterances.push(u);
      if (liveUtterances.length > 50) liveUtterances.shift();
      try { speechSynthesis.speak(u); } catch (e) { go(); }
    };
    next();
  }
  function speakBtn(text) {
    if (!canSpeak) return "";
    return '<button type="button" class="icon-btn speak" data-say="' + esc(text) + '" title="발음 듣기">🔊</button>';
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-say]");
    if (b) { e.stopPropagation(); speak(b.getAttribute("data-say")); }
  });
  function updateVoiceNote() {
    document.querySelectorAll(".voice-note").forEach((el) => setVoiceNote(el));
  }
  function setVoiceNote(el) {
    if (!canSpeak) {
      el.textContent = "⚠ 이 브라우저는 음성 읽기를 지원하지 않아요. Chrome·Safari 최신 버전에서 열어 주세요.";
      el.dataset.state = "error";
    } else if (!jaVoices.length) {
      el.innerHTML = "⚠ 이 기기에서 일본어 음성을 찾지 못했어요. 소리가 안 나거나 어색하면 일본어 음성을 설치해 주세요.<br />" +
        "· iPhone/iPad: 설정 → 손쉬운 사용 → 읽기 및 말하기 → 음성 → 일본어<br />" +
        "· Android: 설정 → 텍스트 음성 변환(TTS) → Google 음성 엔진 → 언어: 일본어 데이터 설치<br />" +
        "· Windows: 설정 → 시간 및 언어 → 음성 → 음성 추가 → 일본어";
      el.dataset.state = "error";
    } else {
      el.textContent = "🔊 일본어 음성 " + jaVoices.length + "개 사용 가능" + (voice.M !== voice.F ? " · 청해는 남·여 목소리로 읽어요" : " · 청해 남녀는 목소리 높낮이로 구분해요");
      el.dataset.state = "ok";
    }
  }
  if (canSpeak) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
    setTimeout(pickVoice, 1000);
  }

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
  const VIEWS = ["plan", "listen", "kana", "kanji", "vocab", "grammar", "quiz", "wrong"];
  function show(view) {
    if (!VIEWS.includes(view)) view = "plan";
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    if (view === "plan") renderPlan();
    if (view !== "listen") stopSpeech();
    if (view === "listen") renderListen();
    if (view === "kana") renderKana();
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
    saveSettings();
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
    $("plan-rate").innerHTML = rateSeg();
    updateVoiceNote();
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
      '<div class="stat"><div class="stat-num">' + Object.keys(listened).filter((id) => listened[id] === 1).length + "<small>/" + LISTEN.length + '</small></div><div class="stat-label">청해 정답</div></div>' +
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
    saveSettings();
    setDefaultDays();
    renderPlan();
  });
  $("exam-date").addEventListener("change", (e) => {
    if (!e.target.value) return;
    settings.exam = e.target.value;
    saveSettings();
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

  // ---------- 청해 ----------
  const LISTEN = (typeof LISTENING_DATA !== "undefined" ? LISTENING_DATA : []).map((p, i) => Object.assign({ id: "L" + (i + 1), no: i + 1 }, p));
  const LTYPE = typeof LISTENING_TYPES !== "undefined" ? LISTENING_TYPES : {};
  let listenCur = null; // 지금 푸는 문제 번호(index), 목록이면 null
  let listenFilter = "all";
  let listenPicked = null; // 고른 보기 (null = 아직 안 풂)
  let listenExam = store.get("listenExam", false) === true; // 실전 모드: 음성 보기 유형은 글자를 숨김
  const ROLE = { M: "男", F: "女", N: "" };

  function rateSeg() {
    const r = Number(settings.rate) || 1;
    return '<div class="seg small" data-rate-seg>' + [[0.8, "느리게"], [1, "보통"], [1.2, "빠르게"]].map(([v, l]) =>
      '<button type="button" data-rate="' + v + '"' + (Math.abs(r - v) < 0.01 ? ' class="active"' : "") + ">" + l + "</button>").join("") + "</div>";
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-rate]");
    if (!b) return;
    settings.rate = Number(b.dataset.rate);
    saveSettings();
    document.querySelectorAll("[data-rate-seg] button").forEach((x) => x.classList.toggle("active", x.dataset.rate === b.dataset.rate));
    speak("この速さで読みます。");
  });

  function audioOnlyChoices(p) { return p.t >= 3; }
  function choiceSpeech(p) {
    return p.ch.map((c, i) => ({ text: (i + 1) + "番。" + plain(c), role: "N" }));
  }
  function listenSequence(p) {
    const N = (t) => ({ text: plain(t), role: "N" });
    const lines = p.lines.map((l) => ({ text: plain(l[1]), role: l[0] }));
    if (p.t === 1 || p.t === 2) return [N(p.sit), N(p.q)].concat(lines, [N(p.q)]);
    if (p.t === 3) return [N(p.sit)].concat(lines, [N(p.q)], choiceSpeech(p));
    if (p.t === 4) return [N(p.sit)].concat(choiceSpeech(p));
    return lines.concat(choiceSpeech(p));
  }
  function playListen() {
    const p = LISTEN[listenCur];
    const st = $("listen-status");
    const btn = $("listen-play");
    btn.textContent = "■ 정지";
    btn.dataset.playing = "1";
    if (st) st.textContent = "듣는 중…";
    speakSequence(listenSequence(p), {
      onDone: () => {
        btn.textContent = "▶ 다시 듣기";
        btn.dataset.playing = "";
        if (st) st.textContent = listenPicked === null ? "답을 골라 보세요." : "";
      },
    });
  }

  function renderListen() {
    const root = $("listen-root");
    if (listenCur === null) {
      const solved = LISTEN.filter((p) => listened[p.id] === 1).length;
      let h = '<div class="listen-top"><div class="voice-note"></div>' +
        '<div class="toolbar sub"><span class="field-label inline">읽기 속도</span>' + rateSeg() +
        '<label class="toggle"><input type="checkbox" id="listen-exam"' + (listenExam ? " checked" : "") + " /> 실전 모드 (음성 보기는 글자 숨김)</label></div>" +
        '<div class="seg" id="listen-filter">' + [["all", "전체"]].concat([1, 2, 3, 4, 5].map((t) => [String(t), LTYPE[t][0]])).map(([v, l]) =>
          '<button type="button" data-v="' + v + '"' + (listenFilter === v ? ' class="active"' : "") + ">" + l + "</button>").join("") +
        '</div><p class="hint">정답 ' + solved + " / " + LISTEN.length + "문제 · 실제 시험처럼 대본을 보지 말고 먼저 들은 뒤, 풀고 나서 대본과 해석으로 복습하세요.</p></div>";
      [1, 2, 3, 4, 5].forEach((t) => {
        if (listenFilter !== "all" && listenFilter !== String(t)) return;
        const ps = LISTEN.filter((p) => p.t === t);
        h += '<section class="listen-group"><h3>' + t + ". " + LTYPE[t][0] + ' <span lang="ja" class="muted">' + LTYPE[t][1] + '</span></h3><p class="hint">' + esc(LTYPE[t][2]) + '</p><div class="listen-grid">' +
          ps.map((p) => {
            const st = listened[p.id];
            return '<button type="button" class="listen-card' + (st === 1 ? " ok" : st === 2 ? " ng" : "") + '" data-listen="' + LISTEN.indexOf(p) + '">' +
              '<span class="lc-no">문제 ' + p.no + '</span><span class="lc-sit">' + esc(p.sitKo || p.lines[0][2]) + '</span><span class="lc-st">' +
              (st === 1 ? "⭕ 정답" : st === 2 ? "❌ 오답" : "안 풂") + "</span></button>";
          }).join("") + "</div></section>";
      });
      root.innerHTML = h;
      updateVoiceNote();
      return;
    }
    const p = LISTEN[listenCur];
    const answered = listenPicked !== null;
    const hideText = listenExam && audioOnlyChoices(p) && !answered;
    let h = '<div class="listen-head"><button type="button" class="ghost-btn small" id="listen-back">‹ 목록</button>' +
      '<span class="q-type">' + LTYPE[p.t][0] + '</span><span class="muted">문제 ' + p.no + " / " + LISTEN.length + "</span></div>" +
      '<p class="hint">' + esc(LTYPE[p.t][2]) + "</p>" +
      '<div class="q-card listen-card-main">' +
      (p.t === 4 ? '<div class="listen-sit" lang="ja">' + ruby(p.sit) + '</div><div class="hint">' + esc(p.sitKo) + "</div>" : "") +
      '<button type="button" class="primary-btn listen-play" id="listen-play">▶ 듣기</button>' +
      '<div class="hint" id="listen-status">' + (answered ? "" : "▶ 버튼을 눌러 들어 보세요.") + "</div>" + rateSeg() + "</div>" +
      '<div class="q-options listen-opts">' + p.ch.map((c, i) => {
        let cls = "q-opt";
        if (answered && i === p.a) cls += " correct";
        else if (answered && i === listenPicked) cls += " wrong";
        return '<button type="button" class="' + cls + '" data-lopt="' + i + '"' + (answered ? " disabled" : "") + ' lang="ja"><span class="q-n">' + (i + 1) + "</span>" +
          (hideText ? '<span class="muted">（음성으로 들은 ' + (i + 1) + "번）</span>" : "<span>" + ruby(c) + "</span>") + "</button>";
      }).join("") + "</div>";
    if (answered) {
      const ok = listenPicked === p.a;
      h += '<div class="feedback ' + (ok ? "ok" : "ng") + '"><div class="fb-title">' + (ok ? "⭕ 정답!" : "❌ 오답 — 정답은 " + (p.a + 1) + "번") + '</div><div class="fb-body">' + esc(p.exp) + "</div></div>";
      h += '<section class="script"><h3>📄 대본 · 해석</h3>';
      if (p.sit && p.t !== 4) h += scriptLine("N", p.sit, p.sitKo);
      p.lines.forEach((l) => (h += scriptLine(l[0], l[1], l[2])));
      if (p.q) h += scriptLine("N", p.q, p.qKo, "질문");
      h += '<div class="script-ch">' + p.ch.map((c, i) => '<div class="' + (i === p.a ? "ans" : "") + '"><span lang="ja">' + (i + 1) + ". " + ruby(c) + "</span>" + speakBtn(plain(c)) + "</div>").join("") + "</div></section>";
      h += '<div class="result-actions">' + (listenCur > 0 ? '<button type="button" class="ghost-btn" data-listen="' + (listenCur - 1) + '">‹ 이전 문제</button>' : "") +
        '<button type="button" class="ghost-btn" id="listen-retry">다시 풀기</button>' +
        (listenCur < LISTEN.length - 1 ? '<button type="button" class="primary-btn" data-listen="' + (listenCur + 1) + '">다음 문제 ›</button>' : '<button type="button" class="primary-btn" id="listen-back2">목록으로</button>') + "</div>";
    }
    root.innerHTML = h;
  }
  function scriptLine(role, jp, ko, label) {
    const who = label || ROLE[role] || "해설";
    return '<div class="sline sline-' + role + '"><span class="who">' + who + '</span><div class="sbody"><div lang="ja">' + ruby(jp) + speakBtn(plain(jp)) + '</div><div class="sko">' + esc(ko || "") + "</div></div></div>";
  }
  $("view-listen").addEventListener("click", (e) => {
    const card = e.target.closest("[data-listen]");
    if (card) {
      stopSpeech();
      listenCur = Number(card.dataset.listen);
      listenPicked = null;
      renderListen();
      window.scrollTo(0, 0);
      return;
    }
    const f = e.target.closest("#listen-filter button");
    if (f) { listenFilter = f.dataset.v; renderListen(); return; }
    const id = e.target.id;
    if (id === "listen-back" || id === "listen-back2") { stopSpeech(); listenCur = null; renderListen(); return; }
    if (id === "listen-retry") { stopSpeech(); listenPicked = null; renderListen(); return; }
    if (id === "listen-play") {
      if (e.target.dataset.playing) { stopSpeech(); e.target.textContent = "▶ 다시 듣기"; e.target.dataset.playing = ""; return; }
      playListen();
      return;
    }
    const o = e.target.closest("[data-lopt]");
    if (o && listenPicked === null) {
      stopSpeech();
      listenPicked = Number(o.dataset.lopt);
      const p = LISTEN[listenCur];
      listened[p.id] = listenPicked === p.a ? 1 : 2;
      saveListen();
      renderListen();
    }
  });
  $("view-listen").addEventListener("change", (e) => {
    if (e.target.id === "listen-exam") {
      listenExam = e.target.checked;
      store.set("listenExam", listenExam);
    }
  });

  // ---------- 가나 표 ----------
  const toKata = (s) => s.replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  function kanaCell(raw, mode) {
    if (!raw) return '<div class="kana-cell empty"></div>';
    const [h, ro, ko] = raw.split("|");
    const isKata = /[\u30a0-\u30ff]/.test(h);
    const hira = isKata ? "" : h;
    const kata = isKata ? h : toKata(h);
    const main = mode === "kata" ? kata : hira || kata;
    const sub = mode === "both" && hira ? '<span class="kana-sub" lang="ja">' + esc(kata) + "</span>" : "";
    const hide = $("kana-hide").checked;
    return '<button type="button" class="kana-cell" data-say="' + esc(main) + '"><span class="kana-main" lang="ja">' + esc(main) + "</span>" + sub +
      '<span class="kana-ro ' + (hide ? "reveal" : "") + '"><span>' + esc(ro) + " · " + esc(ko) + "</span></span></button>";
  }
  function kanaTable(title, rows, cols, mode, note) {
    return '<section class="kana-block"><h3>' + title + "</h3>" + (note ? '<p class="hint">' + note + "</p>" : "") +
      '<div class="kana-grid" style="grid-template-columns:repeat(' + cols + ',minmax(0,1fr))">' +
      rows.map((r) => r.map((c) => kanaCell(c, mode)).join("")).join("") + "</div></section>";
  }
  function renderKana() {
    const mode = getSeg("kana-mode");
    let h = kanaTable("기본 오십음도 (청음)", KANA_DATA.basic, 5, mode, "ん은 뒤 글자에 따라 ㄴ·ㅁ·ㅇ 받침처럼 소리 나요.");
    h += kanaTable("탁음 · 반탁음 ( ゛ ゜ )", KANA_DATA.dakuten, 5, mode, "점 두 개(゛)는 탁음(ㄱ·ㅈ·ㄷ·ㅂ), 동그라미(゜)는 반탁음(ㅍ). ぢ·づ는 거의 쓰지 않아요.");
    h += kanaTable("요음 (작은 ゃ ゅ ょ)", KANA_DATA.youon, 3, mode, "い단 글자 + 작은 や·ゆ·よ = 한 박자로 읽어요. (き+ゃ = きゃ 캬)");
    if (mode !== "hira") h += kanaTable("외래어 전용 가타카나", KANA_DATA.foreign, 4, "kata", "작은 ァィゥェォ를 붙여 외래어 소리를 표기해요. (ファン 팬, パーティー 파티)");
    h += '<section class="kana-block"><h3>꼭 알아야 할 규칙</h3><table class="mini-table">' +
      '<tr><td lang="ja">っ / ッ (촉음)</td><td>작은 つ는 다음 자음을 한 박자 끊어 읽기 → <span lang="ja">きって</span> 킷테 (우표)</td></tr>' +
      '<tr><td lang="ja">ー (장음)</td><td>가타카나에서 앞 모음을 길게 → <span lang="ja">コーヒー</span> 코오히이 (커피)</td></tr>' +
      '<tr><td lang="ja">おう・えい 등</td><td>히라가나 장음은 모음을 덧붙여 표기 → <span lang="ja">せんせい</span> 센세에, <span lang="ja">がっこう</span> 각코오</td></tr>' +
      '<tr><td lang="ja">は・へ・を (조사)</td><td>조사로 쓰일 때 は=와, へ=에, を=오 로 읽어요 → <span lang="ja">わたしは</span> 와타시와</td></tr>' +
      "</table></section>";
    h += '<section class="kana-block"><h3>헷갈리기 쉬운 글자</h3><table class="mini-table">' +
      KANA_DATA.confusing.map((r) => '<tr><td lang="ja" class="kana-conf">' + esc(r[0]) + "</td><td>" + esc(r[1]) + "</td></tr>").join("") + "</table></section>";
    $("kana-tables").innerHTML = h;
  }
  $("kana-mode").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    setSeg("kana-mode", b.dataset.v);
    renderKana();
  });
  $("kana-hide").addEventListener("change", renderKana);
  $("kana-quiz-btn").addEventListener("click", () => {
    setSeg("quiz-type", "kana");
    go("quiz");
    startQuiz({ type: "kana" });
  });
  function kanaPool() {
    const mode = getSeg("kana-mode");
    const out = [];
    ["basic", "dakuten", "youon"].concat(mode === "hira" ? [] : ["foreign"]).forEach((sec) => {
      KANA_DATA[sec].forEach((row) => row.forEach((raw) => {
        if (!raw) return;
        const [h, ro, ko] = raw.split("|");
        const isKata = /[\u30a0-\u30ff]/.test(h);
        const forms = isKata ? [h] : mode === "hira" ? [h] : mode === "kata" ? [toKata(h)] : [h, toKata(h)];
        forms.forEach((ch) => out.push({ id: "kana:" + ch, ch, ro, ko, sec }));
      }));
    });
    return out;
  }

  // ---------- 한자 ----------
  function renderKanji() {
    const items = filterItems(KANJI, "kanji", (x) => [x.char, x.on, x.kun, x.mean].concat(x.ex.map((e) => e.w + e.r + e.m)));
    const hide = $("kanji-hide").checked;
    $("kanji-count").textContent = items.length + "자";
    $("kanji-list").innerHTML = items.map((k) =>
      '<article class="kcard">' +
      '<div class="kcard-top"><button type="button" class="kchar" lang="ja" data-say="' + esc(k.on.split("・")[0] + "、" + (k.kun !== "-" ? k.kun.split("・")[0].replace(/[()]/g, "") : "")) + '" title="음독·훈독 듣기">' + esc(k.char) + "</button>" +
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
  // ---------- 한국 한자음 (예: 勉強 → 면강) ----------
  const KO_OF = Object.assign({}, typeof HANJA_KO !== "undefined" ? HANJA_KO : {});
  KANJI.forEach((k) => (KO_OF[k.char] = k.mean));
  const DUEUM = { 녀: "여", 뇨: "요", 뉴: "유", 니: "이", 랴: "야", 려: "여", 례: "예", 료: "요", 류: "유", 리: "이",
    라: "나", 래: "내", 로: "노", 뢰: "뇌", 루: "누", 르: "느", 량: "양", 력: "역", 련: "연", 렬: "열", 령: "영",
    록: "녹", 론: "논", 룡: "용", 률: "율", 륙: "육", 륜: "윤", 릉: "능", 림: "임", 립: "입", 녕: "영", 념: "염", 락: "낙", 란: "난", 람: "남", 랑: "낭", 랭: "냉" };
  const hasFinal = (ch) => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c % 28 !== 0; };
  const finalIsN = (ch) => (ch.charCodeAt(0) - 0xac00) % 28 === 4;
  function hanjaInfo(word) {
    const parts = [];
    let prev = null;
    for (const c of word) {
      if (c === "々" && prev) { parts.push(prev); continue; }
      if (/[\u4e00-\u9fff]/.test(c) && KO_OF[c]) { prev = [c, KO_OF[c]]; parts.push(prev); }
    }
    if (!parts.length) return null;
    const sounds = parts.map((p) => p[1].trim().split(/\s+/).pop());
    const ko = sounds.map((snd, i) => {
      if (i === 0 && DUEUM[snd]) return DUEUM[snd]; // 두음법칙 (料理 → 요리)
      if (i > 0 && (snd === "렬" || snd === "률")) {
        const b = sounds[i - 1];
        if (!hasFinal(b) || finalIsN(b)) return snd === "렬" ? "열" : "율"; // 規律 → 규율
      }
      return snd;
    }).join("");
    return { ko, parts };
  }
  function hanjaLine(word, hidden) {
    const h = hanjaInfo(word);
    if (!h) return "";
    return '<div class="vhanja ' + (hidden ? "reveal" : "") + '"><span><b class="hko">' + esc(h.ko) + "</b> " +
      h.parts.map((p) => '<span class="hpart"><span lang="ja">' + esc(p[0]) + "</span> " + esc(p[1]) + "</span>").join(" ") + "</span></div>";
  }
  let hanjaOn = store.get("hanjaOn", true) !== false;
  $("vocab-hanja").checked = hanjaOn;
  $("vocab-hanja").addEventListener("change", (e) => {
    hanjaOn = e.target.checked;
    store.set("hanjaOn", hanjaOn);
    renderVocab();
  });

  function renderVocab() {
    const items = filterItems(VOCAB, "vocab", (x) => [x.word, x.read, x.mean]);
    const hide = $("vocab-hide").checked;
    const hideR = $("vocab-hide-reading").checked;
    $("vocab-count").textContent = items.length + "개";
    $("vocab-list").innerHTML = items.map((v) =>
      '<article class="vrow"><div class="vmain"><button type="button" class="vword" lang="ja" data-say="' + esc(v.read ? v.read.split("・")[0] : v.word) + '" title="발음 듣기">' + esc(v.word) + "</button>" +
      (v.read ? '<div class="vread ' + (hideR ? "reveal" : "") + '" lang="ja"><span>' + esc(v.read) + "</span></div>" : "") +
      (hanjaOn ? hanjaLine(v.word, hide) : "") +
      '</div><div class="vmean ' + (hide ? "reveal" : "") + '"><span>' + esc(v.mean) + "</span></div>" +
      '<div class="vact">' + speakBtn(v.read ? v.read.split("・")[0] : v.word) + knownBtn(v.id) + "</div></article>"
    ).join("") + doneFooter("vocab", "v", "단어");
  }

  // ---------- 문법 ----------
  function renderGrammar() {
    const items = filterItems(GRAMMAR, "grammar", (x) => [x.pat, x.mean, x.conn].concat(x.exs.map((e) => e.ex + e.ko)));
    const hide = $("grammar-hide").checked;
    $("grammar-count").textContent = items.length + "개";
    $("grammar-list").innerHTML = items.map((g) =>
      '<article class="grow" data-gid="' + g.id + '"><div class="ghead"><span class="gpat" lang="ja">' + esc(g.pat) + "</span>" +
      (canSpeak ? '<button type="button" class="ghost-btn small gplay" data-gplay="' + g.id + '">▶ 예문 3개 듣기</button>' : "") +
      '<span class="day-tag">Day ' + g.day + "</span></div>" +
      '<div class="gmean">' + esc(g.mean) + "</div>" +
      '<div class="gconn">접속: <span lang="ja">' + esc(g.conn) + "</span></div>" +
      '<ol class="gexs">' + g.exs.map((e) =>
        '<li><div class="gex" lang="ja">' + ruby(e.ex, true) + speakBtn(plain(e.ex)) + "</div>" +
        '<div class="gko ' + (hide ? "reveal" : "") + '"><span>' + esc(e.ko) + "</span></div></li>").join("") + "</ol>" +
      '<div class="card-actions">' + knownBtn(g.id) + "</div></article>"
    ).join("") + doneFooter("grammar", "g", "문법");
  }
  // 문법: 예문 3개 이어 듣기 (읽는 문장 강조), 퀴즈: 빈칸을 비우고 문장 듣기
  let gplaying = null;
  function stopGPlay() {
    if (!gplaying) return;
    const b = document.querySelector('[data-gplay="' + gplaying + '"]');
    if (b) b.textContent = "▶ 예문 3개 듣기";
    document.querySelectorAll(".gexs li.speaking").forEach((li) => li.classList.remove("speaking"));
    gplaying = null;
  }
  document.addEventListener("click", (e) => {
    const gb = e.target.closest("[data-gplay]");
    if (gb) {
      const id = gb.dataset.gplay;
      const was = gplaying === id;
      stopSpeech();
      stopGPlay();
      if (was) return;
      const g = BY_ID[id];
      const lis = gb.closest(".grow").querySelectorAll(".gexs li");
      speakSequence(g.exs.map((x) => ({ text: plain(x.ex), role: "N" })), {
        onLine: (i) => lis.forEach((li, k) => li.classList.toggle("speaking", k === i)),
        onDone: () => { if (gplaying === id) stopGPlay(); },
      });
      gplaying = id; // speakSequence 가 이전 재생을 멈춘 뒤에 표시
      gb.textContent = "■ 정지";
      return;
    }
    const bs = e.target.closest("[data-blanksay]");
    if (bs) {
      const [a, b] = JSON.parse(bs.dataset.blanksay);
      speakSequence([{ text: a, role: "N" }, { text: "-", role: "pause" }, { text: b, role: "N" }].filter((x) => x.text.replace(/[。、？！?!\s]/g, "")));
    }
  });

  function renderVerbTable() {
    const T = VERB_TABLE;
    let h = "<h4>동사 3그룹</h4><table class=\"mini-table\"><tr><th>그룹</th><th>구별법</th><th>예</th></tr>" +
      T.groups.map((r) => "<tr><td>" + esc(r[0]) + "</td><td>" + esc(r[1]) + '</td><td lang="ja">' + esc(r[2]) + "</td></tr>").join("") + "</table>";
    h += '<h4>활용표</h4><div class="table-scroll"><table class="mini-table"><tr><th>활용</th><th>書く(1)</th><th>飲む(1)</th><th>食べる(2)</th><th>する(3)</th><th>来る(3)</th></tr>' +
      T.forms.map((r) => "<tr><td>" + esc(r[0]) + "</td>" + r.slice(1).map((c) => '<td lang="ja" class="say-cell" data-say="' + esc((c.match(/\((.+)\)/) || [0, c])[1]) + '">' + esc(c) + "</td>").join("") + "</tr>").join("") + "</table></div>";
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

  // 훈독이 없는 한자(百·校 등)는 훈독 문제에서 뺀다
  function hasKun(k) { return k.kun && k.kun !== "-"; }
  function kanjiType(k) {
    const opts = hasKun(k) ? ["kanji", "on", "kun"] : ["kanji", "on"];
    return opts[Math.floor(Math.random() * opts.length)];
  }
  function vocabType(v, preferred) {
    const canRead = v.read && HAS_KANJI.test(v.word);
    if (preferred === "reading") return canRead ? "reading" : "meaning";
    if (preferred === "meaning" || preferred === "reverse") return preferred;
    const opts = canRead ? ["reading", "meaning", "reverse"] : ["meaning", "reverse"];
    return opts[Math.floor(Math.random() * opts.length)];
  }

  function buildQuestions(type, range, day, count) {
    if (type === "kana") {
      const kp = kanaPool();
      return shuffle(kp).slice(0, count).map((item) => makeQuestion({ item, t: "kana", pool: kp }));
    }
    const pool = poolFor(range, day);
    let entries = [];
    if (type === "kanji") entries = pool.k.map((x) => ({ item: x, t: "kanji" }));
    else if (type === "on") entries = pool.k.map((x) => ({ item: x, t: "on" }));
    else if (type === "kun") entries = pool.k.filter(hasKun).map((x) => ({ item: x, t: "kun" }));
    else if (type === "reading") entries = pool.v.filter((v) => v.read && HAS_KANJI.test(v.word)).map((x) => ({ item: x, t: "reading" }));
    else if (type === "meaning" || type === "reverse") entries = pool.v.map((x) => ({ item: x, t: type }));
    else if (type === "grammar") entries = pool.g.map((x) => ({ item: x, t: "grammar" }));
    else {
      entries = pool.k.map((x) => ({ item: x, t: kanjiType(x) }))
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

  function makeQuestion({ item, t, pool }) {
    let prompt, answer, opts, explain, say, optLang = "";
    if (t === "kana") {
      const label = (x) => x.ro + " (" + x.ko + ")";
      prompt = '<div class="q-big" lang="ja">' + esc(item.ch) + '</div><div class="q-ask">이 글자의 발음은?</div>';
      answer = label(item);
      opts = distractors(pool || kanaPool(), item, label, 3, (x) => (x.sec === item.sec ? 1 : 0));
      explain = '<b lang="ja">' + esc(item.ch) + "</b> = " + esc(label(item));
      say = item.ch;
    } else if (t === "on" || t === "kun") {
      const key = t === "on" ? (x) => x.on : (x) => x.kun;
      const label = t === "on" ? "음독 (音読み · 가타카나)" : "훈독 (訓読み · 히라가나)";
      prompt = '<div class="q-big" lang="ja">' + esc(item.char) + '</div><div class="q-ask">이 한자의 <b>' + label + "</b>은?</div>";
      answer = key(item);
      const len = answer.length;
      opts = distractors(t === "on" ? KANJI : KANJI.filter(hasKun), item, key, 3,
        (x) => (Math.abs(key(x).length - len) <= 1 ? 1 : 0) + (x.day === item.day ? 1 : 0));
      optLang = "ja";
      explain = '<b lang="ja">' + esc(item.char) + "</b> " + esc(item.mean) + '<br />음독: <span lang="ja">' + esc(item.on) + "</span> / 훈독: <span lang=\"ja\">" + esc(item.kun) + "</span><br />" +
        item.ex.map((e) => '<span lang="ja">' + esc(e.w) + "(" + esc(e.r) + ")</span> " + esc(e.m)).join(" · ");
      say = t === "on" ? item.on.split("・")[0] : item.kun.split("・")[0].replace(/[()]/g, "");
    } else if (t === "kanji") {
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
      explain = '<span lang="ja">' + rubyWord(item.word, item.read) + "</span> = " + esc(item.mean) + hanjaLine(item.word);
      say = item.read.split("・")[0];
    } else if (t === "meaning") {
      prompt = '<div class="q-big" lang="ja">' + esc(item.word) + '</div><div class="q-ask">뜻은?</div>';
      answer = item.mean;
      opts = distractors(VOCAB, item, (x) => x.mean, 3);
      explain = '<span lang="ja">' + esc(item.word) + (item.read ? " (" + esc(item.read) + ")" : "") + "</span> = " + esc(item.mean) + hanjaLine(item.word);
      say = item.read ? item.read.split("・")[0] : item.word;
    } else if (t === "reverse") {
      prompt = '<div class="q-mid">' + esc(item.mean) + '</div><div class="q-ask">이 뜻의 일본어 단어는?</div>';
      answer = item.word;
      opts = distractors(VOCAB, item, (x) => x.word, 3);
      optLang = "ja";
      explain = '<span lang="ja">' + esc(item.word) + (item.read ? " (" + esc(item.read) + ")" : "") + "</span> = " + esc(item.mean) + hanjaLine(item.word);
      say = item.read ? item.read.split("・")[0] : item.word;
    } else {
      // 예문 3개 중 하나를 무작위로 골라 출제
      const ex = item.exs[Math.floor(Math.random() * item.exs.length)];
      prompt = '<div class="q-sent" lang="ja">' + ruby(ex.before) + '<span class="q-blank">（　　）</span>' + ruby(ex.after) + "</div>" +
        (canSpeak ? '<button type="button" class="ghost-btn small" data-blanksay="' + esc(JSON.stringify([plain(ex.before), plain(ex.after)])) + '">🔊 문장 듣기 (빈칸은 쉬고 읽어요)</button>' : "") +
        '<div class="q-ask">빈칸에 들어갈 알맞은 표현은?</div><div class="q-hint reveal"><span>💬 ' + esc(ex.ko) + "</span></div>";
      answer = ex.blank;
      const seen = new Set([plain(answer)]);
      opts = [];
      for (const g of shuffle(GRAMMAR)) {
        if (g === item) continue;
        const b = g.exs[Math.floor(Math.random() * g.exs.length)].blank;
        if (!b || seen.has(plain(b))) continue;
        seen.add(plain(b));
        opts.push(b);
        if (opts.length >= 3) break;
      }
      optLang = "ja";
      explain = '<b lang="ja">' + esc(item.pat) + "</b> — " + esc(item.mean) + '<br /><span lang="ja">' + ruby(ex.ex, true) + "</span><br />" + esc(ex.ko);
      say = plain(ex.ex);
    }
    const options = shuffle([answer].concat(opts));
    return { item, t, prompt, answer, options, explain, say, optLang };
  }

  const TYPE_LABEL = { kana: "가나", kanji: "한자", on: "음독", kun: "훈독", reading: "읽기", meaning: "뜻", reverse: "단어", grammar: "문법" };

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
        "<span>" + (q.t === "grammar" ? ruby(o) : esc(o)) + "</span></button>").join("") + "</div>" +
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
      if (q.t !== "kana") { wrong[id] = (wrong[id] || 0) + 1; saveWrong(); }
      quiz.wrongList.push(q);
    }
    const hint = document.querySelector(".q-hint");
    if (hint) hint.classList.add("shown");
    $("q-feedback").innerHTML =
      '<div class="feedback ' + (ok ? "ok" : "ng") + '"><div class="fb-title">' + (ok ? "⭕ 정답!" : q.t === "kana" ? "❌ 오답" : "❌ 오답 — 오답노트에 저장했어요") + speakBtn(q.say) + "</div>" +
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
    const countsForDay = (quiz.range === "today" || quiz.range === "upto") && quiz.type !== "kana";
    if (countsForDay && pct >= 60) setTask(quiz.day, "q", true);
    const msg = pct === 100 ? "완벽해요! 🎉" : pct >= 80 ? "아주 좋아요! 👍" : pct >= 60 ? "합격권이에요. 오답만 다시 보면 OK!" : "괜찮아요, 반복이 답이에요 💪";
    $("quiz-area").innerHTML =
      '<div class="result"><div class="result-score">' + quiz.score + " / " + n + '</div><div class="result-pct">' + pct + "%</div><p>" + msg + "</p>" +
      (countsForDay ? (pct >= 60 ? '<p class="hint">✓ Day ' + quiz.day + " 복습 퀴즈 완료로 체크했어요</p>" : '<p class="hint">60% 이상이면 오늘 퀴즈 완료로 체크돼요</p>') : "") +
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
      else if (id[0] === "v") body = '<span class="wtag">단어</span><b class="wbig" lang="ja">' + rubyWord(x.word, x.read) + "</b> " + esc(x.mean) + hanjaLine(x.word);
      else body = '<span class="wtag">문법</span><b lang="ja">' + esc(x.pat) + "</b> " + esc(x.mean) + '<div class="gex" lang="ja">' + ruby(x.ex, true) + "</div><div class=\"gko\">" + esc(x.ko) + "</div>";
      return '<div class="wrow"><div class="wbody">' + body + '</div><div class="wact"><span class="wcnt">×' + wrong[id] + "</span>" +
        speakBtn(id[0] === "k" ? x.ex[0].r : id[0] === "v" ? (x.read ? x.read.split("・")[0] : x.word) : plain(x.ex)) +
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

  // 다른 기기의 기록이 들어왔을 때: 퀴즈 도중이면 화면은 그대로 두고, 나머지는 다시 그린다
  function refreshQuiet() {
    applyFurigana();
    const v = location.hash.slice(1) || "plan";
    if (v === "plan") renderPlan();
    else if (v === "kanji") renderKanji();
    else if (v === "vocab") renderVocab();
    else if (v === "grammar") renderGrammar();
    else if (v === "wrong") renderWrong();
    else if (v === "listen" && !listenCur) renderListen();
  }

  // ---------- 시작 ----------
  applyFurigana();
  renderVerbTable();
  setDefaultDays();
  setSyncState("local");
  show(location.hash.slice(1) || "plan");
  startSync();
})();
