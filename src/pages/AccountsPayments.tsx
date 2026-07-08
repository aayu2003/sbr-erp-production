import { Fragment, useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileText,
  IndianRupee,
  PackageCheck,
  Printer,
  Save,
  Search,
  Send,
  Truck,
  Upload,
  User,
  X,
  XCircle,
} from "lucide-react";
import getBaseUrl from "@/lib/config";

// ── Types ─────────────────────────────────────────────────────────────────────

type VendorTab =
  | "Invoice Register"
  | "Payment Requests"
  | "Approvals"
  | "Payments"
  | "Vendor Ledger"
  | "Accounting Ledger"
  | "TDS"
  | "Documents"
  | "Reports";

type VendorLedgerRow = readonly [string, string, string, string, string, string, string, string, string];

type InvoicePayment = {
  payment_id?: string;
  invoice_doc_url?: string;
  order_number?: string;
  vendor_name?: string;
  vendor_id?: string;
  created_at?: string;
  admin_ops_approval_status?: string;
  director_approval_status?: string;
  payment_completed?: boolean;
  prr_url?: string;
  payment_request_dict?: unknown;
  payment_completion_metadata?: unknown;
  invoice_type?: string;
};

type MilestoneStatus = "done" | "active" | "pending" | "rejected";

// ── Shared Data ───────────────────────────────────────────────────────────────

const tabs: VendorTab[] = [
  "Invoice Register",
  "Payment Requests",
  "Approvals",
  "Payments",
  "Vendor Ledger",
  "Accounting Ledger",
  "TDS",
  "Documents",
  "Reports",
];

const vendor = {
  name: "Agro Diesel Supplies",
  code: "VEN-0042",
  gstin: "22AAAAA0000A1Z5",
  category: "Fuel & Consumables",
  po: "PO-2026-014",
  invoice: "INV-VEN-2026-088",
  invoiceDate: "10 Jan 2026",
  dueDate: "25 Jan 2026",
  invoiceAmount: "₹4,80,000",
  paidTillDate: "₹1,80,000",
  outstanding: "₹3,00,000",
  paymentMode: "NEFT",
  bank: "SBI - Current A/c (12345678901)",
  status: "Partially Paid",
};

// ── Payment Requests data ─────────────────────────────────────────────────────


// ── Approvals data ────────────────────────────────────────────────────────────

const approvalQueue = [
  { id: "PR-2026-019", vendor: "Agro Diesel Supplies", invoice: "INV-VEN-2026-088", amount: "₹4,70,400", requestedBy: "Priya Sharma", requestDate: "16 Jan 2026", level: "Finance Manager", urgency: "High" },
  { id: "PR-2026-018", vendor: "Farm Machinery Works", invoice: "INV-VEN-2026-077", amount: "₹2,25,000", requestedBy: "Kiran Patil", requestDate: "21 Jan 2026", level: "Director", urgency: "Normal" },
];

// ── Payments (Schedule) data ──────────────────────────────────────────────────

const scheduleRows = [
  { vendor: "Agro Diesel Supplies", invoice: "INV-VEN-2026-088", po: "PO-2026-014", category: "Fuel", dueDate: "25 Jan 2026", amount: "₹3,00,000", status: "Due Soon" },
  { vendor: "Green Seeds Traders", invoice: "INV-VEN-2026-091", po: "PO-2026-019", category: "Seeds", dueDate: "30 Jan 2026", amount: "₹1,45,000", status: "Upcoming" },
  { vendor: "Farm Machinery Works", invoice: "INV-VEN-2026-077", po: "WO-2026-006", category: "Service", dueDate: "05 Feb 2026", amount: "₹2,25,000", status: "Scheduled" },
];

// ── Vendor Ledger data ────────────────────────────────────────────────────────

const vendorLedgerRows = [
  ["10 Jan 2026", "JV-2026-041", "Vendor Invoice Booked", "Opening liability", "-", "₹4,80,000", "₹4,80,000 Cr", "Cr", "-"],
  ["15 Jan 2026", "PV-2026-034", "Part Payment Released", "UTR: HDFC0098123", "₹1,80,000", "-", "₹3,00,000 Cr", "Cr", "NEFT"],
  ["25 Jan 2026", "(Expected)", "Balance Payment Due", "As per invoice terms", "-", "-", "₹3,00,000 Cr", "Cr", "-"],
] as const satisfies readonly VendorLedgerRow[];

// ── Accounting Ledger data ────────────────────────────────────────────────────

const accountingLedgerRows = [
  { date: "10 Jan 2026", jv: "JV-2026-041", account: "Purchase A/c (Fuel)", narration: "Diesel purchase booking", dr: "₹4,80,000", cr: "-" },
  { date: "10 Jan 2026", jv: "JV-2026-041", account: "Input GST A/c (18%)", narration: "GST on diesel purchase", dr: "₹86,400", cr: "-" },
  { date: "10 Jan 2026", jv: "JV-2026-041", account: "Accounts Payable A/c", narration: "Liability to Agro Diesel", dr: "-", cr: "₹5,66,400" },
  { date: "15 Jan 2026", jv: "PV-2026-034", account: "Accounts Payable A/c", narration: "Part payment clearing", dr: "₹1,80,000", cr: "-" },
  { date: "15 Jan 2026", jv: "PV-2026-034", account: "TDS Payable A/c", narration: "TDS deducted @ 2%", dr: "-", cr: "₹3,600" },
  { date: "15 Jan 2026", jv: "PV-2026-034", account: "Bank — SBI Current A/c", narration: "Net payment via NEFT", dr: "-", cr: "₹1,76,400" },
];

// ── TDS data ──────────────────────────────────────────────────────────────────

const tdsRows = [
  { challanNo: "CH-2026-011", vendor: "Agro Diesel Supplies", invoice: "INV-VEN-2026-088", tdsSection: "194C", invoiceAmt: "₹4,80,000", tdsRate: "2%", tdsAmt: "₹9,600", deductedOn: "15 Jan 2026", depositedOn: "07 Feb 2026", status: "Deposited" },
  { challanNo: "CH-2026-009", vendor: "Shakti Fertilizers", invoice: "INV-VEN-2026-065", tdsSection: "194C", invoiceAmt: "₹2,10,000", tdsRate: "2%", tdsAmt: "₹4,200", deductedOn: "08 Jan 2026", depositedOn: "07 Feb 2026", status: "Deposited" },
  { challanNo: "-", vendor: "Farm Machinery Works", invoice: "INV-VEN-2026-077", tdsSection: "194C", invoiceAmt: "₹2,25,000", tdsRate: "2%", tdsAmt: "₹4,500", deductedOn: "-", depositedOn: "-", status: "Pending" },
];

// ── Documents data ────────────────────────────────────────────────────────────

