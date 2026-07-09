import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MapContainer, TileLayer, Polygon, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  AlarmClock,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Droplets,
  Image as ImageIcon,
  IndianRupee,
  Landmark,
  Leaf,
  MapPinned,
  RefreshCw,
  Shovel,
  Sprout,
  Tractor,
  Users,
  Wheat,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import getBaseUrl from "@/lib/config";
import { getFarmerNames } from "@/lib/farmerNameCache";
import type { Lead } from "@/types/farm";

type Tone = "green" | "blue" | "orange" | "purple" | "red";

const kpiCards = [
  {
    label: "Total Land Area",
    value: "757",
    suffix: "Acres",
    helper: "",
    tone: "green" as Tone,
    icon: MapPinned,
    progress: 100,
    clusters: [
      { name: "North", acres: 214, percent: 28 },
      { name: "Central", acres: 196, percent: 26 },
      { name: "East", acres: 182, percent: 24 },
      { name: "South", acres: 165, percent: 22 },
    ],
  },
  {
    label: "Land Under Cultivation",
    value: "482",
    suffix: "Acres",
    helper: "63.64% of Total Land",
    tone: "blue" as Tone,
    icon: Sprout,
    progress: 64,
    chart: "pie",
  },
  {
    label: "Budget Utilized",
    value: "Rs 7.82",
    suffix: "Cr",
    helper: "60.86% Utilized",
    tone: "green" as Tone,
    icon: IndianRupee,
    progress: 61,
    chart: "pie",
  },
  {
    label: "Pending Approvals",
    value: "12",
    suffix: "Requests",
    helper: "Awaiting review",
    tone: "orange" as Tone,
    icon: ClipboardList,
    progress: 42,
  },
  {
    label: "New Land Leads",
    value: "214",
    suffix: "Acres",
    helper: "Fresh parcels this month",
    tone: "purple" as Tone,
    icon: MapPinned,
    progress: 86,
  },
  {
    label: "Delayed Activities",
    value: "07",
    suffix: "Activities",
    helper: "Require Attention",
    tone: "red" as Tone,
    icon: AlarmClock,
    progress: 18,
  },
];

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
];

const landProgress = [
  { name: "Under Agreement", value: 152, color: "#2389e8" },
  { name: "Land Prepared", value: 123, color: "#56c02f" },
  { name: "Under Cultivation", value: 482, color: "#46b725" },
  { name: "On Hold / Disputed", value: 18, color: "#f97316" },
  { name: "Dropped", value: 0.01, labelValue: 0, color: "#a8b0bf" },
];

const budgetTrend = [
  { month: "Apr 24", approved: 1.8, utilized: 0.9 },
  { month: "May 24", approved: 3.8, utilized: 1.9 },
  { month: "Jun 24", approved: 4.8, utilized: 2.8 },
  { month: "Jul 24", approved: 6.0, utilized: 3.7 },
  { month: "Aug 24", approved: 7.4, utilized: 4.9 },
  { month: "Sep 24", approved: 9.4, utilized: 5.7 },
  { month: "Oct 24", approved: 10.3, utilized: 7.2 },
  { month: "Nov 24", approved: 10.8, utilized: 7.5 },
  { month: "Dec 24", approved: 11.0, utilized: 7.7 },
  { month: "Jan 25", approved: 11.4, utilized: 8.5 },
  { month: "Feb 25", approved: 12.1, utilized: 8.8 },
  { month: "Mar 25", approved: 13.1, utilized: 10.1 },
];

const activityStatus = [
  { name: "Completed", value: 78, color: "#22c55e" },
  { name: "In Progress", value: 15, color: "#f59e0b" },
  { name: "Pending", value: 5, color: "#fbbf24" },
  { name: "Delayed", value: 2, color: "#ef4444" },
];

const cropArea = [
  { crop: "Paddy", acres: 260, fill: "#39b54a" },
  { crop: "Rahar", acres: 110, fill: "#2f95e8" },
  { crop: "Napier", acres: 80, fill: "#fbbf24" },
  { crop: "Other Crops", acres: 32, fill: "#6d28d9" },
];

const manpower = [
  { name: "Field Managers", value: 18, color: "#0b5fe8" },
  { name: "Supervisors", value: 28, color: "#2563eb" },
  { name: "Skilled Labour", value: 92, color: "#22a765" },
  { name: "Unskilled Labour", value: 108, color: "#6d28d9" },
];

const focusAreas = [
  { label: "Procurement Discipline", helper: "PO compliance", value: "84%", tone: "green", width: "84%" },
  { label: "Field Execution", helper: "Planned tasks closed", value: "91%", tone: "green", width: "91%" },
  { label: "Budget Variance", helper: "Against approved plan", value: "6.8%", tone: "red", width: "22%" },
  { label: "Stock Health", helper: "Critical items available", value: "78%", tone: "orange", width: "78%" },
];

const approvals = [
  ["Payment Request", "PR-2024-05-125", "Field Manager - A", "Rs 2,45,600", "20 May 2024", "Pending"],
  ["Purchase Order", "PO-2024-05-078", "Cluster Manager - B", "Rs 1,75,000", "20 May 2024", "Pending"],
  ["Work Order", "WO-2024-05-059", "Field Manager - C", "Rs 95,420", "19 May 2024", "Pending"],
  ["Diesel Indent", "DI-2024-05-088", "Supervisor - D", "Rs 38,760", "19 May 2024", "Pending"],
];

const risks = [
  ["Activity delayed > 3 days", "Cluster B, C", "High", "4"],
  ["Budget utilization crossed 80%", "Cluster A", "High", "2"],
  ["Low stock for 18 items", "Multiple", "Medium", "1"],
  ["Diesel consumption high", "Cluster D", "High", "3"],
  ["Land dispute reported", "Village Khairpura", "Medium", "5"],
];

const forecast = [
  ["Next 7 Days", "1.25", "0.85", "-0.40"],
  ["Next 15 Days", "2.85", "1.60", "-1.25"],
  ["Next 30 Days", "5.60", "2.90", "-2.70"],
  ["Next 60 Days", "9.10", "3.75", "-5.35"],
];

