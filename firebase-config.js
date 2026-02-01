// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

// (Optionnel) Analytics
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyBeRGb-TInji9eNfMkYmnmY8BAU_94fppM",
  authDomain: "casino-cash-48d5f.firebaseapp.com",
  projectId: "casino-cash-48d5f",
  storageBucket: "casino-cash-48d5f.firebasestorage.app",
  messagingSenderId: "989603093785",
  appId: "1:989603093785:web:d23072e7a1380a99c1f988",
  measurementId: "G-VMEPLYS7VR"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export let analytics = null;
isSupported().then((ok) => {
  if (ok) analytics = getAnalytics(app);
}).catch(() => {});
