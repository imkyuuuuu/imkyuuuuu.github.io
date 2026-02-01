// slot.js (MODULE)
// Slot 3x3 - Arcade (sans pari de crédits)
// - stake modifie la récompense en cas de gain
// - aucune perte de crédits en cas de non-gain
// - ajoute les crédits au compte Firestore (users/{uid}.credits)

import { addCredits } from "./credits.js";

const ROWS = 3;
const COLS = 3;

// Symboles (emoji). Tu pourras remplacer par sprites PNG plus tard.
const SYMBOLS = [
  { key: "CHERRY",  label: "🍒", weight: 26 },
  { key: "LEMON",   label: "🍋", weight: 24 },
  { key: "GRAPE",   label: "🍇", weight: 20 },
  { key: "STAR",    label: "⭐", weight: 16 },
  { key: "DIAMOND", label: "💎", weight: 10 },
  { key: "SEVEN",   label: "7️⃣", weight: 4 },
];

// Récompenses de base (avant stake) selon le symbole (3 identiques)
const PAYTABLE = {
  CHERRY:  10,
  LEMON:   12,
  GRAPE:   16,
  STAR:    25,
  DIAMOND: 50,
  SEVEN:   100
};

// Bonus si plusieurs lignes gagnantes
const MULTILINE_BONUS = {
  2: 1.25,
  3: 1.50,
  4: 1.75,
  5: 2.00
};

function el(id){ return document.getElementById(id); }

const ui = {
  grid: el("slotGrid"),
  overlay: el("slotOverlay"),
  stake: el("stake"),
  stakeLabel: el("stakeLabel"),
  btnSpin: el("btnSpin"),
  hint: el("slotHint"),
};

let locked = false;
let current = makeEmptyGrid();
renderGrid(current);
renderStake();

ui.stake.addEventListener("input", renderStake);
ui.btnSpin.addEventListener("click", spin);

function getCurrentUser(){
  return window.CC_CURRENT_USER || null;
}

function renderStake(){
  ui.stakeLabel.textContent = String(Number(ui.stake.value));
}

function setHint(text, ok=null){
  ui.hint.textContent = text || "";
  if (ok === true) ui.hint.className = "form-msg ok";
  else if (ok === false) ui.hint.className = "form-msg error";
  else ui.hint.className = "form-msg";
}

function makeEmptyGrid(){
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => SYMBOLS[0]));
}

// RNG pondéré
function pickSymbol(){
  const total = SYMBOLS.reduce((s,x)=>s+x.weight,0);
  const r = cryptoRandInt(total);
  let acc = 0;
  for (const sym of SYMBOLS){
    acc += sym.weight;
    if (r < acc) return sym;
  }
  return SYMBOLS[0];
}

function cryptoRandInt(maxExclusive){
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % maxExclusive;
}

function renderGrid(grid){
  ui.grid.innerHTML = "";
  ui.grid.className = "slot-grid";

  for (let r=0; r<ROWS; r++){
    for (let c=0; c<COLS; c++){
      const cell = document.createElement("div");
      cell.className = "slot-cell";
      cell.id = `slot-r${r}-c${c}`;

      const big = document.createElement("div");
      big.className = "slot-symbol";
      big.textContent = grid[r][c].label;

      const small = document.createElement("div");
      small.className = "slot-mini";
      small.textContent = "";

      cell.appendChild(big);
      cell.appendChild(small);
      ui.grid.appendChild(cell);
    }
  }
}

