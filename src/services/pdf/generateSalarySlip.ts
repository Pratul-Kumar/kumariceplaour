import { createPDFDocument, pdfCurrency } from "./pdfHelpers";
import { formatDate, formatMonth } from "@/lib/utils";
import { type SalaryRecord, type Staff, type SalaryPayment, type LedgerEntry, calculateUnifiedSalary } from "@/types";
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

  // Fetch monthly dues and calculate totals live from Firestore
  let monthlyDues: any[] = [];
  let allDues: any[] = [];
  try {
    const { collection, query, where, getDocs } = await import("firebase/firestore");
    const { db } = await import("@/firebase/config");
    const duesCol = collection(db, "dues");
    const duesSnap = await getDocs(query(duesCol, where("staffId", "==", staff.id!)));
    
    allDues = duesSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter(d => !d.isDeleted);
  } catch (err) {
    console.error("[generateSalarySlip] Failed to fetch dues:", err);
  }

  // Filter dues created before or during this salary record's creation
  const duesBeforeSalary = allDues.filter(d => d.createdAt <= record.createdAt);

  // Divide them into category lists (resetting to original amount to simulate matching/recovery)
  const advancesList = duesBeforeSalary
    .filter(d => (d.category === "advance" || (!d.category && d.type === "EMPLOYEE_TO_OWNER")) && d.category !== "givetake")
    .map(d => ({ ...d, remainingAmount: d.amount }));

  const duesList = duesBeforeSalary
    .filter(d => (d.category === "due" || (!d.category && d.type === "OWNER_TO_EMPLOYEE")) && d.category !== "givetake" && !d.linkedSalaryId)
    .map(d => ({ ...d, remainingAmount: d.amount }));

  const giveMoneysList = duesBeforeSalary
    .filter(d => d.category === "givetake" && d.type === "EMPLOYEE_TO_OWNER")
    .map(d => ({ ...d, remainingAmount: d.amount }));

  const takeMoneysList = duesBeforeSalary
    .filter(d => d.category === "givetake" && d.type === "OWNER_TO_EMPLOYEE")
    .map(d => ({ ...d, remainingAmount: d.amount }));

  // Simulate Give/Take Money chronological settlement
  const sortedTakeMoneys = [...takeMoneysList].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const sortedGiveMoneys = [...giveMoneysList].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const take of sortedTakeMoneys) {
    let remainingTake = take.amount;
    for (const give of sortedGiveMoneys) {
      if (remainingTake <= 0) break;
      if (give.remainingAmount > 0) {
        const deduct = Math.min(remainingTake, give.remainingAmount);
        give.remainingAmount -= deduct;
        remainingTake -= deduct;
      }
    }
  }

  // Calculate live available balances before salary recovery
  const availableAdvance = advancesList.reduce((sum, d) => sum + d.remainingAmount, 0);
  const availableDue = duesList.reduce((sum, d) => sum + d.remainingAmount, 0);

  // Recalculate salary breakdown
  const generatedSalary  = record.grossSalary || record.finalSalary || record.baseSalary || 0;
  const bonusAmount      = record.bonus       || 0;
  const prevDue          = availableDue;
  const grossPayable     = generatedSalary + bonusAmount + prevDue;

  // Simulate recovery of advances
  let remainingGrossForAdv = grossPayable;
  let advDeduct = 0;
  const sortedAdvances = [...advancesList].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const advancesDeductedList: any[] = [];

  for (const adv of sortedAdvances) {
    if (remainingGrossForAdv <= 0) break;
    const deduct = Math.min(remainingGrossForAdv, adv.remainingAmount);
    if (deduct > 0) {
      adv.remainingAmount -= deduct;
      advDeduct += deduct;
      remainingGrossForAdv -= deduct;
      advancesDeductedList.push({
        ...adv,
        deductedAmount: deduct
      });
    }
  }

  // Calculate Give Money amount (using either record fields or live dues list)
  const giveMoneyAmount = record.giveMoneyDeducted || record.giveMoneyAdded || giveMoneysList.reduce((sum, d) => sum + d.remainingAmount, 0);

  const unified = calculateUnifiedSalary({
    generatedSalary: generatedSalary + bonusAmount,
    previousDue: prevDue,
    advanceDeduction: advDeduct,
    giveMoneyAmount: giveMoneyAmount,
    deductGiveMoney: !!record.deductGiveMoney
  });

  const finalPayable     = unified.finalPayable;
  const giveMoneyDeduct  = unified.giveMoneyDeducted;
  const giveMoneyAdded   = unified.giveMoneyAdded;
  const totalAmountToPay = finalPayable;

  let currentPaid      = payments.reduce((sum, p) => sum + p.amountPaid, 0);
  let paymentsToShow   = payments;

  if (selectedPaymentId) {
    const sorted = [...payments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const idx    = sorted.findIndex(p => p.id === selectedPaymentId);
    if (idx !== -1) {
      paymentsToShow        = sorted.slice(0, idx + 1);
      const paidEarlier     = sorted.slice(0, idx).reduce((s, p) => s + p.amountPaid, 0);
      const paidThisTx      = sorted[idx].amountPaid;
      currentPaid           = paidEarlier + paidThisTx;
    }
  }

  let currentRemaining = Math.max(0, totalAmountToPay - currentPaid);

  // Use recalculated displays
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
  if (displayRemaining <= 0) {
    statusStr   = "FULLY PAID";
    statusColor = [22, 163, 74];
  } else if (displayPaid > 0) {
    statusStr   = "PARTIAL PAID";
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

  if (giveMoneyAdded > 0) {
    addLine("Extra Money Added", `+ ${pdfCurrency(giveMoneyAdded)}`, [21, 128, 61]);
  }

  drawDivider();

  // ── Gross Payable ───────────────────────────────────────
  addLine("Gross Payable", pdfCurrency(grossPayable + (record.deductGiveMoney ? 0 : giveMoneyAdded)), [15, 23, 42], true);
  ly += 1;

  // Advance: employee owes owner → REDUCES salary (red)
  if (advDeduct > 0) {
    addLine("Advance Deduction", `- ${pdfCurrency(advDeduct)}`, [220, 38, 38]);
  }

  // Give Money: extra money given to employee → REDUCES salary (red)
  if (giveMoneyDeduct > 0) {
    addLine("Money Deducted", `- ${pdfCurrency(giveMoneyDeduct)}`, [220, 38, 38]);
  }

  drawDivider();

  // ── Final Payable ───────────────────────────────────────
  addLine("Final Payable", pdfCurrency(finalPayable), [37, 99, 235], true);
  ly += 1;

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
  if (advancesDeductedList.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("ADVANCE ADJUSTMENT", RX, ry);
    ry += 6;

    let totalAdvTaken = 0;
    doc.setFontSize(8.5);
    advancesDeductedList.forEach(adv => {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(formatDate(adv.date || adv.createdAt, "dd MMM yyyy"), RX, ry);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(pdfCurrency(adv.amount), RVAL, ry, { align: "right" });
      totalAdvTaken += adv.amount;
      ry += 5;
    });

    // Draw mini divider
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(RX, ry, RVAL, ry);
    ry += 4;

    // Summary rows
    const advSummary: [string, string][] = [
      ["Total Advance:",    pdfCurrency(totalAdvTaken)],
      ["Advance Deducted:", pdfCurrency(advDeduct)],
      ["Remaining Advance:", pdfCurrency(Math.max(0, totalAdvTaken - advDeduct))],
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
  if (duesList.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("PENDING / DUE HISTORY", RX, ry);
    ry += 6;

    doc.setFontSize(8.5);
    duesList.forEach(due => {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(formatDate(due.date || due.createdAt, "dd MMM yyyy"), RX, ry);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(21, 128, 61);
      doc.text(`+ ${pdfCurrency(due.amount)}`, RVAL, ry, { align: "right" });
      ry += 5;
    });

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

  // ── Extra Money History ──────────────────────────────────
  monthlyDues = duesBeforeSalary;
  const extraMoneyEntries = monthlyDues.filter(d => {
    if (d.category !== "givetake") return false;
    if (record.giveMoneyIds && record.giveMoneyIds.length > 0) {
      return record.giveMoneyIds.includes(d.id);
    }
    return true;
  });

  if (extraMoneyEntries.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("EXTRA MONEY HISTORY", RX, ry);
    ry += 6;

    extraMoneyEntries.forEach(entry => {
      const isGive = entry.type === "EMPLOYEE_TO_OWNER";
      const amtStr = `${isGive ? "+" : "-"} ${pdfCurrency(entry.amount)}`;
      const color: [number, number, number] = isGive ? [147, 51, 234] : [219, 39, 119];
      
      // Date
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(formatDate(entry.date || entry.createdAt, "dd MMM yyyy"), RX, ry);
      
      // Amount
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...color);
      doc.text(amtStr, RVAL, ry, { align: "right" });
      ry += 4.5;

      // Notes / Reason
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(entry.notes || (isGive ? "Give Money" : "Take Money"), RX, ry);
      ry += 4.5;

      // Method & Status
      const methodStr = entry.paymentMethod ? `Method: ${entry.paymentMethod.toUpperCase()}` : "Method: N/A";
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(methodStr, RX, ry);

      const statusText = record.deductGiveMoney ? "Status: Deducted From Salary" : "Status: Added Into Salary";
      doc.setFont("helvetica", "bold");
      doc.text(statusText, RVAL, ry, { align: "right" });
      ry += 7;
    });

    // Draw mini divider
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(RX, ry, RVAL, ry);
    ry += 4;

    if (record.deductGiveMoney) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("Money Deducted:", RX, ry);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(220, 38, 38);
      doc.text(pdfCurrency(giveMoneyDeduct), RVAL, ry, { align: "right" });
      ry += 6;
    }
  }

  // Vertical divider between left and right columns (only if right column has content)
  if (ry > breakdownTopY) {
    const colDividerY1 = breakdownTopY - 2;
    const colDividerY2 = Math.max(ly, ry) + 2;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(COL_R - 4, colDividerY1, COL_R - 4, colDividerY2);
  }

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
