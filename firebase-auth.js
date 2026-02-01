// firebase-auth.js
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

import { auth } from "./firebase-config.js";

// --- validations ---
function normalizeUsername(u) {
  const username = (u || "").trim();
  if (username.length < 3) throw new Error("Le pseudo doit contenir au moins 3 caractères.");
  if (username.length > 24) throw new Error("Le pseudo doit contenir au plus 24 caractères.");
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) throw new Error("Caractères permis: lettres, chiffres, . _ -");
  return username;
}

function usernameToEmail(username) {
  return `${username}@casino-crush.local`;
}

function mapAuthError(err) {
  const code = err?.code || "";

  if (code === "auth/email-already-in-use") return "Ce pseudo existe déjà.";
  if (code === "auth/weak-password") return "Mot de passe trop faible (minimum 6 caractères).";
  if (code === "auth/invalid-email") return "Pseudo invalide (format).";
  if (code === "auth/invalid-credential") return "Pseudo ou mot de passe incorrect.";
  if (code === "auth/user-not-found") return "Compte introuvable.";
  if (code === "auth/network-request-failed") return "Problème réseau. Réessaie.";
  return "Erreur technique. Réessaie.";
}

// --- API ---
export async function signupWithUsername(usernameInput, password) {
  try {
    const username = normalizeUsername(usernameInput);
    if (!password || password.length < 6) throw new Error("Le mot de passe doit contenir au moins 6 caractères.");

    const email = usernameToEmail(username);

    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // Le displayName servira au bandeau (pseudo)
    await updateProfile(cred.user, { displayName: username });

    return { ok: true, user: cred.user, username };
  } catch (err) {
    const msg = err?.code ? mapAuthError(err) : (err?.message || "Erreur.");
    return { ok: false, msg };
  }
}

export async function loginWithUsername(usernameInput, password) {
  try {
    const username = normalizeUsername(usernameInput);
    const email = usernameToEmail(username);

    const cred = await signInWithEmailAndPassword(auth, email, password);

    return { ok: true, user: cred.user, username: cred.user.displayName || username };
  } catch (err) {
    return { ok: false, msg: mapAuthError(err) };
  }
}

export async function logout() {
  await signOut(auth);
}

export function onUserChanged(callback) {
  return onAuthStateChanged(auth, callback);
}
