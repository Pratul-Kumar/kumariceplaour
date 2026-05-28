import { createPDFDocument, drawHeader, drawFooter, drawTable } from "./pdfHelpers";
import { formatCurrency, formatMonth, formatDate } from "@/lib/utils";
import type { SalaryRecord, Staff } from "@/types";

export function generatePendingSalaryReport(records: SalaryRecord[], staffList: Staff[]) {
  const doc = createPDFDocument("Pending Salary Report", "p");
  let currentY = drawHeader(doc, "Pending Salaries Report");

  let totalPending = 0;

  const pendingRecords = records.filter(r => r.remainingDue > 0);

  const body = pendingRecords.map(r => {
    const staff = staffList.find(s => s.id === r.staffId);
    const totalPayable = r.finalSalary + r.previousDue;
    const paid = r.totalPaid;
    const remaining = r.remainingDue;
    
    totalPending += remaining;

    let lastPaymentDate = "-";
    // We would need payments passed in to do this accurately now, 
    // but without them we'll just omit or format differently.
    lastPaymentDate = "See Ledger";

    return [
      staff?.name || "Unknown",
      formatMonth(`${r.year}-${r.month.toString().padStart(2, '0')}`),
      formatCurrency(totalPayable),
      formatCurrency(paid),
      formatCurrency(remaining),
      lastPaymentDate
    ];
  });

  const margin = 15;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(225, 29, 72); // Rose 600
  doc.text(`TOTAL OUTSTANDING: ${formatCurrency(totalPending)}`, margin, currentY);
  currentY += 8;

  const head = [["Staff Name", "Month", "Total Payable", "Total Paid", "Pending Due", "Last Payment"]];
  
  if (body.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("No pending salaries found. Great job!", margin, currentY + 10);
  } else {
    currentY = drawTable(doc, currentY, head, body, "striped");
  }

  drawFooter(doc);
  doc.save("Pending_Salary_Report.pdf");
}
