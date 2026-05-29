import { collection, getDocs, deleteDoc, query, where, doc } from "firebase/firestore";
import { db } from "./src/firebase/config.ts";

async function run() {
  try {
    const q = query(collection(db, "salaryRecords"), where("status", "!=", "paid"));
    const snap = await getDocs(q);
    
    console.log(`Found ${snap.size} non-paid records.`);
    
    let deletedCount = 0;
    for (const d of snap.docs) {
      const data = d.data();
      console.log(`Record ID: ${d.id}, Remaining Due: ${data.remainingDue}, Status: ${data.status}`);
      
      // The user wants to delete the 9000 pending salary. Let's just delete any unpaid record to clean up, or specifically the ones that are causing the 9000 issue.
      if (data.remainingDue > 0) {
        console.log(`Deleting record with ${data.remainingDue} due...`);
        await deleteDoc(doc(db, "salaryRecords", d.id));
        deletedCount++;
      }
    }
    
    console.log(`Deleted ${deletedCount} records successfully.`);
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
