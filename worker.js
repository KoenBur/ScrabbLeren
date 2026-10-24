const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZĲ";
const TILE_COUNTS = {
  A: 6, B: 2, C: 2, D: 5, E: 18, F: 1, G: 3, H: 3, I: 4, J: 2, K: 3,
  L: 3, M: 3, N: 10, O: 6, P: 2, Q: 1, R: 5, S: 5, T: 5, U: 3, V: 2,
  W: 2, X: 1, Y: 1, Z: 2, "Ĳ": 1
};

let words = [];
let wordSet = new Set();
let alphagrams = new Map();
let defaultAlphagrams = new Map();
let wordsByLength = new Map();
let hookCandidates;
const hookCache = new Map();
const rackPools = new Map();
const cursors = new Map();

function normalize(value) {
  return value.toLocaleUpperCase("nl-NL").replace(/IJ/g, "Ĳ");
}

function display(value) {
  return value.replace(/Ĳ/g, "IJ");
}

function signature(word) {
  return Array.from(word).sort().join("");
}

function matchesRack(word, rack, blanks) {
  if (word.length > rack.length) return false;
  const counts = new Map(rack);
  let missing = 0;
  for (const tile of word) {
    const count = counts.get(tile) || 0;
    if (count) counts.set(tile, count - 1);
    else missing++;
  }
  return missing <= blanks;
}

function combinations(n, k) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let index = 1; index <= Math.min(k, n - k); index++) {
    result = result * (n - index + 1) / index;
  }
  return result;
}

function rackProbability(key) {
  let ways = 1;
  const needed = new Map();
  for (const tile of key) needed.set(tile, (needed.get(tile) || 0) + 1);
  for (const [tile, count] of needed) {
    ways *= combinations(TILE_COUNTS[tile], count);
    if (!ways) return 0;
  }
  return ways;
}

function rackPool(length, top) {
  const cacheKey = `${length}:${top}`;
  if (!rackPools.has(cacheKey)) {
    const candidates = [];
    for (const [key, entries] of alphagrams) {
      if (key.length === length && entries.length) candidates.push({ key, entries, probability: rackProbability(key) });
    }
    candidates.sort((left, right) => right.probability - left.probability || left.key.localeCompare(right.key));
    rackPools.set(cacheKey, candidates.slice(0, top));
  }
  return rackPools.get(cacheKey);
}

function nextRack(length, top, letter) {
  const pool = rackPool(length, letter ? alphagrams.size : top).filter(item => !letter || item.key.includes(letter));
  if (!pool.length) throw new Error(`Geen rekken gevonden met ${display(letter || "")}.`);
  const key = `${length}:${top}:${letter || ""}`;
  const index = (cursors.get(key) || 0) % pool.length;
  cursors.set(key, index + 1);
  return pool[index];
}

function randomItem(items) {
  if (!items.length) throw new Error("Er zijn geen passende woorden gevonden.");
  return items[Math.floor(Math.random() * items.length)];
}

function randomTile() {
  const total = Object.values(TILE_COUNTS).reduce((sum, count) => sum + count, 0);
  let draw = Math.random() * total;
  for (const [tile, count] of Object.entries(TILE_COUNTS)) {
    draw -= count;
    if (draw < 0) return tile;
  }
  return "E";
}

function hooks(word) {
  if (hookCache.has(word)) return hookCache.get(word);
  const before = [];
  const after = [];
  for (const tile of ALPHABET) {
    if (wordSet.has(tile + word)) before.push(tile);
    if (wordSet.has(word + tile)) after.push(tile);
  }
  const result = { before: before.join(""), after: after.join("") };
  hookCache.set(word, result);
  return result;
}

function randomHook(letter) {
  if (!hookCandidates) {
    hookCandidates = words.filter(word => {
      if (word.length < 2 || word.length > 7) return false;
      const result = hooks(word);
      return result.before || result.after;
    });
  }
  const candidates = letter ? hookCandidates.filter(word => word.includes(letter)) : hookCandidates;
  const word = randomItem(candidates);
  return { word, ...hooks(word) };
}

