import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "./src/firebase/config.ts";

async function run() {
  const collectionsToWipe = [
    "staff",
    "expenses",
    "attendance",
    "salaryRecords",
    "salaryPayments",
    "advanceRecords",
    "leaveRecords",
    "temporaryStaff"
  ];

  try {
    for (const colName of collectionsToWipe) {
      console.log(`Wiping collection: ${colName}...`);
      const snap = await getDocs(collection(db, colName));
      let deleted = 0;
      for (const d of snap.docs) {
        await deleteDoc(doc(db, colName, d.id));
        deleted++;
      }
      console.log(`-> Deleted ${deleted} documents from ${colName}.`);
    }
    console.log("All data successfully wiped.");
  } catch (err) {
    console.error("Error wiping data:", err);
  }
}

run();
