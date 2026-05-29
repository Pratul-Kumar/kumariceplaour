import {
  createPDFDocument, drawHeader, drawFooter,
  drawTable, drawSectionTitle, drawStatCards, pdfCurrency, COLORS,
} from "./pdfHelpers";
import { formatMonth } from "@/lib/utils";
import type { SalaryRecord, Staff } from "@/types";

export function generatePendingSalaryReport(records: SalaryRecord[], staffList: Staff[]) {
  const doc = createPDFDocument("Pending Salary Report", "p");
  let y = drawHeader(doc, "Pending Salaries Report");

  const pendingRecords = records.filter((r) => r.remainingDue > 0);
  const totalPending   = pendingRecords.reduce((sum, r) => sum + r.remainingDue, 0);
  const totalPaid      = pendingRecords.reduce((sum, r) => sum + r.totalPaid,    0);
  const totalBill      = pendingRecords.reduce((sum, r) => sum + r.finalSalary,  0);

  // ── Summary Stat Cards ───────────────────────────────────────────────────
  y = drawSectionTitle(doc, y, "Outstanding Summary");
  y = drawStatCards(doc, y, [
    { label: "Pending Cases",     value: pendingRecords.length.toString(), color: COLORS.danger },
    { label: "Total Bill",        value: pdfCurrency(totalBill),           color: COLORS.primary },
    { label: "Total Paid",        value: pdfCurrency(totalPaid),           color: COLORS.accent },
    { label: "Outstanding Dues",  value: pdfCurrency(totalPending),        color: COLORS.danger },
  ]);

  // ── Pending Records Table ────────────────────────────────────────────────
  y = drawSectionTitle(doc, y, "Pending Salary Details");

  if (pendingRecords.length === 0) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(...COLORS.light);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.2);
    doc.roundedRect(12, y, W - 24, 20, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.accent);
    doc.text("All salaries are cleared! Great job.", W / 2, y + 13, { align: "center" });
  } else {
    const body = pendingRecords.map((r) => {
      const staff       = staffList.find((s) => s.id === r.staffId);
      const totalPayable = r.finalSalary + (r.previousDue || 0);
      return [
        staff?.name || "Unknown",
        (staff?.role || "-").toUpperCase(),
        formatMonth(`${r.year}-${r.month.toString().padStart(2, "0")}`),
        pdfCurrency(totalPayable),
        pdfCurrency(r.totalPaid),
        pdfCurrency(r.remainingDue),
        r.status.toUpperCase(),
      ];
    });

    y = drawTable(
      doc, y,
      [["Staff Name", "Role", "Month", "Total Payable", "Paid", "Pending Due", "Status"]],
      body,
      "striped",
      {
        0: { cellWidth: 40 },
        1: { cellWidth: 28 },
        2: { cellWidth: 30 },
        3: { cellWidth: 32, halign: "right" },
        4: { cellWidth: 28, halign: "right" },
        5: { cellWidth: 28, halign: "right", fontStyle: "bold" },
        6: { cellWidth: 22, halign: "center" },
      }
    );
  }

  drawFooter(doc);
  doc.save("Pending_Salary_Report.pdf");
}
