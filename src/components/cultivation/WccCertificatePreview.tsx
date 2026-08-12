import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { X, Download, Printer, ArrowUpRight, Loader2, AlertCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';
import { useAuth } from '@/context/AuthContext';
import logo3f from '@/Assets/3f-logo.png';
import type { ApiWorkDoneEntry, ApiOperationalWorkDoneEntry, ApiTaskDetails, WccScopeLand } from './WccModal';
import { WCC_WORK_TEMPLATES, calculateWccTotals, type WccEnterpriseDraft } from '@/lib/wccEnterprise';

const BASE_URL = getBaseUrl().replace(/\/$/, '');

// SAI Bioresources' fixed letterhead — the issuing entity for every WCC, not vendor-specific.
const COMPANY_NAME = 'SAI BIORESOURCES PRIVATE LIMITED';
const COMPANY_ADDRESS = 'Khasra No. 121/1, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh – 491001';

const formatDate = (d?: string) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const acres = (n: number) => `${n.toFixed(2)} Acres`;
const formatInr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─────────────────────────────────────────────────────────────
// Pivot: crop → land → activity → completed acres (dedup'd by plot+activity so the same
// plot doesn't get double-counted if it shows up across multiple work-done entries).
// ─────────────────────────────────────────────────────────────
interface AnnexureRow {
  landId: string;
  farmerName: string;
  area: number;
  byActivity: Record<string, number>;
  total: number;
}

interface CropGroup {
  crop: string;
  rows: AnnexureRow[];
  subtotalByActivity: Record<string, number>;
  subtotalTotal: number;
}

// Non-cultivation vendor work (e.g. rental vehicle log books, via the Operational Calendar) —
// shown as its own section since it has no land/crop/acreage to fit into the pivot grid above.
export interface AnnexureOperationalLine {
  activity: string;
  from_date: string;
  to_date: string;
  quantity: number;
  unit: string;
}

export interface AnnexurePivot {
  activities: string[];
  crops: CropGroup[];
  grandByActivity: Record<string, number>;
  grandTotal: number;
  operationalLines: AnnexureOperationalLine[];
  enterprise?: WccEnterpriseDraft;
}

const EMPTY_PIVOT: AnnexurePivot = { activities: [], crops: [], grandByActivity: {}, grandTotal: 0, operationalLines: [] };

const buildAnnexurePivot = (
  workDone: ApiWorkDoneEntry[],
  taskDetailsById: Record<string, ApiTaskDetails>,
  scopeItems: WccScopeLand[],
  operationalWorkDone: ApiOperationalWorkDoneEntry[] = [],
): AnnexurePivot => {
  const plotCropById = new Map<string, string>();
  const landById = new Map<string, WccScopeLand>();
  for (const land of scopeItems) {
    landById.set(land.land_id, land);
    for (const plot of land.plots) {
      plotCropById.set(plot.plot_id, plot.crop_type || 'Unknown');
    }
  }

  const activityOrder: string[] = [];
  const cropOrder: string[] = [];
  // crop -> land_id -> activity -> acres
  const grid = new Map<string, Map<string, Map<string, number>>>();
  const counted = new Set<string>(); // `${plot_id}__${activity}` — one credit per plot+activity

  for (const entry of workDone) {
    const details = taskDetailsById[entry.task_id];
    const activity = details?.assigned_acres?.find((a) => a.farm_id === entry.farm_id)?.activity || 'Unknown Activity';
    if (!activityOrder.includes(activity)) activityOrder.push(activity);

    for (const plot of entry.plot) {
      if ((plot.status || '').trim().toLowerCase() !== 'completed') continue;
      const dedupeKey = `${plot.plot_id}__${activity}`;
      if (counted.has(dedupeKey)) continue;
      counted.add(dedupeKey);

      const crop = plotCropById.get(plot.plot_id) || 'Unknown';
      if (!cropOrder.includes(crop)) cropOrder.push(crop);

      if (!grid.has(crop)) grid.set(crop, new Map());
      const byLand = grid.get(crop)!;
      if (!byLand.has(entry.farm_id)) byLand.set(entry.farm_id, new Map());
      const byActivity = byLand.get(entry.farm_id)!;
      byActivity.set(activity, (byActivity.get(activity) || 0) + (Number(plot.plot_area) || 0));
    }
  }

  const crops: CropGroup[] = cropOrder.map((crop) => {
    const byLand = grid.get(crop)!;
    const rows: AnnexureRow[] = Array.from(byLand.entries())
      .map(([landId, byActivity]) => {
        const land = landById.get(landId);
        const area = (land?.plots || [])
          .filter((p) => (p.crop_type || 'Unknown') === crop)
          .reduce((s, p) => s + (Number(p.plot_area) || 0), 0);
        const byActivityObj: Record<string, number> = {};
        let total = 0;
        byActivity.forEach((val, act) => { byActivityObj[act] = val; total += val; });
        return {
          landId,
          farmerName: land?.farmer_name || land?.farmer_id || landId,
          area,
          byActivity: byActivityObj,
          total,
        };
      })
      .sort((a, b) => a.farmerName.localeCompare(b.farmerName));

    const subtotalByActivity: Record<string, number> = {};
    let subtotalTotal = 0;
    for (const row of rows) {
      for (const act of activityOrder) {
        subtotalByActivity[act] = (subtotalByActivity[act] || 0) + (row.byActivity[act] || 0);
      }
      subtotalTotal += row.total;
    }

    return { crop, rows, subtotalByActivity, subtotalTotal };
  });

  const grandByActivity: Record<string, number> = {};
  let grandTotal = 0;
  for (const group of crops) {
    for (const act of activityOrder) {
      grandByActivity[act] = (grandByActivity[act] || 0) + (group.subtotalByActivity[act] || 0);
    }
    grandTotal += group.subtotalTotal;
  }

  const operationalLines: AnnexureOperationalLine[] = operationalWorkDone.map((entry) => ({
    activity: entry.activity,
    from_date: entry.from_date,
    to_date: entry.to_date,
    quantity: Number(entry.quantity) || 0,
    unit: entry.unit || '',
  }));

  return { activities: activityOrder, crops, grandByActivity, grandTotal, operationalLines };
};

// Flat, numbered certificate line items (crop-grouped, in pivot order) — shared by the
// on-screen table and the PDF so the S.No sequence always matches between the two.
interface CertificateLine {
  crop: string;
  activity: string;
  qty: number;
}

const buildCertificateLines = (pivot: AnnexurePivot): CertificateLine[] => {
  const lines: CertificateLine[] = [];
  pivot.crops.forEach((group) => {
    pivot.activities
      .filter((a) => (group.subtotalByActivity[a] || 0) > 0)
      .forEach((a) => {
        lines.push({ crop: group.crop, activity: a, qty: group.subtotalByActivity[a] || 0 });
      });
  });
  return lines;
};

// ─────────────────────────────────────────────────────────────
// Persisted certificate record (admin_wcc_certificate_release) + approval workflow types
// ─────────────────────────────────────────────────────────────
export type WccCertificateStatus = 'pending_verification' | 'pending_approval' | 'approved' | 'needs_revision';

export interface WccCertificateSigner {
  staff_id: string;
  name: string;
  designation?: string;
  timestamp: string;
}

export interface WccCertificateRejection {
  stage: string;
  staff_id: string;
  name: string;
  reason: string;
  timestamp: string;
}

export interface WccCertificateRecord {
  certificate_id: string;
  order_number: string;
  vendor_id: string;
  vendor_name: string;
  block_id: string;
  block_name: string;
  scope_of_work: string;
  from_date: string;
  to_date: string;
  annexure: AnnexurePivot;
  rate_per_acre: number;
  total_quantity: number;
  total_certified_value: number;
  status: WccCertificateStatus;
  prepared_by: WccCertificateSigner;
  verified_by: WccCertificateSigner | Record<string, never>;
  approved_by: WccCertificateSigner | Record<string, never>;
  rejection: WccCertificateRejection | null;
  revision_count: number;
  created_at: string;
}

export type WccCertificateMode = 'create' | 'revise' | 'review' | 'view';

export const STATUS_LABEL: Record<WccCertificateStatus, string> = {
  pending_verification: 'Pending Verification',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  needs_revision: 'Needs Revision',
};
export const STATUS_TONE: Record<WccCertificateStatus, string> = {
  pending_verification: 'bg-orange-50 text-orange-700 border-orange-200',
  pending_approval: 'bg-blue-50 text-blue-700 border-blue-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  needs_revision: 'bg-red-50 text-red-700 border-red-200',
};

const hasSigned = (signer: WccCertificateSigner | Record<string, never> | undefined): signer is WccCertificateSigner =>
  !!signer && 'staff_id' in signer && !!signer.staff_id;

// ─────────────────────────────────────────────────────────────
// Editable fields the preparer fills before submitting — none of this exists anywhere
// else until it's persisted via create_certificate.
// ─────────────────────────────────────────────────────────────
interface CertificateMeta {
  certNo: string;
  certDate: string;
  woNumber: string;
  ratePerAcre: string;
}

const EMPTY_META: CertificateMeta = {
  certNo: '',
  certDate: new Date().toISOString().slice(0, 10),
  woNumber: '',
  ratePerAcre: '',
};

const inputCls = 'w-full bg-transparent outline-none border-b border-dashed border-gray-300 focus:border-[#0D3A35] px-0.5';

// ─────────────────────────────────────────────────────────────
// PDF export — a jsPDF + intersection type is used instead of `any` to read the finalY
// that jspdf-autotable attaches to the doc instance after each table it draws.
// ─────────────────────────────────────────────────────────────
type JsPdfWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };

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

