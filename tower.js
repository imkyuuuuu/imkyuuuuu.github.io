// Tower (arcade) - aucune mise, aucun argent, score fictif
// RNG: crypto.getRandomValues pour éviter Math.random (qualité meilleure)

const STORAGE_KEY = "casino_crush_tower_state_v1";

function randInt(maxExclusive) {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % maxExclusive;
}

function el(id) { return document.getElementById(id); }

const ui = {
  floor: el("towerFloor"),
  score: el("towerScore"),
  status: el("towerStatus"),
  log: el("towerLog"),
  choices: el("towerChoices"),

  inpFloors: el("inpFloors"),
  inpCols: el("inpCols"),
  inpPoints: el("inpPoints"),

  btnStart: el("btnStartTower"),
  btnReset: el("btnResetTower"),
  btnStop: el("btnStopRun"),

  disclaimer: el("towerDisclaimer"),
  btnHideDisclaimer: el("btnHideTowerDisclaimer")
};

const defaultState = {
  showDisclaimer: true,
  config: { floors: 10, cols: 3, pointsPerFloor: 50 },
  running: false,
  currentFloor: 0, // 0-based: 0 = avant le 1er étage
  score: 0,
  // Pour transparence/debug: on stocke la case sûre pour chaque étage (déterminée au départ)
  safeByFloor: [],
  history: [] // { floor, pick, safe, result }
};

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const s = JSON.parse(raw);
    return { ...structuredClone(defaultState), ...s };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function setState(patch) {
  state = { ...state, ...patch };
  saveState();
  render();
}

function resetAll() {
  state = structuredClone(defaultState);
  saveState();
  render();
}

function render() {
  ui.disclaimer.style.display = state.showDisclaimer ? "block" : "none";

  // HUD
  ui.floor.textContent = state.running ? `${state.currentFloor + 1} / ${state.config.floors}` : "—";
  ui.score.textContent = String(state.score);
  ui.status.textContent = state.running
    ? "En cours"
    : (state.currentFloor === 0 && state.score === 0 ? "Prêt" : "Terminé");

  // Settings inputs
  ui.inpFloors.value = String(state.config.floors);
  ui.inpCols.value = String(state.config.cols);
  ui.inpPoints.value = String(state.config.pointsPerFloor);

  ui.btnStop.disabled = !state.running;

  // Log
  if (state.history.length === 0) {
    ui.log.textContent = "—";
  } else {
    ui.log.innerHTML = state.history
      .slice(-12)
      .map(h => {
        const floorDisplay = h.floor + 1;
        const verdict = h.result === "SAFE" ? "✅ SAFE" : "🟥 TRAP";
        return `<div>Étage ${floorDisplay}: choix ${h.pick + 1} → ${verdict}</div>`;
      })
      .join("");
  }

  // Choices
  renderChoices();
}

function renderChoices() {
  ui.choices.innerHTML = "";

  if (!state.running) {
    ui.choices.innerHTML = `<div class="tower-muted">Démarre une partie pour afficher les cases.</div>`;
    return;
  }

  const cols = state.config.cols;
  for (let i = 0; i < cols; i++) {
    const b = document.createElement("button");
    b.className = "tower-tile btn secondary";
    b.textContent = `Case ${i + 1}`;
    b.onclick = () => onPick(i);
    ui.choices.appendChild(b);
  }
}

function startGameFromInputs() {
  const floors = clamp(parseInt(ui.inpFloors.value, 10) || 10, 5, 50);
  const cols = clamp(parseInt(ui.inpCols.value, 10) || 3, 2, 6);
  const pointsPerFloor = clamp(parseInt(ui.inpPoints.value, 10) || 50, 1, 1000);

  // Détermine dès le départ la case sûre de chaque étage (1 par étage)
  const safeByFloor = Array.from({ length: floors }, () => randInt(cols));

  setState({
    config: { floors, cols, pointsPerFloor },
    running: true,
    currentFloor: 0,
    score: 0,
    safeByFloor,
    history: []
  });
}

function onPick(choiceIndex) {
  if (!state.running) return;

  const floor = state.currentFloor;
  const safe = state.safeByFloor[floor];

  const isSafe = (choiceIndex === safe);
  const entry = {
    floor,
    pick: choiceIndex,
    safe,
    result: isSafe ? "SAFE" : "TRAP"
  };

  const history = [...state.history, entry];

  if (!isSafe) {
    // Fin de partie
    setState({
      running: false,
      history
    });
    return;
  }

  // Safe: on avance et on marque des points
  const newScore = state.score + state.config.pointsPerFloor;
  const nextFloor = floor + 1;

  // Si dernier étage complété : partie terminée
  if (nextFloor >= state.config.floors) {
    setState({
      score: newScore,
      currentFloor: nextFloor - 1,
      running: false,
      history
    });
    return;
  }

  setState({
    score: newScore,
    currentFloor: nextFloor,
    history
  });
}

function stopRun() {
  // Arrêt volontaire : on termine sans perdre le score
  if (!state.running) return;
  setState({ running: false });
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// Disclaimer
ui.btnHideDisclaimer.addEventListener("click", () => setState({ showDisclaimer: false }));

// Actions
ui.btnStart.addEventListener("click", startGameFromInputs);
ui.btnReset.addEventListener("click", resetAll);
ui.btnStop.addEventListener("click", stopRun);

// Service Worker (si déjà utilisé dans ton projet)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

render();
