// TOEIC 단어 암기 앱 로직
(function () {
  "use strict";

  const WORDBOOK_KEY = "toeic_wordbook_ids";
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
  renderWordList("");
  updateWordbookSourceCount();
})();
