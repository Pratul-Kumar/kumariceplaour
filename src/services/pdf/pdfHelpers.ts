import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate } from "@/lib/utils";
import { LOGO_BASE64 } from "../../lib/logoBase64";

// ─── Business Details ────────────────────────────────────────────────────────
export const SHOP_DETAILS = {
  name: "Kumar's Ice Parlour",
  tagline: "Ice Creams | Cakes | Shakes | Sweets",
  address: "Nagar Palika Chowk, Chapra",
  phone: "+91 70040 13495",
  gst: "",
};

// ─── Design Tokens ───────────────────────────────────────────────────────────
export const COLORS = {
  primary:     [37,  99,  235] as [number,number,number],   // blue-600
  primaryDark: [29,  78,  216] as [number,number,number],   // blue-700
  primaryLight:[219,234,254] as [number,number,number],     // blue-100
  accent:      [16,  185, 129] as [number,number,number],   // emerald-500
  danger:      [220,  38,  38] as [number,number,number],   // red-600
  warning:     [245, 158,  11] as [number,number,number],   // amber-500
  dark:        [15,  23,  42]  as [number,number,number],   // slate-900
  mid:         [51,  65,  85]  as [number,number,number],   // slate-700
  muted:       [100, 116, 139] as [number,number,number],   // slate-500
  light:       [241, 245, 249] as [number,number,number],   // slate-100
  white:       [255, 255, 255] as [number,number,number],
  border:      [203, 213, 225] as [number,number,number],   // slate-300
  rowAlt:      [248, 250, 252] as [number,number,number],   // slate-50
};

// ─── Currency Formatter (ASCII-safe for jsPDF built-in fonts) ────────────────
export function pdfCurrency(amount?: number | null): string {
  const val = amount || 0;
  const formatted = Math.abs(val).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return val < 0 ? `Rs. -${formatted}` : `Rs. ${formatted}`;
}

// ─── PDF Document Factory ────────────────────────────────────────────────────
export function createPDFDocument(title: string, orientation: "p" | "l" = "p") {
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
  doc.setProperties({
    title,
    subject: "Kumar Ice Parlour - Business Document",
    author: SHOP_DETAILS.name,
    creator: "Kumar Ice Parlour Manager",
  });
  return doc;
}

// ─── Header ──────────────────────────────────────────────────────────────────
export function drawHeader(doc: jsPDF, title: string, subtitle?: string): number {
  const W = doc.internal.pageSize.getWidth();
  const HEADER_H = 52;

  // Gradient-style background (two rect layers)
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, W, HEADER_H, "F");

  // Accent stripe at bottom of header
  doc.setFillColor(...COLORS.primaryDark);
  doc.rect(0, HEADER_H - 4, W, 4, "F");

  // Logo (left-aligned, vertically centred in header)
  try {
    doc.addImage(LOGO_BASE64, "PNG", 10, 6, 38, 38);
  } catch {
    // silently skip if logo fails
  }

  // Shop name (right of logo)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.white);
  doc.text(SHOP_DETAILS.name, 54, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(186, 214, 254); // blue-200
  doc.text(SHOP_DETAILS.tagline, 54, 25);

  doc.setFontSize(8);
  doc.setTextColor(186, 214, 254);
  doc.text(`${SHOP_DETAILS.address}  |  Ph: ${SHOP_DETAILS.phone}`, 54, 32);
  if (SHOP_DETAILS.gst) {
    doc.text(`GST: ${SHOP_DETAILS.gst}`, 54, 38);
  }

  // Document title (right-aligned in header)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.white);
  doc.text(title.toUpperCase(), W - 12, 20, { align: "right" });

  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(186, 214, 254);
    doc.text(subtitle, W - 12, 28, { align: "right" });
  }

  // Generated date (top-right corner badge)
  const now = formatDate(new Date().toISOString(), "dd MMM yyyy");
  doc.setFontSize(7);
  doc.setTextColor(186, 214, 254);
  doc.text(`Generated: ${now}`, W - 12, 36, { align: "right" });

  return HEADER_H + 6; // first usable Y below header
}

// ─── Footer ──────────────────────────────────────────────────────────────────
export function drawFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Thin top border line
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(10, H - 16, W - 10, H - 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);

    doc.text(SHOP_DETAILS.name, 12, H - 11);
    doc.text(
      `Page ${i} of ${pageCount}  |  ${formatDate(new Date().toISOString(), "dd MMM yyyy, hh:mm a")}`,
      W / 2,
      H - 11,
      { align: "center" }
    );
    doc.text("Confidential", W - 12, H - 11, { align: "right" });

    // Center branding footer watermark
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(156, 163, 175); // subtle gray color (gray-400)

    const brandText1 = "Powered by Zintrix Digital Technologies Pvt Ltd";
    const brandText2 = "https://zintrixtechnologies.com";
    const url = "https://zintrixtechnologies.com";

    const w1 = doc.getTextWidth(brandText1);
    doc.textWithLink(brandText1, (W - w1) / 2, H - 7, { url });

    const w2 = doc.getTextWidth(brandText2);
    doc.textWithLink(brandText2, (W - w2) / 2, H - 3.5, { url });
  }
}

