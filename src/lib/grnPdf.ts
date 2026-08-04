// jsPDF-based GRN document generator — mirrors GrnDocumentPreview.tsx's on-screen layout,
// but as an actual PDF Blob (rather than a print-window HTML string like GrnPrint.tsx uses).
// Built specifically so a GRN can be "generated & attached" to a purchase-flow step without
// the user manually printing/saving/re-uploading a file themselves.

import jsPDF from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import logo3f from '@/Assets/3f-logo.png';
import type { GRNRecord } from '@/lib/grnApi';
import { formatDateDDMMYYYY } from '@/lib/dateFormat';
import { getPersonEntry } from '@/lib/signatureDiary';
import { loadGrnAnnexure } from '@/lib/grnAnnexure';

const COMPANY_NAME = 'SAI BIORESOURCES PRIVATE LIMITED';
const COMPANY_ADDRESS = 'Khasra No. 121/1, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh - 491001';
const PROJECT_GREEN: [number, number, number] = [13, 58, 53];
const LIGHT_GREEN: [number, number, number] = [241, 247, 245];
const GRID_GREEN: [number, number, number] = [183, 203, 198];

type JsPdfWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };

const formatDate = (v?: string) => formatDateDDMMYYYY(v, v || '-');
const formatNumber = (value: number, decimals = 2) => value.toLocaleString('en-IN', {
  minimumFractionDigits: decimals,
  maximumFractionDigits: decimals,
});

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
  if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', 95, 7, 20, 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...PROJECT_GREEN);
  doc.text(COMPANY_NAME, 105, 33, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(COMPANY_ADDRESS, 105, 38, { align: 'center' });
  doc.setFillColor(...PROJECT_GREEN);
  doc.roundedRect(14, 41, 182, 7, 1.2, 1.2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('GOODS RECEIPT NOTE (GRN)', 105, 46, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(26, 34, 51);

  autoTable(doc, {
    startY: 50,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, lineColor: GRID_GREEN, lineWidth: 0.15 },
    columnStyles: { 0: { cellWidth: 32 }, 2: { cellWidth: 32 } },
    body: [
      [
        { content: 'GRN No.:', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, grn.grnNo,
        { content: 'GRN Date:', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, formatDate(grn.grnDate),
      ],
      [
        { content: 'Gate Entry No.:', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, grn.geNo || '-',
        { content: 'Gate Entry Date:', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, formatDate(grn.geDate),
      ],
    ],
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 2,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, lineColor: GRID_GREEN, lineWidth: 0.15 },
    columnStyles: { 0: { cellWidth: 32 }, 2: { cellWidth: 32 } },
    body: [
      [{ content: 'Purchase Order No.', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, grn.poNo, { content: 'PO Date', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, formatDate(grn.poDate)],
      [{ content: 'Vendor / Supplier', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, grn.vendorName, { content: 'Vendor Code', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, grn.vendorId || '-'],
      [{ content: 'Invoice No.', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, grn.invNo || '-', { content: 'Invoice Date', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, formatDate(grn.invDate)],
      [{ content: 'Challan No.', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, grn.challanNo || '-', { content: 'Challan Date', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, formatDate(grn.challanDate)],
      [{ content: 'LR / Transport No.', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, grn.lrNo || '-', { content: 'PR No.', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, grn.prNo || '-'],
      [{ content: 'Department', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, grn.department || '-', { content: 'Group', styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN } }, grn.group || '-'],
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
      formatNumber(it.unitPrice || 0, 2),
      formatNumber(it.billedQty || 0),
      formatNumber(it.receivedQty || 0),
      formatNumber(accepted, 2),
      formatNumber(it.rejectedQty || 0, 2),
      formatNumber(it.shortQty || 0, 2),
      formatNumber(it.basicValue || 0, 2),
      formatNumber(it.discPercent || 0),
      formatNumber(it.freight || 0, 2),
      `${formatNumber(it.gstPercent || 0)}%`,
      formatNumber(it.valueWithTax || 0, 2),
      formatNumber(it.totalGrnValue || 0, 2),
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
    { content: formatNumber(totals.billed), styles: { fontStyle: 'bold' } },
    { content: formatNumber(totals.received), styles: { fontStyle: 'bold' } },
    { content: formatNumber(totals.accepted, 2), styles: { fontStyle: 'bold' } },
    { content: formatNumber(totals.rejected, 2), styles: { fontStyle: 'bold' } },
    { content: formatNumber(totals.short, 2), styles: { fontStyle: 'bold' } },
    { content: formatNumber(totals.basic, 2), styles: { fontStyle: 'bold' } },
    '-',
    { content: formatNumber(totals.freight, 2), styles: { fontStyle: 'bold' } },
    '-',
    { content: formatNumber(totals.withTax, 2), styles: { fontStyle: 'bold' } },
    { content: formatNumber(totals.total, 2), styles: { fontStyle: 'bold' } },
  ]);

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 4,
    head: itemsHead,
    body: itemsBody,
    styles: { fontSize: 6.5, cellPadding: 1.2, lineColor: GRID_GREEN, lineWidth: 0.12 },
    headStyles: { fillColor: [255, 255, 255], textColor: [26, 34, 51], lineColor: GRID_GREEN, fontSize: 6.5, halign: 'center' },
  });

  let y = doc.lastAutoTable.finalY + 5;
  if (y > 225) { doc.addPage(); y = 15; }

  const summaryStartY = y;
  autoTable(doc, {
    startY: summaryStartY,
    theme: 'grid',
    tableWidth: 89,
    margin: { left: 14 },
    styles: { fontSize: 8, cellPadding: 2.2, lineColor: GRID_GREEN, lineWidth: 0.15 },
    columnStyles: { 0: { cellWidth: 61, fontStyle: 'bold', fillColor: LIGHT_GREEN, textColor: PROJECT_GREEN }, 1: { cellWidth: 28, halign: 'right' } },
    body: [
      ['Total PO Quantity', formatNumber(totals.billed)],
      ['Total Received Quantity', formatNumber(totals.received)],
      ['Total Accepted Quantity', formatNumber(totals.accepted, 2)],
      ['Total Rejected Quantity', formatNumber(totals.rejected, 2)],
    ],
  });
  const summaryEndY = doc.lastAutoTable.finalY;
  const totalBoxX = 107;
  const totalBoxWidth = 89;
  const totalBoxHeight = summaryEndY - summaryStartY;
  doc.setDrawColor(...PROJECT_GREEN);
  doc.setFillColor(...LIGHT_GREEN);
  doc.setLineWidth(0.7);
  doc.roundedRect(totalBoxX, summaryStartY, totalBoxWidth, totalBoxHeight, 2, 2, 'FD');
  doc.setTextColor(...PROJECT_GREEN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Total GRN Value (Rs.)', totalBoxX + 5, summaryStartY + (totalBoxHeight / 2) + 1);
  doc.setFontSize(14);
  doc.text(formatNumber(totals.total, 2), totalBoxX + totalBoxWidth - 5, summaryStartY + (totalBoxHeight / 2) + 1, { align: 'right' });
  doc.setTextColor(26, 34, 51);
  y = summaryEndY + 5;

  doc.setFillColor(...PROJECT_GREEN);
  doc.roundedRect(14, y, 182, 6, 1, 1, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text('NOTES', 105, y + 4.2, { align: 'center' });
  y += 9;
  doc.setTextColor(74, 85, 104);
  doc.setFont('helvetica', 'normal');
  const notes = doc.splitTextToSize(grn.remarks || 'No additional notes recorded.', 176);
  doc.text(notes, 17, y);
  y += Math.max(7, notes.length * 3.5 + 3);

  doc.setFillColor(...PROJECT_GREEN);
  doc.roundedRect(14, y, 182, 6, 1, 1, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('CERTIFICATION', 105, y + 4.2, { align: 'center' });
  y += 10;
  doc.setTextColor(26, 34, 51);
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

  const isApproved = grn.status === 'approved';
  const signatureImages = [grn.preparedBy, grn.verifiedBy, grn.approvedBy].map((signer) => (
    isApproved && signer?.name ? getPersonEntry(signer.name)?.signature || '' : ''
  ));
  const signerCell = (signer: GRNRecord['preparedBy']) => ({
    content: signer
      ? `${isApproved ? 'DIGITALLY SIGNED\n' : ''}Name: ${signer.name}\nDesignation: ${signer.designation || '-'}\nDate: ${formatDate(signer.timestamp)}`
      : 'Pending',
    styles: isApproved && signer ? { textColor: PROJECT_GREEN, fontStyle: 'bold' as const } : undefined,
  });

  autoTable(doc, {
    startY: y,
    head: [['Prepared By', 'Verified By', 'Approved By']],
    body: [[signerCell(grn.preparedBy), signerCell(grn.verifiedBy), signerCell(grn.approvedBy)]],
    styles: { fontSize: 8, minCellHeight: isApproved ? 30 : 22, valign: 'top' },
    headStyles: { fillColor: PROJECT_GREEN },
    tableLineColor: GRID_GREEN,
    didDrawCell: (data) => {
      if (!isApproved || data.section !== 'body' || data.row.index !== 0) return;
      const signature = signatureImages[data.column.index];
      if (!signature) return;
      const mime = signature.match(/^data:image\/(png|jpe?g)/i)?.[1]?.toUpperCase();
      if (!mime) return;
      try {
        doc.addImage(signature, mime === 'JPG' ? 'JPEG' : mime, data.cell.x + data.cell.width - 31, data.cell.y + 2, 28, 8);
      } catch {
        // The textual digital-signature stamp remains the verification fallback.
      }
    },
  });

  const annexure = await loadGrnAnnexure(grn).catch(() => ({ gateEntries: [], itemPictures: [] }));
  doc.addPage();
  if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', 96, 7, 18, 18);
  doc.setTextColor(...PROJECT_GREEN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(COMPANY_NAME, 105, 31, { align: 'center' });
  doc.setTextColor(74, 85, 104);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(COMPANY_ADDRESS, 105, 36, { align: 'center' });
  doc.setFillColor(...PROJECT_GREEN);
  doc.roundedRect(14, 40, 182, 8, 1.2, 1.2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('ANNEXURE - A', 105, 45.5, { align: 'center' });
  doc.setTextColor(74, 85, 104);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Gate Entry Details and Item Pictures - GRN ${grn.grnNo} - PO ${grn.poNo}`, 105, 53, { align: 'center' });

  const annexureGateRows: RowInput[] = annexure.gateEntries.length
    ? annexure.gateEntries.map((entry) => [
      entry.siteEntryNo || entry.enteryId,
      `${formatDate(entry.entryDate)} ${entry.entryTime || ''}`,
      entry.destinationName || entry.gateNo || '-',
      entry.vendorName || '-',
      `${entry.invoiceNumber || '-'} / ${entry.challanNumber || '-'}`,
      entry.itemName || '-',
      `${formatNumber(entry.itemQuantity || 0)} ${entry.itemUnit || ''}`,
    ])
    : [[{ content: 'Gate entry details are not available.', colSpan: 7, styles: { halign: 'center', textColor: [113, 128, 150] } }]];

  autoTable(doc, {
    startY: 57,
    head: [['Gate Entry No.', 'Date & Time', 'Gate / Destination', 'Vendor', 'Invoice / Challan', 'Item', 'Quantity']],
    body: annexureGateRows,
    styles: { fontSize: 6.5, cellPadding: 1.7, lineColor: GRID_GREEN, lineWidth: 0.12, valign: 'middle' },
    headStyles: { fillColor: [255, 255, 255], textColor: [26, 34, 51], fontStyle: 'bold', halign: 'center' },
    columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 24 }, 2: { cellWidth: 27 }, 3: { cellWidth: 30 }, 4: { cellWidth: 28 }, 5: { cellWidth: 27 }, 6: { cellWidth: 22, halign: 'right' } },
  });

  let annexureY = doc.lastAutoTable.finalY + 6;
  doc.setFillColor(...PROJECT_GREEN);
  doc.roundedRect(14, annexureY, 182, 6, 1, 1, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('ITEM PICTURES', 105, annexureY + 4.2, { align: 'center' });
  annexureY += 10;

  if (!annexure.itemPictures.length) {
    doc.setTextColor(113, 128, 150);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('No item pictures are available.', 105, annexureY + 8, { align: 'center' });
  } else {
    const cardWidth = 56;
    const cardHeight = 46;
    for (let index = 0; index < annexure.itemPictures.length; index += 1) {
      const column = index % 3;
      if (column === 0 && index > 0) annexureY += cardHeight + 5;
      if (annexureY + cardHeight > 282) {
        doc.addPage();
        annexureY = 15;
      }
      const x = 14 + (column * (cardWidth + 7));
      doc.setDrawColor(...GRID_GREEN);
      doc.setFillColor(248, 251, 250);
      doc.roundedRect(x, annexureY, cardWidth, cardHeight, 1.5, 1.5, 'FD');
      const picture = annexure.itemPictures[index];
      let imageData: string | null = null;
      if (picture.imageUrl) {
        try { imageData = await fetchImageDataUrl(picture.imageUrl); } catch { imageData = null; }
      }
      if (imageData) {
        try { doc.addImage(imageData, x + 2, annexureY + 2, cardWidth - 4, 31); } catch { imageData = null; }
      }
      if (!imageData) {
        doc.setTextColor(113, 128, 150);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text('No picture recorded', x + (cardWidth / 2), annexureY + 18, { align: 'center' });
      }
      doc.setTextColor(26, 34, 51);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text(doc.splitTextToSize(picture.itemName, cardWidth - 4).slice(0, 1), x + 2, annexureY + 37);
      doc.setTextColor(113, 128, 150);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.text(picture.itemCode || picture.itemId, x + 2, annexureY + 42);
    }
  }

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
