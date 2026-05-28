import { createPDFDocument, drawHeader, drawFooter, drawSignatures, drawTable } from "./pdfHelpers";
import { formatCurrency, formatDate, formatMonth } from "@/lib/utils";
import type { SalaryRecord, Staff, SalaryPayment } from "@/types";

export function generateSalarySlip(
  staff: Staff, 
  record: SalaryRecord, 
  payments: SalaryPayment[], 
  attendanceStats: { workingDays: number; presentDays: number; absentDays: number; leaveDays: number; halfDays: number }
) {
  const doc = createPDFDocument(`Salary Slip - ${staff.name} - ${record.year}-${record.month}`);
  let currentY = drawHeader(doc, "Salary Slip");

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  // Employee Details Section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("EMPLOYEE DETAILS", margin, currentY);
  currentY += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(`Name: ${staff.name}`, margin, currentY);
  doc.text(`Role: ${staff.role.toUpperCase()}`, pageWidth / 2, currentY);
  currentY += 6;
  doc.text(`Salary Type: ${staff.salaryType.toUpperCase()}`, margin, currentY);
  doc.text(`Joining Date: ${formatDate(staff.joiningDate)}`, pageWidth / 2, currentY);
  currentY += 10;

  // Salary Details Table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`SALARY DETAILS: ${formatMonth(`${record.year}-${record.month.toString().padStart(2, '0')}`).toUpperCase()}`, margin, currentY);
  
  const baseSalaryLabel = staff.salaryType === "monthly" ? "Monthly Salary" : "Daily Wage";
  
  const earnings = [
    [baseSalaryLabel, formatCurrency(record.baseSalary)],
    ["Bonus", formatCurrency(record.bonus)],
    ["Overtime Amount", formatCurrency(record.overtime)],
  ];
  
  const deductions = [
    ["Leave Deduction", formatCurrency(record.leaveDeduction)],
    ["Advance", formatCurrency(record.advance)],
    ["Extra Deduction", formatCurrency(record.extraDeduction)],
  ];

  currentY = drawTable(doc, currentY + 4, [["Earnings", "Amount"], ["Deductions", "Amount"]], [
    [earnings[0][0], earnings[0][1], deductions[0][0], deductions[0][1]],
    [earnings[1][0], earnings[1][1], deductions[1][0], deductions[1][1]],
    [earnings[2][0], earnings[2][1], deductions[2][0], deductions[2][1]],
  ], "grid");

  // Summary Table
  const previousPending = record.previousDue || 0;
  const totalPayable = record.finalSalary + previousPending;
  const totalPaid = record.totalPaid;
  const remaining = record.remainingDue;

  const summaryData = [
    ["Previous Pending Balance", formatCurrency(previousPending)],
    ["Net Salary (This Month)", formatCurrency(record.finalSalary)],
    ["Total Payable", formatCurrency(totalPayable)],
    ["Total Paid", formatCurrency(totalPaid)],
    ["Remaining Balance", formatCurrency(remaining)],
  ];

  currentY = drawTable(doc, currentY, [["Summary", "Amount"]], summaryData, "grid");

  // Attendance Summary
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("ATTENDANCE SUMMARY", margin, currentY);
  
  currentY = drawTable(doc, currentY + 4, 
    [["Working Days", "Present", "Absent", "Leaves", "Half Days"]],
    [[
      attendanceStats.workingDays.toString(), 
      attendanceStats.presentDays.toString(), 
      attendanceStats.absentDays.toString(), 
      attendanceStats.leaveDays.toString(), 
      attendanceStats.halfDays.toString()
    ]], 
    "striped"
  );

  // Payment History
  if (payments && payments.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.text("PAYMENT HISTORY", margin, currentY);
    
    const paymentData = payments.map(p => [
      formatDate(p.paymentDate), 
      p.paymentMethod, 
      formatCurrency(p.amountPaid), 
      p.note || "-"
    ]);
    
    currentY = drawTable(doc, currentY + 4, 
      [["Date", "Method", "Amount", "Note"]], 
      paymentData, 
      "striped"
    );
  }

  drawSignatures(doc, currentY + 20);
  drawFooter(doc);

  doc.save(`Salary_Slip_${staff.name}_${record.month}.pdf`);
}
