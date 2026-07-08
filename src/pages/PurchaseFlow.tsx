import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Boxes, Building2, Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, FileText, Lock, Phone, Plus, Receipt, SendHorizonal, Upload, User, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';

import { Button } from '@/components/ui/button';
import getBaseUrl from '@/lib/config';
import { toast } from 'sonner';

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
  status: string;
  docLink: string;
  isLocal?: boolean; // true for user-inserted invoice steps (not from API)
};

const safeTrim = (v: unknown) => String(v ?? '').trim();

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

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
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return v;
  try {
    return new Intl.DateTimeFormat('en-IN', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
};

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
  const navigate = useNavigate();
  const [flows, setFlows] = useState<ApiPurchaseFlow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<{
    flow: ApiPurchaseFlow;
    step: PurchaseFlowStep;
  } | null>(null);
  const [addToInventoryFor, setAddToInventoryFor] = useState<{ poNumber: string } | null>(null);
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  const [flowRefreshNonce, setFlowRefreshNonce] = useState(0);
  const [forwardingSteps, setForwardingSteps] = useState<Set<string>>(new Set());

  // Per-flow merged step lists (API steps + locally inserted invoice steps)
  const [flowStepOverrides, setFlowStepOverrides] = useState<Record<string, PurchaseFlowStep[]>>({});
  // Which flow's "+ Add Invoice" dropdown is open
  const [addMenuOpenFor, setAddMenuOpenFor] = useState<string | null>(null);

  const getFlowSteps = (flowId: string, flow: ApiPurchaseFlow): PurchaseFlowStep[] =>
    flowStepOverrides[flowId] ?? parseSteps((flow as any)?.purchase_flow_stage);

  const toggleLocalStepDone = (flowId: string, flow: ApiPurchaseFlow, stepKey: string) => {
    const current = getFlowSteps(flowId, flow);
    setFlowStepOverrides((prev) => ({
      ...prev,
      [flowId]: current.map((s) =>
        s.key === stepKey ? { ...s, status: s.status === 'completed' ? 'empty' : 'completed' } : s
      ),
    }));
  };

  const addInvoiceStep = (flowId: string, flow: ApiPurchaseFlow, docType: 'Proforma Invoice' | 'Invoice' | 'PRR (for payment)' | 'PRR (for accounting)') => {
    const current = getFlowSteps(flowId, flow);
    const newStep: PurchaseFlowStep = {
      key: `local-${Date.now()}`,
      index: current.length + 1,
      document: docType,
      status: 'empty',
      docLink: '',
      isLocal: true,
    };
    setFlowStepOverrides((prev) => ({ ...prev, [flowId]: [...current, newStep] }));
    setAddMenuOpenFor(null);
  };

  const moveStep = (flowId: string, flow: ApiPurchaseFlow, stepKey: string, dir: 'left' | 'right') => {
    const current = getFlowSteps(flowId, flow);
    const idx = current.findIndex((s) => s.key === stepKey);
    if (idx === -1) return;
    const target = dir === 'left' ? idx - 1 : idx + 1;
    if (target < 0 || target >= current.length) return;
    const next = [...current];
    [next[idx], next[target]] = [next[target], next[idx]];
    setFlowStepOverrides((prev) => ({ ...prev, [flowId]: next }));
    // Mark this flow as having an unsaved reorder — blocks uploads until saved
    setPendingReorderSet((prev) => new Set([...prev, flowId]));
  };

  const removeLocalStep = (flowId: string, flow: ApiPurchaseFlow, stepKey: string) => {
    const current = getFlowSteps(flowId, flow);
    setFlowStepOverrides((prev) => ({ ...prev, [flowId]: current.filter((s) => s.key !== stepKey) }));
  };

  // Per-flow save loading state
  const [savingFlows, setSavingFlows] = useState<Record<string, boolean>>({});

  // Tracks flows whose steps have been reordered but not yet saved.
  // Upload is blocked for these flows until the user saves.
  const [pendingReorderSet, setPendingReorderSet] = useState<Set<string>>(new Set());

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

  const saveCurrentFlow = async (flowId: string, flow: ApiPurchaseFlow, stepsOverride?: PurchaseFlowStep[]) => {
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
      // Clear the pending-reorder flag so uploads are unblocked
      setPendingReorderSet((prev) => { const s = new Set(prev); s.delete(flowId); return s; });
      toast.success('Purchase flow saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save purchase flow');
    } finally {
      setSavingFlows((prev) => { const c = { ...prev }; delete c[flowId]; return c; });
    }
  };

  const openHoInboxView = (prNumberRaw: string, tab: 'po' | 'indent' | 'comparative') => {
    const prNumber = safeTrim(prNumberRaw);
    if (!prNumber) {
      toast.error('Missing PR number');
      return;
    }
    const qs = new URLSearchParams({ open: prNumber, tab }).toString();
    navigate(`/ho?${qs}`);
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

  const handleUploadStep = async (flow: ApiPurchaseFlow, step: PurchaseFlowStep, file: File) => {
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    if (!baseUrl) throw new Error('Missing API base URL');

    const orderNumber = safeTrim((flow as any)?.order_number);
    if (!orderNumber) throw new Error('Missing order number on this flow');

    const flowId = safeTrim((flow as any)?.flow_id) || safeTrim((flow as any)?.comparison_id);
    if (!flowId) throw new Error('Missing flow ID');

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
    // Local steps (added via "+ Add Invoice") don't have a server-side step key.
    // Only call API 2 for steps that came from the server (key matches step_N).
    if (!step.isLocal) {
      const linkRes = await fetch(`${baseUrl}/purchase_flow/update_doc_link_for_step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          flow_id: flowId,
          document_url: fileUrl,
          step: step.key,          // e.g. "step_1", "step_2", …
        }),
      });
      const linkData: any = await linkRes.json().catch(() => null);
      if (!linkRes.ok || !linkData?.success)
        throw new Error(linkData?.message || 'Failed to link document to step');
    }

    // ── Update local state so the step shows as uploaded immediately ─────────
    const updatedSteps = getFlowSteps(flowId, flow).map((s) =>
      s.key === step.key
        ? { ...s, docLink: fileUrl, status: isInvoiceDocType(step.document) ? 'uploaded+accounts_pending' : 'uploaded' }
        : s
    );
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
      const vendorInfo = leftPanelInfoMap[flowId]?.vendor_details;

      const res = await fetch(`${baseUrl}/admin_accounts/create_invoice_payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          doc_url: step.docLink,
          order_number: orderNumber,
          vendor_name: vendorInfo?.vendor_name || '',
          vendor_id: vendorInfo?.approved_vendor_id || '',
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

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
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

      <div className="mb-6">
        <div className="text-2xl font-bold">Purchase Flow</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Each purchase flow is a row. Steps come from the API as step_1, step_2, … — upload the required document in the empty step.
        </div>
        <Button type="button" onClick={() => setCreateFlowOpen(true)} className="mt-3 gap-2">
          <Plus className="w-4 h-4" />
          Create Flow
        </Button>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground text-center">
            Loading purchase flows…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground text-center">
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground text-center">
            No purchase flows found.
          </div>
        ) : (
          rows.map((flow, idx) => {
            const flowId = safeTrim((flow as any)?.flow_id) || safeTrim((flow as any)?.comparison_id) || `row-${idx}`;
            const prNumber = safeTrim((flow as any)?.pr_number);
            const orderNumber = safeTrim((flow as any)?.order_number);
            const orderType = safeTrim((flow as any)?.order_type);
            const comparisonId = safeTrim((flow as any)?.comparison_id);
            const ts = safeTrim((flow as any)?.timestamp);
            const steps = getFlowSteps(flowId, flow);
            const isMenuOpen = addMenuOpenFor === flowId;

            return (
              <div key={flowId} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-stretch gap-0 flex-wrap">
                  {(() => {
                    const info = leftPanelInfoMap[flowId];
                    const isLoading = leftPanelLoadingSet.has(flowId);
                    const effectivePrNumber = info?.pr_number || prNumber;
                    const displayPr = effectivePrNumber || '—';
                    const displayOrder = orderNumber || '—';
                    const indentType = orderType || undefined;
                    const vendor = info?.vendor_details;
                    const approvedVendorId = info?.approved_vendor_id;

                    return (
                  <div className="w-[280px] shrink-0 border-r border-border px-4 py-4 bg-muted/30 flex flex-col gap-3">

                    {/* PR number + indent type badge */}
                    <div>
                      <div className="flex items-start gap-2">
                        <span className="font-semibold text-sm leading-snug break-all">{displayPr}</span>
                        {indentType && (
                          <span className={`shrink-0 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                            indentType === 'SPR'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {indentType}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 break-all">{displayOrder}</div>
                    </div>

                    {/* Vendor details */}
                    {vendor ? (
                      <div className="rounded-lg border border-border bg-background px-3 py-2.5 space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Vendor</div>
                        {vendor.vendor_name && (
                          <div className="text-xs font-semibold text-foreground">{vendor.vendor_name}</div>
                        )}
                        {approvedVendorId && (
                          <div className="text-[11px] text-muted-foreground">{approvedVendorId}</div>
                        )}
                        {vendor.vendor_contact && (
                          <div className="text-[11px] text-muted-foreground">{vendor.vendor_contact}</div>
                        )}
                        {vendor.e_mail_id && (
                          <div className="text-[11px] text-muted-foreground">{vendor.e_mail_id}</div>
                        )}
                        {vendor.vendor_address && (
                          <div className="text-[11px] text-muted-foreground">{vendor.vendor_address}</div>
                        )}
                        {vendor.gst_number && (
                          <div className="text-[11px] text-muted-foreground">GST: {vendor.gst_number}</div>
                        )}
                      </div>
                    ) : isLoading ? (
                      <div className="space-y-2 rounded-lg border border-border bg-background px-3 py-2.5">
                        <div className="h-2.5 w-2/3 rounded bg-muted animate-pulse" />
                        <div className="h-2.5 w-1/2 rounded bg-muted animate-pulse" />
                        <div className="h-2.5 w-3/4 rounded bg-muted animate-pulse" />
                      </div>
                    ) : null}

                    {/* Timestamp */}
                    {ts && (
                      <div className="text-[11px] text-muted-foreground">Updated: {formatDateTime(ts)}</div>
                    )}

                    <div className="flex items-stretch gap-2">
                      <button
                        disabled={!!savingFlows[flowId]}
                        onClick={() => saveCurrentFlow(flowId, flow)}
                        className="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-2 py-2.5 text-[11px] font-medium transition-colors"
                      >
                        <Check className="w-4 h-4" />
                        {savingFlows[flowId] ? 'Saving…' : 'Save Current'}
                      </button>
                      <button
                        disabled={!effectivePrNumber}
                        onClick={() => openHoInboxView(effectivePrNumber, 'po')}
                        className="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 text-gray-700 px-2 py-2.5 text-[11px] font-medium transition-colors"
                      >
                        <Receipt className="w-4 h-4" />
                        View Order
                      </button>
                      <button
                        disabled={!effectivePrNumber}
                        onClick={() => openHoInboxView(effectivePrNumber, 'indent')}
                        className="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 text-gray-700 px-2 py-2.5 text-[11px] font-medium transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                        View Indent
                      </button>
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

                  <div className="flex-1 px-4 py-4 overflow-x-auto">
                    {steps.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No steps found for this flow.</div>
                    ) : null}

                    {/* Warning banner when step order has been changed but not saved */}
                    {pendingReorderSet.has(flowId) && (
                      <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 font-medium">
                        <Lock className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                        Step order changed — save first before uploading any documents.
                      </div>
                    )}

                    <div className="min-w-max flex items-center gap-3">
                      {(() => {
                        const hasReorderPending = pendingReorderSet.has(flowId);
                        // Index of the first step that is eligible to be uploaded next
                        // (not yet uploaded AND all previous steps are uploaded)
                        const firstUploadableIdx = steps.findIndex(
                          (st, i) => !isUploaded(st) && steps.slice(0, i).every(prev => isUploaded(prev))
                        );
                        return steps.map((s, stepIdx) => {
                        const uploaded = isUploaded(s);
                        const canOpen = Boolean(s.docLink);
                        const isFirst = stepIdx === 0;
                        const isLast = stepIdx === steps.length - 1;

                        // A step is blocked for upload when:
                        // 1. The order was changed and not saved yet, OR
                        // 2. A previous step hasn't been uploaded yet
                        const blocked = !uploaded && (
                          hasReorderPending ||
                          (firstUploadableIdx !== -1 && stepIdx > firstUploadableIdx)
                        );

                        const blockReason = hasReorderPending
                          ? 'Save the current order before uploading'
                          : (() => {
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
                          <div key={s.key} className="flex items-center gap-3">
                            {/* Step node */}
                            <div className="flex flex-col items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  if (s.isLocal && s.status !== 'completed') return;
                                  if (canOpen) { window.open(s.docLink, '_blank'); return; }
                                  if (blocked) { toast.error(blockReason); return; }
                                  setUploadTarget({ flow, step: s });
                                }}
                                className={`group flex flex-col items-center gap-1 ${blocked ? 'cursor-not-allowed' : ''}`}
                                title={
                                  blocked
                                    ? blockReason
                                    : s.isLocal && s.status !== 'completed'
                                      ? s.document
                                      : canOpen ? 'Open document' : 'Upload document'
                                }
                              >
                                <div className={
                                  'w-20 h-20 rounded-full border-2 flex flex-col items-center justify-center transition-colors ' +
                                  (uploaded
                                    ? invoiceAccountsStatus === 'pending'
                                      ? 'border-yellow-400 bg-yellow-50'
                                      : invoiceAccountsStatus === 'sent'
                                        ? 'border-blue-400 bg-blue-50'
                                        : 'border-green-500 bg-green-50'
                                    : blocked
                                      ? 'border-gray-200 bg-gray-50 opacity-50'
                                      : s.isLocal && s.status !== 'completed'
                                        ? 'border-blue-400 bg-blue-50'
                                        : !s.isLocal && !s.docLink && s.status === 'completed'
                                          ? 'border-green-500 bg-green-50'
                                          : 'border-dashed border-border bg-background hover:bg-muted')
                                }>
                                  {uploaded ? (
                                    invoiceAccountsStatus === 'pending' ? (
                                      <FileText className="w-5 h-5 text-yellow-600" />
                                    ) : invoiceAccountsStatus === 'sent' ? (
                                      <FileText className="w-5 h-5 text-blue-600" />
                                    ) : (
                                      <FileText className="w-5 h-5 text-green-700" />
                                    )
                                  ) : blocked ? (
                                    <Lock className="w-5 h-5 text-gray-400" />
                                  ) : s.isLocal && s.status !== 'completed' ? (
                                    <Receipt className="w-5 h-5 text-blue-600" />
                                  ) : !s.isLocal && !s.docLink && s.status === 'completed' ? (
                                    <Check className="w-5 h-5 text-green-600" />
                                  ) : (
                                    <Plus className="w-7 h-7 text-muted-foreground group-hover:text-foreground" />
                                  )}
                                  <div className="text-[10px] mt-1 font-semibold text-muted-foreground">
                                    {uploaded
                                      ? invoiceAccountsStatus === 'pending'
                                        ? 'Pending'
                                        : invoiceAccountsStatus === 'sent'
                                          ? 'Sent'
                                          : invoiceAccountsStatus === 'approved'
                                            ? 'Approved'
                                            : 'Uploaded'
                                      : blocked
                                        ? 'Locked'
                                        : s.isLocal && s.status !== 'completed'
                                          ? 'New'
                                          : !s.isLocal && !s.docLink && s.status === 'completed'
                                            ? 'Done'
                                            : 'Upload'}
                                  </div>
                                </div>
                                <div className={
                                  'text-[10px] font-medium text-center max-w-[88px] leading-tight ' +
                                  (blocked
                                    ? 'text-gray-400'
                                    : s.isLocal && s.status !== 'completed'
                                      ? 'text-blue-700 font-semibold'
                                      : !s.isLocal && !s.docLink && s.status === 'completed'
                                        ? 'text-green-700 font-semibold'
                                        : '')
                                }>
                                  {s.document}
                                </div>
                              </button>

                              {/* Move + remove controls — shown on any step without a doc_link */}
                              {!s.docLink && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <button
                                    type="button"
                                    onClick={() => moveStep(flowId, flow, s.key, 'left')}
                                    disabled={isFirst}
                                    title="Move left"
                                    className="h-5 w-5 rounded flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                  >
                                    <ChevronLeft className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => toggleLocalStepDone(flowId, flow, s.key)}
                                    title={s.status === 'completed' ? 'Mark as pending' : 'Mark as done'}
                                    className={
                                      'h-5 w-5 rounded flex items-center justify-center border transition-colors ' +
                                      (s.status === 'completed'
                                        ? 'border-green-400 bg-green-100 text-green-700 hover:bg-green-50'
                                        : 'border-gray-200 bg-white text-gray-400 hover:bg-green-50 hover:border-green-300 hover:text-green-600')
                                    }
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeLocalStep(flowId, flow, s.key)}
                                    title="Remove"
                                    className="h-5 w-5 rounded flex items-center justify-center border border-red-200 bg-white text-red-400 hover:bg-red-50 transition-colors"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveStep(flowId, flow, s.key, 'right')}
                                    disabled={isLast}
                                    title="Move right"
                                    className="h-5 w-5 rounded flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                  >
                                    <ChevronRight className="w-3 h-3" />
                                  </button>
                                </div>
                              )}

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

                      {/* Arrow before add button when steps exist */}
                      {steps.length > 0 && (
                        <div className="text-muted-foreground">
                          <ArrowRight className="w-4 h-4" />
                        </div>
                      )}

                      {/* + Add Invoice button with dropdown */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setAddMenuOpenFor(isMenuOpen ? null : flowId)}
                          className="flex flex-col items-center gap-1 group"
                          title="Add invoice step"
                        >
                          <div className="w-20 h-20 rounded-full border-2 border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-50 flex flex-col items-center justify-center transition-colors">
                            <Plus className="w-6 h-6 text-blue-500 group-hover:text-blue-700" />
                            <div className="text-[10px] mt-1 font-semibold text-blue-500 group-hover:text-blue-700">Add</div>
                          </div>
                          <div className="text-[10px] font-medium text-blue-600 text-center max-w-[88px] leading-tight">
                            Invoice Step
                          </div>
                        </button>

                        {/* Dropdown */}
                        {isMenuOpen && (
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-30 w-44 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                            <div className="px-3 py-2 border-b border-border bg-muted/30">
                              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Choose type</p>
                            </div>
                            {(['Proforma Invoice', 'Invoice', 'PRR (for payment)', 'PRR (for accounting)'] as const).map((type) => (
                              <button
                                key={type}
                                type="button"
                                onClick={() => addInvoiceStep(flowId, flow, type)}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                              >
                                <Receipt className="w-4 h-4 text-blue-500 shrink-0" />
                                {type}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setAddMenuOpenFor(null)}
                              className="w-full flex items-center justify-center px-3 py-2 text-xs text-muted-foreground hover:bg-muted border-t border-border transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
