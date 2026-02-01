// auth-ui.js
import { onUserChanged, logout } from "./firebase-auth.js";
import { ensureUserDoc, getCredits } from "./credits.js";

function el(id) { return document.getElementById(id); }

async function setUserBar(user) {
  const userNameEl = el("userPseudo");
  const userCreditsEl = el("userCredits");
  const userAuthedEl = el("userAuthed");
  const userAnonEl = el("userAnon");

  if (!userNameEl || !userAuthedEl || !userAnonEl) return;

  if (user) {
    userNameEl.textContent = user.displayName || "Utilisateur";
    userAuthedEl.style.display = "flex";
    userAnonEl.style.display = "none";

    // Expose l'utilisateur pour les jeux (lecture)
    window.CC_CURRENT_USER = user;

    if (userCreditsEl) {
      try {
        await ensureUserDoc(user, 1000);
        const c = await getCredits(user);
        userCreditsEl.textContent = (c === null) ? "—" : String(c);
      } catch (e) {
        console.error(e);
        userCreditsEl.textContent = "—";
      }
    }
  } else {
    userAuthedEl.style.display = "none";
    userAnonEl.style.display = "flex";
    window.CC_CURRENT_USER = null;

    const userCreditsEl2 = el("userCredits");
    if (userCreditsEl2) userCreditsEl2.textContent = "—";
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
  onUserChanged((user) => { setUserBar(user); });
});
