import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, limit, runTransaction, getDoc
} from "firebase/firestore";
import { db } from "@/firebase/config";
import type { Staff, Attendance, Expense, SalaryRecord, SalaryPayment, AdvanceRecord, AppSettings, LedgerEntry, LedgerType } from "@/types";

const mapDoc = <T>(d: any): T => ({ id: d.id, ...d.data() } as T);

// ─── TTL CACHE ────────────────────────────────────────────────────────────────
// Only used for historical (read-only) data. Current month always uses live listeners.
const TTL_MS = 5 * 60 * 1000;
interface CacheEntry<T> { data: T; ts: number; }
class TTLCache<T> {
  private store: Record<string, CacheEntry<T>> = {};
  get(key: string): T | undefined {
    const e = this.store[key];
    if (!e) return undefined;
    if (Date.now() - e.ts > TTL_MS) { delete this.store[key]; return undefined; }
    return e.data;
  }
  set(key: string, data: T) { this.store[key] = { data, ts: Date.now() }; }
  del(key: string) { delete this.store[key]; }
  clear() { this.store = {}; }
}

const expenseMonthCache = new TTLCache<number>();
const expenseCatCache   = new TTLCache<Record<string, number>>();

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);
const isHistorical  = (month: string) => month < CURRENT_MONTH;

// ─── STAFF SERVICE ────────────────────────────────────────────────────────────
const staffCol = collection(db, "staff");

export const staffService = {
  subscribeAll: (cb: (d: Staff[]) => void) =>
    onSnapshot(
      staffCol,
      s => cb(s.docs.map(mapDoc<Staff>)),
      err => console.error("[staffService.subscribeAll]", err.message)
    ),

  subscribeActive: (cb: (d: Staff[]) => void) =>
    onSnapshot(
      query(staffCol, where("status", "==", "active")),
      s => cb(s.docs.map(mapDoc<Staff>)),
      err => console.error("[staffService.subscribeActive]", err.message)
    ),

  subscribeById: (id: string, cb: (d: Staff | null) => void) =>
    onSnapshot(
      doc(db, "staff", id),
      d => cb(d.exists() ? mapDoc<Staff>(d) : null),
      err => console.error("[staffService.subscribeById]", err.message)
    ),

  getAll: async () => {
    const s = await getDocs(staffCol);
    return s.docs.map(mapDoc<Staff>);
  },

  getActive: async () => {
    const s = await getDocs(query(staffCol, where("status", "==", "active")));
    return s.docs.map(mapDoc<Staff>);
  },

  getById: async (id: string) => {
    const d = await getDoc(doc(db, "staff", id));
    return d.exists() ? mapDoc<Staff>(d) : undefined;
  },

  add: async (data: Omit<Staff, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    return addDoc(staffCol, { ...data, outstandingBalance: 0, createdAt: now, updatedAt: now });
  },
  update: async (id: string, data: Partial<Staff>) =>
    updateDoc(doc(db, "staff", id), { ...data, updatedAt: new Date().toISOString() }),
  delete: async (id: string) => deleteDoc(doc(db, "staff", id)),
  count: async () => (await getDocs(staffCol)).size,
};

// ─── ATTENDANCE SERVICE ───────────────────────────────────────────────────────
const attendanceCol = collection(db, "attendance");

export const attendanceService = {
  subscribeByMonth: (month: string, cb: (d: Attendance[]) => void) => {
    // range on same field (date) — no composite index needed
    const q = query(attendanceCol, where("date", ">=", `${month}-01`), where("date", "<=", `${month}-31`));
    return onSnapshot(q,
      s => cb(s.docs.map(mapDoc<Attendance>)),
      err => console.error("[attendanceService.subscribeByMonth]", err.message)
    );
  },

  getByStaffAndMonth: async (staffId: string, month: string) => {
    // Only filter by date range on a single field — no composite index required.
    // staffId is filtered client-side to avoid needing a (staffId + date) composite index.
    const q = query(
      attendanceCol,
      where("date", ">=", `${month}-01`),
      where("date", "<=", `${month}-31`)
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapDoc<Attendance>).filter(a => a.staffId === staffId);
  },

  upsert: async (data: Omit<Attendance, "id" | "createdAt" | "updatedAt">) => {
    const q = query(attendanceCol, where("date", "==", data.date));
    const snap = await getDocs(q);
    const existing = snap.docs.find(d => d.data().staffId === data.staffId);
    const now = new Date().toISOString();
    if (existing) return updateDoc(doc(db, "attendance", existing.id), { ...data, updatedAt: now });
    return addDoc(attendanceCol, { ...data, createdAt: now, updatedAt: now });
  },

  deleteRecord: async (staffId: string, date: string) => {
    const q = query(attendanceCol, where("date", "==", date));
    const snap = await getDocs(q);
    const existing = snap.docs.find(d => d.data().staffId === staffId);
    if (existing) return deleteDoc(doc(db, "attendance", existing.id));
  },

  getTodaySummary: async () => {
    const today = new Date().toISOString().split("T")[0];
    const snap = await getDocs(query(attendanceCol, where("date", "==", today)));
    const summary = { present: 0, absent: 0, half_day: 0, leave: 0, total: snap.size };
    snap.docs.forEach(d => {
      const s = d.data().status as keyof typeof summary;
      if (s in summary) (summary as any)[s]++;
    });
    return summary;
  },
};