const Card = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <section className={cn("rounded-xl border border-slate-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.06)]", className)}>
    {children}
  </section>
);

const pieKpiCards = kpiCards.filter((card) => card.chart === "pie");
const metricKpiCards = kpiCards.filter((card) => card.chart !== "pie");

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

const KpiCard = ({ card }: { card: (typeof kpiCards)[number] }) => {
  const Icon = card.icon;
  const style = toneStyles[card.tone];
  const showPieChart = card.chart === "pie";
  const hasClusters = "clusters" in card && Array.isArray(card.clusters);

  return (
    <Card className={cn("overflow-hidden", showPieChart ? "min-h-[124px] p-4" : hasClusters ? "min-h-[164px] p-4" : "min-h-[118px] p-4")}>
      <div className="flex h-full items-start justify-between gap-4">
        <div className={cn("min-w-0 flex-1", !showPieChart && "max-w-full")}>
          <div className="flex items-center gap-3">
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", style.iconBg)}>
              <Icon className={cn("h-5 w-5", style.icon)} />
            </div>
            <p className="text-sm font-extrabold text-slate-950">{card.label}</p>
          </div>
          <div className="mt-3 flex items-end gap-2">
            <p className="text-3xl font-black tracking-normal text-slate-950">{card.value}</p>
            <p className="pb-1 text-sm font-bold text-slate-700">{card.suffix}</p>
          </div>
          {card.helper && <p className={cn("mt-2 text-sm font-bold", style.helper)}>{card.helper}</p>}
        </div>
        {showPieChart && <KpiPieChart value={card.progress} color={style.ring} trackColor={style.ringSoft} />}
      </div>

      {hasClusters && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-slate-500">Cluster-wise bifurcation</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {card.clusters.map((cluster) => (
              <div key={cluster.name} className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-extrabold text-slate-700">{cluster.name}</span>
                  <span className="font-black text-slate-950">{cluster.acres} ac</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-slate-200">
                  <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${cluster.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
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

const leaseRenewals = [
  {
    parcelId: "LP-KHG-118",
    village: "Khairagarh",
    landowner: "Ramesh Sahu",
    area: "42 ac",
    expiry: "18 Aug 2024",
    rent: "Rs 18,500/ac",
    status: "Negotiation",
  },
  {
    parcelId: "LP-RJN-072",
    village: "Rajnandgaon",
    landowner: "Meena Verma",
    area: "36 ac",
    expiry: "04 Sep 2024",
    rent: "Rs 17,800/ac",
    status: "Docs Pending",
  },
  {
    parcelId: "LP-DGR-044",
    village: "Dongargarh",
    landowner: "Suresh Patel",
    area: "28 ac",
    expiry: "22 Oct 2024",
    rent: "Rs 19,200/ac",
    status: "Approved",
  },
  {
    parcelId: "LP-CHK-091",
    village: "Chhuikhadan",
    landowner: "Anita Nishad",
    area: "31 ac",
    expiry: "14 Nov 2024",
    rent: "Rs 18,100/ac",
    status: "Field Review",
  },
];

const leadStatusRows = [
  {
    leadId: "LL-2024-118",
    village: "Khairagarh",
    cluster: "North",
    landowner: "Ramesh Sahu",
    area: "72 ac",
    stage: "Lead Identified",
    status: "Due in 2 days",
    owner: "Field Manager - A",
    tone: "orange" as const,
  },
  {
    leadId: "LL-2024-096",
    village: "Rajnandgaon",
    cluster: "Central",
    landowner: "Meena Verma",
    area: "54 ac",
    stage: "Field Verification",
    status: "On track",
    owner: "Supervisor - C",
    tone: "green" as const,
  },
  {
    leadId: "LL-2024-083",
    village: "Dongargarh",
    cluster: "East",
    landowner: "Suresh Patel",
    area: "38 ac",
    stage: "Agreement Drafting",
    status: "Needs review",
    owner: "Legal Desk",
    tone: "yellow" as const,
  },
  {
    leadId: "LL-2024-071",
    village: "Chhuikhadan",
    cluster: "South",
    landowner: "Anita Nishad",
    area: "50 ac",
    stage: "Agreement Signed",
    status: "Ready",
    owner: "Cluster Manager - B",
    tone: "green" as const,
  },
];

const cultivationStats = [
  { label: "Planned Area", value: "642", suffix: "Acres", tone: "text-blue-700" },
  { label: "Completed Area", value: "482", suffix: "Acres", tone: "text-emerald-700" },
  { label: "Pending Area", value: "160", suffix: "Acres", tone: "text-amber-700" },
  { label: "Delayed Parcels", value: "07", suffix: "Parcels", tone: "text-red-700" },
];

type FinancialKpis = {
  total_budget: number;
  total_capex: number;
  total_opex: number;
  total_remaining: number;
  active_budgets_count?: number;
};

const formatCr = (value: number) => `Rs ${(value / 1e7).toFixed(2)}`;

const financialStatDefs = [
  { label: "Total Budget", key: "total_budget" as const, tone: "text-blue-700" },
  { label: "Total Capex", key: "total_capex" as const, tone: "text-emerald-700" },
  { label: "Total Opex", key: "total_opex" as const, tone: "text-violet-700" },
  { label: "Total Variance", key: "total_remaining" as const, tone: "text-red-700" },
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

const buildBudgetSegments = (entry: {
  total_budget: number;
  amount_in_pipeline: number;
  amount_utilized: number;
  remaining: number;
}) => {
  const segments = [
    { key: "pipeline", label: "In Pipeline", color: BUDGET_SEGMENT_COLORS.pipeline, value: Math.max(entry.amount_in_pipeline, 0) },
    { key: "utilized", label: "Utilized", color: BUDGET_SEGMENT_COLORS.utilized, value: Math.max(entry.amount_utilized, 0) },
    { key: "remaining", label: "Remaining", color: BUDGET_SEGMENT_COLORS.remaining, value: Math.max(entry.remaining, 0) },
  ];
  const unallocated = entry.total_budget - (entry.amount_in_pipeline + entry.amount_utilized + entry.remaining);
  if (unallocated > 0) {
    segments.push({ key: "unallocated", label: "Unallocated", color: BUDGET_SEGMENT_COLORS.unallocated, value: unallocated });
  }
  return segments;
};

const BudgetBifurcationRow = ({ budget }: { budget: BudgetBifurcation }) => {
  const segments = buildBudgetSegments(budget);

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="flex items-center gap-3">
        <div className="relative h-16 w-16 shrink-0">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={segments} dataKey="value" nameKey="label" innerRadius={18} outerRadius={30} paddingAngle={2}>
                {segments.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number, _name, item) => [`${formatCr(value)} Cr`, item?.payload?.label]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-black text-slate-950">{budget.budget_name}</p>
          <p className="text-[11px] font-bold text-slate-500">{formatCr(budget.total_budget)} Cr Total Value</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {segments
              .filter((entry) => entry.key !== "unallocated")
              .map((entry) => (
                <span key={entry.key} className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  {entry.label} {formatCr(entry.value)} Cr
                </span>
              ))}
          </div>
        </div>
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

  const aggregateSegments = useMemo(
    () =>
      buildBudgetSegments({
        total_budget: totals.totalBudget,
        amount_in_pipeline: totals.pipeline,
        amount_utilized: totals.utilized,
        remaining: totals.remaining,
      }),
    [totals],
  );

  const totalsList = [
    { label: "Total Value", value: totals.totalBudget, color: "#0f172a" },
    { label: "Total in Pipeline", value: totals.pipeline, color: BUDGET_SEGMENT_COLORS.pipeline },
    { label: "Total Utilized", value: totals.utilized, color: BUDGET_SEGMENT_COLORS.utilized },
    { label: "Total Remaining", value: totals.remaining, color: BUDGET_SEGMENT_COLORS.remaining },
  ];

  return (
    <Card className="p-5">
      <SectionHeader
        title="Budget Bifurcation"
        right={
          <Pill tone="blue">
            {budgets.length} Budgets · {formatCr(totals.totalBudget)} Cr
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
                <Tooltip formatter={(value: number, _name, item) => [`${formatCr(value)} Cr`, item?.payload?.label]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-sm font-black text-slate-950">{formatCr(totals.totalBudget)}</p>
              <p className="text-[9px] font-bold text-slate-600">Cr</p>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            {totalsList.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.label}
                </span>
                <span className="text-xs font-black text-slate-950">{formatCr(item.value)} Cr</span>
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

type DisbursementWeek = { week: string; planned: number; disbursed: number; cumulative: number };

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

// Aggregates the "ERP Disbursement" sheet across every budget's own xlsx into one portfolio-wide,
// chronologically-ordered week series. "Disbursed" is a best-effort proxy: weeks at-or-before
// today are treated as already paid out on schedule, since there's no separate actuals feed.
const fetchAggregateDisbursementSeries = async (
  budgetIds: string[],
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

  const currentWeekSortValue = getCurrentWeekSortValue();
  const parsedWeeks = Array.from(weekTotals.entries())
    .map(([key, total]) => ({ total, parsed: parseWeekKey(key) }))
    .filter((w): w is { total: number; parsed: NonNullable<ReturnType<typeof parseWeekKey>> } => w.parsed !== null)
    .sort((a, b) => a.parsed.sortValue - b.parsed.sortValue);

  let cumulative = 0;
  return parsedWeeks.map(({ total, parsed }) => {
    const plannedCr = total / 1e7;
    const disbursedCr = parsed.sortValue <= currentWeekSortValue ? plannedCr : 0;
    cumulative += disbursedCr;
    return {
      week: `${parsed.monthShort} W${parsed.week}`,
      planned: Number(plannedCr.toFixed(2)),
      disbursed: Number(disbursedCr.toFixed(2)),
      cumulative: Number(cumulative.toFixed(2)),
    };
  });
};

const DisbursementSequenceCard = ({ series, loading }: { series: DisbursementWeek[]; loading: boolean }) => {
  const totalPlanned = series.reduce((sum, item) => sum + item.planned, 0);
  const totalDisbursed = series.reduce((sum, item) => sum + item.disbursed, 0);
  const pctComplete = totalPlanned > 0 ? Math.round((totalDisbursed / totalPlanned) * 100) : 0;

  return (
    <Card className="p-5">
      <SectionHeader title="Disbursement Sequence" right={<Pill tone="blue">Week-wise · Rs Cr</Pill>} />
      <p className="-mt-2 mb-3 text-xs font-semibold text-slate-500">
        Week-wise disbursement pace aggregated across all active budgets.
      </p>
      <div className="h-64">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">Loading…</div>
        ) : series.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">
            No disbursement sequence data recorded yet.
          </div>
        ) : (
          <ResponsiveContainer>
            <LineChart data={series} margin={{ left: -18, right: 8, top: 28, bottom: 0 }}>
              <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700 }} />
              <Tooltip formatter={(value: number) => [`Rs ${value.toFixed(2)} Cr`, "Planned"]} />
              <Line
                type="monotone"
                dataKey="planned"
                name="Planned"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={{ r: 4 }}
                label={(props: { x: number; y: number; index: number }) => (
                  <text
                    key={`cumulative-${props.index}`}
                    x={props.x}
                    y={props.y - 12}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={700}
                    fill="#16a34a"
                  >
                    {`Rs ${series[props.index]?.cumulative.toFixed(2)}`}
                  </text>
                )}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 px-3 py-2.5">
          <p className="text-lg font-black text-slate-950">Rs {totalPlanned.toFixed(2)}</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">Total Planned (Cr)</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2.5">
          <p className="text-lg font-black text-slate-950">Rs {totalDisbursed.toFixed(2)}</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">Total Disbursed (Cr)</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2.5">
          <p className="text-lg font-black text-slate-950">{pctComplete}%</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">Sequence Complete</p>
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

const CategoryBudgetCard = ({ budget }: { budget: BudgetCategoryBifurcation }) => {
  const totalBudget = budget.categories.reduce((sum, category) => sum + category.total_budget, 0);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-slate-950">{budget.budget_name}</h3>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">{formatCr(totalBudget)} Cr Total Budget</p>
        </div>
        <Pill tone="blue">{budget.categories.length} Categories</Pill>
      </div>
      <div className="max-h-[420px] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {budget.categories.map((category) => {
            const pipelinePct = category.total_budget > 0 ? Math.min((category.amount_in_pipeline / category.total_budget) * 100, 100) : 0;
            const remainingPct =
              category.total_budget > 0 ? Math.min((category.remaining / category.total_budget) * 100, 100 - pipelinePct) : 0;

            return (
              <div key={category.category} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-xs font-black text-slate-800">{category.category.trim()}</span>
                  <span className="shrink-0 text-xs font-bold text-slate-500">{formatCr(category.total_budget)} Cr</span>
                </div>
                <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full" style={{ width: `${pipelinePct}%`, backgroundColor: BUDGET_SEGMENT_COLORS.pipeline }} />
                  <div className="h-full" style={{ width: `${remainingPct}%`, backgroundColor: BUDGET_SEGMENT_COLORS.remaining }} />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] font-bold text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BUDGET_SEGMENT_COLORS.pipeline }} />
                    Pipeline {formatCr(category.amount_in_pipeline)} Cr
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BUDGET_SEGMENT_COLORS.remaining }} />
                    Remaining {formatCr(category.remaining)} Cr
                  </span>
                </div>
              </div>
            );
          })}
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
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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
  paddy: "#f59e0b",
  napier: "#22c55e",
  rahar: "#f97316",
  unspecified: "#94a3b8",
};
const FALLBACK_CROP_COLORS = ["#2563eb", "#6d28d9", "#0891b2", "#dc2626", "#0f766e"];

