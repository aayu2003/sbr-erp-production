import { jsPDF } from 'jspdf';
import { autoTable, type RowInput } from 'jspdf-autotable';

import logo3f from '@/Assets/3f-logo.png';
import { formatDateDDMMYYYY } from '@/lib/dateFormat';

const COMPANY_NAME = 'SAI BIORESOURCES PRIVATE LIMITED';
const COMPANY_ADDRESS = 'Khasra No. 121/1, Amrit Dairy Farm, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh - 491001';
const COMPANY_DETAILS = 'GSTIN: 22ARPCS5442R1ZM  |  Phone: +91 75870 76870  |  Email: rajendra.s@saiobioenergy.com';
const PROJECT_GREEN: [number, number, number] = [13, 58, 53];
const LIGHT_GREEN: [number, number, number] = [237, 245, 242];
const LIGHT_SLATE: [number, number, number] = [241, 245, 249];
const GRID_SLATE: [number, number, number] = [203, 213, 225];
const TEXT_SLATE: [number, number, number] = [51, 65, 85];
const MUTED_SLATE: [number, number, number] = [100, 116, 139];

export type LandOwnerPdfParcel = {
  parcelId: string;
  location: string;
  crop: string;
  areaAcres: number;
  cluster: string;
  zone: string;
  block: string;
  leaseStart: string;
  leaseEnd: string;
  leaseRate: string;
  lockInStart: string;
  lockInEnd: string;
};

export type LandOwnerPdfAgreement = {
  startDate: string;
  endDate: string;
  leaseRate: string;
  lockInStart: string;
  lockInEnd: string;
};

export type LandOwnerPdfBankAccount = {
  holderName: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
};

export type LandOwnerPdfCoOwner = {
  parcelId: string;
  name: string;
  relationship: string;
  contact: string;
  aadhaar: string;
  pan: string;
  ownershipShare: string;
};

export type LandOwnerPdfRecord = {
  id: string;
  name: string;
  status: string;
  farmingOption: string;
  phone: string;
  alternatePhone: string;
  email: string;
  address: string;
  village: string;
  taluka: string;
  district: string;
  state: string;
  cluster: string;
  zone: string;
  block: string;
  aadhaar: string;
  pan: string;
  createdAt: string;
  totalAreaAcres: number;
  parcels: LandOwnerPdfParcel[];
  agreements: LandOwnerPdfAgreement[];
  bankAccounts: LandOwnerPdfBankAccount[];
  coOwners: LandOwnerPdfCoOwner[];
  documents: Array<{ label: string; available: boolean; url?: string }>;
};

export type LandOwnerDirectoryPdfOptions = {
  generatedBy?: string;
  includeProfiles?: boolean;
};

type JsPdfWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };
const paintedWhitePages = new WeakMap<jsPDF, Set<number>>();

const ensureWhitePageBackground = (doc: jsPDF) => {
  const pageNumber = doc.getCurrentPageInfo().pageNumber;
  const paintedPages = paintedWhitePages.get(doc) ?? new Set<number>();
  if (paintedPages.has(pageNumber)) return;
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 210, 297, 'F');
  paintedPages.add(pageNumber);
  paintedWhitePages.set(doc, paintedPages);
};

const display = (value: unknown, fallback = 'Not Recorded') => {
  const normalized = String(value ?? '').trim();
  return normalized && normalized.toLowerCase() !== 'n/a' ? normalized : fallback;
};

const formatAcres = (value: number) => `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(Number.isFinite(value) ? value : 0)} ac`;

