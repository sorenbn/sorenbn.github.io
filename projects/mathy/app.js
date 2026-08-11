const TABLE_MIN = 1;
const TABLE_MAX = 12;
const STORAGE_KEY = "mathy-progress-v2";
const LEGACY_STORAGE_KEY = "mathy-progress-v1";
const SESSION_LIMIT = 250;
let deferredInstallPrompt = null;
let chartResizeFrame = null;

const defaultProgress = () => ({
  version: 2,
  totalCorrect: 0,
  totalAnswered: 0,
  rounds: 0,
  bestStreak: 0,
  mistakes: {},
  tables: {
    multiplication: {},
    division: {},
  },
  sessions: [],
});

const state = {
  subject: "multiplication",
  selectedTable: 6,
  mode: "focused",
  questions: [],
  currentIndex: 0,
  correct: 0,
  streak: 0,
  roundBestStreak: 0,
  missed: [],
  answered: false,
  coverAnswers: false,
  activeSession: null,
  questionStartedAt: 0,
  hintUsed: false,
  timerId: null,
  analyticsTable: 6,
  progress: loadProgress(),
};

const subjectSelect = document.querySelector("#subject-select");
const learnTablePicker = document.querySelector("#learn-table-picker");
const practiceTablePicker = document.querySelector("#practice-table-picker");
const factGrid = document.querySelector("#fact-grid");

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY));
    if (!saved) return defaultProgress();
    const progress = {
      ...defaultProgress(),
      ...saved,
      tables: {
        multiplication: saved.tables?.multiplication || {},
        division: saved.tables?.division || {},
      },
      mistakes: saved.mistakes || {},
      sessions: Array.isArray(saved.sessions) ? saved.sessions.slice(-SESSION_LIMIT) : [],
    };
    ["multiplication", "division"].forEach((subject) => {
      Object.values(progress.tables[subject]).forEach((stats) => {
        stats.correct = Number(stats.correct) || 0;
        stats.answered = Number(stats.answered) || 0;
        stats.mistakes = Number(stats.mistakes) || Math.max(0, stats.answered - stats.correct);
        stats.totalResponseMs = Number(stats.totalResponseMs) || 0;
        stats.hints = Number(stats.hints) || 0;
      });
    });
    progress.sessions.forEach((session) => {
      if (session.status === "in-progress") {
        session.status = "ended";
        session.endedAt = session.endedAt || new Date().toISOString();
        session.durationMs = session.durationMs || sumResponseTime(session.questions || []);
      }
    });
    return progress;
  } catch {
    return defaultProgress();
  }
}

