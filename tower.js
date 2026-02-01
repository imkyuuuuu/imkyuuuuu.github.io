// Tower – style grille complète 4x8
// - Toutes les tuiles visibles
// - Ligne active plus claire
// - SAFE = vert, TRAP = rouge
// - Mode arcade / simulation (score fictif, aucun enjeu réel)
// - RNG robuste via crypto.getRandomValues

const STORAGE_KEY = "casino_crush_tower_grid_v2";

const ROWS = 8;             // lignes
const COLS = 4;             // colonnes
const POINTS_PER_SAFE = 50; // points par ligne réussie

function randInt(maxExclusive) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % maxExclusive;
}

function el(id) { return document.getElementById(id); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

const ui = {
  grid: el("towerGrid"),
  floor: el("towerFloor"),
  score: el("towerScore"),
  status: el("towerStatus"),
  hint: el("towerHint"),
  log: el("towerLog"),

  btnStart: el("btnStartTower"),
  btnReset: el("btnResetTower"),
  btnStop: el("btnStopRun"),

  disclaimer: el("towerDisclaimer"),
  btnHideDisclaimer: el("btnHideTowerDisclaimer")
};

const defaultState = {
  showDisclaimer: true,
  running: false,
  locked: false,

  activeRow: 0,   // 0 = bas (1ère ligne à jouer), 7 = haut (dernière)
  score: 0,

  // safeByRow[row] = index de la colonne safe (0..3)
  safeByRow: Array.from({ length: ROWS }, () => 0),

  // history entries: { row, col, result: "SAFE"|"TRAP" }
  history: []
};

let state = load();

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredCloneSafe(defaultState);
    const s = JSON.parse(raw);

    // validation minimale
    if (typeof s.activeRow !== "number" || !Array.isArray(s.safeByRow) || !Array.isArray(s.history)) {
      return structuredCloneSafe(defaultState);
    }
    return { ...structuredCloneSafe(defaultState), ...s };
  } catch {
    return structuredCloneSafe(defaultState);
  }
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function setState(patch) {
  state = { ...state, ...patch };
  save();
  render();
}

function resetAll() {
  state = structuredCloneSafe(defaultState);
  save();
  render();
  ui.hint.textContent = "";
}

function start() {
  const trapByRow = Array.from({ length: ROWS }, () => randInt(COLS));
  setState({
    running: true,
    locked: false,
    activeRow: 0,
    score: 0,
    trapByRow,
    history: []
  });
  ui.hint.textContent = "Partie démarrée. Clique une tuile sur la ligne active.";
}

function stopRun() {
  if (!state.running) return;
  setState({ running: false, locked: false });
  ui.hint.textContent = "Run terminée volontairement. Score conservé.";
}

async function onPick(row, col) {
  if (!state.running || state.locked) return;
  if (row !== state.activeRow) return;

  setState({ locked: true });
  ui.hint.textContent = "Révélation…";

  const trapCol = state.trapByRow[row];
  const isSafe = (col === trapCol);

  // Révéler la tuile cliquée
  revealTile(row, col, isSafe ? "SAFE" : "TRAP", false);

  // Si échec, révéler aussi la tuile safe après un court délai
  if (!isSafe) {
    await delay(260);
    if (safeCol !== col) revealTile(row, safeCol, "SAFE", true);
    await delay(520);

    const history = [...state.history, { row, col, result: "TRAP" }];
    setState({ running: false, locked: false, history });
    ui.hint.textContent = "Mauvaise case (rouge). Partie terminée.";
    return;
  }

  // SAFE
  await delay(240);

  const history = [...state.history, { row, col, result: "SAFE" }];
  const nextRow = row + 1;
  const newScore = state.score + POINTS_PER_SAFE;

  // Victoire si on a réussi la dernière ligne
  if (nextRow >= ROWS) {
    setState({ score: newScore, running: false, locked: false, history, activeRow: row });
    ui.hint.textContent = "Tour complétée. Bravo.";
    return;
  }

  setState({ score: newScore, activeRow: nextRow, locked: false, history });
  ui.hint.textContent = "Bonne case (vert). Ligne suivante.";
}

function revealTile(row, col, result, secondary) {
  const id = `tile-r${row}-c${col}`;
  const tile = document.getElementById(id);
  if (!tile) return;

  tile.classList.add("reveal");

  // Ne pas écraser le rouge du choix du joueur avec un vert secondaire (cas trap)
  if (result === "SAFE") {
    tile.classList.remove("trap");
    tile.classList.add("safe");
  } else if (result === "TRAP" && !secondary) {
    tile.classList.remove("safe");
    tile.classList.add("trap");
  }

  const mini = tile.querySelector(".tower-mini");
  if (mini) mini.textContent = result;
}

function render() {
  // disclaimer
  if (ui.disclaimer) {
    ui.disclaimer.style.display = state.showDisclaimer ? "block" : "none";
  }

  // HUD
  ui.score.textContent = String(state.score);
  ui.status.textContent = state.running
    ? (state.locked ? "Révélation…" : "En cours")
    : (state.history.length ? "Terminé" : "Prêt");

  ui.floor.textContent = state.running ? `${state.activeRow + 1} / ${ROWS}` : "—";

  // Buttons
  ui.btnStop.disabled = !state.running || state.locked;

  // Log
  if (state.history.length === 0) {
    ui.log.textContent = "—";
  } else {
    ui.log.innerHTML = state.history
      .slice(-16)
      .map(h => `Ligne ${h.row + 1} : case ${h.col + 1} → ${h.result === "SAFE" ? "✅ SAFE" : "🟥 TRAP"}`)
      .join("<br/>");
  }

  renderGrid();
  save();
}

function renderGrid() {
  ui.grid.innerHTML = "";

  // On rend du haut vers le bas pour un effet “tour”
  for (let visualRow = ROWS - 1; visualRow >= 0; visualRow--) {
    const row = visualRow;

    for (let col = 0; col < COLS; col++) {
      const tile = document.createElement("div");
      tile.id = `tile-r${row}-c${col}`;
      tile.className = "tower-tile";

      // Style de ligne (future/active/past)
      if (state.running) {
        if (row === state.activeRow) tile.classList.add("active");
        else if (row > state.activeRow) tile.classList.add("future");
        else tile.classList.add("past");
      } else {
        tile.classList.add("past");
      }

      const disabled = !state.running || state.locked || row !== state.activeRow;
      tile.setAttribute("aria-disabled", disabled ? "true" : "false");

      const inner = document.createElement("div");
      inner.className = "tower-inner";

      // (Optionnel plus tard) image gem: inner.appendChild(img)
      const main = document.createElement("div");
      main.textContent = ""; // volontairement vide pour look “bouton”
      const mini = document.createElement("div");
      mini.className = "tower-mini";
      mini.textContent = (state.running && row === state.activeRow) ? `Ligne ${row + 1}` : "";

      inner.appendChild(main);
      inner.appendChild(mini);
      tile.appendChild(inner);

      tile.addEventListener("click", () => {
        if (disabled) return;
        onPick(row, col);
      });

      ui.grid.appendChild(tile);
    }
  }

  // Réappliquer l’historique après re-render
  for (const h of state.history) {
    revealTile(h.row, h.col, h.result, false);
  }
}

// Events
ui.btnStart.addEventListener("click", start);
ui.btnReset.addEventListener("click", resetAll);
ui.btnStop.addEventListener("click", stopRun);

if (ui.btnHideDisclaimer) {
  ui.btnHideDisclaimer.addEventListener("click", () => {
    setState({ showDisclaimer: false });
  });
}

// PWA SW registration (si présent)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

// Init
render();
