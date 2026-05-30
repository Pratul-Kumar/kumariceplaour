import {
  createPDFDocument, drawHeader, drawFooter, drawSignatures,
  drawTable, drawSectionTitle, drawInfoGrid, drawStatCards, pdfCurrency, COLORS,
} from "./pdfHelpers";
import { formatDate, formatMonth } from "@/lib/utils";
import type { SalaryRecord, Staff, SalaryPayment, AdvanceRecord } from "@/types";
import { doc as firestoreDoc, getDoc } from "firebase/firestore";
import { db } from "@/firebase/config";
import { employeeLedgerService } from "../index";

export async function generateSalarySlip(
  staff: Staff,
  record: SalaryRecord,
  payments: SalaryPayment[],
  attendanceStats: {
    workingDays: number;
    presentDays: number;
    absentDays: number;
    leaveDays: number;
    halfDays: number;
  }
) {
  const monthStr = `${record.year}-${record.month.toString().padStart(2, "0")}`;
  const monthLabel = formatMonth(monthStr);

  const doc = createPDFDocument(`Salary Slip - ${staff.name} - ${monthLabel}`);
  let y = drawHeader(doc, "Salary Slip", monthLabel);

  // ── Employee Info ────────────────────────────────────────────────────────
  y = drawSectionTitle(doc, y, "Employee Information");
  y = drawInfoGrid(doc, y, [
    { label: "Employee Name",  value: staff.name },
    { label: "Role / Position", value: staff.role.toUpperCase() },
    { label: "Salary Type",    value: staff.salaryType === "monthly" ? "Monthly Fixed" : "Daily Wage" },
    { label: "Joining Date",   value: staff.joiningDate ? formatDate(staff.joiningDate) : "N/A" },
    { label: "Phone",          value: staff.phone },
    { label: "Salary Period",  value: monthLabel },
  ], 2);

  // ── Attendance Summary Stats ─────────────────────────────────────────────
  y = drawSectionTitle(doc, y, "Attendance Summary");
  y = drawStatCards(doc, y, [
    { label: "Working Days",  value: attendanceStats.workingDays.toString(), color: COLORS.primary },
    { label: "Present",       value: attendanceStats.presentDays.toString(),  color: COLORS.accent },
    { label: "Absent",        value: attendanceStats.absentDays.toString(),   color: COLORS.danger },
    { label: "Leaves Taken",  value: attendanceStats.leaveDays.toString(),    color: COLORS.warning },
    { label: "Half Days",     value: attendanceStats.halfDays.toString(),      color: COLORS.muted },
  ]);

  // ── Earnings & Deductions Table ──────────────────────────────────────────
  y = drawSectionTitle(doc, y, "Earnings & Deductions");

  const outstandingBal = await employeeLedgerService.getOutstandingBalance(staff.id!);

  const baseSalaryLabel = staff.salaryType === "monthly" ? "Monthly Base Salary" : "Daily Wage (Earned)";
  const tableHead = [["Earnings", "Amount (Rs.)", "Deductions", "Amount (Rs.)"]];
  const tableBody = [
    [baseSalaryLabel, pdfCurrency(record.baseSalary), "Leave Deduction",  pdfCurrency(record.leaveDeduction)],
    ["Bonus",          pdfCurrency(record.bonus),      "Advance Recovery", pdfCurrency(record.advance)],
    ["Overtime Pay",   pdfCurrency(record.overtime),   "Extra Deduction",  pdfCurrency(record.extraDeduction)],
  ];

  y = drawTable(doc, y, tableHead, tableBody, "striped", {
    0: { cellWidth: 52 },
    1: { cellWidth: 38, halign: "right" },
    2: { cellWidth: 52 },
    3: { cellWidth: 38, halign: "right" },
  });

  // ── Financial Summary ────────────────────────────────────────────────────
  y = drawSectionTitle(doc, y, "Salary Summary");

  const previousPending = record.previousDue || 0;
  const totalPayable    = record.finalSalary + previousPending;
  const remaining       = record.remainingDue;

  y = drawStatCards(doc, y, [
    { label: "Net Paid Salary",  value: pdfCurrency(record.totalPaid),   color: COLORS.accent },
    { label: "Balance Due",      value: pdfCurrency(remaining),          color: remaining > 0 ? COLORS.danger : COLORS.accent },
    { label: "Oustanding Debt",  value: outstandingBal > 0 ? `Owes: ₹${outstandingBal}` : `Owes: ₹0`, color: outstandingBal > 0 ? COLORS.danger : COLORS.accent },
  ]);

  // ── Payment History ──────────────────────────────────────────────────────
  if (payments && payments.length > 0) {
    y = drawSectionTitle(doc, y, "Payment History");

    const paymentBody = payments.map((p) => [
      formatDate(p.paymentDate),
      p.paymentMethod.toUpperCase(),
      pdfCurrency(p.amountPaid),
      p.note || "-",
    ]);

    y = drawTable(
      doc, y,
      [["Payment Date", "Method", "Amount Paid", "Note"]],
      paymentBody,
      "striped",
      {
        0: { cellWidth: 38 },
        1: { cellWidth: 32 },
        2: { cellWidth: 38, halign: "right" },
        3: { cellWidth: "auto" },
      }
    );
  }

  // ── Advance Adjustment Summary ───────────────────────────────────────────
  if (record.advanceIds && record.advanceIds.length > 0) {
    y = drawSectionTitle(doc, y, "Advance Adjustment Summary");
    const advances = await Promise.all(record.advanceIds.map(async (id) => {
      const snap = await getDoc(firestoreDoc(db, "advanceRecords", id));
      return snap.exists() ? snap.data() as AdvanceRecord : null;
    }));

    const validAdvances = advances.filter((a): a is AdvanceRecord => a !== null);
    if (validAdvances.length > 0) {
      const advBody = validAdvances.map((a) => [
        formatDate(a.date),
        a.reason || "Salary Advance",
        pdfCurrency(a.amount),
        a.status === "deducted" ? "Recovered" : "Pending",
      ]);

      y = drawTable(
        doc, y,
        [["Advance Date", "Reason / Description", "Amount", "Status"]],
        advBody,
        "striped",
        {
          0: { cellWidth: 38 },
          1: { cellWidth: "auto" },
          2: { cellWidth: 38, halign: "right" },
          3: { cellWidth: 32 },
        }
      );
    }
  }

  drawSignatures(doc, y + 10, ["Authorized Signatory", "Employee Signature"]);
  drawFooter(doc);

  doc.save(`Salary_Slip_${staff.name.replace(/\s+/g, "_")}_${monthStr}.pdf`);
}
