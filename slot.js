// slot.js (MODULE)
// Slot 3x3 - Arcade
// - Utilise spendCredits pour la mise
// - Utilise addCredits pour les gains

// MODIFICATION ICI : On importe spendCredits en plus
import { addCredits, spendCredits } from "./credits.js";

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

// Helper UI pour mettre à jour le solde affiché dans le menu
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

// --- LOGIQUE PRINCIPALE MODIFIÉE ---
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

  // On s'assure que stake est un entier (parseInt) car ton credits.js check Number.isInteger
  const stake = parseInt(ui.stake.value, 10); 

  setHint(`Mise : ${stake} crédits...`, null);

  // 1. DÉBITER LA MISE (spendCredits)
  // On utilise ta fonction spendCredits qui gère la transaction et vérifie le solde
  const spendRes = await spendCredits(user, stake);

  if (!spendRes.ok) {
      // Si refusé (solde insuffisant ou erreur)
      setHint(spendRes.msg || "Erreur de transaction.", false);
      locked = false;
      ui.btnSpin.disabled = false;
      return; // On arrête tout ici
  }

  // Transaction réussie -> on met à jour l'affichage avec le nouveau solde
  updateCreditsUI(spendRes.credits);
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

  if (!win.lines.length){
    // PERDU : On ne fait rien de plus côté DB (l'argent est déjà débité)
    setHint(`Perdu.`, false);
    locked = false;
    ui.btnSpin.disabled = false;
    return;
  }

  // GAGNÉ
  let base = 0;
  for (const L of win.lines){
    base += PAYTABLE[L.symbolKey] || 0;
  }

  const bonusMult = MULTILINE_BONUS[win.lines.length] || 1.0;
  const reward = Math.round(base * stake * bonusMult); // Gain brut

  // On crédite les gains (addCredits)
  const addRes = await addCredits(user, reward);

  // Highlights UI
  highlightWin(win);
  drawOverlayLines(win.lines);

  if (addRes?.ok){
    setHint(`GAGNÉ ! +${reward} crédits (Mise ${stake}).`, true);
    updateCreditsUI(addRes.credits);
  } else {
    setHint(`Gagné (+${reward}), mais erreur réseau lors de l'ajout.`, false);
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
