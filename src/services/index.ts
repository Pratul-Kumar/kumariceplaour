import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, limit, runTransaction, getDoc
} from "firebase/firestore";
import { db, auth } from "@/firebase/config";
import type { Staff, Attendance, Expense, SalaryRecord, SalaryPayment, LeaveRecord, AdvanceRecord, AppSettings, EmployeeLedgerEntry, TemporaryStaff } from "@/types";

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
const leaveCache        = new TTLCache<LeaveRecord[]>();

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
    return addDoc(staffCol, { ...data, createdAt: now, updatedAt: now });
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
        const ledgerRef = doc(collection(db, "employee_ledger"));
        
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
        tx.set(ledgerRef, {
          staffId: data.staffId,
          type: "salary_advance",
          amount: data.amount,
          direction: "employee_owes",
          status: "pending",
          linkedExpenseId: expenseRef.id,
          notes: data.note || "Salary Advance",
          createdBy: auth.currentUser?.email || "system",
          createdAt: now
        });
        return expenseRef;
      });
    }

    return addDoc(expensesCol, { ...data, createdAt: now, updatedAt: now });
  },

  update: async (id: string, data: Partial<Expense>) => {
    if (data.date) { expenseMonthCache.del(data.date.slice(0, 7)); expenseCatCache.del(data.date.slice(0, 7)); }
    const now = new Date().toISOString();
    
    if (data.category === "salary_advance" || data.amount !== undefined) {
      // Sync advanceRecords
      const q = query(collection(db, "advanceRecords"), where("expenseId", "==", id));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const advDoc = snap.docs[0];
        const updates: any = { updatedAt: now };
        if (data.amount !== undefined) updates.amount = data.amount;
        if (data.staffId !== undefined) updates.staffId = data.staffId;
        if (data.date !== undefined) {
           updates.date = data.date;
           updates.month = data.date.slice(0, 7);
        }
        if (data.note !== undefined) updates.reason = data.note;
        await updateDoc(advDoc.ref, updates);
      }

      // Sync employee_ledger
      const ledgerQ = query(collection(db, "employee_ledger"), where("linkedExpenseId", "==", id));
      const ledgerSnap = await getDocs(ledgerQ);
      if (!ledgerSnap.empty) {
        const ledgerDoc = ledgerSnap.docs[0];
        const ledgerData = ledgerDoc.data();
        if (ledgerData.status !== "pending") {
          throw new Error("Cannot edit a salary advance that has been partially or fully settled.");
        }
        const updates: any = {};
        if (data.amount !== undefined) updates.amount = data.amount;
        if (data.staffId !== undefined) updates.staffId = data.staffId;
        if (data.note !== undefined) updates.notes = data.note;
        await updateDoc(ledgerDoc.ref, updates);
      }
    }

    return updateDoc(doc(db, "expenses", id), { ...data, updatedAt: now });
  },

  delete: async (id: string) => {
    expenseMonthCache.clear(); expenseCatCache.clear();
    const q = query(collection(db, "advanceRecords"), where("expenseId", "==", id));
    const snap = await getDocs(q);
    if (!snap.empty) {
      await deleteDoc(snap.docs[0].ref);
    }
    const ledgerQ = query(collection(db, "employee_ledger"), where("linkedExpenseId", "==", id));
    const ledgerSnap = await getDocs(ledgerQ);
    if (!ledgerSnap.empty) {
      const ledgerDoc = ledgerSnap.docs[0];
      const ledgerData = ledgerDoc.data();
      if (ledgerData.status !== "pending") {
        throw new Error("Cannot delete a salary advance that has been partially or fully settled.");
      }
      await deleteDoc(ledgerDoc.ref);
    }
    return deleteDoc(doc(db, "expenses", id));
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

  // ── Writes ──────────────────────────────────────────────────────────────────

  addRecord: async (data: Omit<SalaryRecord, "id" | "createdAt" | "updatedAt"> & { recoveryAmount?: number }) => {
    const now = new Date().toISOString();
    const recoveryAmt = data.recoveryAmount || 0;

    return runTransaction(db, async (tx) => {
      const salaryRef = doc(salaryCol);
      
      // 1. Create the salary record
      tx.set(salaryRef, {
        ...data,
        createdAt: now,
        updatedAt: now
      });

      // 2. If there is a recovery amount, handle ledger deduction
      if (recoveryAmt > 0) {
        const ledgerRef = doc(collection(db, "employee_ledger"));
        tx.set(ledgerRef, {
          staffId: data.staffId,
          type: "salary_deduction",
          amount: recoveryAmt,
          direction: "store_owes",
          status: "settled",
          linkedSalaryId: salaryRef.id,
          notes: `Payroll recovery deduction for salary period ${data.month}/${data.year}`,
          createdBy: auth.currentUser?.email || "system",
          createdAt: now
        });

        // 3. Reconcile older outstanding debt entries
        const pendingQ = query(
          collection(db, "employee_ledger"),
          where("staffId", "==", data.staffId),
          where("status", "in", ["pending", "partial"])
        );
        const pendingSnap = await getDocs(pendingQ);
        const pendingEntries = pendingSnap.docs
          .map(mapDoc<EmployeeLedgerEntry>)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

        let remainingDeduction = recoveryAmt;
        for (const entry of pendingEntries) {
          if (remainingDeduction <= 0) break;
          if (entry.direction !== "employee_owes") continue;

          const entryRef = doc(db, "employee_ledger", entry.id!);
          if (remainingDeduction >= entry.amount) {
            tx.update(entryRef, { status: "settled" });
            remainingDeduction -= entry.amount;
          } else {
            tx.update(entryRef, { status: "partial" });
            remainingDeduction = 0;
          }
        }
      }

      return salaryRef;
    });
  },

  updateRecord: async (id: string, data: Partial<SalaryRecord>) =>
    updateDoc(doc(db, "salaryRecords", id), { ...data, updatedAt: new Date().toISOString() }),

  deleteRecord: async (id: string) => {
    // Also delete all payments for this record
    const q = query(salaryPaymentsCol, where("salaryRecordId", "==", id));
    const snap = await getDocs(q);
    const deletes = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletes);

    // Delete linked ledger entries and restore statuses of older ledger entries
    const ledgerQ = query(collection(db, "employee_ledger"), where("linkedSalaryId", "==", id));
    const ledgerSnap = await getDocs(ledgerQ);
    if (!ledgerSnap.empty) {
      for (const d of ledgerSnap.docs) {
        const ledgerData = d.data();
        const staffId = ledgerData.staffId;

        // Restore older settled/partial ledger entries for this employee to pending
        const settledQ = query(
          collection(db, "employee_ledger"),
          where("staffId", "==", staffId),
          where("status", "in", ["settled", "partial"])
        );
        const settledSnap = await getDocs(settledQ);
        for (const sDoc of settledSnap.docs) {
          const sData = sDoc.data();
          if (sData.direction === "employee_owes" && sData.type !== "salary_deduction") {
            await updateDoc(sDoc.ref, { status: "pending" });
          }
        }
        await deleteDoc(d.ref);
      }
    }

    return deleteDoc(doc(db, "salaryRecords", id));
  },

  /**
   * Add a payment and atomically update the salary record totals.
   * Uses Firestore runTransaction for consistency — prevents race conditions
   * when two devices try to record payments simultaneously.
   */
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

      // Write the new payment doc inside the transaction
      const paymentRef = doc(salaryPaymentsCol);
      tx.set(paymentRef, { ...data, createdAt: now });
      newPaymentId = paymentRef.id;

      // Automatically create an expense record for this salary payment
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

      // Atomically update the salary record
      tx.update(recordRef, {
        totalPaid: newTotalPaid,
        remainingDue,
        status,
        updatedAt: now,
      });

      // If fully paid, mark advances as deducted
      if (remainingDue <= 0 && record.advanceIds && record.advanceIds.length > 0) {
        for (const advId of record.advanceIds) {
          const advRef = doc(db, "advanceRecords", advId);
          tx.update(advRef, {
            status: "deducted",
            deductedInMonth: `${record.year}-${String(record.month).padStart(2, "0")}`,
            updatedAt: now
          });
        }
      }
    });

    return newPaymentId;
  },
};

