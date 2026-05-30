import {
  createPDFDocument, drawHeader, drawFooter,
  drawTable, drawSectionTitle, drawStatCards, pdfCurrency, COLORS,
} from "./pdfHelpers";
import { formatDate, formatMonth } from "@/lib/utils";
import type { SalaryRecord, Staff, SalaryPayment } from "@/types";

export function generateSalaryLedger(records: SalaryRecord[], payments: SalaryPayment[], staffList: Staff[]) {
  const doc = createPDFDocument("Salary Ledger", "l");
  let y = drawHeader(doc, "Complete Salary Ledger");

  type LedgerEntry = {
    date: string;
    staffName: string;
    role: string;
    month: string;
    amount: number;
    method: string;
    note: string;
  };

  const ledgerEntries: LedgerEntry[] = [];

  payments.forEach((p) => {
    const record = records.find((r) => r.id === p.salaryRecordId);
    if (!record) return;
    const staff = staffList.find((s) => s.id === record.staffId);
    ledgerEntries.push({
      date:      p.paymentDate,
      staffName: staff?.name || "Unknown",
      role:      staff?.role || "-",
      month:     `${record.year}-${record.month.toString().padStart(2, "0")}`,
      amount:    p.amountPaid,
      method:    p.paymentMethod,
      note:      p.note || "-",
    });
  });

  ledgerEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalPayments  = ledgerEntries.reduce((sum, e) => sum + e.amount, 0);
  const uniqueStaff    = new Set(ledgerEntries.map((e) => e.staffName)).size;
  const cashPayments   = ledgerEntries.filter((e) => e.method.toLowerCase() === "cash").reduce((s, e) => s + e.amount, 0);
  const onlinePayments = totalPayments - cashPayments;

  // ── Summary Stats ────────────────────────────────────────────────────────
  y = drawSectionTitle(doc, y, "Ledger Summary");
  y = drawStatCards(doc, y, [
    { label: "Total Entries",    value: ledgerEntries.length.toString(), color: COLORS.primary },
    { label: "Staff Count",      value: uniqueStaff.toString(),          color: COLORS.primaryDark },
    { label: "Total Disbursed",  value: pdfCurrency(totalPayments),      color: COLORS.accent },
    { label: "Cash Payments",    value: pdfCurrency(cashPayments),       color: COLORS.warning },
    { label: "Online / UPI",     value: pdfCurrency(onlinePayments),     color: COLORS.primary },
  ]);

  // ── Ledger Table ─────────────────────────────────────────────────────────
  y = drawSectionTitle(doc, y, "Payment Ledger");

  const body = ledgerEntries.map((e) => [
    formatDate(e.date),
    e.staffName,
    (e.role || "staff").toUpperCase(),
    formatMonth(e.month),
    (e.method || "cash").toUpperCase(),
    e.note,
    pdfCurrency(e.amount),
  ]);

  y = drawTable(
    doc, y,
    [["Date", "Staff Name", "Role", "Salary Month", "Method", "Note", "Amount Paid"]],
    body,
    "striped",
    {
      0: { cellWidth: 28 },
      1: { cellWidth: 40 },
      2: { cellWidth: 26 },
      3: { cellWidth: 32 },
      4: { cellWidth: 26 },
      5: { cellWidth: "auto" },
      6: { cellWidth: 32, halign: "right", fontStyle: "bold" },
    }
  );

  drawFooter(doc);
  doc.save("Salary_Ledger.pdf");
}
