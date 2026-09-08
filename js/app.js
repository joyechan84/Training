// TOEIC 단어 암기 앱 로직
(function () {
  "use strict";

  // ---------- User session (nickname-based, no real auth) ----------
  const CURRENT_USER_KEY = "toeic_current_user";
  const KNOWN_USERS_KEY = "toeic_known_users";
  const PENDING_IMPORT_KEY = "toeic_pending_import";

  // ---------- Sync code (manual cross-device transfer) ----------
  // This is a static page with no server, so there is no real account
  // sync. Instead, progress can be encoded into a short text code the
  // user copies from one device and pastes into another.
  function encodeProgress(wordbookIdArray, cardIdx) {
    const payload = { v: 1, wordbookIds: wordbookIdArray, cardIndex: cardIdx };
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  }

  function decodeProgress(code) {
    const json = decodeURIComponent(escape(atob(code.trim())));
    const payload = JSON.parse(json);
    if (!payload || !Array.isArray(payload.wordbookIds)) {
      throw new Error("invalid sync code");
    }
    return payload;
  }

  function applyImportCode(code, forUser) {
    const payload = decodeProgress(code);
    const wbKey = "toeic_u_" + encodeURIComponent(forUser || "guest") + "_wordbook_ids";
    const ciKey = "toeic_u_" + encodeURIComponent(forUser || "guest") + "_card_index";
    localStorage.setItem(wbKey, JSON.stringify(payload.wordbookIds));
    if (Number.isInteger(payload.cardIndex) && VOCAB_DATA.length > 0) {
      const total = VOCAB_DATA.length;
      const normalized = ((payload.cardIndex % total) + total) % total;
      localStorage.setItem(ciKey, String(normalized));
    }
  }

  function getKnownUsers() {
    try {
      return JSON.parse(localStorage.getItem(KNOWN_USERS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function rememberUser(name) {
    const list = getKnownUsers();
    if (!list.includes(name)) {
      list.push(name);
      localStorage.setItem(KNOWN_USERS_KEY, JSON.stringify(list));
    }
  }

  function loginAs(name) {
    localStorage.setItem(CURRENT_USER_KEY, name);
    rememberUser(name);
    location.reload();
  }

  function logout() {
    localStorage.removeItem(CURRENT_USER_KEY);
    location.reload();
  }

  const currentUser = localStorage.getItem(CURRENT_USER_KEY);

  function userKey(base) {
    return "toeic_u_" + encodeURIComponent(currentUser || "guest") + "_" + base;
  }

  const loginGateEl = document.getElementById("login-gate");
  const appShellEl = document.getElementById("app-shell");

  if (!currentUser) {
    loginGateEl.hidden = false;
    appShellEl.hidden = true;

    const knownUsers = getKnownUsers();
    if (knownUsers.length > 0) {
      const knownUsersWrapEl = document.getElementById("known-users");
      const knownUsersListEl = document.getElementById("known-users-list");
      knownUsersWrapEl.hidden = false;
      knownUsers.forEach((name) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "known-user-btn";
        btn.textContent = name;
        btn.addEventListener("click", () => loginAs(name));
        knownUsersListEl.appendChild(btn);
      });
    }

    document.getElementById("login-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("login-nickname");
      const name = input.value.trim();
      if (!name) {
        input.focus();
        return;
      }
      const syncCodeInput = document.getElementById("login-sync-code");
      const code = syncCodeInput ? syncCodeInput.value.trim() : "";
      if (code) {
        localStorage.setItem(PENDING_IMPORT_KEY, code);
      }
      loginAs(name);
    });

    return; // 로그인 전에는 나머지 앱 로직을 실행하지 않음
  }

  loginGateEl.hidden = true;
  appShellEl.hidden = false;
  document.getElementById("current-user-label").textContent = currentUser;
  document.getElementById("switch-user-btn").addEventListener("click", logout);

  const pendingImportCode = localStorage.getItem(PENDING_IMPORT_KEY);
  if (pendingImportCode) {
    localStorage.removeItem(PENDING_IMPORT_KEY);
    try {
      applyImportCode(pendingImportCode, currentUser);
    } catch (e) {
      // 잘못된 코드는 조용히 무시하고 빈 상태로 시작
    }
  }

  const WORDBOOK_KEY = userKey("wordbook_ids");
  const QUIZ_LENGTH = 10;
  const MATCH_PAIR_COUNT = 6;

  // ---------- Wordbook (localStorage) ----------
  function loadWordbookIds() {
    try {
      const raw = localStorage.getItem(WORDBOOK_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) {
      return new Set();
    }
  }

  function saveWordbookIds(set) {
    localStorage.setItem(WORDBOOK_KEY, JSON.stringify(Array.from(set)));
  }

  let wordbookIds = loadWordbookIds();

  function isBookmarked(id) {
    return wordbookIds.has(id);
  }

  function toggleBookmark(id) {
    if (wordbookIds.has(id)) {
      wordbookIds.delete(id);
    } else {
      wordbookIds.add(id);
    }
    saveWordbookIds(wordbookIds);
  }

  function getWordbookWords() {
    return VOCAB_DATA.filter((w) => wordbookIds.has(w.id));
  }

  // ---------- Utilities ----------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Builds a regex that matches a word's base form plus common inflections
  // (plurals, -s/-es/-d/-ed/-ing, consonant doubling, y->ies) so the blank
  // in the fill-in-the-blank quiz lines up even when the example sentence
  // uses an inflected form of the target word.
  function buildWordBlankRegex(word) {
    const hasSpace = /\s/.test(word);
    if (hasSpace) {
      return new RegExp("\\b" + escapeRegExp(word) + "\\b", "i");
    }
    const stem = /[ey]$/i.test(word) ? word.slice(0, -1) : word;
    return new RegExp("\\b" + escapeRegExp(stem) + "\\w*", "i");
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ---------- Tab navigation ----------
  const tabButtons = document.querySelectorAll(".tab-btn");
  const views = document.querySelectorAll(".view");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.view;
      views.forEach((v) => v.classList.toggle("active", v.id === "view-" + target));
      if (target === "wordbook") renderWordbookView();
      if (target === "quiz") updateWordbookSourceCount();
      if (target === "cards") renderFlashcard();
    });
  });

  // ---------- Study (예문보기) view ----------
  const wordListEl = document.getElementById("word-list");
  const studyCountEl = document.getElementById("study-count");
  const searchInput = document.getElementById("search-input");

  function buildWordCard(word, opts) {
    opts = opts || {};
    const card = el("div", "word-card");

    const top = el("div", "word-card-top");
    const titleWrap = el("div");
    const title = el("span", "word-title", word.word);
    const pos = el("span", "word-pos", word.pos);
    titleWrap.appendChild(title);
    titleWrap.appendChild(pos);
    top.appendChild(titleWrap);

    const btn = el(
      "button",
      "bookmark-btn" + (isBookmarked(word.id) ? " active" : ""),
      isBookmarked(word.id) ? "★ 모르는 단어" : "☆ 모르는 단어"
    );
    btn.addEventListener("click", () => {
      toggleBookmark(word.id);
      if (opts.onToggle) {
        opts.onToggle();
      } else {
        const nowActive = isBookmarked(word.id);
        btn.classList.toggle("active", nowActive);
        btn.textContent = nowActive ? "★ 모르는 단어" : "☆ 모르는 단어";
      }
      updateWordbookSourceCount();
    });
    top.appendChild(btn);
    card.appendChild(top);

    const meaning = el("div", "word-meaning", word.meaning);
    card.appendChild(meaning);

    const example = el("div", "word-example", word.example);
    card.appendChild(example);

    const exampleKo = el("div", "word-example-ko", word.exampleKo);
    card.appendChild(exampleKo);

    return card;
  }

  function renderWordList(filter) {
    filter = (filter || "").trim().toLowerCase();
    const filtered = VOCAB_DATA.filter(
      (w) =>
        w.word.toLowerCase().includes(filter) ||
        w.meaning.toLowerCase().includes(filter)
    );
    wordListEl.innerHTML = "";
    filtered.forEach((w) => wordListEl.appendChild(buildWordCard(w)));
    studyCountEl.textContent = `${filtered.length} / ${VOCAB_DATA.length} 단어`;
  }

  searchInput.addEventListener("input", () => renderWordList(searchInput.value));

  // ---------- Wordbook (나만의 단어장) view ----------
  const wordbookListEl = document.getElementById("wordbook-list");
  const wordbookCountEl = document.getElementById("wordbook-count");
  const wordbookEmptyEl = document.getElementById("wordbook-empty");

  function renderWordbookView() {
    const words = getWordbookWords();
    wordbookListEl.innerHTML = "";
    wordbookCountEl.textContent = `${words.length}개`;
    wordbookEmptyEl.hidden = words.length !== 0;
    words.forEach((w) => {
      wordbookListEl.appendChild(
        buildWordCard(w, { onToggle: renderWordbookView })
      );
    });
  }

  function updateWordbookSourceCount() {
    document.getElementById("wordbook-source-count").textContent = wordbookIds.size;
  }

  // ---------- Flashcard (단어학습) view ----------
  const CARD_INDEX_KEY = userKey("card_index");
  const flashcardEl = document.getElementById("flashcard");
  const cardPositionEl = document.getElementById("card-position");
  const cardPrevBtn = document.getElementById("card-prev");
  const cardNextBtn = document.getElementById("card-next");
  const cardBookmarkBtn = document.getElementById("card-bookmark");

  function loadCardIndex() {
    const saved = parseInt(localStorage.getItem(CARD_INDEX_KEY), 10);
    return Number.isInteger(saved) && saved >= 0 && saved < VOCAB_DATA.length ? saved : 0;
  }

  let cardIndex = loadCardIndex();
  let cardRevealed = false;

  function renderFlashcard() {
    const word = VOCAB_DATA[cardIndex];
    flashcardEl.innerHTML = "";
    flashcardEl.classList.toggle("revealed", cardRevealed);

    if (!cardRevealed) {
      flashcardEl.appendChild(el("div", "fc-word", word.word));
      flashcardEl.appendChild(el("span", "fc-pos", word.pos));
      flashcardEl.appendChild(el("div", "fc-hint", "클릭하거나 Space를 눌러 뜻과 예문 보기"));
    } else {
      const top = el("div", "word-card-top");
      const titleWrap = el("div");
      titleWrap.appendChild(el("span", "fc-word", word.word));
      titleWrap.appendChild(el("span", "fc-pos", word.pos));
      top.appendChild(titleWrap);
      flashcardEl.appendChild(top);
      flashcardEl.appendChild(el("div", "fc-meaning", word.meaning));
      flashcardEl.appendChild(el("div", "fc-example", word.example));
      flashcardEl.appendChild(el("div", "fc-example-ko", word.exampleKo));
    }

    cardPositionEl.textContent = `${cardIndex + 1} / ${VOCAB_DATA.length}`;
    const bookmarked = isBookmarked(word.id);
    cardBookmarkBtn.textContent = bookmarked ? "★ 모르는 단어" : "☆ 모르는 단어";
    cardBookmarkBtn.classList.toggle("active", bookmarked);
  }

  function goToCard(newIndex) {
    const total = VOCAB_DATA.length;
    cardIndex = ((newIndex % total) + total) % total;
    cardRevealed = false;
    localStorage.setItem(CARD_INDEX_KEY, String(cardIndex));
    renderFlashcard();
  }

  flashcardEl.addEventListener("click", () => {
    cardRevealed = !cardRevealed;
    renderFlashcard();
  });

  cardPrevBtn.addEventListener("click", () => goToCard(cardIndex - 1));
  cardNextBtn.addEventListener("click", () => goToCard(cardIndex + 1));

  cardBookmarkBtn.addEventListener("click", () => {
    toggleBookmark(VOCAB_DATA[cardIndex].id);
    renderFlashcard();
    updateWordbookSourceCount();
  });

  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("view-cards").classList.contains("active")) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goToCard(cardIndex + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goToCard(cardIndex - 1);
    } else if (e.key === " ") {
      e.preventDefault();
      cardRevealed = !cardRevealed;
      renderFlashcard();
    }
  });

  // ---------- Sync modal (기기 간 동기화) ----------
  const syncModalEl = document.getElementById("sync-modal");
  const syncExportCodeEl = document.getElementById("sync-export-code");
  const syncImportInputEl = document.getElementById("sync-import-input");
  const syncMessageEl = document.getElementById("sync-message");

  function showSyncMessage(text, kind) {
    syncMessageEl.textContent = text;
    syncMessageEl.className = "sync-message" + (kind ? " " + kind : "");
  }

  document.getElementById("sync-btn").addEventListener("click", () => {
    syncExportCodeEl.value = encodeProgress(Array.from(wordbookIds), cardIndex);
    syncImportInputEl.value = "";
    showSyncMessage("", "");
    syncModalEl.hidden = false;
  });

  document.getElementById("sync-close-btn").addEventListener("click", () => {
    syncModalEl.hidden = true;
  });

  document.getElementById("sync-copy-btn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(syncExportCodeEl.value);
      showSyncMessage("코드가 복사되었어요.", "success");
    } catch (e) {
      syncExportCodeEl.select();
      document.execCommand("copy");
      showSyncMessage("코드가 복사되었어요.", "success");
    }
  });

  document.getElementById("sync-import-btn").addEventListener("click", () => {
    const code = syncImportInputEl.value.trim();
    if (!code) {
      showSyncMessage("코드를 붙여넣어 주세요.", "error");
      return;
    }
    try {
      applyImportCode(code, currentUser);
      wordbookIds = loadWordbookIds();
      cardIndex = loadCardIndex();
      cardRevealed = false;
      renderFlashcard();
      renderWordList(searchInput.value);
      renderWordbookView();
      updateWordbookSourceCount();
      showSyncMessage("가져왔어요! 단어장과 학습 진도가 반영되었어요.", "success");
    } catch (e) {
      showSyncMessage("코드가 올바르지 않아요. 다시 확인해 주세요.", "error");
    }
  });

  // ---------- Quiz (단어퀴즈) view ----------
  let currentQuizMode = "fill";
  const modeButtons = document.querySelectorAll(".mode-btn");
  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      modeButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentQuizMode = btn.dataset.mode;
    });
  });

  const startQuizBtn = document.getElementById("start-quiz-btn");
  const quizAreaEl = document.getElementById("quiz-area");

  startQuizBtn.addEventListener("click", () => {
    const source = document.querySelector('input[name="quiz-source"]:checked').value;
    const pool = source === "wordbook" ? getWordbookWords() : VOCAB_DATA;

    if (source === "wordbook" && pool.length === 0) {
      alert("먼저 '나만의 단어장'에 모르는 단어를 추가해주세요.");
      return;
    }
    if (pool.length < 4) {
      alert("퀴즈를 시작하려면 단어가 최소 4개 이상 필요합니다.");
      return;
    }

    if (currentQuizMode === "fill") {
      startFillQuiz(pool);
    } else {
      startMatchQuiz(pool);
    }
  });

  // ---- Fill-in-the-blank quiz ----
  function startFillQuiz(pool) {
    const count = Math.min(QUIZ_LENGTH, pool.length);
    const queue = shuffle(pool).slice(0, count);
    let index = 0;
    let score = 0;

    function renderQuestion() {
      quizAreaEl.innerHTML = "";
      const word = queue[index];

      const progress = el(
        "div",
        "quiz-progress",
        `문제 ${index + 1} / ${queue.length}   (점수: ${score})`
      );
      quizAreaEl.appendChild(progress);

      const regex = buildWordBlankRegex(word.word);
      const blanked = word.example.replace(regex, '<span class="blank">_____</span>');
      const sentenceEl = el("div", "quiz-sentence");
      sentenceEl.innerHTML = blanked;
      quizAreaEl.appendChild(sentenceEl);

      const distractorPool = pool.filter((w) => w.id !== word.id);
      const distractors = shuffle(distractorPool).slice(0, 3);
      const options = shuffle([word, ...distractors]);

      const optionsEl = el("div", "quiz-options");
      const feedbackEl = el("div", "quiz-feedback");
      const navEl = el("div", "quiz-nav");

      options.forEach((opt) => {
        const optBtn = el("button", "option-btn", `${opt.word} (${opt.meaning})`);
        optBtn.dataset.id = opt.id;
        optBtn.addEventListener("click", () => {
          Array.from(optionsEl.children).forEach((b) => (b.disabled = true));
          if (opt.id === word.id) {
            optBtn.classList.add("correct");
            score++;
            feedbackEl.textContent = "정답입니다! 🎉";
          } else {
            optBtn.classList.add("incorrect");
            optionsEl.querySelector(`[data-id="${word.id}"]`).classList.add("correct");
            feedbackEl.textContent = `오답입니다. 정답은 "${word.word}" 입니다.`;
          }

          const nextBtn = el(
            "button",
            "primary-btn",
            index + 1 < queue.length ? "다음 문제" : "결과 보기"
          );
          nextBtn.addEventListener("click", () => {
            index++;
            if (index < queue.length) {
              renderQuestion();
            } else {
              renderFillResult();
            }
          });
          navEl.appendChild(nextBtn);
        });
        optionsEl.appendChild(optBtn);
      });

      quizAreaEl.appendChild(optionsEl);
      quizAreaEl.appendChild(feedbackEl);
      quizAreaEl.appendChild(navEl);
    }

    function renderFillResult() {
      quizAreaEl.innerHTML = "";
      const result = el("div", "quiz-result");
      result.appendChild(el("h3", "", "퀴즈 완료!"));
      result.appendChild(
        el("p", "", `${queue.length}문제 중 ${score}문제를 맞혔습니다.`)
      );
      const retryBtn = el("button", "primary-btn", "다시 시작");
      retryBtn.addEventListener("click", () => startFillQuiz(pool));
      result.appendChild(retryBtn);
      quizAreaEl.appendChild(result);
    }

    renderQuestion();
  }

  // ---- Word-meaning matching quiz ----
  function startMatchQuiz(pool) {
    const count = Math.min(MATCH_PAIR_COUNT, pool.length);
    const pairs = shuffle(pool).slice(0, count);
    const leftItems = shuffle(pairs);
    const rightItems = shuffle(pairs);

    const matched = new Set();
    let selectedWordId = null;
    let selectedMeaningId = null;
    let busy = false;

    quizAreaEl.innerHTML = "";
    const progress = el("div", "quiz-progress", `짝지어야 할 단어: ${pairs.length}개`);
    quizAreaEl.appendChild(progress);

    const grid = el("div", "match-grid");
    const leftCol = el("div", "match-col");
    const rightCol = el("div", "match-col");

    leftItems.forEach((word) => {
      const item = el("button", "match-item", word.word);
      item.dataset.id = word.id;
      item.addEventListener("click", () => handleWordClick(word.id, item));
      leftCol.appendChild(item);
    });

    rightItems.forEach((word) => {
      const item = el("button", "match-item", word.meaning);
      item.dataset.id = word.id;
      item.addEventListener("click", () => handleMeaningClick(word.id, item));
      rightCol.appendChild(item);
    });

    grid.appendChild(leftCol);
    grid.appendChild(rightCol);
    quizAreaEl.appendChild(grid);

    function clearSelection() {
      selectedWordId = null;
      selectedMeaningId = null;
      leftCol.querySelectorAll(".match-item.selected").forEach((n) => n.classList.remove("selected"));
      rightCol.querySelectorAll(".match-item.selected").forEach((n) => n.classList.remove("selected"));
    }

    function checkPair() {
      if (selectedWordId === null || selectedMeaningId === null || busy) return;
      busy = true;
      const wordBtn = leftCol.querySelector(`[data-id="${selectedWordId}"]`);
      const meaningBtn = rightCol.querySelector(`[data-id="${selectedMeaningId}"]`);

      if (selectedWordId === selectedMeaningId) {
        wordBtn.classList.remove("selected");
        meaningBtn.classList.remove("selected");
        wordBtn.classList.add("matched");
        meaningBtn.classList.add("matched");
        wordBtn.disabled = true;
        meaningBtn.disabled = true;
        matched.add(selectedWordId);
        selectedWordId = null;
        selectedMeaningId = null;
        busy = false;
        if (matched.size === pairs.length) {
          setTimeout(renderMatchResult, 400);
        }
      } else {
        wordBtn.classList.add("wrong");
        meaningBtn.classList.add("wrong");
        setTimeout(() => {
          wordBtn.classList.remove("wrong");
          meaningBtn.classList.remove("wrong");
          clearSelection();
          busy = false;
        }, 500);
      }
    }

    function handleWordClick(id, node) {
      if (busy || matched.has(id)) return;
      leftCol.querySelectorAll(".match-item.selected").forEach((n) => n.classList.remove("selected"));
      selectedWordId = id;
      node.classList.add("selected");
      checkPair();
    }

    function handleMeaningClick(id, node) {
      if (busy || matched.has(id)) return;
      rightCol.querySelectorAll(".match-item.selected").forEach((n) => n.classList.remove("selected"));
      selectedMeaningId = id;
      node.classList.add("selected");
      checkPair();
    }

    function renderMatchResult() {
      quizAreaEl.innerHTML = "";
      const result = el("div", "quiz-result");
      result.appendChild(el("h3", "", "짝짓기 완료! 🎉"));
      result.appendChild(el("p", "", `${pairs.length}개의 단어를 모두 짝지었습니다.`));
      const retryBtn = el("button", "primary-btn", "다시 시작");
      retryBtn.addEventListener("click", () => startMatchQuiz(pool));
      result.appendChild(retryBtn);
      quizAreaEl.appendChild(result);
    }
  }

  // ---------- Init ----------
  renderFlashcard();
  renderWordList("");
  updateWordbookSourceCount();
})();
