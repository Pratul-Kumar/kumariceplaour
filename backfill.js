import { collection, getDocs, addDoc, query, where } from "firebase/firestore";
import { db } from "./src/firebase/config";

async function run() {
  const paymentsSnap = await getDocs(collection(db, "salaryPayments"));
  const expensesSnap = await getDocs(collection(db, "expenses"));
  
  const existingSalaryExpenses = new Set();
  expensesSnap.forEach(doc => {
    const data = doc.data();
    if (data.category === "salary") {
      // Assuming note contains payment id or we just match by date and amount.
      // But we didn't store payment ID. We can just use staffId + date + amount
      existingSalaryExpenses.add(`${data.staffId}_${data.date}_${data.amount}`);
    }
  });

  let added = 0;
  for (const docSnap of paymentsSnap.docs) {
    const p = docSnap.data();
    const key = `${p.staffId}_${p.paymentDate}_${p.amountPaid}`;
    if (!existingSalaryExpenses.has(key)) {
      await addDoc(collection(db, "expenses"), {
        title: `Salary Payment`,
        amount: p.amountPaid,
        category: "salary",
        date: p.paymentDate,
        note: p.note || "Backfilled from Salary Management",
        staffId: p.staffId,
        createdAt: p.createdAt || new Date().toISOString(),
        updatedAt: p.createdAt || new Date().toISOString(),
      });
      added++;
      existingSalaryExpenses.add(key); // prevent dups in loop
    }
  }
  console.log("Backfilled " + added + " salary payments into expenses.");
}

run().catch(console.error);