function saveProgress() {
  state.progress.version = 2;
  state.progress.sessions = state.progress.sessions.slice(-SESSION_LIMIT);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function sumResponseTime(questions) {
  return questions.reduce((total, question) => total + (Number(question.responseMs) || 0), 0);
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDuration(milliseconds, compact = false) {
  const totalSeconds = Math.max(0, Math.round((Number(milliseconds) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (compact) {
    if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function operationSymbol(subject = state.subject) {
  return subject === "multiplication" ? "×" : "÷";
}

function tableName(table = state.selectedTable, subject = state.subject) {
  return subject === "multiplication" ? `${table} times table` : `${table} division table`;
}

function createTablePickers() {
  [learnTablePicker, practiceTablePicker].forEach((picker) => {
    picker.innerHTML = "";
    for (let table = TABLE_MIN; table <= TABLE_MAX; table += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "table-button";
      button.textContent = table;
      button.dataset.table = table;
      button.setAttribute("aria-label", `Choose the ${table} table`);
      picker.append(button);
    }
  });
  const analyticsSelect = document.querySelector("#analytics-table-select");
  analyticsSelect.innerHTML = "";
  for (let table = TABLE_MIN; table <= TABLE_MAX; table += 1) {
    const option = document.createElement("option");
    option.value = table;
    option.textContent = `Table ${table}`;
    analyticsSelect.append(option);
  }
  analyticsSelect.value = state.analyticsTable;
  updateSelectedTable();
}

function updateSelectedTable() {
  document.querySelectorAll(".table-button").forEach((button) => {
    const selected = Number(button.dataset.table) === state.selectedTable;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  document.querySelector("#focused-table-label").textContent = tableName();
}

function renderFacts() {
  const multiplication = state.subject === "multiplication";
  document.querySelector("#learn-subject-copy").textContent = multiplication
    ? "Which multiplication table are you working on?"
    : "Which number do you want to divide by?";
  document.querySelector("#study-title").textContent = multiplication
    ? `The ${state.selectedTable} times table`
    : `Divide by ${state.selectedTable}`;
  document.querySelector("#cover-help").textContent = state.coverAnswers
    ? "Say the answer, then tap a row to check it."
    : "Read each fact out loud. Rhythm helps it stick.";

  factGrid.innerHTML = "";
  for (let value = TABLE_MIN; value <= TABLE_MAX; value += 1) {
    const answer = multiplication ? state.selectedTable * value : value;
    const left = multiplication ? `${state.selectedTable} × ${value}` : `${state.selectedTable * value} ÷ ${state.selectedTable}`;
    const row = document.createElement(state.coverAnswers ? "button" : "div");
    if (state.coverAnswers) row.type = "button";
    row.className = `fact-row${state.coverAnswers ? " is-covered" : ""}`;
    row.innerHTML = `<span>${left}</span><span class="fact-equals">=</span><span class="fact-answer">${answer}</span>`;
    if (state.coverAnswers) {
      row.setAttribute("aria-label", `${left}. Reveal answer.`);
      row.addEventListener("click", () => {
        row.classList.toggle("is-revealed");
        const revealed = row.classList.contains("is-revealed");
        row.setAttribute("aria-label", `${left} equals ${revealed ? answer : "hidden"}. ${revealed ? "Hide" : "Reveal"} answer.`);
      });
    }
    factGrid.append(row);
  }

  renderPatternTip();
}

function renderPatternTip() {
  const table = state.selectedTable;
  const multiplication = state.subject === "multiplication";
  const titles = {
    1: "Every number stays itself",
    2: "Think in doubles",
    3: "Add a double and one more",
    4: "Double, then double again",
    5: "Answers end in 5 or 0",
    6: "Five groups, then one more",
    7: "Five groups, then two more",
    8: "Double three times",
    9: "The digits add up to 9",
    10: "Add a zero",
    11: "Watch the repeating digits",
    12: "Ten groups, then two more",
  };
  const descriptions = {
    1: "Multiplying by 1 leaves the other number unchanged.",
    2: "The 2 table is the same as doubling a number.",
    3: "For 3 × 7, double 7 and add one more 7.",
    4: "For 4 × 6, double 6 to get 12, then double again.",
    5: "The answers take turns ending in 5 and 0.",
    6: "For 6 × 7, find 5 × 7 and add one more 7.",
    7: "For 7 × 8, find 5 × 8 and add 2 × 8.",
    8: "For 8 × 6, double 6 three times: 12, 24, 48.",
    9: "In 9, 18, 27 and 36, each answer’s digits total 9.",
    10: "Multiplying a whole number by 10 puts a zero at the end.",
    11: "Up to 9 × 11, the digit repeats: 3 × 11 is 33.",
    12: "For 12 × 7, find 10 × 7 and add 2 × 7.",
  };

  document.querySelector("#pattern-title").textContent = multiplication
    ? titles[table]
    : `Use the ${table} times table backwards`;
  document.querySelector("#pattern-copy").textContent = multiplication
    ? descriptions[table]
    : `If ${table} × 6 = ${table * 6}, then ${table * 6} ÷ ${table} = 6.`;
  document.querySelector("#pattern-sequence").textContent = multiplication
    ? [1, 2, 3, 4].map((value) => value * table).join(" · ")
    : [1, 2, 3, 4].map((value) => `${value * table}÷${table}=${value}`).join(" · ");
}

function showView(viewName) {
  if (viewName !== "practice" && state.activeSession) {
    finalizeActiveSession("ended");
  }
  document.querySelectorAll(".view").forEach((view) => {
    const active = view.dataset.view === viewName;
    view.hidden = !active;
    view.classList.toggle("is-active", active);
  });
  document.querySelectorAll(".nav-button").forEach((button) => {
    const active = button.dataset.viewTarget === viewName;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (viewName === "progress") renderProgress();
  if (viewName === "practice" && !state.activeSession) resetPracticePanels();
  window.location.hash = viewName;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setPracticeMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode-card").forEach((card) => {
    const selected = card.dataset.mode === mode;
    card.classList.toggle("is-selected", selected);
    card.setAttribute("aria-checked", String(selected));
  });
  document.querySelector("#focused-table-group").hidden = mode !== "focused";
  const notes = {
    focused: "",
    mixed: "Questions will be picked from all tables, 1 through 12.",
    review: mistakeCount() ? `${mistakeCount()} facts are waiting for another try.` : "No mistakes saved yet — try a mixed round first.",
  };
  document.querySelector("#setup-note").textContent = notes[mode];
}

function makeQuestion(table, value, subject = state.subject) {
  if (subject === "multiplication") {
    return {
      subject,
      table,
      value,
      answer: table * value,
      text: `${table} × ${value}`,
      key: `${subject}:${table}:${value}`,
    };
  }
  return {
    subject,
    table,
    value,
    answer: value,
    text: `${table * value} ÷ ${table}`,
    key: `${subject}:${table}:${value}`,
  };
}

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function buildQuestions(count) {
  if (state.mode === "review") {
    const reviewed = Object.values(state.progress.mistakes)
      .filter((item) => item.subject === state.subject)
      .map((item) => makeQuestion(item.table, item.value, item.subject));
    if (!reviewed.length) return [];
    const questions = [];
    while (questions.length < count) questions.push(...shuffled(reviewed));
    return questions.slice(0, count);
  }

  const pool = [];
  const tables = state.mode === "focused"
    ? [state.selectedTable]
    : Array.from({ length: TABLE_MAX }, (_, index) => index + 1);
  tables.forEach((table) => {
    for (let value = TABLE_MIN; value <= TABLE_MAX; value += 1) {
      pool.push(makeQuestion(table, value));
    }
  });

  const questions = [];
  while (questions.length < count) questions.push(...shuffled(pool));
  return questions.slice(0, count);
}

function startPractice() {
  const count = Number(document.querySelector("#question-count").value);
  state.questions = buildQuestions(count);
  if (!state.questions.length) {
    document.querySelector("#setup-note").textContent = "There are no saved mistakes for this subject yet. Try a mixed round first.";
    return;
  }
  state.currentIndex = 0;
  state.correct = 0;
  state.streak = 0;
  state.roundBestStreak = 0;
  state.missed = [];
  state.activeSession = {
    id: makeId(),
    subject: state.subject,
    mode: state.mode,
    selectedTable: state.mode === "focused" ? state.selectedTable : null,
    plannedQuestions: state.questions.length,
    startedAt: new Date().toISOString(),
    endedAt: null,
    durationMs: 0,
    status: "in-progress",
    questions: [],
  };
  state.progress.sessions.push(state.activeSession);
  saveProgress();
  document.querySelector("#practice-setup").hidden = true;
  document.querySelector("#results-panel").hidden = true;
  document.querySelector("#quiz-panel").hidden = false;
  renderQuestion();
}

function startRoundTimer() {
  stopRoundTimer();
  updateRoundTimer();
  state.timerId = window.setInterval(updateRoundTimer, 500);
}

function stopRoundTimer() {
  if (state.timerId) window.clearInterval(state.timerId);
  state.timerId = null;
}

function currentPracticeTime(session = state.activeSession) {
  if (!session) return 0;
  const currentQuestionMs = session === state.activeSession && !state.answered && state.questionStartedAt
    ? Math.max(0, Date.now() - state.questionStartedAt)
    : 0;
  return sumResponseTime(session.questions || []) + currentQuestionMs;
}

function updateRoundTimer() {
  if (!state.activeSession) return;
  document.querySelector("#live-elapsed").textContent = formatDuration(currentPracticeTime());
}

function finalizeActiveSession(status) {
  const session = state.activeSession;
  if (!session) return null;
  const endedAt = new Date();
  session.status = status;
  session.endedAt = endedAt.toISOString();
  session.durationMs = Math.max(0, endedAt.getTime() - new Date(session.startedAt).getTime());
  session.practiceTimeMs = currentPracticeTime(session);
  session.correct = session.questions.filter((question) => question.correct).length;
  session.answered = session.questions.length;
  session.mistakes = session.answered - session.correct;
  session.bestStreak = state.roundBestStreak;
  if (status === "completed") {
    state.progress.rounds += 1;
    state.progress.bestStreak = Math.max(state.progress.bestStreak, state.roundBestStreak);
  }
  stopRoundTimer();
  state.activeSession = null;
  saveProgress();
  return session;
}

function renderQuestion() {
  const question = state.questions[state.currentIndex];
  state.answered = false;
  state.questionStartedAt = Date.now();
  state.hintUsed = false;
  document.querySelector("#question-position").textContent = `Question ${state.currentIndex + 1} of ${state.questions.length}`;
  document.querySelector("#quiz-progress").style.width = `${(state.currentIndex / state.questions.length) * 100}%`;
  document.querySelector("#question-kicker").textContent = tableName(question.table, question.subject);
  document.querySelector("#equation").textContent = `${question.text} = ?`;
  document.querySelector("#question-context").textContent = question.subject === "multiplication"
    ? `Think of ${question.table} groups of ${question.value}.`
    : `How many groups of ${question.table} fit into ${question.table * question.value}?`;
  document.querySelector("#live-correct").textContent = state.correct;
  document.querySelector("#live-streak").textContent = state.streak;
  document.querySelector("#answer-input").value = "";
  document.querySelector("#answer-input").disabled = false;
  document.querySelector("#check-answer").disabled = false;
  document.querySelector("#feedback").hidden = true;
  document.querySelector("#feedback").classList.remove("is-wrong");
  document.querySelector("#hint-copy").hidden = true;
  document.querySelector("#show-hint").hidden = false;
  document.querySelector("#answer-input").focus();
  startRoundTimer();
}

function answerQuestion(event) {
  event.preventDefault();
  if (state.answered) return;
  const input = document.querySelector("#answer-input");
  if (input.value === "") return;

  const question = state.questions[state.currentIndex];
  const givenAnswer = Number(input.value);
  const correct = givenAnswer === question.answer;
  const responseMs = Math.max(0, Date.now() - state.questionStartedAt);
  state.answered = true;
  stopRoundTimer();
  state.progress.totalAnswered += 1;

  const tableStats = state.progress.tables[question.subject][question.table] || {
    correct: 0,
    answered: 0,
    mistakes: 0,
    totalResponseMs: 0,
    hints: 0,
  };
  tableStats.answered += 1;
  tableStats.totalResponseMs = (tableStats.totalResponseMs || 0) + responseMs;
  tableStats.hints = (tableStats.hints || 0) + (state.hintUsed ? 1 : 0);
  tableStats.lastPracticedAt = new Date().toISOString();

  if (correct) {
    state.correct += 1;
    state.streak += 1;
    state.roundBestStreak = Math.max(state.roundBestStreak, state.streak);
    state.progress.totalCorrect += 1;
    tableStats.correct += 1;
    delete state.progress.mistakes[question.key];
  } else {
    state.streak = 0;
    state.missed.push(question);
    tableStats.mistakes = (tableStats.mistakes || 0) + 1;
    state.progress.mistakes[question.key] = {
      subject: question.subject,
      table: question.table,
      value: question.value,
    };
  }
  state.progress.tables[question.subject][question.table] = tableStats;
  state.activeSession?.questions.push({
    subject: question.subject,
    table: question.table,
    value: question.value,
    correct,
    givenAnswer,
    expectedAnswer: question.answer,
    responseMs,
    usedHint: state.hintUsed,
    answeredAt: new Date().toISOString(),
  });
  updateRoundTimer();
  saveProgress();

  input.disabled = true;
  document.querySelector("#check-answer").disabled = true;
  document.querySelector("#show-hint").hidden = true;
  document.querySelector("#hint-copy").hidden = true;
  document.querySelector("#live-correct").textContent = state.correct;
  document.querySelector("#live-streak").textContent = state.streak;

  const feedback = document.querySelector("#feedback");
  feedback.hidden = false;
  feedback.classList.toggle("is-wrong", !correct);
  document.querySelector("#feedback-title").textContent = correct ? randomPraise() : "Almost — remember this one";
  document.querySelector("#feedback-copy").textContent = correct
    ? `${question.text} = ${question.answer}`
    : `The answer is ${question.answer}. You entered ${givenAnswer}.`;
  document.querySelector("#next-question").textContent = state.currentIndex === state.questions.length - 1 ? "See results →" : "Next →";
  document.querySelector("#next-question").focus();
}

function randomPraise() {
  const praise = ["That’s it!", "You got it!", "Nice work!", "Exactly right!", "Great recall!"];
  return praise[Math.floor(Math.random() * praise.length)];
}

function nextQuestion() {
  if (!state.answered) return;
  if (state.currentIndex < state.questions.length - 1) {
    state.currentIndex += 1;
    renderQuestion();
  } else {
    finishRound();
  }
}

function finishRound() {
  const session = finalizeActiveSession("completed");
  document.querySelector("#quiz-panel").hidden = true;
  document.querySelector("#results-panel").hidden = false;
  const percent = Math.round((state.correct / state.questions.length) * 100);
  document.querySelector("#result-heading").textContent = percent === 100
    ? "Perfect round!"
    : percent >= 80
      ? "Nicely done!"
      : percent >= 60
        ? "Good progress!"
        : "Keep building!";
  document.querySelector("#result-summary").textContent = `You got ${state.correct} out of ${state.questions.length} correct.`;
  document.querySelector("#result-percent").textContent = `${percent}%`;
  document.querySelector("#result-streak").textContent = state.roundBestStreak;
  document.querySelector("#result-missed").textContent = state.missed.length;
  document.querySelector("#result-time").textContent = formatDuration(session?.practiceTimeMs || 0);
  document.querySelector("#review-round").hidden = state.missed.length === 0;
  document.querySelector("#header-best-streak").textContent = state.progress.bestStreak;
}

function resetPracticePanels() {
  document.querySelector("#practice-setup").hidden = false;
  document.querySelector("#quiz-panel").hidden = true;
  document.querySelector("#results-panel").hidden = true;
  setPracticeMode(state.mode);
}

function quitPractice() {
  finalizeActiveSession("ended");
  resetPracticePanels();
}

function showHint() {
  const question = state.questions[state.currentIndex];
  state.hintUsed = true;
  const hint = question.subject === "multiplication"
    ? multiplicationHint(question.table, question.value)
    : `Turn it around: ${question.table} × ? = ${question.table * question.value}.`;
  const hintCopy = document.querySelector("#hint-copy");
  hintCopy.textContent = hint;
  hintCopy.hidden = false;
  document.querySelector("#show-hint").hidden = true;
}

function multiplicationHint(a, b) {
  if (a === 1 || b === 1) return "Any number multiplied by 1 stays the same.";
  if (a === 10 || b === 10) return "Multiplying by 10 adds a zero at the end.";
  if (a === 2) return `Double ${b}.`;
  if (b === 2) return `Double ${a}.`;
  if (a === 5) return `Find 10 × ${b}, then take half.`;
  if (b === 5) return `Find ${a} × 10, then take half.`;
  const larger = Math.max(a, b);
  const smaller = Math.min(a, b);
  if (smaller > 5) return `Break it apart: 5 × ${larger}, plus ${smaller - 5} × ${larger}.`;
  return `Count ${smaller} jumps of ${larger}.`;
}

function mistakeCount() {
  return Object.values(state.progress.mistakes).filter((item) => item.subject === state.subject).length;
}

function renderProgress() {
  const progress = state.progress;
  const totalPracticeTime = progress.sessions
    .filter((session) => session.status !== "in-progress")
    .reduce((total, session) => total + (Number(session.practiceTimeMs) || sumResponseTime(session.questions || [])), 0);
  const totalMistakes = Math.max(0, progress.totalAnswered - progress.totalCorrect);
  document.querySelector("#total-practice-time").textContent = totalPracticeTime
    ? formatDuration(totalPracticeTime, true)
    : "0m";
  document.querySelector("#total-correct").textContent = progress.totalCorrect;
  document.querySelector("#total-mistakes").textContent = totalMistakes;
  document.querySelector("#header-best-streak").textContent = progress.bestStreak;
  document.querySelector("#overall-accuracy").textContent = progress.totalAnswered
    ? `${Math.round((progress.totalCorrect / progress.totalAnswered) * 100)}%`
    : "—";
  document.querySelector("#session-summary").textContent = progress.rounds
    ? `${progress.rounds} completed ${progress.rounds === 1 ? "round" : "rounds"} · best streak ${progress.bestStreak} · saved on this device`
    : "Every practice round will build your history on this device.";
  document.querySelector("#mastery-heading").textContent = state.subject === "multiplication"
    ? "Multiplication mastery"
    : "Division mastery";

  renderTableAnalytics();

  const grid = document.querySelector("#mastery-grid");
  grid.innerHTML = "";
  for (let table = TABLE_MIN; table <= TABLE_MAX; table += 1) {
    const stats = progress.tables[state.subject][table] || { correct: 0, answered: 0 };
    const percent = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;
    const card = document.createElement("button");
    card.type = "button";
    card.className = `mastery-card${table === state.analyticsTable ? " is-selected" : ""}`;
    card.setAttribute("aria-pressed", String(table === state.analyticsTable));
    card.setAttribute("aria-label", `Show progress for ${tableName(table)}`);
    card.innerHTML = `
      <span class="mastery-number">${table}</span>
      <div class="mastery-info">
        <strong>${tableName(table)}</strong>
        <small>${stats.answered ? `${stats.correct} of ${stats.answered} correct` : "Not practiced yet"}</small>
        <div class="mastery-bar" aria-hidden="true"><span style="width:${percent}%"></span></div>
      </div>
      <span class="mastery-percent">${stats.answered ? `${percent}%` : "—"}</span>
    `;
    card.addEventListener("click", () => {
      state.analyticsTable = table;
      document.querySelector("#analytics-table-select").value = table;
      renderProgress();
      document.querySelector("#analytics-heading").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    grid.append(card);
  }
}

function tableSessionPoints(table = state.analyticsTable) {
  return state.progress.sessions
    .filter((session) => session.subject === state.subject && session.status !== "in-progress")
    .map((session) => {
      const questions = (session.questions || []).filter((question) => Number(question.table) === table);
      if (!questions.length) return null;
      const correct = questions.filter((question) => question.correct).length;
      const responseMs = sumResponseTime(questions);
      return {
        id: session.id,
        startedAt: session.startedAt,
        status: session.status,
        questions,
        answered: questions.length,
        correct,
        mistakes: questions.length - correct,
        accuracy: (correct / questions.length) * 100,
        averageMs: responseMs / questions.length,
        responseMs,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
}

function renderTableAnalytics() {
  const table = state.analyticsTable;
  const stats = state.progress.tables[state.subject][table] || {
    correct: 0,
    answered: 0,
    mistakes: 0,
    totalResponseMs: 0,
  };
  const points = tableSessionPoints(table);
  const accuracy = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : null;
  const averageMs = stats.totalResponseMs && stats.answered ? stats.totalResponseMs / stats.answered : 0;
  document.querySelector("#table-accuracy").textContent = accuracy === null ? "—" : `${accuracy}%`;
  document.querySelector("#table-average-time").textContent = averageMs ? `${(averageMs / 1000).toFixed(1)}s` : "—";
  document.querySelector("#table-correct").textContent = stats.correct || 0;
  document.querySelector("#table-mistakes").textContent = stats.mistakes || Math.max(0, (stats.answered || 0) - (stats.correct || 0));
  document.querySelector("#recent-table-label").textContent = tableName(table);
  document.querySelector("#analytics-table-select").value = table;
  renderTrendInsight(points);
  renderRecentSessions(points);
  const recentPoints = points.slice(-12);
  drawTrendChart("accuracy-chart", "accuracy-chart-empty", recentPoints, "accuracy");
  drawTrendChart("speed-chart", "speed-chart-empty", recentPoints, "speed");
}

function average(items, key) {
  if (!items.length) return 0;
  return items.reduce((total, item) => total + item[key], 0) / items.length;
}

function renderTrendInsight(points) {
  const insight = document.querySelector("#trend-insight");
  if (!points.length) {
    insight.textContent = `Practice the ${state.analyticsTable} table to start your trend.`;
    return;
  }
  if (points.length === 1) {
    insight.textContent = `First session recorded: ${Math.round(points[0].accuracy)}% accuracy at ${(points[0].averageMs / 1000).toFixed(1)} seconds per answer.`;
    return;
  }
  const split = Math.ceil(points.length / 2);
  const earlier = points.slice(0, split).slice(-3);
  const recent = points.slice(split).slice(-3);
  const accuracyChange = Math.round(average(recent, "accuracy") - average(earlier, "accuracy"));
  const speedChange = (average(earlier, "averageMs") - average(recent, "averageMs")) / 1000;
  const accuracyCopy = accuracyChange === 0
    ? "Accuracy is holding steady"
    : `Accuracy is ${accuracyChange > 0 ? "up" : "down"} ${Math.abs(accuracyChange)} ${Math.abs(accuracyChange) === 1 ? "point" : "points"}`;
  const speedCopy = Math.abs(speedChange) < 0.1
    ? "answer speed is steady"
    : `answers are ${Math.abs(speedChange).toFixed(1)}s ${speedChange > 0 ? "faster" : "slower"}`;
  insight.textContent = `${accuracyCopy}, and ${speedCopy} across your recent sessions.`;
}

function renderRecentSessions(points) {
  const container = document.querySelector("#recent-sessions");
  container.innerHTML = "";
  const recent = points.slice(-4).reverse();
  if (!recent.length) {
    container.innerHTML = '<p class="recent-empty">No sessions for this table yet. A focused, mixed, or review round will all count.</p>';
    return;
  }
  recent.forEach((point) => {
    const row = document.createElement("div");
    row.className = "recent-session";
    const date = new Date(point.startedAt);
    const dateLabel = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const timeLabel = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    row.innerHTML = `
      <div class="recent-session-main">
        <strong>${dateLabel}</strong>
        <small>${timeLabel} · ${point.status === "completed" ? "Completed" : "Ended early"}</small>
      </div>
      <div class="recent-session-metrics">
        <div class="recent-session-metric"><strong>${point.correct}/${point.answered}</strong><small>correct</small></div>
        <div class="recent-session-metric"><strong>${Math.round(point.accuracy)}%</strong><small>accuracy</small></div>
        <div class="recent-session-metric"><strong>${(point.averageMs / 1000).toFixed(1)}s</strong><small>avg. answer</small></div>
      </div>
    `;
    container.append(row);
  });
}

function drawTrendChart(canvasId, emptyId, points, metric) {
  const canvas = document.querySelector(`#${canvasId}`);
  const empty = document.querySelector(`#${emptyId}`);
  canvas.hidden = points.length === 0;
  empty.hidden = points.length > 0;
  if (!points.length) return;

  const width = canvas.clientWidth || 420;
  const height = 190;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);

  const styles = getComputedStyle(document.documentElement);
  const lineColor = styles.getPropertyValue(metric === "accuracy" ? "--purple" : "--coral").trim();
  const gridColor = styles.getPropertyValue("--line").trim();
  const labelColor = styles.getPropertyValue("--muted").trim();
  const values = points.map((point) => metric === "accuracy" ? point.accuracy : point.averageMs / 1000);
  const maximum = metric === "accuracy" ? 100 : Math.max(5, Math.ceil(Math.max(...values) * 1.15));
  const padding = { top: 12, right: 12, bottom: 30, left: 38 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  context.font = '11px "DM Sans", system-ui, sans-serif';
  context.textAlign = "right";
  context.textBaseline = "middle";
  context.strokeStyle = gridColor;
  context.fillStyle = labelColor;
  context.lineWidth = 1;
  for (let step = 0; step <= 4; step += 1) {
    const y = padding.top + (plotHeight * step) / 4;
    const value = maximum - (maximum * step) / 4;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillText(metric === "accuracy" ? `${Math.round(value)}%` : `${value.toFixed(value < 10 ? 1 : 0)}s`, padding.left - 7, y);
  }

  const xFor = (index) => points.length === 1
    ? padding.left + plotWidth / 2
    : padding.left + (plotWidth * index) / (points.length - 1);
  const yFor = (value) => padding.top + plotHeight - (Math.min(value, maximum) / maximum) * plotHeight;
  const gradient = context.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  gradient.addColorStop(0, `${lineColor}38`);
  gradient.addColorStop(1, `${lineColor}00`);

  context.beginPath();
  values.forEach((value, index) => {
    const x = xFor(index);
    const y = yFor(value);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  if (points.length > 1) {
    context.lineTo(xFor(points.length - 1), height - padding.bottom);
    context.lineTo(xFor(0), height - padding.bottom);
    context.closePath();
    context.fillStyle = gradient;
    context.fill();
  }

  context.beginPath();
  values.forEach((value, index) => {
    const x = xFor(index);
    const y = yFor(value);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = lineColor;
  context.lineWidth = 3;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();

  values.forEach((value, index) => {
    context.beginPath();
    context.arc(xFor(index), yFor(value), 4, 0, Math.PI * 2);
    context.fillStyle = lineColor;
    context.fill();
  });

  context.fillStyle = labelColor;
  context.textBaseline = "bottom";
  const labelIndexes = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, index) => index);
  [...new Set(labelIndexes)].forEach((index) => {
    const label = new Date(points[index].startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    context.textAlign = index === 0 ? "left" : index === points.length - 1 ? "right" : "center";
    context.fillText(label, xFor(index), height - 5);
  });
  const firstValue = values[0];
  const lastValue = values[values.length - 1];
  canvas.setAttribute("aria-label", metric === "accuracy"
    ? `Accuracy trend across ${points.length} sessions, from ${Math.round(firstValue)} percent to ${Math.round(lastValue)} percent.`
    : `Answer speed trend across ${points.length} sessions, from ${firstValue.toFixed(1)} to ${lastValue.toFixed(1)} seconds per answer.`);
}

function resetProgress() {
  const confirmed = window.confirm("Reset all saved scores and mistakes on this device?");
  if (!confirmed) return;
  state.progress = defaultProgress();
  saveProgress();
  renderProgress();
  setPracticeMode(state.mode);
}

document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.viewTarget));
});

document.querySelector(".brand").addEventListener("click", (event) => {
  event.preventDefault();
  showView("learn");
});

subjectSelect.addEventListener("change", () => {
  state.subject = subjectSelect.value;
  renderFacts();
  updateSelectedTable();
  setPracticeMode(state.mode);
  renderProgress();
});

[learnTablePicker, practiceTablePicker].forEach((picker) => {
  picker.addEventListener("click", (event) => {
    const button = event.target.closest(".table-button");
    if (!button) return;
    state.selectedTable = Number(button.dataset.table);
    updateSelectedTable();
    renderFacts();
  });
});

document.querySelector("#cover-answers").addEventListener("click", (event) => {
  state.coverAnswers = !state.coverAnswers;
  event.currentTarget.setAttribute("aria-pressed", String(state.coverAnswers));
  event.currentTarget.innerHTML = state.coverAnswers
    ? '<span aria-hidden="true">◉</span> Show answers'
    : '<span aria-hidden="true">◉</span> Cover answers';
  renderFacts();
});

document.querySelector("#practice-current-table").addEventListener("click", () => {
  setPracticeMode("focused");
  showView("practice");
});

document.querySelectorAll(".mode-card").forEach((card) => {
  card.addEventListener("click", () => setPracticeMode(card.dataset.mode));
});

document.querySelector("#start-practice").addEventListener("click", startPractice);
document.querySelector("#answer-form").addEventListener("submit", answerQuestion);
document.querySelector("#next-question").addEventListener("click", nextQuestion);
document.querySelector("#show-hint").addEventListener("click", showHint);
document.querySelector("#quit-quiz").addEventListener("click", quitPractice);
document.querySelector("#practice-again").addEventListener("click", () => {
  document.querySelector("#results-panel").hidden = true;
  document.querySelector("#practice-setup").hidden = false;
});
document.querySelector("#review-round").addEventListener("click", () => {
  setPracticeMode("review");
  document.querySelector("#results-panel").hidden = true;
  document.querySelector("#practice-setup").hidden = false;
});
document.querySelector("#reset-progress").addEventListener("click", resetProgress);
document.querySelector("#analytics-table-select").addEventListener("change", (event) => {
  state.analyticsTable = Number(event.target.value);
  renderProgress();
});
document.querySelector("#practice-progress-table").addEventListener("click", () => {
  state.selectedTable = state.analyticsTable;
  updateSelectedTable();
  setPracticeMode("focused");
  showView("practice");
});

const installAppButton = document.querySelector("#install-app");
const themeToggleButton = document.querySelector("#theme-toggle");
const themeColorMeta = document.querySelector('meta[name="theme-color"]');

function updateThemeButton(theme) {
  const dark = theme === "dark";
  themeToggleButton.querySelector(".theme-icon").textContent = dark ? "☀" : "☾";
  themeToggleButton.querySelector(".theme-label").textContent = dark ? "Light" : "Dark";
  themeToggleButton.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} mode`);
  themeToggleButton.setAttribute("aria-pressed", String(dark));
  themeColorMeta.content = dark ? "#0d1117" : "#6557e8";
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem("mathy-theme", theme);
  updateThemeButton(theme);
  if (!document.querySelector("#progress-view").hidden) renderProgress();
}

updateThemeButton(document.documentElement.dataset.theme || "light");
themeToggleButton.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  setTheme(nextTheme);
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installAppButton.hidden = false;
});

installAppButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  if (choice.outcome === "accepted") installAppButton.hidden = true;
  deferredInstallPrompt = null;
});

window.addEventListener("appinstalled", () => {
  installAppButton.hidden = true;
  deferredInstallPrompt = null;
});

window.addEventListener("resize", () => {
  if (document.querySelector("#progress-view").hidden) return;
  window.cancelAnimationFrame(chartResizeFrame);
  chartResizeFrame = window.requestAnimationFrame(renderTableAnalytics);
});

window.addEventListener("pagehide", () => {
  if (state.activeSession) finalizeActiveSession("ended");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // The site remains fully usable if service workers are unavailable.
    });
  });
}

createTablePickers();
renderFacts();
renderProgress();
const initialView = ["learn", "practice", "progress"].includes(window.location.hash.slice(1))
  ? window.location.hash.slice(1)
  : "learn";
showView(initialView);
