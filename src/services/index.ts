import { 
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, 
  query, where, orderBy, onSnapshot, limit,
  getDocsFromServer, getDocFromServer
} from "firebase/firestore";
import { db } from "@/firebase/config";
import type { Staff, Attendance, Expense, SalaryRecord, SalaryPayment, LeaveRecord } from "@/types";

const mapDoc = <T>(d: any): T => ({ id: d.id, ...d.data() } as T);

// ─── TTL CACHE ────────────────────────────────────────────────────────────────
// Historical months (not current) are safe to cache client-side for the session.
// Current month data always comes from real-time onSnapshot.
const TTL_MS = 5 * 60 * 1000; // 5 minutes

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

const expenseMonthCache   = new TTLCache<number>();
const expenseCatCache     = new TTLCache<Record<string, number>>();
const salaryPayCache      = new TTLCache<SalaryPayment[]>();
const leaveCache          = new TTLCache<LeaveRecord[]>();

// Current month string – updated once per session (good enough)
const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const isHistorical = (month: string) => month < CURRENT_MONTH;

// ─── STAFF SERVICE ────────────────────────────────────────────────────────────
const staffCol = collection(db, "staff");

export const staffService = {
  subscribeAll: (cb: (d: Staff[]) => void) =>
    onSnapshot(staffCol, s => cb(s.docs.map(mapDoc<Staff>))),

  subscribeActive: (cb: (d: Staff[]) => void) =>
    onSnapshot(query(staffCol, where("status", "==", "active")), s => cb(s.docs.map(mapDoc<Staff>))),

  subscribeById: (id: string, cb: (d: Staff | null) => void) =>
    onSnapshot(doc(db, "staff", id), d => cb(d.exists() ? mapDoc<Staff>(d) : null)),

  getAll: async () => {
    const s = await getDocsFromServer(staffCol);
    return s.docs.map(mapDoc<Staff>);
  },

  getActive: async () => {
    const s = await getDocsFromServer(query(staffCol, where("status", "==", "active")));
    return s.docs.map(mapDoc<Staff>);
  },

  getById: async (id: string) => {
    const d = await getDocFromServer(doc(db, "staff", id));
    return d.exists() ? mapDoc<Staff>(d) : undefined;
  },

  add: async (data: Omit<Staff, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    return addDoc(staffCol, { ...data, createdAt: now, updatedAt: now });
  },
  update: async (id: string, data: Partial<Staff>) =>
    updateDoc(doc(db, "staff", id), { ...data, updatedAt: new Date().toISOString() }),
  delete: async (id: string) => deleteDoc(doc(db, "staff", id)),
  count: async () => (await getDocsFromServer(staffCol)).size,
};

// ─── ATTENDANCE SERVICE ───────────────────────────────────────────────────────
const attendanceCol = collection(db, "attendance");

