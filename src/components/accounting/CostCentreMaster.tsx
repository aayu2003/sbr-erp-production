import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Ban,
  Building2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  Eye,
  GitBranch,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

type CentreStatus = "Active" | "Inactive" | "Blocked";
type CentreNature = "Parent / Group" | "Posting Cost Centre";
type MasterOption = { id: string; label: string; ownerName?: string };

type CostCentre = {
  id: string;
  code: string;
  name: string;
  nature: CentreNature;
  type: string;
  parent: string;
  linkedEntityType: string;
  linkedEntityId: string;
  linkedEntityName: string;
  owner: string;
  approver: string;
  effectiveFrom: string;
  effectiveTo: string;
  status: CentreStatus;
  description: string;
  directPosting: boolean;
  budgetApplicable: boolean;
  budgetControl: string;
  allocationEligible: boolean;
  manualCodeOverride: boolean;
  hasTransactions: boolean;
  createdBy: string;
  createdOn: string;
  modifiedBy: string;
  modifiedOn: string;
};

const STORAGE_KEY = "sbr-cost-centre-master-v2";
const ROOT_NAME = "Sai Bioresources Pvt. Ltd.";
const TYPES = ["Company Root", "Business Vertical", "Function", "Department", "Project", "Crop / Programme", "Cluster", "Location", "Operational", "Storage", "Logistics", "Shared Cost", "Other"];
const LINK_TYPES = ["None", "Department", "Project", "Crop / Programme", "Location", "Cluster", "Storage Site", "Business Unit"];
const BUDGET_CONTROLS = ["Tracking Only", "Warning on Exceeding Budget", "Hard Stop on Exceeding Budget"];
const inputClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10";
const labelClass = "space-y-1.5 text-xs font-bold text-slate-600";

const seedRows: Array<[string, string, string, string, CentreNature]> = [
  ["CC-SBR-001", ROOT_NAME, "", "Company Root", "Parent / Group"],
  ["CC-CORP-001", "Corporate & Administration", ROOT_NAME, "Business Vertical", "Parent / Group"],
  ["CC-CORP-MGT-001", "Management / Directors Office", "Corporate & Administration", "Function", "Posting Cost Centre"],
  ["CC-CORP-FIN-001", "Finance & Accounts", "Corporate & Administration", "Department", "Posting Cost Centre"],
  ["CC-CORP-HR-001", "HR & Administration", "Corporate & Administration", "Department", "Posting Cost Centre"],
  ["CC-CORP-LGL-001", "Legal & Compliance", "Corporate & Administration", "Department", "Posting Cost Centre"],
  ["CC-CORP-IT-001", "IT & ERP", "Corporate & Administration", "Department", "Posting Cost Centre"],
  ["CC-CORP-OFC-001", "Corporate Office Expenses", "Corporate & Administration", "Operational", "Posting Cost Centre"],
  ["CC-AGR-001", "Agriculture Operations", ROOT_NAME, "Business Vertical", "Parent / Group"],
  ["CC-NAP-001", "Napier Cultivation", "Agriculture Operations", "Crop / Programme", "Parent / Group"],
  ["CC-NAP-DUR-001", "Napier Durg", "Napier Cultivation", "Cluster", "Parent / Group"],
  ["CC-NAP-DUR-FRM", "Durg Farm Operations", "Napier Durg", "Operational", "Posting Cost Centre"],
  ["CC-NAP-DUR-IRR", "Durg Irrigation Operations", "Napier Durg", "Operational", "Posting Cost Centre"],
  ["CC-NAP-DUR-HRV", "Durg Harvesting Operations", "Napier Durg", "Operational", "Posting Cost Centre"],
  ["CC-NAP-KHG-001", "Napier Khairagarh", "Napier Cultivation", "Cluster", "Parent / Group"],
  ["CC-NAP-KHG-FRM", "Khairagarh Farm Operations", "Napier Khairagarh", "Operational", "Posting Cost Centre"],
  ["CC-NAP-KHG-IRR", "Khairagarh Irrigation Operations", "Napier Khairagarh", "Operational", "Posting Cost Centre"],
  ["CC-NAP-KHG-HRV", "Khairagarh Harvesting Operations", "Napier Khairagarh", "Operational", "Posting Cost Centre"],
  ["CC-CRP-001", "Seasonal Crop Operations", "Agriculture Operations", "Crop / Programme", "Parent / Group"],
  ["CC-PDY-DUR-001", "Paddy Cultivation - Durg", "Seasonal Crop Operations", "Crop / Programme", "Posting Cost Centre"],
  ["CC-PDY-KHG-001", "Paddy Cultivation - Khairagarh", "Seasonal Crop Operations", "Crop / Programme", "Posting Cost Centre"],
  ["CC-RHR-DUR-001", "Rahar Cultivation - Durg", "Seasonal Crop Operations", "Crop / Programme", "Posting Cost Centre"],
  ["CC-RHR-KHG-001", "Rahar Cultivation - Khairagarh", "Seasonal Crop Operations", "Crop / Programme", "Posting Cost Centre"],
  ["CC-PSP-001", "Paddy Straw Procurement", ROOT_NAME, "Business Vertical", "Parent / Group"],
  ["CC-PSP-DUR-001", "Durg Paddy Straw Procurement", "Paddy Straw Procurement", "Location", "Posting Cost Centre"],
  ["CC-PSP-KHG-001", "Khairagarh Paddy Straw Procurement", "Paddy Straw Procurement", "Location", "Posting Cost Centre"],
  ["CC-PSP-BMT-001", "Bemetara Paddy Straw Procurement", "Paddy Straw Procurement", "Location", "Posting Cost Centre"],
  ["CC-PSP-RPR-001", "Raipur Paddy Straw Procurement", "Paddy Straw Procurement", "Location", "Posting Cost Centre"],
  ["CC-PSP-OTH-001", "Other Paddy Straw Procurement Locations", "Paddy Straw Procurement", "Location", "Posting Cost Centre"],
  ["CC-BIO-AGG-001", "Biomass Collection & Aggregation", ROOT_NAME, "Business Vertical", "Parent / Group"],
  ["CC-BIO-COL-001", "Collection Operations", "Biomass Collection & Aggregation", "Operational", "Posting Cost Centre"],
  ["CC-BIO-BAL-001", "Baling Operations", "Biomass Collection & Aggregation", "Operational", "Posting Cost Centre"],
  ["CC-BIO-LDU-001", "Loading & Unloading", "Biomass Collection & Aggregation", "Operational", "Posting Cost Centre"],
  ["CC-BIO-AGG-002", "Aggregation Operations", "Biomass Collection & Aggregation", "Operational", "Posting Cost Centre"],
  ["CC-BIO-STO-001", "Biomass Storage", ROOT_NAME, "Storage", "Parent / Group"],
  ["CC-STO-PS-001", "Paddy Straw Storage", "Biomass Storage", "Storage", "Posting Cost Centre"],
  ["CC-STO-NAP-001", "Napier / Silage Storage", "Biomass Storage", "Storage", "Posting Cost Centre"],
  ["CC-STO-COM-001", "Common Storage Operations", "Biomass Storage", "Storage", "Posting Cost Centre"],
  ["CC-LOG-001", "Logistics & Transportation", ROOT_NAME, "Logistics", "Parent / Group"],
  ["CC-LOG-FDS-001", "Feedstock Transportation", "Logistics & Transportation", "Logistics", "Posting Cost Centre"],
  ["CC-LOG-FRM-001", "Farm Logistics", "Logistics & Transportation", "Logistics", "Posting Cost Centre"],
  ["CC-LOG-INT-001", "Internal Material Movement", "Logistics & Transportation", "Logistics", "Posting Cost Centre"],
  ["CC-PRC-001", "Procurement & Supply Chain", ROOT_NAME, "Business Vertical", "Parent / Group"],
  ["CC-PRC-BUY-001", "Central Procurement", "Procurement & Supply Chain", "Department", "Posting Cost Centre"],
  ["CC-PRC-STR-001", "Stores & Inventory", "Procurement & Supply Chain", "Department", "Posting Cost Centre"],
  ["CC-PRC-VEN-001", "Vendor Coordination", "Procurement & Supply Chain", "Department", "Posting Cost Centre"],
  ["CC-ENG-001", "Engineering & Infrastructure", ROOT_NAME, "Business Vertical", "Parent / Group"],
  ["CC-ENG-IRR-001", "Irrigation Infrastructure", "Engineering & Infrastructure", "Operational", "Posting Cost Centre"],
  ["CC-ENG-BRW-001", "Borewell Development", "Engineering & Infrastructure", "Operational", "Posting Cost Centre"],
  ["CC-ENG-FEN-001", "Fencing Infrastructure", "Engineering & Infrastructure", "Operational", "Posting Cost Centre"],
  ["CC-ENG-ELE-001", "Electrical Infrastructure", "Engineering & Infrastructure", "Operational", "Posting Cost Centre"],
  ["CC-MNT-001", "Equipment & Maintenance", ROOT_NAME, "Business Vertical", "Parent / Group"],
  ["CC-MNT-FRM-001", "Farm Equipment Maintenance", "Equipment & Maintenance", "Operational", "Posting Cost Centre"],
  ["CC-MNT-HRV-001", "Harvesting Equipment Maintenance", "Equipment & Maintenance", "Operational", "Posting Cost Centre"],
  ["CC-MNT-VEH-001", "Vehicle Maintenance", "Equipment & Maintenance", "Operational", "Posting Cost Centre"],
  ["CC-LND-001", "Land Management", ROOT_NAME, "Business Vertical", "Parent / Group"],
  ["CC-LND-LSE-001", "Land Leasing & Commercial", "Land Management", "Function", "Posting Cost Centre"],
  ["CC-LND-DOC-001", "Land Documentation", "Land Management", "Function", "Posting Cost Centre"],
  ["CC-LND-REL-001", "Landowner Relations", "Land Management", "Function", "Posting Cost Centre"],
  ["CC-COM-001", "Common & Shared Costs", ROOT_NAME, "Shared Cost", "Parent / Group"],
  ["CC-COM-OPS-001", "Common Operations", "Common & Shared Costs", "Shared Cost", "Posting Cost Centre"],
  ["CC-COM-ADM-001", "Common Administration", "Common & Shared Costs", "Shared Cost", "Posting Cost Centre"],
  ["CC-COM-UTL-001", "Common Utilities", "Common & Shared Costs", "Shared Cost", "Posting Cost Centre"],
  ["CC-COM-TRV-001", "Common Travel & Conveyance", "Common & Shared Costs", "Shared Cost", "Posting Cost Centre"],
];

