// avatar.js
const AVATAR = {
  frameSize: 512,
  cols: 4,
  rows: 3,
  frames: 12,
  fps: 10,
  moodFiles: {
    neutral: "./avatars/avatar_neutral_12f_512.png",
    smile:   "./avatars/avatar_smile_12f_512.png",
    happy:   "./avatars/avatar_happy_12f_512.png",
    sad:     "./avatars/avatar_sad_12f_512.png",
  }
};

let avatarEl = null;
let mood = "neutral";
let frame = 0;
let timer = null;

function setSpriteSheet(m) {
  mood = m;
  if (!avatarEl) return;
  avatarEl.style.backgroundImage = `url("${AVATAR.moodFiles[m] || AVATAR.moodFiles.neutral}")`;
  frame = 0;
  renderFrame();
}

function renderFrame() {
  if (!avatarEl) return;

  // Responsive: si CSS a réduit l’affichage à 320, on calcule la frame réelle affichée
  const displayedSize = avatarEl.getBoundingClientRect().width;
  const px = Math.round(displayedSize); // 512 desktop, ~320 mobile
  const col = frame % AVATAR.cols;
  const row = Math.floor(frame / AVATAR.cols);

  avatarEl.style.backgroundPosition = `-${col * px}px -${row * px}px`;
}

function startAnim() {
  stopAnim();
  const interval = Math.max(40, Math.floor(1000 / AVATAR.fps));
  timer = setInterval(() => {
    frame = (frame + 1) % AVATAR.frames;
    renderFrame();
  }, interval);
}

function stopAnim() {
  if (timer) clearInterval(timer);
  timer = null;
}

// API publique : à appeler depuis tes jeux
export function setAvatarMood(m) {
  setSpriteSheet(m);
}

// Réactions “courtes” : exemple, happy 1.5 sec puis retour neutral
export function react(m, ms = 1500) {
  setSpriteSheet(m);
  window.setTimeout(() => setSpriteSheet("neutral"), ms);
}

export function initAvatar() {
  avatarEl = document.getElementById("avatarSprite");
  if (!avatarEl) return;

  // Charger neutral par défaut
  setSpriteSheet("neutral");
  startAnim();

  // Re-render au resize pour garder le bon cadrage (512 vs 320)
  window.addEventListener("resize", () => renderFrame());
}
