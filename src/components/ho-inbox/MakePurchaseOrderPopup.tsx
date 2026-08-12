import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, FileText, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type ComparativeModel } from '@/components/purchase/ComparativeStatementPreview';
import logoUrl from '@/Assets/3f-logo.png';
import annexure2TermsRaw from '@/Assets/general-terms-annexure-2.txt?raw';
import getBaseUrl from '@/lib/config';

type Props = {
  open: boolean;
  comparative: ComparativeModel | null;
  vendorId?: string; // defaults to comparative.hoSelectedVendorId
  poNumber?: string; // persisted PO number used when an older API draft omits order_number
  amendmentNumber?: number;
  onClose: () => void;
  onConfirm?: (payload: { indentId: string; vendorId: string; createdAt: string; poNo: string }) => void;
  variant?: 'modal' | 'inline';
  inlineSimulatePrint?: boolean;
  reviewOnly?: boolean;
  revisionMode?: boolean;
  documentStatus?: 'draft' | 'pending' | 'approved' | 'rejected';
};

const safe = (v: unknown) => String(v ?? '').trim();

const showTemporaryError = (message: string) => {
  const toastId = toast.error(message, { duration: 3500 });
  globalThis.setTimeout(() => toast.dismiss(toastId), 3600);
};

const sanitizeAnnexureHtml = (value: unknown) => {
  const html = String(value ?? '');
  if (typeof document === 'undefined') return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((node) => node.remove());
  template.content.querySelectorAll<HTMLElement>('*').forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const attributeValue = attribute.value.trim().toLowerCase();
      if (name.startsWith('on') || ((name === 'href' || name === 'src') && attributeValue.startsWith('javascript:'))) {
        node.removeAttribute(attribute.name);
      }
    });
  });
  template.content.querySelectorAll('.annexure-selected-cell').forEach((node) => node.classList.remove('annexure-selected-cell'));
  return template.innerHTML;
};

const annexureWordCount = (value: unknown) => {
  const text = String(value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&[a-z]+;|&#\d+;|&#x[\da-f]+;/gi, ' ');
  return text.match(/[\p{L}\p{N}]+/gu)?.length || 0;
};

const ANNEXURE_PAGE_LINE_CAPACITY = 52;
const ANNEXURE_CHARS_PER_LINE = 88;

const estimateAnnexureNodeLines = (node: Node): number => {
  const text = safe(node.textContent);
  if (node.nodeType === Node.TEXT_NODE) return Math.max(1, Math.ceil(text.length / ANNEXURE_CHARS_PER_LINE));
  const element = node as HTMLElement;
  const tag = element.tagName?.toLowerCase();
  if (tag === 'h1') return Math.max(4, Math.ceil(text.length / 48) + 2);
  if (tag === 'h2') return Math.max(3, Math.ceil(text.length / 58) + 2);
  if (tag === 'h3') return Math.max(3, Math.ceil(text.length / 68) + 1);
  if (tag === 'hr') return 2;
  if (tag === 'ul' || tag === 'ol') {
    return Math.max(2, Array.from(element.children).reduce((sum, child) => sum + estimateAnnexureNodeLines(child), 0) + 1);
  }
  return Math.max(2, Math.ceil(text.length / ANNEXURE_CHARS_PER_LINE) + 1);
};

const annexureTableFragments = (container: HTMLElement): Array<{ html: string; lines: number }> => {
  const sourceTable = container.matches('table') ? container as HTMLTableElement : container.querySelector('table');
  if (!sourceTable) return [{ html: container.outerHTML, lines: estimateAnnexureNodeLines(container) }];

  const headerRows = Array.from(sourceTable.querySelectorAll(':scope > thead > tr'));
  const bodyRows = Array.from(sourceTable.querySelectorAll(':scope > tbody > tr'));
  const rows = bodyRows.length ? bodyRows : Array.from(sourceTable.querySelectorAll(':scope > tr'));
  if (!rows.length) return [{ html: container.outerHTML, lines: 4 }];

  const headerLines = headerRows.reduce((sum, row) => sum + Math.max(2, estimateAnnexureNodeLines(row)), 0) + 1;
  const fragments: Array<{ html: string; lines: number }> = [];
  let chunk: Element[] = [];
  let used = headerLines;

  const commit = () => {
    if (!chunk.length) return;
    const tableClone = sourceTable.cloneNode(true) as HTMLTableElement;
    tableClone.querySelectorAll(':scope > tbody, :scope > tr').forEach((node) => node.remove());
    const tbody = document.createElement('tbody');
    chunk.forEach((row) => tbody.appendChild(row.cloneNode(true)));
    tableClone.appendChild(tbody);
    if (container === sourceTable) {
      fragments.push({ html: tableClone.outerHTML, lines: used });
    } else {
      const wrapper = container.cloneNode(false) as HTMLElement;
      wrapper.appendChild(tableClone);
      fragments.push({ html: wrapper.outerHTML, lines: used });
    }
    chunk = [];
    used = headerLines;
  };

  rows.forEach((row) => {
    const cells = Array.from(row.querySelectorAll(':scope > th, :scope > td'));
    const perCellWidth = Math.max(18, Math.floor(ANNEXURE_CHARS_PER_LINE / Math.max(1, cells.length)));
    const rowLines = Math.max(
      2,
      ...cells.map((cell) => Math.ceil(safe(cell.textContent).length / perCellWidth) + 1)
    );
    if (chunk.length && used + rowLines > ANNEXURE_PAGE_LINE_CAPACITY) commit();
    chunk.push(row);
    used += rowLines;
  });
  commit();
  return fragments;
};

const paginateAnnexureHtml = (value: unknown): string[] => {
  const html = sanitizeAnnexureHtml(value);
  if (typeof document === 'undefined') return [html];
  try {
    const template = document.createElement('template');
    template.innerHTML = html;
    const tokens: Array<{ html: string; lines: number }> = [];

    Array.from(template.content.childNodes).forEach((node) => {
      if (node.nodeType === 3 && !safe(node.textContent)) return;
      if (node.nodeType === 1 && (node as HTMLElement).querySelector('table')) {
        tokens.push(...annexureTableFragments(node as HTMLElement));
        return;
      }
      if (node.nodeType === 1 && (node as HTMLElement).matches('table')) {
        tokens.push(...annexureTableFragments(node as HTMLElement));
        return;
      }
      tokens.push({
        html: node.nodeType === 3 ? `<p>${safe(node.textContent)}</p>` : (node as HTMLElement).outerHTML,
        lines: estimateAnnexureNodeLines(node),
      });
    });

    const pages: string[] = [];
    let page: string[] = [];
    let used = 0;
    const commit = () => {
      if (page.length) pages.push(page.join(''));
      page = [];
      used = 0;
    };
    tokens.forEach((token) => {
      if (page.length && used + token.lines > ANNEXURE_PAGE_LINE_CAPACITY) commit();
      page.push(token.html);
      used += Math.min(token.lines, ANNEXURE_PAGE_LINE_CAPACITY);
    });
    commit();
    return pages.length ? pages : [''];
  } catch (error) {
    console.error('Unable to paginate annexure content:', error);
    return [html];
  }
};

const extractAfterColon = (v: unknown) => {
  const s = safe(v);
  if (!s) return '';
  const idx = s.indexOf(':');
  if (idx < 0) return s;
  return s.slice(idx + 1).trim();
};

const signatureSvgDataUri = (text: string) => {
  const t = String(text ?? '').trim();
  const safeText = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const width = Math.max(280, safeText.length * 8 + 40);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="44" viewBox="0 0 ${width} 44">
      <rect x="0.5" y="0.5" width="${width - 1}" height="43" rx="8" fill="#ffffff" stroke="#d1d5db" />
      <text x="${width / 2}" y="28" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#111111">${safeText}</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const formatYmd = (iso?: string) => {
  if (!iso) return '';
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
};

const inr = (n: number) => {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);
  } catch {
    return `₹${n.toFixed(2)}`;
  }
};

const integerToIndianWords = (value: number): string => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const belowHundred = (number: number) => number < 20
    ? ones[number]
    : `${tens[Math.floor(number / 10)]}${number % 10 ? ` ${ones[number % 10]}` : ''}`;
  const parts: string[] = [];
  let remaining = Math.max(0, Math.floor(value));

  const appendScale = (divisor: number, label: string) => {
    const count = Math.floor(remaining / divisor);
    if (!count) return;
    parts.push(`${integerToIndianWords(count)} ${label}`);
    remaining %= divisor;
  };

  appendScale(10000000, 'Crore');
  appendScale(100000, 'Lakh');
  appendScale(1000, 'Thousand');
  if (remaining >= 100) {
    parts.push(`${ones[Math.floor(remaining / 100)]} Hundred`);
    remaining %= 100;
  }
  if (remaining) parts.push(belowHundred(remaining));
  return parts.join(' ') || 'Zero';
};

const amountInIndianWords = (value: number) => {
  const normalized = Number.isFinite(value) ? Math.max(0, value) : 0;
  const rupees = Math.floor(normalized);
  const paise = Math.round((normalized - rupees) * 100);
  return `Rupees ${integerToIndianWords(rupees)}${paise ? ` and ${integerToIndianWords(paise)} Paise` : ''} Only.`;
};

const numOr0 = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};

const clampPercent = (v: unknown) => {
  const raw = String(v ?? '').trim();
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
};

const baseForVendor = (c: ComparativeModel, vendorId: string) => {
  const items = Array.isArray(c.items) ? c.items : [];
  const q = (c.quotes || []).find((x: any) => String(x?.vendorId ?? '') === vendorId);
  const unitById = (q as any)?.unitRateByItemId || {};
  return items.reduce((sum, it: any) => sum + numOr0(unitById[it.id]) * numOr0(it.qty), 0);
};

const gstForVendor = (c: ComparativeModel, vendorId: string) => {
  const items = Array.isArray(c.items) ? c.items : [];
  const q = (c.quotes || []).find((x: any) => String(x?.vendorId ?? '') === vendorId);
  const unitById = (q as any)?.unitRateByItemId || {};
  return items.reduce((sum, it: any) => {
    const base = numOr0(unitById[it.id]) * numOr0(it.qty);
    const gst = (numOr0((it as any)?.gstPercent) / 100) * base;
    return sum + gst;
  }, 0);
};

const totalForVendor = (c: ComparativeModel, vendorId: string) => {
  const base = baseForVendor(c, vendorId);
  const freight = numOr0((c as any)?.freightCharges?.[vendorId]);
  const other = numOr0((c as any)?.otherCharges?.[vendorId]);
  const gst = gstForVendor(c, vendorId);
  return base + freight + other + gst;
};

const DUMMY_COMPANY = {
  name: 'SAI BIORESOURCES PRIVATE LIMITED',
  line1: 'Khasra No.121/1, Amrit Dairy Farm',
  line2: 'Kachandur Dhour Road, Village Jeora, Durg, Chhattisgarh - 491001',
  gst: 'GST No: 22ARPCS5442R1ZM',
  pan: 'ARPCS5442R',
};

const DUMMY_VENDOR = {
  addr1: '',
  addr2: '',
  addr3: '',
  addr4: '',
  vatRegnNo: '',
};

const DUMMY_SHIP_TO = {
  contactName: 'Rajendra Shringarputale',
  tel: '+91-7974897686',
  fax: 'NA',
  poBox: 'NA',
  email: 'rajendra.s@saibioenergy.com',
  address: 'Project Site Address (dummy)',
};

const DOCUMENT_REQUIRED_OPTIONS = [
  'Invoice',
  'Packing List',
  "Manufacturer's Guarantee Certificate",
  'Inspection Release Note',
] as const;

const normalizeDocText = (v: unknown) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

const selectedDocsFromText = (text: string) => {
  const t = normalizeDocText(text);
  const out = new Set<(typeof DOCUMENT_REQUIRED_OPTIONS)[number]>();
  for (const opt of DOCUMENT_REQUIRED_OPTIONS) {
    if (t.includes(normalizeDocText(opt))) out.add(opt);
  }
  return out;
};

const formatDocsList = (docs: readonly string[]) => docs.map((d, i) => `${i + 1}) ${d}`).join('\n');

const PURCHASE_FLOW_DOCUMENT_OPTIONS = [
  { value: 'PO Acceptance', label: 'PO Acceptance', mandatory: true },
  { value: 'Proforma Invoice', label: 'Proforma Invoice', mandatory: false },
  { value: 'Delivery Challan', label: 'Delivery Challan', mandatory: false },
  { value: 'GRN', label: 'GRN', mandatory: false },
  { value: 'Tax Invoice', label: 'Tax Invoice', mandatory: false },
] as const;

const MANDATORY_PURCHASE_FLOW_DOCUMENT = PURCHASE_FLOW_DOCUMENT_OPTIONS[0].value;

const normalizePurchaseFlowDocuments = (value: unknown): string[] => {
  const supplied = Array.isArray(value) ? value.map(normalizeDocText) : [];
  return PURCHASE_FLOW_DOCUMENT_OPTIONS
    .filter((option) => option.mandatory || supplied.includes(normalizeDocText(option.value)))
    .map((option) => option.value);
};

const formatTaxTermsText = (gstPct: number, otherPct: number) => {
  const gst = `${gstPct.toFixed(gstPct % 1 === 0 ? 0 : 2)}%`;
  const other = otherPct > 0 ? `${otherPct.toFixed(otherPct % 1 === 0 ? 0 : 2)}%` : '';

  if (other) {
    return `GST @ ${gst} as applicable shall be paid. Other taxes/duties @ ${other} (if applicable) shall be paid.`;
  }
  return `GST @ ${gst} as applicable shall be paid.`;
};

type PaymentInstallment = {
  id: string;
  percent: string;
  label: string;
};

type CustomPoField = {
  id: string;
  label: string;
  value: string;
};

type CommercialDraftRow = {
  no: number;
  particular: string;
  details: string;
  continued?: boolean;
};

// Calibrated for the 11px / 20px-leading Commercial Terms table inside the
// usable A4 portrait area (after the report header and fixed footer).
const COMMERCIAL_PAGE_LINE_CAPACITY = 62;
const COMMERCIAL_ESTIMATED_CHARS_PER_LINE = 90;

const estimatedCommercialLines = (value: string) => {
  const paragraphs = String(value || '—').split(/\r?\n/);
  return Math.max(
    1,
    paragraphs.reduce(
      (total, paragraph) => total + Math.max(1, Math.ceil(paragraph.length / COMMERCIAL_ESTIMATED_CHARS_PER_LINE)),
      0
    )
  );
};

const wrapCommercialText = (value: string) => {
  const wrapped: string[] = [];
  String(value || '—').split(/\r?\n/).forEach((paragraph) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      wrapped.push('');
      return;
    }
    let line = '';
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > COMMERCIAL_ESTIMATED_CHARS_PER_LINE && line) {
        wrapped.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) wrapped.push(line);
  });
  return wrapped.length ? wrapped : ['—'];
};

const paginateCommercialRows = (rows: CommercialDraftRow[]) => {
  const pages: CommercialDraftRow[][] = [];
  let page: CommercialDraftRow[] = [];
  let usedLines = 0;

  const commitPage = () => {
    if (page.length) pages.push(page);
    page = [];
    usedLines = 0;
  };

  rows.forEach((row) => {
    const rowLines = estimatedCommercialLines(row.details) + 2;
    if (rowLines <= COMMERCIAL_PAGE_LINE_CAPACITY) {
      if (page.length && usedLines + rowLines > COMMERCIAL_PAGE_LINE_CAPACITY) commitPage();
      page.push(row);
      usedLines += rowLines;
      return;
    }

    const detailLines = wrapCommercialText(row.details);
    let cursor = 0;
    let continuation = false;
    while (cursor < detailLines.length) {
      if (COMMERCIAL_PAGE_LINE_CAPACITY - usedLines < 4) commitPage();
      const availableDetailLines = Math.max(1, COMMERCIAL_PAGE_LINE_CAPACITY - usedLines - 2);
      const fragmentLines = detailLines.slice(cursor, cursor + availableDetailLines);
      page.push({
        ...row,
        details: fragmentLines.join('\n'),
        continued: continuation,
      });
      usedLines += fragmentLines.length + 2;
      cursor += fragmentLines.length;
      continuation = true;
      if (cursor < detailLines.length) commitPage();
    }
  });

  commitPage();
  return pages.length ? pages : [[]];
};

const newCustomPoField = (): CustomPoField => ({
  id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
  label: '',
  value: '',
});

const newInstallment = (seed?: Partial<PaymentInstallment>): PaymentInstallment => {
  const id = seed?.id || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return {
    id,
    percent: seed?.percent ?? '',
    label: seed?.label ?? '',
  };
};

const formatPaymentTermsText = (installments: PaymentInstallment[]) => {
  const cleaned = installments
    .map((x) => ({
      pct: clampPercent(x.percent),
      label: String(x.label ?? '').trim(),
    }))
    .filter((x) => x.pct > 0 && x.label.length > 0);

  const toAlpha = (idx: number) => String.fromCharCode(97 + (idx % 26));

  if (cleaned.length === 0) return '';

  return cleaned
    .map((x, idx) => {
      const pct = `${x.pct.toFixed(x.pct % 1 === 0 ? 0 : 2)}%`;
      const label = x.label.endsWith('.') ? x.label : `${x.label}.`;
      return `${toAlpha(idx)}) ${pct} ${label}`;
    })
    .join('\n\n');
};

const formatLdPenaltyText = (perWeekPct: number, maxPct: number) => {
  const perWeek = `${perWeekPct.toFixed(perWeekPct % 1 === 0 ? 0 : 2)}%`;
  const max = maxPct > 0 ? `${maxPct.toFixed(maxPct % 1 === 0 ? 0 : 2)}%` : '';

  const line1 = `In the event of a delay in the delivery beyond the delivery timeline mentioned in the schedule, LD @ ${perWeek} of the PO value per week of delay for each calendar week or part thereof shall be applicable.`;
  if (max) {
    const line2 = `The LD penalty shall be subject to a maximum of ${max} of the total Basic Value of the Purchase Order.`;
    return `${line1}\n\n${line2}`;
  }
  return line1;
};

type Page1State = {
  poNo: string;
  amendmentNo: number;
  poDate: string;
  vendorCode: string;
  vatRegnNo: string;
  clusterId: string;
  vendorName: string;
  vendorAddr1: string;
  vendorAddr2: string;
  vendorAddr3: string;
  vendorAddr4: string;
  vendorPinCode: string;
  vendorState: string;
  vendorPlaceOfBusiness: string;
  vendorContactName: string;
  vendorMobile: string;
  vendorEmail: string;
  vendorVatRegnNo: string;
  vendorPan: string;
  vendorLegalConstitution: string;
  paymentTerms: string;
  incoTerms: string;
  deliveryDate: string;
  shipToGstNo: string;
  buyerPan: string;
  shipToContactName: string;
  shipToTel: string;
  shipToFax: string;
  shipToPoBox: string;
  shipToEmail: string;
  shipToAddress: string;
  buyerCompanyName: string;
  buyerBuildingNo: string;
  buyerRoadStreet: string;
  buyerVillage: string;
  buyerDistrict: string;
  buyerPinCode: string;
  coverKindAttention: string;
  coverProject: string;
  coverSubject: string;
  coverSalutation: string;
  coverOrderIntroduction: string;
  coverCommercialReference: string;
  notes: string;
  preparedBy: string;
  verifiedBy: string;
  approvedBy: string;
  requiredPurchaseDocuments: string[];
  customFields: CustomPoField[];
};

const defaultPage1 = (): Page1State => ({
  poNo: '',
  amendmentNo: 0,
  poDate: formatYmd(new Date().toISOString()),
  vendorCode: '',
  vatRegnNo: DUMMY_COMPANY.gst,
  clusterId: '',
  vendorName: '',
  vendorAddr1: DUMMY_VENDOR.addr1,
  vendorAddr2: DUMMY_VENDOR.addr2,
  vendorAddr3: DUMMY_VENDOR.addr3,
  vendorAddr4: DUMMY_VENDOR.addr4,
  vendorPinCode: '',
  vendorState: '',
  vendorPlaceOfBusiness: '',
  vendorContactName: '',
  vendorMobile: '',
  vendorEmail: '',
  vendorVatRegnNo: DUMMY_VENDOR.vatRegnNo,
  vendorPan: '',
  vendorLegalConstitution: '',
  paymentTerms: 'Due within 30 Days',
  incoTerms: 'FOB',
  deliveryDate: formatYmd(new Date().toISOString()),
  shipToGstNo: extractAfterColon(DUMMY_COMPANY.gst),
  buyerPan: DUMMY_COMPANY.pan,
  shipToContactName: DUMMY_SHIP_TO.contactName,
  shipToTel: DUMMY_SHIP_TO.tel,
  shipToFax: DUMMY_SHIP_TO.fax,
  shipToPoBox: DUMMY_SHIP_TO.poBox,
  shipToEmail: DUMMY_SHIP_TO.email,
  shipToAddress: `${DUMMY_COMPANY.line1}, ${DUMMY_COMPANY.line2}`,
  buyerCompanyName: DUMMY_COMPANY.name,
  buyerBuildingNo: 'Khasra No.121/1, Amrit Dairy Farm',
  buyerRoadStreet: 'Kachandur Dhour Road',
  buyerVillage: 'Jeora',
  buyerDistrict: 'Durg',
  buyerPinCode: '491001',
  coverKindAttention: '',
  coverProject: '',
  coverSubject: '',
  coverSalutation: 'Dear Sir,',
  coverOrderIntroduction: '',
  coverCommercialReference: '',
  notes:
    'The Delay penalty is applicable once the delivery period will be one week exceeded\nPlease send the original invoice to finance department along with a copy of purchase order\nAny Shipment and invoice without PO no will not be accepted.',
  preparedBy: '',
  verifiedBy: '',
  approvedBy: '',
  requiredPurchaseDocuments: [MANDATORY_PURCHASE_FLOW_DOCUMENT],
  customFields: [],
});

type Page2State = {
  supplierFinalQuotationNo: string;
  supplierFinalQuotationDate: string;
  scopeOfWork: string;
  basisOfPrice: string;
  taxes: string;
  taxAutoCalcEnabled: boolean;
  taxGstPercent: string;
  taxOtherPercent: string;
  deliveryTimelines: string;
  documents: string;
  paymentTerms: string;
  paymentAutoEnabled: boolean;
  paymentInstallments: PaymentInstallment[];
  installationSupport: string;
  inspection: string;
  warranty: string;
  ldPenalty: string;
  ldAutoEnabled: boolean;
  ldPerWeekPercent: string;
  ldMaxPercent: string;
  remarks: string;
  siteBillingAddress: string;
  documentsRequired: string;
  correspondenceCompanyName: string;
  correspondenceStreet: string;
  correspondenceArea: string;
  correspondenceCity: string;
  correspondenceState: string;
  correspondencePin: string;
  correspondenceContactPerson: string;
  correspondencePhone: string;
  correspondenceAcknowledgement: string;
  correspondenceAcceptance: string;
};

