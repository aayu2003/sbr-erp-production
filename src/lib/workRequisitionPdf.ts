import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

import logo3f from '@/Assets/3f-logo.png';
import { formatDateDDMMYYYY } from '@/lib/dateFormat';

const COMPANY_NAME = 'SAI BIORESOURCES PRIVATE LIMITED';
const COMPANY_ADDRESS = 'Khasra No. 121/1, Amrit Dairy Farm, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh - 491001';
const COMPANY_DETAILS = 'GSTIN: 22ARPCS5442R1ZM  |  Phone: +91 75870 76870  |  Email: rajendra.s@saiobioenergy.com';
const GREEN: [number, number, number] = [13, 58, 53];
const NAVY: [number, number, number] = [20, 45, 76];
const LIGHT_SLATE: [number, number, number] = [241, 245, 249];
const GRID: [number, number, number] = [203, 213, 225];
const TEXT: [number, number, number] = [51, 65, 85];
const MUTED: [number, number, number] = [100, 116, 139];

export type WorkRequisitionPdfService = {
  srNo: number;
  serviceDescription: string;
  uom: string;
  quantity: number;
  startDate: string;
  duration: string;
  completionDate: string;
  validity: string;
  servicesFrom: string;
  approxValue: number;
  gstPercent: number;
  gstAmount: number;
  proposedVendors: string;
  previousWO: string;
  remarks: string;
};

export type WorkRequisitionPdfData = {
  plant: string;
  sprNo: string;
  sprDate: string;
  areaOfService: string;
  functionName: string;
  natureOfService: string;
  notes?: string;
  budgetHead?: string;
  services: WorkRequisitionPdfService[];
  indentedBy?: string;
  indentedBySignature?: string;
  indentedByTimestamp?: string;
  forwardedBy?: string;
  forwardedBySignature?: string;
  forwardedByTimestamp?: string;
  approvedBy?: string;
  approvedBySignature?: string;
  approvedByTimestamp?: string;
};

type PdfWithTable = jsPDF & { lastAutoTable: { finalY: number } };

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

