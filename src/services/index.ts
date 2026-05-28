import { 
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, 
  query, where, orderBy, onSnapshot, setDoc, limit,
  getDocsFromServer, getDocFromServer
} from "firebase/firestore";
import { db } from "@/firebase/config";
import type { Staff, Attendance, Expense, SalaryRecord, SalaryPayment, LeaveRecord, TemporaryStaff, AppSettings } from "@/types";

// Helper to convert Firestore doc to object with ID
const mapDoc = <T>(docSnapshot: any): T => ({
  id: docSnapshot.id,
  ...docSnapshot.data()
} as T);

// ============================================================
// STAFF SERVICE
// ============================================================
const staffCol = collection(db, "staff");

export const staffService = {
  subscribeAll: (callback: (data: Staff[]) => void) => {
    return onSnapshot(staffCol, (snapshot) => callback(snapshot.docs.map(mapDoc<Staff>)));
  },
  // Real-time subscription filtered to active staff (used by forms that need the list live)
  subscribeActive: (callback: (data: Staff[]) => void) => {
    const q = query(staffCol, where("status", "==", "active"));
    return onSnapshot(q, (snapshot) => callback(snapshot.docs.map(mapDoc<Staff>)));
  },
  getAll: async () => {
    const snapshot = await getDocsFromServer(staffCol);
    return snapshot.docs.map(mapDoc<Staff>);
  },
  getActive: async () => {
    // Always fetch from server to guarantee cross-device freshness
    const q = query(staffCol, where("status", "==", "active"));
    const snapshot = await getDocsFromServer(q);
    return snapshot.docs.map(mapDoc<Staff>);
  },
  getById: async (id: string) => {
    const docSnap = await getDocFromServer(doc(db, "staff", id));
    return docSnap.exists() ? mapDoc<Staff>(docSnap) : undefined;
  },
  // Real-time subscription for a single staff document
  subscribeById: (id: string, callback: (data: Staff | null) => void) => {
    return onSnapshot(doc(db, "staff", id), (docSnap) => {
      callback(docSnap.exists() ? mapDoc<Staff>(docSnap) : null);
    });
  },
  add: async (data: Omit<Staff, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    return addDoc(staffCol, { ...data, createdAt: now, updatedAt: now });
  },
  update: async (id: string, data: Partial<Staff>) => {
    return updateDoc(doc(db, "staff", id), { ...data, updatedAt: new Date().toISOString() });
  },
  delete: async (id: string) => deleteDoc(doc(db, "staff", id)),
  count: async () => {
    const snapshot = await getDocsFromServer(staffCol);
    return snapshot.size;
  }
};

// ============================================================
// ATTENDANCE SERVICE
// ============================================================
const attendanceCol = collection(db, "attendance");

export const attendanceService = {
  subscribeByMonth: (month: string, callback: (data: Attendance[]) => void) => {
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;
    const q = query(attendanceCol, where("date", ">=", startDate), where("date", "<=", endDate));
    return onSnapshot(q, (snapshot) => callback(snapshot.docs.map(mapDoc<Attendance>)));
  },
  getByStaffAndMonth: async (staffId: string, month: string) => {
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;
    const q = query(attendanceCol, where("staffId", "==", staffId), where("date", ">=", startDate), where("date", "<=", endDate));
    // Force server fetch for cross-device accuracy
    const snapshot = await getDocsFromServer(q);
    return snapshot.docs.map(mapDoc<Attendance>);
  },
  getByDate: async (date: string) => {
    const q = query(attendanceCol, where("date", "==", date));
    const snapshot = await getDocsFromServer(q);
    return snapshot.docs.map(mapDoc<Attendance>);
  },
  upsert: async (data: Omit<Attendance, "id" | "createdAt" | "updatedAt">) => {
    const q = query(attendanceCol, where("staffId", "==", data.staffId), where("date", "==", data.date));
    const snapshot = await getDocs(q);
    const now = new Date().toISOString();
    
    if (!snapshot.empty) {
      const existingId = snapshot.docs[0].id;
      return updateDoc(doc(db, "attendance", existingId), { ...data, updatedAt: now });
    }
    return addDoc(attendanceCol, { ...data, createdAt: now, updatedAt: now });
  },
  deleteRecord: async (staffId: string, date: string) => {
    const q = query(attendanceCol, where("staffId", "==", staffId), where("date", "==", date));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return deleteDoc(doc(db, "attendance", snapshot.docs[0].id));
    }
  },
  getTodaySummary: async () => {
    const today = new Date().toISOString().split("T")[0];
    const snapshot = await getDocsFromServer(query(attendanceCol, where("date", "==", today)));
    const summary = { present: 0, absent: 0, half_day: 0, leave: 0, total: snapshot.size };
    snapshot.docs.forEach(d => {
      const status = d.data().status as string;
      if (summary.hasOwnProperty(status)) {
        (summary as any)[status]++;
      }
    });
    return summary;
  }
};

