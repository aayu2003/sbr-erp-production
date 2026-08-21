import { useEffect, useState, type ElementType } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Eye,
  FileBarChart,
  FileText,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import getBaseUrl from "@/lib/config";

type VoucherTabLabel = "Journal" | "Bank" | "Cash" | "Contra" | "Reversal" | "Register";
type VoucherTab = { label: VoucherTabLabel; description: string; features: string[] };

const VOUCHER_TABS: VoucherTab[] = [
  { label: "Journal", description: "Record non-cash accounting adjustments.", features: ["Journal Voucher"] },
  { label: "Bank", description: "Record payments and receipts through bank accounts.", features: ["Bank Payment Voucher", "Bank Receipt Voucher"] },
  { label: "Cash", description: "Record payments and receipts through cash accounts.", features: ["Cash Payment Voucher", "Cash Receipt Voucher"] },
  { label: "Contra", description: "Transfer balances between cash and bank accounts.", features: ["Contra Voucher"] },
  { label: "Reversal", description: "Reverse or cancel posted vouchers with an audit trail.", features: ["Reversal / Cancellation"] },
  { label: "Register", description: "Search and review the consolidated voucher register.", features: ["Journal Voucher", "Bank Vouchers", "Cash Vouchers", "Contra Voucher"] },
];

type JournalVoucherLine = { gl_account: string; sub_ledger?: string; cost_centre?: string; cost_attribution?: string; debit?: number; credit?: number };
type JournalVoucher = {
  voucher_id: string;
  voucher_no: string;
  posting_date: string;
  voucher_type: string;
  source_module: string;
  source_reference: string;
  invoice_no: string;
  party: string;
  narration: string;
  lines: JournalVoucherLine[];
  total_debit: number;
  total_credit: number;
  status: string;
  created_at: string;
};

type JournalLine = { id: string; glAccount: string; subLedger: string; costCentre: string; costAttribution: string; debit: string; credit: string };
type MasterItem = Record<string, unknown>;

const masterOptionLabel = (item: MasterItem): string => {
  const code = String(item.code ?? "").trim();
  const name = String(item.name ?? item.label ?? "").trim();
  if (code && name) return `${code} - ${name}`;
  return name || code || String(item.item_id ?? "");
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);

const formatRegisterDate = (value?: string) => {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
};

