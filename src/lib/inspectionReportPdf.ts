import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

import logo3f from '@/Assets/3f-logo.png';
import { formatDateDDMMYYYY } from '@/lib/dateFormat';
import { getPersonEntry } from '@/lib/signatureDiary';
import type { InspectionReportRecord } from '@/lib/inspectionReportStore';

const COMPANY_NAME = 'SAI BIORESOURCES PRIVATE LIMITED';
const COMPANY_ADDRESS = 'Khasra No. 121/1, Amrit Dairy Farm, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh - 491001';
const COMPANY_DETAILS = 'GSTIN: 22ARPCS5442R1ZM  |  Phone: +91 75870 76870  |  Email: rajendra.s@saiobioenergy.com';
const GREEN: [number, number, number] = [13, 58, 53];
const LIGHT_SLATE: [number, number, number] = [241, 245, 249];
const GRID: [number, number, number] = [203, 213, 225];
const TEXT: [number, number, number] = [51, 65, 85];
const NAVY: [number, number, number] = [20, 45, 76];
const MUTED: [number, number, number] = [100, 116, 139];

type PdfWithTable = jsPDF & { lastAutoTable: { finalY: number } };

const imageAsDataUrl = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to load image');
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
};

const addPageBackground = (doc: jsPDF) => {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 210, 297, 'F');
};

const sectionBand = (doc: jsPDF, y: number, title: string) => {
  doc.setFillColor(...LIGHT_SLATE);
  doc.setDrawColor(...GRID);
  doc.setLineWidth(0.2);
  doc.rect(12, y, 186, 7, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.3);
  doc.setTextColor(...TEXT);
  doc.text(title.toUpperCase(), 14, y + 4.7);
};

const ensureSpace = (doc: jsPDF, y: number, requiredHeight: number) => {
  if (y + requiredHeight <= 273) return y;
  doc.addPage();
  addPageBackground(doc);
  return 18;
};

const tableStyles = {
  theme: 'grid' as const,
  margin: { top: 18, right: 12, bottom: 20, left: 12 },
  styles: {
    fontSize: 6.1,
    cellPadding: 1.25,
    lineColor: GRID,
    lineWidth: 0.2,
    textColor: TEXT,
    valign: 'middle' as const,
    overflow: 'linebreak' as const,
  },
  headStyles: {
    fillColor: GREEN,
    textColor: [255, 255, 255] as [number, number, number],
    fontStyle: 'bold' as const,
    halign: 'center' as const,
    valign: 'middle' as const,
    lineColor: GREEN,
    lineWidth: 0.22,
  },
  alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
};

