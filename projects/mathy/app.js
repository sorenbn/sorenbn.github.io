const TABLE_MIN = 1;
const TABLE_MAX = 12;
const STORAGE_KEY = "mathy-progress-v1";
let deferredInstallPrompt = null;

const defaultProgress = () => ({
  totalCorrect: 0,
  totalAnswered: 0,
  rounds: 0,
  bestStreak: 0,
  mistakes: {},
  tables: {
    multiplication: {},
    division: {},
  },
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
  progress: loadProgress(),
};

const subjectSelect = document.querySelector("#subject-select");
const learnTablePicker = document.querySelector("#learn-table-picker");
const practiceTablePicker = document.querySelector("#practice-table-picker");
const factGrid = document.querySelector("#fact-grid");

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return defaultProgress();
    return {
      ...defaultProgress(),
      ...saved,
      tables: {
        multiplication: saved.tables?.multiplication || {},
        division: saved.tables?.division || {},
      },
      mistakes: saved.mistakes || {},
    };
  } catch {
    return defaultProgress();
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
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
  if (viewName === "practice") resetPracticePanels();
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
  document.querySelector("#practice-setup").hidden = true;
  document.querySelector("#results-panel").hidden = true;
  document.querySelector("#quiz-panel").hidden = false;
  renderQuestion();
}

function renderQuestion() {
  const question = state.questions[state.currentIndex];
  state.answered = false;
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
}

function answerQuestion(event) {
  event.preventDefault();
  if (state.answered) return;
  const input = document.querySelector("#answer-input");
  if (input.value === "") return;

  const question = state.questions[state.currentIndex];
  const givenAnswer = Number(input.value);
  const correct = givenAnswer === question.answer;
  state.answered = true;
  state.progress.totalAnswered += 1;

  const tableStats = state.progress.tables[question.subject][question.table] || { correct: 0, answered: 0 };
  tableStats.answered += 1;

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
    state.progress.mistakes[question.key] = {
      subject: question.subject,
      table: question.table,
      value: question.value,
    };
  }
  state.progress.tables[question.subject][question.table] = tableStats;
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
  state.progress.rounds += 1;
  state.progress.bestStreak = Math.max(state.progress.bestStreak, state.roundBestStreak);
  saveProgress();
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
  document.querySelector("#review-round").hidden = state.missed.length === 0;
  document.querySelector("#header-best-streak").textContent = state.progress.bestStreak;
}

function resetPracticePanels() {
  document.querySelector("#practice-setup").hidden = false;
  document.querySelector("#quiz-panel").hidden = true;
  document.querySelector("#results-panel").hidden = true;
  setPracticeMode(state.mode);
}

function showHint() {
  const question = state.questions[state.currentIndex];
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
  document.querySelector("#total-correct").textContent = progress.totalCorrect;
  document.querySelector("#best-streak").textContent = progress.bestStreak;
  document.querySelector("#header-best-streak").textContent = progress.bestStreak;
  document.querySelector("#rounds-complete").textContent = progress.rounds;
  document.querySelector("#overall-accuracy").textContent = progress.totalAnswered
    ? `${Math.round((progress.totalCorrect / progress.totalAnswered) * 100)}%`
    : "—";
  document.querySelector("#mastery-heading").textContent = state.subject === "multiplication"
    ? "Multiplication mastery"
    : "Division mastery";

  const grid = document.querySelector("#mastery-grid");
  grid.innerHTML = "";
  for (let table = TABLE_MIN; table <= TABLE_MAX; table += 1) {
    const stats = progress.tables[state.subject][table] || { correct: 0, answered: 0 };
    const percent = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;
    const card = document.createElement("article");
    card.className = "mastery-card";
    card.innerHTML = `
      <span class="mastery-number">${table}</span>
      <div class="mastery-info">
        <strong>${tableName(table)}</strong>
        <small>${stats.answered ? `${stats.correct} of ${stats.answered} correct` : "Not practiced yet"}</small>
        <div class="mastery-bar" aria-hidden="true"><span style="width:${percent}%"></span></div>
      </div>
      <span class="mastery-percent">${stats.answered ? `${percent}%` : "—"}</span>
    `;
    grid.append(card);
  }
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
document.querySelector("#quit-quiz").addEventListener("click", resetPracticePanels);
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

const installAppButton = document.querySelector("#install-app");

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