const formatDate = (value: string) => value ? formatDateDDMMYYYY(value, display(value)) : 'Not Recorded';

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
  return {
    reportId: `LOR-${year}${month}${day}-${hours}${minutes}`,
    generatedOn: `${formatDateDDMMYYYY(date)} ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
  };
};

const drawPageBorder = (doc: jsPDF) => {
  doc.setDrawColor(184, 197, 209);
  doc.setLineWidth(0.3);
  doc.rect(8, 8, 194, 281);
};

const drawCompanyHeader = (doc: jsPDF, logoDataUrl: string, title: string) => {
  if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', 96, 12, 18, 18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(20, 45, 76);
  doc.text(COMPANY_NAME, 105, 37, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(82, 97, 115);
  doc.text(COMPANY_ADDRESS, 105, 43, { align: 'center' });
  doc.setFontSize(7);
  doc.text(COMPANY_DETAILS, 105, 48, { align: 'center' });
  doc.setDrawColor(...PROJECT_GREEN);
  doc.setLineWidth(0.6);
  doc.line(12, 54, 198, 54);
  doc.setFillColor(...PROJECT_GREEN);
  doc.rect(12, 58, 186, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(title, 105, 64, { align: 'center' });
};

const drawMetadata = (doc: jsPDF, y: number, values: Array<{ label: string; value: string }>) => {
  const width = 186 / values.length;
  values.forEach((entry, index) => {
    const x = 12 + index * width;
    doc.setDrawColor(...GRID_SLATE);
    doc.setLineWidth(0.2);
    doc.rect(x, y, width, 13);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.6);
    doc.setTextColor(...MUTED_SLATE);
    doc.text(entry.label.toUpperCase(), x + 2, y + 4);
    doc.setFontSize(7);
    doc.setTextColor(20, 45, 76);
    doc.text(doc.splitTextToSize(display(entry.value), width - 4).slice(0, 2), x + 2, y + 8);
  });
};

const drawSectionBand = (doc: jsPDF, y: number, title: string) => {
  doc.setDrawColor(...GRID_SLATE);
  doc.setFillColor(...LIGHT_SLATE);
  doc.rect(12, y, 186, 7, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...TEXT_SLATE);
  doc.text(title.toUpperCase(), 14, y + 4.7);
};

const drawSummary = (doc: jsPDF, y: number, values: Array<{ label: string; value: string }>) => {
  drawSectionBand(doc, y, 'Directory Summary');
  const width = 186 / values.length;
  values.forEach((entry, index) => {
    const x = 12 + index * width;
    doc.setDrawColor(...GRID_SLATE);
    doc.rect(x, y + 7, width, 13);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.7);
    doc.setTextColor(...MUTED_SLATE);
    doc.text(entry.label.toUpperCase(), x + 2, y + 11);
    doc.setFontSize(7.5);
    doc.setTextColor(20, 45, 76);
    doc.text(entry.value, x + 2, y + 16);
  });
};

const tableDefaults = {
  theme: 'grid' as const,
  margin: { top: 27, right: 12, bottom: 20, left: 12 },
  styles: {
    fontSize: 5.5,
    cellPadding: 1.2,
    lineColor: GRID_SLATE,
    lineWidth: 0.18,
    textColor: TEXT_SLATE,
    valign: 'top' as const,
    overflow: 'linebreak' as const,
  },
  headStyles: {
    fillColor: PROJECT_GREEN,
    textColor: [255, 255, 255] as [number, number, number],
    fontStyle: 'bold' as const,
    halign: 'center' as const,
    valign: 'middle' as const,
    fontSize: 5.1,
    minCellHeight: 8,
  },
  alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
};

const ensureSpace = (doc: JsPdfWithAutoTable, y: number, requiredHeight: number) => {
  if (y + requiredHeight <= 272) return y;
  doc.addPage();
  ensureWhitePageBackground(doc);
  return 29;
};

const drawProfileSection = (
  doc: JsPdfWithAutoTable,
  y: number,
  title: string,
  head: RowInput[],
  body: RowInput[],
  columnStyles?: Record<number, object>,
) => {
  const startY = ensureSpace(doc, y, 20);
  drawSectionBand(doc, startY, title);
  autoTable(doc, {
    ...tableDefaults,
    startY: startY + 7,
    head,
    body,
    rowPageBreak: 'avoid',
    columnStyles,
    willDrawPage: () => ensureWhitePageBackground(doc),
  });
  return doc.lastAutoTable.finalY + 4;
};

export const buildLandOwnerDirectoryPdfDoc = async (
  records: LandOwnerPdfRecord[],
  options: LandOwnerDirectoryPdfOptions = {},
) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as JsPdfWithAutoTable;
  const generatedAt = new Date();
  const { reportId, generatedOn } = reportTimestamp(generatedAt);
  const generatedBy = options.generatedBy?.trim() || 'System User';
  let logoDataUrl = '';
  try { logoDataUrl = await imageAsDataUrl(logo3f); } catch { logoDataUrl = ''; }

  ensureWhitePageBackground(doc);
  drawCompanyHeader(doc, logoDataUrl, 'LAND OWNER DIRECTORY');
  drawMetadata(doc, 67, [
    { label: 'Report ID', value: reportId },
    { label: 'Land Owners', value: String(records.length) },
    { label: 'Total Parcels', value: String(records.reduce((sum, record) => sum + record.parcels.length, 0)) },
    { label: 'Generated On', value: generatedOn },
    { label: 'Generated By', value: generatedBy },
  ]);
  drawSectionBand(doc, 83, 'Land Owner Register');

  const registerBody: RowInput[] = records.length
    ? records.map((record, index) => [
      index + 1,
      `${display(record.name)}\n${display(record.id)}`,
      `${display(record.phone)}\n${display(record.email)}`,
      `${display(record.village)}, ${display(record.district)}, ${display(record.state)}`,
      formatAcres(record.totalAreaAcres),
      record.parcels.length,
      display(record.status),
    ])
    : [[{ content: 'No land-owner records found.', colSpan: 7, styles: { halign: 'center', textColor: MUTED_SLATE } }]];

  autoTable(doc, {
    ...tableDefaults,
    startY: 90,
    head: [['S.No.', 'Land Owner / ID', 'Contact', 'Location', 'Total Area', 'Parcels', 'Status']],
    body: registerBody,
    rowPageBreak: 'avoid',
    willDrawPage: () => ensureWhitePageBackground(doc),
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 37 },
      2: { cellWidth: 35 },
      3: { cellWidth: 51 },
      4: { cellWidth: 19, halign: 'right' },
      5: { cellWidth: 14, halign: 'center' },
      6: { cellWidth: 21, halign: 'center' },
    },
  });

  let summaryY = doc.lastAutoTable.finalY + 4;
  if (summaryY > 260) {
    doc.addPage();
    ensureWhitePageBackground(doc);
    summaryY = 29;
  }
  const totalArea = records.reduce((sum, record) => sum + record.totalAreaAcres, 0);
  const disputed = records.filter((record) => record.status.toLowerCase() === 'disputed').length;
  drawSummary(doc, summaryY, [
    { label: 'Total Land Owners', value: String(records.length) },
    { label: 'Active Owners', value: String(records.length - disputed) },
    { label: 'Disputed Owners', value: String(disputed) },
    { label: 'Total Land Area', value: formatAcres(totalArea) },
  ]);

  if (options.includeProfiles) {
    for (const [ownerIndex, record] of records.entries()) {
      doc.addPage();
      ensureWhitePageBackground(doc);
      drawCompanyHeader(doc, logoDataUrl, 'LAND OWNER PROFILE');
      doc.setFillColor(...LIGHT_GREEN);
      doc.setDrawColor(...PROJECT_GREEN);
      doc.rect(12, 70, 186, 13, 'FD');
      doc.setTextColor(...PROJECT_GREEN);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`${ownerIndex + 1}. ${display(record.name)}`, 15, 76);
      doc.setFontSize(6.2);
      doc.text(`LAND OWNER ID: ${display(record.id)}  |  STATUS: ${display(record.status).toUpperCase()}`, 15, 80.2);

      let y = 87;
      y = drawProfileSection(doc, y, 'Personal, Contact and KYC Details', [], [
      ['Land Owner ID', display(record.id), 'Full Name', display(record.name)],
      ['Farming Option', display(record.farmingOption, 'Land Owner'), 'Status', display(record.status)],
      ['Contact Number', display(record.phone), 'Alternate Number', display(record.alternatePhone)],
      ['Email', display(record.email), 'Created On', formatDate(record.createdAt)],
      ['Aadhaar Number', display(record.aadhaar), 'PAN Number', display(record.pan)],
    ], {
      0: { cellWidth: 28, fillColor: LIGHT_GREEN, fontStyle: 'bold', textColor: PROJECT_GREEN },
      1: { cellWidth: 65 },
      2: { cellWidth: 28, fillColor: LIGHT_GREEN, fontStyle: 'bold', textColor: PROJECT_GREEN },
      3: { cellWidth: 65 },
    });

      y = drawProfileSection(doc, y, 'Address and Assignment', [], [
      ['Full Address', display(record.address), 'Village', display(record.village)],
      ['Taluka', display(record.taluka), 'District', display(record.district)],
      ['State', display(record.state), 'Cluster', display(record.cluster)],
      ['Zone', display(record.zone), 'Block', display(record.block)],
    ], {
      0: { cellWidth: 28, fillColor: LIGHT_GREEN, fontStyle: 'bold', textColor: PROJECT_GREEN },
      1: { cellWidth: 65 },
      2: { cellWidth: 28, fillColor: LIGHT_GREEN, fontStyle: 'bold', textColor: PROJECT_GREEN },
      3: { cellWidth: 65 },
    });

      y = drawProfileSection(doc, y, `Land Parcels - ${record.parcels.length} (${formatAcres(record.totalAreaAcres)})`,
      [['Parcel ID', 'Location', 'Crop', 'Area', 'Cluster / Zone / Block', 'Lease Period', 'Lease Rate', 'Lock-in Period']],
      record.parcels.length ? record.parcels.map((parcel) => [
        display(parcel.parcelId),
        display(parcel.location),
        display(parcel.crop),
        formatAcres(parcel.areaAcres),
        `${display(parcel.cluster)} / ${display(parcel.zone)} / ${display(parcel.block)}`,
        `${formatDate(parcel.leaseStart)} to ${formatDate(parcel.leaseEnd)}`,
        display(parcel.leaseRate),
        `${formatDate(parcel.lockInStart)} to ${formatDate(parcel.lockInEnd)}`,
      ]) : [[{ content: 'No land parcels recorded.', colSpan: 8, styles: { halign: 'center' } }]], {
        0: { cellWidth: 23 }, 1: { cellWidth: 32 }, 2: { cellWidth: 15 }, 3: { cellWidth: 14, halign: 'right' },
        4: { cellWidth: 27 }, 5: { cellWidth: 27 }, 6: { cellWidth: 20 }, 7: { cellWidth: 28 },
      });

      y = drawProfileSection(doc, y, 'Lease Agreements',
      [['S.No.', 'Agreement Start', 'Agreement End', 'Lease Rate', 'Lock-in Start', 'Lock-in End']],
      record.agreements.length ? record.agreements.map((agreement, index) => [
        index + 1, formatDate(agreement.startDate), formatDate(agreement.endDate), display(agreement.leaseRate),
        formatDate(agreement.lockInStart), formatDate(agreement.lockInEnd),
      ]) : [[{ content: 'No lease agreements recorded.', colSpan: 6, styles: { halign: 'center' } }]], {
        0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 35 }, 2: { cellWidth: 35 },
        3: { cellWidth: 34 }, 4: { cellWidth: 35 }, 5: { cellWidth: 35 },
      });

      y = drawProfileSection(doc, y, 'Bank Details',
      [['S.No.', 'Account Holder', 'Bank Name', 'Account Number', 'IFSC Code']],
      record.bankAccounts.length ? record.bankAccounts.map((bank, index) => [
        index + 1, display(bank.holderName), display(bank.bankName), display(bank.accountNumber), display(bank.ifsc),
      ]) : [[{ content: 'No bank accounts recorded.', colSpan: 5, styles: { halign: 'center' } }]], {
        0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 45 }, 2: { cellWidth: 48 },
        3: { cellWidth: 45 }, 4: { cellWidth: 36 },
      });

      y = drawProfileSection(doc, y, 'Co-owner Details',
      [['Parcel ID', 'Co-owner', 'Relationship', 'Contact', 'Aadhaar', 'PAN', 'Ownership Share']],
      record.coOwners.length ? record.coOwners.map((coOwner) => [
        display(coOwner.parcelId), display(coOwner.name), display(coOwner.relationship), display(coOwner.contact),
        display(coOwner.aadhaar), display(coOwner.pan), display(coOwner.ownershipShare),
      ]) : [[{ content: 'No co-owners recorded.', colSpan: 7, styles: { halign: 'center' } }]], {
        0: { cellWidth: 26 }, 1: { cellWidth: 34 }, 2: { cellWidth: 27 }, 3: { cellWidth: 28 },
        4: { cellWidth: 28 }, 5: { cellWidth: 23 }, 6: { cellWidth: 20 },
      });

    }
    // The shared builder creates the register first. Individual profile printing keeps only
    // the owner profile and document-photograph pages.
    if (records.length === 1) doc.deletePage(1);
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    drawPageBorder(doc);
    doc.setDrawColor(...GRID_SLATE);
    doc.line(12, 280, 198, 280);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(...MUTED_SLATE);
    doc.text(options.includeProfiles ? 'System-generated Land Owner Profile' : 'System-generated Land Owner Directory', 12, 284);
    doc.text(`Report ID: ${reportId}`, 105, 284, { align: 'center' });
    doc.text(`Page ${page} of ${pageCount}`, 198, 284, { align: 'right' });
  }

  return doc;
};

export const printLandOwnerDirectoryAsPdf = async (
  records: LandOwnerPdfRecord[],
  options: LandOwnerDirectoryPdfOptions = {},
) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Pop-up blocked. Please allow pop-ups to print.');

  try {
    printWindow.document.title = 'Generating Land Owner Directory...';
    const doc = await buildLandOwnerDirectoryPdfDoc(records, options);
    doc.autoPrint();
    const pdfUrl = doc.output('bloburl');
    printWindow.location.href = String(pdfUrl);
  } catch (error) {
    printWindow.close();
    throw error;
  }
};

export const printLandOwnerProfileAsPdf = async (
  record: LandOwnerPdfRecord,
  options: LandOwnerDirectoryPdfOptions = {},
) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Pop-up blocked. Please allow pop-ups to print.');

  try {
    const escapeHtml = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    const row = (leftLabel: string, leftValue: unknown, rightLabel: string, rightValue: unknown) => `
      <tr><th>${escapeHtml(leftLabel)}</th><td>${escapeHtml(display(leftValue))}</td><th>${escapeHtml(rightLabel)}</th><td>${escapeHtml(display(rightValue))}</td></tr>`;
    const tableRows = (body: string, colSpan: number, emptyMessage: string) => body || `<tr><td colspan="${colSpan}" class="empty">${escapeHtml(emptyMessage)}</td></tr>`;
    const header = (title: string) => `<div class="header"><img src="${escapeHtml(new URL(logo3f, window.location.href).href)}" alt="Sai Bioresources"><div class="company">${COMPANY_NAME}</div><div class="address">${COMPANY_ADDRESS}</div><div class="companyMeta">${COMPANY_DETAILS}</div><div class="rule"></div><div class="title">${escapeHtml(title)}</div></div>`;
    const parcelRows = record.parcels.map((parcel) => `<tr>
      <td>${escapeHtml(display(parcel.parcelId))}</td><td>${escapeHtml(display(parcel.location))}</td><td>${escapeHtml(display(parcel.crop))}</td>
      <td class="num">${escapeHtml(formatAcres(parcel.areaAcres))}</td><td>${escapeHtml(`${display(parcel.cluster)} / ${display(parcel.zone)} / ${display(parcel.block)}`)}</td>
      <td>${escapeHtml(`${formatDate(parcel.leaseStart)} to ${formatDate(parcel.leaseEnd)}`)}</td><td>${escapeHtml(display(parcel.leaseRate))}</td>
      <td>${escapeHtml(`${formatDate(parcel.lockInStart)} to ${formatDate(parcel.lockInEnd)}`)}</td></tr>`).join('');
    const agreementRows = record.agreements.map((agreement, index) => `<tr><td class="center">${index + 1}</td><td>${escapeHtml(formatDate(agreement.startDate))}</td><td>${escapeHtml(formatDate(agreement.endDate))}</td><td>${escapeHtml(display(agreement.leaseRate))}</td><td>${escapeHtml(formatDate(agreement.lockInStart))}</td><td>${escapeHtml(formatDate(agreement.lockInEnd))}</td></tr>`).join('');
    const bankRows = record.bankAccounts.map((bank, index) => `<tr><td class="center">${index + 1}</td><td>${escapeHtml(display(bank.holderName))}</td><td>${escapeHtml(display(bank.bankName))}</td><td>${escapeHtml(display(bank.accountNumber))}</td><td>${escapeHtml(display(bank.ifsc))}</td></tr>`).join('');
    const coOwnerRows = record.coOwners.map((coOwner) => `<tr><td>${escapeHtml(display(coOwner.parcelId))}</td><td>${escapeHtml(display(coOwner.name))}</td><td>${escapeHtml(display(coOwner.relationship))}</td><td>${escapeHtml(display(coOwner.contact))}</td><td>${escapeHtml(display(coOwner.aadhaar))}</td><td>${escapeHtml(display(coOwner.pan))}</td><td>${escapeHtml(display(coOwner.ownershipShare))}</td></tr>`).join('');
    printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(display(record.name))} - Land Owner Profile</title><style>
      @page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#26364d;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{position:relative;width:194mm;min-height:281mm;margin:0 auto;border:.3mm solid #b8c5d1;padding:4mm 4mm 11mm;background:#fff}.header{text-align:center}.header img{width:auto;height:15mm}.company{margin-top:.5mm;color:#142d4c;font-size:14pt;font-weight:900;letter-spacing:.03em}.address,.companyMeta{margin-top:1mm;color:#526173;font-size:6.5pt}.rule{margin-top:3mm;border-top:.6mm solid #0D3A35}.title{margin-top:2mm;background:#0D3A35;color:#fff;padding:2mm;font-size:10pt;font-weight:900;letter-spacing:.1em}.ownerBand{display:flex;align-items:center;justify-content:space-between;gap:4mm;margin-top:2mm;border:.3mm solid #0D3A35;background:#edf5f2;padding:2.5mm 3mm;color:#0D3A35;font-size:8pt}.ownerBand strong{font-size:10pt}.section{margin-top:2.5mm;border:.25mm solid #cbd5e1;break-inside:avoid}.sectionTitle{background:#f1f5f9;border-bottom:.25mm solid #cbd5e1;padding:1.6mm 2mm;font-size:7pt;font-weight:900;text-transform:uppercase;letter-spacing:.06em}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:.25mm solid #cbd5e1;padding:1.1mm;font-size:5.8pt;line-height:1.25;overflow-wrap:anywhere;vertical-align:top}th{background:#edf5f2;color:#0D3A35;text-align:left;font-weight:800}.dataGrid th{width:15%}.dataGrid td{width:35%}.register th{background:#0D3A35;color:#fff;text-align:center}.center{text-align:center}.num{text-align:right}.empty{padding:3mm;text-align:center;color:#64748b}.footer{position:absolute;bottom:3mm;left:4mm;right:4mm;display:flex;justify-content:space-between;border-top:.25mm solid #cbd5e1;padding-top:1.5mm;color:#64748b;font-size:5.5pt}
      @media print{body{background:#fff}.sheet{margin:0}}
    </style></head><body>
      <section class="sheet">${header('LAND OWNER PROFILE')}
        <div class="ownerBand"><strong>${escapeHtml(display(record.name))}</strong><span>Land Owner ID: ${escapeHtml(display(record.id))} | Status: ${escapeHtml(display(record.status))}</span></div>
        <div class="section"><div class="sectionTitle">Personal, Contact and KYC Details</div><table class="dataGrid"><tbody>
          ${row('Land Owner ID', record.id, 'Full Name', record.name)}${row('Farming Option', record.farmingOption, 'Status', record.status)}${row('Contact Number', record.phone, 'Alternate Number', record.alternatePhone)}${row('Email', record.email, 'Created On', formatDate(record.createdAt))}${row('Aadhaar Number', record.aadhaar, 'PAN Number', record.pan)}
        </tbody></table></div>
        <div class="section"><div class="sectionTitle">Address and Assignment</div><table class="dataGrid"><tbody>
          ${row('Full Address', record.address, 'Village', record.village)}${row('Taluka', record.taluka, 'District', record.district)}${row('State', record.state, 'Cluster', record.cluster)}${row('Zone', record.zone, 'Block', record.block)}
        </tbody></table></div>
        <div class="section"><div class="sectionTitle">Land Parcels - ${record.parcels.length} (${escapeHtml(formatAcres(record.totalAreaAcres))})</div><table class="register"><thead><tr><th>Parcel ID</th><th>Location</th><th>Crop</th><th>Area</th><th>Cluster / Zone / Block</th><th>Lease Period</th><th>Lease Rate</th><th>Lock-in Period</th></tr></thead><tbody>${tableRows(parcelRows,8,'No land parcels recorded.')}</tbody></table></div>
        <div class="section"><div class="sectionTitle">Lease Agreements</div><table class="register"><thead><tr><th>S.No.</th><th>Agreement Start</th><th>Agreement End</th><th>Lease Rate</th><th>Lock-in Start</th><th>Lock-in End</th></tr></thead><tbody>${tableRows(agreementRows,6,'No lease agreements recorded.')}</tbody></table></div>
        <div class="section"><div class="sectionTitle">Bank Details</div><table class="register"><thead><tr><th>S.No.</th><th>Account Holder</th><th>Bank Name</th><th>Account Number</th><th>IFSC Code</th></tr></thead><tbody>${tableRows(bankRows,5,'No bank accounts recorded.')}</tbody></table></div>
        <div class="section"><div class="sectionTitle">Co-owner Details</div><table class="register"><thead><tr><th>Parcel ID</th><th>Co-owner</th><th>Relationship</th><th>Contact</th><th>Aadhaar</th><th>PAN</th><th>Ownership Share</th></tr></thead><tbody>${tableRows(coOwnerRows,7,'No co-owners recorded.')}</tbody></table></div>
        <div class="footer"><span>System-generated Land Owner Profile</span><span>Generated by: ${escapeHtml(options.generatedBy || 'System User')}</span><span>${escapeHtml(display(record.id))}</span></div>
      </section>
    </body></html>`);
    printWindow.document.close();
    const images = Array.from(printWindow.document.images);
    await Promise.all(images.map((image) => {
      if (image.complete) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      });
    }));
    await printWindow.document.fonts?.ready;
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    printWindow.focus();
    printWindow.print();
  } catch (error) {
    printWindow.close();
    throw error;
  }
};
