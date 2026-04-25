import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';
import firebaseConfig from '../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Using initializeFirestore with explicit settings to force long-polling.
// This is the most reliable way to connect in restricted preview environments.
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  // We avoid enabling persistence here to ensure we always try to fetch fresh data 
  // and don't get stuck in an "offline" cache loop.
});

export const auth = getAuth(app);

// Initialize Analytics only in supported environments
export const analytics = typeof window !== 'undefined' ? isSupported().then(yes => yes ? getAnalytics(app) : null) : null;
