import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Boxes, Building2, Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheckBig, ClipboardList, FileText, GitBranch, Lock, Phone, Plus, Receipt, RefreshCw, Search, SendHorizonal, Upload, User, X } from 'lucide-react';
import * as XLSX from 'xlsx';

import { Button } from '@/components/ui/button';
import getBaseUrl from '@/lib/config';
import { toast } from 'sonner';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from '@/lib/dateFormat';
import { markPoForwardedToPurchaseFlow, readPoApprovals } from '@/lib/poApprovalStore';
import { getGrnsByOrder, type GRNRecord } from '@/lib/grnApi';
import { buildGrnPdfBlob } from '@/lib/grnPdf';

type LeftPanelInfo = {
  pr_number?: string;
  approved_vendor_id?: string;
  vendor_details?: {
    nature_of_vendor?: string;
    aadhar_card_number?: string;
    address?: {
      name_of_premises?: string;
      road?: string;
      district?: string;
      pin_code?: string;
      state?: string;
      plot_flat_unit_no_and_floor?: string;
      taluka_locality?: string;
    };
    address_for_place_of_supply_of_goods_services?: {
      name_of_premises?: string;
      road?: string;
      district?: string;
      pin_code?: string;
      state?: string;
      gst_number?: string;
      plot_flat_unit_no_and_floor?: string;
      taluka_locality?: string;
      contact_number?: string;
      e_mail_id?: string;
    };
    income_tax_pan?: string;
    vendor_contact?: string;
    vendor_name?: string;
    gst_number?: string;
    vendor_address?: string;
    e_mail_id?: string;
  } | null;
};

type PurchaseOrderDetails = {
  poNumber: string;
  poDate: string;
  amendmentNo: string;
  project: string;
  deliveryDate: string;
  paymentTerms: string;
  shipToAddress: string;
  preparedBy: string;
  requiredDocuments: string[];
  itemDetails: Array<{ name: string; uom: string; quantity: number }>;
};

type ApiPurchaseFlowStageEntry = {
  document?: unknown;
  status?: unknown;
  doc_link?: unknown;
};

type ApiPurchaseFlow = {
  comparison_id?: unknown;
  flow_id?: unknown;
  order_number?: unknown;
  order_type?: unknown;
  pr_number?: unknown;
  purchase_flow_stage?: unknown;
  timestamp?: unknown;
};

type ApiGetPurchaseFlowsResponse = {
  purchase_flows?: unknown;
};

type PurchaseFlowStep = {
  key: string;
  index: number;
  document: string;
  displayLabel?: string;
  status: string;
  docLink: string;
  isLocal?: boolean; // true for user-inserted invoice steps (not from API)
  isRequired?: boolean; // derived from the document requirements saved on the PO
  documentType?: string;
  externalGrn?: GRNRecord;
  isExternal?: boolean;
};

const REQUIRED_PURCHASE_DOCUMENT_OPTIONS = [
  'PO Acceptance',
  'Proforma Invoice',
  'Delivery Challan',
  'GRN',
  'Tax Invoice',
] as const;

const normalizeDocumentName = (value: unknown) => safeTrim(value).toLowerCase().replace(/\s+/g, ' ');

const documentTypeKey = (value: unknown) => {
  const normalized = normalizeDocumentName(value);
  if (normalized === 'invoice' || normalized === 'tax invoice') return 'tax invoice';
  if (normalized.startsWith('grn') || normalized.includes('goods receipt note')) return 'grn';
  if (normalized.startsWith('proforma invoice')) return 'proforma invoice';
  if (normalized.startsWith('delivery challan')) return 'delivery challan';
  return normalized;
};

const normalizeRequiredPurchaseDocuments = (value: unknown): string[] => {
  const supplied = Array.isArray(value) ? value.map(normalizeDocumentName) : [];
  return REQUIRED_PURCHASE_DOCUMENT_OPTIONS.filter(
    (document) => document === 'PO Acceptance' || supplied.includes(normalizeDocumentName(document)),
  );
};

const safeTrim = (v: unknown) => String(v ?? '').trim();

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

const normalizePoItemDetails = (...sources: unknown[]): Array<{ name: string; uom: string; quantity: number }> => {
  const source = sources.find((candidate) => Array.isArray(candidate) && candidate.length) as unknown[] | undefined;
  if (!source) return [];
  return source.map((entry) => {
    const item = asRecord(entry);
    const quantity = Number(item.quantity ?? item.qty ?? item.ordered_quantity ?? 0);
    return {
      name: safeTrim(item.name ?? item.item_name ?? item.partName ?? item.part_name ?? item.description) || 'Item not recorded',
      uom: safeTrim(item.uom ?? item.UoM ?? item.unit),
      quantity: Number.isFinite(quantity) ? quantity : 0,
    };
  });
};