interface SignerDisplay { name: string; designation: string }

export interface PdfExportParams {
  pivot: AnnexurePivot;
  vendorName: string;
  fromDate: string;
  toDate: string;
  certNo: string;
  certDate: string;
  woNumber: string;
  rate: number;
  blockLabel: string;
  scopeOfWorkLabel: string;
  preparedBy: SignerDisplay;
  verifiedBy: SignerDisplay | null;
  approvedBy: SignerDisplay | null;
}

// Builds the certificate PDF document (Annexure + WCC pages) without saving/exporting it —
// shared by the direct-download path and the "generate & attach to purchase flow" path.
const buildCertificatePdfDoc = async (p: PdfExportParams): Promise<JsPdfWithAutoTable> => {
  const { pivot, vendorName, fromDate, toDate, certNo, certDate, woNumber, rate, blockLabel, scopeOfWorkLabel, preparedBy, verifiedBy, approvedBy } = p;
  const doc = new jsPDF() as JsPdfWithAutoTable;
  const enterprise = pivot.enterprise;
  const enterpriseTotals = enterprise ? calculateWccTotals(enterprise) : null;
  const enterpriseTemplate = enterprise ? WCC_WORK_TEMPLATES.find((item) => item.id === enterprise.header.workCategory) : undefined;
  const cropLabel = pivot.crops.map((g) => titleCase(g.crop)).join(' + ') || 'No Crop';

  // ── Page 1: Annexure ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('ANNEXURE', 105, 15, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(vendorName, 105, 22, { align: 'center' });
  doc.text(`${formatDate(fromDate)} - ${formatDate(toDate)}`, 105, 27, { align: 'center' });

  const annexureHead = [['S.No', 'Name', 'Area', ...pivot.activities, 'Total']];
  const annexureBody: RowInput[] = [];
  pivot.crops.forEach((group) => {
    annexureBody.push([{
      content: `${titleCase(group.crop)} Crop`,
      colSpan: annexureHead[0].length,
      styles: { fontStyle: 'bold', fillColor: [241, 245, 249] },
    }]);
    group.rows.forEach((row, i) => {
      annexureBody.push([
        i + 1,
        row.farmerName,
        acres(row.area),
        ...pivot.activities.map((a) => (row.byActivity[a] ? acres(row.byActivity[a]) : '')),
        { content: acres(row.total), styles: { fontStyle: 'bold' } },
      ]);
    });
    annexureBody.push([
      { content: `Total ${titleCase(group.crop)} Crop`, colSpan: 2, styles: { fontStyle: 'bold' } },
      '',
      ...pivot.activities.map((a) => ({ content: acres(group.subtotalByActivity[a] || 0), styles: { fontStyle: 'bold' as const } })),
      { content: acres(group.subtotalTotal), styles: { fontStyle: 'bold' } },
    ]);
  });
  annexureBody.push([
    { content: `Total (${cropLabel} Crop)`, colSpan: 3, styles: { fontStyle: 'bold', fillColor: [224, 231, 255] } },
    ...pivot.activities.map((a) => ({ content: acres(pivot.grandByActivity[a] || 0), styles: { fontStyle: 'bold' as const, fillColor: [224, 231, 255] as [number, number, number] } })),
    { content: acres(pivot.grandTotal), styles: { fontStyle: 'bold', fillColor: [224, 231, 255] } },
  ]);

  autoTable(doc, { startY: 32, head: annexureHead, body: annexureBody, styles: { fontSize: 7 }, headStyles: { fillColor: [30, 41, 59] } });

  if (pivot.operationalLines.length > 0) {
    const opStartY = (doc as JsPdfWithAutoTable).lastAutoTable.finalY + 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Operational Work (Non-Cultivation)', 14, opStartY);
    autoTable(doc, {
      startY: opStartY + 2,
      head: [['Activity', 'From', 'To', 'Quantity', 'Unit']],
      body: pivot.operationalLines.map((l) => [l.activity, formatDate(l.from_date), formatDate(l.to_date), l.quantity, l.unit]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [30, 41, 59] },
    });
  }

  // ── Page 2: Work Completion Certificate ──
  doc.addPage();

  let logoDataUrl: string | null = null;
  try { logoDataUrl = await fetchImageDataUrl(logo3f); } catch { logoDataUrl = null; }
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', 98, 8, 14, 14);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(COMPANY_NAME, 105, 28, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(COMPANY_ADDRESS, 105, 33, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('WORK COMPLETION CERTIFICATE', 105, 40, { align: 'center' });
  doc.setFont('helvetica', 'normal');

  autoTable(doc, {
    startY: 45,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    body: [[
      { content: 'Certificate No.:', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
      certNo || '—',
      { content: 'Date:', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
      formatDate(certDate),
    ]],
    columnStyles: { 0: { cellWidth: 32 }, 2: { cellWidth: 18 } },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 2,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 50 } },
    body: [
      [{ content: 'Order No.', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }, woNumber || '—'],
      [{ content: 'WCC Type', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }, enterprise?.header.wccType?.replace(/_/g, ' ') || 'Partial'],
      [{ content: 'Project / Site', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }, enterprise?.header.projectSiteLabel || blockLabel || '—'],
      [{ content: 'Work Category', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }, enterpriseTemplate?.label || 'Cultivation & Agricultural Fieldwork'],
      [{ content: 'Work Location / Land', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }, enterprise?.landIds?.length ? enterprise.landIds.join(', ') : 'As per Annexure / Service Lines'],
      [{ content: 'Vendor / Contractor Name', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }, vendorName],
      [{ content: 'Scope of Work', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }, scopeOfWorkLabel || '—'],
    ],
  });

  const lines = buildCertificateLines(pivot);
  const activityHead = [['S.No', 'Activity', 'UoM', 'Work Done Quantity', 'Rate (₹)', 'Total (₹)']];
  const activityBody: RowInput[] = [];
  let lastCrop: string | null = null;
  (enterprise ? enterprise.serviceLines.filter((line) => line.selected).map((line) => ({ crop: enterpriseTemplate?.label || 'Contracted Work', activity: line.description, qty: line.currentQty, unit: line.unit, rate: line.rate })) : lines.map((line) => ({ ...line, unit: 'Acre', rate }))).forEach((line, idx) => {
    if (line.crop !== lastCrop) {
      activityBody.push([{ content: `${titleCase(line.crop)} :-`, colSpan: 6, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }]);
      lastCrop = line.crop;
    }
    activityBody.push([
      idx + 1,
      `${titleCase(line.crop)} - ${line.activity}`,
      line.unit,
      line.qty.toFixed(2),
      line.rate ? line.rate.toFixed(2) : '—',
      line.rate ? (line.qty * line.rate).toFixed(2) : '—',
    ]);
  });
  activityBody.push([
    { content: 'Total Value', colSpan: 3, styles: { fontStyle: 'bold' } },
    { content: pivot.grandTotal.toFixed(2), styles: { fontStyle: 'bold' } },
    '',
    { content: enterpriseTotals ? enterpriseTotals.gross.toFixed(2) : rate ? (pivot.grandTotal * rate).toFixed(2) : '—', styles: { fontStyle: 'bold' } },
  ]);

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 4,
    head: activityHead,
    body: activityBody,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59] },
  });

  let y = doc.lastAutoTable.finalY + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const certifiedValue = enterpriseTotals ? formatInr(enterpriseTotals.gross) : rate ? formatInr(pivot.grandTotal * rate) : '—';
  doc.text(`Total Certified Value (₹): ${certifiedValue}`, 14, y);
  y += 5;
  doc.text(`Cumulative Certified Value: ${enterpriseTotals ? formatInr(enterpriseTotals.cumulative) : certifiedValue}`, 14, y);
  y += 5;
  doc.text(`Net Recommended for Invoice Matching: ${enterpriseTotals ? formatInr(enterpriseTotals.net) : certifiedValue}`, 14, y);
  y += 9;

  doc.text('CERTIFICATION', 14, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const certLine1 = doc.splitTextToSize(
    `This is to certify that the work described above has been completed by ${vendorName} in accordance with the terms and conditions of the linked order and has been physically verified by the undersigned.`,
    180,
  );
  doc.text(certLine1, 14, y);
  y += certLine1.length * 4 + 3;
  const certLine2 = doc.splitTextToSize(
    'The quality and quantity of work executed have been found satisfactory and the work is recommended for processing of payment.',
    180,
  );
  doc.text(certLine2, 14, y);
  y += certLine2.length * 4 + 6;

  autoTable(doc, {
    startY: y,
    head: [['Prepared By', 'Verified By', 'Approved By']],
    body: [[
      `Name: ${preparedBy.name}\nDesignation: ${preparedBy.designation}\n\nSignature:`,
      verifiedBy ? `Name: ${verifiedBy.name}\nDesignation: ${verifiedBy.designation}\n\nSignature:` : 'Pending',
      approvedBy ? `Name: ${approvedBy.name}\nDesignation: ${approvedBy.designation}\n\nSignature:` : 'Pending',
    ]],
    styles: { fontSize: 8, minCellHeight: 25, valign: 'top' },
    headStyles: { fillColor: [30, 41, 59] },
  });

  if (enterprise) {
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('MEASUREMENT, QUALITY & EVIDENCE ANNEXURES', 105, 15, { align: 'center' });
    autoTable(doc, {
      startY: 22,
      head: [['Date', 'Location', 'Description', 'Calculated Qty.', 'Accepted Qty.', 'Unit', 'Source Ref.']],
      body: enterprise.measurements.map((item) => [formatDate(item.date), item.location, item.description, (item.length * item.width * Math.max(item.height, 1) * Math.max(item.count, 1)).toFixed(3), item.manualQty.toFixed(3), item.unit, item.sourceReference]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [13, 58, 53] },
    });
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 5,
      head: [['Inspection / Control', 'Result', 'Observations', 'Blocking', 'Resolved']],
      body: enterprise.checklist.map((item) => [item.label, item.result.replace(/_/g, ' '), item.remarks, item.blocking ? 'Yes' : 'No', item.resolved ? 'Yes' : 'No']),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [13, 58, 53] },
    });
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 5,
      head: [['Attachment', 'Category', 'Caption', 'Uploaded By', 'Uploaded On']],
      body: enterprise.attachments.map((item) => [item.name, item.category, item.caption, item.uploadedBy, formatDate(item.uploadedAt)]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [13, 58, 53] },
    });
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 5,
      head: [['Adjustment', 'Direction', 'Mode', 'Value', 'Reason', 'Approval Required']],
      body: enterprise.adjustments.map((item) => [item.type, item.direction, item.mode, item.value.toFixed(2), item.reason, item.approvalRequired ? 'Yes' : 'No']),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [13, 58, 53] },
    });
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 5,
      head: [['Date', 'User / Designation', 'Previous State', 'New State', 'Comments']],
      body: enterprise.history.map((item) => [formatDate(item.at), `${item.userName} / ${item.designation || '—'}`, item.from || 'New', item.to.replace(/_/g, ' '), item.comments]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [13, 58, 53] },
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100);
    doc.text(`${certNo || 'WCC'} · Revision ${enterprise?.revision || 0} · Verification Ref: ${enterprise?.draftId || certNo || 'WCC'}`, 14, 290);
    doc.text(`Page ${page} of ${pageCount}`, 196, 290, { align: 'right' });
  }

  return doc;
};

