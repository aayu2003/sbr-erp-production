import { Fragment, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  IndianRupee,
  Loader2,
  Lock,
  Package,
  PackageSearch,
  Paperclip,
  Plus,
  Printer,
  Search,
  Settings,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  readInventoryIndentConfig,
  writeInventoryIndentConfig,
} from '@/lib/inventoryIndentConfig';
import { getBaseUrl } from '@/lib/config';
import { useAuth } from '@/context/AuthContext';
import { formatDateDDMMYYYY } from '@/lib/dateFormat';
import logo3f from '@/Assets/3f-logo.png';
import { printInventoryIndentPdf } from '@/lib/inventoryIndentPdf';

type PRLineItem = {
  id: string;
  srNo: number;
  category: string;
  itemCode: string;
  partName: string;
  specification: string;
  uom: string;
  totalQtyRequired: number;
  lessQtyAvailableInStock: number;
  procurementLeadTimeWeeks: number;
  materialRequiredByDate: string;
  indigenousOrImported: 'Indigenous' | 'Imported';
  ratePerItem: number;
  preferredVendorName: string;
  validityOfWarrantyAndGuarantee: string;
  fullLifeHr: string;
  actualLifeHr: string;
  reasonForReplacement: string;
  repairingPossibility: 'Yes' | 'No' | 'NA';
  // Set when this row's item code came from an already-existing inventory item
  // (e.g. via "Request Stock"). Selecting/re-selecting a category must not
  // regenerate a fresh code for those rows — only genuinely new item rows
  // (added via "+ Add Row") get an auto-generated code on category select.
  lockItemCode?: boolean;
};

type IndentSignatureDetails = {
  nameId: string;
  signature: string;
  timestamp?: string;
};

type Indent = {
  id: string;
  // Header
  project: string;
  prNo: string; // will be auto-generated via API later
  department?: string;
  date: string;

  // Footer
  indentedBy: string;
  forwardedBy: string;
  directorsApproval: string;
  remarksNotes: string;
  budgetHead: string;

  // Body
  items: PRLineItem[];

  // backend signature support
  indentedByDetails?: IndentSignatureDetails;
  forwardedByDetails?: IndentSignatureDetails;
  directorsApprovalDetails?: IndentSignatureDetails;

  // workflow
  status: 'open' | 'forwarded' | 'approved' | 'rejected';
};

type IndentApproval = {
  staffName: string;
  staffDesignation: string;
  approvedAt: string; // YYYY-MM-DD
  approvedTime: string; // HH:mm
};

type EmployeeOption = {
  id: string;
  name: string;
  designation: string;
};

const employeeOptionValue = (employee: EmployeeOption) => `${employee.name} / ${employee.id}`;

type BudgetLineItemSelection = {
  id: string;
  lineNo: number;
  name: string;
  category: string;
  budgetType: string;
  uom: string;
  qtyPerAcre: number;
  totalAcres: number;
  totalQty: number;
  ratePerUnit: number;
  totalValue: number;
  amount: number; // user-editable allocation
};

type BudgetHeadSelection = {
  budgetId: string;
  budgetName: string;
  lineItems: BudgetLineItemSelection[];
};

// ── Budget API types ──────────────────────────────────────────────────────────
type ApiBudget = {
  budget_id: string;
  budget_name: string;
  crop_season: string;
  financial_year_start: string;
  financial_year_end: string;
  status: string;
};

type ApiBudgetLineItem = {
  line_item_id: string;
  budget_type: string;
  category: string;
  line_item: string;
  UoM: string;
  quantity_per_acre: number;
  total_acres: number;
  total_quantity: number;
  rate_per_unit: number;
  total_value: number;
  utilized_amount: number;
  savings: number;
};

const INVENTORY_ITEM_CATEGORIES = [
  'Seeds',
  'Fertilizers',
  'Agro Chemicals',
  'Pesticides',
  'Implements',
  'Machines',
  'Spare Parts',
  'Tools & Consumables',
  'Irrigation Materials',
  'Packaging Material',
  'Agro Equipments',
  'Equipment',
  'Electrical Items',
  'Civil & Infra Equipments',
  'Storage Materials',
  'IT Assets',
  'Office & Administration',
  'Others',
];

const INVENTORY_CATEGORY_CODES: Record<string, string> = {
  seeds: 'SED', fertilizer: 'FRT', fertilizers: 'FRT', agrochemicals: 'AGC', pesticides: 'PST',
  implements: 'IMP', machines: 'MAC', spareparts: 'SPR', toolsandconsumables: 'TNC', tools: 'TNC',
  irrigationmaterials: 'IRM', packagingmaterial: 'PKG', packaging: 'PKG', agroequipments: 'AGE',
  agroequipment: 'AGE', equipment: 'EQP', equipments: 'EQP', electricalitems: 'ELC',
  civilandinfraequipments: 'CIV', storagematerials: 'STR', itassets: 'ITA',
  officeandadministration: 'OFF', others: 'OTH',
};

const inventoryCategoryCode = (category: string) => (
  INVENTORY_CATEGORY_CODES[String(category || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '')] || 'OTH'
);

const incrementInventoryItemCode = (code: string, offset: number) => {
  if (offset <= 0) return code;
  const match = String(code).match(/^(.*\/)(\d+)$/);
  if (!match) return code;
  const next = Number(match[2]) + offset;
  return `${match[1]}${String(next).padStart(match[2].length, '0')}`;
};

