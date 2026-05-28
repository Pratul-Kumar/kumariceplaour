import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrency, formatDate } from "@/lib/utils";

import { LOGO_BASE64 } from "../../lib/logoBase64";

export const SHOP_DETAILS = {
  name: "Kumar's Ice Parlour",
  address: "Nagar Palika Chowk, Chapra",
  phone: "+91 70040 13495",
  gst: "", // Optional
};

export function createPDFDocument(title: string, orientation: "p" | "l" = "p") {
  const doc = new jsPDF(orientation, "mm", "a4");
  doc.setProperties({ title });
  return doc;
}

export function drawHeader(doc: jsPDF, title: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Background for header
  doc.setFillColor(255, 240, 245); // Light pink background
  doc.rect(0, 0, pageWidth, 60, "F");

  // Logo
  const logoWidth = 24;
  const logoHeight = 24;
  doc.addImage(LOGO_BASE64, "PNG", pageWidth / 2 - logoWidth / 2, 4, logoWidth, logoHeight);

  // Shop Name (Moved down to accommodate logo)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(225, 29, 72); // Rose 600
  doc.text(SHOP_DETAILS.name, pageWidth / 2, 34, { align: "center" });

  // Shop Details
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105); // Slate 600
  doc.text(`${SHOP_DETAILS.address} | Ph: ${SHOP_DETAILS.phone}`, pageWidth / 2, 41, { align: "center" });
  if (SHOP_DETAILS.gst) {
    doc.text(`GST: ${SHOP_DETAILS.gst}`, pageWidth / 2, 47, { align: "center" });
  }

  // Document Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42); // Slate 900
  doc.text(title.toUpperCase(), pageWidth / 2, 54, { align: "center" });

  return 60; // Return current Y position
}

export function drawFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // Slate 400
    doc.text(
      `Generated on ${formatDate(new Date().toISOString(), "dd MMM yyyy, hh:mm a")} - Page ${i} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: "center" }
    );
  }
}

export function drawSignatures(doc: jsPDF, startY: number, labels: string[] = ["Authorized Signatory", "Employee Signature"]) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const availableY = doc.internal.pageSize.getHeight() - startY;
  let currentY = startY + 30; // 30mm space for signature

  if (availableY < 40) {
    doc.addPage();
    currentY = 40;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);

  const margin = 20;
  
  if (labels.length === 2) {
    // Left signature
    doc.line(margin, currentY, margin + 50, currentY);
    doc.text(labels[0], margin + 25, currentY + 5, { align: "center" });
    
    // Right signature
    doc.line(pageWidth - margin - 50, currentY, pageWidth - margin, currentY);
    doc.text(labels[1], pageWidth - margin - 25, currentY + 5, { align: "center" });
  } else {
    // Single signature on right
    doc.line(pageWidth - margin - 50, currentY, pageWidth - margin, currentY);
    doc.text(labels[0], pageWidth - margin - 25, currentY + 5, { align: "center" });
  }

  return currentY + 10;
}

export function drawTable(doc: jsPDF, startY: number, head: string[][], body: (string|number)[][], theme: "grid" | "striped" | "plain" = "striped") {
  autoTable(doc, {
    startY,
    head,
    body,
    theme,
    headStyles: { fillColor: [225, 29, 72], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 4 },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    margin: { top: 15, right: 15, bottom: 20, left: 15 },
  });
  
  // @ts-ignore - autoTable attaches lastAutoTable to doc
  return doc.lastAutoTable.finalY + 10;
}
