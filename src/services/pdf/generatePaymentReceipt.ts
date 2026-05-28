import { createPDFDocument, drawHeader, drawFooter, drawSignatures, drawTable } from "./pdfHelpers";
import { formatCurrency, formatDate, formatMonth } from "@/lib/utils";
import type { SalaryRecord, Staff, SalaryPayment } from "@/types";

export function generatePaymentReceipt(staff: Staff, record: SalaryRecord, payment: SalaryPayment) {
  const doc = createPDFDocument(`Payment Receipt - ${staff.name}`, "p");
  let currentY = drawHeader(doc, "Salary Payment Receipt");

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  
  const receiptNo = `REC-${Date.now().toString().slice(-6)}`;
  doc.text(`Receipt No: ${receiptNo}`, pageWidth - margin - 50, currentY);
  
  doc.text("PAYMENT DETAILS", margin, currentY);
  currentY += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(`Received By: ${staff.name} (${staff.role.toUpperCase()})`, margin, currentY);
  doc.text(`Payment Date: ${formatDate(payment.paymentDate)}`, pageWidth / 2, currentY);
  currentY += 6;
  doc.text(`Salary Month: ${formatMonth(`${record.year}-${record.month.toString().padStart(2, '0')}`)}`, margin, currentY);
  doc.text(`Payment Method: ${payment.paymentMethod.toUpperCase()}`, pageWidth / 2, currentY);
  currentY += 10;

  const previousPending = record.previousDue || 0;
  const totalPayable = record.finalSalary + previousPending;
  
  const totalPaid = record.totalPaid;
  const remaining = record.remainingDue;

  const tableData = [
    ["Total Salary Payable (Incl. Pending)", formatCurrency(totalPayable)],
    ["Amount Paid Now", formatCurrency(payment.amountPaid)],
    ["Overall Total Paid", formatCurrency(totalPaid)],
    ["Remaining Balance", formatCurrency(remaining)],
  ];

  if (payment.note) {
    tableData.push(["Note", payment.note]);
  }

  currentY = drawTable(doc, currentY, [["Description", "Amount"]], tableData, "grid");

  currentY += 10;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Received the sum of ${formatCurrency(payment.amountPaid)} towards salary.`, margin, currentY);

  drawSignatures(doc, currentY + 30, ["Authorized Signatory", "Receiver Signature"]);
  drawFooter(doc);

  doc.save(`Receipt_${staff.name}_${formatDate(payment.paymentDate).replace(/ /g, "_")}.pdf`);
}
