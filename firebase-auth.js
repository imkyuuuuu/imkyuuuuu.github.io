// credits.js
import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { db } from "./firebase-config.js";

const USERS_COL = "users";

export async function ensureUserDoc(user, initialCredits = 1000) {
  if (!user) throw new Error("Not authenticated");

  const ref = doc(db, USERS_COL, user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) return;

  await setDoc(ref, {
    displayName: user.displayName || "Utilisateur",
    credits: initialCredits,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function getCredits(user) {
  if (!user) return null;
  const ref = doc(db, USERS_COL, user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  return typeof data.credits === "number" ? data.credits : null;
}

// Débite uniquement si le solde est suffisant.
// Retour: { ok:true, credits:newCredits } ou { ok:false, msg, credits }
export async function spendCredits(user, amount) {
  if (!user) return { ok: false, msg: "Non connecté." };
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, msg: "Montant invalide." };

  const ref = doc(db, USERS_COL, user.uid);

  try {
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        // doc absent -> on le crée avec 0, puis on échoue (ou on initialise)
        tx.set(ref, {
          displayName: user.displayName || "Utilisateur",
          credits: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        return { ok: false, msg: "Compte crédit non initialisé.", credits: 0 };
      }

      const credits = snap.data().credits ?? 0;
      if (typeof credits !== "number") throw new Error("Invalid credits type");

      if (credits < amount) {
        return { ok: false, msg: "Crédits insuffisants.", credits };
      }

      const newCredits = credits - amount;
      tx.update(ref, { credits: newCredits, updatedAt: serverTimestamp() });
      return { ok: true, credits: newCredits };
    });

    return result;
  } catch (e) {
    console.error("spendCredits error:", e);
    return { ok: false, msg: "Erreur technique (transaction).", credits: null };
  }
}

export async function addCredits(user, amount) {
  if (!user) return { ok: false, msg: "Non connecté." };
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, msg: "Montant invalide." };

  const ref = doc(db, USERS_COL, user.uid);

  try {
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);

      if (!snap.exists()) {
        const newCredits = amount;
        tx.set(ref, {
          displayName: user.displayName || "Utilisateur",
          credits: newCredits,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        return { ok: true, credits: newCredits };
      }

      const credits = snap.data().credits ?? 0;
      if (typeof credits !== "number") throw new Error("Invalid credits type");

      const newCredits = credits + amount;
      tx.update(ref, { credits: newCredits, updatedAt: serverTimestamp() });
      return { ok: true, credits: newCredits };
    });

    return result;
  } catch (e) {
    console.error("addCredits error:", e);
    return { ok: false, msg: "Erreur technique (transaction).", credits: null };
  }
}
