import { db } from "@/db";
import type { Staff, Attendance, Expense, SalaryRecord, LeaveRecord, TemporaryStaff } from "@/types";

// ============================================================
// STAFF SERVICE
// ============================================================
export const staffService = {
  getAll: () => db.staff.orderBy("name").toArray(),
  getById: (id: number) => db.staff.get(id),
  getActive: () => db.staff.where("status").equals("active").toArray(),
  add: (data: Omit<Staff, "id">) => db.staff.add(data),
  update: (id: number, data: Partial<Staff>) => db.staff.update(id, { ...data, updatedAt: new Date().toISOString() }),
  delete: (id: number) => db.staff.delete(id),
  count: () => db.staff.count(),
  search: (query: string) =>
    db.staff.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()) || s.role.toLowerCase().includes(query.toLowerCase())).toArray(),
};

// ============================================================
// ATTENDANCE SERVICE
// ============================================================
export const attendanceService = {
  getAll: () => db.attendance.orderBy("date").reverse().toArray(),
  getById: (id: number) => db.attendance.get(id),
  getByDate: (date: string) => db.attendance.where("date").equals(date).toArray(),
  getByStaff: (staffId: number) => db.attendance.where("staffId").equals(staffId).reverse().sortBy("date"),
  getByMonth: (month: string) => db.attendance.where("date").startsWith(month).toArray(),
  getByStaffAndMonth: (staffId: number, month: string) =>
    db.attendance.where("date").startsWith(month).and((a) => a.staffId === staffId).toArray(),
  getByStaffAndDate: (staffId: number, date: string) =>
    db.attendance.where("[staffId+date]").equals([staffId, date]).first(),
  upsert: async (data: Omit<Attendance, "id">) => {
    const existing = await attendanceService.getByStaffAndDate(data.staffId, data.date);
    if (existing?.id) {
      return db.attendance.update(existing.id, { ...data, updatedAt: new Date().toISOString() });
    }
    return db.attendance.add(data);
  },
  delete: (id: number) => db.attendance.delete(id),
  getSummaryForMonth: async (month: string) => {
    const records = await db.attendance.where("date").startsWith(month).toArray();
    const summary = { present: 0, absent: 0, half_day: 0, leave: 0, total: records.length };
    for (const r of records) {
      summary[r.status] = (summary[r.status] || 0) + 1;
    }
    return summary;
  },
  getTodaySummary: async () => {
    const today = new Date().toISOString().split("T")[0];
    const records = await db.attendance.where("date").equals(today).toArray();
    const summary = { present: 0, absent: 0, half_day: 0, leave: 0 };
    for (const r of records) summary[r.status] = (summary[r.status] || 0) + 1;
    return { ...summary, total: records.length };
  },
};

// ============================================================
// EXPENSE SERVICE
// ============================================================
export const expenseService = {
  getAll: () => db.expenses.orderBy("date").reverse().toArray(),
  getById: (id: number) => db.expenses.get(id),
  getByDate: (date: string) => db.expenses.where("date").equals(date).toArray(),
  getByMonth: (month: string) => db.expenses.where("date").startsWith(month).toArray(),
  getByCategory: (category: string) => db.expenses.where("category").equals(category).toArray(),
  getRecent: (limit = 10) => db.expenses.orderBy("date").reverse().limit(limit).toArray(),
  add: (data: Omit<Expense, "id">) => db.expenses.add(data),
  update: (id: number, data: Partial<Expense>) => db.expenses.update(id, { ...data, updatedAt: new Date().toISOString() }),
  delete: (id: number) => db.expenses.delete(id),
  getTodayTotal: async () => {
    const today = new Date().toISOString().split("T")[0];
    const expenses = await db.expenses.where("date").equals(today).toArray();
    return expenses.reduce((sum, e) => sum + e.amount, 0);
  },
  getMonthTotal: async (month: string) => {
    const expenses = await db.expenses.where("date").startsWith(month).toArray();
    return expenses.reduce((sum, e) => sum + e.amount, 0);
  },
  getCategoryTotals: async (month: string) => {
    const expenses = await db.expenses.where("date").startsWith(month).toArray();
    const totals: Record<string, number> = {};
    for (const e of expenses) totals[e.category] = (totals[e.category] || 0) + e.amount;
    return totals;
  },
};

