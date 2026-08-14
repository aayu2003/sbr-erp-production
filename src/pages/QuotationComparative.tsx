import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Printer, RotateCcw, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getBaseUrl } from '@/lib/config';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { formatDateTimeDDMMYYYY } from '@/lib/dateFormat';
import logo3f from '@/Assets/3f-logo.png';

type QuoteVendor = {
  id: string;
  name: string;
  phone?: string;
  location?: string;
  directoryVendorId?: string; // selected vendor from Vendor Directory
  contactPerson?: string;
  email?: string;
  gstin?: string;
  quotationNo?: string;
  quotationDate?: string;
  quotationValidTill?: string;
  currency?: string;
  attachmentName?: string;
  attachmentUrl?: string;
  revisedQuotationNo?: string;
  revisedQuotationDate?: string;
  isManual?: boolean;
};

type RequirementType = 'Goods' | 'Service' | 'Works' | 'Rental' | 'Transport' | 'Mixed';
type QuotationTemplate = 'General Purchase' | 'Service' | 'Works Contract' | 'Rental / Hire' | 'Transportation' | 'Manpower' | 'Agriculture Activity' | 'Custom';
type ComparisonBasis = 'Landed Cost' | 'Basic Cost' | 'Monthly Cost' | 'Per Acre' | 'L1' | 'Custom';
type TaxType = 'GST' | 'IGST' | 'CGST + SGST' | 'Exempt' | 'RCM' | 'Nil Rated' | 'Inclusive of Tax';

type PrItem = {
  id: string;
  srNo: number;
  partName: string;
  specification?: string;
  hsnSac?: string;
  uom: string;
  qty: number;
  gstPercent?: number;
  taxType?: TaxType;
};

type VendorQuote = {
  vendorId: string;
  unitRateByItemId: Record<string, number>; // itemId -> unitRate
  discountPercentByItemId?: Record<string, number>;
};

type ChargeAdjustment = {
  id: string;
  label: string;
  nature: 'Charge' | 'Discount';
  calculation: 'Fixed' | '% of Basic';
  taxPercent: number;
  values: Record<string, number>;
};

type ComparisonParameter = {
  id: string;
  label: string;
  values: Record<string, string>;
  standard?: boolean;
};

type TechnicalParameter = {
  id: string;
  label: string;
  requiredValue: string;
  values: Record<string, string>;
};

type ScopeResponsibility = {
  id: string;
  label: string;
  assignedTo: 'Company' | 'Vendor' | 'Shared';
  remarks: string;
};

type Comparative = {
  indentId: string;
  indentType?: 'PR' | 'SPR';
  title: string;
  subTitle?: string;
  comparisonNo?: string;
  revision?: number;
  revisionOf?: string;
  revisionDate?: string;
  indentDate?: string;
  department?: string;
  projectCluster?: string;
  deliveryLocation?: string;
  requirementType?: RequirementType;
  comparisonBasis?: ComparisonBasis;
  quotationTemplate?: QuotationTemplate;
  requiredByDate?: string;
  preparedBy?: string;
  purposeRemarks?: string;
  vendors: QuoteVendor[];
  items: PrItem[];
  quotes: VendorQuote[];
  isDraft?: boolean;
  technicalRecommendationVendorId?: string;
  lastSavedAt?: string; // ISO or backend timestamp string
  lastSavedSource?: 'server' | 'local';
  // summary rows
  paymentTerms?: Record<string, string>; // vendorId -> text
  deliveryTimeline?: Record<string, string>;
  priceBasis?: Record<string, string>;
  warranty?: Record<string, string>;
  loading?: Record<string, string>;
  unloading?: Record<string, string>;
  vendorStatus?: Record<string, string>;
  gstPercent?: number; // legacy sheet-level (fallback)
  freightCharges?: Record<string, number>; // vendorId -> amount
  otherCharges?: Record<string, number>; // vendorId -> amount (includes any tax-like extras)
  charges?: ChargeAdjustment[];
  comparisonParameters?: ComparisonParameter[];
  technicalParameters?: TechnicalParameter[];
  scopeResponsibilities?: ScopeResponsibility[];
  technicalStatus?: Record<string, string>;
  commercialStatus?: Record<string, string>;
  recommendationReason?: string;
  procurementRemarks?: string;
  awardStrategy?: 'Single Vendor' | 'Split Order' | 'Item-wise Award';
  itemDiscountAmount?: Record<string, number>;
  additionalChargesAmount?: Record<string, number>;
  commercialDiscountAmount?: Record<string, number>;
  roundOffAmount?: Record<string, number>;
  // legacy fields kept for previously saved data
  baseAmountA?: Record<string, number>;
  baseAmountB?: Record<string, number>;
};

const genId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const todayIso = () => new Date().toISOString().slice(0, 10);