const parseStepIndex = (key: string): number | null => {
  const m = String(key).match(/step_(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

const parseSteps = (stageUnknown: unknown): PurchaseFlowStep[] => {
  const stage = asRecord(stageUnknown);
  const out: PurchaseFlowStep[] = [];
  for (const [key, entryUnknown] of Object.entries(stage)) {
    const index = parseStepIndex(key);
    if (!index) continue;
    const entry = asRecord(entryUnknown) as ApiPurchaseFlowStageEntry;
    out.push({
      key,
      index,
      document: safeTrim(entry.document) || key,
      status: safeTrim(entry.status) || 'empty',
      docLink: safeTrim(entry.doc_link),
    });
  }
  return out.sort((a, b) => a.index - b.index);
};

const isUploaded = (s: PurchaseFlowStep) => {
  if (s.externalGrn) return true;
  const st = safeTrim(s.status).toLowerCase();
  if (s.docLink) return true;
  if (!st) return false;
  return st !== 'empty';
};

const isInvoiceDocType = (doc: string) => {
  const d = doc.trim().toLowerCase();
  return d === 'invoice' || d === 'proforma invoice';
};

const PO_NEXT_PROCESS_OPTIONS = [
  { id: 'po_acceptance_wo_acceptance', label: 'PO acceptance / WO Acceptance (WO: Work order)' },
  { id: 'delivery_timeline_work_completion', label: 'Delivery timeline (PO) / Work completion timeline (WO)' },
  { id: 'proforma_invoice', label: 'Proforma invoice' },
  { id: 'progress_inspection_report', label: 'Progress (WO) / Inspection report (PO)' },
  { id: 'grn_completion_certificate', label: 'GRN (PO) / Completion certificate (WO)' },
  { id: 'prr', label: 'PRR (payment requisition receipt)' },
  { id: 'invoice', label: 'Invoice' },
  { id: 'e_way_bill', label: 'E way bill' },
  { id: 'warranty_guarantee_card', label: 'Warranty / Guarantee card' },
] as const;

type PoNextProcessId = (typeof PO_NEXT_PROCESS_OPTIONS)[number]['id'];

const PO_DOC_BY_STEP: Record<PoNextProcessId, string> = {
  po_acceptance_wo_acceptance: 'po acceptance',
  delivery_timeline_work_completion: 'delivery timeline',
  proforma_invoice: 'proforma invoice',
  progress_inspection_report: 'inspection report',
  grn_completion_certificate: 'grn',
  prr: 'prr',
  invoice: 'invoice',
  e_way_bill: 'e way bill',
  warranty_guarantee_card: 'warranty / guarantee card',
};

const buildPurchaseFlowStage = (series: PoNextProcessId[]) => {
  const stage: Record<string, { document: string; status: 'empty'; doc_link: string }> = {};
  series.forEach((id, idx) => {
    stage[`step_${idx + 1}`] = {
      document: PO_DOC_BY_STEP[id] || String(id).replace(/_/g, ' '),
      status: 'empty',
      doc_link: '',
    };
  });
  return stage;
};

const formatDateTime = (raw?: string) => {
  const v = safeTrim(raw);
  if (!v) return '';
  return formatDateTimeDDMMYYYY(v, v);
};

function PdfFirstPagePreview({ url, label }: { url: string; label: string }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-white">
      <iframe
        src={`${url}#page=1&zoom=page-width&toolbar=0&navpanes=0&scrollbar=0&pagemode=none`}
        title={`${label} first page preview`}
        loading="lazy"
        tabIndex={-1}
        className="pointer-events-none absolute left-1/2 top-0 h-[86%] w-[116%] -translate-x-1/2 border-0 bg-white"
      />
    </div>
  );
}

function InlineDocumentPreview({
  url,
  label,
  interactive = false,
  mimeType = '',
}: {
  url: string;
  label: string;
  interactive?: boolean;
  mimeType?: string;
}) {
  const cleanUrl = safeTrim(url);
  const path = cleanUrl.split(/[?#]/)[0].toLowerCase();
  const isImage = mimeType.toLowerCase().startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/.test(path);

  if (isImage) {
    return (
      <img
        src={cleanUrl}
        alt={`${label} preview`}
        loading="lazy"
        className="h-full w-full object-contain"
      />
    );
  }

  if (!interactive) return <PdfFirstPagePreview url={cleanUrl} label={label} />;

  return (
    <iframe
      src={`${cleanUrl}#page=1&toolbar=${interactive ? '1' : '0'}&navpanes=0&scrollbar=${interactive ? '1' : '0'}&view=FitH`}
      title={`${label} preview`}
      loading="lazy"
      tabIndex={-1}
      className={`${interactive ? '' : 'pointer-events-none'} h-full w-full border-0 bg-white`}
    />
  );
}

async function fetchPurchaseFlows(signal?: AbortSignal): Promise<ApiPurchaseFlow[]> {
  const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('API base URL is not set');

  const url = `${baseUrl}/purchase_flow/get_purchase_flows`;
  const doFetch = (method: 'GET' | 'POST') =>
    fetch(url, {
      method,
      headers: { Accept: 'application/json' },
      signal,
    });

  let res = await doFetch('GET');
  if (res.status === 405) res = await doFetch('POST');

  const text = await res.text().catch(() => '');
  let data: ApiGetPurchaseFlowsResponse | null = null;
  try {
    data = text ? (JSON.parse(text) as ApiGetPurchaseFlowsResponse) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message =
      safeTrim((data as any)?.message) ||
      safeTrim((data as any)?.error) ||
      text ||
      `Failed to load purchase flows (HTTP ${res.status})`;
    throw new Error(message);
  }

  const list = (data as any)?.purchase_flows;
  return Array.isArray(list) ? (list as ApiPurchaseFlow[]) : [];
}

function UploadStepDocPopup({
  title,
  onClose,
  onUpload,
}: {
  title: string;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!file) return toast.error('Select a file');
    setUploading(true);
    try {
      await onUpload(file);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e ?? 'Upload failed');
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="font-semibold text-sm">Upload Document</div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <div className="text-xs text-muted-foreground">Step</div>
            <div className="text-sm font-semibold">{title}</div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">File</label>
            <label className="flex items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed border-border bg-background px-4 py-6 cursor-pointer hover:bg-muted transition-colors">
              <Upload className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{file ? file.name : 'Click to select file'}</span>
              <input
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={uploading}>Cancel</Button>
          <Button onClick={handleUpload} className="gap-2" disabled={uploading}>
            <Upload className="w-4 h-4" /> {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CreateFlowPopup({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (payload: {
    orderType: 'PR' | 'SPR';
    orderNumber: string;
    prNumber: string;
    vendorId: string;
    poFile: File | null;
    nextProcessSeries: PoNextProcessId[];
    budgetAllocations: {
      budgetId: string;
      budgetName: string;
      items: { lineItemId: string; lineItem: string; category: string; budgetType: string; totalValue: number; amount: string }[];
    }[];
  }) => Promise<void>;
}) {
  // ── Wizard step ───────────────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);

  // ── Step 1: Order Details ─────────────────────────────────────────────────────
  const [orderType, setOrderType] = useState<'PR' | 'SPR'>('PR');
  const [orderNumber, setOrderNumber] = useState('');
  const [prNumber, setPrNumber] = useState('');
  const [poFile, setPoFile] = useState<File | null>(null);

  type VendorOption = {
    vendor_id: string; vendor_name: string; firm_name?: string;
    vendor_contact?: string; vendor_address?: string; gst_number?: string;
  };
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const selectedVendor = vendors.find(v => v.vendor_id === selectedVendorId) ?? null;

  useEffect(() => {
    setLoadingVendors(true);
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    fetch(`${baseUrl}/purchase_flow/get_vendors`)
      .then(r => r.json())
      .then((data: any) => {
        if (Array.isArray(data?.vendors)) {
          setVendors(data.vendors.map((v: any) => ({
            vendor_id:      String(v?.vendor_id   || ''),
            vendor_name:    String(v?.vendor_name  || ''),
            firm_name:      v?.firm_name      ? String(v.firm_name)      : undefined,
            vendor_contact: v?.vendor_contact ? String(v.vendor_contact) : undefined,
            vendor_address: v?.vendor_address ? String(v.vendor_address) : undefined,
            gst_number:     v?.gst_number     ? String(v.gst_number)     : undefined,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingVendors(false));
  }, []);

  // ── Step 2: Document Flow ─────────────────────────────────────────────────────
  const [nextProcessSeries, setNextProcessSeries] = useState<PoNextProcessId[]>(
    PO_NEXT_PROCESS_OPTIONS.map((x) => x.id) as PoNextProcessId[]
  );

  // ── Step 3: Budget Allocation ─────────────────────────────────────────────────
  type BudgetSummary = {
    budget_id: string; budget_name: string; crop_season: string;
    financial_year_start: string; financial_year_end: string;
    budget_xlsx_url: string | null; locked: boolean;
  };
  type LineItemRow = { id: string; category: string; lineItem: string; budgetType: string; totalValue: number; };
  type AllocItem = {
    lineItemId: string; lineItem: string; category: string;
    budgetType: string; totalValue: number; checked: boolean; amount: string;
  };
  type BudgetAlloc = { budgetId: string; budgetName: string; cropSeason: string; items: AllocItem[]; };

  const [budgets, setBudgets] = useState<BudgetSummary[]>([]);
  const [loadingBudgets, setLoadingBudgets] = useState(false);
  const [pickedBudgetId, setPickedBudgetId] = useState('');
  const [addingBudget, setAddingBudget] = useState(false);
  const [lineItemsCache, setLineItemsCache] = useState<Record<string, LineItemRow[]>>({});
  const [allocations, setAllocations] = useState<BudgetAlloc[]>([]);

  useEffect(() => {
    if (currentStep !== 3) return;
    setLoadingBudgets(true);
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    fetch(`${baseUrl}/admin_accounts/get_budgets`)
      .then(r => r.json())
      .then(d => { if (d.success && Array.isArray(d.data)) setBudgets(d.data.filter((b: any) => !b.locked)); })
      .catch(() => {})
      .finally(() => setLoadingBudgets(false));
  }, [currentStep]);

  const fetchBudgetLineItems = async (budget: BudgetSummary): Promise<LineItemRow[]> => {
    if (lineItemsCache[budget.budget_id]) return lineItemsCache[budget.budget_id];
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/admin_accounts/get_budget/${budget.budget_id}`);
    if (!res.ok) throw new Error(`Failed to fetch budget xlsx (${res.status})`);
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
    const ws = wb.Sheets['budget'] || wb.Sheets[wb.SheetNames[0]];
    if (!ws) return [];
    const rows: any[] = XLSX.utils.sheet_to_json(ws);
    const items: LineItemRow[] = rows
      .map((r: any, i: number) => ({
        id: String(r.line_item_id || `item_${i}`),
        category: String(r.category || ''),
        lineItem: String(r.line_item || ''),
        budgetType: String(r.budget_type || ''),
        totalValue:
          parseFloat(r.total_value) ||
          parseFloat(r.quantity_per_acre || 0) * parseFloat(r.total_acres || 0) * parseFloat(r.rate_per_unit || 0),
      }))
      .filter((it: LineItemRow) => it.lineItem);
    setLineItemsCache(prev => ({ ...prev, [budget.budget_id]: items }));
    return items;
  };

  const handleAddBudget = async () => {
    const budget = budgets.find(b => b.budget_id === pickedBudgetId);
    if (!budget) return toast.error('Select a budget first');
    if (allocations.some(a => a.budgetId === budget.budget_id)) return toast.error('Budget already added');
    setAddingBudget(true);
    try {
      const items = await fetchBudgetLineItems(budget);
      if (items.length === 0) { toast.error('No line items found for this budget'); return; }
      setAllocations(prev => [...prev, {
        budgetId: budget.budget_id,
        budgetName: budget.budget_name,
        cropSeason: budget.crop_season,
        items: items.map(li => ({
          lineItemId: li.id, lineItem: li.lineItem, category: li.category,
          budgetType: li.budgetType, totalValue: li.totalValue, checked: false, amount: '',
        })),
      }]);
      setPickedBudgetId('');
    } catch { toast.error('Failed to load budget line items'); }
    finally { setAddingBudget(false); }
  };

  const toggleItem = (budgetId: string, lid: string) =>
    setAllocations(prev => prev.map(a => a.budgetId !== budgetId ? a : {
      ...a, items: a.items.map(it => it.lineItemId !== lid ? it : { ...it, checked: !it.checked }),
    }));

  const setItemAmount = (budgetId: string, lid: string, amount: string) =>
    setAllocations(prev => prev.map(a => a.budgetId !== budgetId ? a : {
      ...a, items: a.items.map(it => it.lineItemId !== lid ? it : { ...it, amount }),
    }));

  const removeBudget = (budgetId: string) =>
    setAllocations(prev => prev.filter(a => a.budgetId !== budgetId));

  const totalAllocated = allocations.reduce((sum, a) =>
    sum + a.items.filter(it => it.checked).reduce((s, it) => s + (parseFloat(it.amount) || 0), 0), 0);

  const fmtAmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  // ── Navigation ───────────────────────────────────────────────────────────────
  const goNext = () => {
    if (currentStep === 1) {
      if (!safeTrim(orderNumber)) return toast.error('Enter order number');
      if (!safeTrim(prNumber)) return toast.error('Enter SPR / PR number');
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (nextProcessSeries.length === 0) return toast.error('Select at least one process');
      setCurrentStep(3);
    }
  };

  const handleSubmit = async () => {
    if (!safeTrim(orderNumber)) { toast.error('Order number is required'); setCurrentStep(1); return; }
    if (!safeTrim(prNumber)) { toast.error('PR number is required'); setCurrentStep(1); return; }
    if (nextProcessSeries.length === 0) { toast.error('Select at least one process'); setCurrentStep(2); return; }
    setSubmitting(true);
    try {
      await onCreate({
        orderType,
        orderNumber: safeTrim(orderNumber),
        prNumber: safeTrim(prNumber),
        vendorId: selectedVendorId,
        poFile,
        nextProcessSeries,
        budgetAllocations: allocations.map(a => ({
          budgetId: a.budgetId,
          budgetName: a.budgetName,
          items: a.items.filter(it => it.checked).map(it => ({
            lineItemId: it.lineItemId,
            lineItem: it.lineItem,
            category: it.category,
            budgetType: it.budgetType,
            totalValue: it.totalValue,
            amount: it.amount,
          })),
        })),
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const STEPS = [
    { n: 1 as const, label: 'Order Details' },
    { n: 2 as const, label: 'Document Flow' },
    { n: 3 as const, label: 'Budget Allocation' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-4xl rounded-xl border border-border bg-card shadow-xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* ── Modal header + step indicator ──────────────────────────────────── */}
        <div className="px-6 pt-5 pb-4 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
                <SendHorizonal className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-bold tracking-tight">Create Flow</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {currentStep === 1 && 'Enter order details and vendor information.'}
                  {currentStep === 2 && 'Define the purchase flow document sequence.'}
                  {currentStep === 3 && 'Allocate budget line items to this purchase.'}
                </div>
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground mt-1">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center">
            {STEPS.map((s, i) => (
              <div key={s.n} className="flex items-center flex-1 last:flex-none">
                <div className="flex items-center gap-2 shrink-0">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                    currentStep > s.n ? 'bg-green-500 text-white' :
                    currentStep === s.n ? 'bg-foreground text-background' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {currentStep > s.n ? <Check className="h-3 w-3" /> : s.n}
                  </div>
                  <span className={`text-xs font-semibold whitespace-nowrap ${currentStep === s.n ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 mx-3 h-px transition-colors ${currentStep > s.n ? 'bg-green-400' : 'bg-border'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Step content ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* ── STEP 1: Order Details ── */}
          {currentStep === 1 && (
            <div className="p-6 space-y-5">

              {/* Order Type Toggle */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Order Type *</label>
                <div className="inline-flex rounded-lg border border-border overflow-hidden w-fit">
                  {(['PR', 'SPR'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setOrderType(type)}
                      className={`px-5 py-2 text-sm font-semibold transition-colors select-none ${
                        orderType === type
                          ? 'bg-foreground text-background'
                          : 'bg-background text-muted-foreground hover:bg-muted/40'
                      }`}
                    >
                      {type}
                      <span className="ml-1.5 text-[10px] font-normal opacity-70">
                        {type === 'PR' ? '(Purchase Requisition)' : '(Service Purchase Req.)'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">Order Number *</label>
                  <input
                    value={orderNumber}
                    onChange={e => setOrderNumber(e.target.value)}
                    placeholder="Enter order number"
                    className="border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">{orderType} Number *</label>
                  <input
                    value={prNumber}
                    onChange={e => setPrNumber(e.target.value)}
                    placeholder={`Enter ${orderType} number`}
                    className="border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  />
                </div>
              </div>

              {/* PO / WO upload */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Upload PO / WO Document</label>
                <label className={`flex items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 cursor-pointer transition-colors ${
                  poFile ? 'border-green-300 bg-green-50/50' : 'border-border bg-background hover:bg-muted/30'
                }`}>
                  <Upload className={`w-4 h-4 shrink-0 ${poFile ? 'text-green-600' : 'text-muted-foreground'}`} />
                  <span className={`flex-1 text-sm truncate ${poFile ? 'text-green-700 font-medium' : 'text-muted-foreground'}`}>
                    {poFile ? poFile.name : 'Click to upload PO or WO document (optional)'}
                  </span>
                  {poFile && (
                    <button
                      type="button"
                      onClick={e => { e.preventDefault(); setPoFile(null); }}
                      className="text-[11px] font-medium text-red-500 hover:underline shrink-0"
                    >Remove</button>
                  )}
                  <input type="file" className="hidden" onChange={e => setPoFile(e.target.files?.[0] || null)} />
                </label>
              </div>

              {/* Vendor */}
              <div className="pt-1 border-t border-border/60">
                <div className="flex items-center gap-1.5 mb-3">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Vendor</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-start">
                  <div className="flex flex-col gap-1 sm:w-60 shrink-0">
                    <label className="text-xs font-medium text-muted-foreground">Select Vendor</label>
                    <div className="relative">
                      <select
                        value={selectedVendorId}
                        onChange={e => setSelectedVendorId(e.target.value)}
                        disabled={loadingVendors}
                        className="w-full appearance-none border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20 pr-8 disabled:opacity-50"
                      >
                        <option value="">{loadingVendors ? 'Loading vendors…' : 'Select a vendor'}</option>
                        {vendors.map(v => (
                          <option key={v.vendor_id} value={v.vendor_id}>{v.firm_name || v.vendor_name}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  {selectedVendor ? (
                    <div className="flex-1 rounded-lg border border-border bg-background px-4 py-3 grid grid-cols-2 gap-x-5 gap-y-2.5">
                      <div>
                        <div className="flex items-center gap-1 mb-0.5">
                          <Building2 className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Firm's Name</span>
                        </div>
                        <div className="text-xs font-semibold text-foreground">{selectedVendor.firm_name || selectedVendor.vendor_name || '—'}</div>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-0.5">
                          <User className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Vendor's Name</span>
                        </div>
                        <div className="text-xs font-semibold text-foreground">{selectedVendor.vendor_name || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">GST Number</div>
                        <div className="text-xs font-semibold font-mono text-foreground">{selectedVendor.gst_number || '—'}</div>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-0.5">
                          <Phone className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Contact</span>
                        </div>
                        <div className="text-xs font-semibold text-foreground">{selectedVendor.vendor_contact || '—'}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Address</div>
                        <div className="text-xs text-foreground leading-snug">{selectedVendor.vendor_address || '—'}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 rounded-lg border border-dashed border-border bg-muted/10 flex items-center justify-center py-5 px-4">
                      <p className="text-[11px] text-muted-foreground text-center">Select a vendor to see details</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Document Flow ── */}
          {currentStep === 2 && (
            <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] divide-y md:divide-y-0 md:divide-x divide-border min-h-[420px]">
              {/* Left: checklist */}
              <div className="flex flex-col min-h-0">
                <div className="px-5 py-3 border-b border-border bg-muted/20 shrink-0">
                  <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Forward Purchase Order</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Check to add to the workflow.</div>
                </div>
                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
                  {PO_NEXT_PROCESS_OPTIONS.map((opt, optIdx) => {
                    const checked = nextProcessSeries.includes(opt.id);
                    const stepPos = nextProcessSeries.indexOf(opt.id);
                    return (
                      <label
                        key={opt.id}
                        className={`group flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                          checked ? 'bg-background border-foreground/20 shadow-sm' : 'bg-transparent border-transparent hover:bg-muted/40 hover:border-border'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            const add = e.target.checked;
                            setNextProcessSeries(prev => {
                              if (add && !prev.includes(opt.id)) return [...prev, opt.id];
                              if (!add) return prev.filter(x => x !== opt.id);
                              return prev;
                            });
                          }}
                          className="h-4 w-4 shrink-0 accent-foreground"
                        />
                        <div className="flex-1 min-w-0">
                          <div className={`text-[12px] leading-4 font-medium ${checked ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {opt.label}
                          </div>
                        </div>
                        {checked ? (
                          <div className="shrink-0 h-5 w-5 rounded-full bg-foreground text-background text-[10px] font-bold flex items-center justify-center tabular-nums">
                            {stepPos + 1}
                          </div>
                        ) : (
                          <div className="shrink-0 h-5 w-5 rounded-full border border-dashed border-muted-foreground/30 text-[10px] text-muted-foreground/40 flex items-center justify-center">
                            {optIdx + 1}
                          </div>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Right: workflow preview */}
              <div className="flex flex-col min-h-0">
                <div className="px-5 py-3 border-b border-border bg-muted/20 shrink-0">
                  <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Document Workflow</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Steps in sequence as they must be completed.</div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  {nextProcessSeries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        <ClipboardList className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="text-sm font-medium text-muted-foreground">No steps added yet</div>
                      <div className="text-xs text-muted-foreground/70">Select processes from the left panel to build the workflow.</div>
                    </div>
                  ) : (
                    <ol className="relative space-y-0">
                      {nextProcessSeries.map((id, idx) => {
                        const opt = PO_NEXT_PROCESS_OPTIONS.find(x => x.id === id);
                        const isFirst = idx === 0;
                        const isLast = idx === nextProcessSeries.length - 1;
                        return (
                          <li key={id} className="flex gap-3">
                            <div className="flex flex-col items-center shrink-0 w-7">
                              <div className="h-7 w-7 rounded-full border-2 bg-foreground border-foreground text-background flex items-center justify-center shrink-0 z-10 text-[11px] font-bold tabular-nums">
                                {idx + 1}
                              </div>
                              {!isLast && <div className="w-px flex-1 bg-border mt-1 mb-1 min-h-[20px]" />}
                            </div>
                            <div className="flex-1 min-w-0 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 mb-2 shadow-sm">
                              <div className="flex-1 min-w-0">
                                <div className="text-[12px] font-semibold text-foreground leading-4">{opt?.label || id}</div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button" disabled={isFirst}
                                  onClick={() => setNextProcessSeries(prev => {
                                    if (idx <= 0) return prev;
                                    const next = [...prev]; const tmp = next[idx - 1]; next[idx - 1] = next[idx]; next[idx] = tmp; return next;
                                  })}
                                  className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                ><ArrowUp className="h-3.5 w-3.5" /></button>
                                <button
                                  type="button" disabled={isLast}
                                  onClick={() => setNextProcessSeries(prev => {
                                    if (idx >= prev.length - 1) return prev;
                                    const next = [...prev]; const tmp = next[idx + 1]; next[idx + 1] = next[idx]; next[idx] = tmp; return next;
                                  })}
                                  className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                ><ArrowDown className="h-3.5 w-3.5" /></button>
                                <button
                                  type="button"
                                  onClick={() => setNextProcessSeries(prev => prev.filter(x => x !== id))}
                                  className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                ><X className="h-3.5 w-3.5" /></button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3: Budget Allocation ── */}
          {currentStep === 3 && (
            <div className="p-6 space-y-5">
              {/* Budget picker row */}
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Select Budget to Allocate</div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 max-w-sm">
                    <select
                      value={pickedBudgetId}
                      onChange={e => setPickedBudgetId(e.target.value)}
                      disabled={loadingBudgets}
                      className="w-full appearance-none border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20 pr-8 disabled:opacity-50"
                    >
                      <option value="">{loadingBudgets ? 'Loading budgets…' : 'Select a budget…'}</option>
                      {budgets
                        .filter(b => !allocations.some(a => a.budgetId === b.budget_id))
                        .map(b => (
                          <option key={b.budget_id} value={b.budget_id}>
                            {b.budget_name} · {b.crop_season}
                          </option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                  <Button
                    type="button" size="sm" variant="outline"
                    onClick={handleAddBudget}
                    disabled={!pickedBudgetId || addingBudget}
                    className="gap-1.5 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {addingBudget ? 'Loading…' : 'Add Budget'}
                  </Button>
                </div>
              </div>

              {/* Allocated budgets */}
              {allocations.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 py-14 gap-3">
                  <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
                  <div className="text-sm font-medium text-muted-foreground">No budgets added yet</div>
                  <div className="text-xs text-muted-foreground/60">Select a budget above and click Add Budget to start allocating.</div>
                </div>
              ) : (
                <div className="space-y-4">
                  {allocations.map(alloc => {
                    const selectedCount = alloc.items.filter(it => it.checked).length;
                    const allocTotal = alloc.items.filter(it => it.checked).reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
                    return (
                      <div key={alloc.budgetId} className="rounded-xl border border-border overflow-hidden">
                        {/* Budget card header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-muted/20 border-b border-border">
                          <div>
                            <div className="text-sm font-bold text-foreground">{alloc.budgetName}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">{alloc.cropSeason}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            {selectedCount > 0 && (
                              <div className="text-[11px] font-semibold text-foreground">
                                {selectedCount} item{selectedCount !== 1 ? 's' : ''} · ₹{fmtAmt(allocTotal)}
                              </div>
                            )}
                            <button
                              type="button" onClick={() => removeBudget(alloc.budgetId)}
                              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Remove budget"
                            ><X className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>

                        {/* Line items table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-muted/10 border-b border-border">
                                <th className="px-3 py-2 w-8"></th>
                                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">#</th>
                                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Category</th>
                                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Line Item</th>
                                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Type</th>
                                <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Budgeted (₹)</th>
                                <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-36">Allocate (₹)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {alloc.items.map((it, rowIdx) => (
                                <tr key={it.lineItemId} className={`border-b border-border/50 last:border-b-0 transition-colors ${it.checked ? 'bg-blue-50/40' : 'hover:bg-muted/20'}`}>
                                  <td className="px-3 py-2 text-center">
                                    <input
                                      type="checkbox" checked={it.checked}
                                      onChange={() => toggleItem(alloc.budgetId, it.lineItemId)}
                                      className="h-3.5 w-3.5 accent-foreground"
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{rowIdx + 1}</td>
                                  <td className="px-3 py-2 text-muted-foreground font-medium">{it.category || '—'}</td>
                                  <td className="px-3 py-2 font-semibold text-foreground">{it.lineItem}</td>
                                  <td className="px-3 py-2">
                                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                                      it.budgetType === 'Capex' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'
                                    }`}>{it.budgetType || '—'}</span>
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold text-foreground">
                                    {it.totalValue > 0 ? `₹${fmtAmt(it.totalValue)}` : '—'}
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      type="number" min="0" step="0.01" placeholder="0"
                                      value={it.amount}
                                      disabled={!it.checked}
                                      onChange={e => setItemAmount(alloc.budgetId, it.lineItemId, e.target.value)}
                                      className="w-full text-right border border-border rounded-md px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-foreground/20 disabled:opacity-40 disabled:cursor-not-allowed"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}

                  {/* Grand total */}
                  {totalAllocated > 0 && (
                    <div className="flex items-center justify-end gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5">
                      <span className="text-xs font-bold uppercase tracking-wide text-emerald-700">Total Allocated</span>
                      <span className="text-sm font-extrabold text-emerald-700">₹{fmtAmt(totalAllocated)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer navigation ──────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-border bg-muted/20 flex items-center justify-between gap-4 shrink-0">
          <Button
            type="button" variant="outline" size="sm" disabled={submitting}
            onClick={() => { if (currentStep === 1) onClose(); else setCurrentStep((currentStep - 1) as 1 | 2 | 3); }}
          >
            {currentStep === 1 ? 'Cancel' : <><ChevronLeft className="h-3.5 w-3.5 mr-1" />Back</>}
          </Button>

          <span className="text-[11px] text-muted-foreground">Step {currentStep} of 3</span>

          {currentStep < 3 ? (
            <Button type="button" size="sm" onClick={goNext} className="gap-1.5">
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button type="button" size="sm" disabled={submitting} onClick={handleSubmit} className="gap-1.5">
              <SendHorizonal className="h-3.5 w-3.5" />
              {submitting ? 'Creating…' : 'Create Flow'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function AddToInventoryPopup({
  poNumber,
  onClose,
}: {
  poNumber: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Array<{ id: string; name: string; sku: string; unit: string }>>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchItems = async () => {
      setLoadingItems(true);
      try {
        const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
        const res = await fetch(`${baseUrl}/inventory/get_all_item`);
        const data: any = await res.json().catch(() => null);
        if (res.ok && data?.success && Array.isArray(data?.items)) {
          setItems(
            data.items.map((it: any) => ({
              id: String(it?.Invent_id || it?.new_item_code || ''),
              name: String(it?.item_name || ''),
              sku: String(it?.new_item_code || ''),
              unit: String(it?.unit || ''),
            }))
          );
        }
      } catch {
        // stay empty
      } finally {
        setLoadingItems(false);
      }
    };
    fetchItems();
  }, []);

  const selectedItem = items.find((it) => it.id === selectedItemId);
  const totalValue = Number(quantity) > 0 && Number(pricePerUnit) > 0
    ? Number(quantity) * Number(pricePerUnit)
    : null;

  const handleSubmit = async () => {
    if (!selectedItemId) return toast.error('Please select an item');
    if (!quantity || Number(quantity) <= 0) return toast.error('Enter a valid quantity');
    if (!pricePerUnit || Number(pricePerUnit) <= 0) return toast.error('Enter a valid price per unit');
    setSubmitting(true);
    try {
      const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/purchase_flow/add_item_stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedItemId,
          stock_added: Number(quantity),
          po_number: poNumber,
          per_unit_cost: Number(pricePerUnit),
        }),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || 'Failed to add to inventory');
      toast.success(data?.message || 'Stock updated successfully');
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add to inventory');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-green-600" />
            <span className="font-semibold text-sm">Add to Inventory</span>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* PO badge */}
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <div className="text-xs text-muted-foreground">PO Number</div>
            <div className="text-sm font-semibold">{poNumber || '—'}</div>
          </div>

          {/* Item selector */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Select Item</label>
            <div className="relative">
              <select
                className="w-full appearance-none border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-green-500 pr-8 disabled:opacity-50"
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                disabled={loadingItems}
              >
                <option value="">{loadingItems ? 'Loading items…' : 'Select inventory item'}</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name}{it.sku ? ` (${it.sku})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Quantity + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                Incoming Qty{selectedItem?.unit ? ` (${selectedItem.unit})` : ''}
              </label>
              <input
                type="number"
                min={1}
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Price per Unit (₹)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={pricePerUnit}
                onChange={(e) => setPricePerUnit(e.target.value)}
                className="border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          {/* Total value preview */}
          {totalValue !== null && (
            <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-xs text-green-700 font-medium">
              Total value: ₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-green-600 hover:bg-green-700 text-white gap-2"
          >
            <Boxes className="w-4 h-4" />
            {submitting ? 'Adding…' : 'Add to Inventory'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function PurchaseFlow() {
  const [flows, setFlows] = useState<ApiPurchaseFlow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<{
    flow: ApiPurchaseFlow;
    step: PurchaseFlowStep;
  } | null>(null);
  const [documentPreview, setDocumentPreview] = useState<{
    title: string;
    url: string;
    sourceUrl?: string;
    mimeType?: string;
    revokeOnClose?: boolean;
    loading?: boolean;
    error?: string;
  } | null>(null);
  const [addToInventoryFor, setAddToInventoryFor] = useState<{ poNumber: string } | null>(null);
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  const [flowRefreshNonce, setFlowRefreshNonce] = useState(0);
  const [forwardingSteps, setForwardingSteps] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in-progress' | 'completed'>('all');
  const reconciliationAttemptsRef = useRef<Set<string>>(new Set());
  const autoSaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const poRequirementLoadsRef = useRef<Set<string>>(new Set());
  const documentPreviewRequestRef = useRef(0);

  // Per-flow merged step lists (API steps + PO-selected document placeholders)
  const [flowStepOverrides, setFlowStepOverrides] = useState<Record<string, PurchaseFlowStep[]>>({});
  const [requiredDocsByFlowId, setRequiredDocsByFlowId] = useState<Record<string, string[]>>({});
  const [poDetailsByFlowId, setPoDetailsByFlowId] = useState<Record<string, PurchaseOrderDetails>>({});
  const [accountDocsByFlowId, setAccountDocsByFlowId] = useState<Record<string, PurchaseFlowStep[]>>({});
  const [grnsByFlowId, setGrnsByFlowId] = useState<Record<string, GRNRecord[]>>({});
  const [grnPreviewUrlsByKey, setGrnPreviewUrlsByKey] = useState<Record<string, string>>({});

  const getFlowSteps = (flowId: string, flow: ApiPurchaseFlow): PurchaseFlowStep[] => {
    const current = flowStepOverrides[flowId] ?? parseSteps((flow as any)?.purchase_flow_stage);
    const missingRequired = (requiredDocsByFlowId[flowId] || []).filter(
      (document) => {
        const requiredType = documentTypeKey(document);
        if (requiredType === 'grn') return false;
        return !current.some((step) =>
          documentTypeKey(step.documentType || step.document) === requiredType
          && !step.docLink
          && !isUploaded(step),
        );
      },
    );
    if (!missingRequired.length) return current;
    return [
      ...current,
      ...missingRequired.map((document, index) => ({
        key: `required-${normalizeDocumentName(document).replace(/[^a-z0-9]+/g, '-')}`,
        index: current.length + index + 1,
        document,
        documentType: document,
        status: 'empty',
        docLink: '',
        isLocal: true,
        isRequired: true,
      })),
    ];
  };

  const getDisplaySteps = (flowId: string, flow: ApiPurchaseFlow): PurchaseFlowStep[] => {
    // GRNs are system records, not manually attached Purchase Flow steps.
    // Hide any legacy GRN stage and render every GRN returned for this PO below.
    const flowSteps = getFlowSteps(flowId, flow).filter(
      (step) => documentTypeKey(step.documentType || step.document) !== 'grn',
    );
    const linkedUrlCounts = flowSteps.reduce<Record<string, number>>((counts, step) => {
      if (step.docLink) counts[step.docLink] = (counts[step.docLink] || 0) + 1;
      return counts;
    }, {});
    const accountDocs = (accountDocsByFlowId[flowId] || [])
      .filter((step) => documentTypeKey(step.documentType || step.document) !== 'grn')
      .filter((step) => {
        if (!step.docLink || !linkedUrlCounts[step.docLink]) return true;
        linkedUrlCounts[step.docLink] -= 1;
        return false;
      });
    const grnDocs = (grnsByFlowId[flowId] || []).map((grn, index) => {
      const previewKey = `${flowId}:${safeTrim(grn.grnNo) || 'record'}:${index}`;
      return {
        key: `external-grn-${grn.grnNo || 'record'}-${index}`,
        index: flowSteps.length + accountDocs.length + index + 1,
        document: 'GRN',
        documentType: 'GRN',
        status: 'uploaded',
        docLink: grnPreviewUrlsByKey[previewKey] || '',
        externalGrn: grn,
        isExternal: true,
      };
    });
    const combined = [...flowSteps, ...accountDocs, ...grnDocs];
    const totals = combined.reduce<Record<string, number>>((result, step) => {
      const type = documentTypeKey(step.documentType || step.document);
      result[type] = (result[type] || 0) + 1;
      return result;
    }, {});
    const positions: Record<string, number> = {};

    return combined.map((step, index) => {
      const type = documentTypeKey(step.documentType || step.document);
      positions[type] = (positions[type] || 0) + 1;
      const repeated = totals[type] > 1;
      const sequence = repeated ? ` ${positions[type]}` : '';
      const grnNumber = step.externalGrn?.grnNo ? ` — ${step.externalGrn.grnNo}` : '';
      return {
        ...step,
        index: index + 1,
        displayLabel: `${step.document}${sequence}${grnNumber}`,
      };
    });
  };

  // Per-flow save loading state
  const [savingFlows, setSavingFlows] = useState<Record<string, boolean>>({});

  // Left panel enriched data — fetched per-row after the list renders
  const [leftPanelInfoMap, setLeftPanelInfoMap] = useState<Record<string, LeftPanelInfo>>({});
  const [leftPanelLoadingSet, setLeftPanelLoadingSet] = useState<Set<string>>(new Set());

  // Converts the current ordered steps array → { step_1: {...}, step_2: {...}, ... }
  const buildStepJson = (steps: PurchaseFlowStep[]) => {
    const result: Record<string, { document: string; status: string; doc_link: string }> = {};
    steps.forEach((s, idx) => {
      result[`step_${idx + 1}`] = {
        document: s.document,
        status: s.status || 'empty',
        doc_link: s.docLink || '',
      };
    });
    return result;
  };

  const saveCurrentFlow = async (
    flowId: string,
    flow: ApiPurchaseFlow,
    stepsOverride?: PurchaseFlowStep[],
    silent = false,
  ) => {
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    if (!baseUrl) return toast.error('Missing API base URL');
    setSavingFlows((prev) => ({ ...prev, [flowId]: true }));
    try {
      const steps = stepsOverride ?? getFlowSteps(flowId, flow);
      const stepJson = buildStepJson(steps);
      const res = await fetch(`${baseUrl}/purchase_flow/update_purchase_flow_stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ flow_id: flowId, step_json: stepJson }),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || 'Failed to save flow');
      if (!silent) toast.success('Purchase flow saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save purchase flow');
    } finally {
      setSavingFlows((prev) => { const c = { ...prev }; delete c[flowId]; return c; });
    }
  };

  useEffect(() => {
    const ac = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await fetchPurchaseFlows(ac.signal);
        setFlows(list);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e ?? 'Failed to load purchase flows');
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    };

    load();
    return () => ac.abort();
  }, [flowRefreshNonce]);

  const rows = useMemo(() => {
    const copy = [...flows];
    copy.sort((a, b) => safeTrim((b as any)?.timestamp).localeCompare(safeTrim((a as any)?.timestamp)));
    return copy;
  }, [flows]);
  const poApprovalRecords = useMemo(() => readPoApprovals(), [flowRefreshNonce]);

  useEffect(() => {
    Object.entries(flowStepOverrides).forEach(([flowId, steps]) => {
      const flow = rows.find((candidate) =>
        (safeTrim(candidate.flow_id) || safeTrim(candidate.comparison_id)) === flowId,
      );
      if (!flow) return;

      const existingTimer = autoSaveTimersRef.current[flowId];
      if (existingTimer) clearTimeout(existingTimer);
      autoSaveTimersRef.current[flowId] = setTimeout(() => {
        delete autoSaveTimersRef.current[flowId];
        void saveCurrentFlow(flowId, flow, steps, true);
      }, 600);
    });

    return () => {
      Object.values(autoSaveTimersRef.current).forEach(clearTimeout);
      autoSaveTimersRef.current = {};
    };
  }, [flowStepOverrides, rows]);

  // Repair the hand-off for POs created through the newer PO Creation screen.
  // A saved PO must enter Purchase Flow immediately; finance approval remains
  // a separate review state and must not prevent the operational flow record.
  useEffect(() => {
    if (loading) return;

    const liveOrderNumbers = new Set(rows.map((flow) => safeTrim(flow.order_number)).filter(Boolean));
    const missingApprovals = readPoApprovals().filter((record) =>
      record.status !== 'rejected'
      && Boolean(record.poNumber && record.prNumber && record.comparisonId)
      && !liveOrderNumbers.has(record.poNumber)
      && !reconciliationAttemptsRef.current.has(record.poNumber),
    );
    if (!missingApprovals.length) return;

    const controller = new AbortController();
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    if (!baseUrl) return;
    missingApprovals.forEach((record) => reconciliationAttemptsRef.current.add(record.poNumber));

    const reconcile = async () => {
      let forwardedCount = 0;
      await Promise.all(missingApprovals.map(async (record) => {
        try {
          const ordersResponse = await fetch(`${baseUrl}/purchase_flow/get_purchase_orders`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ pr_number: record.prNumber }),
            signal: controller.signal,
          });
          const orderData: any = ordersResponse.ok ? await ordersResponse.json().catch(() => null) : null;
          const orders: any[] = Array.isArray(orderData?.purchase_orders)
            ? orderData.purchase_orders
            : Array.isArray(orderData?.items)
              ? orderData.items
              : Array.isArray(orderData?.orders)
                ? orderData.orders
                : Array.isArray(orderData)
                  ? orderData
                  : [];
          const matchingOrder = orders.find((order) => {
            const quote = asRecord(order?.purchase_quote);
            return [order?.order_number, quote.order_number, quote.poNo, quote.po_no]
              .some((candidate) => safeTrim(candidate) === record.poNumber);
          });
          const quote = asRecord(matchingOrder?.purchase_quote);
          const documents = normalizeRequiredPurchaseDocuments(
            quote.requiredPurchaseDocuments ?? quote.required_purchase_documents,
          );
          const purchaseFlowStage = Object.fromEntries(documents.map((document, index) => [
            `step_${index + 1}`,
            { document: document.toLowerCase() === 'tax invoice' ? 'invoice' : document.toLowerCase(), status: 'empty', doc_link: '' },
          ]));

          const forwardResponse = await fetch(`${baseUrl}/purchase_flow/forward_purchase_order`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order_number: record.poNumber,
              pr_number: record.prNumber,
              comparison_id: record.comparisonId,
              purchase_flow_stage: purchaseFlowStage,
            }),
            signal: controller.signal,
          });
          const result: any = await forwardResponse.json().catch(() => null);
          const success = result?.success === true || String(result?.success ?? '').toLowerCase() === 'true';
          if (!forwardResponse.ok || !success) {
            throw new Error(result?.message || result?.error || `HTTP ${forwardResponse.status}`);
          }

          markPoForwardedToPurchaseFlow(record.poNumber);
          forwardedCount += 1;
        } catch (error: any) {
          if (error?.name === 'AbortError') return;
          reconciliationAttemptsRef.current.delete(record.poNumber);
          toast.error(`Could not add ${record.poNumber} to Purchase Flow: ${error?.message || 'Forwarding failed'}`);
        }
      }));

      if (!controller.signal.aborted && forwardedCount > 0) {
        toast.success(`${forwardedCount} approved PO${forwardedCount === 1 ? '' : 's'} added to Purchase Flow`);
        setFlowRefreshNonce((value) => value + 1);
      }
    };

    void reconcile();
    return () => controller.abort();
  }, [loading, rows]);

  // After all rows are in view, fetch left-panel info row by row (in parallel)
  useEffect(() => {
    if (rows.length === 0) return;
    const ac = new AbortController();
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    if (!baseUrl) return;

    rows.forEach(async (flow) => {
      const comparisonId = safeTrim((flow as any)?.comparison_id);
      if (!comparisonId) return;
      const flowId = safeTrim((flow as any)?.flow_id) || comparisonId;

      setLeftPanelLoadingSet((prev) => new Set([...prev, flowId]));
      try {
        const res = await fetch(`${baseUrl}/purchase_flow/get_left_panel_info/${encodeURIComponent(comparisonId)}`, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          signal: ac.signal,
        });
        if (!res.ok) return;
        const data: LeftPanelInfo = await res.json().catch(() => null);
        if (data) setLeftPanelInfoMap((prev) => ({ ...prev, [flowId]: data }));
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
      } finally {
        setLeftPanelLoadingSet((prev) => { const s = new Set(prev); s.delete(flowId); return s; });
      }
    });

    return () => ac.abort();
  }, [rows]);

  // Read the document requirements saved in each PO. These are intentionally
  // separate from the commercial "Documents Required" clause and become
  // uploadable Purchase Flow steps only.
  useEffect(() => {
    if (rows.length === 0) return;
    const ac = new AbortController();
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    if (!baseUrl) return;

    const loadRequirements = async () => {
      const entries = await Promise.all(rows.map(async (flow) => {
        const flowId = safeTrim((flow as any)?.flow_id) || safeTrim((flow as any)?.comparison_id);
        const prNumber = safeTrim((flow as any)?.pr_number) || safeTrim(leftPanelInfoMap[flowId]?.pr_number);
        if (!prNumber || !flowId || poRequirementLoadsRef.current.has(flowId)) return null;
        poRequirementLoadsRef.current.add(flowId);
        try {
          const res = await fetch(`${baseUrl}/purchase_flow/get_purchase_orders`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ pr_number: prNumber }),
            signal: ac.signal,
          });
          if (!res.ok) {
            poRequirementLoadsRef.current.delete(flowId);
            return null;
          }
          const data: any = await res.json().catch(() => null);
          const orders: any[] = Array.isArray(data?.purchase_orders)
            ? data.purchase_orders
            : Array.isArray(data?.items)
              ? data.items
              : Array.isArray(data?.orders)
                ? data.orders
                : Array.isArray(data)
                  ? data
                  : [];
          if (!orders.length) {
            poRequirementLoadsRef.current.delete(flowId);
            return null;
          }

          const orderNumber = safeTrim((flow as any)?.order_number);
          const matching = orders.find((order) => {
            const quote = asRecord(order?.purchase_quote);
            return [order?.order_number, quote?.order_number, quote?.poNo, quote?.po_no]
              .some((candidate) => safeTrim(candidate) === orderNumber);
          });
          const latest = [...orders].sort((left, right) => {
            const leftDate = Date.parse(safeTrim(left?.updated_at || left?.created_at || left?.saved_at)) || 0;
            const rightDate = Date.parse(safeTrim(right?.updated_at || right?.created_at || right?.saved_at)) || 0;
            return rightDate - leftDate;
          })[0];
          const selectedOrder = matching || latest;
          const quote = asRecord(selectedOrder?.purchase_quote);
          const purchaseOrder = asRecord(selectedOrder?.purchase_order);
          const terms = asRecord(selectedOrder?.other_terms_and_condition);
          const selected = quote.requiredPurchaseDocuments
            ?? quote.required_purchase_documents
            ?? purchaseOrder.requiredPurchaseDocuments
            ?? purchaseOrder.required_purchase_documents;
          const requiredDocuments = normalizeRequiredPurchaseDocuments(selected);
          const details: PurchaseOrderDetails = {
            poNumber: safeTrim(selectedOrder?.order_number || quote.order_number || quote.poNo || quote.po_no || orderNumber),
            poDate: safeTrim(quote.poDate || selectedOrder?.created_at),
            amendmentNo: safeTrim(quote.amendmentNo ?? quote.amendment_no),
            project: safeTrim(quote.coverProject || quote.clusterId || quote.project),
            deliveryDate: safeTrim(quote.deliveryDate || quote.delivery_date),
            paymentTerms: safeTrim(quote.paymentTerms || terms.paymentTerms || terms.payment_terms),
            shipToAddress: safeTrim(quote.shipToAddress || quote.ship_to_address),
            preparedBy: safeTrim(quote.preparedBy || quote.prepared_by),
            requiredDocuments,
            itemDetails: normalizePoItemDetails(
              selectedOrder?.itemDetails,
              selectedOrder?.item_details,
              selectedOrder?.item_row,
              selectedOrder?.items,
              quote.itemDetails,
              quote.item_details,
              quote.item_row,
              quote.items,
            ),
          };
          return { flowId, requiredDocuments, details };
        } catch (error: any) {
          poRequirementLoadsRef.current.delete(flowId);
          if (error?.name === 'AbortError') return null;
          return null;
        }
      }));

      if (ac.signal.aborted) return;
      setRequiredDocsByFlowId((previous) => {
        const next = { ...previous };
        entries.forEach((entry) => {
          if (entry) next[entry.flowId] = entry.requiredDocuments;
        });
        return next;
      });
      setPoDetailsByFlowId((previous) => {
        const next = { ...previous };
        entries.forEach((entry) => {
          if (entry) next[entry.flowId] = entry.details;
        });
        return next;
      });
    };

    loadRequirements();
    return () => ac.abort();
  }, [rows, leftPanelInfoMap]);

  // Aggregate every document already associated with each PO. Purchase Flow
  // stages can contain repeated document types, Accounts can contain multiple
  // invoice records, and GRN can contain multiple receipts for the same PO.
  useEffect(() => {
    if (!rows.length) return;
    const controller = new AbortController();
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    if (!baseUrl) return;

    const loadAllPoDocuments = async () => {
      const paymentResponse = await fetch(`${baseUrl}/admin_accounts/get_payment_flow`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      }).catch(() => null);
      const paymentPayload: any = paymentResponse?.ok ? await paymentResponse.json().catch(() => null) : null;
      const payments: any[] = Array.isArray(paymentPayload?.data) ? paymentPayload.data : [];

      const results = await Promise.all(rows.map(async (flow, flowIndex) => {
        const flowId = safeTrim(flow.flow_id) || safeTrim(flow.comparison_id) || `row-${flowIndex}`;
        const orderNumber = safeTrim(flow.order_number);
        if (!orderNumber) return { flowId, grns: [] as GRNRecord[], documents: [] as PurchaseFlowStep[] };

        const [grns, supportingPayload] = await Promise.all([
          getGrnsByOrder(orderNumber).catch(() => [] as GRNRecord[]),
          fetch(`${baseUrl}/admin_accounts/get_supporting_documents/${encodeURIComponent(orderNumber)}`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          }).then((response) => response.ok ? response.json().catch(() => null) : null).catch(() => null),
        ]);

        const supportingDocs: any[] = Array.isArray(supportingPayload?.data) ? supportingPayload.data : [];
        const invoiceDocs = payments
          .filter((payment) => safeTrim(payment?.order_number) === orderNumber && safeTrim(payment?.invoice_doc_url))
          .map((payment, index) => {
            const rawType = normalizeDocumentName(payment?.invoice_type);
            const document = rawType.includes('proforma') ? 'Proforma Invoice' : 'Tax Invoice';
            return {
              key: `accounts-${safeTrim(payment?.payment_id) || 'record'}-${index}`,
              index: index + 1,
              document,
              documentType: document,
              status: safeTrim(payment?.director_approval_status || payment?.admin_ops_approval_status) || 'uploaded',
              docLink: safeTrim(payment?.invoice_doc_url),
              isExternal: true,
            } satisfies PurchaseFlowStep;
          });
        const supporting = supportingDocs
          .filter((document) => safeTrim(document?.doc_link))
          .map((document, index) => ({
            key: `supporting-${flowId}-${index}`,
            index: invoiceDocs.length + index + 1,
            document: safeTrim(document?.document) || 'Supporting Document',
            documentType: safeTrim(document?.document),
            status: 'uploaded',
            docLink: safeTrim(document?.doc_link),
            isExternal: true,
          } satisfies PurchaseFlowStep));
        // Preserve every invoice/payment record, even when several records have
        // the same document type. Supporting-documents may mirror an invoice
        // record, so suppress only that exact same file URL across the sources.
        const invoiceUrls = new Set(invoiceDocs.map((document) => document.docLink).filter(Boolean));
        const documents = [
          ...invoiceDocs,
          ...supporting.filter((document) => !invoiceUrls.has(document.docLink)),
        ];
        return { flowId, grns, documents };
      }));

      if (controller.signal.aborted) return;
      setGrnsByFlowId(Object.fromEntries(results.map((result) => [result.flowId, result.grns])));
      setAccountDocsByFlowId(Object.fromEntries(results.map((result) => [result.flowId, result.documents])));
    };

    void loadAllPoDocuments();
    return () => controller.abort();
  }, [rows]);

  // Build the same official GRN PDF used by the full-screen preview for every
  // GRN card. Object URLs stay browser-local and are released on refresh.
  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];

    const buildPreviews = async () => {
      const entries = Object.entries(grnsByFlowId).flatMap(([flowId, grns]) =>
        grns.map((grn, index) => ({ flowId, grn, index })),
      );
      const previews = await Promise.all(entries.map(async ({ flowId, grn, index }) => {
        try {
          const { blob } = await buildGrnPdfBlob(grn);
          const url = URL.createObjectURL(blob);
          createdUrls.push(url);
          return [`${flowId}:${safeTrim(grn.grnNo) || 'record'}:${index}`, url] as const;
        } catch {
          return null;
        }
      }));

      if (cancelled) {
        createdUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setGrnPreviewUrlsByKey(Object.fromEntries(previews.filter(Boolean) as Array<readonly [string, string]>));
    };

    void buildPreviews();
    return () => {
      cancelled = true;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [grnsByFlowId]);

  const handleUploadStep = async (flow: ApiPurchaseFlow, step: PurchaseFlowStep, file: File) => {
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    if (!baseUrl) throw new Error('Missing API base URL');

    const orderNumber = safeTrim((flow as any)?.order_number);
    if (!orderNumber) throw new Error('Missing order number on this flow');

    const flowId = safeTrim((flow as any)?.flow_id) || safeTrim((flow as any)?.comparison_id);
    if (!flowId) throw new Error('Missing flow ID');

    const currentSteps = getFlowSteps(flowId, flow);
    const selectedStepIndex = currentSteps.findIndex((candidate) => candidate.key === step.key);
    if (selectedStepIndex < 0) throw new Error('Document step could not be resolved');

    // A PO-required document is initially derived from the saved PO. Persist
    // the expanded flow first so the upload can be linked to a real step_N key.
    let serverStepKey = step.key;
    if (step.isLocal) {
      const persistRes = await fetch(`${baseUrl}/purchase_flow/update_purchase_flow_stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ flow_id: flowId, step_json: buildStepJson(currentSteps) }),
      });
      const persistData: any = await persistRes.json().catch(() => null);
      if (!persistRes.ok || !persistData?.success) {
        throw new Error(persistData?.message || 'Failed to add the required document to Purchase Flow');
      }
      serverStepKey = `step_${selectedStepIndex + 1}`;
    }

    // ── API 1: upload file, receive file_url ─────────────────────────────────
    const formData = new FormData();
    formData.append('document', file);

    const uploadRes = await fetch(
      `${baseUrl}/purchase_flow/upload_purchase_flow_document?order_number=${encodeURIComponent(orderNumber)}`,
      { method: 'POST', body: formData }
    );
    const uploadData: any = await uploadRes.json().catch(() => null);
    if (!uploadRes.ok || !uploadData?.success)
      throw new Error(uploadData?.message || 'File upload failed');

    const fileUrl: string = safeTrim(uploadData.file_url);
    if (!fileUrl) throw new Error('Upload succeeded but no file URL was returned');

    // ── API 2: link file_url to the correct step ─────────────────────────────
    const linkRes = await fetch(`${baseUrl}/purchase_flow/update_doc_link_for_step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        flow_id: flowId,
        document_url: fileUrl,
        step: serverStepKey,
      }),
    });
    const linkData: any = await linkRes.json().catch(() => null);
    if (!linkRes.ok || !linkData?.success)
      throw new Error(linkData?.message || 'Failed to link document to step');

    // ── Update local state so the step shows as uploaded immediately ─────────
    const updatedSteps = currentSteps.map((candidate, index) => ({
      ...candidate,
      key: step.isLocal ? `step_${index + 1}` : candidate.key,
      index: index + 1,
      isLocal: step.isLocal ? false : candidate.isLocal,
      isRequired: candidate.isRequired,
      ...(candidate.key === step.key
        ? { docLink: fileUrl, status: isInvoiceDocType(step.document) ? 'uploaded+accounts_pending' : 'uploaded' }
        : {}),
    }));
    setFlowStepOverrides((prev) => ({ ...prev, [flowId]: updatedSteps }));
    toast.success('Document uploaded successfully');
  };

  const handleCreateFlow = async ({
    orderType,
    orderNumber,
    prNumber,
    vendorId,
    poFile,
    nextProcessSeries,
    budgetAllocations,
  }: {
    orderType: 'PR' | 'SPR';
    orderNumber: string;
    prNumber: string;
    vendorId: string;
    poFile: File | null;
    nextProcessSeries: PoNextProcessId[];
    budgetAllocations: {
      budgetId: string;
      budgetName: string;
      items: { lineItemId: string; lineItem: string; category: string; budgetType: string; totalValue: number; amount: string }[];
    }[];
  }) => {
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    if (!baseUrl) { toast.error('Missing API base URL'); return; }

    try {
      // Step 1: upload PO document if provided
      let orderUrl = '';
      if (poFile) {
        const fd = new FormData();
        fd.append('document', poFile);
        const uploadRes = await fetch(`${baseUrl}/purchase_flow/upload_PO_document`, {
          method: 'POST',
          body: fd,
        });
        const uploadData: any = await uploadRes.json().catch(() => null);
        if (!uploadRes.ok || !uploadData?.success) {
          throw new Error(uploadData?.message || uploadData?.error || `Upload failed (${uploadRes.status})`);
        }
        orderUrl = String(uploadData.file_url || '');
      }

      // Step 2: build budget_allocation dict keyed by budget_id
      const budgetAllocationDict: Record<string, object[]> = {};
      for (const alloc of budgetAllocations) {
        if (alloc.items.length === 0) continue;
        budgetAllocationDict[alloc.budgetId] = alloc.items.map((it, idx) => ({
          row_number: idx + 1,
          category: it.category,
          line_item: it.lineItem,
          type: it.budgetType,
          budgeted: it.totalValue,
          allocated: parseFloat(it.amount) || 0,
        }));
      }

      // Step 3: create purchase flow
      const res = await fetch(`${baseUrl}/purchase_flow/create_new_purchase_flow_manually`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          pr_number: prNumber,
          order_number: orderNumber,
          order_url: orderUrl,
          vendor_id: vendorId,
          order_type: orderType,
          step_json: buildPurchaseFlowStage(nextProcessSeries),
          budget_allocation: budgetAllocationDict,
        }),
      });

      const text = await res.text().catch(() => '');
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }

      if (!res.ok) {
        throw new Error(safeTrim(data?.message) || safeTrim(data?.error) || text || `HTTP ${res.status}`);
      }
      if (data?.success === false) throw new Error(data?.message || 'Create flow failed');

      toast.success(data?.message || 'Purchase flow created');
      setFlowRefreshNonce((n) => n + 1);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create purchase flow');
      throw e;
    }
  };

  const handleForwardToAccounts = async (flowId: string, flow: ApiPurchaseFlow, step: PurchaseFlowStep) => {
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    if (!baseUrl) return toast.error('Missing API base URL');

    const forwardKey = `${flowId}:${step.key}`;
    setForwardingSteps((prev) => new Set([...prev, forwardKey]));

    try {
      const orderNumber = safeTrim((flow as any)?.order_number);
      const info = leftPanelInfoMap[flowId];
      const vendorInfo = info?.vendor_details;

      const res = await fetch(`${baseUrl}/admin_accounts/create_invoice_payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          doc_url: step.docLink,
          order_number: orderNumber,
          vendor_name: vendorInfo?.vendor_name || '',
          vendor_id: info?.approved_vendor_id || '',
          flow_id: flowId,
          step: step.key,
          invoice_type: step.document,
        }),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || 'Failed to forward to accounts');

      const current = getFlowSteps(flowId, flow);
      const updated = current.map((s) =>
        s.key === step.key ? { ...s, status: 'uploaded+accounts_sent' } : s
      );
      setFlowStepOverrides((prev) => ({ ...prev, [flowId]: updated }));
      toast.success(data?.message || 'Forwarded to accounts successfully');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to forward to accounts');
    } finally {
      setForwardingSteps((prev) => { const s = new Set(prev); s.delete(forwardKey); return s; });
    }
  };

  const closeDocumentPreview = () => {
    documentPreviewRequestRef.current += 1;
    setDocumentPreview((current) => {
      if (current?.revokeOnClose && current.url) URL.revokeObjectURL(current.url);
      return null;
    });
  };

  const previewDocument = (title: string, remoteUrl: string) => {
    const sourceUrl = safeTrim(remoteUrl);
    if (!sourceUrl) return;

    setDocumentPreview((current) => {
      if (current?.revokeOnClose && current.url) URL.revokeObjectURL(current.url);
      return { title, url: sourceUrl, sourceUrl };
    });
  };

  const previewGrn = async (grn: GRNRecord) => {
    const title = grn.grnNo ? `GRN — ${grn.grnNo}` : 'Goods Receipt Note';
    const requestId = documentPreviewRequestRef.current + 1;
    documentPreviewRequestRef.current = requestId;
    setDocumentPreview((current) => {
      if (current?.revokeOnClose && current.url) URL.revokeObjectURL(current.url);
      return { title, url: '', loading: true };
    });

    try {
      const { blob } = await buildGrnPdfBlob(grn);
      const previewUrl = URL.createObjectURL(blob);
      if (documentPreviewRequestRef.current !== requestId) {
        URL.revokeObjectURL(previewUrl);
        return;
      }
      setDocumentPreview({
        title,
        url: previewUrl,
        mimeType: 'application/pdf',
        revokeOnClose: true,
      });
    } catch (error: any) {
      if (documentPreviewRequestRef.current === requestId) setDocumentPreview(null);
      toast.error(error?.message || `Unable to preview ${grn.grnNo || 'GRN'}`);
    }
  };

  const flowProgress = (flow: ApiPurchaseFlow, index: number) => {
    const flowId = safeTrim(flow.flow_id) || safeTrim(flow.comparison_id) || `row-${index}`;
    const steps = getDisplaySteps(flowId, flow);
    const completed = steps.filter(isUploaded).length;
    const percentage = steps.length ? Math.round((completed / steps.length) * 100) : 0;
    return { flowId, steps, completed, percentage, isCompleted: steps.length > 0 && completed === steps.length };
  };

  const flowSummaries = rows.map((flow, index) => ({ flow, ...flowProgress(flow, index) }));
  const completedFlowCount = flowSummaries.filter((entry) => entry.isCompleted).length;
  const pendingDocumentCount = flowSummaries.reduce(
    (total, entry) => total + Math.max(entry.steps.length - entry.completed, 0),
    0,
  );
  const visibleRows = flowSummaries.filter(({ flow, isCompleted }) => {
    if (statusFilter === 'completed' && !isCompleted) return false;
    if (statusFilter === 'in-progress' && isCompleted) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    const flowId = safeTrim(flow.flow_id) || safeTrim(flow.comparison_id);
    const info = leftPanelInfoMap[flowId];
    return [
      flow.pr_number,
      flow.order_number,
      flow.order_type,
      flow.comparison_id,
      info?.pr_number,
      info?.approved_vendor_id,
      info?.vendor_details?.vendor_name,
    ].some((value) => safeTrim(value).toLowerCase().includes(query));
  });

  return (
    <div className="min-h-screen space-y-6 bg-slate-50/70 p-4 text-foreground sm:p-6 lg:p-8">
      {uploadTarget ? (
        <UploadStepDocPopup
          title={uploadTarget.step.document}
          onClose={() => setUploadTarget(null)}
          onUpload={(file) => handleUploadStep(uploadTarget.flow, uploadTarget.step, file)}
        />
      ) : null}

      {addToInventoryFor ? (
        <AddToInventoryPopup
          poNumber={addToInventoryFor.poNumber}
          onClose={() => setAddToInventoryFor(null)}
        />
      ) : null}

      {createFlowOpen ? (
        <CreateFlowPopup
          onClose={() => setCreateFlowOpen(false)}
          onCreate={handleCreateFlow}
        />
      ) : null}

      {documentPreview ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDocumentPreview();
          }}
        >
          <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between gap-4 bg-[#0D3A35] px-5 py-4 text-white">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">Document Preview</p>
                  <h2 className="truncate text-base font-bold text-white">{documentPreview.title}</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDocumentPreview}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
                aria-label="Close document preview"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 bg-slate-100 p-3 sm:p-4">
              <div className="h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-inner">
                {documentPreview.loading ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-[#0D3A35]">
                    <RefreshCw className="h-8 w-8 animate-spin" />
                    <p className="text-sm font-bold">Loading document preview…</p>
                  </div>
                ) : documentPreview.error ? (
                  <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                      <FileText className="h-7 w-7" />
                    </span>
                    <div>
                      <p className="font-bold text-slate-900">This document could not be displayed</p>
                      <p className="mt-1 text-sm text-slate-500">{documentPreview.error}</p>
                    </div>
                    {documentPreview.sourceUrl ? (
                      <a
                        href={documentPreview.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl bg-[#0D3A35] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#092d29]"
                      >
                        Open original document
                      </a>
                    ) : null}
                  </div>
                ) : documentPreview.url ? (
                  <InlineDocumentPreview
                    url={documentPreview.url}
                    label={documentPreview.title}
                    interactive
                    mimeType={documentPreview.mimeType}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0D3A35] text-white shadow-lg">
            <GitBranch className="h-7 w-7" />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0D3A35]">Purchase &amp; Procurement</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Purchase Flow</h1>
            <p className="mt-1 text-sm text-slate-500">Track purchase documents from order acceptance through inventory and accounts.</p>
          </div>
        </div>
        <div className="flex self-start gap-2 lg:self-auto">
          <Button
            type="button"
            variant="outline"
            onClick={() => setFlowRefreshNonce((value) => value + 1)}
            disabled={loading}
            className="h-11 gap-2 rounded-xl border-[#0D3A35]/20 bg-white px-4 font-bold text-[#0D3A35] shadow-sm hover:bg-[#0D3A35]/5"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button
            type="button"
            onClick={() => setCreateFlowOpen(true)}
            className="h-11 gap-2 rounded-xl bg-[#0D3A35] px-5 font-bold text-white shadow-sm hover:bg-[#092e2a]"
          >
            <Plus className="h-4 w-4" /> Create Flow
          </Button>
        </div>
      </header>

      <section className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total Purchase Flows', value: rows.length, icon: GitBranch },
          { label: 'Flows In Progress', value: Math.max(rows.length - completedFlowCount, 0), icon: ClipboardList },
          { label: 'Completed Flows', value: completedFlowCount, icon: CircleCheckBig },
          { label: 'Pending Documents', value: pendingDocumentCount, icon: FileText },
        ].map(({ label, value, icon: Icon }, index) => (
          <div
            key={label}
            className={`flex items-center justify-between px-5 py-5 ${index ? 'border-t border-slate-200' : ''} ${index === 1 ? 'sm:border-l sm:border-t-0' : ''} ${index === 2 ? 'sm:border-t sm:border-l-0' : ''} ${index === 3 ? 'sm:border-l sm:border-t' : ''} ${index ? 'xl:border-l xl:border-t-0' : ''}`}
          >
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p>
              <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf5f2] text-[#0D3A35]">
              <Icon className="h-5 w-5" />
            </span>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="font-bold text-slate-900">Purchase Flow Register</h2>
            <p className="mt-0.5 text-xs text-slate-500">Complete documents in sequence and save any changes before uploading.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
            <label className="relative block w-full xl:w-[340px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search PR, PO, vendor or flow"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition focus:border-[#0D3A35] focus:bg-white"
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#0D3A35] focus:bg-white"
            >
              <option value="all">All flows</option>
              <option value="in-progress">In progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        <div className="space-y-4 bg-slate-50/60 p-4 sm:p-5">
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
            Loading purchase flows…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-12 text-center text-sm text-red-700">
            {error}
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
            {rows.length === 0 ? 'No purchase flows found.' : 'No purchase flows match the selected filters.'}
          </div>
        ) : (
          visibleRows.map(({ flow, flowId, isCompleted }) => {
            const prNumber = safeTrim((flow as any)?.pr_number);
            const orderNumber = safeTrim((flow as any)?.order_number);
            const orderType = safeTrim((flow as any)?.order_type);
            const comparisonId = safeTrim((flow as any)?.comparison_id);
            const ts = safeTrim((flow as any)?.timestamp);
            const steps = getDisplaySteps(flowId, flow);
            return (
              <div key={flowId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#edf5f2] text-[#0D3A35]">
                      <GitBranch className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Flow ID</p>
                      <p className="truncate text-sm font-bold text-slate-800">{flowId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${isCompleted ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {isCompleted ? 'Completed' : 'In Progress'}
                    </span>
                  </div>
                </div>
                <div className="grid items-stretch lg:grid-cols-[360px_minmax(0,1fr)]">
                  {(() => {
                    const info = leftPanelInfoMap[flowId];
                    const isLoading = leftPanelLoadingSet.has(flowId);
                    const effectivePrNumber = info?.pr_number || prNumber;
                    const displayPr = effectivePrNumber || '—';
                    const displayOrder = orderNumber || '—';
                    const indentType = orderType || undefined;
                    const vendor = info?.vendor_details;
                    const approvedVendorId = info?.approved_vendor_id;
                    const poDetails = poDetailsByFlowId[flowId];
                    const approvalRecord = poApprovalRecords.find((record) =>
                      (displayOrder !== '—' && record.poNumber === displayOrder) || record.prNumber === effectivePrNumber,
                    );
                    const itemDetails = poDetails?.itemDetails?.length ? poDetails.itemDetails : approvalRecord?.itemDetails || [];
                    const approvedVendorName = vendor?.vendor_name || approvalRecord?.vendorName || approvedVendorId || 'Not recorded';

                    return (
                  <div className="flex w-full min-w-0 flex-col gap-3 border-b border-slate-200 bg-[#f7faf9] px-4 py-4 lg:border-b-0 lg:border-r">

                    {/* Purchase order details */}
                    <div className="overflow-hidden rounded-xl border border-[#0D3A35]/15 bg-white">
                      <div className="flex items-center justify-between bg-[#0D3A35] px-3 py-2 text-white">
                        <div className="flex items-center gap-2">
                          <Receipt className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-bold uppercase tracking-[0.12em]">Purchase Order Details</span>
                        </div>
                        {indentType && (
                          <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${
                            indentType === 'SPR'
                              ? 'border-purple-200 bg-purple-50 text-purple-700'
                              : 'border-blue-200 bg-blue-50 text-blue-700'
                          }`}>
                            {indentType}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-3">
                        {[
                          ['PO Number', poDetails?.poNumber || displayOrder],
                          ['PO Date', poDetails?.poDate ? formatDateDDMMYYYY(poDetails.poDate) : '—'],
                          ['PR Number', displayPr],
                          ['Comparison ID', comparisonId || '—'],
                          ['Amendment', poDetails?.amendmentNo || '0'],
                          ['Delivery Date', poDetails?.deliveryDate ? formatDateDDMMYYYY(poDetails.deliveryDate) : '—'],
                          ['Project / Cluster', poDetails?.project || '—'],
                          ['Prepared By', poDetails?.preparedBy || '—'],
                        ].map(([label, value]) => (
                          <div key={label} className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</p>
                            <p className="mt-0.5 break-words text-[11px] font-semibold leading-snug text-slate-700">{value}</p>
                          </div>
                        ))}
                      </div>
                      {(poDetails?.paymentTerms || poDetails?.shipToAddress) && (
                        <div className="space-y-2 border-t border-slate-100 px-3 py-3">
                          {poDetails.paymentTerms && (
                            <div>
                              <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">Payment Terms</p>
                              <p className="mt-0.5 line-clamp-3 text-[10px] leading-relaxed text-slate-600">{poDetails.paymentTerms}</p>
                            </div>
                          )}
                          {poDetails.shipToAddress && (
                            <div>
                              <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">Ship To</p>
                              <p className="mt-0.5 line-clamp-3 text-[10px] leading-relaxed text-slate-600">{poDetails.shipToAddress}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Approved vendor name only */}
                    {vendor || approvalRecord || approvedVendorId ? (
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-[#0D3A35]">Approved Vendor</div>
                        <div className="mt-1 text-xs font-bold leading-relaxed text-slate-800">{approvedVendorName}</div>
                      </div>
                    ) : isLoading ? (
                      <div className="space-y-2 rounded-lg border border-border bg-background px-3 py-2.5">
                        <div className="h-2.5 w-2/3 rounded bg-muted animate-pulse" />
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-[#0D3A35]">Approved Vendor</div>
                        <div className="mt-1 text-xs font-bold text-slate-800">Not recorded</div>
                      </div>
                    )}

                    {/* Item details */}
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#0D3A35]">Item Details</span>
                        <span className="rounded-full bg-[#e7f3ef] px-2 py-0.5 text-[9px] font-bold text-[#0D3A35]">
                          {itemDetails.length} {itemDetails.length === 1 ? 'Item' : 'Items'}
                        </span>
                      </div>
                      {itemDetails.length ? (
                        <div className="divide-y divide-slate-100">
                          {itemDetails.map((item, itemIndex) => (
                            <div key={`${item.name}-${itemIndex}`} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-2 px-3 py-2.5">
                              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#edf5f2] text-[9px] font-black text-[#0D3A35]">{itemIndex + 1}</span>
                              <span className="text-[11px] font-semibold leading-snug text-slate-800">{item.name}</span>
                              <span className="whitespace-nowrap text-[10px] font-bold text-slate-500">
                                {new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(item.quantity)} {item.uom || ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="px-3 py-4 text-center text-[10px] text-slate-500">No item details recorded for this PO.</div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3 text-[10px] text-slate-500">
                      <span>{ts ? `Updated: ${formatDateTime(ts)}` : ''}</span>
                      <span className="flex items-center gap-1 font-bold text-[#0D3A35]">
                        {savingFlows[flowId] ? (
                          <><RefreshCw className="h-3 w-3 animate-spin" /> Saving…</>
                        ) : (
                          <><Check className="h-3 w-3" /> Auto-saved</>
                        )}
                      </span>
                    </div>

                    {indentType === 'PR' && (
                      <button
                        disabled={!orderNumber}
                        onClick={() => setAddToInventoryFor({ poNumber: orderNumber })}
                        className="mt-2 w-full flex flex-col items-center justify-center gap-1 rounded-lg border border-green-200 bg-green-50 hover:bg-green-100 disabled:opacity-40 text-green-700 px-2 py-2.5 text-[11px] font-medium transition-colors"
                      >
                        <Boxes className="w-4 h-4" />
                        Add to Inventory
                      </button>
                    )}
                  </div>
                    );
                  })()}

                  <div className="flex min-h-[360px] min-w-0 flex-col overflow-x-auto px-4 py-5 lg:min-h-0">
                    {steps.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No steps found for this flow.</div>
                    ) : null}

                    <div className="flex min-w-max flex-1 items-stretch gap-3">
                      {(() => {
                        // Index of the first step that is eligible to be uploaded next
                        // (not yet uploaded AND all previous steps are uploaded)
                        const firstUploadableIdx = steps.findIndex(
                          (st, i) => !isUploaded(st) && steps.slice(0, i).every(prev => isUploaded(prev))
                        );
                        return steps.map((s, stepIdx) => {
                        const uploaded = isUploaded(s);
                        const canOpen = Boolean(s.docLink || s.externalGrn);
                        // A step is blocked for upload when:
                        // 1. The order was changed and not saved yet, OR
                        // 2. A previous step hasn't been uploaded yet
                        const blocked = !uploaded && firstUploadableIdx !== -1 && stepIdx > firstUploadableIdx;

                        const blockReason = (() => {
                          const blocking = steps.slice(0, stepIdx).find(prev => !isUploaded(prev));
                          return blocking ? `Upload "${blocking.document}" first` : '';
                        })();

                        const invoiceAccountsStatus = (() => {
                          const st = s.status.toLowerCase();
                          if (st === 'uploaded+accounts_approved') return 'approved' as const;
                          if (st === 'uploaded+accounts_sent') return 'sent' as const;
                          if (st === 'uploaded+accounts_pending') return 'pending' as const;
                          return null;
                        })();

                        return (
                          <div key={s.key} className="flex h-full items-center gap-3">
                            {/* Step node */}
                            <div className="flex h-full flex-col items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  if (s.externalGrn) { void previewGrn(s.externalGrn); return; }
                                  if (s.docLink) {
                                    void previewDocument(s.displayLabel || s.document, s.docLink);
                                    return;
                                  }
                                  if (blocked) { toast.error(blockReason); return; }
                                  setUploadTarget({ flow, step: s });
                                }}
                                className={`group flex min-h-[300px] w-[328px] flex-1 flex-col items-center gap-1 rounded-xl border bg-white p-3 text-left shadow-sm transition lg:min-h-0 ${blocked ? 'cursor-not-allowed border-slate-200 opacity-70' : 'border-slate-200 hover:-translate-y-0.5 hover:border-[#0D3A35]/30 hover:shadow-md'}`}
                                title={
                                  blocked
                                    ? blockReason
                                    : canOpen ? 'Preview document' : 'Upload document'
                                }
                              >
                                {canOpen ? (
                                  <>
                                    <div className={`min-h-20 w-full flex-1 overflow-hidden rounded-lg border ${invoiceAccountsStatus === 'pending' ? 'border-amber-200 bg-amber-50' : invoiceAccountsStatus === 'sent' ? 'border-blue-200 bg-blue-50' : 'border-emerald-200 bg-emerald-50'}`}>
                                      {s.docLink ? (
                                        <InlineDocumentPreview url={s.docLink} label={s.displayLabel || s.document} />
                                      ) : s.externalGrn ? (
                                        <div className="flex h-full min-h-[260px] flex-col bg-white text-slate-700">
                                          <div className="bg-[#0D3A35] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.14em] text-white">Goods Receipt Note</div>
                                          <div className="grid grid-cols-2 border-b border-slate-200 text-[10px]">
                                            <div className="border-r border-slate-200 p-3"><span className="block font-bold uppercase text-slate-400">GRN No.</span><span className="mt-1 block font-bold text-slate-800">{s.externalGrn.grnNo || '—'}</span></div>
                                            <div className="p-3"><span className="block font-bold uppercase text-slate-400">GRN Date</span><span className="mt-1 block font-bold text-slate-800">{formatDateDDMMYYYY(s.externalGrn.grnDate)}</span></div>
                                          </div>
                                          <div className="grid grid-cols-2 border-b border-slate-200 text-[10px]">
                                            <div className="border-r border-slate-200 p-3"><span className="block font-bold uppercase text-slate-400">Invoice No.</span><span className="mt-1 block font-semibold">{s.externalGrn.invNo || '—'}</span></div>
                                            <div className="p-3"><span className="block font-bold uppercase text-slate-400">Status</span><span className="mt-1 block font-semibold capitalize">{safeTrim(s.externalGrn.status).replace(/_/g, ' ')}</span></div>
                                          </div>
                                          <div className="flex-1 p-3 text-left">
                                            <span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">Items</span>
                                            {(s.externalGrn.items || []).slice(0, 5).map((item, itemIndex) => (
                                              <div key={`${s.externalGrn?.grnNo}-${itemIndex}`} className="mt-2 flex justify-between gap-2 border-b border-slate-100 pb-1.5 text-[10px]">
                                                <span className="line-clamp-1 font-semibold">{item.description || item.itemCode || `Item ${itemIndex + 1}`}</span>
                                                <span className="whitespace-nowrap font-bold">{item.receivedQty} {item.uom}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                    <div className="w-full pt-1.5">
                                      <p className="text-sm font-bold capitalize leading-tight text-slate-800">{s.displayLabel || s.document}</p>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className={`flex min-h-20 w-full flex-1 items-center justify-center rounded-lg border border-dashed ${blocked ? 'border-slate-200 bg-slate-50' : 'border-[#0D3A35]/25 bg-[#f7faf9] group-hover:bg-[#edf5f2]'}`}>
                                      <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-bold ${blocked ? 'bg-slate-100 text-slate-400' : 'bg-[#0D3A35] text-white shadow-sm'}`}>
                                        {blocked ? <Lock className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
                                        Upload
                                      </span>
                                    </div>
                                    <div className="w-full pt-1.5">
                                      <p className={`text-sm font-bold capitalize leading-tight ${blocked ? 'text-slate-400' : 'text-slate-800'}`}>{s.displayLabel || s.document}</p>
                                    </div>
                                  </>
                                )}
                              </button>

                              {/* Accounts status actions — only for invoice / proforma invoice steps */}
                              {uploaded && isInvoiceDocType(s.document) && (
                                invoiceAccountsStatus === 'pending' ? (
                                  <button
                                    type="button"
                                    disabled={forwardingSteps.has(`${flowId}:${s.key}`)}
                                    onClick={() => handleForwardToAccounts(flowId, flow, s)}
                                    className="mt-1 px-2 py-1 text-[10px] font-semibold rounded-md bg-yellow-400 hover:bg-yellow-500 disabled:opacity-60 disabled:cursor-not-allowed text-yellow-900 transition-colors whitespace-nowrap"
                                  >
                                    {forwardingSteps.has(`${flowId}:${s.key}`) ? 'Forwarding…' : 'Forward to Accounts'}
                                  </button>
                                ) : invoiceAccountsStatus === 'sent' ? (
                                  <span className="mt-1 px-2 py-1 text-[10px] font-semibold rounded-md bg-blue-100 text-blue-700 whitespace-nowrap">
                                    Sent to Accounts
                                  </span>
                                ) : invoiceAccountsStatus === 'approved' ? (
                                  <span className="mt-1 px-2 py-1 text-[10px] font-semibold rounded-md bg-green-100 text-green-700 whitespace-nowrap">
                                    Accounts Approved
                                  </span>
                                ) : null
                              )}
                            </div>

                            {/* Arrow connector */}
                            {stepIdx < steps.length - 1 ? (
                              <div className="text-muted-foreground">
                                <ArrowRight className="w-4 h-4" />
                              </div>
                            ) : null}
                          </div>
                        );
                      });
                    })()}

                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        </div>
      </section>
    </div>
  );
}