const allDocuments = [
  { name: "Vendor_Invoice_INV-VEN-2026-088.pdf", vendor: "Agro Diesel Supplies", type: "Invoice", size: "540 KB", date: "10 Jan 2026", linkedTo: "PR-2026-019" },
  { name: "Purchase_Order_PO-2026-014.pdf", vendor: "Agro Diesel Supplies", type: "Purchase Order", size: "310 KB", date: "08 Jan 2026", linkedTo: "PO-2026-014" },
  { name: "GRN_Receipt_GRN-2026-025.pdf", vendor: "Agro Diesel Supplies", type: "GRN", size: "420 KB", date: "12 Jan 2026", linkedTo: "GRN-2026-025" },
  { name: "Vendor_Bank_Details_VEN-0042.pdf", vendor: "Agro Diesel Supplies", type: "Bank Details", size: "180 KB", date: "03 Jan 2026", linkedTo: "-" },
  { name: "Invoice_INV-VEN-2026-091.pdf", vendor: "Green Seeds Traders", type: "Invoice", size: "290 KB", date: "15 Jan 2026", linkedTo: "PR-2026-017" },
  { name: "WorkOrder_WO-2026-006.pdf", vendor: "Farm Machinery Works", type: "Work Order", size: "460 KB", date: "20 Jan 2026", linkedTo: "WO-2026-006" },
];

const docTypeColors: Record<string, string> = {
  Invoice: "bg-blue-100 text-blue-700",
  "Purchase Order": "bg-indigo-100 text-indigo-700",
  GRN: "bg-emerald-100 text-emerald-700",
  "Bank Details": "bg-slate-100 text-slate-700",
  "Work Order": "bg-purple-100 text-purple-700",
};

// ── Reports data ──────────────────────────────────────────────────────────────

const reportTypes = [
  { title: "Vendor Ageing Report", desc: "Outstanding payables bucketed by 0-30, 31-60, 61-90, 90+ days", icon: CalendarDays, color: "text-orange-600", bg: "bg-orange-50" },
  { title: "Payment Register", desc: "All payments made in a period with UTR references", icon: CreditCard, color: "text-blue-600", bg: "bg-blue-50" },
  { title: "Invoice Register", desc: "All received invoices with booking and payment status", icon: FileText, color: "text-indigo-600", bg: "bg-indigo-50" },
  { title: "TDS Summary", desc: "TDS deducted, challan status, 26Q filing summary", icon: IndianRupee, color: "text-emerald-600", bg: "bg-emerald-50" },
  { title: "Vendor Statement", desc: "Account statement for a specific vendor with Dr/Cr", icon: User, color: "text-slate-600", bg: "bg-slate-100" },
  { title: "GRN-Invoice Reconciliation", desc: "Match GRN receipts against vendor invoices", icon: PackageCheck, color: "text-teal-600", bg: "bg-teal-50" },
];

