import { useMemo, useState } from "react";
import {
  CalendarDays, ChevronDown, ChevronRight, Download, Filter, FolderTree,
  Landmark, Search, SlidersHorizontal, WalletCards, X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Account = {
  code: string;
  name: string;
  category: string;
  parent?: string;
  level: number;
  children?: string[];
  opening: number;
  nature: "Dr" | "Cr";
};

type Entry = {
  id: string;
  date: string;
  voucher: string;
  particulars: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  nature: "Dr" | "Cr";
  type: string;
};

const accounts: Account[] = [
  { code: "100000", name: "Assets", category: "Assets", level: 0, children: ["110000", "120000"], opening: 0, nature: "Dr" },
  { code: "110000", name: "Current Assets", category: "Assets", parent: "100000", level: 1, children: ["111000", "112000", "113000"], opening: 0, nature: "Dr" },
  { code: "111000", name: "Cash & Bank", category: "Assets", parent: "110000", level: 2, children: ["111001", "111002"], opening: 0, nature: "Dr" },
  { code: "111001", name: "Cash in Hand", category: "Assets", parent: "111000", level: 3, opening: 185000, nature: "Dr" },
  { code: "111002", name: "Bank Accounts", category: "Assets", parent: "111000", level: 3, opening: 6080000, nature: "Dr" },
  { code: "112000", name: "Trade Receivables", category: "Assets", parent: "110000", level: 2, opening: 1420000, nature: "Dr" },
  { code: "113000", name: "Inventory", category: "Assets", parent: "110000", level: 2, opening: 3860000, nature: "Dr" },
  { code: "120000", name: "Non-Current Assets", category: "Assets", parent: "100000", level: 1, children: ["121000", "122000"], opening: 0, nature: "Dr" },
  { code: "121000", name: "Land & Buildings", category: "Assets", parent: "120000", level: 2, opening: 8600000, nature: "Dr" },
  { code: "122000", name: "Plant & Machinery", category: "Assets", parent: "120000", level: 2, opening: 6250000, nature: "Dr" },
  { code: "200000", name: "Liabilities", category: "Liabilities", level: 0, children: ["210000", "220000"], opening: 0, nature: "Cr" },
  { code: "210000", name: "Current Liabilities", category: "Liabilities", parent: "200000", level: 1, children: ["211000", "212000", "213000"], opening: 0, nature: "Cr" },
  { code: "211000", name: "Trade Payables", category: "Liabilities", parent: "210000", level: 2, opening: 500000, nature: "Cr" },
  { code: "212000", name: "Employee Payables", category: "Liabilities", parent: "210000", level: 2, opening: 185000, nature: "Cr" },
  { code: "213000", name: "Statutory Payables", category: "Liabilities", parent: "210000", level: 2, opening: 328000, nature: "Cr" },
  { code: "220000", name: "Long Term Liabilities", category: "Liabilities", parent: "200000", level: 1, opening: 3240000, nature: "Cr" },
  { code: "400000", name: "Income", category: "Income", level: 0, children: ["410000", "420000"], opening: 0, nature: "Cr" },
  { code: "410000", name: "Sales Revenue", category: "Income", parent: "400000", level: 1, opening: 12850000, nature: "Cr" },
  { code: "420000", name: "Other Income", category: "Income", parent: "400000", level: 1, opening: 420000, nature: "Cr" },
  { code: "500000", name: "Expenses", category: "Expenses", level: 0, children: ["510000", "520000"], opening: 0, nature: "Dr" },
  { code: "510000", name: "Farm Operations", category: "Expenses", parent: "500000", level: 1, children: ["510201", "510202", "510203", "510204"], opening: 0, nature: "Dr" },
  { code: "510201", name: "Land Preparation Expense", category: "Expenses", parent: "510000", level: 2, opening: 820000, nature: "Dr" },
  { code: "510202", name: "Irrigation Expense", category: "Expenses", parent: "510000", level: 2, opening: 385000, nature: "Dr" },
  { code: "510203", name: "Spraying Expense", category: "Expenses", parent: "510000", level: 2, opening: 246000, nature: "Dr" },
  { code: "510204", name: "Repairs & Maintenance", category: "Expenses", parent: "510000", level: 2, opening: 318000, nature: "Dr" },
  { code: "520000", name: "Administrative Expenses", category: "Expenses", parent: "500000", level: 1, opening: 940000, nature: "Dr" },
  { code: "300000", name: "Capital & Reserves", category: "Capital & Reserves", level: 0, opening: 15000000, nature: "Cr" },
];

const payableEntries: Entry[] = [
  { id: "e1", date: "01-Apr-2026", voucher: "OB", particulars: "Opening Balance", reference: "—", debit: 0, credit: 500000, balance: 500000, nature: "Cr", type: "Opening Balance" },
  { id: "e2", date: "17-Aug-2026", voucher: "PUR-145", particulars: "Dinesh Kumar Nishad", reference: "BI-000243", debit: 0, credit: 10000, balance: 510000, nature: "Cr", type: "Purchase" },
  { id: "e3", date: "19-Aug-2026", voucher: "PUR-146", particulars: "Prem Industries", reference: "BI-000245", debit: 0, credit: 50000, balance: 560000, nature: "Cr", type: "Purchase" },
  { id: "e4", date: "20-Aug-2026", voucher: "PAY-066", particulars: "Dinesh Kumar Nishad", reference: "PRR-112", debit: 10000, credit: 0, balance: 550000, nature: "Cr", type: "Payment" },
  { id: "e5", date: "22-Aug-2026", voucher: "PAY-067", particulars: "Prem Industries", reference: "PRR-113", debit: 30000, credit: 0, balance: 520000, nature: "Cr", type: "Payment" },
  { id: "e6", date: "31-Aug-2026", voucher: "PUR-147", particulars: "Dinesh Kumar Nishad", reference: "BI-000249", debit: 0, credit: 20000, balance: 540000, nature: "Cr", type: "Purchase" },
];

const genericEntries = (account: Account): Entry[] => [
  { id: `${account.code}-1`, date: "01-Apr-2026", voucher: "OB", particulars: "Opening Balance", reference: "—", debit: account.nature === "Dr" ? account.opening : 0, credit: account.nature === "Cr" ? account.opening : 0, balance: account.opening, nature: account.nature, type: "Opening Balance" },
  { id: `${account.code}-2`, date: "12-Jul-2026", voucher: "JV-00084", particulars: "Monthly accounting adjustment", reference: "JV-84", debit: account.nature === "Dr" ? 45000 : 0, credit: account.nature === "Cr" ? 45000 : 0, balance: account.opening + 45000, nature: account.nature, type: "Journal" },
  { id: `${account.code}-3`, date: "17-Aug-2026", voucher: "JV-00102", particulars: "Operational posting", reference: "REF-102", debit: account.nature === "Cr" ? 15000 : 0, credit: account.nature === "Dr" ? 15000 : 0, balance: account.opening + 30000, nature: account.nature, type: "Journal" },
];

const currency = (value: number) => value ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(value) : "—";

export default function ChartOfAccounts() {
  const [selectedCode, setSelectedCode] = useState("211000");
  const [expanded, setExpanded] = useState(() => new Set(["100000", "110000", "200000", "210000", "500000", "510000"]));
  const [treeSearch, setTreeSearch] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [voucherType, setVoucherType] = useState("All");
  const [fromDate, setFromDate] = useState("2026-04-01");
  const [toDate, setToDate] = useState("2027-03-31");
  const selected = accounts.find(account => account.code === selectedCode) || accounts[0];
  const entries = selected.code === "211000" ? payableEntries : genericEntries(selected);
  const shownEntries = entries.filter(entry => {
    const haystack = [entry.date, entry.voucher, entry.particulars, entry.reference, entry.type].join(" ").toLowerCase();
    return (!ledgerSearch || haystack.includes(ledgerSearch.toLowerCase())) && (voucherType === "All" || entry.type === voucherType);
  });
  const totalDebit = shownEntries.reduce((sum, item) => sum + item.debit, 0);
  const totalCredit = shownEntries.reduce((sum, item) => sum + item.credit, 0);
  const closing = shownEntries[shownEntries.length - 1]?.balance ?? selected.opening;
  const categories = accounts.filter(item => item.level === 0);
  const metrics: Array<{ label: string; value: number; nature: string; icon: LucideIcon }> = [
    { label: "Opening Balance", value: selected.opening, nature: selected.nature, icon: WalletCards },
    { label: "Total Debit", value: totalDebit, nature: "", icon: Landmark },
    { label: "Total Credit", value: totalCredit, nature: "", icon: Landmark },
    { label: "Closing Balance", value: closing, nature: selected.nature, icon: WalletCards },
  ];

  const visibleAccounts = useMemo(() => {
    if (treeSearch) return accounts.filter(item => [item.code, item.name, item.category].some(value => value.toLowerCase().includes(treeSearch.toLowerCase())));
    return accounts.filter(item => {
      if (item.level === 0) return true;
      let parent = item.parent;
      while (parent) {
        if (!expanded.has(parent)) return false;
        parent = accounts.find(candidate => candidate.code === parent)?.parent;
      }
      return true;
    });
  }, [expanded, treeSearch]);

  const toggle = (code: string) => setExpanded(current => {
    const next = new Set(current);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    return next;
  });
  const exportCsv = () => {
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
              <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-slate-950">Chart of Accounts</h1>
              <p className="mt-1.5 text-sm font-medium text-slate-500">Browse account groups, review ledger movements and export account statements.</p>
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

        <div className="grid min-h-[680px] gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
            <div className="border-b border-slate-100 px-5 py-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-950">Account directory</h2>
                  <p className="mt-1 text-xs font-medium text-slate-500">{accounts.length} ledgers across {categories.length} groups</p>
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
                const hasChildren = !!account.children?.length;
                const selectedRow = account.code === selected.code;
                return (
                  <button key={account.code} onClick={() => hasChildren ? toggle(account.code) : setSelectedCode(account.code)} className={cn("group flex min-h-10 w-full items-center rounded-xl pr-3 text-left text-[13px] transition", selectedRow ? "bg-[#eaf4f1] font-bold text-[#0d5c4d]" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950")} style={{ paddingLeft: `${10 + account.level * 17}px` }}>
                    {hasChildren ? expanded.has(account.code) ? <ChevronDown className="mr-2 h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="mr-2 h-3.5 w-3.5 shrink-0" /> : <span className={cn("mr-2 h-1.5 w-1.5 shrink-0 rounded-full", selectedRow ? "bg-[#18765f]" : "bg-slate-300")} />}
                    <span className={cn("truncate", account.level === 0 && "font-extrabold text-slate-800 group-hover:text-slate-950")}>
                      {account.level >= 2 && <span className="mr-1 font-mono text-[10px] opacity-60">{account.code}</span>}{account.name}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="border-t border-slate-100 p-4">
              <div className="flex items-center gap-3 rounded-xl bg-[#f3f8f6] p-3 text-[#0d5c4d]">
                <Landmark className="h-5 w-5" />
                <div><p className="text-xs font-bold">Accounting structure</p><p className="text-[11px] text-slate-500">{categories.length} primary account groups</p></div>
              </div>
            </div>
          </aside>

          <main className="min-w-0 space-y-5">
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
              <div className="flex flex-col gap-4 bg-[#0d473f] px-6 py-5 text-white sm:flex-row sm:items-center">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/60">General Ledger · {selected.category}</p>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight">{selected.name}</h2>
                  <p className="mt-1 text-xs font-medium text-white/65">GL Code {selected.code} · {selected.nature === "Dr" ? "Debit" : "Credit"} balance account</p>
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

            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
              <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 lg:flex-row lg:items-center">
                <div>
                  <h2 className="text-base font-bold text-slate-950">Ledger transactions</h2>
                  <p className="mt-1 text-xs font-medium text-slate-500">Movement recorded during the selected financial period</p>
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
                    <option>All</option><option>Opening Balance</option><option>Purchase</option><option>Payment</option><option>Journal</option>
                  </select>
                  <button onClick={() => { setVoucherType("All"); setFilterOpen(false); }} className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-[#dceee9] hover:text-[#0d5c4d]" aria-label="Close filters"><X className="h-4 w-4" /></button>
                </div>
              )}

              {shownEntries.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] table-fixed border-collapse text-[13px] leading-5">
                    <thead className="bg-[#0d473f] text-white">
                      <tr>{[["Date", "w-[13%]"], ["Voucher No.", "w-[14%]"], ["Particulars", "w-[25%]"], ["Reference", "w-[13%]"], ["Debit (₹)", "w-[12%]"], ["Credit (₹)", "w-[12%]"], ["Balance (₹)", "w-[15%]"]].map(([label, width], index) => <th key={label} className={cn(width, "px-4 py-4 text-[11px] font-bold uppercase tracking-[0.07em] text-white/90", index >= 4 ? "text-right" : "text-left")}>{label}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {shownEntries.map(entry => (
                        <tr key={entry.id} className="transition-colors hover:bg-[#0d473f]/[0.025]">
                          <td className="whitespace-nowrap px-4 py-4 font-medium text-slate-600">{entry.date}</td>
                          <td className="px-4 py-4"><button className="font-bold text-[#0d5c4d] hover:underline">{entry.voucher}</button></td>
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
                <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><FolderTree className="h-7 w-7" /></span><h3 className="mt-4 text-base font-bold text-slate-900">No ledger entries found</h3><p className="mt-1 text-sm text-slate-500">Try another account, voucher type or search term.</p></div>
              )}

              <footer className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
                <p className="text-xs font-medium text-slate-500">Showing 1 to {shownEntries.length} of {shownEntries.length} entries</p>
                <div className="flex items-center gap-2 sm:ml-auto">
                  <button className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50">‹</button>
                  <button className="grid h-9 w-9 place-items-center rounded-xl bg-[#0d473f] text-xs font-bold text-white">1</button>
                  <button className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50">›</button>
                  <select className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600"><option>20 / page</option><option>50 / page</option></select>
                </div>
              </footer>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
