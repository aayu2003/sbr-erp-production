import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Columns3,
  Download,
  Edit3,
  Eye,
  GitBranch,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import getBaseUrl from "@/lib/config";
import { useAuth } from "@/context/AuthContext";
import CostCentreMaster from "@/components/accounting/CostCentreMaster";

export type CostAccountingMode = "Cost Centre" | "Cost Attribution";
type Status = "Active" | "Inactive" | "Blocked" | "Suspended";
type DrawerMode = "add" | "edit" | "view";

type CostCentre = {
  id: string;
  code: string;
  name: string;
  shortName: string;
  parent: string;
  type: string;
  department: string;
  head: string;
  secondary: string;
  entity: string;
  description: string;
  budgetApplicable: boolean;
  budgetControl: string;
  annualBudget: number;
  directPosting: boolean;
  prrPosting: boolean;
  purchasePosting: boolean;
  payrollPosting: boolean;
  ledgerMapping: string;
  effectiveFrom: string;
  effectiveTo: string;
  status: Status;
  linkedEntityId?: string;
  linkedEntityName?: string;
  trackActualVsBudget?: boolean;
  manualCodeOverride?: boolean;
};

type LandAllocation = { id: string; land: string; area: number; percentage: number; amount: number };
type MasterOption = { id: string; label: string; ownerId?: string; ownerName?: string; address?: string };
type Attribution = {
  id: string;
  code: string;
  name: string;
  level: string;
  parent: string;
  linkedMaster: string;
  linkedRecord: string;
  project: string;
  cluster: string;
  area: number;
  allocation: string;
  description: string;
  status: Status;
  lands: LandAllocation[];
};

const CENTRE_STORAGE = "sbr-cost-accounting-centres-v1";
const ATTRIBUTION_STORAGE = "sbr-cost-attributions-v1";
const PROJECT = "Chhattisgarh Feedstock Project";
const LAND_NAMES = ["Netram Agarwal", "Saksham Harshal Khichariya", "Farooqui Family", "Singhaniya Family", "Mandir Trust", "Moolchand Jain", "Nathmal Jain"];

const SEEDED_CENTRE_IDS = new Set(["cc-1", "cc-2", "cc-3", "cc-4", "cc-5", "cc-6", "cc-7", "cc-8"]);
const SEEDED_ATTRIBUTION_IDS = new Set(["ca-project", "ca-durg", "ca-khaira", ...LAND_NAMES.map((_, index) => `ca-land-${index + 1}`)]);

const loadUserRecords = <T extends { id: string }>(key: string, seededIds: Set<string>): T[] => {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return [];
    const records = JSON.parse(saved);
    return Array.isArray(records) ? records.filter((record) => !seededIds.has(String(record?.id ?? ""))) as T[] : [];
  } catch {
    return [];
  }
};

const fieldClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10";
const labelClass = "space-y-1.5 text-xs font-bold text-slate-600";

function StatusChip({ status }: { status: Status }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold", status === "Active" ? "bg-emerald-50 text-emerald-700" : status === "Blocked" || status === "Suspended" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500")}>{status === "Suspended" ? "Blocked" : status}</span>;
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left"><span className="text-sm font-semibold text-slate-700">{label}</span><span className={cn("relative h-6 w-11 rounded-full", checked ? "bg-[#0d5c4d]" : "bg-slate-200")}><span className={cn("absolute top-1 h-4 w-4 rounded-full bg-white transition", checked ? "left-6" : "left-1")} /></span></button>;
}

