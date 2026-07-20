// BAILS — FIREBASE CONFIGURATION (Spark Plan Edition)
// Spark plan uses: Auth + Firestore + Hosting only.
// No Storage, no Messaging needed.
//
// Replace values below with your Firebase project credentials:
// Firebase Console → Project Settings → Your Apps → Web App → Config
const firebaseConfig = {
  apiKey: "AIzaSyCK8CCIApscu5Nqb4Yz7EtbmfjDQOY_6so",
  authDomain: "bails-cricketscorer.firebaseapp.com",
  projectId: "bails-cricketscorer",
  storageBucket: "bails-cricketscorer.firebasestorage.app",
  messagingSenderId: "657020143480",
  appId: "1:657020143480:web:aada00b6f838edab18aa8d",
  measurementId: "G-W1M0BPRGSS"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.firestore();
// NOTE: No `storage` constant — Firebase Storage is NOT used in this Spark edition.
// All images are compressed client-side and stored as base64 strings in Firestore.

// Enable Firestore offline persistence (works on Spark)
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
