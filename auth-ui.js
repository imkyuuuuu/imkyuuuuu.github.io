// auth-ui.js
import { onUserChanged, logout } from "./firebase-auth.js";

function el(id) { return document.getElementById(id); }

function setUserBar(user) {
  const userNameEl = el("userPseudo");
  const userAuthedEl = el("userAuthed");
  const userAnonEl = el("userAnon");

  if (!userNameEl || !userAuthedEl || !userAnonEl) return;

  if (user) {
    userNameEl.textContent = user.displayName || "Utilisateur";
    userAuthedEl.style.display = "flex";
    userAnonEl.style.display = "none";
  } else {
    userAuthedEl.style.display = "none";
    userAnonEl.style.display = "flex";
  }
}

function wireLogout() {
  const btn = el("btnLogout");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    try { await logout(); } catch {}
    window.location.href = "./index.html";
  });
}

window.addEventListener("load", () => {
  wireLogout();
  onUserChanged((user) => setUserBar(user));
});