// ============================================================
// SALARY SERVICE
// ============================================================
export const salaryService = {
  getAll: () => db.salaryRecords.orderBy("month").reverse().toArray(),
  getById: (id: number) => db.salaryRecords.get(id),
  getByStaff: (staffId: number) => db.salaryRecords.where("staffId").equals(staffId).reverse().sortBy("month"),
  getByMonth: (month: string) => db.salaryRecords.where("month").equals(month).toArray(),
  getPending: async () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    return db.salaryRecords.where("month").equals(currentMonth).and((r) => !r.paid).toArray();
  },
  add: (data: Omit<SalaryRecord, "id">) => db.salaryRecords.add(data),
  update: (id: number, data: Partial<SalaryRecord>) => db.salaryRecords.update(id, { ...data, updatedAt: new Date().toISOString() }),
  delete: (id: number) => db.salaryRecords.delete(id),
  markPaid: (id: number) =>
    db.salaryRecords.update(id, { paid: true, paidDate: new Date().toISOString().split("T")[0], updatedAt: new Date().toISOString() }),
  getPendingTotal: async () => {
    const pending = await salaryService.getPending();
    return pending.reduce((s, r) => s + r.finalSalary, 0);
  },
};

// ============================================================
// LEAVE SERVICE
// ============================================================
export const leaveService = {
  getAll: () => db.leaveRecords.orderBy("leaveDate").reverse().toArray(),
  getById: (id: number) => db.leaveRecords.get(id),
  getByStaff: (staffId: number) => db.leaveRecords.where("staffId").equals(staffId).reverse().sortBy("leaveDate"),
  getByDate: (date: string) => db.leaveRecords.where("leaveDate").equals(date).toArray(),
  getByMonth: (month: string) => db.leaveRecords.where("leaveDate").startsWith(month).toArray(),
  add: async (data: Omit<LeaveRecord, "id">) => {
    const id = await db.leaveRecords.add(data);
    await db.staff.update(data.staffId, (s) => { s.leaveCount += 1; s.updatedAt = new Date().toISOString(); });
    return id;
  },
  update: (id: number, data: Partial<LeaveRecord>) => db.leaveRecords.update(id, { ...data, updatedAt: new Date().toISOString() }),
  delete: async (id: number) => {
    const record = await db.leaveRecords.get(id);
    if (record) await db.staff.update(record.staffId, (s) => { s.leaveCount = Math.max(0, s.leaveCount - 1); s.updatedAt = new Date().toISOString(); });
    return db.leaveRecords.delete(id);
  },
  getTodayCount: async () => {
    const today = new Date().toISOString().split("T")[0];
    return db.leaveRecords.where("leaveDate").equals(today).count();
  },
};

// ============================================================
// TEMPORARY STAFF SERVICE
// ============================================================
export const tempStaffService = {
  getAll: () => db.temporaryStaff.orderBy("date").reverse().toArray(),
  getById: (id: number) => db.temporaryStaff.get(id),
  getByDate: (date: string) => db.temporaryStaff.where("date").equals(date).toArray(),
  getByMonth: (month: string) => db.temporaryStaff.where("date").startsWith(month).toArray(),
  add: (data: Omit<TemporaryStaff, "id">) => db.temporaryStaff.add(data),
  update: (id: number, data: Partial<TemporaryStaff>) => db.temporaryStaff.update(id, { ...data, updatedAt: new Date().toISOString() }),
  delete: (id: number) => db.temporaryStaff.delete(id),
};

// ============================================================
// SETTINGS SERVICE
// ============================================================
export const settingsService = {
  get: (key: string) => db.settings.where("key").equals(key).first(),
  set: async (key: string, value: string) => {
    const existing = await db.settings.where("key").equals(key).first();
    if (existing?.id) await db.settings.update(existing.id, { value });
    else await db.settings.add({ key, value });
  },
};
