import Dexie, { type Table } from "dexie";
import type { Staff, Attendance, Expense, SalaryRecord, LeaveRecord, TemporaryStaff, AppSettings } from "@/types";

export class KumarIceParlourDB extends Dexie {
  staff!: Table<Staff>;
  attendance!: Table<Attendance>;
  expenses!: Table<Expense>;
  salaryRecords!: Table<SalaryRecord>;
  leaveRecords!: Table<LeaveRecord>;
  temporaryStaff!: Table<TemporaryStaff>;
  settings!: Table<AppSettings>;

  constructor() {
    super("KumarIceParlourDB");
    this.version(2).stores({
      staff:         "++id, name, role, status, salaryType, joiningDate, createdAt",
      attendance:    "++id, staffId, date, status, createdAt, [staffId+date]",
      expenses:      "++id, category, date, staffId, createdAt",
      salaryRecords: "++id, staffId, month, paid, createdAt",
      leaveRecords:  "++id, staffId, leaveDate, leaveType, createdAt",
      temporaryStaff:"++id, date, createdAt",
      settings:      "++id, &key",
    });
  }
}

export const db = new KumarIceParlourDB();

// ============================================================
// SEED DEMO DATA — Kumar Ice Parlour
// ============================================================
export async function seedDemoData() {
  const count = await db.staff.count();
  if (count > 0) return; // Already seeded

  const now = new Date().toISOString();
  const today = new Date().toISOString().split("T")[0];

  // Seed staff — Kumar Ice Parlour team
  const staffIds = await db.staff.bulkAdd([
    { name: "Ravi Kumar",  role: "manager",  phone: "9876543210", salaryType: "monthly", monthlySalary: 22000, dailyWage: 0,   joiningDate: "2022-06-01", allowedCasualLeavesPerMonth: 2, leaveCount: 1, status: "active", note: "Shop manager", createdAt: now, updatedAt: now },
    { name: "Meena Devi",  role: "cashier",  phone: "9876543211", salaryType: "monthly", monthlySalary: 15000, dailyWage: 0,   joiningDate: "2023-01-15", allowedCasualLeavesPerMonth: 2, leaveCount: 2, status: "active", createdAt: now, updatedAt: now },
    { name: "Suresh Yadav",role: "worker",   phone: "9876543212", salaryType: "daily",   monthlySalary: 0,     dailyWage: 450, joiningDate: "2023-04-10", allowedCasualLeavesPerMonth: 0, leaveCount: 3, status: "active", note: "Ice cream prep", createdAt: now, updatedAt: now },
    { name: "Priya Singh", role: "worker",   phone: "9876543213", salaryType: "monthly", monthlySalary: 11000, dailyWage: 0,   joiningDate: "2024-02-01", allowedCasualLeavesPerMonth: 2, leaveCount: 0, status: "active", note: "Cake counter", createdAt: now, updatedAt: now },
    { name: "Ramesh Gupta",role: "delivery", phone: "9876543214", salaryType: "daily",   monthlySalary: 0,     dailyWage: 500, joiningDate: "2023-07-20", allowedCasualLeavesPerMonth: 0, leaveCount: 1, status: "active", createdAt: now, updatedAt: now },
  ] as Staff[], { allKeys: true });

  // Seed attendance for current month
  const thisMonth = today.slice(0, 7);
  const daysInMonth = new Date(parseInt(thisMonth.slice(0, 4)), parseInt(thisMonth.slice(5, 7)), 0).getDate();
  const todayDay = parseInt(today.slice(8, 10));

  for (const staffId of staffIds as number[]) {
    const records: Omit<Attendance, "id">[] = [];
    for (let d = 1; d < todayDay; d++) {
      const dateStr = `${thisMonth}-${String(d).padStart(2, "0")}`;
      const rand = Math.random();
      const status: Attendance["status"] = rand > 0.85 ? "absent" : rand > 0.75 ? "leave" : rand > 0.65 ? "half_day" : "present";
      records.push({ staffId: staffId as number, date: dateStr, status, overtimeHours: status === "present" && Math.random() > 0.8 ? 1 : 0, createdAt: now, updatedAt: now });
    }
    if (records.length > 0) await db.attendance.bulkAdd(records);
  }

  // Seed expenses
  const months = [0, 1, 2];
  for (const m of months) {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    const monthStr = d.toISOString().split("T")[0].slice(0, 7);
    await db.expenses.bulkAdd([
      { title: "Shop Rent — Main Road",          amount: 18000, category: "rent",         date: `${monthStr}-01`, createdAt: now, updatedAt: now },
      { title: "Electricity Bill",               amount: 4200,  category: "electricity",  date: `${monthStr}-05`, createdAt: now, updatedAt: now },
      { title: "Ice Cream Stock & Cones",        amount: 32000, category: "item_expense", date: `${monthStr}-08`, createdAt: now, updatedAt: now },
      { title: "Cake & Pastry Ingredients",      amount: 18000, category: "item_expense", date: `${monthStr}-10`, createdAt: now, updatedAt: now },
      { title: "Milk & Dairy Supplies",          amount: 14000, category: "item_expense", date: `${monthStr}-12`, createdAt: now, updatedAt: now },
      { title: "Sweets & Mithai Stock",          amount: 9500,  category: "item_expense", date: `${monthStr}-14`, createdAt: now, updatedAt: now },
      { title: "Staff Salaries",                 amount: 71000, category: "salary",       date: `${monthStr}-01`, createdAt: now, updatedAt: now },
      { title: "Seasonal Bonus",                 amount: 5000,  category: "bonus",        date: `${monthStr}-15`, createdAt: now, updatedAt: now },
      { title: "Packaging — Cups, Spoons, Boxes",amount: 3500,  category: "extra_expense",date: `${monthStr}-18`, createdAt: now, updatedAt: now },
      { title: "Refrigerator & Freezer Maintenance", amount: 2800, category: "maintenance", date: `${monthStr}-22`, createdAt: now, updatedAt: now },
      { title: "Internet & Wi-Fi Bill",          amount: 800,   category: "internet",     date: `${monthStr}-05`, createdAt: now, updatedAt: now },
    ] as Expense[]);
  }

  // Today's expenses
  await db.expenses.bulkAdd([
    { title: "Ice Cream Cones & Cups",         amount: 1800, category: "item_expense", date: today, createdAt: now, updatedAt: now },
    { title: "Fresh Milk — Morning Supply",     amount: 950,  category: "item_expense", date: today, createdAt: now, updatedAt: now },
    { title: "Cleaning Supplies",               amount: 400,  category: "miscellaneous",date: today, createdAt: now, updatedAt: now },
  ] as Expense[]);

  // Salary records — last month
  const lastMonth = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
  for (const staffId of staffIds as number[]) {
    const s = await db.staff.get(staffId as number);
    if (!s) continue;
    await db.salaryRecords.add({
      staffId: staffId as number, month: lastMonth, salaryType: s.salaryType,
      baseSalary: s.salaryType === "monthly" ? s.monthlySalary : s.dailyWage,
      workingDays: 26, presentDays: 24, absentDays: 1, leaveDays: 1,
      deductedLeaves: 0, leaveDeductionAmount: 0, bonus: 500, overtimeAmount: 0,
      advance: 0, extraDeduction: 0,
      finalSalary: s.salaryType === "monthly" ? s.monthlySalary + 500 : 24 * s.dailyWage + 500,
      paid: true, paidDate: `${lastMonth}-01`, createdAt: now, updatedAt: now,
    } as SalaryRecord);
  }

  // Temporary staff
  await db.temporaryStaff.bulkAdd([
    { workerName: "Mohan",   workType: "Stock Loading & Unloading", amount: 600, date: today, note: "Morning shift", createdAt: now, updatedAt: now },
    { workerName: "Lakshmi", workType: "Shop Cleaning",             amount: 350, date: today, createdAt: now, updatedAt: now },
  ] as TemporaryStaff[]);

  // Settings
  await db.settings.bulkAdd([
    { key: "theme",    value: "dark" },
    { key: "shopName", value: "Kumar Ice Parlour" },
    { key: "currency", value: "₹" },
  ] as AppSettings[]);
}
