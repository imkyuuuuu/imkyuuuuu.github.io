// Tower (arcade) – animation de révélation + tour verticale
// Aucun enjeu réel, score fictif uniquement.

const STORAGE_KEY = "casino_crush_tower_state_v2";

function randInt(maxExclusive) {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % maxExclusive;
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function el(id) { return document.getElementById(id); }
function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

const ui = {
  floor: el("towerFloor"),
  score: el("towerScore"),
  status: el("towerStatus"),
  log: el("towerLog"),
  choices: el("towerChoices"),
  stack: el("towerStack"),
  hint: el("towerHint"),

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
  locked: false,           // bloque durant l’animation de révélation
  currentFloor: 0,         // 0-based
  score: 0,

  safeByFloor: [],
  history: [],             // { floor, pick, safe, result }

  // pour animation/reveal
  lastReveal: null         // { floor, pick, safe, result }
};

let state = loadState();

function structuredCloneSafe(obj){
  return JSON.parse(JSON.stringify(obj));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredCloneSafe(defaultState);
    const s = JSON.parse(raw);
    // validation minimaliste
    if (!s.config || typeof s.config.floors !== "number") return structuredCloneSafe(defaultState);
    return { ...structuredCloneSafe(defaultState), ...s };
  } catch {
    return structuredCloneSafe(defaultState);
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
  state = structuredCloneSafe(defaultState);
  saveState();
  render();
}

function startGameFromInputs() {
  const floors = clamp(parseInt(ui.inpFloors.value, 10) || 10, 5, 50);
  const cols = clamp(parseInt(ui.inpCols.value, 10) || 3, 2, 6);
  const pointsPerFloor = clamp(parseInt(ui.inpPoints.value, 10) || 50, 1, 1000);

  const safeByFloor = Array.from({ length: floors }, () => randInt(cols));

  setState({
    config: { floors, cols, pointsPerFloor },
    running: true,
    locked: false,
    currentFloor: 0,
    score: 0,
    safeByFloor,
    history: [],
    lastReveal: null
  });
}

function stopRun() {
  if (!state.running) return;
  setState({ running: false, locked: false, lastReveal: null });
  ui.hint.textContent = "Run terminée volontairement. Score conservé.";
}

async function onPick(choiceIndex) {
  if (!state.running || state.locked) return;

  const floor = state.currentFloor;
  const safe = state.safeByFloor[floor];
  const isSafe = (choiceIndex === safe);

  const reveal = {
    floor,
    pick: choiceIndex,
    safe,
    result: isSafe ? "SAFE" : "TRAP"
  };

  // verrouille et mémorise la révélation
  setState({ locked: true, lastReveal: reveal });
  ui.hint.textContent = "Révélation…";

  // 1) déclencher flip sur la tuile choisie immédiatement
  revealTile(choiceIndex, isSafe);

  // 2) après un court délai, révéler la tuile safe si différente (feedback visuel)
  await delay(280);
  if (safe !== choiceIndex) {
    revealTile(safe, true, true); // revealSafeOnly: ne marque pas comme "trap"
  }

  // 3) laisser le temps d’observer
  await delay(520);

  // commit logique jeu
  const history = [...state.history, reveal];

  if (!isSafe) {
    setState({
      running: false,
      locked: false,
      history
    });
    ui.hint.textContent = "Échec. Partie terminée.";
    return;
  }

  // safe => points + étage suivant
  const newScore = state.score + state.config.pointsPerFloor;
  const nextFloor = floor + 1;

  if (nextFloor >= state.config.floors) {
    setState({
      score: newScore,
      running: false,
      locked: false,
      history,
      lastReveal: null
    });
    ui.hint.textContent = "Bravo — tour complétée.";
    return;
  }

  setState({
    score: newScore,
    currentFloor: nextFloor,
    locked: false,
    history,
    lastReveal: null
  });
  ui.hint.textContent = "Réussi. Étage suivant.";
}

function revealTile(index, isSafe, revealSafeOnly=false) {
  const tile = ui.choices.querySelector(`[data-index="${index}"]`);
  if (!tile) return;

  // prépare classes
  tile.classList.add("reveal");
  tile.classList.remove("safe", "trap");

  const back = tile.querySelector(".tower-back");
  if (back) {
    back.classList.remove("safe-back", "trap-back");
    if (isSafe) {
      back.classList.add("safe-back");
      back.textContent = "SAFE";
    } else {
      back.classList.add("trap-back");
      back.textContent = "TRAP";
    }
  }

  // color border
  if (isSafe) tile.classList.add("safe");
  else if (!revealSafeOnly) tile.classList.add("trap");
}

function render() {
  ui.disclaimer.style.display = state.showDisclaimer ? "block" : "none";

  // HUD
  ui.score.textContent = String(state.score);

  if (state.running) {
    ui.floor.textContent = `${state.currentFloor + 1} / ${state.config.floors}`;
    ui.status.textContent = state.locked ? "Révélation…" : "En cours";
  } else {
    ui.floor.textContent = "—";
    ui.status.textContent = (state.history.length === 0) ? "Prêt" : "Terminé";
  }

  // inputs
  ui.inpFloors.value = String(state.config.floors);
  ui.inpCols.value = String(state.config.cols);
  ui.inpPoints.value = String(state.config.pointsPerFloor);

  ui.btnStop.disabled = !state.running || state.locked;

  // log
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

  // render tower stack + choices
  renderTowerStack();
  renderChoicesGrid();

  saveState();
}

function renderTowerStack() {
  const floors = state.config.floors;
  const cols = state.config.cols;

  ui.stack.innerHTML = "";

  // Construire du haut vers le bas (floor N -> 1)
  for (let f = floors - 1; f >= 0; f--) {
    const row = document.createElement("div");

    // état du plancher
    const hist = state.history.find(h => h.floor === f);
    const isDone = hist && hist.result === "SAFE";
    const isFail = hist && hist.result === "TRAP";
    const isActive = state.running && f === state.currentFloor;

    row.className = "tower-floor " +
      (isActive ? "floor-active" : "") +
      (isDone ? " floor-done" : "") +
      (isFail ? " floor-fail" : "") +
      (!isActive && !isDone && !isFail ? " floor-upcoming" : "");

    const label = document.createElement("div");
    label.className = "floor-label";
    label.textContent = `Étage ${f + 1}`;

    const mini = document.createElement("div");
    mini.className = "floor-mini";

    for (let c = 0; c < cols; c++) {
      const dot = document.createElement("div");
      dot.className = "mini-cell";

      // si on a une entrée historique pour cet étage : colorer la case choisie et la safe
      if (hist) {
        if (c === hist.safe) {
          dot.style.borderColor = "rgba(34,197,94,.50)";
          dot.style.background = "rgba(34,197,94,.18)";
        }
        if (c === hist.pick && hist.result === "TRAP") {
          dot.style.borderColor = "rgba(239,68,68,.55)";
          dot.style.background = "rgba(239,68,68,.18)";
        }
      }

      // si étage actif : marquer visuellement
      if (isActive) {
        dot.style.borderColor = "rgba(124,58,237,.55)";
        dot.style.background = "rgba(124,58,237,.12)";
      }

      mini.appendChild(dot);
    }

    row.appendChild(label);
    row.appendChild(mini);
    ui.stack.appendChild(row);
  }
}

function renderChoicesGrid() {
  ui.choices.innerHTML = "";

  // régler le nombre de colonnes visuel
  ui.choices.style.gridTemplateColumns = `repeat(${state.config.cols}, minmax(0, 1fr))`;

  if (!state.running) {
    ui.choices.innerHTML = `<div class="tower-muted">Démarre une partie pour afficher les cases.</div>`;
    return;
  }

  for (let i = 0; i < state.config.cols; i++) {
    const tile = document.createElement("div");
    tile.className = "tower-tile";
    tile.dataset.index = String(i);
    tile.setAttribute("role", "button");
    tile.setAttribute("tabindex", state.locked ? "-1" : "0");
    tile.setAttribute("aria-disabled", state.locked ? "true" : "false");

    // flip card
    const card = document.createElement("div");
    card.className = "tower-card";

    const front = document.createElement("div");
    front.className = "tower-face tower-front";
    front.textContent = `Case ${i + 1}`;

    const back = document.createElement("div");
    back.className = "tower-face tower-back";
    back.textContent = "—";

    card.appendChild(front);
    card.appendChild(back);
    tile.appendChild(card);

    // click handler
    tile.addEventListener("click", () => onPick(i));
    tile.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") onPick(i);
    });

    ui.choices.appendChild(tile);
  }
}

// Disclaimer
ui.btnHideDisclaimer.addEventListener("click", () => setState({ showDisclaimer: false }));

// Actions
ui.btnStart.addEventListener("click", startGameFromInputs);
ui.btnReset.addEventListener("click", resetAll);
ui.btnStop.addEventListener("click", stopRun);

// Service Worker (si déjà utilisé)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

render();