const genId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const today = () => new Date().toISOString().split('T')[0];
const currentDateYmd = () => {
  try {
    // en-CA yields YYYY-MM-DD in most browsers
    return new Date().toLocaleDateString('en-CA');
  } catch {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
};

const currentTimeHm = () => {
  try {
    return new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    const d = new Date();
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
};

const formatPersonDisplay = (p: any) => {
  if (!p) return '';
  if (typeof p === 'string') return p;
  if (typeof p?.name_id === 'string') return p.name_id;
  // try common fields for name and id
  const name = p.name || p.full_name || p.username || '';
  const id = p.id || p.user_id || p.emp_id || p.employee_id || '';
  if (name && id) return `${name} / ${id}`;
  return name || id || '';
};

const signatureDetailsFrom = (person: any): IndentSignatureDetails | undefined => {
  if (!person || typeof person !== 'object') return undefined;
  const signature = String(person.signature ?? person.digital_signature ?? '').trim();
  if (!signature) return undefined;
  return {
    nameId: String(person.name_id ?? formatPersonDisplay(person) ?? '').trim(),
    signature,
    timestamp: person.timestamp || person.signed_at || person.approved_at
      ? String(person.timestamp ?? person.signed_at ?? person.approved_at)
      : undefined,
  };
};

const ymdFromIsoTimestamp = (ts?: string) => {
  if (!ts) return '';
  const s = String(ts);
  const ymd = s.split('T')[0];
  return ymd || '';
};

const netPrQty = (it: PRLineItem) => Math.max(0, (it.totalQtyRequired || 0) - (it.lessQtyAvailableInStock || 0));
const approxValue = (it: PRLineItem) => netPrQty(it) * (it.ratePerItem || 0);
const totalValue = (items: PRLineItem[]) => items.reduce((sum, it) => sum + approxValue(it), 0);

const formatInr = (value: number) => {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
  } catch {
    return `₹ ${Math.round(value).toLocaleString()}`;
  }
};

const formatBudgetHead = (budgetHead: any): string => {
  if (!budgetHead) return '';
  const lineItems = Array.isArray(budgetHead.line_item) ? budgetHead.line_item : [];
  if (lineItems.length === 0) return '';
  return lineItems
    .map((li: any) =>
      `${li.category || ''} | ${li.line_item || ''} | ${li.budget_type || ''} | ${formatInr(Number(li.allocated_amount) || 0)}`
    )
    .join('\n');
};

const toPurchaseFlowRow = (it: PRLineItem) => {
  return {
    sr_no: it.srNo,
    category: it.category,
    item_code: it.itemCode,
    part_name: it.partName,
    specification: it.specification,
    uom: it.uom,
    total_qty_required: it.totalQtyRequired,
    less_qty_available_in_stock: it.lessQtyAvailableInStock,
    net_pr_qty: netPrQty(it),
    procurement_lead_time_weeks: it.procurementLeadTimeWeeks,
    material_required_by_date: it.materialRequiredByDate,
    indigenous_or_imported: it.indigenousOrImported,
    rate_per_item: it.ratePerItem,
    approx_value: approxValue(it),
    preferred_vendor_name: it.preferredVendorName,
    validity_of_warranty_and_guarantee: it.validityOfWarrantyAndGuarantee,
    full_life_hr: it.fullLifeHr,
    actual_life_hr: it.actualLifeHr,
    reason_for_replacement: it.reasonForReplacement,
    repairing_possibility: it.repairingPossibility,
  };
};

const createIndentApi = async (payload: {
  item_row: Record<string, unknown>[];
  project: string;
  pr_number?: string;
  notes: string;
  department: string;
  indent_type: string;
  budget_head?: {
    budget_id: string;
    line_item: Record<string, unknown>[];
  };
}) => {
  const BASE_URL = getBaseUrl().replace(/\/$/, '');
  const res = await fetch(`${BASE_URL}/purchase_flow/create_indent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const message =
      (data && (data.detail || data.message)) ||
      `Failed to create indent (HTTP ${res.status})`;
    throw new Error(message);
  }

  if (data?.success === false) {
    throw new Error(data?.message || data?.detail || 'Failed to create indent');
  }

  return data;
};

const indentByAttachSignApi = async (payload: {
  pr_number: string;
  name_id: string;
  signature: string;
}) => {
  const BASE_URL = getBaseUrl().replace(/\/$/, '');
  const res = await fetch(`${BASE_URL}/purchase_flow/indent_by_attach_sign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const message =
      (data && (data.detail || data.message)) ||
      `Failed to attach sign (HTTP ${res.status})`;
    throw new Error(message);
  }

  return data;
};

const emptyLineItem = (srNo: number): PRLineItem => ({
  id: genId(),
  srNo,
  category: '',
  itemCode: '',
  partName: '',
  specification: '',
  uom: 'No',
  totalQtyRequired: 0,
  lessQtyAvailableInStock: 0,
  procurementLeadTimeWeeks: 0,
  materialRequiredByDate: today(),
  indigenousOrImported: 'Indigenous',
  ratePerItem: 0,
  preferredVendorName: '',
  validityOfWarrantyAndGuarantee: 'NA',
  fullLifeHr: 'NA',
  actualLifeHr: 'NA',
  reasonForReplacement: 'NA',
  repairingPossibility: 'NA',
});

const initialIndents: Indent[] = [
  {
    id: 'i1',
    project: 'Chhattisgarh 2250 Acres',
    prNo: 'SBR/NF/25-26/03',
    date: '2026-02-09',
    indentedBy: 'SUKHDEEP SINGH',
    forwardedBy: 'RAJINDER SINGH PADDA',
    directorsApproval: 'RAJENDRA SHRINGARPUTALE',
    remarksNotes: '',
    budgetHead: 'Machinery - Cultivation',
    status: 'open',
    items: [
      {
        id: 'li1',
        srNo: 1,
        category: 'Implements',
        itemCode: '',
        partName: 'Chisel Plough',
        specification: '5 - Tynes/W - 4 ft',
        uom: 'No',
        totalQtyRequired: 4,
        lessQtyAvailableInStock: 0,
        procurementLeadTimeWeeks: 2,
        materialRequiredByDate: '2026-02-09',
        indigenousOrImported: 'Indigenous',
        ratePerItem: 45000,
        preferredVendorName: 'Vishwakarma',
        validityOfWarrantyAndGuarantee: 'NA',
        fullLifeHr: 'NA',
        actualLifeHr: 'NA',
        reasonForReplacement: 'Project Item',
        repairingPossibility: 'NA',
      },
    ],
  },
];

export type InventoryIndentProps = {
  pageVariant?: 'inventory' | 'purchase';
};

const InventoryIndent = ({ pageVariant = 'inventory' }: InventoryIndentProps) => {
  const isPurchasePage = pageVariant === 'purchase';
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [indents, setIndents] = useState<Indent[]>(isPurchasePage ? [] : initialIndents);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Indent['status']>('all');
  const [open, setOpen] = useState(false);
  const [prefillDraft, setPrefillDraft] = useState<IndentDraft | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [configVersion, setConfigVersion] = useState(0);
  const [previewIndent, setPreviewIndent] = useState<Indent | null>(null);
  const [indentPendingDelete, setIndentPendingDelete] = useState<Indent | null>(null);
  const [itemsPreviewIndent, setItemsPreviewIndent] = useState<Indent | null>(null);
  const [hoveredItemsRowId, setHoveredItemsRowId] = useState<string | null>(null);
  const [itemsHoverAnchor, setItemsHoverAnchor] = useState<{ top: number; left: number } | null>(null);

  const [indentApprovalsMap, setIndentApprovalsMap] = useState<Record<string, IndentApproval>>({});
  const [attachingApprovalMap, setAttachingApprovalMap] = useState<Record<string, boolean>>({});

  const loadIndents = async () => {
    try {
      const BASE_URL = getBaseUrl().replace(/\/$/, '');
      const res = await fetch(`${BASE_URL}/purchase_flow/get_indents`);
      if (!res.ok) throw new Error(`Failed to fetch indents (HTTP ${res.status})`);
      const data: any = await res.json();
      const raw = Array.isArray(data?.indents) ? data.indents : [];

      const mapped: Indent[] = raw.map((r: any, idx: number) => {
        const items: PRLineItem[] = (r.indent_data?.item_row ?? []).map((row: any, i: number) => ({
          id: genId(),
          srNo: row.sr_no ?? i + 1,
          category: row.category ?? '',
          itemCode: row.item_code ?? row.itemCode ?? '',
          partName: row.part_name ?? row.partName ?? '',
          specification: row.specification ?? '',
          uom: row.uom ?? 'No',
          totalQtyRequired: row.total_qty_required ?? row.totalQtyRequired ?? 0,
          lessQtyAvailableInStock: row.less_qty_available_in_stock ?? row.lessQtyAvailableInStock ?? 0,
          procurementLeadTimeWeeks: row.procurement_lead_time_weeks ?? row.procurementLeadTimeWeeks ?? 0,
          materialRequiredByDate: row.material_required_by_date ?? today(),
          indigenousOrImported: (row.indigenous_or_imported ?? 'Indigenous') === 'Imported' ? 'Imported' : 'Indigenous',
          ratePerItem: row.rate_per_item ?? row.ratePerItem ?? 0,
          preferredVendorName: row.preferred_vendor_name ?? row.preferredVendorName ?? '',
          validityOfWarrantyAndGuarantee: row.validity_of_warranty_and_guarantee ?? 'NA',
          fullLifeHr: row.full_life_hr ?? 'NA',
          actualLifeHr: row.actual_life_hr ?? 'NA',
          reasonForReplacement: row.reason_for_replacement ?? 'NA',
          repairingPossibility: row.repairing_possibility ?? 'NA',
        }));

        const indentedByDetails = signatureDetailsFrom(r.indented_by);
        const forwardedByDetails = signatureDetailsFrom(r.forwarded_by);
        const directorsApprovalDetails = signatureDetailsFrom(r.approved_by);

        const derivedStatus: Indent['status'] =
          directorsApprovalDetails?.signature
            ? 'approved'
            : forwardedByDetails?.signature || indentedByDetails?.signature
              ? 'forwarded'
              : 'open';

        return {
          id: r.pr_number ?? `${r.created_at ?? ''}-${idx}`,
          project: r.indent_data?.project ?? '',
          department: r.department ?? '',
          prNo: r.pr_number ?? '',
          date: r.created_at ? String(r.created_at).split('T')[0] : today(),
          indentedBy: formatPersonDisplay(r.indented_by),
          forwardedBy: formatPersonDisplay(r.forwarded_by),
          directorsApproval: formatPersonDisplay(r.approved_by),
          remarksNotes: r.notes ?? '',
          budgetHead: formatBudgetHead(r.budget_head),
          items,
          indentedByDetails,
          forwardedByDetails,
          directorsApprovalDetails,
          status: derivedStatus,
        } as Indent;
      });

      const scopedIndents = mapped.filter((indent) => {
        const department = String(indent.department || '').trim().toUpperCase();
        return isPurchasePage ? department === 'PURCHASE' : department !== 'PURCHASE';
      });
      setIndents(scopedIndents);
    } catch (err: any) {
      toast.error(err?.message || 'Unable to load indents');
    }
  };

  useEffect(() => {
    void loadIndents();
  }, [isPurchasePage]);

  useEffect(() => {
    const state: any = location.state;
    const incomingItems = Array.isArray(state?.items) ? state.items : [];
    if (!state?.fromInventoryRequest || incomingItems.length === 0) return;

    const cfg = readInventoryIndentConfig();
    const mappedItems: PRLineItem[] = incomingItems.map((it: any, idx: number) => ({
      ...emptyLineItem(idx + 1),
      id: genId(),
      srNo: idx + 1,
      category: String(it?.category || ''),
      partName: String(it?.itemName || ''),
      itemCode: String(it?.itemCode || ''),
      specification: String(it?.specification || ''),
      uom: String(it?.uom || 'No'),
      lessQtyAvailableInStock: Number(it?.stock) || 0,
      lockItemCode: Boolean(String(it?.itemCode || '').trim()),
    }));

    setPrefillDraft({
      project: (cfg.projects ?? [])[0] ?? '',
      prNo: '',
      department: '',
      date: today(),
      indentedBy: cfg.indentedBy ?? '',
      forwardedBy: cfg.forwardedBy ?? '',
      directorsApproval: cfg.directorsApproval ?? '',
      remarksNotes: '',
      budgetHead: '',
      items: mappedItems,
    });
    setOpen(true);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return indents.filter((it) => {
      if (statusFilter !== 'all' && it.status !== statusFilter) return false;
      return (
        (it.project ?? '').toLowerCase().includes(q) ||
        (it.prNo ?? '').toLowerCase().includes(q) ||
        (it.indentedBy ?? '').toLowerCase().includes(q) ||
        (it.items ?? []).some(
          (li) =>
            (li.partName ?? '').toLowerCase().includes(q) ||
            (li.itemCode ?? '').toLowerCase().includes(q),
        )
      );
    });
  }, [indents, search, statusFilter]);

  const indentSummary = useMemo(() => ({
    total: indents.length,
    open: indents.filter((indent) => indent.status === 'open').length,
    processed: indents.filter((indent) => indent.status === 'forwarded' || indent.status === 'approved').length,
    value: indents.reduce((sum, indent) => sum + totalValue(indent.items ?? []), 0),
  }), [indents]);

  const attachIndentApproval = async (indentRef: Pick<Indent, 'id' | 'prNo'>) => {
    const id = indentRef.id;
    const cached = (() => {
      try {
        const raw = localStorage.getItem('fc_auth_v1');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.user ?? null;
      } catch {
        return null;
      }
    })();

    const staffName = String(user?.name ?? cached?.name ?? '').trim();
    const staffDesignation = String(user?.designation ?? cached?.designation ?? '').trim();

    if (!staffName || !staffDesignation) {
      toast.error('No cached staff data found. Please login again.');
      return;
    }

    const prNo = String(indentRef.prNo ?? '').trim();
    if (!prNo) {
      toast.error('PR number is missing for this indent.');
      return;
    }

    const approval: IndentApproval = {
      staffName,
      staffDesignation,
      approvedAt: currentDateYmd(),
      approvedTime: currentTimeHm(),
    };

    const nameId = `${approval.staffName} / ${approval.staffDesignation}`;
    const signature = `Approver | ${approval.staffName} | ${approval.approvedTime} | ${approval.approvedAt}`;

    try {
      setAttachingApprovalMap((prev) => ({ ...prev, [id]: true }));
      await indentByAttachSignApi({
        pr_number: prNo,
        name_id: nameId,
        signature,
      });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to attach sign');
      return;
    } finally {
      setAttachingApprovalMap((prev) => ({ ...prev, [id]: false }));
    }

    setIndentApprovalsMap((prev) => ({ ...prev, [id]: approval }));
    setIndents((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              indentedBy: nameId,
              indentedByDetails: {
                nameId,
                signature,
                timestamp: new Date().toISOString(),
              },
              status: 'forwarded',
            }
          : it,
      ),
    );
    toast.success(`Approved by ${staffName} / ${staffDesignation}`);
  };

  const deleteIndentFromRegister = () => {
    if (!indentPendingDelete) return;

    setIndents((current) => current.filter((indent) => indent.id !== indentPendingDelete.id));
    setPreviewIndent((current) => current?.id === indentPendingDelete.id ? null : current);
    toast.success(`${indentPendingDelete.prNo || 'Draft indent'} deleted`);
    setIndentPendingDelete(null);
  };

  return (
    <div className="min-h-screen space-y-6 bg-[#fbfcfd] p-4 text-slate-900 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
            <FileText className="h-4 w-4" />
            {isPurchasePage ? 'Purchase Operations' : 'Inventory Operations'}
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{isPurchasePage ? 'Purchase Requisition' : 'Inventory Indents'}</h1>
          <p className="mt-2 text-base font-medium text-slate-600">
            {isPurchasePage
              ? 'Create, review and track purchase requisitions using the approved indent workflow'
              : 'Raise, review and track purchase requisitions for inventory requirements'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setConfigOpen(true)}
            className="h-11 gap-2 rounded-xl border-[#0D3A35]/15 bg-white px-4 font-bold text-[#0D3A35] shadow-sm hover:bg-[#0D3A35]/5"
          >
            <Settings className="h-4 w-4" />
            Configure
          </Button>
          <Button
            onClick={() => setOpen(true)}
            className="h-11 gap-2 rounded-xl bg-[#0D3A35] px-5 font-bold text-white shadow-sm hover:bg-[#092e2a]"
          >
            <Plus className="h-4 w-4" />
            {isPurchasePage ? 'Create Requisition' : 'Create Indent'}
          </Button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: isPurchasePage ? 'Total Requisitions' : 'Total Indents', value: indentSummary.total.toLocaleString('en-IN'), note: 'All requisitions', icon: FileText, tone: 'text-[#0D3A35] bg-[#0D3A35]/10' },
          { label: isPurchasePage ? 'Open Requisitions' : 'Open Indents', value: indentSummary.open.toLocaleString('en-IN'), note: 'Awaiting action', icon: Clock3, tone: 'text-amber-700 bg-amber-50' },
          { label: 'Processed', value: indentSummary.processed.toLocaleString('en-IN'), note: 'Forwarded or approved', icon: CheckCircle2, tone: 'text-emerald-700 bg-emerald-50' },
          { label: isPurchasePage ? 'Requisition Value' : 'Indent Value', value: formatInr(indentSummary.value), note: 'Approximate requisition value', icon: IndianRupee, tone: 'text-blue-700 bg-blue-50' },
        ].map((metric) => {
          const MetricIcon = metric.icon;
          return (
            <div key={metric.label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-500">{metric.label}</p>
                  <p className="mt-3 truncate text-2xl font-bold text-slate-950">{metric.value}</p>
                  <p className="mt-1 text-xs font-medium text-slate-400">{metric.note}</p>
                </div>
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${metric.tone}`}>
                  <MetricIcon className="h-5 w-5" />
                </span>
              </div>
            </div>
          );
        })}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{isPurchasePage ? 'Purchase Requisition Register' : 'Indent Register'}</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {filtered.length} record{filtered.length === 1 ? '' : 's'} shown
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row lg:items-center">
            <div className="relative w-full lg:w-[360px]">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search PR no., project, item or requester"
                className="h-11 rounded-xl border-slate-200 bg-[#fbfaf7] pl-10 shadow-none focus-visible:ring-[#0D3A35]/20"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="flex min-w-max rounded-xl border border-slate-200 bg-slate-50 p-1">
              {([
                ['all', 'All'],
                ['open', 'Open'],
                ['forwarded', 'Forwarded'],
                ['approved', 'Approved'],
                ['rejected', 'Rejected'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                    statusFilter === value
                      ? 'bg-[#0D3A35] text-white shadow-sm'
                      : 'text-slate-500 hover:bg-white hover:text-slate-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <PackageSearch className="h-7 w-7" />
            </span>
            <h3 className="mt-4 text-base font-bold text-slate-900">No inventory indents found</h3>
            <p className="mt-1 max-w-md text-sm text-slate-500">Try another search or status filter, or create a new indent.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] table-auto border-collapse text-[13px] leading-5">
              <thead className="bg-[#0D3A35] text-white">
                <tr>
                  {[
                    ['PR Number', 'text-left'],
                    ['Indent Date', 'text-left'],
                    ['Project', 'text-left'],
                    ['Items', 'text-left'],
                    ['Total Value', 'text-right'],
                    ['Status', 'text-center'],
                    ['Monitor', 'text-center'],
                    ['Action Buttons', 'text-center'],
                  ].map(([label, align]) => (
                    <th key={label} className={`${align} whitespace-nowrap px-3 py-4 text-[12px] font-bold uppercase tracking-[0.07em] text-white/90`}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((indent) => {
                  const alreadySigned = Boolean(indent.indentedByDetails?.signature) || Boolean(indentApprovalsMap[indent.id]);
                  const isAttaching = Boolean(attachingApprovalMap[indent.id]);
                  const statusClass = indent.status === 'approved'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : indent.status === 'forwarded'
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : indent.status === 'rejected'
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700';
                  return (
                    <tr key={indent.id} className="transition-colors hover:bg-[#0D3A35]/[0.025]">
                      <td className="px-3 py-4 align-middle">
                        <button type="button" onClick={() => setPreviewIndent(indent)} className="text-[13px] font-bold leading-5 text-[#0D3A35] hover:underline">
                          {indent.prNo || 'PR (Draft)'}
                        </button>
                      </td>
                      <td className="px-3 py-4 text-[13px] font-semibold leading-5 text-slate-700">
                        {formatDateDDMMYYYY(indent.date)}
                      </td>
                      <td className="px-3 py-4 text-[13px] font-semibold leading-5 text-slate-800">
                        <span className="line-clamp-2">{indent.project || 'Not Recorded'}</span>
                      </td>
                      <td className="px-3 py-4 align-middle">
                        <button
                          type="button"
                          onClick={() => setItemsPreviewIndent(indent)}
                          onMouseEnter={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect();
                            setItemsHoverAnchor({ top: rect.bottom + 8, left: rect.left });
                            setHoveredItemsRowId(indent.id);
                          }}
                          onMouseLeave={() => setHoveredItemsRowId((current) => (current === indent.id ? null : current))}
                          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-[#0D3A35] transition-colors hover:border-[#0D3A35]/30 hover:bg-[#0D3A35]/5"
                        >
                          <Package className="h-3.5 w-3.5" />
                          {(indent.items ?? []).length} item{(indent.items ?? []).length === 1 ? '' : 's'}
                        </button>

                        {hoveredItemsRowId === indent.id && itemsHoverAnchor && (indent.items ?? []).length > 0 &&
                          createPortal(
                            <div
                              className="fixed z-[100] w-64 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl"
                              style={{ top: itemsHoverAnchor.top, left: itemsHoverAnchor.left }}
                            >
                              <div className="space-y-1.5">
                                {(indent.items ?? []).slice(0, 4).map((item) => (
                                  <p key={`hover-${item.id}`} className="line-clamp-1 text-[12px] font-semibold leading-4 text-slate-700">
                                    {item.partName || 'Not Recorded'}
                                  </p>
                                ))}
                              </div>
                              {(indent.items ?? []).length > 4 && (
                                <p className="mt-1.5 text-[11px] font-bold text-[#0D3A35]">+{(indent.items ?? []).length - 4} more — click to view all</p>
                              )}
                            </div>,
                            document.body
                          )}
                      </td>
                      <td className="px-3 py-4 text-right text-[13px] font-bold leading-5 text-slate-950">{formatInr(totalValue(indent.items ?? []))}</td>
                      <td className="px-3 py-4 text-center">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[12px] font-bold capitalize ${statusClass}`}>{indent.status}</span>
                      </td>
                      <td className="px-3 py-4 align-middle">
                        {(() => {
                          const steps = [
                            { label: 'Initiation', done: Boolean(indent.indentedByDetails?.signature) },
                            { label: 'Verification', done: Boolean(indent.directorsApprovalDetails?.signature) },
                            { label: 'Final Approval', done: Boolean(indent.forwardedByDetails?.signature) },
                          ];
                          return (
                            <div
                              className="flex items-start justify-center"
                              title={steps.map((s) => `${s.label}: ${s.done ? 'Signed' : 'Pending'}`).join(' · ')}
                            >
                              {steps.map((step, idx) => (
                                <Fragment key={step.label}>
                                  <div className="flex w-14 shrink-0 flex-col items-center gap-1">
                                    <span
                                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                                        step.done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                                      }`}
                                    >
                                      {step.done ? <Check className="h-3 w-3" /> : idx + 1}
                                    </span>
                                    <span className="text-center text-[8px] font-bold uppercase leading-tight tracking-wide text-slate-500">
                                      {step.label}
                                    </span>
                                  </div>
                                  {idx < steps.length - 1 && (
                                    <span className={`mt-2.5 h-0.5 w-3 shrink-0 ${step.done ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                                  )}
                                </Fragment>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setPreviewIndent(indent)}
                            className="h-9 w-9 rounded-xl border-slate-200 text-[#0D3A35] hover:bg-[#0D3A35]/5"
                            title="View indent details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => void attachIndentApproval({ id: indent.id, prNo: indent.prNo })}
                            disabled={alreadySigned || isAttaching}
                            className="h-9 w-9 rounded-xl border-slate-200 text-[#0D3A35] hover:bg-[#0D3A35]/5 disabled:opacity-45"
                            title={alreadySigned ? 'Signature attached' : 'Attach signature'}
                          >
                            {isAttaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setIndentPendingDelete(indent)}
                            className="h-9 w-9 rounded-xl border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                            title="Delete indent"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog
        open={Boolean(indentPendingDelete)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setIndentPendingDelete(null);
        }}
      >
        <DialogContent className="overflow-hidden rounded-2xl border-0 p-0 sm:max-w-md">
          <DialogHeader className="bg-[#0D3A35] px-6 py-5 text-left text-white">
            <DialogTitle className="text-xl font-bold text-white">{isPurchasePage ? 'Delete Purchase Requisition' : 'Delete Inventory Indent'}</DialogTitle>
            <p className="mt-1 text-sm font-medium text-white/70">Confirm removal from the indent register.</p>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <p className="text-sm leading-6 text-slate-600">
              Are you sure you want to delete{' '}
              <span className="font-bold text-slate-900">
                {indentPendingDelete?.prNo || 'this draft indent'}
              </span>
              ? This action cannot be undone.
            </p>
            {indentPendingDelete?.project && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Project</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{indentPendingDelete.project}</p>
              </div>
            )}
          </div>
          <DialogFooter className="border-t border-slate-100 bg-slate-50 px-6 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIndentPendingDelete(null)}
              className="rounded-xl border-slate-200 bg-white font-bold text-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={deleteIndentFromRegister}
              className="gap-2 rounded-xl bg-red-600 font-bold text-white hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4" />
              Delete Indent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddIndentModal
        open={open}
        onClose={() => {
          setOpen(false);
          setPrefillDraft(null);
        }}
        configVersion={configVersion}
        mode="create"
        pageVariant={pageVariant}
        initialData={prefillDraft}
        onSave={async (data) => {
          setPrefillDraft(null);
          setOpen(false);
          toast.success(data.prNo ? `Indent ${data.prNo} created` : 'Indent created');
          // Refetch from the backend rather than trusting the create response's
          // guessed field shape, so the auto-generated PR number is always correct.
          await loadIndents();
        }}
      />

      <IndentPreviewModal
        indent={previewIndent}
        approval={previewIndent ? indentApprovalsMap[previewIndent.id] : undefined}
        onClose={() => setPreviewIndent(null)}
        attaching={previewIndent ? Boolean(attachingApprovalMap[previewIndent.id]) : false}
        onAttachApproval={(indentRef: Pick<Indent, 'id' | 'prNo'>) => void attachIndentApproval(indentRef)}
      />

      <ConfigureIndentModal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        onSaved={() => setConfigVersion((v) => v + 1)}
      />

      <Dialog open={Boolean(itemsPreviewIndent)} onOpenChange={(nextOpen) => { if (!nextOpen) setItemsPreviewIndent(null); }}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden rounded-2xl border-0 p-0 shadow-2xl">
          <DialogHeader className="shrink-0 bg-[#0D3A35] px-6 py-5 text-left">
            <DialogTitle className="flex items-center gap-3 text-lg font-bold text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                <Package className="h-4 w-4" />
              </span>
              Line Items — {itemsPreviewIndent?.prNo || 'PR (Draft)'}
            </DialogTitle>
            <p className="mt-1 pl-[52px] text-sm text-white/70">{(itemsPreviewIndent?.items ?? []).length} item{(itemsPreviewIndent?.items ?? []).length === 1 ? '' : 's'} · {itemsPreviewIndent?.project || 'Not Recorded'}</p>
          </DialogHeader>
          <div className="max-h-[calc(85vh-96px)] overflow-y-auto p-6">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3 text-center">UoM</th>
                  <th className="py-2 pr-3 text-right">Qty.</th>
                  <th className="py-2 pr-3 text-right">Rate</th>
                  <th className="py-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(itemsPreviewIndent?.items ?? []).map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold leading-5 text-slate-800">{item.partName || 'Not Recorded'}</p>
                      <p className="mt-0.5 font-mono text-[11px] leading-4 text-slate-500">{item.itemCode || 'Code pending'}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-center font-semibold text-slate-700">{item.uom || '—'}</td>
                    <td className="py-2.5 pr-3 text-right font-bold text-slate-800">{netPrQty(item).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 pr-3 text-right font-semibold text-slate-800">{formatInr(item.ratePerItem || 0)}</td>
                    <td className="py-2.5 text-right font-bold text-slate-950">{formatInr(approxValue(item))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

type IndentDraft = Omit<Indent, 'id' | 'status'>;

const AddIndentModal = ({
  open,
  onClose,
  configVersion,
  mode,
  pageVariant,
  onSave,
  initialData,
}: {
  open: boolean;
  onClose: () => void;
  configVersion: number;
  mode: 'create' | 'edit';
  pageVariant: 'inventory' | 'purchase';
  onSave: (data: IndentDraft) => void;
  initialData?: IndentDraft | null;
}) => {
  const isPurchasePage = pageVariant === 'purchase';
  const defaultDepartment = isPurchasePage ? 'PURCHASE' : 'INVENTORY';
  const initialRow = useMemo(() => emptyLineItem(1), []);

  const [project, setProject] = useState('');
  const [prNo, setPrNo] = useState('');
  const [department, setDepartment] = useState(defaultDepartment);
  const [date, setDate] = useState(today());

  const [indentedBy, setIndentedBy] = useState('');
  const [forwardedBy, setForwardedBy] = useState('');
  const [directorsApproval, setDirectorsApproval] = useState('');
  const [remarksNotes, setRemarksNotes] = useState('');
  const [budgetHead, setBudgetHead] = useState('');

  const [items, setItems] = useState<PRLineItem[]>([initialRow]);
  const [openRowId, setOpenRowId] = useState(initialRow.id);
  const [configuredProjects, setConfiguredProjects] = useState<string[]>([]);
  const [availableItemCategories, setAvailableItemCategories] = useState<string[]>(INVENTORY_ITEM_CATEGORIES);
  const [itemCodeLoadingMap, setItemCodeLoadingMap] = useState<Record<string, boolean>>({});
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeesError, setEmployeesError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [budgetPickerOpen, setBudgetPickerOpen] = useState(false);
  const [budgetHeadSelection, setBudgetHeadSelection] = useState<BudgetHeadSelection | null>(null);
  const cachedStaffName = useMemo(() => {
    try {
      const raw = localStorage.getItem('fc_auth_v1');
      if (!raw) return '';
      const parsed = JSON.parse(raw);
      return String(parsed?.user?.name ?? '').trim();
    } catch {
      return '';
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    if (initialData) {
      setProject(initialData.project ?? '');
      setPrNo(initialData.prNo ?? '');
      setDepartment(isPurchasePage ? 'PURCHASE' : (initialData.department || 'INVENTORY'));
      setDate(initialData.date ?? today());

      setIndentedBy(cachedStaffName || initialData.indentedBy || '');
      setForwardedBy(initialData.forwardedBy ?? '');
      setDirectorsApproval(initialData.directorsApproval ?? '');
      setRemarksNotes(initialData.remarksNotes ?? '');
      setBudgetHead(initialData.budgetHead ?? '');

      const nextItems =
        Array.isArray(initialData.items) && initialData.items.length > 0
          ? initialData.items
          : [emptyLineItem(1)];
      setItems(nextItems.map((x, idx) => ({ ...x, srNo: idx + 1 })));
      setOpenRowId(nextItems[nextItems.length - 1].id);
      setConfiguredProjects(readInventoryIndentConfig().projects ?? []);

      // Prefilled rows (e.g. from "Request Stock") may carry a category that
      // isn't in the hardcoded list yet — make sure it still shows up as a
      // matching <option>, otherwise the select renders blank and forces a
      // manual re-pick that would otherwise wipe the item's real code.
      const itemCategories = nextItems.map((item) => item.category).filter(Boolean);
      try {
        const inventoryConfig = JSON.parse(localStorage.getItem('farm-connect.inventory-master-config.v1') || '{}');
        const configuredCategories = Array.isArray(inventoryConfig?.categories) ? inventoryConfig.categories : [];
        setAvailableItemCategories(Array.from(new Set([...INVENTORY_ITEM_CATEGORIES, ...configuredCategories.filter(Boolean), ...itemCategories])));
      } catch {
        setAvailableItemCategories(Array.from(new Set([...INVENTORY_ITEM_CATEGORIES, ...itemCategories])));
      }
      return;
    }

    const cfg = readInventoryIndentConfig();
    setConfiguredProjects(cfg.projects ?? []);
    try {
      const inventoryConfig = JSON.parse(localStorage.getItem('farm-connect.inventory-master-config.v1') || '{}');
      const configuredCategories = Array.isArray(inventoryConfig?.categories) ? inventoryConfig.categories : [];
      setAvailableItemCategories(Array.from(new Set([...INVENTORY_ITEM_CATEGORIES, ...configuredCategories.filter(Boolean)])));
    } catch {
      setAvailableItemCategories(INVENTORY_ITEM_CATEGORIES);
    }

    setIndentedBy((prev) => (prev.trim() ? prev : (cachedStaffName || cfg.indentedBy || '')));
    setForwardedBy((prev) => (prev.trim() ? prev : (cfg.forwardedBy ?? '')));
    setDirectorsApproval((prev) =>
      prev.trim() ? prev : (cfg.directorsApproval ?? ''),
    );

    setProject((prev) => {
      if (prev.trim()) return prev;
      const first = (cfg.projects ?? [])[0];
      return first ?? '';
    });
    if (isPurchasePage) setDepartment('PURCHASE');
    else setDepartment((previous) => previous.trim() || 'INVENTORY');

    setItems((prev) => {
      const next = prev.length > 0 ? prev : [emptyLineItem(1)];
      setOpenRowId(next[next.length - 1].id);
      return next;
    });
  }, [open, configVersion, initialData, cachedStaffName, isPurchasePage]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const loadEmployees = async () => {
      setEmployeesLoading(true);
      setEmployeesError('');
      try {
        const baseUrl = getBaseUrl().replace(/\/$/, '');
        const response = await fetch(`${baseUrl}/admin_staff/get_all_staff`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const data: any = await response.json().catch(() => null);
        const rows = Array.isArray(data) ? data : Array.isArray(data?.staff) ? data.staff : [];
        if (!response.ok) throw new Error(data?.message || data?.error || 'Failed to load employees');
        const employees = rows
          .map((staff: any): EmployeeOption => ({
            id: String(staff?.staff_id || staff?.employee_id || '').trim(),
            name: String(staff?.staff_information?.staff_name || staff?.name || '').trim(),
            designation: String(staff?.staff_information?.staff_designation || staff?.designation || '').trim(),
          }))
          .filter((employee: EmployeeOption) => employee.id && employee.name)
          .sort((first: EmployeeOption, second: EmployeeOption) => first.name.localeCompare(second.name));
        setEmployeeOptions(employees);
        const resolveSavedEmployee = (current: string) => {
          const normalized = current.trim().toLowerCase();
          if (!normalized) return '';
          const match = employees.find((employee) => (
            employeeOptionValue(employee).toLowerCase() === normalized
            || employee.name.toLowerCase() === normalized
          ));
          return match ? employeeOptionValue(match) : current;
        };
        setForwardedBy(resolveSavedEmployee);
        setDirectorsApproval(resolveSavedEmployee);
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          setEmployeeOptions([]);
          setEmployeesError(error?.message || 'Failed to load employees');
        }
      } finally {
        setEmployeesLoading(false);
      }
    };
    void loadEmployees();
    return () => controller.abort();
  }, [open]);

  const updateItem = <K extends keyof PRLineItem>(id: string, key: K, value: PRLineItem[K]) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [key]: value } : it)));
  };

  const selectItemCategory = async (id: string, category: string) => {
    const targetItem = items.find((item) => item.id === id);
    if (targetItem?.lockItemCode) {
      // This row's item code came from an existing inventory item (e.g. via
      // "Request Stock") — only correct the category label, never touch the
      // already-assigned code.
      updateItem(id, 'category', category);
      return;
    }

    setItems((current) => current.map((item) => (
      item.id === id ? { ...item, category, itemCode: '' } : item
    )));
    if (!category) return;

    const categoryCode = inventoryCategoryCode(category);
    const fallbackCode = `SBR/INV/${categoryCode}/001`;
    setItemCodeLoadingMap((current) => ({ ...current, [id]: true }));
    try {
      const baseUrl = getBaseUrl().replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/inventory/get_new_item_code/${encodeURIComponent(categoryCode)}`);
      const data: any = await response.json().catch(() => null);
      const nextCode = response.ok && data?.success && data?.new_item_code
        ? String(data.new_item_code)
        : fallbackCode;
      setItems((current) => {
        let categoryOffset = 0;
        return current.map((item) => {
          if (item.lockItemCode || item.category !== category) return item;
          const generatedCode = incrementInventoryItemCode(nextCode, categoryOffset);
          categoryOffset += 1;
          return { ...item, itemCode: generatedCode };
        });
      });
    } catch {
      setItems((current) => {
        let categoryOffset = 0;
        return current.map((item) => {
          if (item.lockItemCode || item.category !== category) return item;
          const generatedCode = incrementInventoryItemCode(fallbackCode, categoryOffset);
          categoryOffset += 1;
          return { ...item, itemCode: generatedCode };
        });
      });
    } finally {
      setItemCodeLoadingMap((current) => ({ ...current, [id]: false }));
    }
  };

  const addRow = () => {
    setItems((prev) => {
      const nextRow = emptyLineItem(prev.length + 1);
      setOpenRowId(nextRow.id);
      return [...prev, nextRow];
    });
  };

  const removeRow = (id: string) => {
    setItems((prev) => {
      const next = prev.filter((x) => x.id !== id);
      const renumbered = next.map((x, idx) => ({ ...x, srNo: idx + 1 }));
      if (openRowId === id) setOpenRowId(renumbered[renumbered.length - 1]?.id ?? '');
      return renumbered;
    });
  };

  const handleSave = async () => {
    if (!project.trim()) return toast.error('Project is required');
    if (!department.trim()) return toast.error('Department is required');
    if (!date) return toast.error('Indent date is required');
    if (items.length === 0) return toast.error('Add at least 1 item row');
    if (items.some((i) => !i.category.trim())) return toast.error('Select an item category for each row');
    if (items.some((i) => !i.itemCode.trim())) return toast.error('Please wait for every item code to be generated');
    if (items.some((i) => !i.partName.trim())) return toast.error('Each row must have an Item Name');
    if (items.some((i) => !i.uom.trim())) return toast.error('UoM is required for each item');
    if (items.some((i) => Number(i.totalQtyRequired) <= 0)) return toast.error('Required quantity must be greater than zero for each item');
    if (items.some((i) => !i.materialRequiredByDate)) return toast.error('Material Required By date is required for each item');
    if (items.some((i) => Number(i.ratePerItem) <= 0)) return toast.error('Rate per item must be greater than zero for each item');

    let savedPrNumber = prNo.trim();

    if (mode === 'create') {
      try {
        setSubmitting(true);
        const created = await createIndentApi({
          item_row: items.map(toPurchaseFlowRow),
          project: project.trim(),
          ...(prNo.trim() ? { pr_number: prNo.trim() } : {}),
          notes: remarksNotes,
          department: department.trim(),
          indent_type: 'PR',
          ...(budgetHeadSelection && {
            budget_head: {
              budget_id: budgetHeadSelection.budgetId,
              line_item: budgetHeadSelection.lineItems.map((li) => ({
                line_item_id: li.id,
                line_item: li.name,
                category: li.category,
                budget_type: li.budgetType,
                uom: li.uom,
                allocated_amount: li.amount,
              })),
            },
          }),
        });
        savedPrNumber = String(
          created?.pr_number
          || created?.data?.pr_number
          || created?.indent?.pr_number
          || created?.indent_data?.pr_number
          || prNo.trim(),
        ).trim();
      } catch (err: any) {
        toast.error(err?.message || 'Failed to create indent');
        setSubmitting(false);
        return;
      } finally {
        setSubmitting(false);
      }
    }

    onSave({
      project: project.trim(),
      prNo: savedPrNumber,
      department: department.trim(),
      date,
      indentedBy: indentedBy.trim(),
      forwardedBy: forwardedBy.trim(),
      directorsApproval: directorsApproval.trim(),
      remarksNotes,
      budgetHead,
      items,
    });

    setProject('');
    setPrNo('');
    setDepartment(defaultDepartment);
    setDate(today());
    setIndentedBy('');
    setForwardedBy('');
    setDirectorsApproval('');
    setRemarksNotes('');
    setBudgetHead('');
    const firstRow = emptyLineItem(1);
    setItems([firstRow]);
    setOpenRowId(firstRow.id);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="!flex h-[92vh] max-h-[92vh] max-w-[min(96vw,1280px)] flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-[#f6f8fa] p-0 shadow-2xl">
        <DialogHeader className="shrink-0 bg-[#0D3A35] px-6 py-5 text-left">
          <DialogTitle className="flex items-center gap-3 text-xl font-bold text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <FileText className="h-5 w-5" />
            </span>
            {mode === 'edit' ? 'Edit Indent (PR)' : 'Create New Indent (PR)'}
          </DialogTitle>
          <p className="mt-1 pl-[52px] text-sm text-white/70">Complete the requisition details and inventory line items.</p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-3 text-sm font-bold uppercase tracking-[0.08em] text-[#0D3A35]">Indent Details</p>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="flex items-center gap-1 text-xs font-bold uppercase tracking-[0.06em] text-slate-500">
                    <Lock className="h-3 w-3 text-slate-400" />
                    Indent Type *
                  </label>
                  <Input value="Purchase Requisition (PR)" readOnly className="mt-1.5 h-11 rounded-xl border-slate-200 bg-slate-50 font-semibold text-slate-600" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-[0.06em] text-slate-500">Department *</label>
                  <Input value={department} onChange={(event) => setDepartment(event.target.value)} readOnly={isPurchasePage} className={`mt-1.5 h-11 rounded-xl border-slate-200 ${isPurchasePage ? 'bg-slate-50 font-semibold text-slate-600' : 'bg-[#fbfaf7]'}`} placeholder="e.g. INVENTORY" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-[0.06em] text-slate-500">Project *</label>
                  {configuredProjects.length > 0 ? (
                    <select
                      className="mt-1.5 h-11 w-full appearance-none rounded-xl border border-slate-200 bg-[#fbfaf7] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D3A35]/20"
                      value={project}
                      onChange={(e) => setProject(e.target.value)}
                    >
                      <option value="">Select project</option>
                      {configuredProjects.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input value={project} onChange={(e) => setProject(e.target.value)} placeholder="e.g. Chhattisgarh 2250 Acres" className="mt-1.5 h-11 rounded-xl border-slate-200 bg-[#fbfaf7]" />
                  )}
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-[0.06em] text-slate-500">Indent Date *</label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1.5 h-11 rounded-xl border-slate-200 bg-[#fbfaf7]" />
                </div>
                <div className="md:col-span-2 xl:col-span-4">
                  <label className="text-xs font-bold uppercase tracking-[0.06em] text-slate-500">PR Number</label>
                  <Input
                    value={prNo}
                    onChange={(event) => setPrNo(event.target.value)}
                    placeholder="Leave blank for automatic PR number generation"
                    className="mt-1.5 h-11 rounded-xl border-slate-200 bg-[#fbfaf7]"
                  />
                  <p className="mt-1.5 text-xs text-slate-400">Optional. The system will generate the PR number when this field is blank.</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold uppercase tracking-[0.08em] text-[#0D3A35]">Line Items</p>
                <div className="flex items-center gap-3">
                  <div className="hidden rounded-xl bg-[#0D3A35]/5 px-3 py-2 text-right sm:block">
                    <p className="text-[9px] font-bold uppercase tracking-[0.06em] text-slate-500">Total Approx. Value</p>
                    <p className="text-sm font-black text-[#0D3A35]">{formatInr(totalValue(items))}</p>
                  </div>
                  <Button type="button" variant="outline" onClick={addRow} className="h-9 gap-2 rounded-xl border-[#0D3A35]/15 font-bold text-[#0D3A35] hover:bg-[#0D3A35]/5">
                    <Plus className="h-4 w-4" /> Add Row
                  </Button>
                </div>
              </div>

              <Accordion type="single" collapsible value={openRowId} onValueChange={(v) => setOpenRowId(v)} className="space-y-2">
                {items.map((it) => (
                  <AccordionItem
                    key={it.id}
                    value={it.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 px-3"
                  >
                    <AccordionTrigger className="py-3 hover:no-underline">
                      <div className="flex w-full items-center justify-between pr-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-700">Row {it.srNo}</span>
                          <span className="text-xs text-gray-400 truncate max-w-[260px]">{it.partName || '—'}</span>
                        </div>
                        {items.length > 1 && (
                          <button
                            type="button"
                            className="text-xs text-gray-400 hover:text-red-600"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              removeRow(it.id);
                            }}
                            title="Remove row"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </AccordionTrigger>

                    <AccordionContent className="pt-0 pb-3">
                      {isPurchasePage ? (
                        <div className="grid grid-cols-3 gap-3">
                          {/* Column 1 — Essentials (auto-fetched, list format) */}
                          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Essentials</p>
                            <div>
                              <label className="flex items-center gap-1 text-xs font-medium text-gray-500">
                                {it.lockItemCode && <Lock className="h-3 w-3 text-slate-400" />}
                                Item Category *
                              </label>
                              <select
                                value={it.category}
                                onChange={(event) => void selectItemCategory(it.id, event.target.value)}
                                disabled={it.lockItemCode}
                                className={cn(
                                  "mt-1 h-10 w-full appearance-none rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D3A35]/20",
                                  it.lockItemCode ? "cursor-not-allowed bg-slate-100 text-slate-600" : "bg-white"
                                )}
                              >
                                <option value="">Select category</option>
                                {availableItemCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="flex items-center gap-1 text-xs font-medium text-gray-500">
                                {it.lockItemCode && <Lock className="h-3 w-3 text-slate-400" />}
                                Item Name *
                              </label>
                              <Input
                                value={it.partName}
                                onChange={(e) => updateItem(it.id, 'partName', e.target.value)}
                                readOnly={it.lockItemCode}
                                className={cn("mt-1", it.lockItemCode && "bg-slate-100 text-slate-600")}
                              />
                            </div>
                            <div>
                              <label className="flex items-center gap-1 text-xs font-medium text-gray-500">
                                {it.lockItemCode && <Lock className="h-3 w-3 text-slate-400" />}
                                Item Code
                              </label>
                              <div className="relative mt-1">
                                <Input value={it.itemCode} readOnly placeholder={it.category ? 'Generating item code…' : 'Select category first'} className="bg-slate-100 pr-9 font-mono font-semibold text-[#0D3A35]" />
                                {itemCodeLoadingMap[it.id] && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#0D3A35]" />}
                              </div>
                            </div>
                            <div>
                              <label className="flex items-center gap-1 text-xs font-medium text-gray-500">
                                {it.lockItemCode && <Lock className="h-3 w-3 text-slate-400" />}
                                Specification
                              </label>
                              <Input
                                value={it.specification}
                                onChange={(e) => updateItem(it.id, 'specification', e.target.value)}
                                readOnly={it.lockItemCode}
                                className={cn("mt-1", it.lockItemCode && "bg-slate-100 text-slate-600")}
                              />
                            </div>
                            <div>
                              <label className="flex items-center gap-1 text-xs font-medium text-gray-500">
                                {it.lockItemCode && <Lock className="h-3 w-3 text-slate-400" />}
                                UoM *
                              </label>
                              <Input
                                value={it.uom}
                                onChange={(e) => updateItem(it.id, 'uom', e.target.value)}
                                placeholder="No / kg / litre"
                                readOnly={it.lockItemCode}
                                className={cn("mt-1", it.lockItemCode && "bg-slate-100 text-slate-600")}
                              />
                            </div>
                          </div>

                          {/* Column 2 — Specifications */}
                          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Specifications</p>
                            <div>
                              <label className="text-xs font-medium text-gray-500">Total Qty Required *</label>
                              <Input
                                type="number"
                                min={0}
                                value={it.totalQtyRequired}
                                onChange={(e) => updateItem(it.id, 'totalQtyRequired', Number(e.target.value))}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500">Net PR Qty</label>
                              <Input value={netPrQty(it)} readOnly className="mt-1" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500">Lead Time (weeks)</label>
                              <Input
                                type="number"
                                min={0}
                                value={it.procurementLeadTimeWeeks}
                                onChange={(e) => updateItem(it.id, 'procurementLeadTimeWeeks', Number(e.target.value))}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500">Material Required By *</label>
                              <Input
                                type="date"
                                value={it.materialRequiredByDate}
                                onChange={(e) => updateItem(it.id, 'materialRequiredByDate', e.target.value)}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500">Rate / Item *</label>
                              <Input
                                type="number"
                                min={0}
                                value={it.ratePerItem}
                                onChange={(e) => updateItem(it.id, 'ratePerItem', Number(e.target.value))}
                                className="mt-1"
                              />
                            </div>
                          </div>

                          {/* Column 3 — Other Specifications */}
                          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Other Specifications</p>
                            <div>
                              <label className="flex items-center gap-1 text-xs font-medium text-gray-500">
                                {it.lockItemCode && <Lock className="h-3 w-3 text-slate-400" />}
                                Less Qty (Stock)
                              </label>
                              <Input
                                type="number"
                                min={0}
                                value={it.lessQtyAvailableInStock}
                                onChange={(e) => updateItem(it.id, 'lessQtyAvailableInStock', Number(e.target.value))}
                                readOnly={it.lockItemCode}
                                className={cn("mt-1", it.lockItemCode && "bg-slate-100 text-slate-600")}
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500">Indigenous / Imported</label>
                              <select
                                className="mt-1 w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                                value={it.indigenousOrImported}
                                onChange={(e) => updateItem(it.id, 'indigenousOrImported', e.target.value as any)}
                              >
                                <option value="Indigenous">Indigenous</option>
                                <option value="Imported">Imported</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500">Preferred Vendor Name</label>
                              <Input value={it.preferredVendorName} onChange={(e) => updateItem(it.id, 'preferredVendorName', e.target.value)} className="mt-1" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500">Approx. Value (Auto-calculated)</label>
                              <div className="mt-1 flex h-10 items-center justify-end rounded-md border border-[#0D3A35]/15 bg-[#0D3A35]/5 px-3 text-sm font-black text-[#0D3A35]">
                                {formatInr(approxValue(it))}
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500">Warranty / Guarantee Validity</label>
                              <Input value={it.validityOfWarrantyAndGuarantee} onChange={(e) => updateItem(it.id, 'validityOfWarrantyAndGuarantee', e.target.value)} className="mt-1" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500">Reason for replacement</label>
                              <Input value={it.reasonForReplacement} onChange={(e) => updateItem(it.id, 'reasonForReplacement', e.target.value)} className="mt-1" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500">Full life (Hr)</label>
                              <Input value={it.fullLifeHr} onChange={(e) => updateItem(it.id, 'fullLifeHr', e.target.value)} className="mt-1" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500">Actual life (Hr)</label>
                              <Input value={it.actualLifeHr} onChange={(e) => updateItem(it.id, 'actualLifeHr', e.target.value)} className="mt-1" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500">Repairing possibility</label>
                              <select
                                className="mt-1 w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                                value={it.repairingPossibility}
                                onChange={(e) => updateItem(it.id, 'repairingPossibility', e.target.value as any)}
                              >
                                <option value="NA">NA</option>
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      ) : (
                      <>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div>
                          <label className="flex items-center gap-1 text-xs font-medium text-gray-500">
                            {it.lockItemCode && <Lock className="h-3 w-3 text-slate-400" />}
                            Item Category *
                          </label>
                          <select
                            value={it.category}
                            onChange={(event) => void selectItemCategory(it.id, event.target.value)}
                            disabled={it.lockItemCode}
                            className={cn(
                              "mt-1 h-10 w-full appearance-none rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D3A35]/20",
                              it.lockItemCode ? "cursor-not-allowed bg-slate-100 text-slate-600" : "bg-white"
                            )}
                          >
                            <option value="">Select category</option>
                            {availableItemCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="flex items-center gap-1 text-xs font-medium text-gray-500">
                            {it.lockItemCode && <Lock className="h-3 w-3 text-slate-400" />}
                            Item Name *
                          </label>
                          <Input
                            value={it.partName}
                            onChange={(e) => updateItem(it.id, 'partName', e.target.value)}
                            readOnly={it.lockItemCode}
                            className={cn("mt-1", it.lockItemCode && "bg-slate-100 text-slate-600")}
                          />
                        </div>
                        <div>
                          <label className="flex items-center gap-1 text-xs font-medium text-gray-500">
                            {it.lockItemCode && <Lock className="h-3 w-3 text-slate-400" />}
                            Item Code
                          </label>
                          <div className="relative mt-1">
                            <Input value={it.itemCode} readOnly placeholder={it.category ? 'Generating item code…' : 'Select category first'} className="bg-slate-100 pr-9 font-mono font-semibold text-[#0D3A35]" />
                            {itemCodeLoadingMap[it.id] && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#0D3A35]" />}
                          </div>
                          <p className="mt-1 text-[10px] text-slate-400">Generated after checking the latest saved item in this category.</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className="flex items-center gap-1 text-xs font-medium text-gray-500">
                            {it.lockItemCode && <Lock className="h-3 w-3 text-slate-400" />}
                            Specification
                          </label>
                          <Input
                            value={it.specification}
                            onChange={(e) => updateItem(it.id, 'specification', e.target.value)}
                            readOnly={it.lockItemCode}
                            className={cn(it.lockItemCode && "bg-slate-100 text-slate-600")}
                          />
                        </div>
                        <div>
                          <label className="flex items-center gap-1 text-xs font-medium text-gray-500">
                            {it.lockItemCode && <Lock className="h-3 w-3 text-slate-400" />}
                            UoM *
                          </label>
                          <Input
                            value={it.uom}
                            onChange={(e) => updateItem(it.id, 'uom', e.target.value)}
                            placeholder="No / kg / litre"
                            readOnly={it.lockItemCode}
                            className={cn(it.lockItemCode && "bg-slate-100 text-slate-600")}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mt-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500">Total Qty Required *</label>
                          <Input
                            type="number"
                            min={0}
                            value={it.totalQtyRequired}
                            onChange={(e) => updateItem(it.id, 'totalQtyRequired', Number(e.target.value))}
                          />
                        </div>
                        <div>
                          <label className="flex items-center gap-1 text-xs font-medium text-gray-500">
                            {it.lockItemCode && <Lock className="h-3 w-3 text-slate-400" />}
                            Less Qty (Stock)
                          </label>
                          <Input
                            type="number"
                            min={0}
                            value={it.lessQtyAvailableInStock}
                            onChange={(e) => updateItem(it.id, 'lessQtyAvailableInStock', Number(e.target.value))}
                            readOnly={it.lockItemCode}
                            className={cn(it.lockItemCode && "bg-slate-100 text-slate-600")}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Net PR Qty</label>
                          <Input value={netPrQty(it)} readOnly />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500">Lead Time (weeks)</label>
                          <Input
                            type="number"
                            min={0}
                            value={it.procurementLeadTimeWeeks}
                            onChange={(e) => updateItem(it.id, 'procurementLeadTimeWeeks', Number(e.target.value))}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Material Required By *</label>
                          <Input
                            type="date"
                            value={it.materialRequiredByDate}
                            onChange={(e) => updateItem(it.id, 'materialRequiredByDate', e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500">Indigenous / Imported</label>
                          <select
                            className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                            value={it.indigenousOrImported}
                            onChange={(e) => updateItem(it.id, 'indigenousOrImported', e.target.value as any)}
                          >
                            <option value="Indigenous">Indigenous</option>
                            <option value="Imported">Imported</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Preferred Vendor Name</label>
                          <Input value={it.preferredVendorName} onChange={(e) => updateItem(it.id, 'preferredVendorName', e.target.value)} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500">Rate / Item *</label>
                          <Input
                            type="number"
                            min={0}
                            value={it.ratePerItem}
                            onChange={(e) => updateItem(it.id, 'ratePerItem', Number(e.target.value))}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Approx. Value (Auto-calculated)</label>
                          <div className="flex h-10 items-center justify-end rounded-md border border-[#0D3A35]/15 bg-[#0D3A35]/5 px-3 text-sm font-black text-[#0D3A35]">
                            {formatInr(approxValue(it))}
                          </div>
                          <p className="mt-1 text-[10px] text-slate-400">
                            Net PR Qty. {netPrQty(it).toLocaleString('en-IN')} × Rate {formatInr(it.ratePerItem || 0)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500">Warranty / Guarantee Validity</label>
                          <Input value={it.validityOfWarrantyAndGuarantee} onChange={(e) => updateItem(it.id, 'validityOfWarrantyAndGuarantee', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Reason for replacement</label>
                          <Input value={it.reasonForReplacement} onChange={(e) => updateItem(it.id, 'reasonForReplacement', e.target.value)} />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mt-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500">Full life (Hr)</label>
                          <Input value={it.fullLifeHr} onChange={(e) => updateItem(it.id, 'fullLifeHr', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Actual life (Hr)</label>
                          <Input value={it.actualLifeHr} onChange={(e) => updateItem(it.id, 'actualLifeHr', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Repairing possibility</label>
                          <select
                            className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                            value={it.repairingPossibility}
                            onChange={(e) => updateItem(it.id, 'repairingPossibility', e.target.value as any)}
                          >
                            <option value="NA">NA</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </div>
                      </div>
                      </>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-3 text-sm font-bold uppercase tracking-[0.08em] text-[#0D3A35]">Approval &amp; Budget Details</p>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">Indented By</label>
                  <Input value={indentedBy} readOnly disabled className="mt-1 h-11 cursor-not-allowed rounded-xl bg-gray-50 text-gray-600" />
                </div>
                <div>
                  <label className="flex items-center gap-1 text-xs font-medium text-gray-500">
                    <Lock className="h-3 w-3 text-slate-400" />
                    Forwarded By
                  </label>
                  <div className="mt-1 flex h-11 items-center rounded-xl border border-slate-200 bg-gray-50 px-3 text-xs font-medium italic text-slate-500">
                    Authorized approvers will add their signatures respectively
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-1 text-xs font-medium text-gray-500">
                    <Lock className="h-3 w-3 text-slate-400" />
                    Director's Approval
                  </label>
                  <div className="mt-1 flex h-11 items-center rounded-xl border border-slate-200 bg-gray-50 px-3 text-xs font-medium italic text-slate-500">
                    Authorized approvers will add their signatures respectively
                  </div>
                </div>
              </div>

              {/* Budget Head — 3-field display */}
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-500">Budget Head</label>
                  <button
                    type="button"
                    onClick={() => setBudgetPickerOpen(true)}
                    className="text-xs text-green-600 hover:text-green-700 font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    {budgetHeadSelection ? 'Change' : 'Select Budget'}
                  </button>
                </div>

                {budgetHeadSelection ? (
                  <div className="rounded-lg border border-green-200 bg-green-50 overflow-hidden">
                    {/* Budget header */}
                    <div className="flex items-center justify-between px-3 py-2 bg-green-100 border-b border-green-200">
                      <span className="text-xs font-bold text-gray-800">{budgetHeadSelection.budgetName}</span>
                      <span className="text-xs text-gray-500">{budgetHeadSelection.lineItems.length} line item{budgetHeadSelection.lineItems.length !== 1 ? 's' : ''}</span>
                    </div>
                    {/* Compact data table */}
                    <div className="overflow-auto max-h-52">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-green-50 border-b border-green-200">
                            <th className="px-2 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">#</th>
                            <th className="px-2 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">Category</th>
                            <th className="px-2 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">Line Item</th>
                            <th className="px-2 py-1.5 text-center font-semibold text-gray-500 whitespace-nowrap">UoM</th>
                            <th className="px-2 py-1.5 text-right font-semibold text-gray-500 whitespace-nowrap">Total Qty</th>
                            <th className="px-2 py-1.5 text-right font-semibold text-gray-500 whitespace-nowrap">Rate / Unit</th>
                            <th className="px-2 py-1.5 text-right font-semibold text-gray-500 whitespace-nowrap">Allocation</th>
                          </tr>
                        </thead>
                        <tbody>
                          {budgetHeadSelection.lineItems.map((li, idx) => (
                            <tr key={li.id} className={`border-b border-green-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-green-50/40'}`}>
                              <td className="px-2 py-1.5 font-mono text-gray-500 font-semibold">{li.lineNo}</td>
                              <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{li.category}</td>
                              <td className="px-2 py-1.5 font-medium text-gray-800">{li.name}</td>
                              <td className="px-2 py-1.5 text-center text-gray-600">{li.uom}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-gray-700">{li.totalQty?.toLocaleString() ?? '—'}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-gray-700">{formatInr(li.ratePerUnit)}</td>
                              <td className="px-2 py-1.5 text-right font-mono font-semibold text-green-700">{formatInr(li.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-green-300 bg-green-100">
                            <td colSpan={6} className="px-2 py-1.5 text-right text-xs font-bold text-gray-700">Total Allocation</td>
                            <td className="px-2 py-1.5 text-right text-xs font-bold text-green-700 font-mono">
                              {formatInr(budgetHeadSelection.lineItems.reduce((s, l) => s + l.amount, 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setBudgetPickerOpen(true)}
                    className="w-full rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-xs text-gray-400 hover:border-green-300 hover:bg-green-50 hover:text-green-600 transition-colors"
                  >
                    Click to select budget, line items &amp; amount allocation
                  </button>
                )}
              </div>
              <div className="mt-3">
                <label className="text-xs font-medium text-gray-500">Remarks / Notes</label>
                <Input value={remarksNotes} onChange={(e) => setRemarksNotes(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-slate-200 bg-white px-6 py-4 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
          <Button variant="outline" onClick={onClose} className="h-10 rounded-xl border-slate-200 px-5 font-bold">Cancel</Button>
          <Button
            className="h-10 rounded-xl bg-[#0D3A35] px-5 font-bold text-white hover:bg-[#092e2a]"
            onClick={handleSave}
            disabled={submitting}
          >
            {submitting ? 'Creating…' : mode === 'edit' ? 'Save Changes' : 'Create Indent'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <BudgetHeadPickerModal
        open={budgetPickerOpen}
        onClose={() => setBudgetPickerOpen(false)}
        initial={budgetHeadSelection}
        onSave={(sel: BudgetHeadSelection) => {
          setBudgetHeadSelection(sel);
          setBudgetHead(
            sel.lineItems.map((l: BudgetLineItemSelection) =>
              `${sel.budgetName} | ${l.category} | ${l.name} | ${formatInr(l.amount)}`
            ).join('\n')
          );
        }}
      />
    </Dialog>
  );
};

// ── Budget Head Picker Modal ──────────────────────────────────────────────────

const BudgetHeadPickerModal = ({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (selection: BudgetHeadSelection) => void;
  initial?: BudgetHeadSelection | null;
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [budgets, setBudgets] = useState<ApiBudget[]>([]);
  const [budgetsLoading, setBudgetsLoading] = useState(false);
  const [budgetsError, setBudgetsError] = useState<string | null>(null);
  const [selectedBudget, setSelectedBudget] = useState<ApiBudget | null>(null);
  const [lineItems, setLineItems] = useState<ApiBudgetLineItem[]>([]);
  const [lineItemsLoading, setLineItemsLoading] = useState(false);
  const [lineItemsError, setLineItemsError] = useState<string | null>(null);
  // keyed by line_item_id → { checked, amount }
  const [lineItemSelections, setLineItemSelections] = useState<Record<string, { checked: boolean; amount: number }>>({});

  // Fetch budgets whenever modal opens
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSelectedBudget(null);
    setLineItems([]);
    setLineItemSelections({});
    setBudgetsError(null);

    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    if (!baseUrl) { setBudgetsError('Missing API base URL'); return; }

    setBudgetsLoading(true);
    const ac = new AbortController();
    fetch(`${baseUrl}/admin_accounts/get_budgets`, { headers: { Accept: 'application/json' }, signal: ac.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success) setBudgets(d.data ?? []);
        else setBudgetsError(d?.message || 'Failed to load budgets');
      })
      .catch((e) => { if (e?.name !== 'AbortError') setBudgetsError('Failed to load budgets'); })
      .finally(() => setBudgetsLoading(false));

    return () => ac.abort();
  }, [open]);

  // Fetch line items when a budget is selected
  useEffect(() => {
    if (!selectedBudget) return;

    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    if (!baseUrl) return;

    setLineItemsLoading(true);
    setLineItemsError(null);
    setLineItems([]);
    setLineItemSelections({});

    const ac = new AbortController();
    fetch(`${baseUrl}/purchase_flow/get_budget_all_line_items/${selectedBudget.budget_id}`, {
      headers: { Accept: 'application/json' },
      signal: ac.signal,
    })
      .then((r) => r.json())
      .then((d) => {
        const items: ApiBudgetLineItem[] = d?.line_items ?? [];
        setLineItems(items);
        const init: Record<string, { checked: boolean; amount: number }> = {};
        items.forEach((li) => { init[li.line_item_id] = { checked: false, amount: 0 }; });
        setLineItemSelections(init);
      })
      .catch((e) => { if (e?.name !== 'AbortError') setLineItemsError('Failed to load line items'); })
      .finally(() => setLineItemsLoading(false));

    return () => ac.abort();
  }, [selectedBudget]);

  const handleBudgetSelect = (budget: ApiBudget) => {
    setSelectedBudget(budget);
    setStep(2);
  };

  const toggleLineItem = (id: string) => {
    setLineItemSelections((prev) => ({
      ...prev,
      [id]: { ...prev[id], checked: !prev[id].checked },
    }));
  };

  const updateAmount = (id: string, amount: number) => {
    setLineItemSelections((prev) => ({
      ...prev,
      [id]: { ...prev[id], amount },
    }));
  };

  const handleSave = () => {
    const selected = lineItems
      .map((li, idx) => ({ li, idx }))
      .filter(({ li }) => lineItemSelections[li.line_item_id]?.checked)
      .map(({ li, idx }) => ({
        id: li.line_item_id,
        lineNo: idx + 1,
        name: li.line_item,
        category: li.category,
        budgetType: li.budget_type,
        uom: li.UoM,
        qtyPerAcre: li.quantity_per_acre,
        totalAcres: li.total_acres,
        totalQty: li.total_quantity,
        ratePerUnit: li.rate_per_unit,
        totalValue: li.total_value,
        amount: lineItemSelections[li.line_item_id]?.amount ?? li.total_value,
      }));

    if (selected.length === 0) {
      toast.error('Select at least one line item');
      return;
    }

    const unfilled = selected.filter((s) => !s.amount);
    if (unfilled.length > 0) {
      toast.error(`Enter indent amount for: ${unfilled.map((s) => s.name).join(', ')}`);
      return;
    }

    onSave({ budgetId: selectedBudget!.budget_id, budgetName: selectedBudget!.budget_name, lineItems: selected });
    onClose();
  };

  const checkedCount = Object.values(lineItemSelections).filter((v) => v.checked).length;
  const totalAllocated = lineItems
    .filter((li) => lineItemSelections[li.line_item_id]?.checked)
    .reduce((s, li) => s + (lineItemSelections[li.line_item_id]?.amount ?? 0), 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl w-full">
        <DialogHeader>
          <DialogTitle>{step === 1 ? 'Select Budget' : 'Select Line Items'}</DialogTitle>
        </DialogHeader>

        {/* Step 1 — pick a budget */}
        {step === 1 && (
          <div className="space-y-2 py-2">
            <p className="text-xs text-gray-500 mb-3">Choose the budget to link to this indent</p>
            {budgetsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-green-600" />
                <span className="text-xs text-gray-500 ml-2">Loading budgets…</span>
              </div>
            ) : budgetsError ? (
              <div className="text-xs text-red-500 text-center py-8">{budgetsError}</div>
            ) : budgets.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-8">No budgets found</div>
            ) : (
              budgets.map((b) => (
                <button
                  key={b.budget_id}
                  type="button"
                  onClick={() => handleBudgetSelect(b)}
                  className="w-full text-left rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-green-400 hover:bg-green-50 transition-colors group"
                >
                  <p className="text-sm font-semibold text-gray-800 group-hover:text-green-700">{b.budget_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {b.crop_season} · FY {b.financial_year_start}–{b.financial_year_end} · {b.status}
                  </p>
                </button>
              ))
            )}
          </div>
        )}

        {/* Step 2 — full data-grid table */}
        {step === 2 && selectedBudget && (
          <div className="min-w-0 space-y-3 py-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs text-gray-400 hover:text-gray-700 underline"
              >
                ← Back
              </button>
              <span className="text-sm font-bold text-gray-800">{selectedBudget.budget_name}</span>
              <span className="text-xs text-gray-400">
                {selectedBudget.crop_season} · FY {selectedBudget.financial_year_start}–{selectedBudget.financial_year_end}
              </span>
            </div>

            {lineItemsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-green-600" />
                <span className="text-xs text-gray-500 ml-2">Loading line items…</span>
              </div>
            ) : lineItemsError ? (
              <div className="text-xs text-red-500 text-center py-10">{lineItemsError}</div>
            ) : lineItems.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-10">No line items found for this budget</div>
            ) : (
              <div className="w-full min-w-0 overflow-auto rounded-lg border border-gray-200 max-h-[420px]">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100 sticky top-0 z-10">
                      <th className="w-9 px-2 py-2.5 border-b border-gray-200" />
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">Line #</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">Category</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">Line Item</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">UoM</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">Qty / Acre</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">Acres</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">Total Qty</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">Rate / Unit</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">Total Value</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">Indent Amount (₹) *</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((li, idx) => {
                      const sel = lineItemSelections[li.line_item_id];
                      const isChecked = sel?.checked ?? false;
                      return (
                        <tr
                          key={li.line_item_id}
                          onClick={() => toggleLineItem(li.line_item_id)}
                          className={`cursor-pointer border-b border-gray-100 transition-colors ${
                            isChecked
                              ? 'bg-green-50 hover:bg-green-100'
                              : idx % 2 === 0
                                ? 'bg-white hover:bg-gray-50'
                                : 'bg-gray-50/60 hover:bg-gray-100'
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleLineItem(li.line_item_id)}
                              className="w-3.5 h-3.5 accent-green-600"
                            />
                          </td>
                          {/* Line # */}
                          <td className="px-3 py-2.5 font-mono text-gray-500 font-semibold">{idx + 1}</td>
                          {/* Category */}
                          <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{li.category}</td>
                          {/* Line Item */}
                          <td className="px-3 py-2.5 font-medium text-gray-900 min-w-[160px]">{li.line_item}</td>
                          {/* UoM */}
                          <td className="px-3 py-2.5 text-center text-gray-600 whitespace-nowrap">{li.UoM}</td>
                          {/* Qty / Acre */}
                          <td className="px-3 py-2.5 text-right font-mono text-gray-700">
                            {li.quantity_per_acre != null ? li.quantity_per_acre.toLocaleString() : '—'}
                          </td>
                          {/* Acres */}
                          <td className="px-3 py-2.5 text-right font-mono text-gray-700">
                            {li.total_acres != null ? li.total_acres.toLocaleString() : '—'}
                          </td>
                          {/* Total Qty */}
                          <td className="px-3 py-2.5 text-right font-mono text-gray-700">
                            {li.total_quantity != null ? li.total_quantity.toLocaleString() : '—'}
                          </td>
                          {/* Rate / Unit */}
                          <td className="px-3 py-2.5 text-right font-mono text-gray-700">
                            {li.rate_per_unit != null ? formatInr(li.rate_per_unit) : '—'}
                          </td>
                          {/* Total Value */}
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-800">
                            {formatInr(li.total_value)}
                          </td>
                          {/* Indent Amount — editable when checked, required */}
                          <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                            {isChecked ? (
                              <input
                                type="number"
                                min={1}
                                value={sel!.amount === 0 ? '' : sel!.amount}
                                placeholder="Enter amount"
                                onChange={(e) => updateAmount(li.line_item_id, Number(e.target.value))}
                                className={`w-36 border rounded px-2 py-1 text-xs text-right bg-white focus:outline-none focus:ring-2 font-mono ${
                                  !sel!.amount
                                    ? 'border-red-300 focus:ring-red-400 placeholder-red-300'
                                    : 'border-green-300 focus:ring-green-500'
                                }`}
                              />
                            ) : (
                              <span className="text-gray-300 font-mono text-[10px]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Totals footer */}
                  {checkedCount > 0 && (
                    <tfoot>
                      <tr className="bg-green-50 border-t-2 border-green-300">
                        <td colSpan={10} className="px-3 py-2.5 text-right text-xs font-bold text-gray-700">
                          {checkedCount} item{checkedCount !== 1 ? 's' : ''} selected — Total Indent Amount
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs font-bold text-green-700 font-mono">
                          {totalAllocated > 0 ? formatInr(totalAllocated) : <span className="text-red-400">Enter amounts ↑</span>}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {step === 2 && (
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleSave}
              disabled={checkedCount === 0 || lineItemsLoading}
            >
              Save Selection{checkedCount > 0 ? ` (${checkedCount})` : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const IndentPreviewModal = ({
   indent,
   approval,
   attaching,
   onClose,
   onAttachApproval,
 }: {
   indent: Indent | null;
   approval?: IndentApproval;
   attaching?: boolean;
   onClose: () => void;
   onAttachApproval?: (indentRef: Pick<Indent, 'id' | 'prNo'>) => void;
 }) => {
   const alreadySigned = Boolean(indent?.indentedByDetails?.signature) || Boolean(approval);
   const [printing, setPrinting] = useState(false);

   const printIndent = async () => {
     if (!indent) return;
     setPrinting(true);
     try {
       await printInventoryIndentPdf(indent, approval);
     } catch (error) {
       toast.error(error instanceof Error ? error.message : 'Failed to generate indent PDF');
     } finally {
       setPrinting(false);
     }
   };

   return (
     <Dialog
       open={Boolean(indent)}
       onOpenChange={(v) => {
         if (!v) onClose();
       }}
     >
       <DialogContent className="max-h-[92vh] max-w-[min(96vw,1280px)] overflow-hidden rounded-2xl border-0 bg-[#f6f8fa] p-0 shadow-2xl">
         <DialogHeader className="bg-[#0D3A35] px-6 py-5 pr-14 text-left">
           <div className="flex items-center justify-between gap-4">
             <div>
               <DialogTitle className="flex items-center gap-3 text-xl font-bold text-white">
                 <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"><Eye className="h-5 w-5" /></span>
                 Indent Preview
               </DialogTitle>
               <p className="mt-1 pl-[52px] text-sm text-white/70">Review the complete purchase requisition and approval details.</p>
             </div>
             {indent ? (
               <Button
                 type="button"
                 onClick={() => void printIndent()}
                 disabled={printing}
                 className="h-10 shrink-0 rounded-xl bg-white px-5 font-bold text-[#0D3A35] hover:bg-emerald-50"
               >
                 {printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                 Print Indent
               </Button>
             ) : null}
           </div>
         </DialogHeader>
         {indent && (
           <div className="max-h-[calc(92vh-154px)] overflow-auto px-5 py-5 sm:px-6">
             <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
             <PRPreview
               indent={{
                 project: indent.project,
                 prNo: indent.prNo,
                   department: indent.department,
                 date: indent.date,
                 indentedBy: indent.indentedBy,
                 indentedByDetails: indent.indentedByDetails,
                 forwardedBy: indent.forwardedBy,
                 forwardedByDetails: indent.forwardedByDetails,
                 directorsApproval: indent.directorsApproval,
                 directorsApprovalDetails: indent.directorsApprovalDetails,
                 remarksNotes: indent.remarksNotes,
                 budgetHead: indent.budgetHead,
                 items: indent.items,
               }}
               approval={approval}
             />
             </div>
           </div>
         )}

         <DialogFooter className="flex items-center gap-2 border-t border-slate-200 bg-white px-6 py-4">
           {indent && onAttachApproval ? (
             <Button
               variant="outline"
               onClick={() => onAttachApproval({ id: indent.id, prNo: indent.prNo })}
               disabled={alreadySigned || Boolean(attaching)}
               className="h-10 rounded-xl border-slate-200 px-5 font-bold text-[#0D3A35]"
             >
               {alreadySigned ? 'Approved' : attaching ? 'Attaching…' : 'Attach Sign'}
             </Button>
           ) : null}
           <Button onClick={onClose} className="h-10 rounded-xl bg-[#0D3A35] px-5 font-bold text-white hover:bg-[#092e2a]">Close</Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>
   );
};

const PRPreview = ({
  indent,
  approval,
}: {
  indent: Omit<Indent, 'id' | 'status'>;
  approval?: IndentApproval;
}) => {
  const backendNameId = indent.indentedByDetails?.nameId;
  const backendSignature = indent.indentedByDetails?.signature;
  const backendDate = ymdFromIsoTimestamp(indent.indentedByDetails?.timestamp);
  const forwardedNameId = indent.forwardedByDetails?.nameId || indent.forwardedBy;
  const forwardedSignature = indent.forwardedByDetails?.signature;
  const forwardedDate = ymdFromIsoTimestamp(indent.forwardedByDetails?.timestamp);
  const directorNameId = indent.directorsApprovalDetails?.nameId || indent.directorsApproval;
  const directorSignature = indent.directorsApprovalDetails?.signature;
  const directorDate = ymdFromIsoTimestamp(indent.directorsApprovalDetails?.timestamp);

  const localNameId = approval
    ? `${approval.staffName} / ${approval.staffDesignation}`
    : '';
  const localSignature = approval
    ? `Approver | ${approval.staffName} | ${approval.approvedTime} | ${approval.approvedAt}`
    : '';
  const itemCount = indent.items.length;
  const totalRequired = indent.items.reduce((sum, item) => sum + (Number(item.totalQtyRequired) || 0), 0);
  const totalNetQuantity = indent.items.reduce((sum, item) => sum + netPrQty(item), 0);
  const signature = backendSignature || localSignature;
  const approvalDate = backendDate || approval?.approvedAt || indent.date;
  const number = (value: number) => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

  return (
    <article className="min-w-[1040px] overflow-hidden rounded-sm border border-slate-300 bg-white font-sans text-slate-800">
      <header className="px-6 pb-4 pt-5 text-center">
        <img src={logo3f} alt="Sai Bioresources" className="mx-auto h-14 w-auto object-contain" />
        <h2 className="mt-2 text-xl font-black tracking-[0.04em] text-slate-950">SAI BIORESOURCES PRIVATE LIMITED</h2>
        <p className="mt-1 text-[11px] font-medium text-slate-500">
          Khasra No. 121/1, Amrit Dairy Farm, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh - 491001
        </p>
        <p className="mt-1 text-[10px] font-medium text-slate-500">
          GSTIN: 22ARPCS5442R1ZM &nbsp;|&nbsp; Phone: +91 75870 76870 &nbsp;|&nbsp; Email: rajendra.s@saiobioenergy.com
        </p>
        <div className="mt-4 h-1 bg-[#0D3A35]" />
      </header>

      <div className="mx-6 bg-[#0D3A35] px-4 py-3 text-center text-sm font-black tracking-[0.18em] text-white">
        PURCHASE REQUISITION (PR)
      </div>

      <section className="mx-6 grid grid-cols-4 border-x border-b border-slate-300">
        {[
          ['PR Number', indent.prNo || 'Will be generated'],
          ['PR Date', formatDateDDMMYYYY(indent.date)],
          ['Project', indent.project || 'Not Recorded'],
          ['Department', indent.department || 'INVENTORY'],
        ].map(([label, value], index) => (
          <div key={label} className={`min-w-0 px-3 py-3 ${index < 3 ? 'border-r border-slate-300' : ''}`}>
            <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</p>
            <p className="mt-1 break-words text-[12px] font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </section>

      <section className="mx-6 mt-4 border border-slate-300">
        <div className="border-b border-slate-300 bg-slate-100 px-4 py-2 text-[11px] font-black uppercase tracking-[0.09em] text-slate-700">
          Requisition Items
        </div>
        <table className="w-full table-fixed border-collapse text-[10px]">
          <colgroup>
            <col className="w-[4%]" /><col className="w-[10%]" /><col className="w-[20%]" /><col className="w-[6%]" />
            <col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[10%]" />
            <col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[10%]" />
          </colgroup>
          <thead className="bg-[#0D3A35] text-white">
            <tr>
              {['S. No.', 'Item Code', 'Item / Specification', 'UoM', 'Required Qty.', 'Stock Qty.', 'Net PR Qty.', 'Required By', 'Source', 'Unit Rate', 'Approx. Value'].map((heading) => (
                <th key={heading} className="border-r border-white/25 px-1.5 py-2.5 text-center text-[8px] font-bold uppercase leading-tight tracking-[0.035em] last:border-r-0">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {indent.items.map((item) => (
              <tr key={item.id} className="border-b border-slate-200 last:border-b-0">
                <td className="border-r border-slate-200 px-2 py-2.5 text-center">{item.srNo}</td>
                <td className="border-r border-slate-200 px-2 py-2.5 font-mono font-bold text-[#0D3A35]">{item.itemCode || '—'}</td>
                <td className="border-r border-slate-200 px-2 py-2.5">
                  <p className="font-bold text-slate-900">{item.partName || 'Not Recorded'}</p>
                  <p className="mt-0.5 text-[9px] leading-snug text-slate-500">{item.specification || 'No specification recorded'}</p>
                </td>
                <td className="border-r border-slate-200 px-2 py-2.5 text-center font-semibold">{item.uom || '—'}</td>
                <td className="border-r border-slate-200 px-2 py-2.5 text-right">{number(item.totalQtyRequired)}</td>
                <td className="border-r border-slate-200 px-2 py-2.5 text-right">{number(item.lessQtyAvailableInStock)}</td>
                <td className="border-r border-slate-200 px-2 py-2.5 text-right font-bold">{number(netPrQty(item))}</td>
                <td className="border-r border-slate-200 px-2 py-2.5 text-center">{formatDateDDMMYYYY(item.materialRequiredByDate)}</td>
                <td className="border-r border-slate-200 px-2 py-2.5 text-center">{item.indigenousOrImported || '—'}</td>
                <td className="border-r border-slate-200 px-2 py-2.5 text-right">{formatInr(item.ratePerItem || 0)}</td>
                <td className="px-2 py-2.5 text-right font-bold">{formatInr(approxValue(item))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mx-6 mt-4 grid grid-cols-4 border border-slate-300">
        {[
          ['Line Items', number(itemCount)],
          ['Total Required Qty.', number(totalRequired)],
          ['Total Net PR Qty.', number(totalNetQuantity)],
          ['Total PR Value', formatInr(totalValue(indent.items))],
        ].map(([label, value], index) => (
          <div key={label} className={`px-3 py-3 ${index < 3 ? 'border-r border-slate-300' : ''}`}>
            <p className="text-[9px] font-bold uppercase tracking-[0.06em] text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="mx-6 mt-4 border border-slate-300">
        <div className="border-b border-slate-300 bg-slate-100 px-4 py-2 text-[11px] font-black uppercase tracking-[0.09em] text-slate-700">
          Procurement &amp; Technical Details
        </div>
        <table className="w-full table-fixed border-collapse text-[9px]">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {['Item', 'Preferred Vendor', 'Lead Time', 'Warranty / Guarantee', 'Full Life', 'Actual Life', 'Repairing', 'Replacement Reason'].map((heading) => (
                <th key={heading} className="border-b border-r border-slate-300 px-2 py-2 text-center font-bold uppercase last:border-r-0">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {indent.items.map((item) => (
              <tr key={`technical-${item.id}`} className="border-b border-slate-200 last:border-b-0">
                <td className="border-r border-slate-200 px-2 py-2 font-bold">{item.partName || `Item ${item.srNo}`}</td>
                <td className="border-r border-slate-200 px-2 py-2">{item.preferredVendorName || 'Not Recorded'}</td>
                <td className="border-r border-slate-200 px-2 py-2 text-center">{number(item.procurementLeadTimeWeeks)} week(s)</td>
                <td className="border-r border-slate-200 px-2 py-2 text-center">{item.validityOfWarrantyAndGuarantee || 'N/A'}</td>
                <td className="border-r border-slate-200 px-2 py-2 text-center">{item.fullLifeHr || 'N/A'}</td>
                <td className="border-r border-slate-200 px-2 py-2 text-center">{item.actualLifeHr || 'N/A'}</td>
                <td className="border-r border-slate-200 px-2 py-2 text-center">{item.repairingPossibility || 'N/A'}</td>
                <td className="px-2 py-2">{item.reasonForReplacement || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mx-6 mt-4 grid grid-cols-2 gap-4">
        <div className="border border-slate-300">
          <div className="border-b border-slate-300 bg-slate-100 px-4 py-2 text-[11px] font-black uppercase tracking-[0.09em] text-slate-700">Budget Head</div>
          <div className="min-h-[72px] whitespace-pre-line px-4 py-3 text-[10px] leading-relaxed text-slate-700">{indent.budgetHead || 'Not Recorded'}</div>
        </div>
        <div className="border border-slate-300">
          <div className="border-b border-slate-300 bg-slate-100 px-4 py-2 text-[11px] font-black uppercase tracking-[0.09em] text-slate-700">Remarks / Notes</div>
          <div className="min-h-[72px] px-4 py-3 text-[10px] leading-relaxed text-slate-700">{indent.remarksNotes || 'No remarks recorded'}</div>
        </div>
      </section>

      <section className="mx-6 mt-4 border border-slate-300">
        <div className="border-b border-slate-300 bg-slate-100 px-4 py-2 text-[11px] font-black uppercase tracking-[0.09em] text-slate-700">Approval Details</div>
        <div className="grid grid-cols-[1fr_1.35fr_1.8fr_.8fr] bg-slate-50 text-[9px] font-bold uppercase text-slate-500">
          {['Approval Stage', 'Name / ID', 'Digital Signature', 'Date'].map((heading) => <div key={heading} className="border-r border-slate-300 px-3 py-2 text-center last:border-r-0">{heading}</div>)}
        </div>
        {[
          ['Indented By', backendNameId || localNameId || indent.indentedBy || 'Not Recorded', signature || 'Pending', approvalDate],
          ['Forwarded By', forwardedNameId || 'Not Recorded', forwardedSignature || 'Pending', forwardedDate],
          ["Director's Approval", directorNameId || 'Not Recorded', directorSignature || 'Pending', directorDate],
        ].map(([stage, name, sign, date], index) => (
          <div key={stage} className={`grid grid-cols-[1fr_1.35fr_1.8fr_.8fr] text-[10px] ${index < 2 ? 'border-b border-slate-200' : ''}`}>
            <div className="border-r border-slate-200 px-3 py-3 font-bold text-slate-800">{stage}</div>
            <div className="border-r border-slate-200 px-3 py-3 text-center">{name}</div>
            <div className="border-r border-slate-200 px-3 py-3 text-center">
              <span className={`inline-flex rounded border px-2 py-1 text-[9px] font-semibold ${sign === 'Pending' ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{sign}</span>
            </div>
            <div className="px-3 py-3 text-center">{date ? formatDateDDMMYYYY(date) : '—'}</div>
          </div>
        ))}
      </section>

      <footer className="mx-6 mb-5 mt-4 flex items-center justify-between border-t border-slate-300 pt-2 text-[9px] font-medium text-slate-500">
        <span>System-generated Purchase Requisition</span>
        <span>PR No.: {indent.prNo || 'Draft'}</span>
        <span>SAI BIORESOURCES PRIVATE LIMITED</span>
      </footer>
    </article>
  );
};

const ConfigureIndentModal = ({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [indentedBy, setIndentedBy] = useState('');
  const [forwardedBy, setForwardedBy] = useState('');
  const [directorsApproval, setDirectorsApproval] = useState('');

  const [projects, setProjects] = useState<string[]>([]);
  const [newProject, setNewProject] = useState('');

  useEffect(() => {
    if (!open) return;
    const cfg = readInventoryIndentConfig();
    setIndentedBy(cfg.indentedBy ?? '');
    setForwardedBy(cfg.forwardedBy ?? '');
    setDirectorsApproval(cfg.directorsApproval ?? '');
    setProjects(cfg.projects ?? []);
    setNewProject('');
  }, [open]);

  const addProject = () => {
    const name = newProject.trim();
    if (!name) return;
    setProjects((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setNewProject('');
  };

  const removeProject = (name: string) => {
    setProjects((prev) => prev.filter((p) => p !== name));
  };

  const save = () => {
    writeInventoryIndentConfig({
      indentedBy: indentedBy.trim(),
      forwardedBy: forwardedBy.trim(),
      directorsApproval: directorsApproval.trim(),
      projects,
    });
    toast.success('Indent configuration saved');
    onSaved();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden rounded-2xl border-0 bg-[#f6f8fa] p-0 shadow-2xl">
        <DialogHeader className="bg-[#0D3A35] px-6 py-5 text-left">
          <DialogTitle className="flex items-center gap-3 text-xl font-bold text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"><Settings className="h-5 w-5" /></span>
            Configure Inventory Indents
          </DialogTitle>
          <p className="mt-1 pl-[52px] text-sm text-white/70">Maintain default approvers and project categories.</p>
        </DialogHeader>

        <div className="max-h-[calc(90vh-154px)] space-y-4 overflow-y-auto px-6 py-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.08em] text-[#0D3A35]">Default Names</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500">Indented by</label>
                <Input value={indentedBy} onChange={(e) => setIndentedBy(e.target.value)} placeholder="e.g. SUKHDEEP SINGH" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Forwarded by</label>
                <Input value={forwardedBy} onChange={(e) => setForwardedBy(e.target.value)} placeholder="e.g. RAJINDER SINGH PADDA" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-gray-500">Director's Approval by</label>
                <Input value={directorsApproval} onChange={(e) => setDirectorsApproval(e.target.value)} placeholder="e.g. RAJENDRA SHRINGARPUTALE" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.08em] text-[#0D3A35]">Project Categories</p>

            <div className="flex gap-2">
              <Input
                value={newProject}
                onChange={(e) => setNewProject(e.target.value)}
                placeholder="Add project name (e.g. Chhattisgarh 2250 Acres)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addProject();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addProject}>
                + Add
              </Button>
            </div>

            <div className="mt-3 space-y-2">
              {projects.length === 0 ? (
                <p className="text-sm text-gray-400">No projects added yet.</p>
              ) : (
                projects.map((p) => (
                  <div key={p} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <span className="text-sm text-gray-800 truncate">{p}</span>
                    <button
                      type="button"
                      className="text-gray-400 hover:text-red-600"
                      onClick={() => removeProject(p)}
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4">
          <Button variant="outline" onClick={onClose} className="h-10 rounded-xl border-slate-200 px-5 font-bold">Cancel</Button>
          <Button className="h-10 rounded-xl bg-[#0D3A35] px-5 font-bold text-white hover:bg-[#092e2a]" onClick={save}>Save Configuration</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InventoryIndent;