const toDateInputValue = (value: unknown): string | undefined => {
  const raw = safeTrim(value);
  if (!raw) return undefined;
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const indianMatch = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (indianMatch) return `${indianMatch[3]}-${indianMatch[2]}-${indianMatch[1]}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
};
const comparisonNumberFor = (indent: string) => `CCS/${String(indent || 'PR').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}/${todayIso().replace(/-/g, '')}`;

const STANDARD_TERMS = [
  'Payment Terms',
  'Delivery / Completion Period',
  'Price Basis',
  'Quotation Validity',
  'Warranty / Guarantee',
  'Delivery / Work Location',
  'Taxes',
  'Freight',
];

const TEMPLATE_PARAMETERS: Record<QuotationTemplate, string[]> = {
  'General Purchase': ['Loading', 'Unloading', 'Installation', 'Transit Insurance', 'After Sales Support'],
  Service: ['Manpower', 'Tools & Tackles', 'Material Scope', 'Company Scope', 'Vendor Scope'],
  'Works Contract': ['Mobilization', 'Performance Guarantee', 'Security Deposit', 'Retention', 'LD Clause'],
  'Rental / Hire': ['Rental Period', 'Working Hours', 'Fuel Scope', 'Operator Scope', 'Mobilization', 'Overtime'],
  Transportation: ['Vehicle Type', 'Distance Basis', 'Fuel Scope', 'Loading', 'Unloading', 'Transit Insurance'],
  Manpower: ['Skill Category', 'Working Hours', 'Overtime', 'Accommodation', 'Tools & Tackles'],
  'Agriculture Activity': ['Rate / Acre', 'Area', 'Labour Scope', 'Tractor Scope', 'Diesel Scope', 'Material Scope'],
  Custom: [],
};

const makeStandardTerms = (): ComparisonParameter[] => STANDARD_TERMS.map((label) => ({ id: genId(), label, values: {}, standard: true }));

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="space-y-1.5">
    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
    {children}
  </label>
);

const SelectBox = ({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) => (
  <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring">
    {options.map((option) => <option key={option} value={option}>{option}</option>)}
  </select>
);

const inr = (n: number) => {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `₹${Math.round(n)}`;
  }
};

const getApiBaseUrl = () => String(getBaseUrl() ?? '').replace(/\/$/, '');

const safeTrim = (v: unknown) => String(v ?? '').trim();

const toIsoNow = () => new Date().toISOString();

const formatDateTime = (raw?: string) => {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  return formatDateTimeDDMMYYYY(v, v);
};

type DirectoryVendor = {
  id: string;
  name: string;
  phone?: string;
  address?: string;
};

const DUMMY_DIRECTORY_VENDORS: DirectoryVendor[] = [
  { id: 'dv-1', name: 'CHHATTISGARH PORTABLE INFRATECH', phone: '9165271111', address: 'Bhilai, Chhattisgarh' },
  { id: 'dv-2', name: 'MAHAKAL PORTABLE CABIN & FABRICATION', phone: '9702430797', address: 'Durg, Chhattisgarh' },
  { id: 'dv-3', name: 'SHREE BALAJI FABRICATION WORKS', phone: '9000000000', address: 'Raipur, Chhattisgarh' },
];

type GetVendorsApiVendor = {
  vendor_id?: unknown;
  vendor_name?: unknown;
  vendor_address?: unknown;
  vendor_contact?: unknown;
};

type GetComparativeDraftItemRow = {
  item_name?: unknown;
  UoM?: unknown;
  gst_percentage?: unknown;
  quantity?: unknown;
  specification?: unknown;
  hsn_sac?: unknown;
  tax_type?: unknown;
};

type GetComparativeDraftQuoter = {
  vendor_id?: unknown;
  item_costing?: unknown;
  freight_charges?: unknown;
  other_charges?: unknown;
  subtotal?: unknown;
  total_amount?: unknown;
  payment_terms?: unknown;
  delivery_time?: unknown;
  warrenty_garantee?: unknown;
};

type GetComparativeDraftItem = {
  created_at?: unknown;
  pr_number?: unknown;
  item_row?: unknown;
  quoters?: unknown;
  comparision_id?: unknown;
  status?: unknown;
};

type GetComparativeDraftResponse = {
  items?: unknown;
};

const fetchComparativeDraft = async (prNumber: string): Promise<GetComparativeDraftItem | null> => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error('API base URL is not set');

  const url = `${baseUrl}/purchase_flow/get_comparative_statement_draft`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pr_number: prNumber }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `HTTP ${res.status}`);
  }

  const data: GetComparativeDraftResponse | null = await res.json().catch(() => null);
  const items = Array.isArray((data as any)?.items) ? ((data as any).items as GetComparativeDraftItem[]) : [];
  return items[0] ?? null;
};

const fetchIndentByPrNumber = async (
  prNumber: string,
): Promise<{ items: PrItem[]; indentType: 'PR' | 'SPR'; indentDate?: string; department?: string; project?: string; deliveryLocation?: string; requiredByDate?: string; preparedBy?: string; purpose?: string }> => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return { items: [], indentType: 'PR' };

  const res = await fetch(`${baseUrl}/purchase_flow/get_indents`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return { items: [], indentType: 'PR' };

  const data: any = await res.json().catch(() => null);
  const indents: any[] = Array.isArray(data?.indents) ? data.indents : [];
  const indent = indents.find((r: any) => safeTrim(r?.pr_number) === prNumber);
  if (!indent) return { items: [], indentType: 'PR' };

  const isSpr = Boolean(indent.indent_data?.area_of_service || indent.indent_data?.name_of_service);
  const itemRows: any[] = Array.isArray(indent.indent_data?.item_row) ? indent.indent_data.item_row : [];

  const items: PrItem[] = itemRows.map((it: any, idx: number) => {
    if (isSpr) {
      const name = safeTrim(it?.service_description) || `Service ${idx + 1}`;
      return {
        id: stableItemId(name, idx),
        srNo: idx + 1,
        partName: name,
        uom: safeTrim(it?.uom) || '',
        qty: Number(it?.quantity ?? 0) || 0,
        gstPercent: Number(it?.gst_percentage ?? 0) || 0,
        specification: safeTrim(it?.specification || it?.scope_of_work),
        hsnSac: safeTrim(it?.hsn_sac || it?.sac_code),
        taxType: 'GST',
      };
    } else {
      const name = safeTrim(it?.part_name) || `Item ${idx + 1}`;
      const totalQty = Number(it?.total_qty_required ?? 0) || 0;
      const lessQty = Number(it?.less_qty_available_in_stock ?? 0) || 0;
      const netQty = Number(it?.net_pr_qty) || Math.max(0, totalQty - lessQty);
      return {
        id: stableItemId(name, idx),
        srNo: idx + 1,
        partName: name,
        uom: safeTrim(it?.uom) || '',
        qty: netQty,
        gstPercent: 0,
        specification: safeTrim(it?.specification),
        hsnSac: safeTrim(it?.hsn_sac || it?.hsn_code),
        taxType: 'GST',
      };
    }
  });

  const requiredDates = itemRows.map((row: any) => safeTrim(row?.material_required_by_date || row?.completion_date)).filter(Boolean).sort();
  return {
    items,
    indentType: isSpr ? 'SPR' : 'PR',
    indentDate: toDateInputValue(indent?.date || indent?.indent_data?.date || indent?.created_at || indent?.indented_by?.timestamp),
    department: safeTrim(indent?.department || indent?.indent_data?.department) || undefined,
    project: safeTrim(indent?.project || indent?.indent_data?.project) || undefined,
    deliveryLocation: safeTrim(indent?.delivery_location || indent?.site || indent?.location || indent?.indent_data?.delivery_location || indent?.indent_data?.site || indent?.indent_data?.location || indent?.indent_data?.area_of_service) || undefined,
    requiredByDate: toDateInputValue(requiredDates[0] || indent?.required_by_date || indent?.indent_data?.required_by_date),
    preparedBy: safeTrim(indent?.indented_by?.name_id || indent?.indented_by?.name || indent?.requested_by?.name || indent?.created_by?.name) || undefined,
    purpose: safeTrim(indent?.notes || indent?.remarks || indent?.indent_data?.remarks_notes || indent?.indent_data?.remarks || indent?.indent_data?.nature_of_service || indent?.indent_data?.name_of_service) || undefined,
  };
};

const stableItemId = (itemName: string, idx: number) => {
  const base = safeTrim(itemName) || 'item';
  const safe = base.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `it-${idx + 1}-${safe || 'x'}`;
};

const fetchVendorsForDropdown = async (): Promise<DirectoryVendor[]> => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error('API base URL is not set');

  const url = `${baseUrl}/purchase_flow/get_vendors`;

  const doFetch = (method: 'GET' | 'POST') =>
    fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
      },
    });

  let res = await doFetch('GET');
  if (res.status === 405) res = await doFetch('POST');

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `HTTP ${res.status}`);
  }

  const data: any = await res.json().catch(() => null);
  const list: GetVendorsApiVendor[] = Array.isArray(data?.vendors) ? data.vendors : [];

  const mapped: DirectoryVendor[] = list
    .map((v) => {
      const id = String(v?.vendor_id ?? '').trim();
      const name = String(v?.vendor_name ?? '').trim();
      const phone = String(v?.vendor_contact ?? '').trim();
      const address = String(v?.vendor_address ?? '').trim();
      return {
        id,
        name,
        phone: phone ? phone : undefined,
        address: address ? address : undefined,
      };
    })
    .filter((v) => v.id && v.name);

  return mapped;
};

function AutoGrowTextarea({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ??
        'w-full resize-none overflow-hidden bg-transparent outline-none text-[12px] leading-[1.25]'
      }
      rows={1}
    />
  );
}

export default function QuotationComparative() {
  const { indentId } = useParams<{ indentId: string }>();
  const navigate = useNavigate();
  const [model, setModel] = useState<Comparative | null>(null);
  const [openRecommendation, setOpenRecommendation] = useState(false);
  const [openPrintOrientation, setOpenPrintOrientation] = useState(false);
  const autoPrintTriggeredRef = useRef(false);
  const [openReviseConfirmation, setOpenReviseConfirmation] = useState(false);
  const [recommendationVendorId, setRecommendationVendorId] = useState<string>('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [savingFinal, setSavingFinal] = useState(false);
  const [newChargeLabel, setNewChargeLabel] = useState('');
  const [newTermLabel, setNewTermLabel] = useState('');
  const [newTechnicalLabel, setNewTechnicalLabel] = useState('');
  const [newScopeLabel, setNewScopeLabel] = useState('');

  useEffect(() => {
    if (!model) return;
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get('revise') !== '1') return;
    currentUrl.searchParams.delete('revise');
    window.history.replaceState(window.history.state, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    setOpenReviseConfirmation(true);
  }, [model?.indentId]);

  const normalizedIndentId = useMemo(() => {
    if (!indentId) return '';
    try {
      return decodeURIComponent(indentId);
    } catch {
      return indentId;
    }
  }, [indentId]);

  const [directoryVendors, setDirectoryVendors] = useState<DirectoryVendor[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const list = await fetchVendorsForDropdown();
        setDirectoryVendors(list.length ? list : DUMMY_DIRECTORY_VENDORS);
      } catch {
        setDirectoryVendors(DUMMY_DIRECTORY_VENDORS);
      }
    };
    void load();
  }, []);

  const updateVendorFromDirectory = (vendorId: string, directoryVendorId: string) => {
    if (directoryVendorId === '__manual__') {
      setModel((previous) => previous ? {
        ...previous,
        vendors: previous.vendors.map((vendor) => vendor.id === vendorId ? {
          ...vendor,
          isManual: true,
          directoryVendorId: undefined,
          name: '',
          phone: '',
          location: '',
        } : vendor),
      } : previous);
      return;
    }
    const selected = directoryVendors.find((x) => x.id === directoryVendorId);
    if (!selected) return;
    setModel((p) => {
      if (!p) return p;
      return {
        ...p,
        vendors: p.vendors.map((v) =>
          v.id === vendorId
            ? {
                ...v,
                directoryVendorId,
                isManual: false,
                name: selected.name,
                phone: selected.phone || v.phone,
                location: selected.address ? selected.address : v.location,
              }
            : v,
        ),
      };
    });
  };

  useEffect(() => {
    if (!normalizedIndentId) return;
    let cancelled = false;

    const load = async () => {
      let indentSeed: Awaited<ReturnType<typeof fetchIndentByPrNumber>> | null = null;
      try {
        indentSeed = await fetchIndentByPrNumber(normalizedIndentId);
      } catch {
        // The comparison can still open when the linked indent service is unavailable.
      }
      if (cancelled) return;

      // 1) Try server draft first (source of truth for last saved draft)
      try {
        const draft = await fetchComparativeDraft(normalizedIndentId);
        if (cancelled) return;
        if (draft) {
          const createdAt = safeTrim((draft as any)?.created_at);

          // Rows saved after the "meta" field was introduced carry the entire
          // Comparative model, so every field round-trips losslessly. Prefer
          // it wholesale; only reconstruct field-by-field below for older
          // rows saved before this existed.
          const meta = (draft as any)?.meta;
          if (meta && typeof meta === 'object' && Array.isArray(meta.items) && meta.items.length) {
            setModel({
              ...(meta as Comparative),
              indentId: normalizedIndentId,
              lastSavedAt: createdAt || (meta as Comparative).lastSavedAt,
              lastSavedSource: createdAt ? 'server' : (meta as Comparative).lastSavedSource,
            });
            return;
          }

          const itemRows: GetComparativeDraftItemRow[] = Array.isArray((draft as any)?.item_row)
            ? ((draft as any).item_row as GetComparativeDraftItemRow[])
            : [];
          const quoters: GetComparativeDraftQuoter[] = Array.isArray((draft as any)?.quoters)
            ? ((draft as any).quoters as GetComparativeDraftQuoter[])
            : [];

          const items: PrItem[] = itemRows.map((r, idx) => {
            // PR drafts use item_name; SPR drafts may use service_description
            const itemName = safeTrim((r as any)?.item_name) || safeTrim((r as any)?.service_description);
            const uom = safeTrim((r as any)?.UoM) || safeTrim((r as any)?.uom);
            const qty = Number((r as any)?.quantity ?? 0) || 0;
            const gst = Number((r as any)?.gst_percentage ?? 0);
            return {
              id: stableItemId(itemName, idx),
              srNo: idx + 1,
              partName: itemName,
              uom,
              qty,
              gstPercent: Number.isFinite(gst) ? gst : 0,
              specification: safeTrim((r as any)?.specification),
              hsnSac: safeTrim((r as any)?.hsn_sac),
              taxType: (safeTrim((r as any)?.tax_type) as TaxType) || 'GST',
            };
          });

          const vendors: QuoteVendor[] = quoters
            .map((q) => safeTrim((q as any)?.vendor_id))
            .filter(Boolean)
            .map((vendorId) => ({
              id: vendorId,
              directoryVendorId: vendorId,
              name: vendorId,
              currency: 'INR',
            }));

          const paymentTerms: Record<string, string> = {};
          const deliveryTimeline: Record<string, string> = {};
          const warranty: Record<string, string> = {};
          const priceBasis: Record<string, string> = {};
          const freightCharges: Record<string, number> = {};
          const otherCharges: Record<string, number> = {};

          const quotes: VendorQuote[] = quoters
            .map((q) => ({ q, vendorId: safeTrim((q as any)?.vendor_id) }))
            .filter((x) => Boolean(x.vendorId))
            .map(({ q, vendorId }) => {
              const unitRateByItemId: Record<string, number> = {};

            const costing = (q as any)?.item_costing;
            const costingObj = costing && typeof costing === 'object' ? costing : {};

            for (const it of items) {
              const name = safeTrim(it.partName);
              const row = (costingObj as any)?.[name];
              const perUnit = Number((row as any)?.per_unit_costing ?? 0);
              unitRateByItemId[it.id] = Number.isFinite(perUnit) ? perUnit : 0;
            }

              freightCharges[vendorId] = Number((q as any)?.freight_charges ?? 0) || 0;
              otherCharges[vendorId] = Number((q as any)?.other_charges ?? 0) || 0;

              const pt = safeTrim((q as any)?.payment_terms);
              const dt = safeTrim((q as any)?.delivery_time);
              const wg = safeTrim((q as any)?.warrenty_garantee);
              const pb = safeTrim((q as any)?.price_basis);
              if (pt) paymentTerms[vendorId] = pt;
              if (dt) deliveryTimeline[vendorId] = dt;
              if (wg) warranty[vendorId] = wg;
              if (pb) priceBasis[vendorId] = pb;

              return {
                vendorId,
                unitRateByItemId,
              };
            });

          // If the draft had no item_row (or all items have blank names), seed from indent API
          let resolvedItems = items;
          let resolvedIndentType: 'PR' | 'SPR' = indentSeed?.indentType || 'PR';
          if (resolvedItems.length === 0 || resolvedItems.every((it) => !it.partName)) {
            resolvedItems = indentSeed?.items || resolvedItems;
          }

          const next: Comparative = {
            indentId: normalizedIndentId,
            indentType: resolvedIndentType,
            title: 'Commercial Comparative Statement',
            subTitle: '',
            comparisonNo: comparisonNumberFor(normalizedIndentId),
            indentDate: indentSeed?.indentDate,
            department: indentSeed?.department,
            projectCluster: indentSeed?.project,
            deliveryLocation: indentSeed?.deliveryLocation,
            requiredByDate: indentSeed?.requiredByDate,
            purposeRemarks: indentSeed?.purpose,
            requirementType: resolvedIndentType === 'SPR' ? 'Service' : 'Goods',
            comparisonBasis: 'Landed Cost',
            quotationTemplate: resolvedIndentType === 'SPR' ? 'Service' : 'General Purchase',
            preparedBy: indentSeed?.preparedBy || 'SBR Admin',
            vendors,
            items: resolvedItems,
            quotes,
            gstPercent: undefined,
            freightCharges,
            otherCharges,
            baseAmountA: {},
            baseAmountB: {},
            paymentTerms,
            deliveryTimeline,
            warranty,
            priceBasis,
            charges: [
              ...(Object.values(freightCharges).some((value) => value > 0) ? [{ id: genId(), label: 'Freight', nature: 'Charge' as const, calculation: 'Fixed' as const, taxPercent: 0, values: freightCharges }] : []),
              ...(Object.values(otherCharges).some((value) => value !== 0) ? [{ id: genId(), label: 'Other Charges', nature: 'Charge' as const, calculation: 'Fixed' as const, taxPercent: 0, values: otherCharges }] : []),
            ],
            comparisonParameters: makeStandardTerms().map((parameter) => ({
              ...parameter,
              values: parameter.label === 'Payment Terms' ? paymentTerms
                : parameter.label === 'Delivery / Completion Period' ? deliveryTimeline
                  : parameter.label === 'Warranty / Guarantee' ? warranty
                    : parameter.label === 'Price Basis' ? priceBasis
                      : {},
            })),
            technicalParameters: [],
            scopeResponsibilities: [],
            technicalStatus: {},
            commercialStatus: {},
            awardStrategy: 'Single Vendor',
            lastSavedAt: createdAt || undefined,
            lastSavedSource: createdAt ? 'server' : undefined,
          };
          setModel(next);
          return;
        }
      } catch {
        // ignore — no draft on the server (or it failed to load); start fresh below
      }
      if (cancelled) return;

      // 2) Finally, start fresh — seed items from the indent API
      const freshItems: PrItem[] = indentSeed?.items || [];
      const freshIndentType: 'PR' | 'SPR' = indentSeed?.indentType || 'PR';
      const freshMeta = indentSeed;

      const empty: Comparative = {
        indentId: normalizedIndentId,
        indentType: freshIndentType,
        title: 'Commercial Comparative Statement',
        subTitle: '',
        comparisonNo: comparisonNumberFor(normalizedIndentId),
        indentDate: freshMeta?.indentDate,
        department: freshMeta?.department,
        projectCluster: freshMeta?.project,
        deliveryLocation: freshMeta?.deliveryLocation,
        requiredByDate: freshMeta?.requiredByDate,
        purposeRemarks: freshMeta?.purpose,
        requirementType: freshIndentType === 'SPR' ? 'Service' : 'Goods',
        comparisonBasis: 'Landed Cost',
        quotationTemplate: freshIndentType === 'SPR' ? 'Service' : 'General Purchase',
        preparedBy: freshMeta?.preparedBy || 'SBR Admin',
        vendors: [
          { id: genId(), name: 'Vendor 1', currency: 'INR' },
          { id: genId(), name: 'Vendor 2', currency: 'INR' },
        ],
        items: freshItems,
        quotes: [],
        gstPercent: undefined,
        freightCharges: {},
        otherCharges: {},
        baseAmountA: {},
        baseAmountB: {},
        charges: [],
        comparisonParameters: makeStandardTerms(),
        technicalParameters: [],
        scopeResponsibilities: [],
        technicalStatus: {},
        commercialStatus: {},
        awardStrategy: 'Single Vendor',
        lastSavedAt: undefined,
        lastSavedSource: undefined,
      };
      setModel(empty);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [normalizedIndentId]);

  // After directory vendors list loads, hydrate names/phone/address for vendors coming from backend draft.
  useEffect(() => {
    if (!directoryVendors.length) return;
    setModel((p) => {
      if (!p) return p;
      let changed = false;
      const nextVendors = p.vendors.map((v) => {
        if (!v.directoryVendorId) return v;
        const dv = directoryVendors.find((x) => x.id === v.directoryVendorId);
        if (!dv) return v;

        const next = {
          ...v,
          name: dv.name || v.name,
          phone: dv.phone || v.phone,
          location: dv.address || v.location,
        };
        if (next.name !== v.name || next.phone !== v.phone || next.location !== v.location) changed = true;
        return next;
      });
      return changed ? { ...p, vendors: nextVendors } : p;
    });
  }, [directoryVendors]);

  const vendorOrder = model?.vendors ?? [];

  const vendorSelectedById = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const v of vendorOrder) out[v.id] = Boolean(v.directoryVendorId || (v.isManual && v.name.trim()));
    return out;
  }, [vendorOrder]);

  const amountsByVendor = useMemo(() => {
    if (!model) return {} as Record<string, number[]>;
    const out: Record<string, number[]> = {};
    for (const v of model.vendors) {
      const q = model.quotes.find((x) => x.vendorId === v.id);
      out[v.id] = model.items.map((it) => {
        const unit = q?.unitRateByItemId?.[it.id] ?? 0;
        return unit * it.qty;
      });
    }
    return out;
  }, [model]);

  const totalByVendor = useMemo(() => {
    if (!model) return {} as Record<string, number>;
    const out: Record<string, number> = {};
    for (const v of model.vendors) {
      const amts = amountsByVendor[v.id] || [];
      out[v.id] = amts.reduce((s, a) => s + a, 0);
    }
    return out;
  }, [model, amountsByVendor]);

  const itemDiscountByVendor = useMemo(() => {
    const out: Record<string, number> = {};
    for (const vendor of vendorOrder) {
      const quote = model?.quotes.find((entry) => entry.vendorId === vendor.id);
      const lineDiscount = (model?.items || []).reduce((sum, item) => {
        const unitRate = Number(quote?.unitRateByItemId?.[item.id] || 0);
        const discountPercent = Number(quote?.discountPercentByItemId?.[item.id] || 0);
        return sum + unitRate * item.qty * Math.max(0, discountPercent) / 100;
      }, 0);
      out[vendor.id] = lineDiscount + Number(model?.itemDiscountAmount?.[vendor.id] || 0);
    }
    return out;
  }, [model, vendorOrder]);

  const netBasicByVendor = useMemo(() => {
    const out: Record<string, number> = {};
    for (const vendor of vendorOrder) out[vendor.id] = Math.max(0, (totalByVendor[vendor.id] || 0) - (itemDiscountByVendor[vendor.id] || 0));
    return out;
  }, [vendorOrder, totalByVendor, itemDiscountByVendor]);

  const baseABByVendor = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of vendorOrder) out[v.id] = totalByVendor[v.id] || 0;
    return out;
  }, [vendorOrder, totalByVendor]);

  const freightByVendor = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of vendorOrder) out[v.id] = Number((model as any)?.freightCharges?.[v.id] ?? 0) || 0;
    return out;
  }, [vendorOrder, model]);

  const otherByVendor = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of vendorOrder) out[v.id] = Number((model as any)?.otherCharges?.[v.id] ?? 0) || 0;
    return out;
  }, [vendorOrder, model]);

  // NOTE: No default GST. Each item must carry its own GST% (blank => 0).

  // Tax is calculated on the discounted item amount and respects the selected tax treatment.
  const gstByVendor = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of vendorOrder) {
      let sum = 0;
      const q = model?.quotes?.find((x) => x.vendorId === v.id);
      for (const it of model?.items ?? []) {
        const unit = q?.unitRateByItemId?.[it.id] ?? 0;
        const discount = Number(q?.discountPercentByItemId?.[it.id] || 0);
        const amt = unit * it.qty * (1 - Math.max(0, discount) / 100);
        const gp = Number(isFinite(Number(it.gstPercent)) ? it.gstPercent : 0) || 0;
        const taxType = it.taxType || 'GST';
        if (!['Exempt', 'Nil Rated', 'RCM', 'Inclusive of Tax'].includes(taxType)) sum += amt * (gp / 100);
      }
      out[v.id] = sum;
    }
    return out;
  }, [vendorOrder, model]);

  const chargeBreakdownByVendor = useMemo(() => {
    const out: Record<string, { charges: number; discounts: number; tax: number; net: number }> = {};
    for (const vendor of vendorOrder) {
      let charges = Number(model?.additionalChargesAmount?.[vendor.id] || 0);
      let discounts = Number(model?.commercialDiscountAmount?.[vendor.id] || 0);
      let tax = 0;
      for (const adjustment of model?.charges || []) {
        const entered = Number(adjustment.values?.[vendor.id] || 0);
        const amount = adjustment.calculation === '% of Basic' ? (netBasicByVendor[vendor.id] || 0) * entered / 100 : entered;
        if (adjustment.nature === 'Discount') discounts += amount;
        else {
          charges += amount;
          tax += amount * (Number(adjustment.taxPercent || 0) / 100);
        }
      }
      out[vendor.id] = { charges, discounts, tax, net: charges + tax - discounts };
    }
    return out;
  }, [model?.charges, model?.additionalChargesAmount, model?.commercialDiscountAmount, vendorOrder, netBasicByVendor]);

  const taxableSubtotalByVendor = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of vendorOrder) {
      out[v.id] = (netBasicByVendor[v.id] || 0) + (chargeBreakdownByVendor[v.id]?.charges || 0) - (chargeBreakdownByVendor[v.id]?.discounts || 0);
    }
    return out;
  }, [vendorOrder, netBasicByVendor, chargeBreakdownByVendor]);

  const grandTotalByVendor = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of vendorOrder) {
      out[v.id] = (taxableSubtotalByVendor[v.id] || 0) + (gstByVendor[v.id] || 0) + (chargeBreakdownByVendor[v.id]?.tax || 0) + Number(model?.roundOffAmount?.[v.id] || 0);
    }
    return out;
  }, [vendorOrder, taxableSubtotalByVendor, gstByVendor, chargeBreakdownByVendor, model?.roundOffAmount]);

  const vendorLTagByVendorId = useMemo(() => {
    const totals = vendorOrder
      .map((v) => ({ vendorId: v.id, total: Number(grandTotalByVendor[v.id] ?? 0) || 0 }))
      .filter((x) => x.vendorId);

    // Only rank vendors once they have a non-zero total.
    const rankable = totals.filter((x) => x.total > 0);
    if (rankable.length === 0) return {} as Record<string, string>;

    rankable.sort((a, b) => a.total - b.total);

    const out: Record<string, string> = {};
    rankable.forEach((x, idx) => {
      out[x.vendorId] = `L${idx + 1}`;
    });
    return out;
  }, [vendorOrder, grandTotalByVendor]);

  const eligibleRecommendationVendors = useMemo(() => {
    return vendorOrder
      .filter((v) => Boolean(v.directoryVendorId || (v.isManual && v.name.trim())))
      .map((v) => ({
        vendorId: v.id,
        vendorDirectoryId: String(v.directoryVendorId || (v.isManual ? `MANUAL:${v.name}` : '')).trim(),
        name: v.name,
        total: Number(grandTotalByVendor[v.id] ?? 0) || 0,
        status: String(vendorLTagByVendorId[v.id] || '').trim(),
      }))
      .filter((x) => x.vendorId);
  }, [vendorOrder, grandTotalByVendor, vendorLTagByVendorId]);

  const setVendorRate = (vendorId: string, itemId: string, val: string) => {
    if (!model) return;
    const rate = Number(val);
    setModel((prev) => {
      if (!prev) return prev;
      const quotes = [...prev.quotes];
      const idx = quotes.findIndex((q) => q.vendorId === vendorId);
      if (idx === -1) {
        quotes.push({ vendorId, unitRateByItemId: { [itemId]: Number.isFinite(rate) ? rate : 0 } });
      } else {
        quotes[idx] = {
          ...quotes[idx],
          unitRateByItemId: { ...(quotes[idx].unitRateByItemId || {}), [itemId]: Number.isFinite(rate) ? rate : 0 },
        };
      }
      return { ...prev, quotes };
    });
  };

  const addVendor = () => {
    if (!model) return;
    setModel((p) => {
      if (!p) return p;
      const vendors = [...p.vendors, { id: genId(), name: `Vendor ${p.vendors.length + 1}` }];
      return { ...p, vendors };
    });
  };

  const removeVendor = (vendorId: string) => {
    if (!model) return;
    setModel((p) => {
      if (!p) return p;
      return {
        ...p,
        vendors: p.vendors.filter((v) => v.id !== vendorId),
        quotes: p.quotes.filter((q) => q.vendorId !== vendorId),
      };
    });
  };

  const updateVendorName = (vendorId: string, name: string) => {
    if (!model) return;
    setModel((p) => {
      if (!p) return p;
      return { ...p, vendors: p.vendors.map((v) => (v.id === vendorId ? { ...v, name } : v)) };
    });
  };

  const updateVendorField = <K extends keyof QuoteVendor>(vendorId: string, key: K, value: QuoteVendor[K]) => {
    setModel((previous) => previous ? { ...previous, vendors: previous.vendors.map((vendor) => vendor.id === vendorId ? { ...vendor, [key]: value } : vendor) } : previous);
  };

  const updateItemField = <K extends keyof PrItem>(itemId: string, key: K, value: PrItem[K]) => {
    setModel((previous) => previous ? { ...previous, items: previous.items.map((item) => item.id === itemId ? { ...item, [key]: value } : item) } : previous);
  };

  const setVendorDiscount = (vendorId: string, itemId: string, value: string) => {
    const discount = Math.max(0, Number(value) || 0);
    setModel((previous) => {
      if (!previous) return previous;
      const quotes = [...previous.quotes];
      const quoteIndex = quotes.findIndex((quote) => quote.vendorId === vendorId);
      if (quoteIndex === -1) quotes.push({ vendorId, unitRateByItemId: {}, discountPercentByItemId: { [itemId]: discount } });
      else quotes[quoteIndex] = { ...quotes[quoteIndex], discountPercentByItemId: { ...(quotes[quoteIndex].discountPercentByItemId || {}), [itemId]: discount } };
      return { ...previous, quotes };
    });
  };

  const addChargeAdjustment = () => {
    const label = newChargeLabel.trim();
    if (!label) return toast.error('Enter a charge or adjustment name');
    setModel((previous) => previous ? { ...previous, charges: [...(previous.charges || []), { id: genId(), label, nature: label.toLowerCase().includes('discount') ? 'Discount' : 'Charge', calculation: 'Fixed', taxPercent: 0, values: {} }] } : previous);
    setNewChargeLabel('');
  };

  const updateChargeAdjustment = (id: string, patch: Partial<ChargeAdjustment>) => {
    setModel((previous) => previous ? { ...previous, charges: (previous.charges || []).map((charge) => charge.id === id ? { ...charge, ...patch } : charge) } : previous);
  };

  const removeChargeAdjustment = (id: string) => setModel((previous) => previous ? { ...previous, charges: (previous.charges || []).filter((charge) => charge.id !== id) } : previous);

  const addComparisonParameter = (label = newTermLabel.trim(), standard = false) => {
    if (!label) return toast.error('Enter a comparison parameter');
    setModel((previous) => previous ? { ...previous, comparisonParameters: [...(previous.comparisonParameters || []), { id: genId(), label, values: {}, standard }] } : previous);
    setNewTermLabel('');
  };

  const addTechnicalParameter = () => {
    const label = newTechnicalLabel.trim();
    if (!label) return toast.error('Enter a technical parameter');
    setModel((previous) => previous ? { ...previous, technicalParameters: [...(previous.technicalParameters || []), { id: genId(), label, requiredValue: '', values: {} }] } : previous);
    setNewTechnicalLabel('');
  };

  const addScopeResponsibility = () => {
    const label = newScopeLabel.trim();
    if (!label) return toast.error('Enter a scope item');
    setModel((previous) => previous ? { ...previous, scopeResponsibilities: [...(previous.scopeResponsibilities || []), { id: genId(), label, assignedTo: 'Vendor', remarks: '' }] } : previous);
    setNewScopeLabel('');
  };

  const applyQuotationTemplate = (template: QuotationTemplate) => {
    setModel((previous) => {
      if (!previous) return previous;
      const existing = new Set((previous.comparisonParameters || []).map((parameter) => parameter.label.toLowerCase()));
      const suggestions = TEMPLATE_PARAMETERS[template].filter((label) => !existing.has(label.toLowerCase())).map((label) => ({ id: genId(), label, values: {} }));
      return { ...previous, quotationTemplate: template, comparisonParameters: [...(previous.comparisonParameters || []), ...suggestions] };
    });
  };

  const setMeta = (
    key:
      | 'paymentTerms'
      | 'deliveryTimeline'
      | 'priceBasis'
      | 'warranty'
      | 'loading'
      | 'unloading'
      | 'vendorStatus',
    vendorId: string,
    value: string,
  ) => {
    if (!model) return;
    setModel((p) => {
      if (!p) return p;
      return { ...p, [key]: { ...(p as any)[key], [vendorId]: value } } as Comparative;
    });
  };

  const setBase = (key: 'baseAmountA' | 'baseAmountB', vendorId: string, value: string) => {
    const num = Number(value);
    setModel((p) => {
      if (!p) return p;
      return { ...p, [key]: { ...(p as any)[key], [vendorId]: Number.isFinite(num) ? num : 0 } } as Comparative;
    });
  };

  const setCharge = (key: 'freightCharges' | 'otherCharges', vendorId: string, value: string) => {
    const num = Number(value);
    setModel((p) => {
      if (!p) return p;
      const cur = (p as any)[key] || {};
      return { ...p, [key]: { ...cur, [vendorId]: Number.isFinite(num) ? num : 0 } } as Comparative;
    });
  };

  const setPercent = (key: 'gstPercent' | 'taxPercent', value: string) => {
    const num = Number(value);
    setModel((p) => {
      if (!p) return p;
      return { ...p, [key]: Number.isFinite(num) ? num : 0 } as Comparative;
    });
  };

  type SaveComparativeDraftItemRow = {
    item_name: string;
    quantity: number;
    UoM: string;
    gst_percentage: number;
  };

  type SaveComparativeDraftQuoter = {
    vendor_id: string;
    item_costing: Record<
      string,
      {
        per_unit_costing: number;
        quanity: number;
        final_costing: number;
      }
    >;
    freight_charges?: number | null;
    other_charges?: number | null;
    subtotal: number;
    total_amount: number;
    payment_terms?: string | null;
    delivery_time?: string | null;
    warrenty_garantee?: string | null;
    price_basis?: string | null;
  };

  type SaveComparativeDraftPayload = {
    pr_number: string;
    item_row: SaveComparativeDraftItemRow[];
    quoters: SaveComparativeDraftQuoter[];
    // The full comparative model, so every field the backend doesn't otherwise
    // model (revision info, comparison basis, award strategy, custom charges,
    // technical/scope parameters, etc.) round-trips losslessly through the API
    // instead of relying on local storage.
    meta: Comparative;
  };

  type SaveComparativeFinalPayload = SaveComparativeDraftPayload & {
    technical_recommendation: string;
  };

  const buildSaveDraftPayload = (m: Comparative): SaveComparativeDraftPayload => {
    const prNumber = String(normalizedIndentId || m.indentId || '').trim();

    const item_row: SaveComparativeDraftItemRow[] = (m.items ?? []).map((it) => {
      const gst = Number.isFinite(Number(it.gstPercent)) ? Number(it.gstPercent) : 0;
      return {
        item_name: String(it.partName ?? '').trim(),
        quantity: Number(it.qty ?? 0) || 0,
        UoM: String(it.uom ?? '').trim(),
        gst_percentage: Number.isFinite(gst) ? gst : 0,
      };
    });

    const quoters: SaveComparativeDraftQuoter[] = (m.vendors ?? [])
      .map((v) => {
        const vendor_id = String(v.directoryVendorId || (v.isManual && v.name.trim() ? `MANUAL:${v.name.trim()}` : '')).trim();
        if (!vendor_id) return null;

        const q = (m.quotes ?? []).find((x) => x.vendorId === v.id);
        const item_costing: SaveComparativeDraftQuoter['item_costing'] = {};
        for (const it of m.items ?? []) {
          const productName = String(it.partName ?? '').trim();
          if (!productName) continue;
          const grossUnit = Number(q?.unitRateByItemId?.[it.id] ?? 0) || 0;
          const discountPercent = Math.max(0, Number(q?.discountPercentByItemId?.[it.id] ?? 0) || 0);
          const unit = grossUnit * (1 - discountPercent / 100);
          const quantity = Number(it.qty ?? 0) || 0;
          const final = unit * quantity;
          item_costing[productName] = {
            per_unit_costing: unit,
            quanity: quantity,
            final_costing: final,
          };
        }

        const dynamicCharges = (m.charges || []).filter((entry) => entry.nature === 'Charge');
        const dynamicDiscounts = (m.charges || []).filter((entry) => entry.nature === 'Discount');
        const resolveAdjustment = (entry: ChargeAdjustment) => entry.calculation === '% of Basic'
          ? (netBasicByVendor[v.id] || 0) * (Number(entry.values?.[v.id] || 0) / 100)
          : Number(entry.values?.[v.id] || 0);
        const freight = dynamicCharges.filter((entry) => /freight|transport/i.test(entry.label)).reduce((sum, entry) => sum + resolveAdjustment(entry), 0) || Number(freightByVendor[v.id] ?? 0) || 0;
        const manualAdjustments = Number(m.additionalChargesAmount?.[v.id] || 0) - Number(m.commercialDiscountAmount?.[v.id] || 0);
        const calculatedOther = dynamicCharges.filter((entry) => !/freight|transport/i.test(entry.label)).reduce((sum, entry) => sum + resolveAdjustment(entry), 0)
          - dynamicDiscounts.reduce((sum, entry) => sum + resolveAdjustment(entry), 0)
          + manualAdjustments;
        const other = calculatedOther !== 0 ? calculatedOther : Number(otherByVendor[v.id] ?? 0) || 0;
        const subtotal = Number(taxableSubtotalByVendor[v.id] ?? 0) || 0;
        const total_amount = Number(grandTotalByVendor[v.id] ?? 0) || 0;

        const termValue = (label: string) => String((m.comparisonParameters || []).find((entry) => entry.label.toLowerCase() === label.toLowerCase())?.values?.[v.id] || '').trim();
        const payment_terms = termValue('Payment Terms') || String((m.paymentTerms as any)?.[v.id] ?? '').trim();
        const delivery_time = termValue('Delivery / Completion Period') || String((m.deliveryTimeline as any)?.[v.id] ?? '').trim();
        const warrenty_garantee = termValue('Warranty / Guarantee') || String((m.warranty as any)?.[v.id] ?? '').trim();

        return {
          vendor_id,
          item_costing,
          freight_charges: freight,
          other_charges: other,
          subtotal,
          total_amount,
          payment_terms: payment_terms ? payment_terms : null,
          delivery_time: delivery_time ? delivery_time : null,
          warrenty_garantee: warrenty_garantee ? warrenty_garantee : null,
          price_basis: termValue('Price Basis') || String((m.priceBasis as any)?.[v.id] ?? '').trim() || null,
        } satisfies SaveComparativeDraftQuoter;
      })
      .filter(Boolean) as SaveComparativeDraftQuoter[];

    return {
      pr_number: prNumber,
      item_row,
      quoters,
      meta: m,
    };
  };

  const saveDraftToApi = async (payload: SaveComparativeDraftPayload) => {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) throw new Error('API base URL is not set');
    const url = `${baseUrl}/purchase_flow/save_comparative_statement_draft`;

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

  const saveFinalToApi = async (payload: SaveComparativeFinalPayload) => {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) throw new Error('API base URL is not set');
    const url = `${baseUrl}/purchase_flow/save_comparative_statement`;

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

  const saveDraft = async () => {
    if (!model) return;
    if (savingDraft) return;

    if ((model.items ?? []).length === 0) {
      toast.error('Add at least 1 item before saving draft');
      return;
    }

    const snapshot: Comparative = { ...model, isDraft: true, lastSavedAt: toIsoNow(), lastSavedSource: 'local' };
    setModel(snapshot);

    setSavingDraft(true);
    try {
      const payload = buildSaveDraftPayload(snapshot);
      const apiRes: any = await saveDraftToApi(payload);

      const serverSavedAt = safeTrim(apiRes?.created_at || apiRes?.updated_at || apiRes?.saved_at);
      setModel((p) => {
        if (!p) return p;
        return {
          ...p,
          lastSavedAt: serverSavedAt || p.lastSavedAt || toIsoNow(),
          lastSavedSource: serverSavedAt ? 'server' : p.lastSavedSource || 'local',
        };
      });
      toast.success('Draft saved');
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? '').trim();
      toast.error(`Failed to save draft${msg ? `: ${msg}` : ''}`);
    } finally {
      setSavingDraft(false);
    }
  };

  // The technical recommendation is never a manual choice — it's always the
  // vendor currently ranked L1 (lowest grand total) on the comparison.
  const l1RecommendationVendor = useMemo(
    () => eligibleRecommendationVendors.find((v) => v.status === 'L1'),
    [eligibleRecommendationVendors],
  );

  const askRecommendationAndSave = () => {
    if (!model) return;

    if ((model.items ?? []).length === 0) {
      toast.error('No items found to save');
      return;
    }

    if (!l1RecommendationVendor) {
      toast.error('Enter vendor rates so an L1 (lowest cost) vendor can be determined');
      return;
    }

    setRecommendationVendorId(l1RecommendationVendor.vendorId);
    setOpenRecommendation(true);
  };

  const confirmRecommendationAndSave = () => {
    if (!model) return;
    if (savingFinal) return;

    const chosenInternalVendorId = String(recommendationVendorId || '').trim();
    if (!chosenInternalVendorId) {
      toast.error('Please select a vendor for technical recommendation');
      return;
    }

    const chosenDirectoryVendorId = String(
      model.vendors.find((v) => v.id === chosenInternalVendorId)?.directoryVendorId ||
        (model.vendors.find((v) => v.id === chosenInternalVendorId)?.isManual
          ? `MANUAL:${model.vendors.find((v) => v.id === chosenInternalVendorId)?.name || ''}`
          : '') ||
        chosenInternalVendorId,
    ).trim();
    if (!chosenDirectoryVendorId) {
      toast.error('Selected vendor is missing Vendor ID');
      return;
    }

    const nextModel: Comparative = {
      ...model,
      isDraft: false,
      technicalRecommendationVendorId: chosenDirectoryVendorId,
      lastSavedAt: toIsoNow(),
      lastSavedSource: 'local',
    };

    setSavingFinal(true);

    const base = buildSaveDraftPayload(nextModel);
    const payload: SaveComparativeFinalPayload = {
      ...base,
      technical_recommendation: chosenDirectoryVendorId,
    };

    void saveFinalToApi(payload)
      .then(() => {
        toast.success('Quotation saved');
        setOpenRecommendation(false);
        navigate('/purchase-requisition');
      })
      .catch((e: any) => {
        const msg = String(e?.message ?? e ?? '').trim();
        toast.error(`Failed to save${msg ? `: ${msg}` : ''}`);
        setOpenRecommendation(false);
      })
      .finally(() => {
        setSavingFinal(false);
      });
  };

  const reviseComparativeStatement = async () => {
    if (!model) return;
    if (savingDraft) return;
    const currentNumber = safeTrim(model.comparisonNo) || comparisonNumberFor(normalizedIndentId);
    const revisionMatch = currentNumber.match(/\/R(\d+)$/i);
    const currentRevision = Number(model.revision || revisionMatch?.[1] || 0);
    const baseNumber = safeTrim(model.revisionOf) || currentNumber.replace(/\/R\d+$/i, '');
    const nextRevision = currentRevision + 1;
    const revised: Comparative = {
      ...model,
      comparisonNo: `${baseNumber}/R${nextRevision}`,
      revision: nextRevision,
      revisionOf: baseNumber,
      revisionDate: todayIso(),
      isDraft: true,
      technicalRecommendationVendorId: undefined,
      lastSavedAt: toIsoNow(),
      lastSavedSource: 'local',
    };

    setSavingDraft(true);
    try {
      const apiRes: any = await saveDraftToApi(buildSaveDraftPayload(revised));
      const serverSavedAt = safeTrim(apiRes?.created_at || apiRes?.updated_at || apiRes?.saved_at);
      setModel({
        ...revised,
        lastSavedAt: serverSavedAt || revised.lastSavedAt,
        lastSavedSource: serverSavedAt ? 'server' : revised.lastSavedSource,
      });
      setOpenReviseConfirmation(false);
      toast.success(`Revision R${nextRevision} saved. Update the statement and save it for approval.`);
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? '').trim();
      toast.error(`Failed to save revision${msg ? `: ${msg}` : ''}`);
    } finally {
      setSavingDraft(false);
    }
  };

  const statusBgClass = (value: string) => {
    const v = (value || '').toLowerCase();
    if (v.includes('l1') || v.includes('l 1')) return 'bg-green-100';
    return '';
  };

  const statusTextClass = (value: string) => {
    const v = (value || '').toLowerCase();
    if (v.includes('l1') || v.includes('l 1')) return 'font-semibold';
    if (v.includes('l2') || v.includes('l 2')) return 'font-semibold';
    return '';
  };

  const emphasizeLx = (value: string) => {
    const raw = value || '';
    // highlight only the L1/L2 token similar to the sheet
    return raw.replace(/\b(L\s*1|L\s*2)\b/gi, (m) => `<b>${m.toUpperCase().replace(/\s+/g, ' ')}</b>`);
  };

  const printComparativeReport = (orientation: 'portrait' | 'landscape', targetWindow?: Window) => {
    if (!model) return;
    if (!model.items.length) {
      toast.error('There are no items to print.');
      return;
    }
    const popup = targetWindow || window.open('', '_blank', 'width=1500,height=950');
    if (!popup) {
      toast.error('Pop-up blocked. Please allow pop-ups to print the report.');
      return;
    }

    const escapeHtml = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    const displayDate = (value: unknown) => {
      const iso = toDateInputValue(value);
      if (!iso) return 'Not Recorded';
      const [year, month, day] = iso.split('-');
      return `${day}-${month}-${year}`;
    };
    const money = (value: unknown) => `₹${(Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const now = new Date();
    const generatedOn = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}, ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
    const reportId = safeTrim(model.comparisonNo) || comparisonNumberFor(normalizedIndentId);
    const logoUrl = new URL(logo3f, window.location.origin).href;
    const pageWidth = orientation === 'landscape' ? '281mm' : '194mm';
    const pageHeight = orientation === 'landscape' ? '194mm' : '281mm';
    const printableVendors = vendorOrder;
    const selectedVendorName = (vendor: QuoteVendor) => safeTrim(vendor.name) || 'Vendor Not Selected';

    const vendorDetails = printableVendors.map((vendor) => `<div class="vendor-card"><div class="vendor-name">${escapeHtml(selectedVendorName(vendor))}</div><div><span>Vendor ID:</span> ${escapeHtml(vendor.directoryVendorId || (vendor.isManual ? 'Manual Vendor' : 'Not Recorded'))}</div><div><span>Address:</span> ${escapeHtml(vendor.location || 'Not Recorded')}</div><div><span>Phone:</span> ${escapeHtml(vendor.phone || 'Not Recorded')}</div><div><span>Quotation:</span> ${escapeHtml(vendor.attachmentName || 'Not Uploaded')}</div><div><span>Rank:</span> ${escapeHtml(vendorLTagByVendorId[vendor.id] || 'Not Ranked')}</div></div>`).join('');

    const itemRows = model.items.map((item, index) => {
      const vendorCells = printableVendors.map((vendor) => {
        const quote = model.quotes.find((entry) => entry.vendorId === vendor.id);
        const rate = Number(quote?.unitRateByItemId?.[item.id] || 0);
        const amount = rate * Number(item.qty || 0);
        return `<td class="num"><strong>${money(rate)}</strong><small>Amount: ${money(amount)}</small></td>`;
      }).join('');
      const tax = ['Exempt', 'Nil Rated', 'RCM'].includes(item.taxType || '') ? item.taxType : `${item.taxType || 'GST'} ${Number(item.gstPercent || 0).toFixed(2)}%`;
      return `<tr><td class="center">${index + 1}</td><td><strong>${escapeHtml(item.partName || 'Not Recorded')}</strong><small>${escapeHtml(item.specification || 'No specification recorded')}</small><small>Tax: ${escapeHtml(tax)}</small></td><td class="num">${escapeHtml(Number(item.qty || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }))}</td><td class="center">${escapeHtml(item.uom || '—')}</td>${vendorCells}</tr>`;
    }).join('');

    const summaryDefinitions = [
      ['Basic Amount (Excl. Tax)', (id: string) => totalByVendor[id] || 0],
      ['Item Discount', (id: string) => itemDiscountByVendor[id] || 0],
      ['Net Basic Amount', (id: string) => netBasicByVendor[id] || 0],
      ['GST', (id: string) => gstByVendor[id] || 0],
      ['Additional Charges', (id: string) => Number(model.additionalChargesAmount?.[id] || 0)],
      ...((model.charges || []).map((charge) => [charge.label || 'Charge', (id: string) => Number(charge.values?.[id] || 0)] as [string, (id: string) => number])),
      ['Commercial Discount', (id: string) => Number(model.commercialDiscountAmount?.[id] || 0)],
      ['Round Off', (id: string) => Number(model.roundOffAmount?.[id] || 0)],
    ] as Array<[string, (id: string) => number]>;
    const summaryRows = summaryDefinitions.map(([label, getter]) => `<tr><td>${escapeHtml(label)}</td>${printableVendors.map((vendor) => `<td class="num">${money(getter(vendor.id))}</td>`).join('')}</tr>`).join('');
    const grandTotalRow = `<tr class="grand"><td>Landed Cost / Grand Total</td>${printableVendors.map((vendor) => `<td class="num">${money(grandTotalByVendor[vendor.id] || 0)}</td>`).join('')}</tr>`;

    const printableParameters = (model.comparisonParameters || []).filter((parameter) => printableVendors.some((vendor) => safeTrim(parameter.values?.[vendor.id])));
    const termRows = printableParameters.map((parameter) => `<tr><td>${escapeHtml(parameter.label)}</td>${printableVendors.map((vendor) => `<td>${escapeHtml(parameter.values?.[vendor.id] || 'Not Recorded')}</td>`).join('')}</tr>`).join('');
    const vendorHeadings = printableVendors.map((vendor) => `<th>${escapeHtml(selectedVendorName(vendor))}</th>`).join('');
    const itemVendorWidth = printableVendors.length ? 60 / printableVendors.length : 20;

    popup.document.write(`<!doctype html><html><head><title>Commercial Comparative Statement - ${escapeHtml(reportId)}</title><style>
      @page{size:A4 ${orientation};margin:8mm}*{box-sizing:border-box}html,body{width:${pageWidth};margin:0;padding:0;-webkit-text-size-adjust:100%;text-size-adjust:100%}body{background:#fff;color:#1e293b;font-family:Arial,Helvetica,sans-serif;font-size:7pt}.sheet{width:${pageWidth};min-height:${pageHeight};border:.3mm solid #b8c5d1;padding:3mm}.header{text-align:center;border-bottom:.6mm solid #0D3A35;padding-bottom:2.2mm}.header img{height:13mm;width:auto}.company{margin-top:.5mm;font-size:14pt;font-weight:900;letter-spacing:.035em}.address{margin-top:.6mm;color:#526173;font-size:6.8pt}.company-meta{margin-top:.6mm;color:#526173;font-size:6.6pt}.title{margin-top:2.2mm;background:#0D3A35;color:#fff;padding:1.6mm;text-align:center;font-size:10pt;font-weight:900;letter-spacing:.12em}.meta{display:grid;grid-template-columns:1.15fr .8fr 1fr 1fr 1fr;border:.25mm solid #cbd5e1;border-top:0}.meta>div{min-width:0;padding:1.3mm;border-right:.25mm solid #cbd5e1;overflow-wrap:anywhere}.meta>div:last-child{border-right:0}.label{color:#64748b;font-size:5.4pt;font-weight:700;text-transform:uppercase;letter-spacing:.04em}.value{margin-top:.35mm;font-size:6.6pt;font-weight:800}.vendors{display:grid;grid-template-columns:repeat(${Math.max(1, printableVendors.length)},1fr);border:.25mm solid #cbd5e1;border-top:0}.vendor-card{padding:1.2mm 1.5mm;border-right:.25mm solid #cbd5e1;font-size:5.8pt;line-height:1.35}.vendor-card:last-child{border-right:0}.vendor-card span{color:#64748b}.vendor-name{margin-bottom:.5mm;color:#0D3A35;font-size:7pt;font-weight:900}.section{margin-top:2mm;border:.25mm solid #cbd5e1}.section-title{border-bottom:.25mm solid #cbd5e1;background:#edf5f2;padding:1.15mm 1.5mm;color:#0D3A35;font-size:7pt;font-weight:900;text-transform:uppercase;letter-spacing:.07em}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:.25mm solid #cbd5e1;padding:1mm .75mm;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}th{background:#0D3A35;color:#fff;text-align:center;font-size:5.5pt;font-weight:700;text-transform:uppercase}td{font-size:6pt;line-height:1.25}td small{display:block;margin-top:.3mm;color:#64748b;font-size:5.2pt}.num{text-align:right}.center{text-align:center}.grand td{background:#0D3A35;color:#fff;font-weight:900}.footer{display:flex;justify-content:space-between;margin-top:2.2mm;border-top:.25mm solid #cbd5e1;padding-top:1.3mm;color:#64748b;font-size:5.6pt}@media print{html,body{width:${pageWidth}}.sheet{width:${pageWidth};border-color:#b8c5d1}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body><div class="sheet"><div class="header"><img src="${logoUrl}" alt="Sai Bioresources"><div class="company">SAI BIORESOURCES PRIVATE LIMITED</div><div class="address">Khasra No. 121/1, Amrit Dairy Farm, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh - 491001</div><div class="company-meta">GSTIN: 22ARPCS5442R1ZM &nbsp;|&nbsp; Phone: +91 75870 76870 &nbsp;|&nbsp; Email: rajendra.s@saiobioenergy.com</div></div><div class="title">COMMERCIAL COMPARATIVE STATEMENT</div><div class="meta"><div><div class="label">Comparison No.</div><div class="value">${escapeHtml(reportId)}</div></div><div><div class="label">PR Number</div><div class="value">${escapeHtml(normalizedIndentId)}</div></div><div><div class="label">Indent Date</div><div class="value">${escapeHtml(displayDate(model.indentDate))}</div></div><div><div class="label">Required By</div><div class="value">${escapeHtml(displayDate(model.requiredByDate))}</div></div><div><div class="label">Prepared By</div><div class="value">${escapeHtml(model.preparedBy || 'Not Recorded')}</div></div></div><div class="meta"><div><div class="label">Department</div><div class="value">${escapeHtml(model.department || 'Not Recorded')}</div></div><div><div class="label">Requirement</div><div class="value">${escapeHtml(model.requirementType || 'Goods')}</div></div><div><div class="label">Project / Cluster</div><div class="value">${escapeHtml(model.projectCluster || 'Not Recorded')}</div></div><div><div class="label">Delivery Location</div><div class="value">${escapeHtml(model.deliveryLocation || 'Not Recorded')}</div></div><div><div class="label">Purpose / Remarks</div><div class="value">${escapeHtml(model.purposeRemarks || 'Not Recorded')}</div></div></div><div class="vendors">${vendorDetails || '<div class="vendor-card">No vendors recorded</div>'}</div><div class="section"><div class="section-title">Item & Vendor Comparison</div><table><colgroup><col style="width:4%"><col style="width:24%"><col style="width:6%"><col style="width:6%">${printableVendors.map(() => `<col style="width:${itemVendorWidth}%">`).join('')}</colgroup><thead><tr><th>S. No.</th><th>Item / Part Name</th><th>Qty.</th><th>UOM</th>${vendorHeadings}</tr></thead><tbody>${itemRows}</tbody></table></div><div class="section"><div class="section-title">Commercial Summary</div><table><colgroup><col style="width:40%">${printableVendors.map(() => `<col style="width:${itemVendorWidth}%">`).join('')}</colgroup><thead><tr><th>Particular</th>${vendorHeadings}</tr></thead><tbody>${summaryRows}${grandTotalRow}</tbody></table></div>${termRows ? `<div class="section"><div class="section-title">Commercial Terms</div><table><colgroup><col style="width:40%">${printableVendors.map(() => `<col style="width:${itemVendorWidth}%">`).join('')}</colgroup><thead><tr><th>Comparison Parameter</th>${vendorHeadings}</tr></thead><tbody>${termRows}</tbody></table></div>` : ''}<div class="footer"><span>System-generated Commercial Comparative Statement</span><span>Generated on: ${escapeHtml(generatedOn)}</span><span>Report ID: ${escapeHtml(reportId)}</span><span>Page 1 of 1</span></div></div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350));<\/script></body></html>`);
    popup.document.close();
  };

  useEffect(() => {
    if (!model || autoPrintTriggeredRef.current) return;
    const requested = new URLSearchParams(window.location.search).get('print');
    if (requested !== 'portrait' && requested !== 'landscape') return;
    autoPrintTriggeredRef.current = true;
    printComparativeReport(requested, window);
  }, [model]);

  const getDirectoryVendorById = (id?: string) => {
    if (!id) return undefined;
    return directoryVendors.find((x) => x.id === id);
  };

  if (!indentId) {
    return <div className="p-6">Invalid indent.</div>;
  }

  if (!model) {
    return <div className="p-6">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-[#f7f8f7] p-3 text-foreground md:p-4">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => navigate('/purchase-requisition')}>
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div>
            <div className="text-xl font-bold text-slate-900">Quotation Comparative Statement</div>
            <div className="text-xs text-slate-500">PR: {normalizedIndentId || indentId} · {model.comparisonNo}</div>
            {model.lastSavedAt ? (
              <div className="text-[11px] text-slate-500">
                Last saved: <span className="text-foreground/80 font-medium">{formatDateTime(model.lastSavedAt)}</span>
                {model.lastSavedSource ? (
                  <span className="text-muted-foreground"> ({model.lastSavedSource})</span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2 border-[#0b463f]/30 text-[#0b463f] hover:bg-[#edf5f2] hover:text-[#0b463f]" onClick={() => setOpenReviseConfirmation(true)} disabled={savingDraft || savingFinal}>
            <RotateCcw className="h-4 w-4" /> Revise
          </Button>
          <Button variant="outline" className="gap-2 border-[#0b463f]/30 text-[#0b463f] hover:bg-[#edf5f2] hover:text-[#0b463f]" onClick={() => setOpenPrintOrientation(true)}>
            <Printer className="h-4 w-4" /> Print Report
          </Button>
          <Button variant="outline" className="gap-2" onClick={addVendor} disabled={savingDraft || savingFinal}>
            <Plus className="w-4 h-4" /> Add Vendor
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={saveDraft}
            disabled={savingDraft || savingFinal || (model.items ?? []).length === 0}
          >
            {savingDraft ? 'Saving draft…' : 'Save as draft'}
          </Button>
          <Button className="gap-2 bg-[#0b463f] text-white hover:bg-[#083a34]" onClick={askRecommendationAndSave} disabled={savingDraft || savingFinal}>
            <Save className="w-4 h-4" /> {savingFinal ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <Dialog open={openReviseConfirmation} onOpenChange={setOpenReviseConfirmation}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revise Comparative Statement</DialogTitle>
            <DialogDescription>
              A new numbered revision will be created with the current vendors, items, rates, charges and terms. It will reopen as a draft for editing and resubmission.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-[#d5e1dd] bg-[#edf5f2] p-4 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#58716a]">Next Revision</div>
            <div className="mt-1 font-bold text-[#0b463f]">
              {(safeTrim(model.comparisonNo) || comparisonNumberFor(normalizedIndentId)).replace(/\/R\d+$/i, '')}/R{Number(model.revision || safeTrim(model.comparisonNo).match(/\/R(\d+)$/i)?.[1] || 0) + 1}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenReviseConfirmation(false)} disabled={savingDraft}>Cancel</Button>
            <Button className="gap-2 bg-[#0b463f] text-white hover:bg-[#083a34]" onClick={() => void reviseComparativeStatement()} disabled={savingDraft}>
              <RotateCcw className="h-4 w-4" /> {savingDraft ? 'Saving…' : 'Create Revision'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openPrintOrientation} onOpenChange={setOpenPrintOrientation}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choose Print Orientation</DialogTitle>
            <DialogDescription>Select the A4 page orientation for the Commercial Comparative Statement.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <button
              type="button"
              onClick={() => {
                setOpenPrintOrientation(false);
                printComparativeReport('portrait');
              }}
              className="rounded-xl border border-[#d5e1dd] bg-white p-4 text-left transition hover:border-[#0b463f] hover:bg-[#edf5f2]"
            >
              <span className="mx-auto block h-20 w-14 rounded border-2 border-[#0b463f] bg-white" />
              <span className="mt-3 block text-center text-sm font-semibold text-[#0b463f]">A4 Portrait</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpenPrintOrientation(false);
                printComparativeReport('landscape');
              }}
              className="rounded-xl border-2 border-[#0b463f] bg-[#edf5f2] p-4 text-left transition hover:bg-[#e3efeb]"
            >
              <span className="mx-auto mt-3 block h-14 w-20 rounded border-2 border-[#0b463f] bg-white" />
              <span className="mt-3 block text-center text-sm font-semibold text-[#0b463f]">A4 Landscape</span>
              <span className="mt-1 block text-center text-[11px] text-[#58716a]">Recommended</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openRecommendation} onOpenChange={setOpenRecommendation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Technical Recommendation</DialogTitle>
            <DialogDescription>The lowest-cost (L1) vendor is always the technical recommendation.</DialogDescription>
          </DialogHeader>

          {!l1RecommendationVendor ? (
            <div className="text-sm text-muted-foreground">
              No vendors available to recommend. Select at least one vendor first.
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-md border border-[#0b463f]/30 bg-[#edf5f2] px-3 py-2">
              <span className="rounded-full bg-[#0b463f] px-2 py-0.5 text-[11px] font-bold text-white">L1</span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-muted-foreground">
                  Vendor ID: <span className="font-mono text-foreground">{l1RecommendationVendor.vendorDirectoryId || '—'}</span>
                </div>
                <div className="text-sm font-medium truncate">{l1RecommendationVendor.name || 'Vendor'}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Total: <span className="text-foreground">{l1RecommendationVendor.total ? inr(l1RecommendationVendor.total) : '—'}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenRecommendation(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmRecommendationAndSave}
              disabled={!l1RecommendationVendor || !recommendationVendorId || savingFinal}
            >
              {savingFinal ? 'Saving…' : 'Confirm & Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(
        <>
      <div className="overflow-auto rounded-xl border border-[#d5e1dd] bg-white shadow-sm">
        <table className="border-collapse table-fixed text-[12px] text-[#20352f]" style={{ width: `${490 + vendorOrder.length * 225}px`, minWidth: `${490 + vendorOrder.length * 225}px` }}>
          {/* Fix column widths so they never shrink */}
          <colgroup>
            <col style={{ width: 55 }} />
            <col style={{ width: 265 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 85 }} />
            {vendorOrder.map((v) => (
              <col key={`${v.id}-cols`} style={{ width: 225 }} />
            ))}
          </colgroup>

          <thead>
            <tr>
              <th className="border border-[#d5e1dd] bg-[#edf5f2] p-0 text-left align-top" colSpan={4 + vendorOrder.length}>
                <div className="space-y-2 p-4 text-center">
                  <Input
                    value={model.title || ''}
                    onChange={(e) => setModel((p) => (p ? { ...p, title: e.target.value } : p))}
                    className="h-10 border-[#cddbd6] bg-white text-center text-base font-bold text-[#0b463f]"
                    placeholder="Commercial Comparative Statement"
                  />
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-600">
                    <span className="text-foreground/80">Indent:</span>
                    <span className="font-medium text-foreground">{normalizedIndentId || indentId}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 border-t border-[#d5e1dd] bg-white text-[12px] font-normal">
                  {[
                    ['Comparison No.', <Input value={model.comparisonNo || ''} readOnly className="h-8 border-0 bg-transparent px-0 text-[12px] font-normal shadow-none" />],
                    ['Indent Date', <Input type="date" value={model.indentDate || ''} onChange={(e) => setModel({ ...model, indentDate: e.target.value })} className="h-8 border-0 bg-transparent px-0 text-[12px] font-normal shadow-none" />],
                    ['Department', <Input value={model.department || ''} onChange={(e) => setModel({ ...model, department: e.target.value })} className="h-8 border-0 bg-transparent px-0 text-[12px] font-normal shadow-none" placeholder="Department" />],
                    ['Project / Cluster', <Input value={model.projectCluster || ''} onChange={(e) => setModel({ ...model, projectCluster: e.target.value })} className="h-8 border-0 bg-transparent px-0 text-[12px] font-normal shadow-none" placeholder="Project / Cluster" />],
                    ['Requirement Type', <SelectBox value={model.requirementType || 'Goods'} onChange={(value) => setModel({ ...model, requirementType: value as RequirementType })} options={['Goods', 'Service', 'Works', 'Rental', 'Transport', 'Mixed']} />],
                    ['Delivery Location', <Input value={model.deliveryLocation || ''} onChange={(e) => setModel({ ...model, deliveryLocation: e.target.value })} className="h-8 border-0 bg-transparent px-0 text-[12px] font-normal shadow-none" placeholder="Location" />],
                    ['Comparison Basis', <SelectBox value={model.comparisonBasis || 'Landed Cost'} onChange={(value) => setModel({ ...model, comparisonBasis: value as ComparisonBasis })} options={['Landed Cost', 'Basic Cost', 'Monthly Cost', 'Per Acre', 'L1', 'Custom']} />],
                    ['Required By Date', <Input type="date" value={model.requiredByDate || ''} onChange={(e) => setModel({ ...model, requiredByDate: e.target.value })} className="h-8 border-0 bg-transparent px-0 text-[12px] font-normal shadow-none" />],
                  ].map(([label, control], index) => <div key={String(label)} className={`grid grid-cols-[150px_1fr] items-center gap-2 border-t border-[#d5e1dd] px-3 py-1 ${index % 2 === 0 ? 'border-r' : ''}`}><span className="text-[12px] font-normal text-[#425c55]">{label}</span><span className="min-w-0 [&_select]:h-8 [&_select]:border-0 [&_select]:bg-transparent [&_select]:px-0 [&_select]:text-[12px] [&_select]:font-normal [&_select]:text-[#20352f] [&_select]:shadow-none">{control}</span></div>)}
                  <div className="grid grid-cols-[150px_1fr] items-center gap-2 border-r border-t border-[#d5e1dd] px-3 py-1"><span className="text-[12px] font-normal text-[#425c55]">Prepared By</span><Input value={model.preparedBy || ''} onChange={(e) => setModel({ ...model, preparedBy: e.target.value })} className="h-8 border-0 bg-transparent px-0 text-[12px] font-normal text-[#20352f] shadow-none" placeholder="Prepared by" /></div>
                  <div className="grid grid-cols-[150px_1fr] items-center gap-2 border-t border-[#d5e1dd] px-3 py-1"><span className="text-[12px] font-normal text-[#425c55]">Purpose / Remarks</span><Input value={model.purposeRemarks || ''} onChange={(e) => setModel({ ...model, purposeRemarks: e.target.value })} className="h-8 border-0 bg-transparent px-0 text-[12px] font-normal text-[#20352f] shadow-none" placeholder="Purpose / remarks" /></div>
                </div>
              </th>
            </tr>

            <tr className="bg-[#0b463f] text-white">
              <th className="w-[60px] border border-[#2d625b] px-2 py-1">S. No.</th>
              <th className="border border-[#2d625b] px-2 py-1">Item / Part Name</th>
              <th className="w-[80px] border border-[#2d625b] px-2 py-1">QTY</th>
              <th className="w-[80px] border border-[#2d625b] px-2 py-1">UOM</th>
              {vendorOrder.map((v) => (
                <th key={`${v.id}-headcols`} className="border border-[#2d625b] bg-[#0b463f] px-2 py-2 text-[#20352f]">
                  <div className="flex items-center gap-1">
                    <select value={v.isManual ? '__manual__' : (v.directoryVendorId ?? '')} onChange={(e) => updateVendorFromDirectory(v.id, e.target.value)} className="h-8 w-0 min-w-0 flex-1 truncate rounded-md border border-[#b9cec7] bg-white px-2 text-[11px] font-semibold text-[#20352f] outline-none focus:ring-2 focus:ring-white/40">
                      <option value="">Select vendor</option>
                      {directoryVendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name} · {vendor.id}</option>)}
                      <option value="__manual__">Other / Manual Vendor</option>
                    </select>
                    <label className="flex h-8 shrink-0 cursor-pointer items-center rounded-md border border-[#0b463f] bg-white px-1.5 text-[9px] font-semibold text-[#0b463f] hover:bg-[#edf3ef]">
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => updateVendorField(v.id, 'attachmentUrl', String(reader.result || '')); reader.readAsDataURL(file); updateVendorField(v.id, 'attachmentName', file.name); }} />
                      Upload
                    </label>
                    <button type="button" className="flex h-8 shrink-0 items-center justify-center rounded-md bg-white p-2 text-red-500 hover:bg-red-50" onClick={() => removeVendor(v.id)} aria-label={`Remove ${v.name || 'vendor'}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {v.isManual && <Input value={v.name || ''} onChange={(event) => updateVendorField(v.id, 'name', event.target.value)} placeholder="Enter vendor name" className="mt-1 h-7 bg-white px-2 text-[10px]" />}
                  <div className="mt-1 grid grid-cols-[1fr_82px] gap-1">
                    <Input value={v.location || ''} onChange={(event) => updateVendorField(v.id, 'location', event.target.value)} placeholder="Vendor address" className="h-7 bg-white px-2 text-[10px]" disabled={!v.directoryVendorId && !v.isManual} />
                    <Input value={v.phone || ''} onChange={(event) => updateVendorField(v.id, 'phone', event.target.value)} placeholder="Phone" className="h-7 bg-white px-2 text-[10px]" disabled={!v.directoryVendorId && !v.isManual} />
                  </div>
                  {v.attachmentName && <div className="mt-1 truncate text-left text-[10px] font-medium text-[#d8eee7]">Uploaded: {v.attachmentName}</div>}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {model.items.length === 0 ? (
              <tr>
                <td
                  className="border border-border px-2 py-6 text-center text-muted-foreground"
                  colSpan={4 + vendorOrder.length}
                >
                  No items found for this indent.
                </td>
              </tr>
            ) : (
              model.items.map((it, idx) => (
                <tr key={it.id} className="text-center align-middle">
                  <td className="border border-border px-2 py-1 text-center align-middle">{idx + 1}</td>
                  <td className="border border-border px-2 py-2 align-middle">
                    <Input value={it.partName} onChange={(e) => updateItemField(it.id, 'partName', e.target.value)} className="mb-1 h-8 font-semibold" placeholder="Item / service name" />
                    <Input value={it.specification || ''} onChange={(e) => updateItemField(it.id, 'specification', e.target.value)} className="h-8" placeholder="Specification / scope" />
                    <div className="mt-1 grid grid-cols-[1fr_70px] gap-1">
                      <select value={it.taxType || 'GST'} onChange={(event) => updateItemField(it.id, 'taxType', event.target.value as TaxType)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-[11px] outline-none focus:ring-2 focus:ring-ring">
                        {['GST', 'IGST', 'CGST + SGST', 'Exempt', 'RCM', 'Nil Rated', 'Inclusive of Tax'].map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                        <Input
                          type="number"
                          min="0"
                          className="h-8 rounded-md bg-background px-2 text-center text-[11px]"
                          value={String(Number.isFinite(it.gstPercent as any) ? it.gstPercent : '')}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const num = Number(raw);
                            setModel((p) => {
                              if (!p) return p;
                              const items = p.items.map((x) =>
                                x.id === it.id
                                  ? {
                                      ...x,
                                      gstPercent: raw.trim() === '' ? undefined : Number.isFinite(num) ? num : x.gstPercent,
                                    }
                                  : x,
                              );
                              return { ...p, items };
                            });
                          }}
                          placeholder="Tax %"
                        />
                    </div>
                  </td>
                  <td className="border border-border px-2 py-1 text-center"><Input type="number" min="0" value={it.qty || ''} onChange={(e) => updateItemField(it.id, 'qty', Number(e.target.value) || 0)} className="h-8 text-center" /></td>
                  <td className="border border-border px-2 py-1 text-center"><Input value={it.uom} onChange={(e) => updateItemField(it.id, 'uom', e.target.value)} className="h-8 text-center" placeholder="UOM" /></td>
                  {vendorOrder.map((v) => {
                    const q = model.quotes.find((x) => x.vendorId === v.id);
                    const unit = q?.unitRateByItemId?.[it.id] ?? 0;
                    const locked = !vendorSelectedById[v.id];
                    return (
                      <Fragment key={`${it.id}-${v.id}-cells`}>
                        <td className="border border-border px-3 py-2 text-center align-middle">
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Unit Rate</div>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-9 text-center"
                            value={String(unit || '')}
                            onChange={(e) => setVendorRate(v.id, it.id, e.target.value)}
                            placeholder="0"
                            disabled={locked}
                          />
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))
            )}

            <tr className="bg-[#f7faf9]"><td className="border border-border px-4 py-2" colSpan={4 + vendorOrder.length}><button type="button" onClick={() => setModel({ ...model, items: [...model.items, { id: genId(), srNo: model.items.length + 1, partName: '', specification: '', hsnSac: '', qty: 0, uom: '', taxType: 'GST', gstPercent: 0 }] })} className="font-semibold text-[#0b463f]">⊕ Add Item</button></td></tr>

            {/* Summary section */}
            {vendorOrder.length > 0 && (
              <>
                <tr className="bg-[#0b463f] text-[12px] font-semibold text-white"><td colSpan={4} className="border border-[#2d625b]" />{vendorOrder.map((vendor) => <td key={`${vendor.id}-summary-head`} className="border border-[#2d625b] px-2 py-1 text-center align-middle">Value</td>)}</tr>
                {[
                  { label: 'Basic Amount (Excl. Tax)', type: '—', basis: 'Sum of Gross Amount', value: (id: string) => totalByVendor[id] || 0, tax: () => '—', amount: (id: string) => totalByVendor[id] || 0 },
                  { label: 'Item Discount', type: 'Discount', basis: '% of Basic Amount', value: (id: string) => itemDiscountByVendor[id] || 0, tax: () => '—', amount: (id: string) => itemDiscountByVendor[id] || 0 },
                  { label: 'Net Basic Amount', type: '—', basis: 'Basic Amount − Discount', value: () => null, tax: () => '—', amount: (id: string) => netBasicByVendor[id] || 0 },
                  { label: 'GST (as per item GST%)', type: 'GST', basis: 'On Net Basic Amount', value: (id: string) => gstByVendor[id] || 0, tax: () => 'Item-wise', amount: (id: string) => gstByVendor[id] || 0 },
                  { label: 'Additional Charges', type: 'Charge', basis: 'Fixed / % / Per Unit', value: (id: string) => Number(model.additionalChargesAmount?.[id] || 0), tax: () => '—', amount: (id: string) => Number(model.additionalChargesAmount?.[id] || 0) },
                  { label: 'Commercial Discount', type: 'Discount', basis: '% of (Net Basic + Charges)', value: (id: string) => Number(model.commercialDiscountAmount?.[id] || 0), tax: () => '—', amount: (id: string) => Number(model.commercialDiscountAmount?.[id] || 0) },
                  { label: 'Round Off', type: 'Round Off', basis: '—', value: (id: string) => Number(model.roundOffAmount?.[id] || 0), tax: () => '—', amount: (id: string) => Number(model.roundOffAmount?.[id] || 0) },
                ].map((row) => <tr key={row.label} className="bg-white"><td className="border border-border px-3 py-1 font-semibold" colSpan={4}>{row.label}</td>{vendorOrder.map((vendor) => { const editableKey = row.label === 'Item Discount' ? 'itemDiscountAmount' : row.label === 'Additional Charges' ? 'additionalChargesAmount' : row.label === 'Commercial Discount' ? 'commercialDiscountAmount' : row.label === 'Round Off' ? 'roundOffAmount' : null; return <td key={`${row.label}-${vendor.id}`} className="border border-border p-1 text-center align-middle text-[12px] font-normal tabular-nums">{editableKey ? <Input type="number" value={String(Number(model[editableKey]?.[vendor.id] || 0) || '')} onChange={(event) => setModel({ ...model, [editableKey]: { ...(model[editableKey] || {}), [vendor.id]: Number(event.target.value) || 0 } })} placeholder="0" className="h-7 appearance-none border-[#d5e1dd] bg-[#fbfdfc] px-2 text-center text-[12px] font-normal tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" /> : <span className="inline-flex h-7 items-center justify-center text-[12px] font-normal tabular-nums">{inr(Number(row.amount(vendor.id)))}</span>}</td>; })}</tr>)}
                {(model.charges || []).map((charge) => (
                  <tr key={charge.id} className="bg-white">
                    <td className="border border-border p-1" colSpan={4}>
                      <div className="flex items-center gap-2">
                        <Input
                          value={charge.label}
                          onChange={(event) => updateChargeAdjustment(charge.id, { label: event.target.value })}
                          placeholder="Charge name"
                          className="h-7 border-0 bg-transparent px-2 text-[12px] font-semibold shadow-none"
                        />
                        <button type="button" onClick={() => removeChargeAdjustment(charge.id)} className="rounded-md p-1.5 text-red-500 hover:bg-red-50" aria-label={`Delete ${charge.label || 'charge'}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    {vendorOrder.map((vendor) => (
                      <td key={`${charge.id}-${vendor.id}`} className="border border-border p-1 text-center align-middle">
                        <Input
                          type="number"
                          value={String(Number(charge.values?.[vendor.id] || 0) || '')}
                          onChange={(event) => updateChargeAdjustment(charge.id, { values: { ...charge.values, [vendor.id]: Number(event.target.value) || 0 } })}
                          placeholder="0"
                          className="h-7 appearance-none px-2 text-center text-[12px] font-normal tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-[#0b463f] font-bold text-white"><td className="border border-[#2d625b] px-3 py-1.5" colSpan={4}>Landed Cost / Grand Total</td>{vendorOrder.map((vendor) => <td key={`${vendor.id}-grand`} className="border border-[#2d625b] px-3 py-1.5 text-center align-middle text-[12px] font-bold tabular-nums text-white">{inr(grandTotalByVendor[vendor.id] || 0)}</td>)}</tr>
              </>
            )}

            {(model.comparisonParameters || []).map((parameter) => (
              <tr key={parameter.id} className="bg-white">
                <td className="border border-border p-1" colSpan={4}>
                  {parameter.standard ? (
                    <span className="block px-2 py-1 text-[12px] font-semibold">{parameter.label}</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        value={parameter.label}
                        onChange={(event) => setModel({ ...model, comparisonParameters: (model.comparisonParameters || []).map((entry) => entry.id === parameter.id ? { ...entry, label: event.target.value } : entry) })}
                        placeholder="Comparison parameter name"
                        className="h-7 border-0 bg-transparent px-2 text-[12px] font-semibold shadow-none"
                      />
                      <button
                        type="button"
                        onClick={() => setModel({ ...model, comparisonParameters: (model.comparisonParameters || []).filter((entry) => entry.id !== parameter.id) })}
                        className="rounded-md p-1.5 text-red-500 hover:bg-red-50"
                        aria-label={`Delete ${parameter.label || 'comparison parameter'}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </td>
                {vendorOrder.map((vendor) => (
                  <td key={vendor.id} className="border border-border p-1.5">
                    <AutoGrowTextarea
                      value={parameter.values[vendor.id] || ''}
                      onChange={(value) => setModel({ ...model, comparisonParameters: (model.comparisonParameters || []).map((entry) => entry.id === parameter.id ? { ...entry, values: { ...entry.values, [vendor.id]: value } } : entry) })}
                      placeholder="Enter details"
                      className="min-h-8 w-full resize-none overflow-hidden rounded-md border border-[#d5e1dd] bg-[#fbfdfc] px-2 py-1.5 text-[11px] outline-none focus:border-[#0b463f] focus:ring-1 focus:ring-[#0b463f]/20"
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-[#edf5f2]"><td className="border border-border px-3 py-1.5 font-semibold text-[#0b463f]" colSpan={4}>Vendor Status</td>{vendorOrder.map((vendor) => <td key={vendor.id} className="border border-border px-3 py-1.5 font-semibold text-[#0b463f]">{vendorLTagByVendorId[vendor.id] || '—'}</td>)}</tr>
            <tr className="bg-[#f7faf9]">
              <td className="border border-border px-3 py-2" colSpan={4 + vendorOrder.length}>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const parameterNumber = (model.comparisonParameters || []).filter((parameter) => !parameter.standard).length + 1;
                      addComparisonParameter(`Comparison Parameter ${parameterNumber}`);
                    }}
                    className="h-8 gap-1.5 border-[#0b463f]/30 bg-white px-3 text-[12px] font-semibold text-[#0b463f] hover:bg-[#edf3ef] hover:text-[#0b463f]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Comparison Parameter
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const chargeNumber = (model.charges || []).length + 1;
                      setModel({ ...model, charges: [...(model.charges || []), { id: genId(), label: `Charge ${chargeNumber}`, nature: 'Charge', calculation: 'Fixed', taxPercent: 0, values: {} }] });
                    }}
                    className="h-8 gap-1.5 border-[#0b463f]/30 bg-white px-3 text-[12px] font-semibold text-[#0b463f] hover:bg-[#edf3ef] hover:text-[#0b463f]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Charge
                  </Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <section className="hidden">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="font-bold text-slate-900">Charges & Adjustments</h2><p className="text-sm text-slate-500">Add freight, packing, insurance, handling, discounts or any project-specific adjustment.</p></div>
          <div className="flex gap-2"><Input value={newChargeLabel} onChange={(e) => setNewChargeLabel(e.target.value)} placeholder="Charge / adjustment name" className="w-64" /><Button type="button" onClick={addChargeAdjustment} className="bg-[#0b463f]"><Plus className="mr-1 h-4 w-4" /> Add</Button></div>
        </div>
        {(model.charges || []).length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">No additional charges or discounts added.</div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] border-collapse text-sm"><thead><tr className="bg-[#0b463f] text-white"><th className="p-3 text-left">Description</th><th className="p-3">Nature</th><th className="p-3">Calculation</th><th className="p-3">Tax %</th>{vendorOrder.map((v) => <th key={v.id} className="p-3">{v.name}</th>)}<th className="w-12" /></tr></thead><tbody>{(model.charges || []).map((charge) => <tr key={charge.id} className="border-b border-slate-200"><td className="p-2"><Input value={charge.label} onChange={(e) => updateChargeAdjustment(charge.id, { label: e.target.value })} /></td><td className="p-2"><SelectBox value={charge.nature} onChange={(value) => updateChargeAdjustment(charge.id, { nature: value as ChargeAdjustment['nature'] })} options={['Charge', 'Discount']} /></td><td className="p-2"><SelectBox value={charge.calculation} onChange={(value) => updateChargeAdjustment(charge.id, { calculation: value as ChargeAdjustment['calculation'] })} options={['Fixed', '% of Basic']} /></td><td className="p-2"><Input type="number" value={charge.taxPercent} onChange={(e) => updateChargeAdjustment(charge.id, { taxPercent: Number(e.target.value) || 0 })} /></td>{vendorOrder.map((v) => <td key={v.id} className="p-2"><Input type="number" value={charge.values[v.id] || ''} onChange={(e) => updateChargeAdjustment(charge.id, { values: { ...charge.values, [v.id]: Number(e.target.value) || 0 } })} /></td>)}<td className="p-2"><button type="button" onClick={() => removeChargeAdjustment(charge.id)} className="text-red-500"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>
        )}
      </section>
        </>
      )}

      {(
        <section className="hidden">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="font-bold text-slate-900">Technical Comparison</h2><p className="text-sm text-slate-500">Compare only the parameters relevant to this requirement.</p></div>
            <div className="flex gap-2"><Input value={newTechnicalLabel} onChange={(e) => setNewTechnicalLabel(e.target.value)} placeholder="Technical parameter" className="w-64" /><Button onClick={addTechnicalParameter} className="bg-[#0b463f]"><Plus className="mr-1 h-4 w-4" /> Add</Button></div>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[850px] border-collapse text-sm"><thead><tr className="bg-[#0b463f] text-white"><th className="p-3 text-left">Parameter</th><th className="p-3 text-left">Required Specification</th>{vendorOrder.map((vendor) => <th key={vendor.id} className="p-3 text-left">{vendor.name}</th>)}<th className="w-12" /></tr></thead><tbody>
            {(model.technicalParameters || []).map((parameter) => <tr key={parameter.id} className="border-b border-slate-200"><td className="p-2"><Input value={parameter.label} onChange={(e) => setModel({ ...model, technicalParameters: (model.technicalParameters || []).map((entry) => entry.id === parameter.id ? { ...entry, label: e.target.value } : entry) })} /></td><td className="p-2"><Input value={parameter.requiredValue} onChange={(e) => setModel({ ...model, technicalParameters: (model.technicalParameters || []).map((entry) => entry.id === parameter.id ? { ...entry, requiredValue: e.target.value } : entry) })} /></td>{vendorOrder.map((vendor) => <td key={vendor.id} className="p-2"><Input value={parameter.values[vendor.id] || ''} onChange={(e) => setModel({ ...model, technicalParameters: (model.technicalParameters || []).map((entry) => entry.id === parameter.id ? { ...entry, values: { ...entry.values, [vendor.id]: e.target.value } } : entry) })} /></td>)}<td className="p-2"><button type="button" onClick={() => setModel({ ...model, technicalParameters: (model.technicalParameters || []).filter((entry) => entry.id !== parameter.id) })} className="text-red-500"><Trash2 className="h-4 w-4" /></button></td></tr>)}
          </tbody></table></div>
          {(model.technicalParameters || []).length === 0 && <div className="rounded-b-xl border border-t-0 border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">Add a parameter such as make, model, capacity, experience, methodology or compliance.</div>}
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{vendorOrder.map((vendor) => <Field key={vendor.id} label={`${vendor.name} · Technical Status`}><SelectBox value={model.technicalStatus?.[vendor.id] || 'Pending'} onChange={(value) => setModel({ ...model, technicalStatus: { ...(model.technicalStatus || {}), [vendor.id]: value } })} options={['Pending', 'Technically Qualified', 'Technically Disqualified', 'Deviation Noted']} /></Field>)}</div>
        </section>
      )}

      {(
        <div className="hidden">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-bold text-slate-900">Commercial Terms</h2><p className="text-sm text-slate-500">Standard terms plus template-specific and custom comparison parameters.</p></div><div className="flex gap-2"><Input value={newTermLabel} onChange={(e) => setNewTermLabel(e.target.value)} placeholder="Add comparison parameter" className="w-64" /><Button onClick={() => addComparisonParameter()} className="bg-[#0b463f]"><Plus className="mr-1 h-4 w-4" /> Add</Button></div></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[800px] border-collapse text-sm"><thead><tr className="bg-[#0b463f] text-white"><th className="p-3 text-left">Comparison Parameter</th>{vendorOrder.map((vendor) => <th key={vendor.id} className="p-3 text-left">{vendor.name}</th>)}<th className="w-12" /></tr></thead><tbody>{(model.comparisonParameters || []).map((parameter) => <tr key={parameter.id} className="border-b border-slate-200"><td className="p-2"><Input value={parameter.label} onChange={(e) => setModel({ ...model, comparisonParameters: (model.comparisonParameters || []).map((entry) => entry.id === parameter.id ? { ...entry, label: e.target.value } : entry) })} /></td>{vendorOrder.map((vendor) => <td key={vendor.id} className="p-2"><Input value={parameter.values[vendor.id] || ''} onChange={(e) => setModel({ ...model, comparisonParameters: (model.comparisonParameters || []).map((entry) => entry.id === parameter.id ? { ...entry, values: { ...entry.values, [vendor.id]: e.target.value } } : entry) })} placeholder="Enter vendor term" /></td>)}<td className="p-2">{!parameter.standard && <button type="button" onClick={() => setModel({ ...model, comparisonParameters: (model.comparisonParameters || []).filter((entry) => entry.id !== parameter.id) })} className="text-red-500"><Trash2 className="h-4 w-4" /></button>}</td></tr>)}</tbody></table></div>
          </section>

          {(['Service', 'Works', 'Rental'] as RequirementType[]).includes(model.requirementType || 'Goods') && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-bold text-slate-900">Scope Responsibility Matrix</h2><p className="text-sm text-slate-500">Define company, vendor and shared responsibilities clearly.</p></div><div className="flex gap-2"><Input value={newScopeLabel} onChange={(e) => setNewScopeLabel(e.target.value)} placeholder="Scope item" className="w-64" /><Button onClick={addScopeResponsibility} className="bg-[#0b463f]"><Plus className="mr-1 h-4 w-4" /> Add</Button></div></div><div className="space-y-2">{(model.scopeResponsibilities || []).map((scope) => <div key={scope.id} className="grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_180px_1fr_40px]"><Input value={scope.label} onChange={(e) => setModel({ ...model, scopeResponsibilities: (model.scopeResponsibilities || []).map((entry) => entry.id === scope.id ? { ...entry, label: e.target.value } : entry) })} /><SelectBox value={scope.assignedTo} onChange={(value) => setModel({ ...model, scopeResponsibilities: (model.scopeResponsibilities || []).map((entry) => entry.id === scope.id ? { ...entry, assignedTo: value as ScopeResponsibility['assignedTo'] } : entry) })} options={['Company', 'Vendor', 'Shared']} /><Input value={scope.remarks} onChange={(e) => setModel({ ...model, scopeResponsibilities: (model.scopeResponsibilities || []).map((entry) => entry.id === scope.id ? { ...entry, remarks: e.target.value } : entry) })} placeholder="Remarks" /><button type="button" onClick={() => setModel({ ...model, scopeResponsibilities: (model.scopeResponsibilities || []).filter((entry) => entry.id !== scope.id) })} className="text-red-500"><Trash2 className="h-4 w-4" /></button></div>)}</div></section>}
        </div>
      )}

      {(
        <section className="hidden">
          <div className="mb-4"><h2 className="font-bold text-slate-900">Quotation Attachments & Revisions</h2><p className="text-sm text-slate-500">Keep each vendor's original and revised quotation references together.</p></div>
          <div className="grid gap-4 xl:grid-cols-2">{vendorOrder.map((vendor) => <div key={vendor.id} className="rounded-xl border border-slate-200 p-4"><div className="mb-3 font-semibold text-[#0b463f]">{vendor.name}</div><div className="grid gap-3 md:grid-cols-2"><Field label="Quotation No."><Input value={vendor.quotationNo || ''} onChange={(e) => updateVendorField(vendor.id, 'quotationNo', e.target.value)} /></Field><Field label="Quotation Date"><Input type="date" value={vendor.quotationDate || ''} onChange={(e) => updateVendorField(vendor.id, 'quotationDate', e.target.value)} /></Field><Field label="Revised Quotation No."><Input value={vendor.revisedQuotationNo || ''} onChange={(e) => updateVendorField(vendor.id, 'revisedQuotationNo', e.target.value)} /></Field><Field label="Revised Quotation Date"><Input type="date" value={vendor.revisedQuotationDate || ''} onChange={(e) => updateVendorField(vendor.id, 'revisedQuotationDate', e.target.value)} /></Field></div><label className="mt-4 block rounded-xl border-2 border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 hover:bg-slate-50"><input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => updateVendorField(vendor.id, 'attachmentUrl', String(reader.result || '')); reader.readAsDataURL(file); updateVendorField(vendor.id, 'attachmentName', file.name); }} /><span className="font-semibold text-[#0b463f]">Choose quotation file</span><span className="mt-1 block">{vendor.attachmentName || 'PDF, PNG or JPG'}</span></label>{vendor.attachmentUrl && <a href={vendor.attachmentUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-[#0b463f] underline">Preview attachment</a>}</div>)}</div>
        </section>
      )}

      <section className="hidden">
        <div className="mb-4"><h2 className="font-bold text-slate-900">Recommendation & Award Strategy</h2><p className="text-sm text-slate-500">Record the commercial decision, supporting reason and proposed award method.</p></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Recommended Vendor"><select value={model.technicalRecommendationVendorId || ''} onChange={(e) => setModel({ ...model, technicalRecommendationVendorId: e.target.value })} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="">Select vendor</option>{vendorOrder.filter((vendor) => vendor.directoryVendorId || (vendor.isManual && vendor.name.trim())).map((vendor) => { const value = vendor.directoryVendorId || `MANUAL:${vendor.name.trim()}`; return <option key={vendor.id} value={value}>{vendor.name} · {vendorLTagByVendorId[vendor.id] || 'Unranked'}</option>; })}</select></Field>
          <Field label="Award Strategy"><SelectBox value={model.awardStrategy || 'Single Vendor'} onChange={(value) => setModel({ ...model, awardStrategy: value as Comparative['awardStrategy'] })} options={['Single Vendor', 'Split Order', 'Item-wise Award']} /></Field>
          <Field label="Recommendation Reason"><Input value={model.recommendationReason || ''} onChange={(e) => setModel({ ...model, recommendationReason: e.target.value })} placeholder="Why this vendor is recommended" /></Field>
          <Field label="Procurement Remarks"><Input value={model.procurementRemarks || ''} onChange={(e) => setModel({ ...model, procurementRemarks: e.target.value })} placeholder="Final procurement note" /></Field>
        </div>
      </section>

      <div className="hidden">
        Tip: This page is a full page (not a popup). Use Save to store the quotation.
      </div>
    </div>
  );
}