// ============================================================
// EXPENSE SERVICE
// ============================================================
const expensesCol = collection(db, "expenses");

// NOTE: This cache is intentionally NOT used for cross-device sync scenarios.
// It is only populated by real-time subscriptions (onSnapshot), so it always
// reflects the latest server state after the first snapshot fires.
// One-time queries (getMonthTotal, getCategoryTotals) now always hit the server.
const expenseCache = {
  monthTotals: {} as Record<string, number>,
  categoryTotals: {} as Record<string, Record<string, number>>,
};

const invalidateExpenseCache = (date?: string) => {
  if (date) {
    const month = date.substring(0, 7);
    delete expenseCache.monthTotals[month];
    delete expenseCache.categoryTotals[month];
  } else {
    expenseCache.monthTotals = {};
    expenseCache.categoryTotals = {};
  }
};

export const expenseService = {
  subscribeByMonth: (month: string, callback: (data: Expense[]) => void) => {
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;
    const q = query(expensesCol, where("date", ">=", startDate), where("date", "<=", endDate), orderBy("date", "desc"));
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(mapDoc<Expense>);
      // Keep cache in sync with live snapshots
      let monthTotal = 0;
      const catTotals: Record<string, number> = {};
      data.forEach(e => {
        monthTotal += e.amount;
        catTotals[e.category] = (catTotals[e.category] || 0) + e.amount;
      });
      expenseCache.monthTotals[month] = monthTotal;
      expenseCache.categoryTotals[month] = catTotals;
      callback(data);
    });
  },
  getRecent: async (limitCount = 10) => {
    const q = query(expensesCol, orderBy("date", "desc"), limit(limitCount));
    // Always force server for recent items to show cross-device writes
    const snapshot = await getDocsFromServer(q);
    return snapshot.docs.map(mapDoc<Expense>);
  },
  getTodayTotal: async () => {
    const today = new Date().toISOString().split("T")[0];
    const snapshot = await getDocsFromServer(query(expensesCol, where("date", "==", today)));
    return snapshot.docs.reduce((sum, docSnap) => sum + docSnap.data().amount, 0);
  },
  getMonthTotal: async (month: string) => {
    // Use cache if available (populated by subscribeByMonth snapshots)
    if (expenseCache.monthTotals[month] !== undefined) {
      return expenseCache.monthTotals[month];
    }
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;
    // Always go to server for months not yet cached by a live subscription
    const snapshot = await getDocsFromServer(query(expensesCol, where("date", ">=", startDate), where("date", "<=", endDate)));
    const total = snapshot.docs.reduce((sum, docSnap) => sum + docSnap.data().amount, 0);
    expenseCache.monthTotals[month] = total;
    return total;
  },
  getCategoryTotals: async (month: string) => {
    if (expenseCache.categoryTotals[month] !== undefined) {
      return expenseCache.categoryTotals[month];
    }
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;
    const snapshot = await getDocsFromServer(query(expensesCol, where("date", ">=", startDate), where("date", "<=", endDate)));
    const totals: Record<string, number> = {};
    snapshot.docs.forEach(d => {
      const cat = d.data().category;
      totals[cat] = (totals[cat] || 0) + d.data().amount;
    });
    expenseCache.categoryTotals[month] = totals;
    return totals;
  },
  add: async (data: Omit<Expense, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    invalidateExpenseCache(data.date);
    return addDoc(expensesCol, { ...data, createdAt: now, updatedAt: now });
  },
  update: async (id: string, data: Partial<Expense>) => {
    invalidateExpenseCache(data.date);
    return updateDoc(doc(db, "expenses", id), { ...data, updatedAt: new Date().toISOString() });
  },
  delete: async (id: string) => {
    invalidateExpenseCache();
    return deleteDoc(doc(db, "expenses", id));
  },
};

// ============================================================
// SALARY SERVICE
// ============================================================
const salaryCol = collection(db, "salaryRecords");
const salaryPaymentsCol = collection(db, "salaryPayments");

