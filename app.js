const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZĲ";
const DB_NAME = "scrabbleren";
const DB_VERSION = 1;
const today = () => new Date().toLocaleDateString("sv-SE");
const showWord = value => value.replace(/Ĳ/g, "IJ");
const normalizeWord = value => value.toLocaleUpperCase("nl-NL").replace(/IJ/g, "Ĳ");

let db;
let activeList = "OpenTaal";
let dictionary = new Set();
let worker;
let workerReady;
let resolveWorkerReady;
let rejectWorkerReady;
let workerRequestId = 0;
const workerRequests = new Map();
const scores = { short: [0, 0], hooks: [0, 0], anagram: [0, 0], special: [0, 0] };
let currentShort;
let currentHook;
let currentRack;
let currentSpecial;
let dailyQueue = [];
let dailyIndex = 0;
let dailyCurrent;
let dailyAnswered = false;
let dailyNewRemaining = 0;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore("cards", { keyPath: "id" });
      database.createObjectStore("daily", { keyPath: "date" });
      database.createObjectStore("settings", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Lokale opslag openen mislukt."));
  });
}

function store(name, mode = "readonly") {
  return db.transaction(name, mode).objectStore(name);
}

function getAll(name) {
  return new Promise((resolve, reject) => {
    const request = store(name).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getRecord(name, key) {
  return new Promise((resolve, reject) => {
    const request = store(name).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getSetting(key) {
  return new Promise((resolve, reject) => {
    const request = store("settings").get(key);
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
}

function putRecord(name, record) {
  return new Promise((resolve, reject) => {
    const request = store(name, "readwrite").put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function deleteRecord(name, key) {
  return new Promise((resolve, reject) => {
    const request = store(name, "readwrite").delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function clearStore(name) {
  return new Promise((resolve, reject) => {
    const request = store(name, "readwrite").clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function workerCall(action, values = {}) {
  return new Promise((resolve, reject) => {
    const id = ++workerRequestId;
    workerRequests.set(id, { resolve, reject });
    worker.postMessage({ id, action, ...values });
  });
}

function initWorker() {
  if (!("Worker" in window)) throw new Error("Deze browser ondersteunt geen Web Workers.");
  workerReady = new Promise((resolve, reject) => {
    resolveWorkerReady = resolve;
    rejectWorkerReady = reject;
  });
  worker = new Worker("./worker.js");
  worker.addEventListener("message", event => {
    const message = event.data;
    if (message.type === "ready") {
      resolveWorkerReady();
      return;
    }
    if (message.type === "error") {
      if (activeList === "OpenTaal") setListError(message.message);
      rejectWorkerReady(new Error(message.message));
      return;
    }
    const request = workerRequests.get(message.id);
    if (!request) return;
    workerRequests.delete(message.id);
    if (message.error) request.reject(new Error(message.error));
    else request.resolve(message.result);
  });
  worker.addEventListener("error", event => {
    const error = new Error(`Oefenmodule is gestopt: ${event.message || "onbekende fout"}`);
    rejectWorkerReady(error);
    showFeedback("progress-feedback", error.message, "error");
  });
}

function setListError(message) {
  document.querySelector("#list-status").textContent = "Woordenlijst niet beschikbaar";
  document.querySelector(".status-dot").classList.remove("ready");
  showFeedback("progress-feedback", message, "error");
}

function setListStatus(text, ready) {
  document.querySelector("#list-status").textContent = text;
  document.querySelector(".status-dot").classList.toggle("ready", ready);
  document.querySelector("#active-list-description").textContent =
    activeList === "OpenTaal"
      ? "De OpenTaal-basislijst staat actief."
      : `${activeList} staat actief en blijft alleen op dit apparaat opgeslagen.`;
}

function showFeedback(id, message, tone = "") {
  const element = document.getElementById(id);
  element.textContent = message;
  element.classList.remove("success", "error");
  if (tone) element.classList.add(tone);
}

function renderAnswerFeedback(id, message, tone, words = []) {
  const element = document.getElementById(id);
  element.replaceChildren();
  element.classList.remove("success", "error");
  if (tone) element.classList.add(tone);
  const text = document.createElement("span");
  text.textContent = message;
  element.append(text);
  for (const item of words) {
    if (typeof item === "string") {
      appendWordTiles(element, item, "feedback-word");
      continue;
    }
    const group = document.createElement("span");
    group.className = "feedback-group";
    const label = document.createElement("strong");
    label.className = "answer-label";
    label.textContent = `${item.label}:`;
    group.append(label);
    if (item.words.length) {
      for (const word of item.words) appendWordTiles(group, word, "feedback-word");
    } else {
      group.append(document.createTextNode("geen"));
    }
    element.append(group);
  }
}

function setPage(page) {
  if (!document.getElementById(`page-${page}`)) page = "zoeken";
  document.querySelectorAll(".page").forEach(item => item.classList.toggle("active", item.id === `page-${page}`));
  document.querySelectorAll(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.page === page));
  if (page === "voortgang" && db) refreshProgress().catch(error => showFeedback("progress-feedback", error.message, "error"));
}

const TILE_VALUES = {
  A: 1, B: 3, C: 5, D: 2, E: 1, F: 4, G: 3, H: 4, I: 1, J: 4, K: 3,
  L: 3, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 2, S: 2, T: 2, U: 2, V: 4,
  W: 5, X: 8, Y: 8, Z: 4, "Ĳ": 4, "?": 0
};

function createTile(tile, className = "") {
  const item = document.createElement("span");
  item.className = `rack-tile${className ? ` ${className}` : ""}`;
  const score = TILE_VALUES[tile] ?? 0;
  item.setAttribute("aria-label", `${showWord(tile)}, ${score} ${score === 1 ? "punt" : "punten"}`);
  const letter = document.createElement("span");
  letter.className = "tile-letter";
  letter.textContent = tile === "?" ? "★" : showWord(tile);
  const value = document.createElement("small");
  value.className = "tile-value";
  value.textContent = TILE_VALUES[tile] ?? 0;
  item.append(letter, value);
  return item;
}

function appendWordTiles(container, word, className = "") {
  const wordElement = document.createElement("span");
  wordElement.className = `word-tiles${className ? ` ${className}` : ""}`;
  for (const tile of Array.from(normalizeWord(word))) wordElement.append(createTile(tile));
  container.append(wordElement);
  return wordElement;
}

function renderWordResults(container, words) {
  container.replaceChildren();
  if (!words.length) {
    container.textContent = "Geen woorden gevonden.";
    return;
  }
  const groups = new Map();
  for (const word of words.slice(0, 1000)) {
    const length = Array.from(word).length;
    if (!groups.has(length)) groups.set(length, []);
    groups.get(length).push(word);
  }
  for (const [length, entries] of [...groups].sort((left, right) => left[0] - right[0])) {
    const group = document.createElement("section");
    group.className = "result-group";
    const heading = document.createElement("h2");
    heading.textContent = `${length} ${length === 1 ? "tegel" : "tegels"} · ${entries.length}`;
    const list = document.createElement("div");
    list.className = "word-results";
    for (const word of entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "word-result";
      button.setAttribute("aria-label", `${showWord(word)} — toon haken`);
      appendWordTiles(button, word);
      button.addEventListener("click", async () => {
        const detail = document.querySelector("#lookup-hooks");
        detail.replaceChildren();
        let hooks;
        try {
          hooks = await workerCall("hooks", { word });
        } catch (error) {
          detail.textContent = `Haken niet beschikbaar: ${error.message}`;
          detail.classList.remove("hidden");
          return;
        }
        const title = document.createElement("strong");
        title.textContent = "Haken";
        detail.append(title);
        for (const [label, values] of [["Ervoor", hooks.before], ["Erna", hooks.after]]) {
          const row = document.createElement("div");
          row.className = "hook-result-row";
          const caption = document.createElement("span");
          caption.textContent = label;
          row.append(caption);
          if (values) {
            for (const tile of Array.from(values)) row.append(createTile(tile));
          } else {
            row.append(document.createTextNode("geen"));
          }
          detail.append(row);
        }
        detail.classList.remove("hidden");
      });
      list.append(button);
    }
    group.append(heading, list);
    container.append(group);
  }
  if (words.length > 1000) {
    const more = document.createElement("p");
    more.textContent = `En ${words.length - 1000} woorden meer.`;
    container.append(more);
  }
}

async function lookup() {
  const value = document.querySelector("#lookup-input").value.trim();
  const mode = document.querySelector("#lookup-mode").value;
  const result = document.querySelector("#lookup-result");
  result.textContent = "Zoeken…";
  try {
    if (!value) throw new Error("Vul een woord, patroon of rek in.");
    if (mode === "exact") {
      const found = dictionary.has(normalizeWord(value));
      document.querySelector("#lookup-hooks").classList.add("hidden");
      result.replaceChildren();
      const status = document.createElement("p");
      status.className = found ? "result-valid" : "result-invalid";
      status.textContent = found ? "Geldig" : "Niet gevonden";
      result.append(status);
      if (found) appendWordTiles(result, normalizeWord(value));
      return;
    }
    const matches = await workerCall(mode === "pattern" ? "pattern" : "anagrams", { value });
    const count = document.createElement("p");
    count.className = "result-count";
    count.textContent = `${matches.length} ${matches.length === 1 ? "resultaat" : "resultaten"}`;
    const words = document.createElement("div");
    words.className = "result-list";
    renderWordResults(words, matches);
    result.replaceChildren(count, words);
    document.querySelector("#lookup-hooks").classList.add("hidden");
  } catch (error) {
    result.textContent = error.message;
  }
}

function renderRack(element, rack) {
  element.replaceChildren(...Array.from(rack, tile => {
    return createTile(tile);
  }));
}

function updateScore(kind, elementId) {
  const [correct, total] = scores[kind];
  document.getElementById(elementId).textContent = `${correct} goed · ${total} beantwoord`;
}

async function recordAnswer(id, kind, correct, details = {}) {
  const previous = await getRecord("cards", id);
  const repetitions = correct ? (previous?.repetitions || 0) + 1 : 0;
  const ease = previous?.ease || 2.5;
  const nextEase = Math.max(1.3, ease + (correct ? 0.1 : -0.2));
  const interval = correct
    ? repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.max(1, Math.round((previous?.interval || 6) * nextEase))
    : 1;
  const due = new Date();
  due.setDate(due.getDate() + interval);
  const card = {
    ...(previous || {}),
    ...details,
    id,
    kind,
    repetitions,
    ease: nextEase,
    interval,
    due: due.toLocaleDateString("sv-SE"),
    lastReviewed: today(),
    reviews: (previous?.reviews || 0) + 1,
    correct: (previous?.correct || 0) + Number(correct)
  };
  await putRecord("cards", card);

  const date = today();
  const record = (await getAll("daily")).find(item => item.date === date) || { date, total: 0, correct: 0, byKind: {} };
  record.total++;
  record.correct += Number(correct);
  if (!previous) record.newCards = (record.newCards || 0) + 1;
  record.byKind[kind] ||= { total: 0, correct: 0 };
  record.byKind[kind].total++;
  record.byKind[kind].correct += Number(correct);
  await putRecord("daily", record);
}

async function shortNext() {
  const challenge = await workerCall("short", { length: document.querySelector("#short-length").value });
  currentShort = { ...challenge, id: `short:${challenge.word}`, answered: false };
  renderRack(document.querySelector("#short-word"), challenge.word);
  document.querySelector("#short-answers").classList.remove("hidden");
  document.querySelectorAll("#short-answers button").forEach(button => button.disabled = false);
  document.querySelector("#short-next").classList.add("hidden");
  showFeedback("short-feedback", "");
}

async function answerShort(valid) {
  if (!currentShort || currentShort.answered) return;
  currentShort.answered = true;
  const correct = currentShort.valid === valid;
  const buttons = document.querySelectorAll("#short-answers button");
  buttons.forEach(button => button.disabled = true);
  try {
    await recordAnswer(currentShort.id, "kort", correct, {
      challenge: "short",
      word: currentShort.word,
      valid: currentShort.valid
    });
  } catch (error) {
    currentShort.answered = false;
    buttons.forEach(button => button.disabled = false);
    throw error;
  }
  const [oldCorrect, total] = scores.short;
  scores.short = [oldCorrect + Number(correct), total + 1];
  updateScore("short", "short-score");
  renderAnswerFeedback(
    "short-feedback",
    `${correct ? "Goed gezien!" : "Helaas."} ${currentShort.valid ? "Wel" : "Geen"} geldig woord:`,
    correct ? "success" : "error",
    [currentShort.word]
  );
  document.querySelector("#short-answers").classList.add("hidden");
  document.querySelector("#short-next").classList.remove("hidden");
}

async function nextHook(target, word, feedback) {
  const result = await workerCall("hooks", { word });
  currentHook = { word, ...result, id: `hooks:${word}` };
  renderRack(document.querySelector(`#${target}`), word);
  document.querySelector("#hook-before").value = "";
  document.querySelector("#hook-after").value = "";
  showFeedback(feedback, "");
}

async function hookChallenge() {
  const challenge = await workerCall("special", { kind: "hooks", letter: "", length: 7 });
  await nextHook("hook-word", challenge.word, "hook-feedback");
}

function sortedTileSet(value) {
  return Array.from(new Set(normalizeWord(value).replace(/[^A-ZĲ]/g, ""))).sort().join("");
}

async function checkHook() {
  if (!currentHook) return;
  const before = sortedTileSet(document.querySelector("#hook-before").value);
  const after = sortedTileSet(document.querySelector("#hook-after").value);
  const correct = before === currentHook.before && after === currentHook.after;
  await recordAnswer(currentHook.id, "haken", correct, {
    challenge: "hooks",
    word: currentHook.word,
    before: currentHook.before,
    after: currentHook.after
  });
  const [oldCorrect, total] = scores.hooks;
  scores.hooks = [oldCorrect + Number(correct), total + 1];
  updateScore("hooks", "hook-score");
  renderAnswerFeedback(
    "hook-feedback",
    correct ? "Alles goed!" : "Niet alles gevonden. Haken:",
    correct ? "success" : "error",
    [
      { label: "Ervoor", words: Array.from(currentHook.before) },
      { label: "Erna", words: Array.from(currentHook.after) }
    ]
  );
}

function refreshExercises() {
  shortNext().catch(error => showFeedback("short-feedback", error.message, "error"));
  hookChallenge().catch(error => showFeedback("hook-feedback", error.message, "error"));
  nextRack().catch(error => showFeedback("anagram-feedback", error.message, "error"));
  nextSpecial().catch(error => showFeedback("special-feedback", error.message, "error"));
}

async function nextRack() {
  const length = Number(document.querySelector("#rack-length").value);
  const top = Number(document.querySelector("#rack-top").value);
  if (!Number.isInteger(top) || top < 1 || top > 5000) throw new Error("Kies een waarschijnlijkheidsbereik van 1 t/m 5.000.");
  currentRack = await workerCall("rack", { length, top });
  renderRack(document.querySelector("#rack-display"), currentRack.key);
  document.querySelector("#anagram-answer").value = "";
  showFeedback("anagram-feedback", "");
}

async function checkRack() {
  if (!currentRack) return;
  const answers = document.querySelector("#anagram-answer").value.split(/[\s,;]+/).map(normalizeWord).filter(Boolean);
  const unique = Array.from(new Set(answers));
  const valid = unique.filter(word => currentRack.entries.includes(word));
  const invalid = unique.filter(word => !currentRack.entries.includes(word));
  const missed = currentRack.entries.filter(word => !unique.includes(word));
  const correct = valid.length > 0 && invalid.length === 0 && missed.length === 0;
  await recordAnswer(`anagram:${currentRack.key}`, "alfagram", correct, {
    challenge: "anagram",
    rack: currentRack.key,
    entries: currentRack.entries
  });
  const [oldCorrect, total] = scores.anagram;
  scores.anagram = [oldCorrect + Number(correct), total + 1];
  updateScore("anagram", "anagram-score");
  renderAnswerFeedback(
    "anagram-feedback",
    correct ? "Perfect!" : "Oplossing:",
    correct ? "success" : "error",
    correct
      ? valid
      : [
          { label: "Goed", words: valid },
          { label: "Gemist", words: missed.slice(0, 30) },
          { label: "Ongeldig", words: invalid.slice(0, 10) }
        ]
  );
}

function specialKind() {
  return document.querySelector("#special-kind").value;
}

async function nextSpecial() {
  const kind = specialKind();
  const letter = normalizeWord(document.querySelector("#special-letter").value);
  currentSpecial = await workerCall("special", { kind, letter, length: 7, top: Number(document.querySelector("#rack-top").value) || 500 });
  const prompt = document.querySelector("#special-prompt");
  if (kind === "anagram") {
    renderRack(prompt, currentSpecial.key);
    document.querySelector("#special-anagram").classList.remove("hidden");
    document.querySelector("#special-hooks").classList.add("hidden");
    document.querySelector("#special-answer").value = "";
  } else {
    renderRack(prompt, currentSpecial.word);
    document.querySelector("#special-anagram").classList.add("hidden");
    document.querySelector("#special-hooks").classList.remove("hidden");
    document.querySelector("#special-before").value = "";
    document.querySelector("#special-after").value = "";
  }
  showFeedback("special-feedback", "");
}

async function checkSpecial() {
  if (!currentSpecial) return;
  let correct;
  let answer;
  if (specialKind() === "anagram") {
    const entries = document.querySelector("#special-answer").value.split(/[\s,;]+/).map(normalizeWord).filter(Boolean);
    const unique = Array.from(new Set(entries));
    correct = unique.length > 0 && unique.every(word => currentSpecial.entries.includes(word)) &&
      currentSpecial.entries.every(word => unique.includes(word));
    answer = "Antwoorden:";
  } else {
    const before = sortedTileSet(document.querySelector("#special-before").value);
    const after = sortedTileSet(document.querySelector("#special-after").value);
    correct = before === currentSpecial.before && after === currentSpecial.after;
    answer = "Ervoor · erna:";
  }
  await recordAnswer(`special:${specialKind()}:${currentSpecial.key || currentSpecial.word}`, "dure letters", correct, {
    challenge: specialKind(),
    ...(currentSpecial.key ? { rack: currentSpecial.key, entries: currentSpecial.entries } : {
      word: currentSpecial.word, before: currentSpecial.before, after: currentSpecial.after
    })
  });
  const [oldCorrect, total] = scores.special;
  scores.special = [oldCorrect + Number(correct), total + 1];
  updateScore("special", "special-score");
  const answers = specialKind() === "anagram"
    ? [{ label: "Antwoorden", words: currentSpecial.entries }]
    : [
        { label: "Ervoor", words: Array.from(currentSpecial.before) },
        { label: "Erna", words: Array.from(currentSpecial.after) }
      ];
  renderAnswerFeedback("special-feedback", `${correct ? "Goed!" : "Nog niet helemaal."} ${answer}`, correct ? "success" : "error", answers);
}

async function refreshProgress() {
  const cards = await getAll("cards");
  const daily = await getAll("daily");
  const now = today();
  const due = cards.filter(card => card.due <= now).length;
  const newLimit = (await getSetting("newCardsPerDay")) ?? 10;
  const usedNew = daily.find(record => record.date === now)?.newCards || 0;
  dailyNewRemaining = Math.max(0, newLimit - usedNew);
  document.querySelector("#daily-due").textContent = `${due} te herhalen · ${dailyNewRemaining} nieuw`;
  document.querySelector("#daily-progress-count").textContent = `${due} te herhalen · ${dailyNewRemaining} nieuw`;
  document.querySelector("#stat-learned").textContent = cards.filter(card => card.repetitions > 0).length;
  const total = daily.reduce((sum, record) => sum + record.total, 0);
  const correct = daily.reduce((sum, record) => sum + record.correct, 0);
  document.querySelector("#stat-accuracy").textContent = total ? `${Math.round(correct / total * 100)}%` : "—";
  const labels = { kort: "Korte woorden", haken: "Haken", alfagram: "Alfagrammen", "dure letters": "Dure letters" };
  const byKind = {};
  for (const record of daily) {
    for (const [kind, result] of Object.entries(record.byKind || {})) {
      byKind[kind] ||= { total: 0, correct: 0 };
      byKind[kind].total += result.total;
      byKind[kind].correct += result.correct;
    }
  }
  document.querySelector("#exercise-accuracy").replaceChildren(...Object.entries(labels).map(([kind, label]) => {
    const item = document.createElement("span");
    const result = byKind[kind];
    item.textContent = `${label}: ${result?.total ? Math.round(result.correct / result.total * 100) + "%" : "—"}`;
    return item;
  }));
  const activeDays = new Set(daily.filter(record => record.total > 0).map(record => record.date));
  let streak = 0;
  const date = new Date();
  if (!activeDays.has(date.toLocaleDateString("sv-SE"))) date.setDate(date.getDate() - 1);
  while (activeDays.has(date.toLocaleDateString("sv-SE"))) {
    streak++;
    date.setDate(date.getDate() - 1);
  }
  document.querySelector("#stat-streak").textContent = streak;
}

async function makeDailyQueue() {
  const cards = await getAll("cards");
  const existing = new Set(cards.map(card => card.id));
  const queue = cards
    .filter(card => card.due <= today())
    .sort((left, right) => left.due.localeCompare(right.due))
    .map(card => ({ ...card, isNew: false }));
  const count = Number(document.querySelector("#daily-new-count").value);
  if (!Number.isInteger(count) || count < 0 || count > 50) throw new Error("Kies 0 t/m 50 nieuwe kaarten.");
  const usedNew = (await getRecord("daily", today()))?.newCards || 0;
  const remainingNew = Math.max(0, count - usedNew);
  dailyNewRemaining = remainingNew;

  for (let attempt = 0; queue.filter(card => card.isNew).length < remainingNew && attempt < remainingNew * 4 + 10; attempt++) {
    const kind = ["short", "hooks", "anagram"][Math.floor(Math.random() * 3)];
    let card;
    if (kind === "short") {
      const result = await workerCall("short", { length: Math.random() < 0.5 ? 2 : 3 });
      card = { id: `short:${result.word}`, kind: "kort", challenge: "short", word: result.word, valid: result.valid };
    } else if (kind === "hooks") {
      const result = await workerCall("special", { kind: "hooks", letter: "" });
      card = { id: `hooks:${result.word}`, kind: "haken", challenge: "hooks", word: result.word, before: result.before, after: result.after };
    } else {
      const result = await workerCall("rack", { length: 7, top: 500 });
      card = { id: `anagram:${result.key}`, kind: "alfagram", challenge: "anagram", rack: result.key, entries: result.entries };
    }
    if (!existing.has(card.id)) {
      existing.add(card.id);
      queue.push({ ...card, isNew: true });
    }
  }
  return queue;
}

function renderDailyCard() {
  if (dailyIndex >= dailyQueue.length) {
    dailyCurrent = null;
    document.querySelector("#daily-prompt").textContent = "Klaar voor vandaag — goed gewerkt!";
    document.querySelector("#daily-display").replaceChildren();
    document.querySelector("#daily-input-area").replaceChildren();
    document.querySelector("#daily-check").classList.add("hidden");
    document.querySelector("#daily-next").classList.add("hidden");
    showFeedback("daily-feedback", `${dailyQueue.length} kaarten geoefend.`, "success");
    refreshProgress().catch(error => showFeedback("progress-feedback", error.message, "error"));
    return;
  }
  dailyCurrent = dailyQueue[dailyIndex];
  dailyAnswered = false;
  document.querySelector("#daily-check").classList.remove("hidden");
  document.querySelector("#daily-next").classList.add("hidden");
  document.querySelector("#daily-prompt").textContent =
    dailyCurrent.challenge === "short" ? "Is dit een geldig woord?" :
      dailyCurrent.challenge === "hooks" ? "Welke tegels haken ervoor en erachter?" : "Typ alle geldige anagrammen.";
  const display = document.querySelector("#daily-display");
  const area = document.querySelector("#daily-input-area");
  area.replaceChildren();
  if (dailyCurrent.challenge === "short") {
    renderRack(display, dailyCurrent.word);
    const buttons = document.createElement("div");
    buttons.className = "answer-buttons";
    for (const valid of [true, false]) {
      const button = document.createElement("button");
      button.className = `button answer-button${valid ? "" : " secondary"}`;
      button.textContent = valid ? "✓ Geldig" : "✕ Ongeldig";
      button.addEventListener("click", () => checkDaily(valid).catch(error => showFeedback("daily-feedback", error.message, "error")));
      buttons.append(button);
    }
    area.append(buttons);
  } else if (dailyCurrent.challenge === "hooks") {
    renderRack(display, dailyCurrent.word);
    area.innerHTML = '<div class="hook-inputs"><label>Voor het woord<input id="daily-before" type="text" autocomplete="off" spellcheck="false"></label><label>Achter het woord<input id="daily-after" type="text" autocomplete="off" spellcheck="false"></label></div>';
  } else {
    renderRack(display, dailyCurrent.rack);
    area.innerHTML = '<label for="daily-words">Jouw woorden</label><input id="daily-words" type="text" placeholder="Scheid met spaties of komma’s" autocomplete="off" spellcheck="false">';
  }
  showFeedback("daily-feedback", "");
}

async function checkDaily(shortAnswer) {
  if (!dailyCurrent || dailyAnswered) return;
  let correct = false;
  let answer = "";
  if (dailyCurrent.challenge === "short") {
    correct = dailyCurrent.valid === shortAnswer;
    answer = "Woord:";
  } else if (dailyCurrent.challenge === "hooks") {
    const before = sortedTileSet(document.querySelector("#daily-before").value);
    const after = sortedTileSet(document.querySelector("#daily-after").value);
    correct = before === dailyCurrent.before && after === dailyCurrent.after;
    answer = "Ervoor · erna:";
  } else {
    const values = document.querySelector("#daily-words").value.split(/[\s,;]+/).map(normalizeWord).filter(Boolean);
    const unique = Array.from(new Set(values));
    correct = unique.length > 0 && unique.every(word => dailyCurrent.entries.includes(word)) &&
      dailyCurrent.entries.every(word => unique.includes(word));
    answer = "Antwoorden:";
  }
  dailyAnswered = true;
  await recordAnswer(dailyCurrent.id, dailyCurrent.kind, correct, {
    challenge: dailyCurrent.challenge,
    word: dailyCurrent.word,
    valid: dailyCurrent.valid,
    before: dailyCurrent.before,
    after: dailyCurrent.after,
    rack: dailyCurrent.rack,
    entries: dailyCurrent.entries
  });
  document.querySelector("#daily-check").classList.add("hidden");
  document.querySelector("#daily-next").classList.remove("hidden");
  const answerWords = dailyCurrent.challenge === "short"
    ? [dailyCurrent.word]
    : dailyCurrent.challenge === "hooks"
      ? [
          { label: "Ervoor", words: Array.from(dailyCurrent.before) },
          { label: "Erna", words: Array.from(dailyCurrent.after) }
        ]
      : [{ label: "Antwoorden", words: dailyCurrent.entries }];
  renderAnswerFeedback("daily-feedback", `${correct ? "Goed!" : "Nog niet helemaal."} ${answer}`, correct ? "success" : "error", answerWords);
}

async function startDaily() {
  const button = document.querySelector("#daily-start");
  button.disabled = true;
  try {
    dailyQueue = await makeDailyQueue();
    dailyIndex = 0;
    document.querySelector("#daily-practice").classList.remove("hidden");
    if (!dailyQueue.length) {
      renderDailyCard();
      showFeedback(
        "daily-feedback",
        dailyNewRemaining === 0
          ? "Je hebt het dagdoel voor nieuwe kaarten bereikt. Kom morgen terug of verhoog het dagdoel."
          : "Er staan nu geen kaarten klaar om te herhalen.",
        ""
      );
      return;
    }
    document.querySelector("#daily-feedback").textContent = "";
    renderDailyCard();
  } finally {
    button.disabled = false;
  }
}

function validateImportedProgress(data) {
  if (!data || data.format !== "scrabbleren-progress" || data.version !== 1 ||
      !Array.isArray(data.cards) || !Array.isArray(data.daily) ||
      data.cards.length > 100000 || data.daily.length > 10000) {
    throw new Error("Dit JSON-bestand is geen geldige ScrabbLeren-voortgangsbackup.");
  }
  const cards = data.cards.filter(card =>
    card && typeof card.id === "string" && card.id.length <= 200 &&
    typeof card.kind === "string" && Number.isInteger(card.repetitions) &&
    card.repetitions >= 0 && Number.isFinite(card.ease) &&
    Number.isInteger(card.interval) && card.interval >= 0 &&
    ["short", "hooks", "anagram"].includes(card.challenge) &&
    /^\d{4}-\d{2}-\d{2}$/.test(card.due)
  );
  const daily = data.daily.filter(record =>
    record && /^\d{4}-\d{2}-\d{2}$/.test(record.date) &&
    Number.isInteger(record.total) && record.total >= 0 &&
    Number.isInteger(record.correct) && record.correct >= 0 && record.correct <= record.total &&
    (record.newCards === undefined || (Number.isInteger(record.newCards) && record.newCards >= 0 && record.newCards <= record.total))
  );
  if (cards.length !== data.cards.length || daily.length !== data.daily.length) {
    throw new Error("De backup bevat ongeldige voortgangsgegevens.");
  }
  for (const card of cards) {
    if ((card.challenge === "short" && (typeof card.word !== "string" || typeof card.valid !== "boolean")) ||
        (card.challenge === "hooks" && (typeof card.word !== "string" || typeof card.before !== "string" || typeof card.after !== "string")) ||
        (card.challenge === "anagram" && (typeof card.rack !== "string" || !Array.isArray(card.entries)))) {
      throw new Error("De backup mist oefengegevens voor een kaart.");
    }
  }
  return { cards, daily };
}

async function uploadWordlist(file) {
  if (!file) return;
  const text = await file.text();
  const words = new Set();
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim();
    if (!/^[a-zA-Z]+$/.test(raw)) continue;
    const word = normalizeWord(raw);
    if (word.length >= 2 && word.length <= 9) words.add(word);
  }
  if (!words.size) throw new Error("Geen bruikbare woorden gevonden. Gebruik losse woorden van 2 t/m 9 tegels per regel.");
  const wordArray = Array.from(words);
  await putRecord("settings", { key: "customWords", value: wordArray });
  await putRecord("settings", { key: "activeList", value: file.name });
  dictionary = new Set(wordArray);
  activeList = file.name;
  await workerCall("setWords", { words: wordArray });
  setListStatus(`${file.name} · ${wordArray.length.toLocaleString("nl-NL")} woorden`, true);
  showFeedback("progress-feedback", `${wordArray.length.toLocaleString("nl-NL")} woorden lokaal opgeslagen.`, "success");
  refreshExercises();
}

async function resetWordlist() {
  await deleteRecord("settings", "customWords");
  await deleteRecord("settings", "activeList");
  const response = await fetch("./data/words.txt");
  if (!response.ok) throw new Error(`OpenTaal-lijst laden mislukt (${response.status}).`);
  const words = (await response.text()).split(/\r?\n/).filter(Boolean);
  dictionary = new Set(words);
  activeList = "OpenTaal";
  await workerCall("setWords", { words, useDefaultAlphagrams: true });
  setListStatus(`OpenTaal · ${words.length.toLocaleString("nl-NL")} woorden`, true);
  showFeedback("progress-feedback", "De OpenTaal-basislijst staat actief.", "success");
  refreshExercises();
}

function exportProgress() {
  Promise.all([getAll("cards"), getAll("daily"), getSetting("newCardsPerDay")]).then(([cards, daily, newCards]) => {
    const backup = { format: "scrabbleren-progress", version: 1, exportedAt: new Date().toISOString(), cards, daily, settings: { newCardsPerDay: newCards ?? 10 } };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `scrabbleren-voortgang-${today()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showFeedback("progress-feedback", "Voortgang geëxporteerd.", "success");
  }).catch(error => showFeedback("progress-feedback", error.message, "error"));
}

async function importProgress(file) {
  if (!file) return;
  if (file.size > 20_000_000) throw new Error("Dit bestand is groter dan 20 MB.");
  const data = JSON.parse(await file.text());
  const { cards, daily } = validateImportedProgress(data);
  await clearStore("cards");
  await clearStore("daily");
  for (const card of cards) await putRecord("cards", card);
  for (const record of daily) await putRecord("daily", record);
  const newCards = Number(data.settings?.newCardsPerDay);
  if (Number.isInteger(newCards) && newCards >= 0 && newCards <= 50) {
    await putRecord("settings", { key: "newCardsPerDay", value: newCards });
    document.querySelector("#daily-new-count").value = newCards;
  }
  await refreshProgress();
  showFeedback("progress-feedback", `Voortgang geïmporteerd (${cards.length} kaarten).`, "success");
}

function installKeyboardShortcuts() {
  document.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      const target = event.target;
      if (target.id === "lookup-input") {
        event.preventDefault();
        lookup();
      } else if (target.id === "hook-before" || target.id === "hook-after") {
        event.preventDefault();
        checkHook();
      } else if (target.id === "anagram-answer") {
        event.preventDefault();
        checkRack();
      } else if (target.id === "special-answer" || target.id === "special-before" || target.id === "special-after") {
        event.preventDefault();
        checkSpecial();
      } else if (target.id === "daily-words" || target.id === "daily-before" || target.id === "daily-after") {
        event.preventDefault();
        checkDaily();
      }
    }
    if (event.code === "Space" && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName)) {
      const active = document.querySelector(".page.active");
      if (active.id === "page-haken") {
        event.preventDefault();
        document.querySelector("#hook-next").click();
      } else if (active.id === "page-kort" && !document.querySelector("#short-next").classList.contains("hidden")) {
        event.preventDefault();
        document.querySelector("#short-next").click();
      } else if (active.id === "page-alfagrammen") {
        event.preventDefault();
        document.querySelector("#anagram-next").click();
      } else if (active.id === "page-duur") {
        event.preventDefault();
        document.querySelector("#special-next").click();
      } else if (active.id === "page-voortgang" && dailyCurrent && dailyAnswered) {
        event.preventDefault();
        document.querySelector("#daily-next").click();
      }
    }
  });
}

async function initialize() {
  if (!("indexedDB" in window)) throw new Error("Deze browser ondersteunt geen lokale IndexedDB-opslag.");
  db = await openDatabase();
  initWorker();
  await workerReady;
  const [customWords, storedList, storedCount] = await Promise.all([
    getSetting("customWords"), getSetting("activeList"), getSetting("newCardsPerDay")
  ]);
  document.querySelector("#daily-new-count").value = storedCount ?? 10;

  const response = await fetch("./data/words.txt");
  if (!response.ok) throw new Error(`OpenTaal-woordenlijst laden mislukt (${response.status}).`);
  const baseWords = (await response.text()).split(/\r?\n/).filter(Boolean);
  dictionary = new Set(customWords || baseWords);
  activeList = customWords ? (storedList || "Eigen woordenlijst") : "OpenTaal";
  await workerCall("setWords", {
    words: customWords || baseWords,
    useDefaultAlphagrams: !customWords
  });
  setListStatus(`${activeList} · ${dictionary.size.toLocaleString("nl-NL")} woorden`, true);
  await refreshProgress();
}

function bindEvents() {
  document.querySelectorAll("[data-page]").forEach(link => link.addEventListener("click", event => {
    event.preventDefault();
    const page = link.dataset.page;
    location.hash = page;
    setPage(page);
  }));
  window.addEventListener("hashchange", () => setPage(location.hash.slice(1)));
  document.querySelectorAll(".mode-button").forEach(button => button.addEventListener("click", () => {
    const mode = button.dataset.mode;
    document.querySelector("#lookup-mode").value = mode;
    document.querySelectorAll(".mode-button").forEach(item => {
      const selected = item === button;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    const hints = { exact: "Typ een woord", pattern: "Gebruik ? en *", rack: "Typ je rek; ? is blanco" };
    document.querySelector("#lookup-input").placeholder = hints[mode];
    document.querySelector("#lookup-input").focus();
  }));
  document.querySelector("#lookup-input").addEventListener("input", event => {
    const value = normalizeWord(event.target.value).replace(/[^A-ZĲ?]/g, "");
    renderRack(document.querySelector("#lookup-preview"), value);
  });
  document.querySelector("#lookup-button").addEventListener("click", lookup);
  document.querySelector("#short-length").addEventListener("change", () => shortNext().catch(error => showFeedback("short-feedback", error.message, "error")));
  document.querySelector("#short-next").addEventListener("click", () => shortNext().catch(error => showFeedback("short-feedback", error.message, "error")));
  document.querySelectorAll(".answer-button").forEach(button => button.addEventListener("click", () =>
    answerShort(button.dataset.valid === "true").catch(error => showFeedback("short-feedback", error.message, "error"))
  ));
  document.querySelector("#hook-check").addEventListener("click", () => checkHook().catch(error => showFeedback("hook-feedback", error.message, "error")));
  document.querySelector("#hook-next").addEventListener("click", () => hookChallenge().catch(error => showFeedback("hook-feedback", error.message, "error")));
  document.querySelector("#anagram-check").addEventListener("click", () => checkRack().catch(error => showFeedback("anagram-feedback", error.message, "error")));
  document.querySelector("#anagram-next").addEventListener("click", () => nextRack().catch(error => showFeedback("anagram-feedback", error.message, "error")));
  document.querySelector("#rack-length").addEventListener("change", () => nextRack().catch(error => showFeedback("anagram-feedback", error.message, "error")));
  document.querySelector("#rack-top").addEventListener("change", () => nextRack().catch(error => showFeedback("anagram-feedback", error.message, "error")));
  document.querySelector("#special-kind").addEventListener("change", () => nextSpecial().catch(error => showFeedback("special-feedback", error.message, "error")));
  document.querySelector("#special-letter").addEventListener("change", () => nextSpecial().catch(error => showFeedback("special-feedback", error.message, "error")));
  document.querySelector("#special-check").addEventListener("click", () => checkSpecial().catch(error => showFeedback("special-feedback", error.message, "error")));
  document.querySelector("#special-next").addEventListener("click", () => nextSpecial().catch(error => showFeedback("special-feedback", error.message, "error")));
  document.querySelector("#daily-start").addEventListener("click", () => {
    location.hash = "voortgang";
    setPage("voortgang");
    startDaily().catch(error => showFeedback("progress-feedback", error.message, "error"));
  });
  document.querySelector("#daily-check").addEventListener("click", () => checkDaily().catch(error => showFeedback("daily-feedback", error.message, "error")));
  document.querySelector("#daily-next").addEventListener("click", () => {
    dailyIndex++;
    renderDailyCard();
  });
  document.querySelector("#daily-new-count").addEventListener("change", event => {
    const value = Number(event.target.value);
    if (Number.isInteger(value) && value >= 0 && value <= 50) {
      putRecord("settings", { key: "newCardsPerDay", value }).catch(error => showFeedback("progress-feedback", error.message, "error"));
    }
  });
  document.querySelector("#wordlist-file").addEventListener("change", event => {
    uploadWordlist(event.target.files[0]).catch(error => showFeedback("progress-feedback", error.message, "error"));
    event.target.value = "";
  });
  document.querySelector("#reset-list").addEventListener("click", () => resetWordlist().catch(error => showFeedback("progress-feedback", error.message, "error")));
  document.querySelector("#export-progress").addEventListener("click", exportProgress);
  document.querySelector("#progress-file").addEventListener("change", event => {
    importProgress(event.target.files[0]).catch(error => showFeedback("progress-feedback", error.message, "error"));
    event.target.value = "";
  });
  installKeyboardShortcuts();
}

async function main() {
  bindEvents();
  setPage(location.hash.slice(1) || "zoeken");
  try {
    await initialize();
    shortNext().catch(error => showFeedback("short-feedback", error.message, "error"));
    hookChallenge().catch(error => showFeedback("hook-feedback", error.message, "error"));
    nextRack().catch(error => showFeedback("anagram-feedback", error.message, "error"));
    nextSpecial().catch(error => showFeedback("special-feedback", error.message, "error"));
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("./sw.js").catch(error => setListError(`Offline-opslag registreren mislukt: ${error.message}`));
    }
  } catch (error) {
    setListError(error.message);
  }
}

main();
