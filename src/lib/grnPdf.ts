// jsPDF-based GRN document generator — mirrors GrnDocumentPreview.tsx's on-screen layout,
// but as an actual PDF Blob (rather than a print-window HTML string like GrnPrint.tsx uses).
// Built specifically so a GRN can be "generated & attached" to a purchase-flow step without
// the user manually printing/saving/re-uploading a file themselves.

import jsPDF from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import logo3f from '@/Assets/3f-logo.png';
import type { GRNRecord } from '@/lib/grnApi';

const COMPANY_NAME = 'SAI BIORESOURCES PRIVATE LIMITED';
const COMPANY_ADDRESS = 'Khasra No. 121/1, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh – 491001';
const NAVY: [number, number, number] = [30, 58, 95];
const LIGHT: [number, number, number] = [241, 245, 249];

type JsPdfWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };

const formatDate = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Failed to read image blob'));
  reader.onload = () => resolve(String(reader.result || ''));
  reader.readAsDataURL(blob);
});

const fetchImageDataUrl = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  return blobToDataUrl(await res.blob());
};

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

const buildGrnPdfDoc = async (grn: GRNRecord): Promise<JsPdfWithAutoTable> => {
  const doc = new jsPDF() as JsPdfWithAutoTable;

  let logoDataUrl: string | null = null;
  try { logoDataUrl = await fetchImageDataUrl(logo3f); } catch { logoDataUrl = null; }
  if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', 98, 8, 14, 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(COMPANY_NAME, 105, 28, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(COMPANY_ADDRESS, 105, 33, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('GOODS RECEIPT NOTE (GRN)', 105, 40, { align: 'center' });
  doc.setFont('helvetica', 'normal');

  autoTable(doc, {
    startY: 45,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 32 }, 2: { cellWidth: 32 } },
    body: [
      [
        { content: 'GRN No.:', styles: { fontStyle: 'bold', fillColor: LIGHT } }, grn.grnNo,
        { content: 'GRN Date:', styles: { fontStyle: 'bold', fillColor: LIGHT } }, formatDate(grn.grnDate),
      ],
      [
        { content: 'Gate Entry No.:', styles: { fontStyle: 'bold', fillColor: LIGHT } }, grn.geNo || '-',
        { content: 'Gate Entry Date:', styles: { fontStyle: 'bold', fillColor: LIGHT } }, grn.geDate || '-',
      ],
    ],
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 2,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 32 }, 2: { cellWidth: 32 } },
    body: [
      [{ content: 'Work Order No.', styles: { fontStyle: 'bold', fillColor: LIGHT } }, grn.poNo, { content: 'PO Date', styles: { fontStyle: 'bold', fillColor: LIGHT } }, formatDate(grn.poDate)],
      [{ content: 'Vendor / Supplier', styles: { fontStyle: 'bold', fillColor: LIGHT } }, grn.vendorName, { content: 'Vendor Code', styles: { fontStyle: 'bold', fillColor: LIGHT } }, grn.vendorId || '-'],
      [{ content: 'Invoice No.', styles: { fontStyle: 'bold', fillColor: LIGHT } }, grn.invNo || '-', { content: 'Invoice Date', styles: { fontStyle: 'bold', fillColor: LIGHT } }, grn.invDate || '-'],
      [{ content: 'Challan No.', styles: { fontStyle: 'bold', fillColor: LIGHT } }, grn.challanNo || '-', { content: 'Challan Date', styles: { fontStyle: 'bold', fillColor: LIGHT } }, grn.challanDate || '-'],
      [{ content: 'LR / Transport No.', styles: { fontStyle: 'bold', fillColor: LIGHT } }, grn.lrNo || '-', { content: 'PR No.', styles: { fontStyle: 'bold', fillColor: LIGHT } }, grn.prNo || '-'],
      [{ content: 'Department', styles: { fontStyle: 'bold', fillColor: LIGHT } }, grn.department || '-', { content: 'Group', styles: { fontStyle: 'bold', fillColor: LIGHT } }, grn.group || '-'],
      [{ content: 'Remarks', styles: { fontStyle: 'bold', fillColor: LIGHT } }, { content: grn.remarks || '-', colSpan: 3 }],
    ],
  });

  const itemsHead = [['S.No', 'Item Code', 'Description', 'UOM', 'Rate', 'PO Qty', 'Received', 'Accepted', 'Rejected', 'Shortage', 'Basic Value', 'Disc %', 'Freight', 'GST %', 'Value w/ Tax', 'Total']];
  const itemsBody: RowInput[] = grn.items.map((it, idx) => {
    const accepted = (it.receivedQty || 0) - (it.rejectedQty || 0);
    return [
      idx + 1,
      it.itemCode || '',
      it.description,
      it.uom,
      (it.unitPrice || 0).toFixed(2),
      it.billedQty,
      it.receivedQty,
      accepted.toFixed(2),
      (it.rejectedQty || 0).toFixed(2),
      (it.shortQty || 0).toFixed(2),
      (it.basicValue || 0).toFixed(2),
      it.discPercent || '-',
      (it.freight || 0).toFixed(2),
      `${it.gstPercent || 0}%`,
      (it.valueWithTax || 0).toFixed(2),
      (it.totalGrnValue || 0).toFixed(2),
    ];
  });

  const totals = {
    billed: sum(grn.items.map((x) => x.billedQty || 0)),
    received: sum(grn.items.map((x) => x.receivedQty || 0)),
    accepted: sum(grn.items.map((x) => (x.receivedQty || 0) - (x.rejectedQty || 0))),
    rejected: sum(grn.items.map((x) => x.rejectedQty || 0)),
    short: sum(grn.items.map((x) => x.shortQty || 0)),
    basic: sum(grn.items.map((x) => x.basicValue || 0)),
    freight: sum(grn.items.map((x) => x.freight || 0)),
    withTax: sum(grn.items.map((x) => x.valueWithTax || 0)),
    total: sum(grn.items.map((x) => x.totalGrnValue || 0)),
  };
  itemsBody.push([
    { content: 'TOTAL', colSpan: 5, styles: { fontStyle: 'bold' } },
    { content: String(totals.billed), styles: { fontStyle: 'bold' } },
    { content: String(totals.received), styles: { fontStyle: 'bold' } },
    { content: totals.accepted.toFixed(2), styles: { fontStyle: 'bold' } },
    { content: totals.rejected.toFixed(2), styles: { fontStyle: 'bold' } },
    { content: totals.short.toFixed(2), styles: { fontStyle: 'bold' } },
    { content: totals.basic.toFixed(2), styles: { fontStyle: 'bold' } },
    '-',
    { content: totals.freight ? totals.freight.toFixed(2) : '-', styles: { fontStyle: 'bold' } },
    '-',
    { content: totals.withTax.toFixed(2), styles: { fontStyle: 'bold' } },
    { content: totals.total.toFixed(2), styles: { fontStyle: 'bold' } },
  ]);

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 4,
    head: itemsHead,
    body: itemsBody,
    styles: { fontSize: 6.5, cellPadding: 1.2 },
    headStyles: { fillColor: NAVY, fontSize: 6.5 },
  });

  let y = doc.lastAutoTable.finalY + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Total GRN Value (Rs.): ${totals.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 14, y);
  y += 9;

  doc.text('CERTIFICATION', 14, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const certLine1 = doc.splitTextToSize(
    'This is to certify that the items specified above have been received in good condition and quantity as mentioned.',
    180,
  );
  doc.text(certLine1, 14, y);
  y += certLine1.length * 4 + 3;
  const certLine2 = doc.splitTextToSize(
    'The quality and quantity of the material have been verified and found satisfactory.',
    180,
  );
  doc.text(certLine2, 14, y);
  y += certLine2.length * 4 + 6;

  autoTable(doc, {
    startY: y,
    head: [['Prepared By', 'Verified By', 'Approved By']],
    body: [[
      `Name: ${grn.preparedBy?.name || '-'}\nDesignation: ${grn.preparedBy?.designation || '-'}\n\nDate: ${formatDate(grn.preparedBy?.timestamp)}`,
      grn.verifiedBy ? `Name: ${grn.verifiedBy.name}\nDesignation: ${grn.verifiedBy.designation || '-'}\n\nDate: ${formatDate(grn.verifiedBy.timestamp)}` : 'Pending',
      grn.approvedBy ? `Name: ${grn.approvedBy.name}\nDesignation: ${grn.approvedBy.designation || '-'}\n\nDate: ${formatDate(grn.approvedBy.timestamp)}` : 'Pending',
    ]],
    styles: { fontSize: 8, minCellHeight: 22, valign: 'top' },
    headStyles: { fillColor: NAVY },
  });

  const noteY = doc.lastAutoTable.finalY + 6;
  doc.setFontSize(7);
  doc.setTextColor(100);
  doc.text('Note: 1. This is a system generated document.  2. No signature is required if digitally approved.', 14, noteY);
  doc.setTextColor(0);

  return doc;
};

const grnPdfFilename = (grn: GRNRecord) => `GRN_${grn.grnNo.replace(/[/\\]/g, '_')}.pdf`;

export const downloadGrnAsPdf = async (grn: GRNRecord) => {
  const doc = await buildGrnPdfDoc(grn);
  doc.save(grnPdfFilename(grn));
};

// Used by the "generate from GRN" purchase-flow attachment flow — same PDF as the download
// path, but as a Blob (+ filename) ready to be wrapped in a File and uploaded.
export const buildGrnPdfBlob = async (grn: GRNRecord): Promise<{ blob: Blob; filename: string }> => {
  const doc = await buildGrnPdfDoc(grn);
  return { blob: doc.output('blob'), filename: grnPdfFilename(grn) };
};
