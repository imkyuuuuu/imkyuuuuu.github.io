// Casino Crush – Slots (Simulation)
// - Crédits fictifs
// - Tirage pondéré
// - Lignes gagnantes: 3 horizontales + 2 diagonales
// - PWA install prompt

const SYMBOLS = [
  { key: "CHERRY",  label: "🍒", weight: 30, mult3: 2  },
  { key: "LEMON",   label: "🍋", weight: 25, mult3: 2  },
  { key: "DICE",    label: "🎲", weight: 18, mult3: 4  },
  { key: "CHIP",    label: "🟦", weight: 15, mult3: 5  },
  { key: "CARD",    label: "♠",  weight: 10, mult3: 8  },
  { key: "DIAMOND", label: "💎", weight: 2,  mult3: 25 }
];

const TOTAL_WEIGHT = SYMBOLS.reduce((a,s)=>a+s.weight,0);

function drawWeighted(){
  const roll = Math.floor(Math.random() * TOTAL_WEIGHT);
  let acc = 0;
  for(const s of SYMBOLS){
    acc += s.weight;
    if(roll < acc) return s;
  }
  return SYMBOLS[0];
}

function makeGrid(){
  // 3 rows x 3 cols
  return Array.from({length:3}, () => Array.from({length:3}, () => drawWeighted()));
}

function linesFromGrid(grid){
  const LINES = [
    [[0,0],[0,1],[0,2]],
    [[1,0],[1,1],[1,2]],
    [[2,0],[2,1],[2,2]],
    [[0,0],[1,1],[2,2]],
    [[0,2],[1,1],[2,0]]
  ];

  const wins = [];
  for(let i=0;i<LINES.length;i++){
    const coords = LINES[i];
    const syms = coords.map(([r,c]) => grid[r][c]);
    const first = syms[0];
    const count = syms.filter(s => s.key === first.key).length;
    if(count === 3){
      const win = state.bet * first.mult3;
      wins.push({ lineIndex: i, symbol: first, count, win });
    }
  }
  return wins;
}

// ---- State ----
const STORAGE_KEY = "casino_crush_state_v1";

const defaultState = {
  credits: 500,
  bet: 10,
  grid: makeGrid(),
  lastWin: 0,
  wins: [],
  isSpinning: false,
  showDisclaimer: true
};

let state = loadState();

// ---- UI refs ----
const elCredits = document.getElementById("credits");
const elBet = document.getElementById("bet");
const elLastWin = document.getElementById("lastWin");
const elGrid = document.getElementById("slotGrid");
const elResultText = document.getElementById("resultText");
const elDisclaimer = document.getElementById("disclaimer");

const btnSpin = document.getElementById("btnSpin");
const btnBetDown = document.getElementById("btnBetDown");
const btnBetUp = document.getElementById("btnBetUp");
const btnReset = document.getElementById("btnReset");
const btnHideDisclaimer = document.getElementById("btnHideDisclaimer");

// ---- Render ----
function render(){
  elCredits.textContent = String(state.credits);
  elBet.textContent = String(state.bet);
  elLastWin.textContent = String(state.lastWin);

  elDisclaimer.style.display = state.showDisclaimer ? "block" : "none";

  btnSpin.disabled = state.isSpinning;
  btnBetDown.disabled = state.isSpinning;
  btnBetUp.disabled = state.isSpinning;

  // grid
  elGrid.innerHTML = "";
  for(let r=0;r<3;r++){
    for(let c=0;c<3;c++){
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.textContent = state.grid[r][c].label;
      elGrid.appendChild(cell);
    }
  }

  // result
  if(state.wins.length === 0){
    elResultText.textContent = "Aucun gain.";
  } else {
    const lines = state.wins.map(w => `Ligne ${w.lineIndex + 1} : ${w.symbol.label} → +${w.win}`);
    elResultText.textContent = lines.join(" | ") + `  (Total: +${state.lastWin})`;
  }

  saveState();
}

function setState(patch){
  state = { ...state, ...patch };
  render();
}

function resetState(){
  state = { ...defaultState, grid: makeGrid() };
  render();
}

// ---- Game actions ----
function decreaseBet(){
  const newBet = Math.max(5, state.bet - 5);
  setState({ bet: newBet });
}

function increaseBet(){
  const newBet = Math.min(100, state.bet + 5);
  setState({ bet: newBet });
}

async function spin(){
  if(state.isSpinning) return;
  if(state.credits < state.bet){
    // message in result panel
    setState({ wins: [], lastWin: 0 });
    elResultText.textContent = "Crédits insuffisants pour lancer un spin.";
    return;
  }

  setState({ isSpinning: true, wins: [], lastWin: 0, credits: state.credits - state.bet });

  // simple “spin” animation
  for(let i=0;i<10;i++){
    const temp = makeGrid();
    setState({ grid: temp });
    await delay(70);
  }

  const finalGrid = makeGrid();
  const wins = linesFromGrid(finalGrid);
  const totalWin = wins.reduce((a,w)=>a+w.win,0);

  setState({
    grid: finalGrid,
    wins,
    lastWin: totalWin,
    credits: state.credits + totalWin,
    isSpinning: false
  });
}

function delay(ms){ return new Promise(res => setTimeout(res, ms)); }

// ---- Storage ----
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return { ...defaultState };
    const parsed = JSON.parse(raw);

    // minimal validation
    if(typeof parsed.credits !== "number" || typeof parsed.bet !== "number") return { ...defaultState };
    return { ...defaultState, ...parsed };
  } catch {
    return { ...defaultState };
  }
}

function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

// ---- Events ----
btnBetDown.addEventListener("click", decreaseBet);
btnBetUp.addEventListener("click", increaseBet);
btnSpin.addEventListener("click", spin);
btnReset.addEventListener("click", resetState);
btnHideDisclaimer.addEventListener("click", () => setState({ showDisclaimer: false }));

// ---- Service Worker ----
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

// ---- PWA Install prompt ----
let deferredPrompt = null;
const btnInstall = document.getElementById("btnInstall");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  btnInstall.hidden = false;
});

btnInstall.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  btnInstall.hidden = true;
});

// Init
render();
