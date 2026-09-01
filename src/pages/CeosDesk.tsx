import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MapContainer, TileLayer, Polygon, Polyline, Circle, CircleMarker, Marker, Popup, Tooltip as LeafletTooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Droplets,
  Image as ImageIcon,
  Info,
  IndianRupee,
  Landmark,
  Leaf,
  MapPinned,
  RefreshCw,
  Route,
  Shovel,
  Sprout,
  Tractor,
  TrendingDown,
  TrendingUp,
  Users,
  Wheat,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import getBaseUrl from "@/lib/config";
import { cachedJson } from "@/lib/ceoDeskData";
import { getFarmerNames } from "@/lib/farmerNameCache";
import { getTaskDetailsBulk } from "@/lib/taskDetailsCache";
import { getAssignedSupervisorAndFieldManagers, type FarmTeamAssignment } from "@/lib/supervisorFieldManagerCache";
import type { Lead } from "@/types/farm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Tone = "green" | "blue" | "orange" | "purple" | "red";

// The 8 Dashboard-tab KPI tiles are computed live (see buildDashboardKpis) from the same
// farms/calendarData/budgetBifurcation state the other tabs already fetch — this type is just
// the shape KpiCard renders, not a source of data itself.
type DashboardKpi = {
  label: string;
  value: string;
  suffix: string;
  helper: string;
  tone: Tone;
  icon: typeof MapPinned;
  progress?: number;
  chart?: "pie";
  // Optional 2+ slice breakdown pie (distinct from the single-value progress ring above) — used
  // by the Capex/Opex Distribution and Crop-wise Area tiles.
  breakdown?: { label: string; value: number; color: string }[];
  // How to format each breakdown slice's value — "currency" (default, Rs Cr/Lakh) for money like
  // Capex/Opex, "acres" for a land-area breakdown like Crop-wise Area.
  breakdownFormat?: "currency" | "acres";
  // Skips the icon/label/value/suffix/helper header entirely — used by Crop-wise Area, which is
  // meant to be just the breakdown pie and its legend, nothing else.
  hideHeader?: boolean;
  // Keeps the icon/label but drops just the headline value+suffix line — used by Capex/Opex
  // Distribution, which doesn't need to repeat the total when the pie+legend already show it.
  hideValue?: boolean;
  // Replaces the headline value+suffix with a compact 2-up split (used by Actual Disbursement:
  // the actual figure vs what was expected) — same vertical space as the value row it replaces,
  // not extra, so the tile's height doesn't grow.
  splitAmounts?: { label: string; value: number }[];
  // A small pill in the header's top-right corner (same slot the progress ring uses) — for
  // Actual Disbursement's percentage, which needs to show alongside the split without adding a
  // new line of its own.
  badge?: string;
  // True while whatever backend state this tile's value is computed from hasn't finished loading
  // yet — the tile shows just a spinner in place of its normal content until this flips false.
  loading?: boolean;
};

const toneStyles: Record<Tone, { icon: string; iconBg: string; ring: string; ringSoft: string; helper: string }> = {
  green: { icon: "text-green-700", iconBg: "bg-green-100", ring: "#16a34a", ringSoft: "#dcfce7", helper: "text-green-700" },
  blue: { icon: "text-blue-700", iconBg: "bg-blue-100", ring: "#2563eb", ringSoft: "#dbeafe", helper: "text-blue-700" },
  orange: { icon: "text-orange-700", iconBg: "bg-orange-100", ring: "#f97316", ringSoft: "#ffedd5", helper: "text-orange-700" },
  purple: { icon: "text-violet-700", iconBg: "bg-violet-100", ring: "#6d28d9", ringSoft: "#ede9fe", helper: "text-blue-900" },
  red: { icon: "text-red-700", iconBg: "bg-red-100", ring: "#ef4444", ringSoft: "#fee2e2", helper: "text-red-700" },
};

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: Workflow },
  { id: "land-acquisition", label: "Land Acquisition", icon: MapPinned },
  { id: "cultivation-tracker", label: "Cultivation Tracker", icon: Sprout },
  { id: "financial-analysis", label: "Financial Analysis", icon: IndianRupee },
  { id: "project-map", label: "Project Map", icon: Route },
];

const Card = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <section className={cn("rounded-xl border border-slate-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.06)]", className)}>
    {children}
  </section>
);

const KpiPieChart = ({ value, color, trackColor }: { value: number; color: string; trackColor: string }) => {
  const radius = 25;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(Math.max(value, 0), 100) / 100) * circumference;

  return (
    <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-slate-50">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke={trackColor} strokeWidth="9" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute text-sm font-black text-slate-950">{value}%</span>
    </div>
  );
};