function PageHeading({ icon: Icon, eyebrow, title, description, action }: { icon: ElementType; eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0d473f] text-white shadow-[0_12px_30px_rgba(13,71,63,0.18)]">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#18765f]">{eyebrow}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-slate-950">{title}</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function VoucherDetailsModal({ voucher, onClose }: { voucher: JournalVoucher; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between bg-[#0d473f] px-6 py-5 text-white">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/60">Vouchers · {voucher.source_module}</p>
            <h2 className="mt-1 text-xl font-bold">{voucher.voucher_no}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 border-b border-slate-100 px-6 py-4 text-xs sm:grid-cols-4">
          {[["Date", formatRegisterDate(voucher.posting_date)], ["Voucher Type", voucher.voucher_type || "—"], ["Reference", voucher.source_reference || "—"], ["Party", voucher.party || "—"], ["Invoice / Doc No.", voucher.invoice_no || "—"], ["Total Debit", formatCurrency(voucher.total_debit)], ["Total Credit", formatCurrency(voucher.total_credit)], ["Status", voucher.status]].map(([label, value]) => (
            <div key={label}><p className="font-bold uppercase tracking-[0.08em] text-slate-400">{label}</p><p className="mt-1 truncate font-bold text-slate-800">{value}</p></div>
          ))}
        </div>
        {voucher.narration && <p className="border-b border-slate-100 px-6 py-3 text-sm text-slate-600">{voucher.narration}</p>}
        <div className="overflow-x-auto p-6">
          <table className="w-full min-w-[600px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-3 py-2">GL Account</th><th className="px-3 py-2">Sub Ledger</th><th className="px-3 py-2">Cost Centre</th><th className="px-3 py-2">Cost Attribution</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {voucher.lines.map((line, index) => (
                <tr key={index}>
                  <td className="px-3 py-2 font-semibold text-slate-800">{line.gl_account}</td>
                  <td className="px-3 py-2 text-slate-500">{line.sub_ledger || "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{line.cost_centre || "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{line.cost_attribution || "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800">{line.debit ? formatCurrency(line.debit) : "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800">{line.credit ? formatCurrency(line.credit) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function VoucherPostingModal({ tab, onClose, onPosted }: { tab: VoucherTab; onClose: () => void; onPosted: () => void }) {
  const [postingDate, setPostingDate] = useState(new Date().toISOString().slice(0, 10));
  const [voucherType, setVoucherType] = useState(tab.features[0] ?? "");
  const [sourceReference, setSourceReference] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [party, setParty] = useState("");
  const [narration, setNarration] = useState("");
  const [voucherNo, setVoucherNo] = useState("Generating…");
  const [lines, setLines] = useState<JournalLine[]>(() => [
    { id: "l1", glAccount: "", subLedger: "", costCentre: "", costAttribution: "", debit: "", credit: "" },
    { id: "l2", glAccount: "", subLedger: "", costCentre: "", costAttribution: "", debit: "", credit: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [masters, setMasters] = useState<{ glAccounts: MasterItem[]; subLedgers: MasterItem[]; costCentres: MasterItem[]; costAttributions: MasterItem[]; voucherTypes: MasterItem[] }>({ glAccounts: [], subLedgers: [], costCentres: [], costAttributions: [], voucherTypes: [] });

  useEffect(() => {
    const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
    let cancelled = false;
    fetch(`${baseUrl}/admin_accounts/get_next_voucher_number`)
      .then((res) => res.json())
      .then((data) => { if (!cancelled && data?.success) setVoucherNo(data.next_voucher_number); })
      .catch(() => { if (!cancelled) setVoucherNo("—"); });
    fetch(`${baseUrl}/admin_accounting_masters/list_all`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data?.success) return;
        setMasters({
          glAccounts: data.data?.GL_ACCOUNT ?? [],
          subLedgers: data.data?.SUB_LEDGER ?? [],
          costCentres: data.data?.COST_CENTRE ?? [],
          costAttributions: data.data?.COST_ATTRIBUTION ?? [],
          voucherTypes: data.data?.VOUCHER_TYPE ?? [],
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const updateLine = (id: string, patch: Partial<JournalLine>) => setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  const addLine = () => setLines((prev) => [...prev, { id: `l${Date.now()}`, glAccount: "", subLedger: "", costCentre: "", costAttribution: "", debit: "", credit: "" }]);
  const removeLine = (id: string) => setLines((prev) => (prev.length > 2 ? prev.filter((line) => line.id !== id) : prev));

  const totalDebit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
  const difference = Math.round((totalDebit - totalCredit) * 100) / 100;
  const isBalanced = difference === 0 && totalDebit > 0;

  const handlePost = async () => {
    const completedLines = lines.filter((line) => line.glAccount.trim() && ((Number(line.debit) || 0) > 0 || (Number(line.credit) || 0) > 0));
    if (completedLines.length < 2) return;
    if (!isBalanced) return;
    setSubmitting(true);
    try {
      const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/admin_accounts/post_journal_voucher`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posting_date: postingDate,
          voucher_type: voucherType,
          source_module: tab.label,
          source_reference: sourceReference,
          invoice_no: invoiceNo,
          party,
          narration,
          lines: completedLines.map((line) => ({ gl_account: line.glAccount, sub_ledger: line.subLedger, cost_centre: line.costCentre, cost_attribution: line.costAttribution, debit: Number(line.debit) || 0, credit: Number(line.credit) || 0 })),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(data?.detail || data?.message || "Failed to post voucher");
      onPosted();
      onClose();
    } catch {
      setSubmitting(false);
    }
  };

  const smallInput = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 outline-none focus:border-[#278b76] focus:ring-2 focus:ring-[#278b76]/10";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-[2px]">
      <div className="flex max-h-[96vh] w-full max-w-[1400px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between bg-[#0d473f] px-6 py-5 text-white">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/60">Vouchers · {tab.label}</p>
            <h2 className="mt-1 text-xl font-bold">Post Accounting Entry</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-white p-5 sm:p-6">
          <div className="mb-4 grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs sm:grid-cols-4">
            {[["Voucher No.", voucherNo], ["Date", formatRegisterDate(postingDate)], ["Source", tab.label], ["Reference No.", sourceReference || "—"], ["Party", party || "—"], ["Amount", formatCurrency(totalDebit)], ["Status", "Draft"]].map(([label, value]) => (
              <div key={label}><p className="font-bold uppercase tracking-[0.08em] text-slate-400">{label}</p><p className="mt-1 truncate font-bold text-slate-800">{value}</p></div>
            ))}
          </div>

          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#18765f]">A. Source Details</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Posting Date *
              <input required type="date" value={postingDate} onChange={(event) => setPostingDate(event.target.value)} className={smallInput} />
            </label>
            <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Voucher Type *
              <input required list="voucher-types" value={voucherType} onChange={(event) => setVoucherType(event.target.value)} className={smallInput} placeholder={tab.features[0]} />
              <datalist id="voucher-types">{(masters.voucherTypes.length ? masters.voucherTypes.map((item) => masterOptionLabel(item)) : tab.features).map((label) => <option key={label} value={label} />)}</datalist>
            </label>
            <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Source Module
              <input disabled value={tab.label} className={cn(smallInput, "bg-slate-50 text-slate-500")} />
            </label>
            <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Source Reference
              <input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} className={smallInput} placeholder="Optional reference" />
            </label>
            <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Invoice / Document No.
              <input value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} className={smallInput} placeholder="Optional" />
            </label>
            <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Party *
              <input value={party} onChange={(event) => setParty(event.target.value)} className={smallInput} placeholder="Vendor, employee or account" />
            </label>
          </div>
          <label className="mt-3 block space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Narration
            <textarea rows={2} value={narration} onChange={(event) => setNarration(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-[#278b76] focus:ring-2 focus:ring-[#278b76]/10" />
          </label>

          <div className="mt-5 flex items-center justify-between">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#18765f]">B. Accounting Entry</p>
            <button type="button" onClick={addLine} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0d5c4d] hover:underline"><Plus className="h-3.5 w-3.5" />Add Ledger Line</button>
          </div>
          <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{["#", "GL Account *", "Sub Ledger", "Cost Centre", "Cost Attribution", "Debit (₹)", "Credit (₹)", ""].map((label) => <th key={label} className="px-2.5 py-2 font-bold">{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line, index) => (
                  <tr key={line.id}>
                    <td className="px-2.5 py-2 font-semibold text-slate-500">{index + 1}</td>
                    <td className="px-2.5 py-2"><input list="voucher-gl-accounts" value={line.glAccount} onChange={(event) => updateLine(line.id, { glAccount: event.target.value })} className={smallInput} placeholder="Select GL account" /></td>
                    <td className="px-2.5 py-2"><input list="voucher-sub-ledgers" value={line.subLedger} onChange={(event) => updateLine(line.id, { subLedger: event.target.value })} className={smallInput} placeholder="—" /></td>
                    <td className="px-2.5 py-2"><input list="voucher-cost-centres" value={line.costCentre} onChange={(event) => updateLine(line.id, { costCentre: event.target.value })} className={smallInput} placeholder="—" /></td>
                    <td className="px-2.5 py-2"><input list="voucher-cost-attributions" value={line.costAttribution} onChange={(event) => updateLine(line.id, { costAttribution: event.target.value })} className={smallInput} placeholder="—" /></td>
                    <td className="px-2.5 py-2"><input type="number" min="0" step="0.01" onWheel={(e) => e.currentTarget.blur()} value={line.debit} onChange={(event) => updateLine(line.id, { debit: event.target.value, credit: event.target.value ? "" : line.credit })} className={smallInput} /></td>
                    <td className="px-2.5 py-2"><input type="number" min="0" step="0.01" onWheel={(e) => e.currentTarget.blur()} value={line.credit} onChange={(event) => updateLine(line.id, { credit: event.target.value, debit: event.target.value ? "" : line.debit })} className={smallInput} /></td>
                    <td className="px-2.5 py-2 text-center"><button type="button" onClick={() => removeLine(line.id)} disabled={lines.length <= 2} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="voucher-gl-accounts">{masters.glAccounts.map((item) => <option key={String(item.item_id)} value={masterOptionLabel(item)} />)}</datalist>
            <datalist id="voucher-sub-ledgers">{masters.subLedgers.map((item) => <option key={String(item.item_id)} value={masterOptionLabel(item)} />)}</datalist>
            <datalist id="voucher-cost-centres">{masters.costCentres.map((item) => <option key={String(item.item_id)} value={masterOptionLabel(item)} />)}</datalist>
            <datalist id="voucher-cost-attributions">{masters.costAttributions.map((item) => <option key={String(item.item_id)} value={masterOptionLabel(item)} />)}</datalist>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
            <span><span className="text-slate-500">Total Debit (₹) </span><span className="font-bold text-slate-800">{formatCurrency(totalDebit)}</span></span>
            <span><span className="text-slate-500">Total Credit (₹) </span><span className="font-bold text-slate-800">{formatCurrency(totalCredit)}</span></span>
            <span className={cn("inline-flex items-center gap-1.5 font-bold", isBalanced ? "text-emerald-700" : "text-amber-700")}>Difference (₹) {formatCurrency(Math.abs(difference))} {isBalanced ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-6 py-4">
          <p className="text-xs font-medium text-slate-400">{isBalanced ? "Ready to post — debit and credit are balanced." : "Debit and credit must be equal before this can be posted."}</p>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={submitting} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={handlePost} disabled={submitting || !isBalanced} className="h-11 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white hover:bg-[#0a4b3f] disabled:opacity-60">{submitting ? "Posting…" : "Post Voucher"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Vouchers() {
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("tab");
  const activeTab = VOUCHER_TABS.find((tab) => tab.label.toLowerCase() === requestedTab?.toLowerCase()) ?? VOUCHER_TABS[0];
  const [vouchers, setVouchers] = useState<JournalVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [modalOpen, setModalOpen] = useState(false);
  const [viewing, setViewing] = useState<JournalVoucher | null>(null);

  const fetchVouchers = () => {
    setLoading(true);
    setLoadError("");
    const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
    fetch(`${baseUrl}/admin_accounts/get_journal_vouchers`)
      .then((res) => res.json())
      .then((data) => {
        if (!data?.success) throw new Error(data?.detail || "Failed to load vouchers");
        setVouchers(data.data ?? []);
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Failed to load vouchers."))
      .finally(() => setLoading(false));
  };
  useEffect(fetchVouchers, []);

  const selectTab = (tab: VoucherTab) => {
    setParams({ tab: tab.label.toLowerCase() });
    setSearch("");
    setStatus("All statuses");
  };

  const tabVouchers = activeTab.label === "Register" ? vouchers : vouchers.filter((voucher) => voucher.source_module === activeTab.label);
  const visibleVouchers = tabVouchers.filter((voucher) => {
    const query = search.toLowerCase().trim();
    const matchesSearch = !query || [voucher.voucher_no, voucher.voucher_type, voucher.party, voucher.narration, voucher.source_reference].some((value) => String(value ?? "").toLowerCase().includes(query));
    const matchesStatus = status === "All statuses" || voucher.status === status;
    return matchesSearch && matchesStatus;
  });
  const totalValue = tabVouchers.reduce((sum, voucher) => sum + Number(voucher.total_debit || 0), 0);
  const pending = tabVouchers.filter((voucher) => voucher.status === "Pending Approval").length;
  const completed = tabVouchers.filter((voucher) => ["Posted", "Paid", "Reconciled", "Closed"].includes(voucher.status)).length;

  return (
    <div className="min-h-full bg-[#f6f8fa] px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <PageHeading
          icon={FileText}
          eyebrow="Finance & Accounts"
          title="Vouchers"
          description="Create, post, reverse and register all accounting voucher types."
          action={activeTab.label !== "Register" ? <button onClick={() => setModalOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(13,92,77,0.18)] hover:bg-[#0a4b3f]"><Plus className="h-4 w-4" />New Entry</button> : undefined}
        />

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
          <div className="flex min-w-max gap-1">
            {VOUCHER_TABS.map((tab) => (
              <button key={tab.label} onClick={() => selectTab(tab)} className={cn("rounded-xl px-5 py-3 text-sm font-bold transition", activeTab.label === tab.label ? "bg-[#0d5c4d] text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800")}>{tab.label}</button>
            ))}
          </div>
        </div>

        {loadError && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800">{loadError}</div>}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: `${activeTab.label} Entries`, value: tabVouchers.length.toLocaleString("en-IN"), icon: ClipboardList },
            { label: "Pending Approval", value: pending.toLocaleString("en-IN"), icon: ShieldCheck },
            { label: "Completed", value: completed.toLocaleString("en-IN"), icon: CheckCircle2 },
            { label: "Recorded Value", value: formatCurrency(totalValue), icon: CircleDollarSign },
          ].map(({ label, value, icon: CardIcon }) => (
            <div key={label} className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.035)]">
              <div><p className="text-xs font-bold text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{value}</p></div>
              <span className="rounded-xl bg-[#eaf4f1] p-2.5 text-[#0d5c4d]"><CardIcon className="h-5 w-5" /></span>
            </div>
          ))}
        </div>

        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div><h2 className="text-lg font-bold text-slate-950">{activeTab.label} Register{loading && <span className="ml-2 align-middle text-xs font-semibold text-slate-400">Refreshing…</span>}</h2><p className="mt-1 text-sm text-slate-500">Search, review and maintain entries for this workflow.</p></div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-4 text-sm font-medium outline-none focus:border-[#278b76] sm:w-72" placeholder="Search voucher no, party or type" /></label>
              <label className="relative"><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 appearance-none rounded-xl border border-slate-200 bg-white pl-4 pr-10 text-sm font-bold text-slate-600 outline-none focus:border-[#278b76]"><option>All statuses</option>{["Draft", "Pending Approval", "Verified", "Posted", "Paid", "Reconciled", "Closed"].map((item) => <option key={item}>{item}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /></label>
            </div>
          </div>

          {visibleVouchers.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="bg-[#0d473f] text-[11px] uppercase tracking-[0.11em] text-white"><tr><th className="px-5 py-4 text-center">Voucher No.</th><th className="px-5 py-4 text-center">Date</th><th className="px-5 py-4 text-center">Entry Type</th><th className="px-5 py-4 text-center">Party / Account</th><th className="px-5 py-4 text-center">Amount</th><th className="px-5 py-4 text-center">Status</th><th className="px-5 py-4 text-center">Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleVouchers.map((voucher) => (
                    <tr key={voucher.voucher_id} className="leading-5 hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-5 py-4 font-semibold text-[#0d5c4d]">{voucher.voucher_no}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-center font-medium text-slate-600">{formatRegisterDate(voucher.posting_date)}</td>
                      <td className="px-5 py-4 font-semibold text-slate-800">{voucher.voucher_type}</td>
                      <td className="px-5 py-4 font-medium text-slate-500">{voucher.party || "—"}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-right font-semibold text-slate-900">{formatCurrency(voucher.total_debit)}</td>
                      <td className="px-5 py-4 text-center"><span className={cn("inline-flex whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold", voucher.status === "Pending Approval" ? "bg-amber-50 text-amber-700" : ["Posted", "Paid", "Reconciled", "Closed"].includes(voucher.status) ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>{voucher.status || "Draft"}</span></td>
                      <td className="px-5 py-4"><div className="flex justify-end gap-1"><button onClick={() => setViewing(voucher)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-[#b8d6ce] hover:bg-[#eaf4f1] hover:text-[#0d5c4d]" title="View voucher"><Eye className="h-4 w-4" />View</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex min-h-[300px] flex-col items-center justify-center px-6 py-12 text-center">
              <span className="rounded-2xl bg-[#edf5f2] p-4 text-[#6c9b90]"><FileBarChart className="h-8 w-8" /></span>
              <h3 className="mt-4 text-lg font-bold text-slate-800">No {activeTab.label.toLowerCase()} entries found</h3>
              <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">Create the first entry for this workflow, or change the search and status filters.</p>
              {activeTab.label !== "Register" && <button onClick={() => setModalOpen(true)} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-[#b8d6ce] px-4 text-sm font-bold text-[#0d5c4d] hover:bg-[#edf5f2]"><Plus className="h-4 w-4" />Create {activeTab.features[0] ?? "Entry"}</button>}
            </div>
          )}
        </section>
      </div>
      {modalOpen && <VoucherPostingModal tab={activeTab} onClose={() => setModalOpen(false)} onPosted={fetchVouchers} />}
      {viewing && <VoucherDetailsModal voucher={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