export const attendanceService = {
  subscribeByMonth: (month: string, cb: (d: Attendance[]) => void) => {
    const q = query(attendanceCol, where("date", ">=", `${month}-01`), where("date", "<=", `${month}-31`));
    return onSnapshot(q, s => cb(s.docs.map(mapDoc<Attendance>)));
  },

  getByStaffAndMonth: async (staffId: string, month: string) => {
    const q = query(
      attendanceCol,
      where("staffId", "==", staffId),
      where("date", ">=", `${month}-01`),
      where("date", "<=", `${month}-31`)
    );
    // Historical months: allow local cache (fast). Current month: force server.
    const snap = isHistorical(month) ? await getDocs(q) : await getDocsFromServer(q);
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
    const snap = await getDocsFromServer(query(attendanceCol, where("date", "==", today)));
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
    const q = query(
      expensesCol,
      where("date", ">=", `${month}-01`),
      where("date", "<=", `${month}-31`),
      orderBy("date", "desc")
    );
    return onSnapshot(q, snap => {
      const data = snap.docs.map(mapDoc<Expense>);
      // Populate cache from live snapshot (always fresh)
      let total = 0;
      const cats: Record<string, number> = {};
      data.forEach(e => { total += e.amount; cats[e.category] = (cats[e.category] || 0) + e.amount; });
      expenseMonthCache.set(month, total);
      expenseCatCache.set(month, cats);
      cb(data);
    });
  },

  getMonthTotal: async (month: string): Promise<number> => {
    const cached = expenseMonthCache.get(month);
    if (cached !== undefined) return cached;
    const q = query(expensesCol, where("date", ">=", `${month}-01`), where("date", "<=", `${month}-31`));
    // Historical: allow local Firestore cache (instant); current: server
    const snap = isHistorical(month) ? await getDocs(q) : await getDocsFromServer(q);
    const total = snap.docs.reduce((s, d) => s + d.data().amount, 0);
    expenseMonthCache.set(month, total);
    return total;
  },

  getCategoryTotals: async (month: string): Promise<Record<string, number>> => {
    const cached = expenseCatCache.get(month);
    if (cached !== undefined) return cached;
    const q = query(expensesCol, where("date", ">=", `${month}-01`), where("date", "<=", `${month}-31`));
    const snap = isHistorical(month) ? await getDocs(q) : await getDocsFromServer(q);
    const totals: Record<string, number> = {};
    snap.docs.forEach(d => { const c = d.data().category; totals[c] = (totals[c] || 0) + d.data().amount; });
    expenseCatCache.set(month, totals);
    return totals;
  },

  getTodayTotal: async () => {
    const today = new Date().toISOString().split("T")[0];
    const snap = await getDocsFromServer(query(expensesCol, where("date", "==", today)));
    return snap.docs.reduce((s, d) => s + d.data().amount, 0);
  },

  getRecent: async (limitCount = 10) => {
    const q = query(expensesCol, orderBy("date", "desc"), limit(limitCount));
    const snap = await getDocsFromServer(q);
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
const salaryCol = collection(db, "salaryRecords");
const salaryPaymentsCol = collection(db, "salaryPayments");

export const salaryService = {
  subscribeByMonth: (month: number, year: number, cb: (d: SalaryRecord[]) => void) => {
    const q = query(salaryCol, where("month", "==", month), where("year", "==", year));
    return onSnapshot(q, s => cb(s.docs.map(mapDoc<SalaryRecord>)));
  },

  subscribePending: (cb: (d: SalaryRecord[]) => void) =>
    onSnapshot(query(salaryCol, where("status", "!=", "paid")), s => cb(s.docs.map(mapDoc<SalaryRecord>))),

  getPending: async () => {
    const s = await getDocsFromServer(query(salaryCol, where("status", "!=", "paid")));
    return s.docs.map(mapDoc<SalaryRecord>);
  },

  addRecord: async (data: Omit<SalaryRecord, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    return addDoc(salaryCol, { ...data, createdAt: now, updatedAt: now });
  },

  updateRecord: async (id: string, data: Partial<SalaryRecord>) =>
    updateDoc(doc(db, "salaryRecords", id), data),

  deleteRecord: async (id: string) => deleteDoc(doc(db, "salaryRecords", id)),

  addPayment: async (data: Omit<SalaryPayment, "id">) => {
    const paymentRef = await addDoc(salaryPaymentsCol, data);
    // Invalidate payment cache for this record
    salaryPayCache.del(data.salaryRecordId);
    // Update parent salary record
    const recordDoc = await getDocFromServer(doc(db, "salaryRecords", data.salaryRecordId));
    if (recordDoc.exists()) {
      const record = recordDoc.data() as SalaryRecord;
      const newTotalPaid = (record.totalPaid || 0) + data.amountPaid;
      const totalDue = record.finalSalary + (record.previousDue || 0);
      const remainingDue = totalDue - newTotalPaid;
      const status = remainingDue <= 0 ? "paid" : newTotalPaid > 0 ? "partial" : "pending";
      await updateDoc(doc(db, "salaryRecords", data.salaryRecordId), { totalPaid: newTotalPaid, remainingDue, status });
    }
    return paymentRef;
  },

  getPaymentsForRecord: async (salaryRecordId: string): Promise<SalaryPayment[]> => {
    const cached = salaryPayCache.get(salaryRecordId);
    if (cached !== undefined) return cached;
    const q = query(salaryPaymentsCol, where("salaryRecordId", "==", salaryRecordId), orderBy("paymentDate", "desc"));
    const snap = await getDocsFromServer(q);
    const data = snap.docs.map(mapDoc<SalaryPayment>);
    salaryPayCache.set(salaryRecordId, data);
    return data;
  },

  getByStaff: async (staffId: string) => {
    const q = query(salaryCol, where("staffId", "==", staffId));
    const snap = await getDocsFromServer(q);
    return snap.docs.map(mapDoc<SalaryRecord>).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};

// ─── LEAVE SERVICE ────────────────────────────────────────────────────────────
const leavesCol = collection(db, "leaveRecords");

export const leaveService = {
  subscribeByMonth: (month: string, cb: (d: LeaveRecord[]) => void) => {
    const q = query(leavesCol, where("leaveDate", ">=", `${month}-01`), where("leaveDate", "<=", `${month}-31`), orderBy("leaveDate", "asc"));
    return onSnapshot(q, s => { const data = s.docs.map(mapDoc<LeaveRecord>); leaveCache.set(month, data); cb(data); });
  },

  getTodayCount: async () => {
    const today = new Date().toISOString().split("T")[0];
    const snap = await getDocsFromServer(query(leavesCol, where("leaveDate", "==", today)));
    return snap.size;
  },

  getByStaff: async (staffId: string) => {
    const q = query(leavesCol, where("staffId", "==", staffId), orderBy("leaveDate", "desc"));
    const snap = await getDocsFromServer(q);
    return snap.docs.map(mapDoc<LeaveRecord>);
  },

  getByMonth: async (month: string) => {
    const cached = leaveCache.get(month);
    if (cached !== undefined) return cached;
    const q = query(leavesCol, where("leaveDate", ">=", `${month}-01`), where("leaveDate", "<=", `${month}-31`), orderBy("leaveDate", "asc"));
    const snap = isHistorical(month) ? await getDocs(q) : await getDocsFromServer(q);
    const data = snap.docs.map(mapDoc<LeaveRecord>);
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