// ─── EXPENSE SERVICE ──────────────────────────────────────────────────────────
const expensesCol = collection(db, "expenses");

export const expenseService = {
  subscribeByMonth: (month: string, cb: (d: Expense[]) => void) => {
    // range filter on single field (date) — no composite index needed
    const q = query(
      expensesCol,
      where("date", ">=", `${month}-01`),
      where("date", "<=", `${month}-31`)
    );
    return onSnapshot(q,
      snap => {
        const data = snap.docs.map(mapDoc<Expense>);
        data.sort((a, b) => b.date.localeCompare(a.date));
        let total = 0;
        const cats: Record<string, number> = {};
        data.forEach(e => { total += e.amount; cats[e.category] = (cats[e.category] || 0) + e.amount; });
        expenseMonthCache.set(month, total);
        expenseCatCache.set(month, cats);
        cb(data);
      },
      err => console.error("[expenseService.subscribeByMonth]", err.message)
    );
  },

  getMonthTotal: async (month: string): Promise<number> => {
    const cached = expenseMonthCache.get(month);
    if (cached !== undefined) return cached;
    const q = query(expensesCol, where("date", ">=", `${month}-01`), where("date", "<=", `${month}-31`));
    const snap = await getDocs(q);
    const total = snap.docs.reduce((s, d) => s + d.data().amount, 0);
    expenseMonthCache.set(month, total);
    return total;
  },

  getCategoryTotals: async (month: string): Promise<Record<string, number>> => {
    const cached = expenseCatCache.get(month);
    if (cached !== undefined) return cached;
    const q = query(expensesCol, where("date", ">=", `${month}-01`), where("date", "<=", `${month}-31`));
    const snap = await getDocs(q);
    const totals: Record<string, number> = {};
    snap.docs.forEach(d => { const c = d.data().category; totals[c] = (totals[c] || 0) + d.data().amount; });
    expenseCatCache.set(month, totals);
    return totals;
  },

  getTodayTotal: async () => {
    const today = new Date().toISOString().split("T")[0];
    const snap = await getDocs(query(expensesCol, where("date", "==", today)));
    return snap.docs.reduce((s, d) => s + d.data().amount, 0);
  },

  getRecent: async (limitCount = 10) => {
    const q = query(expensesCol, orderBy("date", "desc"), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(mapDoc<Expense>);
  },

  add: async (data: Omit<Expense, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    expenseMonthCache.del(data.date.slice(0, 7));
    expenseCatCache.del(data.date.slice(0, 7));
    
    if (data.category === "salary_advance") {
      if (!data.staffId) throw new Error("Staff is required for salary advance.");
      return runTransaction(db, async (tx) => {
        const expenseRef = doc(expensesCol);
        const advanceRef = doc(collection(db, "advanceRecords"));
        const staffRef = doc(db, "staff", data.staffId!);
        
        const staffSnap = await tx.get(staffRef);
        const currentBal = staffSnap.exists() ? ((staffSnap.data() as Staff).outstandingBalance || 0) : 0;
        
        tx.set(expenseRef, { ...data, createdAt: now, updatedAt: now });
        tx.set(advanceRef, {
          staffId: data.staffId,
          expenseId: expenseRef.id,
          amount: data.amount,
          date: data.date,
          month: data.date.slice(0, 7),
          reason: data.note || "Salary Advance",
          status: "pending",
          createdAt: now,
          updatedAt: now
        });
        
        // Ledger Entry
        const ledgerRef = doc(collection(db, "employee_ledger"));
        tx.set(ledgerRef, {
          staffId: data.staffId,
          type: "salary_advance",
          amount: data.amount,
          date: data.date,
          month: data.date.slice(0, 7),
          note: data.note || "Salary Advance",
          expenseId: expenseRef.id,
          createdAt: now,
          updatedAt: now
        });

        // Update Staff Balance
        tx.update(staffRef, {
          outstandingBalance: currentBal + data.amount,
          updatedAt: now
        });

        return expenseRef;
      });
    }

    return addDoc(expensesCol, { ...data, createdAt: now, updatedAt: now });
  },

  update: async (id: string, data: Partial<Expense>) => {
    if (data.date) { expenseMonthCache.del(data.date.slice(0, 7)); expenseCatCache.del(data.date.slice(0, 7)); }
    const now = new Date().toISOString();
    
    const advQ = query(collection(db, "advanceRecords"), where("expenseId", "==", id));
    const ledgerQ = query(collection(db, "employee_ledger"), where("expenseId", "==", id));
    const [advSnap, ledgerSnap] = await Promise.all([getDocs(advQ), getDocs(ledgerQ)]);

    if (!advSnap.empty) {
      const advDoc = advSnap.docs[0];
      const oldAdv = advDoc.data() as AdvanceRecord;
      const oldAmount = oldAdv.amount;
      const oldStaffId = oldAdv.staffId;

      const newAmount = data.amount !== undefined ? data.amount : oldAmount;
      const newStaffId = data.staffId !== undefined ? data.staffId : oldStaffId;

      await runTransaction(db, async (tx) => {
        if (oldStaffId !== newStaffId) {
          const oldStaffRef = doc(db, "staff", oldStaffId);
          const newStaffRef = doc(db, "staff", newStaffId);
          
          const oldStaffSnap = await tx.get(oldStaffRef);
          const newStaffSnap = await tx.get(newStaffRef);
          
          const oldBal = oldStaffSnap.exists() ? ((oldStaffSnap.data() as Staff).outstandingBalance || 0) : 0;
          const newBal = newStaffSnap.exists() ? ((newStaffSnap.data() as Staff).outstandingBalance || 0) : 0;
          
          tx.update(oldStaffRef, { outstandingBalance: Math.max(0, oldBal - oldAmount), updatedAt: now });
          tx.update(newStaffRef, { outstandingBalance: newBal + newAmount, updatedAt: now });
        } else if (oldAmount !== newAmount) {
          const staffRef = doc(db, "staff", oldStaffId);
          const staffSnap = await tx.get(staffRef);
          const currentBal = staffSnap.exists() ? ((staffSnap.data() as Staff).outstandingBalance || 0) : 0;
          tx.update(staffRef, { outstandingBalance: Math.max(0, currentBal - oldAmount + newAmount), updatedAt: now });
        }

        // Update the advanceRecord
        const updates: any = { updatedAt: now };
        if (data.amount !== undefined) updates.amount = data.amount;
        if (data.staffId !== undefined) updates.staffId = data.staffId;
        if (data.date !== undefined) {
           updates.date = data.date;
           updates.month = data.date.slice(0, 7);
        }
        if (data.note !== undefined) updates.reason = data.note;
        tx.update(advDoc.ref, updates);

        // Update employee_ledger
        if (!ledgerSnap.empty) {
          const ledgerDoc = ledgerSnap.docs[0];
          const ledgerUpdates: any = { updatedAt: now };
          if (data.amount !== undefined) ledgerUpdates.amount = data.amount;
          if (data.staffId !== undefined) ledgerUpdates.staffId = data.staffId;
          if (data.date !== undefined) {
             ledgerUpdates.date = data.date;
             ledgerUpdates.month = data.date.slice(0, 7);
          }
          if (data.note !== undefined) ledgerUpdates.note = data.note;
          tx.update(ledgerDoc.ref, ledgerUpdates);
        }
      });
    }

    return updateDoc(doc(db, "expenses", id), { ...data, updatedAt: now });
  },

  delete: async (id: string) => {
    expenseMonthCache.clear(); expenseCatCache.clear();
    const now = new Date().toISOString();

    const advQ = query(collection(db, "advanceRecords"), where("expenseId", "==", id));
    const ledgerQ = query(collection(db, "employee_ledger"), where("expenseId", "==", id));
    const [advSnap, ledgerSnap] = await Promise.all([getDocs(advQ), getDocs(ledgerQ)]);

    const expenseRef = doc(db, "expenses", id);

    await runTransaction(db, async (tx) => {
      if (!advSnap.empty) {
        const advDoc = advSnap.docs[0];
        const adv = advDoc.data() as AdvanceRecord;
        const staffRef = doc(db, "staff", adv.staffId);
        const staffSnap = await tx.get(staffRef);
        if (staffSnap.exists()) {
          const currentBal = (staffSnap.data() as Staff).outstandingBalance || 0;
          tx.update(staffRef, { outstandingBalance: Math.max(0, currentBal - adv.amount), updatedAt: now });
        }
        tx.delete(advDoc.ref);
      }

      if (!ledgerSnap.empty) {
        tx.delete(ledgerSnap.docs[0].ref);
      }

      tx.delete(expenseRef);
    });
  },
};

// ─── SALARY SERVICE ───────────────────────────────────────────────────────────
const salaryCol       = collection(db, "salaryRecords");
const salaryPaymentsCol = collection(db, "salaryPayments");

export const salaryService = {
  // ── Real-time subscriptions ─────────────────────────────────────────────────

  /** Live records for a specific month — used by salary page */
  subscribeByMonth: (month: number, year: number, cb: (d: SalaryRecord[]) => void) => {
    // ONLY equality filters — no orderBy needed — no composite index required
    const q = query(salaryCol, where("month", "==", month), where("year", "==", year));
    return onSnapshot(q,
      s => cb(s.docs.map(mapDoc<SalaryRecord>)),
      err => console.error("[salaryService.subscribeByMonth]", err.message)
    );
  },

  /** Live records for a specific staff member — sorted client-side (no composite index) */
  subscribeRecordsByStaff: (staffId: string, cb: (d: SalaryRecord[]) => void) => {
    const q = query(salaryCol, where("staffId", "==", staffId));
    return onSnapshot(q,
      s => {
        const records = s.docs.map(mapDoc<SalaryRecord>);
        records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        cb(records);
      },
      err => console.error("[salaryService.subscribeRecordsByStaff]", err.message)
    );
  },

  /** Live payments for a specific salary record — sorted client-side (no composite index) */
  subscribePaymentsByRecord: (recordId: string, cb: (d: SalaryPayment[]) => void) => {
    const q = query(salaryPaymentsCol, where("salaryRecordId", "==", recordId));
    return onSnapshot(q,
      s => {
        const payments = s.docs.map(mapDoc<SalaryPayment>);
        payments.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
        cb(payments);
      },
      err => console.error("[salaryService.subscribePaymentsByRecord]", err.message)
    );
  },

  /** Live payments for a staff member (all time) — sorted client-side */
  subscribePaymentsByStaff: (staffId: string, cb: (d: SalaryPayment[]) => void) => {
    const q = query(salaryPaymentsCol, where("staffId", "==", staffId));
    return onSnapshot(q,
      s => {
        const payments = s.docs.map(mapDoc<SalaryPayment>);
        payments.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
        cb(payments);
      },
      err => console.error("[salaryService.subscribePaymentsByStaff]", err.message)
    );
  },

  /** Live pending/partial records — uses != which needs no extra index */
  subscribePending: (cb: (d: SalaryRecord[]) => void) =>
    onSnapshot(
      query(salaryCol, where("status", "!=", "paid")),
      s => cb(s.docs.map(mapDoc<SalaryRecord>)),
      err => console.error("[salaryService.subscribePending]", err.message)
    ),

  // ── One-time reads ─────────────────────────────────────────────────────────

  getPending: async () => {
    const s = await getDocs(query(salaryCol, where("status", "!=", "paid")));
    return s.docs.map(mapDoc<SalaryRecord>);
  },

  getByMonth: async (month: number, year: number): Promise<SalaryRecord[]> => {
    const q = query(salaryCol, where("month", "==", month), where("year", "==", year));
    const snap = await getDocs(q);
    return snap.docs.map(mapDoc<SalaryRecord>);
  },

  /** Get all salary records for a staff member — sorted client-side */
  getByStaff: async (staffId: string): Promise<SalaryRecord[]> => {
    const snap = await getDocs(query(salaryCol, where("staffId", "==", staffId)));
    const records = snap.docs.map(mapDoc<SalaryRecord>);
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return records;
  },

  /**
   * Most recent unpaid record before the given month — sorted client-side.
   * No orderBy = no composite index required.
   */
  getLastUnpaidRecord: async (staffId: string, beforeYear: number, beforeMonth: number): Promise<SalaryRecord | null> => {
    const snap = await getDocs(query(salaryCol, where("staffId", "==", staffId)));
    const records = snap.docs.map(mapDoc<SalaryRecord>);
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const target = records.find(r => {
      const isBefore = r.year < beforeYear || (r.year === beforeYear && r.month < beforeMonth);
      return isBefore && r.remainingDue > 0;
    });
    return target || null;
  },

  /** Duplicate check — equality-only query, no index needed */
  getExistingRecord: async (staffId: string, month: number, year: number): Promise<SalaryRecord | null> => {
    const q = query(salaryCol, where("staffId", "==", staffId), where("month", "==", month), where("year", "==", year));
    const snap = await getDocs(q);
    return snap.empty ? null : mapDoc<SalaryRecord>(snap.docs[0]);
  },

  /** Payments for a record — sorted client-side */
  getPaymentsForRecord: async (salaryRecordId: string): Promise<SalaryPayment[]> => {
    const snap = await getDocs(query(salaryPaymentsCol, where("salaryRecordId", "==", salaryRecordId)));
    const payments = snap.docs.map(mapDoc<SalaryPayment>);
    payments.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
    return payments;
  },

  addRecord: async (
    data: Omit<SalaryRecord, "id" | "createdAt" | "updatedAt">,
    pendingAdvances?: AdvanceRecord[]
  ) => {
    const now = new Date().toISOString();
    const staffRef = doc(db, "staff", data.staffId);

    await runTransaction(db, async (tx) => {
      const staffSnap = await tx.get(staffRef);
      if (!staffSnap.exists()) throw new Error("Staff member not found");

      const staffData = staffSnap.data() as Staff;
      const currentBal = staffData.outstandingBalance || 0;

      const outstandingBefore = currentBal;
      const recoveredAmount = data.advance || 0;
      const outstandingAfter = Math.max(0, outstandingBefore - recoveredAmount);

      const salaryRef = doc(salaryCol);
      tx.set(salaryRef, {
        ...data,
        grossSalary: (data as any).grossSalary || (data.baseSalary + data.overtime + data.bonus - data.extraDeduction),
        outstandingBefore,
        recoveredAmount,
        outstandingAfter,
        createdAt: now,
        updatedAt: now
      });

      if (recoveredAmount > 0) {
        const recoveryLedgerRef = doc(collection(db, "employee_ledger"));
        tx.set(recoveryLedgerRef, {
          staffId: data.staffId,
          type: "salary_recovery",
          amount: recoveredAmount,
          date: now.split("T")[0],
          month: `${data.year}-${String(data.month).padStart(2, "0")}`,
          note: `Auto-recovery in salary month ${data.year}-${String(data.month).padStart(2, "0")}`,
          salaryRecordId: salaryRef.id,
          createdAt: now,
          updatedAt: now
        });
      }

      const genLedgerRef = doc(collection(db, "employee_ledger"));
      tx.set(genLedgerRef, {
        staffId: data.staffId,
        type: "salary_generated",
        amount: data.finalSalary,
        date: now.split("T")[0],
        month: `${data.year}-${String(data.month).padStart(2, "0")}`,
        note: `Salary generated for ${data.year}-${String(data.month).padStart(2, "0")}`,
        salaryRecordId: salaryRef.id,
        createdAt: now,
        updatedAt: now
      });

      tx.update(staffRef, {
        outstandingBalance: outstandingAfter,
        updatedAt: now
      });

      if (pendingAdvances && pendingAdvances.length > 0 && recoveredAmount > 0) {
        const monthStr = `${data.year}-${String(data.month).padStart(2, "0")}`;
        let remainingToDeduct = recoveredAmount;
        for (const adv of pendingAdvances) {
          if (!adv.id) continue;
          const advRef = doc(db, "advanceRecords", adv.id);
          if (remainingToDeduct >= adv.amount) {
            tx.update(advRef, { status: "deducted", deductedInMonth: monthStr, updatedAt: now });
            remainingToDeduct -= adv.amount;
          } else if (remainingToDeduct > 0) {
            tx.update(advRef, { amount: adv.amount - remainingToDeduct, updatedAt: now });
            remainingToDeduct = 0;
          }
        }
      }
    });
  },

  updateRecord: async (id: string, data: Partial<SalaryRecord>) =>
    updateDoc(doc(db, "salaryRecords", id), { ...data, updatedAt: new Date().toISOString() }),

  deleteRecord: async (id: string) => {
    const paymentsSnap = await getDocs(query(salaryPaymentsCol, where("salaryRecordId", "==", id)));
    const paymentRefs = paymentsSnap.docs.map(d => d.ref);

    const ledgerSnap = await getDocs(query(collection(db, "employee_ledger"), where("salaryRecordId", "==", id)));
    const ledgerRefs = ledgerSnap.docs.map(d => d.ref);

    const recordRef = doc(db, "salaryRecords", id);
    const now = new Date().toISOString();

    await runTransaction(db, async (tx) => {
      const recordSnap = await tx.get(recordRef);
      if (recordSnap.exists()) {
        const record = recordSnap.data() as SalaryRecord;
        const recovered = record.advance || 0;
        if (recovered > 0) {
          const staffRef = doc(db, "staff", record.staffId);
          const staffSnap = await tx.get(staffRef);
          if (staffSnap.exists()) {
            const currentBal = (staffSnap.data() as Staff).outstandingBalance || 0;
            tx.update(staffRef, { outstandingBalance: currentBal + recovered, updatedAt: now });
          }
        }
      }

      for (const lRef of ledgerRefs) {
        tx.delete(lRef);
      }
      for (const pRef of paymentRefs) {
        tx.delete(pRef);
      }
      tx.delete(recordRef);
    });
  },

  addPayment: async (data: Omit<SalaryPayment, "id" | "createdAt">): Promise<string> => {
    const now = new Date().toISOString();
    const recordRef = doc(db, "salaryRecords", data.salaryRecordId);

    let newPaymentId = "";

    await runTransaction(db, async (tx) => {
      const recordSnap = await tx.get(recordRef);
      if (!recordSnap.exists()) throw new Error("Salary record not found");

      const record = recordSnap.data() as SalaryRecord;
      const currentPaid   = record.totalPaid    || 0;
      const totalDue      = record.finalSalary + (record.previousDue || 0);
      const newTotalPaid  = currentPaid + data.amountPaid;
      const remainingDue  = Math.max(0, totalDue - newTotalPaid);
      const status: SalaryRecord["status"] =
        remainingDue <= 0 ? "paid" : newTotalPaid > 0 ? "partial" : "pending";

      const paymentRef = doc(salaryPaymentsCol);
      tx.set(paymentRef, { ...data, createdAt: now });
      newPaymentId = paymentRef.id;

      const expenseRef = doc(collection(db, "expenses"));
      tx.set(expenseRef, {
        title: `Salary Payment`,
        amount: data.amountPaid,
        category: "salary",
        date: data.paymentDate,
        note: data.note || "Added from Salary Management",
        staffId: data.staffId,
        createdAt: now,
        updatedAt: now,
      });

      const ledgerRef = doc(collection(db, "employee_ledger"));
      tx.set(ledgerRef, {
        staffId: data.staffId,
        type: "salary_paid",
        amount: data.amountPaid,
        date: data.paymentDate,
        month: data.paymentDate.slice(0, 7),
        note: data.note || `Salary payment of ₹${data.amountPaid}`,
        salaryRecordId: data.salaryRecordId,
        createdAt: now,
        updatedAt: now
      });

      tx.update(recordRef, {
        totalPaid: newTotalPaid,
        remainingDue,
        status,
        updatedAt: now,
      });
    });

    return newPaymentId;
  },
};



// ─── STUBS ────────────────────────────────────────────────────────────────────
export const tempStaffService = {
  getAll: async () => [] as any[],
  add: async () => {},
  update: async () => {},
  delete: async () => {},
};

const settingsCol = collection(db, "settings");

export const settingsService = {
  get: async (key: string) => {
    const snap = await getDocs(query(settingsCol, where("key", "==", key)));
    if (snap.empty) return null;
    return mapDoc<AppSettings>(snap.docs[0]);
  },
  set: async (key: string, value: string) => {
    const existing = await settingsService.get(key);
    if (existing && existing.id) {
      await updateDoc(doc(db, "settings", existing.id), { value });
    } else {
      await addDoc(settingsCol, { key, value });
    }
  },
  getCustomRoles: async (): Promise<string[]> => {
    const setting = await settingsService.get("customRoles");
    if (!setting || !setting.value) return [];
    try {
      return JSON.parse(setting.value);
    } catch {
      return [];
    }
  },
  addCustomRole: async (role: string) => {
    const roles = await settingsService.getCustomRoles();
    if (!roles.includes(role)) {
      roles.push(role);
      await settingsService.set("customRoles", JSON.stringify(roles));
    }
  }
};

// ─── ADVANCE SERVICE ────────────────────────────────────────────────────────────
const advancesCol = collection(db, "advanceRecords");

export const advanceService = {
  subscribePendingByStaff: (staffId: string, cb: (d: AdvanceRecord[]) => void) => {
    const q = query(advancesCol, where("staffId", "==", staffId), where("status", "==", "pending"));
    return onSnapshot(q, s => cb(s.docs.map(mapDoc<AdvanceRecord>)), err => console.error(err));
  },
  subscribeAll: (cb: (d: AdvanceRecord[]) => void) => {
    return onSnapshot(advancesCol, s => cb(s.docs.map(mapDoc<AdvanceRecord>)), err => console.error(err));
  },
  getPendingByStaff: async (staffId: string) => {
    const q = query(advancesCol, where("staffId", "==", staffId), where("status", "==", "pending"));
    const snap = await getDocs(q);
    return snap.docs.map(mapDoc<AdvanceRecord>);
  },
  getByMonth: async (monthStr: string) => {
    // monthStr format: YYYY-MM
    const q = query(advancesCol, where("date", ">=", `${monthStr}-01`), where("date", "<=", `${monthStr}-31`));
    const snap = await getDocs(q);
    const records = snap.docs.map(mapDoc<AdvanceRecord>);
    records.sort((a, b) => b.date.localeCompare(a.date));
    return records;
  },
  getByStaff: async (staffId: string) => {
    const snap = await getDocs(query(advancesCol, where("staffId", "==", staffId)));
    const records = snap.docs.map(mapDoc<AdvanceRecord>);
    records.sort((a, b) => b.date.localeCompare(a.date));
    return records;
  },
  add: async (data: Omit<AdvanceRecord, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    return addDoc(advancesCol, { ...data, createdAt: now, updatedAt: now });
  }
};

// ─── LEDGER SERVICE ────────────────────────────────────────────────────────────
const ledgerCol = collection(db, "employee_ledger");

export const ledgerService = {
  subscribeByStaff: (staffId: string, cb: (d: LedgerEntry[]) => void) => {
    const q = query(ledgerCol, where("staffId", "==", staffId));
    return onSnapshot(q, s => {
      const data = s.docs.map(mapDoc<LedgerEntry>);
      data.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
      cb(data);
    }, err => console.error("[ledgerService.subscribeByStaff]", err));
  },
  
  getByStaff: async (staffId: string): Promise<LedgerEntry[]> => {
    const snap = await getDocs(query(ledgerCol, where("staffId", "==", staffId)));
    const data = snap.docs.map(mapDoc<LedgerEntry>);
    data.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    return data;
  },

  addEntry: async (data: Omit<LedgerEntry, "id" | "createdAt" | "updatedAt">): Promise<string> => {
    const now = new Date().toISOString();
    const staffRef = doc(db, "staff", data.staffId);
    let newEntryId = "";

    await runTransaction(db, async (tx) => {
      const staffSnap = await tx.get(staffRef);
      if (!staffSnap.exists()) throw new Error("Staff member not found");

      const staffData = staffSnap.data() as Staff;
      const currentBal = staffData.outstandingBalance || 0;

      let balanceDiff = 0;
      if (data.type === "salary_advance") {
        balanceDiff = data.amount;
      } else if (data.type === "salary_recovery" || data.type === "manual_repayment") {
        balanceDiff = -data.amount;
      } else if (data.type === "manual_adjustment") {
        balanceDiff = data.amount;
      }

      const newBal = currentBal + balanceDiff;

      const ledgerRef = doc(ledgerCol);
      tx.set(ledgerRef, { ...data, createdAt: now, updatedAt: now });
      newEntryId = ledgerRef.id;

      tx.update(staffRef, {
        outstandingBalance: newBal,
        updatedAt: now
      });
    });

    return newEntryId;
  }
};
