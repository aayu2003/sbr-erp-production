import { useMemo, useState, type ElementType } from "react";
import {
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  CircleDollarSign,
  Edit3,
  FileKey,
  FolderKanban,
  Landmark,
  LockKeyhole,
  Plus,
  Receipt,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Target,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import CostAccountingSetup from "@/components/accounting/CostAccountingSetup";

type MasterTab = "Organisation" | "Numbering" | "Tax & TDS" | "Payments & Banking" | "Cost Allocation" | "Cost Centre" | "Cost Attribution" | "Workflow & Controls";

type NumberingRule = {
  id: string;
  document: string;
  prefix: string;
  digits: number;
  reset: "Financial Year" | "Calendar Year" | "Never";
  nextNumber: number;
};

type ApprovalRule = {
  id: string;
  transaction: string;
  fromAmount: number;
  toAmount: number;
  levels: number;
};

type DimensionMaster = {
  id: string;
  code: string;
  name: string;
  shortName?: string;
  description?: string;
  projectHead?: string;
  department?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  status?: "Active" | "Inactive" | "Completed" | "On Hold";
};

type AccountingMasterConfig = {
  organisation: {
    legalEntity: string;
    baseCurrency: string;
    activeFinancialYear: string;
    financialYearStartMonth: string;
    booksStartDate: string;
    accountingMethod: string;
    dateFormat: string;
    timezone: string;
  };
  numbering: NumberingRule[];
  tax: {
    gstEnabled: boolean;
    companyGstin: string;
    registrationState: string;
    defaultTaxTreatment: string;
    tdsEnabled: boolean;
    defaultTdsRate: number;
    tdsRounding: string;
    taxCalculationBasis: string;
  };
  payments: {
    defaultCreditDays: number;
    paymentApprovalRequired: boolean;
    allowPartPayments: boolean;
    requirePaymentAllocation: boolean;
    bankReconciliationRequired: boolean;
    defaultBankAccount: string;
    paymentModes: string[];
  };
  costing: {
    requireDepartment: boolean;
    requireProject: boolean;
    requireSiteLand: boolean;
    requireBudgetHead: boolean;
    requireCostCentre: boolean;
    preventBudgetOverrun: boolean;
    allocationBasis: string;
    departments: DimensionMaster[];
    costCentres: DimensionMaster[];
    projects: DimensionMaster[];
    sites: DimensionMaster[];
  };
  controls: {
    makerChecker: boolean;
    mandatoryBillAttachment: boolean;
    mandatorySupportingDocuments: boolean;
    allowBackdatedEntries: boolean;
    autoPostApprovedVouchers: boolean;
    periodLockDate: string;
    auditLogRetentionYears: number;
    approvalRules: ApprovalRule[];
  };
};

const STORAGE_KEY = "sbr-accounting-master-v1";

const DEFAULT_CONFIG: AccountingMasterConfig = {
  organisation: {
    legalEntity: "SAI BIORESOURCES PRIVATE LIMITED",
    baseCurrency: "INR",
    activeFinancialYear: "2026-27",
    financialYearStartMonth: "April",
    booksStartDate: "2026-04-01",
    accountingMethod: "Accrual",
    dateFormat: "DD/MM/YYYY",
    timezone: "Asia/Kolkata",
  },
  numbering: [
    { id: "bill-inward", document: "Bill Inward", prefix: "BI/{FY}/", digits: 5, reset: "Financial Year", nextNumber: 1 },
    { id: "journal-voucher", document: "Journal Voucher", prefix: "JV/{FY}/", digits: 5, reset: "Financial Year", nextNumber: 1 },
    { id: "bank-payment", document: "Bank Payment Voucher", prefix: "BPV/{FY}/", digits: 5, reset: "Financial Year", nextNumber: 1 },
    { id: "bank-receipt", document: "Bank Receipt Voucher", prefix: "BRV/{FY}/", digits: 5, reset: "Financial Year", nextNumber: 1 },
    { id: "cash-payment", document: "Cash Payment Voucher", prefix: "CPV/{FY}/", digits: 5, reset: "Financial Year", nextNumber: 1 },
    { id: "cash-receipt", document: "Cash Receipt Voucher", prefix: "CRV/{FY}/", digits: 5, reset: "Financial Year", nextNumber: 1 },
    { id: "payment-request", document: "Payment Request / PRR", prefix: "PRR/{FY}/", digits: 5, reset: "Financial Year", nextNumber: 1 },
    { id: "debit-note", document: "Debit Note", prefix: "DN/{FY}/", digits: 5, reset: "Financial Year", nextNumber: 1 },
    { id: "credit-note", document: "Credit Note", prefix: "CN/{FY}/", digits: 5, reset: "Financial Year", nextNumber: 1 },
  ],
  tax: {
    gstEnabled: true,
    companyGstin: "",
    registrationState: "Chhattisgarh",
    defaultTaxTreatment: "Auto — based on Place of Supply",
    tdsEnabled: true,
    defaultTdsRate: 0,
    tdsRounding: "Nearest Rupee",
    taxCalculationBasis: "Line Item",
  },
  payments: {
    defaultCreditDays: 30,
    paymentApprovalRequired: true,
    allowPartPayments: true,
    requirePaymentAllocation: true,
    bankReconciliationRequired: true,
    defaultBankAccount: "",
    paymentModes: ["NEFT", "RTGS", "IMPS", "Cheque", "UPI", "Cash"],
  },
  costing: {
    requireDepartment: true,
    requireProject: true,
    requireSiteLand: false,
    requireBudgetHead: true,
    requireCostCentre: true,
    preventBudgetOverrun: true,
    allocationBasis: "Line Item",
    departments: [],
    costCentres: [],
    projects: [],
    sites: [],
  },
  controls: {
    makerChecker: true,
    mandatoryBillAttachment: true,
    mandatorySupportingDocuments: false,
    allowBackdatedEntries: false,
    autoPostApprovedVouchers: false,
    periodLockDate: "",
    auditLogRetentionYears: 8,
    approvalRules: [
      { id: "rule-1", transaction: "Bill Passing", fromAmount: 0, toAmount: 100000, levels: 1 },
      { id: "rule-2", transaction: "Bill Passing", fromAmount: 100001, toAmount: 1000000, levels: 2 },
      { id: "rule-3", transaction: "Vendor Payment", fromAmount: 0, toAmount: 1000000, levels: 2 },
    ],
  },
};

const loadConfig = (): AccountingMasterConfig => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_CONFIG;
    const parsed = JSON.parse(saved) as Partial<AccountingMasterConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      organisation: { ...DEFAULT_CONFIG.organisation, ...(parsed.organisation ?? {}) },
      tax: { ...DEFAULT_CONFIG.tax, ...(parsed.tax ?? {}) },
      payments: { ...DEFAULT_CONFIG.payments, ...(parsed.payments ?? {}) },
      costing: { ...DEFAULT_CONFIG.costing, ...(parsed.costing ?? {}) },
      controls: { ...DEFAULT_CONFIG.controls, ...(parsed.controls ?? {}) },
      numbering: Array.isArray(parsed.numbering) ? parsed.numbering : DEFAULT_CONFIG.numbering,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
};

