import { createPDFDocument, pdfCurrency } from "./pdfHelpers";
import { formatDate, formatMonth } from "@/lib/utils";
import type { SalaryRecord, Staff, SalaryPayment, LedgerEntry } from "@/types";
import autoTable from "jspdf-autotable";

// ─── HELPERS ──────────────────────────────────────────────
const COL_L  = 15;   // left column start
const COL_R  = 113;  // right column start
const VAL_L  = 108;  // right-align value for left column
const VAL_R  = 200;  // right-align value for right column (page width - margin)

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
  ledgerEntries?: LedgerEntry[],
  selectedPaymentId?: string
) {
  const monthStr   = `${record.year}-${record.month.toString().padStart(2, "0")}`;
  const monthLabel = formatMonth(monthStr);

  const doc = createPDFDocument(`Salary Slip - ${staff.name} - ${monthLabel}`);
  const W   = doc.internal.pageSize.getWidth();
  const H   = doc.internal.pageSize.getHeight();

  // ── Resolve payment context ─────────────────────────────
  let currentPaid      = record.totalPaid;
  let currentRemaining = record.remainingDue;
  let paymentsToShow   = payments;

  if (selectedPaymentId) {
    const sorted = [...payments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const idx    = sorted.findIndex(p => p.id === selectedPaymentId);
    if (idx !== -1) {
      paymentsToShow        = sorted.slice(0, idx + 1);
      const paidEarlier     = sorted.slice(0, idx).reduce((s, p) => s + p.amountPaid, 0);
      const paidThisTx      = sorted[idx].amountPaid;
      currentPaid           = paidEarlier + paidThisTx;
      // CORRECT formula: totalAmountToPay = grossSalary + due - advance
      const totalAmountToPay = Math.max(0,
        (record.grossSalary || record.finalSalary || 0)
        + (record.bonus       || 0)
        + (record.previousDue || 0)
        - (record.advance     || 0)
      );
      currentRemaining = Math.max(0, totalAmountToPay - currentPaid);
    }
  }

  // ── CORRECT final payable formula ──────────────────────
  // finalPayable = generatedSalary + bonus + dueAmount - advanceDeduction
  const generatedSalary  = record.grossSalary || record.finalSalary || record.baseSalary || 0;
  const bonusAmount      = record.bonus       || 0;
  const prevDue          = record.previousDue || 0;
  const advDeduct        = record.advance     || 0;
  const totalAmountToPay = Math.max(0, generatedSalary + bonusAmount + prevDue - advDeduct);

  // Use stored totalPaid + remainingDue as ground truth (set at generation time)
  // but recalculate for display consistency
  const displayPaid      = currentPaid;
  const displayRemaining = currentRemaining;

  let y = 14;

  // ════════════════════════════════════════════════════════
  // 1. SHOP HEADER  (Left: brand | Right: metadata)
  // ════════════════════════════════════════════════════════

  // Left — Shop Branding
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text("Kumar's Ice Parlour", COL_L, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Nagar Palika Chowk, Chapra", COL_L, y + 5);
  doc.text("+91 94153 21576", COL_L, y + 9.5);

  // Right — Salary metadata
  const rightLabelX = W - 60;
  const rightValX   = W - 13;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Salary Month", rightLabelX, y, { align: "left" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(monthLabel, rightValX, y, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("Generated Date", rightLabelX, y + 5, { align: "left" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  const genDate = formatDate(new Date().toISOString(), "dd MMM yyyy");
  doc.text(genDate, rightValX, y + 5, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("Payment Status", rightLabelX, y + 10, { align: "left" });
  doc.setFont("helvetica", "bold");
  let statusStr   = "PENDING";
  let statusColor: [number, number, number] = [220, 38, 38];
  if (displayRemaining <= 0 && displayPaid > 0) {
    statusStr   = "FULLY PAID";
    statusColor = [22, 163, 74];
  } else if (displayPaid > 0) {
    statusStr   = "PARTIAL PAYMENT";
    statusColor = [217, 119, 6];
  }
  doc.setTextColor(...statusColor);
  doc.text(statusStr, rightValX, y + 10, { align: "right" });

  y += 18;

  // ── Divider ─────────────────────────────────────────────
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.line(COL_L, y, W - COL_L, y);
  y += 7;

  // ════════════════════════════════════════════════════════
  // 2. STAFF INFORMATION  (two-column grid)
  // ════════════════════════════════════════════════════════
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("STAFF INFORMATION", COL_L, y);
  y += 6;

  const wageLabel = staff.salaryType === "monthly" ? "Monthly Salary" : "Daily Wage";
  const wageValue = staff.salaryType === "monthly" ? (staff.monthlySalary || 0) : (staff.dailyWage || 0);

  const infoRows: [string, string, string, string][] = [
    ["Employee Name",  staff.name,                              "Role",         (staff.role || "STAFF").toUpperCase()],
    ["Phone Number",   staff.phone || "N/A",                   wageLabel,      pdfCurrency(wageValue)],
    ["Present Days",   `${attendanceStats.presentDays} / ${attendanceStats.workingDays}`, "Half Days", `${attendanceStats.halfDays}`],
    ["Leave Days",     `${attendanceStats.leaveDays}`,          "Absent Days",  `${attendanceStats.absentDays}`],
  ];

  doc.setFontSize(8.5);
  infoRows.forEach(([lL, vL, lR, vR]) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`${lL}:`, COL_L, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(vL, COL_L + 30, y);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`${lR}:`, W / 2, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(vR, W / 2 + 28, y);

    y += 6;
  });

  y += 3;

  // ── Divider ─────────────────────────────────────────────
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(COL_L, y, W - COL_L, y);
  y += 7;

  // ════════════════════════════════════════════════════════
  // 3. SALARY BREAKDOWN  (left half)   +  HISTORY (right half)
  // ════════════════════════════════════════════════════════
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("SALARY BREAKDOWN", COL_L, y);

  const breakdownTopY = y + 6;
  let ly = breakdownTopY; // left column y-tracker
  const LVAL = 103;       // right-align x for left col values

  const addLine = (
    label: string,
    value: string,
    color: [number, number, number] = [15, 23, 42],
    bold = false
  ) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(label, COL_L + 2, ly);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...color);
    doc.text(value, LVAL, ly, { align: "right" });
    ly += 6;
  };

  const drawDivider = () => {
    ly -= 1;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(COL_L + 2, ly, LVAL, ly);
    ly += 4;
  };

  // ── Generated Salary ────────────────────────────────────
  addLine("Generated Salary", pdfCurrency(generatedSalary));

  if (bonusAmount > 0) {
    addLine("Bonus", `+ ${pdfCurrency(bonusAmount)}`, [21, 128, 61]);
  }

  // Due: owner owes employee → ADDS to salary (green)
  if (prevDue > 0) {
    addLine("Previous Due", `+ ${pdfCurrency(prevDue)}`, [21, 128, 61]);
  }

  // Advance: employee owes owner → REDUCES salary (red)
  if (advDeduct > 0) {
    addLine("Advance Deduction", `- ${pdfCurrency(advDeduct)}`, [220, 38, 38]);
  }

  drawDivider();

  // ── Total Amount To Pay ─────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(37, 99, 235);
  doc.text("Total Amount To Pay", COL_L + 2, ly);
  doc.text(pdfCurrency(totalAmountToPay), LVAL, ly, { align: "right" });
  ly += 7;

  // ── Paid Amount ─────────────────────────────────────────
  if (displayPaid > 0) {
    addLine("Paid Amount", `- ${pdfCurrency(displayPaid)}`, [21, 128, 61]);
  }

  drawDivider();

  // ── Remaining Pending ───────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  if (displayRemaining <= 0) {
    doc.setTextColor(22, 163, 74);
    doc.text("Remaining Pending", COL_L + 2, ly);
    doc.text(pdfCurrency(0), LVAL, ly, { align: "right" });
  } else {
    doc.setTextColor(220, 38, 38);
    doc.text("Remaining Pending", COL_L + 2, ly);
    doc.text(pdfCurrency(displayRemaining), LVAL, ly, { align: "right" });
  }
  ly += 8;

  // ════════════════════════════════════════════════════════
  // 4. RIGHT COLUMN HISTORY SECTIONS
  // ════════════════════════════════════════════════════════
  let ry = breakdownTopY; // right column y-tracker
  const RX    = COL_R + 2;
  const RVAL  = W - COL_L;

  // ── Advance Adjustment ──────────────────────────────────
  const advances: LedgerEntry[] = ledgerEntries
    ? ledgerEntries.filter(e => e.type === "salary_advance")
    : [];

  if (advances.length > 0 || advDeduct > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("ADVANCE ADJUSTMENT", RX, ry);
    ry += 6;

    let totalAdvTaken = 0;
    doc.setFontSize(8.5);
    advances.forEach(adv => {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(formatDate(adv.date, "dd MMM yyyy"), RX, ry);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(pdfCurrency(adv.amount), RVAL, ry, { align: "right" });
      totalAdvTaken += adv.amount;
      ry += 5;
    });

    if (advances.length === 0 && advDeduct > 0) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text("Advance Taken", RX, ry);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(pdfCurrency(advDeduct), RVAL, ry, { align: "right" });
      totalAdvTaken = advDeduct;
      ry += 5;
    }

    // Draw mini divider
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(RX, ry, RVAL, ry);
    ry += 4;

    // Summary rows
    const advSummary: [string, string][] = [
      ["Total Advance:",    pdfCurrency(totalAdvTaken > 0 ? totalAdvTaken : advDeduct)],
      ["Advance Deducted:", pdfCurrency(advDeduct)],
      ["Remaining Advance:", pdfCurrency(Math.max(0, (totalAdvTaken || advDeduct) - advDeduct))],
    ];
    doc.setFontSize(8);
    advSummary.forEach(([label, val]) => {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(label, RX, ry);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(val, RVAL, ry, { align: "right" });
      ry += 5;
    });
    ry += 4;
  }

  // ── Pending / Due History ────────────────────────────────
  const dueEntries: LedgerEntry[] = ledgerEntries
    ? ledgerEntries.filter(e => e.type === "due_created")
    : [];

  if (prevDue > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("PENDING / DUE HISTORY", RX, ry);
    ry += 6;

    doc.setFontSize(8.5);
    if (dueEntries.length > 0) {
      dueEntries.slice(-4).forEach(due => {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(formatDate(due.date, "dd MMM yyyy"), RX, ry);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(21, 128, 61);
        doc.text(`+ ${pdfCurrency(due.amount)}`, RVAL, ry, { align: "right" });
        ry += 5;
      });
    } else {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text("Previous Month Due", RX, ry);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(21, 128, 61);
      doc.text(`+ ${pdfCurrency(prevDue)}`, RVAL, ry, { align: "right" });
      ry += 5;
    }

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(RX, ry, RVAL, ry);
    ry += 4;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Total Due Added:", RX, ry);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(21, 128, 61);
    doc.text(pdfCurrency(prevDue), RVAL, ry, { align: "right" });
    ry += 6;
  }

  // Vertical divider between left and right columns
  const colDividerY1 = breakdownTopY - 2;
  const colDividerY2 = Math.max(ly, ry) + 2;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(COL_R - 4, colDividerY1, COL_R - 4, colDividerY2);

  // ════════════════════════════════════════════════════════
  // 5. TRANSACTION HISTORY TABLE
  // ════════════════════════════════════════════════════════
  let tableStartY = Math.max(ly, ry) + 6;

  if (paymentsToShow && paymentsToShow.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("TRANSACTION HISTORY", COL_L, tableStartY);
    tableStartY += 4;

    const paymentBody = paymentsToShow.map(p => [
      formatDate(p.paymentDate, "dd MMM yyyy"),
      (p.paymentMethod || "cash").toUpperCase(),
      pdfCurrency(p.amountPaid),
      p.note || "Salary Payment",
    ]);

    autoTable(doc, {
      startY: tableStartY,
      head: [["Date", "Method", "Amount", "Note"]],
      body: paymentBody,
      theme: "grid",
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: "bold",
        fontSize: 8.5,
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      },
      bodyStyles: {
        fontSize: 8.5,
        textColor: [71, 85, 105],
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
        cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 25 },
        2: { cellWidth: 30, halign: "right" },
        3: { cellWidth: "auto" },
      },
      margin: { left: COL_L, right: COL_L },
    });
  }

  // ════════════════════════════════════════════════════════
  // 6. FOOTER WATERMARK (all pages)
  // ════════════════════════════════════════════════════════
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Top label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(226, 232, 240);
    doc.text("SALARY SLIP", W / 2, 8, { align: "center" });

    // Bottom watermark
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    doc.text("Developed by Zintrix Digital Technologies Pvt Ltd", W / 2, H - 8, { align: "center" });
  }

  doc.save(`Salary_Slip_${staff.name.replace(/\s+/g, "_")}_${monthStr}.pdf`);
}
