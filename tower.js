// tower.js (MODULE)
// Tower – grille 4x8
// - 3 SAFE / 1 TRAP par ligne
// - SAFE = vert, TRAP = rouge (y compris en révélation secondaire)
// - Anti-bug Chrome : turnId + unlock garanti (finally)
// - Intégration crédits Firebase (Firestore) via credits.js
//
// Pré-requis:
// - auth-ui.js expose window.CC_CURRENT_USER (Firebase user) quand connecté
// - credits.js fournit spendCredits/addCredits (transactions Firestore)
// - tower.html doit charger ce fichier en <script type="module" src="./tower.js"></script>

import { spendCredits, addCredits } from "./credits.js";

const STORAGE_KEY = "casino_crush_tower_grid_v6";

const ROWS = 8;
const COLS = 4;

const POINTS_PER_SAFE = 50; // score interne (non monétaire)

//
// 💳 Crédit gameplay (à adapter)
//
const ENTRY_COST = 10;       // coût pour démarrer une run
const REWARD_PER_SAFE = 2;   // récompense en crédits par SAFE
const WIN_BONUS = 50;        // bonus crédits si tour complétée

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

  activeRow: 0, // 0=bas, 7=haut
  score: 0,

  // trapByRow[row] = colonne TRAP (0..3), les autres sont SAFE
  trapByRow: Array.from({ length: ROWS }, () => 0),

  // { row, col, result: "SAFE"|"TRAP" }
  history: [],

  // anti-race async
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

    const ok =
      typeof s.activeRow === "number" &&
      Array.isArray(s.history) &&
      (Array.isArray(s.trapByRow) || Array.isArray(s.safeByRow));

    if (!ok) return structuredCloneSafe(defaultState);

    // Migration : ancienne version safeByRow -> trapByRow
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
  return state.turnId + 1;
}

function setCreditsUI(valOrNull) {
  const c = el("userCredits");
  if (!c) return;
  c.textContent = (valOrNull === null || valOrNull === undefined) ? "—" : String(valOrNull);
}

function getCurrentUser() {
  return window.CC_CURRENT_USER || null;
}

function resetAll() {
  const newTurn = bumpTurnId();
  state = structuredCloneSafe(defaultState);
  state.turnId = newTurn;
  save();
  render();
  if (ui.hint) ui.hint.textContent = "";
}

