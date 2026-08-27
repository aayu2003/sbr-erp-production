import { useEffect, useState } from "react";
import { Edit3, Hash, Plus, RefreshCw, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import getBaseUrl from "@/lib/config";

type Department = {
  id: string;
  code: string;
  name: string;
  head: string;
  status: "Active" | "Inactive";
};

const input = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 outline-none transition focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10";
const label = "block space-y-1.5 text-xs font-bold uppercase tracking-wide text-slate-500";

const nextDepartmentCode = (departments: Department[]) => {
  const prefix = "DEPT-";
  const used = departments.map((d) => d.code).filter((c) => c.startsWith(prefix)).map((c) => Number(c.slice(prefix.length))).filter(Number.isFinite);
  return `${prefix}${String((used.length ? Math.max(...used) : 0) + 1).padStart(4, "0")}`;
};

function DepartmentModal({ mode, item, departments, onClose, onSave }: { mode: "add" | "edit"; item?: Department; departments: Department[]; onClose: () => void; onSave: (department: Department) => void }) {
  const [form, setForm] = useState<Department>(() => item ?? { id: "", code: nextDepartmentCode(departments), name: "", head: "", status: "Active" });
  const set = <K extends keyof Department>(key: K, value: Department[K]) => setForm((current) => ({ ...current, [key]: value }));
  const save = () => {
    if (!form.name.trim()) { toast.error("Department name is required"); return; }
    onSave({ ...form, name: form.name.trim(), head: form.head.trim() });
  };
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="bg-gradient-to-br from-[#0d473f] to-[#134f43] px-6 py-5 text-white">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/60">Project · Department Onboarding</p>
          <h2 className="mt-1 text-xl font-bold">{mode === "add" ? "Add Department" : "Edit Department"}</h2>
        </div>
        <div className="space-y-4 p-6">
          <div className="flex items-center gap-3 rounded-xl border border-[#cfe6df] bg-[#eef7f4] px-4 py-3">
            <Hash className="h-4 w-4 shrink-0 text-[#0d5c4d]" />
            <div><p className="font-mono text-sm font-extrabold text-[#0d5c4d]">{form.code}</p><p className="text-[10px] font-semibold text-[#5a8f82]">{mode === "add" ? "Auto-generated" : "Assigned at creation — doesn't change"}</p></div>
          </div>
          <label className={label}>Department Name *<input className={input} value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="e.g. Finance & Accounts" /></label>
          <label className={label}>Department Head <span className="font-medium normal-case text-slate-400">(optional)</span><input className={input} value={form.head} onChange={(event) => set("head", event.target.value)} placeholder="Name of department head" /></label>
          <label className={label}>Status<select className={input} value={form.status} onChange={(event) => set("status", event.target.value as Department["status"])}><option>Active</option><option>Inactive</option></select></label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 p-4">
          <button type="button" onClick={onClose} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 hover:bg-white">Cancel</button>
          <button type="button" onClick={save} className="h-11 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white hover:bg-[#0a4a3f]">{mode === "add" ? "Add Department" : "Save Changes"}</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDelete({ label: name, onCancel, onConfirm }: { label: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-base font-bold text-slate-900">Delete {name}?</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">This permanently removes it from the Department master. This cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={onConfirm} className="h-10 rounded-xl bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700">Delete</button>
        </div>
      </div>
    </div>
  );
}

export default function DepartmentOnboarding() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ mode: "add" | "edit"; item?: Department } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");

  const fetchDepartments = () => {
    setLoading(true);
    fetch(`${baseUrl}/admin_accounting_masters/list/DEPARTMENT`)
      .then((res) => res.json())
      .then((data) => {
        if (!data?.success) return;
        const rows: Department[] = (data.data as Array<Record<string, unknown>>).map((item) => ({
          id: String(item.item_id ?? ""),
          code: String(item.code ?? ""),
          name: String(item.name ?? ""),
          head: String(item.head ?? ""),
          status: (String(item.status ?? "Active")) as Department["status"],
        }));
        setDepartments(rows);
      })
      .catch(() => toast.error("Failed to load departments"))
      .finally(() => setLoading(false));
  };

  useEffect(fetchDepartments, [baseUrl]);

  const saveDepartment = async (department: Department) => {
    try {
      const { id, ...data } = department;
      const response = await fetch(`${baseUrl}/admin_accounting_masters/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ master_type: "DEPARTMENT", item_id: id || undefined, data }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.detail || result?.message || "Failed to save");
      toast.success(`Department ${id ? "updated" : "created"}`);
      setModal(null);
      fetchDepartments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save department");
    }
  };

  const deleteDepartment = async (id: string) => {
    try {
      const response = await fetch(`${baseUrl}/admin_accounting_masters/delete/DEPARTMENT/${encodeURIComponent(id)}`, { method: "DELETE" });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.detail || result?.message || "Failed to delete");
      toast.success("Department deleted");
      setDepartments((current) => current.filter((department) => department.id !== id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete department");
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const q = search.toLowerCase().trim();
  const filtered = departments.filter((department) => !q || department.name.toLowerCase().includes(q) || department.code.toLowerCase().includes(q));
  const deleteTarget = departments.find((department) => department.id === confirmDeleteId);

  return (
    <div className="min-h-full bg-[#f6f8fa] p-5 lg:p-8">
      <div className="mx-auto max-w-[1200px] space-y-5">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#0d473f] text-white shadow-sm"><Users className="h-6 w-6" /></div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#18765f]">Project · Onboarding</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">Department Onboarding</h1>
              <p className="mt-1 text-sm text-slate-500">Register departments as their own master — used across Accounting Master, Bill Inward and PRR forms.</p>
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={fetchDepartments} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"><RefreshCw className="h-4 w-4" />Refresh</button>
            <button type="button" onClick={() => setModal({ mode: "add" })} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0d5c4d] px-4 text-xs font-bold text-white hover:bg-[#0a4a3f]"><Plus className="h-4 w-4" />Add Department</button>
          </div>
        </header>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 text-sm outline-none focus:border-[#278b76]" placeholder="Search departments…" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div><h2 className="text-sm font-bold text-slate-900">Department Register</h2><p className="mt-0.5 text-xs text-slate-400">{filtered.length} of {departments.length} departments</p></div>
            {loading && <span className="text-xs font-semibold text-slate-400">Loading…</span>}
          </div>
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="mx-auto h-9 w-9 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-700">{loading ? "Loading departments…" : "No departments yet"}</p>
              {!loading && <p className="mt-1 text-xs text-slate-400">Click "Add Department" to onboard the first one.</p>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{["Code", "Department Name", "Head", "Status", ""].map((column) => <th key={column} className="px-4 py-3 font-bold">{column}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((department) => (
                    <tr key={department.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-bold text-[#0d5c4d]">{department.code}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">{department.name}</td>
                      <td className="px-4 py-3 text-slate-500">{department.head || "—"}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${department.status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{department.status}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => setModal({ mode: "edit", item: department })} title="Edit" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#0d5c4d]"><Edit3 className="h-4 w-4" /></button>
                          <button type="button" onClick={() => setConfirmDeleteId(department.id)} title="Delete" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {modal && <DepartmentModal mode={modal.mode} item={modal.item} departments={departments} onClose={() => setModal(null)} onSave={saveDepartment} />}
      {deleteTarget && <ConfirmDelete label={deleteTarget.name || deleteTarget.code} onCancel={() => setConfirmDeleteId(null)} onConfirm={() => deleteDepartment(deleteTarget.id)} />}
    </div>
  );
}