const certificatePdfFilename = (vendorName: string, fromDate: string, toDate: string) =>
  `WCC_${vendorName.replace(/\s+/g, '_')}_${fromDate}_to_${toDate}.pdf`;

const downloadCertificateAsPdf = async (p: PdfExportParams) => {
  const doc = await buildCertificatePdfDoc(p);
  doc.save(certificatePdfFilename(p.vendorName, p.fromDate, p.toDate));
};

// Used by the "generate from WCC certificate" purchase-flow attachment — produces the same
// PDF as the download button, but as a Blob (+ filename) ready to be wrapped in a File and
// uploaded, instead of triggering a browser download.
export const buildCertificatePdfBlob = async (p: PdfExportParams): Promise<{ blob: Blob; filename: string }> => {
  const doc = await buildCertificatePdfDoc(p);
  return { blob: doc.output('blob'), filename: certificatePdfFilename(p.vendorName, p.fromDate, p.toDate) };
};

// Derives the PDF-export params straight from a persisted certificate record — no React
// state needed, so this can be called from outside the preview component (e.g. the
// "generate from WCC" purchase-flow attachment flow).
export const wccParamsFromRecord = (record: WccCertificateRecord): PdfExportParams => ({
  pivot: record.annexure,
  vendorName: record.vendor_name,
  fromDate: record.from_date,
  toDate: record.to_date,
  certNo: record.certificate_id,
  certDate: record.created_at,
  woNumber: record.order_number,
  rate: record.rate_per_acre,
  blockLabel: record.block_name,
  scopeOfWorkLabel: record.scope_of_work,
  preparedBy: { name: record.prepared_by.name, designation: record.prepared_by.designation || '' },
  verifiedBy: hasSigned(record.verified_by) ? { name: record.verified_by.name, designation: record.verified_by.designation || '' } : null,
  approvedBy: hasSigned(record.approved_by) ? { name: record.approved_by.name, designation: record.approved_by.designation || '' } : null,
});

