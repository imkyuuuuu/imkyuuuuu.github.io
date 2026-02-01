// Tower – grille complète 8x4, ligne active plus claire, SAFE vert, TRAP rouge.
// Mode arcade/simulation (pas d'argent, pas de mise).

const STORAGE_KEY = "casino_crush_tower_grid_v1";

const ROWS = 8;
const COLS = 4;
const POINTS_PER_SAFE = 50;

// RNG robuste (navigateur)
function randInt(maxExclusive) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % maxExclusive;
}
function el(id){ return document.getElementById(id); }
function delay(ms){ return new Promise(r => setTimeout(r, ms)); }

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
};

const defaultState = {
  running: false,
  locked: false,
  activeRow: 0,       // 0 = bas, 7 = haut (on grimpe)
  score: 0,
  // une colonne safe par ligne
  safeByRow: Array.from({ length: ROWS }, () => 0),
  // history: { row, col, result: "SAFE"|"TRAP" }
  history: []
};

let state = load();

function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return structuredClone(defaultState);
    const s = JSON.parse(raw);
    return { ...structuredClone(defaultState), ...s };
  }catch{
    return structuredClone(defaultState);
  }
}
function save(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch{}
}
function setState(patch){
  state = { ...state, ...patch };
  save();
  render();
}

function resetAll(){
  setState(structuredClone(defaultState));
  ui.hint.textContent = "";
}

function start(){
  const safeByRow = Array.from({ length: ROWS }, () => randInt(COLS));
  setState({
    running: true,
    locked: false,
    activeRow: 0,
    score: 0,
    safeByRow,
    history: []
  });
  ui.hint.textContent = "Partie démarrée. Choisis une tuile sur la ligne active.";
}

function stopRun(){
  if(!state.running) return;
  setState({ running: false, locked: false });
  ui.hint.textContent = "Run terminée volontairement. Score conservé.";
}

function rowIndexToVisual(r){
  // On veut visuellement une tour “du bas vers le haut”.
  // On rend la grille de haut en bas, donc la ligne 7 (haut) est rendue en premier.
  // VisualRow = (ROWS - 1 - r)
  return ROWS - 1 - r;
}

async function onPick(row, col){
  if(!state.running || state.locked) return;
  if(row !== state.activeRow) return; // seulement ligne active

  setState({ locked: true });
  const safeCol = state.safeByRow[row];
  const isSafe = (col === safeCol);

  // Marquer visuellement la tuile cliquée (reveal)
  revealTile(row, col, isSafe ? "SAFE" : "TRAP");

  // Optionnel : révéler brièvement la tuile safe si le joueur a échoué
  if(!isSafe){
    await delay(260);
    if(safeCol !== col) revealTile(row, safeCol, "SAFE", true);
    await delay(520);

    const history = [...state.history, { row, col, result: "TRAP" }];
    setState({ running:false, locked:false, history });
    ui.hint.textContent = "Mauvaise case (rouge). Partie terminée.";
    return;
  }

  // SAFE
  await delay(260);
  const history = [...state.history, { row, col, result: "SAFE" }];
  const nextRow = row + 1;
  const newScore = state.score + POINTS_PER_SAFE;

  // Fin : si on vient de réussir la dernière ligne
  if(nextRow >= ROWS){
    setState({ score: newScore, running:false, locked:false, history, activeRow: row });
    ui.hint.textContent = "Tour complétée. Bravo.";
    return;
  }

  setState({ score: newScore, activeRow: nextRow, locked:false, history });
  ui.hint.textContent = "Bonne case (vert). Ligne suivante.";
}

function revealTile(row, col, result, isSecondary=false){
  const id = `tile-r${row}-c${col}`;
  const tile = document.getElementById(id);
  if(!tile) return;

  tile.classList.add("reveal");
  tile.classList.remove("safe","trap");

  if(result === "SAFE") tile.classList.add("safe");
  if(result === "TRAP" && !isSecondary) tile.classList.add("trap");

  const label = tile.querySelector(".tower-mini");
  if(label){
    label.textContent = result;
  }
}

function render(){
  // HUD
  ui.score.textContent = String(state.score);
  ui.status.textContent = state.running ? (state.locked ? "Révélation…" : "En cours") : (state.history.length ? "Terminé" : "Prêt");

  if(state.running){
    ui.floor.textContent = `${state.activeRow + 1} / ${ROWS}`;
  }else{
    ui.floor.textContent = "—";
  }

  ui.btnStop.disabled = !state.running || state.locked;

  // Log
  if(state.history.length === 0){
    ui.log.textContent = "—";
  }else{
    ui.log.innerHTML = state.history
      .slice(-12)
      .map(h => `Ligne ${h.row + 1} : case ${h.col + 1} → ${h.result === "SAFE" ? "✅ SAFE" : "🟥 TRAP"}`)
      .join("<br/>");
  }

  renderGrid();
}

function renderGrid(){
  ui.grid.innerHTML = "";

  // Rendu de haut (row 7) vers bas (row 0)
  for(let visual = 0; visual < ROWS; visual++){
    const row = ROWS - 1 - visual;

    for(let col = 0; col < COLS; col++){
      const tile = document.createElement("div");
      tile.id = `tile-r${row}-c${col}`;
      tile.className = "tower-tile";

      // Classes par statut de ligne
      if(state.running){
        if(row === state.activeRow) tile.classList.add("active");
        else if(row > state.activeRow) tile.classList.add("future");
        else tile.classList.add("past");
      }else{
        // après partie : tout en "past" visuel, mais on laisse les reveals via historique
        tile.classList.add("past");
      }

      // disabled si pas ligne active ou locked
      const disabled = !state.running || state.locked || row !== state.activeRow;
      tile.setAttribute("aria-disabled", disabled ? "true" : "false");

      // contenu
      const inner = document.createElement("div");
      inner.className = "tower-inner";

      // (Optionnel) icône gem — si tu ajoutes un PNG plus tard
      // const img = document.createElement("img");
      // img.className = "tower-gem";
      // img.src = "assets/tower/gem.png";
      // img.alt = "Gem";
      // inner.appendChild(img);

      const main = document.createElement("div");
      main.textContent = " ";
      const mini = document.createElement("div");
      mini.className = "tower-mini";
      mini.textContent = (row === state.activeRow && state.running) ? `Ligne ${row+1}` : "";
      inner.appendChild(main);
      inner.appendChild(mini);

      tile.appendChild(inner);

      // interactions
      tile.addEventListener("click", () => {
        if(disabled) return;
        onPick(row, col);
      });

      ui.grid.appendChild(tile);
    }
  }

  // Re-appliquer l’historique (pour garder vert/rouge au re-render)
  for(const h of state.history){
    revealTile(h.row, h.col, h.result);
  }
}

// Events
ui.btnStart?.addEventListener("click", start);
ui.btnReset?.addEventListener("click", resetAll);
ui.btnStop?.addEventListener("click", stopRun);

// Init
render();