function Drawer({ title, eyebrow, onClose, children, footer, centered = false }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode; footer?: ReactNode; centered?: boolean }) {
  return <div className={cn("fixed inset-0 z-[120] bg-slate-950/45", centered && "flex items-center justify-center p-4")} onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className={cn("flex flex-col bg-[#f7f9fa] shadow-2xl", centered ? "max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-3xl" : "ml-auto h-full w-full max-w-[540px]")}><div className="flex items-start justify-between bg-[#0d473f] px-6 py-5 text-white"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/60">{eyebrow}</p><h2 className="mt-1 text-xl font-bold">{title}</h2></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/10"><X className="h-5 w-5" /></button></div><div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>{footer && <div className="shrink-0 border-t border-slate-200 bg-white p-4">{footer}</div>}</aside></div>;
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4"><h3 className="mb-4 text-xs font-extrabold uppercase tracking-[0.12em] text-[#0d5c4d]">{title}</h3><div className="grid gap-4 sm:grid-cols-2">{children}</div></section>;
}

const COST_CENTRE_TYPES = ["Department", "Project", "Plant", "Site", "Location", "Business Unit", "Operational", "Administrative", "Other"];
const TYPE_CODES: Record<string, string> = { Department: "DEP", Project: "PRJ", Plant: "PLT", Site: "SIT", Location: "LOC", "Business Unit": "BU", Operational: "OPS", Administrative: "ADM", Other: "OTH" };

const nextCostCentreCode = (type: string, linkedEntity: string, centres: CostCentre[]) => {
  const suffix = (linkedEntity || TYPE_CODES[type] || "GEN").replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "GEN";
  const prefix = `CC-${suffix}-`;
  const sequence = centres.map((centre) => centre.code).filter((code) => code.startsWith(prefix)).map((code) => Number(code.slice(prefix.length))).filter(Number.isFinite);
  return `${prefix}${String((sequence.length ? Math.max(...sequence) : 0) + 1).padStart(3, "0")}`;
};

function CostCentreDrawer({ mode, item, centres, departments, masterOptions, onClose, onSave }: { mode: DrawerMode; item?: CostCentre; centres: CostCentre[]; departments: MasterOption[]; masterOptions: Record<string, MasterOption[]>; onClose: () => void; onSave: (item: CostCentre) => void }) {
  const { user } = useAuth();
  const isAdmin = /admin/i.test(`${user?.designation || ""} ${user?.name || ""} ${user?.username || ""}`);
  const blank: CostCentre = { id: `cc-${Date.now()}`, code: nextCostCentreCode("Department", "", centres), name: "", shortName: "", parent: "", type: "Department", department: "", head: "", secondary: "", entity: "SAI BIORESOURCES PRIVATE LIMITED", description: "", budgetApplicable: false, budgetControl: "No Control", annualBudget: 0, directPosting: true, prrPosting: true, purchasePosting: true, payrollPosting: false, ledgerMapping: "", effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: "", status: "Active", linkedEntityId: "", linkedEntityName: "", trackActualVsBudget: false, manualCodeOverride: false };
  const [form, setForm] = useState<CostCentre>({ ...blank, ...item, status: item?.status === "Suspended" ? "Blocked" : item?.status || blank.status, linkedEntityName: item?.linkedEntityName || item?.department || "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = <K extends keyof CostCentre>(key: K, value: CostCentre[K]) => setForm((current) => ({ ...current, [key]: value }));
  const headOptions = Array.from(new Set([...departments.map((department) => `${department.label} Head`), ...centres.map((centre) => centre.head).filter(Boolean)]));
  const optionsByType: Record<string, MasterOption[]> = {
    Department: departments,
    Project: masterOptions.Project || [],
    Plant: masterOptions.Block || [],
    Site: masterOptions.Cluster || [],
    Location: [...(masterOptions.Zone || []), ...(masterOptions.Block || []), ...(masterOptions.Land || [])],
    "Business Unit": masterOptions.Corporate || [],
    Operational: masterOptions.Project || [],
    Administrative: departments,
    Other: [],
  };
  const linkedOptions = optionsByType[form.type] || [];
  const hierarchy = (() => {
    const names: string[] = [];
    const visited = new Set<string>();
    let parent = form.parent;
    while (parent && !visited.has(parent)) {
      visited.add(parent); names.unshift(parent);
      parent = centres.find((centre) => centre.name === parent)?.parent || "";
    }
    return [...names, form.name.trim() || "New Cost Centre"].join("  ›  ");
  })();
  const save = () => {
    const next: Record<string, string> = {};
    if (!form.code.trim()) next.code = "Cost Centre Code is required";
    if (centres.some((centre) => centre.id !== form.id && centre.code.toLowerCase() === form.code.trim().toLowerCase())) next.code = "This Cost Centre Code already exists";
    if (!form.name.trim()) next.name = "Cost Centre Name is required";
    if (!form.effectiveFrom) next.effectiveFrom = "Effective From is required";
    if (form.effectiveTo && form.effectiveFrom && form.effectiveTo < form.effectiveFrom) next.effectiveTo = "Effective To cannot be before Effective From";
    setErrors(next); if (Object.keys(next).length) return;
    onSave({ ...form, department: form.type === "Department" ? form.linkedEntityName || "" : form.department, head: form.head.trim(), secondary: form.secondary.trim() });
  };
  if (mode === "view" && item) return <Drawer centered eyebrow="Cost Centre Details" title={item.name} onClose={onClose}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[["Cost Centre Code", item.code], ["Cost Centre Name", item.name], ["Type", item.type], ["Parent Cost Centre", item.parent], ["Linked Entity", item.linkedEntityName || item.department], ["Owner", item.head], ["Approving Authority", item.secondary], ["Effective From", item.effectiveFrom], ["Effective To", item.effectiveTo], ["Budget Applicable", item.budgetApplicable ? "Yes" : "No"], ["Budget Control", item.budgetApplicable ? item.budgetControl : "Not applicable"], ["Direct Posting", item.directPosting ? "Allowed" : "Not allowed"], ["Track Actual vs Budget", item.trackActualVsBudget ? "Yes" : "No"], ["Status", item.status === "Suspended" ? "Blocked" : item.status], ["Description", item.description]].map(([label, value]) => <div key={String(label)} className={cn("rounded-xl border border-slate-200 bg-white p-4", label === "Description" && "sm:col-span-2 lg:col-span-3")}><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-sm font-bold text-slate-800">{String(value || "—")}</p></div>)}</div></Drawer>;
  const footer = <div className="flex justify-end gap-3"><button onClick={onClose} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600">Cancel</button><button onClick={save} className="h-10 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white">{mode === "add" ? "Create Cost Centre" : "Save Changes"}</button></div>;
  return <Drawer centered eyebrow="Cost Accounting · Cost Centre" title={mode === "add" ? "Create Cost Centre" : "Edit Cost Centre"} onClose={onClose} footer={footer}>
    <FormSection title="Basic Details">
      <label className={labelClass}>Cost Centre Code *<input readOnly={!isAdmin || !form.manualCodeOverride} className={cn(fieldClass, "font-mono text-[#0d5c4d]", (!isAdmin || !form.manualCodeOverride) && "bg-slate-50")} value={form.code} onChange={(e) => update("code", e.target.value.toUpperCase())} />{errors.code && <span className="text-[11px] text-red-600">{errors.code}</span>}<span className="text-[10px] font-medium text-slate-400">Format: CC-[TYPE/ENTITY]-[SEQUENCE]</span></label>
      <label className={labelClass}>Cost Centre Name *<input className={fieldClass} value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Farm Operations" />{errors.name && <span className="text-[11px] text-red-600">{errors.name}</span>}</label>
      {isAdmin && <div className="sm:col-span-2"><Switch checked={Boolean(form.manualCodeOverride)} onChange={(value) => { update("manualCodeOverride", value); if (!value && mode === "add") update("code", nextCostCentreCode(form.type, form.linkedEntityName || "", centres)); }} label="Manual code override (Admin only)" /></div>}
      <label className={labelClass}>Cost Centre Type *<select className={fieldClass} value={form.type} onChange={(e) => { const type = e.target.value; setForm((current) => ({ ...current, type, linkedEntityId: "", linkedEntityName: "", department: type === "Department" ? "" : current.department, code: mode === "add" && !current.manualCodeOverride ? nextCostCentreCode(type, "", centres) : current.code })); }}>{COST_CENTRE_TYPES.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className={labelClass}>Parent Cost Centre<select className={fieldClass} value={form.parent} onChange={(e) => update("parent", e.target.value)}><option value="">No parent cost centre</option>{centres.filter((row) => row.id !== form.id).map((row) => <option key={row.id} value={row.name}>{row.name} · {row.code}</option>)}</select></label>
      <label className={cn(labelClass, "sm:col-span-2")}>Linked {form.type} <span className="font-medium text-slate-400">(Optional)</span>{linkedOptions.length ? <select className={fieldClass} value={form.linkedEntityId || ""} onChange={(e) => { const option = linkedOptions.find((entry) => entry.id === e.target.value); const name = option?.label || ""; setForm((current) => ({ ...current, linkedEntityId: option?.id || "", linkedEntityName: name, department: current.type === "Department" ? name : current.department, code: mode === "add" && !current.manualCodeOverride ? nextCostCentreCode(current.type, option?.id || name, centres) : current.code })); }}><option value="">Select a linked record</option>{linkedOptions.map((option) => <option key={`${form.type}-${option.id}`} value={option.id}>{option.label} · {option.id}</option>)}</select> : <input className={fieldClass} value={form.linkedEntityName || ""} onChange={(e) => { const name = e.target.value; setForm((current) => ({ ...current, linkedEntityName: name, code: mode === "add" && !current.manualCodeOverride ? nextCostCentreCode(current.type, name, centres) : current.code })); }} placeholder={`Optional ${form.type.toLowerCase()} reference`} />}</label>
      <div className="sm:col-span-2 rounded-xl border border-[#cfe2dd] bg-[#f0f7f5] px-4 py-3"><p className="text-[10px] font-extrabold uppercase tracking-wider text-[#278b76]">Hierarchy Preview</p><p className="mt-1 text-sm font-bold text-[#0d473f]">{hierarchy}</p></div>
      <label className={cn(labelClass, "sm:col-span-2")}>Description<textarea rows={2} className="w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-[#278b76]" value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Purpose and scope of this cost centre" /></label>
    </FormSection>
    <FormSection title="Ownership & Validity">
      <label className={labelClass}>Owner<input list="cost-centre-owners" className={fieldClass} value={form.head} onChange={(e) => update("head", e.target.value)} placeholder="Select or enter owner" /></label>
      <label className={labelClass}>Approving Authority<input list="cost-centre-owners" className={fieldClass} value={form.secondary} onChange={(e) => update("secondary", e.target.value)} placeholder="Select or enter approver" /></label>
      <datalist id="cost-centre-owners">{headOptions.map((head) => <option key={head} value={head} />)}</datalist>
      <label className={labelClass}>Effective From *<input type="date" className={fieldClass} value={form.effectiveFrom} onChange={(e) => update("effectiveFrom", e.target.value)} />{errors.effectiveFrom && <span className="text-[11px] text-red-600">{errors.effectiveFrom}</span>}</label>
      <label className={labelClass}>Effective To <span className="font-medium text-slate-400">(Optional)</span><input type="date" min={form.effectiveFrom} className={fieldClass} value={form.effectiveTo} onChange={(e) => update("effectiveTo", e.target.value)} />{errors.effectiveTo && <span className="text-[11px] text-red-600">{errors.effectiveTo}</span>}</label>
      <label className={labelClass}>Status<select className={fieldClass} value={form.status === "Suspended" ? "Blocked" : form.status} onChange={(e) => update("status", e.target.value as Status)}><option>Active</option><option>Inactive</option><option>Blocked</option></select></label>
    </FormSection>
    <FormSection title="Accounting Controls">
      <div><Switch checked={form.budgetApplicable} onChange={(value) => update("budgetApplicable", value)} label="Budget Applicable" /></div>
      <div><Switch checked={form.directPosting} onChange={(value) => update("directPosting", value)} label="Allow Direct Posting" /></div>
      {form.budgetApplicable && <label className={labelClass}>Budget Control<select className={fieldClass} value={form.budgetControl} onChange={(e) => update("budgetControl", e.target.value)}><option>No Control</option><option>Warning Only</option><option>Hard Limit</option></select></label>}
      <div className={cn(!form.budgetApplicable && "sm:col-start-1")}><Switch checked={Boolean(form.trackActualVsBudget)} onChange={(value) => update("trackActualVsBudget", value)} label="Track Actual vs Budget" /></div>
    </FormSection>
  </Drawer>;
}

const nextAttributionCode = (level: string, records: Attribution[]) => {
  const suffixByLevel: Record<string, string> = { Corporate: "COR", Project: "PRJ", Cluster: "CLU", Zone: "ZONE", Block: "BLK", Land: "LAND" };
  const prefix = `CA-${suffixByLevel[level] || "OTH"}-`;
  const sequence = records
    .map((record) => record.code)
    .filter((code) => code.startsWith(prefix))
    .map((code) => Number(code.slice(prefix.length)))
    .filter(Number.isFinite);
  return `${prefix}${String((sequence.length ? Math.max(...sequence) : 0) + 1).padStart(3, "0")}`;
};

function AttributionDrawer({ mode, item, attributions, projectNames, masterOptions, masterOptionsLoading, onClose, onSave }: { mode: DrawerMode; item?: Attribution; attributions: Attribution[]; projectNames: string[]; masterOptions: Record<string, MasterOption[]>; masterOptionsLoading: boolean; onClose: () => void; onSave: (items: Attribution[]) => void }) {
  const blank: Attribution = { id: `ca-${Date.now()}`, code: nextAttributionCode("Land", attributions), name: "", level: "Land", parent: "", linkedMaster: "Land Parcel", linkedRecord: "", project: projectNames[0] || "", cluster: "", area: 0, allocation: "Equal", description: "", status: "Active", lands: [] };
  const [form, setForm] = useState<Attribution>(item || blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>(item?.linkedRecord ? [item.linkedRecord] : []);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const update = <K extends keyof Attribution>(key: K, value: Attribution[K]) => setForm((current) => ({ ...current, [key]: value }));
  const levelOptions = masterOptions[form.level] || [];
  const selectedOptions = levelOptions.filter((option) => selectedIds.includes(option.id));
  const linkedMasterByLevel: Record<string, string> = { Corporate: "Corporate", Project: "Project", Cluster: "Cluster", Zone: "Zone", Block: "Block", Land: "Land Parcel" };
  const save = () => {
    const next: Record<string, string> = {};
    if (!selectedOptions.length) next.name = `Select at least one ${form.level.toLowerCase()} record`;
    setErrors(next);
    if (Object.keys(next).length) return;
    const existing = attributions.filter((record) => record.id !== item?.id);
    const created: Attribution[] = [];
    selectedOptions.forEach((option, index) => {
      const recordsForSequence = [...existing, ...created];
      created.push({
        ...form,
        id: mode === "edit" && index === 0 && item ? item.id : `ca-${Date.now()}-${index}`,
        code: mode === "edit" && index === 0 && item ? item.code : nextAttributionCode(form.level, recordsForSequence),
        name: option.label,
        linkedRecord: option.id,
        linkedMaster: linkedMasterByLevel[form.level] || form.level,
        project: form.level === "Project" ? option.label : form.project,
        cluster: form.level === "Cluster" ? option.label : form.cluster,
      });
    });
    onSave(created);
  };
  if (mode === "view" && item) return <Drawer centered eyebrow="Cost Attribution Details" title={item.name} onClose={onClose}><div className="flex gap-2"><span className="rounded-full bg-[#eaf4f1] px-3 py-1 text-xs font-bold text-[#0d5c4d]">{item.level} Level</span><StatusChip status={item.status} /></div><div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase text-slate-400">Selected Record</p><p className="mt-2 text-sm font-bold text-slate-800">{item.name}</p><p className="mt-1 font-mono text-xs text-slate-500">{item.linkedRecord}</p></div></Drawer>;
  const footer = <div className="flex justify-end gap-3"><button onClick={onClose} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600">Cancel</button><button onClick={save} className="h-10 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white">Save Attribution</button></div>;
  return <Drawer centered eyebrow="Cost Accounting · Attribution" title={mode === "add" ? "Add Attribution" : "Edit Attribution"} onClose={onClose} footer={footer}>
    <FormSection title="Basic Details">
      <label className={labelClass}>Attribution Code<input readOnly className={cn(fieldClass, "bg-slate-50 text-[#0d5c4d]")} value={form.code} /><span className="text-[10px] font-medium text-slate-400">Auto-generated from attribution level</span></label>
      <label className={labelClass}>Attribution Level<select className={fieldClass} value={form.level} onChange={(e) => { const level = e.target.value; setSelectedIds([]); setOptionsOpen(false); setForm((current) => ({ ...current, level, name: "", linkedRecord: "", linkedMaster: linkedMasterByLevel[level] || level, code: mode === "add" ? nextAttributionCode(level, attributions) : current.code })); }}>{["Corporate", "Project", "Cluster", "Zone", "Block", "Land"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <div className="relative sm:col-span-2"><p className={labelClass}>Select {form.level}</p><button type="button" disabled={masterOptionsLoading && !levelOptions.length} onClick={() => setOptionsOpen((current) => !current)} className={cn(fieldClass, "mt-1.5 flex items-center justify-between text-left", !selectedIds.length && "text-slate-400")}><span>{masterOptionsLoading && !levelOptions.length ? `Loading ${form.level.toLowerCase()} records…` : selectedIds.length ? `${selectedIds.length} ${form.level.toLowerCase()} record${selectedIds.length === 1 ? "" : "s"} selected` : `Select ${form.level.toLowerCase()} records`}</span><ChevronDown className="h-4 w-4" /></button>{optionsOpen && <div className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">{levelOptions.length ? levelOptions.map((option) => <label key={option.id} className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-3 hover:bg-[#eef7f4]"><input type="checkbox" className="mt-1 h-4 w-4 accent-[#0d5c4d]" checked={selectedIds.includes(option.id)} onChange={() => setSelectedIds((current) => current.includes(option.id) ? current.filter((id) => id !== option.id) : [...current, option.id])} /><span className="min-w-0"><span className="block text-sm font-bold text-slate-800">{form.level === "Land" ? option.ownerName || option.label : option.label}</span><span className="mt-1 block text-xs text-slate-500">{form.level === "Land" ? [option.ownerId && `Owner ID: ${option.ownerId}`, `Land: ${option.id}`, option.address].filter(Boolean).join(" · ") : option.id}</span></span></label>) : <p className="px-3 py-6 text-center text-sm text-slate-400">No {form.level.toLowerCase()} records available</p>}</div>}{errors.name && <span className="mt-1 block text-[11px] text-red-600">{errors.name}</span>}</div>
      <label className={cn(labelClass, "sm:col-span-2")}>Description<textarea className="min-h-20 w-full rounded-xl border border-slate-200 p-3 text-sm" value={form.description} onChange={(e) => update("description", e.target.value)} /></label>
    </FormSection>
    <FormSection title={`Selected Items (${selectedOptions.length})`}><div className="sm:col-span-2 overflow-hidden rounded-xl border border-slate-200"><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-[#0d473f] uppercase tracking-wider text-white"><tr><th className="px-3 py-3">#</th><th className="px-3 py-3">{form.level} ID</th><th className="px-3 py-3">{form.level === "Land" ? "Land Owner ID" : "Name"}</th>{form.level === "Land" && <><th className="px-3 py-3">Land Owner Name</th><th className="px-3 py-3">Address</th></>}<th className="w-14 px-3 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{selectedOptions.map((option, index) => <tr key={option.id}><td className="px-3 py-3 text-slate-400">{index + 1}</td><td className="px-3 py-3 font-mono font-bold text-[#0d5c4d]">{option.id}</td><td className="px-3 py-3 font-semibold text-slate-700">{form.level === "Land" ? option.ownerId || "—" : option.label}</td>{form.level === "Land" && <><td className="px-3 py-3 font-semibold text-slate-700">{option.ownerName || option.label || "—"}</td><td className="px-3 py-3 text-slate-500">{option.address || "—"}</td></>}<td className="px-3 py-3"><button type="button" onClick={() => setSelectedIds((current) => current.filter((id) => id !== option.id))} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><X className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>{!selectedOptions.length && <div className="py-10 text-center text-sm text-slate-400">Selected {form.level.toLowerCase()} records will appear here.</div>}</div></FormSection>
    <FormSection title="Status"><label className={labelClass}>Status<select className={fieldClass} value={form.status} onChange={(e) => update("status", e.target.value as Status)}><option>Active</option><option>Inactive</option><option>Suspended</option></select></label></FormSection>
  </Drawer>;
}

function ConfirmDialog({ title, message, action, onCancel, onConfirm }: { title: string; message: string; action: string; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/55 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h3 className="text-lg font-bold text-slate-900">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-500">{message}</p><div className="mt-6 flex justify-end gap-3"><button onClick={onCancel} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600">Cancel</button><button onClick={onConfirm} className="h-10 rounded-xl bg-red-600 px-4 text-sm font-bold text-white">{action}</button></div></div></div>;
}

function TransactionPreview({ onClose }: { onClose: () => void }) {
  return <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="w-full max-w-xl rounded-3xl bg-white shadow-2xl"><div className="flex items-start justify-between bg-[#0d473f] p-5 text-white"><div><p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Frontend Transaction Preview</p><h3 className="mt-1 text-xl font-bold">PRR Cost Accounting</h3></div><button onClick={onClose}><X className="h-5 w-5" /></button></div><div className="grid gap-3 p-5 sm:grid-cols-2">{[["Cost Centre", "Farm Operations"], ["Cost Nature", "CAPEX"], ["Cost Classification", "Direct Cost"], ["Cost Attribution", "Land Level"], ["Project", PROJECT], ["Cluster", "Durg"], ["Cost Object", "Netram Agarwal"]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 p-4"><p className="text-[10px] font-bold uppercase text-slate-400">{label}</p><p className="mt-2 text-sm font-bold text-slate-800">{value}</p></div>)}</div><div className="border-t border-slate-100 p-5 text-xs leading-5 text-slate-500"><b>Direct Cost:</b> Assigned to one specific Cost Object. &nbsp; <b>Shared Cost:</b> Allocated between multiple Cost Objects. &nbsp; <b>Common Cost:</b> Belongs to an overall project or organization.</div></div></div>;
}

export default function CostAccountingSetup({ mode, projects = [], departments = [], legalEntity = "SAI BIORESOURCES PRIVATE LIMITED" }: { mode: CostAccountingMode; projects?: Array<{ id?: string; code?: string; name: string; status?: string }>; departments?: Array<{ id?: string; code?: string; name: string; status?: string }>; legalEntity?: string }) {
  const isCentre = mode === "Cost Centre";
  const activeProjects = useMemo(() => projects.filter((project) => !project.status || project.status === "Active"), [projects]);
  const projectNames = useMemo(() => activeProjects.map((project) => project.name), [activeProjects]);
  const departmentOptions = useMemo(() => departments.filter((department) => !department.status || department.status === "Active").map((department, index) => ({ id: String(department.code || department.id || `department-${index + 1}`), label: department.name })), [departments]);
  const [centres, setCentres] = useState<CostCentre[]>(() => loadUserRecords<CostCentre>(CENTRE_STORAGE, SEEDED_CENTRE_IDS).map((centre) => ({ ...centre, status: centre.status === "Suspended" ? "Blocked" : centre.status })));
  const [attributions, setAttributions] = useState<Attribution[]>(() => loadUserRecords<Attribution>(ATTRIBUTION_STORAGE, SEEDED_ATTRIBUTION_IDS));
  const [masterOptions, setMasterOptions] = useState<Record<string, MasterOption[]>>({ Corporate: [{ id: legalEntity, label: legalEntity }], Project: [], Cluster: [], Zone: [], Block: [], Land: [] });
  const [masterOptionsLoading, setMasterOptionsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [scopeFilter, setScopeFilter] = useState("All");
  const [parentFilter, setParentFilter] = useState("All");
  const [masterFilter, setMasterFilter] = useState("All");
  const [view, setView] = useState<"Table" | "Tree">("Table");
  const [drawer, setDrawer] = useState<{ mode: DrawerMode; item?: CostCentre | Attribution } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [showColumns, setShowColumns] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    const projectOptions = activeProjects.map((project, index) => ({ id: String(project.code || project.id || `project-${index + 1}`), label: project.name }));
    setMasterOptions((current) => ({ ...current, Corporate: [{ id: legalEntity, label: legalEntity }], Project: projectOptions }));
    const controller = new AbortController();
    const base = getBaseUrl().replace(/\/$/, "");
    setMasterOptionsLoading(true);
    const load = async (path: string, key: string) => {
      try {
        const response = await fetch(`${base}${path}`, { headers: { Accept: "application/json" }, signal: controller.signal });
        if (!response.ok) return [] as Record<string, unknown>[];
        const data = await response.json();
        return Array.isArray(data?.[key]) ? data[key] as Record<string, unknown>[] : [];
      } catch {
        return [] as Record<string, unknown>[];
      }
    };
    const loadOwners = async () => {
      try {
        const response = await fetch(`${base}/admin_ops_requests/get_farm_and_farmer`, { headers: { Accept: "application/json" }, signal: controller.signal });
        if (!response.ok) return [] as Record<string, unknown>[];
        const data = await response.json();
        const rows = [data?.farm_farmer_mapping, data?.farms, data?.data, data?.items].find(Array.isArray);
        return (rows || []) as Record<string, unknown>[];
      } catch {
        return [] as Record<string, unknown>[];
      }
    };

    Promise.all([
      load("/farmer_managment/get_clusters", "clusters"),
      load("/farmer_managment/get_zones", "zones"),
      load("/farmer_managment/get_blocks", "blocks"),
      load("/farmer_managment/get_farms", "farms"),
      loadOwners(),
    ]).then(([clusters, zones, blocks, farms, owners]) => {
      if (controller.signal.aborted) return;
      const options = (rows: Record<string, unknown>[], idKeys: string[], nameKeys: string[]): MasterOption[] => rows.map((row, index) => {
        const id = String(idKeys.map((key) => row[key]).find((value) => value != null && value !== "") || `record-${index + 1}`);
        const label = String(nameKeys.map((key) => row[key]).find((value) => value != null && value !== "") || id);
        return { id, label };
      });
      const ownerByLand = new Map(owners.map((owner) => [String(owner.farm_id || owner.land_id || owner.id || ""), owner]));
      const landOptions = farms.map((farm, index) => {
        const landData = farm.land_data && typeof farm.land_data === "object" ? farm.land_data as Record<string, unknown> : {};
        const id = String(farm.farm_id || farm.land_id || farm.id || `land-${index + 1}`);
        const owner = ownerByLand.get(id) || {};
        const ownerId = String(owner.farmer_id || owner.owner_id || farm.farmer_id || farm.owner_id || "");
        const ownerName = String(owner.owner_name || owner.farmer_name || owner.name || farm.owner_name || farm.farmer_name || "");
        const address = [landData.village || farm.village, landData.district || farm.district, landData.state || farm.state].filter(Boolean).map(String).join(", ");
        return { id, label: ownerName || id, ownerId, ownerName, address };
      });
      setMasterOptions({
        Corporate: [{ id: legalEntity, label: legalEntity }],
        Project: projectOptions,
        Cluster: options(clusters, ["cluster_id", "id"], ["cluster_name", "name", "cluster_id"]),
        Zone: options(zones, ["zone_id", "id"], ["zone_name", "name", "zone_id"]),
        Block: options(blocks, ["block_id", "id"], ["block_name", "name", "block_id"]),
        Land: landOptions,
      });
    }).finally(() => {
      if (!controller.signal.aborted) setMasterOptionsLoading(false);
    });
    return () => controller.abort();
  }, [activeProjects, isCentre, legalEntity]);
  const rows = isCentre ? centres : attributions;
  const filtered = useMemo(() => rows.filter((row) => {
    const text = Object.values(row).join(" ").toLowerCase();
    const type = isCentre ? (row as CostCentre).type : (row as Attribution).level;
    const scope = isCentre ? ((row as CostCentre).linkedEntityName || (row as CostCentre).department) : (row as Attribution).project;
    const parent = isCentre ? (row as CostCentre).parent : (row as Attribution).cluster;
    const master = isCentre ? "All" : (row as Attribution).linkedMaster;
    return (!query || text.includes(query.toLowerCase())) && (typeFilter === "All Types" || type === typeFilter) && (statusFilter === "All Statuses" || row.status === statusFilter) && (scopeFilter === "All" || scope === scopeFilter) && (parentFilter === "All" || parent === parentFilter) && (masterFilter === "All" || master === masterFilter);
  }).sort((a, b) => (sortAsc ? 1 : -1) * a.code.localeCompare(b.code)), [rows, query, typeFilter, statusFilter, scopeFilter, parentFilter, masterFilter, sortAsc, isCentre]);
  if (isCentre) return <CostCentreMaster departments={departmentOptions} masterOptions={masterOptions} />;
  const pageSize = 5;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const saveCentre = (item: CostCentre) => { const next = centres.some((row) => row.id === item.id) ? centres.map((row) => row.id === item.id ? item : row) : [item, ...centres]; setCentres(next); localStorage.setItem(CENTRE_STORAGE, JSON.stringify(next)); setDrawer(null); toast.success("Cost Centre saved"); };
  const saveAttribution = (items: Attribution[]) => { const savedIds = new Set(items.map((item) => item.id)); const next = [...items, ...attributions.filter((row) => !savedIds.has(row.id))]; setAttributions(next); localStorage.setItem(ATTRIBUTION_STORAGE, JSON.stringify(next)); setDrawer(null); toast.success(`${items.length} Cost Attribution${items.length === 1 ? "" : "s"} saved`); };
  const toggleStatus = () => { if (!confirmId) return; if (isCentre) { const next = centres.map((row) => row.id === confirmId ? { ...row, status: row.status === "Active" ? "Inactive" as Status : "Active" as Status } : row); setCentres(next); localStorage.setItem(CENTRE_STORAGE, JSON.stringify(next)); } else { const next = attributions.map((row) => row.id === confirmId ? { ...row, status: row.status === "Active" ? "Inactive" as Status : "Active" as Status } : row); setAttributions(next); localStorage.setItem(ATTRIBUTION_STORAGE, JSON.stringify(next)); } setConfirmId(null); };
  const exportCsv = () => { const headers = isCentre ? ["Code", "Name", "Parent", "Type", "Linked Entity", "Owner", "Approving Authority", "Status"] : ["Code", "Name", "Level", "Parent", "Linked Master", "Allocation", "Status"]; const data = rows.map((row) => isCentre ? [(row as CostCentre).code, row.name, (row as CostCentre).parent, (row as CostCentre).type, (row as CostCentre).linkedEntityName || (row as CostCentre).department, (row as CostCentre).head, (row as CostCentre).secondary, row.status] : [(row as Attribution).code, row.name, (row as Attribution).level, (row as Attribution).parent, (row as Attribution).linkedMaster, (row as Attribution).allocation, row.status]); const blob = new Blob([[headers, ...data].map((line) => line.map((cell) => `"${cell}"`).join(",")).join("\n")], { type: "text/csv" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${mode.toLowerCase().replaceAll(" ", "-")}.csv`; anchor.click(); URL.revokeObjectURL(url); };
  const columns = isCentre ? ["Parent", "Type", "Linked Entity", "Owner", "Budget Control"] : ["Level", "Parent", "Linked Master", "Allocation"];

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 xl:flex-row xl:items-start xl:justify-between"><div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"><label className="relative sm:col-span-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={cn(fieldClass, "pl-9")} value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search code, name, project, cluster or land parcel" /></label><select className={fieldClass} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option>All Types</option>{(isCentre ? COST_CENTRE_TYPES : ["Corporate", "Project", "Cluster", "Zone", "Block", "Land"]).map((value) => <option key={value}>{value}</option>)}</select><select className={fieldClass} value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)}><option value="All">{isCentre ? "All Linked Entities" : "All Projects"}</option>{Array.from(new Set(rows.map((row) => isCentre ? ((row as CostCentre).linkedEntityName || (row as CostCentre).department) : (row as Attribution).project).filter(Boolean))).map((value) => <option key={value}>{value}</option>)}</select><select className={fieldClass} value={parentFilter} onChange={(e) => setParentFilter(e.target.value)}><option value="All">{isCentre ? "All Parents" : "All Clusters"}</option>{Array.from(new Set(rows.map((row) => isCentre ? (row as CostCentre).parent : (row as Attribution).cluster).filter(Boolean))).map((value) => <option key={value}>{value}</option>)}</select>{!isCentre && <select className={fieldClass} value={masterFilter} onChange={(e) => setMasterFilter(e.target.value)}><option value="All">All Linked Masters</option>{Array.from(new Set(attributions.map((row) => row.linkedMaster))).map((value) => <option key={value}>{value}</option>)}</select>}<select className={fieldClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option>All Statuses</option><option>Active</option><option>Inactive</option><option>{isCentre ? "Blocked" : "Suspended"}</option></select></div><div className="flex flex-wrap gap-2"><button onClick={() => { setQuery(""); setTypeFilter("All Types"); setStatusFilter("All Statuses"); setScopeFilter("All"); setParentFilter("All"); setMasterFilter("All"); }} className="rounded-xl border border-slate-200 p-2.5 text-slate-500" title="Refresh"><RefreshCw className="h-4 w-4" /></button><button onClick={exportCsv} className="rounded-xl border border-slate-200 p-2.5 text-slate-500" title="Export"><Download className="h-4 w-4" /></button>{!isCentre && <button onClick={() => setPreview(true)} className="h-10 rounded-xl border border-[#b8d6ce] px-4 text-sm font-bold text-[#0d5c4d]">Preview PRR</button>}<button onClick={() => setDrawer({ mode: "add" })} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0d5c4d] px-4 text-sm font-bold text-white"><Plus className="h-4 w-4" />{isCentre ? "Add Cost Centre" : "Add Attribution"}</button></div></div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-base font-bold text-slate-900">{isCentre ? "Cost Centre Register" : "Cost Attribution Register"}</h3><p className="mt-1 text-xs text-slate-400">{filtered.length} frontend records shown</p></div><div className="flex gap-2"><div className="flex rounded-xl border border-slate-200 p-1"><button onClick={() => setView("Table")} className={cn("rounded-lg px-3 py-2 text-xs font-bold", view === "Table" ? "bg-[#0d5c4d] text-white" : "text-slate-500")}>Table View</button><button onClick={() => setView("Tree")} className={cn("rounded-lg px-3 py-2 text-xs font-bold", view === "Tree" ? "bg-[#0d5c4d] text-white" : "text-slate-500")}>{isCentre ? "Tree View" : "Hierarchy View"}</button></div><div className="relative"><button onClick={() => setShowColumns(!showColumns)} className="rounded-xl border border-slate-200 p-2.5 text-slate-500"><Columns3 className="h-4 w-4" /></button>{showColumns && <div className="absolute right-0 top-12 z-20 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">{columns.map((column) => <label key={column} className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={!hidden.includes(column)} onChange={() => setHidden((current) => current.includes(column) ? current.filter((item) => item !== column) : [...current, column])} />{column}</label>)}</div>}</div></div></div>
      {view === "Tree" ? <HierarchyTree mode={mode} centres={centres} attributions={attributions} onSelect={(item) => setDrawer({ mode: "view", item })} /> : <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="sticky top-0 bg-[#0d473f] text-[10px] uppercase tracking-[0.1em] text-white"><tr><th className="px-4 py-3"><button onClick={() => setSortAsc(!sortAsc)} className="font-bold">Code {sortAsc ? "↑" : "↓"}</button></th><th className="px-4 py-3">Name</th>{columns.filter((column) => !hidden.includes(column)).map((column) => <th key={column} className="px-4 py-3">{column}</th>)}<th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{paged.map((row) => <tr key={row.id} className={cn("hover:bg-[#f6faf9]", row.status !== "Active" && "opacity-60")}><td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-[#0d5c4d]">{row.code}</td><td className="px-4 py-3"><button onClick={() => setDrawer({ mode: "view", item: row })} className="text-left font-bold text-slate-800 hover:text-[#0d5c4d]">{row.name}</button></td>{isCentre ? <>{!hidden.includes("Parent") && <td className="px-4 py-3 text-slate-500">{(row as CostCentre).parent || "—"}</td>}{!hidden.includes("Type") && <td className="px-4 py-3">{(row as CostCentre).type}</td>}{!hidden.includes("Linked Entity") && <td className="px-4 py-3 text-slate-500">{(row as CostCentre).linkedEntityName || (row as CostCentre).department || "—"}</td>}{!hidden.includes("Owner") && <td className="px-4 py-3 text-slate-500">{(row as CostCentre).head || "—"}</td>}{!hidden.includes("Budget Control") && <td className="px-4 py-3">{(row as CostCentre).budgetApplicable ? (row as CostCentre).budgetControl : "Not applicable"}</td>}</> : <>{!hidden.includes("Level") && <td className="px-4 py-3"><span className="rounded-full bg-[#eaf4f1] px-2 py-1 text-xs font-bold text-[#0d5c4d]">{(row as Attribution).level}</span></td>}{!hidden.includes("Parent") && <td className="px-4 py-3 text-slate-500">{(row as Attribution).parent}</td>}{!hidden.includes("Linked Master") && <td className="px-4 py-3 text-slate-500">{(row as Attribution).linkedMaster}</td>}{!hidden.includes("Allocation") && <td className="px-4 py-3">{(row as Attribution).allocation}</td>}</>}<td className="px-4 py-3"><StatusChip status={row.status} /></td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button onClick={() => setDrawer({ mode: "view", item: row })} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" title="View"><Eye className="h-4 w-4" /></button><button onClick={() => setDrawer({ mode: "edit", item: row })} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" title="Edit"><Edit3 className="h-4 w-4" /></button><button onClick={() => setConfirmId(row.id)} className="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100">{row.status === "Active" ? "Deactivate" : "Reactivate"}</button><button className="rounded-lg p-2 text-slate-400"><MoreHorizontal className="h-4 w-4" /></button></div></td></tr>)}</tbody></table>{!filtered.length && <div className="py-14 text-center"><h4 className="font-bold text-slate-800">No {isCentre ? "Cost Centres" : "Cost Attributions"} configured</h4><p className="mt-2 text-sm text-slate-400">Create a record to define cost ownership and economic attribution.</p><button onClick={() => setDrawer({ mode: "add" })} className="mt-4 rounded-xl bg-[#0d5c4d] px-4 py-2 text-sm font-bold text-white"><Plus className="mr-2 inline h-4 w-4" />Add {mode}</button></div>}</div>}
      {view === "Table" && filtered.length > 0 && <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500"><span>Page {page} of {Math.max(1, Math.ceil(filtered.length / pageSize))}</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">Previous</button><button disabled={page >= Math.ceil(filtered.length / pageSize)} onClick={() => setPage(page + 1)} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">Next</button></div></div>}
    </section>
    {drawer && isCentre && <CostCentreDrawer mode={drawer.mode} item={drawer.item as CostCentre | undefined} centres={centres} departments={departmentOptions} masterOptions={masterOptions} onClose={() => setDrawer(null)} onSave={saveCentre} />}
    {drawer && !isCentre && <AttributionDrawer mode={drawer.mode} item={drawer.item as Attribution | undefined} attributions={attributions} projectNames={projectNames} masterOptions={masterOptions} masterOptionsLoading={masterOptionsLoading} onClose={() => setDrawer(null)} onSave={saveAttribution} />}
    {confirmId && <ConfirmDialog title={`${rows.find((row) => row.id === confirmId)?.status === "Active" ? "Deactivate" : "Reactivate"} ${mode}?`} message={`This ${mode} will ${rows.find((row) => row.id === confirmId)?.status === "Active" ? "no longer be available for new transactions. Existing records will remain unchanged." : "become available for new transactions again."}`} action={rows.find((row) => row.id === confirmId)?.status === "Active" ? "Deactivate" : "Reactivate"} onCancel={() => setConfirmId(null)} onConfirm={toggleStatus} />}
    {preview && <TransactionPreview onClose={() => setPreview(false)} />}
  </div>;
}

function HierarchyTree({ mode, centres, attributions, onSelect }: { mode: CostAccountingMode; centres: CostCentre[]; attributions: Attribution[]; onSelect: (item: CostCentre | Attribution) => void }) {
  const [open, setOpen] = useState<string[]>(["Corporate", "Operations", PROJECT, "Durg", "Khairagarh"]);
  const branch = (label: string, children: Array<CostCentre | Attribution>) => <div className="ml-4 border-l border-slate-200 pl-4"><button onClick={() => setOpen((current) => current.includes(label) ? current.filter((item) => item !== label) : [...current, label])} className="flex items-center gap-2 py-2 text-sm font-bold text-slate-800">{open.includes(label) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{label}</button>{open.includes(label) && <div className="ml-2 space-y-1">{children.map((item) => <button key={item.id} onClick={() => onSelect(item)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-[#eaf4f1] hover:text-[#0d5c4d]">{mode === "Cost Centre" ? <Building2 className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}{item.name}<StatusChip status={item.status} /></button>)}</div>}</div>;
  return <div className="min-h-[360px] p-5"><div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#18765f]"><GitBranch className="h-4 w-4" />{mode === "Cost Centre" ? "Organisational hierarchy" : "Project → Cluster → Land hierarchy"}</div>{mode === "Cost Centre" ? <>{branch("Corporate", centres.filter((row) => row.parent === "Corporate"))}{branch("Operations", centres.filter((row) => row.parent === "Operations"))}{branch("Legal & Governance", centres.filter((row) => row.parent === "Legal & Governance"))}</> : <div>{branch(PROJECT, attributions.filter((row) => row.level === "Cluster"))}<div className="ml-8">{branch("Durg", attributions.filter((row) => row.level === "Land" && row.cluster === "Durg"))}{branch("Khairagarh", attributions.filter((row) => row.level === "Land" && row.cluster === "Khairagarh"))}</div></div>}</div>;
}
