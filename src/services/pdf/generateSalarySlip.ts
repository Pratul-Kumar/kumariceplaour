import { createPDFDocument, pdfCurrency } from "./pdfHelpers";
import { formatDate, formatMonth } from "@/lib/utils";
import { type SalaryRecord, type Staff, type SalaryPayment, type LedgerEntry, type DueRecord } from "@/types";
import autoTable from "jspdf-autotable";

// ─── HELPERS ──────────────────────────────────────────────
const COL_L  = 15;
const COL_R  = 113;
const VAL_L  = 108;
const VAL_R  = 200;

export interface PDFCalculationResult {
  generatedSalary: number;
  bonus: number;
  previousDue: number;
  grossSalary: number;
  giveMoneyDeducted: number;
  giveMoneyAdded: number;
  advanceRecovery: number;
  finalPayable: number;
  employeeReceives: number;
  previousAdvance: number;
  remainingAdvance: number;
}

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
  calcResult: PDFCalculationResult,
  duesHistory: DueRecord[],
  selectedPaymentId?: string
) {
  const monthStr   = `${record.year}-${record.month.toString().padStart(2, "0")}`;
  const monthLabel = formatMonth(monthStr);

  const doc = createPDFDocument(`Salary Slip - ${staff.name} - ${monthLabel}`);
  const W   = doc.internal.pageSize.getWidth();
  const H   = doc.internal.pageSize.getHeight();

  // Payment display logic
  let currentPaid    = payments.reduce((s, p) => s + p.amountPaid, 0);
  let paymentsToShow = payments;

  if (selectedPaymentId) {
    const sorted = [...payments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const idx    = sorted.findIndex(p => p.id === selectedPaymentId);
    if (idx !== -1) {
      paymentsToShow = sorted.slice(0, idx + 1);
      currentPaid    = paymentsToShow.reduce((s, p) => s + p.amountPaid, 0);
    }
  }

  const displayRemaining = Math.max(0, calcResult.finalPayable - currentPaid);

  let y = 14;

  // ════════════════════════════════════════════════════════
  // 1. SHOP HEADER
  // ════════════════════════════════════════════════════════
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text("Kumar's Ice Parlour", COL_L, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Nagar Palika Chowk, Chapra", COL_L, y + 5);
  doc.text("+91 94153 21576", COL_L, y + 9.5);

  const rightLabelX = W - 60;
  const rightValX   = W - 13;

  doc.setFont("helvetica", "normal");
  doc.text("Salary Month", rightLabelX, y);
  doc.setFont("helvetica", "bold");
  doc.text(monthLabel, rightValX, y, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.text("Generated Date", rightLabelX, y + 5);
  doc.setFont("helvetica", "bold");
  doc.text(formatDate(record.createdAt), rightValX, y + 5, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.text("Payment Status", rightLabelX, y + 10);
  doc.setFont("helvetica", "bold");
  let statusText = "PENDING";
  if (currentPaid >= calcResult.finalPayable && calcResult.finalPayable > 0) statusText = "FULLY PAID";
  else if (currentPaid > 0) statusText = "PARTIAL PAID";
  else if (calcResult.finalPayable === 0) statusText = "SETTLED";
  
  if (statusText === "FULLY PAID" || statusText === "SETTLED") doc.setTextColor(16, 185, 129);
  else if (statusText === "PARTIAL PAID") doc.setTextColor(245, 158, 11);
  else doc.setTextColor(239, 68, 68);
  doc.text(statusText, rightValX, y + 10, { align: "right" });

  y += 20;
  doc.setDrawColor(226, 232, 240);
  doc.line(COL_L, y, W - COL_L, y);
  y += 8;

  // ════════════════════════════════════════════════════════
  // 2. STAFF DETAILS
  // ════════════════════════════════════════════════════════
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("STAFF DETAILS", COL_L, y);
  y += 6;

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  
  // Left col
  doc.text("Employee Name", COL_L, y);
  doc.text("Role", COL_L, y + 5);
  doc.text("Phone Number", COL_L, y + 10);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(staff.name, COL_L + 25, y);
  doc.text((staff.role || "Worker").toUpperCase(), COL_L + 25, y + 5);
  doc.text(staff.phone || "N/A", COL_L + 25, y + 10);

  // Right col
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("Present Days", COL_R, y);
  doc.text("Leave Days", COL_R, y + 5);
  doc.text("Half Days", COL_R, y + 10);
  doc.text("Daily Wage", COL_R, y + 15);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(`${attendanceStats.presentDays}`, VAL_R, y, { align: "right" });
  doc.text(`${attendanceStats.leaveDays + attendanceStats.absentDays}`, VAL_R, y + 5, { align: "right" });
  doc.text(`${attendanceStats.halfDays}`, VAL_R, y + 10, { align: "right" });
  doc.text(pdfCurrency(staff.dailyWage || 0), VAL_R, y + 15, { align: "right" });

  y += 24;

  // ════════════════════════════════════════════════════════
  // 3. SALARY DETAILS
  // ════════════════════════════════════════════════════════
  let rowCount = 4; // Header, Salary Earned, Total Salary, Employee Gets
  if (calcResult.bonus > 0) rowCount++;
  if (calcResult.previousDue > 0) rowCount++;
  if (calcResult.giveMoneyDeducted > 0) rowCount++;
  else if (calcResult.giveMoneyAdded > 0) rowCount += 2; // Money Already Given (0) + Extra Money Added
  if (calcResult.previousAdvance > 0 || calcResult.advanceRecovery > 0) rowCount++;

  const cardHeight = 12 + rowCount * 5;

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(COL_L, y, W - 30, cardHeight, 2, 2, "F");
  
  let sy = y + 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("SALARY DETAILS", COL_L + 4, sy);
  
  sy += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Salary Earned", COL_L + 4, sy);
  doc.text(pdfCurrency(calcResult.generatedSalary), W - 19, sy, { align: "right" });
  sy += 5;
  
  if (calcResult.bonus > 0) {
    doc.text("Bonus", COL_L + 4, sy);
    doc.text(pdfCurrency(calcResult.bonus), W - 19, sy, { align: "right" });
    sy += 5;
  }

  if (calcResult.previousDue > 0) {
    doc.text("Previous Due", COL_L + 4, sy);
    doc.text(pdfCurrency(calcResult.previousDue), W - 19, sy, { align: "right" });
    sy += 5;
  }

  doc.setFont("helvetica", "bold");
  doc.text("Total Salary", COL_L + 4, sy);
  doc.text(pdfCurrency(calcResult.grossSalary), W - 19, sy, { align: "right" });
  sy += 5;
  
  doc.setFont("helvetica", "normal");
  if (calcResult.giveMoneyDeducted > 0) {
    doc.text("Money Already Given", COL_L + 4, sy);
    doc.text(`-${pdfCurrency(calcResult.giveMoneyDeducted)}`, W - 19, sy, { align: "right" });
    sy += 5;
  } else if (calcResult.giveMoneyAdded > 0) {
    doc.text("Money Already Given", COL_L + 4, sy);
    doc.text(`-${pdfCurrency(0)}`, W - 19, sy, { align: "right" });
    sy += 5;
    doc.text("Extra Money Added", COL_L + 4, sy);
    doc.text(`+${pdfCurrency(calcResult.giveMoneyAdded)}`, W - 19, sy, { align: "right" });
    sy += 5;
  }

  if (calcResult.previousAdvance > 0 || calcResult.advanceRecovery > 0) {
    doc.text("Used Against Advance", COL_L + 4, sy);
    doc.text(`-${pdfCurrency(calcResult.advanceRecovery)}`, W - 19, sy, { align: "right" });
    sy += 5;
  }

  sy = sy - 5 + 6;
  doc.setDrawColor(226, 232, 240);
  doc.line(COL_L + 4, sy, W - 19, sy);
  
  sy += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(16, 185, 129);
  doc.text("Employee Gets", COL_L + 4, sy);
  doc.text(pdfCurrency(calcResult.employeeReceives), W - 19, sy, { align: "right" });

  y += cardHeight + 8;

  // ════════════════════════════════════════════════════════
  // 4. ADVANCE DETAILS
  // ════════════════════════════════════════════════════════
  if (calcResult.previousAdvance > 0) {
    doc.setFillColor(255, 247, 237);
    doc.roundedRect(COL_L, y, W - 30, 28, 2, 2, "F");

    let ay = y + 7;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("ADVANCE DETAILS", COL_L + 4, ay);
    
    ay += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("Previous Advance", COL_L + 4, ay);
    doc.text(pdfCurrency(calcResult.previousAdvance), W - 19, ay, { align: "right" });
    
    ay += 5;
    doc.text("Less This Month", COL_L + 4, ay);
    doc.text(`-${pdfCurrency(calcResult.advanceRecovery)}`, W - 19, ay, { align: "right" });

    ay += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(234, 88, 12); // Orange
    doc.text("Advance Remaining", COL_L + 4, ay);
    doc.text(pdfCurrency(calcResult.remainingAdvance), W - 19, ay, { align: "right" });

    y += 36;
  }

  // ════════════════════════════════════════════════════════
  // 5. DUE DETAILS (If Any)
  // ════════════════════════════════════════════════════════
  const activeDues = duesHistory.filter(d => !d.isDeleted && d.type === "OWNER_TO_EMPLOYEE" && d.category !== "givetake");
  if (activeDues.length > 0) {
    if (y > H - 40) { doc.addPage(); y = 20; }
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("DUE DETAILS", COL_L, y);
    y += 4;
    
    autoTable(doc, {
      startY: y,
      margin: { left: COL_L, right: COL_L },
      head: [["Date", "Amount", "Reason"]],
      body: activeDues.map(d => [formatDate(d.createdAt), pdfCurrency(d.amount), d.notes || "-"]),
      theme: "plain",
      headStyles: { fontSize: 8, textColor: [100, 116, 139], fontStyle: "bold", cellPadding: { top: 2, bottom: 2, left: 0, right: 0 } },
      bodyStyles: { fontSize: 8, textColor: [15, 23, 42], cellPadding: { top: 2, bottom: 2, left: 0, right: 0 } },
      didDrawPage: (data) => { y = data.cursor!.y; }
    });
    
    y += 5;
    const totalDueAdded = activeDues.reduce((s, d) => s + (d.remainingAmount || 0), 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(`Total Due Balance: ${pdfCurrency(totalDueAdded)}`, COL_L, y);
    y += 10;
  }

  // ════════════════════════════════════════════════════════
  // 6. EXTRA MONEY DETAILS (If Any)
  // ════════════════════════════════════════════════════════
  const activeGiveMoneys = duesHistory.filter(d => !d.isDeleted && d.type === "EMPLOYEE_TO_OWNER" && d.category === "givetake");
  if (activeGiveMoneys.length > 0) {
    if (y > H - 40) { doc.addPage(); y = 20; }
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("EXTRA MONEY", COL_L, y);
    y += 4;
    
    autoTable(doc, {
      startY: y,
      margin: { left: COL_L, right: COL_L },
      head: [["Date", "Amount", "Note"]],
      body: activeGiveMoneys.map(d => [formatDate(d.createdAt), pdfCurrency(d.amount), d.notes || "-"]),
      theme: "plain",
      headStyles: { fontSize: 8, textColor: [100, 116, 139], fontStyle: "bold", cellPadding: { top: 2, bottom: 2, left: 0, right: 0 } },
      bodyStyles: { fontSize: 8, textColor: [15, 23, 42], cellPadding: { top: 2, bottom: 2, left: 0, right: 0 } },
      didDrawPage: (data) => { y = data.cursor!.y; }
    });
    
    y += 10;
  }

  // ════════════════════════════════════════════════════════
  // 7. PAYMENT HISTORY
  // ════════════════════════════════════════════════════════
  if (paymentsToShow.length > 0) {
    if (y > H - 40) { doc.addPage(); y = 20; }
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("PAYMENT HISTORY", COL_L, y);
    y += 4;
    
    autoTable(doc, {
      startY: y,
      margin: { left: COL_L, right: COL_L },
      head: [["Date", "Method", "Note", "Amount"]],
      body: paymentsToShow.map(p => [formatDate(p.paymentDate), p.paymentMethod.toUpperCase(), p.note || "-", pdfCurrency(p.amountPaid)]),
      theme: "plain",
      headStyles: { fontSize: 8, textColor: [100, 116, 139], fontStyle: "bold", cellPadding: { top: 2, bottom: 2, left: 0, right: 0 } },
      bodyStyles: { fontSize: 8, textColor: [15, 23, 42], cellPadding: { top: 2, bottom: 2, left: 0, right: 0 } },
      columnStyles: { 3: { halign: "right" } },
      didDrawPage: (data) => { y = data.cursor!.y; }
    });
    
    y += 5;
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("Pending Salary", W - 60, y);
    doc.setTextColor(15, 23, 42);
    doc.text(pdfCurrency(displayRemaining), W - 13, y, { align: "right" });
  }

  // ════════════════════════════════════════════════════════
  // 8. FOOTER WATERMARK (all pages)
  // ════════════════════════════════════════════════════════
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text("Powered by Zintrix Digital Technologies Pvt. Ltd.", W / 2, H - 8, { align: "center" });
  }

  doc.save(`Salary_${staff.name}_${monthLabel}.pdf`);
}