// ─── LEAVE SERVICE ────────────────────────────────────────────────────────────
const leavesCol = collection(db, "leaveRecords");

export const leaveService = {
  subscribeByMonth: (month: string, cb: (d: LeaveRecord[]) => void) => {
    // range on same field (leaveDate) — no composite index needed
    const q = query(leavesCol, where("leaveDate", ">=", `${month}-01`), where("leaveDate", "<=", `${month}-31`));
    return onSnapshot(q,
      s => {
        const data = s.docs.map(mapDoc<LeaveRecord>);
        data.sort((a, b) => a.leaveDate.localeCompare(b.leaveDate));
        leaveCache.set(month, data);
        cb(data);
      },
      err => console.error("[leaveService.subscribeByMonth]", err.message)
    );
  },

  /** Live listener for all leaves on a specific date — used by Dashboard */
  subscribeByDate: (date: string, cb: (d: LeaveRecord[]) => void) => {
    const q = query(leavesCol, where("leaveDate", "==", date));
    return onSnapshot(q, s => cb(s.docs.map(mapDoc<LeaveRecord>)));
  },

  getTodayCount: async () => {
    const today = new Date().toISOString().split("T")[0];
    const snap = await getDocs(query(leavesCol, where("leaveDate", "==", today)));
    return snap.size;
  },

  getByStaff: async (staffId: string) => {
    const snap = await getDocs(query(leavesCol, where("staffId", "==", staffId)));
    const data = snap.docs.map(mapDoc<LeaveRecord>);
    data.sort((a, b) => b.leaveDate.localeCompare(a.leaveDate));
    return data;
  },

  getByMonth: async (month: string) => {
    const cached = leaveCache.get(month);
    if (cached !== undefined) return cached;
    const q = query(leavesCol, where("leaveDate", ">=", `${month}-01`), where("leaveDate", "<=", `${month}-31`));
    const snap = await getDocs(q);
    const data = snap.docs.map(mapDoc<LeaveRecord>);
    data.sort((a, b) => a.leaveDate.localeCompare(b.leaveDate));
    leaveCache.set(month, data);
    return data;
  },

  add: async (data: Omit<LeaveRecord, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    leaveCache.del(data.leaveDate.slice(0, 7));
    return addDoc(leavesCol, { ...data, createdAt: now, updatedAt: now });
  },

  delete: async (id: string) => {
    leaveCache.clear();
    return deleteDoc(doc(db, "leaveRecords", id));
  },
};

