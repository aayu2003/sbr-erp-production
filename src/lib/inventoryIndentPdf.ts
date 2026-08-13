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

export type InventoryIndentPdfItem = {
  id: string;
  srNo: number;
  itemCode: string;
  partName: string;
  specification: string;
  uom: string;
  totalQtyRequired: number;
  lessQtyAvailableInStock: number;
  procurementLeadTimeWeeks: number;
  materialRequiredByDate: string;
  indigenousOrImported: string;
  ratePerItem: number;
  preferredVendorName: string;
  validityOfWarrantyAndGuarantee: string;
  fullLifeHr: string;
  actualLifeHr: string;
  reasonForReplacement: string;
  repairingPossibility: string;
};

export type InventoryIndentPdfData = {
  project: string;
  prNo: string;
  department?: string;
  date: string;
  indentedBy: string;
  forwardedBy: string;
  directorsApproval: string;
  remarksNotes: string;
  budgetHead: string;
  items: InventoryIndentPdfItem[];
  indentedByDetails?: { nameId: string; signature: string; timestamp?: string };
  forwardedByDetails?: { nameId: string; signature: string; timestamp?: string };
  directorsApprovalDetails?: { nameId: string; signature: string; timestamp?: string };
};

export type InventoryIndentPdfApproval = {
  staffName: string;
  staffDesignation: string;
  approvedAt: string;
  approvedTime: string;
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
const money = (value: number) => `Rs. ${Math.round(Number(value || 0)).toLocaleString('en-IN')}`;
const netQty = (item: InventoryIndentPdfItem) => Math.max(0, Number(item.totalQtyRequired || 0) - Number(item.lessQtyAvailableInStock || 0));
const itemValue = (item: InventoryIndentPdfItem) => netQty(item) * Number(item.ratePerItem || 0);

const sectionBand = (doc: jsPDF, y: number, title: string) => {
  doc.setFillColor(...LIGHT_SLATE);
  doc.setDrawColor(...GRID);
  doc.setLineWidth(0.2);
  doc.rect(12, y, 186, 7, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...TEXT);
  doc.text(title.toUpperCase(), 14, y + 4.7);
};

const ensureSpace = (doc: jsPDF, y: number, height: number) => {
  if (y + height <= 272) return y;
  doc.addPage();
  return 28;
};

const signatureText = (value?: string) => value?.startsWith('data:image/') ? 'Digitally Signed' : value || 'Pending';

export const buildInventoryIndentPdf = async (
  indent: InventoryIndentPdfData,
  approval?: InventoryIndentPdfApproval,
) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as PdfWithTable;
  let logo = '';
  try { logo = await imageAsDataUrl(new URL(logo3f, window.location.href).href); } catch { logo = ''; }

  if (logo) doc.addImage(logo, 'PNG', 96, 12, 18, 18);
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
  doc.text('INVENTORY INDENT / PURCHASE REQUISITION', 105, 64, { align: 'center' });

  const tableBase = {
    theme: 'grid' as const,
    margin: { top: 28, right: 12, bottom: 20, left: 12 },
    styles: { fontSize: 5.7, cellPadding: 1.25, lineColor: GRID, lineWidth: 0.18, textColor: TEXT, valign: 'middle' as const, overflow: 'linebreak' as const },
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const, halign: 'center' as const, valign: 'middle' as const },
    alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
  };

  autoTable(doc, {
    ...tableBase,
    startY: 67,
    body: [[
      { content: 'PR NUMBER', styles: { fillColor: LIGHT_SLATE, textColor: MUTED, fontStyle: 'bold' } },
      { content: indent.prNo || 'Not Generated', styles: { textColor: NAVY, fontStyle: 'bold' } },
      { content: 'PR DATE', styles: { fillColor: LIGHT_SLATE, textColor: MUTED, fontStyle: 'bold' } },
      { content: formatDateDDMMYYYY(indent.date), styles: { textColor: NAVY, fontStyle: 'bold' } },
    ], [
      { content: 'PROJECT', styles: { fillColor: LIGHT_SLATE, textColor: MUTED, fontStyle: 'bold' } },
      { content: indent.project || 'Not Recorded', styles: { textColor: NAVY, fontStyle: 'bold' } },
      { content: 'DEPARTMENT', styles: { fillColor: LIGHT_SLATE, textColor: MUTED, fontStyle: 'bold' } },
      { content: indent.department || 'Not Recorded', styles: { textColor: NAVY, fontStyle: 'bold' } },
    ]],
    columnStyles: { 0: { cellWidth: 27 }, 1: { cellWidth: 66 }, 2: { cellWidth: 27 }, 3: { cellWidth: 66 } },
  });

  let y = doc.lastAutoTable.finalY + 5;
  sectionBand(doc, y, 'Requisition Items');
  autoTable(doc, {
    ...tableBase,
    startY: y + 7,
    rowPageBreak: 'avoid',
    head: [['S.No.', 'Item Code', 'Item / Specification', 'UOM', 'Required', 'Stock', 'Net PR', 'Required By', 'Source', 'Rate', 'Value']],
    body: indent.items.length ? indent.items.map(item => [
      item.srNo,
      item.itemCode || '-',
      `${item.partName || 'Not Recorded'}\n${item.specification || 'No specification recorded'}`,
      item.uom || '-',
      number(item.totalQtyRequired),
      number(item.lessQtyAvailableInStock),
      number(netQty(item)),
      formatDateDDMMYYYY(item.materialRequiredByDate),
      item.indigenousOrImported || '-',
      money(item.ratePerItem),
      money(itemValue(item)),
    ]) : [[{ content: 'No requisition items recorded.', colSpan: 11, styles: { halign: 'center' } }]],
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 18 }, 2: { cellWidth: 40 }, 3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 15, halign: 'right' }, 5: { cellWidth: 14, halign: 'right' }, 6: { cellWidth: 14, halign: 'right' },
      7: { cellWidth: 19, halign: 'center' }, 8: { cellWidth: 15, halign: 'center' }, 9: { cellWidth: 15, halign: 'right' }, 10: { cellWidth: 16, halign: 'right' },
    },
  });

  const totalRequired = indent.items.reduce((sum, item) => sum + Number(item.totalQtyRequired || 0), 0);
  const totalNet = indent.items.reduce((sum, item) => sum + netQty(item), 0);
  const totalAmount = indent.items.reduce((sum, item) => sum + itemValue(item), 0);
  y = doc.lastAutoTable.finalY + 4;
  autoTable(doc, {
    ...tableBase,
    startY: y,
    body: [[
      { content: 'LINE ITEMS', styles: { fillColor: LIGHT_SLATE, textColor: MUTED, fontStyle: 'bold' } }, { content: String(indent.items.length), styles: { textColor: NAVY, fontStyle: 'bold' } },
      { content: 'TOTAL REQUIRED', styles: { fillColor: LIGHT_SLATE, textColor: MUTED, fontStyle: 'bold' } }, { content: number(totalRequired), styles: { textColor: NAVY, fontStyle: 'bold' } },
      { content: 'TOTAL NET PR', styles: { fillColor: LIGHT_SLATE, textColor: MUTED, fontStyle: 'bold' } }, { content: number(totalNet), styles: { textColor: NAVY, fontStyle: 'bold' } },
      { content: 'TOTAL PR VALUE', styles: { fillColor: LIGHT_SLATE, textColor: MUTED, fontStyle: 'bold' } }, { content: money(totalAmount), styles: { textColor: NAVY, fontStyle: 'bold' } },
    ]],
  });

  y = ensureSpace(doc, doc.lastAutoTable.finalY + 5, 45);
  sectionBand(doc, y, 'Procurement & Technical Details');
  autoTable(doc, {
    ...tableBase,
    startY: y + 7,
    rowPageBreak: 'avoid',
    head: [['Item', 'Preferred Vendor', 'Lead Time', 'Warranty / Guarantee', 'Full Life', 'Actual Life', 'Repairing', 'Replacement Reason']],
    body: indent.items.length ? indent.items.map(item => [
      item.partName || `Item ${item.srNo}`, item.preferredVendorName || 'Not Recorded', `${number(item.procurementLeadTimeWeeks)} week(s)`,
      item.validityOfWarrantyAndGuarantee || 'N/A', item.fullLifeHr || 'N/A', item.actualLifeHr || 'N/A', item.repairingPossibility || 'N/A', item.reasonForReplacement || 'N/A',
    ]) : [[{ content: 'No technical details recorded.', colSpan: 8, styles: { halign: 'center' } }]],
    columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 32 }, 2: { cellWidth: 20 }, 3: { cellWidth: 27 }, 4: { cellWidth: 18 }, 5: { cellWidth: 18 }, 6: { cellWidth: 18 }, 7: { cellWidth: 25 } },
  });

  y = ensureSpace(doc, doc.lastAutoTable.finalY + 5, 37);
  sectionBand(doc, y, 'Budget Head & Remarks');
  autoTable(doc, {
    ...tableBase,
    startY: y + 7,
    head: [['Budget Head', 'Remarks / Notes']],
    body: [[indent.budgetHead || 'Not Recorded', indent.remarksNotes || 'No remarks recorded']],
    styles: { ...tableBase.styles, minCellHeight: 18 },
    columnStyles: { 0: { cellWidth: 93 }, 1: { cellWidth: 93 } },
  });

  y = ensureSpace(doc, doc.lastAutoTable.finalY + 5, 48);
  sectionBand(doc, y, 'Approval Details');
  const approvalRows = [
    { stage: 'Indented By', person: indent.indentedByDetails?.nameId || indent.indentedBy, signature: indent.indentedByDetails?.signature, date: indent.indentedByDetails?.timestamp || indent.date },
    { stage: 'Forwarded By', person: indent.forwardedByDetails?.nameId || indent.forwardedBy, signature: indent.forwardedByDetails?.signature, date: indent.forwardedByDetails?.timestamp },
    { stage: "Director's Approval", person: indent.directorsApprovalDetails?.nameId || indent.directorsApproval, signature: indent.directorsApprovalDetails?.signature, date: indent.directorsApprovalDetails?.timestamp },
  ];
  if (approval && !approvalRows[0].signature) {
    approvalRows[0].person = `${approval.staffName} / ${approval.staffDesignation}`;
    approvalRows[0].signature = `Approved at ${approval.approvedTime}`;
    approvalRows[0].date = approval.approvedAt;
  }
  autoTable(doc, {
    ...tableBase,
    startY: y + 7,
    head: [['Approval Stage', 'Name / ID', 'Digital Signature', 'Date']],
    body: approvalRows.map(row => [row.stage, row.person || 'Not Recorded', signatureText(row.signature), row.date ? formatDateDDMMYYYY(row.date) : '-']),
    styles: { ...tableBase.styles, minCellHeight: 10 },
    columnStyles: { 0: { cellWidth: 36, fontStyle: 'bold' }, 1: { cellWidth: 62 }, 2: { cellWidth: 52, halign: 'center' }, 3: { cellWidth: 36, halign: 'center' } },
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(184, 197, 209);
    doc.setLineWidth(0.3);
    doc.rect(8, 8, 194, 281);
    if (page > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...NAVY);
      doc.text(`${COMPANY_NAME} - INVENTORY INDENT`, 12, 17);
      doc.setDrawColor(...GREEN);
      doc.line(12, 21, 198, 21);
    }
    doc.setDrawColor(...GRID);
    doc.line(12, 280, 198, 280);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(...MUTED);
    doc.text('System-generated Inventory Indent', 12, 284);
    doc.text(`PR No.: ${indent.prNo || 'Draft'}`, 105, 284, { align: 'center' });
    doc.text(`Page ${page} of ${pageCount}`, 198, 284, { align: 'right' });
  }
  return doc;
};

export const printInventoryIndentPdf = async (indent: InventoryIndentPdfData, approval?: InventoryIndentPdfApproval) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Pop-up blocked. Please allow pop-ups to print.');
  try {
    printWindow.document.title = `Generating ${indent.prNo || 'Inventory Indent'}...`;
    const doc = await buildInventoryIndentPdf(indent, approval);
    doc.autoPrint();
    printWindow.location.href = String(doc.output('bloburl'));
  } catch (error) {
    printWindow.close();
    throw error;
  }
};