const today = () => new Date().toISOString().slice(0, 10);
const nowText = () => new Date().toLocaleString("en-IN");

const seededCentres: CostCentre[] = seedRows.map(([code, name, parent, type, nature], index) => ({
  id: `seed-${index + 1}`,
  code,
  name,
  nature,
  type,
  parent,
  linkedEntityType: "None",
  linkedEntityId: "",
  linkedEntityName: "",
  owner: "",
  approver: "",
  effectiveFrom: "2026-04-01",
  effectiveTo: "",
  status: "Active",
  description: `${name} cost centre`,
  directPosting: nature === "Posting Cost Centre",
  budgetApplicable: ["Business Vertical", "Crop / Programme", "Cluster", "Operational", "Logistics", "Storage", "Shared Cost"].includes(type),
  budgetControl: "Tracking Only",
  allocationEligible: nature === "Posting Cost Centre",
  manualCodeOverride: false,
  hasTransactions: false,
  createdBy: "System Seed",
  createdOn: "01/04/2026, 09:00",
  modifiedBy: "System Seed",
  modifiedOn: "01/04/2026, 09:00",
}));

const loadCentres = (): CostCentre[] => {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    const saved = JSON.parse(current || "[]") as CostCentre[];
    if (!current) {
      const legacy = JSON.parse(localStorage.getItem("sbr-cost-accounting-centres-v1") || "[]") as Array<Record<string, unknown>>;
      if (Array.isArray(legacy)) legacy.forEach((row, index) => saved.push({
        ...blankCentre(seededCentres),
        id: String(row.id || `legacy-${index + 1}`),
        code: String(row.code || generateCode(String(row.type || "Other"), String(row.department || ""), seededCentres)),
        name: String(row.name || "Legacy Cost Centre"),
        nature: row.directPosting === false ? "Parent / Group" : "Posting Cost Centre",
        type: String(row.type || "Other"),
        parent: String(row.parent || ""),
        linkedEntityType: row.department ? "Department" : "None",
        linkedEntityName: String(row.linkedEntityName || row.department || ""),
        owner: String(row.head || ""),
        approver: String(row.secondary || ""),
        effectiveFrom: String(row.effectiveFrom || today()),
        effectiveTo: String(row.effectiveTo || ""),
        status: row.status === "Suspended" ? "Blocked" : (String(row.status || "Active") as CentreStatus),
        description: String(row.description || ""),
        directPosting: row.directPosting !== false,
        budgetApplicable: Boolean(row.budgetApplicable),
        budgetControl: row.budgetControl === "Warning Only" ? "Warning on Exceeding Budget" : row.budgetControl === "Hard Limit" ? "Hard Stop on Exceeding Budget" : String(row.budgetControl || "Tracking Only"),
        allocationEligible: row.directPosting !== false,
        manualCodeOverride: Boolean(row.manualCodeOverride),
        createdBy: "Legacy Import",
        createdOn: nowText(),
        modifiedBy: "Legacy Import",
        modifiedOn: nowText(),
      }));
    }
    if (!Array.isArray(saved) || !saved.length) return seededCentres;
    const merged = new Map(seededCentres.map((centre) => [centre.id, centre]));
    saved.forEach((centre) => merged.set(centre.id, { ...centre, status: centre.status === ("Suspended" as CentreStatus) ? "Blocked" : centre.status }));
    return Array.from(merged.values());
  } catch {
    return seededCentres;
  }
};

