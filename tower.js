// Tower – style grille complète 4x8
// - Toutes les tuiles visibles
// - Ligne active plus claire
// - 3 SAFE / 1 TRAP par ligne (une seule colonne TRAP)
// - SAFE = vert, TRAP = rouge (même en révélation secondaire)
// - Anti-bug Chrome : turnId + unlock garanti (finally)
// - Mode arcade / simulation (score fictif, aucun enjeu réel)
// - RNG robuste via crypto.getRandomValues

const STORAGE_KEY = "casino_crush_tower_grid_v4";

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

  // trapByRow[row] = index de la colonne TRAP (0..3)
  // => toutes les autres colonnes sont SAFE
  trapByRow: Array.from({ length: ROWS }, () => 0),

  // history entries: { row, col, result: "SAFE"|"TRAP" }
  history: [],

  // Token d’action pour éviter les races async (Chrome/rapid clicks)
  turnId: 0
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
    const ok =
      typeof s.activeRow === "number" &&
      Array.isArray(s.history) &&
      (Array.isArray(s.trapByRow) || Array.isArray(s.safeByRow));

    if (!ok) return structuredCloneSafe(defaultState);

    // Migration simple : si ancienne version avait safeByRow (1 SAFE),
    // on reconstruit trapByRow = une colonne différente de la SAFE
    let trapByRow = s.trapByRow;
    if (!Array.isArray(trapByRow) && Array.isArray(s.safeByRow)) {
      trapByRow = s.safeByRow.map((safeCol) => {
        const choices = [];
        for (let c = 0; c < COLS; c++) if (c !== safeCol) choices.push(c);
        return choices[randInt(choices.length)];
      });
    }

    return { ...structuredCloneSafe(defaultState), ...s, trapByRow };
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

function bumpTurnId() {
  // Incrémente pour invalider toute action async en cours
  return state.turnId + 1;
}

function resetAll() {
  const newTurn = bumpTurnId();
  state = structuredCloneSafe(defaultState);
  state.turnId = newTurn;
  save();
  render();
  ui.hint.textContent = "";
}

function start() {
  const newTurn = bumpTurnId();

  // Une TRAP par ligne : 3 SAFE / 1 TRAP
  const trapByRow = Array.from({ length: ROWS }, () => randInt(COLS));

  setState({
    turnId: newTurn,
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
  const newTurn = bumpTurnId(); // invalide les awaits en cours
  setState({ turnId: newTurn, running: false, locked: false });
  ui.hint.textContent = "Run terminée volontairement. Score conservé.";
}

async function onPick(row, col) {
  if (!state.running || state.locked) return;
  if (row !== state.activeRow) return;

  const myTurn = bumpTurnId();
  setState({ turnId: myTurn, locked: true });
  ui.hint.textContent = "Révélation…";

  try {
    const trapCol = state.trapByRow[row];
    const isSafe = (col !== trapCol);

    // Révéler la tuile cliquée
    revealTile(row, col, isSafe ? "SAFE" : "TRAP", false);

    // Si TRAP : fin
    if (!isSafe) {
      await delay(520);

      // Si un reset/stop/start est survenu, on abandonne proprement
      if (state.turnId !== myTurn) return;

      const history = [...state.history, { row, col, result: "TRAP" }];
      setState({ running: false, locked: false, history });
      ui.hint.textContent = "Mauvaise case (rouge). Partie terminée.";
      return;
    }

    // SAFE : révéler aussi la TRAP en secondaire (et rouge)
    await delay(260);
    if (state.turnId !== myTurn) return;
    revealTile(row, trapCol, "TRAP", true);

    await delay(260);
    if (state.turnId !== myTurn) return;

    const history = [...state.history, { row, col, result: "SAFE" }];
    const nextRow = row + 1;
    const newScore = state.score + POINTS_PER_SAFE;

    // Victoire si dernière ligne
    if (nextRow >= ROWS) {
      setState({ score: newScore, running: false, locked: false, history, activeRow: row });
      ui.hint.textContent = "Tour complétée. Bravo.";
      return;
    }

    setState({ score: newScore, activeRow: nextRow, locked: false, history });
    ui.hint.textContent = "Bonne case (vert). Ligne suivante.";
  } catch (e) {
    // Garantit qu’on ne reste jamais coincé sur "Révélation..."
    console.error("Tower error:", e);
    if (state.turnId === myTurn) {
      setState({ locked: false, running: false });
      ui.hint.textContent = "Erreur technique. Partie arrêtée (prévention de blocage).";
    }
  } finally {
    // Unlock garanti si on est encore sur le même turn et que locked est resté vrai
    if (state.turnId === myTurn && state.locked) {
      setState({ locked: false });
    }
  }
}

function revealTile(row, col, result, secondary) {
  const id = `tile-r${row}-c${col}`;
  const tile = document.getElementById(id);
  if (!tile) return;

  tile.classList.add("reveal");

  if (result === "SAFE") {
    tile.classList.remove("trap");
    tile.classList.add("safe");
  } else if (result === "TRAP") {
    // ✅ TRAP devient rouge même en secondary
    tile.classList.add("trap");
    // On n’efface pas "safe" ici : au cas où (rare) une tuile aurait déjà été safe,
    // mais normalement c'est une tuile distincte. Laisser les deux classes est évité
    // en CSS si besoin (ou on peut retirer safe, à ta préférence).
    tile.classList.remove("safe");
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
  // ✅ évite reset pendant reveal (source fréquente de "locked" coincé)
  if (ui.btnReset) ui.btnReset.disabled = state.locked;

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

  // Rendu du haut vers le bas (effet “tour”)
  for (let row = ROWS - 1; row >= 0; row--) {
    for (let col = 0; col < COLS; col++) {
      const tile = document.createElement("div");
      tile.id = `tile-r${row}-c${col}`;
      tile.className = "tower-tile";

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

      const main = document.createElement("div");
      main.textContent = ""; // look “bouton”
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

  // Réappliquer l’historique
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

// PWA SW registration
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

// Init
render();
