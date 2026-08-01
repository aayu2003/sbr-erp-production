import { useEffect, useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, RefreshCw, Search, Wallet } from "lucide-react";
import getBaseUrl from "@/lib/config";

// ── Payment Ledger — every admin_accounts_ledger entry across every vendor, filterable/sortable
// client-side (same scan-all-filter-client-side convention the rest of this app already uses).

type LedgerEntry = {
  entry_id?: string;
  vendor_id?: string;
  vendor_details?: { vendor_name?: string };
  invoice_no?: string;
  transfer_type?: "debit" | "credit";
  base_amount?: number;
  discount_amount?: number;
  gst_amount?: number;
  freight_charges?: number;
  other_charges?: number;
  tds_amount?: number;
  amount?: number;
  balance?: number | null;
  date?: string;
  created_at?: string;
};

type SortKey = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

const safeStr = (v: unknown) => String(v ?? "").trim();

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDateOnly = (raw?: string) => {
  const v = safeStr(raw);
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  if (!Number.isFinite(d.getTime())) return v;
  return new Intl.DateTimeFormat("en-IN", { year: "numeric", month: "short", day: "2-digit" }).format(d);
};

const vendorName = (e: LedgerEntry) => safeStr(e.vendor_details?.vendor_name) || safeStr(e.vendor_id) || "Unknown Vendor";

const SortLabel: Record<SortKey, string> = {
  date_desc: "Date — Newest first",
  date_asc: "Date — Oldest first",
  amount_desc: "Amount — Highest first",
  amount_asc: "Amount — Lowest first",
};

const AccountsLedger = () => {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "debit" | "credit">("all");
  const [sortKey, setSortKey] = useState<SortKey>("date_desc");

  const load = async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
      if (!baseUrl) throw new Error("API base URL is not set");
      const res = await fetch(`${baseUrl}/admin_accounts/get_all_ledger_entries`, {
        headers: { Accept: "application/json" },
        signal,
      });
      const data: { success?: boolean; data?: LedgerEntry[]; message?: string } | null = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || `Failed to load ledger entries (HTTP ${res.status})`);
      setEntries(Array.isArray(data.data) ? data.data : []);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load ledger entries");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, []);

  const vendorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    entries.forEach((e) => {
      const id = safeStr(e.vendor_id) || vendorName(e);
      if (!seen.has(id)) seen.set(id, vendorName(e));
    });
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = entries.filter((e) => {
      if (vendorFilter !== "all" && (safeStr(e.vendor_id) || vendorName(e)) !== vendorFilter) return false;
      if (typeFilter !== "all" && e.transfer_type !== typeFilter) return false;
      if (q) {
        const hay = `${safeStr(e.invoice_no)} ${vendorName(e)} ${safeStr(e.entry_id)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    rows = rows.slice().sort((a, b) => {
      switch (sortKey) {
        case "date_asc":
          return safeStr(a.date || a.created_at).localeCompare(safeStr(b.date || b.created_at));
        case "date_desc":
          return safeStr(b.date || b.created_at).localeCompare(safeStr(a.date || a.created_at));
        case "amount_asc":
          return (a.amount ?? 0) - (b.amount ?? 0);
        case "amount_desc":
          return (b.amount ?? 0) - (a.amount ?? 0);
        default:
          return 0;
      }
    });
    return rows;
  }, [entries, search, vendorFilter, typeFilter, sortKey]);

  const totals = useMemo(() => {
    const debit = filtered.filter((e) => e.transfer_type === "debit").reduce((s, e) => s + (e.amount ?? 0), 0);
    const credit = filtered.filter((e) => e.transfer_type === "credit").reduce((s, e) => s + (e.amount ?? 0), 0);
    return { debit, credit, count: filtered.length };
  }, [filtered]);

  return (
    <div className="min-h-full bg-[#f7f7f8] p-4 text-slate-900">
      <div className="mx-auto max-w-[1480px] space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-normal text-slate-900">Payment Ledger</h1>
            <p className="mt-1.5 text-base font-medium text-slate-500">
              Every vendor ledger entry in one place — filter by vendor, sort by amount or date, search by invoice number.
            </p>
          </div>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Entries Shown</p>
              <p className="mt-0.5 text-xl font-extrabold tabular-nums text-slate-900">{totals.count}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <ArrowDownCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Total Debit (Dr)</p>
              <p className="mt-0.5 text-xl font-extrabold tabular-nums text-emerald-600">{inr(totals.debit)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-500">
              <ArrowUpCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Total Credit (Cr)</p>
              <p className="mt-0.5 text-xl font-extrabold tabular-nums text-red-500">{inr(totals.credit)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search invoice no. or vendor..."
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-slate-300"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={vendorFilter}
                onChange={(e) => setVendorFilter(e.target.value)}
                className="h-9 min-w-[180px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-slate-300"
              >
                <option value="all">All Vendors</option>
                {vendorOptions.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as "all" | "debit" | "credit")}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-slate-300"
              >
                <option value="all">Debit &amp; Credit</option>
                <option value="debit">Debit (Dr) only</option>
                <option value="credit">Credit (Cr) only</option>
              </select>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-slate-300"
              >
                {(Object.keys(SortLabel) as SortKey[]).map((key) => (
                  <option key={key} value={key}>{SortLabel[key]}</option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-sm text-slate-400">Loading ledger entries…</div>
          ) : error ? (
            <div className="py-16 text-center text-sm text-red-500">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">
              {entries.length === 0 ? "No ledger entries posted yet." : "No entries match your filters."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Vendor</th>
                    <th className="px-4 py-3">Invoice No.</th>
                    <th className="px-4 py-3">Entry ID</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Base Amount</th>
                    <th className="px-4 py-3 text-right">GST</th>
                    <th className="px-4 py-3 text-right">TDS</th>
                    <th className="px-4 py-3 text-right">Final Amount</th>
                    <th className="px-4 py-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e, idx) => {
                    const isDebit = e.transfer_type === "debit";
                    return (
                      <tr key={e.entry_id ?? idx} className="border-b border-slate-100 text-sm text-slate-800 last:border-b-0 hover:bg-slate-50/70">
                        <td className="whitespace-nowrap px-4 py-3 font-semibold">{formatDateOnly(e.date || e.created_at)}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-extrabold text-slate-800">{vendorName(e)}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-blue-600">{safeStr(e.invoice_no) || "—"}</td>
                        <td className="max-w-[160px] truncate px-4 py-3 font-mono text-[11px] text-slate-400">{safeStr(e.entry_id) || "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${isDebit ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                            {isDebit ? "Debit (Dr)" : "Credit (Cr)"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{inr(e.base_amount ?? 0)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-500">{inr(e.gst_amount ?? 0)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-500">{inr(e.tds_amount ?? 0)}</td>
                        <td className={`whitespace-nowrap px-4 py-3 text-right font-extrabold tabular-nums ${isDebit ? "text-emerald-600" : "text-red-500"}`}>
                          {inr(e.amount ?? 0)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-extrabold tabular-nums text-slate-700">
                          {e.balance !== null && e.balance !== undefined ? inr(e.balance) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default AccountsLedger;
