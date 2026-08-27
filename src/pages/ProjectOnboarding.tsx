import { useEffect, useState } from "react";
import { Briefcase, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import getBaseUrl from "@/lib/config";

type ProjectRecord = {
  project_id: string;
  project_name?: string;
  project_location?: string;
  project_address?: string;
  project_head?: string;
  project_co_head?: string;
  signing_authority?: string;
  duration_start?: string;
  duration_end?: string;
  created_at?: string;
};

type StaffOption = { id: string; name: string };

const formatDate = (value?: string) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return value;
  }
};

const input = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 outline-none transition focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10";
const label = "block space-y-1.5 text-xs font-bold uppercase tracking-wide text-slate-500";

const emptyForm = {
  project_name: "",
  project_location: "",
  project_address: "",
  project_head: "",
  project_co_head: "",
  signing_authority: "",
  duration_start: "",
  duration_end: "",
};

function CreateProjectModal({ staff, onClose, onCreated }: { staff: StaffOption[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof emptyForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!form.project_name.trim()) { toast.error("Project name is required"); return; }
    setSaving(true);
    try {
      const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/admin_project/create_new_project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.message || "Failed to create project");
      toast.success(`${form.project_name} onboarded`);
      onCreated();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create project");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="bg-gradient-to-br from-[#0d473f] to-[#134f43] px-7 py-6 text-white">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/60">Project · Onboarding</p>
          <h2 className="mt-1 text-xl font-bold">Add Project</h2>
        </div>
        <div className="grid gap-4 p-7 sm:grid-cols-2">
          <label className={label}>Project Name *<input className={input} value={form.project_name} onChange={(event) => set("project_name", event.target.value)} placeholder="e.g. Napier Cultivation — Durg" /></label>
          <label className={label}>Project Location<input className={input} value={form.project_location} onChange={(event) => set("project_location", event.target.value)} placeholder="Cluster / zone / district" /></label>
          <label className={cn2("sm:col-span-2")}>Project Address<textarea rows={2} className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10" value={form.project_address} onChange={(event) => set("project_address", event.target.value)} placeholder="Full site address" /></label>

          <div className="sm:col-span-2 mt-1 border-t border-slate-100 pt-4"><p className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-[#18765f]">Project Heads</p></div>
          <label className={label}>Project Head<input list="project-staff-options" className={input} value={form.project_head} onChange={(event) => set("project_head", event.target.value)} placeholder="Search employee" /></label>
          <label className={label}>Project Co-Head<input list="project-staff-options" className={input} value={form.project_co_head} onChange={(event) => set("project_co_head", event.target.value)} placeholder="Search employee" /></label>
          <label className={label}>Signing Authority<input list="project-staff-options" className={input} value={form.signing_authority} onChange={(event) => set("signing_authority", event.target.value)} placeholder="Search employee" /></label>
          <datalist id="project-staff-options">{staff.map((person) => <option key={person.id} value={person.name} />)}</datalist>

          <div className="sm:col-span-2 mt-1 border-t border-slate-100 pt-4"><p className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-[#18765f]">Project Duration</p></div>
          <label className={label}>Start Date<input type="date" className={input} value={form.duration_start} onChange={(event) => set("duration_start", event.target.value)} /></label>
          <label className={label}>End Date<input type="date" min={form.duration_start || undefined} className={input} value={form.duration_end} onChange={(event) => set("duration_end", event.target.value)} /></label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 p-4">
          <button type="button" onClick={onClose} disabled={saving} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 hover:bg-white disabled:opacity-50">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="h-11 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white hover:bg-[#0a4a3f] disabled:opacity-60">{saving ? "Creating…" : "Add Project"}</button>
        </div>
      </div>
    </div>
  );
}

// Small local helper so the Address textarea's label uses the same styling as `label` above
// without fighting the sm:col-span-2 utility needed only on that one field.
const cn2 = (extra: string) => `${label} ${extra}`;

export default function ProjectOnboarding() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");

  const fetchProjects = () => {
    setLoading(true);
    setError("");
    fetch(`${baseUrl}/admin_project/get_all_projects`)
      .then((res) => res.json())
      .then((data) => {
        if (!data?.success) throw new Error(data?.message || "Failed to load projects");
        setProjects(Array.isArray(data.projects) ? data.projects : []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load projects"))
      .finally(() => setLoading(false));
  };

  useEffect(fetchProjects, [baseUrl]);

  useEffect(() => {
    fetch(`${baseUrl}/admin_staff/get_all_staff`)
      .then((res) => res.json())
      .then((data) => {
        const items: Array<Record<string, unknown>> = Array.isArray(data) ? data : [];
        const options = items
          .map((item) => {
            const info = (item.staff_information as Record<string, unknown>) ?? {};
            return { id: String(item.staff_id ?? ""), name: String(info.staff_name ?? "").trim() };
          })
          .filter((person) => person.id && person.name);
        setStaff(options);
      })
      .catch(() => { /* best-effort — head fields fall back to free text */ });
  }, [baseUrl]);

  const q = search.toLowerCase().trim();
  const filtered = projects.filter((project) => !q || String(project.project_name ?? "").toLowerCase().includes(q) || project.project_id.toLowerCase().includes(q));

  return (
    <div className="min-h-full bg-[#f6f8fa] p-5 lg:p-8">
      <div className="mx-auto max-w-[1400px] space-y-5">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#0d473f] text-white shadow-sm"><Briefcase className="h-6 w-6" /></div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#18765f]">Project · Onboarding</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">Project Onboarding</h1>
              <p className="mt-1 text-sm text-slate-500">Register a project's identity, heads and duration.</p>
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={fetchProjects} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"><RefreshCw className="h-4 w-4" />Refresh</button>
            <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0d5c4d] px-4 text-xs font-bold text-white hover:bg-[#0a4a3f]"><Plus className="h-4 w-4" />Add Project</button>
          </div>
        </header>

        {error && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800">{error}</div>}

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 text-sm outline-none focus:border-[#278b76]" placeholder="Search projects…" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div><h2 className="text-sm font-bold text-slate-900">Project Directory</h2><p className="mt-0.5 text-xs text-slate-400">{filtered.length} of {projects.length} projects</p></div>
            {loading && <span className="text-xs font-semibold text-slate-400">Loading…</span>}
          </div>
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Briefcase className="mx-auto h-9 w-9 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-700">{loading ? "Loading projects…" : "No projects yet"}</p>
              {!loading && <p className="mt-1 text-xs text-slate-400">Click "Add Project" to onboard the first one.</p>}
            </div>
          ) : (
            <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((project) => (
                <div key={project.project_id} className="rounded-xl border border-slate-200 p-4 hover:border-[#9cc7bb] hover:bg-[#f6faf9]">
                  <p className="truncate text-sm font-bold text-slate-800">{project.project_name || "Untitled Project"}</p>
                  <p className="mt-1 font-mono text-[10px] text-slate-400">{project.project_id}</p>
                  {project.project_location && <p className="mt-2 text-xs text-slate-500">{project.project_location}</p>}
                  {project.project_head && <p className="mt-1 text-[11px] font-semibold text-slate-500">Head: {project.project_head}</p>}
                  {(project.duration_start || project.duration_end) && <p className="mt-1 text-[11px] text-slate-400">{formatDate(project.duration_start)} → {formatDate(project.duration_end)}</p>}
                  <p className="mt-3 text-[10px] font-semibold text-slate-400">Created {formatDate(project.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {createOpen && <CreateProjectModal staff={staff} onClose={() => setCreateOpen(false)} onCreated={fetchProjects} />}
    </div>
  );
}
