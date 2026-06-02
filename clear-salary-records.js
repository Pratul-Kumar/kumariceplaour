import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";

// ── Firebase config (inline for Node.js script) ──────────
const firebaseConfig = {
  apiKey:            "AIzaSyBtOtidD_wcA6-Ezan02hrRmbpV7DAP0x8",
  authDomain:        "kumar-ice-parlour-erp.firebaseapp.com",
  projectId:         "kumar-ice-parlour-erp",
  storageBucket:     "kumar-ice-parlour-erp.firebasestorage.app",
  messagingSenderId: "6550877324",
  appId:             "1:6550877324:web:c2f6ac683849f80578f7a9",
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ─────────────────────────────────────────────────────────
// SAFE SALARY RESET SCRIPT
// Deletes: salaryRecords, salaryPayments,
//          salary-typed ledger entries,
//          salary-linked dues
// Keeps:   staff, attendance, expenses,
//          standalone dues (advances, manual money)
// Resets:  outstandingBalance on each staff (recalculated
//          from remaining standalone dues only)
// ─────────────────────────────────────────────────────────

async function deleteCollection(colName) {
  const snap = await getDocs(collection(db, colName));
  let count = 0;
  for (const d of snap.docs) {
    await deleteDoc(doc(db, colName, d.id));
    count++;
  }
  console.log(`  ✓ Deleted ${count} docs from [${colName}]`);
  return count;
}

async function run() {
  console.log("\n🗑️  SAFE SALARY RESET — Starting...\n");

  // ── 1. Delete all salary records ──────────────────────
  console.log("1. Clearing salaryRecords...");
  await deleteCollection("salaryRecords");

  // ── 2. Delete all salary payments ─────────────────────
  console.log("2. Clearing salaryPayments...");
  await deleteCollection("salaryPayments");

  // ── 3. Delete salary-related ledger entries ────────────
  console.log("3. Clearing salary ledger entries...");
  const salaryLedgerTypes = [
    "salary_generated",
    "salary_paid",
    "salary_slip_generated",
    "due_created",
  ];
  const ledgerSnap = await getDocs(collection(db, "employee_ledger"));
  let ledgerDeleted = 0;
  for (const d of ledgerSnap.docs) {
    const data = d.data();
    if (salaryLedgerTypes.includes(data.type)) {
      await deleteDoc(doc(db, "employee_ledger", d.id));
      ledgerDeleted++;
    }
  }
  console.log(`  ✓ Deleted ${ledgerDeleted} salary ledger entries`);

  // ── 4. Delete salary-linked dues only ─────────────────
  console.log("4. Clearing salary-linked dues...");
  const duesSnap = await getDocs(collection(db, "dues"));
  let duesDeleted = 0;
  for (const d of duesSnap.docs) {
    const data = d.data();
    if (data.linkedSalaryId) {
      await deleteDoc(doc(db, "dues", d.id));
      duesDeleted++;
    }
  }
  console.log(`  ✓ Deleted ${duesDeleted} salary-linked due records`);

  // ── 5. Recalculate outstandingBalance from remaining dues
  console.log("5. Recalculating staff balances from remaining dues...");
  const staffSnap         = await getDocs(collection(db, "staff"));
  const remainingDuesSnap = await getDocs(collection(db, "dues"));

  // Build map: staffId → net balance from standalone dues only
  const balanceMap = {};
  for (const d of remainingDuesSnap.docs) {
    const data = d.data();
    if (data.isDeleted || data.linkedSalaryId) continue;
    const staffId  = data.staffId;
    const remaining = data.remainingAmount || 0;
    if (!balanceMap[staffId]) balanceMap[staffId] = 0;
    // EMPLOYEE_TO_OWNER → owner is owed → positive
    // OWNER_TO_EMPLOYEE → employee is owed → negative
    balanceMap[staffId] += data.type === "EMPLOYEE_TO_OWNER" ? remaining : -remaining;
  }

  let staffUpdated = 0;
  for (const s of staffSnap.docs) {
    const data       = s.data();
    const newBalance = balanceMap[s.id] || 0;
    await updateDoc(doc(db, "staff", s.id), {
      outstandingBalance: newBalance,
      updatedAt: new Date().toISOString(),
    });
    staffUpdated++;
    console.log(`  → ${data.name}: balance = ₹${newBalance}`);
  }
  console.log(`  ✓ Updated ${staffUpdated} staff records`);

  console.log("\n✅  SALARY RESET COMPLETE!");
  console.log("    Kept   : staff, attendance, expenses, standalone dues");
  console.log("    Deleted: salaryRecords, salaryPayments, salary ledger, salary-linked dues\n");
  process.exit(0);
}

run().catch((err) => {
  console.error("\n❌ Error during reset:", err);
  process.exit(1);
});
