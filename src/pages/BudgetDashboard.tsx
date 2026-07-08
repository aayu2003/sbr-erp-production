import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, X, Upload, FileSpreadsheet, Calendar,
  ChevronRight, Search, MapPin, Wheat, BarChart3, Lock, Unlock,
} from "lucide-react";
import getBaseUrl from "@/lib/config";

type SeasonType = "Rabi" | "Kharif" | "Zaid";

type BudgetCard = {
  budget_id: string;
  budget_name: string;
  financial_year_start: string;
  financial_year_end: string;
  crop_season: string;          // "Rabi" | "Kharif" | "Zaid"
  project_start_date: string;
  project_end_date: string;
  crop_type: string;
  budget_xlsx_url: string | null;
  farm_id: string;
  status: string;
  locked: boolean;
  created_at: string;
  update_logs: unknown[];
};

type FarmRecord = {
  farm_id: string;
  farmer_id: string;
  owner_name: string;
  area: number;
  crop_type: string | null;
};

type CropKey = 'paddy' | 'rahar' | 'napier';
type CropWiseLandArea = Record<string, Record<CropKey, number>>;

const CROP_TYPES: CropKey[] = ['paddy', 'rahar', 'napier'];
const CROP_LABELS: Record<CropKey, string> = { paddy: 'Paddy', rahar: 'Rahar', napier: 'Napier' };
const CROP_BTN: Record<CropKey, { on: string; off: string }> = {
  paddy:  { on: 'border-amber-400 bg-amber-100 text-amber-700',  off: 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50' },
  rahar:  { on: 'border-green-400 bg-green-100 text-green-700',  off: 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50' },
  napier: { on: 'border-[#173f70] bg-[#173f70] text-white',      off: 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50' },
};

// ── helpers ───────────────────────────────────────────────────────────────────
const fmtNum = (n: number) => n % 1 === 0 ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

const SEASON_COLORS: Record<SeasonType, string> = {
  Rabi:   "bg-amber-100 text-amber-700 border-amber-200",
  Kharif: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Zaid:   "bg-orange-100 text-orange-700 border-orange-200",
};

function genFinancialYears(): string[] {
  const now = new Date();
  const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [-1, 0, 1, 2].map((d) => `${fy + d}-${String(fy + d + 1).slice(2)}`);
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-extrabold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

const inputCls  = "h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#173f70] focus:ring-1 focus:ring-[#173f70]/20";
const selectCls = `${inputCls} cursor-pointer`;

// ── Create Budget Modal ───────────────────────────────────────────────────────
function CreateBudgetModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const navigate = useNavigate();

  const [budgetName,    setBudgetName]    = useState("");
  const [financialYear, setFinancialYear] = useState(genFinancialYears()[1]);
  const [cropSeason,    setCropSeason]    = useState("");
  const [seasonType,    setSeasonType]    = useState<SeasonType>("Kharif");
  const [projectStart,  setProjectStart]  = useState("");
  const [projectEnd,    setProjectEnd]    = useState("");
  const [selectedCropTypes, setSelectedCropTypes] = useState<CropKey[]>([]);
  const [xlsxFile,      setXlsxFile]      = useState<File | null>(null);
  const [xlsxFileName,  setXlsxFileName]  = useState("");
  const [error,         setError]         = useState("");
  const [loading,       setLoading]       = useState(false);

  const [cropWiseLandArea, setCropWiseLandArea] = useState<CropWiseLandArea>({});
  const [farmFarmerMap,    setFarmFarmerMap]    = useState<Record<string, FarmRecord>>({});
  const [loadingData,      setLoadingData]      = useState(true);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${getBaseUrl()}/farmer_managment/get_crop_wise_land_area_for_budget`).then(r => r.json()),
      fetch(`${getBaseUrl()}/admin_ops_requests/get_farm_and_farmer`).then(r => r.json()),
    ])
      .then(([cropData, farmData]) => {
        if (cropData.crop_wise_land_area) setCropWiseLandArea(cropData.crop_wise_land_area);
        if (farmData.farm_farmer_mapping) {
          const map: Record<string, FarmRecord> = {};
          (farmData.farm_farmer_mapping as FarmRecord[]).forEach(f => { map[f.farm_id] = f; });
          setFarmFarmerMap(map);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, []);

  // Farms that have > 0 area for at least one selected crop
  const matchedRows = selectedCropTypes.length > 0
    ? Object.entries(cropWiseLandArea)
        .map(([farmId, areas]) => {
          const cropAreas: Partial<Record<CropKey, number>> = {};
          let rowTotal = 0;
          selectedCropTypes.forEach(ct => {
            const a = areas[ct] ?? 0;
            cropAreas[ct] = a;
            rowTotal += a;
          });
          return { farmId, cropAreas, rowTotal, owner_name: farmFarmerMap[farmId]?.owner_name ?? farmId };
        })
        .filter(r => r.rowTotal > 0)
    : [];

  const cropTotals: Partial<Record<CropKey, number>> = {};
  CROP_TYPES.forEach(ct => {
    if (selectedCropTypes.includes(ct))
      cropTotals[ct] = matchedRows.reduce((s, r) => s + (r.cropAreas[ct] ?? 0), 0);
  });
  const totalAcres = Object.values(cropTotals).reduce((s, v) => s + (v ?? 0), 0);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setXlsxFile(file);
    setXlsxFileName(file.name);
    if (e.target) e.target.value = "";
  };

  const handleCreate = async () => {
    if (!budgetName.trim() || !cropSeason.trim() || !projectStart || !projectEnd) {
      setError("Budget name, crop season, and project timeline are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // Step 1: upload master xlsx if provided
      let masterXlsxUrl = "";
      if (xlsxFile) {
        const fd = new FormData();
        fd.append("file", xlsxFile);
        const upRes  = await fetch(`${getBaseUrl()}/admin_accounts/upload_line_item_working_xlsx`, { method: "POST", body: fd });
        const upData = await upRes.json();
        if (!upData.success) { setError(upData.message || "Failed to upload xlsx."); setLoading(false); return; }
        masterXlsxUrl = upData.url;
      }

      // Parse "2025-26" → financial_year_start: "2025", financial_year_end: "2026"
      const [fyStartStr, fyEndShort] = financialYear.split("-");
      const fyEndStr = fyStartStr.slice(0, 2) + fyEndShort; // "20" + "26" = "2026"

      // Step 2: create the budget
      const res = await fetch(`${getBaseUrl()}/admin_accounts/create_new_budget`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budget_name:             budgetName.trim(),
          financial_year_start:    fyStartStr,
          financial_year_end:      fyEndStr,
          crop_season:             cropSeason.trim(),
          project_start_date:      projectStart,
          project_end_date:        projectEnd,
          crop_type:               selectedCropTypes.length > 0 ? selectedCropTypes : null,
          farm_id:                 matchedRows.length > 0
                                     ? matchedRows.map((r) => r.farmId).join(", ")
                                     : null,
          master_working_xlsx_url: masterXlsxUrl || null,
          total_acres:             totalAcres,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message || "Failed to create budget."); return; }

      onCreated();
      onClose();
      // Navigate straight into the new budget
      navigate(`/budget/${data.budget_id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 py-10">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Create New Budget</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">Set up a new budget plan for a crop cycle</p>
          </div>
          <button onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>
          )}

          {/* Budget Name */}
          <Field label="Budget Name *">
            <input
              value={budgetName}
              onChange={(e) => setBudgetName(e.target.value)}
              placeholder="e.g. Kharif 2025-26 Budget"
              className={inputCls}
            />
          </Field>

          {/* Financial Year + Season Type */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Financial Year *">
              <select value={financialYear} onChange={(e) => setFinancialYear(e.target.value)} className={selectCls}>
                {genFinancialYears().map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Field>
            <Field label="Rabi / Kharif *">
              <div className="flex gap-1.5 h-10">
                {(["Rabi", "Kharif", "Zaid"] as SeasonType[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeasonType(s)}
                    className={[
                      "flex-1 rounded-md border text-xs font-extrabold transition-all",
                      seasonType === s
                        ? s === "Rabi"
                          ? "border-amber-300 bg-amber-100 text-amber-700"
                          : s === "Kharif"
                          ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                          : "border-orange-300 bg-orange-100 text-orange-700"
                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* Crop Season */}
          <Field label="Crop Season *">
            <input
              value={cropSeason}
              onChange={(e) => setCropSeason(e.target.value)}
              placeholder="e.g. Kharif 2025"
              className={inputCls}
            />
          </Field>

          {/* Project Timeline */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Project Start *">
              <input
                type="date"
                value={projectStart}
                onChange={(e) => setProjectStart(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Project End *">
              <input
                type="date"
                value={projectEnd}
                onChange={(e) => setProjectEnd(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          {/* Crop Type */}
          <Field label="Crop Type">
            {loadingData ? (
              <p className="text-xs font-semibold italic text-slate-400">Loading…</p>
            ) : (
              <div className="flex gap-2">
                {CROP_TYPES.map((ct) => (
                  <button
                    key={ct}
                    type="button"
                    onClick={() =>
                      setSelectedCropTypes((prev) =>
                        prev.includes(ct) ? prev.filter((t) => t !== ct) : [...prev, ct]
                      )
                    }
                    className={[
                      "h-8 rounded-lg border px-4 text-xs font-extrabold transition-all",
                      selectedCropTypes.includes(ct) ? CROP_BTN[ct].on : CROP_BTN[ct].off,
                    ].join(" ")}
                  >
                    {CROP_LABELS[ct]}
                  </button>
                ))}
              </div>
            )}
          </Field>

          {/* Land parcels table */}
          {selectedCropTypes.length > 0 && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                  <p className="text-xs font-extrabold text-slate-600">
                    {matchedRows.length} land parcel{matchedRows.length !== 1 ? "s" : ""} · {selectedCropTypes.map((t) => CROP_LABELS[t]).join(", ")}
                  </p>
                </div>
                <p className="text-xs font-extrabold text-[#173f70]">Total: {fmtNum(totalAcres)} acres</p>
              </div>
              {loadingData ? (
                <div className="py-6 text-center text-xs font-semibold text-slate-400">Loading land data…</div>
              ) : matchedRows.length === 0 ? (
                <div className="py-6 text-center text-xs font-semibold text-slate-400">No land parcels found for selected crops</div>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-100">
                      <tr>
                        <th className="py-1.5 pl-3 pr-2 text-left font-extrabold text-slate-500">Owner</th>
                        <th className="py-1.5 px-2 text-left font-extrabold text-slate-500">Farm ID</th>
                        {selectedCropTypes.map((ct) => (
                          <th key={ct} className="py-1.5 px-2 text-right font-extrabold text-slate-500">
                            {CROP_LABELS[ct]} (ac)
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {matchedRows.map((row) => (
                        <tr key={row.farmId} className="hover:bg-slate-50">
                          <td className="py-1.5 pl-3 pr-2 font-semibold text-slate-700">{row.owner_name}</td>
                          <td className="py-1.5 px-2 font-semibold text-slate-400">{row.farmId}</td>
                          {selectedCropTypes.map((ct) => (
                            <td key={ct} className="py-1.5 px-2 text-right font-extrabold text-slate-600">
                              {(row.cropAreas[ct] ?? 0) > 0
                                ? fmtNum(row.cropAreas[ct]!)
                                : <span className="text-slate-300">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                      <tr>
                        <td colSpan={2} className="py-1.5 pl-3 pr-2 font-extrabold text-slate-700">Total</td>
                        {selectedCropTypes.map((ct) => (
                          <td key={ct} className="py-1.5 px-2 text-right font-extrabold text-[#173f70]">
                            {fmtNum(cropTotals[ct] ?? 0)}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Master XLSX */}
          <Field label="Master Working XLSX">
            {xlsxFile ? (
              <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="flex-1 truncate text-xs font-extrabold text-slate-700">{xlsxFileName}</span>
                <button
                  type="button"
                  onClick={() => { setXlsxFile(null); setXlsxFileName(""); }}
                  className="shrink-0 text-[10px] font-extrabold text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileRef.current?.click()}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-3 hover:border-[#173f70] hover:bg-blue-50/30 transition-all"
              >
                <FileSpreadsheet className="h-5 w-5 text-slate-400 shrink-0" />
                <div>
                  <p className="text-xs font-extrabold text-slate-600">Upload master working xlsx (optional)</p>
                  <p className="text-[10px] font-semibold text-slate-400">Linked to all line items in this budget</p>
                </div>
                <Upload className="ml-auto h-4 w-4 text-slate-400 shrink-0" />
              </div>
            )}
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
          </Field>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button onClick={onClose} className="h-10 rounded-lg border border-slate-200 px-5 text-sm font-semibold hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={loading}
            className="h-10 rounded-lg bg-[#173f70] px-5 text-sm font-semibold text-white hover:bg-[#12345e] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Creating…" : "Create Budget"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Budget Card ───────────────────────────────────────────────────────────────
function BudgetCardItem({ budget, onClick }: { budget: BudgetCard; onClick: () => void }) {
  const fmtDate = (d: string) =>
    d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const fy = `${budget.financial_year_start}-${String(parseInt(budget.financial_year_end) % 100).padStart(2, "0")}`;
  const seasonType = budget.crop_season as SeasonType;
  const seasonColor = SEASON_COLORS[seasonType] ?? "bg-slate-100 text-slate-600 border-slate-200";
  const farmCount = budget.farm_id ? budget.farm_id.split(",").length : 0;

  return (
    <div
      onClick={budget.locked ? undefined : onClick}
      className={[
        "group relative flex flex-col gap-4 rounded-xl border p-5 shadow-sm transition-all",
        budget.locked
          ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-70"
          : "cursor-pointer border-slate-200 bg-white hover:border-[#173f70]/40 hover:shadow-md",
      ].join(" ")}
    >
      {/* Top */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className={`truncate text-base font-extrabold transition-colors ${budget.locked ? "text-slate-500" : "text-slate-900 group-hover:text-[#173f70]"}`}>
            {budget.budget_name}
          </h3>
          <p className="mt-0.5 text-xs font-semibold text-slate-400">FY {fy}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {budget.locked ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-extrabold text-red-600">
              <Lock className="h-3 w-3" />
              Locked
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-extrabold text-emerald-600">
              <Unlock className="h-3 w-3" />
              Open
            </span>
          )}
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold ${seasonColor}`}>
            {budget.crop_season}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2">
        {budget.crop_type && (
          <div className="flex items-center gap-2 text-xs">
            <Wheat className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span className="font-semibold capitalize text-slate-700">{budget.crop_type}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="font-semibold">{fmtDate(budget.project_start_date)} → {fmtDate(budget.project_end_date)}</span>
        </div>
        {budget.budget_xlsx_url && (
          <div className="flex items-center gap-2 text-xs">
            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <span className="font-semibold text-emerald-600">Working XLSX linked</span>
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="mt-auto grid grid-cols-2 gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Farms</p>
          <p className="mt-0.5 text-sm font-extrabold text-slate-700">{farmCount}</p>
        </div>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Status</p>
          <p className={`mt-0.5 text-sm font-extrabold capitalize ${budget.status === "active" ? "text-emerald-600" : "text-slate-500"}`}>
            {budget.status}
          </p>
        </div>
      </div>

      {/* Arrow hint on hover — only for unlocked */}
      {!budget.locked && (
        <ChevronRight className="absolute bottom-4 right-4 h-4 w-4 text-[#173f70] opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BudgetDashboard() {
  const navigate = useNavigate();
  const [budgets,    setBudgets]    = useState<BudgetCard[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search,     setSearch]     = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetch(`${getBaseUrl()}/admin_accounts/get_budgets`)
      .then((r) => r.json())
      .then((d) => { if (d.success && d.data) setBudgets(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const filtered = search
    ? budgets.filter((b) => {
        const fy = `${b.financial_year_start}-${b.financial_year_end}`;
        const q  = search.toLowerCase();
        return (
          b.budget_name.toLowerCase().includes(q) ||
          (b.crop_type ?? "").toLowerCase().includes(q) ||
          b.crop_season.toLowerCase().includes(q) ||
          fy.includes(q)
        );
      })
    : budgets;

  return (
    <div className="space-y-6 p-6">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Budgets</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {budgets.length} budget{budgets.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#173f70] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#12345e]"
        >
          <Plus className="h-4 w-4" />
          New Budget
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, crop, or year…"
          className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-4 text-sm font-semibold text-slate-800 outline-none focus:border-[#173f70] focus:ring-1 focus:ring-[#173f70]/20"
        />
      </div>

      {/* Cards */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm font-semibold text-slate-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#173f70]" />
          Loading budgets…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-slate-300 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100">
            <BarChart3 className="h-7 w-7 text-slate-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-extrabold text-slate-600">
              {search ? "No budgets match your search" : "No budgets yet"}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              {search ? "Try a different keyword" : "Create your first budget to get started"}
            </p>
          </div>
          {!search && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#173f70] px-4 text-xs font-semibold text-white hover:bg-[#12345e]"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Budget
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((b) => (
            <BudgetCardItem
              key={b.budget_id}
              budget={b}
              onClick={() => navigate(`/budget/${b.budget_id}`)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateBudgetModal
          onClose={() => setShowCreate(false)}
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