const defaultPage2 = (): Page2State => ({
  supplierFinalQuotationNo: 'SABCO/20225-26/37',
  supplierFinalQuotationDate: '',
  scopeOfWork:
    'Total SOW is inclusive of but not limited to the complete Preparation – Supply of Organic Manure as per supplier’s referred offer and Approved by the Buyer',
  basisOfPrice:
    'Ex – Works, Supplier’s Godown, C/o. Amriyt Agrotech, Jeora Village, Durg, Chhattisgarh.\nTransportation up to Project Site shall be in the scope of Buyer.',
  taxes: '',
  taxAutoCalcEnabled: false,
  taxGstPercent: '5',
  taxOtherPercent: '',
  deliveryTimelines:
    'Time is the essence of this contract. Supplier shall ensure that the Organic Manure is ready to be supplied from SBACO Godown, C/o. Amriyt Agrotech, Jeora Village, Durg, Chhattisgarh, within 3-4 Months from the date of order confirmation. Supplier shall submit all the necessary documents for approval immediately after PO confirmation. Supplier shall submit a detailed delivery schedule in line with technical team’s requirement.',
  documents:
    'The Supplier shall submit all necessary documents to the Buyer within 1-2 days of order confirmation, for Approval and clearance if required by the buyer.\nThe responsibility of getting documents approved from Buyer is in the scope of Supplier. The delay in submission of documents or getting the documents approved shall not be a reason for providing delivery extension.',
  paymentTerms:
    'a) 60% of the Basic order value shall be paid in advance upon acceptance of the Purchase Order (PO) and against submission of Performa invoice (PI).\n\nb) Balance 40% of the order value along with total applicable GST shall be paid on actual supply basis within 7-10 days from the date of receipt of material at site.',
  paymentAutoEnabled: false,
  paymentInstallments: [
    newInstallment({ percent: '60', label: 'of the basic order value shall be paid in advance upon acceptance of the Purchase Order (PO)' }),
    newInstallment({ percent: '40', label: 'of the basic order value shall be paid on delivery / invoice submission (as applicable)' }),
  ],
  installationSupport: 'NA',
  inspection:
    'Shall be in the scope of Buyer. Supplier has to inform regarding material readiness and shall raise the inspection call 1-2 days prior to material readiness.',
  warranty:
    'The Supplier guarantees that the Supplied Organic Manure material shall be new, and shall conform to the specifications and quality standards as agreed at the time of purchase.',
  ldPenalty:
    'In the event of a delay in the delivery of the Organic Manure beyond the delivery timeline mentioned in the schedule, LD @ 1% of the PO value per week of delay for each calendar week or part thereof shall be applicable. The LD penalty shall be subject to a maximum of 10% of the total Basic Value of the Purchase Order.',
  ldAutoEnabled: false,
  ldPerWeekPercent: '1',
  ldMaxPercent: '10',
  remarks:
    '1) Price breakup Annexure-1\n2) All the other terms are as per attached General terms and conditions Annexure 2.',
  siteBillingAddress:
    'SITE & BILLING ADDRESS:\n\nName of the Company: SAI BIORESOURCES PRIVATE LIMITED\nBuilding. No/Flat. No: Khasra No.121/1, Amrit Dairy Farm\nRoad/Street: Kachandur Dhour Road;\nVillage: Jeora,\nDistrict: Durg\nPin code: 491001\nGST No: 22ARPCS5442R1ZM\nName: Rajendra Shriringarpulate\nMobile Number: +91 79748 97686\nEmail: rajendra.s@saiobioenergy.com',
  documentsRequired:
    '1) Invoice\n2) Packing List\n3) Manufacturer\'s Guarantee Certificate\n4) Inspection Release Note\n5) Any Other Documents as may be needed at the time of supply & Handover.',
  correspondenceCompanyName: 'SAI BIORESOURCES PRIVATE LIMITED',
  correspondenceStreet: 'Trendz Green, Plot No 80, Shilpi Valley',
  correspondenceArea: 'Madhapur, Hitech City',
  correspondenceCity: 'Hyderabad',
  correspondenceState: 'Telangana',
  correspondencePin: '500081',
  correspondenceContactPerson: 'Mr. V. Sharan Preeth',
  correspondencePhone: '+91-7013492364',
  correspondenceAcknowledgement:
    'Please acknowledge the receipt of this PO and send us a signed & Stamped copy of this PO as a token of acceptance within 2 working days from the date of the PO.',
  correspondenceAcceptance:
    "If acceptance is not received in 2 working days, this PO shall be deemed to be accepted by the supplier in totality and shall strictly be adhered to. The buyer may withdraw this at any point of time, at their own discretion. All the T&C shall be as per the buyer's standard. There shall be no deviations acceptable unless confirmed in writing by the buyer. In case of any ambiguity between terms and conditions mentioned in the purchase order vis-a-vis the general terms and conditions of the buyer, terms based on the buyer's discretion shall prevail and shall be adhered to, accepted by the supplier.",
});

type Page3State = {
  annexureTitle: string;
  contentHtml: string;
  marginPreset: 'normal' | 'narrow' | 'wide';
};

type Page4State = {
  annexureTitle: string;
  termsText: string;
  leftColumn?: string;
  rightColumn?: string;
};

const PO_DRAFT_STORAGE_KEY = 'farmconnect.poDraft.v1';

type PoDraft = {
  indentId: string;
  vendorId: string;
  savedAt: string;
  page: number;
  p1: Page1State;
  p2: Page2State;
  p3: Page3State;
  additionalAnnexures?: Page3State[];
  p4?: Page4State;
  authorizedSealAttachedAt?: string;
};

type PoDraftStore = {
  drafts: Record<string, PoDraft>;
};

type ApiPurchaseOrder = {
  order_number?: unknown;
  purchase_quote?: unknown;
  other_terms_and_condition?: unknown;
};

const poDraftKey = (indentId: string, vendorId: string) => `${safe(indentId)}::${safe(vendorId)}`;

