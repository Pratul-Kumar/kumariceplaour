import {
  createPDFDocument, drawHeader, drawFooter, drawSignatures,
  drawTable, drawSectionTitle, drawInfoGrid, pdfCurrency, COLORS,
} from "./pdfHelpers";
import { formatCurrency, formatDate, formatMonth } from "@/lib/utils";
import type { SalaryRecord, Staff, SalaryPayment } from "@/types";

export function generatePaymentReceipt(staff: Staff, record: SalaryRecord, payment: SalaryPayment) {
  const monthStr = `${record.year}-${record.month.toString().padStart(2, "0")}`;
  const doc = createPDFDocument(`Payment Receipt - ${staff.name}`, "p");

  const receiptNo = `REC-${Date.now().toString().slice(-8)}`;

  let y = drawHeader(doc, "Payment Receipt", `Receipt No: ${receiptNo}`);

  const W = doc.internal.pageSize.getWidth();

  // ── Receipt Highlight Banner ─────────────────────────────────────────────
  const bannerH = 16;
  doc.setFillColor(...COLORS.accent);
  doc.roundedRect(12, y, W - 24, bannerH, 2, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("AMOUNT RECEIVED", 20, y + 6.5);

  doc.setFontSize(14);
  doc.text(pdfCurrency(payment.amountPaid), W - 20, y + 10, { align: "right" });
  y += bannerH + 6;

  // ── Payment Details ──────────────────────────────────────────────────────
  y = drawSectionTitle(doc, y, "Payment Details");
  y = drawInfoGrid(doc, y, [
    { label: "Received By",     value: `${staff.name}` },
    { label: "Role",            value: (staff.role || "staff").toUpperCase() },
    { label: "Payment Date",    value: formatDate(payment.paymentDate) },
    { label: "Payment Method",  value: (payment.paymentMethod || "cash").toUpperCase() },
    { label: "Salary Month",    value: formatMonth(monthStr) },
    { label: "Receipt No.",     value: receiptNo },
  ], 2);

  // ── Financial Breakdown ──────────────────────────────────────────────────
  y = drawSectionTitle(doc, y, "Financial Breakdown");

  const previousPending = record.previousDue || 0;
  const totalPayable    = record.finalSalary + previousPending;
  const remaining       = record.remainingDue;

  const tableData: [string, string, string][] = [
    ["Net Salary (This Month)",           pdfCurrency(record.finalSalary), ""],
    ["Previous Pending Balance",          pdfCurrency(previousPending),    "Carried forward"],
    ["Total Payable (Incl. Pending)",     pdfCurrency(totalPayable),       ""],
    ["Amount Paid (This Transaction)",    pdfCurrency(payment.amountPaid), ""],
    ["Total Paid (Cumulative)",           pdfCurrency(record.totalPaid),   ""],
    ["Remaining Balance",                 pdfCurrency(remaining),          remaining <= 0 ? "CLEARED" : "PENDING"],
  ];

  if (payment.note) {
    tableData.push(["Note", payment.note, ""]);
  }

  y = drawTable(
    doc, y,
    [["Description", "Amount (Rs.)", "Status"]],
    tableData,
    "striped",
    {
      0: { cellWidth: 90 },
      1: { cellWidth: 45, halign: "right" },
      2: { cellWidth: 35 },
    }
  );

  // ── Declaration ──────────────────────────────────────────────────────────
  y += 4;
  doc.setFillColor(...COLORS.light);
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.2);
  doc.roundedRect(12, y, W - 24, 14, 2, 2, "FD");

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.mid);
  doc.text(
    `Received the sum of ${pdfCurrency(payment.amountPaid)} from Kumar's Ice Parlour towards salary for ${formatMonth(monthStr)}.`,
    W / 2, y + 9,
    { align: "center", maxWidth: W - 30 }
  );
  y += 18;

  drawSignatures(doc, y, ["Authorized Signatory", "Receiver Signature"]);
  drawFooter(doc);

  doc.save(`Receipt_${staff.name.replace(/\s+/g, "_")}_${formatDate(payment.paymentDate, "ddMMyyyy")}.pdf`);
}
