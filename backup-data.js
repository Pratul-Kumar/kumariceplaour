import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs/promises";

async function loadEnv() {
  const env = {};
  try {
    const envText = await fs.readFile(".env", "utf-8");
    envText.split("\n").forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const parts = trimmed.split("=");
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
        env[key] = val;
      }
    });
  } catch (err) {
    console.warn("Could not load .env file. Falling back to process.env.", err.message);
  }
  return { ...process.env, ...env };
}

async function backup() {
  const env = await loadEnv();

  const firebaseConfig = {
    apiKey:            env.VITE_FIREBASE_API_KEY,
    authDomain:        env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             env.VITE_FIREBASE_APP_ID,
  };

  if (!firebaseConfig.projectId) {
    console.error("Error: VITE_FIREBASE_PROJECT_ID is not configured in .env!");
    return;
  }

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const collectionsToBackup = [
    "staff",
    "expenses",
    "attendance",
    "salaryRecords",
    "salaryPayments",
    "advanceRecords",
    "leaveRecords",
    "temporaryStaff",
    "employee_ledger",
    "settings"
  ];

  const backupData = {};

  try {
    console.log("Starting Firestore database backup...");
    for (const colName of collectionsToBackup) {
      console.log(`Fetching collection: ${colName}...`);
      try {
        const snap = await getDocs(collection(db, colName));
        backupData[colName] = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        console.log(`-> Fetched ${snap.size} documents from ${colName}.`);
      } catch (err) {
        console.error(`Error fetching collection ${colName}:`, err.message);
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup-data-${timestamp}.json`;
    await fs.writeFile(filename, JSON.stringify(backupData, null, 2), "utf-8");
    console.log(`\nBackup successfully written to ${filename}`);
  } catch (err) {
    console.error("Backup failed:", err);
  }
}

backup();