// ─────────────────────────────────────────────────────────────
// Small presentational helper — one "label | value" row in the Particulars table
// ─────────────────────────────────────────────────────────────
const ParticularRow = ({
  label, value, onChange, type = 'text', placeholder, staticValue, trailingAction,
}: {
  label: string;
  value?: string;
  onChange?: (v: string) => void;
  type?: 'text' | 'date';
  placeholder?: string;
  staticValue?: string;
  trailingAction?: ReactNode;
}) => (
  <tr className="border-b border-gray-200">
    <td className="w-1/3 px-3 py-1.5 font-semibold bg-slate-50 border-r border-gray-200 align-top">{label}</td>
    <td className="px-3 py-1.5">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          {staticValue !== undefined ? (
            <span>{staticValue}</span>
          ) : (
            <input
              type={type}
              value={value}
              placeholder={placeholder}
              onChange={(e) => onChange?.(e.target.value)}
              className={inputCls}
            />
          )}
        </div>
        {trailingAction}
      </div>
    </td>
  </tr>
);

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
export interface WccCertificatePreviewProps {
  onClose: () => void;
  mode?: WccCertificateMode;

  // 'create' mode — live data to compute a fresh Annexure/Certificate from
  vendorId?: string;
  vendorName?: string;
  vendorWoNumber?: string;
  scopeActivities?: string[];
  fromDate?: string;
  toDate?: string;
  workDone?: ApiWorkDoneEntry[];
  operationalWorkDone?: ApiOperationalWorkDoneEntry[];
  taskDetailsById?: Record<string, ApiTaskDetails>;
  scopeItems?: WccScopeLand[];

  // 'revise' | 'review' | 'view' modes — a previously persisted record
  existingRecord?: WccCertificateRecord;

  // Called after a successful submit/resubmit/verify/approve/reject so the opener
  // (an inbox list, the Certificate Releases list) can refresh itself.
  onChanged?: () => void;
}

