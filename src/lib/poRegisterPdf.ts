import { jsPDF } from 'jspdf';
import { autoTable, type RowInput } from 'jspdf-autotable';

import logo3f from '@/Assets/3f-logo.png';
import { formatDateDDMMYYYY } from '@/lib/dateFormat';

const COMPANY_NAME = 'SAI BIORESOURCES PRIVATE LIMITED';
const COMPANY_ADDRESS = 'Khasra No. 121/1, Amrit Dairy Farm, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh - 491001';
const COMPANY_DETAILS = 'GSTIN: 22ARPCS5442R1ZM  |  Phone: +91 75870 76870  |  Email: rajendra.s@saiobioenergy.com';
const PROJECT_GREEN: [number, number, number] = [13, 58, 53];
const LIGHT_SLATE: [number, number, number] = [241, 245, 249];
const GRID_SLATE: [number, number, number] = [203, 213, 225];
const TEXT_SLATE: [number, number, number] = [51, 65, 85];
const MUTED_SLATE: [number, number, number] = [100, 116, 139];

export type PoRegisterPdfRow = {
  comparativeNo: string;
  prNumber: string;
  poNumber: string;
  approvedVendor: string;
  itemDetails: string[];
  uoms: string[];
  quantities: number[];
  status: string;
  poValue?: number;
  statementDate?: string;
};

export type PoRegisterPdfOptions = {
  generatedBy?: string;
};

type JsPdfWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };

const formatNumber = (value: number) => new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number.isFinite(value) ? value : 0);

const imageAsDataUrl = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to load company logo');
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read company logo'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
};

const reportTimestamp = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return { reportId: `POR-${year}${month}${day}-${hours}${minutes}`, generatedOn: `${formatDateDDMMYYYY(date)} ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` };
};

const statementPeriodFor = (rows: PoRegisterPdfRow[]) => {
  const dates = rows
    .map((row) => row.statementDate ? new Date(row.statementDate) : null)
    .filter((date): date is Date => Boolean(date && !Number.isNaN(date.getTime())))
    .sort((left, right) => left.getTime() - right.getTime());
  if (!dates.length) return 'All Available Dates';
  return `${formatDateDDMMYYYY(dates[0])} to ${formatDateDDMMYYYY(dates[dates.length - 1])}`;
};

const drawPageBorder = (doc: jsPDF) => {
  doc.setDrawColor(184, 197, 209);
  doc.setLineWidth(0.3);
  doc.rect(8, 8, 194, 281);
};

const drawFirstPageHeader = (doc: jsPDF, logoDataUrl: string) => {
  if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', 96, 13, 18, 18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(20, 45, 76);
  doc.text(COMPANY_NAME, 105, 38, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(82, 97, 115);
  doc.text(COMPANY_ADDRESS, 105, 44, { align: 'center' });
  doc.setFontSize(7);
  doc.text(COMPANY_DETAILS, 105, 49, { align: 'center' });
  doc.setDrawColor(...PROJECT_GREEN);
  doc.setLineWidth(0.6);
  doc.line(12, 55, 198, 55);
  doc.setFillColor(...PROJECT_GREEN);
  doc.rect(12, 59, 186, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('PURCHASE ORDER REGISTER', 105, 65, { align: 'center' });
};

const drawReportMetadata = (
  doc: jsPDF,
  values: Array<{ label: string; value: string }>,
) => {
  const x = 12;
  const y = 68;
  const width = 186 / values.length;
  values.forEach((entry, index) => {
    const cellX = x + index * width;
    doc.setDrawColor(...GRID_SLATE);
    doc.setLineWidth(0.2);
    doc.rect(cellX, y, width, 13);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.7);
    doc.setTextColor(...MUTED_SLATE);
    doc.text(entry.label.toUpperCase(), cellX + 2, y + 4);
    doc.setFontSize(7.1);
    doc.setTextColor(20, 45, 76);
    const lines = doc.splitTextToSize(entry.value, width - 4).slice(0, 2);
    doc.text(lines, cellX + 2, y + 8);
  });
};

const drawSectionBand = (doc: jsPDF, y: number, title: string) => {
  doc.setDrawColor(...GRID_SLATE);
  doc.setFillColor(...LIGHT_SLATE);
  doc.rect(12, y, 186, 7, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.3);
  doc.setTextColor(...TEXT_SLATE);
  doc.text(title.toUpperCase(), 14, y + 4.7);
};

const drawSummary = (doc: jsPDF, y: number, values: Array<{ label: string; value: string }>) => {
  drawSectionBand(doc, y, 'Register Summary');
  const cellY = y + 7;
  const width = 186 / values.length;
  values.forEach((entry, index) => {
    const cellX = 12 + index * width;
    doc.setDrawColor(...GRID_SLATE);
    doc.rect(cellX, cellY, width, 13);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.8);
    doc.setTextColor(...MUTED_SLATE);
    doc.text(entry.label.toUpperCase(), cellX + 2, cellY + 4);
    doc.setFontSize(7.6);
    doc.setTextColor(20, 45, 76);
    doc.text(entry.value, cellX + 2, cellY + 9);
  });
};