const number = (value: number) => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const money = (value: number) => `Rs. ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const valueOrDash = (value?: string) => String(value || '').trim() || '-';
const signatureText = (value?: string) => value?.startsWith('data:image/') ? 'Digitally Signed' : valueOrDash(value);

const sectionBand = (doc: jsPDF, y: number, title: string) => {
  doc.setFillColor(...LIGHT_SLATE);
  doc.setDrawColor(...GRID);
  doc.setLineWidth(0.2);
  doc.rect(10, y, 277, 7, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...TEXT);
  doc.text(title.toUpperCase(), 12, y + 4.7);
};

const ensureSpace = (doc: jsPDF, y: number, height: number) => {
  if (y + height <= 190) return y;
  doc.addPage();
  return 24;
};

export const buildWorkRequisitionPdf = async (requisition: WorkRequisitionPdfData) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }) as PdfWithTable;
  let logo = '';
  try {
    if (typeof window !== 'undefined') logo = await imageAsDataUrl(new URL(logo3f, window.location.href).href);
  } catch {
    logo = '';
  }

  const drawFirstPageHeader = () => {
    if (logo) doc.addImage(logo, 'PNG', 140, 8, 17, 17);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...NAVY);
    doc.text(COMPANY_NAME, 148.5, 31, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...MUTED);
    doc.text(COMPANY_ADDRESS, 148.5, 36, { align: 'center' });
    doc.text(COMPANY_DETAILS, 148.5, 40.5, { align: 'center' });
    doc.setDrawColor(...GREEN);
    doc.setLineWidth(0.6);
    doc.line(10, 45, 287, 45);
    doc.setFillColor(...GREEN);
    doc.rect(10, 49, 277, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('SERVICE PURCHASE REQUISITION (SPR)', 148.5, 55, { align: 'center' });
  };

  drawFirstPageHeader();

  const tableBase = {
    theme: 'grid' as const,
    margin: { top: 24, right: 10, bottom: 15, left: 10 },
    styles: {
      fontSize: 5.8,
      cellPadding: 1.35,
      lineColor: GRID,
      lineWidth: 0.18,
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
    },
    alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
  };

  autoTable(doc, {
    ...tableBase,
    startY: 58,
    body: [[
      { content: 'SR NUMBER', styles: { fillColor: LIGHT_SLATE, textColor: MUTED, fontStyle: 'bold' } },
      { content: requisition.sprNo || 'Not Generated', styles: { textColor: NAVY, fontStyle: 'bold' } },
      { content: 'SPR DATE', styles: { fillColor: LIGHT_SLATE, textColor: MUTED, fontStyle: 'bold' } },
      { content: formatDateDDMMYYYY(requisition.sprDate), styles: { textColor: NAVY, fontStyle: 'bold' } },
      { content: 'DEPARTMENT', styles: { fillColor: LIGHT_SLATE, textColor: MUTED, fontStyle: 'bold' } },
      { content: requisition.plant || 'Not Recorded', styles: { textColor: NAVY, fontStyle: 'bold' } },
    ], [
      { content: 'SERVICE CATEGORY', styles: { fillColor: LIGHT_SLATE, textColor: MUTED, fontStyle: 'bold' } },
      { content: valueOrDash(requisition.areaOfService), styles: { textColor: NAVY, fontStyle: 'bold' } },
      { content: 'SERVICE / ACTIVITY', styles: { fillColor: LIGHT_SLATE, textColor: MUTED, fontStyle: 'bold' } },
      { content: valueOrDash(requisition.functionName), styles: { textColor: NAVY, fontStyle: 'bold' } },
      { content: 'ENGAGEMENT TYPE', styles: { fillColor: LIGHT_SLATE, textColor: MUTED, fontStyle: 'bold' } },
      { content: valueOrDash(requisition.natureOfService), styles: { textColor: NAVY, fontStyle: 'bold' } },
    ]],
    columnStyles: {
      0: { cellWidth: 25 }, 1: { cellWidth: 66 }, 2: { cellWidth: 23 },
      3: { cellWidth: 45 }, 4: { cellWidth: 30 }, 5: { cellWidth: 88 },
    },
  });

  let y = doc.lastAutoTable.finalY + 4;
  sectionBand(doc, y, 'Service Schedule & Commercial Value');
  autoTable(doc, {
    ...tableBase,
    startY: y + 7,
    rowPageBreak: 'avoid',
    head: [['S.No.', 'Service Description', 'UOM', 'Qty.', 'Contract Start', 'Duration', 'Completion', 'Validity', 'Source', 'Approx. Value', 'GST', 'Total']],
    body: requisition.services.length ? requisition.services.map((service) => [
      service.srNo,
      valueOrDash(service.serviceDescription),
      valueOrDash(service.uom),
      number(service.quantity),
      formatDateDDMMYYYY(service.startDate),
      valueOrDash(service.duration),
      formatDateDDMMYYYY(service.completionDate),
      formatDateDDMMYYYY(service.validity),
      valueOrDash(service.servicesFrom),
      money(service.approxValue),
      `${number(service.gstPercent)}%\n${money(service.gstAmount)}`,
      money(service.approxValue + service.gstAmount),
    ]) : [[{ content: 'No service lines recorded.', colSpan: 12, styles: { halign: 'center' } }]],
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 48 }, 2: { cellWidth: 13, halign: 'center' },
      3: { cellWidth: 13, halign: 'right' }, 4: { cellWidth: 22, halign: 'center' }, 5: { cellWidth: 22 },
      6: { cellWidth: 22, halign: 'center' }, 7: { cellWidth: 22, halign: 'center' }, 8: { cellWidth: 19, halign: 'center' },
      9: { cellWidth: 28, halign: 'right' }, 10: { cellWidth: 25, halign: 'right' }, 11: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
    },
  });

  const subtotal = requisition.services.reduce((sum, service) => sum + Number(service.approxValue || 0), 0);
  const gst = requisition.services.reduce((sum, service) => sum + Number(service.gstAmount || 0), 0);
  y = doc.lastAutoTable.finalY + 3;
  autoTable(doc, {
    ...tableBase,
    startY: y,
    body: [[
      { content: 'SERVICE LINES', styles: { fillColor: LIGHT_SLATE, textColor: MUTED, fontStyle: 'bold' } },
      { content: String(requisition.services.length), styles: { textColor: NAVY, fontStyle: 'bold' } },
      { content: 'SUBTOTAL', styles: { fillColor: LIGHT_SLATE, textColor: MUTED, fontStyle: 'bold' } },
      { content: money(subtotal), styles: { textColor: NAVY, fontStyle: 'bold' } },
      { content: 'GST', styles: { fillColor: LIGHT_SLATE, textColor: MUTED, fontStyle: 'bold' } },
      { content: money(gst), styles: { textColor: NAVY, fontStyle: 'bold' } },
      { content: 'TOTAL SPR VALUE', styles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: 'bold' } },
      { content: money(subtotal + gst), styles: { textColor: NAVY, fontStyle: 'bold', halign: 'right' } },
    ]],
  });

  y = ensureSpace(doc, doc.lastAutoTable.finalY + 4, 38);
  sectionBand(doc, y, 'Vendor & Reference Details');
  autoTable(doc, {
    ...tableBase,
    startY: y + 7,
    rowPageBreak: 'avoid',
    head: [['S.No.', 'Service', 'Proposed Vendors / Contractor', 'Previous WO', 'Remarks']],
    body: requisition.services.length ? requisition.services.map((service) => [
      service.srNo,
      valueOrDash(service.serviceDescription),
      valueOrDash(service.proposedVendors),
      valueOrDash(service.previousWO),
      valueOrDash(service.remarks),
    ]) : [[{ content: 'No vendor or reference details recorded.', colSpan: 5, styles: { halign: 'center' } }]],
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 58 }, 2: { cellWidth: 82 },
      3: { cellWidth: 50 }, 4: { cellWidth: 75 },
    },
  });

  y = ensureSpace(doc, doc.lastAutoTable.finalY + 4, 30);
  sectionBand(doc, y, 'Budget Head & Remarks');
  autoTable(doc, {
    ...tableBase,
    startY: y + 7,
    head: [['Budget Head / Allocation', 'Requisition Remarks / Notes']],
    body: [[requisition.budgetHead || 'Not Linked', requisition.notes || 'No remarks recorded']],
    styles: { ...tableBase.styles, minCellHeight: 14 },
    columnStyles: { 0: { cellWidth: 138.5 }, 1: { cellWidth: 138.5 } },
  });

  y = ensureSpace(doc, doc.lastAutoTable.finalY + 4, 36);
  sectionBand(doc, y, 'Approval Details');
  autoTable(doc, {
    ...tableBase,
    startY: y + 7,
    head: [['Approval Stage', 'Name / ID', 'Digital Signature', 'Date']],
    body: [
      ['Indentor Engineer', valueOrDash(requisition.indentedBy), signatureText(requisition.indentedBySignature), requisition.indentedByTimestamp ? formatDateDDMMYYYY(requisition.indentedByTimestamp) : '-'],
      ['Department HOD', valueOrDash(requisition.forwardedBy), signatureText(requisition.forwardedBySignature), requisition.forwardedByTimestamp ? formatDateDDMMYYYY(requisition.forwardedByTimestamp) : '-'],
      ['Plant Head', valueOrDash(requisition.approvedBy), signatureText(requisition.approvedBySignature), requisition.approvedByTimestamp ? formatDateDDMMYYYY(requisition.approvedByTimestamp) : '-'],
    ],
    styles: { ...tableBase.styles, minCellHeight: 8 },
    columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold' }, 1: { cellWidth: 85 }, 2: { cellWidth: 90, halign: 'center' }, 3: { cellWidth: 47, halign: 'center' } },
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(184, 197, 209);
    doc.setLineWidth(0.3);
    doc.rect(6, 6, 285, 198);
    if (page > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...NAVY);
      doc.text(`${COMPANY_NAME} - SERVICE PURCHASE REQUISITION`, 10, 15);
      doc.setDrawColor(...GREEN);
      doc.line(10, 19, 287, 19);
    }
    doc.setDrawColor(...GRID);
    doc.line(10, 197, 287, 197);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(...MUTED);
    doc.text('System-generated Service Purchase Requisition', 10, 201);
    doc.text(`SR No.: ${requisition.sprNo || 'Draft'}`, 148.5, 201, { align: 'center' });
    doc.text(`Page ${page} of ${pageCount}`, 287, 201, { align: 'right' });
  }

  return doc;
};

export const printWorkRequisitionPdf = async (requisition: WorkRequisitionPdfData) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Pop-up blocked. Please allow pop-ups to print.');
  try {
    printWindow.document.title = `Generating ${requisition.sprNo || 'Service Requisition'}...`;
    const doc = await buildWorkRequisitionPdf(requisition);
    doc.autoPrint();
    printWindow.location.href = String(doc.output('bloburl'));
  } catch (error) {
    printWindow.close();
    throw error;
  }
};
