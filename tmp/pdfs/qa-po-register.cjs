// tmp/pdfs/qa-po-register.ts
var import_node_fs = require("node:fs");

// src/lib/poRegisterPdf.ts
var import_jspdf = require("jspdf");
var import_jspdf_autotable = require("jspdf-autotable");

// src/Assets/3f-logo.png
var f_logo_default = "data:image/png;base64,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";

// src/lib/dateFormat.ts
var pad = (value) => String(value).padStart(2, "0");
var parseDateInput = (value) => {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
    if (dateOnly && !value.includes("T")) {
      const [, year, month, day] = dateOnly;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
var formatDateDDMMYYYY = (value, fallback = "\u2014") => {
  const date = parseDateInput(value);
  if (!date) return fallback;
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
};

// src/lib/poRegisterPdf.ts
var COMPANY_NAME = "SAI BIORESOURCES PRIVATE LIMITED";
var COMPANY_ADDRESS = "Khasra No. 121/1, Amrit Dairy Farm, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh - 491001";
var COMPANY_DETAILS = "GSTIN: 22ARPCS5442R1ZM  |  Phone: +91 75870 76870  |  Email: rajendra.s@saiobioenergy.com";
var PROJECT_GREEN = [13, 58, 53];
var LIGHT_SLATE = [241, 245, 249];
var GRID_SLATE = [203, 213, 225];
var TEXT_SLATE = [51, 65, 85];
var MUTED_SLATE = [100, 116, 139];
var formatNumber = (value) => new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(Number.isFinite(value) ? value : 0);
var imageAsDataUrl = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to load company logo");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read company logo"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
};
var reportTimestamp = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return { reportId: `POR-${year}${month}${day}-${hours}${minutes}`, generatedOn: `${formatDateDDMMYYYY(date)} ${date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` };
};
var statementPeriodFor = (rows2) => {
  const dates = rows2.map((row) => row.statementDate ? new Date(row.statementDate) : null).filter((date) => Boolean(date && !Number.isNaN(date.getTime()))).sort((left, right) => left.getTime() - right.getTime());
  if (!dates.length) return "All Available Dates";
  return `${formatDateDDMMYYYY(dates[0])} to ${formatDateDDMMYYYY(dates[dates.length - 1])}`;
};
var drawPageBorder = (doc) => {
  doc.setDrawColor(184, 197, 209);
  doc.setLineWidth(0.3);
  doc.rect(8, 8, 194, 281);
};
var drawFirstPageHeader = (doc, logoDataUrl) => {
  if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", 96, 13, 18, 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(20, 45, 76);
  doc.text(COMPANY_NAME, 105, 38, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(82, 97, 115);
  doc.text(COMPANY_ADDRESS, 105, 44, { align: "center" });
  doc.setFontSize(7);
  doc.text(COMPANY_DETAILS, 105, 49, { align: "center" });
  doc.setDrawColor(...PROJECT_GREEN);
  doc.setLineWidth(0.6);
  doc.line(12, 55, 198, 55);
  doc.setFillColor(...PROJECT_GREEN);
  doc.rect(12, 59, 186, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("PURCHASE ORDER REGISTER", 105, 65, { align: "center" });
};
var drawReportMetadata = (doc, values) => {
  const x = 12;
  const y = 68;
  const width = 186 / values.length;
  values.forEach((entry, index) => {
    const cellX = x + index * width;
    doc.setDrawColor(...GRID_SLATE);
    doc.setLineWidth(0.2);
    doc.rect(cellX, y, width, 13);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.7);
    doc.setTextColor(...MUTED_SLATE);
    doc.text(entry.label.toUpperCase(), cellX + 2, y + 4);
    doc.setFontSize(7.1);
    doc.setTextColor(20, 45, 76);
    const lines = doc.splitTextToSize(entry.value, width - 4).slice(0, 2);
    doc.text(lines, cellX + 2, y + 8);
  });
};
var drawSectionBand = (doc, y, title) => {
  doc.setDrawColor(...GRID_SLATE);
  doc.setFillColor(...LIGHT_SLATE);
  doc.rect(12, y, 186, 7, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.3);
  doc.setTextColor(...TEXT_SLATE);
  doc.text(title.toUpperCase(), 14, y + 4.7);
};
var drawSummary = (doc, y, values) => {
  drawSectionBand(doc, y, "Register Summary");
  const cellY = y + 7;
  const width = 186 / values.length;
  values.forEach((entry, index) => {
    const cellX = 12 + index * width;
    doc.setDrawColor(...GRID_SLATE);
    doc.rect(cellX, cellY, width, 13);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.8);
    doc.setTextColor(...MUTED_SLATE);
    doc.text(entry.label.toUpperCase(), cellX + 2, cellY + 4);
    doc.setFontSize(7.6);
    doc.setTextColor(20, 45, 76);
    doc.text(entry.value, cellX + 2, cellY + 9);
  });
};
var buildPoRegisterPdfDoc = async (rows2, options = {}) => {
  const doc = new import_jspdf.jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const generatedAt = /* @__PURE__ */ new Date();
  const { reportId, generatedOn } = reportTimestamp(generatedAt);
  const generatedBy = options.generatedBy?.trim() || "System User";
  const statementPeriod = statementPeriodFor(rows2);
  let logoDataUrl = "";
  try {
    logoDataUrl = await imageAsDataUrl(f_logo_default);
  } catch {
    logoDataUrl = "";
  }
  drawFirstPageHeader(doc, logoDataUrl);
  drawReportMetadata(doc, [
    { label: "Report ID", value: reportId },
    { label: "Entries", value: String(rows2.length) },
    { label: "Statement Period", value: statementPeriod },
    { label: "Generated On", value: generatedOn },
    { label: "Generated By", value: generatedBy }
  ]);
  drawSectionBand(doc, 84, "Purchase Orders");
  const body = rows2.length ? rows2.map((row, index) => [
    index + 1,
    row.comparativeNo || "-",
    row.prNumber || "-",
    row.poNumber || "Not created",
    row.approvedVendor || "-",
    row.itemDetails.join("\n") || "-",
    row.uoms.join("\n") || "-",
    row.quantities.map((quantity) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(quantity)).join("\n") || "-",
    row.status || "-",
    row.poNumber && row.poNumber !== "Not created" ? formatNumber(row.poValue || 0) : "-"
  ]) : [[{ content: "No purchase-order records found.", colSpan: 10, styles: { halign: "center", textColor: MUTED_SLATE } }]];
  (0, import_jspdf_autotable.autoTable)(doc, {
    startY: 91,
    head: [["S.No.", "Comparative No.", "PR Number", "PO Number", "Approved Vendor", "Item Details", "UOM", "Qty.", "Status", "PO Value"]],
    body,
    theme: "grid",
    rowPageBreak: "avoid",
    margin: { top: 27, right: 12, bottom: 20, left: 12 },
    styles: {
      fontSize: 5,
      cellPadding: 1.1,
      lineColor: GRID_SLATE,
      lineWidth: 0.18,
      textColor: TEXT_SLATE,
      valign: "top",
      overflow: "linebreak"
    },
    headStyles: {
      fillColor: PROJECT_GREEN,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
      fontSize: 4.5,
      minCellHeight: 8
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 7, halign: "center" },
      1: { cellWidth: 22 },
      2: { cellWidth: 21 },
      3: { cellWidth: 23 },
      4: { cellWidth: 27 },
      5: { cellWidth: 34 },
      6: { cellWidth: 9, halign: "center" },
      7: { cellWidth: 10, halign: "right" },
      8: { cellWidth: 18, halign: "center" },
      9: { cellWidth: 15, halign: "right" }
    }
  });
  const createdRows = rows2.filter((row) => row.poNumber && row.poNumber !== "Not created");
  const totalPoValue = createdRows.reduce((sum, row) => sum + (row.poValue || 0), 0);
  let summaryY = doc.lastAutoTable.finalY + 4;
  if (summaryY > 262) {
    doc.addPage();
    summaryY = 30;
  }
  drawSummary(doc, summaryY, [
    { label: "Total Entries", value: String(rows2.length) },
    { label: "POs Created", value: String(createdRows.length) },
    { label: "Pending Creation", value: String(rows2.length - createdRows.length) },
    { label: "Total PO Value", value: `Rs. ${formatNumber(totalPoValue)}` }
  ]);
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    drawPageBorder(doc);
    if (page > 1) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(20, 45, 76);
      doc.text(`${COMPANY_NAME} - PURCHASE ORDER REGISTER`, 12, 17);
      doc.setDrawColor(...PROJECT_GREEN);
      doc.line(12, 21, 198, 21);
    }
    doc.setDrawColor(...GRID_SLATE);
    doc.line(12, 280, 198, 280);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.8);
    doc.setTextColor(...MUTED_SLATE);
    doc.text("System-generated Purchase Order Register", 12, 284);
    doc.text(`Report ID: ${reportId}`, 105, 284, { align: "center" });
    doc.text(`Page ${page} of ${pageCount}`, 198, 284, { align: "right" });
  }
  return doc;
};

