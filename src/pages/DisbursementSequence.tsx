import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { X, ArrowUpDown, Loader2, Plus } from "lucide-react";
import getBaseUrl from "@/lib/config";

// Deliberately a narrow local shape (not Budget.tsx's BudgetItem) so this file
// stays loosely coupled to the Budget page — pass in only what's needed.
export type DisbursementSequenceLineItem = {
  id: string;
  category: string;
  lineItem: string;
  type: string;
  totalValue: number;
};

type DisbursementSequenceProps = {
  budgetId?: string;
  item: DisbursementSequenceLineItem;
  onClose: () => void;
};

type BudgetRecord = {
  budget_id: string;
  project_start_date?: string;
  project_end_date?: string;
};

type WeekColumn = {
  key: string;        // stable id, also the xlsx column header, e.g. "Jun2026-W1"
  monthKey: string;    // e.g. "Jun2026" — used to group columns under one month header
  monthLabel: string;  // e.g. "June 2026"
  weekLabel: string;   // "W1".."W4"
};

const fmtInr = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);

const MONTH_SHORT_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// monthKey round-trips through the xlsx column headers (e.g. "Nov2026"), so parsing must
// invert exactly what toLocaleString("en-US", { month: "short" }) produces below.
function parseMonthKey(monthKey: string): Date {
  const match = monthKey.match(/^([A-Za-z]{3})(\d{4})$/);
  if (!match) return new Date(NaN);
  const idx = MONTH_SHORT_NAMES.indexOf(match[1]);
  return new Date(Number(match[2]), idx, 1);
}

function buildMonthColumns(monthStart: Date): WeekColumn[] {
  const monthLabel = monthStart.toLocaleString("en-US", { month: "long" });
  const monthShort = monthStart.toLocaleString("en-US", { month: "short" });
  const year = monthStart.getFullYear();
  const monthKey = `${monthShort}${year}`;
  const columns: WeekColumn[] = [];
  for (let w = 1; w <= 4; w++) {
    columns.push({
      key: `${monthKey}-W${w}`,
      monthKey,
      monthLabel: `${monthLabel} ${year}`,
      weekLabel: `W${w}`,
    });
  }
  return columns;
}