// ─── TEMP STAFF SERVICE ───────────────────────────────────────────────────────
const tempStaffCol = collection(db, "temp_staff");

export const tempStaffService = {
  getAll: async () => {
    const snap = await getDocs(tempStaffCol);
    return snap.docs.map(mapDoc<TemporaryStaff>);
  },
  getByMonth: async (monthStr: string) => {
    const q = query(tempStaffCol, where("date", ">=", `${monthStr}-01`), where("date", "<=", `${monthStr}-31`));
    const snap = await getDocs(q);
    return snap.docs.map(mapDoc<TemporaryStaff>);
  },
  add: async (data: Omit<TemporaryStaff, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    return addDoc(tempStaffCol, { ...data, createdAt: now, updatedAt: now });
  },
  update: async (id: string, data: Partial<TemporaryStaff>) => {
    const now = new Date().toISOString();
    return updateDoc(doc(db, "temp_staff", id), { ...data, updatedAt: now });
  },
  delete: async (id: string) => {
    return deleteDoc(doc(db, "temp_staff", id));
  },
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

// ─── EMPLOYEE LEDGER SERVICE ──────────────────────────────────────────────────
const employeeLedgerCol = collection(db, "employee_ledger");

export const employeeLedgerService = {
  subscribeByStaff: (staffId: string, cb: (d: EmployeeLedgerEntry[]) => void) => {
    const q = query(employeeLedgerCol, where("staffId", "==", staffId));
    return onSnapshot(
      q,
      (s) => {
        const entries = s.docs.map(mapDoc<EmployeeLedgerEntry>);
        entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        cb(entries);
      },
      (err) => console.error("[employeeLedgerService.subscribeByStaff]", err.message)
    );
  },

  subscribeAll: (cb: (d: EmployeeLedgerEntry[]) => void) => {
    return onSnapshot(
      employeeLedgerCol,
      (s) => {
        const entries = s.docs.map(mapDoc<EmployeeLedgerEntry>);
        entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        cb(entries);
      },
      (err) => console.error("[employeeLedgerService.subscribeAll]", err.message)
    );
  },

  getPendingByStaff: async (staffId: string) => {
    const q = query(
      employeeLedgerCol,
      where("staffId", "==", staffId),
      where("status", "in", ["pending", "partial"])
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapDoc<EmployeeLedgerEntry>);
  },

  getOutstandingBalance: async (staffId: string): Promise<number> => {
    const q = query(employeeLedgerCol, where("staffId", "==", staffId));
    const snap = await getDocs(q);
    const entries = snap.docs.map(mapDoc<EmployeeLedgerEntry>);
    let balance = 0;
    entries.forEach((e) => {
      if (e.direction === "employee_owes") {
        balance += e.amount;
      } else {
        balance -= e.amount;
      }
    });
    return balance;
  },

  add: async (data: Omit<EmployeeLedgerEntry, "id" | "createdAt">) => {
    const now = new Date().toISOString();
    return addDoc(employeeLedgerCol, { ...data, createdAt: now });
  },

  update: async (id: string, data: Partial<EmployeeLedgerEntry>) => {
    return updateDoc(doc(db, "employee_ledger", id), data);
  },

  delete: async (id: string) => {
    const ref = doc(db, "employee_ledger", id);
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data().status === "settled" && snap.data().type === "salary_deduction") {
      throw new Error("Cannot delete a settled salary recovery.");
    }
    return deleteDoc(ref);
  },
};