// tmp/pdfs/qa-po-register.ts
var rows = Array.from({ length: 24 }, (_, index) => ({
  comparativeNo: `SBRPL/CS/${String(index + 1).padStart(3, "0")}`,
  prNumber: `SBRPL/PR/26/${String(index + 1).padStart(3, "0")}`,
  poNumber: index % 4 === 0 ? "Not created" : `SBRPL/PO/26/${String(index + 1).padStart(3, "0")}`,
  approvedVendor: index % 3 === 0 ? "Shree Balaji Industrial Supplies Private Limited" : "AgriChem Solutions",
  itemDetails: index % 5 === 0 ? ["Industrial centrifugal water pump", "Control panel installation kit"] : ["Organic agricultural input material"],
  uoms: index % 5 === 0 ? ["Nos", "Set"] : ["Kg"],
  quantities: index % 5 === 0 ? [12, 2] : [1250.5],
  status: index % 4 === 0 ? "NFA Approved" : index % 3 === 0 ? "Pending Approval" : "PO Approved",
  poValue: index % 4 === 0 ? 0 : 125000.5 + index * 1375,
  statementDate: `2026-07-${String(index % 24 + 1).padStart(2, "0")}`
}));
var main = async () => {
  const doc = await buildPoRegisterPdfDoc(rows, { generatedBy: "SBR Admin" });
  (0, import_node_fs.writeFileSync)("tmp/pdfs/po-register-qa.pdf", Buffer.from(doc.output("arraybuffer")));
};
void main();