const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10";
const labelClass = "space-y-2 text-xs font-bold text-slate-600";

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-5 rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-[#b8d6ce]">
      <div><p className="text-sm font-bold text-slate-800">{label}</p><p className="mt-1 text-xs leading-5 text-slate-400">{description}</p></div>
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-[#0d5c4d]" : "bg-slate-200")}><span className={cn("absolute top-1 h-4 w-4 rounded-full bg-white shadow transition", checked ? "left-6" : "left-1")} /></span>
    </button>
  );
}

function Section({ icon: Icon, title, description, children }: { icon: ElementType; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_38px_rgba(15,23,42,0.045)] sm:p-6">
      <div className="flex items-start gap-3 border-b border-slate-100 pb-5"><span className="rounded-xl bg-[#eaf4f1] p-2.5 text-[#0d5c4d]"><Icon className="h-5 w-5" /></span><div><h2 className="text-base font-bold text-slate-900">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-400">{description}</p></div></div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function DimensionMasterCard({ title, singular, items, onAdd, onDelete }: { title: string; singular: string; items: DimensionMaster[]; onAdd: (code: string, name: string) => void; onDelete: (id: string) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const add = () => {
    if (!code.trim() || !name.trim()) return toast.error(`${singular} code and name are required`);
    onAdd(code.trim().toUpperCase(), name.trim());
    setCode("");
    setName("");
  };
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3"><p className="text-sm font-bold text-slate-800">{title}</p><p className="mt-0.5 text-[11px] text-slate-400">Create options used in finance entry dropdowns.</p></div>
      <div className="grid gap-2 p-3 sm:grid-cols-[130px_minmax(0,1fr)_auto]"><input className={inputClass} value={code} onChange={(event) => setCode(event.target.value)} placeholder="Code" /><input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder={`${singular} name`} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} /><button type="button" onClick={add} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0d5c4d] px-4 text-sm font-bold text-white hover:bg-[#0a4b3f]"><Plus className="h-4 w-4" /> Add</button></div>
      <div className="max-h-56 overflow-y-auto border-t border-slate-100">
        {items.length === 0 ? <p className="px-4 py-6 text-center text-xs font-medium text-slate-400">No {title.toLowerCase()} configured.</p> : items.map((item) => <div key={item.id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"><span className="rounded-lg bg-[#edf5f2] px-2 py-1 font-mono text-[10px] font-bold text-[#0d5c4d]">{item.code}</span><span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{item.name}</span><button type="button" onClick={() => onDelete(item.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title={`Delete ${item.name}`}><Trash2 className="h-4 w-4" /></button></div>)}
      </div>
    </div>
  );
}

function ProjectMasterSetup({ projects, onChange }: { projects: DimensionMaster[]; onChange: (projects: DimensionMaster[]) => void }) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<DimensionMaster | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const nextCode = () => {
    const numbers = projects.map((project) => /^PRJ-(\d+)$/.exec(project.code)?.[1]).filter(Boolean).map(Number);
    return `PRJ-${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(3, "0")}`;
  };
  const blank = (): DimensionMaster => ({ id: `projects-${Date.now()}`, code: nextCode(), name: "", shortName: "", description: "", projectHead: "", department: "", location: "", startDate: "", endDate: "", status: "Active" });
  const [form, setForm] = useState<DimensionMaster>(blank);
  const openAdd = () => { setEditing(null); setForm(blank()); setErrors({}); setDrawerOpen(true); };
  const openEdit = (project: DimensionMaster) => { setEditing(project); setForm({ ...blank(), ...project }); setErrors({}); setDrawerOpen(true); };
  const update = <K extends keyof DimensionMaster>(key: K, value: DimensionMaster[K]) => setForm((current) => ({ ...current, [key]: value }));
  const saveProject = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = "Project Name is required";
    if (!form.department?.trim()) nextErrors.department = "Department is required";
    if (form.endDate && form.startDate && form.endDate < form.startDate) nextErrors.endDate = "End Date cannot be before Start Date";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const next = editing ? projects.map((project) => project.id === editing.id ? form : project) : [form, ...projects];
    onChange(next);
    setDrawerOpen(false);
    toast.success(editing ? "Project updated" : "Project created");
  };
  const filtered = projects.filter((project) => [project.code, project.name, project.department, project.location, project.projectHead].some((value) => String(value ?? "").toLowerCase().includes(search.toLowerCase())));
  return <div className="space-y-5">
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-bold text-slate-900">Project Master</h2><p className="mt-1 text-xs text-slate-400">Create projects used for accounting attribution, costing and finance entries.</p></div><button type="button" onClick={openAdd} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0d5c4d] px-4 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Create Project</button></div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold text-slate-900">Projects Register</h3><p className="mt-1 text-xs text-slate-400">{filtered.length} projects configured</p></div><input className={cn(inputClass, "sm:max-w-sm")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search project, code, department or location" /></div>
      {filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-[#0d473f] text-[10px] uppercase tracking-[0.1em] text-white"><tr><th className="px-4 py-3">Project Code</th><th className="px-4 py-3">Project Name</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Project Head</th><th className="px-4 py-3">Location / Cluster</th><th className="px-4 py-3">Period</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((project) => <tr key={project.id} className={cn("hover:bg-[#f6faf9]", project.status === "Inactive" && "opacity-60")}><td className="px-4 py-3 font-mono text-xs font-bold text-[#0d5c4d]">{project.code}</td><td className="px-4 py-3 font-bold text-slate-800">{project.name}</td><td className="px-4 py-3 text-slate-500">{project.department || "—"}</td><td className="px-4 py-3 text-slate-500">{project.projectHead || "—"}</td><td className="px-4 py-3 text-slate-500">{project.location || "—"}</td><td className="px-4 py-3 text-xs text-slate-500">{project.startDate || "—"}{project.endDate ? ` → ${project.endDate}` : ""}</td><td className="px-4 py-3"><span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", project.status === "Active" ? "bg-emerald-50 text-emerald-700" : project.status === "Completed" ? "bg-blue-50 text-blue-700" : project.status === "On Hold" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500")}>{project.status || "Active"}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" onClick={() => openEdit(project)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-[#0d5c4d]" title="Edit project"><Edit3 className="h-4 w-4" /></button><button type="button" onClick={() => onChange(projects.map((item) => item.id === project.id ? { ...item, status: item.status === "Inactive" ? "Active" : "Inactive" } : item))} className="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100">{project.status === "Inactive" ? "Reactivate" : "Deactivate"}</button></div></td></tr>)}</tbody></table></div> : <div className="py-14 text-center"><FolderKanban className="mx-auto h-8 w-8 text-slate-300" /><h4 className="mt-4 font-bold text-slate-800">No projects configured</h4><p className="mt-2 text-sm text-slate-400">Create a project to use it in costing and cost attribution.</p><button type="button" onClick={openAdd} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#0d5c4d] px-4 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Create Project</button></div>}
    </section>
    {drawerOpen && <div className="fixed inset-0 z-[120] bg-slate-950/45" onMouseDown={(event) => event.target === event.currentTarget && setDrawerOpen(false)}><aside className="ml-auto flex h-full w-full max-w-[540px] flex-col bg-[#f7f9fa] shadow-2xl"><div className="flex items-start justify-between bg-[#0d473f] px-6 py-5 text-white"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/60">Accounting Master · Projects</p><h2 className="mt-1 text-xl font-bold">{editing ? "Edit Project" : "Create Project"}</h2></div><button type="button" onClick={() => setDrawerOpen(false)} className="rounded-lg p-2 text-white/70 hover:bg-white/10"><X className="h-5 w-5" /></button></div><div className="min-h-0 flex-1 overflow-y-auto p-5"><section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="grid gap-4 sm:grid-cols-2"><label className={labelClass}>Project Code<input readOnly className={cn(inputClass, "bg-slate-50 font-mono text-[#0d5c4d]")} value={form.code} /><span className="text-[10px] font-medium text-slate-400">Auto-generated</span></label><label className={labelClass}>Project Name<input className={inputClass} value={form.name} onChange={(event) => update("name", event.target.value)} />{errors.name && <span className="text-[11px] text-red-600">{errors.name}</span>}</label><label className={labelClass}>Short Name<input className={inputClass} value={form.shortName || ""} onChange={(event) => update("shortName", event.target.value)} /></label><label className={labelClass}>Department<input className={inputClass} value={form.department || ""} onChange={(event) => update("department", event.target.value)} />{errors.department && <span className="text-[11px] text-red-600">{errors.department}</span>}</label><label className={labelClass}>Project Head<input className={inputClass} value={form.projectHead || ""} onChange={(event) => update("projectHead", event.target.value)} /></label><label className={labelClass}>Location / Cluster<input className={inputClass} value={form.location || ""} onChange={(event) => update("location", event.target.value)} /></label><label className={labelClass}>Start Date<input type="date" className={inputClass} value={form.startDate || ""} onChange={(event) => update("startDate", event.target.value)} /></label><label className={labelClass}>End Date<input type="date" className={inputClass} value={form.endDate || ""} onChange={(event) => update("endDate", event.target.value)} />{errors.endDate && <span className="text-[11px] text-red-600">{errors.endDate}</span>}</label><label className={labelClass}>Status<select className={inputClass} value={form.status || "Active"} onChange={(event) => update("status", event.target.value as DimensionMaster["status"])}><option>Active</option><option>Inactive</option><option>Completed</option><option>On Hold</option></select></label><label className={cn(labelClass, "sm:col-span-2")}>Description<textarea rows={4} className="w-full rounded-xl border border-slate-200 p-3 text-sm font-medium outline-none focus:border-[#278b76]" value={form.description || ""} onChange={(event) => update("description", event.target.value)} /></label></div></section></div><div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 bg-white p-4"><button type="button" onClick={() => setDrawerOpen(false)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600">Cancel</button><button type="button" onClick={saveProject} className="h-10 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white">Save Project</button></div></aside></div>}
  </div>;
}

export default function AccountingMaster() {
  const [activeTab, setActiveTab] = useState<MasterTab>("Organisation");
  const [config, setConfig] = useState<AccountingMasterConfig>(loadConfig);
  const [savedAt, setSavedAt] = useState(() => localStorage.getItem(`${STORAGE_KEY}:saved-at`) ?? "");

  const tabs: Array<{ label: MasterTab; icon: ElementType }> = [
    { label: "Organisation", icon: Building2 },
    { label: "Numbering", icon: FileKey },
    { label: "Cost Centre", icon: Building2 },
    { label: "Cost Attribution", icon: Target },
  ];

  const configuredControls = useMemo(() => {
    const values = [config.tax.gstEnabled, config.tax.tdsEnabled, config.payments.paymentApprovalRequired, config.payments.bankReconciliationRequired, config.costing.requireBudgetHead, config.controls.makerChecker, config.controls.mandatoryBillAttachment];
    return values.filter(Boolean).length;
  }, [config]);

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    const timestamp = new Date().toLocaleString("en-IN");
    localStorage.setItem(`${STORAGE_KEY}:saved-at`, timestamp);
    setSavedAt(timestamp);
    toast.success("Accounting Master configuration saved");
  };

  const reset = () => {
    if (!window.confirm("Reset Accounting Master to the default configuration?")) return;
    setConfig(DEFAULT_CONFIG);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(`${STORAGE_KEY}:saved-at`);
    setSavedAt("");
    toast.success("Accounting Master reset to defaults");
  };

  const updateNumbering = (id: string, patch: Partial<NumberingRule>) => setConfig((current) => ({ ...current, numbering: current.numbering.map((rule) => rule.id === id ? { ...rule, ...patch } : rule) }));
  const updateApprovalRule = (id: string, patch: Partial<ApprovalRule>) => setConfig((current) => ({ ...current, controls: { ...current.controls, approvalRules: current.controls.approvalRules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule) } }));
  const addDimension = (key: "departments" | "costCentres" | "projects" | "sites", code: string, name: string) => {
    const exists = config.costing[key].some((item) => item.code.toLowerCase() === code.toLowerCase() || item.name.toLowerCase() === name.toLowerCase());
    if (exists) return toast.error(`${name} is already configured`);
    setConfig((current) => ({ ...current, costing: { ...current.costing, [key]: [...current.costing[key], { id: `${key}-${Date.now()}`, code, name }] } }));
  };
  const deleteDimension = (key: "departments" | "costCentres" | "projects" | "sites", id: string) => setConfig((current) => ({ ...current, costing: { ...current.costing, [key]: current.costing[key].filter((item) => item.id !== id) } }));

  return (
    <div className="min-h-full bg-[#f6f8fa] px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0d473f] text-white shadow-[0_12px_30px_rgba(13,71,63,0.18)]"><Settings2 className="h-6 w-6" /></span><div><p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#18765f]">Finance & Accounts</p><h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-slate-950">Accounting Master</h1><p className="mt-1.5 max-w-3xl text-sm font-medium leading-6 text-slate-500">Configure common accounting rules and defaults used across every Finance & Accounts page.</p></div></div>
          <div className="flex flex-wrap gap-3"><button type="button" onClick={reset} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 hover:bg-slate-50"><RotateCcw className="h-4 w-4" /> Reset Defaults</button><button type="button" onClick={save} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(13,92,77,0.18)] hover:bg-[#0a4b3f]"><Save className="h-4 w-4" /> Save Configuration</button></div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold text-slate-400">Active Financial Year</p><p className="mt-2 text-xl font-bold text-slate-900">{config.organisation.activeFinancialYear}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold text-slate-400">Configured Number Series</p><p className="mt-2 text-xl font-bold text-slate-900">{config.numbering.length}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold text-slate-400">Core Controls Enabled</p><div className="mt-2 flex items-center gap-2"><p className="text-xl font-bold text-slate-900">{configuredControls} / 7</p>{savedAt && <span className="ml-auto text-[10px] font-semibold text-slate-400">Saved {savedAt}</span>}</div></div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm"><div className="flex min-w-max gap-1">{tabs.map(({ label, icon: Icon }) => <button key={label} type="button" onClick={() => setActiveTab(label)} className={cn("inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition", activeTab === label ? "bg-[#0d5c4d] text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800")}><Icon className="h-4 w-4" /> {label}</button>)}</div></div>

        {activeTab === "Organisation" && <div className="grid gap-5 xl:grid-cols-2"><Section icon={Building2} title="Organisation & Books" description="Base settings inherited by vouchers, bills, payments and reports."><div className="grid gap-5 sm:grid-cols-2"><label className={cn(labelClass, "sm:col-span-2")}>Legal Entity<input className={inputClass} value={config.organisation.legalEntity} onChange={(event) => setConfig({ ...config, organisation: { ...config.organisation, legalEntity: event.target.value } })} /></label><label className={labelClass}>Base Currency<select className={inputClass} value={config.organisation.baseCurrency} onChange={(event) => setConfig({ ...config, organisation: { ...config.organisation, baseCurrency: event.target.value } })}>{["INR", "USD", "EUR", "GBP"].map((item) => <option key={item}>{item}</option>)}</select></label><label className={labelClass}>Accounting Method<select className={inputClass} value={config.organisation.accountingMethod} onChange={(event) => setConfig({ ...config, organisation: { ...config.organisation, accountingMethod: event.target.value } })}><option>Accrual</option><option>Cash</option></select></label><label className={labelClass}>Date Format<select className={inputClass} value={config.organisation.dateFormat} onChange={(event) => setConfig({ ...config, organisation: { ...config.organisation, dateFormat: event.target.value } })}><option>DD/MM/YYYY</option><option>DD-MM-YYYY</option><option>YYYY-MM-DD</option></select></label><label className={labelClass}>Timezone<input readOnly className={cn(inputClass, "bg-slate-50")} value={config.organisation.timezone} /></label></div></Section><Section icon={CalendarDays} title="Financial Year" description="Controls the active accounting period and year-based numbering."><div className="grid gap-5 sm:grid-cols-2"><label className={labelClass}>Active Financial Year<input className={inputClass} value={config.organisation.activeFinancialYear} onChange={(event) => setConfig({ ...config, organisation: { ...config.organisation, activeFinancialYear: event.target.value } })} placeholder="2026-27" /></label><label className={labelClass}>Start Month<select className={inputClass} value={config.organisation.financialYearStartMonth} onChange={(event) => setConfig({ ...config, organisation: { ...config.organisation, financialYearStartMonth: event.target.value } })}>{["January", "April", "July", "October"].map((item) => <option key={item}>{item}</option>)}</select></label><label className={cn(labelClass, "sm:col-span-2")}>Books Start Date<input type="date" className={inputClass} value={config.organisation.booksStartDate} onChange={(event) => setConfig({ ...config, organisation: { ...config.organisation, booksStartDate: event.target.value } })} /></label></div></Section></div>}

        {activeTab === "Numbering" && <Section icon={FileKey} title="Document Numbering" description="Set prefixes, sequence length and reset rules for every accounting document."><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left"><thead className="bg-[#0d473f] text-[11px] uppercase tracking-[0.1em] text-white"><tr><th className="px-4 py-3">Document</th><th className="px-4 py-3">Prefix</th><th className="px-4 py-3">Digits</th><th className="px-4 py-3">Reset Cycle</th><th className="px-4 py-3">Next Number</th><th className="px-4 py-3">Preview</th></tr></thead><tbody className="divide-y divide-slate-100">{config.numbering.map((rule) => <tr key={rule.id}><td className="px-4 py-3 text-sm font-bold text-slate-800">{rule.document}</td><td className="p-2"><input className={inputClass} value={rule.prefix} onChange={(event) => updateNumbering(rule.id, { prefix: event.target.value })} /></td><td className="p-2"><input type="number" min="3" max="10" className={inputClass} value={rule.digits} onChange={(event) => updateNumbering(rule.id, { digits: Number(event.target.value) })} /></td><td className="p-2"><select className={inputClass} value={rule.reset} onChange={(event) => updateNumbering(rule.id, { reset: event.target.value as NumberingRule["reset"] })}>{["Financial Year", "Calendar Year", "Never"].map((item) => <option key={item}>{item}</option>)}</select></td><td className="p-2"><input type="number" min="1" className={inputClass} value={rule.nextNumber} onChange={(event) => updateNumbering(rule.id, { nextNumber: Number(event.target.value) })} /></td><td className="px-4 py-3 font-mono text-xs font-bold text-[#0d5c4d]">{rule.prefix.replace("{FY}", config.organisation.activeFinancialYear)}{String(rule.nextNumber).padStart(rule.digits, "0")}</td></tr>)}</tbody></table></div></Section>}

        {activeTab === "Tax & TDS" && <div className="grid gap-5 xl:grid-cols-2"><Section icon={Receipt} title="GST Configuration" description="Controls GST registration and invoice tax treatment."><div className="space-y-4"><Toggle checked={config.tax.gstEnabled} onChange={(value) => setConfig({ ...config, tax: { ...config.tax, gstEnabled: value } })} label="Enable GST" description="Apply GST controls to bills, vouchers and reports." /><div className="grid gap-5 sm:grid-cols-2"><label className={labelClass}>Company GSTIN<input className={inputClass} value={config.tax.companyGstin} onChange={(event) => setConfig({ ...config, tax: { ...config.tax, companyGstin: event.target.value.toUpperCase() } })} /></label><label className={labelClass}>Registration State<input className={inputClass} value={config.tax.registrationState} onChange={(event) => setConfig({ ...config, tax: { ...config.tax, registrationState: event.target.value } })} /></label><label className={cn(labelClass, "sm:col-span-2")}>Default Tax Treatment<select className={inputClass} value={config.tax.defaultTaxTreatment} onChange={(event) => setConfig({ ...config, tax: { ...config.tax, defaultTaxTreatment: event.target.value } })}><option>Auto — based on Place of Supply</option><option>CGST + SGST</option><option>IGST</option><option>Exempt / Nil Rated</option></select></label></div></div></Section><Section icon={CircleDollarSign} title="TDS Controls" description="Default withholding controls used during bill passing and payment."><div className="space-y-4"><Toggle checked={config.tax.tdsEnabled} onChange={(value) => setConfig({ ...config, tax: { ...config.tax, tdsEnabled: value } })} label="Enable TDS" description="Allow TDS applicability and deduction during bill passing." /><div className="grid gap-5 sm:grid-cols-2"><label className={labelClass}>Default TDS Rate (%)<input type="number" min="0" step="0.01" className={inputClass} value={config.tax.defaultTdsRate} onChange={(event) => setConfig({ ...config, tax: { ...config.tax, defaultTdsRate: Number(event.target.value) } })} /></label><label className={labelClass}>Rounding<select className={inputClass} value={config.tax.tdsRounding} onChange={(event) => setConfig({ ...config, tax: { ...config.tax, tdsRounding: event.target.value } })}><option>Nearest Rupee</option><option>Two Decimals</option><option>Round Down</option></select></label><label className={cn(labelClass, "sm:col-span-2")}>Tax Calculation Basis<select className={inputClass} value={config.tax.taxCalculationBasis} onChange={(event) => setConfig({ ...config, tax: { ...config.tax, taxCalculationBasis: event.target.value } })}><option>Line Item</option><option>Invoice Total</option></select></label></div></div></Section></div>}

        {activeTab === "Payments & Banking" && <div className="grid gap-5 xl:grid-cols-2"><Section icon={WalletCards} title="Payment Defaults" description="Defaults used by requests, advances, payments and receipts."><div className="space-y-4"><label className={labelClass}>Default Credit Days<input type="number" min="0" className={inputClass} value={config.payments.defaultCreditDays} onChange={(event) => setConfig({ ...config, payments: { ...config.payments, defaultCreditDays: Number(event.target.value) } })} /></label><Toggle checked={config.payments.paymentApprovalRequired} onChange={(value) => setConfig({ ...config, payments: { ...config.payments, paymentApprovalRequired: value } })} label="Payment Approval Required" description="Route every payment through the approval matrix." /><Toggle checked={config.payments.allowPartPayments} onChange={(value) => setConfig({ ...config, payments: { ...config.payments, allowPartPayments: value } })} label="Allow Part Payments" description="Permit partial settlement of passed bills." /><Toggle checked={config.payments.requirePaymentAllocation} onChange={(value) => setConfig({ ...config, payments: { ...config.payments, requirePaymentAllocation: value } })} label="Require Payment Allocation" description="Payments must be allocated against bills or advances." /></div></Section><Section icon={Landmark} title="Banking Defaults" description="Common bank and reconciliation controls."><div className="space-y-4"><label className={labelClass}>Default Bank Account<input className={inputClass} value={config.payments.defaultBankAccount} onChange={(event) => setConfig({ ...config, payments: { ...config.payments, defaultBankAccount: event.target.value } })} placeholder="Select after Bank Master setup" /></label><Toggle checked={config.payments.bankReconciliationRequired} onChange={(value) => setConfig({ ...config, payments: { ...config.payments, bankReconciliationRequired: value } })} label="Bank Reconciliation Required" description="Keep imported and book transactions unreconciled until matched." /><div><p className="mb-2 text-xs font-bold text-slate-600">Allowed Payment Modes</p><div className="flex flex-wrap gap-2">{config.payments.paymentModes.map((mode) => <span key={mode} className="rounded-full border border-[#cfe3dd] bg-[#f0f8f5] px-3 py-1.5 text-xs font-bold text-[#0d5c4d]">{mode}</span>)}</div></div></div></Section></div>}

        {activeTab === "Cost Allocation" && <div className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-2">
            <Section icon={CircleDollarSign} title="Mandatory Dimensions" description="Choose which costing dimensions must be captured on finance entries."><div className="space-y-3"><Toggle checked={config.costing.requireDepartment} onChange={(value) => setConfig({ ...config, costing: { ...config.costing, requireDepartment: value } })} label="Department" description="Require a department on accounting entries." /><Toggle checked={config.costing.requireCostCentre} onChange={(value) => setConfig({ ...config, costing: { ...config.costing, requireCostCentre: value } })} label="Cost Centre" description="Require a financial cost centre." /><Toggle checked={config.costing.requireProject} onChange={(value) => setConfig({ ...config, costing: { ...config.costing, requireProject: value } })} label="Project" description="Require a project for project-wise reporting." /><Toggle checked={config.costing.requireSiteLand} onChange={(value) => setConfig({ ...config, costing: { ...config.costing, requireSiteLand: value } })} label="Site / Land Parcel" description="Require a site, farm or land parcel allocation." /><Toggle checked={config.costing.requireBudgetHead} onChange={(value) => setConfig({ ...config, costing: { ...config.costing, requireBudgetHead: value } })} label="Budget Head" description="Require an approved budget or cost head." /></div></Section>
            <Section icon={BookOpen} title="Budget Controls" description="Set how commitments and actuals affect available budgets."><div className="space-y-4"><label className={labelClass}>Allocation Basis<select className={inputClass} value={config.costing.allocationBasis} onChange={(event) => setConfig({ ...config, costing: { ...config.costing, allocationBasis: event.target.value } })}><option>Line Item</option><option>Document Total</option><option>Percentage Split</option></select></label><Toggle checked={config.costing.preventBudgetOverrun} onChange={(value) => setConfig({ ...config, costing: { ...config.costing, preventBudgetOverrun: value } })} label="Prevent Budget Overrun" description="Block entries that exceed the available budget balance." /><div className="rounded-2xl border border-[#cfe3dd] bg-[#f0f8f5] p-4 text-xs leading-5 text-slate-600">These rules apply to Bills & Payables, Payments & Receipts, Vouchers, and Budget & Costing.</div></div></Section>
          </div>
          <Section icon={Building2} title="Accounting Dimensions" description="Create the Department, Cost Centre, Project and Site options used throughout Finance & Accounts.">
            <div className="grid gap-4 xl:grid-cols-2">
              <DimensionMasterCard title="Departments" singular="Department" items={config.costing.departments} onAdd={(code, name) => addDimension("departments", code, name)} onDelete={(id) => deleteDimension("departments", id)} />
              <DimensionMasterCard title="Cost Centres" singular="Cost Centre" items={config.costing.costCentres} onAdd={(code, name) => addDimension("costCentres", code, name)} onDelete={(id) => deleteDimension("costCentres", id)} />
              <DimensionMasterCard title="Projects" singular="Project" items={config.costing.projects} onAdd={(code, name) => addDimension("projects", code, name)} onDelete={(id) => deleteDimension("projects", id)} />
              <DimensionMasterCard title="Sites / Land Parcels" singular="Site" items={config.costing.sites} onAdd={(code, name) => addDimension("sites", code, name)} onDelete={(id) => deleteDimension("sites", id)} />
            </div>
          </Section>
        </div>}

        {activeTab === "Cost Centre" && <CostAccountingSetup mode="Cost Centre" projects={config.costing.projects} departments={config.costing.departments} legalEntity={config.organisation.legalEntity} />}

        {activeTab === "Cost Attribution" && <CostAccountingSetup mode="Cost Attribution" projects={config.costing.projects} legalEntity={config.organisation.legalEntity} />}

        {activeTab === "Organisation" && <ProjectMasterSetup projects={config.costing.projects} onChange={(projects) => setConfig((current) => ({ ...current, costing: { ...current.costing, projects } }))} />}

        {activeTab === "Workflow & Controls" && <div className="space-y-5"><div className="grid gap-5 xl:grid-cols-2"><Section icon={ShieldCheck} title="Approval & Posting Controls" description="Global safeguards across finance transactions."><div className="space-y-3"><Toggle checked={config.controls.makerChecker} onChange={(value) => setConfig({ ...config, controls: { ...config.controls, makerChecker: value } })} label="Maker–Checker" description="The creator cannot approve the same accounting entry." /><Toggle checked={config.controls.mandatoryBillAttachment} onChange={(value) => setConfig({ ...config, controls: { ...config.controls, mandatoryBillAttachment: value } })} label="Mandatory Bill Attachment" description="Bill Inward cannot be saved without an invoice PDF or image." /><Toggle checked={config.controls.mandatorySupportingDocuments} onChange={(value) => setConfig({ ...config, controls: { ...config.controls, mandatorySupportingDocuments: value } })} label="Mandatory Supporting Documents" description="Require GRN, WCC or other supporting evidence where applicable." /><Toggle checked={config.controls.autoPostApprovedVouchers} onChange={(value) => setConfig({ ...config, controls: { ...config.controls, autoPostApprovedVouchers: value } })} label="Auto-post Approved Vouchers" description="Post vouchers automatically after final approval." /></div></Section><Section icon={LockKeyhole} title="Period & Audit Controls" description="Restrict dates and retain a complete finance audit trail."><div className="space-y-4"><Toggle checked={config.controls.allowBackdatedEntries} onChange={(value) => setConfig({ ...config, controls: { ...config.controls, allowBackdatedEntries: value } })} label="Allow Backdated Entries" description="Allow authorised users to enter prior-period documents." /><label className={labelClass}>Period Lock Date<input type="date" className={inputClass} value={config.controls.periodLockDate} onChange={(event) => setConfig({ ...config, controls: { ...config.controls, periodLockDate: event.target.value } })} /></label><label className={labelClass}>Audit Log Retention (Years)<input type="number" min="1" className={inputClass} value={config.controls.auditLogRetentionYears} onChange={(event) => setConfig({ ...config, controls: { ...config.controls, auditLogRetentionYears: Number(event.target.value) } })} /></label></div></Section></div><Section icon={Check} title="Approval Matrix" description="Define approval depth by transaction type and value range."><div className="overflow-x-auto"><table className="w-full min-w-[850px]"><thead className="bg-[#0d473f] text-left text-[11px] uppercase tracking-[0.1em] text-white"><tr><th className="px-4 py-3">Transaction</th><th className="px-4 py-3">From Amount</th><th className="px-4 py-3">To Amount</th><th className="px-4 py-3">Approval Levels</th><th className="w-14" /></tr></thead><tbody className="divide-y divide-slate-100">{config.controls.approvalRules.map((rule) => <tr key={rule.id}><td className="p-2"><select className={inputClass} value={rule.transaction} onChange={(event) => updateApprovalRule(rule.id, { transaction: event.target.value })}>{["Bill Verification", "Bill Passing", "Payment Request", "Vendor Payment", "Journal Voucher", "Bank Voucher"].map((item) => <option key={item}>{item}</option>)}</select></td><td className="p-2"><input type="number" min="0" className={inputClass} value={rule.fromAmount} onChange={(event) => updateApprovalRule(rule.id, { fromAmount: Number(event.target.value) })} /></td><td className="p-2"><input type="number" min="0" className={inputClass} value={rule.toAmount} onChange={(event) => updateApprovalRule(rule.id, { toAmount: Number(event.target.value) })} /></td><td className="p-2"><input type="number" min="1" max="10" className={inputClass} value={rule.levels} onChange={(event) => updateApprovalRule(rule.id, { levels: Number(event.target.value) })} /></td><td className="p-2"><button type="button" onClick={() => setConfig((current) => ({ ...current, controls: { ...current.controls, approvalRules: current.controls.approvalRules.filter((item) => item.id !== rule.id) } }))} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div><button type="button" onClick={() => setConfig((current) => ({ ...current, controls: { ...current.controls, approvalRules: [...current.controls.approvalRules, { id: `rule-${Date.now()}`, transaction: "Bill Passing", fromAmount: 0, toAmount: 0, levels: 1 }] } }))} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-[#b8d6ce] px-4 text-sm font-bold text-[#0d5c4d] hover:bg-[#edf5f2]"><Plus className="h-4 w-4" /> Add Approval Rule</button></Section></div>}

      </div>
    </div>
  );
}
