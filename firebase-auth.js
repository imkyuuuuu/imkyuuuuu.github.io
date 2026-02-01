// firebase-auth.js
// Auth Firebase (pseudo + mot de passe) via Email/Password
// - On conserve l'UX "username + password" en mappant username -> email technique
// - On met displayName = username
// - Recommandation: on s'assure qu'un doc Firestore user/credits existe à l'inscription ET à la connexion

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

import { auth } from "./firebase-config.js";
import { ensureUserDoc } from "./credits.js";

// ------------------ Helpers ------------------
function normalizeUsername(u) {
  const username = (u || "").trim();
  if (username.length < 3) throw new Error("Le pseudo doit contenir au moins 3 caractères.");
  if (username.length > 24) throw new Error("Le pseudo doit contenir au plus 24 caractères.");
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    throw new Error("Caractères permis: lettres, chiffres, . _ -");
  }
  return username;
}

function usernameToEmail(username) {
  // Email technique (pas de vérification).
  // ⚠️ Si un jour tu veux un vrai reset password par email, il faudra demander un vrai email.
  return `${username}@casino-crush.local`;
}

function mapAuthError(err) {
  const code = err?.code || "";

  // Messages simples (sans jargon) pour l'UI
  if (code === "auth/email-already-in-use") return "Ce pseudo existe déjà.";
  if (code === "auth/weak-password") return "Mot de passe trop faible (minimum 6 caractères).";
  if (code === "auth/invalid-email") return "Pseudo invalide (format).";
  if (code === "auth/invalid-credential") return "Pseudo ou mot de passe incorrect.";
  if (code === "auth/user-not-found") return "Compte introuvable.";
  if (code === "auth/network-request-failed") return "Problème réseau. Réessaie.";
  if (code === "auth/too-many-requests") return "Trop d’essais. Réessaie plus tard.";
  return "Erreur technique. Réessaie.";
}

// ------------------ API ------------------

/**
 * Inscription avec pseudo + mot de passe.
 * - crée l'utilisateur email/password
 * - définit displayName = pseudo
 * - crée (si absent) le doc Firestore "users/{uid}" avec credits initiaux
 */
export async function signupWithUsername(usernameInput, password, initialCredits = 1000) {
  try {
    const username = normalizeUsername(usernameInput);

    if (!password || password.length < 6) {
      throw new Error("Le mot de passe doit contenir au moins 6 caractères.");
    }

    const email = usernameToEmail(username);

    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // displayName = pseudo (pour l'UI / header)
    await updateProfile(cred.user, { displayName: username });

    // ✅ Recommandation: s'assurer qu'un doc crédits existe
    // Note: on attend updateProfile avant pour que displayName soit déjà placé.
    await ensureUserDoc(cred.user, initialCredits);

    return { ok: true, user: cred.user, username };
  } catch (err) {
    const msg = err?.code ? mapAuthError(err) : (err?.message || "Erreur.");
    return { ok: false, msg };
  }
}

/**
 * Connexion avec pseudo + mot de passe.
 * - connecte l'utilisateur email/password
 * - crée (si absent) le doc Firestore "users/{uid}" (option recommandé)
 */
export async function loginWithUsername(usernameInput, password, initialCredits = 1000) {
  try {
    const username = normalizeUsername(usernameInput);
    const email = usernameToEmail(username);

    const cred = await signInWithEmailAndPassword(auth, email, password);

    // ✅ Recommandation: s'assurer qu'un doc crédits existe même si compte "ancien"
    await ensureUserDoc(cred.user, initialCredits);

    return { ok: true, user: cred.user, username: cred.user.displayName || username };
  } catch (err) {
    return { ok: false, msg: mapAuthError(err) };
  }
}

/**
 * Déconnexion.
 */
export async function logout() {
  await signOut(auth);
}

/**
 * Observer l'état auth (utile pour la barre UI persistante).
 * Retourne la fonction "unsubscribe".
 */
export function onUserChanged(callback) {
  return onAuthStateChanged(auth, callback);
}
