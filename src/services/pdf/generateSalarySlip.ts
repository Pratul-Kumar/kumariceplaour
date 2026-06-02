import { createPDFDocument, pdfCurrency } from "./pdfHelpers";
import { formatDate, formatMonth } from "@/lib/utils";
import type { SalaryRecord, Staff, SalaryPayment } from "@/types";
import autoTable from "jspdf-autotable";

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
  },
  selectedPaymentId?: string
) {
  const monthStr = `${record.year}-${record.month.toString().padStart(2, "0")}`;
  const monthLabel = formatMonth(monthStr);

  const doc = createPDFDocument(`Salary Slip - ${staff.name} - ${monthLabel}`);
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  let y = 15;

  let currentPaid = record.totalPaid;
  let currentRemaining = record.remainingDue;
  
  let paidThisTransaction = 0;
  let paymentsToShow = payments;

  if (selectedPaymentId) {
    const sortedPayments = [...payments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const idx = sortedPayments.findIndex(p => p.id === selectedPaymentId);
    if (idx !== -1) {
      paymentsToShow = sortedPayments.slice(0, idx + 1);
      paidThisTransaction = sortedPayments[idx].amountPaid;
      const paidEarlier = sortedPayments.slice(0, idx).reduce((sum, p) => sum + p.amountPaid, 0);
      const totalDue = record.finalSalary + (record.previousDue || 0);
      const totalPaidUpTo = paidEarlier + paidThisTransaction;
      currentRemaining = Math.max(0, totalDue - totalPaidUpTo);
      currentPaid = totalPaidUpTo;
    }
  }

  // 1. DIGITAL HEADER
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text("Kumar's Ice Parlour", 15, y);

  doc.setFont("helvetica", "medium");
  doc.setFontSize(9);
  doc.setTextColor(37, 99, 235);
  doc.text("Salary Slip", 15, y + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Employee Name: ", 15, y + 10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(staff.name, 38, y + 10.5);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("Phone/No: ", 15, y + 14.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(staff.phone || "N/A", 38, y + 14.5);

  // Right Column
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("Salary Month:", W - 70, y, { align: "left" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(monthLabel, W - 15, y, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("Generated Date:", W - 70, y + 4.5, { align: "left" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  const generatedDate = formatDate(new Date().toISOString(), "dd MMM yyyy");
  doc.text(generatedDate, W - 15, y + 4.5, { align: "right" });

  y = 35;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(37, 99, 235);
  doc.text("PAYROLL SUMMARY", 15, y);
  
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(15, y + 1.5, W - 15, y + 1.5);

  y = y + 7;
  const startY = y;

  const addLine = (label: string, value: string, color: [number, number, number] = [15, 23, 42], isBold = false, isFinal = false) => {
    if (isFinal) {
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(15, y - 3, 105, y - 3);
    }
    doc.setFont("helvetica", isBold || isFinal ? "bold" : "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(label, 17, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...color);
    doc.text(value, 100, y, { align: "right" });
    y = y + 6;
  };

  addLine("Present Days", `${attendanceStats.presentDays} / ${attendanceStats.workingDays}`);
  addLine("Salary Amount", pdfCurrency(record.baseSalary));
  
  if (record.bonus > 0) {
    addLine("Bonus", `+ ${pdfCurrency(record.bonus)}`, [21, 128, 61]);
  }

  const prevDue = record.previousDue || 0;
  if (prevDue > 0) {
    addLine("Due Money (Pending)", `+ ${pdfCurrency(prevDue)}`, [21, 128, 61]);
  }

  const advDeduct = record.advance || 0;
  if (advDeduct > 0) {
    addLine("Advance Deduction", `- ${pdfCurrency(advDeduct)}`, [220, 38, 38]);
  }

  const totalPayable = record.finalSalary + prevDue;
  
  addLine("= Total Payable", pdfCurrency(totalPayable), [37, 99, 235], true, true);

  // Partial or Full payment logic
  if (paidThisTransaction > 0 && paidThisTransaction < totalPayable) {
    addLine("Partial Payment", `- ${pdfCurrency(paidThisTransaction)}`, [21, 128, 61]);
  } else if (paidThisTransaction > 0) {
    addLine("Final Paid Amount", `- ${pdfCurrency(paidThisTransaction)}`, [21, 128, 61]);
  } else if (record.totalPaid > 0) {
    addLine("Final Paid Amount", `- ${pdfCurrency(record.totalPaid)}`, [21, 128, 61]);
  }

  if (currentRemaining > 0) {
    addLine("= Remaining Pending Amount", pdfCurrency(currentRemaining), [220, 38, 38], true, true);
  } else {
    addLine("= Remaining Pending Amount", pdfCurrency(0), [21, 128, 61], true, true);
  }

  // Transaction History
  if (paymentsToShow && paymentsToShow.length > 0) {
    y = Math.max(y, startY + 50);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("Transaction History", 15, y);

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(15, y + 1.5, W - 15, y + 1.5);

    y = y + 5;

    const paymentBody = paymentsToShow.map((p) => [
      formatDate(p.paymentDate),
      (p.paymentMethod || "cash").toUpperCase(),
      pdfCurrency(p.amountPaid),
      p.note || "-",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Date", "Method", "Amount Paid", "Note"]],
      body: paymentBody,
      theme: "plain",
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7.5,
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      },
      bodyStyles: {
        fontSize: 7.5,
        cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
        textColor: [51, 65, 85],
        lineColor: [226, 232, 240],
        lineWidth: 0.15,
      },
    });
  }

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(15, H - 14, W - 15, H - 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text("Generated digitally by Kumar Ice Parlour", 15, H - 9.5);

  doc.save(`Salary_Slip_${staff.name.replace(/\s+/g, "_")}_${monthStr}.pdf`);
}