const ageingData = [
  { vendor: "Agro Diesel Supplies", current: "₹3,00,000", d30: "-", d60: "-", d90: "-", total: "₹3,00,000" },
  { vendor: "Green Seeds Traders", current: "₹1,45,000", d30: "-", d60: "-", d90: "-", total: "₹1,45,000" },
  { vendor: "Farm Machinery Works", current: "₹2,25,000", d30: "-", d60: "-", d90: "-", total: "₹2,25,000" },
  { vendor: "Shakti Fertilizers", current: "-", d30: "-", d60: "-", d90: "-", total: "-" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const safeStr = (v: unknown) => String(v ?? "").trim();

const formatDate = (raw?: string) => {
  const v = safeStr(raw);
  if (!v) return "—";
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return v;
  try {
    return new Intl.DateTimeFormat("en-IN", {
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
};

const approvalBadge: Record<string, string> = {
  pending:  "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const renderPaymentData = (pd: unknown): string => {
  if (!pd) return "—";
  if (typeof pd === "string") return pd || "—";
  if (typeof pd === "object" && pd !== null) {
    const obj = pd as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return "—";
    const parts: string[] = [];
    if (obj.amount) parts.push(`₹${obj.amount}`);
    if (obj.utr)    parts.push(`UTR: ${obj.utr}`);
    if (obj.mode)   parts.push(safeStr(obj.mode));
    if (obj.date)   parts.push(safeStr(obj.date));
    return parts.length ? parts.join(" · ") : JSON.stringify(pd);
  }
  return String(pd);
};

// ── Root Component ────────────────────────────────────────────────────────────

export default function AccountsPayments() {
  const [activeTab, setActiveTab] = useState<VendorTab>("Invoice Register");
  const [selectedInvoice, setSelectedInvoice] = useState<InvoicePayment | null>(null);

  const handleOpen = (item: InvoicePayment, tab: VendorTab) => {
    setSelectedInvoice(item);
    setActiveTab(tab);
  };

  const goToRegister = () => setActiveTab("Invoice Register");

  return (
    <div className="min-h-full bg-[#f7f7f8] p-4 text-slate-900">
      <div className="mx-auto max-w-[1480px] space-y-5">
        {/* Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-normal text-slate-900">Vendor Payment</h1>
            <p className="mt-1.5 text-base font-medium text-slate-500">
              Manage vendor invoices, payment requests, approvals, and accounting ledger
            </p>
          </div>
        </header>

        {/* Tab bar */}
        <div className="inline-flex flex-wrap rounded-lg bg-slate-100/80 p-1 shadow-sm gap-0.5">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={[
                "h-9 rounded-md px-4 text-sm font-medium transition-colors whitespace-nowrap",
                activeTab === tab ? "bg-white text-slate-900 shadow-sm font-semibold" : "text-slate-500 hover:text-slate-800",
              ].join(" ")}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "Invoice Register" && <InvoiceRegisterView onOpen={handleOpen} />}
        {activeTab === "Payment Requests" && <PaymentRequestsView selectedInvoice={selectedInvoice} onClear={() => setSelectedInvoice(null)} onGoToRegister={goToRegister} />}
        {activeTab === "Approvals" && <ApprovalsView selectedInvoice={selectedInvoice} onClear={() => setSelectedInvoice(null)} onGoToRegister={goToRegister} />}
        {activeTab === "Payments" && <PaymentsView selectedInvoice={selectedInvoice} onClear={() => setSelectedInvoice(null)} onGoToRegister={goToRegister} />}
        {activeTab === "Vendor Ledger" && <VendorLedgerView selectedInvoice={selectedInvoice} onClear={() => setSelectedInvoice(null)} onGoToRegister={goToRegister} />}
        {activeTab === "Accounting Ledger" && <AccountingLedgerView selectedInvoice={selectedInvoice} onClear={() => setSelectedInvoice(null)} onGoToRegister={goToRegister} />}
        {activeTab === "TDS" && <TDSView />}
        {activeTab === "Documents" && <DocumentsView />}
        {activeTab === "Reports" && <ReportsView />}
      </div>

    </div>
  );
}

// ── Tab: Invoice Register (live API) ─────────────────────────────────────────

const InvoiceRegisterView = ({ onOpen }: { onOpen: (item: InvoicePayment, tab: VendorTab) => void }) => {
  const [items, setItems] = useState<InvoicePayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        if (!baseUrl) throw new Error("API base URL is not set");
        const res = await fetch(`${baseUrl}/admin_accounts/get_payment_flow`, {
          headers: { Accept: "application/json" },
          signal: ac.signal,
        });
        const data: any = await res.json().catch(() => null);
        if (!res.ok || !data?.success)
          throw new Error(data?.message || `Failed to load invoices (HTTP ${res.status})`);
        setItems(Array.isArray(data?.data) ? data.data : []);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError(e?.message || "Failed to load invoice payments");
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => ac.abort();
  }, []);

  const filtered = items.filter((item) => {
    const q = search.toLowerCase();
    return (
      safeStr(item.order_number).toLowerCase().includes(q) ||
      safeStr(item.vendor_name).toLowerCase().includes(q) ||
      safeStr(item.invoice_type).toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Invoice Register</h2>
            <p className="text-sm font-medium text-slate-500 mt-0.5">Incoming invoices forwarded from purchase flows</p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendor, order..."
              className="h-9 w-64 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-slate-300"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading invoices…</div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-red-500">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            {items.length === 0 ? "No invoices received yet." : "No results match your search."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500">
                  <th className="px-4 py-3">Invoice Document</th>
                  <th className="px-4 py-3">Order Number</th>
                  <th className="px-4 py-3">Vendor Name</th>
                  <th className="px-4 py-3">Created At</th>
                  <th className="px-4 py-3">Approval Status</th>
                  <th className="px-4 py-3">Payment Status</th>
                  <th className="px-4 py-3">PRR Document</th>
                  <th className="px-4 py-3">Payment Data</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const adminKey    = safeStr(item.admin_ops_approval_status).toLowerCase();
                  const directorKey = safeStr(item.director_approval_status).toLowerCase();
                  const paymentDone = item.payment_completed === true;

                  return (
                    <Fragment key={item.payment_id ?? idx}>
                    <tr className="border-b-0 text-sm hover:bg-blue-50/30">
                      {/* Invoice Document */}
                      <td className="px-4 py-4">
                        {item.invoice_doc_url ? (
                          <a
                            href={item.invoice_doc_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 font-extrabold text-blue-600 hover:text-blue-700"
                          >
                            <FileText className="h-4 w-4 shrink-0" />
                            <span>{safeStr(item.invoice_type) || "View Doc"}</span>
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Order Number */}
                      <td className="whitespace-nowrap px-4 py-4 font-semibold text-slate-800">
                        {safeStr(item.order_number) || "—"}
                      </td>

                      {/* Vendor Name */}
                      <td className="whitespace-nowrap px-4 py-4 font-extrabold text-slate-800">
                        {safeStr(item.vendor_name) || "—"}
                      </td>

                      {/* Created At */}
                      <td className="whitespace-nowrap px-4 py-4 text-xs font-semibold text-slate-500">
                        {formatDate(item.created_at)}
                      </td>

                      {/* Approval Status */}
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold capitalize ${approvalBadge[adminKey] ?? "bg-slate-100 text-slate-600"}`}>
                            Ops: {item.admin_ops_approval_status || "—"}
                          </span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold capitalize ${approvalBadge[directorKey] ?? "bg-slate-100 text-slate-600"}`}>
                            Dir: {item.director_approval_status || "—"}
                          </span>
                        </div>
                      </td>

                      {/* Payment Status */}
                      <td className="whitespace-nowrap px-4 py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${paymentDone ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                          {paymentDone ? "Completed" : "Pending"}
                        </span>
                      </td>

                      {/* PRR Document */}
                      <td className="px-4 py-4">
                        {item.prr_url ? (
                          <a
                            href={item.prr_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 font-extrabold text-blue-600 hover:text-blue-700"
                          >
                            <FileText className="h-4 w-4 shrink-0" />
                            <span>View PRR</span>
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Payment Data */}
                      <td className="px-4 py-4 text-xs font-semibold text-slate-500">
                        {renderPaymentData(item.payment_completion_metadata) !== "—"
                          ? renderPaymentData(item.payment_completion_metadata)
                          : renderPaymentData(item.payment_request_dict)}
                      </td>

                      {/* Action */}
                      <td className="whitespace-nowrap px-4 py-4">
                        <ActionCell item={item} onOpen={onOpen} />
                      </td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td colSpan={9} className="px-4 pb-2.5 pt-0 bg-slate-50/60">
                        <PaymentProgressBar item={item} />
                      </td>
                    </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

// ── Invoice context shared type + banners ────────────────────────────────────

type InvoiceCtxProps = {
  selectedInvoice: InvoicePayment | null;
  onClear: () => void;
  onGoToRegister: () => void;
};

const NoInvoiceSelectedBanner = ({ onGoToRegister }: { onGoToRegister: () => void }) => (
  <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white py-20 text-center">
    <FileText className="mb-3 h-10 w-10 text-slate-300" />
    <p className="text-base font-extrabold text-slate-600">Select an invoice to work in this tab</p>
    <p className="mt-1 text-sm font-medium text-slate-400">Go to Invoice Register and click the action button on a row</p>
    <button
      type="button"
      onClick={onGoToRegister}
      className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold hover:bg-slate-50"
    >
      <ArrowLeft className="h-4 w-4" />
      Go to Invoice Register
    </button>
  </div>
);

const SelectedInvoiceBanner = ({ invoice, onClear }: { invoice: InvoicePayment; onClear: () => void }) => (
  <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100">
        <FileText className="h-5 w-5 text-blue-600" />
      </div>
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-blue-400">Working on Invoice</p>
        <p className="text-sm font-extrabold text-blue-800">
          {safeStr(invoice.vendor_name) || "—"}
          <span className="mx-1.5 font-semibold text-blue-400">·</span>
          {safeStr(invoice.order_number) || "—"}
          {invoice.invoice_type && (
            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-extrabold text-blue-600">
              {invoice.invoice_type}
            </span>
          )}
        </p>
      </div>
    </div>
    <button type="button" onClick={onClear} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-blue-400 hover:bg-blue-100">
      <X className="h-4 w-4" />
    </button>
  </div>
);

// ── Tab: Payment Requests ─────────────────────────────────────────────────────

const PaymentRequestsView = ({ selectedInvoice, onClear, onGoToRegister }: InvoiceCtxProps) => {
  if (!selectedInvoice) return <NoInvoiceSelectedBanner onGoToRegister={onGoToRegister} />;
  return (
  <div className="space-y-4">
    <SelectedInvoiceBanner invoice={selectedInvoice} onClear={onClear} />
    <CreateVendorPaymentRequestView />
  </div>
  );
};

// ── Tab: Approvals ────────────────────────────────────────────────────────────

const ApprovalsView = ({ selectedInvoice, onClear, onGoToRegister }: InvoiceCtxProps) => {
  if (!selectedInvoice) return <NoInvoiceSelectedBanner onGoToRegister={onGoToRegister} />;
  return (
  <div className="space-y-5">
    <SelectedInvoiceBanner invoice={selectedInvoice} onClear={onClear} />
    <div>
      <h2 className="text-2xl font-extrabold text-slate-900">Approvals</h2>
      <p className="text-sm font-medium text-slate-500 mt-1">Payment requests pending your review and sign-off</p>
    </div>

    {approvalQueue.map((req) => (
      <section key={req.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-3">
              <span className="text-base font-extrabold text-blue-600">{req.id}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${req.urgency === "High" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                {req.urgency} Priority
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <InfoLine label="Vendor" value={req.vendor} />
              <InfoLine label="Invoice" value={req.invoice} />
              <InfoLine label="Net Payable" value={req.amount} valueClass="text-orange-600 text-lg" />
              <InfoLine label="Approval Level" value={req.level} />
              <InfoLine label="Requested By" value={req.requestedBy} />
              <InfoLine label="Request Date" value={req.requestDate} />
            </div>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {[
                { label: "Purchase Manager", done: true },
                { label: "Finance Manager", done: req.level !== "Finance Manager" && req.level !== "Director" },
                { label: "Director", done: false },
              ].map(({ label, done }, i) => (
                <div key={label} className="flex items-center gap-2">
                  {i > 0 && <div className="h-px w-8 border-t border-dashed border-slate-300" />}
                  <div className="flex items-center gap-1.5">
                    {done
                      ? <CheckCircle className="h-5 w-5 text-emerald-600" />
                      : <Clock className="h-5 w-5 text-orange-500" />}
                    <span className={`text-xs font-extrabold ${done ? "text-emerald-700" : "text-orange-600"}`}>{label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 min-w-[180px]">
            <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-extrabold text-white hover:bg-emerald-700">
              <CheckCircle className="h-4 w-4" />
              Approve
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-200 text-sm font-extrabold text-red-600 hover:bg-red-50">
              <XCircle className="h-4 w-4" />
              Reject
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 text-sm font-extrabold text-slate-600 hover:bg-slate-50">
              <Eye className="h-4 w-4" />
              View Details
            </button>
          </div>
        </div>
      </section>
    ))}

    {approvalQueue.length === 0 && (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <CheckCircle className="h-10 w-10 mb-2" />
        <p className="text-sm font-semibold">No pending approvals</p>
      </div>
    )}
  </div>
  );
};

// ── Tab: Payments (Schedule) ──────────────────────────────────────────────────

const PaymentsView = ({ selectedInvoice, onClear, onGoToRegister }: InvoiceCtxProps) => {
  if (!selectedInvoice) return <NoInvoiceSelectedBanner onGoToRegister={onGoToRegister} />;
  return (
  <div className="space-y-4">
    <SelectedInvoiceBanner invoice={selectedInvoice} onClear={onClear} />
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-2xl font-extrabold tracking-normal text-slate-900">Payment Schedule</h2>
        <p className="mt-1.5 text-base font-medium text-slate-500">
          Upcoming vendor dues, invoice payment dates, and payable status
        </p>
      </div>
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-slate-300"
          placeholder="Search vendor or invoice..."
        />
      </div>
    </div>

    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 text-xs font-extrabold text-slate-500">
            <th className="px-4 py-3">Vendor</th>
            <th className="px-4 py-3">Invoice</th>
            <th className="px-4 py-3">PO / WO</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Due Date</th>
            <th className="px-4 py-3">Payable</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {scheduleRows.map((row) => (
            <tr key={row.invoice} className="border-b border-slate-100 text-sm text-slate-800 last:border-b-0 hover:bg-slate-50">
              <td className="whitespace-nowrap px-4 py-4 font-extrabold">{row.vendor}</td>
              <td className="whitespace-nowrap px-4 py-4 font-extrabold text-blue-600">{row.invoice}</td>
              <td className="whitespace-nowrap px-4 py-4 font-semibold">{row.po}</td>
              <td className="whitespace-nowrap px-4 py-4 font-semibold">{row.category}</td>
              <td className="whitespace-nowrap px-4 py-4 font-semibold text-blue-600">{row.dueDate}</td>
              <td className="whitespace-nowrap px-4 py-4 font-extrabold text-orange-600">{row.amount}</td>
              <td className="whitespace-nowrap px-4 py-4">
                <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${row.status === "Due Soon" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                  {row.status}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-4">
                <button type="button" className="inline-flex h-8 items-center rounded-md border border-slate-200 px-3 text-xs font-extrabold hover:bg-slate-50">
                  Create Request
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
  </div>
  );
};

// ── Tab: Vendor Ledger ────────────────────────────────────────────────────────

const VendorLedgerView = ({ selectedInvoice, onClear, onGoToRegister }: InvoiceCtxProps) => {
  const [selectedEntry, setSelectedEntry] = useState<VendorLedgerRow | null>(null);

  if (!selectedInvoice) return <NoInvoiceSelectedBanner onGoToRegister={onGoToRegister} />;
  return (
    <div className="space-y-5">
      <SelectedInvoiceBanner invoice={selectedInvoice} onClear={onClear} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-3xl font-extrabold tracking-normal text-slate-900">Vendor Ledger</h2>
          <p className="mt-1.5 text-base font-medium text-slate-500">Complete accounting ledger for vendor payable</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select className="h-10 min-w-[240px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold shadow-sm outline-none">
            <option>{vendor.name}</option>
            <option>All Vendors</option>
            <option>Green Seeds Traders</option>
          </select>
          <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-extrabold shadow-sm hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
            Back to Vendors
          </button>
          <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-extrabold shadow-sm hover:bg-slate-50">
            <Download className="h-4 w-4" />
            Export Excel
          </button>
        </div>
      </div>

      <VendorSummaryCard />

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500">
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Voucher No.</th>
                <th className="px-3 py-3">Particulars / Narration</th>
                <th className="px-3 py-3">Ref. / Description</th>
                <th className="px-3 py-3">Debit (Dr)</th>
                <th className="px-3 py-3">Credit (Cr)</th>
                <th className="px-3 py-3">Running Balance</th>
                <th className="px-3 py-3">Balance Type</th>
                <th className="px-3 py-3">Mode</th>
              </tr>
            </thead>
            <tbody>
              {vendorLedgerRows.map((row) => {
                const [date, voucher, particulars, ref, debit, credit, balance, balanceType, mode] = row;
                return (
                  <tr
                    key={`${date}-${voucher}`}
                    onClick={() => setSelectedEntry(row)}
                    className="cursor-pointer border-b border-slate-200 text-sm text-slate-800 transition-colors last:border-b-0 hover:bg-blue-50/40"
                  >
                    <td className="whitespace-nowrap px-3 py-3 font-semibold">{date}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-extrabold text-blue-600">{voucher}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-extrabold">{particulars}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold">{ref}</td>
                    <td className={`whitespace-nowrap px-3 py-3 font-extrabold ${debit !== "-" ? "text-emerald-600" : ""}`}>{debit}</td>
                    <td className={`whitespace-nowrap px-3 py-3 font-extrabold ${credit !== "-" ? "text-red-500" : ""}`}>{credit}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-extrabold text-red-500">{balance}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-extrabold text-red-500">{balanceType}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-extrabold">{mode}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-5 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3 text-sm font-extrabold">
            <p><span className="text-emerald-600">Dr (Debit)</span><span className="text-slate-700"> = Amount paid by SBR to Vendor</span></p>
            <p><span className="text-red-500">Cr (Credit)</span><span className="text-slate-700"> = Amount payable by SBR to Vendor (Liability)</span></p>
          </div>
          <div className="rounded-lg bg-slate-100 px-8 py-5 text-center">
            <p className="text-sm font-extrabold text-slate-500">Closing Outstanding (Payable to Vendor)</p>
            <p className="mt-2 text-3xl font-extrabold tracking-normal text-red-500">₹3,00,000 Cr</p>
            <p className="mt-1 text-xs font-extrabold text-slate-500">As on 15 Jan 2026</p>
          </div>
        </div>
      </section>

      <VendorLedgerEntryModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </div>
  );
};

// ── Tab: Accounting Ledger ────────────────────────────────────────────────────

const AccountingLedgerView = ({ selectedInvoice, onClear, onGoToRegister }: InvoiceCtxProps) => {
  if (!selectedInvoice) return <NoInvoiceSelectedBanner onGoToRegister={onGoToRegister} />;
  return (
  <div className="space-y-4">
    <SelectedInvoiceBanner invoice={selectedInvoice} onClear={onClear} />
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900">Accounting Ledger</h2>
        <p className="text-sm font-medium text-slate-500 mt-1">
          Double-entry GL postings linked to vendor transactions — Purchase A/c, AP A/c, GST A/c, Bank A/c
        </p>
      </div>
      <div className="flex items-center gap-3">
        <select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold shadow-sm outline-none">
          <option>All Accounts</option>
          <option>Purchase A/c</option>
          <option>Accounts Payable A/c</option>
          <option>Input GST A/c</option>
          <option>Bank A/c</option>
        </select>
        <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold shadow-sm hover:bg-slate-50">
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>
    </div>

    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Voucher No.</th>
              <th className="px-4 py-3">Account Name (GL)</th>
              <th className="px-4 py-3">Narration</th>
              <th className="px-4 py-3 text-right">Debit (Dr)</th>
              <th className="px-4 py-3 text-right">Credit (Cr)</th>
            </tr>
          </thead>
          <tbody>
            {accountingLedgerRows.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 text-sm last:border-b-0 hover:bg-blue-50/30">
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{row.date}</td>
                <td className="whitespace-nowrap px-4 py-3 font-extrabold text-blue-600">{row.jv}</td>
                <td className="whitespace-nowrap px-4 py-3 font-extrabold text-slate-800">{row.account}</td>
                <td className="px-4 py-3 font-semibold text-slate-600 max-w-[260px]">{row.narration}</td>
                <td className={`whitespace-nowrap px-4 py-3 text-right font-extrabold ${row.dr !== "-" ? "text-emerald-600" : "text-slate-400"}`}>{row.dr}</td>
                <td className={`whitespace-nowrap px-4 py-3 text-right font-extrabold ${row.cr !== "-" ? "text-red-500" : "text-slate-400"}`}>{row.cr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-4">
        <p className="text-xs font-semibold text-slate-500">
          Showing GL entries for <span className="font-extrabold text-slate-800">Agro Diesel Supplies</span> — INV-VEN-2026-088
        </p>
        <div className="flex gap-8 text-sm">
          <span className="font-semibold text-slate-500">Total Dr: <span className="font-extrabold text-emerald-600">₹6,66,400</span></span>
          <span className="font-semibold text-slate-500">Total Cr: <span className="font-extrabold text-red-500">₹6,66,400</span></span>
        </div>
      </div>
    </section>
  </div>
  );
};

// ── Tab: TDS ──────────────────────────────────────────────────────────────────

const TDSView = () => (
  <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900">TDS (Tax Deducted at Source)</h2>
        <p className="text-sm font-medium text-slate-500 mt-1">
          TDS deductions under Section 194C · Challan status · 26Q filing
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold shadow-sm hover:bg-slate-50">
          <Printer className="h-4 w-4" />
          Print 26Q
        </button>
        <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold shadow-sm hover:bg-slate-50">
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {[
        { label: "Total TDS Deducted (FY26)", value: "₹13,800", sub: "Across all vendors", color: "text-orange-600" },
        { label: "TDS Deposited", value: "₹13,800", sub: "Challan filed to TRACES", color: "text-emerald-600" },
        { label: "TDS Pending Deposit", value: "₹4,500", sub: "To be filed before 7th Feb", color: "text-red-500" },
      ].map(({ label, value, sub, color }) => (
        <article key={label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className={`mt-2 text-2xl font-extrabold ${color}`}>{value}</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-400">{sub}</p>
        </article>
      ))}
    </div>

    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-base font-extrabold text-slate-900">TDS Register</h3>
        <p className="text-xs font-medium text-slate-500 mt-0.5">TAN: PNEA12345B · SaiBioresources Private Limited</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1060px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500">
              <th className="px-4 py-3">Challan No.</th>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Section</th>
              <th className="px-4 py-3 text-right">Invoice Amt</th>
              <th className="px-4 py-3 text-right">TDS Rate</th>
              <th className="px-4 py-3 text-right">TDS Amount</th>
              <th className="px-4 py-3">Deducted On</th>
              <th className="px-4 py-3">Deposited On</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {tdsRows.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 text-sm last:border-b-0 hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 font-extrabold text-blue-600">{row.challanNo}</td>
                <td className="whitespace-nowrap px-4 py-3 font-extrabold text-slate-800">{row.vendor}</td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-blue-600">{row.invoice}</td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold">{row.tdsSection}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-extrabold text-orange-600">{row.invoiceAmt}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{row.tdsRate}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-extrabold text-slate-800">{row.tdsAmt}</td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{row.deductedOn}</td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{row.depositedOn}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${row.status === "Deposited" ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  </div>
);

// ── Tab: Documents ────────────────────────────────────────────────────────────

const DocumentsView = () => {
  const [search, setSearch] = useState("");
  const filtered = allDocuments.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.vendor.toLowerCase().includes(search.toLowerCase()) ||
      d.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">Documents</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Invoices, purchase orders, GRN receipts, and bank details
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents..."
              className="h-9 w-56 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-slate-300"
            />
          </div>
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#173f70] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#12345e]">
            <Upload className="h-4 w-4" />
            Upload Document
          </button>
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500">
                <th className="px-4 py-3">Document Name</th>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Uploaded On</th>
                <th className="px-4 py-3">Linked To</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc) => (
                <tr key={doc.name} className="border-b border-slate-100 text-sm last:border-b-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <FileText className="h-5 w-5 shrink-0 text-red-500" />
                      <span className="font-semibold text-slate-800 max-w-[260px] truncate">{doc.name}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">{doc.vendor}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${docTypeColors[doc.type] ?? "bg-slate-100 text-slate-700"}`}>
                      {doc.type}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-500">{doc.size}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{doc.date}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-blue-600">{doc.linkedTo}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-blue-600 hover:bg-blue-50">
                        <Eye className="h-4 w-4" />
                      </button>
                      <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-blue-600 hover:bg-blue-50">
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

// ── Tab: Reports ──────────────────────────────────────────────────────────────

const ReportsView = () => (
  <div className="space-y-5">
    <div>
      <h2 className="text-2xl font-extrabold text-slate-900">Reports</h2>
      <p className="text-sm font-medium text-slate-500 mt-1">Vendor payment analytics, ageing, and compliance reports</p>
    </div>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {reportTypes.map(({ title, desc, icon: Icon, color, bg }) => (
        <button
          key={title}
          type="button"
          className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300 hover:bg-slate-50 text-left transition-colors"
        >
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${bg}`}>
            <Icon className={`h-6 w-6 ${color}`} />
          </div>
          <div>
            <p className="text-sm font-extrabold text-slate-900">{title}</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{desc}</p>
          </div>
          <Download className="ml-auto h-4 w-4 shrink-0 text-slate-400" />
        </button>
      ))}
    </div>

    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-900">Vendor Ageing Report</h3>
          <p className="text-xs font-medium text-slate-500 mt-0.5">Outstanding payables bucketed by overdue days · As on 05 Jun 2026</p>
        </div>
        <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold hover:bg-slate-50">
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500">
              <th className="px-5 py-3">Vendor</th>
              <th className="px-5 py-3 text-right">Current (0–30d)</th>
              <th className="px-5 py-3 text-right">31–60 Days</th>
              <th className="px-5 py-3 text-right">61–90 Days</th>
              <th className="px-5 py-3 text-right">90+ Days</th>
              <th className="px-5 py-3 text-right">Total Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {ageingData.map((row) => (
              <tr key={row.vendor} className="border-b border-slate-100 text-sm last:border-b-0 hover:bg-slate-50">
                <td className="whitespace-nowrap px-5 py-3 font-extrabold text-slate-800">{row.vendor}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right font-extrabold text-orange-600">{row.current}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-slate-500">{row.d30}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-slate-500">{row.d60}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-slate-500">{row.d90}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right font-extrabold text-slate-900">{row.total}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 text-sm font-extrabold">
              <td className="px-5 py-3 text-slate-800">Total</td>
              <td className="px-5 py-3 text-right text-orange-600">₹6,70,000</td>
              <td className="px-5 py-3 text-right text-slate-500">-</td>
              <td className="px-5 py-3 text-right text-slate-500">-</td>
              <td className="px-5 py-3 text-right text-slate-500">-</td>
              <td className="px-5 py-3 text-right text-slate-900">₹6,70,000</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  </div>
);

// ── Shared Sub-components ─────────────────────────────────────────────────────

const CreateVendorPaymentRequestView = () => (
  <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-2xl font-extrabold tracking-normal text-slate-900">Create Vendor Payment Request</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Enter invoice details, deductions, bank details, and supporting documents
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-extrabold shadow-sm hover:bg-slate-50">
          <Save className="h-4 w-4" />
          Save as Draft
        </button>
        <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-extrabold text-white shadow-sm hover:bg-emerald-700">
          <Send className="h-4 w-4" />
          Submit for Approval
        </button>
      </div>
    </div>

    <VendorSummaryCard />

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.7fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-extrabold text-slate-900">Payment Request Information</h3>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <RequestInput label="Invoice Number" value={vendor.invoice} required />
          <RequestInput label="Payment Request Date" value="16 Jan 2026" required />
          <RequestInput label="Invoice Date" value={vendor.invoiceDate} required />
          <RequestSelect label="Payment For" value="Fuel supply invoice" options={["Fuel supply invoice", "Seeds purchase", "Machinery service"]} required />
          <RequestInput label="Invoice Amount" value={vendor.invoiceAmount} required />
          <RequestSelect label="Payment Mode" value="NEFT" options={["NEFT", "RTGS", "Cheque", "UPI"]} required />
          <div className="grid grid-cols-2 gap-3">
            <RequestSelect label="GST Applicable" value="Yes" options={["Yes", "No"]} />
            <RequestSelect label="TDS Applicable" value="Yes (2%)" options={["Yes (2%)", "Yes (10%)", "No"]} />
          </div>
          <RequestSelect label="Bank Account" value={vendor.bank} options={[vendor.bank, "HDFC - Current A/c (9876543210)"]} required />
          <RequestInput label="TDS Amount" value="₹9,600" />
          <RequestInput label="Due Date" value={vendor.dueDate} />
          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-emerald-600">Net Payable Amount</label>
            <input defaultValue="₹4,70,400" className="h-10 w-full rounded-md border border-emerald-100 bg-emerald-50 px-3 text-sm font-extrabold text-emerald-600 outline-none" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-slate-500">Remarks</label>
            <textarea
              defaultValue="Payment against diesel supply invoice after TDS deduction."
              maxLength={250}
              className="min-h-20 w-full resize-none rounded-md border border-slate-200 p-3 text-sm font-semibold text-slate-800 outline-none focus:border-slate-300"
            />
            <p className="text-xs font-semibold text-slate-500">61 / 250</p>
          </div>
        </div>
      </section>

      <VendorDocumentsPanel />
    </div>

    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-extrabold text-slate-900">Payment Summary</h3>
      <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-center">
        <SummaryBox label="Invoice Amount" value="₹4,80,000" />
        <span className="text-xl font-extrabold text-slate-500">-</span>
        <SummaryBox label="TDS Amount" value="₹9,600" />
        <span className="text-xl font-extrabold text-slate-500">=</span>
        <SummaryBox label="Net Payable Amount" value="₹4,70,400" valueClass="text-emerald-600" />
        <span className="text-xl font-extrabold text-slate-500">→</span>
        <div className="min-w-[360px] rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-extrabold text-slate-500">Amount in Words</p>
          <p className="mt-2 text-sm font-extrabold text-slate-900">Four Lakh Seventy Thousand Four Hundred Rupees Only</p>
        </div>
      </div>
    </section>
  </div>
);

const VendorSummaryCard = () => (
  <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(240px,0.9fr)_minmax(260px,1fr)_minmax(240px,0.9fr)]">
        <div className="flex min-w-0 items-center gap-4 border-slate-200 xl:border-r xl:pr-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <Truck className="h-9 w-9" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-500">Vendor Name</p>
            <p className="mt-2 text-xl font-extrabold text-slate-900">{vendor.name}</p>
            <div className="my-4 h-px bg-slate-200" />
            <p className="text-sm font-semibold text-slate-500">Vendor Code</p>
            <p className="mt-2 break-words text-lg font-extrabold text-blue-600">{vendor.code}</p>
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-4 border-slate-200 md:grid-cols-3 xl:grid-cols-1 xl:border-r xl:px-5">
          <InfoLine label="Category" value={vendor.category} />
          <InfoLine label="PO / WO" value={vendor.po} />
          <InfoLine label="GSTIN" value={vendor.gstin} />
        </div>
        <div className="min-w-0 space-y-4">
          <InfoLine label="Invoice Amount" value={vendor.invoiceAmount} valueClass="text-emerald-600 text-2xl" />
          <InfoLine label="Payment Mode" value={vendor.paymentMode} />
          <InfoLine label="Due Date" value={vendor.dueDate} valueClass="text-blue-600" />
        </div>
      </div>
    </div>

    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-extrabold text-blue-600">Vendor Summary</h3>
      {[
        ["Invoice Amount", vendor.invoiceAmount, "text-slate-900"],
        ["Paid Till Date", vendor.paidTillDate, "text-emerald-600"],
        ["Outstanding Amount", vendor.outstanding, "text-red-500"],
        ["Next Due Date", vendor.dueDate, "text-blue-600"],
      ].map(([label, value, valueClass]) => (
        <div key={label} className="flex items-center justify-between border-b border-slate-200 py-3 text-sm">
          <span className="font-semibold text-slate-800">{label}</span>
          <span className={`font-extrabold ${valueClass}`}>{value}</span>
        </div>
      ))}
      <div className="flex items-center justify-between py-3 text-sm">
        <span className="font-semibold text-slate-800">Status</span>
        <span className="rounded-md bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-700">{vendor.status}</span>
      </div>
    </div>
  </section>
);

const VendorDocumentsPanel = () => {
  const docs = [
    ["Vendor_Invoice_INV-VEN-2026-088.pdf", "540 KB", "Uploaded on 10 Jan 2026"],
    ["Purchase_Order_PO-2026-014.pdf", "310 KB", "Uploaded on 08 Jan 2026"],
    ["GRN_Receipt_GRN-2026-025.pdf", "420 KB", "Uploaded on 12 Jan 2026"],
    ["Vendor_Bank_Details.pdf", "180 KB", "Uploaded on 03 Jan 2026"],
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-extrabold text-slate-900">Supporting Documents</h3>
        <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-extrabold hover:bg-slate-50">
          <Download className="h-4 w-4" />
          Upload More
        </button>
      </div>
      <div className="mt-5 space-y-3">
        {docs.map(([name, size, uploaded]) => (
          <div key={name} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
            <FileText className="h-6 w-6 text-red-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-slate-800">{name}</p>
              <p className="text-xs font-semibold text-slate-500">{size} • {uploaded}</p>
            </div>
            <button className="inline-flex h-8 w-8 items-center justify-center rounded-md text-blue-600 hover:bg-blue-50"><Eye className="h-4 w-4" /></button>
            <button className="inline-flex h-8 w-8 items-center justify-center rounded-md text-blue-600 hover:bg-blue-50"><Download className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </section>
  );
};


const VendorLedgerEntryModal = ({ entry, onClose }: { entry: VendorLedgerRow | null; onClose: () => void }) => {
  if (!entry) return null;
  const [date, voucher, particulars, ref, debit, credit, balance, balanceType, mode] = entry;
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-2xl font-extrabold text-slate-900">Vendor Ledger Entry Details</h2>
          <button onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid max-h-[70vh] overflow-y-auto lg:grid-cols-2">
          <div className="space-y-5 border-slate-200 p-6 lg:border-r">
            <DetailSection title="Entry Information">
              <DetailLine label="Date" value={date} />
              <DetailLine label="Voucher No." value={voucher} valueClass="text-blue-600" />
              <DetailLine label="Entry Type" value={particulars} />
              <DetailLine label="Ref. / Description" value={ref} />
              <DetailLine label="Mode of Payment" value={mode} />
              <DetailLine label="Bank Account" value={vendor.bank} />
            </DetailSection>
            <DetailSection title="Amount Details">
              <DetailLine label="Debit (Dr)" value={debit} valueClass={debit !== "-" ? "text-emerald-600" : ""} />
              <DetailLine label="Credit (Cr)" value={credit} valueClass={credit !== "-" ? "text-red-500" : ""} />
              <DetailLine label="Running Balance" value={balance} valueClass="text-red-500" />
              <DetailLine label="Balance Type" value={`${balanceType} (Credit)`} valueClass="text-red-500" />
            </DetailSection>
          </div>
          <div className="space-y-5 p-6">
            <DetailSection title="Approval Trail" noBorder>
              {["Purchase Manager", "Finance Manager", "Director"].map((role) => (
                <div key={role} className="mb-4 flex items-center gap-3">
                  <CheckCircle className="h-6 w-6 fill-emerald-600 text-white" />
                  <div>
                    <p className="text-sm font-extrabold text-slate-800">{role}</p>
                    <p className="text-xs font-semibold text-slate-500">Approved</p>
                  </div>
                </div>
              ))}
            </DetailSection>
          </div>
        </div>
        <div className="flex justify-end border-t border-slate-200 px-6 py-4">
          <button onClick={onClose} className="h-10 rounded-lg border border-slate-200 px-5 text-sm font-semibold hover:bg-slate-50">Close</button>
        </div>
      </div>
    </div>
  );
};

// ── Payment Progress Bar ──────────────────────────────────────────────────────

function isNonEmpty(v: unknown): boolean {
  if (!v) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

function getMilestoneStatuses(item: InvoicePayment): MilestoneStatus[] {
  const admin    = safeStr(item.admin_ops_approval_status);
  const director = safeStr(item.director_approval_status);

  const s0: MilestoneStatus = item.invoice_doc_url                              ? "done" : "active";
  const s1: MilestoneStatus = isNonEmpty(item.payment_request_dict)             ? "done" : s0 === "done" ? "active" : "pending";
  const s2: MilestoneStatus = admin    === "approved_and_forwarded"             ? "done" : admin    === "rejected" ? "rejected" : s1 === "done" ? "active" : "pending";
  const s3: MilestoneStatus = director === "approved_and_forwarded"             ? "done" : director === "rejected" ? "rejected" : s2 === "done" ? "active" : "pending";
  const s4: MilestoneStatus = !!item.prr_url                                    ? "done" : s3 === "done" ? "active" : "pending";
  const s5: MilestoneStatus = isNonEmpty(item.payment_completion_metadata)      ? "done" : s4 === "done" ? "active" : "pending";
  const s6: MilestoneStatus = isNonEmpty(item.payment_completion_metadata)      ? "done" : "pending";

  return [s0, s1, s2, s3, s4, s5, s6];
}

const PROGRESS_STEPS = [
  "Invoice Received",
  "Payment Request",
  "Ops Approval",
  "Director Approval",
  "PRR",
  "Payment Confirm.",
  "Ledger Entry",
] as const;

const STEP_ACTIONS: { label: string; btnClass: string; tab: VendorTab | null }[] = [
  { label: "Upload Invoice",   btnClass: "border-blue-200 text-blue-600 hover:bg-blue-50",       tab: null },
  { label: "Create PR",        btnClass: "border-blue-200 text-blue-600 hover:bg-blue-50",       tab: "Payment Requests" },
  { label: "Submit for Ops",   btnClass: "border-orange-200 text-orange-600 hover:bg-orange-50", tab: "Approvals" },
  { label: "Submit for Dir.",  btnClass: "border-orange-200 text-orange-600 hover:bg-orange-50", tab: "Approvals" },
  { label: "Upload PRR",       btnClass: "border-indigo-200 text-indigo-600 hover:bg-indigo-50", tab: null },
  { label: "Confirm Payment",  btnClass: "border-emerald-200 text-emerald-700 hover:bg-emerald-50", tab: "Payments" },
  { label: "Post Ledger",      btnClass: "border-emerald-200 text-emerald-700 hover:bg-emerald-50", tab: "Accounting Ledger" },
];

const ActionCell = ({
  item,
  onOpen,
}: {
  item: InvoicePayment;
  onOpen: (item: InvoicePayment, tab: VendorTab) => void;
}) => {
  const statuses  = getMilestoneStatuses(item);
  const allDone   = statuses.every((s) => s === "done");
  const rejIdx    = statuses.findIndex((s) => s === "rejected");
  const activeIdx = statuses.findIndex((s) => s === "active");

  if (allDone) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700">
        <CheckCircle className="h-3 w-3" />
        Completed
      </span>
    );
  }
  if (rejIdx !== -1) {
    return (
      <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 px-3 text-xs font-extrabold text-red-600 hover:bg-red-50">
        <Send className="h-3 w-3" />
        Resubmit
      </button>
    );
  }
  if (activeIdx !== -1) {
    const action = STEP_ACTIONS[activeIdx];
    return (
      <button
        type="button"
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-extrabold ${action.btnClass}`}
        onClick={() => action.tab && onOpen(item, action.tab)}
      >
        <Send className="h-3 w-3" />
        {action.label}
      </button>
    );
  }
  return <span className="text-xs text-slate-400">—</span>;
};

const PaymentProgressBar = ({ item }: { item: InvoicePayment }) => {
  const statuses = getMilestoneStatuses(item);

  return (
    <div className="flex w-full items-start px-1 py-0.5">
      {PROGRESS_STEPS.map((label, i) => {
        const status  = statuses[i];
        const isLast  = i === PROGRESS_STEPS.length - 1;

        const nodeClass =
          status === "done"     ? "bg-emerald-500 text-white" :
          status === "active"   ? "bg-blue-500 text-white ring-[2.5px] ring-blue-100" :
          status === "rejected" ? "bg-red-500 text-white" :
                                  "border border-slate-300 bg-white text-slate-400";

        const labelClass =
          status === "done"     ? "text-emerald-600" :
          status === "active"   ? "font-extrabold text-blue-600" :
          status === "rejected" ? "text-red-500" :
                                  "text-slate-400";

        const lineClass = status === "done" ? "bg-emerald-300" : "bg-slate-200";

        return (
          <div key={label} className="flex flex-1 items-start min-w-0">
            <div className="flex flex-col items-center gap-[3px] shrink-0">
              <div className={`flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-extrabold leading-none ${nodeClass}`}>
                {status === "done" ? "✓" : status === "rejected" ? "✕" : String(i + 1)}
              </div>
              <span className={`text-[9px] font-semibold leading-tight whitespace-nowrap ${labelClass}`}>
                {label}
              </span>
            </div>
            {!isLast && <div className={`mt-2 h-px flex-1 mx-1.5 ${lineClass}`} />}
          </div>
        );
      })}
    </div>
  );
};

// ── Small helpers ─────────────────────────────────────────────────────────────

const RequestInput = ({ label, value, required = false }: { label: string; value: string; required?: boolean }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-extrabold text-slate-500">{label}{required ? <span className="text-red-500"> *</span> : null}</label>
    <input defaultValue={value} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-300" />
  </div>
);

const RequestSelect = ({ label, value, options, required = false }: { label: string; value: string; options: string[]; required?: boolean }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-extrabold text-slate-500">{label}{required ? <span className="text-red-500"> *</span> : null}</label>
    <select defaultValue={value} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-300">
      {options.map((option) => <option key={option}>{option}</option>)}
    </select>
  </div>
);

const SummaryBox = ({ label, value, valueClass = "text-slate-900" }: { label: string; value: string; valueClass?: string }) => (
  <div className="min-w-[160px] rounded-lg border border-slate-200 p-4">
    <p className="text-xs font-extrabold text-slate-500">{label}</p>
    <p className={`mt-2 text-lg font-extrabold ${valueClass}`}>{value}</p>
  </div>
);

const InfoLine = ({ label, value, valueClass = "text-slate-900" }: { label: string; value: string; valueClass?: string }) => (
  <div>
    <p className="text-sm font-semibold text-slate-500">{label}</p>
    <p className={`mt-1 text-sm font-extrabold ${valueClass}`}>{value}</p>
  </div>
);

const DetailSection = ({ title, children, noBorder = false }: { title: string; children: ReactNode; noBorder?: boolean }) => (
  <section className={noBorder ? "" : "border-b border-slate-200 pb-5"}>
    <h3 className="mb-4 text-base font-extrabold text-blue-600">{title}</h3>
    {children}
  </section>
);

const DetailLine = ({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) => (
  <div className="grid grid-cols-[150px_1fr] gap-4 py-2 text-sm">
    <span className="font-semibold text-slate-500">{label}</span>
    <span className={`whitespace-pre-line font-extrabold text-slate-800 ${valueClass}`}>{value}</span>
  </div>
);