// Animation simple: plusieurs “frames” puis arrêt sur résultat final
async function spin(){
  if (locked) return;

  const user = getCurrentUser();
  if (!user){
    setHint("Tu dois être connecté pour jouer.", false);
    return;
  }

  locked = true;
  ui.btnSpin.disabled = true;
  setHint("Spin…", null);
  clearHighlights();

  const stake = Number(ui.stake.value);

  // Animation : 10 frames
  for (let i=0; i<10; i++){
    current = randomGrid();
    renderGrid(current);
    await delay(70 + i*10);
  }

  // Résultat final
  current = randomGrid();
  renderGrid(current);

  // Calcul des gains
  const win = evaluate(current);

  if (!win.lines.length){
    setHint("Aucune ligne gagnante. Solde inchangé.", null);
    locked = false;
    ui.btnSpin.disabled = false;
    return;
  }

  // Gain total = somme paytable des lignes × stake × bonus multi-ligne
  let base = 0;
  for (const L of win.lines){
    base += PAYTABLE[L.symbolKey] || 0;
  }

  const bonusMult = MULTILINE_BONUS[win.lines.length] || 1.0;
  const reward = Math.round(base * stake * bonusMult);

  // Ajout de crédits Firebase
  const res = await addCredits(user, reward);

  // UI: surligner les cases gagnantes + lignes overlay
  highlightWin(win);
  drawOverlayLines(win.lines);

  if (res?.ok){
    setHint(`Gagné : +${reward} crédits (stake ${stake}, ${win.lines.length} ligne(s)).`, true);
    // mettre à jour le badge crédits si présent
    const creditsEl = document.getElementById("userCredits");
    if (creditsEl && typeof res.credits === "number") creditsEl.textContent = String(res.credits);
  } else {
    setHint("Gain détecté mais erreur lors de l'ajout de crédits (réseau/règles).", false);
  }

  locked = false;
  ui.btnSpin.disabled = false;
}

function randomGrid(){
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => pickSymbol())
  );
}

function delay(ms){ return new Promise(r=>setTimeout(r, ms)); }

// Évalue les lignes gagnantes: 3 identiques sur
// - 3 horizontales
// - 3 verticales
// - 2 diagonales
function evaluate(grid){
  const lines = [];

  // horizontales
  for (let r=0; r<ROWS; r++){
    const a = grid[r][0], b = grid[r][1], c = grid[r][2];
    if (a.key === b.key && b.key === c.key){
      lines.push({ kind:"H", index:r, symbolKey:a.key, cells:[[r,0],[r,1],[r,2]] });
    }
  }

  // verticales
  for (let c=0; c<COLS; c++){
    const a = grid[0][c], b = grid[1][c], d = grid[2][c];
    if (a.key === b.key && b.key === d.key){
      lines.push({ kind:"V", index:c, symbolKey:a.key, cells:[[0,c],[1,c],[2,c]] });
    }
  }

  // diagonales
  {
    const a = grid[0][0], b = grid[1][1], c = grid[2][2];
    if (a.key === b.key && b.key === c.key){
      lines.push({ kind:"D1", index:0, symbolKey:a.key, cells:[[0,0],[1,1],[2,2]] });
    }
  }
  {
    const a = grid[0][2], b = grid[1][1], c = grid[2][0];
    if (a.key === b.key && b.key === c.key){
      lines.push({ kind:"D2", index:0, symbolKey:a.key, cells:[[0,2],[1,1],[2,0]] });
    }
  }

  return { lines };
}

function clearHighlights(){
  for (let r=0; r<ROWS; r++){
    for (let c=0; c<COLS; c++){
      const cell = document.getElementById(`slot-r${r}-c${c}`);
      if (cell) cell.classList.remove("win");
    }
  }
  if (ui.overlay) ui.overlay.innerHTML = "";
}

function highlightWin(result){
  const used = new Set();
  for (const L of result.lines){
    for (const [r,c] of L.cells){
      const key = `${r}-${c}`;
      if (used.has(key)) continue;
      used.add(key);
      const cell = document.getElementById(`slot-r${r}-c${c}`);
      if (cell) cell.classList.add("win");
    }
  }
}

function drawOverlayLines(lines){
  if (!ui.overlay) return;
  ui.overlay.innerHTML = "";

  // On dessine des "barres" simples (CSS absolute) sur le conteneur.
  // Cette approche reste robuste sans canvas.
  for (const L of lines){
    const bar = document.createElement("div");
    bar.className = "slot-line";

    // Positions approximatives basées sur grille 3x3
    // Le CSS gère le centrage.
    if (L.kind === "H"){
      bar.classList.add("h");
      bar.style.top = `${(L.index * 33.333) + 16.666}%`;
    } else if (L.kind === "V"){
      bar.classList.add("v");
      bar.style.left = `${(L.index * 33.333) + 16.666}%`;
    } else if (L.kind === "D1"){
      bar.classList.add("d1");
    } else if (L.kind === "D2"){
      bar.classList.add("d2");
    }

    ui.overlay.appendChild(bar);
  }
}
