// ============================================================
// STAFF
// ============================================================
export type SalaryType = "monthly" | "daily";
export type StaffRole = "manager" | "cashier" | "worker" | "delivery" | "security" | "cleaner" | "other";
export type StaffStatus = "active" | "inactive";

export interface Staff {
  id?: string;
  name: string;
  role: StaffRole;
  phone: string;
  salaryType: SalaryType;
  monthlySalary: number;
  dailyWage: number;
  joiningDate: string;
  allowedCasualLeavesPerMonth: number;
  leaveCount: number;
  status: StaffStatus;
  address?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// ATTENDANCE
// ============================================================
export type AttendanceStatus = "present" | "absent" | "half_day" | "leave";

export interface Attendance {
  id?: string;
  staffId: string;
  date: string; // ISO YYYY-MM-DD
  status: AttendanceStatus;
  overtimeHours: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// EXPENSES
// ============================================================
export type ExpenseCategory =
  | "item_expense" | "salary" | "bonus" | "electricity" | "rent"
  | "internet" | "transport" | "maintenance" | "extra_expense" | "miscellaneous";

export interface Expense {
  id?: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
  note?: string;
  staffId?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// SALARY RECORD & PAYMENTS
// ============================================================
export interface SalaryRecord {
  id?: string;
  staffId: string;
  month: number;
  year: number;
  baseSalary: number;
  bonus: number;
  overtime: number;
  leaveDeduction: number;
  extraDeduction: number;
  advance: number;
  previousDue: number;
  finalSalary: number;
  totalPaid: number;
  remainingDue: number;
  status: "pending" | "partial" | "paid";
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalaryPayment {
  id?: string;
  salaryRecordId: string;
  staffId: string;
  amountPaid: number;
  paymentDate: string;
  paymentMethod: "cash" | "upi" | "bank" | "other";
  note?: string;
  createdAt: string;
}

// ============================================================
// ADVANCE RECORD
// ============================================================
export interface AdvanceRecord {
  id?: string;
  staffId: string;
  amount: number;
  date: string;
  month: string; // YYYY-MM
  reason?: string;
  status: "pending" | "deducted"; // when salary is generated, it marks these as deducted
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// LEAVE RECORD
// ============================================================
export type LeaveType = "casual" | "paid" | "unpaid" | "sick";

export interface LeaveRecord {
  id?: string;
  staffId: string;
  leaveDate: string;
  leaveType: LeaveType;
  reason?: string;
  approved: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// TEMPORARY WORKER
// ============================================================
export interface TemporaryStaff {
  id?: string;
  workerName: string;
  workType: string;
  amount: number;
  date: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// SETTINGS
// ============================================================
export interface AppSettings {
  id?: string;
  key: string;
  value: string;
}

// ============================================================
// CONSTANTS & HELPERS
// ============================================================
export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string; color: string; icon: string }[] = [
  { value: "item_expense",  label: "Item Expense",  color: "#6366f1", icon: "📦" },
  { value: "salary",        label: "Salary",        color: "#10b981", icon: "💰" },
  { value: "bonus",         label: "Bonus",         color: "#f59e0b", icon: "🎁" },
  { value: "electricity",   label: "Electricity",   color: "#f97316", icon: "⚡" },
  { value: "rent",          label: "Rent",          color: "#ec4899", icon: "🏠" },
  { value: "internet",      label: "Internet",      color: "#06b6d4", icon: "🌐" },
  { value: "transport",     label: "Transport",     color: "#84cc16", icon: "🚗" },
  { value: "maintenance",   label: "Maintenance",   color: "#a78bfa", icon: "🔧" },
  { value: "extra_expense", label: "Extra Expense", color: "#8b5cf6", icon: "📋" },
  { value: "miscellaneous", label: "Miscellaneous", color: "#64748b", icon: "🔀" },
];

export const STAFF_ROLES: { value: StaffRole; label: string }[] = [
  { value: "manager",  label: "Manager" },
  { value: "cashier",  label: "Cashier" },
  { value: "worker",   label: "Worker" },
  { value: "delivery", label: "Delivery" },
  { value: "security", label: "Security" },
  { value: "cleaner",  label: "Cleaner" },
  { value: "other",    label: "Other" },
];

export const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: "casual",  label: "Casual Leave" },
  { value: "paid",    label: "Paid Leave" },
  { value: "unpaid",  label: "Unpaid Leave" },
  { value: "sick",    label: "Sick Leave" },
];

export const ATTENDANCE_STATUSES: { value: AttendanceStatus; label: string; color: string }[] = [
  { value: "present",  label: "Present",  color: "emerald" },
  { value: "absent",   label: "Absent",   color: "red" },
  { value: "half_day", label: "Half Day", color: "amber" },
  { value: "leave",    label: "Leave",    color: "blue" },
];

export function getCategoryInfo(category: ExpenseCategory) {
  return EXPENSE_CATEGORIES.find((c) => c.value === category) || EXPENSE_CATEGORIES[9];
}

// ============================================================
// SALARY CALCULATION ENGINE
// ============================================================
export interface SalaryCalculationInput {
  staff: Staff;
  attendanceRecords: Attendance[];
  workingDaysInMonth: number;
  bonus?: number;
  advance?: number;
  extraDeduction?: number;
  overtimeRatePerHour?: number; // default: perDaySalary/8
}

export interface SalaryCalculationResult {
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  halfDays: number;
  totalOvertimeHours: number;
  deductedLeaves: number;
  leaveDeductionAmount: number;
  overtimeAmount: number;
  finalSalary: number;
  remainingDue: number;
  breakdown: string[];
}

export function calculateSalary(input: SalaryCalculationInput): SalaryCalculationResult {
  const { staff, attendanceRecords, workingDaysInMonth, bonus = 0, advance = 0, extraDeduction = 0 } = input;
  const breakdown: string[] = [];

  // Count attendance
  let presentDays = 0, absentDays = 0, leaveDays = 0, halfDays = 0, totalOvertimeHours = 0;
  for (const rec of attendanceRecords) {
    if (rec.status === "present")  { presentDays += 1; }
    else if (rec.status === "half_day") { presentDays += 0.5; halfDays += 1; }
    else if (rec.status === "absent")  { absentDays += 1; }
    else if (rec.status === "leave")   { leaveDays += 1; }
    totalOvertimeHours += rec.overtimeHours || 0;
  }

  let leaveDeductionAmount = 0;
  let deductedLeaves = 0;
  let finalSalary = 0;

  if (staff.salaryType === "monthly") {
    const perDaySalary = staff.monthlySalary / workingDaysInMonth;
    const allowedLeaves = staff.allowedCasualLeavesPerMonth;
    deductedLeaves = Math.max(0, leaveDays - allowedLeaves);
    leaveDeductionAmount = deductedLeaves * perDaySalary;
    const absentDeduction = absentDays * perDaySalary;
    const halfDayDeduction = halfDays * (perDaySalary / 2);
    const overtimeRate = input.overtimeRatePerHour ?? perDaySalary / 8;
    const overtimeAmount = totalOvertimeHours * overtimeRate;

    finalSalary = staff.monthlySalary - leaveDeductionAmount - absentDeduction - halfDayDeduction + overtimeAmount + bonus - advance - extraDeduction;
    const remainingDue = finalSalary;

    breakdown.push(`Base: ₹${staff.monthlySalary.toLocaleString()}`);
    if (absentDeduction > 0) breakdown.push(`Absent (${absentDays}d): -₹${absentDeduction.toFixed(0)}`);
    if (halfDayDeduction > 0) breakdown.push(`Half Days (${halfDays}): -₹${halfDayDeduction.toFixed(0)}`);
    if (leaveDeductionAmount > 0) breakdown.push(`Extra Leaves (${deductedLeaves}): -₹${leaveDeductionAmount.toFixed(0)}`);
    if (overtimeAmount > 0) breakdown.push(`Overtime (${totalOvertimeHours}h): +₹${overtimeAmount.toFixed(0)}`);
    if (bonus > 0) breakdown.push(`Bonus: +₹${bonus}`);
    if (advance > 0) breakdown.push(`Advance: -₹${advance}`);
    if (extraDeduction > 0) breakdown.push(`Extra Deduction: -₹${extraDeduction}`);

    return { presentDays, absentDays, leaveDays, halfDays, totalOvertimeHours, deductedLeaves, leaveDeductionAmount, overtimeAmount: totalOvertimeHours * overtimeRate, finalSalary, remainingDue, breakdown };
  } else {
    // Daily wage
    const perDaySalary = staff.dailyWage;
    const overtimeRate = input.overtimeRatePerHour ?? perDaySalary / 8;
    const overtimeAmount = totalOvertimeHours * overtimeRate;
    finalSalary = presentDays * perDaySalary + overtimeAmount + bonus - advance - extraDeduction;
    const remainingDue = finalSalary;

    breakdown.push(`Days Present (${presentDays}): ₹${(presentDays * perDaySalary).toFixed(0)}`);
    if (overtimeAmount > 0) breakdown.push(`Overtime (${totalOvertimeHours}h): +₹${overtimeAmount.toFixed(0)}`);
    if (bonus > 0) breakdown.push(`Bonus: +₹${bonus}`);
    if (advance > 0) breakdown.push(`Advance: -₹${advance}`);
    if (extraDeduction > 0) breakdown.push(`Extra Deduction: -₹${extraDeduction}`);

    return { presentDays, absentDays, leaveDays, halfDays, totalOvertimeHours, deductedLeaves: 0, leaveDeductionAmount: 0, overtimeAmount, finalSalary, remainingDue, breakdown };
  }
}