// ─── Info Box (key-value pair row) ───────────────────────────────────────────
export function drawInfoGrid(
  doc: jsPDF,
  startY: number,
  items: { label: string; value: string }[],
  columns = 2
): number {
  const W = doc.internal.pageSize.getWidth();
  const margin = 12;
  const colW = (W - margin * 2) / columns;
  const rowH = 9;
  const boxPad = 3;

  // Background card
  const rows = Math.ceil(items.length / columns);
  const boxH = rows * rowH + boxPad * 2;
  doc.setFillColor(...COLORS.light);
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, startY, W - margin * 2, boxH, 2, 2, "FD");

  let x = margin + boxPad;
  let y = startY + boxPad + 5;

  items.forEach((item, idx) => {
    const col = idx % columns;
    const row = Math.floor(idx / columns);

    const cx = margin + boxPad + col * colW;
    const cy = startY + boxPad + 5 + row * rowH;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.muted);
    doc.text(item.label.toUpperCase(), cx, cy);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.dark);
    doc.text(item.value, cx, cy + 4.5);
  });

  return startY + boxH + 5;
}

// ─── Section Title ───────────────────────────────────────────────────────────
export function drawSectionTitle(doc: jsPDF, y: number, title: string): number {
  const W = doc.internal.pageSize.getWidth();
  const margin = 12;

  doc.setFillColor(...COLORS.primaryLight);
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.4);
  doc.rect(margin, y, W - margin * 2, 8, "FD");

  // Left accent bar
  doc.setFillColor(...COLORS.primary);
  doc.rect(margin, y, 3, 8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.primaryDark);
  doc.text(title.toUpperCase(), margin + 7, y + 5.5);

  return y + 12;
}

// ─── Stat Cards Row ──────────────────────────────────────────────────────────
export function drawStatCards(
  doc: jsPDF,
  startY: number,
  cards: { label: string; value: string; color?: [number,number,number] }[]
): number {
  const W = doc.internal.pageSize.getWidth();
  const margin = 12;
  const gap = 4;
  const cardW = (W - margin * 2 - gap * (cards.length - 1)) / cards.length;
  const cardH = 20;

  cards.forEach((card, i) => {
    const x = margin + i * (cardW + gap);
    const color = card.color ?? COLORS.primary;

    doc.setFillColor(...COLORS.white);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, startY, cardW, cardH, 2, 2, "FD");

    // Top colour bar
    doc.setFillColor(...color);
    doc.roundedRect(x, startY, cardW, 3, 2, 2, "F");
    doc.rect(x, startY + 1, cardW, 2, "F"); // remove bottom radius from bar

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text(card.label.toUpperCase(), x + cardW / 2, startY + 9, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.dark);
    doc.text(card.value, x + cardW / 2, startY + 16, { align: "center" });
  });

  return startY + cardH + 6;
}

// ─── Table ───────────────────────────────────────────────────────────────────
export function drawTable(
  doc: jsPDF,
  startY: number,
  head: string[][],
  body: (string | number)[][],
  theme: "grid" | "striped" | "plain" = "striped",
  columnStyles?: Record<number, object>
): number {
  autoTable(doc, {
    startY,
    head,
    body,
    theme: "plain",
    headStyles: {
      fillColor: COLORS.primary,
      textColor: COLORS.white,
      fontStyle: "bold",
      fontSize: 8.5,
      cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
      lineColor: COLORS.primaryDark,
      lineWidth: 0,
    },
    bodyStyles: {
      fontSize: 8.5,
      cellPadding: { top: 3.5, bottom: 3.5, left: 5, right: 5 },
      textColor: COLORS.mid,
      lineColor: COLORS.border,
      lineWidth: 0.15,
    },
    alternateRowStyles: {
      fillColor: COLORS.rowAlt,
    },
    styles: {
      font: "helvetica",
      overflow: "linebreak",
      valign: "middle",
    },
    columnStyles: columnStyles ?? {},
    margin: { top: 10, right: 12, bottom: 18, left: 12 },
    tableLineColor: COLORS.border,
    tableLineWidth: 0.15,
    showHead: "everyPage",
    rowPageBreak: "avoid",
  });

  // @ts-ignore
  return (doc.lastAutoTable?.finalY ?? startY) + 8;
}

// ─── Signatures ───────────────────────────────────────────────────────────────
export function drawSignatures(
  doc: jsPDF,
  startY: number,
  labels: string[] = ["Authorized Signatory", "Employee Signature"]
): number {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 20;
  const signLineW = 55;

  // Push to new page if not enough space
  if (H - startY < 38) {
    doc.addPage();
    startY = 20;
  }

  const sigY = startY + 22;

  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.5);

  if (labels.length === 2) {
    doc.line(margin, sigY, margin + signLineW, sigY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text(labels[0], margin + signLineW / 2, sigY + 5, { align: "center" });

    const rx = W - margin - signLineW;
    doc.line(rx, sigY, rx + signLineW, sigY);
    doc.text(labels[1], rx + signLineW / 2, sigY + 5, { align: "center" });
  } else {
    const rx = W - margin - signLineW;
    doc.line(rx, sigY, rx + signLineW, sigY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text(labels[0], rx + signLineW / 2, sigY + 5, { align: "center" });
  }

  return sigY + 10;
}