export const buildInspectionReportPdf = async (report: InspectionReportRecord) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  addPageBackground(doc);
  let logoDataUrl = '';
  try {
    logoDataUrl = await imageAsDataUrl(new URL(logo3f, window.location.href).href);
  } catch {
    logoDataUrl = '';
  }

  if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', 96, 12, 18, 18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...NAVY);
  doc.text(COMPANY_NAME, 105, 37, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...MUTED);
  doc.text(COMPANY_ADDRESS, 105, 43, { align: 'center' });
  doc.setFontSize(7);
  doc.text(COMPANY_DETAILS, 105, 48, { align: 'center' });
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.6);
  doc.line(12, 54, 198, 54);
  doc.setFillColor(...GREEN);
  doc.rect(12, 58, 186, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(`INSPECTION CERTIFICATE (${report.inspectionType.toUpperCase()})`, 105, 64, { align: 'center' });

  autoTable(doc, {
    ...tableStyles,
    startY: 67,
    body: [[
      { content: 'CERTIFICATE NO.', styles: { fillColor: LIGHT_SLATE, fontStyle: 'bold', textColor: MUTED } },
      { content: report.certificateNo, styles: { fontStyle: 'bold', textColor: NAVY } },
      { content: 'CERTIFICATE DATE', styles: { fillColor: LIGHT_SLATE, fontStyle: 'bold', textColor: MUTED } },
      { content: formatDateDDMMYYYY(report.certificateDate, report.certificateDate), styles: { fontStyle: 'bold', textColor: NAVY } },
    ]],
    columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 65 }, 2: { cellWidth: 25 }, 3: { cellWidth: 51 } },
  });
  let y = (doc as PdfWithTable).lastAutoTable.finalY + 5;

  sectionBand(doc, y, 'Inspection Details');
  autoTable(doc, {
    ...tableStyles,
    startY: y + 7,
    body: [
      ['GRN No.', report.grnNo],
      ['Purchase Order No.', report.poNo || 'Not Recorded'],
      ['Vendor Name', report.vendorName],
      ['Inspection Location', report.inspectionLocation],
      ['Inspection Type', report.inspectionType],
      ['Reference', report.reference || 'NA'],
    ],
    columnStyles: { 0: { cellWidth: 58, fontStyle: 'bold', fillColor: LIGHT_SLATE, textColor: NAVY }, 1: { cellWidth: 128, fontStyle: 'bold' } },
  });
  y = (doc as PdfWithTable).lastAutoTable.finalY + 5;

  sectionBand(doc, y, 'Material Inspection');
  autoTable(doc, {
    ...tableStyles,
    startY: y + 7,
    head: [['S. No.', 'Item', 'UoM', 'Order Qty.', 'Inspected Qty.', 'Accepted Qty.', 'Rejected Qty.']],
    body: report.items.length ? report.items.map((item, index) => [
      index + 1,
      item.itemCode ? `${item.itemName}\n${item.itemCode}` : item.itemName,
      item.uom,
      item.orderQty.toLocaleString('en-IN', { maximumFractionDigits: 3 }),
      item.inspectedQty.toLocaleString('en-IN', { maximumFractionDigits: 3 }),
      item.acceptedQty.toLocaleString('en-IN', { maximumFractionDigits: 3 }),
      item.rejectedQty.toLocaleString('en-IN', { maximumFractionDigits: 3 }),
    ]) : [[{ content: 'No inspection items recorded.', colSpan: 7, styles: { halign: 'center' } }]],
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 62 },
      2: { cellWidth: 19, halign: 'center' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 24, halign: 'right' },
      5: { cellWidth: 23, halign: 'right' },
      6: { cellWidth: 22, halign: 'right' },
    },
  });
  y = (doc as PdfWithTable).lastAutoTable.finalY + 5;
  y = ensureSpace(doc, y, 36);
  sectionBand(doc, y, 'Quality Inspection Checklist');
  autoTable(doc, {
    ...tableStyles,
    startY: y + 7,
    head: [['S. No.', 'Inspection Parameter', 'Inspection Result', 'Remarks']],
    body: report.checklist.length ? report.checklist.map((item, index) => [
      index + 1, item.parameter, item.result, item.remarks || '-',
    ]) : [[{ content: 'No checklist parameters recorded.', colSpan: 4, styles: { halign: 'center' } }]],
    columnStyles: { 0: { cellWidth: 14, halign: 'center' }, 1: { cellWidth: 78 }, 2: { cellWidth: 48, halign: 'center' }, 3: { cellWidth: 46 } },
  });
  y = (doc as PdfWithTable).lastAutoTable.finalY + 5;
  y = ensureSpace(doc, y, 55);
  sectionBand(doc, y, 'Certification');
  doc.setDrawColor(...GRID);
  doc.rect(12, y + 7, 186, 39);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT);
  const certificationLines = doc.splitTextToSize(report.certification, 178);
  doc.text(certificationLines, 16, y + 14);
  const firstHeight = certificationLines.length * 3.2;
  doc.setFont('helvetica', 'bold');
  doc.text(doc.splitTextToSize(report.recommendation, 178), 16, y + 19 + firstHeight);
  y += 50;
  y = ensureSpace(doc, y, 49);

  const signatories = [
    { title: 'PREPARED & INSPECTED BY', name: report.preparedByName, designation: report.preparedByDesignation, approvedAt: '' },
    ...(report.signatoryMode === 'three'
      ? [{ title: 'VERIFIED BY', name: report.verifiedByName, designation: report.verifiedByDesignation, approvedAt: report.adminOpsApproval?.actedAt || '' }]
      : []),
    { title: 'APPROVED BY', name: report.approvedByName, designation: report.approvedByDesignation, approvedAt: report.financeAdminOpsApproval?.actedAt || '' },
  ];
  const signatoryWidth = 186 / signatories.length;
  signatories.forEach((signatory, index) => {
    const x = 12 + index * signatoryWidth;
    doc.setFillColor(...GREEN);
    doc.setDrawColor(...GREEN);
    doc.rect(x, y, signatoryWidth, 7, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(signatories.length === 3 ? 6.3 : 7.2);
    doc.setTextColor(255, 255, 255);
    doc.text(signatory.title, x + signatoryWidth / 2, y + 4.8, { align: 'center' });
    doc.setDrawColor(...GRID);
    doc.rect(x, y + 7, signatoryWidth, 36);
    doc.setFontSize(signatories.length === 3 ? 5.8 : 6.8);
    doc.setTextColor(...TEXT);
    doc.text(doc.splitTextToSize(`Name: ${signatory.name || '-'}`, signatoryWidth - 6).slice(0, 2), x + 3, y + 13);
    doc.text(doc.splitTextToSize(`Designation: ${signatory.designation || '-'}`, signatoryWidth - 6).slice(0, 2), x + 3, y + 20);
    const signature = getPersonEntry(signatory.name)?.signature || '';
    if (signature) {
      try { doc.addImage(signature, 'PNG', x + 3, y + 23, Math.min(signatory.approvedAt ? 24 : 34, signatoryWidth - 8), 12); } catch { /* invalid signature image */ }
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text('Signature:', x + 3, y + 39);
    if (signatory.approvedAt) {
      const approvedDate = new Date(signatory.approvedAt);
      const approvedText = Number.isNaN(approvedDate.getTime()) ? '' : approvedDate.toLocaleString('en-IN', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
      });
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(52, 211, 153);
      doc.roundedRect(x + signatoryWidth - 30, y + 25, 27, 14, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.2);
      doc.setTextColor(4, 120, 87);
      doc.text('APPROVED', x + signatoryWidth - 16.5, y + 30, { align: 'center' });
      doc.setFontSize(4.5);
      doc.text(approvedText, x + signatoryWidth - 16.5, y + 34.2, { align: 'center', maxWidth: 25 });
    }
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(184, 197, 209);
    doc.setLineWidth(0.3);
    doc.rect(8, 8, 194, 281);
    doc.setDrawColor(...GRID);
    doc.line(12, 280, 198, 280);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.6);
    doc.setTextColor(...MUTED);
    doc.text('System-generated Inspection Certificate', 12, 284);
    doc.text(report.certificateNo, 105, 284, { align: 'center' });
    doc.text(`Page ${page} of ${pageCount}`, 198, 284, { align: 'right' });
  }
  return doc;
};

export const printInspectionReport = async (report: InspectionReportRecord) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Pop-up blocked. Please allow pop-ups to print.');
  try {
    printWindow.document.title = `Generating ${report.certificateNo}...`;
    const doc = await buildInspectionReportPdf(report);
    doc.autoPrint();
    printWindow.location.href = String(doc.output('bloburl'));
  } catch (error) {
    printWindow.close();
    throw error;
  }
};
