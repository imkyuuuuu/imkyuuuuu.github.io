// slot.js (MODULE)
// Slot 3x3 - Arcade
// - stake modifie la récompense en cas de gain
// - Perte de crédit immédiate au lancement (mise)
// - ajoute les crédits au compte Firestore (users/{uid}.credits)

import { addCredits } from "./credits.js";

const ROWS = 3;
const COLS = 3;

// Symboles (emoji)
const SYMBOLS = [
  { key: "CHERRY",  label: "🍒", weight: 26 },
  { key: "LEMON",   label: "🍋", weight: 24 },
  { key: "GRAPE",   label: "🍇", weight: 20 },
  { key: "STAR",    label: "⭐", weight: 16 },
  { key: "DIAMOND", label: "💎", weight: 10 },
  { key: "SEVEN",   label: "7️⃣", weight: 4 },
];

// Récompenses de base
const PAYTABLE = {
  CHERRY:  10,
  LEMON:   12,
  GRAPE:   16,
  STAR:    25,
  DIAMOND: 50,
  SEVEN:   100
};

// Bonus multi-lignes
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

// Helper pour mettre à jour l'affichage des crédits dans le header/menu
function updateCreditsUI(amount) {
    const creditsEl = document.getElementById("userCredits");
    if (creditsEl && typeof amount === "number") {
        creditsEl.textContent = String(amount);
    }
}

function makeEmptyGrid(){
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => SYMBOLS[0]));
}

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
      cell.className = "slot-cell"; // Correction duplication class
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

// --- CŒUR DU JEU MODIFIÉ ---
async function spin(){
  if (locked) return;

  const user = getCurrentUser();
  if (!user){
    setHint("Tu dois être connecté pour jouer.", false);
    return;
  }

  locked = true;
  ui.btnSpin.disabled = true;
  clearHighlights();
  
  const stake = Number(ui.stake.value);

  // 1. DÉBITER LA MISE AVANT DE LANCER (nombre négatif)
  setHint(`Mise en jeu de ${stake} crédits...`, null);
  
  // On suppose que addCredits accepte les négatifs pour retirer des points
  // Si le solde tombe sous 0, la transaction Firestore devrait échouer ou retourner !ok
  const debitRes = await addCredits(user, -stake);

  if (!debitRes || !debitRes.ok) {
      setHint("Crédits insuffisants ou erreur !", false);
      locked = false;
      ui.btnSpin.disabled = false;
      return; // On arrête tout, les crédits n'ont pas bougé (ou transaction annulée)
  }

  // Mise à jour immédiate de l'affichage du solde (débité)
  updateCreditsUI(debitRes.credits);
  setHint("Spinning...", null);

  // 2. ANIMATION
  for (let i=0; i<10; i++){
    current = randomGrid();
    renderGrid(current);
    await delay(70 + i*10);
  }

  // 3. RÉSULTAT FINAL
  current = randomGrid();
  renderGrid(current);

  // 4. CALCUL DES GAINS
  const win = evaluate(current);

  // --- CAS PERDANT ---
  if (!win.lines.length){
    setHint(`Perdu. La mise de ${stake} est conservée par la maison.`, false);
    locked = false;
    ui.btnSpin.disabled = false;
    return;
  }

  // --- CAS GAGNANT ---
  // Gain total = (somme paytable des lignes × stake × bonus)
  // Note: On a déjà débité la mise au début, donc ici on crédite le GAIN BRUT.
  let base = 0;
  for (const L of win.lines){
    base += PAYTABLE[L.symbolKey] || 0;
  }

  const bonusMult = MULTILINE_BONUS[win.lines.length] || 1.0;
  const reward = Math.round(base * stake * bonusMult);

  // Ajout du gain
  const creditRes = await addCredits(user, reward);

  // UI: Highlights
  highlightWin(win);
  drawOverlayLines(win.lines);

  if (creditRes?.ok){
    setHint(`GAGNÉ ! +${reward} crédits (Mise ${stake}).`, true);
    updateCreditsUI(creditRes.credits);
  } else {
    setHint("Gagné, mais erreur lors de l'ajout des crédits.", false);
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

  for (const L of lines){
    const bar = document.createElement("div");
    bar.className = "slot-line";

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
