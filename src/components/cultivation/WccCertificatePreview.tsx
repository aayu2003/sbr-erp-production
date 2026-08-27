import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { X, Download, Printer, ArrowUpRight, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';
import { useAuth } from '@/context/AuthContext';
import logo3f from '@/Assets/3f-logo.png';
import { MakeWorkOrderPopup } from '@/components/ho-inbox/MakeWorkOrderPopup';
import type { ComparativeModel } from '@/components/purchase/ComparativeStatementPreview';
import type { ApiWorkDoneEntry, ApiOperationalWorkDoneEntry, ApiTaskDetails, WccScopeLand } from './WccModal';
import { WCC_WORK_TEMPLATES, calculateWccTotals, type WccEnterpriseDraft } from '@/lib/wccEnterprise';

const BASE_URL = getBaseUrl().replace(/\/$/, '');

// SAI Bioresources' fixed letterhead — the issuing entity for every WCC, not vendor-specific.
const COMPANY_NAME = 'SAI BIORESOURCES PRIVATE LIMITED';
const COMPANY_ADDRESS = 'Khasra No. 121/1, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh – 491001';

const FullWorkOrderPreview = ({ order }: { order: Record<string, unknown> }) => {
  const quote = order.purchase_quote && typeof order.purchase_quote === 'object'
    ? order.purchase_quote as Record<string, unknown>
    : {};
  const orderNumber = String(order.order_number ?? quote.order_number ?? quote.poNo ?? quote.po_no ?? '').trim();
  const requestNumber = String(order.pr_number ?? quote.pr_number ?? '').trim();
  const comparisonId = String(order.comparison_id ?? quote.comparison_id ?? '').trim();
  const vendorId = String(quote.vendor_id ?? quote.vendorId ?? quote.vendor_name ?? '').trim();
  const comparative = {
    id: comparisonId || requestNumber || orderNumber,
    indentId: requestNumber,
    pr_number: requestNumber,
    comparisonId,
    comparison_id: comparisonId,
    hoSelectedVendorId: vendorId,
    indent_type: 'SPR',
  } as unknown as ComparativeModel;

  return (
    <MakeWorkOrderPopup
      open
      comparative={comparative}
      vendorId={vendorId}
      poNumber={orderNumber}
      onClose={() => undefined}
      variant="inline"
      inlineSimulatePrint
      reviewOnly
      documentStatus="approved"
    />
  );
};

const formatDate = (d?: string) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

const formatInr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// jsPDF's built-in Helvetica font does not contain the Unicode rupee glyph. Keep the
// on-screen symbol, but use an ASCII currency label in generated PDFs so it never corrupts.
const formatPdfMoney = (n: number) => `INR ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─────────────────────────────────────────────────────────────
// Annexure: one flat, numbered line per completed activity — cultivation lines are one row
// per (land, activity, date) so a plot worked on twice gets two dated lines instead of a
// single blended total; operational (non-cultivation) lines are one row per logged task.
// Place is always the land's owner name; Rate is filled in by the preparer per line, not
// derived from source data.
// ─────────────────────────────────────────────────────────────
export interface AnnexureLine {
  id: string;
  activity: string;
  place: string;
  dateOfCompletion: string;
  uom: string;
  quantity: number;
  rate: number;
  landId?: string; // used to resolve the certificate's block label
  taskIds?: string[]; // links the certified line to its task-photo evidence
}

export interface AnnexurePhoto {
  id: string;
  taskId: string;
  imageUrl: string;
  activity: string;
  place: string;
  dateOfCompletion: string;
}

export interface AnnexurePivot {
  lines: AnnexureLine[];
  photos?: AnnexurePhoto[];
  enterprise?: WccEnterpriseDraft;
  adjustment?: number;
  note?: string;
  certification?: { text?: string; paragraph1?: string; paragraph2?: string };
}

interface AnnexurePhotoEvidenceRow {
  id: string;
  annexureRowNumber: number;
  activity: string;
  place: string;
  dateOfCompletion: string;
  photos: AnnexurePhoto[];
  photoOffset: number;
}

const buildAnnexurePhotoEvidenceRows = (lines: AnnexureLine[], photos: AnnexurePhoto[]): AnnexurePhotoEvidenceRow[] => {
  const rows: AnnexurePhotoEvidenceRow[] = [];
  lines.forEach((line, lineIndex) => {
    const taskIds = new Set(line.taskIds || []);
    const matchingPhotos = photos.filter((photo) => taskIds.size > 0
      ? taskIds.has(photo.taskId)
      : photo.activity === line.activity && photo.place === line.place && photo.dateOfCompletion === line.dateOfCompletion);
    const chunkCount = Math.max(1, Math.ceil(matchingPhotos.length / 3));
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      rows.push({
        id: `${line.id}__evidence__${chunkIndex}`,
        annexureRowNumber: lineIndex + 1,
        activity: line.activity,
        place: line.place,
        dateOfCompletion: line.dateOfCompletion,
        photos: matchingPhotos.slice(chunkIndex * 3, chunkIndex * 3 + 3),
        photoOffset: chunkIndex * 3,
      });
    }
  });
  return rows;
};

// One row of the certificate's "Activity-wise Certified Value" running-account table —
// actualQuantity/ratePerUnit come from the linked WO's line item when one matches by
// activity name; quantityPrevious/totalAmountPrevious have no backend source yet (always 0
// for now) — everything else derives from the certificate's own effectiveLines.
export interface ActivityProgressRow {
  activity: string;
  uom: string;
  ratePerUnit: number;
  actualQuantity: number;
  quantityPrevious: number;
  quantityCurrent: number;
  quantityBalance: number;
  totalAmount: number;
  totalAmountPrevious: number;
  totalAmountCurrent: number;
}

const EMPTY_PIVOT: AnnexurePivot = { lines: [] };

const buildAnnexurePivot = (
  workDone: ApiWorkDoneEntry[],
  taskDetailsById: Record<string, ApiTaskDetails>,
  scopeItems: WccScopeLand[],
  operationalWorkDone: ApiOperationalWorkDoneEntry[] = [],
  farmerNames: Record<string, string> = {},
): AnnexurePivot => {
  const landById = new Map<string, WccScopeLand>();
  for (const land of scopeItems) landById.set(land.land_id, land);

  // Owner name for a farm_id — prefers the vendor's own scope-of-work record (already carries
  // farmer_name), then the farmer-details lookup, then falls back to the raw farm_id.
  const ownerNameFor = (farmId: string) =>
    landById.get(farmId)?.farmer_name || farmerNames[farmId] || landById.get(farmId)?.farmer_id || farmId;

  // land + activity + date -> line (dedup'd by plot+activity+date so the same plot can't be
  // double-counted if it shows up across multiple work-done entries for that same date).
  const grid = new Map<string, AnnexureLine>();
  const counted = new Set<string>();

  for (const entry of workDone) {
    const details = taskDetailsById[entry.task_id];
    const activity = details?.assigned_acres?.find((a) => a.farm_id === entry.farm_id)?.activity || 'Unknown Activity';

    for (const plot of entry.plot) {
      if ((plot.status || '').trim().toLowerCase() !== 'completed') continue;
      const dedupeKey = `${plot.plot_id}__${activity}__${entry.date}`;
      if (counted.has(dedupeKey)) continue;
      counted.add(dedupeKey);

      const key = `${entry.farm_id}__${activity}__${entry.date}`;
      const area = Number(plot.plot_area) || 0;
      const existing = grid.get(key);
      if (existing) {
        existing.quantity += area;
        if (entry.task_id && !existing.taskIds?.includes(entry.task_id)) existing.taskIds = [...(existing.taskIds || []), entry.task_id];
        continue;
      }
      grid.set(key, {
        id: key,
        activity,
        place: ownerNameFor(entry.farm_id),
        dateOfCompletion: entry.date,
        uom: 'Acre',
        quantity: area,
        rate: 0,
        landId: entry.farm_id,
        taskIds: entry.task_id ? [entry.task_id] : [],
      });
    }
  }

  const operationalLines: AnnexureLine[] = operationalWorkDone.map((entry, idx) => ({
    // Several line items from one on-field task now share a task_id — line_item_id is what's
    // actually unique, and matters here since it keys per-line rate edits (lineEdits).
    id: `op__${entry.line_item_id || `${entry.task_id || 'entry'}__${idx}`}`,
    activity: entry.activity,
    place: entry.farm_id ? ownerNameFor(entry.farm_id) : '—',
    dateOfCompletion: entry.to_date || entry.from_date,
    uom: entry.unit || '',
    quantity: Number(entry.quantity) || 0,
    rate: 0,
    landId: entry.farm_id,
    taskIds: entry.task_id ? [entry.task_id] : [],
  }));

  const lines = [...grid.values(), ...operationalLines].sort((a, b) =>
    a.dateOfCompletion.localeCompare(b.dateOfCompletion) || a.place.localeCompare(b.place) || a.activity.localeCompare(b.activity),
  );

  const photoContexts = new Map<string, { activities: Set<string>; places: Set<string>; dates: Set<string> }>();
  const addPhotoContext = (taskId: string | undefined, activity: string, place: string, date: string) => {
    if (!taskId) return;
    const context = photoContexts.get(taskId) || { activities: new Set<string>(), places: new Set<string>(), dates: new Set<string>() };
    if (activity) context.activities.add(activity);
    if (place) context.places.add(place);
    if (date) context.dates.add(date);
    photoContexts.set(taskId, context);
  };

  for (const entry of workDone) {
    const details = taskDetailsById[entry.task_id];
    const activity = details?.assigned_acres?.find((item) => item.farm_id === entry.farm_id)?.activity || 'Unknown Activity';
    addPhotoContext(entry.task_id, activity, ownerNameFor(entry.farm_id), entry.date);
  }
  for (const entry of operationalWorkDone) {
    addPhotoContext(
      entry.task_id,
      entry.activity,
      entry.farm_id ? ownerNameFor(entry.farm_id) : '—',
      entry.completion_date || entry.to_date || entry.from_date,
    );
  }

  const photos: AnnexurePhoto[] = [];
  for (const [taskId, context] of photoContexts) {
    const imageUrls = Array.from(new Set(taskDetailsById[taskId]?.progress_images || [])).filter(Boolean);
    imageUrls.forEach((imageUrl, index) => {
      photos.push({
        id: `${taskId}__photo__${index}`,
        taskId,
        imageUrl,
        activity: Array.from(context.activities).join(', ') || 'Task activity',
        place: Array.from(context.places).join(', ') || '—',
        dateOfCompletion: Array.from(context.dates).sort().at(-1) || '',
      });
    });
  }
  photos.sort((a, b) => a.dateOfCompletion.localeCompare(b.dateOfCompletion) || a.activity.localeCompare(b.activity) || a.id.localeCompare(b.id));

  return { lines, photos };
};

// Clubs the printed Annexure primarily by place — every row for the same place sits together as
// one block, however many different activities were done there — and within each place, by
// activity, with each activity's own rows ordered by date of completion. Stable at both levels:
// a place block appears where its first row was first seen, and same for an activity sub-block
// within it.
const groupAnnexureLines = (lines: AnnexureLine[]): AnnexureLine[] => {
  const placeGroups = new Map<string, AnnexureLine[]>();
  for (const line of lines) {
    const bucket = placeGroups.get(line.place);
    if (bucket) bucket.push(line);
    else placeGroups.set(line.place, [line]);
  }

  const result: AnnexureLine[] = [];
  for (const placeLines of placeGroups.values()) {
    const activityGroups = new Map<string, AnnexureLine[]>();
    for (const line of placeLines) {
      const bucket = activityGroups.get(line.activity);
      if (bucket) bucket.push(line);
      else activityGroups.set(line.activity, [line]);
    }
    for (const activityLines of activityGroups.values()) {
      activityLines.sort((a, b) => a.dateOfCompletion.localeCompare(b.dateOfCompletion));
      result.push(...activityLines);
    }
  }
  return result;
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
}

const EMPTY_META: CertificateMeta = {
  certNo: '',
  certDate: new Date().toISOString().slice(0, 10),
  woNumber: '',
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
  if (url.startsWith('data:')) return url;
  let fetchUrl = url;
  try {
    const parsed = new URL(url, typeof window === 'undefined' ? undefined : window.location.href);
    const isTaskMedia = parsed.hostname === 'sbr-task-media-prod.s3.amazonaws.com';
    const isLocalApp = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (isTaskMedia && isLocalApp) fetchUrl = `/__task-media${parsed.pathname}${parsed.search}`;
  } catch {
    // Keep the supplied URL when it is already relative or cannot be parsed.
  }
  const res = await fetch(fetchUrl);
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
  blockLabel: string;
  scopeOfWorkLabel: string;
  preparedBy: SignerDisplay;
  verifiedBy: SignerDisplay | null;
  approvedBy: SignerDisplay | null;
  // Running-account progress table shown on-screen — optional since a persisted record
  // (wccParamsFromRecord) has no live WO lookup to build it from; the PDF falls back to a
  // plain activity/value rollup from pivot.lines when this isn't supplied.
  activityProgress?: ActivityProgressRow[];
}

// Builds the certificate PDF document (WCC followed by Annexure pages) without saving/exporting it —
// shared by the direct-download path and the "generate & attach to purchase flow" path.
export const buildCertificatePdfDoc = async (p: PdfExportParams): Promise<JsPdfWithAutoTable> => {
  const { pivot, vendorName, fromDate, toDate, certNo, certDate, woNumber, blockLabel, scopeOfWorkLabel, preparedBy, verifiedBy, approvedBy, activityProgress } = p;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as JsPdfWithAutoTable;
  const enterprise = pivot.enterprise;
  const enterpriseTotals = enterprise ? calculateWccTotals(enterprise) : null;
  const enterpriseTemplate = enterprise ? WCC_WORK_TEMPLATES.find((item) => item.id === enterprise.header.workCategory) : undefined;
  const totalQuantity = pivot.lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalValue = pivot.lines.reduce((sum, line) => sum + line.quantity * line.rate, 0);
  const activityTotalsOrder: string[] = [];
  const activityTotalsMap = new Map<string, number>();
  for (const line of pivot.lines) {
    if (!activityTotalsMap.has(line.activity)) { activityTotalsOrder.push(line.activity); activityTotalsMap.set(line.activity, 0); }
    activityTotalsMap.set(line.activity, (activityTotalsMap.get(line.activity) || 0) + line.quantity * line.rate);
  }

  // Build the service-line annexure first, then move it behind every certificate page once
  // the WCC has been rendered. This keeps the WCC as page 1 even if its tables overflow.
  doc.setFillColor(234, 244, 241);
  doc.rect(14, 10, 182, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(13, 58, 53);
  doc.text('WORK COMPLETION CERTIFICATE - ANNEXURE - 1', 105, 16, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  autoTable(doc, {
    startY: 22,
    theme: 'grid',
    margin: { left: 14, right: 14 },
    styles: { fontSize: 7.5, cellPadding: 1.5, lineColor: [185, 210, 203], lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 53 }, 2: { cellWidth: 38 }, 3: { cellWidth: 53 } },
    body: [
      [
        { content: 'Vendor / Contractor', styles: { fontStyle: 'bold', fillColor: [243, 248, 246], textColor: [13, 71, 63] } },
        vendorName || '—',
        { content: 'Work Order No.', styles: { fontStyle: 'bold', fillColor: [243, 248, 246], textColor: [13, 71, 63] } },
        woNumber || '—',
      ],
      [
        { content: 'WCC No.', styles: { fontStyle: 'bold', fillColor: [243, 248, 246], textColor: [13, 71, 63] } },
        certNo || '—',
        { content: 'Work Period', styles: { fontStyle: 'bold', fillColor: [243, 248, 246], textColor: [13, 71, 63] } },
        `${formatDate(fromDate)} - ${formatDate(toDate)}`,
      ],
    ],
  });

  const annexureHead = [['S. No.', 'Activity', 'Place', 'Date of Completion', 'UOM', 'Quantity', 'Rate/Unit (INR)', 'Value (INR)']];
  const annexureBody: RowInput[] = pivot.lines.map((line, i) => [
    i + 1,
    line.activity,
    line.place,
    formatDate(line.dateOfCompletion),
    line.uom,
    line.quantity.toFixed(2),
    line.rate ? line.rate.toFixed(2) : '—',
    line.rate ? (line.quantity * line.rate).toFixed(2) : '—',
  ]);
  annexureBody.push([
    { content: 'Total', colSpan: 5, styles: { fontStyle: 'bold', fillColor: [234, 244, 241], textColor: [13, 71, 63] } },
    { content: totalQuantity.toFixed(2), styles: { fontStyle: 'bold', fillColor: [234, 244, 241], textColor: [13, 71, 63] } },
    '',
    { content: totalValue ? totalValue.toFixed(2) : '—', styles: { fontStyle: 'bold', fillColor: [234, 244, 241], textColor: [13, 71, 63] } },
  ]);

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 3,
    head: annexureHead,
    body: annexureBody,
    theme: 'grid',
    margin: { left: 14, right: 14 },
    styles: {
      fontSize: 6.5,
      cellPadding: 1.15,
      valign: 'middle',
      lineColor: [185, 210, 203],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [13, 58, 53],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      cellPadding: 1,
      lineColor: [108, 151, 142],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 40 },
      2: { cellWidth: 47 },
      3: { cellWidth: 24, halign: 'center' },
      4: { cellWidth: 12, halign: 'center' },
      5: { cellWidth: 14, halign: 'right' },
      6: { cellWidth: 17, halign: 'right' },
      7: { cellWidth: 18, halign: 'right' },
    },
    alternateRowStyles: { fillColor: [249, 251, 250] },
  });

  // ── Work Completion Certificate ──
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
  doc.setFillColor(234, 244, 241);
  doc.rect(14, 36, 182, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('WORK COMPLETION CERTIFICATE', 105, 41.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');

  autoTable(doc, {
    startY: 45,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    body: [[
      { content: 'Certificate No.:', styles: { fontStyle: 'bold', fillColor: [243, 248, 246], textColor: [13, 71, 63] } },
      certNo || '—',
      { content: 'Date:', styles: { fontStyle: 'bold', fillColor: [243, 248, 246], textColor: [13, 71, 63] } },
      formatDate(certDate),
    ]],
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 59 },
      2: { cellWidth: 32 },
      3: { cellWidth: 59 },
    },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 2,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [13, 58, 53], textColor: [255, 255, 255], halign: 'center', fontStyle: 'bold', cellPadding: 1.2 },
    columnStyles: { 0: { cellWidth: 60.66 }, 1: { cellWidth: 121.34 } },
    head: [['PARTICULARS', 'DETAILS']],
    body: [
      [{ content: 'Work Order No.', styles: { fontStyle: 'bold', fillColor: [243, 248, 246], textColor: [13, 71, 63] } }, woNumber || '—'],
      [{ content: 'WCC Type', styles: { fontStyle: 'bold', fillColor: [243, 248, 246], textColor: [13, 71, 63] } }, enterprise?.header.wccType?.replace(/_/g, ' ') || 'Partial'],
      [{ content: 'Project / Site', styles: { fontStyle: 'bold', fillColor: [243, 248, 246], textColor: [13, 71, 63] } }, enterprise?.header.projectSiteLabel || blockLabel || '—'],
      [{ content: 'Work Category', styles: { fontStyle: 'bold', fillColor: [243, 248, 246], textColor: [13, 71, 63] } }, enterpriseTemplate?.label || 'Cultivation & Agricultural Fieldwork'],
      [{ content: 'Work Location / Land', styles: { fontStyle: 'bold', fillColor: [243, 248, 246], textColor: [13, 71, 63] } }, enterprise?.landIds?.length ? enterprise.landIds.join(', ') : 'As per Annexure / Service Lines'],
      [{ content: 'Vendor / Contractor Name', styles: { fontStyle: 'bold', fillColor: [243, 248, 246], textColor: [13, 71, 63] } }, vendorName],
      [{ content: 'Scope of Work', styles: { fontStyle: 'bold', fillColor: [243, 248, 246], textColor: [13, 71, 63] } }, scopeOfWorkLabel || '—'],
    ],
  });

  let y = doc.lastAutoTable.finalY + 6;
  if (activityProgress && activityProgress.length > 0) {
    autoTable(doc, {
      startY: y,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 1.15, lineColor: [200, 216, 211], lineWidth: 0.15, valign: 'middle' },
      headStyles: { fillColor: [13, 58, 53], halign: 'center', lineColor: [108, 151, 142], lineWidth: 0.15, cellPadding: 0.9, fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 50 },
        2: { cellWidth: 14 },
        3: { cellWidth: 18, halign: 'right' },
        4: { cellWidth: 18, halign: 'right' },
        5: { cellWidth: 18, halign: 'right' },
        6: { cellWidth: 18, halign: 'right' },
        7: { cellWidth: 20, halign: 'right' },
        8: { cellWidth: 16, halign: 'right' },
      },
      margin: { left: 14, right: 14 },
      head: [['S. No.', 'Activity', 'UOM', 'WO Qty.', 'Prev. Qty.', 'Quantity', 'Bal. Qty.', 'Rate/Unit', 'Value']],
      body: [
        ...activityProgress.map((row, i) => [
          i + 1,
          row.activity,
          row.uom || '—',
          row.actualQuantity.toFixed(2),
          row.quantityPrevious.toFixed(2),
          row.quantityCurrent.toFixed(2),
          row.quantityBalance.toFixed(2),
          row.ratePerUnit ? row.ratePerUnit.toFixed(2) : '—',
          row.totalAmountCurrent ? row.totalAmountCurrent.toFixed(2) : '—',
        ]),
        [
          { content: 'Total', colSpan: 3, styles: { fontStyle: 'bold' } },
          { content: activityProgress.reduce((sum, row) => sum + row.actualQuantity, 0).toFixed(2), styles: { fontStyle: 'bold' } },
          { content: activityProgress.reduce((sum, row) => sum + row.quantityPrevious, 0).toFixed(2), styles: { fontStyle: 'bold' } },
          { content: activityProgress.reduce((sum, row) => sum + row.quantityCurrent, 0).toFixed(2), styles: { fontStyle: 'bold' } },
          { content: activityProgress.reduce((sum, row) => sum + row.quantityBalance, 0).toFixed(2), styles: { fontStyle: 'bold' } },
          '',
          { content: totalValue ? totalValue.toFixed(2) : '—', styles: { fontStyle: 'bold' } },
        ],
      ],
    });
  } else {
    autoTable(doc, {
      startY: y,
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 1 },
      columnStyles: { 0: { cellWidth: 100 }, 1: { halign: 'right' } },
      margin: { left: 14, right: 14 },
      body: [
        ...activityTotalsOrder.map((activity) => [activity, activityTotalsMap.get(activity) ? (activityTotalsMap.get(activity) as number).toFixed(2) : '—']),
        [
          { content: 'Total', styles: { fontStyle: 'bold' } },
          { content: totalValue ? totalValue.toFixed(2) : '—', styles: { fontStyle: 'bold' } },
        ],
      ],
    });
  }
  y = doc.lastAutoTable.finalY + 6;
  const certifiedAmount = enterpriseTotals ? enterpriseTotals.gross : totalValue;
  const adjustmentAmount = Number(pivot.adjustment) || 0;
  const recommendedAmount = certifiedAmount - adjustmentAmount;
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin: { left: 14, right: 14 },
    styles: { fontSize: 8, cellPadding: 1.5, halign: 'center' },
    headStyles: { fillColor: [243, 248, 246], textColor: [13, 71, 63], fontStyle: 'bold', cellPadding: 1 },
    bodyStyles: { fontStyle: 'bold', textColor: [30, 41, 59] },
    columnStyles: { 0: { cellWidth: 60.66 }, 1: { cellWidth: 60.66 }, 2: { cellWidth: 60.66 } },
    head: [['Certified Value (INR)', 'Adjustment (INR)', 'Recommended Value (INR)']],
    body: [[formatPdfMoney(certifiedAmount), formatPdfMoney(adjustmentAmount), formatPdfMoney(recommendedAmount)]],
  });
  y = doc.lastAutoTable.finalY + 9;

  const defaultCertification1 = `This is to certify that the work described above has been completed by ${vendorName} in accordance with the terms and conditions of the linked order and has been physically verified by the undersigned.`;
  const defaultCertification2 = 'The quality and quantity of work executed have been found satisfactory and the work is recommended for processing of payment.';
  const certificationText = pivot.certification?.text
    || [pivot.certification?.paragraph1, pivot.certification?.paragraph2].filter(Boolean).join('\n\n')
    || `${defaultCertification1}\n\n${defaultCertification2}`;

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin: { left: 14, right: 14 },
    styles: { fontSize: 8, cellPadding: 2.5, lineColor: [185, 210, 203], lineWidth: 0.2, textColor: [30, 41, 59] },
    headStyles: { fillColor: [243, 248, 246], textColor: [13, 71, 63], fontStyle: 'bold', halign: 'center', cellPadding: 1.2 },
    head: [['NOTE']],
    body: [[pivot.note?.trim() || '—']],
  });
  y = doc.lastAutoTable.finalY + 4;

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin: { left: 14, right: 14 },
    styles: { fontSize: 8, cellPadding: 2.5, lineColor: [185, 210, 203], lineWidth: 0.2, textColor: [30, 41, 59] },
    headStyles: { fillColor: [243, 248, 246], textColor: [13, 71, 63], fontStyle: 'bold', halign: 'center', cellPadding: 1.2 },
    head: [['CERTIFICATION']],
    body: [[certificationText]],
  });
  y = doc.lastAutoTable.finalY + 6;

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [['Prepared By', 'Verified By', 'Approved By']],
    body: [[
      `Name: ${preparedBy.name}\nDesignation: ${preparedBy.designation}\n\nSignature:`,
      verifiedBy ? `Name: ${verifiedBy.name}\nDesignation: ${verifiedBy.designation}\n\nSignature:` : 'Pending',
      approvedBy ? `Name: ${approvedBy.name}\nDesignation: ${approvedBy.designation}\n\nSignature:` : 'Pending',
    ]],
    margin: { left: 14, right: 14 },
    styles: { fontSize: 8, valign: 'top', lineColor: [185, 210, 203], lineWidth: 0.2 },
    headStyles: { fillColor: [13, 58, 53], cellPadding: 1.2, minCellHeight: 0, halign: 'center' },
    bodyStyles: { minCellHeight: 25, cellPadding: 2, fillColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    columnStyles: { 0: { cellWidth: 60.66 }, 1: { cellWidth: 60.66 }, 2: { cellWidth: 60.66 } },
  });

  // The annexure was originally page 1. Move it after the complete WCC section before
  // adding any enterprise evidence annexures.
  doc.movePage(1, doc.getNumberOfPages());

  // Annexure - 2: one evidence row per Annexure - 1 line, with three photo slots across.
  // Extra photos continue on another row for that same Annexure - 1 line.
  const taskPhotos = pivot.photos || [];
  const photoEvidenceRows = buildAnnexurePhotoEvidenceRows(pivot.lines, taskPhotos);
  const photoImageData = await Promise.all(taskPhotos.map(async (photo) => {
    try { return await fetchImageDataUrl(photo.imageUrl); }
    catch { return null; }
  }));
  const photoImageDataById = new Map(taskPhotos.map((photo, index) => [photo.id, photoImageData[index]]));
  const photoPageCount = Math.max(1, Math.ceil(photoEvidenceRows.length / 3));
  const singleLine = (value: string, width: number) => {
    const lines = doc.splitTextToSize(value || '—', width) as string[];
    return lines[0] || '—';
  };

  for (let photoPage = 0; photoPage < photoPageCount; photoPage += 1) {
    doc.addPage();
    doc.setFillColor(234, 244, 241);
    doc.rect(14, 10, 182, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(13, 58, 53);
    doc.text(`ANNEXURE - 2: TASK PHOTOGRAPHS${photoPage > 0 ? ' (CONTINUED)' : ''}`, 105, 16, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    autoTable(doc, {
      startY: 22,
      theme: 'grid',
      margin: { left: 14, right: 14 },
      styles: { fontSize: 7.5, cellPadding: 1.5, lineColor: [185, 210, 203], lineWidth: 0.2 },
      columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 53 }, 2: { cellWidth: 38 }, 3: { cellWidth: 53 } },
      body: [
        [
          { content: 'WCC No.', styles: { fontStyle: 'bold', fillColor: [243, 248, 246], textColor: [13, 71, 63] } },
          certNo || '—',
          { content: 'Work Order No.', styles: { fontStyle: 'bold', fillColor: [243, 248, 246], textColor: [13, 71, 63] } },
          woNumber || '—',
        ],
        [
          { content: 'Vendor / Contractor', styles: { fontStyle: 'bold', fillColor: [243, 248, 246], textColor: [13, 71, 63] } },
          vendorName || '—',
          { content: 'Work Period', styles: { fontStyle: 'bold', fillColor: [243, 248, 246], textColor: [13, 71, 63] } },
          `${formatDate(fromDate)} - ${formatDate(toDate)}`,
        ],
      ],
    });

    const pageEvidenceRows = photoEvidenceRows.slice(photoPage * 3, photoPage * 3 + 3);
    const startY = doc.lastAutoTable.finalY + 4;
    if (pageEvidenceRows.length === 0) {
      doc.setDrawColor(185, 210, 203);
      doc.setLineWidth(0.2);
      doc.rect(14, startY, 182, 28);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text('No task photographs were available for this WCC.', 105, startY + 15, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      continue;
    }

    pageEvidenceRows.forEach((evidenceRow, pageRowIndex) => {
      const x = 14;
      const y = startY + pageRowIndex * 76;
      const rowWidth = 182;
      const rowHeight = 72;
      const headingHeight = 10;
      const photoCellWidth = rowWidth / 3;
      doc.setDrawColor(185, 210, 203);
      doc.setLineWidth(0.2);
      doc.rect(x, y, rowWidth, rowHeight);
      doc.setFillColor(243, 248, 246);
      doc.rect(x, y, rowWidth, headingHeight, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(13, 71, 63);
      const continuationLabel = evidenceRow.photoOffset > 0 ? ' (continued)' : '';
      doc.text(singleLine(`Annexure Row ${evidenceRow.annexureRowNumber}${continuationLabel} - ${evidenceRow.activity}`, rowWidth - 4), x + 2, y + 4.2);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.2);
      doc.setTextColor(71, 85, 105);
      doc.text(singleLine(`Location: ${evidenceRow.place}  |  Completion Date: ${formatDate(evidenceRow.dateOfCompletion)}`, rowWidth - 4), x + 2, y + 8);

      for (let photoSlot = 0; photoSlot < 3; photoSlot += 1) {
        const photo = evidenceRow.photos[photoSlot];
        const cellX = x + photoSlot * photoCellWidth;
        if (photoSlot > 0) doc.line(cellX, y + headingHeight, cellX, y + rowHeight);
        const imageX = cellX + 2;
        const imageY = y + headingHeight + 2;
        const imageWidth = photoCellWidth - 4;
        const imageHeight = 43;
        doc.setFillColor(248, 250, 249);
        doc.rect(imageX, imageY, imageWidth, imageHeight, 'F');

        const imageData = photo ? photoImageDataById.get(photo.id) : null;
        if (photo && imageData) {
          try {
            const properties = doc.getImageProperties(imageData);
            const scale = Math.min(imageWidth / properties.width, imageHeight / properties.height);
            const renderedWidth = properties.width * scale;
            const renderedHeight = properties.height * scale;
            doc.addImage(
              imageData,
              properties.fileType || 'JPEG',
              imageX + (imageWidth - renderedWidth) / 2,
              imageY + (imageHeight - renderedHeight) / 2,
              renderedWidth,
              renderedHeight,
            );
          } catch {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.text('Image unavailable', cellX + photoCellWidth / 2, imageY + imageHeight / 2, { align: 'center' });
          }
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text(photo ? 'Image unavailable' : 'Photo not available', cellX + photoCellWidth / 2, imageY + imageHeight / 2, { align: 'center' });
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.3);
        doc.setTextColor(51, 65, 85);
        doc.text(`Photo ${evidenceRow.photoOffset + photoSlot + 1}`, cellX + 2, y + 60);
        doc.text(singleLine(photo ? `Task ID: ${photo.taskId}` : 'No task photo uploaded', photoCellWidth - 4), cellX + 2, y + 66);
      }
      doc.setTextColor(0, 0, 0);
    });
  }

  if (enterprise) {
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('ANNEXURE - 3: MEASUREMENT, QUALITY & EVIDENCE', 105, 15, { align: 'center' });
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
    doc.setDrawColor(185, 210, 203);
    doc.setLineWidth(0.25);
    doc.rect(10, 5, 190, 287);
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
  <tr className="border-b border-[#dce7e3] last:border-b-0">
    <td className="w-1/3 border-r border-[#dce7e3] bg-[#f3f8f6] px-4 py-2 font-bold text-[#0D3A35] align-top">{label}</td>
    <td className="px-4 py-2 text-slate-700">
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
  farmerNames?: Record<string, string>;

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
  farmerNames = {},
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

  const [meta, setMeta] = useState<CertificateMeta>(() => ({ ...EMPTY_META, woNumber: vendorWoNumber || '' }));
  const displayWoNumber = record?.order_number ?? meta.woNumber;

  // Previously-certified data for this WO — activity_summary gives the running totals used
  // for the Qty/Amt (Previous) columns, and the annexure lines across every prior certificate
  // give the latest date each activity was already certified through. A brand-new certificate
  // must not re-certify work already covered by an earlier one (e.g. WCC1/2/3 certified "1st
  // Ploughing" through 10 Aug — anything on or before that date is excluded from a new pivot,
  // only work after 10 Aug is eligible).
  const [previousByActivity, setPreviousByActivity] = useState<Record<string, { totalQuantity: number; totalAmount: number }>>({});
  const [maxCertifiedDateByActivity, setMaxCertifiedDateByActivity] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!displayWoNumber) { setPreviousByActivity({}); setMaxCertifiedDateByActivity({}); return; }
    let cancelled = false;
    fetch(`${BASE_URL}/admin_wcc_certificate/get_previous_data/${displayWoNumber}`)
      .then((res) => res.json())
      .then((data: {
        success?: boolean;
        activity_summary?: Array<{ activity: string; uom?: string; total_quantity: number; total_amount: number }>;
        certificates?: Array<{ annexure?: { lines?: Array<{ activity: string; dateOfCompletion: string }> } }>;
      }) => {
        if (cancelled || !data?.success) return;
        const totals: Record<string, { totalQuantity: number; totalAmount: number }> = {};
        (data.activity_summary ?? []).forEach((item) => { totals[item.activity] = { totalQuantity: Number(item.total_quantity) || 0, totalAmount: Number(item.total_amount) || 0 }; });
        setPreviousByActivity(totals);

        const maxDates: Record<string, string> = {};
        (data.certificates ?? []).forEach((certificate) => {
          (certificate.annexure?.lines ?? []).forEach((line) => {
            if (!line?.activity || !line?.dateOfCompletion) return;
            if (!maxDates[line.activity] || line.dateOfCompletion > maxDates[line.activity]) maxDates[line.activity] = line.dateOfCompletion;
          });
        });
        setMaxCertifiedDateByActivity(maxDates);
      })
      .catch(() => { if (!cancelled) { setPreviousByActivity({}); setMaxCertifiedDateByActivity({}); } });
    return () => { cancelled = true; };
  }, [displayWoNumber]);

  // Live pivot only matters pre-submission in create mode; every other mode (and a
  // create-mode certificate that's already been submitted) renders the frozen snapshot.
  // Lines already covered by an earlier certificate for the same activity are excluded here
  // so they can't be double-certified.
  const livePivot = useMemo(() => {
    if (!isCreateMode) return EMPTY_PIVOT;
    const raw = buildAnnexurePivot(workDone, taskDetailsById, scopeItems, operationalWorkDone, farmerNames);
    const lines = raw.lines.filter((line) => {
      const maxDate = maxCertifiedDateByActivity[line.activity];
      return !maxDate || line.dateOfCompletion > maxDate;
    });
    const includedTaskIds = new Set(lines.flatMap((line) => line.taskIds || []));
    const photos = raw.photos?.filter((photo) => includedTaskIds.has(photo.taskId)) || [];
    return { ...raw, lines, photos };
  }, [isCreateMode, workDone, taskDetailsById, scopeItems, operationalWorkDone, farmerNames, maxCertifiedDateByActivity]);
  const pivot = record ? record.annexure : livePivot;
  const enterprise = pivot.enterprise;
  const enterpriseTotals = enterprise ? calculateWccTotals(enterprise) : null;
  const enterpriseTemplate = enterprise ? WCC_WORK_TEMPLATES.find((item) => item.id === enterprise.header.workCategory) : undefined;

  const vendorName = record?.vendor_name ?? vendorNameProp ?? '';
  const fromDate = record?.from_date ?? fromDateProp ?? '';
  const toDate = record?.to_date ?? toDateProp ?? '';

  const setField = (field: keyof CertificateMeta) => (v: string) => setMeta((prev) => ({ ...prev, [field]: v }));

  // Per-line Rate the preparer fills in on the Annexure — keyed by AnnexureLine.id so edits
  // survive re-renders as fresh work-done data streams in. Seeded from the frozen snapshot in
  // revise mode, so the preparer starts from what was last submitted, not blank.
  const [lineEdits, setLineEdits] = useState<Record<string, string>>(() => {
    if (!existingRecord) return {};
    const seed: Record<string, string> = {};
    for (const line of existingRecord.annexure.lines) {
      seed[line.id] = line.rate ? String(line.rate) : '';
    }
    return seed;
  });
  const setLineRate = (lineId: string) => (value: string) =>
    setLineEdits((prev) => ({ ...prev, [lineId]: value }));

  // Same pattern as lineEdits above, but for Quantity — the auto-computed figure (from
  // completed acreage/work-done records) is only ever a starting point; the preparer can
  // correct it before certifying.
  const [quantityEdits, setQuantityEdits] = useState<Record<string, string>>(() => {
    if (!existingRecord) return {};
    const seed: Record<string, string> = {};
    for (const line of existingRecord.annexure.lines) {
      seed[line.id] = String(line.quantity);
    }
    return seed;
  });
  const setLineQuantity = (lineId: string) => (value: string) =>
    setQuantityEdits((prev) => ({ ...prev, [lineId]: value }));

  // Lines removed from this certificate — a local, session-only override (same idea as
  // lineEdits/quantityEdits) rather than a delete of the underlying work-done/task record, so a
  // mistakenly-logged or otherwise not-to-be-certified line can be dropped from the Annexure
  // without touching the calendar data it came from.
  const [excludedLineIds, setExcludedLineIds] = useState<Set<string>>(() => new Set());
  const excludeLine = (lineId: string) => setExcludedLineIds((prev) => new Set(prev).add(lineId));

  // The lines actually shown/priced/submitted — cultivation & operational lines merge their
  // live rate/quantity edits; enterprise-drafted lines already carry a per-line rate and
  // quantity set earlier in the WccWorkspace wizard, so they're mapped in read-only here.
  const effectiveLines: AnnexureLine[] = useMemo(() => {
    if (enterprise) {
      const lines = enterprise.serviceLines.filter((line) => line.selected && !excludedLineIds.has(line.id)).map((line) => ({
        id: line.id,
        activity: line.description,
        place: line.locationReference || enterprise.header.projectSiteLabel || enterprise.header.site || '—',
        dateOfCompletion: line.completionDate || enterprise.header.statementTo || '',
        uom: line.unit,
        quantity: line.currentQty,
        rate: line.rate,
      }));
      return groupAnnexureLines(lines);
    }
    const lines = pivot.lines.filter((line) => !excludedLineIds.has(line.id)).map((line) => {
      const rateEdit = lineEdits[line.id];
      const quantityEdit = quantityEdits[line.id];
      return {
        ...line,
        rate: rateEdit !== undefined ? Number(rateEdit) || 0 : line.rate,
        quantity: quantityEdit !== undefined ? Number(quantityEdit) || 0 : line.quantity,
      };
    });
    return groupAnnexureLines(lines);
  }, [enterprise, pivot.lines, lineEdits, quantityEdits, excludedLineIds]);

  const taskPhotos = pivot.photos || [];
  const taskPhotoEvidenceRows = buildAnnexurePhotoEvidenceRows(effectiveLines, taskPhotos);
  const taskPhotoPages: AnnexurePhotoEvidenceRow[][] = taskPhotoEvidenceRows.length > 0
    ? Array.from({ length: Math.ceil(taskPhotoEvidenceRows.length / 3) }, (_, pageIndex) => taskPhotoEvidenceRows.slice(pageIndex * 3, pageIndex * 3 + 3))
    : [[]];

  const totalQuantity = effectiveLines.reduce((sum, line) => sum + line.quantity, 0);
  const totalValue = effectiveLines.reduce((sum, line) => sum + line.quantity * line.rate, 0);
  const initialAdjustment = existingRecord?.annexure.adjustment
    ?? (enterpriseTotals ? Math.max(0, enterpriseTotals.gross - enterpriseTotals.net) : 0);
  const [adjustmentEdit, setAdjustmentEdit] = useState(String(initialAdjustment || ''));
  const adjustmentValue = Number(adjustmentEdit) || 0;
  const certifiedAmount = enterpriseTotals ? enterpriseTotals.gross : totalValue;
  const recommendedValue = certifiedAmount - adjustmentValue;
  const [noteEdit, setNoteEdit] = useState(existingRecord?.annexure.note ?? '');
  const [certificationEdit, setCertificationEdit] = useState(() => {
    const saved = existingRecord?.annexure.certification;
    return saved?.text
      || [saved?.paragraph1, saved?.paragraph2].filter(Boolean).join('\n\n')
      || `This is to certify that the work described above has been completed by ${vendorName} in accordance with the terms and conditions of the linked order and has been physically verified by the undersigned.\n\nThe quality and quantity of work executed have been found satisfactory and the work is recommended for processing of payment.`;
  });

  // Per-activity WO line item lookup (uom / rate / assigned quantity) — same
  // get_active_vendor_orders endpoint the on-field task flow uses, matched by activity name
  // against the linked order's line items.
  const effectiveVendorId = vendorId || record?.vendor_id || '';
  const [woLineItemsByActivity, setWoLineItemsByActivity] = useState<Record<string, { uom: string; unitRate: number; quantity: number }>>({});
  useEffect(() => {
    if (!effectiveVendorId || !displayWoNumber) { setWoLineItemsByActivity({}); return; }
    let cancelled = false;
    fetch(`${BASE_URL}/admin_wcc_certificate/get_active_vendor_orders/${effectiveVendorId}`)
      .then((res) => res.json())
      .then((data: { success?: boolean; items_details?: Record<string, Array<{ name: string; uom: string; unit_rate: number; quantity: number }>> }) => {
        if (cancelled || !data?.success) return;
        const items = data.items_details?.[displayWoNumber] ?? [];
        const map: Record<string, { uom: string; unitRate: number; quantity: number }> = {};
        items.forEach((item) => { map[item.name] = { uom: item.uom, unitRate: Number(item.unit_rate) || 0, quantity: Number(item.quantity) || 0 }; });
        if (!cancelled) setWoLineItemsByActivity(map);
      })
      .catch(() => { if (!cancelled) setWoLineItemsByActivity({}); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveVendorId, displayWoNumber]);

  // Per-activity progress against the WO — actualQuantity/ratePerUnit come from the WO line
  // item when one matches, quantityCurrent/totalAmountCurrent are this certificate's own
  // figures, quantityPrevious/totalAmountPrevious come from get_previous_data.
  const activityProgress = useMemo<ActivityProgressRow[]>(() => {
    const order: string[] = [];
    const currentQtyByActivity = new Map<string, number>();
    const currentValueByActivity = new Map<string, number>();
    for (const line of effectiveLines) {
      if (!currentQtyByActivity.has(line.activity)) { order.push(line.activity); currentQtyByActivity.set(line.activity, 0); currentValueByActivity.set(line.activity, 0); }
      currentQtyByActivity.set(line.activity, (currentQtyByActivity.get(line.activity) || 0) + line.quantity);
      currentValueByActivity.set(line.activity, (currentValueByActivity.get(line.activity) || 0) + line.quantity * line.rate);
    }
    return order.map((activity) => {
      const quantityCurrent = currentQtyByActivity.get(activity) || 0;
      const totalAmountCurrent = currentValueByActivity.get(activity) || 0;
      const woItem = woLineItemsByActivity[activity];
      const ratePerUnit = woItem ? woItem.unitRate : (quantityCurrent > 0 ? totalAmountCurrent / quantityCurrent : 0);
      const actualQuantity = woItem ? woItem.quantity : quantityCurrent;
      const uom = woItem?.uom || effectiveLines.find((line) => line.activity === activity)?.uom || '';
      const previous = previousByActivity[activity];
      const quantityPrevious = previous?.totalQuantity ?? 0;
      const totalAmountPrevious = previous?.totalAmount ?? 0;
      return {
        activity,
        uom,
        ratePerUnit,
        actualQuantity,
        quantityPrevious,
        quantityCurrent,
        quantityBalance: actualQuantity - quantityPrevious - quantityCurrent,
        totalAmount: ratePerUnit * actualQuantity,
        totalAmountPrevious,
        totalAmountCurrent,
      };
    });
  }, [effectiveLines, woLineItemsByActivity, previousByActivity]);
  // Enterprise-drafted lines already carry a fixed per-line rate from the WccWorkspace wizard —
  // only cultivation/operational lines (create or revise, before submission) are editable here.
  const linesEditable = !enterprise && ((isCreateMode && !locked) || (isReviseMode && !locked));

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
  const [orderPreviewRecord, setOrderPreviewRecord] = useState<Record<string, unknown> | null>(null);
  const [orderPreviewItems, setOrderPreviewItems] = useState<Array<{ name: string; description?: string; uom: string; quantity: number; unit_rate: number }>>([]);

  const handleOpenOrderPreview = async () => {
    const orderNumber = displayWoNumber.trim();
    if (!orderNumber) return;
    setShowOrderPreview(true);
    setOrderDocUrl(null);
    setOrderDocError(null);
    setOrderPreviewRecord(null);
    setOrderPreviewItems([]);
    setOrderDocLoading(true);
    try {
      const documentResponse = await fetch(`${BASE_URL}/purchase_flow/get_doc_url_of_order/${encodeURIComponent(orderNumber)}`);
      const documentData = await documentResponse.json().catch(() => null) as { document_url?: string } | null;
      if (documentResponse.ok && documentData?.document_url) {
        setOrderDocUrl(documentData.document_url);
        return;
      }

      const allOrdersResponse = await fetch(`${BASE_URL}/purchase_flow/get_all_purchase_orders`, {
        headers: { Accept: 'application/json' },
      });
      const allOrdersData = allOrdersResponse.ok
        ? await allOrdersResponse.json().catch(() => null) as { purchase_orders?: Record<string, unknown>[] } | null
        : null;
      const fullOrder = (Array.isArray(allOrdersData?.purchase_orders) ? allOrdersData.purchase_orders : []).find((order) => {
        const quote = order.purchase_quote && typeof order.purchase_quote === 'object'
          ? order.purchase_quote as Record<string, unknown>
          : {};
        return [order.order_number, quote.order_number, quote.poNo, quote.po_no]
          .some((value) => String(value ?? '').trim() === orderNumber);
      });
      if (fullOrder) {
        setOrderPreviewRecord(fullOrder);
        return;
      }

      if (!effectiveVendorId) throw new Error('Vendor is missing for this Work Order');
      const orderResponse = await fetch(`${BASE_URL}/admin_wcc_certificate/get_active_vendor_orders/${effectiveVendorId}`);
      const orderData = await orderResponse.json().catch(() => null) as {
        success?: boolean;
        items_details?: Record<string, Array<{ name: string; description?: string; uom: string; quantity: number; unit_rate: number }>>;
      } | null;
      const items = orderData?.success ? orderData.items_details?.[orderNumber] ?? [] : [];
      if (!items.length) throw new Error('Work Order details are not available');
      setOrderPreviewItems(items.map((item) => ({ ...item, quantity: Number(item.quantity) || 0, unit_rate: Number(item.unit_rate) || 0 })));
    } catch (error) {
      setOrderDocError(error instanceof Error ? error.message : 'Failed to load Work Order');
    } finally {
      setOrderDocLoading(false);
    }
  };

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
    const landIdsInCertificate = new Set(pivot.lines.map((l) => l.landId).filter((id): id is string => !!id));
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

  const currentPdfParams = (): PdfExportParams => ({
      pivot: { ...pivot, lines: effectiveLines, adjustment: adjustmentValue, note: noteEdit, certification: { text: certificationEdit } },
      vendorName,
      fromDate,
      toDate,
      certNo: certNoDisplay,
      certDate: certDateDisplay,
      woNumber: displayWoNumber,
      blockLabel,
      scopeOfWorkLabel,
      preparedBy: preparedByDisplay,
      verifiedBy: verifiedByDisplay,
      approvedBy: approvedByDisplay,
      activityProgress,
  });

  const handleDownload = () => {
    downloadCertificateAsPdf(currentPdfParams()).catch((err) => console.error('Failed to generate WCC PDF:', err));
  };

  const handlePrint = async () => {
    // Print the same generated PDF used by Download. This keeps the carefully measured A4
    // layout intact and prevents editable popup controls/global print CSS leaking into print.
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow pop-ups to print the certificate.');
      return;
    }

    try {
      printWindow.document.write('<!doctype html><html><head><title>Preparing WCC print</title></head><body style="font:16px Arial;padding:24px">Preparing certificate…</body></html>');
      printWindow.document.close();
      const doc = await buildCertificatePdfDoc(currentPdfParams());
      doc.autoPrint();
      const pdfUrl = URL.createObjectURL(doc.output('blob'));
      printWindow.location.replace(pdfUrl);
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 120_000);
    } catch (error) {
      printWindow.close();
      toast.error(error instanceof Error ? error.message : 'Failed to prepare certificate for printing.');
    }
  };

  const handleSubmitForVerification = async () => {
    if (!user?.id || !user?.name) { toast.error('You must be logged in to submit a certificate.'); return; }
    if (!vendorId) { toast.error('Missing vendor.'); return; }
    if (effectiveLines.length === 0) { toast.error('No completed work to certify.'); return; }
    if (effectiveLines.some((line) => !line.rate)) { toast.error('Please enter a rate for every activity line before submitting.'); return; }
    if (!displayWoNumber.trim()) { toast.error('Please enter a Work Order No. before submitting.'); return; }

    const annexure = { ...pivot, lines: effectiveLines, adjustment: adjustmentValue, note: noteEdit, certification: { text: certificationEdit } };
    const avgRate = totalQuantity > 0 ? totalValue / totalQuantity : 0;

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
          annexure,
          rate_per_acre: avgRate,
          total_quantity: totalQuantity,
          total_certified_value: totalValue,
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
        annexure,
        rate_per_acre: avgRate,
        total_quantity: totalQuantity,
        total_certified_value: totalValue,
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
    if (effectiveLines.some((line) => !line.rate)) { toast.error('Please enter a rate for every activity line before resubmitting.'); return; }

    const annexure = { ...existingRecord.annexure, lines: effectiveLines, adjustment: adjustmentValue, note: noteEdit, certification: { text: certificationEdit } };
    const avgRate = totalQuantity > 0 ? totalValue / totalQuantity : 0;

    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}/admin_wcc_certificate/resubmit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificate_id: existingRecord.certificate_id,
          from_date: existingRecord.from_date,
          to_date: existingRecord.to_date,
          annexure,
          rate_per_acre: avgRate,
          total_quantity: totalQuantity,
          total_certified_value: totalValue,
          prepared_by: { staff_id: user.id, name: user.name, designation: user.designation || '' },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.detail || 'Failed to resubmit certificate');

      const now = new Date().toISOString();
      setSubmittedRecord({
        ...existingRecord,
        annexure,
        rate_per_acre: avgRate,
        total_quantity: totalQuantity,
        total_certified_value: totalValue,
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
    <div className="wcc-print-root fixed inset-0 z-[140] flex items-center justify-center gap-4 bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5">
      <style>{`
        .wcc-certificate-page { order: 1; }
        .wcc-annexure-page { order: 2; }
        .wcc-photo-annexure-page { order: 3; }
        .wcc-activity-table th { border: 1px solid rgba(255, 255, 255, 0.18); }
        .wcc-activity-table td { border: 1px solid #dce7e3; }
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body * { visibility: hidden !important; }
          .wcc-print-root, .wcc-print-root *, .wcc-print-shell, .wcc-print-area, .wcc-print-area * { visibility: visible !important; }
          html, body { width: 210mm; min-width: 210mm; margin: 0 !important; padding: 0 !important; background: white !important; }
          .wcc-print-root { position: static !important; display: block !important; width: 190mm !important; height: auto !important; padding: 0 !important; background: white !important; backdrop-filter: none !important; }
          .wcc-print-shell { position: static !important; display: block !important; width: 190mm !important; max-width: 190mm !important; height: auto !important; overflow: visible !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; transform: none !important; animation: none !important; }
          .wcc-print-area { position: static !important; display: flex !important; box-sizing: border-box; width: 190mm !important; max-width: 190mm !important; height: auto !important; padding: 0 !important; background: white !important; gap: 0 !important; overflow: visible !important; }
          .wcc-certificate-page, .wcc-annexure-page, .wcc-photo-annexure-page { box-sizing: border-box; width: 190mm !important; max-width: 190mm !important; }
          .wcc-certificate-page { break-after: page; page-break-after: always; border-radius: 0 !important; box-shadow: none !important; }
          .wcc-annexure-page, .wcc-photo-annexure-page { break-before: page; page-break-before: always; border-radius: 0 !important; box-shadow: none !important; }
          .wcc-document-table { break-inside: auto; }
          .wcc-document-table { width: 100% !important; min-width: 0 !important; table-layout: fixed !important; font-size: 7pt !important; }
          .wcc-document-table th, .wcc-document-table td { padding: 1.5mm 1mm !important; overflow-wrap: anywhere; }
          .wcc-document-table tr { break-inside: avoid; page-break-inside: avoid; }
          .wcc-no-print { display: none !important; }
        }
      `}</style>
      <div
        className={cn(
          'wcc-print-shell flex h-[92vh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white shadow-[0_30px_90px_rgba(2,20,17,0.35)] animate-in zoom-in-95 duration-200',
          showOrderPreview ? 'w-full max-w-2xl' : 'w-full max-w-[1180px]',
        )}
      >
        {/* Header */}
        <div className="wcc-no-print flex shrink-0 items-center justify-between gap-4 bg-[#0D3A35] px-6 py-4 text-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-lg font-bold tracking-tight">Work Completion Certificate</h3>
              {record && (
                <span className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold', STATUS_TONE[record.status])}>
                  {STATUS_LABEL[record.status]}
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-xs font-medium text-white/60">{vendorName} · {formatDate(fromDate)} – {formatDate(toDate)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-xs font-bold text-white transition-colors hover:bg-white/20"
            >
              <Download className="w-3.5 h-3.5" /> Download PDF
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-xs font-bold text-[#0D3A35] transition-colors hover:bg-[#eef7f4]"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close preview">
              <X className="h-5 w-5" />
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
        <div className="wcc-print-area flex flex-1 flex-col gap-7 overflow-y-auto bg-[#eef2f4] p-5 sm:p-7 lg:p-8">
          {effectiveLines.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">
              No completed work found for this vendor in the selected period.
            </div>
          ) : (
            <>
              {/* Annexure */}
              <div className="wcc-annexure-page mx-auto min-h-[1123px] w-full max-w-[794px] shrink-0 overflow-hidden rounded-2xl border border-[#b9d2cb] bg-white shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
                <div className="border-b border-[#dce7e3] bg-[#f3f8f6] px-6 py-5 text-center">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#18765f]">Work Completion Certificate</p>
                  <h2 className="mt-1 text-xl font-bold uppercase tracking-wide text-slate-950">Annexure - 1</h2>
                </div>
                <div className="px-5 pt-5">
                  <table className="wcc-document-table w-full table-fixed border-collapse border border-[#b9d2cb] text-xs">
                    <tbody>
                      <tr>
                        <th className="w-1/5 border border-[#b9d2cb] bg-[#f3f8f6] px-3 py-2 text-left font-bold text-[#0D3A35]">Vendor / Contractor</th>
                        <td className="w-[30%] border border-[#b9d2cb] px-3 py-2 text-slate-700">{vendorName}</td>
                        <th className="w-1/5 border border-[#b9d2cb] bg-[#f3f8f6] px-3 py-2 text-left font-bold text-[#0D3A35]">Work Order No.</th>
                        <td className="w-[30%] border border-[#b9d2cb] px-3 py-2 text-slate-700">{displayWoNumber || '—'}</td>
                      </tr>
                      <tr>
                        <th className="border border-[#b9d2cb] bg-[#f3f8f6] px-3 py-2 text-left font-bold text-[#0D3A35]">WCC No.</th>
                        <td className="border border-[#b9d2cb] px-3 py-2 text-slate-700">{certNoDisplay || '—'}</td>
                        <th className="border border-[#b9d2cb] bg-[#f3f8f6] px-3 py-2 text-left font-bold text-[#0D3A35]">Work Period</th>
                        <td className="border border-[#b9d2cb] px-3 py-2 text-slate-700">{formatDate(fromDate)} – {formatDate(toDate)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="overflow-x-auto p-5 pt-3">
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="wcc-document-table wcc-activity-table w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#0D3A35] text-white">
                        <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wide">S. No.</th>
                        <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wide">Activity</th>
                        <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wide">Place</th>
                        <th className="whitespace-nowrap px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wide">Date of Completion</th>
                        <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wide">UOM</th>
                        <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wide">Quantity</th>
                        <th className="whitespace-nowrap px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wide">Rate / Unit (₹)</th>
                        <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wide">Value (₹)</th>
                        {linesEditable && <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wide">Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {effectiveLines.map((line, i) => (
                        <tr key={line.id} className={cn('border-b border-slate-100 transition-colors hover:bg-[#0D3A35]/[0.025]', i % 2 === 1 && 'bg-slate-50/50')}>
                          <td className="px-3 py-2.5 text-center text-slate-500">{i + 1}</td>
                          <td className="px-3 py-2.5 font-semibold text-slate-800">{line.activity}</td>
                          <td className="px-3 py-2.5 text-slate-600">{line.place}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{formatDate(line.dateOfCompletion)}</td>
                          <td className="px-3 py-2.5 text-slate-600">{line.uom}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">
                            {linesEditable ? (
                              <input
                                type="number"
                                value={quantityEdits[line.id] ?? String(line.quantity)}
                                onChange={(e) => setLineQuantity(line.id)(e.target.value)}
                                placeholder="0"
                                className="w-20 border-b border-dashed border-gray-300 bg-transparent text-right outline-none focus:border-[#0D3A35]"
                              />
                            ) : (
                              line.quantity.toFixed(2)
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                            {linesEditable ? (
                              <input
                                type="number"
                                value={lineEdits[line.id] ?? ''}
                                onChange={(e) => setLineRate(line.id)(e.target.value)}
                                placeholder="0"
                                className="w-20 border-b border-dashed border-gray-300 bg-transparent text-right outline-none focus:border-[#0D3A35]"
                              />
                            ) : (
                              line.rate ? line.rate.toFixed(2) : '—'
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums text-slate-800">{line.rate ? (line.quantity * line.rate).toFixed(2) : '—'}</td>
                          {linesEditable && (
                            <td className="px-3 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => excludeLine(line.id)}
                                title="Remove this line from the certificate"
                                className="rounded-md p-1.5 text-red-500 hover:bg-red-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                      <tr className="bg-[#eaf4f1] font-bold text-[#0D3A35]">
                        <td className="px-3 py-3" colSpan={5}>Total certified work</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{totalQuantity.toFixed(2)}</td>
                        <td className="px-3 py-3" />
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{totalValue ? totalValue.toFixed(2) : '—'}</td>
                        {linesEditable && <td className="px-3 py-3" />}
                      </tr>
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>

              {/* Annexure - 2: task photographs, six structured cards per sheet. */}
              {taskPhotoPages.map((photoPage, photoPageIndex) => (
                <div key={`photo-annexure-${photoPageIndex}`} className="wcc-photo-annexure-page mx-auto min-h-[1123px] w-full max-w-[794px] shrink-0 overflow-hidden rounded-2xl border border-[#b9d2cb] bg-white shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
                  <div className="border-b border-[#dce7e3] bg-[#f3f8f6] px-6 py-5 text-center">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#18765f]">Work Completion Certificate</p>
                    <h2 className="mt-1 text-xl font-bold uppercase tracking-wide text-slate-950">
                      Annexure - 2: Task Photographs{photoPageIndex > 0 ? ' (Continued)' : ''}
                    </h2>
                  </div>
                  <div className="px-5 pt-5">
                    <table className="wcc-document-table w-full table-fixed border-collapse border border-[#b9d2cb] text-xs">
                      <tbody>
                        <tr>
                          <th className="w-1/5 border border-[#b9d2cb] bg-[#f3f8f6] px-3 py-2 text-left font-bold text-[#0D3A35]">WCC No.</th>
                          <td className="w-[30%] border border-[#b9d2cb] px-3 py-2 text-slate-700">{certNoDisplay || '—'}</td>
                          <th className="w-1/5 border border-[#b9d2cb] bg-[#f3f8f6] px-3 py-2 text-left font-bold text-[#0D3A35]">Work Order No.</th>
                          <td className="w-[30%] border border-[#b9d2cb] px-3 py-2 text-slate-700">{displayWoNumber || '—'}</td>
                        </tr>
                        <tr>
                          <th className="border border-[#b9d2cb] bg-[#f3f8f6] px-3 py-2 text-left font-bold text-[#0D3A35]">Vendor / Contractor</th>
                          <td className="border border-[#b9d2cb] px-3 py-2 text-slate-700">{vendorName || '—'}</td>
                          <th className="border border-[#b9d2cb] bg-[#f3f8f6] px-3 py-2 text-left font-bold text-[#0D3A35]">Work Period</th>
                          <td className="border border-[#b9d2cb] px-3 py-2 text-slate-700">{formatDate(fromDate)} – {formatDate(toDate)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {photoPage.length > 0 ? (
                    <div className="space-y-4 p-5 pt-4">
                      {photoPage.map((evidenceRow) => (
                        <section key={evidenceRow.id} className="overflow-hidden rounded-lg border border-[#b9d2cb] bg-white">
                          <div className="border-b border-[#b9d2cb] bg-[#f3f8f6] px-3 py-2">
                            <p className="text-xs font-bold text-[#0D3A35]">
                              Annexure Row {evidenceRow.annexureRowNumber}{evidenceRow.photoOffset > 0 ? ' (continued)' : ''} - {evidenceRow.activity}
                            </p>
                            <p className="mt-0.5 text-[10px] text-slate-500">
                              Location: {evidenceRow.place || '—'} · Completion Date: {formatDate(evidenceRow.dateOfCompletion)}
                            </p>
                          </div>
                          <div className="grid grid-cols-3 divide-x divide-[#b9d2cb]">
                            {Array.from({ length: 3 }, (_, photoSlot) => {
                              const photo = evidenceRow.photos[photoSlot];
                              const photoNumber = evidenceRow.photoOffset + photoSlot + 1;
                              return (
                                <figure key={`${evidenceRow.id}__slot__${photoSlot}`} className="min-w-0">
                                  <div className="flex h-40 items-center justify-center bg-slate-50 p-2">
                                    {photo ? (
                                      <img src={photo.imageUrl} alt={`${evidenceRow.activity} evidence ${photoNumber}`} className="h-full w-full object-contain" />
                                    ) : (
                                      <span className="text-[11px] font-medium text-slate-400">Photo not available</span>
                                    )}
                                  </div>
                                  <figcaption className="border-t border-[#dce7e3] px-3 py-2 text-[10px] leading-4">
                                    <p className="font-bold text-[#0D3A35]">Photo {photoNumber}</p>
                                    <p className="truncate text-slate-500">{photo ? `Task ID: ${photo.taskId}` : 'No task photo uploaded'}</p>
                                  </figcaption>
                                </figure>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <div className="m-5 rounded-lg border border-[#b9d2cb] px-6 py-12 text-center text-sm text-slate-400">
                      No task photographs were available for this WCC.
                    </div>
                  )}
                </div>
              ))}

              {/* Work Completion Certificate — replica of the real document */}
              <div className="wcc-certificate-page mx-auto min-h-[1123px] w-full max-w-[794px] shrink-0 overflow-hidden rounded-2xl border border-[#0D3A35]/30 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
                {/* Letterhead */}
                <div className="border-b border-[#0D3A35]/20 bg-white px-6 py-5 text-center">
                  <img src={logo3f} alt="3F Logo" className="mx-auto mb-2 h-12 w-auto" />
                  <h1 className="text-xl font-bold tracking-wide text-slate-950">{COMPANY_NAME}</h1>
                  <p className="mt-1 text-[11px] font-medium text-slate-500">{COMPANY_ADDRESS}</p>
                  <h2 className="-mx-6 -mb-5 mt-4 border-y border-[#dce7e3] bg-[#eaf4f1] px-6 py-3 text-base font-bold uppercase tracking-wide text-[#0D3A35]">
                    Work Completion Certificate
                  </h2>
                </div>

                {/* Certificate No. / Date */}
                <table className="wcc-document-table w-full table-fixed border-collapse text-xs">
                  <colgroup>
                    <col className="w-[18%]" />
                    <col className="w-[32%]" />
                    <col className="w-[18%]" />
                    <col className="w-[32%]" />
                  </colgroup>
                  <tbody>
                    <tr className="border-b border-[#dce7e3]">
                      <td className="border-r border-[#dce7e3] bg-[#f3f8f6] px-4 py-2.5 font-bold text-[#0D3A35]">Certificate No.</td>
                      <td className="border-r border-[#dce7e3] px-4 py-2.5 font-mono font-semibold text-slate-800">
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
                      <td className="border-r border-[#dce7e3] bg-[#f3f8f6] px-4 py-2.5 font-bold text-[#0D3A35]">Date</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-700">
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
                <div className="grid grid-cols-[1fr_2fr] border-b border-[#dce7e3] bg-[#0D3A35] text-center text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                  <div className="border-r border-white/15 px-4 py-2">Particulars</div>
                  <div className="px-4 py-2">Details</div>
                </div>
                <table className="wcc-document-table w-full border-collapse text-xs">
                  <tbody>
                    {locked || !isCreateMode ? (
                      <ParticularRow label="Work Order No." staticValue={displayWoNumber || '—'} />
                    ) : (
                      <ParticularRow
                        label="Work Order No."
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

                {/* Activity-wise certified value — per-line rate/qty edits live on the
                    Annexure above; this rolls those lines up by activity as a running-account
                    progress table. "Previous" columns are placeholders (always 0) until the
                    backend can report quantity already certified in earlier WCCs. */}
                <div className="border-t border-[#dce7e3] px-5 py-4 text-xs">
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="wcc-activity-table wcc-document-table w-full min-w-[720px] border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#0D3A35] text-white">
                          <th className="px-2 py-2 text-center font-bold">S. No.</th>
                          <th className="px-2 py-2 text-center font-bold">Activity</th>
                          <th className="px-2 py-2 text-center font-bold">UOM</th>
                          <th className="whitespace-nowrap px-2 py-2 text-center font-bold">WO Qty.</th>
                          <th className="whitespace-nowrap px-2 py-2 text-center font-bold">Prev. Qty.</th>
                          <th className="whitespace-nowrap px-2 py-2 text-center font-bold">Quantity</th>
                          <th className="whitespace-nowrap px-2 py-2 text-center font-bold">Bal. Qty.</th>
                          <th className="whitespace-nowrap px-2 py-2 text-center font-bold">Rate/Unit (₹)</th>
                          <th className="whitespace-nowrap px-2 py-2 text-center font-bold">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activityProgress.map((row, i) => (
                          <tr key={row.activity} className="border-t border-slate-100 hover:bg-[#0D3A35]/[0.025]">
                            <td className="px-1.5 py-1 text-center">{i + 1}</td>
                            <td className="px-1.5 py-1 text-slate-700">{row.activity}</td>
                            <td className="px-1.5 py-1 text-slate-500">{row.uom || '—'}</td>
                            <td className="px-1.5 py-1 text-right whitespace-nowrap">{row.actualQuantity.toFixed(2)}</td>
                            <td className="px-1.5 py-1 text-right whitespace-nowrap">{row.quantityPrevious.toFixed(2)}</td>
                            <td className="px-1.5 py-1 text-right whitespace-nowrap">{row.quantityCurrent.toFixed(2)}</td>
                            <td className="px-1.5 py-1 text-right whitespace-nowrap">{row.quantityBalance.toFixed(2)}</td>
                            <td className="px-1.5 py-1 text-right whitespace-nowrap">{row.ratePerUnit ? formatInr(row.ratePerUnit) : '—'}</td>
                            <td className="px-1.5 py-1 text-right whitespace-nowrap font-medium">{row.totalAmountCurrent ? formatInr(row.totalAmountCurrent) : '—'}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-[#cde2dc] bg-[#eaf4f1] font-bold text-[#0D3A35]">
                          <td className="px-1.5 py-1" colSpan={3}>Total</td>
                          <td className="px-1.5 py-1 text-right whitespace-nowrap">{activityProgress.reduce((sum, row) => sum + row.actualQuantity, 0).toFixed(2)}</td>
                          <td className="px-1.5 py-1 text-right whitespace-nowrap">{activityProgress.reduce((sum, row) => sum + row.quantityPrevious, 0).toFixed(2)}</td>
                          <td className="px-1.5 py-1 text-right whitespace-nowrap">{activityProgress.reduce((sum, row) => sum + row.quantityCurrent, 0).toFixed(2)}</td>
                          <td className="px-1.5 py-1 text-right whitespace-nowrap">{activityProgress.reduce((sum, row) => sum + row.quantityBalance, 0).toFixed(2)}</td>
                          <td className="px-1.5 py-1" />
                          <td className="px-1.5 py-1 text-right whitespace-nowrap">{totalValue ? formatInr(totalValue) : '—'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Certified-value summary */}
                <div className="overflow-hidden border-t border-[#dce7e3]">
                  <table className="wcc-document-table w-full table-fixed border-collapse text-xs">
                    <thead className="bg-[#f1f7f5] text-[#0D3A35]">
                      <tr>
                        <th className="w-1/3 border-r border-[#dce7e3] px-3 py-1.5 text-center font-extrabold">Certified Value (₹)</th>
                        <th className="w-1/3 border-r border-[#dce7e3] px-3 py-1.5 text-center font-extrabold">Adjustment</th>
                        <th className="w-1/3 px-3 py-1.5 text-center font-extrabold">Recommended Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-[#dce7e3]">
                        <td className="border-r border-[#dce7e3] bg-white px-3 py-1.5 text-center font-bold tabular-nums text-slate-800">{formatInr(certifiedAmount)}</td>
                        <td className="border-r border-[#dce7e3] bg-white px-3 py-1 text-center">
                          {locked ? (
                            <span className="font-bold tabular-nums text-slate-800">{formatInr(adjustmentValue)}</span>
                          ) : (
                            <label className="relative mx-auto block max-w-[180px]">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">₹</span>
                              <input
                                type="number"
                                step="0.01"
                                value={adjustmentEdit}
                                onChange={(event) => setAdjustmentEdit(event.target.value)}
                                placeholder="0.00"
                                className="h-7 w-full rounded-md border border-slate-200 bg-white pl-7 pr-3 text-right font-bold tabular-nums text-slate-800 outline-none focus:border-[#0D3A35] focus:ring-2 focus:ring-[#0D3A35]/10"
                              />
                            </label>
                          )}
                        </td>
                        <td className="bg-[#eaf4f1] px-3 py-1.5 text-center font-black tabular-nums text-[#0D3A35]">{formatInr(recommendedValue)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Note */}
                <div className="mx-5 mt-4 rounded-lg border border-slate-300 px-4 py-3 text-xs leading-5 text-slate-600">
                  <div className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#18765f]">Note</div>
                  {locked ? (
                    <p className="whitespace-pre-wrap font-medium">{noteEdit.trim() || '—'}</p>
                  ) : (
                    <textarea
                      rows={2}
                      value={noteEdit}
                      onChange={(event) => setNoteEdit(event.target.value)}
                      placeholder="Enter a note for this certificate"
                      className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium leading-5 text-slate-600 outline-none focus:border-[#0D3A35] focus:ring-2 focus:ring-[#0D3A35]/10"
                    />
                  )}
                </div>

                {/* Certification paragraph */}
                <div className="mx-5 my-4 rounded-lg border border-slate-300 px-4 py-3 text-xs leading-5 text-slate-600">
                  <div className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#18765f]">Certification</div>
                  {locked ? (
                    <p className="whitespace-pre-wrap font-medium">{certificationEdit}</p>
                  ) : (
                    <textarea
                      rows={4}
                      value={certificationEdit}
                      onChange={(event) => setCertificationEdit(event.target.value)}
                      className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium leading-5 text-slate-600 outline-none focus:border-[#0D3A35] focus:ring-2 focus:ring-[#0D3A35]/10"
                    />
                  )}
                </div>

                {/* Sign-off */}
                <table className="wcc-document-table w-full table-fixed border-collapse border border-[#b9d2cb] text-xs">
                  <thead>
                    <tr className="bg-[#0D3A35] text-white">
                      <th className="w-1/3 border-r border-white/15 px-3 py-2 text-center font-bold">Prepared By</th>
                      <th className="w-1/3 border-r border-white/15 px-3 py-2 text-center font-bold">Verified By</th>
                      <th className="w-1/3 px-3 py-2 text-center font-bold">Approved By</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {([
                        { key: 'prepared', signer: preparedByDisplay as SignerDisplay | null },
                        { key: 'verified', signer: verifiedByDisplay },
                        { key: 'approved', signer: approvedByDisplay },
                      ] as const).map(({ key, signer }, idx) => (
                        <td key={key} className={cn('border-[#b9d2cb] px-4 py-3 align-top', idx < 2 && 'border-r')}>
                          <div className="mb-1"><span className="text-slate-500">Name: </span><span className="font-medium">{signer?.name || '—'}</span></div>
                          <div className="mb-4"><span className="text-slate-500">Designation: </span><span className="font-medium">{signer?.designation || '—'}</span></div>
                          <div className="text-slate-400">{signer ? 'Signature:' : 'Pending'}</div>
                          <div className="mt-1 h-10 border-b border-[#b9d2cb]" />
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
              {isCreateMode && !locked && 'Fill in the rate and Work Order No., then submit for verification.'}
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
            ) : orderPreviewRecord ? (
              <div className="h-full overflow-auto bg-[#eef2f4] p-4">
                <div className="mx-auto w-[794px] max-w-none">
                  <FullWorkOrderPreview order={orderPreviewRecord} />
                </div>
              </div>
            ) : orderPreviewItems.length > 0 ? (
              <div className="h-full overflow-y-auto bg-[#eef2f4] p-5">
                <div className="mx-auto min-h-full max-w-[794px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-[#dce7e3] bg-[#f3f8f6] px-6 py-6 text-center">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#18765f]">Procurement · Active Work Order</p>
                    <h4 className="mt-2 text-xl font-bold text-slate-950">WORK ORDER</h4>
                    <p className="mt-2 font-mono text-sm font-bold text-[#0D3A35]">{displayWoNumber}</p>
                  </div>
                  <div className="grid border-b border-slate-200 sm:grid-cols-2">
                    <div className="border-b border-slate-200 px-5 py-4 sm:border-b-0 sm:border-r"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Vendor / Contractor</p><p className="mt-1 text-sm font-bold text-slate-800">{vendorName}</p></div>
                    <div className="px-5 py-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Order status</p><p className="mt-1 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">Active</p></div>
                  </div>
                  <div className="p-5">
                    <h5 className="mb-3 text-xs font-extrabold uppercase tracking-[0.12em] text-[#18765f]">Work Order Line Items</h5>
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <table className="w-full table-fixed border-collapse text-xs">
                        <thead className="bg-[#0D3A35] text-white"><tr><th className="w-[8%] px-3 py-3 text-center font-bold">S. No.</th><th className="w-[37%] px-3 py-3 text-left font-bold">Activity / Service</th><th className="w-[11%] px-3 py-3 text-center font-bold">UOM</th><th className="w-[13%] px-3 py-3 text-right font-bold">WO Qty.</th><th className="w-[14%] px-3 py-3 text-right font-bold">Rate (₹)</th><th className="w-[17%] px-3 py-3 text-right font-bold">Value (₹)</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {orderPreviewItems.map((item, index) => <tr key={`${item.name}-${index}`} className="hover:bg-[#0D3A35]/[0.025]"><td className="px-3 py-3 text-center text-slate-500">{index + 1}</td><td className="px-3 py-3"><p className="font-semibold text-slate-800">{item.name}</p>{item.description && <p className="mt-0.5 text-[10px] text-slate-400">{item.description}</p>}</td><td className="px-3 py-3 text-center text-slate-600">{item.uom || '—'}</td><td className="px-3 py-3 text-right font-semibold tabular-nums">{item.quantity.toFixed(2)}</td><td className="px-3 py-3 text-right tabular-nums">{formatInr(item.unit_rate)}</td><td className="px-3 py-3 text-right font-bold tabular-nums text-slate-800">{formatInr(item.quantity * item.unit_rate)}</td></tr>)}
                        </tbody>
                        <tfoot><tr className="bg-[#eaf4f1] font-bold text-[#0D3A35]"><td className="px-3 py-3" colSpan={5}>Total Work Order Value</td><td className="px-3 py-3 text-right tabular-nums">{formatInr(orderPreviewItems.reduce((sum, item) => sum + item.quantity * item.unit_rate, 0))}</td></tr></tfoot>
                      </table>
                    </div>
                  </div>
                </div>
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