export const buildPoRegisterPdfDoc = async (
  rows: PoRegisterPdfRow[],
  options: PoRegisterPdfOptions = {},
) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as JsPdfWithAutoTable;
  const generatedAt = new Date();
  const { reportId, generatedOn } = reportTimestamp(generatedAt);
  const generatedBy = options.generatedBy?.trim() || 'System User';
  const statementPeriod = statementPeriodFor(rows);

  let logoDataUrl = '';
  try { logoDataUrl = await imageAsDataUrl(logo3f); } catch { logoDataUrl = ''; }

  drawFirstPageHeader(doc, logoDataUrl);
  drawReportMetadata(doc, [
    { label: 'Report ID', value: reportId },
    { label: 'Entries', value: String(rows.length) },
    { label: 'Statement Period', value: statementPeriod },
    { label: 'Generated On', value: generatedOn },
    { label: 'Generated By', value: generatedBy },
  ]);
  drawSectionBand(doc, 84, 'Purchase Orders');

  const body: RowInput[] = rows.length
    ? rows.map((row, index) => [
      index + 1,
      row.comparativeNo || '-',
      row.prNumber || '-',
      row.poNumber || 'Not created',
      row.approvedVendor || '-',
      row.itemDetails.join('\n') || '-',
      row.uoms.join('\n') || '-',
      row.quantities.map((quantity) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(quantity)).join('\n') || '-',
      row.status || '-',
      row.poNumber && row.poNumber !== 'Not created' ? formatNumber(row.poValue || 0) : '-',
    ])
    : [[{ content: 'No purchase-order records found.', colSpan: 10, styles: { halign: 'center', textColor: MUTED_SLATE } }]];

  autoTable(doc, {
    startY: 91,
    head: [['S.No.', 'Comparative No.', 'PR Number', 'PO Number', 'Approved Vendor', 'Item Details', 'UOM', 'Qty.', 'Status', 'PO Value']],
    body,
    theme: 'grid',
    rowPageBreak: 'avoid',
    margin: { top: 27, right: 12, bottom: 20, left: 12 },
    styles: {
      fontSize: 5,
      cellPadding: 1.1,
      lineColor: GRID_SLATE,
      lineWidth: 0.18,
      textColor: TEXT_SLATE,
      valign: 'top',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: PROJECT_GREEN,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      fontSize: 4.5,
      minCellHeight: 8,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center' },
      1: { cellWidth: 22 },
      2: { cellWidth: 21 },
      3: { cellWidth: 23 },
      4: { cellWidth: 27 },
      5: { cellWidth: 34 },
      6: { cellWidth: 9, halign: 'center' },
      7: { cellWidth: 10, halign: 'right' },
      8: { cellWidth: 18, halign: 'center' },
      9: { cellWidth: 15, halign: 'right' },
    },
  });

  const createdRows = rows.filter((row) => row.poNumber && row.poNumber !== 'Not created');
  const totalPoValue = createdRows.reduce((sum, row) => sum + (row.poValue || 0), 0);
  let summaryY = doc.lastAutoTable.finalY + 4;
  if (summaryY > 262) {
    doc.addPage();
    summaryY = 30;
  }
  drawSummary(doc, summaryY, [
    { label: 'Total Entries', value: String(rows.length) },
    { label: 'POs Created', value: String(createdRows.length) },
    { label: 'Pending Creation', value: String(rows.length - createdRows.length) },
    { label: 'Total PO Value', value: `Rs. ${formatNumber(totalPoValue)}` },
  ]);

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    drawPageBorder(doc);
    if (page > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(20, 45, 76);
      doc.text(`${COMPANY_NAME} - PURCHASE ORDER REGISTER`, 12, 17);
      doc.setDrawColor(...PROJECT_GREEN);
      doc.line(12, 21, 198, 21);
    }
    doc.setDrawColor(...GRID_SLATE);
    doc.line(12, 280, 198, 280);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(...MUTED_SLATE);
    doc.text('System-generated Purchase Order Register', 12, 284);
    doc.text(`Report ID: ${reportId}`, 105, 284, { align: 'center' });
    doc.text(`Page ${page} of ${pageCount}`, 198, 284, { align: 'right' });
  }

  return doc;
};

export const downloadPoRegisterAsPdf = async (
  rows: PoRegisterPdfRow[],
  options: PoRegisterPdfOptions = {},
) => {
  const doc = await buildPoRegisterPdfDoc(rows, options);
  doc.save(`PO_Register_${new Date().toISOString().slice(0, 10)}.pdf`);
};

export const printPoRegisterAsPdf = async (
  rows: PoRegisterPdfRow[],
  options: PoRegisterPdfOptions = {},
) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Pop-up blocked. Please allow pop-ups to print.');

  try {
    printWindow.document.title = 'Generating Purchase Order Register...';
    const doc = await buildPoRegisterPdfDoc(rows, options);
    doc.autoPrint();
    const pdfUrl = doc.output('bloburl');
    printWindow.location.href = String(pdfUrl);
  } catch (error) {
    printWindow.close();
    throw error;
  }
};
