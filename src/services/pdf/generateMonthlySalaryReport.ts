import { createPDFDocument, drawHeader, drawFooter, drawTable } from "./pdfHelpers";
import { formatCurrency, formatMonth } from "@/lib/utils";
import type { SalaryRecord, Staff } from "@/types";

export function generateMonthlySalaryReport(month: string, records: SalaryRecord[], staffList: Staff[]) {
  const doc = createPDFDocument(`Monthly Salary Report - ${month}`, "l"); // Landscape for more columns
  let currentY = drawHeader(doc, `Monthly Salary Report: ${formatMonth(month)}`);

  let totalExpense = 0;
  let totalPaid = 0;
  let totalPending = 0;

  const tableData = records.map(record => {
    const staff = staffList.find(s => s.id === record.staffId);
    
    const previousPending = record.previousDue || 0;
    const totalPayable = record.finalSalary + previousPending;
    const paid = record.totalPaid;
    const remaining = record.remainingDue;

    totalExpense += record.finalSalary;
    totalPaid += paid;
    totalPending += remaining;

    const deductions = record.leaveDeduction + record.advance + record.extraDeduction;

    return [
      staff?.name || "Unknown",
      staff?.role.toUpperCase() || "-",
      staff?.salaryType.toUpperCase() || "-",
      formatCurrency(record.baseSalary),
      formatCurrency(record.bonus),
      formatCurrency(deductions),
      formatCurrency(record.finalSalary),
      formatCurrency(paid),
      formatCurrency(remaining),
      record.status.toUpperCase()
    ];
  });

  const margin = 15;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  
  // Summary boxes
  const summaryBoxWidth = 60;
  const boxY = currentY;
  
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(margin, boxY, summaryBoxWidth, 20, "F");
  doc.text("Total Salary Expense", margin + 5, boxY + 8);
  doc.setTextColor(16, 185, 129); // emerald-500
  doc.text(formatCurrency(totalExpense), margin + 5, boxY + 15);

  doc.setTextColor(15, 23, 42);
  doc.rect(margin + summaryBoxWidth + 10, boxY, summaryBoxWidth, 20, "F");
  doc.text("Total Paid", margin + summaryBoxWidth + 15, boxY + 8);
  doc.setTextColor(59, 130, 246); // blue-500
  doc.text(formatCurrency(totalPaid), margin + summaryBoxWidth + 15, boxY + 15);

  doc.setTextColor(15, 23, 42);
  doc.rect(margin + (summaryBoxWidth + 10) * 2, boxY, summaryBoxWidth, 20, "F");
  doc.text("Total Pending", margin + (summaryBoxWidth + 10) * 2 + 5, boxY + 8);
  doc.setTextColor(244, 63, 94); // rose-500
  doc.text(formatCurrency(totalPending), margin + (summaryBoxWidth + 10) * 2 + 5, boxY + 15);

  currentY += 28;

  const head = [["Staff Name", "Role", "Type", "Base", "Bonus", "Deductions", "Final Salary", "Paid", "Remaining", "Status"]];
  
  currentY = drawTable(doc, currentY, head, tableData, "striped");

  drawFooter(doc);
  doc.save(`Monthly_Salary_Report_${month}.pdf`);
}
