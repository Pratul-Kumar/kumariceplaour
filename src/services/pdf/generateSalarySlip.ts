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

  // Y tracking
  let y = 15;

  // Compute values for specific payment transaction if selectedPaymentId is provided
  let currentPaid = record.totalPaid;
  let currentRemaining = record.remainingDue;
  let currentStatus = record.status;
  
  let paidThisTransaction = 0;
  let paidEarlier = 0;
  let isSelectedPayment = false;
  let paymentsToShow = payments;

  if (selectedPaymentId) {
    const sortedPayments = [...payments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const idx = sortedPayments.findIndex(p => p.id === selectedPaymentId);
    if (idx !== -1) {
      isSelectedPayment = true;
      paymentsToShow = sortedPayments.slice(0, idx + 1);
      paidThisTransaction = sortedPayments[idx].amountPaid;
      paidEarlier = sortedPayments.slice(0, idx).reduce((sum, p) => sum + p.amountPaid, 0);
      const totalDue = record.finalSalary + (record.previousDue || 0);
      const totalPaidUpTo = paidEarlier + paidThisTransaction;
      currentRemaining = Math.max(0, totalDue - totalPaidUpTo);
      currentPaid = totalPaidUpTo;
      currentStatus = currentRemaining <= 0 ? "paid" : "partial";
    }
  }

  // ─── 1. DIGITAL HEADER (Clean Minimal Financial Hierarchy) ─────────────
  // Left Column
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text("Kumar's Ice Parlour", 15, y);

  doc.setFont("helvetica", "medium");
  doc.setFontSize(9);
  doc.setTextColor(37, 99, 235); // primary blue
  doc.text("Payroll Salary Slip", 15, y + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text("Employee Name: ", 15, y + 10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(staff.name, 38, y + 10.5);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("Salary Type: ", 15, y + 14.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  const salaryTypeLabel = staff.salaryType === "monthly" ? "Monthly Salary" : "Daily Wages";
  doc.text(salaryTypeLabel, 38, y + 14.5);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("Phone/No: ", 15, y + 18.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(staff.phone || "N/A", 38, y + 18.5);

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

  // Payment Status Badge Setup
  let statusText = "Pending";
  if (currentStatus === "paid") {
    statusText = "Paid";
  } else if (currentStatus === "partial") {
    statusText = "Partially Paid";
  }

  const outstandingBefore = record.outstandingBefore || 0;
  const recoveredAmount = record.recoveredAmount ?? record.advance ?? 0;
  const outstandingAfter = record.outstandingAfter || 0;

  if (recoveredAmount > 0 && record.finalSalary === 0) {
    statusText = "Adjusted Against Advance";
  }

  let badgeBg: [number, number, number] = [254, 226, 226]; // red-100 (Pending)
  let badgeText: [number, number, number] = [185, 28, 28]; // red-700
  if (statusText === "Paid") {
    badgeBg = [220, 252, 231]; // emerald-100
    badgeText = [21, 128, 61]; // emerald-700
  } else if (statusText === "Partially Paid") {
    badgeBg = [254, 243, 199]; // amber-100
    badgeText = [180, 83, 9]; // amber-700
  } else if (statusText === "Adjusted Against Advance") {
    badgeBg = [239, 246, 255]; // blue-50
    badgeText = [29, 78, 216]; // blue-700
  }

  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("Payment Status:", W - 70, y + 10, { align: "left" });

  doc.setFillColor(...badgeBg);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  const badgeLabel = statusText.toUpperCase();
  const badgeW = doc.getTextWidth(badgeLabel) + 6;
  doc.roundedRect(W - 15 - badgeW, y + 7, badgeW, 4.5, 0.8, 0.8, "F");
  doc.setTextColor(...badgeText);
  doc.text(badgeLabel, W - 15 - badgeW + 3, y + 10.3);

  // ─── 2. EMPLOYEE DETAILS SECTION (Compact Grid Layout) ─────────────────
  y = 40;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.2);
  doc.roundedRect(15, y, W - 30, 14, 1, 1, "FD");

  // Col 1: Employee Name
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("EMPLOYEE NAME", 20, y + 4.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(staff.name, 20, y + 9.5);

  // Col 2: Role / Position
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("ROLE / POSITION", 75, y + 4.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text((staff.role || "Staff").toUpperCase(), 75, y + 9.5);

  // Col 3: Phone Number
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("PHONE NUMBER", 120, y + 4.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(staff.phone || "N/A", 120, y + 9.5);

  // Col 4: Salary Period
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("SALARY PERIOD", 165, y + 4.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(monthLabel, 165, y + 9.5);

  // ─── 3. ATTENDANCE SUMMARY (Compact Attendance Cards) ─────────────────
  y = 60;
  const cardW = 88;
  const cardH = 12;
  const gap = 4;

  // Card 1: Present Days (Emerald theme)
  doc.setFillColor(240, 253, 250); // emerald-50
  doc.setDrawColor(204, 251, 241); // emerald-100
  doc.setLineWidth(0.2);
  doc.roundedRect(15, y, cardW, cardH, 1, 1, "FD");

  doc.setFont("helvetica", "medium");
  doc.setFontSize(7.5);
  doc.setTextColor(13, 148, 136); // emerald-600
  doc.text("Present Days", 20, y + 7.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(attendanceStats.presentDays.toString(), 15 + cardW - 12, y + 8.5, { align: "right" });

  // Card 2: Half Days (Amber theme)
  doc.setFillColor(255, 251, 235); // amber-50
  doc.setDrawColor(254, 243, 199); // amber-100
  doc.roundedRect(15 + cardW + gap, y, cardW, cardH, 1, 1, "FD");

  doc.setFont("helvetica", "medium");
  doc.setFontSize(7.5);
  doc.setTextColor(217, 119, 6); // amber-600
  doc.text("Half Days", 15 + cardW + gap + 5, y + 7.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(attendanceStats.halfDays.toString(), W - 20, y + 8.5, { align: "right" });

  // ─── 4. SALARY CALCULATION SECTION (Clear Payroll Math) ────────────────
  y = 78;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(37, 99, 235); // primary blue
  doc.text("SALARY CALCULATION", 15, y);

  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.3);
  doc.line(15, y + 1.5, W - 15, y + 1.5);

  y = y + 7;

  const rateLabel = staff.salaryType === "monthly" ? "Monthly Wages" : "Daily Wages";
  const rateValue = staff.salaryType === "monthly" 
    ? `${pdfCurrency(staff.monthlySalary)}/month` 
    : `${pdfCurrency(staff.dailyWage)}/day`;

  const daysLabel = "Present Days";
  const daysValue = `${attendanceStats.presentDays}`;

  const earnedLabel = "Monthly Earned Salary";
  const earnedValue = `${pdfCurrency(record.baseSalary)}`;

  // Rate line
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(rateLabel, 17, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(rateValue, 85, y, { align: "right" });

  // Days count line
  y = y + 5;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text(daysLabel, 17, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(daysValue, 85, y, { align: "right" });

  // Monthly Earned Salary line
  y = y + 5;
  doc.setFont("helvetica", "semibold");
  doc.setTextColor(71, 85, 105);
  doc.text(earnedLabel, 17, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(37, 99, 235); // blue-600
  doc.text(earnedValue, 85, y, { align: "right" });

  // ─── 5. ADVANCE & RECOVERY SECTION (Conditional) ──────────────────────
  const hasAdvance = outstandingBefore > 0 || recoveredAmount > 0 || outstandingAfter > 0;
  if (hasAdvance) {
    y = y + 9;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(217, 119, 6); // amber-600
    doc.text("ADVANCE & RECOVERY", 15, y);

    doc.setDrawColor(254, 243, 199); // amber-100
    doc.setLineWidth(0.3);
    doc.line(15, y + 1.5, W - 15, y + 1.5);

    y = y + 5;
    // Compact recovery summary box
    doc.setFillColor(255, 251, 235); // amber-50
    doc.setDrawColor(253, 230, 138); // amber-200
    doc.setLineWidth(0.2);
    doc.roundedRect(15, y, W - 30, 14, 1, 1, "FD");

    // Previous Outstanding Advance
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(180, 83, 9); // amber-700
    doc.text("Outstanding Before", 20, y + 4.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(pdfCurrency(outstandingBefore), 20, y + 9.5);

    // Advance Recovered This Month
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(180, 83, 9);
    doc.text("Recovered This Month", 75, y + 4.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(220, 38, 38); // red-600
    doc.text(`-${pdfCurrency(recoveredAmount)}`, 75, y + 9.5);

    // Remaining Outstanding Advance
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(180, 83, 9);
    doc.text("Remaining Outstanding", 130, y + 4.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(pdfCurrency(outstandingAfter), 130, y + 9.5);

    y = y + 14;
  }

  // ─── 6. FINAL PAYOUT SUMMARY (Equation + Highlight Cards) ──────────────
  y = y + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text("FINAL PAYOUT SUMMARY", 15, y);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(15, y + 1.5, W - 15, y + 1.5);

  y = y + 7;

  const formulaYStart = y;
  let fy = formulaYStart;

  // Monthly Earned Salary
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text("Monthly Earned Salary", 17, fy);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(pdfCurrency(record.baseSalary), 100, fy, { align: "right" });

  // + Bonus
  fy = fy + 5;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text("+ Bonus", 17, fy);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(21, 128, 61); // emerald-700
  doc.text(`+ ${pdfCurrency(record.bonus)}`, 100, fy, { align: "right" });

  // - Advance Recovery
  fy = fy + 5;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text("- Advance Recovery", 17, fy);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(220, 38, 38); // red-600
  doc.text(`- ${pdfCurrency(recoveredAmount)}`, 100, fy, { align: "right" });

  // - Other Deductions
  fy = fy + 5;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text("- Other Deductions", 17, fy);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(220, 38, 38);
  const otherDeductions = (record.extraDeduction || 0) + (record.leaveDeduction || 0);
  doc.text(`- ${pdfCurrency(otherDeductions)}`, 100, fy, { align: "right" });

  // Divider line
  fy = fy + 2.5;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(15, fy, 105, fy);

  // = Net Salary Payable
  fy = fy + 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text("= Net Salary Payable", 17, fy);
  doc.setTextColor(37, 99, 235); // primary blue
  doc.text(pdfCurrency(record.finalSalary), 100, fy, { align: "right" });

  // Payout math rendering
  if (selectedPaymentId && isSelectedPayment) {
    // - Paid Earlier
    if (paidEarlier > 0) {
      fy = fy + 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text("- Paid Earlier", 17, fy);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(21, 128, 61); // emerald-700
      doc.text(`- ${pdfCurrency(paidEarlier)}`, 100, fy, { align: "right" });
    }

    // - Paid This Transaction
    fy = fy + 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text("- Paid This Transaction", 17, fy);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(21, 128, 61); // emerald-700
    doc.text(`- ${pdfCurrency(paidThisTransaction)}`, 100, fy, { align: "right" });

    // Divider line
    fy = fy + 2.5;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(15, fy, 105, fy);

    // = Remaining Due / Remaining Due After Payment
    fy = fy + 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    const remainingLabelText = currentRemaining <= 0 ? "= Remaining Due" : "= Remaining Due After Payment";
    doc.text(remainingLabelText, 17, fy);
    doc.setTextColor(currentRemaining <= 0 ? 21 : 220, currentRemaining <= 0 ? 128 : 38, currentRemaining <= 0 ? 61 : 38);
    doc.text(pdfCurrency(currentRemaining), 100, fy, { align: "right" });
  } else {
    // - Paid Till Date
    fy = fy + 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text("- Paid Till Date", 17, fy);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(21, 128, 61); // emerald-700
    doc.text(`- ${pdfCurrency(record.totalPaid)}`, 100, fy, { align: "right" });

    // Divider line
    fy = fy + 2.5;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(15, fy, 105, fy);

    // = Remaining Salary Due
    fy = fy + 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text("= Remaining Salary Due", 17, fy);
    doc.setTextColor(220, 38, 38); // red-600
    doc.text(pdfCurrency(record.remainingDue), 100, fy, { align: "right" });

    // = Current Payable Amount
    fy = fy + 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("= Current Payable Amount", 17, fy);
    doc.setTextColor(220, 38, 38); // red-600
    doc.text(pdfCurrency(record.remainingDue), 100, fy, { align: "right" });
  }

  // Side Highlight Cards (Already Paid & Remaining To Pay)
  let ry = formulaYStart - 2;

  // Already Paid Card
  doc.setFillColor(240, 253, 250); // emerald-50
  doc.setDrawColor(204, 251, 241); // emerald-100
  doc.roundedRect(115, ry, W - 115 - 15, 12, 1, 1, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(13, 148, 136); // emerald-600
  doc.text("PAID TILL DATE", 120, ry + 4.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(21, 128, 61); // emerald-700
  doc.text(pdfCurrency(currentPaid), 120, ry + 9.5);

  // Remaining To Pay Card
  const isRemainingZero = currentRemaining <= 0;
  const remainingBg: [number, number, number] = isRemainingZero ? [240, 253, 250] : [254, 242, 242]; // red-50
  const remainingBorder: [number, number, number] = isRemainingZero ? [204, 251, 241] : [254, 226, 226]; // red-100
  const remainingTextColor: [number, number, number] = isRemainingZero ? [21, 128, 61] : [220, 38, 38]; // red-600

  ry = ry + 15;
  doc.setFillColor(...remainingBg);
  doc.setDrawColor(...remainingBorder);
  doc.roundedRect(115, ry, W - 115 - 15, 12, 1, 1, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const tc: [number, number, number] = isRemainingZero ? [13, 148, 136] : [185, 28, 28];
  doc.setTextColor(...tc);
  doc.text("REMAINING SALARY DUE", 120, ry + 4.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...remainingTextColor);
  doc.text(pdfCurrency(currentRemaining), 120, ry + 9.5);

  y = Math.max(fy, ry + 12);

  // ─── 7. TRANSACTION HISTORY (Compact Striped Table) ───────────────────
  if (paymentsToShow && paymentsToShow.length > 0) {
    y = y + 10;
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
      head: [["Payment Date", "Method", "Amount Paid", "Note"]],
      body: paymentBody,
      theme: "plain",
      headStyles: {
        fillColor: [37, 99, 235], // primary blue
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
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      styles: {
        font: "helvetica",
      },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 30 },
        2: { cellWidth: 35, halign: "right" },
        3: { cellWidth: "auto" },
      },
      margin: { left: 15, right: 15 },
    });

    // @ts-ignore
    y = (doc.lastAutoTable?.finalY ?? y) + 8;
  }

  // ─── 8. DIGITAL FOOTER ────────────────────────────────────────────────
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(15, H - 14, W - 15, H - 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text("Generated digitally by Kumar Ice Parlour", 15, H - 9.5);

  const brandText = "Powered by Zintrix Digital Technologies Pvt Ltd  |  https://zintrixtechnologies.com";
  const brandW = doc.getTextWidth(brandText);
  doc.textWithLink(brandText, W - 15 - brandW, H - 9.5, { url: "https://zintrixtechnologies.com" });

  doc.save(`Salary_Slip_${staff.name.replace(/\s+/g, "_")}_${monthStr}.pdf`);
}