const typeCode = (type: string) => ({
  "Company Root": "SBR",
  "Business Vertical": "BIZ",
  Function: "FUN",
  Department: "DEP",
  Project: "PRJ",
  "Crop / Programme": "CRP",
  Cluster: "CLU",
  Location: "LOC",
  Operational: "OPS",
  Storage: "STO",
  Logistics: "LOG",
  "Shared Cost": "COM",
  Other: "OTH",
}[type] || "GEN");

const generateCode = (type: string, entity: string, centres: CostCentre[]) => {
  const token = (entity || typeCode(type)).replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "GEN";
  const prefix = `CC-${token}-`;
  const used = centres.map((centre) => centre.code).filter((code) => code.startsWith(prefix)).map((code) => Number(code.slice(prefix.length))).filter(Number.isFinite);
  return `${prefix}${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`;
};

const blankCentre = (centres: CostCentre[], parent = ""): CostCentre => ({
  id: `cc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  code: generateCode("Operational", "", centres),
  name: "",
  nature: "Posting Cost Centre",
  type: "Operational",
  parent,
  linkedEntityType: "None",
  linkedEntityId: "",
  linkedEntityName: "",
  owner: "",
  approver: "",
  effectiveFrom: today(),
  effectiveTo: "",
  status: "Active",
  description: "",
  directPosting: true,
  budgetApplicable: false,
  budgetControl: "Tracking Only",
  allocationEligible: true,
  manualCodeOverride: false,
  hasTransactions: false,
  createdBy: "",
  createdOn: "",
  modifiedBy: "",
  modifiedOn: "",
});

const descendantsOf = (name: string, centres: CostCentre[]) => {
  const result = new Set<string>();
  const visit = (parent: string) => centres.filter((centre) => centre.parent === parent).forEach((child) => { if (!result.has(child.name)) { result.add(child.name); visit(child.name); } });
  visit(name);
  return result;
};

const hierarchyNames = (parent: string, centres: CostCentre[]) => {
  const names: string[] = [];
  const seen = new Set<string>();
  let cursor = parent;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    names.unshift(cursor);
    cursor = centres.find((centre) => centre.name === cursor)?.parent || "";
  }
  return names;
};

function StatusBadge({ status }: { status: CentreStatus }) {
  return <span className={cn("inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold", status === "Active" ? "bg-emerald-50 text-emerald-700" : status === "Blocked" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500")}>{status}</span>;
}

function NatureBadge({ nature }: { nature: CentreNature }) {
  return <span className={cn("inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold", nature === "Posting Cost Centre" ? "bg-blue-50 text-blue-700" : "bg-[#edf6f3] text-[#0d5c4d]")}>{nature === "Posting Cost Centre" ? "Posting" : "Parent"}</span>;
}

function ToggleRow({ checked, onChange, title, helper }: { checked: boolean; onChange: (value: boolean) => void; title: string; helper?: string }) {
  return <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left"><span><span className="block text-sm font-bold text-slate-700">{title}</span>{helper && <span className="mt-0.5 block text-[11px] font-medium text-slate-400">{helper}</span>}</span><span className={cn("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-[#0d5c4d]" : "bg-slate-200")}><span className={cn("absolute top-1 h-4 w-4 rounded-full bg-white transition", checked ? "left-6" : "left-1")} /></span></button>;
}

function ModalFrame({ title, children, footer, onClose }: { title: string; children: ReactNode; footer: ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-0 sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="flex h-full w-full flex-col overflow-hidden bg-[#f7f9fa] shadow-2xl sm:h-auto sm:max-h-[94vh] sm:max-w-[1180px] sm:rounded-3xl"><header className="flex shrink-0 items-start justify-between bg-[#0d473f] px-5 py-4 text-white sm:px-6"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/60">Cost Accounting • Cost Centre</p><h2 className="mt-1 text-xl font-bold">{title}</h2></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/10"><X className="h-5 w-5" /></button></header><div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div><footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">{footer}</footer></div></div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><h3 className="mb-4 text-xs font-extrabold uppercase tracking-[0.14em] text-[#0d5c4d]">{title}</h3><div className="grid gap-4 sm:grid-cols-2">{children}</div></section>;
}

function ParentPicker({ value, current, centres, onChange, onCreate }: { value: string; current?: CostCentre; centres: CostCentre[]; onChange: (value: string) => void; onCreate: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const invalid = current ? descendantsOf(current.name, centres) : new Set<string>();
  const depth = (centre: CostCentre) => hierarchyNames(centre.parent, centres).length;
  const options = centres.filter((centre) => centre.id !== current?.id && !invalid.has(centre.name) && `${centre.code} ${centre.name}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => hierarchyNames(a.parent, centres).join("/").localeCompare(hierarchyNames(b.parent, centres).join("/")) || a.name.localeCompare(b.name));
  return <div className="relative"><button type="button" onClick={() => setOpen((shown) => !shown)} className={cn(inputClass, "flex items-center justify-between text-left")}><span className={cn(!value && "text-slate-400")}>{value || "Top Level / No Parent"}</span><ChevronDown className="h-4 w-4" /></button>{open && <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="border-b border-slate-100 p-2"><label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input autoFocus className={cn(inputClass, "pl-9")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cost centre..." /></label></div><div className="max-h-64 overflow-y-auto p-1"><button type="button" onClick={() => { onChange(""); setOpen(false); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-600 hover:bg-slate-50"><span>Top Level / No Parent</span><NatureBadge nature="Parent / Group" /></button>{options.map((centre) => <button type="button" key={centre.id} onClick={() => { onChange(centre.name); setOpen(false); }} className={cn("flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-[#eef7f4]", centre.status === "Inactive" && "opacity-50")}><span className="min-w-0" style={{ paddingLeft: `${Math.min(depth(centre), 5) * 14}px` }}><span className="block truncate text-sm font-bold text-slate-700">{centre.name}</span><span className="font-mono text-[10px] text-slate-400">{centre.code}</span></span><span className="flex items-center gap-1">{centre.status === "Blocked" && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}<NatureBadge nature={centre.nature} /></span></button>)}</div><button type="button" onClick={() => { setOpen(false); onCreate(); }} className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-3 text-sm font-bold text-[#0d5c4d] hover:bg-[#eef7f4]"><Plus className="h-4 w-4" />Create New Parent Cost Centre</button></div>}</div>;
}

function InlineParentModal({ centres, initialParent, onCancel, onCreate }: { centres: CostCentre[]; initialParent: string; onCancel: () => void; onCreate: (centre: CostCentre) => void }) {
  const [form, setForm] = useState(() => ({ ...blankCentre(centres, initialParent), nature: "Parent / Group" as CentreNature, type: "Function", directPosting: false, allocationEligible: false }));
  const [error, setError] = useState("");
  const submit = () => {
    if (!form.name.trim()) return setError("Cost Centre Name is required");
    if (centres.some((centre) => centre.code.toLowerCase() === form.code.trim().toLowerCase())) return setError("Cost Centre Code already exists");
    if (centres.some((centre) => centre.parent === form.parent && centre.name.toLowerCase() === form.name.trim().toLowerCase())) return setError("A Cost Centre with this name already exists under the selected parent");
    onCreate({ ...form, name: form.name.trim(), createdBy: "SBR Admin", createdOn: nowText(), modifiedBy: "SBR Admin", modifiedOn: nowText() });
  };
  return <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/55 p-4"><div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-[#f7f9fa] shadow-2xl"><div className="flex items-center justify-between bg-[#0d473f] px-5 py-4 text-white"><h3 className="text-lg font-bold">Create Parent Cost Centre</h3><button onClick={onCancel}><X className="h-5 w-5" /></button></div><div className="grid gap-4 p-5 sm:grid-cols-2"><label className={labelClass}>Cost Centre Name *<input className={inputClass} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label><label className={labelClass}>Cost Centre Code<input className={cn(inputClass, "font-mono")} value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase(), manualCodeOverride: true }))} /></label><label className={labelClass}>Cost Centre Type *<select className={inputClass} value={form.type} onChange={(event) => { const type = event.target.value; setForm((current) => ({ ...current, type, code: current.manualCodeOverride ? current.code : generateCode(type, "", centres) })); }}>{TYPES.filter((type) => type !== "Company Root").map((type) => <option key={type}>{type}</option>)}</select></label><label className={labelClass}>Parent Cost Centre<select className={inputClass} value={form.parent} onChange={(event) => setForm((current) => ({ ...current, parent: event.target.value }))}><option value="">Top Level / No Parent</option>{centres.map((centre) => <option key={centre.id} value={centre.name}>{centre.name} · {centre.code}</option>)}</select></label><label className={cn(labelClass, "sm:col-span-2")}>Description<textarea rows={2} className="w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-[#278b76]" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>{error && <p className="sm:col-span-2 text-xs font-bold text-red-600">{error}</p>}</div><div className="flex justify-end gap-2 border-t border-slate-200 bg-white p-4"><button onClick={onCancel} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600">Cancel</button><button onClick={submit} className="h-10 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white">Create & Select</button></div></div></div>;
}

