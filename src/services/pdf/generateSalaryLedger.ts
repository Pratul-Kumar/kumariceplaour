import { createPDFDocument, drawHeader, drawFooter, drawTable } from "./pdfHelpers";
import { formatCurrency, formatDate, formatMonth } from "@/lib/utils";
import type { SalaryRecord, Staff, SalaryPayment } from "@/types";

export function generateSalaryLedger(records: SalaryRecord[], payments: SalaryPayment[], staffList: Staff[]) {
  const doc = createPDFDocument("Salary Ledger", "l");
  let currentY = drawHeader(doc, "Complete Salary Ledger");

  type LedgerEntry = {
    date: string;
    staffName: string;
    month: string;
    amount: number;
    method: string;
    note: string;
  };

  const ledgerEntries: LedgerEntry[] = [];

  payments.forEach(p => {
    const record = records.find(r => r.id === p.salaryRecordId);
    if (!record) return;
    const staff = staffList.find(s => s.id === record.staffId);
    
    ledgerEntries.push({
      date: p.paymentDate,
      staffName: staff?.name || "Unknown",
      month: `${record.year}-${record.month.toString().padStart(2, '0')}`,
      amount: p.amountPaid,
      method: p.paymentMethod,
      note: p.note || "-"
    });
  });

  // Sort by date descending
  ledgerEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalPayments = ledgerEntries.reduce((sum, e) => sum + e.amount, 0);

  const margin = 15;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`Total Ledger Payments: ${formatCurrency(totalPayments)}`, margin, currentY);
  currentY += 8;

  const head = [["Date", "Staff Name", "Salary Month", "Method", "Note", "Amount Paid"]];
  const body = ledgerEntries.map(e => [
    formatDate(e.date),
    e.staffName,
    formatMonth(e.month),
    e.method,
    e.note,
    formatCurrency(e.amount)
  ]);

  currentY = drawTable(doc, currentY, head, body, "striped");

  drawFooter(doc);
  doc.save("Salary_Ledger.pdf");
}
