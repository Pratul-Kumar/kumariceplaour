import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, limit, runTransaction, getDoc
} from "firebase/firestore";
import { db } from "@/firebase/config";
import type { Staff, Attendance, Expense, SalaryRecord, SalaryPayment, LeaveRecord } from "@/types";

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
    const q = query(
      attendanceCol,
      where("staffId", "==", staffId),
      where("date", ">=", `${month}-01`),
      where("date", "<=", `${month}-31`)
    );
    // Use plain getDocs — works with both Firestore cache and network
    const snap = await getDocs(q);
    return snap.docs.map(mapDoc<Attendance>);
  },

  upsert: async (data: Omit<Attendance, "id" | "createdAt" | "updatedAt">) => {
    const q = query(attendanceCol, where("staffId", "==", data.staffId), where("date", "==", data.date));
    const snap = await getDocs(q);
    const now = new Date().toISOString();
    if (!snap.empty) return updateDoc(doc(db, "attendance", snap.docs[0].id), { ...data, updatedAt: now });
    return addDoc(attendanceCol, { ...data, createdAt: now, updatedAt: now });
  },

  deleteRecord: async (staffId: string, date: string) => {
    const q = query(attendanceCol, where("staffId", "==", staffId), where("date", "==", date));
    const snap = await getDocs(q);
    if (!snap.empty) return deleteDoc(doc(db, "attendance", snap.docs[0].id));
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
        // Sort client-side descending — no orderBy = no composite index
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
    return addDoc(expensesCol, { ...data, createdAt: now, updatedAt: now });
  },

  update: async (id: string, data: Partial<Expense>) => {
    if (data.date) { expenseMonthCache.del(data.date.slice(0, 7)); expenseCatCache.del(data.date.slice(0, 7)); }
    return updateDoc(doc(db, "expenses", id), { ...data, updatedAt: new Date().toISOString() });
  },

  delete: async (id: string) => {
    expenseMonthCache.clear(); expenseCatCache.clear();
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

  addRecord: async (data: Omit<SalaryRecord, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    return addDoc(salaryCol, { ...data, createdAt: now, updatedAt: now });
  },

  updateRecord: async (id: string, data: Partial<SalaryRecord>) =>
    updateDoc(doc(db, "salaryRecords", id), { ...data, updatedAt: new Date().toISOString() }),

  deleteRecord: async (id: string) => {
    // Also delete all payments for this record
    const q = query(salaryPaymentsCol, where("salaryRecordId", "==", id));
    const snap = await getDocs(q);
    const deletes = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletes);
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

      // Atomically update the salary record
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

// ─── STUBS ────────────────────────────────────────────────────────────────────
export const tempStaffService = {
  getAll: async () => [] as any[],
  add: async () => {},
  update: async () => {},
  delete: async () => {},
};

export const settingsService = {
  get: async (_key: string) => ({ value: "dark" }),
  set: async (_key: string, _value: string) => {},
};