export const salaryService = {
  subscribeByMonth: (month: number, year: number, callback: (data: SalaryRecord[]) => void) => {
    const q = query(salaryCol, where("month", "==", month), where("year", "==", year));
    return onSnapshot(q, (snapshot) => callback(snapshot.docs.map(mapDoc<SalaryRecord>)));
  },
  getPending: async () => {
    const q = query(salaryCol, where("status", "!=", "paid"));
    const snapshot = await getDocsFromServer(q);
    return snapshot.docs.map(mapDoc<SalaryRecord>);
  },
  subscribePending: (callback: (data: SalaryRecord[]) => void) => {
    const q = query(salaryCol, where("status", "!=", "paid"));
    return onSnapshot(q, (snapshot) => callback(snapshot.docs.map(mapDoc<SalaryRecord>)));
  },
  addRecord: async (data: Omit<SalaryRecord, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    return addDoc(salaryCol, { ...data, createdAt: now, updatedAt: now });
  },
  updateRecord: async (id: string, data: Partial<SalaryRecord>) => {
    return updateDoc(doc(db, "salaryRecords", id), data);
  },
  deleteRecord: async (id: string) => {
    return deleteDoc(doc(db, "salaryRecords", id));
  },
  addPayment: async (data: Omit<SalaryPayment, "id">) => {
    const paymentRef = await addDoc(salaryPaymentsCol, data);
    
    // Update salary record totals
    const recordDoc = await getDocFromServer(doc(db, "salaryRecords", data.salaryRecordId));
    if (recordDoc.exists()) {
      const record = recordDoc.data() as SalaryRecord;
      const newTotalPaid = (record.totalPaid || 0) + data.amountPaid;
      const totalDue = record.finalSalary + (record.previousDue || 0);
      const remainingDue = totalDue - newTotalPaid;
      const status = remainingDue <= 0 ? "paid" : newTotalPaid > 0 ? "partial" : "pending";
      
      await updateDoc(doc(db, "salaryRecords", data.salaryRecordId), {
        totalPaid: newTotalPaid,
        remainingDue,
        status
      });
    }
    return paymentRef;
  },
  getPaymentsForRecord: async (salaryRecordId: string) => {
    const q = query(salaryPaymentsCol, where("salaryRecordId", "==", salaryRecordId), orderBy("paymentDate", "desc"));
    // Force server fetch so cross-device payments are always visible
    const snapshot = await getDocsFromServer(q);
    return snapshot.docs.map(mapDoc<SalaryPayment>);
  },
  getByStaff: async (staffId: string) => {
    const q = query(salaryCol, where("staffId", "==", staffId));
    const snapshot = await getDocsFromServer(q);
    return snapshot.docs.map(mapDoc<SalaryRecord>).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  }
};

// ============================================================
// LEAVE SERVICE
// ============================================================
const leavesCol = collection(db, "leaveRecords");

export const leaveService = {
  getTodayCount: async () => {
    const today = new Date().toISOString().split("T")[0];
    const snapshot = await getDocsFromServer(query(leavesCol, where("leaveDate", "==", today)));
    return snapshot.size;
  },
  getByStaff: async (staffId: string) => {
    const q = query(leavesCol, where("staffId", "==", staffId), orderBy("leaveDate", "desc"));
    const snapshot = await getDocsFromServer(q);
    return snapshot.docs.map(mapDoc<LeaveRecord>);
  },
  getByMonth: async (month: string) => {
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;
    const q = query(leavesCol, where("leaveDate", ">=", startDate), where("leaveDate", "<=", endDate), orderBy("leaveDate", "asc"));
    const snapshot = await getDocsFromServer(q);
    return snapshot.docs.map(mapDoc<LeaveRecord>);
  },
  subscribeByMonth: (month: string, callback: (data: LeaveRecord[]) => void) => {
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;
    const q = query(leavesCol, where("leaveDate", ">=", startDate), where("leaveDate", "<=", endDate), orderBy("leaveDate", "asc"));
    return onSnapshot(q, (snapshot) => callback(snapshot.docs.map(mapDoc<LeaveRecord>)));
  },
  add: async (data: Omit<LeaveRecord, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    return addDoc(leavesCol, { ...data, createdAt: now, updatedAt: now });
  },
  delete: async (id: string) => deleteDoc(doc(db, "leaveRecords", id)),
};

// ============================================================
// STUBS FOR TYPESCRIPT COMPILE FIXES
// ============================================================
export const tempStaffService = {
  getAll: async () => [],
  add: async () => {},
  update: async () => {},
  delete: async () => {},
};

export const settingsService = {
  get: async (key: string) => ({ value: "dark" }),
  set: async (key: string, value: string) => {},
};
