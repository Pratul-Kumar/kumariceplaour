// ============================================================
// STAFF
// ============================================================
export type SalaryType = "monthly" | "daily";
export type StaffRole = string;
export type StaffStatus = "active" | "inactive";

export interface Staff {
  id?: string;
  name: string;
  role: StaffRole;
  phone: string;
  salaryType: SalaryType;
  monthlySalary: number;
  dailyWage: number;
  joiningDate?: string;
  status: StaffStatus;
  address?: string;
  note?: string;
  outstandingBalance?: number;
  advanceBalance?: number;
  dueBalance?: number;
  giveMoneyBalance?: number;
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
  | "item_expense" | "salary" | "salary_advance" | "bonus" | "electricity" | "rent"
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
  giveMoneyDeducted?: number;
  giveMoneyAdded?: number;
  deductGiveMoney?: boolean;
  giveMoneyAction?: "deduct" | "add" | "waive";
  giveMoneyIds?: string[];
  previousDue: number;
  finalSalary: number;
  totalPaid: number;
  remainingDue: number;
  status: "pending" | "partial" | "paid";
  isLocked?: boolean;
  advanceIds?: string[]; // tracks which advances were recovered in this salary
  rolloverAdvanceId?: string; // tracks any rollover advance created
  note?: string;
  grossSalary?: number;
  generatedSalary?: number;
  outstandingBefore?: number;
  recoveredAmount?: number;
  outstandingAfter?: number;
  salaryRollbackSnapshot?: {
    advanceBefore: number;
    dueBefore: number;
    giveMoneyBefore: number;
  };
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
  expenseId?: string; // linked expense
  amount: number;
  date: string;
  month: string; // YYYY-MM
  reason?: string;
  status: "pending" | "deducted"; // when salary is generated, it marks these as deducted
  deductedInMonth?: string;
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
  { value: "salary_advance",label: "Salary Advance",color: "#f43f5e", icon: "💸" },
  { value: "bonus",         label: "Bonus",         color: "#f59e0b", icon: "🎁" },
  { value: "electricity",   label: "Electricity",   color: "#f97316", icon: "⚡" },
  { value: "rent",          label: "Rent",          color: "#ec4899", icon: "🏠" },
  { value: "internet",      label: "Internet",      color: "#06b6d4", icon: "🌐" },
  { value: "transport",     label: "Transport",     color: "#84cc16", icon: "🚗" },
  { value: "maintenance",   label: "Maintenance",   color: "#a78bfa", icon: "🔧" },
  { value: "extra_expense", label: "Extra Expense", color: "#8b5cf6", icon: "📋" },
  { value: "miscellaneous", label: "Miscellaneous", color: "#64748b", icon: "🔀" },
];

export const STAFF_ROLES: { value: string; label: string }[] = [
  { value: "manager",  label: "Manager" },
  { value: "cashier",  label: "Cashier" },
  { value: "worker",   label: "Worker" },
  { value: "delivery", label: "Delivery" },
  { value: "security", label: "Security" },
  { value: "cleaner",  label: "Cleaner" },
];



export const ATTENDANCE_STATUSES: { value: AttendanceStatus; label: string; color: string }[] = [
  { value: "present",  label: "Present",  color: "emerald" },
  { value: "absent",   label: "Absent",   color: "red" },
  { value: "half_day", label: "Half Day", color: "amber" },
];

export function getCategoryInfo(category: ExpenseCategory) {
  return EXPENSE_CATEGORIES.find((c) => c.value === category) || EXPENSE_CATEGORIES[9];
}

// ============================================================
// SALARY CALCULATION ENGINE
// ============================================================
// Salary engine moved to salaryCalculationService.ts

// ============================================================
// EMPLOYEE FINANCIAL LEDGER
// ============================================================
export type LedgerType =
  | "salary_advance"
  | "salary_recovery"
  | "manual_repayment"
  | "manual_adjustment"
  | "salary_generated"
  | "salary_paid"
  | "salary_slip_generated"
  | "due_created";

export interface LedgerEntry {
  id?: string;
  staffId: string;
  type: LedgerType;
  amount: number;
  date: string;
  month: string;
  note?: string;
  expenseId?: string;
  salaryRecordId?: string;
  paymentMethod?: "cash" | "upi" | "bank" | "online" | "other";
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// UNIFIED DUES SYSTEM
// ============================================================
export type DueType = "OWNER_TO_EMPLOYEE" | "EMPLOYEE_TO_OWNER";

export interface DueRecord {
  id?: string;
  staffId: string;
  amount: number;
  remainingAmount: number;
  type: DueType;
  category?: "advance" | "due" | "givetake";
  reason?: string;
  notes?: string;
  linkedSalaryId?: string;
  date?: string; // YYYY-MM-DD for sorting/display
  paymentMethod?: "cash" | "upi" | "bank" | "online" | "other";
  createdAt: string;
  updatedAt: string;
  status: "active" | "settled" | "partial";
  isDeleted?: boolean;
  processedInSalary?: boolean;
  giveMoneyStatus?: "PENDING" | "ADDED_TO_SALARY" | "DEDUCTED_FROM_SALARY" | "WAIVED";
}

