import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// Singleton guard — prevents duplicate initialization during hot-reload / StrictMode
export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Firestore with IndexedDB persistence.
//
// How cross-device sync works:
//   • All collections use onSnapshot() listeners — these are ALWAYS kept in sync
//     with the Firestore server when the device is online. Cross-device updates
//     arrive typically within 1-2 seconds via the WebSocket channel.
//   • persistentLocalCache means the FIRST render is served from disk (fast),
//     then the server update arrives and triggers a second onSnapshot callback,
//     updating the UI. This is expected behavior and not a bug.
//   • persistentMultipleTabManager coordinates IndexedDB access between tabs on
//     the SAME device (only one tab holds the WebSocket; others use broadcast).
//   • Plain getDocs() (no forced server source) allows cache reads for offline
//     resilience while still receiving server updates via active listeners.
//
// Result: data syncs in real-time across ALL devices and tabs automatically.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
    cacheSizeBytes: CACHE_SIZE_UNLIMITED,
  }),
});