function buildWeekColumns(startDate: string, endDate: string): WeekColumn[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const columns: WeekColumn[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endCursor = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= endCursor) {
    columns.push(...buildMonthColumns(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return columns;
}

const SHEET_NAME = "ERP Disbursement";

export default function DisbursementSequence({ budgetId, item, onClose }: DisbursementSequenceProps) {
  const [timeline, setTimeline] = useState<{ start: string; end: string } | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [existingLoading, setExistingLoading] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  // Months the user has added beyond the project timeline (e.g. a disbursement that falls
  // after the project end date), in chronological order. Each contributes 4 weeks (W1-W4).
  const [extraMonthKeys, setExtraMonthKeys] = useState<string[]>([]);
  // Raw saved row from the xlsx, kept around until the timeline is also loaded so we can
  // detect which of its columns fall outside the timeline and restore them as extra months.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [existingRowRaw, setExistingRowRaw] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    if (!budgetId) {
      setTimelineLoading(false);
      setTimelineError("No budget selected");
      return;
    }
    const ac = new AbortController();
    const load = async () => {
      setTimelineLoading(true);
      setTimelineError(null);
      try {
        const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/admin_accounts/get_budgets`, { signal: ac.signal });
        if (!res.ok) throw new Error(`Failed to fetch budgets (${res.status})`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const json: any = await res.json();
        const list: BudgetRecord[] = Array.isArray(json?.data) ? json.data : [];
        const match = list.find((b) => b.budget_id === budgetId);
        if (!match?.project_start_date || !match?.project_end_date) {
          throw new Error("This budget has no project timeline set");
        }
        setTimeline({ start: match.project_start_date, end: match.project_end_date });
      } catch (err: unknown) {
        if ((err as { name?: string })?.name !== "AbortError") {
          setTimelineError(err instanceof Error ? err.message : "Failed to load project timeline");
        }
      } finally {
        setTimelineLoading(false);
      }
    };
    load();
    return () => ac.abort();
  }, [budgetId]);

  // Pull whatever was already saved for this line item — so reopening the modal (with or
  // without a full page reload) shows the last-saved amounts instead of a blank grid.
  useEffect(() => {
    if (!budgetId) {
      setExistingLoading(false);
      return;
    }
    const ac = new AbortController();
    const load = async () => {
      setExistingLoading(true);
      try {
        const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/admin_accounts/get_budget/${budgetId}`, { signal: ac.signal });
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wb = (XLSX as any).read(new Uint8Array(buf), { type: "array" });
        const sheet = wb.Sheets[SHEET_NAME];
        if (!sheet) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet);
        const existingRow = rows.find((r) => String(r.line_item_id) === item.id);
        setExistingRowRaw(existingRow ?? {});
      } catch (err: unknown) {
        if ((err as { name?: string })?.name !== "AbortError") {
          // Non-fatal — the grid just starts blank if this fails.
        }
      } finally {
        setExistingLoading(false);
      }
    };
    load();
    return () => ac.abort();
  }, [budgetId, item.id]);

  // Once both the timeline and the saved row are in, split the saved row into amounts that
  // fall within the project timeline and columns that don't — the latter become extra months
  // (e.g. a disbursement added after the project end date) so they reappear on reopen.
  useEffect(() => {
    if (!timeline || !existingRowRaw) return;
    const baseKeys = new Set(buildWeekColumns(timeline.start, timeline.end).map((c) => c.key));
    const restored: Record<string, string> = {};
    const extraKeys = new Set<string>();
    Object.entries(existingRowRaw).forEach(([key, value]) => {
      if (key === "line_item_id" || key === "line_item") return;
      const num = Number(value);
      if (num) restored[key] = String(num);
      if (!baseKeys.has(key)) extraKeys.add(key.replace(/-W\d+$/, ""));
    });
    setAmounts(restored);
    if (extraKeys.size > 0) {
      const sorted = Array.from(extraKeys).sort((a, b) => parseMonthKey(a).getTime() - parseMonthKey(b).getTime());
      setExtraMonthKeys(sorted);
    }
  }, [timeline, existingRowRaw]);

  const weekColumns = useMemo(() => {
    if (!timeline) return [];
    const base = buildWeekColumns(timeline.start, timeline.end);
    const extra = extraMonthKeys.flatMap((mk) => buildMonthColumns(parseMonthKey(mk)));
    return [...base, ...extra];
  }, [timeline, extraMonthKeys]);

  const handleAddMonth = () => {
    const last = weekColumns[weekColumns.length - 1];
    if (!last) return;
    const nextMonth = parseMonthKey(last.monthKey);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthKey = `${nextMonth.toLocaleString("en-US", { month: "short" })}${nextMonth.getFullYear()}`;
    setExtraMonthKeys((prev) => (prev.includes(monthKey) ? prev : [...prev, monthKey]));
  };

  const monthGroups = useMemo(() => {
    const groups: { monthKey: string; monthLabel: string; weekCount: number }[] = [];
    weekColumns.forEach((col) => {
      const last = groups[groups.length - 1];
      if (last && last.monthKey === col.monthKey) {
        last.weekCount += 1;
      } else {
        groups.push({ monthKey: col.monthKey, monthLabel: col.monthLabel, weekCount: 1 });
      }
    });
    return groups;
  }, [weekColumns]);

  const totalEntered = useMemo(
    () => weekColumns.reduce((sum, col) => sum + (parseFloat(amounts[col.key]) || 0), 0),
    [weekColumns, amounts]
  );

  const setAmount = (key: string, value: string) => {
    if (value !== "" && !/^\d*\.?\d*$/.test(value)) return;
    setAmounts((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!budgetId) return;
    const filled = weekColumns.filter((col) => (parseFloat(amounts[col.key]) || 0) > 0);
    if (filled.length === 0) {
      toast.error("Enter an amount in at least one week before saving");
      return;
    }

    setSaving(true);
    try {
      const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");

      // 1. Fetch the current workbook fresh (self-contained — doesn't touch Budget.tsx's state)
      const getRes = await fetch(`${baseUrl}/admin_accounts/get_budget/${budgetId}`);
      if (!getRes.ok) throw new Error(`Failed to fetch budget xlsx (${getRes.status})`);
      const buf = await getRes.arrayBuffer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wb = (XLSX as any).read(new Uint8Array(buf), { type: "array", cellStyles: true, cellNF: true });

      const columnOrder = ["line_item_id", "line_item", ...weekColumns.map((c) => c.key)];
      const newRowValues: Record<string, string | number> = {
        line_item_id: item.id,
        line_item: item.lineItem,
      };
      weekColumns.forEach((col) => {
        newRowValues[col.key] = parseFloat(amounts[col.key]) || 0;
      });

      // 2. Read existing rows if the sheet already exists, else start fresh
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rows: Record<string, any>[] = [];
      const existingWs = wb.Sheets[SHEET_NAME];
      if (existingWs) {
        rows = XLSX.utils.sheet_to_json(existingWs);
      }

      // 3. Upsert this line item's row (replace if it already has an entry, else append)
      const existingIndex = rows.findIndex((r) => String(r.line_item_id) === item.id);
      if (existingIndex >= 0) {
        rows[existingIndex] = { ...rows[existingIndex], ...newRowValues };
      } else {
        rows.push(newRowValues);
      }

      // 4. Rebuild the sheet and attach it to the workbook (creating it if it didn't exist)
      const newWs = XLSX.utils.json_to_sheet(rows, { header: columnOrder });
      wb.Sheets[SHEET_NAME] = newWs;
      if (!wb.SheetNames.includes(SHEET_NAME)) wb.SheetNames.push(SHEET_NAME);

      // 5. Write workbook back to binary and upload
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const xlsxBinary: ArrayBuffer = (XLSX as any).write(wb, { type: "array", bookType: "xlsx" });
      const blob = new Blob([xlsxBinary], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const form = new FormData();
      form.append("file", blob, `budget_${budgetId}.xlsx`);
      const uploadRes = await fetch(`${baseUrl}/admin_accounts/update_budget_xlsx/${budgetId}`, {
        method: "POST",
        body: form,
      });
      const uploadJson = await uploadRes.json().catch(() => null);
      if (!uploadRes.ok || !uploadJson?.success) throw new Error(uploadJson?.message || "Save failed");

      toast.success("Disbursement sequence saved");
      setLastSavedAt(new Date());
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save disbursement sequence");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-950/45 p-4">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
              <ArrowUpDown className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Disbursement Sequence</h2>
              <p className="mt-0.5 max-w-md truncate text-xs font-semibold text-slate-500" title={item.lineItem}>
                {item.lineItem} · {item.category} · {item.type}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
            <span className="font-semibold text-slate-400">
              Total Value <span className="ml-1 font-extrabold text-slate-700">{fmtInr(item.totalValue)}</span>
            </span>
            <span className="font-semibold text-slate-400">
              Entered so far{" "}
              <span className={`ml-1 font-extrabold ${totalEntered > item.totalValue ? "text-red-600" : "text-emerald-700"}`}>
                {fmtInr(totalEntered)}
              </span>
            </span>
          </div>

          {!timelineLoading && !existingLoading && !timelineError && weekColumns.length > 0 && (
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={handleAddMonth}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#173f70] px-3 py-1.5 text-xs font-semibold text-[#173f70] hover:bg-[#e8eef6]"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Month
              </button>
            </div>
          )}

          {timelineLoading || existingLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              {timelineLoading ? "Loading project timeline…" : "Loading saved disbursement data…"}
            </div>
          ) : timelineError ? (
            <div className="flex items-center justify-center py-16 text-sm font-semibold text-red-500">{timelineError}</div>
          ) : weekColumns.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm font-semibold text-slate-400">
              No weeks fall within this project's timeline.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="border-collapse text-xs">
                <thead>
                  <tr>
                    {monthGroups.map((group) => (
                      <th
                        key={group.monthKey}
                        colSpan={group.weekCount}
                        className="border-b border-slate-200 bg-[#173f70] px-2 py-1.5 text-center font-extrabold text-white"
                      >
                        {group.monthLabel}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {weekColumns.map((col) => (
                      <th
                        key={col.key}
                        className="border-b border-r border-slate-200 bg-[#e8eef6] px-2 py-1.5 text-center font-bold text-[#173f70] last:border-r-0"
                      >
                        {col.weekLabel}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {weekColumns.map((col) => (
                      <td key={col.key} className="border-r border-slate-100 p-1 last:border-r-0">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={amounts[col.key] ?? ""}
                          onChange={(e) => setAmount(col.key, e.target.value)}
                          placeholder="0"
                          className="w-24 rounded-md border border-slate-200 px-2 py-1.5 text-right text-xs font-semibold outline-none focus:border-[#173f70] focus:ring-1 focus:ring-[#173f70]"
                        />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 px-6 py-4">
          <span className="text-xs font-semibold text-emerald-600">
            {lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString()}` : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || timelineLoading || existingLoading || !!timelineError}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#173f70] px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0f2c50] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