function CostCentreModal({ mode, item, initialParent, centres, departments, masterOptions, onClose, onSave, onCreateParent }: { mode: "add" | "edit"; item?: CostCentre; initialParent?: string; centres: CostCentre[]; departments: MasterOption[]; masterOptions: Record<string, MasterOption[]>; onClose: () => void; onSave: (centre: CostCentre, addAnother: boolean) => void; onCreateParent: (centre: CostCentre) => void }) {
  const { user } = useAuth();
  const isAdmin = /admin/i.test(`${user?.name || ""} ${user?.username || ""} ${user?.designation || ""}`);
  const actor = user?.name || user?.username || "Current User";
  const [form, setForm] = useState<CostCentre>(() => item ? { ...item } : blankCentre(centres, initialParent));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [parentModal, setParentModal] = useState(false);
  const update = <K extends keyof CostCentre>(key: K, value: CostCentre[K]) => setForm((current) => ({ ...current, [key]: value }));
  const employeeOptions = Array.from(new Set([actor, "SBR Admin", ...departments.map((department) => `${department.label} Head`), ...centres.flatMap((centre) => [centre.owner, centre.approver]).filter(Boolean)]));
  const linkedOptionsByType: Record<string, MasterOption[]> = {
    None: [],
    Department: departments,
    Project: masterOptions.Project || [],
    "Crop / Programme": masterOptions.Project || [],
    Location: [...(masterOptions.Zone || []), ...(masterOptions.Block || [])],
    Cluster: masterOptions.Cluster || [],
    "Storage Site": masterOptions.Block || [],
    "Business Unit": masterOptions.Corporate || [],
  };
  const linkedOptions = linkedOptionsByType[form.linkedEntityType] || [];
  const selectedParent = centres.find((centre) => centre.name === form.parent);
  const crumbs = [...hierarchyNames(form.parent, centres), form.name.trim() || "New Cost Centre"];
  const postingState = form.status === "Blocked" ? "Posting Blocked" : form.status === "Inactive" || !form.directPosting ? "Posting Restricted" : "Posting Allowed";
  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.code.trim()) next.code = "Cost Centre Code is required";
    else if (centres.some((centre) => centre.id !== form.id && centre.code.toLowerCase() === form.code.trim().toLowerCase())) next.code = "Cost Centre Code must be unique";
    if (!form.name.trim()) next.name = "Cost Centre Name is required";
    else if (centres.some((centre) => centre.id !== form.id && centre.parent === form.parent && centre.name.toLowerCase() === form.name.trim().toLowerCase())) next.name = "This name already exists under the selected parent";
    if (form.parent === form.name || descendantsOf(form.name, centres).has(form.parent)) next.parent = "This parent would create a circular hierarchy";
    if (!form.effectiveFrom) next.effectiveFrom = "Effective From is required";
    if (form.effectiveTo && form.effectiveTo < form.effectiveFrom) next.effectiveTo = "Effective To cannot be before Effective From";
    setErrors(next);
    return !Object.keys(next).length;
  };
  const save = (addAnother: boolean) => {
    if (!validate()) return;
    const stamp = nowText();
    onSave({ ...form, code: form.code.trim().toUpperCase(), name: form.name.trim(), owner: form.owner.trim(), approver: form.approver.trim(), createdBy: form.createdBy || actor, createdOn: form.createdOn || stamp, modifiedBy: actor, modifiedOn: stamp }, addAnother);
  };
  const footer = <div className="flex flex-wrap justify-end gap-2"><button onClick={onClose} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600">Cancel</button>{mode === "add" && <button onClick={() => save(true)} className="h-10 rounded-xl border border-[#9fc9be] px-4 text-sm font-bold text-[#0d5c4d]">Save & Add Another</button>}<button onClick={() => save(false)} className="h-10 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white">{mode === "add" ? "Save Cost Centre" : "Save Changes"}</button></div>;
  return <>
    <ModalFrame title={mode === "add" ? "Add Cost Centre" : "Edit Cost Centre"} onClose={onClose} footer={footer}>
      <Section title="Basic Details">
        <label className={labelClass}>Cost Centre Code *<input readOnly={!isAdmin || !form.manualCodeOverride} className={cn(inputClass, "font-mono text-[#0d5c4d]", (!isAdmin || !form.manualCodeOverride) && "bg-slate-50")} value={form.code} onChange={(event) => update("code", event.target.value.toUpperCase())} /><span className="text-[10px] font-medium text-slate-400">Format: CC-[TYPE/ENTITY]-[LOCATION]-[SEQUENCE]</span>{errors.code && <span className="block text-[11px] text-red-600">{errors.code}</span>}</label>
        <label className={labelClass}>Cost Centre Name *<input className={inputClass} value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Durg Farm Operations" />{errors.name && <span className="block text-[11px] text-red-600">{errors.name}</span>}</label>
        {isAdmin && <div className="sm:col-span-2"><ToggleRow checked={form.manualCodeOverride} onChange={(value) => setForm((current) => ({ ...current, manualCodeOverride: value, code: value ? current.code : generateCode(current.type, current.linkedEntityName, centres) }))} title="Manual Code Override" helper="Admin only" /></div>}
        <div className="sm:col-span-2"><p className="mb-1.5 text-xs font-bold text-slate-600">Cost Centre Nature *</p><div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-50 p-1">{(["Parent / Group", "Posting Cost Centre"] as CentreNature[]).map((nature) => <button type="button" key={nature} onClick={() => setForm((current) => ({ ...current, nature, directPosting: nature === "Posting Cost Centre", allocationEligible: nature === "Posting Cost Centre" }))} className={cn("rounded-lg px-3 py-2 text-xs font-bold transition", form.nature === nature ? "bg-[#0d5c4d] text-white shadow-sm" : "text-slate-500")}>{nature}</button>)}</div></div>
        <label className={labelClass}>Cost Centre Type *<select className={inputClass} value={form.type} onChange={(event) => { const type = event.target.value; const defaultNature: CentreNature = ["Company Root", "Business Vertical", "Project", "Crop / Programme", "Cluster"].includes(type) ? "Parent / Group" : "Posting Cost Centre"; setForm((current) => ({ ...current, type, nature: defaultNature, directPosting: defaultNature === "Posting Cost Centre", allocationEligible: defaultNature === "Posting Cost Centre", code: current.manualCodeOverride ? current.code : generateCode(type, current.linkedEntityName, centres) })); }}>{TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label className={labelClass}>Parent Cost Centre<ParentPicker value={form.parent} current={item} centres={centres} onChange={(parent) => update("parent", parent)} onCreate={() => setParentModal(true)} />{errors.parent && <span className="block text-[11px] text-red-600">{errors.parent}</span>}{selectedParent?.status === "Inactive" && <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600"><AlertTriangle className="h-3 w-3" />Selected parent is inactive.</span>}</label>
        <label className={labelClass}>Linked Entity Type<select className={inputClass} value={form.linkedEntityType} onChange={(event) => setForm((current) => ({ ...current, linkedEntityType: event.target.value, linkedEntityId: "", linkedEntityName: "" }))}>{LINK_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label className={labelClass}>Linked Entity <span className="font-medium text-slate-400">(Optional)</span>{form.linkedEntityType === "None" ? <input disabled className={cn(inputClass, "bg-slate-50 text-slate-400")} value="No linked entity" readOnly /> : linkedOptions.length ? <select className={inputClass} value={form.linkedEntityId} onChange={(event) => { const option = linkedOptions.find((entry) => entry.id === event.target.value); setForm((current) => ({ ...current, linkedEntityId: option?.id || "", linkedEntityName: option?.label || "", code: current.manualCodeOverride ? current.code : generateCode(current.type, option?.id || option?.label || "", centres) })); }}><option value="">Select {form.linkedEntityType.toLowerCase()}</option>{linkedOptions.map((option) => <option key={`${form.linkedEntityType}-${option.id}`} value={option.id}>{option.label} · {option.id}</option>)}</select> : <input className={inputClass} value={form.linkedEntityName} onChange={(event) => { const name = event.target.value; setForm((current) => ({ ...current, linkedEntityName: name, code: current.manualCodeOverride ? current.code : generateCode(current.type, name, centres) })); }} placeholder={`Optional ${form.linkedEntityType.toLowerCase()} reference`} />}</label>
        <div className="sm:col-span-2 rounded-xl border border-[#c9dfd9] bg-[#f0f7f5] px-4 py-3"><p className="text-[10px] font-extrabold uppercase tracking-wider text-[#278b76]">Hierarchy Preview</p><div className="mt-2 flex flex-wrap items-center gap-2">{crumbs.map((crumb, index) => <span key={`${crumb}-${index}`} className="flex items-center gap-2"><span className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-[#0d5c4d] ring-1 ring-[#d7e8e3]">{crumb}</span>{index < crumbs.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-[#6b9f92]" />}</span>)}</div></div>
        <label className={cn(labelClass, "sm:col-span-2")}>Description<textarea rows={2} className="w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-[#278b76]" value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Purpose and scope of this cost centre" /></label>
      </Section>
      <Section title="Ownership & Validity">
        <label className={labelClass}>Cost Centre Owner<select className={inputClass} value={form.owner} onChange={(event) => update("owner", event.target.value)}><option value="">Select owner</option>{employeeOptions.map((employee) => <option key={`owner-${employee}`}>{employee}</option>)}</select></label>
        <label className={labelClass}>Approving Authority <span className="font-medium text-slate-400">(Optional)</span><select className={inputClass} value={form.approver} onChange={(event) => update("approver", event.target.value)}><option value="">Select approving authority</option>{employeeOptions.map((employee) => <option key={`approver-${employee}`}>{employee}</option>)}</select></label>
        <label className={labelClass}>Effective From *<input type="date" className={inputClass} value={form.effectiveFrom} onChange={(event) => update("effectiveFrom", event.target.value)} />{errors.effectiveFrom && <span className="block text-[11px] text-red-600">{errors.effectiveFrom}</span>}</label>
        <label className={labelClass}>Effective To <span className="font-medium text-slate-400">(Optional)</span><input type="date" min={form.effectiveFrom} className={inputClass} value={form.effectiveTo} onChange={(event) => update("effectiveTo", event.target.value)} />{errors.effectiveTo && <span className="block text-[11px] text-red-600">{errors.effectiveTo}</span>}</label>
        <label className={labelClass}>Status<select className={inputClass} value={form.status} onChange={(event) => update("status", event.target.value as CentreStatus)}><option>Active</option><option>Inactive</option><option>Blocked</option></select><span className="text-[10px] font-medium text-slate-400">Blocked retains hierarchy but prohibits accounting posting.</span></label>
      </Section>
      <Section title="Accounting Controls">
        <ToggleRow checked={form.directPosting} onChange={(value) => update("directPosting", value)} title="Allow Direct Posting" helper="Allow accounting transactions to be tagged directly to this cost centre." />
        <ToggleRow checked={form.budgetApplicable} onChange={(value) => update("budgetApplicable", value)} title="Budget Applicable" helper="Budget amounts are maintained in the Budget module." />
        {form.budgetApplicable && <label className={labelClass}>Budget Control<select className={inputClass} value={form.budgetControl} onChange={(event) => update("budgetControl", event.target.value)}>{BUDGET_CONTROLS.map((control) => <option key={control}>{control}</option>)}</select></label>}
        <ToggleRow checked={form.allocationEligible} onChange={(value) => update("allocationEligible", value)} title="Allocation Eligible" helper="Allow shared/common costs to be allocated to this cost centre." />
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><span><span className="block text-sm font-bold text-slate-700">Status for Posting</span><span className="text-[11px] font-medium text-slate-400">Derived from master status and direct-posting control.</span></span><span className={cn("rounded-full px-3 py-1 text-[11px] font-extrabold", postingState === "Posting Allowed" ? "bg-emerald-100 text-emerald-700" : postingState === "Posting Blocked" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600")}>{postingState}</span></div>
      </Section>
    </ModalFrame>
    {parentModal && <InlineParentModal centres={centres} initialParent={form.parent} onCancel={() => setParentModal(false)} onCreate={(parent) => { onCreateParent(parent); setForm((current) => ({ ...current, parent: parent.name })); setParentModal(false); toast.success("Parent Cost Centre created and selected"); }} />}
  </>;
}

function DetailDrawer({ centre, centres, onClose, onEdit, onAddChild }: { centre: CostCentre; centres: CostCentre[]; onClose: () => void; onEdit: () => void; onAddChild: () => void }) {
  const children = centres.filter((item) => item.parent === centre.name);
  const hierarchy = [...hierarchyNames(centre.parent, centres), centre.name].join(" › ");
  const details = [["Code", centre.code], ["Nature", centre.nature], ["Type", centre.type], ["Parent", centre.parent], ["Hierarchy", hierarchy], ["Linked Entity", centre.linkedEntityName], ["Owner", centre.owner], ["Approver", centre.approver], ["Effective Period", `${centre.effectiveFrom || "—"} to ${centre.effectiveTo || "Indefinite"}`], ["Status", centre.status], ["Posting Allowed", centre.status === "Active" && centre.directPosting ? "Yes" : "No"], ["Budget Applicable", centre.budgetApplicable ? "Yes" : "No"], ["Budget Control", centre.budgetApplicable ? centre.budgetControl : "Not applicable"], ["Created By", centre.createdBy], ["Created On", centre.createdOn], ["Last Modified By", centre.modifiedBy], ["Last Modified On", centre.modifiedOn]];
  return <div className="fixed inset-0 z-[120] bg-slate-950/45" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="ml-auto flex h-full w-full max-w-[600px] flex-col bg-[#f7f9fa] shadow-2xl"><header className="flex items-start justify-between bg-[#0d473f] p-5 text-white"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/60">Cost Centre Overview</p><h2 className="mt-1 text-xl font-bold">{centre.name}</h2><p className="mt-1 font-mono text-xs text-white/70">{centre.code}</p></div><button onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/10"><X className="h-5 w-5" /></button></header><div className="min-h-0 flex-1 overflow-y-auto p-5"><div className="mb-4 flex items-center gap-2"><NatureBadge nature={centre.nature} /><StatusBadge status={centre.status} /></div><div className="grid gap-3 sm:grid-cols-2">{details.map(([label, value]) => <div key={label} className={cn("rounded-xl border border-slate-200 bg-white p-3", label === "Hierarchy" && "sm:col-span-2")}><p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1.5 text-sm font-bold text-slate-700">{value || "—"}</p></div>)}</div><section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><div><h3 className="text-sm font-bold text-slate-800">Child Cost Centres</h3><p className="mt-1 text-xs text-slate-400">{children.length} direct child{children.length === 1 ? "" : "ren"}</p></div><button onClick={onAddChild} className="inline-flex items-center gap-1 rounded-lg bg-[#edf6f3] px-3 py-2 text-xs font-bold text-[#0d5c4d]"><Plus className="h-3.5 w-3.5" />Add Child</button></div><div className="mt-3 divide-y divide-slate-100">{children.map((child) => <div key={child.id} className="flex items-center justify-between py-2"><span><span className="block text-sm font-bold text-slate-700">{child.name}</span><span className="font-mono text-[10px] text-slate-400">{child.code}</span></span><NatureBadge nature={child.nature} /></div>)}{!children.length && <p className="py-5 text-center text-xs text-slate-400">No child cost centres.</p>}</div></section></div><footer className="flex justify-end gap-2 border-t border-slate-200 bg-white p-4"><button onClick={onClose} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600">Close</button><button onClick={onEdit} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0d5c4d] px-4 text-sm font-bold text-white"><Edit3 className="h-4 w-4" />Edit Cost Centre</button></footer></aside></div>;
}

function HierarchyView({ centres, onView, onEdit, onAddChild }: { centres: CostCentre[]; onView: (centre: CostCentre) => void; onEdit: (centre: CostCentre) => void; onAddChild: (centre: CostCentre) => void }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set([ROOT_NAME, "Corporate & Administration", "Agriculture Operations", "Napier Cultivation"]));
  const renderNode = (centre: CostCentre, depth = 0): ReactNode => {
    const children = centres.filter((child) => child.parent === centre.name).sort((a, b) => a.name.localeCompare(b.name));
    const expanded = open.has(centre.name);
    return <div key={centre.id}><div className="group flex items-center gap-2 rounded-xl border border-transparent px-3 py-2 hover:border-slate-200 hover:bg-white" style={{ marginLeft: `${Math.min(depth, 7) * 22}px` }}><button type="button" disabled={!children.length} onClick={() => setOpen((current) => { const next = new Set(current); next.has(centre.name) ? next.delete(centre.name) : next.add(centre.name); return next; })} className="rounded p-1 text-slate-400 disabled:opacity-20">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button><Building2 className="h-4 w-4 shrink-0 text-[#278b76]" /><button onClick={() => onView(centre)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-bold text-slate-800">{centre.name}</span><span className="font-mono text-[10px] text-slate-400">{centre.code} · {centre.type}</span></button><NatureBadge nature={centre.nature} /><StatusBadge status={centre.status} /><div className="hidden items-center gap-1 group-hover:flex"><button onClick={() => onAddChild(centre)} title="Add child" className="rounded-lg p-2 text-slate-400 hover:bg-[#edf6f3] hover:text-[#0d5c4d]"><Plus className="h-4 w-4" /></button><button onClick={() => onEdit(centre)} title="Edit" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><Edit3 className="h-4 w-4" /></button><button onClick={() => onView(centre)} title="View" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><Eye className="h-4 w-4" /></button></div></div>{expanded && children.map((child) => renderNode(child, depth + 1))}</div>;
  };
  const roots = centres.filter((centre) => !centre.parent || !centres.some((candidate) => candidate.name === centre.parent));
  return <div className="min-h-[420px] bg-[#fafcfc] p-4 sm:p-5"><div className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#18765f]"><GitBranch className="h-4 w-4" />SBR Cost Centre Hierarchy</div>{roots.map((root) => renderNode(root))}</div>;
}

export default function CostCentreMaster({ departments, masterOptions }: { departments: MasterOption[]; masterOptions: Record<string, MasterOption[]> }) {
  const [centres, setCentres] = useState<CostCentre[]>(loadCentres);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [nature, setNature] = useState("All");
  const [parent, setParent] = useState("All");
  const [location, setLocation] = useState("All");
  const [status, setStatus] = useState("All");
  const [budget, setBudget] = useState("All");
  const [view, setView] = useState<"table" | "hierarchy">("table");
  const [modal, setModal] = useState<{ mode: "add" | "edit"; item?: CostCentre; parent?: string } | null>(null);
  const [details, setDetails] = useState<CostCentre | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const persist = (next: CostCentre[]) => { setCentres(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); };
  const locations = Array.from(new Set(centres.filter((centre) => centre.type === "Location" || centre.type === "Cluster" || /Durg|Khairagarh|Bemetara|Raipur/i.test(`${centre.name} ${centre.linkedEntityName}`)).map((centre) => centre.linkedEntityName || ["Durg", "Khairagarh", "Bemetara", "Raipur"].find((place) => centre.name.includes(place)) || centre.name)));
  const filtered = useMemo(() => centres.filter((centre) => {
    const searchable = `${centre.code} ${centre.name} ${centre.parent} ${centre.linkedEntityName} ${centre.owner}`.toLowerCase();
    const centreLocation = centre.linkedEntityName || ["Durg", "Khairagarh", "Bemetara", "Raipur"].find((place) => centre.name.includes(place)) || centre.name;
    return (!query || searchable.includes(query.toLowerCase())) && (type === "All" || centre.type === type) && (nature === "All" || centre.nature === nature) && (parent === "All" || centre.parent === parent) && (location === "All" || centreLocation === location) && (status === "All" || centre.status === status) && (budget === "All" || (budget === "Yes") === centre.budgetApplicable);
  }), [centres, query, type, nature, parent, location, status, budget]);
  const hierarchyCentres = useMemo(() => {
    if (filtered.length === centres.length) return centres;
    const included = new Set(filtered.map((centre) => centre.name));
    filtered.forEach((centre) => hierarchyNames(centre.parent, centres).forEach((name) => included.add(name)));
    return centres.filter((centre) => included.has(centre.name));
  }, [centres, filtered]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const clearFilters = () => { setQuery(""); setType("All"); setNature("All"); setParent("All"); setLocation("All"); setStatus("All"); setBudget("All"); setPage(1); };
  const saveCentre = (centre: CostCentre, addAnother: boolean) => {
    const next = centres.some((item) => item.id === centre.id) ? centres.map((item) => item.id === centre.id ? centre : item) : [centre, ...centres];
    persist(next);
    toast.success("Cost Centre saved");
    setModal(addAnother ? { mode: "add", parent: centre.parent } : null);
  };
  const createParent = (centre: CostCentre) => persist([centre, ...centres]);
  const duplicate = (centre: CostCentre) => setModal({ mode: "add", item: { ...centre, id: `cc-${Date.now()}`, code: generateCode(centre.type, centre.linkedEntityName, centres), name: `${centre.name} Copy`, hasTransactions: false, createdBy: "", createdOn: "", modifiedBy: "", modifiedOn: "" } });
  const updateStatus = (centre: CostCentre, nextStatus: CentreStatus) => { persist(centres.map((item) => item.id === centre.id ? { ...item, status: nextStatus, modifiedOn: nowText() } : item)); setActionId(null); toast.success(nextStatus === "Blocked" ? "Accounting posting blocked" : `Cost Centre marked ${nextStatus}`); };
  const exportCsv = () => {
    const headers = ["Code", "Name", "Type", "Parent", "Linked Entity", "Nature", "Owner", "Budget", "Status"];
    const rows = centres.map((centre) => [centre.code, centre.name, centre.type, centre.parent, centre.linkedEntityName, centre.nature, centre.owner, centre.budgetApplicable ? centre.budgetControl : "No", centre.status]);
    const blob = new Blob([[headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "sbr-cost-centres.csv"; link.click(); URL.revokeObjectURL(url);
  };
  const summary = [{ label: "Total Cost Centres", value: centres.length }, { label: "Parent Centres", value: centres.filter((centre) => centre.nature === "Parent / Group").length }, { label: "Posting Centres", value: centres.filter((centre) => centre.nature === "Posting Cost Centre").length }, { label: "Inactive / Blocked", value: centres.filter((centre) => centre.status !== "Active").length }, { label: "Budget Controlled", value: centres.filter((centre) => centre.budgetApplicable).length }];

  return <div className="space-y-4">
    <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#18765f]">Accounting • Masters • Cost Accounting</p><h2 className="mt-1 text-xl font-bold text-slate-900">Cost Centres</h2><p className="mt-1 max-w-3xl text-sm text-slate-500">Configure organisational, project, operational and location-based cost centres for accounting allocation and reporting.</p></div><div className="flex shrink-0 flex-wrap gap-2"><button onClick={clearFilters} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600"><RefreshCw className="h-4 w-4" />Refresh</button><button onClick={exportCsv} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600"><Download className="h-4 w-4" />Export</button><button onClick={() => setModal({ mode: "add" })} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0d5c4d] px-4 text-xs font-bold text-white"><Plus className="h-4 w-4" />Add Cost Centre</button></div></header>
    <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid-cols-2 xl:grid-cols-5">{summary.map((card, index) => <div key={card.label} className={cn("px-4 py-3", index > 0 && "border-t border-slate-100 sm:border-l sm:border-t-0")}><p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-400">{card.label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{card.value}</p></div>)}</div>
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8"><label className="relative sm:col-span-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={cn(inputClass, "pl-9")} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search Cost Centre..." /></label><select className={inputClass} value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="All">All Types</option>{TYPES.map((value) => <option key={value}>{value}</option>)}</select><select className={inputClass} value={nature} onChange={(event) => { setNature(event.target.value); setPage(1); }}><option value="All">All Natures</option><option>Parent / Group</option><option>Posting Cost Centre</option></select><select className={inputClass} value={parent} onChange={(event) => { setParent(event.target.value); setPage(1); }}><option value="All">All Parents</option>{Array.from(new Set(centres.map((centre) => centre.parent).filter(Boolean))).sort().map((value) => <option key={value}>{value}</option>)}</select><select className={inputClass} value={location} onChange={(event) => { setLocation(event.target.value); setPage(1); }}><option value="All">All Locations</option>{locations.sort().map((value) => <option key={value}>{value}</option>)}</select><select className={inputClass} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="All">All Statuses</option><option>Active</option><option>Inactive</option><option>Blocked</option></select><select className={inputClass} value={budget} onChange={(event) => { setBudget(event.target.value); setPage(1); }}><option value="All">All Budgets</option><option value="Yes">Budget Applicable</option><option value="No">No Budget</option></select></div><div className="mt-2"><button onClick={clearFilters} className="text-xs font-bold text-slate-500 hover:text-[#0d5c4d]">Clear Filters</button></div></section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-base font-bold text-slate-900">Cost Centre Master</h3><p className="mt-1 text-xs text-slate-400">{filtered.length} of {centres.length} cost centres</p></div><div className="flex rounded-xl border border-slate-200 p-1"><button onClick={() => setView("table")} className={cn("rounded-lg px-3 py-2 text-xs font-bold", view === "table" ? "bg-[#0d5c4d] text-white" : "text-slate-500")}>Table View</button><button onClick={() => setView("hierarchy")} className={cn("rounded-lg px-3 py-2 text-xs font-bold", view === "hierarchy" ? "bg-[#0d5c4d] text-white" : "text-slate-500")}>Hierarchy View</button></div></div>
      {view === "hierarchy" ? <HierarchyView centres={hierarchyCentres} onView={setDetails} onEdit={(centre) => setModal({ mode: "edit", item: centre })} onAddChild={(centre) => setModal({ mode: "add", parent: centre.name })} /> : <div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-left text-xs"><thead className="bg-[#0d473f] text-[10px] uppercase tracking-[0.09em] text-white"><tr><th className="px-3 py-3">Cost Centre Code</th><th className="px-3 py-3">Cost Centre Name</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Parent Cost Centre</th><th className="px-3 py-3">Linked Entity</th><th className="px-3 py-3">Nature</th><th className="px-3 py-3">Owner</th><th className="px-3 py-3">Budget</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{paged.map((centre) => <tr key={centre.id} className={cn("hover:bg-[#f6faf9]", centre.status === "Inactive" && "opacity-60")}><td className="whitespace-nowrap px-3 py-3 font-mono font-bold text-[#0d5c4d]">{centre.code}</td><td className="px-3 py-3"><button onClick={() => setDetails(centre)} className="max-w-[230px] truncate text-left font-bold text-slate-800 hover:text-[#0d5c4d]">{centre.name}</button></td><td className="px-3 py-3 text-slate-600">{centre.type}</td><td className="max-w-[210px] truncate px-3 py-3 text-slate-500">{centre.parent || "Top Level"}</td><td className="max-w-[180px] truncate px-3 py-3 text-slate-500">{centre.linkedEntityName || "—"}</td><td className="px-3 py-3"><NatureBadge nature={centre.nature} /></td><td className="px-3 py-3 text-slate-500">{centre.owner || "—"}</td><td className="px-3 py-3">{centre.budgetApplicable ? <span className="inline-flex items-center gap-1 text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" />Yes</span> : "No"}</td><td className="px-3 py-3"><StatusBadge status={centre.status} /></td><td className="relative px-3 py-3"><div className="flex justify-end"><button onClick={() => setActionId(actionId === centre.id ? null : centre.id)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><MoreHorizontal className="h-4 w-4" /></button>{actionId === centre.id && <div className="absolute right-4 top-10 z-30 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-2xl">{[{ label: "View", icon: Eye, action: () => setDetails(centre) }, { label: "Edit", icon: Edit3, action: () => setModal({ mode: "edit", item: centre }) }, { label: "Create Child Cost Centre", icon: Plus, action: () => setModal({ mode: "add", parent: centre.name }) }, { label: "Duplicate", icon: Copy, action: () => duplicate(centre) }, { label: "Block Posting", icon: Ban, action: () => updateStatus(centre, "Blocked") }, { label: "Deactivate", icon: AlertTriangle, action: () => updateStatus(centre, "Inactive") }].map(({ label, icon: Icon, action }) => <button key={label} onClick={() => { action(); setActionId(null); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-600 hover:bg-[#eef7f4] hover:text-[#0d5c4d]"><Icon className="h-4 w-4" />{label}</button>)}</div>}</div></td></tr>)}</tbody></table>{!paged.length && <div className="py-16 text-center"><Building2 className="mx-auto h-8 w-8 text-slate-300" /><h4 className="mt-3 font-bold text-slate-800">No cost centres found</h4><p className="mt-1 text-sm text-slate-400">Clear filters or create a new cost centre.</p></div>}</div>}
      {view === "table" && filtered.length > 0 && <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500"><span>Page {page} of {pageCount}</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">Previous</button><button disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">Next</button></div></div>}
    </section>
    {modal && <CostCentreModal key={modal.item?.id || `${modal.parent || "root"}-${centres.length}`} mode={modal.mode} item={modal.item} initialParent={modal.parent} centres={centres} departments={departments} masterOptions={masterOptions} onClose={() => setModal(null)} onSave={saveCentre} onCreateParent={createParent} />}
    {details && <DetailDrawer centre={details} centres={centres} onClose={() => setDetails(null)} onEdit={() => { setModal({ mode: "edit", item: details }); setDetails(null); }} onAddChild={() => { setModal({ mode: "add", parent: details.name }); setDetails(null); }} />}
  </div>;
}
