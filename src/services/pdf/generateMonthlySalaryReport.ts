import {
  createPDFDocument, drawHeader, drawFooter,
  drawTable, drawSectionTitle, drawStatCards, pdfCurrency, COLORS,
} from "./pdfHelpers";
import { formatMonth } from "@/lib/utils";
import type { SalaryRecord, Staff } from "@/types";

export function generateMonthlySalaryReport(month: string, records: SalaryRecord[], staffList: Staff[]) {
  const doc = createPDFDocument(`Monthly Salary Report - ${month}`, "l");
  let y = drawHeader(doc, "Monthly Salary Report", formatMonth(month));

  // ── Aggregate Totals ─────────────────────────────────────────────────────
  let totalExpense = 0;
  let totalPaid    = 0;
  let totalPending = 0;

  const tableData = records.map((record) => {
    const staff = staffList.find((s) => s.id === record.staffId);
    const previousPending = record.previousDue || 0;
    const totalPayable    = record.finalSalary + previousPending;
    const paid            = record.totalPaid;
    const remaining       = record.remainingDue;
    const deductions      = record.leaveDeduction + record.advance + record.extraDeduction;

    totalExpense += record.finalSalary;
    totalPaid    += paid;
    totalPending += remaining;

    return [
      staff?.name || "Unknown",
      (staff?.role || "-").toUpperCase(),
      record.baseSalary > 0 ? pdfCurrency(record.baseSalary) : "-",
      record.bonus > 0      ? pdfCurrency(record.bonus)      : "-",
      deductions > 0        ? pdfCurrency(deductions)         : "-",
      pdfCurrency(record.finalSalary),
      pdfCurrency(paid),
      pdfCurrency(remaining),
      (record.status || "pending").toUpperCase(),
    ];
  });

  // ── Summary Stat Cards ───────────────────────────────────────────────────
  y = drawSectionTitle(doc, y, "Payroll Summary");
  y = drawStatCards(doc, y, [
    { label: "Total Employees",   value: records.length.toString(),    color: COLORS.primary },
    { label: "Total Salary Bill", value: pdfCurrency(totalExpense),    color: COLORS.primaryDark },
    { label: "Total Paid",        value: pdfCurrency(totalPaid),       color: COLORS.accent },
    { label: "Total Pending",     value: pdfCurrency(totalPending),    color: COLORS.danger },
    { label: "Paid %",            value: totalExpense > 0 ? `${Math.round((totalPaid / totalExpense) * 100)}%` : "0%", color: COLORS.warning },
  ]);

  // ── Detailed Table ───────────────────────────────────────────────────────
  y = drawSectionTitle(doc, y, "Staff Payroll Breakdown");

  const head = [[
    "Staff Name", "Role", "Base Salary", "Bonus",
    "Deductions", "Net Salary", "Paid", "Pending", "Status"
  ]];

  y = drawTable(doc, y, head, tableData, "striped", {
    0: { cellWidth: 38 },
    1: { cellWidth: 26 },
    2: { cellWidth: 28, halign: "right" },
    3: { cellWidth: 22, halign: "right" },
    4: { cellWidth: 28, halign: "right" },
    5: { cellWidth: 28, halign: "right", fontStyle: "bold" },
    6: { cellWidth: 24, halign: "right" },
    7: { cellWidth: 24, halign: "right" },
    8: { cellWidth: 22, halign: "center" },
  });

  drawFooter(doc);
  doc.save(`Monthly_Salary_Report_${month}.pdf`);
}
