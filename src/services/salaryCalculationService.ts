export interface SalaryCalculationInput {
  generatedSalary: number; // Raw salary earned from days worked
  bonus: number;
  previousDue: number; // Due to be added to this salary
  advanceBalance: number; // Outstanding advance the employee owes
  giveMoneyAmount: number; // Give Money amount
  deductGiveMoney: boolean; // toggle: true = deduct from salary, false = add to payable
}

export interface SalaryCalculationResult {
  generatedSalary: number;
  bonus: number;
  previousDue: number;
  grossSalary: number;
  giveMoneyDeducted: number;
  giveMoneyAdded: number;
  netAvailable: number;
  advanceRecovery: number;
  remainingAdvance: number;
  employeeReceives: number;
  finalPayable: number;
}

/**
 * SINGLE SOURCE OF TRUTH for all salary calculations.
 * Used by UI, Database Transactions, and PDF generation.
 */
export function calculateSalaryEngine(input: SalaryCalculationInput): SalaryCalculationResult {
  const {
    generatedSalary,
    bonus,
    previousDue,
    advanceBalance,
    giveMoneyAmount,
    deductGiveMoney
  } = input;

  // Enforce positive advance balance to prevent stale negative data bugs
  const safeAdvanceBalance = Math.max(0, advanceBalance);

  // 1. Gross Salary
  const grossSalary = generatedSalary + bonus + previousDue;

  let giveMoneyDeducted = 0;
  let giveMoneyAdded = 0;
  let netAvailable = 0;
  let advanceRecovery = 0;
  let employeeReceives = 0;
  let finalPayable = 0;

  if (deductGiveMoney) {
    // If Deduct Give Money = ON
    giveMoneyDeducted = Math.min(giveMoneyAmount, grossSalary);
    netAvailable = Math.max(0, grossSalary - giveMoneyDeducted);

    advanceRecovery = Math.min(netAvailable, safeAdvanceBalance);

    finalPayable = netAvailable - advanceRecovery;
    employeeReceives = finalPayable;
  } else {
    // If Deduct Give Money = OFF
    advanceRecovery = Math.min(grossSalary, safeAdvanceBalance);
    giveMoneyAdded = giveMoneyAmount;
    
    // Remaining gross after advance is used
    const remainingGross = Math.max(0, grossSalary - advanceRecovery);
    
    // Employee gets whatever is left of gross + the extra give money
    employeeReceives = remainingGross + giveMoneyAdded;
    finalPayable = employeeReceives;
    
    netAvailable = grossSalary; // Logic consistency
  }

  const remainingAdvance = Math.max(0, safeAdvanceBalance - advanceRecovery);

  // SAFETY CHECK
  if (employeeReceives > grossSalary && !giveMoneyAdded) {
    throw new Error("PDF Calculation Error: Employee Receives exceeds Gross Salary");
  }

  return {
    generatedSalary,
    bonus,
    previousDue,
    grossSalary,
    giveMoneyDeducted,
    giveMoneyAdded,
    netAvailable,
    advanceRecovery,
    remainingAdvance,
    employeeReceives,
    finalPayable
  };
}

/**
 * Base generated salary calculator from attendance records
 * Extracted from types/index.ts to centralize all logic here.
 */
import { Staff, Attendance } from "@/types";

export interface AttendanceSalaryInput {
  staff: Staff;
  attendanceRecords: Attendance[];
  workingDaysInMonth: number;
  extraDeduction?: number;
  overtimeRatePerHour?: number;
}

export function calculateGeneratedSalary(input: AttendanceSalaryInput) {
  const { staff, attendanceRecords, workingDaysInMonth, extraDeduction = 0 } = input;
  
  let presentDays = 0, absentDays = 0, halfDays = 0, leaveDays = 0, totalOvertimeHours = 0;
  for (const rec of attendanceRecords) {
    if (rec.status === "present")  { presentDays += 1; }
    else if (rec.status === "half_day") { presentDays += 0.5; halfDays += 1; }
    else if (rec.status === "absent")  { absentDays += 1; }
    else if (rec.status === "leave")   { leaveDays += 1; }
    totalOvertimeHours += rec.overtimeHours || 0;
  }

  let generatedSalary = 0;
  let overtimeAmount = 0;

  if (staff.salaryType === "monthly") {
    const perDaySalary = staff.monthlySalary / workingDaysInMonth;
    const absentDeduction = absentDays * perDaySalary;
    const halfDayDeduction = halfDays * (perDaySalary / 2);
    const overtimeRate = input.overtimeRatePerHour ?? perDaySalary / 8;
    overtimeAmount = totalOvertimeHours * overtimeRate;

    generatedSalary = staff.monthlySalary - absentDeduction - halfDayDeduction + overtimeAmount - extraDeduction;
  } else {
    const dailyWage = staff.dailyWage || 0;
    const overtimeRate = input.overtimeRatePerHour ?? dailyWage / 8;
    overtimeAmount = totalOvertimeHours * overtimeRate;

    generatedSalary = (presentDays * dailyWage) + overtimeAmount - extraDeduction;
  }

  return {
    generatedSalary: Math.max(0, generatedSalary),
    presentDays,
    absentDays,
    leaveDays,
    halfDays,
    totalOvertimeHours,
    overtimeAmount
  };
}
