import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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

// Use default Firestore (memory cache only, no IndexedDB persistence).
//
// WHY we removed persistentLocalCache:
//   The persistentMultipleTabManager was causing cross-device sync failures.
//   It routes secondary tabs through BroadcastChannel instead of opening
//   their own WebSocket to Firestore. If that broadcast fails or the primary
//   tab is on a different device, the secondary tab gets stale data.
//
// With memory-only cache (default):
//   • EVERY device and tab gets its own direct WebSocket to Firestore
//   • onSnapshot() callbacks ALWAYS reflect live server state
//   • No stale IndexedDB data ever overrides fresh server data
//   • Data appears on all devices within 1-2 seconds of any write
//   • Slight tradeoff: first load fetches from network (not disk cache)
//     but this is exactly what we want for a real-time business app.
export const db = getFirestore(app);