function parseRack(value) {
  const chunks = value.toLocaleUpperCase("nl-NL").split(/[\s,;]+/).filter(Boolean);
  const tiles = [];
  let blanks = 0;
  for (const chunk of chunks) {
    for (let index = 0; index < chunk.length; index++) {
      const current = chunk[index];
      if (current === "?") {
        blanks++;
      } else if (current === "I" && chunk[index + 1] === "J") {
        tiles.push("Ĳ");
        index++;
      } else if (/[A-Z]/.test(current)) {
        tiles.push(current);
      } else {
        throw new Error("Gebruik alleen letters en ? voor blanco's.");
      }
    }
  }
  if (!tiles.length && !blanks) throw new Error("Vul eerst een rek in.");
  if (tiles.length + blanks > 9) throw new Error("Een rek mag maximaal 9 tegels bevatten.");
  const counts = new Map();
  for (const tile of tiles) counts.set(tile, (counts.get(tile) || 0) + 1);
  return { counts, blanks, length: tiles.length + blanks };
}

function patternTokens(value) {
  const input = value.toLocaleUpperCase("nl-NL");
  const tokens = [];
  for (let index = 0; index < input.length; index++) {
    const current = input[index];
    if (current === "?" || current === "*") {
      tokens.push(current);
    } else if (current === "I" && input[index + 1] === "J") {
      tokens.push("Ĳ");
      index++;
    } else if (/[A-Z]/.test(current)) {
      tokens.push(current);
    } else {
      throw new Error("Gebruik in een patroon alleen letters, ? en *.");
    }
  }
  if (!tokens.length) throw new Error("Vul een patroon in.");
  return tokens;
}

function queryPattern(value) {
  const tokens = patternTokens(value);
  const expression = new RegExp("^" + tokens.map(token =>
    token === "?" ? "[A-ZĲ]" : token === "*" ? "[A-ZĲ]*" : token
  ).join("") + "$");
  return words.filter(word => expression.test(word)).slice(0, 1000);
}

function queryAnagrams(value) {
  const rack = parseRack(value);
  return words.filter(word => matchesRack(word, rack.counts, rack.blanks)).slice(0, 1000);
}

function shortPractice(length) {
  const valid = wordsByLength.get(Number(length)) || [];
  const invalidPool = [];
  for (let attempt = 0; attempt < 120; attempt++) {
    const source = Array.from(randomItem(valid));
    const position = Math.floor(Math.random() * source.length);
    source[position] = randomTile();
    const candidate = source.join("");
    if (!wordSet.has(candidate) && !invalidPool.includes(candidate)) invalidPool.push(candidate);
  }
  return Math.random() < 0.5
    ? { word: randomItem(valid), valid: true }
    : { word: randomItem(invalidPool), valid: false };
}

function loadWords(input, useDefaultAlphagrams = false) {
  words = Array.from(new Set(input)).filter(word =>
    typeof word === "string" && /^[A-ZĲ]{2,9}$/.test(word)
  );
  wordSet = new Set(words);
  wordsByLength = new Map();
  hookCandidates = undefined;
  hookCache.clear();
  for (const word of words) {
    if (!wordsByLength.has(word.length)) wordsByLength.set(word.length, []);
    wordsByLength.get(word.length).push(word);
  }
  if (useDefaultAlphagrams) {
    alphagrams = defaultAlphagrams;
  } else {
    alphagrams = new Map();
    for (const word of words) {
      const key = signature(word);
      if (!alphagrams.has(key)) alphagrams.set(key, []);
      alphagrams.get(key).push(word);
    }
  }
  rackPools.clear();
  cursors.clear();
}

async function loadDefaultAlphagrams() {
  const response = await fetch("./data/alphagrams.json");
  if (!response.ok) throw new Error(`Woordenlijst laden mislukt (${response.status}).`);
  defaultAlphagrams = new Map(Object.entries(await response.json()));
  alphagrams = defaultAlphagrams;
  self.postMessage({ type: "ready" });
}

async function handle(message) {
  switch (message.action) {
    case "setWords":
      loadWords(message.words, message.useDefaultAlphagrams === true);
      return { count: words.length };
    case "pattern":
      return queryPattern(message.value);
    case "anagrams":
      return queryAnagrams(message.value);
    case "hooks":
      return hooks(normalize(message.word));
    case "short":
      return shortPractice(Number(message.length));
    case "rack":
      return nextRack(Number(message.length), Math.max(1, Number(message.top) || 500), "");
    case "special":
      return message.kind === "hooks"
        ? randomHook(normalize(message.letter))
        : nextRack(Number(message.length) || 7, Math.max(1, Number(message.top) || 500), normalize(message.letter));
    default:
      throw new Error("Onbekende zoekopdracht.");
  }
}

self.addEventListener("message", async event => {
  const { id, action } = event.data;
  try {
    if (action !== "setWords" && !wordSet.size) throw new Error("De woordenlijst is nog niet klaar.");
    const result = await handle(event.data);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "Er ging iets mis." });
  }
});

loadDefaultAlphagrams().catch(error => {
  self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
});
