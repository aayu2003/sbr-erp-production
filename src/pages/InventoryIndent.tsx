import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Settings, Trash2, Paperclip, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

type PRLineItem = {
  id: string;
  srNo: number;
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
  indentedByDetails?: {
    nameId: string;
    signature: string;
    timestamp?: string;
  };

  // workflow
  status: 'open' | 'forwarded' | 'approved' | 'rejected';
};

type IndentApproval = {
  staffName: string;
  staffDesignation: string;
  approvedAt: string; // YYYY-MM-DD
  approvedTime: string; // HH:mm
};

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
  pr_number: string;
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

const InventoryIndent = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [indents, setIndents] = useState<Indent[]>(initialIndents);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [prefillDraft, setPrefillDraft] = useState<IndentDraft | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [configVersion, setConfigVersion] = useState(0);
  const [previewIndent, setPreviewIndent] = useState<Indent | null>(null);

  const [indentApprovalsMap, setIndentApprovalsMap] = useState<Record<string, IndentApproval>>({});
  const [attachingApprovalMap, setAttachingApprovalMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;
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

          const indentedByDetails =
            r.indented_by &&
            typeof r.indented_by === 'object' &&
            typeof r.indented_by?.name_id === 'string' &&
            typeof r.indented_by?.signature === 'string'
              ? {
                  nameId: String(r.indented_by.name_id ?? '').trim(),
                  signature: String(r.indented_by.signature ?? '').trim(),
                  timestamp: r.indented_by.timestamp ? String(r.indented_by.timestamp) : undefined,
                }
              : undefined;

          const derivedStatus: Indent['status'] =
            indentedByDetails?.signature ? 'forwarded' : 'open';

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
            status: derivedStatus,
          } as Indent;
        });

        if (mounted) setIndents(mapped);
      } catch (err: any) {
        toast.error(err?.message || 'Unable to load indents');
      }
    };

    loadIndents();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const state: any = location.state;
    const incomingItems = Array.isArray(state?.items) ? state.items : [];
    if (!state?.fromInventoryRequest || incomingItems.length === 0) return;

    const cfg = readInventoryIndentConfig();
    const mappedItems: PRLineItem[] = incomingItems.map((it: any, idx: number) => ({
      ...emptyLineItem(idx + 1),
      id: genId(),
      srNo: idx + 1,
      partName: String(it?.itemName || ''),
      itemCode: String(it?.itemCode || ''),
      uom: String(it?.uom || 'No'),
      lessQtyAvailableInStock: Number(it?.stock) || 0,
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
    return indents.filter((it) =>
      (it.project ?? '').toLowerCase().includes(q) ||
      (it.prNo ?? '').toLowerCase().includes(q) ||
      (it.indentedBy ?? '').toLowerCase().includes(q) ||
      (it.items ?? []).some(
        (li) =>
          (li.partName ?? '').toLowerCase().includes(q) ||
          (li.itemCode ?? '').toLowerCase().includes(q),
      ),
    );
  }, [indents, search]);

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

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Indents</h1>
          <p className="text-sm text-gray-500 mt-0.5">View indents raised and create new indent requests</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setConfigOpen(true)} className="gap-2">
            <Settings className="w-4 h-4" />
            Configure
          </Button>
          <Button onClick={() => setOpen(true)} className="bg-green-600 hover:bg-green-700 text-white gap-2">
            <Plus className="w-4 h-4" />
            Create Indent
          </Button>
        </div>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search by PR no, project, item or requester…"
          className="pl-9 bg-white border-gray-200 shadow-sm h-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        {filtered.map((it) => {
          const alreadySigned =
            Boolean(it.indentedByDetails?.signature) ||
            Boolean(indentApprovalsMap[it.id]);

          return (
            <div
              key={it.id}
              className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm flex items-center justify-between cursor-pointer hover:border-gray-200"
              onClick={() => setPreviewIndent(it)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setPreviewIndent(it);
              }}
            >
              <div>
                <div className="flex items-baseline gap-3">
                  <h3 className="font-semibold text-gray-800">{it.prNo || 'PR (Draft)'}</h3>
                  <span className="text-xs text-gray-400">{it.project}</span>
                </div>
                <p className="text-sm text-gray-500">
                  Items: {(it.items ?? []).length} · Total: {formatInr(totalValue(it.items ?? []))} · Indented by {it.indentedBy || '—'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className={`text-sm font-semibold ${it.status === 'open' ? 'text-yellow-600' : it.status === 'forwarded' ? 'text-blue-600' : it.status === 'approved' ? 'text-green-600' : 'text-red-600'}`}>{it.status.toUpperCase()}</p>
                  <p className="text-xs text-gray-400">{it.date}</p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void attachIndentApproval({ id: it.id, prNo: it.prNo });
                    }}
                    disabled={alreadySigned || Boolean(attachingApprovalMap[it.id])}
                  >
                    <Paperclip className="w-4 h-4" />
                    {alreadySigned
                      ? 'Approved'
                      : attachingApprovalMap[it.id]
                        ? 'Attaching…'
                        : 'Attach Sign'}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <AddIndentModal
        open={open}
        onClose={() => {
          setOpen(false);
          setPrefillDraft(null);
        }}
        configVersion={configVersion}
        mode="create"
        initialData={prefillDraft}
        onSave={(data) => {
          setIndents((p) => [{ ...data, id: genId(), status: 'open' }, ...p]);
          setPrefillDraft(null);
          setOpen(false);
          toast.success('Indent created');
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
    </div>
  );
};