const normalizeCropKey = (crop?: string) => (crop && crop.trim() ? crop.trim().toLowerCase() : "unspecified");

const cropLabel = (key: string) => (key === "unspecified" ? "Unspecified" : key.charAt(0).toUpperCase() + key.slice(1));

const cropColor = (key: string, index: number) => CROP_COLORS[key] ?? FALLBACK_CROP_COLORS[index % FALLBACK_CROP_COLORS.length];

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

const buildActivitySummaries = (calendarData: CalendarDayMap, monthDate: Date, cropFilter: string | null) => {
  const prefix = `${monthDate.getFullYear()}-${pad2(monthDate.getMonth() + 1)}-`;
  const byActivity = new Map<string, ActivityAcreageSummary>();
  const cropKeysSeen = new Set<string>();
  let totalTasks = 0;
  let totalAcres = 0;

  Object.entries(calendarData).forEach(([dateStr, rows]) => {
    if (!dateStr.startsWith(prefix)) return;

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

const CultivationCalendarCard = ({
  calendarData,
  loading,
  selectedMonth,
  onMonthChange,
  onOpenPlanner,
}: {
  calendarData: CalendarDayMap;
  loading: boolean;
  selectedMonth: Date;
  onMonthChange: (monthDate: Date) => void;
  onOpenPlanner: (monthDate: Date) => void;
}) => {
  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth();
  const monthLabel = selectedMonth.toLocaleString("default", { month: "long", year: "numeric" });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOffset = new Date(year, month, 1).getDay();

  const goToMonth = (delta: number) => {
    onMonthChange(new Date(year, month + delta, 1));
  };

  const daySummaries = useMemo(() => {
    const summaries: Record<number, { activity: string; cropKey: string; acres: number }[]> = {};

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateStr = `${year}-${pad2(month + 1)}-${pad2(day)}`;
      const rows = calendarData[dateStr];
      if (!rows || rows.length === 0) continue;

      const byKey = new Map<string, { activity: string; cropKey: string; acres: number }>();
      rows.forEach((row) => {
        const cropKey = normalizeCropKey(row.crop_type);
        const key = `${row.activity}__${cropKey}`;
        const acres = row.assignments.reduce((sum, a) => sum + (a.assigned_area || 0), 0);
        const existing = byKey.get(key);
        if (existing) existing.acres += acres;
        else byKey.set(key, { activity: row.activity, cropKey, acres });
      });

      summaries[day] = Array.from(byKey.values()).sort((a, b) => b.acres - a.acres);
    }

    return summaries;
  }, [calendarData, daysInMonth, month, year]);

  const cells: (number | null)[] = [
    ...Array.from({ length: firstDayOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-black text-slate-950">{monthLabel} Cultivation Calendar</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Real-time view of scheduled crop activities this month.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => goToMonth(-1)}
            aria-label="Previous month"
            className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => goToMonth(1)}
            aria-label="Next month"
            className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onOpenPlanner(selectedMonth)}
            className="ml-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 transition-colors hover:bg-blue-100"
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
      ) : (
        <div className="grid grid-cols-7 gap-1.5">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="py-2 text-center text-[11px] font-black uppercase tracking-[0.08em] text-slate-400">
              {day}
            </div>
          ))}
          {cells.map((day, index) => {
            const events = day ? daySummaries[day] ?? [] : [];

            return (
              <div
                key={`${day ?? "blank"}-${index}`}
                className={cn(
                  "min-h-[74px] rounded-lg border p-2",
                  day ? "border-slate-200 bg-white" : "border-transparent bg-transparent",
                )}
              >
                {day && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-slate-950">{day}</span>
                      {events.length > 0 && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                    </div>
                    <div className="mt-2 space-y-1">
                      {events.slice(0, 2).map((event) => (
                        <div
                          key={`${event.activity}-${event.cropKey}`}
                          className="truncate rounded-md px-2 py-1 text-[10px] font-extrabold"
                          style={{ backgroundColor: `${cropColor(event.cropKey, 0)}22`, color: cropColor(event.cropKey, 0) }}
                        >
                          <div className="truncate">{event.activity}</div>
                          <div className="truncate opacity-80">
                            {cropLabel(event.cropKey)} · {Math.round(event.acres)} ac
                          </div>
                        </div>
                      ))}
                      {events.length > 2 && <p className="text-[10px] font-bold text-slate-400">+{events.length - 2} more</p>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
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
  selectedMonth,
}: {
  calendarData: CalendarDayMap;
  loading: boolean;
  selectedMonth: Date;
}) => {
  const [cropFilter, setCropFilter] = useState<string | null>(null);

  const { summaries, totalTasks, totalAcres, cropOptions } = useMemo(
    () => buildActivitySummaries(calendarData, selectedMonth, cropFilter),
    [calendarData, selectedMonth, cropFilter],
  );

  return (
    <Card className="p-5">
      <div className="mb-4">
        <h2 className="text-base font-black text-slate-950">Crop-Wise Activity Summary</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">Allocated versus completed acres by activity, this month.</p>
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
            <div className="mt-3 grid max-h-[420px] grid-cols-3 gap-3 overflow-y-auto pr-1">
              {summaries.map((item) => {
                const completion = item.totalAcres > 0 ? Math.round((item.completedAcres / item.totalAcres) * 100) : 0;
                const tone = activityCompletionTone(completion);
                const Icon = activityIconFor(item.activity);

                return (
                  <div
                    key={item.activity}
                    className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-center gap-3">
                      <KpiPieChart value={completion} color={tone.ring} trackColor={tone.track} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full", tone.badge)}>
                            <Icon className="h-3 w-3" />
                          </span>
                          <p className="truncate text-xs font-black text-slate-950">{item.activity}</p>
                        </div>
                        <p className="mt-1 text-[11px] font-bold text-slate-500">
                          {Math.round(item.totalAcres)} ac · {item.taskCount} tasks
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                      <div className="rounded-lg bg-amber-50 px-1.5 py-1.5">
                        <p className="text-[9px] font-black uppercase tracking-[0.04em] text-amber-700">Pending</p>
                        <p className="text-xs font-black text-amber-800">{Math.round(item.pendingAcres)} ac</p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 px-1.5 py-1.5">
                        <p className="text-[9px] font-black uppercase tracking-[0.04em] text-emerald-700">Done</p>
                        <p className="text-xs font-black text-emerald-800">{Math.round(item.completedAcres)} ac</p>
                      </div>
                      <div className="rounded-lg bg-slate-200/70 px-1.5 py-1.5">
                        <p className="text-[9px] font-black uppercase tracking-[0.04em] text-slate-600">Unalloc.</p>
                        <p className="text-xs font-black text-slate-700">{Math.round(item.unallocatedAcres)} ac</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
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
  selectedCrop,
  cropIndex,
}: {
  farm: Farm;
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
                pathOptions={{ color: "#22c55e", fillColor: "#22c55e", fillOpacity: hasPlots ? 0.06 : 0.2, weight: 2 }}
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
        <p className="truncate text-xs font-black text-slate-950">{farm.farm_id}</p>
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
  units,
  loading,
  selectedCrop,
  onClear,
}: {
  farms: Farm[];
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
            <FarmPlotPreviewCard key={farm.farm_id} farm={farm} selectedCrop={selectedCrop} cropIndex={cropIndex} />
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
        <Polygon positions={coords} pathOptions={{ color: "#22c55e", fillColor: "#22c55e", fillOpacity: 0.25, weight: 2 }} />
        <FitBounds coords={coords} />
      </MapContainer>
    </div>
  );
};

const LeadAcquisitionCard = ({ lead }: { lead: Lead }) => {
  const location = [lead.village, lead.district].filter(Boolean).join(", ");
  const isLease = (lead.farmingOption ?? "").toLowerCase().includes("lease");

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <LeadMapThumbnail coordinates={lead.landCoordinates} />
      <div className="space-y-2 p-3">
        <div>
          <p className="truncate text-xs font-black text-slate-950">{lead.fullName}</p>
          {location && <p className="truncate text-[11px] font-bold text-slate-500">{location}</p>}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">Lead Source</span>
          <span className="truncate text-xs font-bold text-slate-800">{lead.leadSource || "—"}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">Farming Option</span>
          <Pill tone={isLease ? "blue" : "green"}>{lead.farmingOption || "—"}</Pill>
        </div>
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
    <div className="max-h-[480px] space-y-2 overflow-y-auto p-2.5">
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

const LandAcquisitionView = ({ leads, leadsLoading }: { leads: Lead[]; leadsLoading: boolean }) => {
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

    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <Card className="p-5 xl:col-span-2">
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

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-950">Lease Renewal in Upcoming 6 Months</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Land parcels requiring renewal action and document follow-up.</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-right">
            <p className="text-xs font-black uppercase tracking-[0.08em] text-amber-700">Renewal Area</p>
            <p className="text-lg font-black text-amber-900">137 ac</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
              <tr>
                {["Parcel ID", "Village", "Landowner", "Area", "Lease Expiry", "Current Rent", "Status"].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-black">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leaseRenewals.map((parcel) => (
                <tr key={parcel.parcelId}>
                  <td className="whitespace-nowrap px-4 py-3 font-black text-slate-950">{parcel.parcelId}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">{parcel.village}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">{parcel.landowner}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-black text-slate-950">{parcel.area}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">{parcel.expiry}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">{parcel.rent}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Pill tone={parcel.status === "Approved" ? "green" : parcel.status === "Docs Pending" ? "yellow" : "orange"}>{parcel.status}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>

    <Card className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-slate-100 p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-black text-slate-950">Current Status of Leads</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Live acquisition leads with owner, area, stage and next status.</p>
        </div>
        <Pill tone="blue">{leadStatusRows.length} Active Leads</Pill>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
            <tr>
              {["Lead ID", "Cluster", "Village", "Landowner", "Area", "Stage", "Owner", "Next Step"].map((heading) => (
                <th key={heading} className="px-4 py-3 font-black">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leadStatusRows.map((lead) => (
              <tr key={lead.leadId}>
                <td className="whitespace-nowrap px-4 py-3 font-black text-slate-950">{lead.leadId}</td>
                <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">{lead.cluster}</td>
                <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">{lead.village}</td>
                <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">{lead.landowner}</td>
                <td className="whitespace-nowrap px-4 py-3 font-black text-slate-950">{lead.area}</td>
                <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">{lead.stage}</td>
                <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">{lead.owner}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <Pill tone={lead.tone}>{lead.status}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
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
          <Polygon positions={landCoords} pathOptions={{ color: "#22c55e", fillColor: "#22c55e", fillOpacity: hasPlots ? 0.06 : 0.2, weight: 2 }} />
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
}) => {
  const [disbursementSeries, setDisbursementSeries] = useState<DisbursementWeek[]>([]);
  const [disbursementLoading, setDisbursementLoading] = useState(false);

  useEffect(() => {
    if (budgets.length === 0) {
      setDisbursementSeries([]);
      return;
    }
    const ac = new AbortController();
    setDisbursementLoading(true);
    fetchAggregateDisbursementSeries(budgets.map((b) => b.budget_id), ac.signal)
      .then((series) => setDisbursementSeries(series))
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name !== "AbortError") setDisbursementSeries([]);
      })
      .finally(() => setDisbursementLoading(false));
    return () => ac.abort();
  }, [budgets]);

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {financialStatDefs.map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">{stat.label}</p>
            <div className="mt-3 flex items-end gap-2">
              {loading || !kpis ? (
                <p className="text-3xl font-black tracking-normal text-slate-300">--</p>
              ) : (
                <p className={cn("text-3xl font-black tracking-normal", stat.tone)}>{formatCr(kpis[stat.key])}</p>
              )}
              <p className="pb-1 text-sm font-bold text-slate-600">Cr</p>
            </div>
          </Card>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.3fr_0.7fr]">
        <BudgetBifurcationCard budgets={budgets} loading={budgetsLoading} />
        <DisbursementSequenceCard series={disbursementSeries} loading={disbursementLoading} />
      </section>

      <CategoryWiseBudgetSection budgets={categoryBudgets} loading={categoryBudgetsLoading} />

      <LandInvestmentGallery farms={farms} farmerNames={farmerNames} loading={farmsLoading} />
    </div>
  );
};

// ── Task Timeline (Cultivation Tracker) ────────────────────────────────────

type TaskAssignmentInfo = { supervisorName: string; fieldManagerName: string };

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
          <Polygon positions={landCoords} pathOptions={{ color: "#22c55e", fillColor: "#22c55e", fillOpacity: hasPlots ? 0.06 : 0.2, weight: 2 }} />
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
}: {
  task: CalendarTask;
  farm?: Farm;
  assignment?: TaskAssignmentInfo;
  assignmentLoading: boolean;
}) => {
  const Icon = activityIconFor(task.activity);
  const cropKey = normalizeCropKey(task.cropType);
  const accentColor = cropColor(cropKey, 0);

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
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((idx) => (
              <div
                key={idx}
                className="flex h-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-300"
                title="Sample photo placeholder — no task-photo API yet"
              >
                <ImageIcon className="h-7 w-7" />
                <span className="text-[9px] font-bold">Sample</span>
              </div>
            ))}
          </div>
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
              <p className="truncate text-xs font-bold text-slate-700">FM: {assignment?.fieldManagerName || "—"}</p>
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
  assignmentByFarm: Record<string, TaskAssignmentInfo>;
  loading: boolean;
}) => (
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
                />
              </div>
            );
          })}
        </div>
      </div>
    )}
  </Card>
);

const CultivationTrackerView = ({
  onOpenModule,
  farms,
  farmsLoading,
  clusterSummaries = [],
  clusterLoading = false,
  calendarData = {},
  calendarTasks = {},
  calendarLoading = false,
}: {
  onOpenModule: (route: string) => void;
  farms: Farm[];
  farmsLoading: boolean;
  clusterSummaries?: ClusterCropSummary[];
  clusterLoading?: boolean;
  calendarData?: CalendarDayMap;
  calendarTasks?: CalendarTaskMap;
  calendarLoading?: boolean;
}) => {
  const [selectedCrop, setSelectedCrop] = useState<string | null>(null);
  const cropUnits = useMemo(() => buildCropUnits(farms), [farms]);
  const [activeMonth, setActiveMonth] = useState(() => startOfMonth(new Date()));

  const monthTasks = useMemo(() => {
    const prefix = `${activeMonth.getFullYear()}-${pad2(activeMonth.getMonth() + 1)}-`;
    return Object.entries(calendarTasks)
      .filter(([dateStr]) => dateStr.startsWith(prefix))
      .flatMap(([, rows]) => rows)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [calendarTasks, activeMonth]);

  const farmsById = useMemo(() => new Map(farms.map((farm) => [farm.farm_id, farm])), [farms]);

  const [assignmentByFarm, setAssignmentByFarm] = useState<Record<string, TaskAssignmentInfo>>({});
  const fetchedAssignmentFarmIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const base = getBaseUrl().replace(/\/$/, "");
    const farmIds = Array.from(new Set(monthTasks.map((task) => task.farmId)));

    farmIds.forEach((farmId) => {
      if (fetchedAssignmentFarmIds.current.has(farmId)) return;
      fetchedAssignmentFarmIds.current.add(farmId);

      fetch(`${base}/farmer_managment/get_assigned_supervisor_and_field_manager/${farmId}`)
        .then((res) => res.json())
        .then((data: { assigned_supervisor?: { supervisor_name?: string }; assigned_field_manager?: { name?: string } | { name?: string }[] }) => {
          const fm = Array.isArray(data?.assigned_field_manager) ? data.assigned_field_manager[0] : data?.assigned_field_manager;
          setAssignmentByFarm((prev) => ({
            ...prev,
            [farmId]: {
              supervisorName: data?.assigned_supervisor?.supervisor_name ?? "",
              fieldManagerName: fm?.name ?? "",
            },
          }));
        })
        .catch(() =>
          setAssignmentByFarm((prev) => ({ ...prev, [farmId]: { supervisorName: "", fieldManagerName: "" } })),
        );
    });
  }, [monthTasks]);

  return (
  <div className="space-y-4">
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cultivationStats.map((stat) => (
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
      <PlotMapViewerCard farms={farms} units={cropUnits} loading={farmsLoading} selectedCrop={selectedCrop} onClear={() => setSelectedCrop(null)} />
    </section>

    <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <CultivationCalendarCard
        calendarData={calendarData}
        loading={calendarLoading}
        selectedMonth={activeMonth}
        onMonthChange={setActiveMonth}
        onOpenPlanner={(monthDate) =>
          onOpenModule(`/cultivation-calendar?month=${monthDate.getFullYear()}-${pad2(monthDate.getMonth() + 1)}`)
        }
      />

      <CropActivitySummaryCard calendarData={calendarData} loading={calendarLoading} selectedMonth={activeMonth} />
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
  const [categoryBudgets, setCategoryBudgets] = useState<BudgetCategoryBifurcation[]>([]);
  const [categoryBudgetsLoading, setCategoryBudgetsLoading] = useState(false);
  const [farmerNames, setFarmerNames] = useState<Record<string, string>>({});
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);

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
        const res = await fetch(`${base}/farmer_managment/get_leads`);
        const data: { leads?: any[] } = await res.json();
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

      const farmsPromise = fetch(`${base}/farmer_managment/get_farms`)
        .then((res) => res.json())
        .then((data: { farms?: Farm[] }) => {
          if (!cancelled) setFarms(Array.isArray(data?.farms) ? data.farms : []);
        })
        .catch(() => {
          if (!cancelled) setFarms([]);
        })
        .finally(() => {
          if (!cancelled) setFarmsLoading(false);
        });

      const clusterPromise = fetch(`${base}/ceo_desk/get_cluster_wise_crop_distribution`)
        .then((res) => res.json())
        .then((data: { success?: boolean; clusters?: ClusterEntry[] }) => {
          if (!cancelled) setClusterList(Array.isArray(data?.clusters) ? data.clusters : []);
        })
        .catch(() => {
          if (!cancelled) setClusterList([]);
        })
        .finally(() => {
          if (!cancelled) setClusterLoading(false);
        });

      const calendarPromise = fetch(`${base}/admin_cultivation/fetch_cultivation_calander`)
        .then((res) => res.json())
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

      const kpiPromise = fetch(`${base}/ceo_desk/get_financial_analytics_KPIs`)
        .then((res) => res.json())
        .then((data: { success?: boolean; data?: FinancialKpis }) => {
          if (!cancelled) setFinancialKpis(data?.success && data?.data ? data.data : null);
        })
        .catch(() => {
          if (!cancelled) setFinancialKpis(null);
        })
        .finally(() => {
          if (!cancelled) setFinancialLoading(false);
        });

      const budgetBifPromise = fetch(`${base}/ceo_desk/budget_wise_utilization_bifurcation`)
        .then((res) => res.json())
        .then((data: { success?: boolean; data?: BudgetBifurcation[] }) => {
          if (!cancelled) setBudgetBifurcation(data?.success && Array.isArray(data?.data) ? data.data : []);
        })
        .catch(() => {
          if (!cancelled) setBudgetBifurcation([]);
        })
        .finally(() => {
          if (!cancelled) setBudgetBifurcationLoading(false);
        });

      const categoryPromise = fetch(`${base}/ceo_desk/get_category_wise_budget_utilization`)
        .then((res) => res.json())
        .then((data: { success?: boolean; data?: BudgetCategoryBifurcation[] }) => {
          if (!cancelled) setCategoryBudgets(data?.success && Array.isArray(data?.data) ? data.data : []);
        })
        .catch(() => {
          if (!cancelled) setCategoryBudgets([]);
        })
        .finally(() => {
          if (!cancelled) setCategoryBudgetsLoading(false);
        });

      await Promise.all([kpiPromise, budgetBifPromise, categoryPromise]);
    };

    (async () => {
      await loadLandAcquisition();
      if (cancelled) return;
      await loadCultivationTracker();
      if (cancelled) return;
      await loadFinancialAnalysis();
    })();

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
          <LandAcquisitionView leads={leads} leadsLoading={leadsLoading} />
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
          />
        ) : activeTabId === "cultivation-tracker" ? (
          <CultivationTrackerView
            onOpenModule={(route) => navigate(route)}
            farms={farms}
            farmsLoading={farmsLoading}
            clusterSummaries={clusterSummaries}
            clusterLoading={clusterLoading}
            calendarData={calendarData}
            calendarTasks={calendarTasks}
            calendarLoading={calendarLoading}
          />
        ) : (
          <>
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
            {pieKpiCards.map((card) => (
              <KpiCard key={card.label} card={card} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:col-span-2">
            {metricKpiCards.map((card) => (
              <KpiCard key={card.label} card={card} />
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-[0.86fr_1.14fr]">
          <Card className="p-5">
            <SectionHeader title="Land Progress Overview (Acres)" />
            <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[220px_1fr]">
              <div className="relative h-56">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={landProgress} dataKey="value" innerRadius={72} outerRadius={104} startAngle={100} endAngle={460} paddingAngle={1}>
                      {landProgress.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-4xl font-black">757</p>
                  <p className="text-sm font-bold text-slate-600">Total Acres</p>
                </div>
              </div>
              <div className="space-y-3 text-sm">
                {landProgress.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 font-bold text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.name}
                    </span>
                    <span className="font-black text-slate-900">{item.labelValue ?? item.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-1 text-right text-xs font-semibold text-slate-500">Last Updated: 21 May 2024</p>
          </Card>

          <Card className="p-5">
            <SectionHeader
              title="Budget Utilization Trend (Rs in Cr)"
              right={<button className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">Monthly</button>}
            />
            <div className="h-[248px]">
              <ResponsiveContainer>
                <LineChart data={budgetTrend} margin={{ left: -18, right: 8, top: 6, bottom: 0 }}>
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fontWeight: 700 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fontWeight: 700 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="approved" stroke="#2563eb" strokeWidth={2.3} strokeDasharray="6 4" dot={false} name="Approved Budget" />
                  <Line type="monotone" dataKey="utilized" stroke="#16a34a" strokeWidth={3} dot={{ r: 3 }} name="Utilized Budget" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </section>

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-[0.9fr_0.68fr_0.68fr_0.82fr]">
          <Card className="p-5">
            <SectionHeader title="Activity Completion Status (Area in Acres)" />
            <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[190px_1fr]">
              <div className="relative h-44">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={activityStatus} dataKey="value" innerRadius={58} outerRadius={82} paddingAngle={2}>
                      {activityStatus.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-3xl font-black">78%</p>
                  <p className="text-sm font-bold text-slate-600">Completed</p>
                </div>
              </div>
              <div className="space-y-3 text-sm">
                {activityStatus.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 font-bold text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.name}
                    </span>
                    <span className="font-black">{item.value}%</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-3 text-sm font-bold text-slate-600">Total Area : 482 Acres</p>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Crop-Wise Area (Acres)" />
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={cropArea} margin={{ left: -18, right: 4, top: 8, bottom: 0 }}>
                  <XAxis dataKey="crop" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 800 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700 }} />
                  <Tooltip />
                  <Bar dataKey="acres" radius={[8, 8, 0, 0]}>
                    {cropArea.map((entry) => (
                      <Cell key={entry.crop} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Manpower Overview" />
            <div className="relative h-44">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={manpower} dataKey="value" innerRadius={58} outerRadius={82} paddingAngle={2}>
                    {manpower.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl font-black">246</p>
                <p className="text-sm font-bold text-slate-600">Total</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              {manpower.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 font-bold text-slate-700">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.name}
                  </span>
                  <span className="font-black">{item.value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Focus Areas" />
            <div className="space-y-3">
              {focusAreas.map((area) => (
                <div key={area.label} className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">{area.label}</p>
                      <p className="text-xs font-semibold text-slate-500">{area.helper}</p>
                    </div>
                    <p className="text-xl font-black text-slate-950">{area.value}</p>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-100">
                    <div
                      className={cn("h-2 rounded-full", area.tone === "green" && "bg-green-500", area.tone === "red" && "bg-red-500", area.tone === "orange" && "bg-orange-500")}
                      style={{ width: area.width }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-[1.18fr_0.86fr_0.82fr_0.76fr]">
          <Card className="overflow-hidden">
            <SectionHeader title="Pending Approvals" />
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    {["Request Type", "Request No.", "Requested By", "Amount", "Date", "Status"].map((heading) => (
                      <th key={heading} className="px-4 py-3 font-black">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {approvals.map((row) => (
                    <tr key={row[1]}>
                      {row.slice(0, 5).map((cell) => (
                        <td key={cell} className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">
                          {cell}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <Pill tone="orange">{row[5]}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="mx-auto my-4 flex items-center gap-2 text-sm font-black text-blue-700">View All Approvals &rarr;</button>
          </Card>

          <Card className="overflow-hidden">
            <SectionHeader title="Risk Alerts & Exceptions" />
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    {["Risk / Issue", "Location", "Severity", "Days Open"].map((heading) => (
                      <th key={heading} className="px-4 py-3 font-black">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {risks.map((row) => (
                    <tr key={row[0]}>
                      <td className="px-4 py-3 font-bold">{row[0]}</td>
                      <td className="px-4 py-3 font-bold">{row[1]}</td>
                      <td className="px-4 py-3">
                        <Pill tone={row[2] === "High" ? "red" : "yellow"}>{row[2]}</Pill>
                      </td>
                      <td className="px-4 py-3 font-black">{row[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="mx-auto my-4 flex items-center gap-2 text-sm font-black text-blue-700">View All Risks &rarr;</button>
          </Card>

          <Card className="overflow-hidden">
            <SectionHeader title="Cash Requirement Forecast (Rs in Cr)" />
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    {["Period", "Estimated Need", "Available Funds", "Gap / Surplus"].map((heading) => (
                      <th key={heading} className="px-4 py-3 font-black">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {forecast.map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, index) => (
                        <td key={cell} className={cn("px-4 py-4 font-bold", index === 3 && "font-black text-red-600")}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="mx-auto my-4 flex items-center gap-2 text-sm font-black text-blue-700">View Detailed Forecast &rarr;</button>
          </Card>

          <Card className="p-5">
            <SectionHeader title="CEO Summary" />
            <div className="space-y-3 text-sm font-semibold leading-6 text-slate-700">
              <p>Total 757 acres are under management, out of which 482 acres are under cultivation.</p>
              <p>Budget utilization is 60.86% against the approved budget.</p>
              <p>Manpower strength today is 246 people.</p>
              <p>7 activities are delayed and 12 approvals are pending.</p>
              <p>Diesel consumption is 12% above standard and needs immediate review.</p>
              <p>Focus on timely execution, cost discipline and risk mitigation to achieve operational goals.</p>
            </div>
            <div className="mt-5 flex justify-end">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                <ClipboardList className="h-8 w-8" />
              </div>
            </div>
          </Card>
        </section>
          </>
        )}
      </div>

      <footer className="flex flex-col gap-2 border-t border-slate-200 bg-white px-6 py-4 text-xs font-semibold text-slate-600 md:flex-row md:items-center md:justify-between">
        <span>© 2024 SaiBioresources Private Limited. All rights reserved.</span>
        <span className="flex items-center gap-3">
          Last Updated: 21 May 2024
          <span>09:30 AM</span>
          <span className="h-3 w-3 rounded-full bg-green-500" />
        </span>
      </footer>
    </main>
  );
};

export default CeosDesk;