const KpiCard = ({ card }: { card: DashboardKpi }) => {
  const Icon = card.icon;
  const style = toneStyles[card.tone];
  const showPieChart = card.chart === "pie";
  const breakdownTotal = card.breakdown?.reduce((sum, slice) => sum + Math.max(slice.value, 0), 0) ?? 0;
  const formatBreakdownValue =
    card.breakdownFormat === "acres"
      ? (value: number) => `${value.toLocaleString("en-IN", { maximumFractionDigits: 1 })} ac`
      : formatFinancialAmount;

  if (card.loading) {
    return (
      <Card className={cn("flex h-full flex-col items-center justify-center overflow-hidden", showPieChart ? "min-h-[124px] p-4" : "min-h-[118px] p-4")}>
        <RefreshCw className="h-6 w-6 animate-spin text-slate-300" />
      </Card>
    );
  }

  return (
    <Card className={cn("flex h-full flex-col overflow-hidden", showPieChart ? "min-h-[124px] p-4" : "min-h-[118px] p-4")}>
      {!card.hideHeader && (
        <div className="flex items-start justify-between gap-4">
          <div className={cn("min-w-0 flex-1", !showPieChart && "max-w-full")}>
            <div className="flex items-center gap-3">
              <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", style.iconBg)}>
                <Icon className={cn("h-5 w-5", style.icon)} />
              </div>
              <p className="text-sm font-extrabold text-slate-950">{card.label}</p>
            </div>
            {!card.hideValue && (
              <div className="mt-3 flex items-end gap-2">
                <p className="text-3xl font-black tracking-normal text-slate-950">{card.value}</p>
                <p className="pb-1 text-sm font-bold text-slate-700">{card.suffix}</p>
              </div>
            )}
            {card.splitAmounts && (
              <div className={cn("grid grid-cols-2 divide-x divide-slate-100", card.hideValue ? "mt-3" : "mt-2")}>
                {card.splitAmounts.map((item, index) => (
                  <div key={item.label} className={index === 0 ? "pr-3" : "pl-3"}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</p>
                    <p className="mt-0.5 truncate text-sm font-black text-slate-900">{formatFinancialAmount(item.value)}</p>
                  </div>
                ))}
              </div>
            )}
            {card.helper && <p className={cn("mt-2 text-sm font-bold", style.helper)}>{card.helper}</p>}
          </div>
          {showPieChart && <KpiPieChart value={card.progress ?? 0} color={style.ring} trackColor={style.ringSoft} />}
          {card.badge && (
            <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black", style.iconBg, style.icon)}>
              {card.badge}
            </span>
          )}
        </div>
      )}

      {/* Breakdown pie — Capex/Opex Distribution and Crop-wise Area, each their own standalone
          tile now rather than sharing space on a row-spanning Total Budget tile. */}
      {card.breakdown && card.hideHeader && (
        <div className="flex items-center gap-3">
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", style.iconBg)}>
            <Icon className={cn("h-4 w-4", style.icon)} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-slate-950">{card.label}</p>
            {card.helper && <p className={cn("text-xs font-bold", style.helper)}>{card.helper}</p>}
          </div>
        </div>
      )}
      {card.breakdown && (
        <div className={cn("flex flex-1 items-center gap-3", card.hideHeader ? "mt-3" : "mt-4 border-t border-slate-100 pt-4")}>
          {breakdownTotal > 0 ? (
            <>
              <div className="relative h-24 w-24 shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={card.breakdown} dataKey="value" nameKey="label" innerRadius={30} outerRadius={46} paddingAngle={3} strokeWidth={0}>
                      {card.breakdown.map((slice) => (
                        <Cell key={slice.label} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number, _name, item) => [formatBreakdownValue(value), item?.payload?.label]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {card.breakdown.map((slice) => (
                  <div key={slice.label} className="flex items-center justify-between gap-2 text-xs font-bold text-slate-600">
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
                      {slice.label}
                    </span>
                    <span className="shrink-0 font-black text-slate-900">{formatBreakdownValue(slice.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs font-bold text-slate-300">--</p>
          )}
        </div>
      )}
    </Card>
  );
};

const SectionHeader = ({ title, right }: { title: string; right?: React.ReactNode }) => (
  <div className="mb-4 flex items-center justify-between gap-3">
    <h2 className="text-base font-black text-slate-950">{title}</h2>
    {right}
  </div>
);

const Pill = ({ children, tone = "orange" }: { children: React.ReactNode; tone?: "orange" | "blue" | "green" | "red" | "yellow" }) => (
  <span
    className={cn(
      "inline-flex rounded-md border px-2.5 py-1 text-xs font-extrabold",
      tone === "orange" && "border-orange-200 bg-orange-50 text-orange-700",
      tone === "blue" && "border-blue-200 bg-blue-50 text-blue-700",
      tone === "green" && "border-emerald-200 bg-emerald-50 text-emerald-700",
      tone === "red" && "border-red-200 bg-red-50 text-red-700",
      tone === "yellow" && "border-amber-200 bg-amber-50 text-amber-700",
    )}
  >
    {children}
  </span>
);

const landAcquisitionStats = [
  { label: "New Leads", value: "214", suffix: "Acres", tone: "text-violet-700" },
  { label: "Under Verification", value: "126", suffix: "Acres", tone: "text-blue-700" },
  { label: "Agreement Pending", value: "88", suffix: "Acres", tone: "text-amber-700" },
  { label: "Ready for Cultivation", value: "152", suffix: "Acres", tone: "text-emerald-700" },
];


type FinancialKpis = {
  total_budget: number;
  total_capex: number;
  total_opex: number;
  total_remaining: number;
  active_budgets_count?: number;
};

const FINANCIAL_DECIMAL_PLACES = 2;
const formatFinancialAmount = (valueInRupees: number) => {
  const value = Number(valueInRupees || 0);
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1e7) {
    return `${sign}Rs ${(abs / 1e7).toFixed(FINANCIAL_DECIMAL_PLACES)} Cr`;
  }
  return `${sign}Rs ${(abs / 1e5).toFixed(FINANCIAL_DECIMAL_PLACES)} Lakh`;
};
const formatCroreChartValue = (valueInCrores: number) => formatFinancialAmount(Number(valueInCrores || 0) * 1e7);

const financialStatDefs = [
  { label: "Total Budget", key: "total_budget" as const, tone: "text-blue-700", iconBg: "bg-blue-100", icon: Landmark },
  { label: "Total Capex", key: "total_capex" as const, tone: "text-emerald-700", iconBg: "bg-emerald-100", icon: Tractor },
  { label: "Total Opex", key: "total_opex" as const, tone: "text-violet-700", iconBg: "bg-violet-100", icon: Workflow },
  { label: "Total Balance", key: "balance" as const, tone: "text-emerald-700", iconBg: "bg-emerald-100", icon: TrendingUp },
];

type BudgetBifurcation = {
  budget_id: string;
  budget_name: string;
  total_budget: number;
  amount_in_pipeline: number;
  amount_utilized: number;
  remaining: number;
};

const BUDGET_SEGMENT_COLORS = {
  pipeline: "#f59e0b",
  utilized: "#22c55e",
  remaining: "#3b82f6",
  unallocated: "#94a3b8",
};

// Muted, report-grade green for the Category-wise Utilized figure — deliberately not the
// brighter BUDGET_SEGMENT_COLORS.utilized used in consumer-style charts elsewhere on this page.
const CATEGORY_UTILIZATION_COLORS = { utilized: "#166534" };

const buildBudgetSegments = (entry: {
  total_budget: number;
  amount_in_pipeline: number;
  amount_utilized: number;
  remaining: number;
}) => {
  const segments = [
    { key: "utilized", label: "Utilized Budget", color: BUDGET_SEGMENT_COLORS.utilized, value: Math.max(entry.amount_utilized, 0) },
    { key: "remaining", label: "Balance", color: BUDGET_SEGMENT_COLORS.remaining, value: Math.max(entry.remaining, 0) },
  ];
  // amount_in_pipeline folds into this bucket rather than getting its own wedge — the real
  // Amount in Pipeline figure is its own KPI card at the top of the page.
  const unallocated = entry.total_budget - (entry.amount_utilized + entry.remaining);
  if (unallocated > 0) {
    segments.push({ key: "unallocated", label: "Unallocated", color: BUDGET_SEGMENT_COLORS.unallocated, value: unallocated });
  }
  return segments;
};

const BudgetBifurcationRow = ({ budget }: { budget: BudgetBifurcation }) => {
  const segments = buildBudgetSegments(budget).filter((entry) => entry.key !== "unallocated");

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-xs font-black text-slate-950" title={budget.budget_name}>
          {budget.budget_name}
        </p>
        <p className="shrink-0 text-[11px] font-bold text-slate-500">{formatFinancialAmount(budget.total_budget)}</p>
      </div>
      {/* Number chips, not another segmented bar — the aggregate donut above this list already
          shows proportion for the whole card, and Category-wise Budget Bifurcation below already
          owns the bar treatment; repeating it per row here just reads as the same widget twice. */}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {segments.map((entry) => (
          <div key={entry.key} className="rounded-md bg-white px-2 py-1.5">
            <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.02em] text-slate-500">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.label}
            </p>
            <p className="mt-0.5 text-[11px] font-black text-slate-800">{formatFinancialAmount(entry.value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const sumBudgetTotals = (budgets: BudgetBifurcation[]) =>
  budgets.reduce(
    (acc, budget) => {
      acc.totalBudget += budget.total_budget;
      acc.pipeline += budget.amount_in_pipeline;
      acc.utilized += budget.amount_utilized;
      acc.remaining += budget.remaining;
      return acc;
    },
    { totalBudget: 0, pipeline: 0, utilized: 0, remaining: 0 },
  );

const BudgetBifurcationCard = ({ budgets, loading }: { budgets: BudgetBifurcation[]; loading: boolean }) => {
  const totals = useMemo(() => sumBudgetTotals(budgets), [budgets]);

  // Balance = Total Budget - Actual Utilized. Total Allocated / Amount in Pipeline is its own
  // KPI card up top now, not part of this card's breakdown.
  const balance = totals.totalBudget - totals.utilized;

  const aggregateSegments = useMemo(
    () =>
      buildBudgetSegments({
        total_budget: totals.totalBudget,
        amount_in_pipeline: totals.pipeline,
        amount_utilized: totals.utilized,
        remaining: balance,
      }),
    [totals, balance],
  );

  const totalsList = [
    { label: "Total Budget", value: totals.totalBudget, color: "#0f172a" },
    { label: "Utilized Budget", value: totals.utilized, color: BUDGET_SEGMENT_COLORS.utilized },
    { label: "Balance", value: balance, color: BUDGET_SEGMENT_COLORS.remaining },
  ];

  return (
    <Card className="p-5">
      <SectionHeader
        title="Budget Bifurcation"
        right={
          <Pill tone="blue">
            {budgets.length} Budgets · {formatFinancialAmount(totals.totalBudget)}
          </Pill>
        }
      />
      {loading ? (
        <div className="flex h-56 flex-col items-center justify-center gap-2 text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin opacity-50" />
          <p className="text-xs font-bold">Loading budget data…</p>
        </div>
      ) : budgets.length === 0 ? (
        <div className="flex h-56 items-center justify-center text-sm font-bold text-slate-400">No budget data available</div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative h-28 w-28 shrink-0">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={aggregateSegments} dataKey="value" nameKey="label" innerRadius={34} outerRadius={54} paddingAngle={2}>
                  {aggregateSegments.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number, _name, item) => [formatFinancialAmount(value), item?.payload?.label]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-sm font-black text-slate-950">{formatFinancialAmount(totals.totalBudget)}</p>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            {totalsList.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.label}
                </span>
                <span className="text-xs font-black text-slate-950">{formatFinancialAmount(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-slate-500">Budget-wise Bifurcation</p>
        {budgets.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-xs font-bold text-slate-400">No budget data available</div>
        ) : (
          <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
            {budgets.map((budget) => (
              <BudgetBifurcationRow key={budget.budget_id} budget={budget} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

type DisbursementWeek = { week: string; planned: number; expected: number; disbursed: number; cumulative: number };

type ActualDisbursementRecord = { amount: number; prr_number: string; date_of_prr: string };

// BASE_URL/ceo_desk/get_actual_disbursement — real PRR payments (from admin_accounts_prr's
// paid_at/payment_details, see mark_payment_paid), the actual counterpart to the planned
// week-wise schedule read out of each budget's "ERP Disbursement" xlsx sheet below.
const fetchActualDisbursements = async (): Promise<ActualDisbursementRecord[]> => {
  const baseUrl = getBaseUrl().replace(/\/$/, "");
  try {
    // Routed through the shared cache so a login-time warm of this endpoint is reused here.
    const data = await cachedJson<{ data?: ActualDisbursementRecord[] }>(`${baseUrl}/ceo_desk/get_actual_disbursement`);
    return Array.isArray(data?.data) ? data.data : [];
  } catch {
    return [];
  }
};

const DISBURSEMENT_SHEET_NAME = "ERP Disbursement";
const MONTH_ORDER: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

// Week-column keys look like "Jun2026-W1" (see DisbursementSequence.tsx, which writes them).
// Parse one into a chronologically sortable value plus a display label.
const parseWeekKey = (key: string) => {
  const match = key.match(/^([A-Za-z]{3})(\d{4})-W(\d)$/);
  if (!match) return null;
  const [, monthShort, yearStr, weekStr] = match;
  const monthIdx = MONTH_ORDER[monthShort];
  if (monthIdx === undefined) return null;
  const year = Number(yearStr);
  const week = Number(weekStr);
  return { monthShort, year, week, sortValue: year * 48 + monthIdx * 4 + week };
};

// Same W1-W4 day-of-month bucketing convention used when the weeks were created, so "today"
// can be placed on the same timeline to split planned-vs-already-due disbursement.
const getCurrentWeekSortValue = () => {
  const now = new Date();
  const monthIdx = now.getMonth();
  const day = now.getDate();
  const week = day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4;
  return now.getFullYear() * 48 + monthIdx * 4 + week;
};

const MONTH_SHORT_BY_INDEX = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Places a real payment's date_of_prr onto the same "Jun2026-W1"-style weekly key the planned
// schedule uses (same W1-W4 day-of-month bucketing as getCurrentWeekSortValue), so actual and
// planned amounts land in the same week bucket.
const dateToWeekKey = (dateStr: string): string | null => {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getDate();
  const week = day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4;
  return `${MONTH_SHORT_BY_INDEX[date.getMonth()]}${date.getFullYear()}-W${week}`;
};

// Aggregates the "ERP Disbursement" sheet across every budget's own xlsx into one portfolio-wide,
// chronologically-ordered week series, and merges in the real payments from
// BASE_URL/ceo_desk/get_actual_disbursement — "expected" is the old schedule-based proxy
// (planned, for weeks at-or-before today), "disbursed" is now what was actually paid out.
const fetchAggregateDisbursementSeries = async (
  budgetIds: string[],
  actualDisbursements: ActualDisbursementRecord[],
  signal: AbortSignal
): Promise<DisbursementWeek[]> => {
  const baseUrl = getBaseUrl().replace(/\/$/, "");
  const weekTotals = new Map<string, number>();

  await Promise.all(
    budgetIds.map(async (budgetId) => {
      try {
        const res = await fetch(`${baseUrl}/admin_accounts/get_budget/${budgetId}`, { signal });
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wb = (XLSX as any).read(new Uint8Array(buf), { type: "array" });
        const sheet = wb.Sheets[DISBURSEMENT_SHEET_NAME];
        if (!sheet) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet);
        rows.forEach((row) => {
          Object.entries(row).forEach(([key, value]) => {
            if (key === "line_item_id" || key === "line_item") return;
            const amount = Number(value) || 0;
            if (!amount) return;
            weekTotals.set(key, (weekTotals.get(key) || 0) + amount);
          });
        });
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === "AbortError") throw err;
        // Skip this one budget on failure rather than failing the whole aggregate.
      }
    })
  );

  const actualTotals = new Map<string, number>();
  actualDisbursements.forEach((record) => {
    const key = dateToWeekKey(record.date_of_prr);
    if (!key) return;
    actualTotals.set(key, (actualTotals.get(key) || 0) + (Number(record.amount) || 0));
  });

  const currentWeekSortValue = getCurrentWeekSortValue();
  const weekKeys = new Set<string>([...weekTotals.keys(), ...actualTotals.keys()]);
  const parsedWeeks = Array.from(weekKeys)
    .map((key) => ({ planned: weekTotals.get(key) || 0, actual: actualTotals.get(key) || 0, parsed: parseWeekKey(key) }))
    .filter((w): w is { planned: number; actual: number; parsed: NonNullable<ReturnType<typeof parseWeekKey>> } => w.parsed !== null)
    .sort((a, b) => a.parsed.sortValue - b.parsed.sortValue);

  let cumulative = 0;
  return parsedWeeks.map(({ planned, actual, parsed }) => {
    const plannedCr = planned / 1e7;
    const expectedCr = parsed.sortValue <= currentWeekSortValue ? plannedCr : 0;
    const disbursedCr = actual / 1e7;
    // Cumulative runs from the very first week through this one, regardless of whether the
    // week is in the past or future — it's "how much is due by this point in the sequence".
    cumulative += plannedCr;
    return {
      week: `${parsed.monthShort} W${parsed.week}`,
      planned: Number(plannedCr.toFixed(3)),
      expected: Number(expectedCr.toFixed(3)),
      disbursed: Number(disbursedCr.toFixed(3)),
      cumulative: Number(cumulative.toFixed(3)),
    };
  });
};

const DisbursementSequenceCard = ({
  series,
  loading,
  budgets,
  totalActualDisbursedCr,
}: {
  series: DisbursementWeek[];
  loading: boolean;
  budgets: BudgetBifurcation[];
  totalActualDisbursedCr: number;
}) => {
  const [chartView, setChartView] = useState<"line" | "bar">("line");
  const expectedTillNow = series.reduce((sum, item) => sum + item.expected, 0);
  const { totalBudget } = sumBudgetTotals(budgets);
  const totalBudgetCr = totalBudget / 1e7;

  return (
    <Card className="p-5">
      <SectionHeader
        title="Disbursement Sequence"
        right={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setChartView("bar")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[11px] font-bold transition",
                  chartView === "bar"
                    ? "bg-[#0D3A35] text-white shadow-sm"
                    : "text-slate-500 hover:bg-white hover:text-slate-800"
                )}
              >
                Bar
              </button>
              <button
                type="button"
                onClick={() => setChartView("line")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[11px] font-bold transition",
                  chartView === "line"
                    ? "bg-[#0D3A35] text-white shadow-sm"
                    : "text-slate-500 hover:bg-white hover:text-slate-800"
                )}
              >
                Line
              </button>
            </div>
            <Pill tone="blue">Week-wise</Pill>
          </div>
        )}
      />
      <p className="-mt-2 mb-3 text-xs font-semibold text-slate-500">
        Planned versus actual week-wise disbursement across all active budgets.
      </p>
      <div className="h-64">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
            <RefreshCw className="h-6 w-6 animate-spin opacity-50" />
            <p className="text-xs font-bold">Loading disbursement sequence…</p>
          </div>
        ) : series.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">
            No disbursement sequence data recorded yet.
          </div>
        ) : (
          <ResponsiveContainer>
            {chartView === "bar" ? (
              <BarChart data={series} margin={{ left: -18, right: 8, top: 12, bottom: 0 }}>
                <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700 }} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontWeight: 700 }}
                  tickFormatter={(value: number) => value >= 1 ? `${value.toFixed(2)} Cr` : `${(value * 100).toFixed(2)} L`}
                />
                <Tooltip formatter={(value: number, name: string) => [formatCroreChartValue(value), name]} />
                <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                <Bar dataKey="planned" name="Planned Disbursement" fill="#2563eb" radius={[5, 5, 0, 0]} maxBarSize={28} />
                <Bar dataKey="disbursed" name="Actual Disbursement" fill="#16a34a" radius={[5, 5, 0, 0]} maxBarSize={28} />
              </BarChart>
            ) : (
              <LineChart data={series} margin={{ left: -18, right: 8, top: 12, bottom: 0 }}>
                <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700 }} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontWeight: 700 }}
                  tickFormatter={(value: number) => value >= 1 ? `${value.toFixed(2)} Cr` : `${(value * 100).toFixed(2)} L`}
                />
                <Tooltip formatter={(value: number, name: string) => [formatCroreChartValue(value), name]} />
                <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                <Line
                  type="monotone"
                  dataKey="planned"
                  name="Planned Disbursement"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="disbursed"
                  name="Actual Disbursement"
                  stroke="#16a34a"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 px-3 py-2.5">
          <p className="text-lg font-black text-slate-950">{formatCroreChartValue(totalBudgetCr)}</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">Total Budget</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2.5">
          <p className="text-lg font-black text-slate-950">{formatCroreChartValue(expectedTillNow)}</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">Expected Disbursement Till Now</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2.5">
          <p className="text-2xl font-black text-slate-950">{formatCroreChartValue(totalActualDisbursedCr)}</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">Total Disbursed Till Now</p>
        </div>
      </div>
    </Card>
  );
};

type BudgetCategoryDetail = {
  category: string;
  total_budget: number;
  amount_in_pipeline: number;
  amount_utilized: number;
  remaining: number;
};

type BudgetCategoryBifurcation = {
  budget_id: string;
  budget_name: string;
  categories: BudgetCategoryDetail[];
};

type BudgetMasterRecord = {
  budget_id: string;
  budget_name?: string;
  status?: string;
};

const parseBudgetWorkbookCategories = (buffer: ArrayBuffer): BudgetCategoryDetail[] => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workbook = (XLSX as any).read(new Uint8Array(buffer), { type: "array" });
  const sheet = workbook.Sheets.budget ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: 0 });
  const grouped = new Map<string, BudgetCategoryDetail>();
  rows.forEach((row) => {
    const category = String(row.category ?? "").trim();
    if (!category) return;
    const key = category.toLowerCase();
    const current = grouped.get(key) ?? {
      category,
      total_budget: 0,
      amount_in_pipeline: 0,
      amount_utilized: 0,
      remaining: 0,
    };
    current.total_budget += Number(row.total_value) || 0;
    current.amount_in_pipeline += Number(row.amount_in_pipeline) || 0;
    current.amount_utilized += Number(row.utilized_amount) || 0;
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).map((category) => ({
    ...category,
    remaining: Math.max(category.total_budget - category.amount_in_pipeline - category.amount_utilized, 0),
  }));
};

const fetchCompleteCategoryBudgets = async (base: string): Promise<BudgetCategoryBifurcation[]> => {
  // Both routed through the shared cache so a login-time warm of these endpoints is reused.
  const [categoryBody, masterBody] = await Promise.all([
    cachedJson<{ success?: boolean; data?: BudgetCategoryBifurcation[] }>(`${base}/ceo_desk/get_category_wise_budget_utilization`).catch(() => null),
    cachedJson<{ data?: BudgetMasterRecord[] }>(`${base}/admin_accounts/get_budgets`).catch(() => null),
  ]);
  const categoryBudgets: BudgetCategoryBifurcation[] = categoryBody?.success && Array.isArray(categoryBody?.data)
    ? categoryBody.data
    : [];
  const masterBudgets: BudgetMasterRecord[] = Array.isArray(masterBody?.data)
    ? masterBody.data
    : [];
  const existingIds = new Set(categoryBudgets.map((budget) => budget.budget_id));
  const missingBudgets = masterBudgets.filter((budget) => (
    budget.budget_id && budget.status !== "inactive" && !existingIds.has(budget.budget_id)
  ));

  const fallbackBudgets = await Promise.all(missingBudgets.map(async (budget) => {
    try {
      const response = await fetch(`${base}/admin_accounts/get_budget/${budget.budget_id}`);
      if (!response.ok) return null;
      const categories = parseBudgetWorkbookCategories(await response.arrayBuffer());
      if (categories.length === 0) return null;
      return {
        budget_id: budget.budget_id,
        budget_name: budget.budget_name || budget.budget_id,
        categories,
      } satisfies BudgetCategoryBifurcation;
    } catch {
      return null;
    }
  }));

  return [
    ...categoryBudgets,
    ...fallbackBudgets.filter((budget): budget is BudgetCategoryBifurcation => budget !== null),
  ];
};

const CategoryBudgetCard = ({ budget }: { budget: BudgetCategoryBifurcation }) => {
  const totalBudget = budget.categories.reduce((sum, category) => sum + category.total_budget, 0);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{budget.budget_name}</h3>
          <p className="mt-0.5 text-xs font-medium tabular-nums text-slate-500">{formatFinancialAmount(totalBudget)} Total Budget</p>
        </div>
        <Pill tone="blue">{budget.categories.length} Categories</Pill>
      </div>
      <div className="max-h-[420px] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {budget.categories.map((category) => (
            // A visible header strip plus a hairline border/shadow on every tile — so that in a
            // 4-up grid, where one category ends and the next begins is never ambiguous.
            <div key={category.category} className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
              <p
                className="truncate border-b border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-semibold text-slate-900"
                title={category.category.trim()}
              >
                {category.category.trim()}
              </p>
              <div className="grid grid-cols-3 divide-x divide-slate-200">
                <div className="px-2.5 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Budget</p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">{formatFinancialAmount(category.total_budget)}</p>
                </div>
                <div className="px-2.5 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Utilized</p>
                  <p className="mt-1 text-sm font-bold tabular-nums" style={{ color: CATEGORY_UTILIZATION_COLORS.utilized }}>
                    {formatFinancialAmount(Math.max(category.amount_utilized, 0))}
                  </p>
                </div>
                <div className="px-2.5 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Balance</p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-slate-700">{formatFinancialAmount(Math.max(category.remaining, 0))}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};

const CategoryWiseBudgetSection = ({ budgets, loading }: { budgets: BudgetCategoryBifurcation[]; loading: boolean }) => (
  <section className="space-y-3">
    <SectionHeader title="Category-wise Budget Bifurcation" right={<Pill tone="blue">{budgets.length} Budgets</Pill>} />
    {loading ? (
      <Card className="p-5">
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin opacity-50" />
          <p className="text-xs font-bold">Loading category data…</p>
        </div>
      </Card>
    ) : budgets.length === 0 ? (
      <Card className="p-5">
        <div className="flex h-40 items-center justify-center text-sm font-bold text-slate-400">No category data available</div>
      </Card>
    ) : (
      <div className="grid grid-cols-1 gap-4">
        {budgets.map((budget) => (
          <CategoryBudgetCard key={budget.budget_id} budget={budget} />
        ))}
      </div>
    )}
  </section>
);

// ── Crop-wise plot map data (Cultivation Tracker) ──────────────────────────

type LandPlot = {
  plot_id: string;
  plot_name: string;
  plot_area: number;
  plot_coordinates: [number, number][];
  crop_type?: string;
};

type Farm = {
  farm_id: string;
  crop_type: string;
  area: number;
  created_at?: string;
  land_data: {
    land_coordinates: [number, number][];
    village?: string;
    district?: string;
    state?: string;
    farming_option?: string;
  };
  land_plots?: LandPlot[];
  farm_investment_ledger?: { amount: number }[];
  agreement_data?: {
    lease_rent: number;
    agreement_start_date: string;
    agreement_end_date: string;
  };
};

type CropPlotUnit = {
  farmId: string;
  plotId: string;
  cropKey: string;
  area: number;
  coordinates: [number, number][];
};

type ClusterFarmPlot = {
  crop_type?: string;
  plot_name: string;
  plot_area: number;
  plot_id: string;
  plot_coordinates: [number, number][];
};

type ClusterFarm = {
  farm_id: string;
  farm_name?: string | null;
  area?: number;
  plots?: ClusterFarmPlot[];
};

type ClusterBlock = {
  block_id?: string;
  block_name?: string;
  farms?: ClusterFarm[];
};

type ClusterZone = {
  zone_id?: string;
  zone_name?: string;
  blocks?: ClusterBlock[];
};

type ClusterEntry = {
  cluster_id: string;
  cluster_name: string;
  zone?: ClusterZone[];
};

type ClusterCropSummary = {
  clusterId: string;
  clusterName: string;
  totalPlots: number;
  totalFarms: number;
  totalArea: number;
  crops: { key: string; label: string; color: string; count: number; area: number }[];
};

const CROP_COLORS: Record<string, string> = {
  paddy: "var(--crop-paddy-color, #eab308)",
  napier: "var(--crop-napier-color, #22c55e)",
  rahar: "var(--crop-rahar-color, #92400e)",
  unspecified: "#94a3b8",
};
const FALLBACK_CROP_COLORS = ["#2563eb", "#6d28d9", "#0891b2", "#dc2626", "#0f766e"];

const normalizeCropKey = (crop?: string) => (crop && crop.trim() ? crop.trim().toLowerCase() : "unspecified");

const cropLabel = (key: string) => (key === "unspecified" ? "Unspecified" : key.charAt(0).toUpperCase() + key.slice(1));

const cropColor = (key: string, index: number) => CROP_COLORS[key] ?? FALLBACK_CROP_COLORS[index % FALLBACK_CROP_COLORS.length];

// Soft-pastel palette for the Activities x Days week grid — one color per activity, assigned by
// first-seen order so it stays stable across re-renders as long as the set of activities doesn't
// change (cell fill and legend dot both key off the same activityColorFor call).
const ACTIVITY_COLOR_PALETTE = [
  { bg: "#dcfce7", text: "#15803d", dot: "#22c55e" },
  { bg: "#ffedd5", text: "#c2410c", dot: "#f97316" },
  { bg: "#fef9c3", text: "#a16207", dot: "#eab308" },
  { bg: "#ede9fe", text: "#6d28d9", dot: "#8b5cf6" },
  { bg: "#fee2e2", text: "#b91c1c", dot: "#ef4444" },
  { bg: "#dbeafe", text: "#1d4ed8", dot: "#3b82f6" },
  { bg: "#cffafe", text: "#0e7490", dot: "#06b6d4" },
  { bg: "#fce7f3", text: "#be185d", dot: "#ec4899" },
];
const activityColorFor = (index: number) => ACTIVITY_COLOR_PALETTE[index % ACTIVITY_COLOR_PALETTE.length];

const buildCropUnits = (farms: Farm[]): CropPlotUnit[] =>
  farms.flatMap((farm) => {
    if (farm.land_plots && farm.land_plots.length > 0) {
      return farm.land_plots.map((plot) => ({
        farmId: farm.farm_id,
        plotId: plot.plot_id || plot.plot_name,
        cropKey: normalizeCropKey(plot.crop_type || farm.crop_type),
        area: plot.plot_area ?? 0,
        coordinates: plot.plot_coordinates ?? [],
      }));
    }
    return [
      {
        farmId: farm.farm_id,
        plotId: farm.farm_id,
        cropKey: normalizeCropKey(farm.crop_type),
        area: farm.area ?? 0,
        coordinates: farm.land_data?.land_coordinates ?? [],
      },
    ];
  });

const buildClusterCropSummaries = (clusters: ClusterEntry[]): ClusterCropSummary[] =>
  clusters
    .map((cluster) => {
      const byCrop = new Map<string, { count: number; area: number }>();
      let totalPlots = 0;
      let totalFarms = 0;

      (cluster.zone ?? []).forEach((zone) => {
        (zone.blocks ?? []).forEach((block) => {
          const farms = block.farms ?? [];
          totalFarms += farms.length;

          farms.forEach((farm) => {
            const plots = farm.plots ?? [];
            if (plots.length > 0) {
              plots.forEach((plot) => {
                const key = normalizeCropKey(plot.crop_type);
                const existing = byCrop.get(key) ?? { count: 0, area: 0 };
                byCrop.set(key, { count: existing.count + 1, area: existing.area + (plot.plot_area ?? 0) });
                totalPlots += 1;
              });
            } else {
              const existing = byCrop.get("unspecified") ?? { count: 0, area: 0 };
              byCrop.set("unspecified", { count: existing.count + 1, area: existing.area + (farm.area ?? 0) });
              totalPlots += 1;
            }
          });
        });
      });

      const crops = Array.from(byCrop.entries())
        .map(([key, stats], index) => ({ key, label: cropLabel(key), color: cropColor(key, index), ...stats }))
        .sort((a, b) => b.area - a.area);
      const totalArea = crops.reduce((sum, entry) => sum + entry.area, 0);

      return {
        clusterId: cluster.cluster_id,
        clusterName: cluster.cluster_name,
        totalPlots,
        totalFarms,
        totalArea,
        crops,
      };
    })
    .sort((a, b) => b.totalArea - a.totalArea);

const FitBounds = ({ coords }: { coords: [number, number][] }) => {
  const map = useMap();
  useEffect(() => {
    if (coords.length > 0) {
      map.fitBounds(L.latLngBounds(coords as L.LatLngTuple[]), { padding: [16, 16] });
    }
  }, [map, coords]);
  return null;
};

// ── Cultivation calendar (Cultivation Tracker) ─────────────────────────────

type CalendarAssignment = {
  farm_id: string;
  assigned_area: number;
  status?: string;
};

type CalendarActivityRow = {
  activity: string;
  crop_type?: string;
  calander_id: string;
  plan_id?: string;
  assignments: CalendarAssignment[];
};

type CalendarDayMap = Record<string, CalendarActivityRow[]>;

const pad2 = (value: number) => String(value).padStart(2, "0");

const parseCultivationCalendar = (data: {
  plan?: Record<string, { plan_id?: string; date_mapping?: unknown[] }>;
}): CalendarDayMap => {
  const calendar: CalendarDayMap = {};

  Object.entries(data?.plan ?? {}).forEach(([calanderId, plan]) => {
    (plan?.date_mapping ?? []).forEach((activity: any) => {
      const fieldAssignment = activity?.field_assignment ?? {};
      Object.entries(fieldAssignment).forEach(([dateStr, assignments]) => {
        if (!Array.isArray(assignments)) return;
        const rows = calendar[dateStr] ?? (calendar[dateStr] = []);
        rows.push({
          activity: String(activity?.activity ?? ""),
          crop_type: activity?.crop_type ? String(activity.crop_type) : undefined,
          calander_id: calanderId,
          plan_id: plan?.plan_id ? String(plan.plan_id) : undefined,
          assignments: assignments
            .filter((a: any) => a && typeof a === "object")
            .map((a: any) => ({
              farm_id: String(a?.farm_id ?? ""),
              assigned_area: Number(a?.assigned_area) || 0,
              status: a?.status,
            })),
        });
      });
    });
  });

  return calendar;
};

const collectCalanderIds = (calendar: CalendarDayMap): string[] => {
  const ids = new Set<string>();
  Object.values(calendar).forEach((rows) => rows.forEach((row) => row.calander_id && ids.add(row.calander_id)));
  return Array.from(ids);
};

const fetchCropTypesForCalanders = async (base: string, calanderIds: string[]): Promise<Record<string, string>> => {
  const entries = await Promise.all(
    calanderIds.map(async (calanderId) => {
      try {
        const res = await fetch(`${base}/ceo_desk/get_crop_type_of_calander/${calanderId}`);
        const data = await res.json();
        return [calanderId, data?.success && data?.crop_type ? String(data.crop_type) : undefined] as const;
      } catch {
        return [calanderId, undefined] as const;
      }
    }),
  );
  return Object.fromEntries(entries.filter((entry): entry is [string, string] => !!entry[1]));
};

const applyCalanderCropTypes = (calendar: CalendarDayMap, cropTypeByCalanderId: Record<string, string>): CalendarDayMap => {
  const next: CalendarDayMap = {};
  Object.entries(calendar).forEach(([dateStr, rows]) => {
    next[dateStr] = rows.map((row) => ({
      ...row,
      crop_type: cropTypeByCalanderId[row.calander_id] ?? row.crop_type,
    }));
  });
  return next;
};

const normalizeAssignmentStatus = (raw?: string) => {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s || s === "unaasigned") return "unassigned";
  return s;
};

const isCompletedAssignmentStatus = (raw?: string) => {
  const s = normalizeAssignmentStatus(raw);
  return s === "completed" || s === "rental_completed" || s === "contract_farm_completed";
};

const isUnassignedStatus = (raw?: string) => normalizeAssignmentStatus(raw) === "unassigned";

// ── Task timeline (Cultivation Tracker) — one task = one (activity, date, farm, status) ──

type TaskPlotItem = { plot_id: string; plot_name: string; plot_area: number };

type CalendarTask = {
  activity: string;
  cropType?: string;
  date: string;
  farmId: string;
  blockId: string;
  calanderId: string;
  planId?: string;
  status?: string;
  assignedArea: number;
  plots: TaskPlotItem[];
  taskId?: string;
};

type CalendarTaskMap = Record<string, CalendarTask[]>;

const parseCultivationTasks = (data: {
  plan?: Record<string, { plan_id?: string; block_id?: string; date_mapping?: unknown[] }>;
}): CalendarTaskMap => {
  const byDate: Record<string, Map<string, CalendarTask>> = {};

  Object.entries(data?.plan ?? {}).forEach(([calanderId, plan]) => {
    (plan?.date_mapping ?? []).forEach((activity: any) => {
      const fieldAssignment = activity?.field_assignment ?? {};
      Object.entries(fieldAssignment).forEach(([dateStr, rawAssignments]) => {
        if (!Array.isArray(rawAssignments)) return;

        const normalized = rawAssignments
          .filter((a: any) => a && typeof a === "object")
          .map((a: any) => ({
            farmId: String(a?.farm_id ?? "").trim(),
            assignedArea: Number(a?.assigned_area) || 0,
            status: normalizeAssignmentStatus(a?.status),
            taskId: a?.task_id ? String(a.task_id) : undefined,
            plots: Array.isArray(a?.plot)
              ? a.plot.map((p: any) => ({
                  plot_id: String(p?.plot_id ?? ""),
                  plot_name: String(p?.plot_name ?? ""),
                  plot_area: Number(p?.plot_area) || 0,
                }))
              : ([] as TaskPlotItem[]),
          }))
          .filter((a) => !!a.farmId);

        const byFarm = new Map<string, CalendarTask>();
        normalized.forEach((a) => {
          const key = `${a.farmId}__${a.status}`;
          const existing = byFarm.get(key);
          if (!existing) {
            byFarm.set(key, {
              activity: String(activity?.activity ?? ""),
              cropType: activity?.crop_type ? String(activity.crop_type) : undefined,
              date: dateStr,
              farmId: a.farmId,
              blockId: String(plan?.block_id ?? ""),
              calanderId,
              planId: plan?.plan_id ? String(plan.plan_id) : undefined,
              status: a.status,
              assignedArea: a.assignedArea,
              plots: a.plots,
              taskId: a.taskId,
            });
            return;
          }
          const existingPlotIds = new Set(existing.plots.map((p) => p.plot_id));
          byFarm.set(key, {
            ...existing,
            assignedArea: existing.assignedArea + a.assignedArea,
            plots: [...existing.plots, ...a.plots.filter((p) => !existingPlotIds.has(p.plot_id))],
            taskId: existing.taskId ?? a.taskId,
          });
        });

        const rows = byDate[dateStr] ?? (byDate[dateStr] = new Map());
        byFarm.forEach((task, farmStatusKey) => {
          rows.set(`${calanderId}__${activity?.index ?? ""}__${task.activity}__${farmStatusKey}`, task);
        });
      });
    });
  });

  const result: CalendarTaskMap = {};
  Object.entries(byDate).forEach(([dateStr, map]) => {
    result[dateStr] = Array.from(map.values());
  });
  return result;
};

const applyTaskCropTypes = (tasks: CalendarTaskMap, cropTypeByCalanderId: Record<string, string>): CalendarTaskMap => {
  const next: CalendarTaskMap = {};
  Object.entries(tasks).forEach(([dateStr, rows]) => {
    next[dateStr] = rows.map((row) => ({ ...row, cropType: cropTypeByCalanderId[row.calanderId] ?? row.cropType }));
  });
  return next;
};

type ActivityAcreageSummary = {
  activity: string;
  totalAcres: number;
  completedAcres: number;
  pendingAcres: number;
  unallocatedAcres: number;
  taskCount: number;
};

const buildActivitySummaries = (calendarData: CalendarDayMap, dateKeys: Set<string>, cropFilter: string | null) => {
  const byActivity = new Map<string, ActivityAcreageSummary>();
  const cropKeysSeen = new Set<string>();
  let totalTasks = 0;
  let totalAcres = 0;

  Object.entries(calendarData).forEach(([dateStr, rows]) => {
    if (!dateKeys.has(dateStr)) return;

    rows.forEach((row) => {
      const cropKey = normalizeCropKey(row.crop_type);
      cropKeysSeen.add(cropKey);
      if (cropFilter && cropKey !== cropFilter) return;

      const existing = byActivity.get(row.activity) ?? {
        activity: row.activity,
        totalAcres: 0,
        completedAcres: 0,
        pendingAcres: 0,
        unallocatedAcres: 0,
        taskCount: 0,
      };

      row.assignments.forEach((a) => {
        const acres = a.assigned_area || 0;
        existing.totalAcres += acres;
        existing.taskCount += 1;
        totalTasks += 1;
        totalAcres += acres;

        if (isUnassignedStatus(a.status)) existing.unallocatedAcres += acres;
        else if (isCompletedAssignmentStatus(a.status)) existing.completedAcres += acres;
        else existing.pendingAcres += acres;
      });

      byActivity.set(row.activity, existing);
    });
  });

  const summaries = Array.from(byActivity.values()).sort((a, b) => b.totalAcres - a.totalAcres);
  return { summaries, totalTasks, totalAcres, cropOptions: Array.from(cropKeysSeen).sort() };
};

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const addDays = (date: Date, delta: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + delta);
  return next;
};
const startOfWeekMonday = (date: Date) => {
  const day = date.getDay(); // 0 = Sunday
  return addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), day === 0 ? -6 : 1 - day);
};
const toDateKey = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekDateKeys = (weekStart: Date) => new Set(Array.from({ length: 7 }, (_, i) => toDateKey(addDays(weekStart, i))));
const formatWeekRangeLabel = (weekStart: Date) => {
  const weekEnd = addDays(weekStart, 6);
  const startLabel = weekStart.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const endLabel = weekEnd.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
};

// The Cultivation Tracker always opens on the third week of June (the cultivation season's
// start), regardless of today's date. "Today" in the week nav still jumps to the current week.
const cultivationTrackerDefaultWeek = () => startOfWeekMonday(new Date(new Date().getFullYear(), 5, 15));

// Activities x Days week grid: one row per activity active this week, one cell per day showing
// total acres + distinct farm count for that activity on that day — the CEO-facing view a
// week-at-a-glance planner needs, versus the old day-grid-of-events month calendar.
const CultivationCalendarCard = ({
  calendarData,
  loading,
  weekStart,
  onWeekChange,
  onOpenPlanner,
}: {
  calendarData: CalendarDayMap;
  loading: boolean;
  weekStart: Date;
  onWeekChange: (weekStart: Date) => void;
  onOpenPlanner: (monthDate: Date) => void;
}) => {
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const monthLabel = weekStart.toLocaleString("default", { month: "long", year: "numeric" });

  const goWeek = (delta: number) => onWeekChange(addDays(weekStart, delta * 7));
  const goToday = () => onWeekChange(startOfWeekMonday(new Date()));

  const { activityRows, cellsByActivity } = useMemo(() => {
    const order: string[] = [];
    const seen = new Set<string>();
    const cells = new Map<string, Map<string, { acres: number; farmIds: Set<string> }>>();

    weekDates.forEach((date) => {
      const dateKey = toDateKey(date);
      (calendarData[dateKey] ?? []).forEach((row) => {
        if (!seen.has(row.activity)) {
          seen.add(row.activity);
          order.push(row.activity);
        }
        const byDate = cells.get(row.activity) ?? new Map();
        const cell = byDate.get(dateKey) ?? { acres: 0, farmIds: new Set<string>() };
        row.assignments.forEach((a) => {
          cell.acres += a.assigned_area || 0;
          if (a.farm_id) cell.farmIds.add(a.farm_id);
        });
        byDate.set(dateKey, cell);
        cells.set(row.activity, byDate);
      });
    });

    return { activityRows: order, cellsByActivity: cells };
  }, [calendarData, weekDates]);

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goWeek(-1)}
            aria-label="Previous week"
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="text-base font-black text-slate-950">{monthLabel}</h2>
          <button
            type="button"
            onClick={() => goWeek(1)}
            aria-label="Next week"
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 transition-colors hover:bg-slate-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => onOpenPlanner(weekStart)}
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700 transition-colors hover:bg-blue-100"
          >
            Open Planner
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin opacity-50" />
          <p className="text-xs font-bold">Loading calendar…</p>
        </div>
      ) : activityRows.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm font-bold text-slate-400">
          No cultivation activity scheduled this week
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            {/* A flat grid (not nested per-row grids) so every cell's border lines up into one
                continuous mesh — the "grid checkers" look, like a real spreadsheet/calendar. */}
            <div className="grid min-w-[720px] grid-cols-[minmax(140px,1fr)_repeat(7,minmax(80px,1fr))] overflow-hidden rounded-lg border border-slate-200">
              <div className="border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                Activities
              </div>
              {weekDates.map((date, index) => (
                <div
                  key={toDateKey(date)}
                  className={cn(
                    "border-b border-slate-200 bg-slate-50 px-2 py-2 text-center text-[11px] font-black text-slate-600",
                    index < 6 && "border-r",
                  )}
                >
                  {date.getDate()} <span className="font-bold text-slate-400">{WEEKDAY_SHORT[index]}</span>
                </div>
              ))}

              {activityRows.map((activity, rowIndex) => {
                const palette = activityColorFor(rowIndex);
                const byDate = cellsByActivity.get(activity);
                const isLastRow = rowIndex === activityRows.length - 1;
                return (
                  <Fragment key={activity}>
                    <div
                      className={cn("flex items-center border-r border-slate-200 px-3 py-2", !isLastRow && "border-b")}
                    >
                      <span className="truncate text-xs font-bold text-slate-700" title={activity}>
                        {activity}
                      </span>
                    </div>
                    {weekDates.map((date, index) => {
                      const dateKey = toDateKey(date);
                      const cell = byDate?.get(dateKey);
                      const farmCount = cell?.farmIds.size ?? 0;
                      return (
                        <div
                          key={dateKey}
                          className={cn(
                            "flex h-14 items-center justify-center p-1.5",
                            !isLastRow && "border-b border-slate-100",
                            index < 6 && "border-r border-slate-100",
                          )}
                        >
                          {cell && cell.acres > 0 && (
                            <div
                              className="flex h-full w-full flex-col items-center justify-center rounded-md text-[11px] font-black leading-tight"
                              style={{ backgroundColor: palette.bg, color: palette.text }}
                            >
                              <span>{Math.round(cell.acres)} ac</span>
                              <span className="font-bold opacity-80">
                                {farmCount} farm{farmCount === 1 ? "" : "s"}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </Fragment>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-slate-100 pt-4">
            {activityRows.map((activity, index) => (
              <span key={activity} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: activityColorFor(index).dot }} />
                {activity}
              </span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
};

const activityIconFor = (activity: string) => {
  const key = activity.trim().toLowerCase();
  if (key.includes("plough")) return Tractor;
  if (key.includes("sow") || key.includes("bed")) return Shovel;
  if (key.includes("irrig")) return Droplets;
  if (key.includes("fert") || key.includes("weed") || key.includes("herb") || key.includes("spray")) return Leaf;
  if (key.includes("harvest")) return Wheat;
  return ClipboardList;
};

const activityCompletionTone = (completion: number) => {
  if (completion >= 100) return { ring: "#16a34a", track: "#dcfce7", badge: "bg-emerald-100 text-emerald-700" };
  if (completion > 0) return { ring: "#f59e0b", track: "#fef3c7", badge: "bg-amber-100 text-amber-700" };
  return { ring: "#94a3b8", track: "#e2e8f0", badge: "bg-slate-200 text-slate-600" };
};

const CropActivitySummaryCard = ({
  calendarData,
  loading,
  weekStart,
  farms,
  farmerNames,
}: {
  calendarData: CalendarDayMap;
  loading: boolean;
  weekStart: Date;
  farms: Farm[];
  farmerNames: Record<string, string>;
}) => {
  const [cropFilter, setCropFilter] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);

  // Same 7 dates the Activities x Days calendar to the left is showing — so this card only ever
  // lists activities actually visible in that week, never the whole month's worth.
  const dateKeys = useMemo(() => weekDateKeys(weekStart), [weekStart]);

  const { summaries, totalTasks, totalAcres, cropOptions } = useMemo(
    () => buildActivitySummaries(calendarData, dateKeys, cropFilter),
    [calendarData, dateKeys, cropFilter],
  );

  const activityLandDetails = useMemo(() => {
    if (!selectedActivity) return [];
    const farmsById = new Map(farms.map((farm) => [farm.farm_id, farm]));
    const byFarm = new Map<string, {
      farmId: string;
      ownerName: string;
      location: string;
      crop: string;
      planned: number;
      workDone: number;
      taskCount: number;
    }>();

    Object.entries(calendarData).forEach(([dateStr, rows]) => {
      if (!dateKeys.has(dateStr)) return;
      rows.forEach((row) => {
        const cropKey = normalizeCropKey(row.crop_type);
        if (row.activity !== selectedActivity || (cropFilter && cropKey !== cropFilter)) return;
        row.assignments.forEach((assignment) => {
          if (!assignment.farm_id) return;
          const farm = farmsById.get(assignment.farm_id);
          const existing = byFarm.get(assignment.farm_id) ?? {
            farmId: assignment.farm_id,
            ownerName: farmerNames[assignment.farm_id] || "Land owner not recorded",
            location: [farm?.land_data?.village, farm?.land_data?.district].filter(Boolean).join(", ") || "Location not recorded",
            crop: cropLabel(cropKey),
            planned: 0,
            workDone: 0,
            taskCount: 0,
          };
          const acres = Math.max(0, Number(assignment.assigned_area) || 0);
          existing.planned += acres;
          if (isCompletedAssignmentStatus(assignment.status)) existing.workDone += acres;
          existing.taskCount += 1;
          byFarm.set(assignment.farm_id, existing);
        });
      });
    });

    return Array.from(byFarm.values())
      .map((land) => ({ ...land, balance: Math.max(0, land.planned - land.workDone) }))
      .sort((first, second) => second.balance - first.balance || second.planned - first.planned || first.ownerName.localeCompare(second.ownerName));
  }, [calendarData, cropFilter, dateKeys, farmerNames, farms, selectedActivity]);

  const selectedSummary = summaries.find((summary) => summary.activity === selectedActivity);
  const formatAcres = (value: number) => `${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ac`;

  return (
    <Card className="p-5">
      <div className="mb-4">
        <h2 className="text-base font-black text-slate-950">Crop-Wise Activity Summary</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Allocated versus completed acres by activity, {formatWeekRangeLabel(weekStart)}.
        </p>
      </div>

      {loading ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin opacity-50" />
          <p className="text-xs font-bold">Loading activity data…</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-center">
              <p className="text-lg font-black text-slate-950">{summaries.length}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">Activity Types</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-center">
              <p className="text-lg font-black text-slate-950">{totalTasks}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">Total Tasks</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-center">
              <p className="text-lg font-black text-slate-950">{Math.round(totalAcres)} ac</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">Total Acres</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCropFilter(null)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-black transition-colors",
                cropFilter === null ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50",
              )}
            >
              All Crops
            </button>
            {cropOptions.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setCropFilter(key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-black transition-colors",
                  cropFilter === key ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50",
                )}
              >
                {cropLabel(key)}
              </button>
            ))}
          </div>

          {summaries.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm font-bold text-slate-400">No activities scheduled this month</div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {summaries.map((item) => {
                const completion = item.totalAcres > 0 ? Math.round((item.completedAcres / item.totalAcres) * 100) : 0;
                const tone = activityCompletionTone(completion);
                const Icon = activityIconFor(item.activity);

                return (
                  <div
                    key={item.activity}
                    className="relative rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedActivity(item.activity)}
                      className="absolute right-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-[#0D3A35]/15 bg-[#0D3A35]/5 text-[#0D3A35] transition hover:bg-[#0D3A35] hover:text-white"
                      aria-label={`View land details for ${item.activity}`}
                      title="View land-wise details"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                    <div className="flex items-center gap-3 pr-7">
                      <KpiPieChart value={completion} color={tone.ring} trackColor={tone.track} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full", tone.badge)}>
                            <Icon className="h-3 w-3" />
                          </span>
                          <p className="break-words text-xs font-black leading-4 text-slate-950">{item.activity}</p>
                        </div>
                        <p className="mt-1 text-[11px] font-bold text-slate-500">
                          {Math.round(item.totalAcres)} ac · {item.taskCount} tasks
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                      <div className="rounded-lg bg-amber-50 px-1.5 py-1.5">
                        <p className="text-[9px] font-black uppercase tracking-[0.04em] text-amber-700">Planned</p>
                        <p className="text-xs font-black text-amber-800">{Math.round(item.totalAcres)} ac</p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 px-1.5 py-1.5">
                        <p className="text-[9px] font-black uppercase tracking-[0.04em] text-emerald-700">Work Done</p>
                        <p className="text-xs font-black text-emerald-800">{Math.round(item.completedAcres)} ac</p>
                      </div>
                      <div className="rounded-lg bg-slate-200/70 px-1.5 py-1.5">
                        <p className="text-[9px] font-black uppercase tracking-[0.04em] text-slate-600">Balance</p>
                        <p className="text-xs font-black text-slate-700">{Math.round(Math.max(0, item.totalAcres - item.completedAcres))} ac</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <Dialog open={!!selectedActivity} onOpenChange={(open) => { if (!open) setSelectedActivity(null); }}>
        <DialogContent className="flex max-h-[88vh] w-[calc(100vw-2rem)] max-w-5xl flex-col overflow-hidden rounded-2xl border-0 p-0 shadow-2xl">
          <DialogHeader className="shrink-0 bg-[#0D3A35] px-6 py-5 text-left text-white">
            <DialogTitle className="text-xl font-black text-white">{selectedActivity || "Activity"} — Land Details</DialogTitle>
            <p className="mt-1 text-sm font-medium text-white/70">
              {formatWeekRangeLabel(weekStart)}
              {cropFilter ? ` · ${cropLabel(cropFilter)}` : " · All Crops"}
            </p>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto bg-slate-50 p-5">
            <div className="grid grid-cols-3 gap-3">
              {[
                ["Planned", selectedSummary?.totalAcres ?? 0, "bg-amber-50 text-amber-800"],
                ["Work Done", selectedSummary?.completedAcres ?? 0, "bg-emerald-50 text-emerald-800"],
                ["Balance", Math.max(0, (selectedSummary?.totalAcres ?? 0) - (selectedSummary?.completedAcres ?? 0)), "bg-slate-200 text-slate-700"],
              ].map(([label, value, style]) => (
                <div key={String(label)} className={cn("rounded-xl px-4 py-3 text-center", String(style))}>
                  <p className="text-[10px] font-black uppercase tracking-wider opacity-75">{label}</p>
                  <p className="mt-1 text-lg font-black">{formatAcres(Number(value))}</p>
                </div>
              ))}
            </div>

            <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100/80 px-4 py-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900">Land-wise Progress</h3>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">{activityLandDetails.length} land parcel{activityLandDetails.length === 1 ? "" : "s"}</p>
                </div>
              </div>
              {activityLandDetails.length === 0 ? (
                <div className="grid h-40 place-items-center text-sm font-bold text-slate-400">No land assignments recorded</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] table-fixed text-left">
                    <thead className="bg-[#0D3A35] text-[10px] uppercase tracking-wider text-white/80">
                      <tr>
                        <th className="w-[22%] px-4 py-3 text-center">Land Owner</th>
                        <th className="w-[14%] px-4 py-3 text-center">Land ID</th>
                        <th className="w-[18%] px-4 py-3 text-center">Location</th>
                        <th className="w-[12%] px-4 py-3 text-center">Crop</th>
                        <th className="w-[11%] px-4 py-3 text-center">Planned</th>
                        <th className="w-[11%] px-4 py-3 text-center">Work Done</th>
                        <th className="w-[12%] px-4 py-3 text-center">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activityLandDetails.map((land) => (
                        <tr key={land.farmId} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm font-bold text-slate-900">{land.ownerName}</td>
                          <td className="px-4 py-3 text-center text-xs font-bold text-[#0D3A35]">{land.farmId}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-slate-600">{land.location}</td>
                          <td className="px-4 py-3 text-center text-xs font-bold text-slate-700">{land.crop}</td>
                          <td className="px-4 py-3 text-center text-xs font-black text-amber-700">{formatAcres(land.planned)}</td>
                          <td className="px-4 py-3 text-center text-xs font-black text-emerald-700">{formatAcres(land.workDone)}</td>
                          <td className="px-4 py-3 text-center text-xs font-black text-slate-700">{formatAcres(land.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

const ClusterCropRow = ({ cluster }: { cluster: ClusterCropSummary }) => (
  <div className="rounded-lg bg-slate-50 p-3">
    <div className="flex items-center gap-3">
      <div className="relative h-16 w-16 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={cluster.crops} dataKey="area" nameKey="label" innerRadius={18} outerRadius={30} paddingAngle={2}>
              {cluster.crops.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number, _name, item) => [`${Math.round(value)} ac`, item?.payload?.label]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-black text-slate-950">{cluster.clusterName}</p>
        <p className="text-[11px] font-bold text-slate-500">
          {Math.round(cluster.totalArea)} ac · {cluster.totalFarms} farms
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {cluster.crops.map((entry) => (
            <span key={entry.key} className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.label} {Math.round(entry.area)} ac
            </span>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const CropDivisionCard = ({
  units,
  loading,
  selectedCrop,
  onSelectCrop,
  clusterSummaries = [],
  clusterLoading = false,
}: {
  units: CropPlotUnit[];
  loading: boolean;
  selectedCrop: string | null;
  onSelectCrop: (crop: string | null) => void;
  clusterSummaries?: ClusterCropSummary[];
  clusterLoading?: boolean;
}) => {
  const cropSummary = useMemo(() => {
    const byCrop = new Map<string, { count: number; area: number }>();
    units.forEach((unit) => {
      const existing = byCrop.get(unit.cropKey) ?? { count: 0, area: 0 };
      byCrop.set(unit.cropKey, { count: existing.count + 1, area: existing.area + unit.area });
    });
    return Array.from(byCrop.entries())
      .map(([key, stats], index) => ({ key, label: cropLabel(key), color: cropColor(key, index), ...stats }))
      .sort((a, b) => b.area - a.area);
  }, [units]);

  const totalPlots = units.length;
  const totalFarms = new Set(units.map((unit) => unit.farmId)).size;
  const totalArea = cropSummary.reduce((sum, entry) => sum + entry.area, 0);

  return (
    <Card className="p-5">
      <SectionHeader
        title="Crop Division by Area"
        right={<Pill tone="blue">{Math.round(totalArea)} ac · {totalFarms} Parcels</Pill>}
      />
      {loading ? (
        <div className="flex h-56 flex-col items-center justify-center gap-2 text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin opacity-50" />
          <p className="text-xs font-bold">Loading plot data…</p>
        </div>
      ) : totalPlots === 0 ? (
        <div className="flex h-56 items-center justify-center text-sm font-bold text-slate-400">No plot data available</div>
      ) : (
        <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[200px_1fr]">
          <div className="relative h-52">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={cropSummary}
                  dataKey="area"
                  nameKey="label"
                  innerRadius={62}
                  outerRadius={92}
                  paddingAngle={2}
                  onClick={(entry) => onSelectCrop(selectedCrop === entry.key ? null : entry.key)}
                >
                  {cropSummary.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={entry.color}
                      className="cursor-pointer"
                      opacity={selectedCrop && selectedCrop !== entry.key ? 0.35 : 1}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number, _name, item) => [`${Math.round(value)} ac`, item?.payload?.label]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-3xl font-black text-slate-950">{Math.round(totalArea)}</p>
              <p className="text-xs font-bold text-slate-600">Total Acres</p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            {cropSummary.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => onSelectCrop(selectedCrop === entry.key ? null : entry.key)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                  selectedCrop === entry.key ? "bg-slate-100 ring-1 ring-slate-300" : "hover:bg-slate-50",
                )}
              >
                <span className="flex items-center gap-2 font-bold text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  {entry.label}
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="font-black text-slate-950">{Math.round(entry.area)} ac</span>
                  <span className="text-xs font-bold text-slate-500">{entry.count} plots</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-slate-500">Cluster-wise Crop Distribution</p>
        {clusterLoading ? (
          <div className="flex h-24 flex-col items-center justify-center gap-2 text-slate-400">
            <RefreshCw className="h-5 w-5 animate-spin opacity-50" />
            <p className="text-xs font-bold">Loading clusters…</p>
          </div>
        ) : clusterSummaries.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-xs font-bold text-slate-400">No cluster data available</div>
        ) : (
          <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
            {clusterSummaries.map((cluster) => (
              <ClusterCropRow key={cluster.clusterId} cluster={cluster} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

const DIMMED_COLOR = "#94a3b8";

const FarmPlotPreviewCard = ({
  farm,
  ownerName,
  selectedCrop,
  cropIndex,
}: {
  farm: Farm;
  ownerName?: string;
  selectedCrop: string | null;
  cropIndex: Map<string, number>;
}) => {
  const landCoords = farm.land_data?.land_coordinates ?? [];
  const plots = farm.land_plots ?? [];
  const hasPlots = plots.length > 0;

  const allCoords: [number, number][] = [...landCoords, ...plots.flatMap((plot) => plot.plot_coordinates ?? [])];
  const center: [number, number] =
    allCoords.length > 0
      ? [allCoords.reduce((sum, c) => sum + c[0], 0) / allCoords.length, allCoords.reduce((sum, c) => sum + c[1], 0) / allCoords.length]
      : [20.5937, 78.9629];

  const matchingCount = hasPlots
    ? plots.filter((plot) => normalizeCropKey(plot.crop_type || farm.crop_type) === selectedCrop).length
    : normalizeCropKey(farm.crop_type) === selectedCrop
      ? 1
      : 0;
  const cropNames = Array.from(new Set((hasPlots ? plots.map((plot) => plot.crop_type || farm.crop_type) : [farm.crop_type]).map((crop) => cropLabel(normalizeCropKey(crop))))).filter(Boolean);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="h-40 w-full bg-slate-900">
        {landCoords.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-slate-500">
            <MapPinned className="h-6 w-6 opacity-40" />
            <span className="text-[10px] font-bold">No coordinates</span>
          </div>
        ) : (
          <MapContainer
            key={farm.farm_id}
            center={center}
            zoom={14}
            style={{ height: "100%", width: "100%" }}
            zoomControl={false}
            dragging={false}
            scrollWheelZoom={false}
            doubleClickZoom={false}
            touchZoom={false}
            attributionControl={false}
          >
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
            {landCoords.length >= 3 && (
              <Polygon
                positions={landCoords}
                pathOptions={{ color: "var(--land-boundary-color, #fde047)", fillColor: "var(--land-boundary-fill, #fef9c3)", fillOpacity: 0.28, weight: 3 }}
              />
            )}
            {hasPlots &&
              plots.map((plot, index) => {
                if ((plot.plot_coordinates?.length ?? 0) < 3) return null;
                const key = normalizeCropKey(plot.crop_type || farm.crop_type);
                const isMatch = !selectedCrop || key === selectedCrop;
                const color = isMatch ? cropColor(key, cropIndex.get(key) ?? index) : DIMMED_COLOR;
                return (
                  <Polygon
                    key={plot.plot_id || plot.plot_name || index}
                    positions={plot.plot_coordinates}
                    pathOptions={{ color, fillColor: color, fillOpacity: isMatch ? 0.55 : 0.12, weight: isMatch ? 2.5 : 1 }}
                  />
                );
              })}
            <FitBounds coords={allCoords} />
          </MapContainer>
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-xs font-black text-slate-950">{ownerName || "Land owner not recorded"}</p>
        <p className="mt-1 truncate font-mono text-[11px] font-bold text-slate-600">Land ID: {farm.farm_id}</p>
        <p className="mt-0.5 truncate text-[11px] font-bold text-emerald-700">Crop: {cropNames.join(", ") || "Unspecified"}</p>
        <p className="mt-0.5 text-[11px] font-bold text-slate-500">
          {hasPlots ? `${plots.length} plots` : "No plots marked"} · {Math.round(farm.area ?? 0)} ac
          {selectedCrop && ` · ${matchingCount} matching`}
        </p>
      </div>
    </div>
  );
};

const PlotMapViewerCard = ({
  farms,
  farmerNames,
  units,
  loading,
  selectedCrop,
  onClear,
}: {
  farms: Farm[];
  farmerNames: Record<string, string>;
  units: CropPlotUnit[];
  loading: boolean;
  selectedCrop: string | null;
  onClear: () => void;
}) => {
  const cropIndex = useMemo(() => {
    const keys = Array.from(new Set(units.map((unit) => unit.cropKey)));
    return new Map(keys.map((key, index) => [key, index]));
  }, [units]);

  const visibleFarms = useMemo(() => {
    if (!selectedCrop) return farms;
    return farms.filter((farm) => {
      const plots = farm.land_plots ?? [];
      if (plots.length > 0) {
        return plots.some((plot) => normalizeCropKey(plot.crop_type || farm.crop_type) === selectedCrop);
      }
      return normalizeCropKey(farm.crop_type) === selectedCrop;
    });
  }, [farms, selectedCrop]);

  return (
    <Card className="overflow-hidden p-5">
      <SectionHeader
        title="Plot & Farm Map Viewer"
        right={
          selectedCrop ? (
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
            >
              Showing: {cropLabel(selectedCrop)} &times;
            </button>
          ) : (
            <Pill tone="blue">All Crops</Pill>
          )
        }
      />
      {loading ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin opacity-50" />
          <p className="text-xs font-bold">Loading farm maps…</p>
        </div>
      ) : visibleFarms.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-slate-400">
          <MapPinned className="h-8 w-8 opacity-40" />
          <p className="text-xs font-bold">No farms match this crop</p>
        </div>
      ) : (
        <div className="grid max-h-[420px] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
          {visibleFarms.map((farm) => (
            <FarmPlotPreviewCard key={farm.farm_id} farm={farm} ownerName={farmerNames[farm.farm_id]} selectedCrop={selectedCrop} cropIndex={cropIndex} />
          ))}
        </div>
      )}
      <p className="mt-2 text-xs font-semibold text-slate-500">
        {selectedCrop
          ? `${visibleFarms.length} farm(s) have plots marked for ${cropLabel(selectedCrop)}. Click the crop again to clear.`
          : "Click a crop in Crop Division to isolate its farms and highlight matching plots."}
      </p>
    </Card>
  );
};

const CLUSTER_MAP_COLORS = ["#2563eb", "#16a34a", "#f97316", "#7c3aed", "#dc2626", "#0891b2", "#ca8a04", "#db2777"];

type LandCluster = { key: string; clusterName: string; farmIds: Set<string> };

// Flattens the cluster -> zone -> block -> farm hierarchy down to one row per cluster — every
// farm under any of its zones/blocks counts, since the selector picks a whole cluster at a time.
const buildLandClusters = (clusters: ClusterEntry[]): LandCluster[] =>
  clusters
    .map((cluster) => {
      const key = cluster.cluster_id || cluster.cluster_name || "";
      if (!key) return null;
      const farmIds = new Set<string>();
      (cluster.zone ?? []).forEach((zone) => {
        (zone.blocks ?? []).forEach((block) => {
          (block.farms ?? []).forEach((farm) => {
            if (farm.farm_id) farmIds.add(farm.farm_id);
          });
        });
      });
      return { key, clusterName: cluster.cluster_name || key, farmIds } satisfies LandCluster;
    })
    .filter((entry): entry is LandCluster => entry !== null)
    .sort((a, b) => a.clusterName.localeCompare(b.clusterName));

// Cluster-by-cluster land map — pick a cluster, see every land parcel that sits inside it on one
// shared map, instead of the old static "Land Progress Overview" donut.
// A small pill icon showing "X ac" straight on the map — no image assets needed (unlike Leaflet's
// default marker), and always legible against the imagery basemap without a click.
const acreageDivIcon = (acres: number, color: string) =>
  L.divIcon({
    className: "",
    html: `<div style="display:inline-flex;align-items:center;background:${color};color:#fff;font:800 11px/1 sans-serif;padding:3px 7px;border-radius:9999px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.45);white-space:nowrap;transform:translate(-50%,-50%);">${acres.toFixed(1)} ac</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

const ClusterLandMapCard = ({ farms, clusterList, loading }: { farms: Farm[]; clusterList: ClusterEntry[]; loading: boolean }) => {
  const clusters = useMemo(() => buildLandClusters(clusterList), [clusterList]);
  const [selectedClusterKey, setSelectedClusterKey] = useState<string | null>(null);
  const activeCluster = clusters.find((cluster) => cluster.key === selectedClusterKey) ?? clusters[0] ?? null;

  const clusterFarms = useMemo(() => {
    if (!activeCluster) return [];
    return farms.filter((farm) => activeCluster.farmIds.has(farm.farm_id));
  }, [farms, activeCluster]);

  const allCoords = useMemo(() => clusterFarms.flatMap((farm) => farm.land_data?.land_coordinates ?? []), [clusterFarms]);
  const center: [number, number] = useMemo(
    () =>
      allCoords.length > 0
        ? [allCoords.reduce((sum, c) => sum + c[0], 0) / allCoords.length, allCoords.reduce((sum, c) => sum + c[1], 0) / allCoords.length]
        : [20.5937, 78.9629],
    [allCoords],
  );
  const totalClusterArea = clusterFarms.reduce((sum, farm) => sum + (Number(farm.area) || 0), 0);

  // Radius big enough to enclose every land's farthest coordinate from the cluster's centroid,
  // plus 15% breathing room — draws one boundary circle around the whole cluster, not per-land.
  const clusterRadiusMeters = useMemo(() => {
    if (allCoords.length === 0) return 0;
    const centerLatLng = L.latLng(center[0], center[1]);
    const maxDistance = allCoords.reduce((max, coord) => Math.max(max, centerLatLng.distanceTo(L.latLng(coord[0], coord[1]))), 0);
    return maxDistance * 1.15 + 40;
  }, [allCoords, center]);

  return (
    <Card className="p-5">
      <SectionHeader title="Cluster-wise Land Map" right={<Pill tone="blue">{clusters.length} Clusters</Pill>} />
      {loading ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin opacity-50" />
          <p className="text-xs font-bold">Loading clusters…</p>
        </div>
      ) : clusters.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm font-bold text-slate-400">No cluster data available</div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {clusters.map((cluster) => (
              <button
                key={cluster.key}
                type="button"
                onClick={() => setSelectedClusterKey(cluster.key)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-black transition-colors",
                  activeCluster?.key === cluster.key ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50",
                )}
              >
                {cluster.clusterName}
              </button>
            ))}
          </div>

          {clusterFarms.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center gap-2 text-slate-400">
              <MapPinned className="h-8 w-8 opacity-40" />
              <p className="text-xs font-bold">No lands mapped for this cluster yet</p>
            </div>
          ) : (
            <div className="h-72 overflow-hidden rounded-lg">
              <MapContainer
                key={activeCluster?.key}
                center={center}
                zoom={13}
                style={{ height: "100%", width: "100%" }}
                zoomControl={false}
                attributionControl={false}
              >
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
                {/* Transparent overlay of real town/village/road names + boundaries on top of the
                    satellite imagery above — the imagery layer alone carries no labels at all. */}
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                />

                {clusterRadiusMeters > 0 && (
                  <Circle
                    center={center}
                    radius={clusterRadiusMeters}
                    pathOptions={{ color: "#facc15", fillColor: "#facc15", fillOpacity: 0.05, weight: 2.5, dashArray: "8 5" }}
                  />
                )}

                {clusterFarms.map((farm, index) => {
                  const coords = farm.land_data?.land_coordinates ?? [];
                  if (coords.length < 3) return null;
                  const color = CLUSTER_MAP_COLORS[index % CLUSTER_MAP_COLORS.length];
                  const farmCenter: [number, number] = [
                    coords.reduce((sum, c) => sum + c[0], 0) / coords.length,
                    coords.reduce((sum, c) => sum + c[1], 0) / coords.length,
                  ];
                  const location =
                    [farm.land_data?.village, farm.land_data?.district, farm.land_data?.state].filter(Boolean).join(", ") ||
                    "Location not recorded";

                  return (
                    <Fragment key={farm.farm_id}>
                      <Polygon positions={coords} pathOptions={{ color, fillColor: color, fillOpacity: 0.35, weight: 2 }} />
                      <Marker position={farmCenter} icon={acreageDivIcon(Number(farm.area) || 0, color)}>
                        <Popup>
                          <div className="space-y-0.5 text-xs">
                            <p className="font-black text-slate-900">{farm.farm_id}</p>
                            <p className="font-semibold text-slate-600">{location}</p>
                            <p className="font-bold text-slate-800">{(Number(farm.area) || 0).toFixed(1)} ac</p>
                          </div>
                        </Popup>
                      </Marker>
                    </Fragment>
                  );
                })}

                <FitBounds coords={allCoords} />
              </MapContainer>
            </div>
          )}

          <p className="mt-2 text-xs font-semibold text-slate-500">
            {activeCluster?.clusterName}: {clusterFarms.length} land(s) · {totalClusterArea.toFixed(1)} ac
          </p>
        </>
      )}
    </Card>
  );
};

// ── Project Map (Project Map tab) ─────────────────────────────────────────
// India gas-pipeline infrastructure routes, filtered from the GEM Global Gas Infrastructure
// Tracker into public/india_pipelines.geojson (see scripts/filter-india-pipelines.mjs).

type PipelineGeometry =
  | { type: "LineString"; coordinates: [number, number][] }
  | { type: "MultiLineString"; coordinates: [number, number][][] };

type PipelineFeature = { type: "Feature"; properties: Record<string, string>; geometry: PipelineGeometry };

type PipelineCollection = { type: "FeatureCollection"; features: PipelineFeature[] };

const PIPELINE_STATUS_STYLE: Record<string, { label: string; color: string }> = {
  operating: { label: "Operating", color: "#16a34a" },
  construction: { label: "Under Construction", color: "#2563eb" },
  proposed: { label: "Proposed", color: "#9333ea" },
  shelved: { label: "Shelved", color: "#f59e0b" },
  cancelled: { label: "Cancelled", color: "#ef4444" },
  retired: { label: "Retired", color: "#64748b" },
};

const pipelineStatusStyle = (status?: string) =>
  PIPELINE_STATUS_STYLE[(status ?? "").toLowerCase()] ?? { label: status || "Unknown", color: "#64748b" };

// Surveyed junction points on the pipeline network — decimal degrees converted from the
// field DMS coordinates (full precision; ~1 mm).
const JUNCTION_POINTS: { label: string; position: [number, number]; dms: string }[] = [
  { label: "SV30", position: [21.11312778, 80.50902222], dms: `21°06'47.26"N 80°30'32.48"E` },
  { label: "SV31", position: [21.24722778, 80.99331111], dms: `21°14'50.02"N 80°59'35.92"E` },
  { label: "SV32", position: [21.31785833, 81.27488889], dms: `21°19'04.29"N 81°16'29.60"E` },
  { label: "SV33", position: [21.35019167, 81.50846944], dms: `21°21'00.69"N 81°30'30.49"E` },
];

// geojson coordinates are [lng, lat]; Leaflet wants [lat, lng]. A LineString becomes one line,
// a MultiLineString stays as its list of lines — Polyline accepts positions[][] directly.
const toLatLngLines = (geometry: PipelineGeometry): [number, number][][] => {
  const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  return lines.map((line) => line.map(([lng, lat]) => [lat, lng] as [number, number]));
};

const ProjectMapView = ({ farms, clusterList }: { farms: Farm[]; clusterList: ClusterEntry[] }) => {
  const [collection, setCollection] = useState<PipelineCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showZones, setShowZones] = useState(true);
  const [showJunctions, setShowJunctions] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`${import.meta.env.BASE_URL}india_pipelines.geojson`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: PipelineCollection) => {
        if (!active) return;
        setCollection(data);
        setError("");
      })
      .catch(() => active && setError("Could not load pipeline map data."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const features = useMemo(() => collection?.features ?? [], [collection]);

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    features.forEach((feature) => {
      const key = (feature.properties.Status ?? "").toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [features]);

  const visibleFeatures = useMemo(
    () =>
      statusFilter
        ? features.filter((feature) => (feature.properties.Status ?? "").toLowerCase() === statusFilter)
        : features,
    [features, statusFilter],
  );

  const pipelineCoords = useMemo(
    () => visibleFeatures.flatMap((feature) => toLatLngLines(feature.geometry).flat()),
    [visibleFeatures],
  );

  const totalLengthKm = useMemo(
    () => visibleFeatures.reduce((sum, feature) => sum + (Number(feature.properties.LengthMergedKm) || 0), 0),
    [visibleFeatures],
  );

  // Our own farm clusters ("zones") overlaid on the same map — the dashed boundary circle and
  // land polygons from the Cluster-wise Land Map — so pipeline routes can be read against where
  // our land actually sits.
  const zoneOverlays = useMemo(
    () =>
      buildLandClusters(clusterList)
        .map((cluster, index) => {
          const clusterFarms = farms.filter((farm) => cluster.farmIds.has(farm.farm_id));
          const coords = clusterFarms.flatMap((farm) => farm.land_data?.land_coordinates ?? []);
          if (coords.length === 0) return null;
          const center: [number, number] = [
            coords.reduce((sum, c) => sum + c[0], 0) / coords.length,
            coords.reduce((sum, c) => sum + c[1], 0) / coords.length,
          ];
          const centerLatLng = L.latLng(center[0], center[1]);
          const radius =
            coords.reduce((max, c) => Math.max(max, centerLatLng.distanceTo(L.latLng(c[0], c[1]))), 0) * 1.15 + 40;
          return {
            key: cluster.key,
            name: cluster.clusterName,
            color: CLUSTER_MAP_COLORS[index % CLUSTER_MAP_COLORS.length],
            center,
            radius,
            farms: clusterFarms,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    [clusterList, farms],
  );

  // Frame the map on the junction points and our land zones (the actual area of interest) when we
  // have any; otherwise fall back to the full pipeline network.
  const fitCoords = useMemo(() => {
    const focus: [number, number][] = [
      ...(showJunctions ? JUNCTION_POINTS.map((point) => point.position) : []),
      ...(showZones
        ? zoneOverlays.flatMap((zone) => zone.farms.flatMap((farm) => farm.land_data?.land_coordinates ?? []))
        : []),
    ];
    return focus.length > 0 ? focus : pipelineCoords;
  }, [zoneOverlays, pipelineCoords, showJunctions, showZones]);

  return (
    <Card className="p-5">
      <SectionHeader
        title="Project Map"
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Pill tone="red">{JUNCTION_POINTS.length} Junctions</Pill>
            {zoneOverlays.length > 0 && <Pill tone="green">{zoneOverlays.length} Zones</Pill>}
            <Pill tone="blue">
              {visibleFeatures.length} Pipelines · {Math.round(totalLengthKm).toLocaleString("en-IN")} km
            </Pill>
          </div>
        }
      />
      <p className="-mt-2 mb-3 text-xs font-semibold text-slate-500">
        Gas pipeline infrastructure across India on a standard street map — routes, status and capacity from the Global Energy Monitor tracker.
      </p>

      {loading ? (
        <div className="flex h-[520px] flex-col items-center justify-center gap-2 text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin opacity-50" />
          <p className="text-xs font-bold">Loading pipeline map…</p>
        </div>
      ) : error ? (
        <div className="flex h-[520px] items-center justify-center text-sm font-bold text-slate-400">{error}</div>
      ) : features.length === 0 ? (
        <div className="flex h-[520px] items-center justify-center text-sm font-bold text-slate-400">No pipeline data available</div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setStatusFilter(null)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-black transition-colors",
                statusFilter === null ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50",
              )}
            >
              All ({features.length})
            </button>
            {statusCounts.map(([key, count]) => {
              const style = pipelineStatusStyle(key);
              const active = statusFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(active ? null : key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-black transition-colors",
                    active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: style.color }} />
                  {style.label} ({count})
                </button>
              );
            })}

            {/* Layer toggles — hide/show our own overlays independently of the pipeline filter. */}
            <span className="mx-1 self-stretch border-l border-slate-200" />
            <button
              type="button"
              onClick={() => setShowJunctions((value) => !value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-black transition-colors",
                showJunctions ? "border-rose-600 bg-rose-600 text-white" : "border-slate-200 text-slate-400 hover:bg-slate-50",
              )}
            >
              <span className={cn("h-2 w-2 shrink-0 rounded-full", showJunctions ? "bg-white" : "bg-rose-600")} />
              Junctions
            </button>
            {zoneOverlays.length > 0 && (
              <button
                type="button"
                onClick={() => setShowZones((value) => !value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-black transition-colors",
                  showZones ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 text-slate-400 hover:bg-slate-50",
                )}
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", showZones ? "bg-white" : "bg-emerald-600")} />
                Zones
              </button>
            )}
          </div>

          <div className="h-[520px] overflow-hidden rounded-lg">
            <MapContainer
              center={[22.5, 80]}
              zoom={5}
              style={{ height: "100%", width: "100%" }}
              zoomControl
            >
              {/* Minimal light-grey basemap (Esri, no API key) — near-white land, very faint
                  roads, far less visual noise than a full street map so pipeline routes read
                  clearly. Labels come from the separate reference overlay below. */}
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles &copy; Esri"
                maxNativeZoom={16}
                maxZoom={19}
              />
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
                maxNativeZoom={16}
                maxZoom={19}
              />

              {visibleFeatures.map((feature) => {
                const style = pipelineStatusStyle(feature.properties.Status);
                const positions = toLatLngLines(feature.geometry);
                const props = feature.properties;
                const route = [props.StartLocation || props["StartState/Province"], props.EndLocation || props["EndState/Province"]]
                  .filter(Boolean)
                  .join(" → ");
                return (
                  <Polyline
                    key={props.ProjectID || props.PipelineName}
                    positions={positions}
                    pathOptions={{ color: style.color, weight: 3, opacity: 0.9 }}
                  >
                    <Popup>
                      <div className="space-y-0.5 text-xs">
                        <p className="font-black text-slate-900">{props.PipelineName}</p>
                        {props.SegmentName && <p className="font-semibold text-slate-600">{props.SegmentName}</p>}
                        <p className="font-bold" style={{ color: style.color }}>{style.label}</p>
                        {route && <p className="font-semibold text-slate-600">{route}</p>}
                        {props.Owner && <p className="text-slate-600">Owner: {props.Owner}</p>}
                        {Number(props.LengthMergedKm) > 0 && (
                          <p className="text-slate-600">Length: {Number(props.LengthMergedKm).toFixed(1)} km</p>
                        )}
                        {props.Capacity && props.Capacity !== "--" && (
                          <p className="text-slate-600">Capacity: {props.Capacity} {props.CapacityUnits}</p>
                        )}
                        {props.StartYear1 && <p className="text-slate-600">Start year: {props.StartYear1}</p>}
                        {props.Wiki && (
                          <a href={props.Wiki} target="_blank" rel="noreferrer" className="font-bold text-blue-700 underline">
                            GEM wiki
                          </a>
                        )}
                      </div>
                    </Popup>
                  </Polyline>
                );
              })}

              {showJunctions && JUNCTION_POINTS.map((point) => (
                <Fragment key={point.label}>
                  {/* Ground-truth precision ring (fixed 15 m radius) — visible only when zoomed
                      right in, shows exactly which spot on the ground the point sits on. */}
                  <Circle
                    center={point.position}
                    radius={15}
                    pathOptions={{ color: "#e11d48", weight: 1, fillColor: "#e11d48", fillOpacity: 0.15 }}
                  />
                  {/* SVG dot centred exactly on the coordinate at every zoom (no icon-anchor
                      offset). Small crosshair-style: thin outer ring + solid 2 px core. */}
                  <CircleMarker
                    center={point.position}
                    radius={7}
                    pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#e11d48", fillOpacity: 1 }}
                  />
                  <CircleMarker
                    center={point.position}
                    radius={1.5}
                    pathOptions={{ color: "#7f1d1d", weight: 0, fillColor: "#7f1d1d", fillOpacity: 1 }}
                  >
                    <LeafletTooltip permanent direction="top" offset={[0, -8]} className="junction-label">
                      {point.label}
                    </LeafletTooltip>
                    <Popup>
                      <div className="space-y-0.5 text-xs">
                        <p className="font-black text-slate-900">{point.label}</p>
                        <p className="font-bold text-rose-600">Junction point</p>
                        <p className="text-slate-600">{point.dms}</p>
                        <p className="text-slate-500">{point.position[0].toFixed(8)}, {point.position[1].toFixed(8)}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                </Fragment>
              ))}

              {showZones && zoneOverlays.map((zone) => (
                <Fragment key={zone.key}>
                  {zone.radius > 0 && (
                    <Circle
                      center={zone.center}
                      radius={zone.radius}
                      pathOptions={{ color: zone.color, fillColor: zone.color, fillOpacity: 0.05, weight: 2.5, dashArray: "8 5" }}
                    />
                  )}
                  {zone.farms.map((farm) => {
                    const coords = farm.land_data?.land_coordinates ?? [];
                    if (coords.length < 3) return null;
                    const farmCenter: [number, number] = [
                      coords.reduce((sum, c) => sum + c[0], 0) / coords.length,
                      coords.reduce((sum, c) => sum + c[1], 0) / coords.length,
                    ];
                    const location =
                      [farm.land_data?.village, farm.land_data?.district, farm.land_data?.state].filter(Boolean).join(", ") ||
                      "Location not recorded";
                    return (
                      <Fragment key={farm.farm_id}>
                        <Polygon positions={coords} pathOptions={{ color: zone.color, fillColor: zone.color, fillOpacity: 0.35, weight: 2 }} />
                        <Marker position={farmCenter} icon={acreageDivIcon(Number(farm.area) || 0, zone.color)}>
                          <Popup>
                            <div className="space-y-0.5 text-xs">
                              <p className="font-black text-slate-900">{farm.farm_id}</p>
                              <p className="font-semibold text-slate-600">{zone.name}</p>
                              <p className="font-semibold text-slate-600">{location}</p>
                              <p className="font-bold text-slate-800">{(Number(farm.area) || 0).toFixed(1)} ac</p>
                            </div>
                          </Popup>
                        </Marker>
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}

              <FitBounds coords={fitCoords} />
            </MapContainer>
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-500">
            {showJunctions && (
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 shrink-0 rounded-full bg-rose-600" /> Junction points ·{" "}
              </span>
            )}
            {showZones && zoneOverlays.length > 0 && `dashed circles and shaded parcels are our ${zoneOverlays.length} land zone(s) · `}
            colored lines are gas pipeline routes.
          </p>
        </>
      )}
    </Card>
  );
};

// ── Inventory & Store Value (Dashboard) ────────────────────────────────────
// Same real Inventory table + valuation convention Inventory.tsx already uses: an item's own
// fifo_list is what's held at its home `location`, dissociation[store] (excluding the home
// location, which would double-count fifo_list) is what's been split out to other stores — value
// of either is always sum(batch.stock * batch.per_unit_cost).

type InventoryCostBatch = { stock: number; per_unit_cost: number };
type InventoryDissociationEntry = { quantity?: number; LIFO?: InventoryCostBatch[] };
type InventoryItemRecord = {
  Invent_id: string;
  item_name?: string;
  location?: string;
  fifo_list?: InventoryCostBatch[];
  dissociation?: Record<string, InventoryDissociationEntry>;
};

const batchValue = (batches?: InventoryCostBatch[]) =>
  (batches ?? []).reduce((sum, batch) => sum + (Number(batch?.stock) || 0) * (Number(batch?.per_unit_cost) || 0), 0);

const STORE_VALUE_COLORS = ["#2563eb", "#16a34a", "#f97316", "#7c3aed", "#dc2626", "#0891b2", "#ca8a04", "#db2777"];

const InventoryStoreValueCard = ({ items, loading }: { items: InventoryItemRecord[]; loading: boolean }) => {
  const { totalValue, storeBreakdown } = useMemo(() => {
    const storeValues = new Map<string, number>();
    items.forEach((item) => {
      const homeValue = batchValue(item.fifo_list);
      if (item.location) storeValues.set(item.location, (storeValues.get(item.location) ?? 0) + homeValue);

      Object.entries(item.dissociation ?? {}).forEach(([storeName, entry]) => {
        if (!storeName || storeName === item.location) return;
        storeValues.set(storeName, (storeValues.get(storeName) ?? 0) + batchValue(entry.LIFO));
      });
    });

    const breakdown = Array.from(storeValues.entries())
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], index) => ({ label, value, color: STORE_VALUE_COLORS[index % STORE_VALUE_COLORS.length] }));

    return { totalValue: breakdown.reduce((sum, entry) => sum + entry.value, 0), storeBreakdown: breakdown };
  }, [items]);

  return (
    <Card className="p-5">
      <SectionHeader title="Inventory & Store Value" />
      {loading ? (
        <div className="flex h-44 flex-col items-center justify-center gap-2 text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin opacity-50" />
          <p className="text-xs font-bold">Loading inventory…</p>
        </div>
      ) : storeBreakdown.length === 0 ? (
        <div className="flex h-44 items-center justify-center text-sm font-bold text-slate-400">No inventory value recorded</div>
      ) : (
        <>
          <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[190px_1fr]">
            <div className="relative h-44">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={storeBreakdown} dataKey="value" nameKey="label" innerRadius={58} outerRadius={82} paddingAngle={2}>
                    {storeBreakdown.map((entry) => (
                      <Cell key={entry.label} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number, _name, item) => [formatFinancialAmount(value), item?.payload?.label]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
                <p className="text-lg font-black leading-tight">{formatFinancialAmount(totalValue)}</p>
                <p className="text-xs font-bold text-slate-600">Total Value</p>
              </div>
            </div>
            <div className="max-h-44 space-y-3 overflow-y-auto pr-1 text-sm">
              {storeBreakdown.map((entry) => (
                <div key={entry.label} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 truncate font-bold text-slate-700">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="truncate">{entry.label}</span>
                  </span>
                  <span className="shrink-0 font-black">{formatFinancialAmount(entry.value)}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-sm font-bold text-slate-600">{storeBreakdown.length} Stores</p>
        </>
      )}
    </Card>
  );
};

// ── Manpower Overview (Dashboard) ───────────────────────────────────────────
// Real headcount from admin_all_staff, grouped by whatever staff_designation values actually
// exist — not a fixed Field Manager/Supervisor/Skilled/Unskilled split, since only designations
// staff are actually onboarded under (see admin_staff.py's add_staff) are ever real here.

type StaffRecord = { staff_id?: string; staff_information?: { staff_designation?: string } };

const MANPOWER_COLORS = ["#0b5fe8", "#2563eb", "#22a765", "#6d28d9", "#f97316", "#dc2626", "#0891b2", "#ca8a04"];

const ManpowerOverviewCard = ({ staff, loading }: { staff: StaffRecord[]; loading: boolean }) => {
  const breakdown = useMemo(() => {
    const counts = new Map<string, number>();
    staff.forEach((record) => {
      const designation = record.staff_information?.staff_designation?.trim();
      const label = designation ? designation.replace(/\b\w/g, (c) => c.toUpperCase()) : "Unspecified";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], index) => ({ label, value, color: MANPOWER_COLORS[index % MANPOWER_COLORS.length] }));
  }, [staff]);

  const total = breakdown.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <Card className="p-5">
      <SectionHeader title="Manpower Overview" />
      {loading ? (
        <div className="flex h-44 flex-col items-center justify-center gap-2 text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin opacity-50" />
          <p className="text-xs font-bold">Loading staff…</p>
        </div>
      ) : breakdown.length === 0 ? (
        <div className="flex h-44 items-center justify-center text-sm font-bold text-slate-400">No staff records available</div>
      ) : (
        <>
          <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[190px_1fr]">
            <div className="relative h-44">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={breakdown} dataKey="value" nameKey="label" innerRadius={58} outerRadius={82} paddingAngle={2}>
                    {breakdown.map((entry) => (
                      <Cell key={entry.label} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number, _name, item) => [value, item?.payload?.label]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl font-black">{total}</p>
                <p className="text-sm font-bold text-slate-600">Total</p>
              </div>
            </div>
            <div className="max-h-44 space-y-3 overflow-y-auto pr-1 text-sm">
              {breakdown.map((entry) => (
                <div key={entry.label} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 truncate font-bold text-slate-700">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="truncate">{entry.label}</span>
                  </span>
                  <span className="shrink-0 font-black">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-sm font-bold text-slate-600">
            {breakdown.length} Designation{breakdown.length === 1 ? "" : "s"}
          </p>
        </>
      )}
    </Card>
  );
};

// TODO: keep in sync with src/pages/Leads.tsx's own transform of GET /farmer_managment/get_leads.
const transformLeads = (rawLeads: any[]): Lead[] =>
  rawLeads.map((item) => {
    const farmer = item?.farmer_data ?? {};
    return {
      id: String(item?.lead_id ?? ""),
      backendId: String(item?.lead_id ?? ""),
      farmerId: item?.farmer_id,
      fullName: farmer.full_name || "N/A",
      phoneNumber: farmer.phone_number || "N/A",
      alternatePhone: farmer.alternate_phone_number,
      leadSource: farmer.lead_source || "N/A",
      farmingOption: farmer.farming_option,
      village: farmer.village || "N/A",
      taluka: farmer.taluka,
      tehsil: farmer.tehsil || farmer.taluka || undefined,
      district: farmer.district || "N/A",
      state: farmer.state || "N/A",
      estimatedLandArea: farmer.estimated_land_area,
      waterAvailable: farmer.water_available,
      notes: farmer.note,
      landCoordinates: farmer.land_coordinates,
      status: item?.status,
      createdAt: item?.created_at,
      kycData: item?.kyc_data,
      agreementData: item?.agreement_data,
      isFlagged: false,
      stopPayments: false,
      stopInputs: false,
    } as Lead;
  });

const toLatLngTuple = (point: unknown): [number, number] | null => {
  if (Array.isArray(point)) {
    const [lat, lng] = point;
    return Number.isFinite(lat) && Number.isFinite(lng) ? [Number(lat), Number(lng)] : null;
  }
  if (point && typeof point === "object") {
    const lat = Number((point as { lat?: unknown }).lat);
    const lng = Number((point as { lng?: unknown }).lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  }
  return null;
};

const LeadMapThumbnail = ({ coordinates }: { coordinates?: { lat: number; lng: number }[] }) => {
  // Backend may return land_coordinates as either [lat, lng] tuples or {lat, lng} objects — normalize defensively.
  const coords: [number, number][] = (coordinates ?? [])
    .map((c) => toLatLngTuple(c))
    .filter((c): c is [number, number] => c !== null);

  if (coords.length < 3) {
    return (
      <div className="flex h-28 w-full flex-col items-center justify-center gap-1 bg-slate-900 text-slate-500">
        <MapPinned className="h-5 w-5 opacity-40" />
        <span className="text-[10px] font-bold">No coordinates</span>
      </div>
    );
  }

  const center: [number, number] = [
    coords.reduce((sum, c) => sum + c[0], 0) / coords.length,
    coords.reduce((sum, c) => sum + c[1], 0) / coords.length,
  ];

  return (
    <div className="h-28 w-full">
      <MapContainer
        key={`${center[0]}-${center[1]}`}
        center={center}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        attributionControl={false}
      >
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
        <Polygon positions={coords} pathOptions={{ color: "var(--land-boundary-color, #fde047)", fillColor: "var(--land-boundary-fill, #fef9c3)", fillOpacity: 0.28, weight: 3 }} />
        <FitBounds coords={coords} />
      </MapContainer>
    </div>
  );
};

const formatLeadDate = (value?: string | Date) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

// Never render a full Aadhaar number — this card sits on a dashboard, not a KYC verification
// screen, so only the last 4 digits are shown, same masking convention as bank/ID fields elsewhere.
const maskAadhaar = (value?: string) => (value && value.length >= 4 ? `XXXX XXXX ${value.slice(-4)}` : value || "");

const DetailRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">{label}</span>
    <span className="min-w-0 truncate text-xs font-bold text-slate-800">{value}</span>
  </div>
);

const LeadAcquisitionCard = ({ lead }: { lead: Lead }) => {
  const location = [lead.village, lead.tehsil, lead.district, lead.state].filter(Boolean).join(", ");
  const isLease = (lead.farmingOption ?? "").toLowerCase().includes("lease");
  const addedOn = formatLeadDate(lead.createdAt);
  const kyc = lead.kycData;
  const agreement = isLease ? lead.agreementData : undefined;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <LeadMapThumbnail coordinates={lead.landCoordinates} />
      <div className="space-y-3 p-3.5">
        <div>
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-black text-slate-950">{lead.fullName}</p>
            <Pill tone={isLease ? "blue" : "green"}>{lead.farmingOption || "—"}</Pill>
          </div>
          {location && <p className="mt-0.5 truncate text-[11px] font-bold text-slate-500">{location}</p>}
        </div>

        <div className="space-y-1.5 rounded-lg bg-slate-50 p-2.5">
          <DetailRow label="Phone" value={lead.alternatePhone ? `${lead.phoneNumber} / ${lead.alternatePhone}` : lead.phoneNumber} />
          <DetailRow label="Lead Source" value={lead.leadSource || "—"} />
          <DetailRow label="Estimated Area" value={lead.estimatedLandArea ? `${lead.estimatedLandArea} ac` : "—"} />
          <DetailRow
            label="Water Availability"
            value={lead.waterAvailable === undefined ? "—" : lead.waterAvailable ? "Available" : "Not Available"}
          />
          {addedOn && <DetailRow label="Added On" value={addedOn} />}
        </div>

        {lead.notes && (
          <div className="rounded-lg border border-slate-100 p-2.5">
            <p className="text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">Notes</p>
            <p className="mt-1 line-clamp-3 text-xs font-semibold text-slate-700">{lead.notes}</p>
          </div>
        )}

        {kyc && (
          <div className="rounded-lg border border-slate-100 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">KYC</p>
              <Pill tone={kyc.verified ? "green" : "yellow"}>{kyc.verified ? "Verified" : "Pending"}</Pill>
            </div>
            <div className="mt-1.5 space-y-1">
              {kyc.aadhaarNumber && <DetailRow label="Aadhaar" value={maskAadhaar(kyc.aadhaarNumber)} />}
              {kyc.bankName && <DetailRow label="Bank" value={kyc.bankName} />}
            </div>
          </div>
        )}

        {agreement && (
          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-2.5">
            <p className="text-[10px] font-black uppercase tracking-[0.06em] text-blue-700">Lease Agreement</p>
            <div className="mt-1.5 space-y-1">
              <DetailRow label="Period" value={`${formatLeadDate(agreement.leaseStartDate)} – ${formatLeadDate(agreement.leaseEndDate)}`} />
              <DetailRow label="Rent" value={`Rs ${Number(agreement.leaseRent || 0).toLocaleString("en-IN")}`} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const LeadPipelineColumn = ({
  label,
  tone,
  leads,
  loading,
}: {
  label: string;
  tone: "blue" | "orange" | "green";
  leads: Lead[];
  loading: boolean;
}) => (
  <div className="flex flex-col rounded-xl border border-slate-100 bg-slate-50/60">
    <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
      <p className="text-xs font-black text-slate-800">{label}</p>
      <Pill tone={tone}>{leads.length}</Pill>
    </div>
    <div className="max-h-[720px] space-y-3 overflow-y-auto p-2.5">
      {loading ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin opacity-50" />
          <p className="text-[11px] font-bold">Loading…</p>
        </div>
      ) : leads.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-xs font-bold text-slate-400">No leads</div>
      ) : (
        leads.map((lead) => <LeadAcquisitionCard key={lead.id} lead={lead} />)
      )}
    </div>
  </div>
);

// ── Lease Register (Land Acquisition) — same live data LeaseMaster.tsx shows, rendered inline
// instead of iframing that whole standalone page/layout into a dashboard card. ─────────────────

type LeaseRegisterStatus = "Active" | "Expiring Soon" | "Expired" | "Future" | "Incomplete";

type LeaseRegisterRow = {
  id: string;
  ownerId: string;
  ownerName: string;
  landId: string;
  village: string;
  district: string;
  state: string;
  area: number;
  leaseStart: string;
  leaseEnd: string;
  lockInStart: string;
  lockInEnd: string;
  rate: number;
  annualRent: number;
  status: LeaseRegisterStatus;
};

type LeaseFarmerSummary = {
  farmer_id?: string;
  farmer_data?: { full_name?: string; village?: string; district?: string; state?: string };
};

type LeaseAgreementRecord = { lease_rate?: number; lease_rent?: number };

type LeaseFarmRecord = {
  farm_id?: string;
  id?: string;
  lease_start_date?: string;
  lease_start?: string;
  lease_end_date?: string;
  lease_end?: string;
  lease_rate?: number;
  lease_rent?: number;
  total_area?: number;
  area?: number;
  village?: string;
  district?: string;
  state?: string;
  lock_in_start_date?: string;
  lock_in_start?: string;
  lock_in_end_date?: string;
  lock_in_end?: string;
};

type LeaseFarmerDetail = {
  farmer?: { farmer_name?: string; agreement_data?: LeaseAgreementRecord[] | LeaseAgreementRecord };
  farm?: LeaseFarmRecord[];
};

const leaseText = (...values: (string | undefined | null)[]) => values.find((value) => value && value.trim()) ?? "";
const leaseNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const leaseDateOnly = (value: string | undefined) => (value ?? "").slice(0, 10);
const formatLeaseMoney = (value: number) => `Rs ${leaseNumber(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatLeaseArea = (value: number) => `${leaseNumber(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })} ac`;
const formatLeaseDateOnly = (value: string) => {
  if (!value) return "Not Recorded";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
};

const leaseCalendarDuration = (fromValue: string | Date, toValue: string | Date): string => {
  const from = new Date(fromValue);
  const to = new Date(toValue);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return "";
  from.setHours(0, 0, 0, 0);
  to.setHours(0, 0, 0, 0);
  if (to < from) return leaseCalendarDuration(to, from);
  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(to.getFullYear(), to.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return (
    [
      [years, years === 1 ? "year" : "years"],
      [months, months === 1 ? "month" : "months"],
      [days, days === 1 ? "day" : "days"],
    ]
      .filter(([value]) => Number(value) > 0)
      .map(([value, label]) => `${value} ${label}`)
      .join(" ") || "0 days"
  );
};

const formatLeaseExpiry = (leaseEnd: string): string => {
  if (!leaseEnd) return "Not Recorded";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(leaseEnd);
  end.setHours(0, 0, 0, 0);
  if (Number.isNaN(end.getTime())) return "Not Recorded";
  if (end.getTime() === today.getTime()) return "Expires today";
  return end > today ? `${leaseCalendarDuration(today, end)} left` : `Expired by ${leaseCalendarDuration(end, today)}`;
};

const getLeaseRowStatus = (start: string, end: string): LeaseRegisterStatus => {
  if (!start || !end) return "Incomplete";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "Incomplete";
  const days = Math.ceil((endMs - today.getTime()) / 86400000);
  if (today.getTime() < startMs) return "Future";
  if (days < 0) return "Expired";
  if (days <= 90) return "Expiring Soon";
  return "Active";
};

const LEASE_STATUS_TONE: Record<LeaseRegisterStatus, "green" | "orange" | "blue" | "red" | "yellow"> = {
  Active: "green",
  "Expiring Soon": "orange",
  Expired: "red",
  Future: "blue",
  Incomplete: "yellow",
};

const normalizeLeaseFarmer = (summary: LeaseFarmerSummary, detail: LeaseFarmerDetail | null): LeaseRegisterRow[] => {
  const fd = summary.farmer_data ?? {};
  const ownerId = summary.farmer_id ?? "";
  const ownerName = leaseText(detail?.farmer?.farmer_name, fd.full_name) || "Unknown";
  const agreements = detail?.farmer?.agreement_data;
  const agreement: LeaseAgreementRecord = (Array.isArray(agreements) ? agreements[0] : agreements) ?? {};
  const farms = detail?.farm ?? [];

  const build = (farm: LeaseFarmRecord, index: number): LeaseRegisterRow => {
    const start = leaseDateOnly(leaseText(farm.lease_start_date, farm.lease_start));
    const end = leaseDateOnly(leaseText(farm.lease_end_date, farm.lease_end));
    const rate = leaseNumber(farm.lease_rate ?? farm.lease_rent ?? agreement.lease_rate ?? agreement.lease_rent);
    const area = leaseNumber(farm.total_area ?? farm.area);
    const village = leaseText(farm.village, fd.village);
    const district = leaseText(farm.district, fd.district);
    const state = leaseText(farm.state, fd.state);
    return {
      id: `${ownerId}:${leaseText(farm.farm_id, farm.id, String(index + 1))}`,
      ownerId,
      ownerName,
      landId: leaseText(farm.farm_id, farm.id, `${ownerId}-LAND-${index + 1}`),
      village,
      district,
      state,
      area,
      leaseStart: start,
      leaseEnd: end,
      lockInStart: leaseDateOnly(leaseText(farm.lock_in_start_date, farm.lock_in_start)),
      lockInEnd: leaseDateOnly(leaseText(farm.lock_in_end_date, farm.lock_in_end)),
      rate,
      annualRent: rate * area,
      status: getLeaseRowStatus(start, end),
    };
  };

  return farms.length > 0 ? farms.map(build) : [];
};

const LeaseRegisterCard = ({ onOpenModule }: { onOpenModule: (route: string) => void }) => {
  const [rows, setRows] = useState<LeaseRegisterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Only fires once this card actually mounts — i.e. once the Land Acquisition tab is opened —
  // not on every CEO's Desk load, since this is an N+1 fetch (one details call per land owner)
  // same as LeaseMaster.tsx's own loader.
  useEffect(() => {
    let cancelled = false;
    const base = getBaseUrl().replace(/\/$/, "");

    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${base}/farmer_managment/get_farmers`);
        if (!res.ok) throw new Error(`Unable to load land owners (${res.status})`);
        const body: { farmers?: LeaseFarmerSummary[] } = await res.json();
        const summaries = Array.isArray(body?.farmers) ? body.farmers : [];

        const collected: LeaseRegisterRow[] = [];
        const batchSize = 8;
        for (let start = 0; start < summaries.length; start += batchSize) {
          if (cancelled) return;
          const batch = summaries.slice(start, start + batchSize);
          const details = await Promise.allSettled(
            batch.map(async (summary) => {
              const farmerId = summary.farmer_id;
              if (!farmerId) return null;
              const detailRes = await fetch(`${base}/farmer_managment/farmer_details/${farmerId}`);
              if (!detailRes.ok) return null;
              return (await detailRes.json()) as LeaseFarmerDetail;
            }),
          );
          details.forEach((result, index) => {
            collected.push(...normalizeLeaseFarmer(batch[index], result.status === "fulfilled" ? result.value : null));
          });
        }
        if (!cancelled) setRows(collected);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load lease records");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-slate-100 p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-black text-slate-950">Lease Register</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Tenure, rate, lock-in and expiry for every leased land parcel.</p>
        </div>
        <Pill tone="blue">{rows.length} Lease Lands</Pill>
      </div>

      {loading ? (
        <div className="flex h-56 flex-col items-center justify-center gap-2 text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin opacity-50" />
          <p className="text-xs font-bold">Loading lease records…</p>
        </div>
      ) : error ? (
        <div className="flex h-56 flex-col items-center justify-center gap-1 px-6 text-center text-slate-400">
          <p className="text-sm font-bold text-red-600">{error}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-56 items-center justify-center text-sm font-bold text-slate-400">No lease records found</div>
      ) : (
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[#0d4039] text-white">
              <tr>
                {["Land Owner ID", "Land Owner Name", "Location", "Area", "Lease Tenure", "Lease Lock In", "Rate / Acre / Year", "Annual Rent", "Expiry", "Action"].map(
                  (heading) => (
                    <th key={heading} className="whitespace-nowrap px-3 py-3 text-[10px] font-black uppercase tracking-[0.06em]">
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-3 font-black text-[#0d4039]">{row.ownerId}</td>
                  <td className="px-3 py-3">
                    <p className="font-black text-slate-900">{row.ownerName}</p>
                    <p className="mt-0.5 text-[11px] font-bold text-slate-400">Land: {row.landId}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-bold text-slate-900">{row.village || "Not Recorded"}</p>
                    <p className="mt-0.5 text-[11px] font-bold text-slate-400">{[row.district, row.state].filter(Boolean).join(", ") || "Not Recorded"}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-black text-slate-900">{formatLeaseArea(row.area)}</td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <p className="font-bold text-slate-900">{formatLeaseDateOnly(row.leaseStart)}</p>
                    <p className="mt-0.5 text-[11px] font-bold text-slate-400">to {formatLeaseDateOnly(row.leaseEnd)}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                    {row.lockInStart ? (
                      <>
                        <p className="font-bold text-slate-900">{formatLeaseDateOnly(row.lockInStart)}</p>
                        <p className="mt-0.5 text-[11px] font-bold text-slate-400">to {formatLeaseDateOnly(row.lockInEnd)}</p>
                      </>
                    ) : (
                      <span className="text-slate-400">Not Recorded</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-bold text-slate-800">{formatLeaseMoney(row.rate)}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-black text-slate-900">{formatLeaseMoney(row.annualRent)}</td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <p className={cn("font-bold", row.status === "Expired" ? "text-red-700" : row.status === "Expiring Soon" ? "text-orange-700" : "text-slate-700")}>
                      {formatLeaseExpiry(row.leaseEnd)}
                    </p>
                    <div className="mt-1">
                      <Pill tone={LEASE_STATUS_TONE[row.status]}>{row.status}</Pill>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <button
                      type="button"
                      onClick={() => onOpenModule("/lease-master")}
                      className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

const LandAcquisitionView = ({
  leads,
  leadsLoading,
  onOpenModule,
}: {
  leads: Lead[];
  leadsLoading: boolean;
  onOpenModule: (route: string) => void;
}) => {
  const contactedLeads = useMemo(() => leads.filter((lead) => lead.status === "contacted"), [leads]);
  const verifiedLeads = useMemo(() => leads.filter((lead) => lead.status === "verified"), [leads]);
  const registeredLeads = useMemo(() => leads.filter((lead) => lead.status === "registered"), [leads]);

  return (
  <div className="space-y-4">
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {landAcquisitionStats.map((stat) => (
        <Card key={stat.label} className="p-4">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">{stat.label}</p>
          <div className="mt-3 flex items-end gap-2">
            <p className={cn("text-3xl font-black tracking-normal", stat.tone)}>{stat.value}</p>
            <p className="pb-1 text-sm font-bold text-slate-600">{stat.suffix}</p>
          </div>
        </Card>
      ))}
    </section>

    <section className="grid grid-cols-1 gap-4">
      <Card className="p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-950">Acquisition Pipeline</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Lead movement from first contact through registration.</p>
          </div>
          <Pill tone="blue">{leads.length} Total Leads</Pill>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <LeadPipelineColumn label="Lands Contacted" tone="blue" leads={contactedLeads} loading={leadsLoading} />
          <LeadPipelineColumn label="Land Under Verification" tone="orange" leads={verifiedLeads} loading={leadsLoading} />
          <LeadPipelineColumn label="Lands Registered" tone="green" leads={registeredLeads} loading={leadsLoading} />
        </div>
      </Card>

      <LeaseRegisterCard onOpenModule={onOpenModule} />
    </section>
  </div>
  );
};

const buildLeaseTerms = (agreement: { lease_rent: number; agreement_start_date: string; agreement_end_date: string }) => {
  const start = new Date(agreement.agreement_start_date);
  const end = new Date(agreement.agreement_end_date);
  const validDates = !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime());
  const fmt = (date: Date) => date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  let percentElapsed = 0;
  if (validDates) {
    const totalMs = end.getTime() - start.getTime();
    const elapsedMs = Date.now() - start.getTime();
    percentElapsed = totalMs > 0 ? Math.min(Math.max((elapsedMs / totalMs) * 100, 0), 100) : 0;
  }

  return {
    startLabel: validDates ? fmt(start) : agreement.agreement_start_date,
    endLabel: validDates ? fmt(end) : agreement.agreement_end_date,
    percentElapsed,
    amount: agreement.lease_rent ?? 0,
  };
};

const farmCropTypes = (farm: Farm) => {
  const plots = farm.land_plots ?? [];
  const keys =
    plots.length > 0
      ? Array.from(new Set(plots.map((plot) => normalizeCropKey(plot.crop_type || farm.crop_type))))
      : [normalizeCropKey(farm.crop_type)];
  return keys.map((key, index) => ({ key, label: cropLabel(key), color: cropColor(key, index) }));
};

const LandMappingThumbnail = ({ farm }: { farm: Farm }) => {
  const landCoords = farm.land_data?.land_coordinates ?? [];
  const plots = farm.land_plots ?? [];
  const hasPlots = plots.length > 0;
  const allCoords: [number, number][] = [...landCoords, ...plots.flatMap((plot) => plot.plot_coordinates ?? [])];
  const center: [number, number] =
    allCoords.length > 0
      ? [allCoords.reduce((sum, c) => sum + c[0], 0) / allCoords.length, allCoords.reduce((sum, c) => sum + c[1], 0) / allCoords.length]
      : [20.5937, 78.9629];

  if (landCoords.length === 0) {
    return (
      <div className="flex h-32 w-full flex-col items-center justify-center gap-1 bg-slate-900 text-slate-500">
        <MapPinned className="h-5 w-5 opacity-40" />
        <span className="text-[10px] font-bold">No coordinates</span>
      </div>
    );
  }

  return (
    <div className="h-32 w-full">
      <MapContainer
        key={farm.farm_id}
        center={center}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        attributionControl={false}
      >
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
        {landCoords.length >= 3 && (
          <Polygon positions={landCoords} pathOptions={{ color: "var(--land-boundary-color, #fde047)", fillColor: "var(--land-boundary-fill, #fef9c3)", fillOpacity: 0.28, weight: 3 }} />
        )}
        {hasPlots &&
          plots.map((plot, index) => {
            if ((plot.plot_coordinates?.length ?? 0) < 3) return null;
            const key = normalizeCropKey(plot.crop_type || farm.crop_type);
            const color = cropColor(key, index);
            return (
              <Polygon
                key={plot.plot_id || plot.plot_name || index}
                positions={plot.plot_coordinates}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.5, weight: 2 }}
              />
            );
          })}
        <FitBounds coords={allCoords} />
      </MapContainer>
    </div>
  );
};

const LandInvestmentCard = ({
  farm,
  ownerName,
  ownerLoading,
}: {
  farm: Farm;
  ownerName?: string;
  ownerLoading: boolean;
}) => {
  const cropTypes = farmCropTypes(farm);
  const hasAgreement = !!farm.agreement_data;
  const leaseTerms = farm.agreement_data ? buildLeaseTerms(farm.agreement_data) : null;
  const investment = (farm.farm_investment_ledger ?? []).reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
  const location = [farm.land_data?.village, farm.land_data?.district, farm.land_data?.state].filter(Boolean).join(", ");

  return (
    <div className="w-80 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <LandMappingThumbnail farm={farm} />
      <div className="space-y-3 p-4">
        <div>
          <p className="truncate text-xs font-black text-slate-950">{farm.farm_id}</p>
          {location && <p className="mt-0.5 truncate text-[11px] font-bold text-slate-500">{location}</p>}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">Owner</span>
          {ownerLoading ? (
            <span className="h-3 w-20 animate-pulse rounded bg-slate-200" />
          ) : (
            <span className="truncate text-xs font-bold text-slate-800">{ownerName || "Unknown"}</span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">Total Area</span>
          <span className="text-xs font-black text-slate-950">{Math.round(farm.area ?? 0)} ac</span>
        </div>

        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">Crop Types</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {cropTypes.map((crop) => (
              <span
                key={crop.key}
                className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600"
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: crop.color }} />
                {crop.label}
              </span>
            ))}
          </div>
        </div>

        {hasAgreement && leaseTerms ? (
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.06em] text-blue-700">Lease Tenure</p>
              <p className="text-[10px] font-black text-blue-700">{Math.round(leaseTerms.percentElapsed)}%</p>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-blue-200">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${leaseTerms.percentElapsed}%` }} />
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] font-bold text-slate-500">
              <span>{leaseTerms.startLabel}</span>
              <span>{leaseTerms.endLabel}</span>
            </div>
            <p className="mt-1.5 text-xs font-black text-blue-900">Rs {leaseTerms.amount.toLocaleString("en-IN")} /acre/annum</p>
          </div>
        ) : (
          <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.06em] text-violet-700">Farming Option</p>
            <p className="mt-1 text-xs font-bold text-violet-900">{farm.land_data?.farming_option || "Contract Farming"}</p>
          </div>
        )}

        <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-[0.06em] text-rose-700">Investment So Far</p>
          <p className="mt-1 text-sm font-black text-rose-900">Rs {investment.toLocaleString("en-IN")}</p>
        </div>
      </div>
    </div>
  );
};

const LandInvestmentGallery = ({
  farms,
  farmerNames,
  loading,
}: {
  farms: Farm[];
  farmerNames: Record<string, string>;
  loading: boolean;
}) => (
  <section className="space-y-3">
    <SectionHeader title="Land Portfolio Overview" right={<Pill tone="blue">{farms.length} Parcels</Pill>} />
    {loading ? (
      <Card className="p-5">
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin opacity-50" />
          <p className="text-xs font-bold">Loading land data…</p>
        </div>
      </Card>
    ) : farms.length === 0 ? (
      <Card className="p-5">
        <div className="flex h-40 items-center justify-center text-sm font-bold text-slate-400">No land parcels available</div>
      </Card>
    ) : (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {farms.map((farm) => (
          <LandInvestmentCard key={farm.farm_id} farm={farm} ownerName={farmerNames[farm.farm_id]} ownerLoading={!(farm.farm_id in farmerNames)} />
        ))}
      </div>
    )}
  </section>
);

const FinancialAnalysisView = ({
  kpis,
  loading,
  budgets,
  budgetsLoading,
  categoryBudgets,
  categoryBudgetsLoading,
  farms,
  farmerNames,
  farmsLoading,
  actualDisbursements,
  disbursementSeries,
  disbursementLoading,
}: {
  kpis: FinancialKpis | null;
  loading: boolean;
  budgets: BudgetBifurcation[];
  budgetsLoading: boolean;
  categoryBudgets: BudgetCategoryBifurcation[];
  categoryBudgetsLoading: boolean;
  farms: Farm[];
  farmerNames: Record<string, string>;
  farmsLoading: boolean;
  // Real payment feed + aggregated weekly series — both computed once by the parent's tiered
  // loader and passed down here, rather than this view re-fetching and re-parsing every budget's
  // xlsx a second time (this used to duplicate the exact same work the parent already does).
  actualDisbursements: ActualDisbursementRecord[];
  disbursementSeries: DisbursementWeek[];
  disbursementLoading: boolean;
}) => {
  const totalActualDisbursedCr = useMemo(
    () => actualDisbursements.reduce((sum, record) => sum + (Number(record.amount) || 0), 0) / 1e7,
    [actualDisbursements],
  );

  // Total Budget and Balance track the summed budget-wise bifurcation rows — the same source the
  // Budget Bifurcation donut below uses — rather than kpis.total_budget, so the two figures on
  // this view can never disagree. Capex / Opex still come from the analytics KPI endpoint.
  const budgetTotals = useMemo(() => sumBudgetTotals(budgets), [budgets]);
  const totalUtilized = budgetTotals.utilized;
  const budgetReady = !budgetsLoading && budgets.length > 0;
  // Balance = Total Budget - Utilized Budget.
  const totalBalance = budgetReady ? budgetTotals.totalBudget - totalUtilized : null;

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {financialStatDefs.map((stat) => {
          const isBalance = stat.key === "balance";
          const isTotalBudget = stat.key === "total_budget";
          const usesBifurcation = isBalance || isTotalBudget;
          const ready = usesBifurcation ? budgetReady : !loading && !!kpis;
          const value = isBalance
            ? totalBalance
            : isTotalBudget
              ? budgetTotals.totalBudget
              : kpis
                ? kpis[stat.key as keyof FinancialKpis]
                : undefined;
          const hasValue = ready && value !== null && value !== undefined;
          // Balance only: green/up when total budget still covers what's been utilized, red/down
          // when utilization has exceeded the budget.
          const favorable = !isBalance || !hasValue || (value as number) >= 0;
          const tone = isBalance ? (favorable ? "text-emerald-700" : "text-red-700") : stat.tone;
          const iconBg = isBalance ? (favorable ? "bg-emerald-100" : "bg-red-100") : stat.iconBg;
          const Icon = isBalance ? (favorable ? TrendingUp : TrendingDown) : stat.icon;
          return (
            <Card key={stat.label} className="p-4">
              <div className="flex items-center gap-3">
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", iconBg)}>
                  <Icon className={cn("h-5 w-5", tone)} />
                </span>
                <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">{stat.label}</p>
              </div>
              <div className="mt-3 flex items-end gap-2">
                {!hasValue ? (
                  <p className="text-3xl font-black tracking-normal text-slate-300">--</p>
                ) : (
                  <p className={cn("text-3xl font-black tracking-normal", tone)}>{formatFinancialAmount(value)}</p>
                )}
              </div>
              {isBalance && hasValue && (
                <p className={cn("mt-1 text-[11px] font-bold", tone)}>
                  {favorable ? "Within budget" : "Exceeds total budget"}
                </p>
              )}
            </Card>
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.44fr_0.56fr]">
        <BudgetBifurcationCard budgets={budgets} loading={budgetsLoading} />
        <DisbursementSequenceCard series={disbursementSeries} loading={disbursementLoading} budgets={budgets} totalActualDisbursedCr={totalActualDisbursedCr} />
      </section>

      <CategoryWiseBudgetSection budgets={categoryBudgets} loading={categoryBudgetsLoading} />

      <LandInvestmentGallery farms={farms} farmerNames={farmerNames} loading={farmsLoading} />
    </div>
  );
};

// ── Task Timeline (Cultivation Tracker) ────────────────────────────────────


const fmtTaskDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return Number.isNaN(date.getTime())
    ? dateStr
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const taskStatusTone = (status?: string): "green" | "orange" | "blue" | "red" | "yellow" => {
  const s = normalizeAssignmentStatus(status);
  if (s === "unassigned") return "yellow";
  if (isCompletedAssignmentStatus(s)) return "green";
  if (s.includes("pending")) return "orange";
  if (s.includes("overdue")) return "red";
  return "blue";
};

const taskStatusLabel = (status?: string) => {
  const s = normalizeAssignmentStatus(status);
  if (!s) return "Unassigned";
  return s
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const TaskPlotMapThumbnail = ({ farm, plotIds }: { farm?: Farm; plotIds: string[] }) => {
  if (!farm) {
    return (
      <div className="flex h-36 w-full flex-col items-center justify-center gap-1 bg-slate-900 text-slate-500">
        <MapPinned className="h-5 w-5 opacity-40" />
        <span className="text-[10px] font-bold">No farm data</span>
      </div>
    );
  }

  const landCoords = farm.land_data?.land_coordinates ?? [];
  const plots = farm.land_plots ?? [];
  const hasPlots = plots.length > 0;
  const plotIdSet = new Set(plotIds);
  const highlightAll = plotIdSet.size === 0;
  const allCoords: [number, number][] = [...landCoords, ...plots.flatMap((plot) => plot.plot_coordinates ?? [])];
  const center: [number, number] =
    allCoords.length > 0
      ? [allCoords.reduce((sum, c) => sum + c[0], 0) / allCoords.length, allCoords.reduce((sum, c) => sum + c[1], 0) / allCoords.length]
      : [20.5937, 78.9629];

  if (landCoords.length === 0) {
    return (
      <div className="flex h-36 w-full flex-col items-center justify-center gap-1 bg-slate-900 text-slate-500">
        <MapPinned className="h-5 w-5 opacity-40" />
        <span className="text-[10px] font-bold">No coordinates</span>
      </div>
    );
  }

  return (
    <div className="h-36 w-full">
      <MapContainer
        key={`${farm.farm_id}-${plotIds.join(",")}`}
        center={center}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        attributionControl={false}
      >
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
        {landCoords.length >= 3 && (
          <Polygon positions={landCoords} pathOptions={{ color: "var(--land-boundary-color, #fde047)", fillColor: "var(--land-boundary-fill, #fef9c3)", fillOpacity: 0.28, weight: 3 }} />
        )}
        {hasPlots &&
          plots.map((plot, index) => {
            if ((plot.plot_coordinates?.length ?? 0) < 3) return null;
            const isMatch = highlightAll || plotIdSet.has(plot.plot_id);
            const key = normalizeCropKey(plot.crop_type || farm.crop_type);
            const color = isMatch ? cropColor(key, index) : DIMMED_COLOR;
            return (
              <Polygon
                key={plot.plot_id || plot.plot_name || index}
                positions={plot.plot_coordinates}
                pathOptions={{ color, fillColor: color, fillOpacity: isMatch ? 0.55 : 0.12, weight: isMatch ? 2.5 : 1 }}
              />
            );
          })}
        <FitBounds coords={allCoords} />
      </MapContainer>
    </div>
  );
};

const TaskTimelineCard = ({
  task,
  farm,
  assignment,
  assignmentLoading,
  progressImages,
}: {
  task: CalendarTask;
  farm?: Farm;
  assignment?: FarmTeamAssignment;
  assignmentLoading: boolean;
  // undefined = not fetched yet (still loading or task isn't eligible), [] = fetched, none found
  progressImages?: string[];
}) => {
  const Icon = activityIconFor(task.activity);
  const cropKey = normalizeCropKey(task.cropType);
  const accentColor = cropColor(cropKey, 0);
  const isCompleted = taskStatusTone(task.status) === "green";

  return (
    <div className="w-96 shrink-0 overflow-hidden rounded-2xl border-2 border-slate-200 bg-white shadow-md">
      <div className="h-2.5" style={{ backgroundColor: accentColor }} />
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
              <Icon className="h-5 w-5" />
            </span>
            <p className="truncate text-sm font-black text-slate-950">{task.activity}</p>
          </div>
          <Pill tone={taskStatusTone(task.status)}>{taskStatusLabel(task.status)}</Pill>
        </div>

        <p className="text-xs font-bold text-slate-500">{fmtTaskDate(task.date)}</p>

        <div>
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">Photos</p>
          {!isCompleted ? (
            <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-400">
              Photos available once completed
            </div>
          ) : progressImages === undefined ? (
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((idx) => (
                <div key={idx} className="h-24 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : progressImages.length === 0 ? (
            <div className="flex h-16 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-300">
              <ImageIcon className="h-5 w-5" />
              <span className="text-[9px] font-bold">No photos uploaded</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {progressImages.slice(0, 3).map((url, idx) => (
                <a
                  key={url || idx}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block h-24 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                >
                  <img src={url} alt={`${task.activity} progress ${idx + 1}`} loading="lazy" className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2.5">
          <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">
            <Users className="h-3 w-3" /> Team
          </p>
          {assignmentLoading ? (
            <span className="mt-1 block h-3 w-24 animate-pulse rounded bg-slate-200" />
          ) : (
            <>
              <p className="mt-1 truncate text-xs font-bold text-slate-700">Sup: {assignment?.supervisorName || "—"}</p>
              <p className="truncate text-xs font-bold text-slate-700">FM: {assignment?.fieldManagers[0]?.name || "—"}</p>
            </>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-100">
          <TaskPlotMapThumbnail farm={farm} plotIds={task.plots.map((plot) => plot.plot_id)} />
        </div>
        <p className="text-center text-[10px] font-bold text-slate-400">
          {farm?.farm_id ?? task.farmId} · {task.assignedArea.toFixed(2)} ac
        </p>
      </div>
    </div>
  );
};

const TaskTimelineSection = ({
  tasks,
  farmsById,
  assignmentByFarm,
  loading,
}: {
  tasks: CalendarTask[];
  farmsById: Map<string, Farm>;
  assignmentByFarm: Record<string, FarmTeamAssignment>;
  loading: boolean;
}) => {
  const [progressImagesByTask, setProgressImagesByTask] = useState<Record<string, string[]>>({});
  const fetchedTaskIds = useRef<Set<string>>(new Set());

  // One bulk POST for whatever completed tasks' progress photos aren't already cached/fetched —
  // same shared cache getTaskDetailsBulk (and every other bulk lookup on this page) draws from,
  // instead of one get_task_details call per card.
  useEffect(() => {
    const taskIds = Array.from(
      new Set(tasks.filter((task) => taskStatusTone(task.status) === "green" && task.taskId).map((task) => task.taskId as string)),
    );
    const idsToFetch = taskIds.filter((taskId) => !fetchedTaskIds.current.has(taskId));
    if (idsToFetch.length === 0) return;
    idsToFetch.forEach((taskId) => fetchedTaskIds.current.add(taskId));

    getTaskDetailsBulk(idsToFetch).then((details) => {
      setProgressImagesByTask((prev) => {
        const next = { ...prev };
        idsToFetch.forEach((taskId) => {
          const images = details[taskId]?.progress_images;
          next[taskId] = Array.isArray(images) ? (images as string[]) : [];
        });
        return next;
      });
    });
  }, [tasks]);

  return (
    <Card className="p-5">
      <SectionHeader title="Task Timeline" right={<Pill tone="blue">{tasks.length} Tasks</Pill>} />
      {loading ? (
        <div className="flex h-56 flex-col items-center justify-center gap-2 text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin opacity-50" />
          <p className="text-xs font-bold">Loading tasks…</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex h-56 items-center justify-center text-sm font-bold text-slate-400">No tasks scheduled this month</div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="relative flex items-start gap-6 px-2" style={{ minWidth: "max-content" }}>
            <div className="pointer-events-none absolute left-2 right-2 top-[13px] h-0.5 bg-slate-200" />
            {tasks.map((task, index) => {
              const key = `${task.calanderId}-${task.date}-${task.farmId}-${task.status}-${index}`;
              return (
                <div key={key} className="relative z-10 flex w-96 shrink-0 flex-col items-center">
                  <span className="mb-1 text-[10px] font-black text-slate-500">{fmtTaskDate(task.date)}</span>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 shadow" />
                  <div className="h-4 w-px bg-slate-200" />
                  <TaskTimelineCard
                    task={task}
                    farm={farmsById.get(task.farmId)}
                    assignment={assignmentByFarm[task.farmId]}
                    assignmentLoading={!(task.farmId in assignmentByFarm)}
                    progressImages={task.taskId ? progressImagesByTask[task.taskId] : []}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
};

const CultivationTrackerView = ({
  onOpenModule,
  farms,
  farmerNames,
  farmsLoading,
  clusterSummaries = [],
  clusterLoading = false,
  calendarData = {},
  calendarTasks = {},
  calendarLoading = false,
}: {
  onOpenModule: (route: string) => void;
  farms: Farm[];
  farmerNames: Record<string, string>;
  farmsLoading: boolean;
  clusterSummaries?: ClusterCropSummary[];
  clusterLoading?: boolean;
  calendarData?: CalendarDayMap;
  calendarTasks?: CalendarTaskMap;
  calendarLoading?: boolean;
}) => {
  const [selectedCrop, setSelectedCrop] = useState<string | null>(null);
  const cropUnits = useMemo(() => buildCropUnits(farms), [farms]);
  // Single source of truth for "what period is the tracker looking at" — the week grid drives
  // it directly, and the crop-wise summary / task timeline below derive their month from it, so
  // sliding weeks in the calendar keeps everything else on the page in sync.
  const [weekStart, setWeekStart] = useState(() => cultivationTrackerDefaultWeek());
  const activeMonth = useMemo(() => startOfMonth(weekStart), [weekStart]);

  const monthTasks = useMemo(() => {
    const prefix = `${activeMonth.getFullYear()}-${pad2(activeMonth.getMonth() + 1)}-`;
    return Object.entries(calendarTasks)
      .filter(([dateStr]) => dateStr.startsWith(prefix))
      .flatMap(([, rows]) => rows)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [calendarTasks, activeMonth]);

  const farmsById = useMemo(() => new Map(farms.map((farm) => [farm.farm_id, farm])), [farms]);

  const [assignmentByFarm, setAssignmentByFarm] = useState<Record<string, FarmTeamAssignment>>({});
  const fetchedAssignmentFarmIds = useRef<Set<string>>(new Set());

  // One bulk POST for whatever farms' supervisor/FM aren't already cached, reusing the same
  // shared cache the Cultivation Calendar page draws from — instead of one request per farm_id.
  useEffect(() => {
    const farmIds = Array.from(new Set(monthTasks.map((task) => task.farmId)));
    const idsToFetch = farmIds.filter((farmId) => !fetchedAssignmentFarmIds.current.has(farmId));
    if (idsToFetch.length === 0) return;
    idsToFetch.forEach((farmId) => fetchedAssignmentFarmIds.current.add(farmId));

    getAssignedSupervisorAndFieldManagers(idsToFetch).then((results) => {
      setAssignmentByFarm((prev) => ({ ...prev, ...results }));
    });
  }, [monthTasks]);

  // Real figures off the live farms/calendar data — Total Area is every registered land's own
  // area, Current Cultivable Area is only the area that's actually been broken into land_plots
  // (what's plotted out for cultivation, not just registered). Planned Activities is deliberately
  // NOT scoped to whatever week/month the calendar below happens to be showing — it's every
  // distinct activity type (1st Ploughing, 2nd Ploughing, ...) across the entire cultivation plan.
  const cultivationKpis = useMemo(() => {
    const totalArea = farms.reduce((sum, farm) => sum + (Number(farm.area) || 0), 0);
    const cultivableArea = farms.reduce(
      (sum, farm) => sum + (farm.land_plots ?? []).reduce((plotSum, plot) => plotSum + (Number(plot.plot_area) || 0), 0),
      0,
    );

    const activityTypes = new Set<string>();
    Object.values(calendarData).forEach((rows) => {
      rows.forEach((row) => activityTypes.add(row.activity));
    });

    const formatAcresValue = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 1 });

    return [
      { label: "Total Area", value: formatAcresValue(totalArea), suffix: "Acres", tone: "text-blue-700" },
      { label: "Current Cultivable Area", value: formatAcresValue(cultivableArea), suffix: "Acres", tone: "text-emerald-700" },
      { label: "Total Lands", value: String(farms.length), suffix: "Parcels", tone: "text-violet-700" },
      { label: "Planned Activities", value: String(activityTypes.size), suffix: "Types", tone: "text-amber-700" },
    ];
  }, [farms, calendarData]);

  return (
  <div className="space-y-4">
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cultivationKpis.map((stat) => (
        <Card key={stat.label} className="p-4">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">{stat.label}</p>
          <div className="mt-3 flex items-end gap-2">
            <p className={cn("text-3xl font-black tracking-normal", stat.tone)}>{stat.value}</p>
            <p className="pb-1 text-sm font-bold text-slate-600">{stat.suffix}</p>
          </div>
        </Card>
      ))}
    </section>

    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_7fr]">
      <CropDivisionCard
        units={cropUnits}
        loading={farmsLoading}
        selectedCrop={selectedCrop}
        onSelectCrop={setSelectedCrop}
        clusterSummaries={clusterSummaries}
        clusterLoading={clusterLoading}
      />
      <PlotMapViewerCard farms={farms} farmerNames={farmerNames} units={cropUnits} loading={farmsLoading} selectedCrop={selectedCrop} onClear={() => setSelectedCrop(null)} />
    </section>

    <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <CultivationCalendarCard
        calendarData={calendarData}
        loading={calendarLoading}
        weekStart={weekStart}
        onWeekChange={setWeekStart}
        onOpenPlanner={(monthDate) =>
          onOpenModule(`/cultivation-calendar?month=${monthDate.getFullYear()}-${pad2(monthDate.getMonth() + 1)}`)
        }
      />

      <CropActivitySummaryCard
        calendarData={calendarData}
        loading={calendarLoading}
        weekStart={weekStart}
        farms={farms}
        farmerNames={farmerNames}
      />
    </section>

    <TaskTimelineSection tasks={monthTasks} farmsById={farmsById} assignmentByFarm={assignmentByFarm} loading={calendarLoading} />
  </div>
  );
};

const CeosDesk = () => {
  const [activeTabId, setActiveTabId] = useState("dashboard");
  const navigate = useNavigate();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(false);
  const [clusterList, setClusterList] = useState<ClusterEntry[]>([]);
  const [clusterLoading, setClusterLoading] = useState(false);
  const [calendarData, setCalendarData] = useState<CalendarDayMap>({});
  const [calendarTasks, setCalendarTasks] = useState<CalendarTaskMap>({});
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [financialKpis, setFinancialKpis] = useState<FinancialKpis | null>(null);
  const [financialLoading, setFinancialLoading] = useState(false);
  const [budgetBifurcation, setBudgetBifurcation] = useState<BudgetBifurcation[]>([]);
  const [budgetBifurcationLoading, setBudgetBifurcationLoading] = useState(false);
  const [actualDisbursements, setActualDisbursements] = useState<ActualDisbursementRecord[]>([]);
  const [actualDisbursementsLoading, setActualDisbursementsLoading] = useState(false);
  const [disbursementSeries, setDisbursementSeries] = useState<DisbursementWeek[]>([]);
  const [disbursementSeriesLoading, setDisbursementSeriesLoading] = useState(false);
  const [categoryBudgets, setCategoryBudgets] = useState<BudgetCategoryBifurcation[]>([]);
  const [categoryBudgetsLoading, setCategoryBudgetsLoading] = useState(false);
  const [farmerNames, setFarmerNames] = useState<Record<string, string>>({});
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemRecord[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [staffRecords, setStaffRecords] = useState<StaffRecord[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);

  // Load every tab's data as soon as the desk opens — not gated on which tab is active —
  // so the data is already there the moment the user clicks a tab. Tiers run in priority
  // order (Land Acquisition, then Cultivation Tracker, then Financial Analysis) rather than
  // all at once, since the backend only runs 2 workers.
  useEffect(() => {
    let cancelled = false;
    const base = getBaseUrl().replace(/\/$/, "");

    const loadLandAcquisition = async () => {
      setLeadsLoading(true);
      try {
        const data: { leads?: any[] } = await cachedJson(`${base}/farmer_managment/get_leads`);
        if (!cancelled) setLeads(transformLeads(Array.isArray(data?.leads) ? data.leads : []));
      } catch {
        if (!cancelled) setLeads([]);
      } finally {
        if (!cancelled) setLeadsLoading(false);
      }
    };

    const loadCultivationTracker = async () => {
      setFarmsLoading(true);
      setClusterLoading(true);
      setCalendarLoading(true);

      const farmsPromise = cachedJson<{ farms?: Farm[] }>(`${base}/farmer_managment/get_farms`)
        .then((data) => {
          if (!cancelled) setFarms(Array.isArray(data?.farms) ? data.farms : []);
        })
        .catch(() => {
          if (!cancelled) setFarms([]);
        })
        .finally(() => {
          if (!cancelled) setFarmsLoading(false);
        });

      const clusterPromise = cachedJson<{ success?: boolean; clusters?: ClusterEntry[] }>(`${base}/ceo_desk/get_cluster_wise_crop_distribution`)
        .then((data) => {
          if (!cancelled) setClusterList(Array.isArray(data?.clusters) ? data.clusters : []);
        })
        .catch(() => {
          if (!cancelled) setClusterList([]);
        })
        .finally(() => {
          if (!cancelled) setClusterLoading(false);
        });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calendarPromise = cachedJson<any>(`${base}/admin_cultivation/fetch_cultivation_calander`)
        .then(async (data) => {
          const parsed = parseCultivationCalendar(data);
          const cropTypeByCalanderId = await fetchCropTypesForCalanders(base, collectCalanderIds(parsed));
          return {
            days: applyCalanderCropTypes(parsed, cropTypeByCalanderId),
            tasks: applyTaskCropTypes(parseCultivationTasks(data), cropTypeByCalanderId),
          };
        })
        .then(({ days, tasks }) => {
          if (!cancelled) {
            setCalendarData(days);
            setCalendarTasks(tasks);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCalendarData({});
            setCalendarTasks({});
          }
        })
        .finally(() => {
          if (!cancelled) setCalendarLoading(false);
        });

      await Promise.all([farmsPromise, clusterPromise, calendarPromise]);
    };

    const loadFinancialAnalysis = async () => {
      setFinancialLoading(true);
      setBudgetBifurcationLoading(true);
      setCategoryBudgetsLoading(true);

      const kpiPromise = cachedJson<{ success?: boolean; data?: FinancialKpis }>(`${base}/ceo_desk/get_financial_analytics_KPIs`)
        .then((data) => {
          if (!cancelled) setFinancialKpis(data?.success && data?.data ? data.data : null);
        })
        .catch(() => {
          if (!cancelled) setFinancialKpis(null);
        })
        .finally(() => {
          if (!cancelled) setFinancialLoading(false);
        });

      const budgetBifPromise = cachedJson<{ success?: boolean; data?: BudgetBifurcation[] }>(`${base}/ceo_desk/budget_wise_utilization_bifurcation`)
        .then((data) => {
          const rows = data?.success && Array.isArray(data?.data) ? data.data : [];
          if (!cancelled) setBudgetBifurcation(rows);
          return rows;
        })
        .catch(() => {
          if (!cancelled) setBudgetBifurcation([]);
          return [] as BudgetBifurcation[];
        })
        .finally(() => {
          if (!cancelled) setBudgetBifurcationLoading(false);
        });

      const categoryPromise = fetchCompleteCategoryBudgets(base)
        .then((rows) => {
          if (!cancelled) setCategoryBudgets(rows);
          return rows;
        })
        .catch(() => {
          if (!cancelled) setCategoryBudgets([]);
          return [] as BudgetCategoryBifurcation[];
        })
        .finally(() => {
          if (!cancelled) setCategoryBudgetsLoading(false);
        });

      // Real payment feed for the Dashboard's Actual Disbursement vs Budget Utilized figure —
      // same endpoint FinancialAnalysisView's own DisbursementSequenceCard draws from.
      setActualDisbursementsLoading(true);
      const disbursementPromise = fetchActualDisbursements()
        .then((records) => {
          if (!cancelled) setActualDisbursements(records);
          return records;
        })
        .catch(() => {
          if (!cancelled) setActualDisbursements([]);
          return [] as ActualDisbursementRecord[];
        })
        .finally(() => {
          if (!cancelled) setActualDisbursementsLoading(false);
        });

      const [, budgetRows, categoryRows, disbursementRecords] = await Promise.all([
        kpiPromise,
        budgetBifPromise,
        categoryPromise,
        disbursementPromise,
      ]);
      if (!cancelled) {
        const existingBudgetIds = new Set(budgetRows.map((budget) => budget.budget_id));
        const missingBudgetRows = categoryRows
          .filter((budget) => !existingBudgetIds.has(budget.budget_id))
          .map((budget) => {
            const totals = budget.categories.reduce(
              (sum, category) => ({
                totalBudget: sum.totalBudget + category.total_budget,
                pipeline: sum.pipeline + category.amount_in_pipeline,
                utilized: sum.utilized + category.amount_utilized,
                remaining: sum.remaining + category.remaining,
              }),
              { totalBudget: 0, pipeline: 0, utilized: 0, remaining: 0 }
            );
            return {
              budget_id: budget.budget_id,
              budget_name: budget.budget_name,
              total_budget: totals.totalBudget,
              amount_in_pipeline: totals.pipeline,
              amount_utilized: totals.utilized,
              remaining: totals.remaining,
            } satisfies BudgetBifurcation;
          });
        const allBudgetRows = [...budgetRows, ...missingBudgetRows];
        setBudgetBifurcation(allBudgetRows);

        // Schedule-based "expected disbursement till date" for the Actual Disbursement KPI
        // (utilized / expected-till-date * 100) — same aggregation FinancialAnalysisView's
        // own DisbursementSequenceCard uses, run here too since that view owns its own
        // independent copy of this state.
        if (allBudgetRows.length > 0) {
          setDisbursementSeriesLoading(true);
          fetchAggregateDisbursementSeries(
            allBudgetRows.map((budget) => budget.budget_id),
            disbursementRecords,
            new AbortController().signal
          )
            .then((series) => {
              if (!cancelled) setDisbursementSeries(series);
            })
            .catch((err: unknown) => {
              if (!cancelled && (err as { name?: string })?.name !== "AbortError") setDisbursementSeries([]);
            })
            .finally(() => {
              if (!cancelled) setDisbursementSeriesLoading(false);
            });
        } else {
          setDisbursementSeries([]);
        }
      }
    };

    // Land Acquisition leads feed only the Land Acquisition tab — no Dashboard KPI or other tab
    // reads them — so they load independently instead of gating Cultivation Tracker/Financial
    // Analysis, which the Dashboard (the first tab shown) actually depends on.
    loadLandAcquisition();

    // Cultivation Tracker and Financial Analysis touch entirely disjoint state (farms/calendar vs
    // budgets/disbursements) — nothing in loadFinancialAnalysis reads anything loadCultivationTracker
    // sets, so there's no reason to await one before starting the other. Both fire immediately;
    // each still batches its own several calls with Promise.all internally.
    void Promise.all([loadCultivationTracker(), loadFinancialAnalysis()]);

    return () => {
      cancelled = true;
    };
  }, []);

  // Real inventory valuation for the Dashboard's Inventory & Store Value card — independent of
  // the tiered loader above since it isn't needed by any other tab.
  useEffect(() => {
    let cancelled = false;
    const base = getBaseUrl().replace(/\/$/, "");
    setInventoryLoading(true);
    cachedJson<{ success?: boolean; items?: InventoryItemRecord[] }>(`${base}/inventory/get_all_item`)
      .then((data) => {
        if (!cancelled) setInventoryItems(data?.success && Array.isArray(data?.items) ? data.items : []);
      })
      .catch(() => {
        if (!cancelled) setInventoryItems([]);
      })
      .finally(() => {
        if (!cancelled) setInventoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Real headcount for the Dashboard's Manpower Overview card.
  useEffect(() => {
    let cancelled = false;
    const base = getBaseUrl().replace(/\/$/, "");
    setStaffLoading(true);
    cachedJson<StaffRecord[]>(`${base}/admin_staff/get_all_staff`)
      .then((data) => {
        if (!cancelled) setStaffRecords(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setStaffRecords([]);
      })
      .finally(() => {
        if (!cancelled) setStaffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (farms.length === 0) return;
    let mounted = true;
    getFarmerNames(farms.map((farm) => farm.farm_id)).then((names) => {
      if (mounted) setFarmerNames((prev) => ({ ...prev, ...names }));
    });
    return () => {
      mounted = false;
    };
  }, [farms]);

  const clusterSummaries = useMemo(() => buildClusterCropSummaries(clusterList), [clusterList]);

  // The 9 Dashboard KPI tiles — all real, computed off the same farms/calendarData/budgetBifurcation
  // state the other tabs already fetch in the background, not placeholder numbers. Keyed by name
  // (not an array) so the explicit grid layout below can place each one by hand.
  const dashboardKpis = useMemo((): Record<
    | "totalLand"
    | "totalCultivableArea"
    | "totalLandParcels"
    | "cropWiseArea"
    | "totalBudget"
    | "budgetUtilized"
    | "budgetRemaining"
    | "expectedDisbursementMonth"
    | "capexOpexDistribution"
    | "actualDisbursementPct"
    | "activityDonePct"
    | "totalActivities",
    DashboardKpi
  > => {
    const totalLand = farms.reduce((sum, farm) => sum + (Number(farm.area) || 0), 0);
    const totalCultivable = farms.reduce(
      (sum, farm) => sum + (farm.land_plots ?? []).reduce((plotSum, plot) => plotSum + (Number(plot.plot_area) || 0), 0),
      0,
    );
    const cultivablePct = totalLand > 0 ? (totalCultivable / totalLand) * 100 : 0;

    // Area by crop, same fallback rule as everywhere else in this file: a plotted farm counts
    // each plot's own crop_type, an unplotted one counts its whole area under farm.crop_type.
    const cropAreaByKey = new Map<string, number>();
    farms.forEach((farm) => {
      const plots = farm.land_plots ?? [];
      if (plots.length > 0) {
        plots.forEach((plot) => {
          const key = normalizeCropKey(plot.crop_type || farm.crop_type);
          cropAreaByKey.set(key, (cropAreaByKey.get(key) ?? 0) + (Number(plot.plot_area) || 0));
        });
      } else {
        const key = normalizeCropKey(farm.crop_type);
        cropAreaByKey.set(key, (cropAreaByKey.get(key) ?? 0) + (Number(farm.area) || 0));
      }
    });
    const cropAreaEntries = Array.from(cropAreaByKey.entries()).sort((a, b) => b[1] - a[1]);
    const totalCropArea = cropAreaEntries.reduce((sum, [, area]) => sum + area, 0);

    const activityTypes = new Set<string>();
    // Per-activity-type planned/completed acreage — lets the "done 100%" helper below count how
    // many distinct activity types (1st Ploughing, 2nd Ploughing, ...) have had ALL their assigned
    // acreage completed, not just an overall acreage fraction across every activity mixed together.
    const activityTypeAcres = new Map<string, { planned: number; completed: number }>();
    let plannedAcres = 0;
    let completedAcres = 0;
    Object.values(calendarData).forEach((rows) => {
      rows.forEach((row) => {
        activityTypes.add(row.activity);
        const stats = activityTypeAcres.get(row.activity) ?? { planned: 0, completed: 0 };
        row.assignments.forEach((assignment) => {
          const acres = assignment.assigned_area || 0;
          plannedAcres += acres;
          stats.planned += acres;
          if (isCompletedAssignmentStatus(assignment.status)) {
            completedAcres += acres;
            stats.completed += acres;
          }
        });
        activityTypeAcres.set(row.activity, stats);
      });
    });
    const fullyCompletedActivityTypes = Array.from(activityTypeAcres.values()).filter(
      (stats) => stats.planned > 0 && stats.completed >= stats.planned,
    ).length;
    const activityDonePct = plannedAcres > 0 ? (completedAcres / plannedAcres) * 100 : 0;

    const { totalBudget, utilized } = sumBudgetTotals(budgetBifurcation);
    const budgetRemaining = totalBudget - utilized;
    const utilizedPct = totalBudget > 0 ? (utilized / totalBudget) * 100 : 0;
    const remainingFavorable = budgetRemaining >= 0;

    // Actual Disbursement = (Budget Utilized / Expected Disbursement Till Date) * 100 —
    // "expected till date" is the schedule-based cumulative figure (sum of each budget's
    // "ERP Disbursement" week columns up to the current week, see disbursementSeries/
    // fetchAggregateDisbursementSeries), in Cr — scaled to rupees here to match `utilized`.
    // <100% means utilization is behind what the disbursement schedule expected by now;
    // >=100% means it's caught up to (or ahead of) schedule.
    const expectedTillDate = disbursementSeries.reduce((sum, item) => sum + item.expected, 0) * 1e7;
    const actualDisbursementPct = expectedTillDate > 0 ? (utilized / expectedTillDate) * 100 : null;
    const disbursementOnSchedule = actualDisbursementPct === null || actualDisbursementPct >= 100;

    const capex = Math.max(financialKpis?.total_capex ?? 0, 0);
    const opex = Math.max(financialKpis?.total_opex ?? 0, 0);

    // Whatever's scheduled (per the ERP Disbursement sheet) across every week that falls in the
    // current calendar month — the whole month's planned figure, not just weeks already reached.
    const currentMonthShort = new Date().toLocaleString("default", { month: "short" });
    const expectedDisbursementThisMonth =
      disbursementSeries
        .filter((item) => item.week.startsWith(`${currentMonthShort} `))
        .reduce((sum, item) => sum + item.planned, 0) * 1e7;

    const formatAcresValue = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 1 });

    // Which underlying fetch each tile's value is computed from — kept close to the return object
    // below so a card's loading flag can never drift out of sync with what it actually depends on.
    const landLoading = farmsLoading;
    const activityLoading = calendarLoading;
    const budgetLoading = financialLoading || budgetBifurcationLoading;
    const disbursementLoading = budgetBifurcationLoading || disbursementSeriesLoading;

    return {
      totalLand: { label: "Total Land", value: formatAcresValue(totalLand), suffix: "Acres", helper: "", tone: "green", icon: MapPinned, loading: landLoading },
      totalCultivableArea: {
        label: "Total Cultivable Area",
        value: formatAcresValue(totalCultivable),
        suffix: "Acres",
        helper: `${cultivablePct.toFixed(1)}% of Total Land`,
        tone: "blue",
        icon: Sprout,
        progress: Math.round(cultivablePct),
        chart: "pie",
        loading: landLoading,
      },
      totalLandParcels: { label: "Total Land Parcels", value: String(farms.length), suffix: "Parcels", helper: "", tone: "purple", icon: Landmark, loading: landLoading },
      cropWiseArea: {
        label: "Crop-wise Area",
        value: formatAcresValue(totalCropArea),
        suffix: "Acres",
        helper: `${cropAreaEntries.length} crop${cropAreaEntries.length === 1 ? "" : "s"}`,
        tone: "green",
        icon: Wheat,
        breakdown: cropAreaEntries.map(([key, area], index) => ({ label: cropLabel(key), value: area, color: cropColor(key, index) })),
        breakdownFormat: "acres",
        hideHeader: true,
        loading: landLoading,
      },
      totalActivities: {
        label: "Total Cultivation Activities",
        value: String(activityTypes.size),
        suffix: "Types",
        helper: "",
        tone: "orange",
        icon: ClipboardList,
        loading: activityLoading,
      },
      totalBudget: {
        label: "Total Budget",
        value: formatFinancialAmount(totalBudget),
        suffix: "",
        helper: "",
        tone: "blue",
        icon: IndianRupee,
        loading: budgetLoading,
      },
      capexOpexDistribution: {
        label: "Capex / Opex Distribution",
        value: formatFinancialAmount(capex + opex),
        suffix: "",
        helper: "",
        tone: "blue",
        icon: IndianRupee,
        breakdown: [
          { label: "Capex", value: capex, color: "#16a34a" },
          { label: "Opex", value: opex, color: "#7c3aed" },
        ],
        hideValue: true,
        loading: budgetLoading,
      },
      actualDisbursementPct: {
        label: "Actual Disbursement",
        value: actualDisbursementPct === null ? "--" : actualDisbursementPct.toFixed(0),
        suffix: actualDisbursementPct === null ? "" : "%",
        helper: "",
        tone: disbursementOnSchedule ? "green" : "red",
        icon: disbursementOnSchedule ? TrendingUp : TrendingDown,
        splitAmounts: [
          { label: "Actual", value: utilized },
          { label: "Expected", value: expectedTillDate },
        ],
        loading: disbursementLoading,
      },
      activityDonePct: {
        label: "Percentage of activity done",
        value: activityDonePct.toFixed(1),
        suffix: "%",
        helper: `${fullyCompletedActivityTypes} activities out of ${activityTypes.size} activities are done 100%`,
        tone: "green",
        icon: Wheat,
        progress: Math.round(activityDonePct),
        chart: "pie",
        loading: activityLoading,
      },
      budgetUtilized: {
        label: "Budget Utilized",
        value: formatFinancialAmount(utilized),
        suffix: "",
        helper: totalBudget > 0 ? `${utilizedPct.toFixed(1)}% of Total Budget` : "",
        tone: "orange",
        icon: IndianRupee,
        loading: budgetLoading,
      },
      budgetRemaining: {
        label: "Budget Remaining",
        value: formatFinancialAmount(budgetRemaining),
        suffix: "",
        helper: remainingFavorable ? "Within Total Budget" : "Exceeds Total Budget",
        tone: remainingFavorable ? "green" : "red",
        icon: Landmark,
        loading: budgetLoading,
      },
      expectedDisbursementMonth: {
        label: "Expected Disbursement (Current Month)",
        value: formatFinancialAmount(expectedDisbursementThisMonth),
        suffix: "",
        helper: "",
        tone: "purple",
        icon: IndianRupee,
        loading: disbursementLoading,
      },
    };
  }, [
    farms,
    calendarData,
    budgetBifurcation,
    financialKpis,
    disbursementSeries,
    farmsLoading,
    calendarLoading,
    financialLoading,
    budgetBifurcationLoading,
    disbursementSeriesLoading,
  ]);

  // Budget Utilization Trend chart — cumulative running total of real PRR payments
  // (BASE_URL/ceo_desk/get_actual_disbursement), one point per distinct date_of_prr:
  // same-day PRRs are summed together first, then the running total carries forward
  // date over date (Date 1: Amount 1, Date 2: Amount 1 + Amount 2, ...).
  const utilizationTrendData = useMemo(() => {
    const totalsByDate = new Map<string, number>();
    actualDisbursements.forEach((record) => {
      const date = record.date_of_prr;
      if (!date) return;
      totalsByDate.set(date, (totalsByDate.get(date) || 0) + (Number(record.amount) || 0));
    });

    let cumulative = 0;
    return Array.from(totalsByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => {
        cumulative += amount;
        const parsed = new Date(date);
        const label = Number.isNaN(parsed.getTime())
          ? date
          : parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
        return { date, label, utilized: Number((cumulative / 1e7).toFixed(3)) };
      });
  }, [actualDisbursements]);

  // Total Budget reference line + "% of budget disbursed so far" badge — gives the trend line an
  // actual ceiling to read against instead of floating with no context for what's a lot vs a little.
  const totalBudgetCr = useMemo(() => sumBudgetTotals(budgetBifurcation).totalBudget / 1e7, [budgetBifurcation]);
  const latestUtilizedCr = utilizationTrendData.length > 0 ? utilizationTrendData[utilizationTrendData.length - 1].utilized : 0;
  const utilizedPctOfBudget = totalBudgetCr > 0 ? (latestUtilizedCr / totalBudgetCr) * 100 : 0;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex flex-col gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <Landmark className="h-6 w-6 text-slate-700" />
              <h1 className="text-2xl font-black tracking-normal">CEO's Desk</h1>
            </div>

            <Card className="mt-4 overflow-x-auto px-3">
              <div className="flex min-w-max items-center gap-4">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = tab.id === activeTabId;
                  return (
                    <button
                      key={tab.label}
                      type="button"
                      onClick={() => setActiveTabId(tab.id)}
                      className={cn(
                        "inline-flex h-12 items-center gap-2 border-b-2 px-2 text-sm font-extrabold transition-colors",
                        active ? "border-blue-700 text-blue-700" : "border-transparent text-slate-700 hover:text-blue-700",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>

        </div>
      </div>

      <div className="space-y-3 px-6 py-4">
        {activeTabId === "land-acquisition" ? (
          <LandAcquisitionView leads={leads} leadsLoading={leadsLoading} onOpenModule={(route) => navigate(route)} />
        ) : activeTabId === "project-map" ? (
          <ProjectMapView farms={farms} clusterList={clusterList} />
        ) : activeTabId === "financial-analysis" ? (
          <FinancialAnalysisView
            kpis={financialKpis}
            loading={financialLoading}
            budgets={budgetBifurcation}
            budgetsLoading={budgetBifurcationLoading}
            categoryBudgets={categoryBudgets}
            categoryBudgetsLoading={categoryBudgetsLoading}
            farms={farms}
            farmerNames={farmerNames}
            farmsLoading={farmsLoading}
            actualDisbursements={actualDisbursements}
            disbursementSeries={disbursementSeries}
            disbursementLoading={disbursementSeriesLoading}
          />
        ) : activeTabId === "cultivation-tracker" ? (
          <CultivationTrackerView
            onOpenModule={(route) => navigate(route)}
            farms={farms}
            farmerNames={farmerNames}
            farmsLoading={farmsLoading}
            clusterSummaries={clusterSummaries}
            clusterLoading={clusterLoading}
            calendarData={calendarData}
            calendarTasks={calendarTasks}
            calendarLoading={calendarLoading}
          />
        ) : (
          <>
        {/* Three plain equal-width rows now that nothing spans multiple rows anymore — Total
            Budget, Capex/Opex Distribution, and Actual Disbursement are each their own standalone
            tile instead of sharing one tall card. */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard card={dashboardKpis.totalLand} />
          <KpiCard card={dashboardKpis.totalCultivableArea} />
          <KpiCard card={dashboardKpis.totalLandParcels} />
          <KpiCard card={dashboardKpis.cropWiseArea} />
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard card={dashboardKpis.totalBudget} />
          <KpiCard card={dashboardKpis.budgetUtilized} />
          <KpiCard card={dashboardKpis.budgetRemaining} />
          <KpiCard card={dashboardKpis.expectedDisbursementMonth} />
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard card={dashboardKpis.capexOpexDistribution} />
          <KpiCard card={dashboardKpis.actualDisbursementPct} />
          <KpiCard card={dashboardKpis.activityDonePct} />
          <KpiCard card={dashboardKpis.totalActivities} />
        </section>

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-[0.86fr_1.14fr]">
          <ClusterLandMapCard farms={farms} clusterList={clusterList} loading={clusterLoading} />

          <Card className="p-5">
            <SectionHeader
              title="Budget Utilization Trend"
              right={totalBudgetCr > 0 && <Pill tone="green">{utilizedPctOfBudget.toFixed(1)}% of Total Budget</Pill>}
            />
            <p className="-mt-2 mb-3 text-xs font-semibold text-slate-500">
              Cumulative real disbursement (actual PRR payments), one point per payment date.
            </p>
            {actualDisbursementsLoading ? (
              <div className="flex h-[248px] flex-col items-center justify-center gap-2 text-slate-400">
                <RefreshCw className="h-6 w-6 animate-spin opacity-50" />
                <p className="text-xs font-bold">Loading disbursement history…</p>
              </div>
            ) : utilizationTrendData.length === 0 ? (
              <div className="flex h-[248px] items-center justify-center text-sm font-bold text-slate-400">No disbursements recorded yet</div>
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer>
                  <AreaChart data={utilizationTrendData} margin={{ left: -12, right: 12, top: 6, bottom: 8 }}>
                    <defs>
                      <linearGradient id="utilizationFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#16a34a" stopOpacity={0.32} />
                        <stop offset="95%" stopColor="#16a34a" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10, fontWeight: 700 }}
                      interval="preserveStartEnd"
                      minTickGap={24}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={60}
                      tick={{ fontSize: 11, fontWeight: 700 }}
                      tickFormatter={(value: number) => formatCroreChartValue(value)}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatCroreChartValue(value), "Cumulative Disbursed"]}
                      labelFormatter={(label: string) => label}
                    />
                    <Area
                      type="monotone"
                      dataKey="utilized"
                      stroke="#16a34a"
                      strokeWidth={3}
                      fill="url(#utilizationFill)"
                      dot={{ r: 3, strokeWidth: 0, fill: "#16a34a" }}
                      activeDot={{ r: 5 }}
                      name="Cumulative Disbursed"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </section>

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <InventoryStoreValueCard items={inventoryItems} loading={inventoryLoading} />
          <ManpowerOverviewCard staff={staffRecords} loading={staffLoading} />
        </section>

          </>
        )}
      </div>

      <footer className="flex flex-col gap-2 border-t border-slate-200 bg-white px-6 py-4 text-xs font-semibold text-slate-600 md:flex-row md:items-center md:justify-between">
        <span>© 2024 SaiBioresources Private Limited. All rights reserved.</span>
      </footer>
    </main>
  );
};

export default CeosDesk;