async function start() {
  const user = getCurrentUser();
  if (!user) {
    ui.hint.textContent = "Tu dois être connecté pour jouer.";
    // Optionnel: rediriger automatiquement
    // window.location.href = "./login.html";
    return;
  }

  // Empêcher double-start
  if (state.locked) return;

  const newTurn = bumpTurnId();
  setState({
    turnId: newTurn,
    locked: true
  });
  ui.hint.textContent = "Vérification des crédits…";

  // Débit d'entrée (transaction)
  const spend = await spendCredits(user, ENTRY_COST);
  if (!spend.ok) {
    // Déverrouille et n’initie pas la partie
    setState({ locked: false, running: false });
    ui.hint.textContent = spend.msg || "Crédits insuffisants.";
    if (typeof spend.credits === "number") setCreditsUI(spend.credits);
    return;
  }

  // Mise à jour UI crédits
  if (typeof spend.credits === "number") setCreditsUI(spend.credits);

  // Une TRAP par ligne => 3 SAFE / 1 TRAP
  const trapByRow = Array.from({ length: ROWS }, () => randInt(COLS));

  setState({
    running: true,
    locked: false,
    activeRow: 0,
    score: 0,
    trapByRow,
    history: []
  });

  ui.hint.textContent = `Partie démarrée (-${ENTRY_COST} crédits). Clique une tuile sur la ligne active.`;
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

  const user = getCurrentUser();
  if (!user) {
    // si l’utilisateur s’est déconnecté en cours de run
    setState({ running: false, locked: false });
    ui.hint.textContent = "Session expirée. Reconnecte-toi.";
    return;
  }

  const myTurn = bumpTurnId();
  setState({ turnId: myTurn, locked: true });
  ui.hint.textContent = "Révélation…";

  try {
    const trapCol = state.trapByRow[row];
    const isSafe = (col !== trapCol);

    // Révéler la tuile cliquée
    revealTile(row, col, isSafe ? "SAFE" : "TRAP", false);

    // TRAP : fin de partie
    if (!isSafe) {
      // Révéler aussi la TRAP (déjà rouge) et éventuellement les autres, si tu veux
      await delay(520);
      if (state.turnId !== myTurn) return;

      const history = [...state.history, { row, col, result: "TRAP" }];
      setState({ running: false, locked: false, history });
      ui.hint.textContent = "Mauvaise case (rouge). Partie terminée.";
      return;
    }

    // SAFE : révéler la TRAP en secondaire (rouge également)
    await delay(260);
    if (state.turnId !== myTurn) return;
    revealTile(row, trapCol, "TRAP", true);

    // Reward crédits (par SAFE)
    const addRes = await addCredits(user, REWARD_PER_SAFE);
    if (addRes?.ok && typeof addRes.credits === "number") setCreditsUI(addRes.credits);

    await delay(260);
    if (state.turnId !== myTurn) return;

    const history = [...state.history, { row, col, result: "SAFE" }];
    const nextRow = row + 1;
    const newScore = state.score + POINTS_PER_SAFE;

    // Victoire si dernière ligne
    if (nextRow >= ROWS) {
      // Bonus victoire
      const winRes = await addCredits(user, WIN_BONUS);
      if (winRes?.ok && typeof winRes.credits === "number") setCreditsUI(winRes.credits);

      setState({
        score: newScore,
        running: false,
        locked: false,
        history,
        activeRow: row
      });

      ui.hint.textContent = `Tour complétée (+${WIN_BONUS} crédits). Bravo.`;
      return;
    }

    // Continuer
    setState({
      score: newScore,
      activeRow: nextRow,
      locked: false,
      history
    });

    ui.hint.textContent = `Bonne case (vert) (+${REWARD_PER_SAFE} crédits). Ligne suivante.`;
  } catch (e) {
    console.error("Tower error:", e);
    if (state.turnId === myTurn) {
      setState({ locked: false, running: false });
      ui.hint.textContent = "Erreur technique. Partie arrêtée (prévention de blocage).";
    }
  } finally {
    // Unlock garanti si on est encore sur le même turn
    if (state.turnId === myTurn && state.locked) {
      setState({ locked: false });
    }
  }
}

function revealTile(row, col, result) {
  const id = `tile-r${row}-c${col}`;
  const tile = document.getElementById(id);
  if (!tile) return;

  tile.classList.add("reveal");

  if (result === "SAFE") {
    tile.classList.remove("trap");
    tile.classList.add("safe");
  } else if (result === "TRAP") {
    tile.classList.remove("safe");
    tile.classList.add("trap"); // ✅ rouge même si “secondaire”
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
  if (ui.score) ui.score.textContent = String(state.score);
  if (ui.status) {
    ui.status.textContent = state.running
      ? (state.locked ? "Révélation…" : "En cours")
      : (state.history.length ? "Terminé" : "Prêt");
  }

  if (ui.floor) ui.floor.textContent = state.running ? `${state.activeRow + 1} / ${ROWS}` : "—";

  // Buttons
  if (ui.btnStop) ui.btnStop.disabled = !state.running || state.locked;
  if (ui.btnReset) ui.btnReset.disabled = state.locked; // évite reset pendant reveal
  if (ui.btnStart) ui.btnStart.disabled = state.locked; // évite double start pendant spendCredits

  // Log
  if (ui.log) {
    if (state.history.length === 0) {
      ui.log.textContent = "—";
    } else {
      ui.log.innerHTML = state.history
        .slice(-16)
        .map(h => `Ligne ${h.row + 1} : case ${h.col + 1} → ${h.result === "SAFE" ? "✅ SAFE" : "🟥 TRAP"}`)
        .join("<br/>");
    }
  }

  renderGrid();
  save();
}

function renderGrid() {
  if (!ui.grid) return;

  ui.grid.innerHTML = "";

  // Rendu du haut vers le bas (effet tour)
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

  // Réappliquer l'historique
  for (const h of state.history) {
    revealTile(h.row, h.col, h.result);
  }
}

// Events
if (ui.btnStart) ui.btnStart.addEventListener("click", () => start());
if (ui.btnReset) ui.btnReset.addEventListener("click", resetAll);
if (ui.btnStop) ui.btnStop.addEventListener("click", stopRun);

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