const WccCertificatePreview = ({
  onClose,
  mode = 'create',
  vendorId,
  vendorName: vendorNameProp,
  vendorWoNumber,
  scopeActivities = [],
  fromDate: fromDateProp,
  toDate: toDateProp,
  workDone = [],
  operationalWorkDone = [],
  taskDetailsById = {},
  scopeItems = [],
  existingRecord,
  onChanged,
}: WccCertificatePreviewProps) => {
  const { user } = useAuth();
  const isCreateMode = mode === 'create';
  const isReviseMode = mode === 'revise';
  const isReviewMode = mode === 'review';
  const isViewMode = mode === 'view';
  const isReadOnly = isReviewMode || isViewMode;

  const [submitting, setSubmitting] = useState(false);
  const [submittedRecord, setSubmittedRecord] = useState<WccCertificateRecord | null>(null);
  const record = existingRecord ?? submittedRecord;
  const locked = isReadOnly || submittedRecord !== null;

  // Live pivot only matters pre-submission in create mode; every other mode (and a
  // create-mode certificate that's already been submitted) renders the frozen snapshot.
  const livePivot = useMemo(
    () => (isCreateMode ? buildAnnexurePivot(workDone, taskDetailsById, scopeItems, operationalWorkDone) : EMPTY_PIVOT),
    [isCreateMode, workDone, taskDetailsById, scopeItems, operationalWorkDone],
  );
  const pivot = record ? record.annexure : livePivot;
  const enterprise = pivot.enterprise;
  const enterpriseTotals = enterprise ? calculateWccTotals(enterprise) : null;
  const enterpriseTemplate = enterprise ? WCC_WORK_TEMPLATES.find((item) => item.id === enterprise.header.workCategory) : undefined;
  const certificateLines = useMemo(() => buildCertificateLines(pivot), [pivot]);
  const cropLabel = pivot.crops.map((g) => titleCase(g.crop)).join(' + ') || 'No Crop';
  const colCount = 3 + pivot.activities.length + 1;

  const vendorName = record?.vendor_name ?? vendorNameProp ?? '';
  const fromDate = record?.from_date ?? fromDateProp ?? '';
  const toDate = record?.to_date ?? toDateProp ?? '';

  const [meta, setMeta] = useState<CertificateMeta>(() => ({ ...EMPTY_META, woNumber: vendorWoNumber || '' }));
  const setField = (field: keyof CertificateMeta) => (v: string) => setMeta((prev) => ({ ...prev, [field]: v }));

  // Revise mode only re-opens the rate for editing (per the "fix the rate, resubmit" flow) —
  // the underlying completed-work snapshot and dates stay frozen from the original submission.
  const [reviseRate, setReviseRate] = useState(() => String(existingRecord?.rate_per_acre ?? ''));

  // Auto-fetch the next certificate number for this order, once, on open (create mode only) —
  // still editable afterward in case it needs correcting.
  useEffect(() => {
    if (!isCreateMode || !vendorWoNumber) return;
    fetch(`${BASE_URL}/admin_cultivation/get_next_certificate_id/${vendorWoNumber}`)
      .then((res) => res.json())
      .then((data: { success?: boolean; next_certificate_id?: string }) => {
        if (data?.success && data.next_certificate_id) {
          setMeta((prev) => ({ ...prev, certNo: data.next_certificate_id as string }));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Order-document side panel — lets the user tally the WO/PO before deciding the rate,
  // without leaving the certificate. Opens beside this popup at the same size.
  const [showOrderPreview, setShowOrderPreview] = useState(false);
  const [orderDocUrl, setOrderDocUrl] = useState<string | null>(null);
  const [orderDocLoading, setOrderDocLoading] = useState(false);
  const [orderDocError, setOrderDocError] = useState<string | null>(null);

  const displayWoNumber = record?.order_number ?? meta.woNumber;

  const handleOpenOrderPreview = () => {
    const orderNumber = displayWoNumber.trim();
    if (!orderNumber) return;
    setShowOrderPreview(true);
    setOrderDocUrl(null);
    setOrderDocError(null);
    setOrderDocLoading(true);
    fetch(`${BASE_URL}/purchase_flow/get_doc_url_of_order/${orderNumber}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.document_url) {
          throw new Error(data?.detail || 'Document not found for this order number');
        }
        setOrderDocUrl(data.document_url);
      })
      .catch((err) => setOrderDocError(err instanceof Error ? err.message : 'Failed to load order document'))
      .finally(() => setOrderDocLoading(false));
  };

  const rate = record ? (isReviseMode ? Number(reviseRate) || 0 : record.rate_per_acre) : (Number(meta.ratePerAcre) || 0);
  const certifiedValue = rate ? formatInr(pivot.grandTotal * rate) : '—';

  // Already known from the vendor's scope-of-work (get_scope_of_work_for_vendor) —
  // no need to type it in again.
  const scopeOfWorkLabel = record?.scope_of_work ?? scopeActivities.join(', ');

  // Block name(s) for the lands actually covered by this certificate — looked up from the
  // block directory rather than typed in, since block_id is already known per land.
  const [blockNameById, setBlockNameById] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!isCreateMode) return;
    let mounted = true;
    fetch(`${BASE_URL}/farmer_managment/get_blocks`)
      .then((res) => res.json())
      .then((data: { blocks?: Array<{ block_id: string; block_name: string }> }) => {
        if (!mounted) return;
        const map: Record<string, string> = {};
        for (const b of data?.blocks ?? []) {
          if (b?.block_id) map[b.block_id] = b.block_name;
        }
        setBlockNameById(map);
      })
      .catch(() => { if (mounted) setBlockNameById({}); });
    return () => { mounted = false; };
  }, [isCreateMode]);

  const liveBlockLabels = useMemo(() => {
    const landIdsInCertificate = new Set(pivot.crops.flatMap((g) => g.rows.map((r) => r.landId)));
    const names = new Set<string>();
    const ids = new Set<string>();
    for (const land of scopeItems) {
      if (!landIdsInCertificate.has(land.land_id)) continue;
      const name = blockNameById[land.block_id];
      if (name) names.add(name);
      if (land.block_id) ids.add(land.block_id);
    }
    return { name: Array.from(names).join(', '), id: Array.from(ids).join(', ') };
  }, [pivot, scopeItems, blockNameById]);

  const blockLabel = record?.block_name ?? liveBlockLabels.name;
  const blockIdLabel = record?.block_id ?? liveBlockLabels.id;

  const preparedByDisplay: SignerDisplay = record
    ? { name: record.prepared_by.name, designation: record.prepared_by.designation || '' }
    : { name: user?.name || '', designation: user?.designation || '' };
  const verifiedByDisplay: SignerDisplay | null = record && hasSigned(record.verified_by)
    ? { name: record.verified_by.name, designation: record.verified_by.designation || '' }
    : null;
  const approvedByDisplay: SignerDisplay | null = record && hasSigned(record.approved_by)
    ? { name: record.approved_by.name, designation: record.approved_by.designation || '' }
    : null;

  const certNoDisplay = record?.certificate_id ?? meta.certNo;
  const certDateDisplay = record?.created_at ?? meta.certDate;

  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const handleDownload = () => {
    downloadCertificateAsPdf({
      pivot,
      vendorName,
      fromDate,
      toDate,
      certNo: certNoDisplay,
      certDate: certDateDisplay,
      woNumber: displayWoNumber,
      rate,
      blockLabel,
      scopeOfWorkLabel,
      preparedBy: preparedByDisplay,
      verifiedBy: verifiedByDisplay,
      approvedBy: approvedByDisplay,
    }).catch((err) => console.error('Failed to generate WCC PDF:', err));
  };

  const handleSubmitForVerification = async () => {
    if (!user?.id || !user?.name) { toast.error('You must be logged in to submit a certificate.'); return; }
    if (!vendorId) { toast.error('Missing vendor.'); return; }
    if (!rate) { toast.error('Please enter a rate before submitting.'); return; }
    if (!displayWoNumber.trim()) { toast.error('Please enter an Order No. before submitting.'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}/admin_wcc_certificate/create_certificate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_number: displayWoNumber.trim(),
          vendor_id: vendorId,
          vendor_name: vendorName,
          block_id: blockIdLabel,
          block_name: blockLabel,
          scope_of_work: scopeOfWorkLabel,
          from_date: fromDate,
          to_date: toDate,
          annexure: pivot,
          rate_per_acre: rate,
          total_quantity: pivot.grandTotal,
          total_certified_value: pivot.grandTotal * rate,
          prepared_by: { staff_id: user.id, name: user.name, designation: user.designation || '' },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.detail || 'Failed to submit certificate');

      const now = new Date().toISOString();
      setSubmittedRecord({
        certificate_id: data.certificate_id,
        order_number: displayWoNumber.trim(),
        vendor_id: vendorId,
        vendor_name: vendorName,
        block_id: blockIdLabel,
        block_name: blockLabel,
        scope_of_work: scopeOfWorkLabel,
        from_date: fromDate,
        to_date: toDate,
        annexure: pivot,
        rate_per_acre: rate,
        total_quantity: pivot.grandTotal,
        total_certified_value: pivot.grandTotal * rate,
        status: 'pending_verification',
        prepared_by: { staff_id: user.id, name: user.name, designation: user.designation || '', timestamp: now },
        verified_by: {},
        approved_by: {},
        rejection: null,
        revision_count: 0,
        created_at: now,
      });
      toast.success(`Certificate ${data.certificate_id} submitted for verification`);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit certificate');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResubmit = async () => {
    if (!existingRecord) return;
    if (!user?.id || !user?.name) { toast.error('You must be logged in to resubmit a certificate.'); return; }
    const newRate = Number(reviseRate) || 0;
    if (!newRate) { toast.error('Please enter a rate before resubmitting.'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}/admin_wcc_certificate/resubmit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificate_id: existingRecord.certificate_id,
          from_date: existingRecord.from_date,
          to_date: existingRecord.to_date,
          annexure: existingRecord.annexure,
          rate_per_acre: newRate,
          total_quantity: existingRecord.annexure.grandTotal,
          total_certified_value: existingRecord.annexure.grandTotal * newRate,
          prepared_by: { staff_id: user.id, name: user.name, designation: user.designation || '' },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.detail || 'Failed to resubmit certificate');

      const now = new Date().toISOString();
      setSubmittedRecord({
        ...existingRecord,
        rate_per_acre: newRate,
        total_certified_value: existingRecord.annexure.grandTotal * newRate,
        status: 'pending_verification',
        prepared_by: { staff_id: user.id, name: user.name, designation: user.designation || '', timestamp: now },
        verified_by: {},
        approved_by: {},
        rejection: null,
        revision_count: existingRecord.revision_count + 1,
      });
      toast.success('Certificate resubmitted for verification');
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to resubmit certificate');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (action: 'verify' | 'approve' | 'reject') => {
    if (!existingRecord) return;
    if (!user?.id || !user?.name) { toast.error('You must be logged in.'); return; }
    if (action === 'reject' && !showRejectInput) { setShowRejectInput(true); return; }
    if (action === 'reject' && !rejectReason.trim()) { toast.error('Please provide a rejection reason.'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}/admin_wcc_certificate/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificate_id: existingRecord.certificate_id,
          action,
          staff_id: user.id,
          name: user.name,
          designation: user.designation || '',
          reason: action === 'reject' ? rejectReason.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.detail || 'Action failed');
      toast.success(
        action === 'verify' ? 'Certificate verified' : action === 'approve' ? 'Certificate approved' : 'Certificate sent back for revision',
      );
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center gap-4 bg-black/50 backdrop-blur-sm p-4">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .wcc-print-area, .wcc-print-area * { visibility: visible; }
          .wcc-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .wcc-no-print { display: none !important; }
        }
      `}</style>
      <div
        className={cn(
          'h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200',
          showOrderPreview ? 'w-full max-w-2xl' : 'w-full max-w-4xl',
        )}
      >
        {/* Header */}
        <div className="wcc-no-print flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800 truncate">Certificate Preview</h3>
              {record && (
                <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border', STATUS_TONE[record.status])}>
                  {STATUS_LABEL[record.status]}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate">{vendorName} · {formatDate(fromDate)} – {formatDate(toDate)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Download PDF
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Rejection banner (revise mode) */}
        {isReviseMode && existingRecord?.rejection && (
          <div className="wcc-no-print px-5 py-3 bg-red-50 border-b border-red-200 text-xs text-red-700 shrink-0">
            <span className="font-bold">Rejected at {existingRecord.rejection.stage.replace('pending_', '')} stage</span> by {existingRecord.rejection.name}: {existingRecord.rejection.reason}
          </div>
        )}

        {/* Printable content */}
        <div className="wcc-print-area flex-1 overflow-y-auto p-6 space-y-8 bg-slate-100">
          {pivot.crops.length === 0 && pivot.operationalLines.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">
              No completed work found for this vendor in the selected period.
            </div>
          ) : (
            <>
              {/* Annexure */}
              {pivot.crops.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h2 className="text-center text-base font-bold text-slate-900 uppercase tracking-wide">Annexure</h2>
                  <p className="text-center text-xs text-slate-500 mt-0.5">{vendorName} · {formatDate(fromDate)} – {formatDate(toDate)}</p>
                  <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-800 text-white">
                          <th className="px-2 py-2 text-left font-semibold">S.No</th>
                          <th className="px-2 py-2 text-left font-semibold">Name</th>
                          <th className="px-2 py-2 text-right font-semibold">Area</th>
                          {pivot.activities.map((a) => (
                            <th key={a} className="px-2 py-2 text-right font-semibold whitespace-nowrap">{a}</th>
                          ))}
                          <th className="px-2 py-2 text-right font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pivot.crops.map((group) => (
                          <Fragment key={group.crop}>
                            <tr className="bg-slate-100">
                              <td colSpan={colCount} className="px-2 py-1.5 font-bold text-slate-700">
                                {titleCase(group.crop)} Crop
                              </td>
                            </tr>
                            {group.rows.map((row, i) => (
                              <tr key={row.landId} className={cn('border-b border-gray-100', i % 2 === 1 && 'bg-slate-50/50')}>
                                <td className="px-2 py-1.5">{i + 1}</td>
                                <td className="px-2 py-1.5">{row.farmerName}</td>
                                <td className="px-2 py-1.5 text-right whitespace-nowrap">{acres(row.area)}</td>
                                {pivot.activities.map((a) => (
                                  <td key={a} className="px-2 py-1.5 text-right whitespace-nowrap">
                                    {row.byActivity[a] ? acres(row.byActivity[a]) : ''}
                                  </td>
                                ))}
                                <td className="px-2 py-1.5 text-right font-bold whitespace-nowrap">{acres(row.total)}</td>
                              </tr>
                            ))}
                            <tr className="border-b-2 border-gray-200 font-bold bg-slate-50">
                              <td className="px-2 py-1.5" colSpan={2}>Total {titleCase(group.crop)} Crop</td>
                              <td className="px-2 py-1.5" />
                              {pivot.activities.map((a) => (
                                <td key={a} className="px-2 py-1.5 text-right whitespace-nowrap">{acres(group.subtotalByActivity[a] || 0)}</td>
                              ))}
                              <td className="px-2 py-1.5 text-right whitespace-nowrap">{acres(group.subtotalTotal)}</td>
                            </tr>
                          </Fragment>
                        ))}
                        <tr className="bg-emerald-50 font-bold">
                          <td className="px-2 py-2" colSpan={3}>Total ({cropLabel} Crop)</td>
                          {pivot.activities.map((a) => (
                            <td key={a} className="px-2 py-2 text-right whitespace-nowrap">{acres(pivot.grandByActivity[a] || 0)}</td>
                          ))}
                          <td className="px-2 py-2 text-right whitespace-nowrap">{acres(pivot.grandTotal)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Operational work (non-cultivation) — e.g. rental vehicle log books */}
              {pivot.operationalLines.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h2 className="text-center text-base font-bold text-slate-900 uppercase tracking-wide">Operational Work</h2>
                  <p className="text-center text-xs text-slate-500 mt-0.5">{vendorName} · {formatDate(fromDate)} – {formatDate(toDate)}</p>
                  <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-800 text-white">
                          <th className="px-2 py-2 text-left font-semibold">Activity</th>
                          <th className="px-2 py-2 text-left font-semibold">From</th>
                          <th className="px-2 py-2 text-left font-semibold">To</th>
                          <th className="px-2 py-2 text-right font-semibold">Quantity</th>
                          <th className="px-2 py-2 text-left font-semibold">Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pivot.operationalLines.map((line, i) => (
                          <tr key={`${line.activity}-${i}`} className={cn('border-b border-gray-100', i % 2 === 1 && 'bg-slate-50/50')}>
                            <td className="px-2 py-1.5">{line.activity}</td>
                            <td className="px-2 py-1.5">{formatDate(line.from_date)}</td>
                            <td className="px-2 py-1.5">{formatDate(line.to_date)}</td>
                            <td className="px-2 py-1.5 text-right">{line.quantity}</td>
                            <td className="px-2 py-1.5">{line.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Work Completion Certificate — replica of the real document */}
              <div className="bg-white rounded-lg border-2 border-gray-800 overflow-hidden">
                {/* Letterhead */}
                <div className="text-center py-4 px-4 border-b-2 border-gray-800">
                  <img src={logo3f} alt="3F Logo" className="h-12 w-auto mx-auto mb-1" />
                  <h1 className="text-lg font-bold text-slate-900 tracking-wide">{COMPANY_NAME}</h1>
                  <p className="text-[11px] text-slate-600 mt-0.5">{COMPANY_ADDRESS}</p>
                  <h2 className="text-sm font-bold text-slate-900 mt-2 uppercase tracking-wide">Work Completion Certificate</h2>
                </div>

                {/* Certificate No. / Date */}
                <table className="w-full text-xs border-collapse">
                  <tbody>
                    <tr className="border-b border-gray-300">
                      <td className="w-36 px-3 py-2 font-semibold bg-slate-50 border-r border-gray-300">Certificate No.:</td>
                      <td className="px-3 py-2 border-r border-gray-300">
                        {locked || !isCreateMode ? (
                          <span>{certNoDisplay || '—'}</span>
                        ) : (
                          <input
                            value={meta.certNo}
                            placeholder="SBRPL/WCC/26-27/WO-XX/XXX"
                            onChange={(e) => setField('certNo')(e.target.value)}
                            className={inputCls}
                          />
                        )}
                      </td>
                      <td className="w-16 px-3 py-2 font-semibold bg-slate-50 border-r border-gray-300">Date:</td>
                      <td className="w-36 px-3 py-2">
                        {locked || !isCreateMode ? (
                          <span>{formatDate(certDateDisplay)}</span>
                        ) : (
                          <input type="date" value={meta.certDate} onChange={(e) => setField('certDate')(e.target.value)} className={cn(inputCls, 'border-none')} />
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Particulars */}
                <div className="bg-slate-100 border-y border-gray-300 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-center text-slate-600">
                  Particulars
                </div>
                <table className="w-full text-xs border-collapse">
                  <tbody>
                    {locked || !isCreateMode ? (
                      <ParticularRow label="Order No." staticValue={displayWoNumber || '—'} />
                    ) : (
                      <ParticularRow
                        label="Order No."
                        value={meta.woNumber}
                        onChange={setField('woNumber')}
                        placeholder="SBRPL/BIO-CG/WO/26-27/XXX"
                        trailingAction={meta.woNumber.trim() ? (
                          <button
                            type="button"
                            onClick={handleOpenOrderPreview}
                            title="Preview order document"
                            className="wcc-no-print shrink-0 rounded p-1 text-[#0D3A35] hover:bg-emerald-50"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        ) : null}
                      />
                    )}
                    {(locked || !isCreateMode) && displayWoNumber.trim() && (
                      <tr className="wcc-no-print border-b border-gray-200">
                        <td className="px-3 py-1.5" colSpan={2}>
                          <button
                            type="button"
                            onClick={handleOpenOrderPreview}
                            className="inline-flex items-center gap-1 text-[#0D3A35] hover:underline"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" /> Preview order document
                          </button>
                        </td>
                      </tr>
                    )}
                    <ParticularRow label="WCC Type" staticValue={enterprise?.header.wccType?.replace(/_/g, ' ') || 'Partial'} />
                    <ParticularRow label="Project / Site" staticValue={enterprise?.header.projectSiteLabel || blockLabel || '—'} />
                    <ParticularRow label="Work Category" staticValue={enterpriseTemplate?.label || 'Cultivation & Agricultural Fieldwork'} />
                    <ParticularRow label="Work Location / Land" staticValue={enterprise?.landIds?.length ? enterprise.landIds.join(', ') : 'As per Annexure / Service Lines'} />
                    <ParticularRow label="Vendor / Contractor Name" staticValue={vendorName} />
                    <ParticularRow label="Scope of Work" staticValue={scopeOfWorkLabel || '—'} />
                  </tbody>
                </table>

                {/* Activity table */}
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="px-3 py-2 text-left font-semibold">S.No</th>
                      <th className="px-3 py-2 text-left font-semibold">Activity</th>
                      <th className="px-3 py-2 text-center font-semibold">UoM</th>
                      <th className="px-3 py-2 text-right font-semibold">Work Done Quantity</th>
                      <th className="px-3 py-2 text-right font-semibold">Rate (₹)</th>
                      <th className="px-3 py-2 text-right font-semibold">Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(enterprise ? enterprise.serviceLines.filter((line) => line.selected).map((line) => ({ crop: enterpriseTemplate?.label || 'Contracted Work', activity: line.description, qty: line.currentQty, unit: line.unit, lineRate: line.rate })) : certificateLines.map((line) => ({ ...line, unit: 'Acre', lineRate: rate }))).map((line, idx, displayLines) => {
                      const showCropHeader = idx === 0 || displayLines[idx - 1].crop !== line.crop;
                      return (
                        <Fragment key={`${line.crop}-${line.activity}`}>
                          {showCropHeader && (
                            <tr className="bg-slate-100">
                              <td colSpan={6} className="px-3 py-1.5 font-bold text-slate-700 border-b border-gray-200">{titleCase(line.crop)} :-</td>
                            </tr>
                          )}
                          <tr className="border-b border-gray-100">
                            <td className="px-3 py-1.5">{idx + 1}</td>
                            <td className="px-3 py-1.5">{titleCase(line.crop)} - {line.activity}</td>
                            <td className="px-3 py-1.5 text-center">{line.unit}</td>
                            <td className="px-3 py-1.5 text-right">{line.qty.toFixed(2)}</td>
                            <td className="px-3 py-1.5 text-right">{line.lineRate ? line.lineRate.toFixed(2) : '—'}</td>
                            <td className="px-3 py-1.5 text-right">{line.lineRate ? (line.qty * line.lineRate).toFixed(2) : '—'}</td>
                          </tr>
                        </Fragment>
                      );
                    })}
                    <tr className="font-bold border-t-2 border-gray-400">
                      <td className="px-3 py-2" colSpan={3}>Total Value</td>
                      <td className="px-3 py-2 text-right">{pivot.grandTotal.toFixed(2)}</td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right">{enterpriseTotals ? enterpriseTotals.gross.toFixed(2) : rate ? (pivot.grandTotal * rate).toFixed(2) : '—'}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Rate input — editable in create mode (unsubmitted) and revise mode */}
                {(isReviseMode || (isCreateMode && !locked)) && (
                  <div className="wcc-no-print px-3 py-2 border-t border-gray-300 flex items-center gap-2 text-xs bg-slate-50">
                    <label className="font-semibold text-slate-600 shrink-0">Rate (₹ / Acre):</label>
                    <input
                      type="number"
                      value={isReviseMode ? reviseRate : meta.ratePerAcre}
                      onChange={(e) => (isReviseMode ? setReviseRate(e.target.value) : setField('ratePerAcre')(e.target.value))}
                      placeholder="500"
                      className="w-24 border border-gray-300 rounded px-2 py-1 text-right"
                    />
                    <span className="text-slate-400">applied uniformly to every activity line above</span>
                  </div>
                )}

                {/* Certified value */}
                <div className="px-3 py-2 border-t border-gray-300 text-xs space-y-1">
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>Current Gross Certified Value (₹):</span><span>{enterpriseTotals ? formatInr(enterpriseTotals.gross) : certifiedValue}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>Cumulative Certified Value:</span><span>{enterpriseTotals ? formatInr(enterpriseTotals.cumulative) : certifiedValue}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>Net Recommended for Invoice Matching:</span><span>{enterpriseTotals ? formatInr(enterpriseTotals.net) : certifiedValue}</span>
                  </div>
                </div>

                {/* Certification paragraph */}
                <div className="px-3 py-3 border-t border-gray-300 text-xs">
                  <div className="bg-slate-100 text-center font-bold uppercase tracking-wide py-1 mb-2 -mx-3 px-3 text-slate-600">Certification</div>
                  <p>
                    This is to certify that the work described above has been completed by <b>{vendorName}</b> in
                    accordance with the terms and conditions of the linked order and has been physically verified by
                    the undersigned.
                  </p>
                  <p className="mt-2">
                    The quality and quantity of work executed have been found satisfactory and the work is
                    recommended for processing of payment.
                  </p>
                </div>

                {/* Sign-off */}
                <table className="w-full text-xs border-collapse border-t border-gray-300">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="px-3 py-1.5 border-r border-gray-300 text-center font-bold text-slate-600">Prepared By</th>
                      <th className="px-3 py-1.5 border-r border-gray-300 text-center font-bold text-slate-600">Verified By</th>
                      <th className="px-3 py-1.5 text-center font-bold text-slate-600">Approved By</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {([
                        { key: 'prepared', signer: preparedByDisplay as SignerDisplay | null },
                        { key: 'verified', signer: verifiedByDisplay },
                        { key: 'approved', signer: approvedByDisplay },
                      ] as const).map(({ key, signer }, idx) => (
                        <td key={key} className={cn('px-3 py-2 align-top', idx < 2 && 'border-r border-gray-300')}>
                          <div className="mb-1"><span className="text-slate-500">Name: </span><span className="font-medium">{signer?.name || '—'}</span></div>
                          <div className="mb-4"><span className="text-slate-500">Designation: </span><span className="font-medium">{signer?.designation || '—'}</span></div>
                          <div className="text-slate-400">{signer ? 'Signature:' : 'Pending'}</div>
                          <div className="h-10 border-b border-gray-300 mt-1" />
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Footer — mode-specific workflow actions */}
        {(isCreateMode || isReviseMode || isReviewMode) && (
          <div className="wcc-no-print px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between gap-3 shrink-0">
            <div className="text-xs text-slate-400 min-w-0 truncate">
              {isCreateMode && !locked && 'Fill in the rate and Order No., then submit for verification.'}
              {isCreateMode && locked && `Submitted as ${certNoDisplay}.`}
              {isReviseMode && !locked && 'Adjust the rate and resubmit for verification.'}
              {isReviseMode && locked && `Resubmitted as ${certNoDisplay}.`}
              {isReviewMode && showRejectInput && (
                <input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection…"
                  className="w-full max-w-md border border-gray-300 rounded px-2 py-1 text-xs"
                  autoFocus
                />
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isCreateMode && !locked && (
                <button
                  type="button"
                  onClick={handleSubmitForVerification}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0D3A35] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#092e2a] disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Submit for Verification
                </button>
              )}
              {isReviseMode && !locked && (
                <button
                  type="button"
                  onClick={handleResubmit}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0D3A35] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#092e2a] disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Resubmit for Verification
                </button>
              )}
              {isReviewMode && (
                <>
                  {showRejectInput && (
                    <button
                      type="button"
                      onClick={() => { setShowRejectInput(false); setRejectReason(''); }}
                      className="px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleAction('reject')}
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 text-sm font-semibold rounded-lg transition-colors"
                  >
                    {showRejectInput ? 'Confirm Reject' : 'Reject'}
                  </button>
                  {!showRejectInput && (
                    <button
                      type="button"
                      onClick={() => handleAction(existingRecord?.status === 'pending_verification' ? 'verify' : 'approve')}
                      disabled={submitting}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#0D3A35] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#092e2a] disabled:opacity-50"
                    >
                      {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {existingRecord?.status === 'pending_verification' ? 'Verify' : 'Approve'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Order document preview — opens beside the certificate, same size, so the user can
          tally the WO/PO before deciding the rate. */}
      {showOrderPreview && (
        <div className="wcc-no-print w-full max-w-2xl h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800">Order Document Preview</h3>
              <p className="text-[11px] text-slate-400 font-mono truncate">{displayWoNumber}</p>
            </div>
            <button type="button" onClick={() => setShowOrderPreview(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <div className="flex-1 bg-slate-100 relative overflow-hidden">
            {orderDocLoading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-sm font-medium">Loading order document…</span>
              </div>
            ) : orderDocError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-red-400 px-6 text-center">
                <AlertCircle className="w-8 h-8" />
                <span className="text-sm font-medium">{orderDocError}</span>
              </div>
            ) : orderDocUrl ? (
              <iframe src={orderDocUrl} title="Order document preview" className="w-full h-full border-0" />
            ) : null}
          </div>
          {orderDocUrl && (
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end shrink-0">
              <a
                href={orderDocUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0D3A35] hover:underline"
              >
                Open in new tab <ArrowUpRight className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WccCertificatePreview;