const readPoDraftStore = (): PoDraftStore => {
  try {
    const raw = window.localStorage.getItem(PO_DRAFT_STORAGE_KEY);
    if (!raw) return { drafts: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { drafts: {} };
    const drafts = (parsed as any).drafts;
    return drafts && typeof drafts === 'object' ? { drafts } : { drafts: {} };
  } catch {
    return { drafts: {} };
  }
};

const writePoDraftStore = (s: PoDraftStore) => {
  try {
    window.localStorage.setItem(PO_DRAFT_STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
};

const DEFAULT_ANNEXURE2_TERMS = annexure2TermsRaw
  .replace(/^\s*GENERAL TERMS AND CONDITIONS\s*[–—-]\s*ANNEXURE 2\s*/i, '')
  .trim();

const defaultPage3 = (): Page3State => ({
  annexureTitle: 'ANNEXURE - 1',
  contentHtml: '<h2>Annexure Title</h2><p>Start creating your annexure here.</p>',
  marginPreset: 'normal',
});

const defaultPage4 = (): Page4State => ({
  annexureTitle: 'GENERAL TERMS AND CONDITIONS — ANNEXURE - 2',
  termsText: DEFAULT_ANNEXURE2_TERMS,
});

const normalizeAnnexureNumber = (value: unknown, fallback: string, previousNumber: number, nextNumber: number) => {
  const title = safe(value) || fallback;
  return title.replace(
    new RegExp(`ANNEXURE\\s*[-–—]?\\s*${previousNumber}\\b`, 'i'),
    `ANNEXURE - ${nextNumber}`
  );
};

const withAnnexureNumber = (value: unknown, fallback: string, annexureNumber: number) => {
  const title = safe(value) || fallback;
  return /ANNEXURE\s*[-–—]?\s*\d+/i.test(title)
    ? title.replace(/ANNEXURE\s*[-–—]?\s*\d+/i, `ANNEXURE - ${annexureNumber}`)
    : `${title} — ANNEXURE - ${annexureNumber}`;
};

const ANNEXURE_RICH_TEXT_CSS = `
  .annexure-rich-editor h1, .annexure-rich-content h1 { margin: 0 0 12px; font-size: 24px; line-height: 1.2; font-weight: 800; }
  .annexure-rich-editor h2, .annexure-rich-content h2 { margin: 0 0 10px; font-size: 19px; line-height: 1.25; font-weight: 750; }
  .annexure-rich-editor h3, .annexure-rich-content h3 { margin: 0 0 8px; font-size: 16px; line-height: 1.3; font-weight: 700; }
  .annexure-rich-editor p, .annexure-rich-content p { margin: 0 0 8px; }
  .annexure-rich-editor ul, .annexure-rich-content ul { margin: 6px 0 10px 22px; list-style: disc; }
  .annexure-rich-editor ol, .annexure-rich-content ol { margin: 6px 0 10px 22px; list-style: decimal; }
  .annexure-rich-editor table, .annexure-rich-content table { width: 100%; margin: 0; border: 1px solid #64748b !important; border-collapse: collapse !important; border-spacing: 0 !important; table-layout: fixed; }
  .annexure-rich-editor th, .annexure-rich-editor td, .annexure-rich-content th, .annexure-rich-content td { min-width: 70px; border: 1px solid #64748b !important; padding: 7px 8px; vertical-align: top; }
  .annexure-rich-editor th, .annexure-rich-content th { background: #edf4f2; color: #0D3A35; font-weight: 700; }
  .annexure-field-table th { width: 34%; }
  .annexure-table-resizer { width: 100%; max-width: 100%; margin: 10px 0; }
  .annexure-rich-editor .annexure-table-resizer { position: relative; min-width: 220px; resize: horizontal; overflow: auto; padding: 0 7px 7px 0; }
  .annexure-rich-editor .annexure-table-resizer::after { content: ''; position: absolute; right: 0; bottom: 0; width: 9px; height: 9px; border-right: 2px solid #0D3A35; border-bottom: 2px solid #0D3A35; pointer-events: none; }
  .annexure-rich-content .annexure-table-resizer { overflow: visible; padding: 0; }
  .annexure-rich-editor .annexure-selected-cell { outline: 3px solid #0D3A35; outline-offset: -3px; background: #e7f3ef !important; }
  .annexure-rich-content { overflow-wrap: anywhere; }
  .po-report-sheet .annexure-rich-content,
  .po-report-sheet .annexure-rich-content * { font-family: inherit !important; }
  .po-draft-font-11 .annexure-rich-content,
  .po-draft-font-11 .annexure-rich-content p,
  .po-draft-font-11 .annexure-rich-content li,
  .po-draft-font-11 .annexure-rich-content td,
  .po-draft-font-11 .annexure-rich-content th,
  .po-draft-font-11 .annexure-rich-content blockquote { font-size: 11px !important; }
`;

export function MakePurchaseOrderPopup({
  open,
  comparative,
  vendorId,
  poNumber,
  amendmentNumber = 0,
  onClose,
  onConfirm,
  variant = 'modal',
  inlineSimulatePrint = true,
  reviewOnly = false,
  revisionMode = false,
  documentStatus = 'draft',
}: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const [workflowStep, setWorkflowStep] = useState<'details' | 'draft'>('details');
  const [page, setPage] = useState(1);
  const [p1, setP1] = useState<Page1State>(() => defaultPage1());
  const [p2, setP2] = useState<Page2State>(() => defaultPage2());
  const [p3, setP3] = useState<Page3State>(() => defaultPage3());
  const [additionalAnnexures, setAdditionalAnnexures] = useState<Page3State[]>([]);
  const [selectedAnnexureIndex, setSelectedAnnexureIndex] = useState(0);
  const [p4, setP4] = useState<Page4State>(() => defaultPage4());
  const annexureEditorRef = useRef<HTMLDivElement>(null);
  const [annexureFieldLabel, setAnnexureFieldLabel] = useState('');
  const [annexureTableRows, setAnnexureTableRows] = useState(3);
  const [annexureTableColumns, setAnnexureTableColumns] = useState(3);
  const selectedAnnexureCellRef = useRef<HTMLTableCellElement | null>(null);
  const selectedAnnexureTableRef = useRef<HTMLTableElement | null>(null);
  const [annexureCellSelected, setAnnexureCellSelected] = useState(false);
  const savedAnnexureRangeRef = useRef<Range | null>(null);
  const annexureStyleUndoRef = useRef<string[]>([]);
  const annexureStyleRedoRef = useRef<string[]>([]);
  const [annexureTextColor, setAnnexureTextColor] = useState('#dc2626');
  const [annexureHighlightColor, setAnnexureHighlightColor] = useState('#fff59d');
  const [annexureFontName, setAnnexureFontName] = useState('Times New Roman');
  const [annexureFontSize, setAnnexureFontSize] = useState('12');
  const [annexureZoom, setAnnexureZoom] = useState(100);

  // Keep a defensive default so older saved drafts never lose the legal clauses.
  const effectiveAnnexureTerms = safe(p4?.termsText) || DEFAULT_ANNEXURE2_TERMS;
  const annexureTermLines = useMemo(
    () => effectiveAnnexureTerms.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    [effectiveAnnexureTerms]
  );
  const customAnnexures = useMemo(() => [p3, ...additionalAnnexures], [p3, additionalAnnexures]);
  const printableCustomAnnexures = useMemo(
    () => customAnnexures.filter(
      (annexure): annexure is Page3State => Boolean(annexure) && annexureWordCount(annexure?.contentHtml) > 0
    ),
    [customAnnexures]
  );
  const activeCustomAnnexure = customAnnexures[selectedAnnexureIndex] || p3;
  const legalAnnexureNumber = printableCustomAnnexures.length + 1;

  useEffect(() => {
    setP2((current) => {
      const nextRemarks = current.remarks.replace(
        /(General terms and conditions Annexure)\s*\d+/i,
        `$1 ${legalAnnexureNumber}`
      );
      return nextRemarks === current.remarks ? current : { ...current, remarks: nextRemarks };
    });
  }, [legalAnnexureNumber]);

  const effectiveAnnexure2Html = useMemo(
    () => sanitizeAnnexureHtml(activeCustomAnnexure.contentHtml || defaultPage3().contentHtml),
    [activeCustomAnnexure.contentHtml]
  );
  const activeAnnexureWordCount = useMemo(() => {
    if (typeof document === 'undefined') return 0;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = effectiveAnnexure2Html;
    const words = safe(wrapper.textContent).match(/\S+/g);
    return words?.length || 0;
  }, [effectiveAnnexure2Html]);
  const annexurePagePadding = activeCustomAnnexure.marginPreset === 'narrow' ? '38px 42px' : activeCustomAnnexure.marginPreset === 'wide' ? '96px 106px' : '72px 76px';

  const [printing, setPrinting] = useState(false);

  const [savingPo, setSavingPo] = useState(false);

  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const draftSavedTimerRef = useRef<number | null>(null);
  const didHydrateDraftRef = useRef(false);

  const [shipToEditing, setShipToEditing] = useState(false);

  const [authorizedSealAttachedAt, setAuthorizedSealAttachedAt] = useState<string>('');

  const [clusters, setClusters] = useState<any[]>([]);
  const [clustersLoading, setClustersLoading] = useState(false);
  const [supplierDetailsLoading, setSupplierDetailsLoading] = useState(false);

  const setP1Field = <K extends keyof Page1State>(k: K, v: Page1State[K]) => {
    setP1((p) => ({ ...p, [k]: v }));
  };

  const setP2Field = <K extends keyof Page2State>(k: K, v: Page2State[K]) => {
    setP2((p) => ({ ...p, [k]: v }));
  };

  const setP3Field = <K extends keyof Page3State>(k: K, v: Page3State[K]) => {
    if (selectedAnnexureIndex === 0) {
      setP3((current) => ({ ...current, [k]: v }));
      return;
    }
    setAdditionalAnnexures((current) => current.map((annexure, index) => (
      index === selectedAnnexureIndex - 1 ? { ...annexure, [k]: v } : annexure
    )));
  };

  const addCustomAnnexure = () => {
    syncAnnexureEditor();
    const nextNumber = customAnnexures.length + 1;
    setAdditionalAnnexures((current) => [
      ...current,
      { ...defaultPage3(), annexureTitle: `ANNEXURE - ${nextNumber}` },
    ]);
    setSelectedAnnexureIndex(nextNumber - 1);
    savedAnnexureRangeRef.current = null;
  };

  const removeSelectedAnnexure = () => {
    if (selectedAnnexureIndex === 0) return;
    setAdditionalAnnexures((current) => current.filter((_, index) => index !== selectedAnnexureIndex - 1));
    setSelectedAnnexureIndex((current) => Math.max(0, current - 1));
    savedAnnexureRangeRef.current = null;
    toast.success('Annexure removed');
  };

  const setP4Field = <K extends keyof Page4State>(k: K, v: Page4State[K]) => {
    setP4((p) => ({ ...p, [k]: v }));
  };

  const ensureAnnexureTableResizer = (table: HTMLTableElement) => {
    const existingWrapper = table.parentElement?.classList.contains('annexure-table-resizer')
      ? table.parentElement as HTMLDivElement
      : null;
    if (existingWrapper) return existingWrapper;

    const wrapper = document.createElement('div');
    wrapper.className = 'annexure-table-resizer';
    wrapper.style.width = table.style.width || '100%';
    table.style.width = '100%';
    table.parentNode?.insertBefore(wrapper, table);
    wrapper.appendChild(table);
    return wrapper;
  };

  useEffect(() => {
    const editor = annexureEditorRef.current;
    if (!editor || document.activeElement === editor) return;
    const nextHtml = sanitizeAnnexureHtml(activeCustomAnnexure.contentHtml || defaultPage3().contentHtml);
    if (editor.innerHTML !== nextHtml) editor.innerHTML = nextHtml;
    editor.querySelectorAll<HTMLTableElement>('table').forEach(ensureAnnexureTableResizer);
  }, [activeCustomAnnexure.contentHtml, selectedAnnexureIndex, workflowStep]);

  const syncAnnexureEditor = () => {
    const editor = annexureEditorRef.current;
    if (!editor) return;
    setP3Field('contentHtml', sanitizeAnnexureHtml(editor.innerHTML));
  };

  const captureAnnexureSelection = () => {
    const editor = annexureEditorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) savedAnnexureRangeRef.current = range.cloneRange();
  };

  const restoreAnnexureSelection = () => {
    const editor = annexureEditorRef.current;
    const savedRange = savedAnnexureRangeRef.current;
    if (!editor || !savedRange) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(savedRange);
  };

  const runAnnexureCommand = (command: string, value?: string) => {
    const editor = annexureEditorRef.current;
    if (!editor) return;
    editor.focus();
    restoreAnnexureSelection();
    document.execCommand(command, false, value);
    syncAnnexureEditor();
    captureAnnexureSelection();
  };

  const undoAnnexureChange = () => {
    const editor = annexureEditorRef.current;
    const previousHtml = annexureStyleUndoRef.current.pop();
    if (!editor || previousHtml === undefined) {
      runAnnexureCommand('undo');
      return;
    }
    annexureStyleRedoRef.current.push(editor.innerHTML);
    editor.innerHTML = previousHtml;
    savedAnnexureRangeRef.current = null;
    syncAnnexureEditor();
    editor.focus();
  };

  const redoAnnexureChange = () => {
    const editor = annexureEditorRef.current;
    const nextHtml = annexureStyleRedoRef.current.pop();
    if (!editor || nextHtml === undefined) {
      runAnnexureCommand('redo');
      return;
    }
    annexureStyleUndoRef.current.push(editor.innerHTML);
    editor.innerHTML = nextHtml;
    savedAnnexureRangeRef.current = null;
    syncAnnexureEditor();
    editor.focus();
  };

  const applyAnnexureColor = (type: 'text' | 'highlight', color: string) => {
    const editor = annexureEditorRef.current;
    const sourceRange = savedAnnexureRangeRef.current;
    if (!editor || !sourceRange || sourceRange.collapsed || !editor.contains(sourceRange.commonAncestorContainer)) {
      showTemporaryError('Select text in Annexure 1 before applying colour');
      return;
    }

    annexureStyleUndoRef.current.push(editor.innerHTML);
    if (annexureStyleUndoRef.current.length > 30) annexureStyleUndoRef.current.shift();
    annexureStyleRedoRef.current = [];
    editor.focus();
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let currentNode = walker.nextNode();
    while (currentNode) {
      const textNode = currentNode as Text;
      if (textNode.data.length > 0 && sourceRange.intersectsNode(textNode)) textNodes.push(textNode);
      currentNode = walker.nextNode();
    }

    const styledSpans: HTMLSpanElement[] = [];
    [...textNodes].reverse().forEach((textNode) => {
      const start = textNode === sourceRange.startContainer ? sourceRange.startOffset : 0;
      const end = textNode === sourceRange.endContainer ? sourceRange.endOffset : textNode.data.length;
      if (end <= start) return;
      const textRange = document.createRange();
      textRange.setStart(textNode, Math.min(start, textNode.data.length));
      textRange.setEnd(textNode, Math.min(end, textNode.data.length));
      const span = document.createElement('span');
      if (type === 'text') span.style.color = color;
      else span.style.backgroundColor = color;
      span.appendChild(textRange.extractContents());
      textRange.insertNode(span);
      styledSpans.unshift(span);
    });

    if (!styledSpans.length) {
      showTemporaryError('Select text in Annexure 1 before applying colour');
      return;
    }

    const appliedRange = document.createRange();
    appliedRange.setStartBefore(styledSpans[0]);
    appliedRange.setEndAfter(styledSpans[styledSpans.length - 1]);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(appliedRange);
    savedAnnexureRangeRef.current = appliedRange.cloneRange();
    syncAnnexureEditor();
  };

  const appendAnnexureHtml = (html: string) => {
    const editor = annexureEditorRef.current;
    if (!editor) return;
    editor.focus();
    restoreAnnexureSelection();
    const cleanHtml = sanitizeAnnexureHtml(html);
    const insertedAtCursor = savedAnnexureRangeRef.current
      ? document.execCommand('insertHTML', false, cleanHtml)
      : false;
    if (!insertedAtCursor) editor.insertAdjacentHTML('beforeend', cleanHtml);
    syncAnnexureEditor();
    captureAnnexureSelection();
  };

  const addAnnexureField = () => {
    const label = safe(annexureFieldLabel) || 'Field Name';
    appendAnnexureHtml(
      `<div class="annexure-table-resizer" style="width: 100%;"><table class="annexure-field-table"><tbody><tr><th>${label.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</th><td>Enter value</td></tr></tbody></table></div><p><br></p>`
    );
    setAnnexureFieldLabel('');
  };

  const addAnnexureTable = () => {
    const rows = Math.min(20, Math.max(1, Number(annexureTableRows) || 1));
    const columns = Math.min(10, Math.max(1, Number(annexureTableColumns) || 1));
    const head = `<tr>${Array.from({ length: columns }, (_, index) => `<th>Column ${index + 1}</th>`).join('')}</tr>`;
    const body = Array.from(
      { length: Math.max(0, rows - 1) },
      () => `<tr>${Array.from({ length: columns }, () => '<td>Enter details</td>').join('')}</tr>`
    ).join('');
    appendAnnexureHtml(`<div class="annexure-table-resizer" style="width: 100%;"><table class="annexure-document-table"><thead>${head}</thead><tbody>${body}</tbody></table></div><p><br></p>`);
  };

  const selectAnnexureTableCell = (target: EventTarget | null) => {
    const cell = target instanceof Element ? (target.closest('td, th') as HTMLTableCellElement | null) : null;
    selectedAnnexureCellRef.current?.classList.remove('annexure-selected-cell');
    selectedAnnexureCellRef.current = cell;
    selectedAnnexureTableRef.current = cell?.closest('table') as HTMLTableElement | null;
    if (selectedAnnexureTableRef.current) ensureAnnexureTableResizer(selectedAnnexureTableRef.current);
    cell?.classList.add('annexure-selected-cell');
    setAnnexureCellSelected(Boolean(cell));
  };

  const finishAnnexureCellOperation = () => {
    selectedAnnexureCellRef.current?.classList.remove('annexure-selected-cell');
    selectedAnnexureCellRef.current = null;
    selectedAnnexureTableRef.current = null;
    setAnnexureCellSelected(false);
    syncAnnexureEditor();
  };

  const mergeAnnexureCellRight = () => {
    const cell = selectedAnnexureCellRef.current;
    const next = cell?.nextElementSibling as HTMLTableCellElement | null;
    if (!cell || !next || !/^(TD|TH)$/.test(next.tagName)) {
      showTemporaryError('Select a cell that has another cell on its right');
      return;
    }
    const joinedContent = safe(next.textContent) ? `<br>${next.innerHTML}` : '';
    cell.innerHTML = `${cell.innerHTML}${joinedContent}`;
    cell.colSpan = Math.max(1, cell.colSpan) + Math.max(1, next.colSpan);
    next.remove();
    finishAnnexureCellOperation();
  };

  const mergeAnnexureCellBelow = () => {
    const cell = selectedAnnexureCellRef.current;
    const row = cell?.parentElement as HTMLTableRowElement | null;
    const nextRow = row?.nextElementSibling as HTMLTableRowElement | null;
    if (!cell || !row || !nextRow) {
      showTemporaryError('Select a cell that has another row below it');
      return;
    }
    const below = nextRow.cells[cell.cellIndex] as HTMLTableCellElement | undefined;
    if (!below || below.colSpan !== cell.colSpan) {
      showTemporaryError('The cell below must have the same width before merging');
      return;
    }
    const joinedContent = safe(below.textContent) ? `<br>${below.innerHTML}` : '';
    cell.innerHTML = `${cell.innerHTML}${joinedContent}`;
    cell.rowSpan = Math.max(1, cell.rowSpan) + Math.max(1, below.rowSpan);
    below.remove();
    finishAnnexureCellOperation();
  };

  const unmergeAnnexureCell = () => {
    const cell = selectedAnnexureCellRef.current;
    const row = cell?.parentElement as HTMLTableRowElement | null;
    const table = cell?.closest('table');
    if (!cell || !row || !table || (cell.colSpan <= 1 && cell.rowSpan <= 1)) {
      showTemporaryError('Select a merged cell to unmerge');
      return;
    }

    const originalColSpan = Math.max(1, cell.colSpan);
    const originalRowSpan = Math.max(1, cell.rowSpan);
    const insertionIndex = cell.cellIndex;
    const tagName = cell.tagName.toLowerCase();
    cell.colSpan = 1;
    cell.rowSpan = 1;

    const makeBlankCell = () => {
      const newCell = document.createElement(tagName) as HTMLTableCellElement;
      newCell.innerHTML = '&nbsp;';
      return newCell;
    };

    for (let column = 1; column < originalColSpan; column += 1) {
      row.insertBefore(makeBlankCell(), row.cells[insertionIndex + column] || null);
    }
    for (let rowOffset = 1; rowOffset < originalRowSpan; rowOffset += 1) {
      const targetRow = table.rows[row.rowIndex + rowOffset];
      if (!targetRow) continue;
      for (let column = 0; column < originalColSpan; column += 1) {
        targetRow.insertBefore(makeBlankCell(), targetRow.cells[insertionIndex + column] || null);
      }
    }
    finishAnnexureCellOperation();
  };

  const transformAnnexureTable = (width: '50%' | '75%' | '100%', alignment: 'left' | 'center' | 'right' = 'center') => {
    const table = selectedAnnexureTableRef.current || selectedAnnexureCellRef.current?.closest('table');
    const editor = annexureEditorRef.current;
    if (!table || !editor) {
      showTemporaryError('Select a table cell before resizing the table');
      return;
    }

    annexureStyleUndoRef.current.push(editor.innerHTML);
    if (annexureStyleUndoRef.current.length > 30) annexureStyleUndoRef.current.shift();
    annexureStyleRedoRef.current = [];
    const wrapper = ensureAnnexureTableResizer(table as HTMLTableElement);
    wrapper.style.width = width;
    wrapper.style.marginLeft = alignment === 'left' ? '0' : alignment === 'right' ? 'auto' : 'auto';
    wrapper.style.marginRight = alignment === 'right' ? '0' : alignment === 'left' ? 'auto' : 'auto';
    syncAnnexureEditor();
  };

  const alignAnnexureTable = (alignment: 'left' | 'center' | 'right') => {
    const table = selectedAnnexureTableRef.current || selectedAnnexureCellRef.current?.closest('table');
    const wrapper = table ? ensureAnnexureTableResizer(table as HTMLTableElement) : null;
    const width = (wrapper?.style.width || '100%') as '50%' | '75%' | '100%';
    transformAnnexureTable(width, alignment);
  };

  const resolvedVendorId = useMemo(() => {
    const v = safe(vendorId) || safe((comparative as any)?.hoSelectedVendorId);
    return v;
  }, [vendorId, comparative]);

  const prNumber = useMemo(() => {
    return safe((comparative as any)?.pr_number) || safe((comparative as any)?.indentId) || safe((comparative as any)?.id);
  }, [comparative]);

  const comparisonId = useMemo(() => {
    return safe((comparative as any)?.comparisonId) || safe((comparative as any)?.comparison_id) || safe((comparative as any)?.comparision_id);
  }, [comparative]);

  const fetchLatestPurchaseOrderDraft = async (prNo: string, signal?: AbortSignal, preferredPoNumber?: string): Promise<ApiPurchaseOrder | null> => {
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    if (!baseUrl) throw new Error('Missing API base URL');

    const url = `${baseUrl}/purchase_flow/get_purchase_orders`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pr_number: prNo }),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(errText || `HTTP ${res.status}`);
    }

    const data: any = await res.json().catch(() => null);
    const list: any[] = Array.isArray(data?.purchase_orders)
      ? data.purchase_orders
      : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.orders)
          ? data.orders
          : Array.isArray(data)
            ? data
            : [];

    const ts = (x: any) => {
      const raw = safe(x?.updated_at) || safe(x?.created_at) || safe(x?.saved_at);
      const t = raw ? Date.parse(raw) : NaN;
      return Number.isFinite(t) ? t : 0;
    };

    const requestedPoNumber = safe(preferredPoNumber);
    const matchingOrders = requestedPoNumber
      ? list.filter((order: any) => {
          const purchaseQuote = order?.purchase_quote && typeof order.purchase_quote === 'object' ? order.purchase_quote : {};
          const candidate = safe(order?.order_number) || safe(purchaseQuote?.order_number) || safe(purchaseQuote?.poNo) || safe(purchaseQuote?.po_no);
          return candidate === requestedPoNumber;
        })
      : [];
    const latest = [...(matchingOrders.length ? matchingOrders : list)].sort((a, b) => ts(b) - ts(a))[0] ?? null;
    return latest as ApiPurchaseOrder | null;
  };

  const savePurchaseOrderToApi = async (payload: {
    comparison_id: string;
    pr_number: string;
    purchase_quote: Record<string, unknown>;
    other_terms_and_condition: Record<string, unknown>;
    order_number?: string;
  }) => {
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    if (!baseUrl) throw new Error('Missing API base URL');
    const url = `${baseUrl}/purchase_flow/save_purchase_order`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(errText || `HTTP ${res.status}`);
    }

    return res.json().catch(() => null);
  };

  useEffect(() => {
    if (!open) {
      setWorkflowStep('details');
      didHydrateDraftRef.current = false;
      setDraftStatus('idle');
      setShipToEditing(false);
      setAuthorizedSealAttachedAt('');
      return;
    }

    if (reviewOnly) setWorkflowStep('draft');
    else if (revisionMode) setWorkflowStep('details');

    setShipToEditing(false);

    const indentId = safe((comparative as any)?.indentId);
    const vId = safe(resolvedVendorId);
    const prNo = safe(prNumber) || indentId;
    if (!prNo || !vId) return;

    if (didHydrateDraftRef.current) return;
    didHydrateDraftRef.current = true;

    const ac = new AbortController();

    (async () => {
      // 1) Server draft (source of truth)
      try {
        const draft = await fetchLatestPurchaseOrderDraft(prNo, ac.signal, poNumber);
        if (draft) {
          const pq = draft.purchase_quote && typeof draft.purchase_quote === 'object' && !Array.isArray(draft.purchase_quote)
            ? (draft.purchase_quote as any)
            : {};
          const otc =
            draft.other_terms_and_condition &&
            typeof draft.other_terms_and_condition === 'object' &&
            !Array.isArray(draft.other_terms_and_condition)
              ? (draft.other_terms_and_condition as any)
              : {};
          const annexure1 = otc?.annexure1 && typeof otc.annexure1 === 'object' ? otc.annexure1 : {};
          const annexure2 = otc?.annexure2 && typeof otc.annexure2 === 'object' ? otc.annexure2 : {};
          const annexure3 = otc?.annexure3 && typeof otc.annexure3 === 'object' ? otc.annexure3 : {};
          const storedAnnexures = Object.entries(otc)
            .filter(([key, value]) => /^annexure\d+$/i.test(key) && value && typeof value === 'object' && !Array.isArray(value))
            .sort(([left], [right]) => Number(left.match(/\d+/)?.[0] || 0) - Number(right.match(/\d+/)?.[0] || 0))
            .map(([, value]) => value as any);
          const customStoredAnnexures = storedAnnexures.filter((value) => safe(value?.contentHtml));
          const customAnnexure = customStoredAnnexures[0] || (safe(annexure1?.contentHtml) ? annexure1 : annexure2);
          const legalAnnexure = [...storedAnnexures].reverse().find((value) => safe(value?.termsText)) || (safe(annexure1?.contentHtml) ? annexure2 : annexure3);
          const baseTerms = Object.fromEntries(Object.entries(otc).filter(([key]) => !/^annexure\d+$/i.test(key)));

          const orderNo = safe((draft as any)?.order_number) || safe(pq?.order_number) || safe(pq?.poNo) || safe(pq?.po_no) || safe(poNumber);

          setDraftStatus('idle');
          setPage(1);
          setP1({
            ...defaultPage1(),
            ...(pq as any),
            poNo: orderNo,
            requiredPurchaseDocuments: normalizePurchaseFlowDocuments(
              (pq as any)?.requiredPurchaseDocuments ?? (pq as any)?.required_purchase_documents,
            ),
            customFields: Array.isArray((pq as any)?.customFields) ? (pq as any).customFields : [],
          } as Page1State);
          setP2({ ...defaultPage2(), ...(baseTerms as any) } as Page2State);
          setP3({
            ...defaultPage3(),
            ...(safe(customAnnexure?.contentHtml) ? customAnnexure : {}),
            annexureTitle: normalizeAnnexureNumber(customAnnexure?.annexureTitle, defaultPage3().annexureTitle, 2, 1),
            contentHtml: safe(customAnnexure?.contentHtml) || defaultPage3().contentHtml,
          });
          setAdditionalAnnexures(customStoredAnnexures.slice(1).map((annexure, index) => ({
            ...defaultPage3(),
            ...annexure,
            annexureTitle: withAnnexureNumber(annexure?.annexureTitle, `ANNEXURE - ${index + 2}`, index + 2),
            contentHtml: safe(annexure?.contentHtml) || defaultPage3().contentHtml,
          })));
          setSelectedAnnexureIndex(0);
          setP4({
            ...defaultPage4(),
            ...legalAnnexure,
            annexureTitle: withAnnexureNumber(legalAnnexure?.annexureTitle, defaultPage4().annexureTitle, Math.max(1, customStoredAnnexures.length) + 1),
            termsText: safe(legalAnnexure?.termsText) || safe(annexure2?.termsText) || DEFAULT_ANNEXURE2_TERMS,
          });
          setAuthorizedSealAttachedAt(safe((pq as any)?.authorizedSealAttachedAt) || safe((draft as any)?.authorizedSealAttachedAt));
          return;
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        // Silent fallback to local draft, but log for debugging
        console.error('Failed to load PO draft from server:', e);
      }

      // 2) Local fallback (older behavior)
      const store = readPoDraftStore();
      const key = poDraftKey(prNo, vId);
      const d = store.drafts?.[key] as PoDraft | undefined;
      if (!d) {
        setDraftStatus('idle');
        setAuthorizedSealAttachedAt('');
        setAdditionalAnnexures([]);
        setSelectedAnnexureIndex(0);
        return;
      }

      setDraftStatus('idle');
      setPage(d.page || 1);
      setP1({
        ...defaultPage1(),
        ...(d.p1 || {}),
        poNo: safe(d.p1?.poNo) || safe(poNumber),
        requiredPurchaseDocuments: normalizePurchaseFlowDocuments(d.p1?.requiredPurchaseDocuments),
        customFields: Array.isArray(d.p1?.customFields) ? d.p1.customFields : [],
      });
      setP2({ ...defaultPage2(), ...(d.p2 || {}) });
      const legacyPage3 = d.p3 as any;
      setP3({
        ...defaultPage3(),
        ...(safe(legacyPage3?.contentHtml) ? legacyPage3 : {}),
        annexureTitle: normalizeAnnexureNumber(legacyPage3?.annexureTitle, defaultPage3().annexureTitle, 2, 1),
        contentHtml: safe(legacyPage3?.contentHtml) || defaultPage3().contentHtml,
      });
      setAdditionalAnnexures(Array.isArray(d.additionalAnnexures) ? d.additionalAnnexures : []);
      setSelectedAnnexureIndex(0);
      setP4({
        ...defaultPage4(),
        ...(d.p4 || {}),
        annexureTitle: withAnnexureNumber(d.p4?.annexureTitle, defaultPage4().annexureTitle, (Array.isArray(d.additionalAnnexures) ? d.additionalAnnexures.length : 0) + 2),
        termsText: safe(d.p4?.termsText) || safe(legacyPage3?.termsText) || DEFAULT_ANNEXURE2_TERMS,
      });
      setAuthorizedSealAttachedAt(safe(d.authorizedSealAttachedAt));
    })();

    return () => ac.abort();
  }, [open, comparative, resolvedVendorId, prNumber, reviewOnly, revisionMode, poNumber]);

  useEffect(() => {
    return () => {
      if (draftSavedTimerRef.current) window.clearTimeout(draftSavedTimerRef.current);
    };
  }, []);

  const authorizedSealUrl = '/1761635984396-removebg-preview.png';

  const authorizedSignatureText = useMemo(() => {
    if (!authorizedSealAttachedAt) return '';
    const at = new Date(authorizedSealAttachedAt);
    const time = (() => {
      try {
        return at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
      } catch {
        return '';
      }
    })();
    const date = formatYmd(authorizedSealAttachedAt);
    const who = safe(p1.approvedBy) || '—';
    return `Approver | ${who} | ${time || '—'} | ${date || '—'}`;
  }, [authorizedSealAttachedAt, p1.approvedBy]);

  useEffect(() => {
    if (!open) return;

    const base = String(getBaseUrl() ?? '').replace(/\/$/, '');
    if (!base) return;

    const ac = new AbortController();
    setClustersLoading(true);

    (async () => {
      try {
        const resp = await fetch(`${base}/farmer_managment/get_clusters`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: ac.signal,
        });

        if (!resp.ok) throw new Error(`Server responded ${resp.status}`);
        const result = await resp.json();
        const list = Array.isArray(result?.clusters) ? result.clusters : [];
        setClusters(list);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        console.error('Failed to load clusters:', e);
        setClusters([]);
      } finally {
        setClustersLoading(false);
      }
    })();

    return () => ac.abort();
  }, [open]);

  const selectedCluster = useMemo(() => {
    const id = safe(p1.clusterId);
    if (!id) return null;
    return (
      (Array.isArray(clusters) ? clusters : []).find((c: any) => safe(c?.cluster_id) === id || safe(c?.id) === id) ||
      null
    );
  }, [clusters, p1.clusterId]);

  const extractClusterShipAddress = (c: any) => {
    const addr =
      safe(c?.ship_to_address) ||
      safe(c?.shipToAddress) ||
      safe(c?.ship_address) ||
      safe(c?.shipping_address) ||
      safe(c?.cluster_address) ||
      safe(c?.address);
    return addr;
  };

  const extractClusterShipGstNo = (c: any) => {
    const raw =
      safe(c?.ship_to_gst_no) ||
      safe(c?.shipToGstNo) ||
      safe(c?.gst_no) ||
      safe(c?.gstNo) ||
      safe(c?.gstin) ||
      safe(c?.gst);
    return extractAfterColon(raw);
  };

  const extractClusterShipContactName = (c: any) => {
    return (
      safe(c?.ship_to_contact_name) ||
      safe(c?.shipToContactName) ||
      safe(c?.contact_name) ||
      safe(c?.contactName) ||
      safe(c?.contact_person) ||
      safe(c?.contactPerson)
    );
  };

  const extractClusterShipMobile = (c: any) => {
    return (
      safe(c?.ship_to_mobile) ||
      safe(c?.shipToMobile) ||
      safe(c?.mobile_number) ||
      safe(c?.mobileNumber) ||
      safe(c?.mobile) ||
      safe(c?.phone) ||
      safe(c?.phone_no) ||
      safe(c?.phoneNo)
    );
  };

  const extractClusterShipEmail = (c: any) => {
    return (
      safe(c?.ship_to_email) ||
      safe(c?.shipToEmail) ||
      safe(c?.contact_email) ||
      safe(c?.contactEmail) ||
      safe(c?.email)
    );
  };

  useEffect(() => {
    // Approved/revision views must preserve the exact PO snapshot. Directory
    // and cluster masters may have changed since the order was approved.
    if (reviewOnly || revisionMode) return;
    if (!selectedCluster) return;
    const addr = extractClusterShipAddress(selectedCluster);
    const gstNo = extractClusterShipGstNo(selectedCluster);
    const contactName = extractClusterShipContactName(selectedCluster);
    const mobile = extractClusterShipMobile(selectedCluster);
    const email = extractClusterShipEmail(selectedCluster);

    setP1((prev) => {
      const patch: Partial<Page1State> = {};

      if (addr) patch.shipToAddress = addr;

      if (gstNo && (!safe(prev.shipToGstNo) || safe(prev.shipToGstNo) === extractAfterColon(DUMMY_COMPANY.gst))) {
        patch.shipToGstNo = gstNo;
      }

      if (contactName && !safe(prev.shipToContactName)) {
        patch.shipToContactName = contactName;
      }

      if (mobile && (!safe(prev.shipToTel) || safe(prev.shipToTel) === safe(DUMMY_SHIP_TO.tel))) {
        patch.shipToTel = mobile;
      }

      if (email && (!safe(prev.shipToEmail) || safe(prev.shipToEmail) === safe(DUMMY_SHIP_TO.email))) {
        patch.shipToEmail = email;
      }

      return Object.keys(patch).length ? ({ ...prev, ...patch } as Page1State) : prev;
    });
  }, [selectedCluster, reviewOnly, revisionMode]);

  const selectedVendorFromComparative = useMemo(() => {
    const vendors = Array.isArray(comparative?.vendors) ? comparative!.vendors : [];
    return vendors.find((vendor: any) => safe(vendor?.id) === resolvedVendorId) as any;
  }, [comparative, resolvedVendorId]);

  const vendorNameFromComparative = useMemo(
    () => safe(selectedVendorFromComparative?.name) || resolvedVendorId,
    [selectedVendorFromComparative, resolvedVendorId]
  );

  const supplierDirectoryVendorId = useMemo(
    () => safe(selectedVendorFromComparative?.directoryVendorId) || resolvedVendorId,
    [selectedVendorFromComparative, resolvedVendorId]
  );

  useEffect(() => {
    if (reviewOnly || revisionMode) return;
    if (!selectedVendorFromComparative) return;
    setP1((current) => {
      const vendorAddress = safe(selectedVendorFromComparative?.address) || safe(selectedVendorFromComparative?.location);
      const vendorMobile = safe(selectedVendorFromComparative?.phone);
      const vendorEmail = safe(selectedVendorFromComparative?.email);
      return {
        ...current,
        vendorName: safe(current.vendorName) || safe(selectedVendorFromComparative?.name),
        vendorAddr1: safe(current.vendorAddr1) || vendorAddress,
        vendorContactName: safe(current.vendorContactName) || safe(selectedVendorFromComparative?.contactName) || safe(selectedVendorFromComparative?.representativeName),
        vendorMobile: safe(current.vendorMobile) || vendorMobile,
        vendorEmail: safe(current.vendorEmail) || vendorEmail,
        vendorPlaceOfBusiness: safe(current.vendorPlaceOfBusiness) || safe(selectedVendorFromComparative?.location),
        vendorLegalConstitution:
          safe(current.vendorLegalConstitution) ||
          safe(selectedVendorFromComparative?.legalConstitution) ||
          safe(selectedVendorFromComparative?.legal_constitution) ||
          safe(selectedVendorFromComparative?.vendor_entity_type),
      };
    });
  }, [selectedVendorFromComparative, reviewOnly, revisionMode]);

  useEffect(() => {
    if (reviewOnly || revisionMode) return;
    if (!open || !supplierDirectoryVendorId) return;
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    if (!baseUrl) return;

    const controller = new AbortController();
    setSupplierDetailsLoading(true);

    const readVendorDetails = (raw: any) => raw?.vendor_details ?? raw?.data?.vendor_details ?? raw?.data?.data?.vendor_details ?? null;
    const findRawVendor = (payload: any) => {
      const vendors = Array.isArray(payload?.vendors) ? payload.vendors : Array.isArray(payload?.data?.vendors) ? payload.data.vendors : [];
      return vendors.find((vendor: any) => safe(vendor?.vendor_id) === supplierDirectoryVendorId || safe(vendor?.id) === supplierDirectoryVendorId) ?? null;
    };

    const fetchSupplier = async () => {
      let details: any = null;
      try {
        const response = await fetch(`${baseUrl}/admin_accounts/get_vendor_details/${encodeURIComponent(supplierDirectoryVendorId)}`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (response.ok) details = readVendorDetails(await response.json().catch(() => null));
      } catch (error: any) {
        if (error?.name === 'AbortError') return;
      }

      if (!details) {
        try {
          const url = `${baseUrl}/purchase_flow/get_vendors_raw`;
          let response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal });
          if (response.status === 405) response = await fetch(url, { method: 'POST', headers: { Accept: 'application/json' }, signal: controller.signal });
          if (response.ok) {
            const rawVendor = findRawVendor(await response.json().catch(() => null));
            details = readVendorDetails(rawVendor);
          }
        } catch (error: any) {
          if (error?.name === 'AbortError') return;
        }
      }

      if (!details || controller.signal.aborted) return;
      const address = details?.address && typeof details.address === 'object' ? details.address : {};
      const addressParts = [
        address?.plot_flat_unit_no_and_floor,
        address?.name_of_premises,
        address?.road,
        address?.taluka_locality,
        address?.district,
        address?.state,
        address?.pin_code,
      ].map(safe).filter(Boolean);

      setP1((current) => ({
        ...current,
        vendorName: safe(details?.vendor_name) || current.vendorName || vendorNameFromComparative,
        vendorAddr1: safe(details?.vendor_address) || addressParts.join(', ') || current.vendorAddr1,
        vendorPinCode: safe(address?.pin_code) || safe(details?.pin_code) || current.vendorPinCode,
        vendorState: safe(address?.state) || safe(details?.state) || current.vendorState,
        vendorPlaceOfBusiness:
          safe(details?.place_of_business) ||
          safe(address?.taluka_locality) ||
          safe(address?.district) ||
          safe(address?.state) ||
          current.vendorPlaceOfBusiness,
        vendorContactName:
          safe(details?.contact_person_name) ||
          safe(details?.contact_name) ||
          safe(details?.authorized_person_name) ||
          safe(details?.representative_name) ||
          current.vendorContactName,
        vendorMobile: safe(details?.vendor_contact) || safe(details?.contact_number) || current.vendorMobile,
        vendorEmail: safe(details?.e_mail_id) || safe(details?.email) || current.vendorEmail,
        vendorVatRegnNo: safe(details?.gst_number) || current.vendorVatRegnNo,
        vendorPan:
          safe(details?.income_tax_pan) ||
          safe(details?.pan_number) ||
          safe(details?.pan_no) ||
          safe(details?.pan) ||
          current.vendorPan,
        vendorLegalConstitution:
          safe(details?.legal_constitution) ||
          safe(details?.vendor_entity_type) ||
          current.vendorLegalConstitution,
      }));
    };

    void fetchSupplier().finally(() => {
      if (!controller.signal.aborted) setSupplierDetailsLoading(false);
    });
    return () => controller.abort();
  }, [open, supplierDirectoryVendorId, vendorNameFromComparative, reviewOnly, revisionMode]);

  const computedTotals = useMemo(() => {
    if (!comparative || !resolvedVendorId) return null;
    const base = baseForVendor(comparative, resolvedVendorId);
    const gst = gstForVendor(comparative, resolvedVendorId);
    const freight = numOr0((comparative as any)?.freightCharges?.[resolvedVendorId]);
    const other = numOr0((comparative as any)?.otherCharges?.[resolvedVendorId]);

    const gstPct = clampPercent(p2.taxGstPercent);
    const otherPct = clampPercent(p2.taxOtherPercent);
    const autoGst = (gstPct / 100) * base;
    const autoOther = (otherPct / 100) * base;
    const autoTax = autoGst + autoOther;

    const tax = p2.taxAutoCalcEnabled ? autoTax : gst;
    const gross = base + tax + freight + other;

    return {
      base,
      gst, // original (item-based) GST
      freight,
      other,
      tax, // effective tax used in totals
      gross,
      auto: {
        gstPct,
        otherPct,
        gstAmount: autoGst,
        otherAmount: autoOther,
        taxAmount: autoTax,
      },
    };
  }, [comparative, resolvedVendorId, p2.taxAutoCalcEnabled, p2.taxGstPercent, p2.taxOtherPercent]);

  const taxesAutoText = useMemo(() => {
    const gstPct = clampPercent(p2.taxGstPercent);
    const otherPct = clampPercent(p2.taxOtherPercent);
    return formatTaxTermsText(gstPct, otherPct);
  }, [p2.taxGstPercent, p2.taxOtherPercent]);

  const paymentAutoText = useMemo(() => {
    return formatPaymentTermsText(Array.isArray(p2.paymentInstallments) ? p2.paymentInstallments : []);
  }, [p2.paymentInstallments]);

  const paymentInstallmentsSummary = useMemo(() => {
    const list = Array.isArray(p2.paymentInstallments) ? p2.paymentInstallments : [];
    const totalPct = list.reduce((sum, x) => sum + clampPercent(x.percent), 0);
    const base = computedTotals?.base ?? 0;
    const totalAmt = (totalPct / 100) * base;
    return { totalPct, totalAmt };
  }, [p2.paymentInstallments, computedTotals?.base]);

  const ldAutoText = useMemo(() => {
    const perWeekPct = clampPercent(p2.ldPerWeekPercent);
    const maxPct = clampPercent(p2.ldMaxPercent);
    return formatLdPenaltyText(perWeekPct, maxPct);
  }, [p2.ldPerWeekPercent, p2.ldMaxPercent]);

  const ldAmounts = useMemo(() => {
    const base = computedTotals?.base ?? 0;
    const perWeekPct = clampPercent(p2.ldPerWeekPercent);
    const maxPct = clampPercent(p2.ldMaxPercent);
    const perWeekAmt = (perWeekPct / 100) * base;
    const maxAmt = (maxPct / 100) * base;
    return { perWeekPct, maxPct, perWeekAmt, maxAmt };
  }, [p2.ldPerWeekPercent, p2.ldMaxPercent, computedTotals?.base]);

  const commercialDraftRows: CommercialDraftRow[] = [
    {
      no: 1,
      particular: 'Reference',
      details: [
        `Supplier's final quotation No.: ${safe(p2.supplierFinalQuotationNo) || 'Not Recorded'}`,
        `Quotation Date: ${safe(p2.supplierFinalQuotationDate) || 'Not Recorded'}`,
      ].join('\n'),
    },
    { no: 2, particular: 'Scope of Work', details: safe(p2.scopeOfWork) || '—' },
    { no: 3, particular: 'Basis of Price', details: safe(p2.basisOfPrice) || '—' },
    { no: 4, particular: 'Taxes', details: safe(p2.taxAutoCalcEnabled ? taxesAutoText : p2.taxes) || '—' },
    { no: 5, particular: 'Delivery Timelines', details: safe(p2.deliveryTimelines) || '—' },
    { no: 6, particular: 'Documents', details: safe(p2.documents) || '—' },
    { no: 7, particular: 'Payment Terms', details: safe(p2.paymentAutoEnabled ? paymentAutoText : p2.paymentTerms) || '—' },
    { no: 8, particular: 'Installation Support', details: safe(p2.installationSupport) || '—' },
    { no: 9, particular: 'Inspection', details: safe(p2.inspection) || '—' },
    { no: 10, particular: 'Warranty / Guarantee', details: safe(p2.warranty) || '—' },
    { no: 11, particular: 'LD / Penalty', details: safe(p2.ldAutoEnabled ? ldAutoText : p2.ldPenalty) || '—' },
    { no: 12, particular: 'Remarks', details: safe(p2.remarks) || '—' },
    { no: 13, particular: 'Site & Billing Address', details: safe(p2.siteBillingAddress) || '—' },
    { no: 14, particular: 'Documents Required', details: safe(p2.documentsRequired) || '—' },
    ...(Array.isArray(p1.customFields) ? p1.customFields : [])
      .filter((field) => safe(field.label) || safe(field.value))
      .map((field, index) => ({
        no: 15 + index,
        particular: safe(field.label) || 'Additional Term',
        details: safe(field.value) || '—',
      })),
  ];
  const correspondenceReservedLines = Math.min(
    46,
    Math.max(
      24,
      24
        + estimatedCommercialLines(p2.correspondenceAcknowledgement)
        + estimatedCommercialLines(p2.correspondenceAcceptance)
    )
  );
  const correspondenceSpaceMarker: CommercialDraftRow = {
    no: -1,
    particular: '__CORRESPONDENCE_SPACE__',
    details: 'x'.repeat(Math.max(1, correspondenceReservedLines - 2) * COMMERCIAL_ESTIMATED_CHARS_PER_LINE),
  };
  const commercialTermPages = paginateCommercialRows([...commercialDraftRows, correspondenceSpaceMarker]).map((rows) =>
    rows.filter((row) => row.no !== correspondenceSpaceMarker.no)
  );
  const commercialTermPageCount = commercialTermPages.length;
  const annexureReportPages = printableCustomAnnexures.flatMap((annexure, annexureIndex) =>
    paginateAnnexureHtml(annexure.contentHtml || defaultPage3().contentHtml).map((contentHtml, pageIndex, pages) => ({
      annexure,
      annexureIndex,
      annexureNumber: annexureIndex + 1,
      contentHtml,
      pageIndex,
      pageCount: pages.length,
    }))
  );
  const customAnnexureStartPage = 2 + commercialTermPageCount;
  const totalReportPages = commercialTermPageCount + annexureReportPages.length + 2;
  const legalReportPage = totalReportPages;

  // Review, print and download must share one physical A4 layout. Fit any page
  // whose content is taller than the A4 frame inside that same visible frame,
  // rather than applying a different scale only at print time.
  useLayoutEffect(() => {
    if (workflowStep !== 'draft') return;
    const frameId = globalThis.requestAnimationFrame(() => {
      const frames = Array.from(
        printRef.current?.querySelectorAll<HTMLElement>('[data-po-page-frame="true"]') || []
      );
      frames.forEach((frame) => {
        const sheet = frame.querySelector<HTMLElement>('.po-report-sheet');
        if (!sheet) return;
        sheet.style.transform = 'none';
        sheet.style.transformOrigin = 'top center';
        const availableHeight = frame.clientHeight || 1123;
        // offsetHeight represents the actual visible sheet box. scrollHeight
        // can include hidden descendants and previously caused the page to be
        // over-shrunk, leaving a large blank area below the footer.
        const contentHeight = sheet.offsetHeight || availableHeight;
        const scaleY = Math.min(1, availableHeight / contentHeight);
        sheet.style.transform = scaleY < 0.999 ? `scaleY(${scaleY})` : 'none';
      });
    });
    return () => globalThis.cancelAnimationFrame(frameId);
  }, [workflowStep, totalReportPages, p1, p2, p3, p4, customAnnexures]);

  const effectivePoNo = safe(p1.poNo) || safe(poNumber);
  const effectiveAmendmentNo = Math.max(0, numOr0(p1.amendmentNo), numOr0(amendmentNumber));
  const amendmentLabel = effectiveAmendmentNo > 0 ? `Amendment - ${effectiveAmendmentNo}` : '';
  const poReferenceLabel = `PO No. · ${effectivePoNo || 'Draft'}${amendmentLabel ? ` · ${amendmentLabel}` : ''}`;

  const sanitizeForFilename = (name: string) =>
    String(name ?? '')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ');

  const openPrintWindowAndAppendPages = (opts?: { title?: string }) => {
    const title = sanitizeForFilename(opts?.title || 'Purchase Order');

    // Keep a live reference to the generated document. Passing `noopener` here
    // makes some browsers return `null`, which prevents the print flow from
    // writing the PO pages or opening the print dialog.
    const w = window.open('', '_blank');
    if (!w) return null;

    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8" />`);
    w.document.write(`<title>${title}</title>`);
    w.document.write(`<base href="${window.location.origin}/" />`);
    w.document.write(`</head><body style="margin:0;"></body></html>`);
    w.document.close();

    // Copy styles (Tailwind + app styles) so the PO renders the same in the print window.
    const styleNodes = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'));
    for (const node of styleNodes) {
      try {
        w.document.head.appendChild(w.document.importNode(node, true));
      } catch {
        // ignore
      }
    }

    const extra = w.document.createElement('style');
    extra.textContent = `
      @page { size: A4 portrait; margin: 10mm; }
      html, body {
        width: 190mm;
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .no-print { display: none !important; }
      .print-only { display: none !important; }
      @media print {
        html, body { width: 190mm !important; }
        .no-print { display: none !important; }
        .print-only { display: block !important; }
        input, textarea { border: none !important; box-shadow: none !important; outline: none !important; }
        .po-page .shadow-sm { box-shadow: none !important; }
      }
      .po-page {
        box-sizing: border-box;
        width: 190mm;
        min-height: 277mm;
        margin: 0 auto;
        break-after: page;
        page-break-after: always;
      }
      .po-page:last-child { break-after: auto; page-break-after: auto; }
      .po-page [data-po-page="true"] {
        box-sizing: border-box;
        width: 190mm;
        min-height: 277mm;
        margin: 0;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .po-page .po-report-sheet {
        box-sizing: border-box;
        width: 190mm !important;
        min-height: 277mm !important;
        max-width: 190mm !important;
        margin: 0 !important;
      }
      .po-page .po-draft-font-11 {
        font-size: 11px !important;
      }
      .po-page .po-draft-font-11 input,
      .po-page .po-draft-font-11 textarea,
      .po-page .po-draft-font-11 table {
        font-size: 11px !important;
      }
      .po-page:has(.po-terms-report-sheet),
      .po-page .po-terms-report-sheet {
        height: 277mm !important;
        min-height: 277mm !important;
        max-height: 277mm !important;
        overflow: hidden !important;
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
      .po-page .po-terms-report-sheet .po-terms-table {
        break-inside: auto !important;
        page-break-inside: auto !important;
      }
      .po-page .po-terms-report-sheet .po-terms-table thead {
        display: table-header-group;
      }
      .po-page .po-terms-report-sheet .po-terms-table tr {
        break-inside: avoid-page;
        page-break-inside: avoid;
      }
      .po-page .po-terms-report-sheet .po-terms-table tfoot {
        display: table-footer-group;
      }
      .po-page > [data-po-page-number="4"] {
        border: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        padding: 0 !important;
      }
      .annexure-3-sheet {
        box-sizing: border-box;
        width: 100%;
        max-width: none !important;
      }
    `;
    w.document.head.appendChild(extra);

    const container = w.document.createElement('div');
    container.style.padding = '0';
    container.style.margin = '0';
    w.document.body.appendChild(container);

    // Draft review renders all PO pages together. Clone each page once so the
    // printed report stays complete and page-aligned without duplication.
    const renderedPages = Array.from(printRef.current?.querySelectorAll<HTMLElement>('[data-po-page="true"]') || []);
    if (renderedPages.length) {
      renderedPages.forEach((pageRoot) => {
        const wrap = w.document.createElement('div');
        wrap.className = 'po-page';
        wrap.appendChild(pageRoot.cloneNode(true));
        container.appendChild(wrap);
      });
    } else {
      // Fallback retained for inline/legacy preview use.
      const currentPage = page;
      const pageNums = Array.from({ length: totalReportPages }, (_, index) => index + 1);
      for (const pageNumber of pageNums) {
        flushSync(() => setPage(pageNumber));
        const pageRoot = printRef.current?.firstElementChild as HTMLElement | null;
        if (!pageRoot) continue;
        const wrap = w.document.createElement('div');
        wrap.className = 'po-page';
        wrap.appendChild(pageRoot.cloneNode(true));
        container.appendChild(wrap);
      }
      flushSync(() => setPage(currentPage));
    }
    return w;
  };

  const waitForImages = async (doc: Document) => {
    const imgs = Array.from(doc.images || []);
    await Promise.all(
      imgs.map(
        (img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.addEventListener('load', () => resolve(), { once: true });
                img.addEventListener('error', () => resolve(), { once: true });
              })
      )
    );
  };

  const waitForStylesheets = async (doc: Document) => {
    const links = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
    await Promise.all(
      links.map(
        (link) =>
          link.sheet
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                link.addEventListener('load', () => resolve(), { once: true });
                link.addEventListener('error', () => resolve(), { once: true });
                globalThis.setTimeout(resolve, 3000);
              })
      )
    );
  };

  const capturePoPageCanvases = async () => {
    const pageRoots = Array.from(
      printRef.current?.querySelectorAll<HTMLElement>('[data-po-page="true"]') || []
    );
    if (!pageRoots.length) throw new Error('Purchase Order pages are not ready.');
    if (document.fonts?.ready) await document.fonts.ready;

    const canvases: HTMLCanvasElement[] = [];
    for (const pageRoot of pageRoots) {
      const reportSheet = pageRoot.querySelector<HTMLElement>('[data-po-page-frame="true"]')
        || pageRoot.querySelector<HTMLElement>('.po-report-sheet')
        || pageRoot;
      const captureWidth = reportSheet.clientWidth || 794;
      const captureHeight = reportSheet.clientHeight || 1123;
      const captured = await html2canvas(reportSheet, {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: true,
          logging: false,
          width: captureWidth,
          height: captureHeight,
          // Preserve the live layout viewport. Using the A4 width as the clone
          // viewport triggered responsive max-width rules inside the modal,
          // shrinking the sheet to the left and leaving a blank strip on the
          // right side of every printed page.
          windowWidth: Math.max(document.documentElement.clientWidth, window.innerWidth, captureWidth),
          windowHeight: Math.max(document.documentElement.clientHeight, window.innerHeight, captureHeight),
        });

      // Every on-screen sheet is intended to be A4. Some content can increase
      // its DOM scroll height beyond 1123 px; sending that tall bitmap to the
      // browser makes Chrome shrink the whole page and creates the large white
      // margins seen in print preview. Normalize each capture to the exact A4
      // ratio before it reaches either the printer or jsPDF.
      const normalized = document.createElement('canvas');
      normalized.width = captured.width;
      normalized.height = Math.round(captured.width * (297 / 210));
      const context = normalized.getContext('2d');
      if (!context) throw new Error('Unable to prepare the A4 Purchase Order page.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, normalized.width, normalized.height);
      context.drawImage(captured, 0, 0, normalized.width, normalized.height);
      canvases.push(normalized);
    }
    return canvases;
  };

  const handlePrint = async (opts?: { title?: string }) => {
    if (printing) return;
    setPrinting(true);
    // Open immediately while the click still counts as a user gesture. This
    // avoids popup blockers while the A4 page images are being prepared.
    const w = window.open('', '_blank');
    try {
      if (!w) {
        showTemporaryError('Please allow pop-ups to print the Purchase Order.');
        return;
      }

      w.document.open();
      w.document.write('<!doctype html><html><head><title>Preparing Purchase Order…</title></head><body style="font-family:Arial,sans-serif;padding:24px">Preparing A4 pages…</body></html>');
      w.document.close();

      const canvases = await capturePoPageCanvases();
      const title = sanitizeForFilename(opts?.title || effectivePoNo || 'Purchase Order');
      const pageImages = canvases
        .map((canvas) => `<section class="print-page"><img src="${canvas.toDataURL('image/png')}" alt="Purchase Order page" /></section>`)
        .join('');

      w.document.open();
      w.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title><style>
        @page { size: A4 portrait; margin: 0; }
        * { box-sizing: border-box; }
        html, body { margin: 0 !important; padding: 0 !important; background: #fff; }
        body { display: flex; flex-direction: column; align-items: center; }
        .print-page {
          position: relative;
          flex: 0 0 auto;
          width: 210mm;
          height: 297mm;
          margin: 0 auto;
          overflow: hidden;
          background: #fff;
          break-after: page;
          page-break-after: always;
        }
        .print-page:last-child { break-after: auto; page-break-after: auto; }
        .print-page img {
          position: absolute;
          inset: 0;
          display: block;
          width: 100%;
          height: 100%;
          object-fit: fill;
        }
        @media print {
          body { display: block; width: 100%; }
          .print-page { margin-right: auto; margin-left: auto; }
        }
      </style></head><body>${pageImages}</body></html>`);
      w.document.close();
      await waitForImages(w.document);

      w.focus();

      // Some browsers cancel printing if the window is closed too early.
      const closer = () => {
        try {
          w.close();
        } catch {
          // ignore
        }
      };
      w.onafterprint = closer;
      globalThis.setTimeout(() => w.print(), 100);
    } catch (error) {
      console.error('Failed to prepare Purchase Order print', error);
      try {
        w?.close();
      } catch {
        // ignore
      }
      showTemporaryError('Failed to prepare the Purchase Order for printing.');
    } finally {
      setPrinting(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (printing) return;
    setPrinting(true);
    try {
      const canvases = await capturePoPageCanvases();
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      for (let index = 0; index < canvases.length; index += 1) {
        const canvas = canvases[index];
        if (index > 0) pdf.addPage('a4', 'portrait');
        const imageData = canvas.toDataURL('image/png');
        pdf.addImage(imageData, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
      }

      const filename = sanitizeForFilename(effectivePoNo || 'purchase-order') || 'purchase-order';
      pdf.save(`${filename}.pdf`);
      toast.success('Purchase Order PDF downloaded.');
    } catch (error) {
      console.error('Failed to generate Purchase Order PDF', error);
      showTemporaryError('Failed to generate the Purchase Order PDF.');
    } finally {
      setPrinting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (printing || savingPo) return;
    const vId = safe(resolvedVendorId);
    const prNo = safe(prNumber) || safe((comparative as any)?.indentId);
    if (!prNo || !vId) return;

    // Always persist locally first.
    setDraftStatus('saving');
    const savedAt = new Date().toISOString();
    const store = readPoDraftStore();
    const key = poDraftKey(prNo, vId);
    const next: PoDraft = {
      indentId: prNo,
      vendorId: vId,
      savedAt,
      page,
      p1,
      p2,
      p3,
      additionalAnnexures,
      p4: { ...p4, termsText: effectiveAnnexureTerms },
      authorizedSealAttachedAt: authorizedSealAttachedAt || '',
    };
    writePoDraftStore({ drafts: { ...(store.drafts || {}), [key]: next } });

    // A draft must not create an order number or call the final PO API.
    setDraftStatus('saved');
    toast.success('PO draft saved');
    if (draftSavedTimerRef.current) window.clearTimeout(draftSavedTimerRef.current);
    draftSavedTimerRef.current = window.setTimeout(() => setDraftStatus('idle'), 1500);
  };

  const reviewDraft = () => {
    const missing: string[] = [];
    if (!safe(p1.poDate)) missing.push('PO Date');
    if (!safe(p1.deliveryDate)) missing.push('Delivery Date');
    if (!safe(p1.clusterId)) missing.push('Cluster');
    if (!safe(p1.buyerBuildingNo)) missing.push('Buyer registered office');
    if (!safe(p1.paymentTerms)) missing.push('Payment Terms');
    if (!safe(p2.supplierFinalQuotationNo)) missing.push('Supplier Quotation No.');
    if (missing.length) {
      showTemporaryError(`Complete required fields: ${missing.join(', ')}`);
      return;
    }
    setP4((current) => ({
      ...defaultPage4(),
      ...current,
      annexureTitle: withAnnexureNumber(current?.annexureTitle, defaultPage4().annexureTitle, legalAnnexureNumber),
      termsText: safe(current?.termsText) || DEFAULT_ANNEXURE2_TERMS,
    }));
    setPage(1);
    setWorkflowStep('draft');
  };

  const handleConfirm = async () => {
    if (!comparative) return;
    if (!resolvedVendorId) return;
    if (printing || savingPo) return;

    const prNo = safe(prNumber) || safe((comparative as any)?.indentId);
    if (!prNo) return;
    if (!comparisonId) {
      showTemporaryError('Missing comparison id');
      return;
    }

    setSavingPo(true);
    try {
      const annexurePayload = customAnnexures.reduce<Record<string, Page3State>>((result, annexure, index) => {
        const annexureNumber = index + 1;
        result[`annexure${annexureNumber}`] = {
          ...annexure,
          annexureTitle: withAnnexureNumber(annexure.annexureTitle, `ANNEXURE - ${annexureNumber}`, annexureNumber),
        };
        return result;
      }, {});
      (annexurePayload as Record<string, Page3State | Page4State>)[`annexure${legalAnnexureNumber}`] = {
        ...p4,
        annexureTitle: withAnnexureNumber(p4.annexureTitle, defaultPage4().annexureTitle, legalAnnexureNumber),
        termsText: effectiveAnnexureTerms,
      };
      const payload: any = {
        comparison_id: comparisonId,
        pr_number: prNo,
        purchase_quote: {
          ...(p1 as any),
          amendmentNo: effectiveAmendmentNo,
          required_purchase_documents: normalizePurchaseFlowDocuments(p1.requiredPurchaseDocuments),
          vendor_id: safe(resolvedVendorId),
          vendor_name: vendorNameFromComparative,
          authorizedSealAttachedAt: authorizedSealAttachedAt || '',
        },
        other_terms_and_condition: {
          ...(p2 as any),
          ...annexurePayload,
        },
      };

      const existingOrderNo = effectivePoNo;
      if (existingOrderNo) payload.order_number = existingOrderNo;

      const apiRes: any = await savePurchaseOrderToApi(payload);
      const orderNo = safe(apiRes?.order_number) || safe(apiRes?.orderNo) || safe(apiRes?.poNo) || effectivePoNo;
      if (orderNo && orderNo !== safe(p1.poNo)) setP1Field('poNo', orderNo as any);

      // Keep the exact created/approved content locally as a resilient
      // amendment snapshot. Revision mode can restore every editable field
      // even when an older server response omits part of the purchase quote.
      const snapshotKey = poDraftKey(prNo, resolvedVendorId);
      const snapshotStore = readPoDraftStore();
      const snapshot: PoDraft = {
        indentId: prNo,
        vendorId: resolvedVendorId,
        savedAt: new Date().toISOString(),
        page: 1,
        p1: { ...p1, poNo: orderNo || effectivePoNo, amendmentNo: effectiveAmendmentNo },
        p2,
        p3,
        additionalAnnexures,
        p4: { ...p4, termsText: effectiveAnnexureTerms },
        authorizedSealAttachedAt: authorizedSealAttachedAt || '',
      };
      writePoDraftStore({ drafts: { ...(snapshotStore.drafts || {}), [snapshotKey]: snapshot } });

      const createdAt = safe(apiRes?.created_at) || safe(apiRes?.updated_at) || new Date().toISOString();
      onConfirm?.({ indentId: safe(comparative.indentId), vendorId: resolvedVendorId, createdAt, poNo: orderNo });
      onClose();
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? '').trim();
      showTemporaryError(`Failed to save purchase order${msg ? `: ${msg}` : ''}`);
    } finally {
      setSavingPo(false);
    }
  };

  if (!open) return null;
  if (!comparative) return null;

  const qForVendor = (comparative.quotes || []).find((x: any) => safe(x?.vendorId) === resolvedVendorId);

  const toggleRequiredDoc = (doc: (typeof DOCUMENT_REQUIRED_OPTIONS)[number], shouldInclude: boolean) => {
    const current = selectedDocsFromText(String(p2.documentsRequired ?? ''));
    if (shouldInclude) current.add(doc);
    else current.delete(doc);

    const ordered = DOCUMENT_REQUIRED_OPTIONS.filter((x) => current.has(x));
    setP2Field('documentsRequired', formatDocsList(ordered) as any);
  };

  const updateInstallment = (id: string, patch: Partial<PaymentInstallment>) => {
    setP2((p) => ({
      ...p,
      paymentInstallments: (Array.isArray(p.paymentInstallments) ? p.paymentInstallments : []).map((x) =>
        x.id === id ? ({ ...x, ...patch } as PaymentInstallment) : x
      ),
    }));
  };

  const addInstallment = () => {
    setP2((p) => ({
      ...p,
      paymentInstallments: [...(Array.isArray(p.paymentInstallments) ? p.paymentInstallments : []), newInstallment()],
    }));
  };

  const removeInstallment = (id: string) => {
    setP2((p) => ({
      ...p,
      paymentInstallments: (Array.isArray(p.paymentInstallments) ? p.paymentInstallments : []).filter((x) => x.id !== id),
    }));
  };

  const addCustomField = () => {
    setP1((current) => ({
      ...current,
      customFields: [...(Array.isArray(current.customFields) ? current.customFields : []), newCustomPoField()],
    }));
  };

  const updateCustomField = (id: string, patch: Partial<CustomPoField>) => {
    setP1((current) => ({
      ...current,
      customFields: (Array.isArray(current.customFields) ? current.customFields : []).map((field) =>
        field.id === id ? { ...field, ...patch } : field
      ),
    }));
  };

  const removeCustomField = (id: string) => {
    setP1((current) => ({
      ...current,
      customFields: (Array.isArray(current.customFields) ? current.customFields : []).filter((field) => field.id !== id),
    }));
  };

  const formInputClass = 'h-11 rounded-xl border-slate-200 bg-white text-sm text-slate-800 shadow-none focus-visible:ring-[#0D3A35]';
  const formLabelClass = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[0.09em] text-slate-500';
  const formTextareaClass = 'min-h-[84px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#0D3A35] focus:ring-1 focus:ring-[#0D3A35]';

  const editClauseTextarea = <K extends keyof Page2State>(field: K, value: string, placeholder: string, minHeight = 72) => (
    <textarea
      value={value}
      onChange={(event) => setP2Field(field, event.target.value as Page2State[K])}
      placeholder={placeholder}
      className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none focus:border-[#0D3A35] focus:ring-1 focus:ring-[#0D3A35]"
      style={{ minHeight }}
    />
  );

  const editCommercialClauseRows = [
    {
      no: 1,
      particular: 'Reference',
      detail: (
        <div className="grid gap-3 md:grid-cols-2">
          <div><label className={formLabelClass}>Supplier Quotation No.</label><Input value={p2.supplierFinalQuotationNo} onChange={(event) => setP2Field('supplierFinalQuotationNo', event.target.value)} className={formInputClass} /></div>
          <div><label className={formLabelClass}>Supplier Quotation Date</label><Input type="date" value={p2.supplierFinalQuotationDate} onChange={(event) => setP2Field('supplierFinalQuotationDate', event.target.value)} className={formInputClass} /></div>
        </div>
      ),
    },
    { no: 2, particular: 'Scope of Work', detail: editClauseTextarea('scopeOfWork', p2.scopeOfWork, 'Enter scope of work...') },
    { no: 3, particular: 'Basis of Price', detail: editClauseTextarea('basisOfPrice', p2.basisOfPrice, 'Enter basis of price...') },
    {
      no: 4,
      particular: 'Taxes',
      detail: (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={formLabelClass}>GST %</label><Input inputMode="decimal" value={p2.taxGstPercent} onChange={(event) => setP2Field('taxGstPercent', event.target.value)} className={formInputClass} /></div>
            <div><label className={formLabelClass}>Other Tax %</label><Input inputMode="decimal" value={p2.taxOtherPercent} onChange={(event) => setP2Field('taxOtherPercent', event.target.value)} className={formInputClass} /></div>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><Checkbox checked={p2.taxAutoCalcEnabled} onCheckedChange={(checked) => setP2Field('taxAutoCalcEnabled', Boolean(checked))} />Automatically calculate tax text</label>
          {editClauseTextarea('taxes', p2.taxAutoCalcEnabled ? taxesAutoText : p2.taxes, 'Enter tax terms...', 64)}
        </div>
      ),
    },
    { no: 5, particular: 'Delivery Timelines', detail: editClauseTextarea('deliveryTimelines', p2.deliveryTimelines, 'Enter delivery timelines...', 92) },
    { no: 6, particular: 'Documents', detail: editClauseTextarea('documents', p2.documents, 'Enter documents / approval requirements...', 92) },
    {
      no: 7,
      particular: 'Payment Terms',
      detail: (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><Checkbox checked={p2.paymentAutoEnabled} onCheckedChange={(checked) => setP2Field('paymentAutoEnabled', Boolean(checked))} />Use payment schedule</label>
          {p2.paymentAutoEnabled ? (
            <div className="space-y-2">
              {p2.paymentInstallments.map((installment, index) => (
                <div key={installment.id} className="grid gap-2 sm:grid-cols-[90px_1fr_auto]">
                  <Input inputMode="decimal" value={installment.percent} onChange={(event) => updateInstallment(installment.id, { percent: event.target.value })} placeholder="%" className={formInputClass} />
                  <Input value={installment.label} onChange={(event) => updateInstallment(installment.id, { label: event.target.value })} placeholder={`Payment milestone ${index + 1}`} className={formInputClass} />
                  <Button type="button" variant="outline" onClick={() => removeInstallment(installment.id)} disabled={p2.paymentInstallments.length === 1} className="h-11 rounded-xl">Remove</Button>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={addInstallment} className="rounded-xl border-[#0D3A35] text-[#0D3A35]">Add Payment Milestone</Button>
              <textarea value={paymentAutoText} readOnly className={`${formTextareaClass} bg-slate-50`} />
            </div>
          ) : editClauseTextarea('paymentTerms', p2.paymentTerms, 'Enter payment terms...', 110)}
        </div>
      ),
    },
    { no: 8, particular: 'Installation Support', detail: editClauseTextarea('installationSupport', p2.installationSupport, 'Enter installation / support terms...') },
    { no: 9, particular: 'Inspection', detail: editClauseTextarea('inspection', p2.inspection, 'Enter inspection terms...') },
    { no: 10, particular: 'Warranty / Guarantee', detail: editClauseTextarea('warranty', p2.warranty, 'Enter warranty / guarantee terms...') },
    {
      no: 11,
      particular: 'LD / Penalty',
      detail: (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><Checkbox checked={p2.ldAutoEnabled} onCheckedChange={(checked) => setP2Field('ldAutoEnabled', Boolean(checked))} />Generate standard LD clause</label>
          {p2.ldAutoEnabled ? <div className="grid gap-3 sm:grid-cols-2"><div><label className={formLabelClass}>Penalty per Week %</label><Input inputMode="decimal" value={p2.ldPerWeekPercent} onChange={(event) => setP2Field('ldPerWeekPercent', event.target.value)} className={formInputClass} /></div><div><label className={formLabelClass}>Maximum Penalty %</label><Input inputMode="decimal" value={p2.ldMaxPercent} onChange={(event) => setP2Field('ldMaxPercent', event.target.value)} className={formInputClass} /></div></div> : null}
          {p2.ldAutoEnabled ? <textarea value={ldAutoText} readOnly className={`${formTextareaClass} bg-slate-50`} /> : editClauseTextarea('ldPenalty', p2.ldPenalty, 'Enter LD / penalty terms...', 92)}
        </div>
      ),
    },
    { no: 12, particular: 'Remarks', detail: editClauseTextarea('remarks', p2.remarks, 'Enter remarks...') },
    { no: 13, particular: 'Site & Billing Address', detail: editClauseTextarea('siteBillingAddress', p2.siteBillingAddress, 'Enter site & billing address...', 180) },
    {
      no: 14,
      particular: 'Documents Required',
      detail: (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {DOCUMENT_REQUIRED_OPTIONS.map((doc) => <label key={doc} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs font-medium text-slate-700"><Checkbox checked={selectedDocsFromText(p2.documentsRequired).has(doc)} onCheckedChange={(checked) => toggleRequiredDoc(doc, Boolean(checked))} />{doc}</label>)}
          </div>
          {editClauseTextarea('documentsRequired', p2.documentsRequired, 'Enter documents required...', 92)}
        </div>
      ),
    },
  ];

  const detailsForm = (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <section style={{ order: 1 }} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <style>{ANNEXURE_RICH_TEXT_CSS}</style>
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <h3 className="font-bold text-slate-900">Order Reference</h3>
          <p className="mt-0.5 text-xs text-slate-500">Enter the primary PO, vendor and delivery information.</p>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={formLabelClass}>PO Number</label>
            <Input value={p1.poNo} readOnly placeholder="Auto-generated on creation" className={`${formInputClass} bg-slate-50 text-slate-500`} />
          </div>
          <div>
            <label className={formLabelClass}>PO Date *</label>
            <Input type="date" value={p1.poDate} onChange={(event) => setP1Field('poDate', event.target.value)} className={formInputClass} />
          </div>
          <div>
            <label className={formLabelClass}>Approved Vendor</label>
            <Input value={vendorNameFromComparative || resolvedVendorId} readOnly className={`${formInputClass} bg-slate-50 font-semibold`} />
          </div>
          <div>
            <label className={formLabelClass}>Vendor Code</label>
            <Input value={resolvedVendorId} readOnly className={`${formInputClass} bg-slate-50 font-mono`} />
          </div>
          <div>
            <label className={formLabelClass}>Cluster *</label>
            <Select value={p1.clusterId} onValueChange={(value) => setP1Field('clusterId', value)}>
              <SelectTrigger className={formInputClass}><SelectValue placeholder={clustersLoading ? 'Loading clusters…' : 'Select cluster'} /></SelectTrigger>
              <SelectContent>
                {(Array.isArray(clusters) ? clusters : []).map((cluster: any) => {
                  const id = safe(cluster?.cluster_id) || safe(cluster?.id);
                  const label = safe(cluster?.cluster_name) || safe(cluster?.name) || id;
                  return id ? <SelectItem key={id} value={id}>{label}</SelectItem> : null;
                })}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={formLabelClass}>Delivery Date *</label>
            <Input type="date" value={p1.deliveryDate} onChange={(event) => setP1Field('deliveryDate', event.target.value)} className={formInputClass} />
          </div>
          <div>
            <label className={formLabelClass}>Payment Terms *</label>
            <Input value={p1.paymentTerms} onChange={(event) => setP1Field('paymentTerms', event.target.value)} className={formInputClass} />
          </div>
          <div>
            <label className={formLabelClass}>Inco Terms</label>
            <Input value={p1.incoTerms} onChange={(event) => setP1Field('incoTerms', event.target.value)} className={formInputClass} />
          </div>
        </div>
        <div className="border-t border-slate-200 px-5 py-5">
          <div className="mb-3">
            <h4 className="text-sm font-bold text-slate-900">Required Purchase Documents</h4>
            <p className="mt-1 text-xs text-slate-500">
              Selected documents will be available as upload steps in Purchase Flow. PO Acceptance is mandatory.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PURCHASE_FLOW_DOCUMENT_OPTIONS.map((option) => {
              const selectedDocuments = normalizePurchaseFlowDocuments(p1.requiredPurchaseDocuments);
              const checked = selectedDocuments.includes(option.value);
              return (
                <label
                  key={option.value}
                  className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm font-semibold transition-colors ${
                    checked
                      ? 'border-[#0D3A35] bg-[#eef7f4] text-[#0D3A35]'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    disabled={option.mandatory}
                    onCheckedChange={(nextChecked) => {
                      const next = new Set(selectedDocuments);
                      if (nextChecked) next.add(option.value);
                      else next.delete(option.value);
                      setP1Field('requiredPurchaseDocuments', normalizePurchaseFlowDocuments([...next]));
                    }}
                  />
                  <span className="flex-1">{option.label}</span>
                  {option.mandatory ? (
                    <span className="rounded-full bg-[#0D3A35] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                      Mandatory
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </div>
      </section>

      <section style={{ order: 4 }} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <h3 className="font-bold text-slate-900">Item Details</h3>
            <p className="mt-0.5 text-xs text-slate-500">Items and approved rates carried forward from the comparative statement.</p>
          </div>
          <span className="rounded-full bg-[#e7f3ef] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#0D3A35]">
            {(comparative.items || []).length} {(comparative.items || []).length === 1 ? 'Item' : 'Items'}
          </span>
        </div>
        {(comparative.items || []).length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="bg-[#0D3A35] text-white">
                <tr>
                  <th className="w-16 border-r border-white/20 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider">S. No.</th>
                  <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider">Item Description</th>
                  <th className="w-28 border-l border-white/20 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider">Qty</th>
                  <th className="w-28 border-l border-white/20 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider">UOM</th>
                  <th className="w-36 border-l border-white/20 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider">Unit Rate</th>
                  <th className="w-40 border-l border-white/20 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody>
                {(comparative.items || []).map((item: any, index: number) => {
                  const quantity = numOr0(item?.qty);
                  const unitRate = numOr0((qForVendor as any)?.unitRateByItemId?.[item?.id]);
                  const lineAmount = quantity * unitRate;
                  return (
                    <tr key={safe(item?.id) || index} className="border-b border-slate-200 last:border-b-0">
                      <td className="border-r border-slate-200 px-3 py-3 text-center font-semibold text-slate-500">{index + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{safe(item?.partName) || safe(item?.itemName) || 'Item not recorded'}</div>
                        {safe(item?.description) || safe(item?.specification) ? <div className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-500">{safe(item?.description) || safe(item?.specification)}</div> : null}
                      </td>
                      <td className="border-l border-slate-200 px-3 py-3 text-center font-semibold tabular-nums text-slate-900">{quantity}</td>
                      <td className="border-l border-slate-200 px-3 py-3 text-center font-medium text-slate-700">{safe(item?.uom) || '—'}</td>
                      <td className="border-l border-slate-200 px-3 py-3 text-center font-semibold tabular-nums text-slate-900">{unitRate ? inr(unitRate) : '—'}</td>
                      <td className="border-l border-slate-200 px-3 py-3 text-center font-bold tabular-nums text-[#0D3A35]">{unitRate ? inr(lineAmount) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-[#0D3A35] bg-[#f0f6f4]">
                <tr>
                  <td colSpan={5} className="border-b border-r border-slate-300 px-4 py-2 text-left text-xs font-bold text-slate-700">Basic Order Value</td>
                  <td className="border-b border-slate-300 px-3 py-2 text-center font-bold tabular-nums text-slate-900">{computedTotals ? inr(computedTotals.base) : '—'}</td>
                </tr>
                <tr>
                  <td colSpan={5} className="border-b border-r border-slate-300 px-4 py-2 text-left text-xs font-bold text-slate-700">GST</td>
                  <td className="border-b border-slate-300 px-3 py-2 text-center font-bold tabular-nums text-slate-900">{computedTotals ? inr(computedTotals.tax) : '—'}</td>
                </tr>
                <tr>
                  <td colSpan={5} className="border-r border-slate-300 px-4 py-2 text-left text-xs font-black text-[#0D3A35]">Total Order Value</td>
                  <td className="px-3 py-2 text-center font-black tabular-nums text-[#0D3A35]">{computedTotals ? inr(computedTotals.gross) : '—'}</td>
                </tr>
                <tr className="bg-white">
                  <td colSpan={6} className="px-4 py-2.5 text-center text-xs font-semibold italic text-slate-700">
                    Amount - {amountInIndianWords(computedTotals?.gross || 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="px-5 py-8 text-center text-sm text-slate-500">No approved item details were found in this comparative statement.</div>
        )}
      </section>

      <section style={{ order: 2 }} className="grid gap-5 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold text-slate-900">Supplier’s Registered Details</h3>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${supplierDetailsLoading ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {supplierDetailsLoading ? 'Loading vendor data…' : 'Auto-filled'}
              </span>
            </div>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className={formLabelClass}>Supplier’s Name</label><Input value={p1.vendorName} onChange={(event) => setP1Field('vendorName', event.target.value)} placeholder={vendorNameFromComparative} className={formInputClass} /></div>
            <div className="sm:col-span-2"><label className={formLabelClass}>Registered Address</label><textarea value={p1.vendorAddr1} onChange={(event) => setP1Field('vendorAddr1', event.target.value)} className={formTextareaClass} /></div>
            <div><label className={formLabelClass}>Name</label><Input value={p1.vendorContactName} onChange={(event) => setP1Field('vendorContactName', event.target.value)} placeholder="Supplier contact person" className={formInputClass} /></div>
            <div><label className={formLabelClass}>State / UT</label><Input value={p1.vendorState} onChange={(event) => setP1Field('vendorState', event.target.value)} className={formInputClass} /></div>
            <div className="sm:col-span-2"><label className={formLabelClass}>Place of Business</label><Input value={p1.vendorPlaceOfBusiness} onChange={(event) => setP1Field('vendorPlaceOfBusiness', event.target.value)} className={formInputClass} /></div>
            <div><label className={formLabelClass}>Mobile Number</label><Input value={p1.vendorMobile} onChange={(event) => setP1Field('vendorMobile', event.target.value)} className={formInputClass} /></div>
            <div><label className={formLabelClass}>Email</label><Input type="email" value={p1.vendorEmail} onChange={(event) => setP1Field('vendorEmail', event.target.value)} className={formInputClass} /></div>
            <div><label className={formLabelClass}>GSTIN</label><Input value={p1.vendorVatRegnNo} onChange={(event) => setP1Field('vendorVatRegnNo', event.target.value.toUpperCase())} className={formInputClass} /></div>
            <div><label className={formLabelClass}>PAN</label><Input value={p1.vendorPan || ''} onChange={(event) => setP1Field('vendorPan', event.target.value.toUpperCase())} className={formInputClass} /></div>
            <div className="sm:col-span-2"><label className={formLabelClass}>Vendor Legal Constitution</label><Input value={p1.vendorLegalConstitution || ''} onChange={(event) => setP1Field('vendorLegalConstitution', event.target.value)} placeholder="Individual, Partnership Firm, Company, etc." className={formInputClass} /></div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <h3 className="font-bold text-slate-900">Buyer’s Place of Business / Billing Address</h3>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className={formLabelClass}>Buyer Name</label><Input value={p1.buyerCompanyName} onChange={(event) => setP1Field('buyerCompanyName', event.target.value)} className={formInputClass} /></div>
            <div className="sm:col-span-2"><label className={formLabelClass}>Registered Office — Building No. / Flat No.</label><Input value={p1.buyerBuildingNo} onChange={(event) => setP1Field('buyerBuildingNo', event.target.value)} className={formInputClass} /></div>
            <div><label className={formLabelClass}>Road / Street</label><Input value={p1.buyerRoadStreet} onChange={(event) => setP1Field('buyerRoadStreet', event.target.value)} className={formInputClass} /></div>
            <div><label className={formLabelClass}>Village</label><Input value={p1.buyerVillage} onChange={(event) => setP1Field('buyerVillage', event.target.value)} className={formInputClass} /></div>
            <div><label className={formLabelClass}>District</label><Input value={p1.buyerDistrict} onChange={(event) => setP1Field('buyerDistrict', event.target.value)} className={formInputClass} /></div>
            <div><label className={formLabelClass}>Pin Code</label><Input value={p1.buyerPinCode} onChange={(event) => setP1Field('buyerPinCode', event.target.value)} className={formInputClass} /></div>
            <div><label className={formLabelClass}>GSTIN</label><Input value={p1.shipToGstNo} onChange={(event) => setP1Field('shipToGstNo', event.target.value.toUpperCase())} className={formInputClass} /></div>
            <div><label className={formLabelClass}>PAN</label><Input value={p1.buyerPan || ''} onChange={(event) => setP1Field('buyerPan', event.target.value.toUpperCase())} className={formInputClass} /></div>
            <div><label className={formLabelClass}>Contact Name</label><Input value={p1.shipToContactName} onChange={(event) => setP1Field('shipToContactName', event.target.value)} className={formInputClass} /></div>
            <div><label className={formLabelClass}>Mobile Number</label><Input value={p1.shipToTel} onChange={(event) => setP1Field('shipToTel', event.target.value)} className={formInputClass} /></div>
            <div><label className={formLabelClass}>Email</label><Input type="email" value={p1.shipToEmail} onChange={(event) => setP1Field('shipToEmail', event.target.value)} className={formInputClass} /></div>
          </div>
        </div>
      </section>

      <section style={{ order: 6 }} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <h3 className="font-bold text-slate-900">Commercial Terms</h3>
          <p className="mt-0.5 text-xs text-slate-500">These details will appear in the PO and its annexures.</p>
        </div>
        <div className="hidden">
          <div><label className={formLabelClass}>Supplier Quotation No. *</label><Input value={p2.supplierFinalQuotationNo} onChange={(event) => setP2Field('supplierFinalQuotationNo', event.target.value)} className={formInputClass} /></div>
          <div><label className={formLabelClass}>Supplier Quotation Date</label><Input type="date" value={p2.supplierFinalQuotationDate} onChange={(event) => setP2Field('supplierFinalQuotationDate', event.target.value)} className={formInputClass} /></div>
          <div className="md:col-span-2"><label className={formLabelClass}>Scope of Work</label><textarea value={p2.scopeOfWork} onChange={(event) => setP2Field('scopeOfWork', event.target.value)} className={formTextareaClass} /></div>
          <div className="md:col-span-2"><label className={formLabelClass}>Basis of Price</label><textarea value={p2.basisOfPrice} onChange={(event) => setP2Field('basisOfPrice', event.target.value)} className={formTextareaClass} /></div>
          <div><label className={formLabelClass}>GST %</label><Input inputMode="decimal" value={p2.taxGstPercent} onChange={(event) => { setP2Field('taxGstPercent', event.target.value); setP2Field('taxAutoCalcEnabled', true); }} className={formInputClass} /></div>
          <div><label className={formLabelClass}>Other Tax %</label><Input inputMode="decimal" value={p2.taxOtherPercent} onChange={(event) => { setP2Field('taxOtherPercent', event.target.value); setP2Field('taxAutoCalcEnabled', true); }} className={formInputClass} /></div>
          <div className="md:col-span-2"><label className={formLabelClass}>Tax Terms</label><textarea value={p2.taxAutoCalcEnabled ? taxesAutoText : p2.taxes} onChange={(event) => setP2Field('taxes', event.target.value)} readOnly={p2.taxAutoCalcEnabled} className={`${formTextareaClass} ${p2.taxAutoCalcEnabled ? 'bg-slate-50' : ''}`} /></div>
          <div className="md:col-span-2"><label className={formLabelClass}>Delivery Timelines</label><textarea value={p2.deliveryTimelines} onChange={(event) => setP2Field('deliveryTimelines', event.target.value)} className={formTextareaClass} /></div>
          <div className="md:col-span-2"><label className={formLabelClass}>Documents</label><textarea value={p2.documents} onChange={(event) => setP2Field('documents', event.target.value)} className={formTextareaClass} /></div>

          <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <label className={formLabelClass}>Payment Terms</label>
                <p className="text-xs text-slate-500">Enter free text or generate it from a payment schedule.</p>
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Checkbox checked={p2.paymentAutoEnabled} onCheckedChange={(checked) => setP2Field('paymentAutoEnabled', Boolean(checked))} />
                Use payment schedule
              </label>
            </div>
            {p2.paymentAutoEnabled ? (
              <div className="space-y-3">
                {p2.paymentInstallments.map((installment, index) => (
                  <div key={installment.id} className="grid gap-2 sm:grid-cols-[90px_1fr_auto]">
                    <Input inputMode="decimal" value={installment.percent} onChange={(event) => updateInstallment(installment.id, { percent: event.target.value })} placeholder="%" className={formInputClass} />
                    <Input value={installment.label} onChange={(event) => updateInstallment(installment.id, { label: event.target.value })} placeholder={`Payment milestone ${index + 1}`} className={formInputClass} />
                    <Button type="button" variant="outline" onClick={() => removeInstallment(installment.id)} disabled={p2.paymentInstallments.length === 1} className="h-11 rounded-xl">Remove</Button>
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={addInstallment} className="rounded-xl border-[#0D3A35] text-[#0D3A35]">Add Payment Milestone</Button>
                <textarea value={paymentAutoText} readOnly className={`${formTextareaClass} bg-white`} />
              </div>
            ) : (
              <textarea value={p2.paymentTerms} onChange={(event) => setP2Field('paymentTerms', event.target.value)} className={formTextareaClass} />
            )}
          </div>

          <div><label className={formLabelClass}>Installation Support</label><textarea value={p2.installationSupport} onChange={(event) => setP2Field('installationSupport', event.target.value)} className={formTextareaClass} /></div>
          <div><label className={formLabelClass}>Inspection</label><textarea value={p2.inspection} onChange={(event) => setP2Field('inspection', event.target.value)} className={formTextareaClass} /></div>
          <div><label className={formLabelClass}>Warranty / Guarantee</label><textarea value={p2.warranty} onChange={(event) => setP2Field('warranty', event.target.value)} className={formTextareaClass} /></div>

          <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div><label className={formLabelClass}>LD / Penalty</label><p className="text-xs text-slate-500">Enter custom terms or generate the standard penalty clause.</p></div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Checkbox checked={p2.ldAutoEnabled} onCheckedChange={(checked) => setP2Field('ldAutoEnabled', Boolean(checked))} />Generate clause</label>
            </div>
            {p2.ldAutoEnabled && (
              <div className="mb-3 grid gap-3 sm:grid-cols-2">
                <div><label className={formLabelClass}>Penalty per Week %</label><Input inputMode="decimal" value={p2.ldPerWeekPercent} onChange={(event) => setP2Field('ldPerWeekPercent', event.target.value)} className={formInputClass} /></div>
                <div><label className={formLabelClass}>Maximum Penalty %</label><Input inputMode="decimal" value={p2.ldMaxPercent} onChange={(event) => setP2Field('ldMaxPercent', event.target.value)} className={formInputClass} /></div>
              </div>
            )}
            <textarea value={p2.ldAutoEnabled ? ldAutoText : p2.ldPenalty} onChange={(event) => setP2Field('ldPenalty', event.target.value)} readOnly={p2.ldAutoEnabled} className={`${formTextareaClass} ${p2.ldAutoEnabled ? 'bg-white' : ''}`} />
          </div>

          <div className="md:col-span-2"><label className={formLabelClass}>Remarks</label><textarea value={p2.remarks} onChange={(event) => setP2Field('remarks', event.target.value)} className={formTextareaClass} /></div>

          <div className="md:col-span-2"><label className={formLabelClass}>Site &amp; Billing Address</label><textarea value={p2.siteBillingAddress} onChange={(event) => setP2Field('siteBillingAddress', event.target.value)} className={`${formTextareaClass} min-h-[150px]`} /></div>

          <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className={formLabelClass}>Documents Required</label>
            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              {DOCUMENT_REQUIRED_OPTIONS.map((doc) => (
                <label key={doc} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-medium text-slate-700">
                  <Checkbox checked={selectedDocsFromText(p2.documentsRequired).has(doc)} onCheckedChange={(checked) => toggleRequiredDoc(doc, Boolean(checked))} />
                  {doc}
                </label>
              ))}
            </div>
            <textarea value={p2.documentsRequired} onChange={(event) => setP2Field('documentsRequired', event.target.value)} className={formTextareaClass} />
          </div>

        </div>

        <div className="overflow-x-auto p-5">
          <table className="w-full min-w-[760px] table-auto border-collapse text-sm">
            <colgroup><col className="w-[9%]" /><col className="w-[24%]" /><col className="w-[67%]" /></colgroup>
            <thead>
              <tr className="bg-[#0D3A35] text-white">
                <th className="border-r border-white/20 px-3 py-3 text-center text-xs font-bold uppercase tracking-wider">S. No.</th>
                <th className="border-r border-white/20 px-3 py-3 text-center text-xs font-bold uppercase tracking-wider">Particulars</th>
                <th className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody>
              {editCommercialClauseRows.map((row) => (
                <tr key={row.no} className="border-b border-slate-200 bg-white last:border-b-0">
                  <td className="border-r border-slate-200 bg-slate-50 px-3 py-4 text-center align-middle font-bold text-slate-500">{row.no})</td>
                  <td className="border-r border-slate-200 bg-slate-50 px-4 py-4 align-middle font-bold text-slate-700">{row.particular}</td>
                  <td className="px-4 py-4 align-top">{row.detail}</td>
                </tr>
              ))}
              {(Array.isArray(p1.customFields) ? p1.customFields : []).map((field, index) => (
                <tr key={field.id} className="border-b border-slate-200 bg-white last:border-b-0">
                  <td className="border-r border-slate-200 bg-slate-50 px-3 py-3 text-center align-middle font-bold text-slate-500">{15 + index})</td>
                  <td className="border-r border-slate-200 bg-slate-50 px-3 py-3 align-middle">
                    <Input
                      value={field.label}
                      onChange={(event) => updateCustomField(field.id, { label: event.target.value })}
                      placeholder="Enter particulars"
                      className={`${formInputClass} h-11 bg-white font-semibold`}
                    />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex items-start gap-3">
                      <textarea
                        value={field.value}
                        onChange={(event) => updateCustomField(field.id, { value: event.target.value })}
                        placeholder="Enter commercial term details"
                        className={`${formTextareaClass} min-h-[72px] flex-1`}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => removeCustomField(field.id)}
                        className="mt-0 shrink-0 rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={addCustomField}
              className="rounded-xl border-[#0D3A35] text-[#0D3A35] hover:bg-[#0D3A35] hover:text-white"
            >
              + Add Commercial Term Row
            </Button>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50 p-5">
          <div className="mb-4">
            <h3 className="font-bold text-slate-900">Delivery of Documents Correspondence</h3>
            <p className="mt-0.5 text-xs text-slate-500">This correspondence is printed immediately after the Commercial Terms table.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className={formLabelClass}>Name of the Company</label><Input value={p2.correspondenceCompanyName} onChange={(event) => setP2Field('correspondenceCompanyName', event.target.value)} className={formInputClass} /></div>
            <div><label className={formLabelClass}>Street</label><Input value={p2.correspondenceStreet} onChange={(event) => setP2Field('correspondenceStreet', event.target.value)} className={formInputClass} /></div>
            <div><label className={formLabelClass}>Area</label><Input value={p2.correspondenceArea} onChange={(event) => setP2Field('correspondenceArea', event.target.value)} className={formInputClass} /></div>
            <div><label className={formLabelClass}>City</label><Input value={p2.correspondenceCity} onChange={(event) => setP2Field('correspondenceCity', event.target.value)} className={formInputClass} /></div>
            <div><label className={formLabelClass}>State</label><Input value={p2.correspondenceState} onChange={(event) => setP2Field('correspondenceState', event.target.value)} className={formInputClass} /></div>
            <div><label className={formLabelClass}>Pin</label><Input value={p2.correspondencePin} onChange={(event) => setP2Field('correspondencePin', event.target.value)} className={formInputClass} /></div>
            <div><label className={formLabelClass}>Contact Person</label><Input value={p2.correspondenceContactPerson} onChange={(event) => setP2Field('correspondenceContactPerson', event.target.value)} className={formInputClass} /></div>
            <div><label className={formLabelClass}>Phone No.</label><Input value={p2.correspondencePhone} onChange={(event) => setP2Field('correspondencePhone', event.target.value)} className={formInputClass} /></div>
            <div className="md:col-span-2"><label className={formLabelClass}>Acknowledgement</label><textarea value={p2.correspondenceAcknowledgement} onChange={(event) => setP2Field('correspondenceAcknowledgement', event.target.value)} className={`${formTextareaClass} min-h-[96px]`} /></div>
            <div className="md:col-span-2"><label className={formLabelClass}>Acceptance Terms</label><textarea value={p2.correspondenceAcceptance} onChange={(event) => setP2Field('correspondenceAcceptance', event.target.value)} className={`${formTextareaClass} min-h-[150px]`} /></div>
          </div>
        </div>
      </section>

      <section style={{ order: 3 }}>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <h3 className="font-bold text-slate-900">PO Covering Letter</h3>
            <p className="mt-0.5 text-xs text-slate-500">Enter the attention, project, subject and formal order communication shown on the Purchase Order.</p>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div><label className={formLabelClass}>Kind Attention</label><Input value={p1.coverKindAttention || ''} onChange={(event) => setP1Field('coverKindAttention', event.target.value)} placeholder="Mr. / Ms. and designation" className={formInputClass} /></div>
            <div><label className={formLabelClass}>Project</label><Input value={p1.coverProject || ''} onChange={(event) => setP1Field('coverProject', event.target.value)} placeholder="Project name" className={formInputClass} /></div>
            <div className="sm:col-span-2"><label className={formLabelClass}>Subject</label><Input value={p1.coverSubject || ''} onChange={(event) => setP1Field('coverSubject', event.target.value)} placeholder="Purchase Order for supply of..." className={formInputClass} /></div>
            <div className="sm:col-span-2"><label className={formLabelClass}>Salutation</label><Input value={p1.coverSalutation || ''} onChange={(event) => setP1Field('coverSalutation', event.target.value)} placeholder="Dear Sir," className={formInputClass} /></div>
            <div className="sm:col-span-2"><label className={formLabelClass}>Order Introduction</label><textarea value={p1.coverOrderIntroduction || ''} onChange={(event) => setP1Field('coverOrderIntroduction', event.target.value)} placeholder="Kindly consider this as our official order..." className={`${formTextareaClass} min-h-[100px]`} /></div>
            <div className="sm:col-span-2"><label className={formLabelClass}>Commercial Reference / Order Paragraph</label><textarea value={p1.coverCommercialReference || ''} onChange={(event) => setP1Field('coverCommercialReference', event.target.value)} placeholder="With reference to various discussions held with the supplier..." className={`${formTextareaClass} min-h-[130px]`} /></div>
          </div>
        </div>
      </section>

      <section style={{ order: 5 }} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <h3 className="font-bold text-slate-900">Authorization</h3>
          <p className="mt-0.5 text-xs text-slate-500">Signatory details shown after the item table in the Draft PO.</p>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <div><label className={formLabelClass}>Prepared By</label><Input value={p1.preparedBy} onChange={(event) => setP1Field('preparedBy', event.target.value)} className={formInputClass} /></div>
          <div><label className={formLabelClass}>Vendor Authorized Signatory</label><Input value={p1.verifiedBy} onChange={(event) => setP1Field('verifiedBy', event.target.value)} className={formInputClass} /></div>
          <div><label className={formLabelClass}>Buyer Authorized Signatory</label><Input value={p1.approvedBy} onChange={(event) => setP1Field('approvedBy', event.target.value)} className={formInputClass} /></div>
        </div>
      </section>

      <section style={{ order: 7 }} className="overflow-hidden rounded-2xl border border-slate-300 bg-[#252827] shadow-xl">
        <style>{ANNEXURE_RICH_TEXT_CSS}</style>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {customAnnexures.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => {
                  syncAnnexureEditor();
                  setSelectedAnnexureIndex(index);
                  savedAnnexureRangeRef.current = null;
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${selectedAnnexureIndex === index ? 'border-[#0D3A35] bg-[#0D3A35] text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-[#7fa89e]'}`}
              >
                Annexure {index + 1}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {selectedAnnexureIndex > 0 ? <Button type="button" size="sm" variant="outline" onClick={removeSelectedAnnexure} className="h-8 border-red-200 text-xs text-red-600 hover:bg-red-50">Remove Annexure</Button> : null}
            <Button type="button" size="sm" onClick={addCustomAnnexure} className="h-8 bg-[#0D3A35] text-xs text-white hover:bg-[#174f48]">+ Add Annexure</Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-b border-white/10 bg-[#202322] px-4 py-2 text-white">
          <div className="flex items-center gap-1 text-xs">
            <button type="button" title="Undo last change, including colour or highlight" aria-label="Undo last Annexure change" onMouseDown={(event) => { event.preventDefault(); undoAnnexureChange(); }} className="rounded px-2 py-1 text-white/75 hover:bg-white/10 hover:text-white">↶</button>
            <button type="button" title="Redo last change, including colour or highlight" aria-label="Redo last Annexure change" onMouseDown={(event) => { event.preventDefault(); redoAnnexureChange(); }} className="rounded px-2 py-1 text-white/75 hover:bg-white/10 hover:text-white">↷</button>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
            <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-black">W</span>
            <Input value={activeCustomAnnexure.annexureTitle} onChange={(event) => setP3Field('annexureTitle', event.target.value)} className="h-8 max-w-lg border-white/10 bg-transparent text-center text-sm font-semibold text-white shadow-none focus-visible:ring-white/30" />
          </div>
          <div className="text-[11px] text-white/60">Annexure document editor</div>
        </div>

        <div className="overflow-hidden border-b border-slate-300 bg-[#f6f7f7] px-2 py-2 text-slate-700">
          <div className="grid w-full grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-stretch gap-1.5">
            <div className="flex min-h-[64px] min-w-0 flex-col justify-between border-r border-slate-300 pr-2">
              <div className="text-center text-[9px] font-bold uppercase tracking-wider text-[#0D3A35]">Clipboard</div>
              <div className="flex flex-wrap items-center justify-center gap-1">
                <button type="button" title="Paste" onClick={async () => { try { appendAnnexureHtml((await navigator.clipboard.readText()).replace(/\n/g, '<br>')); } catch { showTemporaryError('Clipboard access was not available'); } }} className="h-8 rounded border border-slate-300 bg-white px-3 text-xs hover:bg-slate-100">Paste</button>
                <button type="button" title="Cut selected content" onMouseDown={(event) => { event.preventDefault(); runAnnexureCommand('cut'); }} className="h-8 rounded border border-slate-300 bg-white px-3 text-xs hover:bg-slate-100">Cut</button>
                <button type="button" title="Copy selected content" onMouseDown={(event) => { event.preventDefault(); runAnnexureCommand('copy'); }} className="h-8 rounded border border-slate-300 bg-white px-3 text-xs hover:bg-slate-100">Copy</button>
              </div>
            </div>

            <div className="flex min-h-[64px] min-w-0 flex-col justify-between border-r border-slate-300 px-1">
              <div className="text-center text-[9px] font-bold uppercase tracking-wider text-[#0D3A35]">Formatting</div>
              <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5">
                <select value={annexureFontName} onMouseDown={captureAnnexureSelection} onChange={(event) => { setAnnexureFontName(event.target.value); runAnnexureCommand('fontName', event.target.value); }} className="h-8 w-24 rounded border border-slate-300 bg-white px-1.5 text-[10px]"><option>Times New Roman</option><option>Arial</option><option>Calibri</option><option>Georgia</option><option>Courier New</option></select>
                <select value={annexureFontSize} onMouseDown={captureAnnexureSelection} onChange={(event) => { const next = event.target.value; setAnnexureFontSize(next); const sizeMap: Record<string, string> = { '8': '1', '10': '2', '11': '2', '12': '3', '14': '4', '16': '4', '18': '5', '24': '6', '32': '7' }; runAnnexureCommand('fontSize', sizeMap[next] || '3'); }} className="h-8 w-12 rounded border border-slate-300 bg-white px-0.5 text-center text-[10px]">{['8', '10', '11', '12', '14', '16', '18', '24', '32'].map((size) => <option key={size}>{size}</option>)}</select>
                {[['B', 'bold'], ['I', 'italic'], ['U', 'underline'], ['S̶', 'strikeThrough'], ['x₂', 'subscript'], ['x²', 'superscript']].map(([label, command]) => <button key={command} type="button" title={command} onMouseDown={(event) => { event.preventDefault(); runAnnexureCommand(command); }} className="h-8 min-w-6 rounded px-0.5 text-[11px] font-semibold hover:bg-white">{label}</button>)}
                <span className="mx-0.5 h-6 w-px shrink-0 bg-slate-300" aria-hidden="true" />
                <div className="flex items-center gap-0.5" role="group" aria-label="Font colour">
                  <button type="button" title="Apply selected font colour" onMouseDown={(event) => { event.preventDefault(); captureAnnexureSelection(); applyAnnexureColor('text', annexureTextColor); }} className="flex h-8 w-6 items-center justify-center rounded border border-slate-300 border-b-[3px] bg-white text-xs font-bold hover:bg-slate-50" style={{ borderBottomColor: annexureTextColor }}>A</button>
                  <input type="color" title="Choose font colour" aria-label="Choose font colour" value={annexureTextColor} onChange={(event) => setAnnexureTextColor(event.target.value)} className="h-8 w-6 cursor-pointer rounded border border-slate-300 bg-white p-0.5" />
                </div>
                <span className="mx-0.5 h-6 w-px shrink-0 bg-slate-300" aria-hidden="true" />
                <div className="flex items-center gap-0.5" role="group" aria-label="Text highlight">
                  <button type="button" title="Apply selected highlight colour" onMouseDown={(event) => { event.preventDefault(); captureAnnexureSelection(); applyAnnexureColor('highlight', annexureHighlightColor); }} className="flex h-8 w-6 items-center justify-center rounded border border-slate-300 text-[9px] hover:brightness-95" style={{ backgroundColor: annexureHighlightColor }}>▰</button>
                  <input type="color" title="Choose highlight colour" aria-label="Choose highlight colour" value={annexureHighlightColor} onChange={(event) => setAnnexureHighlightColor(event.target.value)} className="h-8 w-6 cursor-pointer rounded border border-slate-300 bg-white p-0.5" />
                  <button type="button" title="Remove highlight from selected text" aria-label="Remove highlight" onMouseDown={(event) => { event.preventDefault(); captureAnnexureSelection(); applyAnnexureColor('highlight', '#ffffff'); }} className="flex h-8 w-7 items-center justify-center rounded border border-slate-300 bg-white text-[9px] font-bold text-slate-600 hover:bg-slate-100">H×</button>
                </div>
              </div>
            </div>

            <div className="flex min-h-[64px] min-w-0 flex-col justify-between pr-1">
              <div className="text-center text-[9px] font-bold uppercase tracking-wider text-[#0D3A35]">Paragraph</div>
              <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5">
                <button type="button" title="Bulleted list" onMouseDown={(event) => { event.preventDefault(); runAnnexureCommand('insertUnorderedList'); }} className="h-8 rounded px-2 text-xs hover:bg-white">• List</button>
                <button type="button" title="Numbered list" onMouseDown={(event) => { event.preventDefault(); runAnnexureCommand('insertOrderedList'); }} className="h-8 rounded px-2 text-xs hover:bg-white">1. List</button>
                <button type="button" title="Decrease indent" onMouseDown={(event) => { event.preventDefault(); runAnnexureCommand('outdent'); }} className="h-8 w-8 rounded text-xs hover:bg-white">⇤</button>
                <button type="button" title="Increase indent" onMouseDown={(event) => { event.preventDefault(); runAnnexureCommand('indent'); }} className="h-8 w-8 rounded text-xs hover:bg-white">⇥</button>
                {[["≡", 'justifyLeft', 'Align left'], ['≡', 'justifyCenter', 'Centre'], ['≡', 'justifyRight', 'Align right'], ['☰', 'justifyFull', 'Justify']].map(([label, command, title], index) => <button key={command} type="button" title={title} onMouseDown={(event) => { event.preventDefault(); runAnnexureCommand(command); }} className={`h-8 w-8 rounded text-sm hover:bg-white ${index === 1 ? 'text-center' : index === 2 ? 'text-right' : ''}`}>{label}</button>)}
              </div>
            </div>

            <div className="flex min-h-[64px] min-w-0 flex-col justify-between border-r border-t border-slate-300 px-1 pt-2">
              <div className="text-center text-[9px] font-bold uppercase tracking-wider text-[#0D3A35]">Insert</div>
              <div className="flex flex-wrap items-center justify-center gap-1">
                <Input value={annexureFieldLabel} onChange={(event) => setAnnexureFieldLabel(event.target.value)} placeholder="Field label" aria-label="Annexure field label" className="h-8 w-24 rounded-md bg-white text-[10px]" />
                <Button type="button" onClick={addAnnexureField} className="h-8 bg-[#0D3A35] px-2 text-[10px]">Add</Button>
                <Input aria-label="Table rows" title="Table rows" type="number" min={1} max={20} value={annexureTableRows} onChange={(event) => setAnnexureTableRows(Number(event.target.value))} className="h-8 w-10 rounded-md bg-white px-1 text-center text-[10px]" /><span className="text-[10px]">×</span><Input aria-label="Table columns" title="Table columns" type="number" min={1} max={10} value={annexureTableColumns} onChange={(event) => setAnnexureTableColumns(Number(event.target.value))} className="h-8 w-10 rounded-md bg-white px-1 text-center text-[10px]" />
                <Button type="button" onClick={addAnnexureTable} className="h-8 bg-[#0D3A35] px-2 text-[10px]">Table</Button>
                <Button type="button" variant="outline" onMouseDown={(event) => { event.preventDefault(); runAnnexureCommand('insertHorizontalRule'); }} className="h-8 px-2 text-[10px]">Divider</Button>
              </div>
            </div>

            <div className="flex min-h-[64px] min-w-0 flex-col justify-between border-r border-t border-slate-300 px-1 pt-2">
              <div className="text-center text-[9px] font-bold uppercase tracking-wider text-[#0D3A35]">Layout</div>
              <div className="flex flex-wrap items-center justify-center gap-1">
                <Button type="button" variant="outline" onMouseDown={(event) => { event.preventDefault(); runAnnexureCommand('removeFormat'); }} className="h-8 px-3 text-xs">Clear Style</Button>
                {(['normal', 'narrow', 'wide'] as const).map((margin) => <button key={margin} type="button" title={`${margin} page margins`} onClick={() => setP3Field('marginPreset', margin)} className={`h-8 rounded border px-3 text-[10px] font-semibold capitalize ${activeCustomAnnexure.marginPreset === margin ? 'border-[#0D3A35] bg-emerald-50 text-[#0D3A35]' : 'border-slate-300 bg-white'}`}>{margin}</button>)}
              </div>
            </div>

            <div className="flex min-h-[64px] min-w-0 flex-col justify-between border-t border-slate-300 px-1 pt-2">
              <div className="text-center text-[9px] font-bold uppercase tracking-wider text-[#0D3A35]">Page Setup</div>
              <div className="flex flex-wrap items-center justify-center gap-1">
                <Button type="button" variant="outline" onClick={() => appendAnnexureHtml('<p style="page-break-before: always;"><br></p>')} className="h-8 px-3 text-xs">Page Break</Button>
                <span className="whitespace-nowrap rounded border border-slate-300 bg-white px-3 py-2 text-[10px] font-semibold">A4 Portrait</span>
              </div>
            </div>
          </div>
        </div>

        {annexureCellSelected ? <div className="flex flex-wrap items-center justify-center gap-1.5 border-b border-[#3d6862] bg-[#e7f3ef] px-4 py-2"><span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-[#0D3A35]">Table Layout</span><Button type="button" size="sm" variant="outline" onClick={mergeAnnexureCellRight} className="h-8 bg-white px-2 text-[10px]">Merge Right</Button><Button type="button" size="sm" variant="outline" onClick={mergeAnnexureCellBelow} className="h-8 bg-white px-2 text-[10px]">Merge Below</Button><Button type="button" size="sm" variant="outline" onClick={unmergeAnnexureCell} className="h-8 bg-white px-2 text-[10px]">Unmerge</Button><span className="mx-1 h-6 w-px bg-[#9bbab5]" aria-hidden="true" /><span className="text-[10px] font-semibold text-[#0D3A35]">Width</span>{(['50%', '75%', '100%'] as const).map((width) => <Button key={width} type="button" size="sm" variant="outline" onClick={() => transformAnnexureTable(width)} className="h-8 bg-white px-2 text-[10px]">{width}</Button>)}<span className="mx-1 h-6 w-px bg-[#9bbab5]" aria-hidden="true" /><span className="text-[10px] font-semibold text-[#0D3A35]">Align</span><Button type="button" size="sm" variant="outline" onClick={() => alignAnnexureTable('left')} className="h-8 w-8 bg-white p-0 text-xs" title="Align table left">L</Button><Button type="button" size="sm" variant="outline" onClick={() => alignAnnexureTable('center')} className="h-8 w-8 bg-white p-0 text-xs" title="Centre table">C</Button><Button type="button" size="sm" variant="outline" onClick={() => alignAnnexureTable('right')} className="h-8 w-8 bg-white p-0 text-xs" title="Align table right">R</Button><span className="ml-2 text-[10px] text-[#416c66]">Drag the table’s bottom-right handle for a custom width.</span></div> : null}

        <div className="overflow-auto bg-[#343837] px-8 py-7">
          <div className="mx-auto mb-1 h-5 w-[794px] max-w-full border-x border-white/20 bg-[repeating-linear-gradient(to_right,transparent_0,transparent_19px,rgba(255,255,255,0.28)_20px)] text-center text-[9px] leading-5 text-white/45">A4 · 210 mm</div>
          <div
            ref={annexureEditorRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Annexure 1 document editor"
            onClick={(event) => { selectAnnexureTableCell(event.target); captureAnnexureSelection(); }}
            onMouseUp={() => { captureAnnexureSelection(); syncAnnexureEditor(); }}
            onPointerUp={() => { captureAnnexureSelection(); syncAnnexureEditor(); }}
            onKeyUp={captureAnnexureSelection}
            onInput={syncAnnexureEditor}
            onBlur={syncAnnexureEditor}
            onPaste={(event) => { event.preventDefault(); const clipboardHtml = event.clipboardData.getData('text/html'); const clipboardText = event.clipboardData.getData('text/plain'); document.execCommand('insertHTML', false, clipboardHtml ? sanitizeAnnexureHtml(clipboardHtml) : clipboardText.replace(/\n/g, '<br>')); syncAnnexureEditor(); }}
            className="annexure-rich-editor mx-auto min-h-[1123px] max-w-none bg-white text-[12pt] leading-[1.5] text-slate-950 shadow-2xl outline-none"
            style={{ width: '794px', padding: annexurePagePadding, fontFamily: annexureFontName, zoom: annexureZoom / 100 }}
          />
        </div>

        <div className="flex items-center justify-between border-t border-white/10 bg-[#202322] px-4 py-2 text-[11px] text-white/70"><div className="flex gap-5"><span>Page 1</span><span>{activeAnnexureWordCount} words</span><span>English (India)</span><span>Accessibility: Good to go</span></div><div className="flex items-center gap-2"><button type="button" onClick={() => setAnnexureZoom((value) => Math.max(60, value - 10))} className="h-6 w-6 rounded hover:bg-white/10">−</button><input type="range" min={60} max={140} step={10} value={annexureZoom} onChange={(event) => setAnnexureZoom(Number(event.target.value))} className="w-28 accent-emerald-500" /><button type="button" onClick={() => setAnnexureZoom((value) => Math.min(140, value + 10))} className="h-6 w-6 rounded hover:bg-white/10">+</button><span className="w-10 text-right">{annexureZoom}%</span></div></div>
      </section>

      <section style={{ order: 8 }} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <h3 className="font-bold text-slate-900">Annexure - {legalAnnexureNumber}</h3>
          <p className="mt-0.5 text-xs text-slate-500">Complete General Terms and Conditions attached to the Purchase Order.</p>
        </div>
        <div className="grid gap-4 p-5">
          <div><label className={formLabelClass}>Annexure Title</label><Input value={withAnnexureNumber(p4.annexureTitle, defaultPage4().annexureTitle, legalAnnexureNumber)} onChange={(event) => setP4Field('annexureTitle', event.target.value)} className={formInputClass} /></div>
          <div>
            <label className={formLabelClass}>General Terms and Conditions</label>
            <textarea value={effectiveAnnexureTerms} onChange={(event) => setP4Field('termsText', event.target.value)} className={`${formTextareaClass} min-h-[520px] font-serif leading-5`} />
          </div>
        </div>
      </section>
    </div>
  );

  const renderPoReportHeader = (title: string, subtitle?: string, compact = false) => (
    <div className={compact ? 'mb-2' : 'mb-4'}>
      <div className={compact ? 'px-3 pb-1.5 text-center' : 'px-4 pb-3 pt-1 text-center'}>
        <img src={logoUrl} alt="Sai Bioresources" className={`mx-auto object-contain ${compact ? 'h-8 w-8' : 'h-14 w-14'}`} />
        <div className={`mt-1 font-black uppercase tracking-[0.03em] text-slate-900 ${compact ? 'text-[12px]' : 'text-[18px]'}`}>{DUMMY_COMPANY.name}</div>
        <div className={`mt-0.5 text-slate-600 ${compact ? 'text-[6px] leading-3' : 'text-[9px] leading-4'}`}>{DUMMY_COMPANY.line1}</div>
        <div className={`text-slate-600 ${compact ? 'text-[6px] leading-3' : 'text-[9px] leading-4'}`}>{DUMMY_COMPANY.line2}</div>
      </div>
      <div className={compact ? 'h-[2px] bg-[#0D3A35]' : 'h-[3px] bg-[#0D3A35]'} />
      <div className={`bg-[#0D3A35] text-center font-extrabold uppercase text-white ${compact ? 'mt-1 px-3 py-1.5 text-[9px] tracking-[0.14em]' : 'mt-2 px-4 py-2.5 text-[13px] tracking-[0.22em]'}`}>{title}</div>
      {subtitle ? <div className={`border-x border-b border-slate-300 bg-slate-50 text-center font-semibold uppercase tracking-[0.1em] text-slate-500 ${compact ? 'px-2 py-1 text-[6px]' : 'px-3 py-1.5 text-[9px]'}`}>{subtitle}</div> : null}
    </div>
  );

  const renderPoSectionHeader = (title: string, subtitle?: string, compact = false) => (
    <div className={compact ? 'mb-2' : 'mb-4'}>
      <div className={`bg-[#0D3A35] text-center font-extrabold uppercase text-white ${compact ? 'px-3 py-1.5 text-[9px] tracking-[0.14em]' : 'px-4 py-2.5 text-[13px] tracking-[0.22em]'}`}>
        {title}
      </div>
      {subtitle ? (
        <div className={`border-x border-b border-slate-300 bg-slate-50 text-center font-semibold uppercase tracking-[0.1em] text-slate-500 ${compact ? 'px-2 py-1 text-[6px]' : 'px-3 py-1.5 text-[9px]'}`}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );

  const renderPoReportFooter = (pageNumber: number, label: string) => (
    <div className="mt-5 grid grid-cols-3 border-t border-slate-300 pt-2 text-[8px] text-slate-500">
      <span>System-generated Purchase Order</span>
      <span className="text-center">PO No.: {effectivePoNo || 'Draft'}{amendmentLabel ? ` · ${amendmentLabel}` : ''}</span>
      <span className="text-right">{label} · Page {pageNumber} of {totalReportPages}</span>
    </div>
  );

  const renderCommercialTermsPage = (reportPageNumber: number) => {
    const termsPageIndex = Math.max(0, reportPageNumber - 2);
    const rows = commercialTermPages[termsPageIndex] || [];
    const continued = termsPageIndex > 0;
    const isFinalTermsPage = termsPageIndex === commercialTermPages.length - 1;
    return (
      <div className="po-report-sheet po-terms-report-sheet po-draft-font-11 mx-auto flex h-[1123px] min-h-[1123px] max-h-[1123px] w-[794px] max-w-full flex-col overflow-hidden border border-slate-300 bg-white p-5 font-sans text-[11px] shadow-sm">
        {renderPoSectionHeader(
          continued ? 'Purchase Order — Terms & Conditions (Continued)' : 'Purchase Order — Terms & Conditions',
          poReferenceLabel
        )}
        {rows.length ? <div className="border border-gray-300">
          <table className="po-terms-table w-full table-fixed border-collapse text-[11px]">
            <colgroup>
              <col className="w-[8%]" />
              <col className="w-[24%]" />
              <col className="w-[68%]" />
            </colgroup>
            <thead>
              <tr className="bg-[#0D3A35] text-white">
                <th className="border-r border-[#315d58] px-3 py-2 text-center font-bold">S. No.</th>
                <th className="border-r border-[#315d58] px-3 py-2 text-center font-bold">Particulars</th>
                <th className="px-3 py-2 text-center font-bold">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.no}-${termsPageIndex}-${index}`} className="bg-white">
                  <td className="border-r border-t border-gray-300 bg-gray-100 px-3 py-2 text-center align-middle font-semibold text-gray-600">
                    {row.no})
                  </td>
                  <td className="border-r border-t border-gray-300 bg-gray-100 px-3 py-2 align-middle font-semibold text-gray-600">
                    {row.particular}{row.continued ? ' (Continued)' : ''}
                  </td>
                  <td className="whitespace-pre-wrap border-t border-gray-300 px-3 py-2 align-top leading-5 text-gray-900">
                    {row.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div> : null}
        {isFinalTermsPage ? renderDocumentCorrespondenceBlock() : null}
        <div className="mt-auto">{renderPoReportFooter(reportPageNumber, continued ? 'Terms & Conditions — Continued' : 'Terms & Conditions')}</div>
      </div>
    );
  };

  const renderDocumentCorrespondenceBlock = () => {
    const correspondenceRows = [
      ['Name of the Company', p2.correspondenceCompanyName],
      ['Street', p2.correspondenceStreet],
      ['Area', p2.correspondenceArea],
      ['City', p2.correspondenceCity],
      ['State', p2.correspondenceState],
      ['Pin', p2.correspondencePin],
      ['Contact Person', p2.correspondenceContactPerson],
      ['Phone No.', p2.correspondencePhone],
    ];

    return (
      <Fragment>
        <div className="mt-4 border border-slate-300 px-5 py-4 text-[11px] text-slate-900">
          <h3 className="mb-3 text-[12px] font-extrabold uppercase underline underline-offset-2">
            Delivery of Documents Correspondence:
          </h3>
          <div className="grid grid-cols-[145px_12px_minmax(0,1fr)] gap-y-1 leading-5">
            {correspondenceRows.map(([label, value]) => (
              <Fragment key={label}>
                <span className="font-semibold">{label}</span>
                <span className="text-center">:</span>
                <span className="break-words">{safe(value) || 'Not Recorded'}</span>
              </Fragment>
            ))}
          </div>
          <p className="mt-6 whitespace-pre-wrap text-justify leading-5">
            {safe(p2.correspondenceAcknowledgement) || 'Not Recorded'}
          </p>
          <p className="mt-6 whitespace-pre-wrap text-justify italic leading-5">
            {safe(p2.correspondenceAcceptance) || 'Not Recorded'}
          </p>
        </div>
        <div className="ml-auto mt-5 w-[46%] text-right text-[11px] text-slate-900">
          <div className="mb-2 flex h-[58px] items-end justify-end gap-2">
            {authorizedSealAttachedAt ? (
              <>
                <img src={authorizedSealUrl} alt="Buyer seal" className="h-14 w-14 object-contain" />
                <img
                  src={signatureSvgDataUri(authorizedSignatureText)}
                  alt="Buyer digital signature"
                  className="h-10 w-auto max-w-[220px] object-contain"
                />
              </>
            ) : null}
          </div>
          <div className="mb-1 font-bold">For, {p1.buyerCompanyName || DUMMY_COMPANY.name}</div>
          <div className="border-t border-slate-400 pt-1 font-semibold">
            {safe(p1.approvedBy) || 'Authorized Signatory'}
          </div>
        </div>
      </Fragment>
    );
  };

  const reportPageLabel = (pageNumber: number) => {
    if (pageNumber === 1) return 'Purchase Order';
    if (pageNumber < customAnnexureStartPage) {
      return pageNumber === 2 ? 'Terms & Conditions' : 'Terms & Conditions — Continued';
    }
    if (pageNumber === legalReportPage) return `Annexure - ${legalAnnexureNumber}`;
    const annexurePage = annexureReportPages[pageNumber - customAnnexureStartPage];
    if (!annexurePage) return 'Annexure';
    return `Annexure - ${annexurePage.annexureNumber}${annexurePage.pageIndex ? ' — Continued' : ''}`;
  };

  const renderPageContent = (p: number) =>
    p === 1 ? (
      <div className="po-report-sheet po-draft-font-11 mx-auto min-h-[1123px] w-[794px] max-w-full border border-slate-300 bg-white p-5 font-sans text-[11px] shadow-sm">
        {renderPoReportHeader(effectiveAmendmentNo > 0 ? `Purchase Order — ${amendmentLabel}` : 'Purchase Order', 'Commercial order and supply details')}

        {/* ── PO REFERENCE BLOCK ── */}
        <div className="mb-4 grid grid-cols-2 border-l border-t border-slate-300 sm:grid-cols-4">
          {[
            ['PO Number', `${effectivePoNo || 'Draft'}${amendmentLabel ? ` · ${amendmentLabel}` : ''}`],
            ['PO Date', p1.poDate || '—'],
            ['Vendor Code', resolvedVendorId || '—'],
            ['Cluster', selectedCluster ? safe(selectedCluster?.cluster_name) || safe(selectedCluster?.name) || safe(selectedCluster?.cluster_id) || safe(selectedCluster?.id) : p1.clusterId || '—'],
          ].map(([label, value]) => (
            <div key={label} className="border-b border-r border-slate-300 px-3 py-2.5">
              <div className="text-[8px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</div>
              <div className="mt-1 break-words text-[11px] font-bold text-slate-900">{value}</div>
            </div>
          ))}
        </div>

        {/* ── SUPPLIER / BUYER REGISTERED DETAILS ── */}
        <div className="grid grid-cols-2 gap-0 border border-gray-300 mb-4">
          <div className="border-r border-gray-300">
            <div className="bg-[#0D3A35] py-1.5 text-center text-[10px] font-bold tracking-widest text-white">
              SUPPLIER DETAILS
            </div>
            <div className="min-h-[210px] p-3 text-[11px] leading-5 text-gray-900">
              <div className="grid min-h-5 grid-cols-[92px_minmax(0,1fr)] gap-x-2"><span className="font-semibold text-gray-700">Supplier’s Name:</span><span>{p1.vendorName || vendorNameFromComparative || '—'}</span></div>
              <div className="grid min-h-[42px] grid-cols-[92px_minmax(0,1fr)] items-start gap-x-2"><span className="font-semibold text-gray-700">Address:</span><span className="whitespace-pre-wrap">{p1.vendorAddr1 || '—'}</span></div>
              <div className="grid min-h-5 grid-cols-[92px_minmax(0,1fr)] gap-x-2"><span className="font-semibold text-gray-700">GSTIN:</span><span>{p1.vendorVatRegnNo || '—'}</span></div>
              <div className="grid min-h-5 grid-cols-[92px_minmax(0,1fr)] gap-x-2"><span className="font-semibold text-gray-700">PAN:</span><span>{p1.vendorPan || '—'}</span></div>
              <div className="grid min-h-5 grid-cols-[92px_minmax(0,1fr)] gap-x-2"><span className="font-semibold text-gray-700">Name:</span><span>{p1.vendorContactName || '—'}</span></div>
              <div className="grid min-h-5 grid-cols-[92px_minmax(0,1fr)] gap-x-2"><span className="font-semibold text-gray-700">Mobile Number:</span><span>{p1.vendorMobile || '—'}</span></div>
              <div className="grid min-h-5 grid-cols-[92px_minmax(0,1fr)] gap-x-2"><span className="font-semibold text-gray-700">Email:</span><span className="break-all">{p1.vendorEmail || '—'}</span></div>
            </div>
          </div>

          <div>
            <div className="bg-[#0D3A35] py-1.5 text-center text-[10px] font-bold tracking-widest text-white">
              BUYER DETAILS
            </div>
            <div className="min-h-[210px] p-3 text-[11px] leading-5 text-gray-900">
              <div className="grid min-h-5 grid-cols-[92px_minmax(0,1fr)] gap-x-2"><span className="font-semibold text-gray-700">Buyer’s Name:</span><span>{p1.buyerCompanyName || DUMMY_COMPANY.name}</span></div>
              <div className="grid min-h-[42px] grid-cols-[92px_minmax(0,1fr)] items-start gap-x-2">
                <span className="font-semibold text-gray-700">Address:</span>
                <span className="whitespace-pre-wrap">
                  {[p1.buyerBuildingNo, p1.buyerRoadStreet, p1.buyerVillage, p1.buyerDistrict, p1.buyerPinCode]
                    .map(safe)
                    .filter(Boolean)
                    .join(', ') || '—'}
                </span>
              </div>
              <div className="grid min-h-5 grid-cols-[92px_minmax(0,1fr)] gap-x-2"><span className="font-semibold text-gray-700">GSTIN:</span><span>{p1.shipToGstNo || '—'}</span></div>
              <div className="grid min-h-5 grid-cols-[92px_minmax(0,1fr)] gap-x-2"><span className="font-semibold text-gray-700">PAN:</span><span>{p1.buyerPan || '—'}</span></div>
              <div className="grid min-h-5 grid-cols-[92px_minmax(0,1fr)] gap-x-2"><span className="font-semibold text-gray-700">Name:</span><span>{p1.shipToContactName || '—'}</span></div>
              <div className="grid min-h-5 grid-cols-[92px_minmax(0,1fr)] gap-x-2"><span className="font-semibold text-gray-700">Mobile Number:</span><span>{p1.shipToTel || '—'}</span></div>
              <div className="grid min-h-5 grid-cols-[92px_minmax(0,1fr)] gap-x-2"><span className="font-semibold text-gray-700">Email:</span><span className="break-all">{p1.shipToEmail || '—'}</span></div>
            </div>
          </div>
        </div>

        {/* ── PO COVERING LETTER ── */}
        <div className="mb-4 border border-gray-300 bg-white p-4 text-[11px] leading-[1.55] text-gray-900">
          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-2">
            <span className="font-bold">Kind Attention:</span>
            <span className="font-semibold">{p1.coverKindAttention || ''}</span>
            <span className="font-bold">Project:</span>
            <span className="font-semibold">{p1.coverProject || ''}</span>
            <span className="font-bold">Sub:</span>
            <span>{p1.coverSubject || ''}</span>
          </div>
          <div className="mt-4 font-bold">{p1.coverSalutation || 'Dear Sir,'}</div>
          <div className="mt-4 whitespace-pre-wrap text-justify">{p1.coverOrderIntroduction || '—'}</div>
          <div className="mt-4 whitespace-pre-wrap text-justify">{p1.coverCommercialReference || '—'}</div>
        </div>

        {/* ── ITEM TABLE ── */}
        <div className="border border-gray-300 mb-4">
          <table className="w-full text-[11px] border-collapse">
            <colgroup>
              <col className="w-16" />
              <col />
              <col className="w-20" />
              <col className="w-16" />
              <col className="w-24" />
              <col className="w-28" />
            </colgroup>
            <thead>
              <tr className="h-10 bg-[#0D3A35] text-white">
                <th className="whitespace-nowrap border-r border-gray-600 px-2 py-1 text-center align-middle font-semibold">S. No.</th>
                <th className="border-r border-gray-600 px-3 py-1 text-center align-middle font-semibold">Item Description</th>
                <th className="border-r border-gray-600 px-2 py-1 text-center align-middle font-semibold">Qty</th>
                <th className="border-r border-gray-600 px-2 py-1 text-center align-middle font-semibold">UOM</th>
                <th className="whitespace-nowrap border-r border-gray-600 px-2 py-1 text-center align-middle font-semibold">Unit Rate</th>
                <th className="px-2 py-1 text-center align-middle font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {(comparative.items || []).map((it: any, idx: number) => {
                const unit = numOr0((qForVendor as any)?.unitRateByItemId?.[it.id]);
                const quantity = numOr0(it.qty);
                const total = quantity * unit;
                const description = safe(it.description) || safe(it.specification);
                return (
                  <tr key={it.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="border-r border-t border-gray-300 px-2 py-2 text-center align-middle">{idx + 1}</td>
                    <td className="border-r border-t border-gray-300 px-3 py-2 align-top">
                      <div className="font-bold text-gray-900">{safe(it.partName) || safe(it.itemName) || '—'}</div>
                      {description ? <div className="mt-1 whitespace-pre-line leading-4 text-gray-600">{description}</div> : null}
                    </td>
                    <td className="border-r border-t border-gray-300 px-2 py-2 text-center align-top tabular-nums">{quantity}</td>
                    <td className="border-r border-t border-gray-300 px-2 py-2 text-center align-top">{safe(it.uom) || '—'}</td>
                    <td className="border-r border-t border-gray-300 px-2 py-2 text-right align-top tabular-nums">{unit ? inr(unit) : '—'}</td>
                    <td className="border-t border-gray-300 px-2 py-2 text-right align-top font-semibold tabular-nums">{unit ? inr(total) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-300 bg-gray-50 font-semibold">
                <td colSpan={5} className="border-r border-gray-300 px-3 py-1.5 text-left">Basic Order Value</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{computedTotals ? inr(computedTotals.base) : '—'}</td>
              </tr>
              <tr className="border-t border-gray-300 bg-gray-50 font-semibold">
                <td colSpan={5} className="border-r border-gray-300 px-3 py-1.5 text-left">GST</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{computedTotals ? inr(computedTotals.tax) : '—'}</td>
              </tr>
              <tr className="border-t border-gray-300 bg-[#e7f3ef] font-black text-[#0D3A35]">
                <td colSpan={5} className="border-r border-gray-300 px-3 py-1.5 text-left">Total Order Value</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{computedTotals ? inr(computedTotals.gross) : '—'}</td>
              </tr>
              <tr className="border-t border-gray-300 bg-white">
                <td colSpan={6} className="px-3 py-2 text-center font-semibold italic text-gray-800">
                  Amount - {amountInIndianWords(computedTotals?.gross || 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── AUTHORISATION ── */}
        <div className="border border-gray-300">
          <div className="bg-[#0D3A35] px-3 py-1.5 text-[10px] font-bold tracking-widest text-white">
            AUTHORISATION
          </div>
          <div className="grid grid-cols-2">
            {([
              [
                'Authorized Signatory of Vendor',
                p1.verifiedBy,
                (v: string) => setP1Field('verifiedBy', v),
                safe(p1.vendorLegalConstitution).toLowerCase() === 'individual'
                  ? `Mr. ${p1.vendorName || vendorNameFromComparative || p1.vendorContactName || '—'}`
                  : `For, ${p1.vendorName || vendorNameFromComparative || '—'}`,
                false,
              ],
              [
                'Authorized Signatory of Buyer',
                p1.approvedBy,
                (v: string) => setP1Field('approvedBy', v),
                `For, ${p1.buyerCompanyName || DUMMY_COMPANY.name}`,
                true,
              ],
            ] as [string, string, (v: string) => void, string, boolean][]).map(([label, val, setter, partyLine, isBuyer], i) => (
              <div key={label} className={`p-3 ${i === 0 ? 'border-r border-gray-300' : ''}`}>
                <div className="mb-2 flex min-h-[23px] items-center justify-end">
                  {isBuyer ? (
                    <button
                      type="button"
                      className="no-print text-[10px] font-semibold tracking-normal px-2 py-0.5 rounded border border-gray-300 text-gray-700 hover:text-gray-900 hover:border-gray-400"
                      onClick={() => setAuthorizedSealAttachedAt(new Date().toISOString())}
                    >
                      Attach seal / sign
                    </button>
                  ) : null}
                </div>

                <div className="h-[60px] flex items-end justify-end gap-2 mb-2">
                  {isBuyer && authorizedSealAttachedAt ? (
                    <>
                      <img src={authorizedSealUrl} alt="Seal" className="h-16 w-16 object-contain" />
                      <img
                        src={signatureSvgDataUri(authorizedSignatureText)}
                        alt="Digital signature"
                        className="h-11 w-auto max-w-[320px] object-contain"
                      />
                    </>
                  ) : null}
                </div>

                <div className="mb-1 text-right text-[11px] font-bold text-gray-900">{partyLine}</div>
                <div className="border-t border-gray-400 pt-1">
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => setter(e.target.value)}
                    placeholder="Authorized Signatory"
                    className="w-full border-none bg-transparent text-right text-[11px] text-gray-900 outline-none placeholder:text-right placeholder:text-gray-400"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        {renderPoReportFooter(1, 'Purchase Order')}
      </div>
    ) : p >= 2 && p < customAnnexureStartPage ? (
      renderCommercialTermsPage(p)
    ) : p === -1 ? (
      <div className="po-report-sheet po-terms-report-sheet po-draft-font-11 mx-auto min-h-[1123px] w-[794px] max-w-full overflow-visible border border-slate-300 bg-white p-5 font-sans text-[11px] shadow-sm">
        {renderPoSectionHeader(`Purchase Order${amendmentLabel ? ` — ${amendmentLabel}` : ''} — Terms & Conditions`, poReferenceLabel)}

        <div className="border border-gray-300">
          <style>{`
            .po-terms-table textarea {
              box-sizing: border-box;
              field-sizing: content;
              height: auto;
              width: 100%;
              max-width: 100%;
              min-height: 24px !important;
              overflow: hidden;
              white-space: pre-wrap;
            }
            .po-terms-table tbody td {
              vertical-align: top;
            }
            .po-terms-table tbody td:first-child,
            .po-terms-table tbody td:nth-child(2) {
              vertical-align: middle;
            }
          `}</style>
          <table className="po-terms-table w-full table-auto border-collapse text-[11px]">
            <colgroup>
              <col className="w-[8%]" />
              <col className="w-[24%]" />
              <col className="w-[68%]" />
            </colgroup>
            <thead>
              <tr className="bg-[#0D3A35] text-white">
                <th className="border-r border-[#315d58] px-3 py-2 text-center font-bold">S. No.</th>
                <th className="border-r border-[#315d58] px-3 py-2 text-center font-bold">Particulars</th>
                <th className="px-3 py-2 text-center font-bold">Details</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white">
                <td className="border-r border-t border-gray-300 bg-gray-100 px-3 py-2.5 text-center font-semibold text-gray-600">1)</td>
                <td className="border-r border-t border-gray-300 bg-gray-100 px-3 py-2.5 font-semibold text-gray-600">Reference</td>
                <td className="border-t border-gray-300 px-3 py-2.5">
                  <div className="grid grid-cols-[78px_minmax(0,1fr)_32px_132px] items-center gap-2">
                    <span className="font-medium text-gray-600">Quotation No.</span>
                    <Input
                      value={p2.supplierFinalQuotationNo}
                      onChange={(e) => setP2Field('supplierFinalQuotationNo', e.target.value)}
                      className="h-8 rounded-md border border-gray-300 bg-white px-2 text-[11px] shadow-none focus-visible:ring-1 focus-visible:ring-[#0D3A35] focus-visible:ring-offset-0 md:text-[11px]"
                      placeholder="e.g. SABCO/20225-26/37"
                    />
                    <span className="font-medium text-gray-600">Date</span>
                    <Input
                      type="date"
                      value={p2.supplierFinalQuotationDate}
                      onChange={(e) => setP2Field('supplierFinalQuotationDate', e.target.value)}
                      className="h-8 rounded-md border border-gray-300 bg-white px-2 text-[11px] shadow-none focus-visible:ring-1 focus-visible:ring-[#0D3A35] focus-visible:ring-offset-0 md:text-[11px]"
                    />
                  </div>
                </td>
              </tr>

              <tr className="bg-white">
                <td className="px-3 py-1.5 text-center border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">2)</td>
                <td className="px-3 py-1.5 border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">Scope of Work</td>
                <td className="px-3 py-1.5 border-t border-gray-300">
                  <textarea
                    value={p2.scopeOfWork}
                    onChange={(e) => setP2Field('scopeOfWork', e.target.value)}
                    className="w-full min-h-[72px] text-[11px] text-gray-900 outline-none resize-none leading-5 bg-transparent border-none p-0 placeholder:text-gray-400"
                    placeholder="Enter scope of work..."
                  />
                </td>
              </tr>

              <tr className="bg-white">
                <td className="px-3 py-1.5 text-center border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">3)</td>
                <td className="px-3 py-1.5 border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">Basis of Price</td>
                <td className="px-3 py-1.5 border-t border-gray-300">
                  <textarea
                    value={p2.basisOfPrice}
                    onChange={(e) => setP2Field('basisOfPrice', e.target.value)}
                    className="w-full min-h-[56px] text-[11px] text-gray-900 outline-none resize-none leading-5 bg-transparent border-none p-0 placeholder:text-gray-400"
                    placeholder="Enter basis of price..."
                  />
                </td>
              </tr>

              <tr className="bg-white">
                <td className="px-3 py-1.5 text-center border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">4)</td>
                <td className="px-3 py-1.5 border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">Taxes</td>
                <td className="px-3 py-1.5 border-t border-gray-300">
                  <div className="no-print mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap text-[10px] text-gray-600">
                        {p2.taxAutoCalcEnabled && (
                          <div className="flex items-center gap-2 flex-wrap px-2 py-1 rounded-none border border-gray-200 bg-gray-50">
                            <span className="text-gray-500">GST</span>
                            <Input
                              value={p2.taxGstPercent}
                              onChange={(e) => setP2Field('taxGstPercent', e.target.value)}
                              inputMode="decimal"
                              className="h-6 text-[10px] w-14 rounded-none border border-gray-200 bg-white shadow-none focus-visible:ring-1 focus-visible:ring-gray-400 focus-visible:ring-offset-0 px-2 py-0 tabular-nums"
                              placeholder="%"
                            />
                            <span className="text-gray-500">Amt</span>
                            <span className="text-gray-700 tabular-nums min-w-[84px] text-right">{computedTotals ? inr(computedTotals.auto.gstAmount) : '—'}</span>

                            <span className="text-gray-300 mx-1">|</span>

                            <span className="text-gray-500">Other</span>
                            <Input
                              value={p2.taxOtherPercent}
                              onChange={(e) => setP2Field('taxOtherPercent', e.target.value)}
                              inputMode="decimal"
                              className="h-6 text-[10px] w-14 rounded-none border border-gray-200 bg-white shadow-none focus-visible:ring-1 focus-visible:ring-gray-400 focus-visible:ring-offset-0 px-2 py-0 tabular-nums"
                              placeholder="%"
                            />
                            <span className="text-gray-500">Amt</span>
                            <span className="text-gray-700 tabular-nums min-w-[84px] text-right">{computedTotals ? inr(computedTotals.auto.otherAmount) : '—'}</span>

                            <span className="text-gray-300 mx-1">|</span>

                            <span className="font-semibold text-gray-800 tabular-nums">Tax</span>
                            <span className="font-semibold text-gray-800 tabular-nums min-w-[92px] text-right">{computedTotals ? inr(computedTotals.auto.taxAmount) : '—'}</span>
                            <span className="text-gray-400">•</span>
                            <span className="text-gray-700 tabular-nums">Gross</span>
                            <span className="text-gray-700 tabular-nums min-w-[92px] text-right">{computedTotals ? inr(computedTotals.gross) : '—'}</span>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setP2Field('taxAutoCalcEnabled', !p2.taxAutoCalcEnabled)}
                        className={`ml-auto inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors shrink-0 ${
                          p2.taxAutoCalcEnabled
                            ? 'bg-gray-100 border-gray-400 text-gray-800'
                            : 'bg-white border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400'
                        }`}
                      >
                        {p2.taxAutoCalcEnabled ? '✦ Auto' : '⊘ Auto'}
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={p2.taxAutoCalcEnabled ? taxesAutoText : p2.taxes}
                    onChange={(e) => setP2Field(p2.taxAutoCalcEnabled ? 'taxes' : 'taxes', e.target.value as any)}
                    className="w-full min-h-[46px] text-[11px] text-gray-900 outline-none resize-none leading-5 bg-transparent border-none p-0 placeholder:text-gray-400"
                    placeholder="Enter taxes terms..."
                  />
                </td>
              </tr>

              <tr className="bg-white">
                <td className="px-3 py-1.5 text-center border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">5)</td>
                <td className="px-3 py-1.5 border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">Delivery Timelines</td>
                <td className="px-3 py-1.5 border-t border-gray-300">
                  <textarea
                    value={p2.deliveryTimelines}
                    onChange={(e) => setP2Field('deliveryTimelines', e.target.value)}
                    className="w-full min-h-[86px] text-[11px] text-gray-900 outline-none resize-none leading-5 bg-transparent border-none p-0 placeholder:text-gray-400"
                    placeholder="Enter delivery timelines..."
                  />
                </td>
              </tr>

              <tr className="bg-white">
                <td className="px-3 py-1.5 text-center border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">6)</td>
                <td className="px-3 py-1.5 border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">Documents</td>
                <td className="px-3 py-1.5 border-t border-gray-300">
                  <textarea
                    value={p2.documents}
                    onChange={(e) => setP2Field('documents', e.target.value)}
                    className="w-full min-h-[92px] text-[11px] text-gray-900 outline-none resize-none leading-5 bg-transparent border-none p-0 placeholder:text-gray-400"
                    placeholder="Enter documents / approvals requirements..."
                  />
                </td>
              </tr>

              <tr className="bg-white">
                <td className="px-3 py-1.5 text-center border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">7)</td>
                <td className="px-3 py-1.5 border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">Payment Terms</td>
                <td className="px-3 py-1.5 border-t border-gray-300">
                  <textarea
                    value={p2.paymentAutoEnabled ? paymentAutoText : p2.paymentTerms}
                    onChange={(e) => setP2Field('paymentTerms', e.target.value as any)}
                    className="w-full min-h-[120px] text-[11px] text-gray-900 outline-none resize-none leading-5 bg-transparent border-none p-0 placeholder:text-gray-400"
                    placeholder="Enter payment terms..."
                  />
                </td>
              </tr>

              <tr className="bg-white">
                <td className="px-3 py-1.5 text-center border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">8)</td>
                <td className="px-3 py-1.5 border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">Installation Support</td>
                <td className="px-3 py-1.5 border-t border-gray-300">
                  <textarea
                    value={p2.installationSupport}
                    onChange={(e) => setP2Field('installationSupport', e.target.value)}
                    className="w-full min-h-[52px] text-[11px] text-gray-900 outline-none resize-none leading-5 bg-transparent border-none p-0 placeholder:text-gray-400"
                    placeholder="Enter installation / support terms..."
                  />
                </td>
              </tr>

              <tr className="bg-white">
                <td className="px-3 py-1.5 text-center border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">9)</td>
                <td className="px-3 py-1.5 border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">Inspection</td>
                <td className="px-3 py-1.5 border-t border-gray-300">
                  <textarea
                    value={p2.inspection}
                    onChange={(e) => setP2Field('inspection', e.target.value)}
                    className="w-full min-h-[60px] text-[11px] text-gray-900 outline-none resize-none leading-5 bg-transparent border-none p-0 placeholder:text-gray-400"
                    placeholder="Enter inspection terms..."
                  />
                </td>
              </tr>

              <tr className="bg-white">
                <td className="px-3 py-1.5 text-center border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">10)</td>
                <td className="px-3 py-1.5 border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">Warranty / Guarantee</td>
                <td className="px-3 py-1.5 border-t border-gray-300">
                  <textarea
                    value={p2.warranty}
                    onChange={(e) => setP2Field('warranty', e.target.value)}
                    className="w-full min-h-[66px] text-[11px] text-gray-900 outline-none resize-none leading-5 bg-transparent border-none p-0 placeholder:text-gray-400"
                    placeholder="Enter warranty / guarantee terms..."
                  />
                </td>
              </tr>

              <tr className="bg-white">
                <td className="px-3 py-1.5 text-center border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">11)</td>
                <td className="px-3 py-1.5 border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">LD / Penalty</td>
                <td className="px-3 py-1.5 border-t border-gray-300">
                  <textarea
                    value={p2.ldAutoEnabled ? ldAutoText : p2.ldPenalty}
                    onChange={(e) => setP2Field('ldPenalty', e.target.value as any)}
                    className="w-full min-h-[86px] text-[11px] text-gray-900 outline-none resize-none leading-5 bg-transparent border-none p-0 placeholder:text-gray-400"
                    placeholder="Enter LD / penalty terms..."
                  />
                </td>
              </tr>

              <tr className="bg-white">
                <td className="px-3 py-1.5 text-center border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">12)</td>
                <td className="px-3 py-1.5 border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">Remarks</td>
                <td className="px-3 py-1.5 border-t border-gray-300">
                  <textarea
                    value={p2.remarks}
                    onChange={(e) => setP2Field('remarks', e.target.value)}
                    className="w-full min-h-[66px] text-[11px] text-gray-900 outline-none resize-none leading-5 bg-transparent border-none p-0 placeholder:text-gray-400"
                    placeholder="Enter remarks..."
                  />
                </td>
              </tr>

              <tr className="bg-white">
                <td className="px-3 py-1.5 text-center border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">13)</td>
                <td className="px-3 py-1.5 border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">Site &amp; Billing Address</td>
                <td className="px-3 py-1.5 border-t border-gray-300">
                  <textarea
                    value={p2.siteBillingAddress}
                    onChange={(e) => setP2Field('siteBillingAddress', e.target.value)}
                    className="w-full min-h-[180px] text-[11px] text-gray-900 outline-none resize-none leading-5 bg-transparent border-none p-0 whitespace-pre-wrap placeholder:text-gray-400"
                    placeholder="Enter site & billing address..."
                  />
                </td>
              </tr>

              <tr className="bg-white">
                <td className="px-3 py-1.5 text-center border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">14)</td>
                <td className="px-3 py-1.5 border-r border-t border-gray-300 font-semibold bg-gray-100 text-gray-600">Documents Required</td>
                <td className="px-3 py-1.5 border-t border-gray-300">
                  <textarea
                    value={p2.documentsRequired}
                    onChange={(e) => setP2Field('documentsRequired', e.target.value)}
                    className="w-full min-h-[92px] text-[11px] text-gray-900 outline-none resize-none leading-5 bg-transparent border-none p-0 whitespace-pre-wrap placeholder:text-gray-400"
                    placeholder="Enter documents required..."
                  />
                </td>
              </tr>
              {(Array.isArray(p1.customFields) ? p1.customFields : [])
                .filter((field) => safe(field.label) || safe(field.value))
                .map((field, index) => (
                  <tr key={field.id} className="bg-white">
                    <td className="border-r border-t border-gray-300 bg-gray-100 px-3 py-1.5 text-center font-semibold text-gray-600">{15 + index})</td>
                    <td className="border-r border-t border-gray-300 bg-gray-100 px-3 py-1.5 font-semibold text-gray-600">{safe(field.label) || 'Additional Term'}</td>
                    <td className="whitespace-pre-wrap border-t border-gray-300 px-3 py-1.5 text-gray-900">{safe(field.value) || '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {renderPoReportFooter(2, 'Terms & Conditions')}
      </div>
    ) : p < legalReportPage ? (() => {
      const reportPage = annexureReportPages[Math.max(0, p - customAnnexureStartPage)];
      const annexure = reportPage?.annexure || defaultPage3();
      const annexureNumber = reportPage?.annexureNumber || 1;
      const annexureTitle = withAnnexureNumber(annexure.annexureTitle, `ANNEXURE - ${annexureNumber}`, annexureNumber);
      const annexureHtml = reportPage?.contentHtml || sanitizeAnnexureHtml(annexure.contentHtml || defaultPage3().contentHtml);
      const continued = Boolean(reportPage?.pageIndex);
      return (
        <div className="po-report-sheet po-draft-font-11 annexure-2-custom-sheet mx-auto flex h-[1123px] min-h-[1123px] max-h-[1123px] w-[794px] max-w-full flex-col overflow-hidden border border-slate-300 bg-white p-5 font-sans text-[11px] text-gray-950 shadow-sm">
          <style>{ANNEXURE_RICH_TEXT_CSS}</style>
          {renderPoSectionHeader(
            continued ? `${annexureTitle} (Continued)` : annexureTitle,
            poReferenceLabel
          )}
          <div className="annexure-rich-content min-h-0 flex-1 overflow-hidden text-[11px] leading-[1.5]" dangerouslySetInnerHTML={{ __html: annexureHtml }} />
          <div className="mt-auto">{renderPoReportFooter(p, `Annexure - ${annexureNumber}${continued ? ' — Continued' : ''}`)}</div>
        </div>
      );
    })() : (
      <div className="po-report-sheet annexure-3-sheet mx-auto min-h-[1123px] w-[794px] max-w-full border border-slate-300 bg-white p-5 font-sans text-gray-950 shadow-sm">
        <div>{renderPoSectionHeader(withAnnexureNumber(p4.annexureTitle, defaultPage4().annexureTitle, legalAnnexureNumber), poReferenceLabel, true)}</div>
        <div
          className="annexure-3-columns text-justify text-[8px] leading-[1.12] [hyphens:auto]"
          style={{ columnCount: 3, columnGap: '12px', columnRule: '1px solid #cbd5e1' }}
        >
          {annexureTermLines.map((line, index) => {
            const isClauseHeading = /^\d+\.\s/.test(line);
            return (
              <p
                key={`${index}-${line.slice(0, 20)}`}
                className={isClauseHeading ? 'mb-[1px] font-bold [break-after:avoid]' : 'mb-[2px]'}
              >
                {line}
              </p>
            );
          })}
        </div>
        <div>{renderPoReportFooter(legalReportPage, `Annexure - ${legalAnnexureNumber}`)}</div>
      </div>
    );

  if (variant === 'inline') {
    return (
      <div className={inlineSimulatePrint ? 'fc-po-inline-preview' : undefined}>
        {inlineSimulatePrint ? (
          <style>
            {`
              .fc-po-inline-preview .no-print { display: none !important; }
              .fc-po-inline-preview .print-only.hidden { display: block !important; }
              .fc-po-inline-preview .fc-po-preview-page { margin: 0 0 24px 0; }
              .fc-po-inline-preview .fc-po-preview-page:last-child { margin-bottom: 0; }
            `}
          </style>
        ) : null}

        <div className="pointer-events-none">
          {Array.from({ length: totalReportPages }, (_, index) => index + 1).map((pageNumber) => (
            <div key={pageNumber} className="fc-po-preview-page">{renderPageContent(pageNumber)}</div>
          ))}
        </div>
      </div>
    );
  }



  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-[#d7e4e0] bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[#1b514a] bg-[#0D3A35] px-6 py-4 text-white">
          <div>
            <div className="text-lg font-bold">{reviewOnly ? (documentStatus === 'approved' ? 'Approved Purchase Order' : 'Purchase Order Review') : revisionMode ? 'Revise Purchase Order' : 'Create Purchase Order'}</div>
            <div className="mt-0.5 text-xs text-white/65">{prNumber || 'PR not recorded'} · {vendorNameFromComparative || resolvedVendorId}</div>
          </div>
          <div className="flex items-center gap-2">
            {workflowStep === 'draft' ? (
              <>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 border-white/25 bg-white/10 text-xs text-white hover:bg-white/20 hover:text-white" onClick={handleDownloadPdf} disabled={printing}>
                  <Download className="h-3.5 w-3.5" /> Download PDF
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 border-white/25 bg-white/10 text-xs text-white hover:bg-white/20 hover:text-white" onClick={() => void handlePrint()} disabled={printing}>
                  <Printer className="h-3.5 w-3.5" /> Print / PDF
                </Button>
              </>
            ) : null}
            <button type="button" onClick={onClose} className="ml-1 rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {!reviewOnly && <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-3">
          <div className="mx-auto flex max-w-xl items-center justify-center">
            {[
              { key: 'details', label: '1. Enter PO Details' },
              { key: 'draft', label: '2. Review Draft PO' },
              { key: 'create', label: revisionMode ? '3. Save Revision' : '3. Create PO' },
            ].map((step, index) => {
              const active = step.key === workflowStep;
              const completed = workflowStep === 'draft' && step.key === 'details';
              return (
                <div key={step.key} className="flex items-center">
                  {index ? <span className={`mx-3 h-px w-10 ${completed || workflowStep === 'draft' ? 'bg-[#7fa89e]' : 'bg-slate-200'}`} /> : null}
                  <span className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${active ? 'bg-[#0D3A35] text-white' : completed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>}

        <div className={`min-h-0 flex-1 overflow-y-auto ${workflowStep === 'details' ? 'bg-slate-50 px-6 py-6' : 'bg-slate-100 px-8 py-8 text-black'}`} ref={printRef}>
          {workflowStep === 'details' ? detailsForm : (
            <div className="fc-po-draft-preview mx-auto max-w-5xl">
              <style>{`
                .fc-po-draft-preview .no-print { display: none !important; }
                .fc-po-draft-preview .print-only.hidden { display: block !important; }
                .fc-po-draft-preview input, .fc-po-draft-preview textarea { border: 0 !important; box-shadow: none !important; pointer-events: none !important; }
              `}</style>
              <div className={`mb-3 flex items-center justify-between rounded-xl border px-4 py-2.5 ${documentStatus === 'approved' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                <div><p className={`text-sm font-bold ${documentStatus === 'approved' ? 'text-emerald-800' : 'text-amber-800'}`}>{documentStatus === 'approved' ? 'Approved Purchase Order' : 'Draft Purchase Order'}{amendmentLabel ? ` · ${amendmentLabel}` : ''}</p><p className={`text-xs ${documentStatus === 'approved' ? 'text-emerald-700' : 'text-amber-700'}`}>{documentStatus === 'approved' ? `PO Number: ${effectivePoNo || 'Not recorded'}` : amendmentLabel ? `Review ${amendmentLabel} before saving and sending it for approval.` : 'Review all details before creating the final PO.'}</p></div>
                <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-widest ${documentStatus === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{documentStatus === 'approved' ? 'Approved' : 'Draft'}</span>
              </div>
              <div className="space-y-6">
                {Array.from({ length: totalReportPages }, (_, index) => index + 1).map((pageNumber) => (
                  <section
                    key={pageNumber}
                    data-po-page="true"
                    data-po-page-number={pageNumber}
                    className="pointer-events-none bg-transparent"
                  >
                    <div className="no-print mb-4 flex items-center justify-between border-b border-slate-200 pb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                      <span>{reportPageLabel(pageNumber)}</span>
                      <span>Page {pageNumber} of {totalReportPages}</span>
                    </div>
                    <div
                      data-po-page-frame="true"
                      className="mx-auto h-[1123px] w-[794px] max-w-full overflow-hidden bg-white"
                    >
                      {renderPageContent(pageNumber)}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-6 py-3">
          <div className="text-xs text-muted-foreground">
            Vendor: <span className="font-medium text-foreground">{p1.vendorName.trim() || vendorNameFromComparative || '—'}</span>
            {computedTotals ? (
              <>
                <span className="opacity-60"> • </span>
                Total: <span className="font-medium text-foreground">{inr(computedTotals.gross)}</span>
              </>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={printing || savingPo}>
              {reviewOnly ? 'Close' : 'Cancel'}
            </Button>

            {!reviewOnly && (workflowStep === 'details' ? (
              <>
                <Button type="button" variant="outline" onClick={() => void handleSaveDraft()} disabled={!resolvedVendorId || draftStatus === 'saving'} className="gap-1.5">
                  <FileText className="h-4 w-4" />
                  {draftStatus === 'saving' ? 'Saving…' : draftStatus === 'saved' ? 'Draft Saved' : 'Save Draft'}
                </Button>
                <Button type="button" onClick={reviewDraft} className="gap-1.5 bg-[#0D3A35] text-white hover:bg-[#092e2a]">
                  Review Draft PO <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setWorkflowStep('details')} disabled={printing || savingPo} className="gap-1.5">
                  <ChevronLeft className="h-4 w-4" /> Edit Details
                </Button>
                <Button onClick={() => void handleConfirm()} disabled={printing || savingPo || !resolvedVendorId} className="bg-[#0D3A35] px-6 text-white hover:bg-[#092e2a]">
                  {savingPo ? (revisionMode ? 'Saving Revision…' : 'Creating PO…') : (revisionMode ? 'Save Revision' : 'Create PO')}
                </Button>
              </>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
