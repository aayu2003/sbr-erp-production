import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays, ChevronDown, ChevronRight, Download, Filter, FolderTree,
  Landmark, Search, SlidersHorizontal, WalletCards, X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import getBaseUrl from "@/lib/config";

// The real GL master row (admin_accounting_masters, master_type GL_ACCOUNT) — parent is a
// name, not a code (matches how AccountingMaster.tsx's own GL creation form stores it), so the
// tree below is built by matching each account's `parent` string against another account's
// `name`, same loose convention already in use there.
type GlAccount = {
  item_id: string;
  code: string;
  name: string;
  parent?: string;
  category: string;
  type: string;
  normal: "Debit" | "Credit";
  direct?: boolean;
  balance?: number;
  status?: string;
};

// One flattened debit/credit row per ledger line, as written by POST /admin_accounts/
// post_journal_voucher into admin_ledger_entries and read back here via get_ledger_entries.
type LedgerEntry = {
  ledger_id: string;
  voucher_no: string;
  voucher_type: string;
  date: string;
  gl_code: string;
  gl_name: string;
  sl_code?: string;
  sl_name?: string;
  cost_centre_code?: string;
  cost_centre_name?: string;
  debit: number;
  credit: number;
  narration?: string;
  source_module?: string;
  party?: string;
  created_at: string;
};

// One node in the on-screen tree — level/children/rolled-up balances are all computed here,
// not stored on the GL master itself.
type AccountNode = {
  code: string;
  name: string;
  category: string;
  parent?: string;
  level: number;
  children: string[];
  opening: number;
  nature: "Dr" | "Cr";
  // This GL code's own ledger activity only (not descendants).
  ownDebit: number;
  ownCredit: number;
  // Own activity + every descendant's activity, recursively — this is what actually shows in
  // the tree and the summary cards, so a Header genuinely reflects everything posted under it.
  rolledDebit: number;
  rolledCredit: number;
};

const currency = (value: number) => value ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(value) : "—";

// Signed balance in the account's own normal-balance direction (opening + same-side movement
// − opposite-side movement) — a Debit-normal account with more credits than debits still shows
// correctly as a negative/contra balance rather than being clamped at zero.
const signedBalance = (opening: number, debit: number, credit: number, nature: "Dr" | "Cr") =>
  nature === "Dr" ? opening + debit - credit : opening + credit - debit;

