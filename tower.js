// tower.js (MODULE)
// Tower – grille 4x8
// - Mise au départ (débit immédiat)
// - Gains accumulés selon le niveau atteint (Cashout manuel)
// - Perte totale si TRAP
// - Intégration crédits Firebase (Firestore) via credits.js

import { spendCredits, addCredits } from "./credits.js";

const STORAGE_KEY = "casino_crush_tower_grid_v7_stake"; // Nouvelle clé versionnée

const ROWS = 8;
const COLS = 4; // On garde ta grille 4 colonnes

// Multiplicateurs demandés (Index 0 = Ligne 1 complétée)
const MULTIPLIERS = [1.27, 1.7, 2.27, 3.03, 4.04, 5.39, 7.19, 9.58];

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
  score: el("towerScore"), // Affichera le gain potentiel
  status: el("towerStatus"),
  hint: el("towerHint"),
  log: el("towerLog"),
  stakeInput: el("towerStake"), // L'input pour la mise

  btnStart: el("btnStartTower"),
  btnReset: el("btnResetTower"),
  btnStop: el("btnStopRun"), // Bouton "Encaisser"

  disclaimer: el("towerDisclaimer"),
  btnHideDisclaimer: el("btnHideTowerDisclaimer")
};

const defaultState = {
  showDisclaimer: true,
  running: false,
  locked: false,

  stake: 10,       // Mise de la partie en cours
  activeRow: 0,    // 0=bas, 7=haut
  score: 0,        // Gain potentiel actuel

  // trapByRow[row] = colonne TRAP (0..3), les autres sont SAFE
  trapByRow: Array.from({ length: ROWS }, () => 0),

  // { row, col, result: "SAFE"|"TRAP" }
  history: [],

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
      Array.isArray(s.trapByRow);

    if (!ok) return structuredCloneSafe(defaultState);
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

// --- DÉMARRAGE DU JEU ---
async function start() {
  const user = getCurrentUser();
  if (!user) {
    ui.hint.textContent = "Tu dois être connecté pour jouer.";
    return;
  }

  if (state.locked) return;

  // 1. Récupération de la mise depuis l'input
  let inputStake = 10;
  if (ui.stakeInput) {
    inputStake = parseInt(ui.stakeInput.value, 10);
  }
  
  if (isNaN(inputStake) || inputStake < 1 || inputStake > 1000) {
    ui.hint.textContent = "Mise invalide (Min 1, Max 1000).";
    return;
  }

  const newTurn = bumpTurnId();
  setState({ turnId: newTurn, locked: true });
  ui.hint.textContent = "Vérification des crédits…";

  // 2. Débit de la mise (Transaction Firestore)
  const spend = await spendCredits(user, inputStake);
  
  if (!spend.ok) {
    setState({ locked: false, running: false });
    ui.hint.textContent = spend.msg || "Crédits insuffisants.";
    if (typeof spend.credits === "number") setCreditsUI(spend.credits);
    return;
  }

  // Mise à jour UI crédits
  if (typeof spend.credits === "number") setCreditsUI(spend.credits);

  // Génération des pièges (1 piège sur 4 colonnes)
  const trapByRow = Array.from({ length: ROWS }, () => randInt(COLS));

  setState({
    running: true,
    locked: false,
    activeRow: 0,
    stake: inputStake, // On sauvegarde la mise pour le calcul des gains
    score: 0,          // Pas de gain au départ (mise déjà perdue si on stop row 0)
    trapByRow,
    history: []
  });

  ui.hint.textContent = `Mise de ${inputStake} placée. Grimpez !`;
}

// --- CASHOUT (STOP) ---
async function stopRun() {
  if (!state.running || state.locked) return;
  
  // Si le joueur n'a pas passé au moins la première ligne
  if (state.activeRow === 0) {
    ui.hint.textContent = "Vous devez valider au moins une ligne pour encaisser.";
    return;
  }

  const user = getCurrentUser();
  const currentReward = state.score; // Le score contient le gain potentiel calculé
  const newTurn = bumpTurnId();
  
  setState({ turnId: newTurn, locked: true });
  ui.hint.textContent = `Encaissement de ${currentReward} crédits...`;

  // Créditer le gain
  const addRes = await addCredits(user, currentReward);
  
  if (addRes?.ok && typeof addRes.credits === "number") setCreditsUI(addRes.credits);

  setState({ 
    running: false, 
    locked: false,
    history: [...state.history, { row: state.activeRow, col: -1, result: "CASHOUT" }] // Marqueur historique
  });

  ui.hint.textContent = `Bravo ! Vous avez encaissé ${currentReward} crédits.`;
}

// --- CLIC TUILE ---
async function onPick(row, col) {
  if (!state.running || state.locked) return;
  if (row !== state.activeRow) return;

  const user = getCurrentUser();
  if (!user) {
    setState({ running: false, locked: false });
    ui.hint.textContent = "Session expirée.";
    return;
  }

  const myTurn = bumpTurnId();
  setState({ turnId: myTurn, locked: true });
  
  // Pas de message de chargement pour garder le flow rapide, juste le lock visuel

  try {
    const trapCol = state.trapByRow[row];
    const isSafe = (col !== trapCol);

    // Révéler la tuile
    revealTile(row, col, isSafe ? "SAFE" : "TRAP", false);

    // --- PERDU (TRAP) ---
    if (!isSafe) {
      await delay(500);
      if (state.turnId !== myTurn) return;

      // On montre où était le bon chemin (les autres cases safe) ou juste le piège
      // Ici on montre tout la ligne pour comprendre
      for(let c=0; c<COLS; c++) {
          if (c !== col) revealTile(row, c, c === trapCol ? "TRAP" : "SAFE", true); // Secondaire
      }

      const history = [...state.history, { row, col, result: "TRAP" }];
      setState({ running: false, locked: false, history, score: 0 });
      ui.hint.textContent = `BOUM ! Vous perdez votre mise de ${state.stake}.`;
      return;
    }

    // --- GAGNÉ (SAFE) ---
    // On ne crédite RIEN ici. On calcule juste le nouveau potentiel.
    
    // Calcul du nouveau gain potentiel selon la ligne VIENT d'être franchie (row + 1 correspond à l'index table)
    // Row 0 finie = Index 0 dans Multipliers (x1.27)
    const multiplier = MULTIPLIERS[row]; 
    const potentialWin = Math.floor(state.stake * multiplier);

    await delay(200);
    if (state.turnId !== myTurn) return;

    const history = [...state.history, { row, col, result: "SAFE" }];
    const nextRow = row + 1;

    // VICTOIRE TOTALE (Dernière ligne finie)
    if (nextRow >= ROWS) {
      // Auto-cashout du max
      const winRes = await addCredits(user, potentialWin);
      if (winRes?.ok && typeof winRes.credits === "number") setCreditsUI(winRes.credits);

      setState({
        score: potentialWin,
        running: false,
        locked: false,
        history,
        activeRow: row
      });

      ui.hint.textContent = `SOMMET ATTEINT ! Jackpot de ${potentialWin} crédits (x${MULTIPLIERS[ROWS-1]}) !`;
      return;
    }

    // CONTINUER
    setState({
      score: potentialWin, // Mise à jour du "Score" visible (c'est le gain potentiel)
      activeRow: nextRow,
      locked: false,
      history
    });

    ui.hint.textContent = `Niveau ${row+1} validé. Gain potentiel: ${potentialWin}. Continuez ou Encaissez.`;

  } catch (e) {
    console.error("Tower error:", e);
    if (state.turnId === myTurn) {
      setState({ locked: false, running: false });
      ui.hint.textContent = "Erreur technique.";
    }
  } finally {
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
  if (secondary) tile.classList.add("secondary-reveal"); // CSS opacité réduite si tu veux

  if (result === "SAFE") {
    tile.classList.remove("trap");
    tile.classList.add("safe");
  } else if (result === "TRAP") {
    tile.classList.remove("safe");
    tile.classList.add("trap");
  }

  const mini = tile.querySelector(".tower-mini");
  // Affiche le multi si on veut, ou juste un emoji
  if (mini && !secondary && result === "SAFE") mini.textContent = "✓"; 
  if (mini && result === "TRAP") mini.textContent = "💣";
}

function render() {
  // disclaimer
  if (ui.disclaimer) {
    ui.disclaimer.style.display = state.showDisclaimer ? "block" : "none";
  }

  // HUD
  if (ui.score) ui.score.textContent = state.score > 0 ? `${state.score} 💎` : "0";
  
  if (ui.status) {
    if (state.running) {
        ui.status.textContent = `En jeu (Mise: ${state.stake})`;
        ui.status.className = "status-running";
    } else {
        ui.status.textContent = "Prêt";
        ui.status.className = "";
    }
  }

  if (ui.floor) ui.floor.textContent = state.running ? `${state.activeRow + 1} / ${ROWS}` : "—";
  
  // Input Mise (Désactivé si en jeu)
  if (ui.stakeInput) ui.stakeInput.disabled = state.running;

  // Buttons
  // Le bouton Stop devient "Encaisser" et n'est actif que si on a joué > 0 ligne
  if (ui.btnStop) {
      ui.btnStop.disabled = !state.running || state.locked || state.activeRow === 0;
      if (state.running && state.activeRow > 0) {
          ui.btnStop.textContent = `ENCAISSER ${state.score}`;
          ui.btnStop.classList.add("btn-cashout-active"); // Ajoute du style vert/brillant en CSS
      } else {
          ui.btnStop.textContent = "ENCAISSER";
          ui.btnStop.classList.remove("btn-cashout-active");
      }
  }

  if (ui.btnReset) ui.btnReset.disabled = state.locked;
  if (ui.btnStart) ui.btnStart.disabled = state.locked || state.running;

  renderGrid();
  save();
}

function renderGrid() {
  if (!ui.grid) return;
  ui.grid.innerHTML = "";

  // Rendu du haut vers le bas
  for (let row = ROWS - 1; row >= 0; row--) {
    
    // Ajout d'une étiquette de Multiplicateur à gauche de la ligne (optionnel, nécessite CSS)
    const rowLabel = document.createElement("div");
    rowLabel.className = "tower-row-label";
    rowLabel.textContent = `x${MULTIPLIERS[row]}`;
    // ui.grid étant probablement un grid/flex, il vaut mieux intégrer le label dans la tuile ou gérer le CSS de la grille.
    // Pour ne pas casser ton CSS existant, je n'insère pas de wrapper de ligne, mais on peut afficher le multi dans les tuiles futures.

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
      // Affiche le multi sur les cases futures pour info
      if (state.running && row >= state.activeRow) {
         main.textContent = `x${MULTIPLIERS[row]}`;
         main.style.fontSize = "0.7em";
         main.style.opacity = "0.6";
      } else {
         main.textContent = "";
      }

      const mini = document.createElement("div");
      mini.className = "tower-mini";
      
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

  // Réappliquer l'historique visuel
  for (const h of state.history) {
    if (h.result !== "CASHOUT") {
        revealTile(h.row, h.col, h.result, false);
    }
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

// Init
render();