type IndentDraft = Omit<Indent, 'id' | 'status'>;

const AddIndentModal = ({
  open,
  onClose,
  configVersion,
  mode,
  onSave,
  initialData,
}: {
  open: boolean;
  onClose: () => void;
  configVersion: number;
  mode: 'create' | 'edit';
  onSave: (data: IndentDraft) => void;
  initialData?: IndentDraft | null;
}) => {
  const initialRow = useMemo(() => emptyLineItem(1), []);

  const [project, setProject] = useState('');
  const [prNo, setPrNo] = useState('');
  const [date, setDate] = useState(today());

  const [indentedBy, setIndentedBy] = useState('');
  const [forwardedBy, setForwardedBy] = useState('');
  const [directorsApproval, setDirectorsApproval] = useState('');
  const [remarksNotes, setRemarksNotes] = useState('');
  const [budgetHead, setBudgetHead] = useState('');

  const [items, setItems] = useState<PRLineItem[]>([initialRow]);
  const [openRowId, setOpenRowId] = useState(initialRow.id);
  const [configuredProjects, setConfiguredProjects] = useState<string[]>([]);
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
      return;
    }

    const cfg = readInventoryIndentConfig();
    setConfiguredProjects(cfg.projects ?? []);

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

    setItems((prev) => {
      const next = prev.length > 0 ? prev : [emptyLineItem(1)];
      setOpenRowId(next[next.length - 1].id);
      return next;
    });
  }, [open, configVersion, initialData, cachedStaffName]);

  const updateItem = <K extends keyof PRLineItem>(id: string, key: K, value: PRLineItem[K]) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [key]: value } : it)));
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
    if (items.length === 0) return toast.error('Add at least 1 item row');
    if (items.some((i) => !i.partName.trim())) return toast.error('Each row must have Part Name');

    if (mode === 'create') {
      try {
        setSubmitting(true);
        await createIndentApi({
          item_row: items.map(toPurchaseFlowRow),
          project: project.trim(),
          pr_number: prNo.trim(),
          notes: remarksNotes,
          department: 'INVENTORY',
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
      prNo: prNo.trim(), // API integration later
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

  const previewIndent: Omit<Indent, 'id' | 'status'> = {
    project,
    prNo,
    date,
    indentedBy,
    forwardedBy,
    directorsApproval,
    remarksNotes,
    budgetHead,
    items,
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'edit' ? 'Edit Indent (PR)' : 'Create New Indent (PR)'}
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-4">
          {/* Live Preview (PR format table) - placed above form for landscape visibility */}
          <div className="bg-white rounded-lg border border-gray-100 p-4 overflow-x-auto">
            <PRPreview indent={previewIndent} />
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-100 p-4">
              <p className="text-sm font-semibold text-gray-800 mb-3">Header</p>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">Project *</label>
                  {configuredProjects.length > 0 ? (
                    <select
                      className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
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
                    <Input value={project} onChange={(e) => setProject(e.target.value)} placeholder="e.g. Chhattisgarh 2250 Acres" />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">Date</label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-800">Line Items</p>
                <Button type="button" variant="outline" onClick={addRow}>
                  + Add Row
                </Button>
              </div>

              <Accordion type="single" collapsible value={openRowId} onValueChange={(v) => setOpenRowId(v)} className="space-y-2">
                {items.map((it) => (
                  <AccordionItem
                    key={it.id}
                    value={it.id}
                    className="rounded-lg border border-gray-100 bg-gray-50 px-3"
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
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500">Part Name *</label>
                          <Input value={it.partName} onChange={(e) => updateItem(it.id, 'partName', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Item Code</label>
                          <Input value={it.itemCode} onChange={(e) => updateItem(it.id, 'itemCode', e.target.value)} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500">Specification</label>
                          <Input value={it.specification} onChange={(e) => updateItem(it.id, 'specification', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">UoM</label>
                          <Input value={it.uom} onChange={(e) => updateItem(it.id, 'uom', e.target.value)} placeholder="No / kg / litre" />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mt-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500">Total Qty</label>
                          <Input
                            type="number"
                            min={0}
                            value={it.totalQtyRequired}
                            onChange={(e) => updateItem(it.id, 'totalQtyRequired', Number(e.target.value))}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Less Qty (Stock)</label>
                          <Input
                            type="number"
                            min={0}
                            value={it.lessQtyAvailableInStock}
                            onChange={(e) => updateItem(it.id, 'lessQtyAvailableInStock', Number(e.target.value))}
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
                          <label className="text-xs font-medium text-gray-500">Material Required By</label>
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
                          <label className="text-xs font-medium text-gray-500">Rate / Item</label>
                          <Input
                            type="number"
                            min={0}
                            value={it.ratePerItem}
                            onChange={(e) => updateItem(it.id, 'ratePerItem', Number(e.target.value))}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Approx. Value</label>
                          <Input value={formatInr(approxValue(it))} readOnly />
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
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>

            <div className="bg-white rounded-lg border border-gray-100 p-4">
              <p className="text-sm font-semibold text-gray-800 mb-3">Footer</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">Indented By</label>
                  <Input value={indentedBy} readOnly disabled className="bg-gray-50 text-gray-600 cursor-not-allowed" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Forwarded By</label>
                  <Input value={forwardedBy} onChange={(e) => setForwardedBy(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">Director's Approval</label>
                  <Input value={directorsApproval} onChange={(e) => setDirectorsApproval(e.target.value)} />
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

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-green-600 hover:bg-green-700 text-white"
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
          <div className="space-y-3 py-2">
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
              <div className="overflow-auto rounded-lg border border-gray-200 max-h-[420px]">
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

   return (
     <Dialog
       open={Boolean(indent)}
       onOpenChange={(v) => {
         if (!v) onClose();
       }}
     >
       <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
         <DialogHeader>
           <DialogTitle>Indent Preview</DialogTitle>
         </DialogHeader>
         {indent && (
           <div className="bg-white rounded-lg border border-gray-100 p-4 overflow-x-auto">
             <PRPreview
               indent={{
                 project: indent.project,
                 prNo: indent.prNo,
                   department: indent.department,
                 date: indent.date,
                 indentedBy: indent.indentedBy,
                 indentedByDetails: indent.indentedByDetails,
                 forwardedBy: indent.forwardedBy,
                 directorsApproval: indent.directorsApproval,
                 remarksNotes: indent.remarksNotes,
                 budgetHead: indent.budgetHead,
                 items: indent.items,
               }}
               approval={approval}
             />
           </div>
         )}

         <DialogFooter className="flex items-center gap-2">
           {indent && onAttachApproval ? (
             <Button
               variant="outline"
               onClick={() => onAttachApproval({ id: indent.id, prNo: indent.prNo })}
               disabled={alreadySigned || Boolean(attaching)}
             >
               {alreadySigned ? 'Approved' : attaching ? 'Attaching…' : 'Attach Sign'}
             </Button>
           ) : null}
           <Button onClick={onClose}>Close</Button>
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

  const localNameId = approval
    ? `${approval.staffName} / ${approval.staffDesignation}`
    : '';
  const localSignature = approval
    ? `Approver | ${approval.staffName} | ${approval.approvedTime} | ${approval.approvedAt}`
    : '';

  return (
    <div className="min-w-[980px]">
      <div className="border border-gray-300">
        {/* Top title */}
        <div className="text-center font-semibold text-sm py-2 border-b border-gray-300">
          SAI BIORESOURCES PRIVATE LIMITED
        </div>

        {/* Header row */}
        <div className="grid grid-cols-12 border-b border-gray-300 text-xs">
          <div className="col-span-4 p-2 border-r border-gray-300">
            <span className="font-semibold">Project:</span> {indent.project || '—'}
          </div>
          <div className="col-span-2 p-2 border-r border-gray-300">
            <span className="font-semibold">Department:</span> {indent.department || '—'}
          </div>
          <div className="col-span-4 p-2 border-r border-gray-300 text-center font-semibold">
            <span>PURCHASE REQUISITION (PR.)</span>
            <span className="ml-2 text-xs font-normal">{indent.prNo || '—'}</span>
          </div>
          <div className="col-span-2 p-2">
            <span className="font-semibold">Date:</span> {indent.date || '—'}
          </div>
        </div>

        {/* Items table */}
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 px-1 py-1 w-[28px]">Sr. Nos.</th>
              <th className="border border-gray-300 px-1 py-1 w-[70px]">Item Code</th>
              <th className="border border-gray-300 px-1 py-1">Part Name</th>
              <th className="border border-gray-300 px-1 py-1">Specification</th>
              <th className="border border-gray-300 px-1 py-1 w-[50px]">UoM</th>
              <th className="border border-gray-300 px-1 py-1 w-[70px]">Total Qty. Required</th>
              <th className="border border-gray-300 px-1 py-1 w-[80px]">Less Qty. Available in Stocks</th>
              <th className="border border-gray-300 px-1 py-1 w-[60px]">Net PR Qty</th>
              <th className="border border-gray-300 px-1 py-1 w-[70px]">Procurement Lead time (weeks)</th>
              <th className="border border-gray-300 px-1 py-1 w-[85px]">Material Required by Date</th>
              <th className="border border-gray-300 px-1 py-1 w-[70px]">Indigenous / Imported</th>
              <th className="border border-gray-300 px-1 py-1 w-[60px]">Rate/Item</th>
              <th className="border border-gray-300 px-1 py-1 w-[85px]">Approx. Value Rs.</th>
              <th className="border border-gray-300 px-1 py-1">Preferred Vendor Name</th>
              <th className="border border-gray-300 px-1 py-1 w-[85px]">Validity of Warranty and Guarantee</th>
              <th className="border border-gray-300 px-1 py-1 w-[60px]">Full life (Hr)</th>
              <th className="border border-gray-300 px-1 py-1 w-[60px]">Actual Life (Hr)</th>
              <th className="border border-gray-300 px-1 py-1 w-[90px]">Reason for replacement</th>
              <th className="border border-gray-300 px-1 py-1 w-[85px]">Repairing possibility Yes/No/NA</th>
            </tr>
          </thead>
          <tbody>
            {indent.items.map((it) => (
              <tr key={it.id}>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.srNo}</td>
                <td className="border border-gray-300 px-1 py-1">{it.itemCode || ''}</td>
                <td className="border border-gray-300 px-1 py-1">{it.partName || ''}</td>
                <td className="border border-gray-300 px-1 py-1">{it.specification || ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.uom || ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.totalQtyRequired || 0}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.lessQtyAvailableInStock || 0}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{netPrQty(it)}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.procurementLeadTimeWeeks || 0}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.materialRequiredByDate || ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.indigenousOrImported}</td>
                <td className="border border-gray-300 px-1 py-1 text-right">{it.ratePerItem ? it.ratePerItem.toLocaleString() : ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-right">{approxValue(it) ? formatInr(approxValue(it)) : ''}</td>
                <td className="border border-gray-300 px-1 py-1">{it.preferredVendorName || ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.validityOfWarrantyAndGuarantee || ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.fullLifeHr || ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.actualLifeHr || ''}</td>
                <td className="border border-gray-300 px-1 py-1">{it.reasonForReplacement || ''}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{it.repairingPossibility || 'NA'}</td>
              </tr>
            ))}

            <tr>
              <td colSpan={12} className="border border-gray-300 px-1 py-1 text-right font-semibold">TOTAL</td>
              <td colSpan={7} className="border border-gray-300 px-1 py-1 text-right font-semibold">
                {formatInr(totalValue(indent.items))}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Footer / signatures and remarks */}
        <div className="grid grid-cols-12 text-xs border-t border-gray-300">
          <div className="col-span-8 border-r border-gray-300">
            <div className="grid grid-cols-4 border-b border-gray-300">
              <div className="p-2 font-semibold">SAI BIORESOURCES PRIVATE LIMITED</div>
              <div className="p-2 font-semibold text-center">Name/ID</div>
              <div className="p-2 font-semibold text-center">Signature</div>
              <div className="p-2 font-semibold text-center">Date</div>
            </div>

            <div className="grid grid-cols-4 border-b border-gray-300">
              <div className="p-2 font-semibold">Indented By</div>
              <div className="p-2 text-center">
                {backendNameId || localNameId || indent.indentedBy || '—'}
              </div>
              <div className="p-2 text-center">
                {backendSignature || localSignature ? (
                  <span className="inline-block border border-gray-400 rounded px-2 py-1 text-[10px] leading-tight">
                    {backendSignature || localSignature}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </div>
              <div className="p-2 text-center">{backendDate || approval?.approvedAt || indent.date || '—'}</div>
            </div>
            <div className="grid grid-cols-4 border-b border-gray-300">
              <div className="p-2 font-semibold">Forwarded By</div>
              <div className="p-2 text-center">{indent.forwardedBy || '—'}</div>
              <div className="p-2 text-center text-gray-400">—</div>
              <div className="p-2 text-center">{indent.date || '—'}</div>
            </div>
            <div className="grid grid-cols-4">
              <div className="p-2 font-semibold">Director's Approval</div>
              <div className="p-2 text-center">{indent.directorsApproval || '—'}</div>
              <div className="p-2 text-center text-gray-400">—</div>
              <div className="p-2 text-center">{indent.date || '—'}</div>
            </div>
          </div>

          <div className="col-span-4">
            <div className="grid grid-cols-1 border-b border-gray-300">
              <div className="p-2 font-semibold">Remarks / Notes</div>
              <div className="p-2 min-h-[56px] text-gray-700">{indent.remarksNotes || ''}</div>
            </div>
            <div className="p-2">
              <div className="font-semibold">Budget Head</div>
              <div className="text-gray-700 text-[11px] whitespace-pre-line leading-snug">{indent.budgetHead || '—'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
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
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Configure Inventory Indents</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-white rounded-lg border border-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-800 mb-3">Default Names</p>
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

          <div className="bg-white rounded-lg border border-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-800 mb-3">Project Categories</p>

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

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InventoryIndent;