export default function ChartOfAccounts() {
  const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
  const [glAccounts, setGlAccounts] = useState<GlAccount[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [selectedCode, setSelectedCode] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [treeSearch, setTreeSearch] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [voucherType, setVoucherType] = useState("All");
  const [fromDate, setFromDate] = useState("2026-04-01");
  const [toDate, setToDate] = useState("2027-03-31");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    Promise.all([
      fetch(`${baseUrl}/admin_accounting_masters/list/GL_ACCOUNT`, { headers: { Accept: "application/json" } }).then((res) => res.json()),
      fetch(`${baseUrl}/admin_accounts/get_ledger_entries`, { headers: { Accept: "application/json" } }).then((res) => res.json()),
    ]).then(([glRes, ledgerRes]) => {
      if (cancelled) return;
      if (!glRes?.success) throw new Error(glRes?.detail || "Failed to load the chart of accounts");
      setGlAccounts(Array.isArray(glRes.data) ? glRes.data : []);
      setLedgerEntries(ledgerRes?.success && Array.isArray(ledgerRes.data) ? ledgerRes.data : []);
    }).catch((error) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : "Failed to load the chart of accounts");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [baseUrl]);

  // Ledger activity grouped by GL code once, so every node's "own" totals are a plain lookup
  // rather than re-scanning the whole ledger per row.
  const activityByCode = useMemo(() => {
    const map = new Map<string, { debit: number; credit: number }>();
    for (const entry of ledgerEntries) {
      const bucket = map.get(entry.gl_code) ?? { debit: 0, credit: 0 };
      bucket.debit += Number(entry.debit) || 0;
      bucket.credit += Number(entry.credit) || 0;
      map.set(entry.gl_code, bucket);
    }
    return map;
  }, [ledgerEntries]);

  // The actual "distribute ledger entries over the various headers" step: build the parent →
  // children tree from the GL master's own `parent` (a name) field, then roll every account's
  // own ledger activity up through every ancestor Header above it.
  const { nodesByCode, roots } = useMemo(() => {
    const byName = new Map(glAccounts.map((account) => [account.name, account]));
    const childrenByCode = new Map<string, string[]>();
    for (const account of glAccounts) {
      if (!account.parent || account.parent === "—") continue;
      const parent = byName.get(account.parent);
      if (!parent) continue;
      childrenByCode.set(parent.code, [...(childrenByCode.get(parent.code) ?? []), account.code]);
    }
    const levelOf = (account: GlAccount, guard = 0): number => {
      if (!account.parent || account.parent === "—" || guard > 20) return 0;
      const parent = byName.get(account.parent);
      return parent ? levelOf(parent, guard + 1) + 1 : 0;
    };
    const nodes = new Map<string, AccountNode>();
    for (const account of glAccounts) {
      const nature: "Dr" | "Cr" = account.normal === "Credit" ? "Cr" : "Dr";
      const own = activityByCode.get(account.code) ?? { debit: 0, credit: 0 };
      nodes.set(account.code, {
        code: account.code, name: account.name, category: account.category, parent: account.parent,
        level: levelOf(account), children: childrenByCode.get(account.code) ?? [],
        opening: Number(account.balance) || 0, nature,
        ownDebit: own.debit, ownCredit: own.credit, rolledDebit: own.debit, rolledCredit: own.credit,
      });
    }
    // Roll up children into parents bottom-up (deepest first) so every ancestor picks up
    // everything already accumulated below it, one level at a time.
    const byLevelDesc = [...nodes.values()].sort((a, b) => b.level - a.level);
    for (const node of byLevelDesc) {
      if (!node.parent) continue;
      const parentAccount = byName.get(node.parent);
      const parentNode = parentAccount && nodes.get(parentAccount.code);
      if (!parentNode) continue;
      parentNode.rolledDebit += node.rolledDebit;
      parentNode.rolledCredit += node.rolledCredit;
    }
    return { nodesByCode: nodes, roots: [...nodes.values()].filter((node) => node.level === 0) };
  }, [glAccounts, activityByCode]);

  const orderedNodes = useMemo(() => {
    const out: AccountNode[] = [];
    const visit = (code: string) => {
      const node = nodesByCode.get(code);
      if (!node) return;
      out.push(node);
      for (const childCode of node.children) visit(childCode);
    };
    for (const root of [...roots].sort((a, b) => a.name.localeCompare(b.name))) visit(root.code);
    return out;
  }, [nodesByCode, roots]);

  useEffect(() => {
    if (!selectedCode && orderedNodes.length) setSelectedCode(orderedNodes[0].code);
  }, [orderedNodes, selectedCode]);
  useEffect(() => {
    if (roots.length) setExpanded(new Set(roots.map((root) => root.code)));
  }, [roots]);

  const selected = nodesByCode.get(selectedCode);

  const voucherTypeOptions = useMemo(() => Array.from(new Set(ledgerEntries.map((entry) => entry.voucher_type).filter(Boolean))).sort(), [ledgerEntries]);

  // The selected account's own ledger movements, oldest first, with a running balance —
  // exactly what "Ledger transactions" shows, seeded with a synthetic Opening Balance row.
  const entries = useMemo(() => {
    if (!selected) return [];
    const rows = ledgerEntries
      .filter((entry) => entry.gl_code === selected.code)
      .sort((a, b) => String(a.date || a.created_at).localeCompare(String(b.date || b.created_at)));
    let running = selected.opening;
    const withOpening: Array<{ id: string; date: string; voucher: string; particulars: string; reference: string; debit: number; credit: number; balance: number; nature: "Dr" | "Cr"; type: string }> = [
      { id: `${selected.code}-opening`, date: "Opening", voucher: "OB", particulars: "Opening Balance", reference: "—", debit: selected.nature === "Dr" ? selected.opening : 0, credit: selected.nature === "Cr" ? selected.opening : 0, balance: selected.opening, nature: selected.nature, type: "Opening Balance" },
    ];
    for (const entry of rows) {
      running = selected.nature === "Dr" ? running + (Number(entry.debit) || 0) - (Number(entry.credit) || 0) : running + (Number(entry.credit) || 0) - (Number(entry.debit) || 0);
      withOpening.push({
        id: entry.ledger_id, date: entry.date, voucher: entry.voucher_no, particulars: entry.narration || entry.source_module || "Ledger posting",
        reference: entry.party || entry.sl_name || "—", debit: Number(entry.debit) || 0, credit: Number(entry.credit) || 0, balance: running, nature: selected.nature, type: entry.voucher_type,
      });
    }
    return withOpening;
  }, [ledgerEntries, selected]);

  const shownEntries = entries.filter(entry => {
    const haystack = [entry.date, entry.voucher, entry.particulars, entry.reference, entry.type].join(" ").toLowerCase();
    return (!ledgerSearch || haystack.includes(ledgerSearch.toLowerCase())) && (voucherType === "All" || entry.type === voucherType);
  });
  const totalDebit = shownEntries.reduce((sum, item) => sum + item.debit, 0);
  const totalCredit = shownEntries.reduce((sum, item) => sum + item.credit, 0);
  const closing = shownEntries[shownEntries.length - 1]?.balance ?? (selected?.opening ?? 0);
  const rolledBalance = selected ? signedBalance(selected.opening, selected.rolledDebit, selected.rolledCredit, selected.nature) : 0;
  const categories = roots;
  const metrics: Array<{ label: string; value: number; nature: string; icon: LucideIcon }> = [
    { label: "Opening Balance", value: selected?.opening ?? 0, nature: selected?.nature ?? "", icon: WalletCards },
    { label: "Total Debit (incl. sub-accounts)", value: selected?.rolledDebit ?? 0, nature: "", icon: Landmark },
    { label: "Total Credit (incl. sub-accounts)", value: selected?.rolledCredit ?? 0, nature: "", icon: Landmark },
    { label: "Closing Balance (incl. sub-accounts)", value: rolledBalance, nature: selected?.nature ?? "", icon: WalletCards },
  ];

  const visibleAccounts = useMemo(() => {
    if (treeSearch) return orderedNodes.filter(item => [item.code, item.name, item.category].some(value => value.toLowerCase().includes(treeSearch.toLowerCase())));
    return orderedNodes.filter(item => {
      if (item.level === 0) return true;
      let parentName = item.parent;
      while (parentName) {
        const parentNode = orderedNodes.find(candidate => candidate.name === parentName);
        if (!parentNode) break;
        if (!expanded.has(parentNode.code)) return false;
        parentName = parentNode.parent;
      }
      return true;
    });
  }, [orderedNodes, expanded, treeSearch]);

  const toggle = (code: string) => setExpanded(current => {
    const next = new Set(current);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    return next;
  });
  const exportCsv = () => {
    if (!selected) return;
    const rows = [["Date", "Voucher", "Particulars", "Reference", "Debit", "Credit", "Balance"], ...shownEntries.map(item => [item.date, item.voucher, item.particulars, item.reference, item.debit, item.credit, `${item.balance} ${item.nature}`])];
    const blob = new Blob([rows.map(row => row.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${selected.code}-${selected.name}.csv`; anchor.click(); URL.revokeObjectURL(url); toast.success("Ledger exported");
  };

  return (
    <div className="min-h-full bg-[#f6f8fa] px-4 py-5 text-slate-900 sm:px-6 lg:px-8 lg:py-7">
      <div className="mx-auto max-w-[1540px] space-y-6">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0d473f] text-white shadow-[0_12px_30px_rgba(13,71,63,0.18)]">
              <FolderTree className="h-6 w-6" />
            </span>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#18765f]">Finance & Accounts</p>
              <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-slate-950">Chart of Accounts{loading && <span className="ml-2 align-middle text-sm font-semibold text-slate-400">Loading…</span>}</h1>
              <p className="mt-1.5 text-sm font-medium text-slate-500">Browse account groups, review real ledger movements and export account statements.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start lg:self-auto">
            <Button variant="outline" onClick={exportCsv} className="h-11 rounded-xl border-[#0d473f]/15 bg-white px-4 font-bold text-[#0d473f] shadow-sm hover:bg-[#0d473f]/5">
              <Download className="mr-2 h-4 w-4" />Export ledger
            </Button>
            <Button onClick={() => setFilterOpen(value => !value)} className="h-11 rounded-xl bg-[#0d473f] px-4 font-bold text-white shadow-sm hover:bg-[#092e2a]">
              <Filter className="mr-2 h-4 w-4" />Filters
            </Button>
          </div>
        </header>

        {loadError && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800">{loadError}</div>}

        <div className="grid min-h-[680px] gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
            <div className="border-b border-slate-100 px-5 py-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-950">Account directory</h2>
                  <p className="mt-1 text-xs font-medium text-slate-500">{orderedNodes.length} ledgers across {categories.length} groups</p>
                </div>
                <span className="rounded-full bg-[#eaf4f1] px-2.5 py-1 text-xs font-bold text-[#0d5c4d]">FY 26–27</span>
              </div>
              <div className="relative mt-4">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={treeSearch} onChange={event => setTreeSearch(event.target.value)} placeholder="Search code or account" className="h-11 w-full rounded-xl border border-slate-200 bg-[#fbfaf7] pl-10 pr-3 text-sm outline-none transition focus:border-[#0d473f]/40 focus:bg-white focus:ring-2 focus:ring-[#0d473f]/10" />
              </div>
            </div>
            <div className="min-h-[430px] flex-1 overflow-y-auto px-3 py-3">
              {visibleAccounts.map(account => {
                const hasChildren = !!account.children.length;
                const selectedRow = account.code === selected?.code;
                return (
                  <button key={account.code} onClick={() => hasChildren ? toggle(account.code) : setSelectedCode(account.code)} className={cn("group flex min-h-10 w-full items-center rounded-xl pr-3 text-left text-[13px] transition", selectedRow ? "bg-[#eaf4f1] font-bold text-[#0d5c4d]" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950")} style={{ paddingLeft: `${10 + account.level * 17}px` }}>
                    {hasChildren ? expanded.has(account.code) ? <ChevronDown className="mr-2 h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="mr-2 h-3.5 w-3.5 shrink-0" /> : <span className={cn("mr-2 h-1.5 w-1.5 shrink-0 rounded-full", selectedRow ? "bg-[#18765f]" : "bg-slate-300")} />}
                    <span className={cn("truncate", account.level === 0 && "font-extrabold text-slate-800 group-hover:text-slate-950")}>
                      {account.level >= 2 && <span className="mr-1 font-mono text-[10px] opacity-60">{account.code}</span>}{account.name}
                    </span>
                  </button>
                );
              })}
              {!loading && !orderedNodes.length && <p className="px-3 py-8 text-center text-xs font-semibold text-slate-400">No GL accounts created yet — add one under Accounting Master → Chart of Accounts.</p>}
            </div>
            <div className="border-t border-slate-100 p-4">
              <div className="flex items-center gap-3 rounded-xl bg-[#f3f8f6] p-3 text-[#0d5c4d]">
                <Landmark className="h-5 w-5" />
                <div><p className="text-xs font-bold">Accounting structure</p><p className="text-[11px] text-slate-500">{categories.length} primary account groups</p></div>
              </div>
            </div>
          </aside>

          <main className="min-w-0 space-y-5">
            {selected && (
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
              <div className="flex flex-col gap-4 bg-[#0d473f] px-6 py-5 text-white sm:flex-row sm:items-center">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/60">General Ledger · {selected.category}</p>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight">{selected.name}</h2>
                  <p className="mt-1 text-xs font-medium text-white/65">GL Code {selected.code} · {selected.nature === "Dr" ? "Debit" : "Credit"} balance account{selected.children.length ? ` · ${selected.children.length} sub-account${selected.children.length === 1 ? "" : "s"}` : ""}</p>
                </div>
                <span className="sm:ml-auto inline-flex w-fit rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold">Active ledger</span>
              </div>

              <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
                {metrics.map(({ label, value, nature, icon: Icon }, index) => (
                  <div key={label} className={cn("flex items-start gap-4 p-5", index === 3 && "bg-[#f3f8f6]")}>
                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", index === 3 ? "bg-[#dceee9] text-[#0d5c4d]" : "bg-slate-100 text-slate-500")}><Icon className="h-5 w-5" /></span>
                    <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className={cn("mt-2 whitespace-nowrap text-lg font-bold tracking-tight", index === 3 ? "text-[#0d5c4d]" : "text-slate-950")}>{currency(value)} {nature}</p></div>
                  </div>
                ))}
              </div>
            </section>
            )}

            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
              <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 lg:flex-row lg:items-center">
                <div>
                  <h2 className="text-base font-bold text-slate-950">Ledger transactions</h2>
                  <p className="mt-1 text-xs font-medium text-slate-500">Every ledger entry actually posted against this GL code — not its sub-accounts</p>
                </div>
                <div className="flex flex-1 flex-col gap-3 lg:ml-auto lg:max-w-[720px] lg:flex-row">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input value={ledgerSearch} onChange={event => setLedgerSearch(event.target.value)} placeholder="Search narration, voucher or reference" className="h-11 w-full rounded-xl border border-slate-200 bg-[#fbfaf7] pl-10 pr-3 text-sm outline-none transition focus:border-[#0d473f]/40 focus:bg-white focus:ring-2 focus:ring-[#0d473f]/10" />
                  </div>
                  <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm">
                    <CalendarDays className="h-4 w-4 text-[#18765f]" />
                    <input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className="min-w-0 border-0 bg-transparent outline-none" />
                    <span className="text-slate-300">–</span>
                    <input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className="min-w-0 border-0 bg-transparent outline-none" />
                  </label>
                </div>
              </div>

              {filterOpen && (
                <div className="flex items-center gap-3 border-b border-[#d7e9e4] bg-[#f3f8f6] px-5 py-3">
                  <SlidersHorizontal className="h-4 w-4 text-[#18765f]" />
                  <label className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#0d5c4d]">Voucher type</label>
                  <select value={voucherType} onChange={event => setVoucherType(event.target.value)} className="h-9 rounded-xl border border-[#0d473f]/15 bg-white px-3 text-xs font-semibold text-slate-700 outline-none">
                    <option>All</option>{voucherTypeOptions.map((type) => <option key={type}>{type}</option>)}
                  </select>
                  <button onClick={() => { setVoucherType("All"); setFilterOpen(false); }} className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-[#dceee9] hover:text-[#0d5c4d]" aria-label="Close filters"><X className="h-4 w-4" /></button>
                </div>
              )}

              {shownEntries.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] table-fixed border-collapse text-[13px] leading-5">
                    <thead className="bg-[#0d473f] text-white">
                      <tr>{[["Date", "w-[13%]"], ["Voucher No.", "w-[14%]"], ["Particulars", "w-[25%]"], ["Party / SL", "w-[13%]"], ["Debit (₹)", "w-[12%]"], ["Credit (₹)", "w-[12%]"], ["Balance (₹)", "w-[15%]"]].map(([label, width], index) => <th key={label} className={cn(width, "px-4 py-4 text-[11px] font-bold uppercase tracking-[0.07em] text-white/90", index >= 4 ? "text-right" : "text-left")}>{label}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {shownEntries.map(entry => (
                        <tr key={entry.id} className="transition-colors hover:bg-[#0d473f]/[0.025]">
                          <td className="whitespace-nowrap px-4 py-4 font-medium text-slate-600">{entry.date}</td>
                          <td className="px-4 py-4 font-bold text-[#0d5c4d]">{entry.voucher}</td>
                          <td className="px-4 py-4 font-semibold text-slate-800">{entry.particulars}</td>
                          <td className="px-4 py-4 text-slate-500">{entry.reference}</td>
                          <td className="whitespace-nowrap px-4 py-4 text-right font-semibold tabular-nums text-slate-700">{currency(entry.debit)}</td>
                          <td className="whitespace-nowrap px-4 py-4 text-right font-semibold tabular-nums text-slate-700">{currency(entry.credit)}</td>
                          <td className={cn("whitespace-nowrap px-4 py-4 text-right font-bold tabular-nums", entry.nature === "Cr" ? "text-rose-600" : "text-emerald-700")}>{currency(entry.balance)} {entry.nature}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><FolderTree className="h-7 w-7" /></span><h3 className="mt-4 text-base font-bold text-slate-900">No ledger entries found</h3><p className="mt-1 text-sm text-slate-500">{selected ? "Nothing has been posted directly to this GL account yet." : "Select an account from the left."}</p></div>
              )}

              <footer className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
                <p className="text-xs font-medium text-slate-500">Showing 1 to {shownEntries.length} of {shownEntries.length} entries</p>
                <div className="flex items-center gap-2 sm:ml-auto">
                  <span className="text-xs font-semibold text-slate-500">Total: {currency(totalDebit)} Dr / {currency(totalCredit)} Cr / Closing {currency(closing)}</span>
                </div>
              </footer>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
