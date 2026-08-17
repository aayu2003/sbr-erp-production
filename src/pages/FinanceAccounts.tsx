import { useEffect, useRef, useState, type ElementType, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Calculator,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  FileBarChart,
  FileText,
  Eye,
  IndianRupee,
  Landmark,
  LayoutDashboard,
  Pencil,
  Plus,
  Receipt,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UploadCloud,
  FileImage,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import getBaseUrl from "@/lib/config";
import { getGrnById, type GRNRecord } from "@/lib/grnApi";
import GrnDocumentPreview from "@/components/grn/GrnDocumentPreview";
import { MakePurchaseOrderPopup } from "@/components/ho-inbox/MakePurchaseOrderPopup";
import type { ComparativeModel } from "@/components/purchase/ComparativeStatementPreview";
import logo3f from "@/Assets/3f-logo.png";

type FinanceModuleKey =
  | "bills-payables"
  | "payments-receipts"
  | "vouchers"
  | "banking"
  | "ledgers-reports"
  | "budget-costing"
  | "masters-controls";

type FinanceRecord = {
  id: string;
  module: FinanceModuleKey;
  tab: string;
  entryType: string;
  reference: string;
  party: string;
  vendorId?: string;
  date: string;
  amount: number;
  status: string;
  notes: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentUrl?: string;
  additionalDocumentUrls?: Record<string, string>;
  ledgerEntryStatus?: string;
  invoiceDate?: string;
  dueDate?: string;
  poWoReference?: string;
  department?: string;
  costCentre?: string;
  costAttribution?: string;
  project?: string;
  site?: string;
  baseAmount?: number;
  taxAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  billInwardNo?: string;
  invoiceType?: string;
  vendorGstin?: string;
  placeOfSupply?: string;
  referenceType?: string;
  grnServiceReference?: string;
  projectSiteLand?: string;
  budgetCostHead?: string;
  otherAdjustment?: number;
  tdsApplicable?: string;
  paymentTerms?: string;
  creditDays?: number;
  billPriority?: string;
  billMode?: string;
  originalBillReceived?: string;
  supportingDocumentNames?: string[];
  sourceBillId?: string;
  sourceBillInwardNo?: string;
  prrDetails?: PRRDetails;
};

type PRRDetails = {
  prrType: string;
  requestingDepartment: string;
  requestedBy: string;
  priority: string;
  impact: string;
  payeeType: string;
  vendorCode: string;
  gstin: string;
  pan: string;
  bankAccount: string;
  paymentAgainst: string;
  invoiceNumber: string;
  invoiceDate: string;
  costCentre: string;
  costAttribution: string;
  projectCluster: string;
  landSite: string;
  basicAmount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  otherCharges: number;
  grossInvoiceAmount: number;
  advanceAdjusted: number;
  noteAdjustment: number;
  retentionAmount: number;
  tdsDeduction: number;
  otherDeduction: number;
  netPayableAmount: number;
  tdsApplicable: string;
  tdsSection: string;
  tdsRate: number;
  tdsBaseAmount: number;
  tdsAmount: number;
  rcmApplicable: string;
  ledgerHead: string;
  subLedger: string;
  accountingCostCentre: string;
  budgetHead: string;
  budgetAvailable: number;
  accountingNarration: string;
  paymentMode: string;
  paymentTerms: string;
  bankAccountFrom: string;
  paymentExtent: string;
  requestedPaymentAmount: number;
  supportingDocuments: string[];
  requesterRemarks: string;
  accountsRemarks: string;
  preparedBy: string;
  checkedBy: string;
  approvedBy: string;
  financeApproval: string;
};

export type TabDefinition = {
  label: string;
  description: string;
  features: string[];
};

export type ModuleDefinition = {
  key: FinanceModuleKey;
  title: string;
  shortTitle: string;
  description: string;
  path: string;
  icon: ElementType;
  accent: string;
  tabs: TabDefinition[];
};

const STORAGE_KEY = "sbr-finance-accounts-records-v1";
const DOCUMENT_DB_NAME = "sbr-finance-accounts-documents";
const DOCUMENT_STORE_NAME = "bill-documents";

type StoredBillDocument = {
  key: string;
  recordId: string;
  role: "bill" | "supporting";
  name: string;
  type: string;
  blob: Blob;
};

const openDocumentDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DOCUMENT_DB_NAME, 1);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(DOCUMENT_STORE_NAME)) {
      const store = database.createObjectStore(DOCUMENT_STORE_NAME, { keyPath: "key" });
      store.createIndex("recordId", "recordId", { unique: false });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const loadBillDocuments = async (recordId: string) => {
  const database = await openDocumentDatabase();
  const documents = await new Promise<StoredBillDocument[]>((resolve, reject) => {
    const transaction = database.transaction(DOCUMENT_STORE_NAME, "readonly");
    const request = transaction.objectStore(DOCUMENT_STORE_NAME).index("recordId").getAll(recordId);
    request.onsuccess = () => resolve(request.result as StoredBillDocument[]);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return documents;
};

const FINANCE_MODULES: ModuleDefinition[] = [
  {
    key: "bills-payables",
    title: "Bills & Payables",
    shortTitle: "Bills & Payables",
    description: "Control the complete vendor bill lifecycle from inward receipt to passing and outstanding settlement.",
    path: "/finance-accounts/bills-payables",
    icon: Receipt,
    accent: "bg-amber-50 text-amber-700",
    tabs: [
      { label: "Inward", description: "Receive, catalogue and attach incoming bills.", features: ["Bill Inward", "Vendor Bills", "Bill Attachments"] },
      { label: "Verification", description: "Validate supporting documents, taxes and approvals.", features: ["Bill Verification", "Bill Attachments"] },
      { label: "Bills Paid", description: "Track every Bill Inward entry through final payment.", features: ["Bills Paid", "Payment Status", "Debit/Credit Notes"] },
      { label: "Outstanding", description: "Track unpaid and partially settled liabilities.", features: ["Outstanding Payables", "Bill Attachments"] },
    ],
  },
  {
    key: "payments-receipts",
    title: "Payments & Receipts",
    shortTitle: "Payments & Receipts",
    description: "Manage requests, disbursements, receipts, advances and allocation history in one workspace.",
    path: "/finance-accounts/payments-receipts",
    icon: CreditCard,
    accent: "bg-emerald-50 text-emerald-700",
    tabs: [
      { label: "Requests", description: "Raise and monitor requests before payment approval.", features: ["Payment Request / PRR", "Payment Allocation"] },
      { label: "Payments", description: "Process vendor, employee and part payments.", features: ["Vendor Payments", "Employee Payments", "Part Payments", "Payment Allocation"] },
      { label: "Receipts", description: "Record and allocate incoming funds.", features: ["Receipts", "Payment Allocation"] },
      { label: "Advances", description: "Issue, adjust and settle advances.", features: ["Advances", "Employee Payments", "Vendor Payments"] },
      { label: "History", description: "Audit every payment, receipt and allocation event.", features: ["Payment History", "Part Payments", "Payment Allocation"] },
    ],
  },
  {
    key: "vouchers",
    title: "Vouchers",
    shortTitle: "Vouchers",
    description: "Create, post, reverse and register all accounting voucher types.",
    path: "/finance-accounts/vouchers",
    icon: FileText,
    accent: "bg-blue-50 text-blue-700",
    tabs: [
      { label: "Journal", description: "Record non-cash accounting adjustments.", features: ["Journal Voucher"] },
      { label: "Bank", description: "Record payments and receipts through bank accounts.", features: ["Bank Payment Voucher", "Bank Receipt Voucher"] },
      { label: "Cash", description: "Record payments and receipts through cash accounts.", features: ["Cash Payment Voucher", "Cash Receipt Voucher"] },
      { label: "Contra", description: "Transfer balances between cash and bank accounts.", features: ["Contra Voucher"] },
      { label: "Reversal", description: "Reverse or cancel posted vouchers with an audit trail.", features: ["Reversal / Cancellation"] },
      { label: "Register", description: "Search and review the consolidated voucher register.", features: ["Journal Voucher", "Bank Vouchers", "Cash Vouchers", "Contra Voucher"] },
    ],
  },
  {
    key: "banking",
    title: "Banking",
    shortTitle: "Banking",
    description: "Maintain bank accounts, import transactions and complete reconciliation.",
    path: "/finance-accounts/banking",
    icon: Landmark,
    accent: "bg-cyan-50 text-cyan-700",
    tabs: [
      { label: "Accounts", description: "Maintain accounts and monitor the cash and bank position.", features: ["Bank Accounts", "Cash / Bank Position"] },
      { label: "Transactions", description: "Review all bank activity and unresolved entries.", features: ["Bank Transactions", "Unreconciled Transactions"] },
      { label: "Reconciliation", description: "Match book entries with imported bank transactions.", features: ["Bank Reconciliation", "Unreconciled Transactions"] },
      { label: "Statements", description: "Import and validate bank statements.", features: ["Bank Statement Import", "Bank Transactions"] },
    ],
  },
  {
    key: "ledgers-reports",
    title: "Ledgers & Reports",
    shortTitle: "Ledgers & Reports",
    description: "Access statutory books, financial statements, ageing, tax reports and MIS.",
    path: "/finance-accounts/ledgers-reports",
    icon: BookOpen,
    accent: "bg-violet-50 text-violet-700",
    tabs: [
      { label: "Ledgers", description: "Inspect account and party-level movements.", features: ["General Ledger", "Party Ledger"] },
      { label: "Books", description: "Review cash, bank and journal books.", features: ["Cash Book", "Bank Book", "Journal Register"] },
      { label: "Financials", description: "Generate core financial statements.", features: ["Trial Balance", "Profit & Loss", "Balance Sheet"] },
      { label: "Outstanding", description: "Analyse receivable and payable ageing.", features: ["Payables Ageing", "Receivables Ageing"] },
      { label: "Tax", description: "Review tax summaries and statutory reports.", features: ["Tax Reports"] },
      { label: "MIS", description: "Open management information reports and analysis.", features: ["MIS"] },
    ],
  },
  {
    key: "budget-costing",
    title: "Budget & Costing",
    shortTitle: "Budget & Costing",
    description: "Plan budgets, monitor utilisation and analyse cost across the organisation.",
    path: "/finance-accounts/budget-costing",
    icon: Calculator,
    accent: "bg-orange-50 text-orange-700",
    tabs: [
      { label: "Overview", description: "Review budgets, actuals, commitments and available balances.", features: ["Budget vs Actual", "Budget Utilisation"] },
      { label: "Budgets", description: "Create and maintain approved budgets.", features: ["Budget", "Budget vs Actual"] },
      { label: "Utilisation", description: "Track consumed, committed and available value.", features: ["Budget Utilisation", "Budget vs Actual"] },
      { label: "Commitments", description: "Monitor purchase and work commitments before actual posting.", features: ["Commitments"] },
      { label: "Cost Analysis", description: "Analyse cost by centre, project, department and site.", features: ["Cost Centres", "Project-wise Cost", "Department-wise Cost", "Land/Site-wise Cost"] },
    ],
  },
  {
    key: "masters-controls",
    title: "Masters & Controls",
    shortTitle: "Masters & Controls",
    description: "Configure accounting masters, periods, numbering, approvals and audit controls.",
    path: "/finance-accounts/masters-controls",
    icon: Settings2,
    accent: "bg-slate-100 text-slate-700",
    tabs: [
      { label: "Accounts", description: "Maintain the account hierarchy and opening balances.", features: ["Chart of Accounts", "Account Groups", "Sub Ledgers", "Opening Balances"] },
      { label: "Tax", description: "Configure tax rules and payment classifications.", features: ["TDS / Tax Masters", "Nature of Payment"] },
      { label: "Banking", description: "Maintain approved organisational banks and branches.", features: ["Bank Master"] },
      { label: "Payment", description: "Control voucher sequences and approval routing.", features: ["Voucher Numbering", "Approval Rules"] },
      { label: "Periods", description: "Maintain financial years and accounting locks.", features: ["Financial Year", "Period Locking"] },
      { label: "Audit", description: "Review configuration and transaction activity.", features: ["Audit Log"] },
    ],
  },
];

export const moduleByKey = Object.fromEntries(FINANCE_MODULES.map((module) => [module.key, module])) as Record<FinanceModuleKey, ModuleDefinition>;

const loadRecords = (): FinanceRecord[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FinanceRecord[]) : [];
  } catch {
    return [];
  }
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);

const formatRegisterDate = (value?: string) => {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
};

const financialYearShort = (date = new Date()) => {
  const startYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
};

const nextPaymentRequestNumber = (records: FinanceRecord[]) => {
  const fy = financialYearShort();
  const prefix = `PRR/${fy}/`;
  const numbers = records
    .filter((record) => record.module === "payments-receipts" && record.tab === "Requests")
    .map((record) => String(record.reference ?? ""))
    .filter((number) => number.startsWith(prefix))
    .map((number) => Number(number.slice(prefix.length)))
    .filter(Number.isFinite);
  return `${prefix}${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(3, "0")}`;
};

// Only the director-level approval has a backend endpoint to drive it (update_invoice_approval_status)
// so far — ledger posting and admin-ops approval aren't wired to any mutation yet, this only
// reflects whatever the backend already recorded for them.
const invoiceStatusLabel = (invoice: Record<string, unknown>): string => {
  const ledger = String(invoice.ledger_entery_status ?? "").toLowerCase();
  const director = String(invoice.director_approval_status ?? "").toLowerCase();
  if (["posted", "paid"].includes(ledger)) return "Paid";
  if (director === "approved") return "Verified";
  return "Pending Approval";
};

// Maps a raw admin_accounts_invoice row (as returned by GET /admin_accounts/get_invoices)
// into the FinanceRecord shape the register table/preview panels already render.
const mapInvoiceToRecord = (invoice: Record<string, unknown>): FinanceRecord => {
  const vendor = (invoice.vendor_details as Record<string, unknown>) ?? {};
  const invoiceDetails = (invoice.invoice_details as Record<string, unknown>) ?? {};
  const purchaseOrder = (invoice.purchase_order_details as Record<string, unknown>) ?? {};
  const tax = (invoice.tax_details as Record<string, unknown>) ?? {};
  const totalTax = Number(tax.total_tax_amount ?? 0);
  const totalPayable = Number(invoice.total_amount_payable ?? 0);
  const otherAdjustment = Number(tax.other_charges_or_adjustments ?? 0);
  const invoiceAmount = Number((invoiceDetails.invoice_amount as number | undefined) ?? (totalPayable - otherAdjustment));
  const orderNumber = String(purchaseOrder.order_number ?? "");
  const supportingDocs: Array<Record<string, unknown>> = Array.isArray(purchaseOrder.cupporting_documents) ? purchaseOrder.cupporting_documents : [];
  const linkedOrderDoc = supportingDocs.find((doc) => ["PO", "WO", "CONTRACT"].includes(String(doc.document_type ?? "").toUpperCase()));
  const grnWccDoc = supportingDocs.find((doc) => ["GRN", "WCC"].includes(String(doc.document_type ?? "").toUpperCase()));
  const additionalDocs: Array<Record<string, unknown>> = Array.isArray(invoice.additional_documents) ? invoice.additional_documents : [];
  const invoiceId = String(invoice.invoice_id ?? "");

  return {
    id: invoiceId,
    module: "bills-payables",
    tab: "Inward",
    entryType: "Bill Inward",
    reference: String(invoiceDetails.invoice_number ?? ""),
    party: String(vendor.vendor_name ?? ""),
    vendorId: String(vendor.vendor_id ?? ""),
    vendorGstin: String(vendor.gst_number ?? ""),
    date: String(invoiceDetails.inward_date ?? ""),
    invoiceDate: String(invoiceDetails.invoice_date ?? ""),
    dueDate: String(tax.payment_due_date ?? ""),
    amount: totalPayable,
    baseAmount: invoiceAmount - totalTax,
    taxAmount: totalTax,
    cgstAmount: Number(tax.cgst_amount ?? 0),
    sgstAmount: Number(tax.sgst_amount ?? 0),
    igstAmount: Number(tax.igst_amount ?? 0),
    otherAdjustment,
    billInwardNo: invoiceId,
    invoiceType: String(invoice.bill_type ?? ""),
    billPriority: String(invoice.bill_priority ?? "Normal"),
    referenceType: linkedOrderDoc ? String(linkedOrderDoc.document_type ?? "PO") : orderNumber ? "PO" : "Direct Bill",
    poWoReference: orderNumber || "NA",
    grnServiceReference: grnWccDoc ? String(grnWccDoc.document_number ?? "") : "",
    department: String(purchaseOrder.department ?? ""),
    tdsApplicable: tax.tds_applicable ? "Yes" : "No",
    paymentTerms: String(tax.payment_terms ?? ""),
    attachmentName: invoiceDetails.invoice_doc_url ? String(invoiceDetails.invoice_doc_url).split("/").pop() || "Invoice document" : "",
    attachmentType: "application/pdf",
    attachmentUrl: invoiceDetails.invoice_doc_url ? String(invoiceDetails.invoice_doc_url) : "",
    supportingDocumentNames: additionalDocs.map((doc) => String(doc.name ?? doc.url ?? "")).filter(Boolean),
    additionalDocumentUrls: Object.fromEntries(
      additionalDocs.map((doc) => [String(doc.name ?? doc.url ?? ""), String(doc.url ?? "")]).filter(([name]) => name),
    ),
    status: invoiceStatusLabel(invoice),
    ledgerEntryStatus: String(invoice.ledger_entery_status ?? ""),
    notes: "",
  };
};

// Backend invoices are the source of truth for the bill's own data, but this UI has no
// verify/approve/pay endpoint yet — so a locally-set status (from the Verify / Mark Paid
// buttons below) is preserved across refetches instead of being reset by the raw fetch.
const mergeInvoiceRecords = (previous: FinanceRecord[], fetched: FinanceRecord[]): FinanceRecord[] => {
  const previousById = new Map(previous.map((record) => [record.id, record]));
  const merged = fetched.map((record) => {
    const existing = previousById.get(record.id);
    // ledgerEntryStatus has no backend update endpoint yet either — same reasoning as status.
    return existing ? { ...record, status: existing.status, ledgerEntryStatus: existing.ledgerEntryStatus } : record;
  });
  const fetchedIds = new Set(fetched.map((record) => record.id));
  const untouched = previous.filter((record) => !fetchedIds.has(record.id));
  return [...merged, ...untouched];
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
          <p className="mt-1.5 max-w-3xl text-sm font-medium leading-6 text-slate-500">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

export function FinanceAccountsDashboard() {
  const [records, setRecords] = useState<FinanceRecord[]>([]);

  useEffect(() => setRecords(loadRecords()), []);

  const totalValue = records.reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const pending = records.filter((record) => record.status === "Pending Approval").length;
  const posted = records.filter((record) => ["Posted", "Paid", "Reconciled", "Closed"].includes(record.status)).length;

  return (
    <div className="min-h-full bg-[#f6f8fa] px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1540px] space-y-7">
        <PageHeading
          icon={LayoutDashboard}
          eyebrow="Finance & Accounts"
          title="Finance Dashboard"
          description="A focused accounting workspace for bills, payments, vouchers, banking, reporting, budgets and financial controls."
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Recorded Entries", value: records.length.toLocaleString("en-IN"), icon: ClipboardList, note: "Across all finance modules" },
            { label: "Pending Approval", value: pending.toLocaleString("en-IN"), icon: ShieldCheck, note: "Items awaiting action" },
            { label: "Posted / Closed", value: posted.toLocaleString("en-IN"), icon: CheckCircle2, note: "Completed accounting entries" },
            { label: "Recorded Value", value: formatCurrency(totalValue), icon: IndianRupee, note: "Value in this workspace" },
          ].map(({ label, value, icon: Icon, note }) => (
            <div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.11em] text-slate-400">{label}</p>
                  <p className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
                  <p className="mt-1 text-xs font-medium text-slate-400">{note}</p>
                </div>
                <span className="rounded-xl bg-[#eaf4f1] p-2.5 text-[#0d5c4d]"><Icon className="h-5 w-5" /></span>
              </div>
            </div>
          ))}
        </div>

        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)] sm:p-7">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#18765f]">Accounting workspaces</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">7 mandatory modules</h2>
              <p className="mt-1 text-sm text-slate-500">Open a module to access its complete workflow through the switch bar.</p>
            </div>
            <span className="w-fit rounded-full bg-[#eaf4f1] px-3 py-1.5 text-xs font-bold text-[#0d5c4d]">Financial year controls ready</span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {FINANCE_MODULES.map((module) => {
              const Icon = module.icon;
              const count = records.filter((record) => record.module === module.key).length;
              const functions = Array.from(new Set(module.tabs.flatMap((tab) => tab.features))).length;
              return (
                <Link key={module.key} to={module.path} className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#8bbcaf] hover:shadow-[0_14px_34px_rgba(13,71,63,0.09)]">
                  <div className="flex items-start justify-between gap-4">
                    <span className={cn("rounded-xl p-3", module.accent)}><Icon className="h-5 w-5" /></span>
                    <ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-[#0d5c4d]" />
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-slate-900">{module.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{module.description}</p>
                  <div className="mt-5 flex items-center gap-2 text-xs font-bold text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1">{module.tabs.length} tabs</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1">{functions} functions</span>
                    <span className="ml-auto text-[#18765f]">{count} entries</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

const initialForm = (module: ModuleDefinition, tab: TabDefinition): Omit<FinanceRecord, "id"> => ({
  module: module.key,
  tab: tab.label,
  entryType: tab.features[0] ?? tab.label,
  reference: "",
  party: "",
  vendorId: "",
  date: new Date().toISOString().slice(0, 10),
  amount: 0,
  status: "Draft",
  notes: "",
  attachmentName: "",
  attachmentType: "",
  invoiceDate: "",
  dueDate: "",
  poWoReference: "",
  department: "",
  costCentre: "",
  project: "",
  site: "",
  baseAmount: 0,
  taxAmount: 0,
  cgstAmount: 0,
  sgstAmount: 0,
  igstAmount: 0,
  billInwardNo: "",
  invoiceType: "Tax Invoice",
  vendorGstin: "",
  placeOfSupply: "",
  referenceType: "PO",
  grnServiceReference: "",
  projectSiteLand: "",
  budgetCostHead: "",
  otherAdjustment: 0,
  tdsApplicable: "No",
  paymentTerms: "",
  creditDays: 0,
  billPriority: "Normal",
  billMode: "Digital Bill",
  originalBillReceived: "No",
  supportingDocumentNames: [],
});

type EntryModalProps = { module: ModuleDefinition; tab: TabDefinition; existing?: FinanceRecord | null; onClose: () => void; onSave: (record: FinanceRecord) => void; onSaved?: () => void; initialFile?: File; initialInvoiceDocUrl?: string; initialFileName?: string; initialVendorId?: string; initialVendorName?: string; initialInvoiceDirectoryId?: string; initialSupportingFiles?: File[]; initialAdditionalDocuments?: Array<{ name: string; url: string }> };

type DirectoryVendor = { id: string; name: string; phone?: string; address?: string };
type VendorOrder = { flowId: string; orderNumber: string; orderType: string; status: string };
type CompletionReference = { id: string; label: string; status?: string };
type AccountingDimension = { id: string; code: string; name: string; level?: string };
type AccountingDimensions = {
  departments: AccountingDimension[];
  costCentres: AccountingDimension[];
  costAttributions: AccountingDimension[];
  projects: AccountingDimension[];
  sites: AccountingDimension[];
  requireDepartment: boolean;
  requireCostCentre: boolean;
  requireProject: boolean;
  requireSiteLand: boolean;
};

const loadAccountingDimensions = (): AccountingDimensions => {
  try {
    const raw = localStorage.getItem("sbr-accounting-master-v1");
    const costing = raw ? JSON.parse(raw)?.costing ?? {} : {};
    const costCentreRaw = localStorage.getItem("sbr-cost-accounting-centres-v1");
    const attributionRaw = localStorage.getItem("sbr-cost-attributions-v1");
    const registeredCentres = costCentreRaw ? JSON.parse(costCentreRaw) : [];
    const registeredAttributions = attributionRaw ? JSON.parse(attributionRaw) : [];
    const activeCentres = Array.isArray(registeredCentres) ? registeredCentres.filter((item) => item?.status === "Active").map((item) => ({ id: String(item.id), code: String(item.code), name: String(item.name) })) : [];
    const configuredCentres = Array.isArray(costing.costCentres) ? costing.costCentres : [];
    const centreByCode = new Map<string, AccountingDimension>();
    [...configuredCentres, ...activeCentres].forEach((item) => centreByCode.set(String(item.code || item.id), { id: String(item.id), code: String(item.code || ""), name: String(item.name || "") }));
    return {
      departments: Array.isArray(costing.departments) ? costing.departments : [],
      costCentres: Array.from(centreByCode.values()),
      costAttributions: Array.isArray(registeredAttributions) ? registeredAttributions.filter((item) => item?.status === "Active").map((item) => ({ id: String(item.id), code: String(item.code), name: String(item.name), level: String(item.level || "") })) : [],
      projects: Array.isArray(costing.projects) ? costing.projects : [],
      sites: Array.isArray(costing.sites) ? costing.sites : [],
      requireDepartment: costing.requireDepartment !== false,
      requireCostCentre: costing.requireCostCentre !== false,
      requireProject: costing.requireProject !== false,
      requireSiteLand: costing.requireSiteLand === true,
    };
  } catch {
    return { departments: [], costCentres: [], costAttributions: [], projects: [], sites: [], requireDepartment: true, requireCostCentre: true, requireProject: true, requireSiteLand: false };
  }
};

const vendorOrderLabel = (orderType: string) => {
  const normalized = String(orderType ?? "").trim().toUpperCase();
  if (normalized.includes("CONTRACT")) return "Contract";
  if (normalized.includes("SPR") || normalized.includes("WORK") || normalized === "WO") return "WO";
  return "PO";
};

export function BillInwardModal({ module, tab, existing, onClose, onSaved, initialFile, initialInvoiceDocUrl, initialFileName, initialVendorId, initialVendorName, initialInvoiceDirectoryId, initialSupportingFiles, initialAdditionalDocuments }: EntryModalProps) {
  const [form, setForm] = useState<Omit<FinanceRecord, "id">>(() => {
    const base = existing ? { ...initialForm(module, tab), ...existing } : initialForm(module, tab);
    if (!existing && initialVendorId) return { ...base, vendorId: initialVendorId, party: initialVendorName || base.party };
    return base;
  });
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [fileError, setFileError] = useState("");
  const [vendors, setVendors] = useState<DirectoryVendor[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [vendorsError, setVendorsError] = useState("");
  const [vendorOrders, setVendorOrders] = useState<VendorOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [vendorDetailsLoading, setVendorDetailsLoading] = useState(false);
  // Each supporting file keeps a stable preview URL alongside it (created once, revoked on
  // removal/unmount) so the document tab strip below can preview it without recreating blob
  // URLs on every render.
  const [supportingFiles, setSupportingFiles] = useState<Array<{ file: File; url: string }>>(() => (((!existing && initialSupportingFiles) || []) as File[]).map((item) => ({ file: item, url: URL.createObjectURL(item) })));
  // Additional documents that are already hosted (e.g. the rest of an Invoice Directory
  // folder) — kept separate from supportingFiles so they aren't re-uploaded on submit.
  const [remoteAdditionalDocuments, setRemoteAdditionalDocuments] = useState<Array<{ name: string; url: string }>>(() => (!existing && initialAdditionalDocuments) || []);
  const [selectedPreviewKey, setSelectedPreviewKey] = useState("");
  const supportingFilesRef = useRef(supportingFiles);
  useEffect(() => { supportingFilesRef.current = supportingFiles; }, [supportingFiles]);
  useEffect(() => () => { supportingFilesRef.current.forEach((item) => URL.revokeObjectURL(item.url)); }, []);
  const [completionReferences, setCompletionReferences] = useState<CompletionReference[]>([]);
  const [completionReferencesLoading, setCompletionReferencesLoading] = useState(false);
  const [completionReferencesError, setCompletionReferencesError] = useState("");
  const [accountingDimensions] = useState<AccountingDimensions>(loadAccountingDimensions);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Bill Inward No. is allocated by the backend sequence, not guessed from whatever the
  // browser happens to have cached — only fetched for a brand-new entry.
  useEffect(() => {
    if (existing) return;
    let cancelled = false;
    fetch(`${String(getBaseUrl() ?? "").replace(/\/$/, "")}/admin_accounts/get_next_invoice_id`, { headers: { Accept: "application/json" } })
      .then((res) => res.json())
      .then((data: { success?: boolean; next_invoice_id?: string }) => {
        if (!cancelled && data?.success && data.next_invoice_id) {
          setForm((current) => ({ ...current, billInwardNo: data.next_invoice_id as string }));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadVendors = async () => {
      setVendorsLoading(true);
      setVendorsError("");
      try {
        const url = `${getBaseUrl()}/purchase_flow/get_vendors`;
        const request = (method: "GET" | "POST") => fetch(url, { method, headers: { Accept: "application/json" } });
        let response = await request("GET");
        if (response.status === 405) response = await request("POST");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json().catch(() => null);
        const list = Array.isArray(payload?.vendors) ? payload.vendors : [];
        const mapped = list
          .map((vendor: Record<string, unknown>) => ({
            id: String(vendor.vendor_id ?? "").trim(),
            name: String(vendor.vendor_name ?? "").trim(),
            phone: String(vendor.vendor_contact ?? "").trim() || undefined,
            address: String(vendor.vendor_address ?? "").trim() || undefined,
          }))
          .filter((vendor: DirectoryVendor) => vendor.id && vendor.name)
          .sort((a: DirectoryVendor, b: DirectoryVendor) => a.name.localeCompare(b.name));
        if (!cancelled) setVendors(mapped);
      } catch {
        if (!cancelled) setVendorsError("Vendor Directory could not be loaded. Please retry.");
      } finally {
        if (!cancelled) setVendorsLoading(false);
      }
    };
    void loadVendors();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const vendorId = String(form.vendorId ?? "").trim();
    setVendorOrders([]);
    setOrdersError("");
    if (!vendorId) {
      setOrdersLoading(false);
      return () => { cancelled = true; };
    }
    const loadOrders = async () => {
      setOrdersLoading(true);
      try {
        const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
        // Vendor IDs contain slashes (for example SBR/VEN/0001). This endpoint is
        // defined with a path-style vendor parameter, so it must receive the original
        // ID rather than an encoded value such as SBR%2FVEN%2F0001.
        const response = await fetch(`${baseUrl}/purchase_flow/get_order_info_by_vendor_id/${vendorId}`, { headers: { Accept: "application/json" } });
        let payload = response.ok ? await response.json().catch(() => null) : null;
        let list = Array.isArray(payload?.purchase_flows) ? payload.purchase_flows : [];

        // Some deployments do not expose the vendor-specific route. Fall back to the
        // live Purchase Flow register and resolve its approved vendor metadata.
        if (!response.ok) {
          const flowUrl = `${baseUrl}/purchase_flow/get_purchase_flows`;
          const requestFlows = (method: "GET" | "POST") => fetch(flowUrl, { method, headers: { Accept: "application/json" } });
          let flowsResponse = await requestFlows("GET");
          if (flowsResponse.status === 405) flowsResponse = await requestFlows("POST");
          if (!flowsResponse.ok) throw new Error(`HTTP ${flowsResponse.status}`);
          payload = await flowsResponse.json().catch(() => null);
          const flows = Array.isArray(payload?.purchase_flows) ? payload.purchase_flows : [];
          const resolved = await Promise.all(flows.map(async (flow: Record<string, unknown>) => {
            const comparisonId = String(flow.comparison_id ?? "").trim();
            const embeddedVendorId = String(flow.vendor_id ?? flow.approved_vendor_id ?? "").trim();
            if (embeddedVendorId) return embeddedVendorId === vendorId ? flow : null;
            if (!comparisonId) return null;
            try {
              const infoResponse = await fetch(`${baseUrl}/purchase_flow/get_left_panel_info/${encodeURIComponent(comparisonId)}`, { method: "POST", headers: { Accept: "application/json" } });
              if (!infoResponse.ok) return null;
              const info = await infoResponse.json().catch(() => null);
              return String(info?.approved_vendor_id ?? "").trim() === vendorId ? flow : null;
            } catch {
              return null;
            }
          }));
          list = resolved.filter(Boolean);
        }
        const mapped = list
          .map((order: Record<string, unknown>) => ({
            flowId: String(order.flow_id ?? "").trim(),
            orderNumber: String(order.order_number ?? "").trim(),
            orderType: String(order.order_type ?? "").trim(),
            status: String(order.status ?? "").trim(),
          }))
          .filter((order: VendorOrder) => order.orderNumber);
        if (!cancelled) setVendorOrders(mapped);
      } catch {
        if (!cancelled) setOrdersError("Orders could not be loaded for this vendor. You can still select NA.");
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    };
    void loadOrders();
    return () => { cancelled = true; };
  }, [form.vendorId]);

  useEffect(() => {
    let cancelled = false;
    const referenceType = String(form.referenceType ?? "");
    const orderNumber = String(form.poWoReference ?? "").trim();
    setCompletionReferences([]);
    setCompletionReferencesError("");
    if (!["PO", "WO"].includes(referenceType) || !orderNumber || orderNumber === "NA") {
      setCompletionReferencesLoading(false);
      return () => { cancelled = true; };
    }
    const loadCompletionReferences = async () => {
      setCompletionReferencesLoading(true);
      try {
        const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
        if (referenceType === "PO") {
          const response = await fetch(`${baseUrl}/admin_grn_inspection/list`, { headers: { Accept: "application/json" } });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload = await response.json().catch(() => null);
          const grns = Array.isArray(payload?.grns) ? payload.grns : [];
          const options = grns
            .filter((grn: Record<string, unknown>) => String(grn.order_number ?? grn.po_number ?? "").trim() === orderNumber && String(grn.status ?? "").trim().toLowerCase() === "approved")
            .map((grn: Record<string, unknown>) => {
              const id = String(grn.grn_number ?? grn.grn_no ?? "").trim();
              return { id, label: `GRN · ${id}`, status: String(grn.status ?? "").trim() };
            })
            .filter((option: CompletionReference) => option.id);
          if (!cancelled) setCompletionReferences(options);
        } else {
          const response = await fetch(`${baseUrl}/admin_wcc_certificate/get_by_order/${encodeURIComponent(orderNumber)}`, { headers: { Accept: "application/json" } });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload = await response.json().catch(() => null);
          const certificates = Array.isArray(payload?.certificates) ? payload.certificates : [];
          const options = certificates
            .filter((certificate: Record<string, unknown>) => String(certificate.status ?? "").trim().toLowerCase() === "approved")
            .map((certificate: Record<string, unknown>) => {
              const id = String(certificate.certificate_id ?? certificate.wcc_number ?? "").trim();
              return { id, label: `WCC · ${id}`, status: String(certificate.status ?? "").trim() };
            })
            .filter((option: CompletionReference) => option.id);
          if (!cancelled) setCompletionReferences(options);
        }
      } catch {
        if (!cancelled) setCompletionReferencesError(`Approved ${referenceType === "PO" ? "GRNs" : "WCCs"} could not be loaded for this order.`);
      } finally {
        if (!cancelled) setCompletionReferencesLoading(false);
      }
    };
    void loadCompletionReferences();
    return () => { cancelled = true; };
  }, [form.poWoReference, form.referenceType]);

  useEffect(() => {
    let cancelled = false;
    const vendorId = String(form.vendorId ?? "").trim();
    if (!vendorId) {
      setVendorDetailsLoading(false);
      setForm((current) => ({ ...current, vendorGstin: "", placeOfSupply: "", paymentTerms: "", creditDays: 0 }));
      return () => { cancelled = true; };
    }
    const loadVendorDetails = async () => {
      setVendorDetailsLoading(true);
      try {
        const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
        const response = await fetch(`${baseUrl}/admin_accounts/get_vendor_details/${encodeURIComponent(vendorId)}`, { headers: { Accept: "application/json" } });
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        const details = payload?.vendor_details ?? payload?.data?.vendor_details ?? payload?.data?.data?.vendor_details ?? {};
        const supply = details?.address_for_place_of_supply_of_goods_services ?? {};
        const address = details?.address ?? {};
        const commercial = details?.commercial_details ?? {};
        const gstin = String(details?.gst_number ?? supply?.gst_number ?? "").trim();
        const place = String(supply?.state ?? supply?.district ?? details?.place_of_business ?? address?.state ?? "").trim();
        const terms = String(details?.payment_terms ?? commercial?.payment_terms ?? "").trim();
        const days = Number(details?.credit_days ?? commercial?.credit_days ?? 0) || 0;
        if (!cancelled) setForm((current) => ({ ...current, vendorGstin: gstin, placeOfSupply: current.placeOfSupply || place, paymentTerms: current.paymentTerms || terms, creditDays: current.creditDays || days }));
      } finally {
        if (!cancelled) setVendorDetailsLoading(false);
      }
    };
    void loadVendorDetails();
    return () => { cancelled = true; };
  }, [form.vendorId]);

  // Once a real PO/WO/Contract is linked, its own payment terms are more specific than the
  // vendor-level default above and take priority over it.
  useEffect(() => {
    let cancelled = false;
    const orderNumber = String(form.poWoReference ?? "").trim();
    if (!orderNumber || orderNumber === "NA") return () => { cancelled = true; };
    const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
    fetch(`${baseUrl}/admin_accounts/get_payment_terms/${encodeURIComponent(orderNumber)}`, { headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { success?: boolean; "payment terms"?: string } | null) => {
        const terms = data?.success ? data["payment terms"] : undefined;
        if (!cancelled && terms) setForm((current) => ({ ...current, paymentTerms: terms }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [form.poWoReference]);

  useEffect(() => {
    if (!form.invoiceDate) return;
    const invoiceDate = new Date(`${form.invoiceDate}T00:00:00`);
    if (Number.isNaN(invoiceDate.getTime())) return;
    invoiceDate.setDate(invoiceDate.getDate() + Number(form.creditDays));
    const derived = invoiceDate.toISOString().slice(0, 10);
    setForm((current) => current.dueDate === derived ? current : { ...current, dueDate: derived });
  }, [form.invoiceDate, form.creditDays]);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
  const chooseFile = (selected?: File) => {
    if (!selected) return;
    const supported = selected.type === "application/pdf" || selected.type.startsWith("image/");
    if (!supported) {
      setFileError("Upload a PDF, JPG, PNG or WebP bill document.");
      return;
    }
    if (selected.size > 15 * 1024 * 1024) {
      setFileError("The bill document must be 15 MB or smaller.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setRemoteInvoiceDocUrl("");
    setFileError("");
    update("attachmentName", selected.name);
    update("attachmentType", selected.type);
  };

  // Opened from the Invoice Directory's "Process Invoice" action — the folder's Invoice
  // document is already known, so skip straight past the "upload bill document" gate.
  useEffect(() => {
    if (initialFile) chooseFile(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same "Process Invoice" case, but when the folder's document only has a remote URL (no
  // local File could be resolved, e.g. cross-origin S3 fetch blocked by CORS) — use the
  // already-hosted document directly instead of forcing a re-upload of the same file.
  const [remoteInvoiceDocUrl, setRemoteInvoiceDocUrl] = useState(() => (!initialFile && initialInvoiceDocUrl) || "");
  useEffect(() => {
    if (!initialFile && initialInvoiceDocUrl) {
      setPreviewUrl(initialInvoiceDocUrl);
      update("attachmentName", initialFileName || initialInvoiceDocUrl.split("/").pop() || "Invoice document");
      update("attachmentType", /\.pdf(\?|$)/i.test(initialInvoiceDocUrl) ? "application/pdf" : "image/jpeg");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Uploads a single file against the vendor's PO/WO document store — falls back to the
  // Bill Inward number when this bill isn't linked to a real order, since the endpoint
  // just uses order_number to namespace the S3 path, not to validate an actual order.
  const uploadBillDocument = async (baseUrl: string, orderNumber: string, documentFile: File) => {
    const body = new FormData();
    body.append("document", documentFile);
    const response = await fetch(`${baseUrl}/purchase_flow/upload_purchase_flow_document?order_number=${encodeURIComponent(orderNumber)}`, { method: "POST", body });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success || !payload?.file_url) throw new Error(payload?.detail || `Failed to upload ${documentFile.name}`);
    return String(payload.file_url);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file && !existing?.attachmentName && !remoteInvoiceDocUrl) {
      setFileError("Upload the bill document before entering its details.");
      return;
    }
    if (!form.vendorId) {
      toast.error("Select a vendor before submitting.");
      return;
    }

    const totalGst = Number(form.cgstAmount || 0) + Number(form.sgstAmount || 0) + Number(form.igstAmount || 0);
    const invoiceAmount = Number(form.baseAmount || 0) + totalGst;
    const payable = invoiceAmount + Number(form.otherAdjustment || 0);
    const hasOrderReference = Boolean(form.poWoReference) && form.poWoReference !== "NA";
    const hasCompletionReference = Boolean(form.grnServiceReference) && form.grnServiceReference !== "NA";
    const uploadOrderNumber = hasOrderReference ? (form.poWoReference as string) : (form.billInwardNo || `BI-${Date.now()}`);

    setSubmitting(true);
    try {
      const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");

      // Only the invoice document and ad-hoc extras (e-way bill, challan, etc.) get
      // uploaded here — the linked PO/WO and its GRN/WCC are existing backend records,
      // referenced by number below rather than re-uploaded. A folder processed from the
      // Invoice Directory already has its document hosted (remoteInvoiceDocUrl) — reuse it
      // instead of re-uploading the same file, unless it was replaced with a new one.
      const invoiceDocUrl = file ? await uploadBillDocument(baseUrl, uploadOrderNumber, file) : remoteInvoiceDocUrl;
      const additionalDocuments: Array<{ name: string; url: string }> = [...remoteAdditionalDocuments];
      for (const { file: supportingFile } of supportingFiles) {
        const url = await uploadBillDocument(baseUrl, uploadOrderNumber, supportingFile);
        additionalDocuments.push({ name: supportingFile.name, url });
      }

      const base = Number(form.baseAmount || 0);
      const cupportingDocuments = [
        ...(hasOrderReference ? [{ document_type: form.referenceType, document_number: form.poWoReference }] : []),
        ...(hasCompletionReference ? [{ document_type: form.referenceType === "WO" ? "WCC" : "GRN", document_number: form.grnServiceReference }] : []),
      ];

      const response = await fetch(`${baseUrl}/admin_accounts/invoice_inward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_directory_id: initialInvoiceDirectoryId || "",
          vendor: { vendor_id: form.vendorId, vendor_name: form.party, gst_number: form.vendorGstin || "" },
          invoice: {
            invoice_number: form.reference,
            invoice_date: form.invoiceDate || "",
            invoice_amount: invoiceAmount,
            invoice_doc_url: invoiceDocUrl,
            inward_date: form.date,
          },
          purchase_order: {
            order_number: hasOrderReference ? form.poWoReference : "",
            cupporting_documents: cupportingDocuments,
            department: form.department || "",
          },
          tax_details: {
            cgst_percentage: base > 0 ? (Number(form.cgstAmount || 0) / base) * 100 : 0,
            cgst_amount: Number(form.cgstAmount || 0),
            sgst_percentage: base > 0 ? (Number(form.sgstAmount || 0) / base) * 100 : 0,
            sgst_amount: Number(form.sgstAmount || 0),
            igst_percentage: base > 0 ? (Number(form.igstAmount || 0) / base) * 100 : 0,
            igst_amount: Number(form.igstAmount || 0),
            total_tax_amount: totalGst,
            other_charges_or_adjustments: Number(form.otherAdjustment || 0),
            tds_applicable: form.tdsApplicable === "Yes",
            payment_terms: form.paymentTerms || "",
            payment_due_date: form.dueDate || "",
          },
          total_amount_payable: payable,
          bill_priority: form.billPriority || "Normal",
          bill_type: form.invoiceType || "",
          additional_documents: additionalDocuments,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.success === false) throw new Error(data?.detail || data?.message || "Failed to save invoice inward");

      toast.success(`Invoice inward ${data?.data?.invoice_id ?? form.reference} recorded successfully`);
      onSaved?.();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit invoice inward");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10";
  const fieldLabel = "space-y-2 text-xs font-bold text-slate-600";
  const totalGst = Number(form.cgstAmount || 0) + Number(form.sgstAmount || 0) + Number(form.igstAmount || 0);
  const totalPayable = Number(form.baseAmount || 0) + totalGst + Number(form.otherAdjustment || 0);
  const selectedVendor = vendors.find((vendor) => vendor.id === form.vendorId);
  const filteredVendorOrders = vendorOrders.filter((order) => vendorOrderLabel(order.orderType) === form.referenceType);
  const attachmentName = file?.name || existing?.attachmentName || form.attachmentName || "";
  const attachmentType = file?.type || existing?.attachmentType || form.attachmentType || "";

  // Every document available to preview — the bill attachment plus every additional
  // document, whether already hosted (remoteAdditionalDocuments) or freshly picked
  // (supportingFiles). Shown as a tab strip once there's more than one.
  const previewDocuments = [
    ...(file || remoteInvoiceDocUrl ? [{ key: "bill", name: attachmentName || "Bill attachment", role: "bill" as const, type: attachmentType, url: previewUrl }] : []),
    ...remoteAdditionalDocuments.map((document) => ({ key: `remote-${document.url}`, name: document.name, role: "supporting" as const, type: /\.pdf(\?|$)/i.test(document.url) ? "application/pdf" : "image/jpeg", url: document.url })),
    ...supportingFiles.map((item) => ({ key: `local-${item.url}`, name: item.file.name, role: "supporting" as const, type: item.file.type, url: item.url })),
  ];
  const selectedPreview = previewDocuments.find((document) => document.key === selectedPreviewKey) ?? previewDocuments[0];

  if (!file && !existing?.attachmentName && !remoteInvoiceDocUrl) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="flex items-start justify-between bg-[#0d473f] px-7 py-6 text-white">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/60">Bills & Payables · Inward</p>
              <h2 className="mt-1 text-2xl font-bold">Upload bill document</h2>
              <p className="mt-1 text-sm font-medium text-white/65">Start by uploading the vendor bill you want to record.</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
          <div className="p-7">
            <label className="group flex min-h-[300px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-[#9cc7bb] bg-[#f3f9f7] px-8 text-center transition hover:border-[#278b76] hover:bg-[#edf7f4]">
              <input type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} />
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-[#0d5c4d] shadow-sm ring-1 ring-[#d7e9e4]"><UploadCloud className="h-8 w-8" /></span>
              <h3 className="mt-5 text-lg font-bold text-slate-900">Upload bill PDF or image</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Click to choose the original invoice or scanned bill. The preview and detail form will open after upload.</p>
              <span className="mt-5 rounded-full bg-white px-4 py-2 text-xs font-bold text-[#0d5c4d] shadow-sm ring-1 ring-[#d7e9e4]">PDF, JPG, PNG or WebP · up to 15 MB</span>
            </label>
            {fileError && <p className="mt-3 text-center text-sm font-bold text-red-600">{fileError}</p>}
          </div>
          <div className="flex justify-end border-t border-slate-100 px-7 py-4">
            <button type="button" onClick={onClose} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form onSubmit={submit} className="flex max-h-[96vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between bg-[#0d473f] px-6 py-5 text-white">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/60">Bills & Payables · Bill Inward</p>
            <h2 className="mt-1 text-xl font-bold">Record incoming vendor bill</h2>
            <p className="mt-1 text-xs font-medium text-white/60">Review the uploaded bill while capturing the accounting details.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto bg-[#eef3f6] lg:grid-cols-[minmax(0,1.05fr)_minmax(520px,0.95fr)] lg:overflow-hidden">
          <section className="flex min-h-[520px] flex-col border-b border-slate-200 p-4 lg:min-h-0 lg:border-b-0 lg:border-r lg:p-5">
            {previewDocuments.length > 1 ? (
              <div className="mb-3 flex shrink-0 gap-2 overflow-x-auto pb-1">
                {previewDocuments.map((document) => (
                  <button
                    key={document.key}
                    type="button"
                    onClick={() => setSelectedPreviewKey(document.key)}
                    className={cn(
                      "flex min-w-[190px] items-center gap-2 rounded-xl border px-3 py-2 text-left",
                      selectedPreview?.key === document.key ? "border-[#278b76] bg-[#e7f3ef] text-[#0d5c4d]" : "border-slate-200 bg-white text-slate-600 hover:border-[#b8d6ce]",
                    )}
                  >
                    {document.type.startsWith("image/") ? <FileImage className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{document.name}</span><span className="mt-0.5 block text-[10px] font-semibold uppercase opacity-60">{document.role === "bill" ? "Bill Attachment" : "Supporting"}</span></span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/70">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="rounded-xl bg-[#eaf4f1] p-2 text-[#0d5c4d]"><FileImage className="h-5 w-5" /></span>
                  <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{attachmentName}</p><p className="text-xs font-medium text-slate-400">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · ` : "Saved attachment · "}{attachmentType === "application/pdf" ? "PDF document" : "Bill image"}</p></div>
                </div>
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"><input type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} /><RefreshCw className="h-3.5 w-3.5" /> Replace</label>
              </div>
            )}
            <div className="flex min-h-[430px] flex-1 items-center justify-center overflow-hidden rounded-2xl bg-slate-200/70 p-3 ring-1 ring-slate-300/70">
              {!selectedPreview ? (
                <div className="flex max-w-sm flex-col items-center px-6 text-center"><span className="rounded-2xl bg-white p-4 text-[#0d5c4d] shadow-sm"><FileImage className="h-8 w-8" /></span><p className="mt-4 text-sm font-bold text-slate-700">{attachmentName}</p><p className="mt-2 text-xs leading-5 text-slate-500">The saved invoice remains attached. Use Replace to load a new document preview while editing.</p></div>
              ) : selectedPreview.type === "application/pdf" || selectedPreview.type.startsWith("image/") ? (
                <MediaPreviewFrame name={selectedPreview.name} type={selectedPreview.type} url={selectedPreview.url} />
              ) : (
                <div className="flex max-w-xs flex-col items-center text-center text-slate-400"><FileText className="h-10 w-10" /><p className="mt-3 break-all text-sm font-bold text-slate-700">{selectedPreview.name}</p><p className="mt-1 text-xs">Preview isn't available for this file type.</p></div>
              )}
            </div>
            {previewDocuments.length > 1 && selectedPreview?.role === "bill" && (
              <label className="mt-3 inline-flex h-9 w-fit cursor-pointer items-center gap-2 self-end rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"><input type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} /><RefreshCw className="h-3.5 w-3.5" /> Replace Bill Attachment</label>
            )}
          </section>

          <section className="overflow-y-auto bg-white p-5 sm:p-6">
            <div className="mb-5"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#18765f]">Bill details</p><h3 className="mt-1 text-lg font-bold text-slate-900">Enter details from the uploaded bill</h3></div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2"><p className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-slate-400">Invoice identity</p></div>
              <label className={fieldLabel}>Bill Inward No. *<input readOnly className={cn(inputClass, "bg-slate-50 text-[#0d5c4d]")} value={form.billInwardNo || (existing ? "" : "Allocating…")} /></label>
              <label className={fieldLabel}>Invoice Type *<select required className={inputClass} value={form.invoiceType ?? ""} onChange={(event) => update("invoiceType", event.target.value)}>{["Tax Invoice", "Service Invoice", "Proforma Invoice", "Debit Note", "Credit Note", "Expense Bill", "Contractor Bill", "Other"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className={fieldLabel}>Vendor *
                <select
                  required
                  disabled={vendorsLoading || Boolean(vendorsError)}
                  className={cn(inputClass, "cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400")}
                  value={form.vendorId ?? ""}
                  onChange={(event) => {
                    const vendor = vendors.find((item) => item.id === event.target.value);
                    update("vendorId", event.target.value);
                    update("party", vendor?.name ?? "");
                    update("poWoReference", "");
                    update("grnServiceReference", "");
                  }}
                >
                  <option value="">{vendorsLoading ? "Loading vendors…" : vendorsError ? "Vendor Directory unavailable" : "Select vendor"}</option>
                  {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name} · {vendor.id}</option>)}
                </select>
                {vendorsError && <span className="block text-[11px] font-semibold text-red-600">{vendorsError}</span>}
                {selectedVendor && (selectedVendor.address || selectedVendor.phone) && <span className="block text-[11px] font-medium leading-4 text-slate-400">{selectedVendor.address || "Address not recorded"}{selectedVendor.phone ? ` · ${selectedVendor.phone}` : ""}</span>}
              </label>
              <label className={fieldLabel}>GSTIN of Vendor<input readOnly className={cn(inputClass, "bg-slate-50")} value={vendorDetailsLoading ? "Loading from Vendor Master…" : form.vendorGstin || "Not recorded in Vendor Master"} /></label>
              <label className={fieldLabel}>Invoice Number *<input required className={inputClass} value={form.reference} onChange={(event) => update("reference", event.target.value)} placeholder="Enter invoice number" /></label>
              <label className={fieldLabel}>Invoice Date *<input required type="date" className={inputClass} value={form.invoiceDate ?? ""} onChange={(event) => update("invoiceDate", event.target.value)} /></label>
              <label className={fieldLabel}>Bill Received Date *<input required type="date" className={inputClass} value={form.date} onChange={(event) => update("date", event.target.value)} /></label>
              <label className={fieldLabel}>Place of Supply *<input required className={inputClass} value={form.placeOfSupply ?? ""} onChange={(event) => update("placeOfSupply", event.target.value)} placeholder="State / place of supply" /></label>

              <div className="mt-2 border-t border-slate-100 pt-5 sm:col-span-2"><p className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-slate-400">Reference & cost allocation</p></div>
              <label className={fieldLabel}>Reference Type *<select required className={inputClass} value={form.referenceType ?? ""} onChange={(event) => { const value = event.target.value; const isUnlinked = ["Direct Bill", "No Reference"].includes(value); update("referenceType", value); update("poWoReference", isUnlinked ? "NA" : ""); update("grnServiceReference", isUnlinked ? "NA" : ""); }}>{["PO", "WO", "Contract", "Direct Bill", "No Reference"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className={fieldLabel}>{form.referenceType === "PO" ? "Purchase Order Reference" : form.referenceType === "WO" ? "Work Order Reference" : form.referenceType === "Contract" ? "Contract Reference" : "Order Reference"} *
                <select
                  required
                  disabled={!form.vendorId || ordersLoading || ["Direct Bill", "No Reference"].includes(form.referenceType ?? "")}
                  className={cn(inputClass, "cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400")}
                  value={form.poWoReference ?? ""}
                  onChange={(event) => { update("poWoReference", event.target.value); update("grnServiceReference", ""); }}
                >
                  <option value="">{!form.vendorId ? "Select vendor first" : ordersLoading ? "Loading vendor orders…" : `Select ${form.referenceType || "reference"}`}</option>
                  <option value="NA">NA — Not linked to an order</option>
                  {filteredVendorOrders.map((order) => {
                    const typeLabel = vendorOrderLabel(order.orderType);
                    return <option key={order.flowId || order.orderNumber} value={order.orderNumber}>{typeLabel} · {order.orderNumber}{order.status ? ` · ${order.status}` : ""}</option>;
                  })}
                </select>
                {!ordersLoading && form.vendorId && !ordersError && filteredVendorOrders.length === 0 && !["Direct Bill", "No Reference"].includes(form.referenceType ?? "") && <span className="block text-[11px] font-medium text-slate-400">No linked {form.referenceType || "order"} records found. Select NA to continue.</span>}
                {ordersError && <span className="block text-[11px] font-semibold text-amber-700">{ordersError}</span>}
              </label>
              <label className={fieldLabel}>{form.referenceType === "PO" ? "GRN Reference" : form.referenceType === "WO" ? "WCC / Service Completion Reference" : "GRN / Service Completion Reference"}
                <select
                  disabled={!["PO", "WO"].includes(form.referenceType ?? "") || !form.poWoReference || form.poWoReference === "NA" || completionReferencesLoading}
                  className={cn(inputClass, "cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400")}
                  value={form.grnServiceReference ?? ""}
                  onChange={(event) => update("grnServiceReference", event.target.value)}
                >
                  <option value="">{!["PO", "WO"].includes(form.referenceType ?? "") ? "Not applicable" : !form.poWoReference ? `Select ${form.referenceType} first` : completionReferencesLoading ? `Loading approved ${form.referenceType === "PO" ? "GRNs" : "WCCs"}…` : `Select ${form.referenceType === "PO" ? "GRN" : "WCC"}`}</option>
                  <option value="NA">NA — Not available</option>
                  {completionReferences.map((reference) => <option key={reference.id} value={reference.id}>{reference.label}{reference.status ? ` · ${reference.status}` : ""}</option>)}
                </select>
                {!completionReferencesLoading && ["PO", "WO"].includes(form.referenceType ?? "") && form.poWoReference && form.poWoReference !== "NA" && !completionReferencesError && completionReferences.length === 0 && <span className="block text-[11px] font-medium text-slate-400">No approved {form.referenceType === "PO" ? "GRN" : "WCC"} found for this order. Select NA if applicable.</span>}
                {completionReferencesError && <span className="block text-[11px] font-semibold text-amber-700">{completionReferencesError}</span>}
              </label>
              <label className={fieldLabel}>Department<select disabled={accountingDimensions.departments.length === 0} className={cn(inputClass, "cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400")} value={form.department ?? ""} onChange={(event) => update("department", event.target.value)}><option value="">{accountingDimensions.departments.length ? "Select department (optional)" : "Configure departments in Accounting Master"}</option>{accountingDimensions.departments.map((item) => <option key={item.id} value={item.name}>{item.name} · {item.code}</option>)}</select></label>
              <label className={fieldLabel}>Project<select disabled={accountingDimensions.projects.length === 0} className={cn(inputClass, "cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400")} value={form.project ?? ""} onChange={(event) => update("project", event.target.value)}><option value="">{accountingDimensions.projects.length ? "Select project (optional)" : "Configure projects in Accounting Master"}</option>{accountingDimensions.projects.map((item) => <option key={item.id} value={item.name}>{item.name} · {item.code}</option>)}</select></label>
              <label className={fieldLabel}>Site / Land Parcel<select disabled={accountingDimensions.sites.length === 0} className={cn(inputClass, "cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400")} value={form.site ?? ""} onChange={(event) => update("site", event.target.value)}><option value="">{accountingDimensions.sites.length ? "Select site / land parcel (optional)" : "Configure sites in Accounting Master"}</option>{accountingDimensions.sites.map((item) => <option key={item.id} value={item.name}>{item.name} · {item.code}</option>)}</select></label>
              <div className="mt-2 border-t border-slate-100 pt-5 sm:col-span-2"><p className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-slate-400">Commercial & tax details</p></div>
              <label className={fieldLabel}>Taxable / Base Amount *<input required min="0" step="0.01" type="number" className={inputClass} value={form.baseAmount || ""} onChange={(event) => update("baseAmount", Number(event.target.value))} placeholder="0.00" /></label>
              <label className={fieldLabel}>CGST Amount<input min="0" step="0.01" type="number" className={inputClass} value={form.cgstAmount || ""} onChange={(event) => update("cgstAmount", Number(event.target.value))} placeholder="0.00" /></label>
              <label className={fieldLabel}>SGST Amount<input min="0" step="0.01" type="number" className={inputClass} value={form.sgstAmount || ""} onChange={(event) => update("sgstAmount", Number(event.target.value))} placeholder="0.00" /></label>
              <label className={fieldLabel}>IGST Amount<input min="0" step="0.01" type="number" className={inputClass} value={form.igstAmount || ""} onChange={(event) => update("igstAmount", Number(event.target.value))} placeholder="0.00" /></label>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3"><span className="text-xs font-bold text-slate-500">Total GST</span><span className="text-sm font-bold text-[#0d5c4d]">{formatCurrency(totalGst)}</span></div>
              <label className={fieldLabel}>Other Charges / Adjustment<input step="0.01" type="number" className={inputClass} value={form.otherAdjustment || ""} onChange={(event) => update("otherAdjustment", Number(event.target.value))} placeholder="Use negative value for discount" /></label>
              <label className={fieldLabel}>TDS Applicable *<select required className={inputClass} value={form.tdsApplicable ?? "No"} onChange={(event) => update("tdsApplicable", event.target.value)}><option>No</option><option>Yes</option></select></label>
              <label className={fieldLabel}>Payment Terms<input className={inputClass} value={form.paymentTerms ?? ""} onChange={(event) => update("paymentTerms", event.target.value)} placeholder="Auto-fetched or enter terms" /></label>
              <label className={fieldLabel}>Credit Days<input min="0" type="number" className={inputClass} value={form.creditDays || ""} onChange={(event) => update("creditDays", Number(event.target.value))} placeholder="0" /></label>
              <label className={fieldLabel}>Payment Due Date<input readOnly type="date" className={cn(inputClass, "bg-slate-50")} value={form.dueDate ?? ""} /></label>
              <div className="rounded-2xl border border-[#cfe3dd] bg-[#f0f8f5] p-4 sm:col-span-2"><p className="text-xs font-bold uppercase tracking-[0.1em] text-[#448274]">Payable intake value</p><p className="mt-1 text-2xl font-bold text-[#0d5c4d]">{formatCurrency(totalPayable)}</p><p className="mt-1 text-xs text-slate-500">Taxable amount + total GST + other charges / adjustments</p></div>

              <div className="mt-2 border-t border-slate-100 pt-5 sm:col-span-2"><p className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-slate-400">Control & documents</p></div>
              <label className={fieldLabel}>Bill Priority *<select required className={inputClass} value={form.billPriority ?? "Normal"} onChange={(event) => update("billPriority", event.target.value)}>{["Normal", "Priority", "Urgent"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className={fieldLabel}>Physical / Digital Bill *<select required className={inputClass} value={form.billMode ?? "Digital Bill"} onChange={(event) => update("billMode", event.target.value)}><option>Physical Bill</option><option>Digital Bill</option></select></label>
              <label className={fieldLabel}>Original Bill Received *<select required className={inputClass} value={form.originalBillReceived ?? "No"} onChange={(event) => update("originalBillReceived", event.target.value)}><option>No</option><option>Yes</option></select></label>
              <div className="rounded-2xl border border-[#cfe3dd] bg-[#f6faf9] p-4 sm:col-span-2"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-slate-700">Bill Attachment *</p><p className="mt-1 text-xs text-slate-400">{attachmentName} · mandatory invoice document</p></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-extrabold uppercase text-emerald-700">Attached</span></div></div>
              <div className="sm:col-span-2">
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm font-bold text-[#0d5c4d] hover:border-[#8bbcaf] hover:bg-[#f0f8f5]"><input multiple type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx" onChange={(event) => { const added = Array.from(event.target.files ?? []).map((item) => ({ file: item, url: URL.createObjectURL(item) })); setSupportingFiles((current) => [...current, ...added]); event.target.value = ""; }} /><UploadCloud className="h-4 w-4" /> Add Additional Documents</label>
                <p className="mt-2 text-[11px] font-medium text-slate-400">E-way bill, challan or other ad-hoc documents. PO/WO and GRN/WCC are linked by reference above — no need to upload them again.</p>
                {(form.supportingDocumentNames?.length || remoteAdditionalDocuments.length > 0 || supportingFiles.length > 0) && <div className="mt-3 space-y-2">{(form.supportingDocumentNames ?? []).map((name) => <div key={`saved-${name}`} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2"><span className="min-w-0 truncate text-xs font-semibold text-slate-600">{name}</span><span className="text-[10px] font-bold uppercase text-emerald-600">Saved</span></div>)}{remoteAdditionalDocuments.map((document, index) => <div key={`remote-${document.url}`} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2"><span className="min-w-0 truncate text-xs font-semibold text-slate-600">{document.name}</span><button type="button" onClick={() => setRemoteAdditionalDocuments((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="ml-3 rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></div>)}{supportingFiles.map(({ file: supportingFile, url: supportingUrl }, index) => <div key={`${supportingFile.name}-${index}`} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2"><span className="min-w-0 truncate text-xs font-semibold text-slate-600">{supportingFile.name}</span><button type="button" onClick={() => { URL.revokeObjectURL(supportingUrl); setSupportingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index)); }} className="ml-3 rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>}
              </div>
              <label className={cn(fieldLabel, "sm:col-span-2")}>Narration / Notes<textarea rows={3} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm font-medium text-slate-800 outline-none focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10" value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Add bill purpose, remarks or control notes" /></label>
            </div>
          </section>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-slate-100 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-slate-400">The uploaded document is required for Bill Inward.</p>
          <div className="flex justify-end gap-3"><button type="button" onClick={onClose} disabled={submitting} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button><button type="submit" disabled={submitting} className="h-11 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white hover:bg-[#0a4b3f] disabled:opacity-60">{submitting ? "Saving…" : existing ? "Save Changes" : "Save Bill Inward"}</button></div>
        </div>
      </form>
    </div>
  );
}

const initialPrrDetails = (record: FinanceRecord, bill?: FinanceRecord): PRRDetails => {
  const source = bill ?? record;
  const gross = Number(source.amount || 0);
  const base = Number(source.baseAmount || 0);
  return {
    prrType: "Payment",
    requestingDepartment: source.department || "Accounts",
    requestedBy: "SBR Admin",
    priority: source.billPriority === "Urgent" ? "Urgent" : "Normal",
    impact: "",
    payeeType: source.vendorId ? "Vendor" : "Other",
    vendorCode: source.vendorId || "",
    gstin: source.vendorGstin || "",
    pan: "",
    bankAccount: "",
    paymentAgainst: source.referenceType === "WO" ? "WO" : source.referenceType === "PO" ? "PO" : "Invoice",
    invoiceNumber: source.reference || "",
    invoiceDate: source.invoiceDate || "",
    costCentre: source.costCentre || "",
    costAttribution: source.costAttribution || "",
    projectCluster: source.project || "",
    landSite: source.site || "",
    basicAmount: base,
    taxableAmount: base,
    cgst: Number(source.cgstAmount || 0),
    sgst: Number(source.sgstAmount || 0),
    igst: Number(source.igstAmount || 0),
    otherCharges: Number(source.otherAdjustment || 0),
    grossInvoiceAmount: gross,
    advanceAdjusted: 0,
    noteAdjustment: 0,
    retentionAmount: 0,
    tdsDeduction: 0,
    otherDeduction: 0,
    netPayableAmount: gross,
    tdsApplicable: source.tdsApplicable || "No",
    tdsSection: "",
    tdsRate: 0,
    tdsBaseAmount: base,
    tdsAmount: 0,
    rcmApplicable: "No",
    ledgerHead: "",
    subLedger: source.party || "",
    accountingCostCentre: source.costCentre || "",
    budgetHead: "",
    budgetAvailable: 0,
    accountingNarration: source.notes || "",
    paymentMode: "NEFT",
    paymentTerms: source.paymentTerms || "",
    bankAccountFrom: "",
    paymentExtent: "Full Payment",
    requestedPaymentAmount: gross,
    supportingDocuments: source.supportingDocumentNames || [],
    requesterRemarks: "",
    accountsRemarks: "",
    preparedBy: "SBR Admin",
    checkedBy: "Pending",
    approvedBy: "Pending",
    financeApproval: "Pending",
    ...record.prrDetails,
  };
};

type PrrModalProps = {
  record: FinanceRecord;
  bills: FinanceRecord[];
  onClose: () => void;
  onSave: (record: FinanceRecord) => void;
};

function PrrDocumentPreview({ record, details, taxInvoiceName, poWoName, completionName }: { record: FinanceRecord; details: PRRDetails; taxInvoiceName: string; poWoName: string; completionName: string }) {
  const value = (input?: string | number) => input === undefined || input === null || input === "" ? "—" : String(input);
  const Kv = ({ label, children }: { label: string; children?: ReactNode }) => <><td className="w-1/5 border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-600">{label}</td><td className="w-[30%] border border-slate-200 px-2.5 py-1.5 text-[10px] text-slate-700">{children || "—"}</td></>;
  const band = (title: string) => <div className="mt-3 rounded-t-md bg-[#0D3A35] py-1.5 text-center text-[10px] font-extrabold tracking-[0.16em] text-white">{title}</div>;
  const amountRows: Array<[string, number]> = [
    ["Basic Amount", details.basicAmount], ["Taxable Amount", details.taxableAmount], ["CGST", details.cgst], ["SGST", details.sgst], ["IGST", details.igst],
    ["Other Charges", details.otherCharges], ["Gross Invoice Amount", details.grossInvoiceAmount], ["Advance Adjusted", details.advanceAdjusted],
    ["Debit / Credit Note Adjustment", details.noteAdjustment], ["Retention / Hold", details.retentionAmount], ["TDS Deduction", details.tdsDeduction], ["Other Deduction", details.otherDeduction],
  ];
  return (
    <div className="min-h-[1123px] bg-white p-6 text-slate-800">
      <div className="text-center">
        <img src={logo3f} alt="Sai Bioresources" className="mx-auto mb-1 h-14 w-auto object-contain" />
        <div className="text-[15px] font-extrabold tracking-wide">SAI BIORESOURCES PRIVATE LIMITED</div>
        <div className="mt-0.5 text-[9px] text-slate-500">Khasra No. 121/1, Kachandur-Dhour Road, Village Jeora, Durg, Chhattisgarh - 491001</div>
        <div className="mt-2 rounded-md bg-[#0D3A35] py-2 text-[13px] font-extrabold tracking-[0.14em] text-white">PAYMENT REQUEST / PRR</div>
      </div>

      <table className="mt-3 w-full border-collapse"><tbody>
        <tr><Kv label="PRR No.">{value(record.reference)}</Kv><Kv label="PRR Date">{formatRegisterDate(record.date)}</Kv></tr>
        <tr><Kv label="PRR Type">{value(details.prrType)}</Kv><Kv label="Priority">{value(details.priority)}</Kv></tr>
        <tr><Kv label="Department">{value(details.requestingDepartment)}</Kv><Kv label="Requested By">{value(details.requestedBy)}</Kv></tr>
        <tr><Kv label="Impact">{value(details.impact)}</Kv><Kv label="Status">{value(record.status)}</Kv></tr>
        <tr><Kv label="Due Date">{formatRegisterDate(record.dueDate)}</Kv><Kv label="Payment Type">{value(details.paymentExtent)}</Kv></tr>
      </tbody></table>

      {band("PAYEE & REFERENCE DETAILS")}
      <table className="w-full border-collapse"><tbody>
        <tr><Kv label="Payee Type">{value(details.payeeType)}</Kv><Kv label="Vendor Code">{value(details.vendorCode)}</Kv></tr>
        <tr><Kv label="Vendor / Payee">{value(record.party)}</Kv><Kv label="GSTIN / PAN">{[details.gstin, details.pan].filter(Boolean).join(" / ") || "—"}</Kv></tr>
        <tr><Kv label="Payment Against">{value(details.paymentAgainst)}</Kv><Kv label="Bill Inward No.">{value(record.sourceBillInwardNo)}</Kv></tr>
        <tr><Kv label="Invoice No.">{value(details.invoiceNumber)}</Kv><Kv label="Invoice Date">{formatRegisterDate(details.invoiceDate)}</Kv></tr>
        <tr><Kv label="PO / WO No.">{value(record.poWoReference)}</Kv><Kv label="GRN / WCC">{value(record.grnServiceReference)}</Kv></tr>
        <tr><Kv label="Cost Centre">{value(details.costCentre)}</Kv><Kv label="Cost Attribution">{value(details.costAttribution)}</Kv></tr>
        <tr><Kv label="Project / Cluster">{value(details.projectCluster)}</Kv><Kv label="Site / Land">{value(details.landSite)}</Kv></tr>
        <tr><Kv label="Payment Terms">{value(details.paymentTerms)}</Kv><Kv label="Impact">{value(details.impact)}</Kv></tr>
      </tbody></table>

      {band("AMOUNT & TAX SUMMARY")}
      <div className="grid grid-cols-2 border-x border-slate-200">
        {amountRows.map(([label, amount]) => <div key={label} className="flex items-center justify-between border-b border-slate-200 px-3 py-1.5 text-[10px]"><span className="font-semibold text-slate-600">{label}</span><span className="font-bold tabular-nums">{formatCurrency(Number(amount || 0))}</span></div>)}
      </div>
      <div className="flex items-center justify-between border-2 border-[#0D3A35] bg-emerald-50/50 px-4 py-3"><span className="text-[12px] font-extrabold text-[#0D3A35]">NET PAYABLE AMOUNT</span><span className="text-[16px] font-extrabold text-[#0D3A35]">{formatCurrency(details.netPayableAmount)}</span></div>

      {band("ACCOUNTING & PAYMENT DETAILS")}
      <table className="w-full border-collapse"><tbody>
        <tr><Kv label="Ledger Head">{value(details.ledgerHead)}</Kv><Kv label="Sub Ledger">{value(details.subLedger)}</Kv></tr>
        <tr><Kv label="Cost Centre">{value(details.accountingCostCentre)}</Kv><Kv label="Cost Attribution">{value(details.costAttribution)}</Kv></tr>
        <tr><Kv label="Budget Head">{value(details.budgetHead)}</Kv><Kv label="Budget Available">{formatCurrency(details.budgetAvailable)}</Kv></tr>
        <tr><Kv label="TDS">{details.tdsApplicable === "Yes" ? `${value(details.tdsSection)} @ ${details.tdsRate || 0}%` : "Not Applicable"}</Kv><Kv label="RCM Applicable">{value(details.rcmApplicable)}</Kv></tr>
        <tr><Kv label="Payment Mode">{value(details.paymentMode)}</Kv><Kv label="Payment Type">{value(details.paymentExtent)}</Kv></tr>
        <tr><Kv label="Bank Account From">{value(details.bankAccountFrom)}</Kv><Kv label="Requested Amount">{formatCurrency(details.requestedPaymentAmount)}</Kv></tr>
        <tr><Kv label="Payment Terms">{value(details.paymentTerms)}</Kv><Kv label="Narration">{value(details.accountingNarration)}</Kv></tr>
      </tbody></table>

      {band("SUPPORTING DOCUMENTS")}
      <table className="w-full border-collapse"><tbody>
        <tr><Kv label="Tax Invoice">{value(taxInvoiceName)}</Kv><Kv label="PO / WO">{value(poWoName)}</Kv></tr>
        <tr><Kv label="GRN / WCC">{value(completionName)}</Kv><Kv label="Other Documents">{details.supportingDocuments.join(", ") || "—"}</Kv></tr>
      </tbody></table>

      {band("REMARKS")}
      <div className="grid min-h-16 grid-cols-2 border border-slate-200 text-[10px]"><div className="border-r border-slate-200 p-2"><b>Requester:</b> {value(details.requesterRemarks)}</div><div className="p-2"><b>Accounts:</b> {value(details.accountsRemarks)}</div></div>

      {band("APPROVAL TRAIL")}
      <div className="grid grid-cols-4 border-x border-b border-slate-200 text-center text-[9px]">
        {[["Prepared By", details.preparedBy], ["Checked By", details.checkedBy], ["Approved By", details.approvedBy], ["Finance Approval", details.financeApproval]].map(([label, person]) => <div key={label} className="min-h-20 border-r border-slate-200 p-2 last:border-r-0"><div className="font-extrabold text-[#0D3A35]">{label}</div><div className="mt-4 text-slate-600">{value(person)}</div><div className="mt-2 border-t border-dashed border-slate-300 pt-1 text-slate-400">Signature / Date</div></div>)}
      </div>
      <div className="mt-3 flex justify-between border-t border-slate-200 pt-2 text-[8px] text-slate-400"><span>System-generated Payment Request</span><span>{record.reference || "Draft PRR"}</span><span>Page 1</span></div>
    </div>
  );
}

function PrrModal({ record, bills, onClose, onSave }: PrrModalProps) {
  const linkedBill = bills.find((bill) => bill.id === record.sourceBillId || bill.billInwardNo === record.sourceBillInwardNo);
  const [form, setForm] = useState<FinanceRecord>(() => ({ ...record, status: record.status === "Pending Approval" ? "Draft" : record.status || "Draft" }));
  const [details, setDetails] = useState<PRRDetails>(() => initialPrrDetails(record, linkedBill));
  const [accountingDimensions] = useState<AccountingDimensions>(loadAccountingDimensions);

  const update = <K extends keyof PRRDetails>(key: K, value: PRRDetails[K]) => setDetails((current) => ({ ...current, [key]: value }));
  const numberUpdate = (key: keyof PRRDetails, value: string) => update(key, (Number(value) || 0) as never);
  const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10 disabled:bg-slate-50 disabled:text-slate-500";
  const textareaClass = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium text-slate-800 outline-none focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10";
  const labelClass = "space-y-2 text-xs font-bold text-slate-600";
  const moneyField = (label: string, key: keyof PRRDetails, readOnly = false) => (
    <label className={labelClass}>{label}<div className="relative"><IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="number" min="0" step="0.01" readOnly={readOnly} className={`${inputClass} pl-9 ${readOnly ? "bg-slate-50" : ""}`} value={String(details[key] || "")} onChange={(event) => numberUpdate(key, event.target.value)} placeholder="0.00" /></div></label>
  );
  const section = (title: string, description: string, children: ReactNode) => (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-[#edf5f2] px-5 py-3"><h3 className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#0d5c4d]">{title}</h3><p className="mt-1 text-xs text-slate-500">{description}</p></div>
      <div className="grid gap-4 p-5 sm:grid-cols-2">{children}</div>
    </section>
  );

  useEffect(() => {
    const tds = details.tdsApplicable === "Yes" ? Number(details.tdsBaseAmount || 0) * Number(details.tdsRate || 0) / 100 : 0;
    const gross = Number(details.grossInvoiceAmount || 0);
    const net = Math.max(0, gross - Number(details.advanceAdjusted || 0) - Number(details.noteAdjustment || 0) - Number(details.retentionAmount || 0) - tds - Number(details.otherDeduction || 0));
    setDetails((current) => current.tdsAmount === tds && current.tdsDeduction === tds && current.netPayableAmount === net ? current : { ...current, tdsAmount: tds, tdsDeduction: tds, netPayableAmount: net, requestedPaymentAmount: current.paymentExtent === "Full Payment" ? net : Math.min(current.requestedPaymentAmount || 0, net) });
  }, [details.advanceAdjusted, details.grossInvoiceAmount, details.noteAdjustment, details.otherDeduction, details.paymentExtent, details.retentionAmount, details.tdsApplicable, details.tdsBaseAmount, details.tdsRate]);

  useEffect(() => {
    let active = true;
    const vendorCode = details.vendorCode.trim();
    if (!vendorCode) return () => { active = false; };
    const loadPayeeDetails = async () => {
      try {
        const response = await fetch(`${String(getBaseUrl() ?? "").replace(/\/$/, "")}/admin_accounts/get_vendor_details/${encodeURIComponent(vendorCode)}`, { headers: { Accept: "application/json" } });
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        const vendor = payload?.vendor_details ?? payload?.data?.vendor_details ?? payload?.data?.data?.vendor_details ?? {};
        if (!active) return;
        setDetails((current) => ({ ...current, gstin: current.gstin || String(vendor?.gst_number ?? vendor?.gstin ?? ""), pan: current.pan || String(vendor?.pan_number ?? vendor?.pan ?? "") }));
      } catch {
        // Bill-linked vendor data remains available if the live Vendor Master is unavailable.
      }
    };
    void loadPayeeDetails();
    return () => { active = false; };
  }, [details.vendorCode]);

  const selectBill = (billId: string) => {
    const bill = bills.find((item) => item.id === billId);
    if (!bill) {
      setForm((current) => ({ ...current, sourceBillId: "", sourceBillInwardNo: "" }));
      return;
    }
    setForm((current) => ({ ...current, sourceBillId: bill.id, sourceBillInwardNo: bill.billInwardNo || bill.reference, party: bill.party, vendorId: bill.vendorId, dueDate: bill.dueDate, poWoReference: bill.poWoReference, referenceType: bill.referenceType, grnServiceReference: bill.grnServiceReference, department: bill.department, project: bill.project, site: bill.site, amount: bill.amount }));
    setDetails(initialPrrDetails({ ...form, prrDetails: undefined }, bill));
  };

  const selectedBill = bills.find((bill) => bill.id === form.sourceBillId);
  const taxInvoiceName = selectedBill?.attachmentName || linkedBill?.attachmentName || "Not linked";
  const poWoName = form.poWoReference || "Not linked";
  const completionName = form.grnServiceReference || "Not linked";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave({ ...form, entryType: "Payment Request / PRR", party: form.party, vendorId: details.vendorCode || form.vendorId, amount: details.requestedPaymentAmount || details.netPayableAmount, notes: details.accountingNarration || details.requesterRemarks, department: details.requestingDepartment, costCentre: details.costCentre, costAttribution: details.costAttribution, project: details.projectCluster, site: details.landSite, status: form.status || "Draft", prrDetails: details });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form onSubmit={submit} className="flex h-[95vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-3xl bg-[#f6f8fa] shadow-2xl">
        <div className="flex shrink-0 items-start justify-between bg-[#0d473f] px-7 py-5 text-white">
          <div><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/60">Payments & Receipts · Payment Request</p><h2 className="mt-1 text-2xl font-bold">Create Payment Request / PRR</h2><p className="mt-1 text-sm text-white/65">Complete the payable, accounting, tax and approval information.</p></div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-white/70 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid min-h-0 flex-1 lg:grid-cols-2">
          <div className="min-h-0 overflow-y-auto border-b border-slate-200 p-5 sm:p-6 lg:order-2 lg:border-b-0 lg:border-l">
            <div className="space-y-5">
            {section("PRR Header", "Request identity and priority.", <>
              <label className={labelClass}>PRR No.<input readOnly className={`${inputClass} bg-slate-50`} value={form.reference} /></label>
              <label className={labelClass}>PRR Date<input required type="date" className={inputClass} value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></label>
              <label className={labelClass}>PRR Type<select className={inputClass} value={details.prrType} onChange={(event) => update("prrType", event.target.value)}>{["Payment", "Accounting", "Advance", "Reimbursement", "Statutory"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className={labelClass}>Requesting Department<select className={inputClass} value={details.requestingDepartment} onChange={(event) => update("requestingDepartment", event.target.value)}><option value="">Select department</option>{Array.from(new Set(["Accounts", "Procurement", "Operations", "HR", ...accountingDimensions.departments.map((item) => item.name)])).map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className={labelClass}>Requested By<input required className={inputClass} value={details.requestedBy} onChange={(event) => update("requestedBy", event.target.value)} placeholder="Employee name" /></label>
              <label className={labelClass}>Priority<select className={inputClass} value={details.priority} onChange={(event) => update("priority", event.target.value)}>{["Normal", "Urgent", "Critical"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className={`${labelClass} sm:col-span-2`}>Impact<input className={inputClass} value={details.impact} onChange={(event) => update("impact", event.target.value)} placeholder="Describe the business, operational or compliance impact" /></label>
            </>)}

            {section("Party Details", "Payee identity and settlement account.", <>
              <label className={labelClass}>Payee Type<select className={inputClass} value={details.payeeType} onChange={(event) => update("payeeType", event.target.value)}>{["Vendor", "Employee", "Government", "Other"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className={labelClass}>Vendor / Payee Name<input required list="prr-payee-list" className={inputClass} value={form.party} onChange={(event) => setForm((current) => ({ ...current, party: event.target.value }))} placeholder="Search payee" /><datalist id="prr-payee-list">{Array.from(new Set(bills.map((bill) => bill.party).filter(Boolean))).map((party) => <option key={party} value={party} />)}</datalist></label>
              <label className={labelClass}>Vendor Code<input readOnly className={`${inputClass} bg-slate-50`} value={details.vendorCode} placeholder="Auto from vendor" /></label>
              <label className={labelClass}>GSTIN<input readOnly className={`${inputClass} bg-slate-50`} value={details.gstin} placeholder="Auto from vendor" /></label>
              <label className={labelClass}>PAN<input className={inputClass} value={details.pan} onChange={(event) => update("pan", event.target.value.toUpperCase())} placeholder="Vendor PAN" /></label>
            </>)}

            {section("Reference Details", "Link the verified source bill and receiving documents.", <>
              <label className={labelClass}>Payment Against<select className={inputClass} value={details.paymentAgainst} onChange={(event) => update("paymentAgainst", event.target.value)}>{["Invoice", "PO", "WO", "Advance", "Expense", "Salary", "Statutory", "Other"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className={labelClass}>Bill Inward No.<select className={inputClass} value={form.sourceBillId || ""} onChange={(event) => selectBill(event.target.value)}><option value="">Select verified bill</option>{bills.map((bill) => <option key={bill.id} value={bill.id}>{bill.billInwardNo || bill.reference} · {bill.party}</option>)}</select></label>
              <label className={labelClass}>Invoice No.<input readOnly className={`${inputClass} bg-slate-50`} value={details.invoiceNumber} /></label>
              <label className={labelClass}>Invoice Date<input readOnly type="date" className={`${inputClass} bg-slate-50`} value={details.invoiceDate} /></label>
              <label className={labelClass}>PO / WO No.<input readOnly className={`${inputClass} bg-slate-50`} value={form.poWoReference || ""} placeholder="Linked reference" /></label>
              <label className={labelClass}>GRN / WCC / Service Entry<input readOnly className={`${inputClass} bg-slate-50`} value={form.grnServiceReference || ""} placeholder="Linked reference" /></label>
              <label className={labelClass}>Cost Centre<select className={inputClass} value={details.costCentre} onChange={(event) => setDetails((current) => ({ ...current, costCentre: event.target.value, accountingCostCentre: event.target.value }))}><option value="">Select active cost centre</option>{accountingDimensions.costCentres.map((item) => <option key={item.id} value={item.name}>{item.code} · {item.name}</option>)}</select></label>
              <label className={labelClass}>Cost Attribution<select className={inputClass} value={details.costAttribution} onChange={(event) => update("costAttribution", event.target.value)}><option value="">Select active cost attribution</option>{accountingDimensions.costAttributions.map((item) => <option key={item.id} value={item.code}>{item.code} · {item.name}{item.level ? ` · ${item.level}` : ""}</option>)}</select></label>
              <label className={labelClass}>Project / Cluster<select className={inputClass} value={details.projectCluster} onChange={(event) => update("projectCluster", event.target.value)}><option value="">Select project</option>{accountingDimensions.projects.map((item) => <option key={item.id} value={item.name}>{item.code} · {item.name}</option>)}</select></label>
              <label className={labelClass}>Land Parcel / Site<select className={inputClass} value={details.landSite} onChange={(event) => update("landSite", event.target.value)}><option value="">Optional</option>{accountingDimensions.sites.map((item) => <option key={item.id} value={item.name}>{item.code} · {item.name}</option>)}</select></label>
            </>)}

            {section("Amount Details", "Invoice value, adjustments and net payable amount.", <>
              {moneyField("Basic Amount", "basicAmount")}{moneyField("Taxable Amount", "taxableAmount")}{moneyField("CGST", "cgst")}{moneyField("SGST", "sgst")}{moneyField("IGST", "igst")}{moneyField("Other Charges", "otherCharges")}{moneyField("Gross Invoice Amount", "grossInvoiceAmount")}{moneyField("Advance Adjusted", "advanceAdjusted")}{moneyField("Debit / Credit Note Adjustment", "noteAdjustment")}{moneyField("Retention / Hold Amount", "retentionAmount")}{moneyField("TDS Deduction", "tdsDeduction", true)}{moneyField("Other Deduction", "otherDeduction")}{moneyField("Net Payable Amount", "netPayableAmount", true)}
            </>)}

            {section("TDS / Tax", "Configure withholding tax and reverse charge.", <>
              <label className={labelClass}>TDS Applicable<select className={inputClass} value={details.tdsApplicable} onChange={(event) => update("tdsApplicable", event.target.value)}><option>No</option><option>Yes</option></select></label>
              <label className={labelClass}>TDS Section<select disabled={details.tdsApplicable !== "Yes"} className={inputClass} value={details.tdsSection} onChange={(event) => update("tdsSection", event.target.value)}><option value="">Select section</option>{["194C", "194J", "194I", "194H", "194Q"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className={labelClass}>TDS Rate (%)<input disabled={details.tdsApplicable !== "Yes"} type="number" min="0" step="0.01" className={inputClass} value={details.tdsRate || ""} onChange={(event) => numberUpdate("tdsRate", event.target.value)} /></label>
              {moneyField("TDS Base Amount", "tdsBaseAmount")}{moneyField("TDS Amount", "tdsAmount", true)}
              <label className={labelClass}>RCM Applicable<select className={inputClass} value={details.rcmApplicable} onChange={(event) => update("rcmApplicable", event.target.value)}><option>No</option><option>Yes</option></select></label>
            </>)}

            {section("Accounting", "Ledger, budget and cost allocation.", <>
              <label className={labelClass}>Expense / Ledger Head<select className={inputClass} value={details.ledgerHead} onChange={(event) => update("ledgerHead", event.target.value)}><option value="">Select ledger head</option>{["Purchases", "Contractor Charges", "Repairs & Maintenance", "Employee Reimbursement", "Statutory Payable", "Other Expense"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className={labelClass}>Sub Ledger<input className={inputClass} value={details.subLedger} onChange={(event) => update("subLedger", event.target.value)} placeholder="Vendor / employee" /></label>
              <label className={labelClass}>Cost Centre<select className={inputClass} value={details.accountingCostCentre} onChange={(event) => setDetails((current) => ({ ...current, accountingCostCentre: event.target.value, costCentre: event.target.value }))}><option value="">Select active cost centre</option>{accountingDimensions.costCentres.map((item) => <option key={item.id} value={item.name}>{item.code} · {item.name}</option>)}</select></label>
              <label className={labelClass}>Cost Attribution<select className={inputClass} value={details.costAttribution} onChange={(event) => update("costAttribution", event.target.value)}><option value="">Select active cost attribution</option>{accountingDimensions.costAttributions.map((item) => <option key={item.id} value={item.code}>{item.code} · {item.name}{item.level ? ` · ${item.level}` : ""}</option>)}</select></label>
              <label className={labelClass}>Budget Head<select className={inputClass} value={details.budgetHead} onChange={(event) => update("budgetHead", event.target.value)}><option value="">Select budget head</option><option>Operating Expenses</option><option>Project Expenses</option><option>Capital Expenditure</option></select></label>
              <label className={labelClass}>Budget Available<input readOnly className={`${inputClass} bg-slate-50`} value={formatCurrency(details.budgetAvailable)} /></label>
              <label className={`${labelClass} sm:col-span-2`}>Accounting Narration<textarea rows={3} className={textareaClass} value={details.accountingNarration} onChange={(event) => update("accountingNarration", event.target.value)} placeholder="Accounting narration" /></label>
            </>)}

            {section("Payment Details", "Settlement method and requested amount.", <>
              <label className={labelClass}>Payment Mode<select className={inputClass} value={details.paymentMode} onChange={(event) => update("paymentMode", event.target.value)}>{["NEFT", "RTGS", "IMPS", "UPI", "Cheque", "Cash"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className={labelClass}>Payment Due Date<input type="date" className={inputClass} value={form.dueDate || ""} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} /></label>
              <label className={labelClass}>Payment Terms<input className={inputClass} value={details.paymentTerms} onChange={(event) => update("paymentTerms", event.target.value)} placeholder="Auto from vendor / order" /></label>
              <label className={labelClass}>Bank Account From<select className={inputClass} value={details.bankAccountFrom} onChange={(event) => update("bankAccountFrom", event.target.value)}><option value="">Select company bank</option><option>Primary Current Account</option><option>Project Bank Account</option></select></label>
              <label className={labelClass}>Partial / Full Payment<select className={inputClass} value={details.paymentExtent} onChange={(event) => update("paymentExtent", event.target.value)}><option>Full Payment</option><option>Partial Payment</option></select></label>
              {moneyField("Requested Payment Amount", "requestedPaymentAmount", details.paymentExtent === "Full Payment")}
            </>)}

            {section("Supporting Documents", "Review linked records and attach approvals.", <>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">Tax Invoice</p><p className="mt-2 break-all text-sm font-semibold text-slate-800">{taxInvoiceName}</p></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">PO / WO</p><p className="mt-2 break-all text-sm font-semibold text-slate-800">{poWoName}</p></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">GRN / WCC</p><p className="mt-2 break-all text-sm font-semibold text-slate-800">{completionName}</p></div>
              <label className="flex min-h-24 cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#9cc7bb] bg-[#f3f9f7] px-4 text-sm font-bold text-[#0d5c4d] hover:bg-[#edf7f4]"><UploadCloud className="h-5 w-5" />Approval / Supporting Document<input type="file" multiple className="sr-only" onChange={(event) => update("supportingDocuments", Array.from(event.target.files || []).map((file) => file.name))} /></label>
              <div className="sm:col-span-2"><p className="text-xs font-bold text-slate-500">Selected documents</p><p className="mt-2 text-sm font-semibold text-slate-700">{details.supportingDocuments.join(", ") || "No additional documents selected"}</p></div>
            </>)}

            {section("Remarks", "Requester and accounts notes.", <>
              <label className={`${labelClass} sm:col-span-1`}>Requester Remarks<textarea rows={3} className={textareaClass} value={details.requesterRemarks} onChange={(event) => update("requesterRemarks", event.target.value)} /></label>
              <label className={`${labelClass} sm:col-span-1 xl:col-span-2`}>Accounts Remarks<textarea rows={3} className={textareaClass} value={details.accountsRemarks} onChange={(event) => update("accountsRemarks", event.target.value)} /></label>
            </>)}

            {section("Approval", "Workflow ownership and current status.", <>
              <label className={labelClass}>Prepared By<input readOnly className={`${inputClass} bg-slate-50`} value={details.preparedBy} /></label>
              <label className={labelClass}>Checked By<input readOnly className={`${inputClass} bg-slate-50`} value={details.checkedBy} /></label>
              <label className={labelClass}>Approved By<input readOnly className={`${inputClass} bg-slate-50`} value={details.approvedBy} /></label>
              <label className={labelClass}>Finance Approval<input readOnly className={`${inputClass} bg-slate-50`} value={details.financeApproval} /></label>
              <label className={labelClass}>Status<select className={inputClass} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>{["Draft", "Submitted", "Under Review", "Approved", "Rejected", "Paid"].map((item) => <option key={item}>{item}</option>)}</select></label>
            </>)}
            </div>
          </div>
          <aside className="flex min-h-0 flex-col bg-[#eef3f7] p-4 sm:p-5 lg:order-1">
            <div className="mb-3 shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#0d5c4d]">Live PRR Preview</p>
              <p className="mt-1 text-xs text-slate-500">Updates automatically as the payment request is completed.</p>
            </div>
            <div className="min-h-[480px] flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-200/70 p-2">
              <DocumentFitFrame pageWidth={794}><PrrDocumentPreview record={form} details={details} taxInvoiceName={taxInvoiceName} poWoName={poWoName} completionName={completionName} /></DocumentFitFrame>
            </div>
          </aside>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-7 py-4">
          <p className="text-xs font-medium text-slate-400">Net payable: <span className="font-extrabold text-[#0d5c4d]">{formatCurrency(details.netPayableAmount)}</span></p>
          <div className="flex gap-3"><button type="button" onClick={onClose} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button><button type="submit" className="h-11 rounded-xl bg-[#0d5c4d] px-6 text-sm font-bold text-white hover:bg-[#0a4b3f]">Save PRR</button></div>
        </div>
      </form>
    </div>
  );
}

function GenericEntryModal({ module, tab, existing, onClose, onSave }: EntryModalProps) {
  const [form, setForm] = useState<Omit<FinanceRecord, "id">>(() => existing ? { ...existing } : initialForm(module, tab));

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave({ ...form, id: existing?.id ?? `FA-${Date.now()}` });
  };

  const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between bg-[#0d473f] px-6 py-5 text-white">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/60">{module.title} · {tab.label}</p>
            <h2 className="mt-1 text-xl font-bold">{existing ? "Edit entry" : "Create new entry"}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid gap-5 p-6 sm:grid-cols-2">
          <label className="space-y-2 text-xs font-bold text-slate-600">Entry type *
            <select className={inputClass} value={form.entryType} onChange={(event) => update("entryType", event.target.value)}>
              {tab.features.map((feature) => <option key={feature}>{feature}</option>)}
            </select>
          </label>
          <label className="space-y-2 text-xs font-bold text-slate-600">Reference *
            <input required className={inputClass} value={form.reference} onChange={(event) => update("reference", event.target.value)} placeholder="Enter reference number" />
          </label>
          <label className="space-y-2 text-xs font-bold text-slate-600">Party / Account
            <input className={inputClass} value={form.party} onChange={(event) => update("party", event.target.value)} placeholder="Vendor, employee or account" />
          </label>
          <label className="space-y-2 text-xs font-bold text-slate-600">Entry date *
            <input required type="date" className={inputClass} value={form.date} onChange={(event) => update("date", event.target.value)} />
          </label>
          <label className="space-y-2 text-xs font-bold text-slate-600">Amount
            <input min="0" step="0.01" type="number" className={inputClass} value={form.amount || ""} onChange={(event) => update("amount", Number(event.target.value))} placeholder="0.00" />
          </label>
          <label className="space-y-2 text-xs font-bold text-slate-600">Status
            <select className={inputClass} value={form.status} onChange={(event) => update("status", event.target.value)}>
              {["Draft", "Pending Approval", "Verified", "Posted", "Paid", "Reconciled", "Closed"].map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
          <label className="space-y-2 text-xs font-bold text-slate-600 sm:col-span-2">Notes
            <textarea rows={3} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm font-medium text-slate-800 outline-none focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10" value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Add narration, remarks or control notes" />
          </label>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="submit" className="h-11 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white hover:bg-[#0a4b3f]">{existing ? "Save Changes" : "Save Entry"}</button>
        </div>
      </form>
    </div>
  );
}

function EntryModal(props: EntryModalProps) {
  const isBillInward = props.module.key === "bills-payables" && (props.tab.label === "Inward" || props.existing?.entryType === "Bill Inward");
  return isBillInward ? <BillInwardModal {...props} /> : <GenericEntryModal {...props} />;
}

function DocumentFitFrame({ pageWidth, children }: { pageWidth: number; children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [contentHeight, setContentHeight] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const update = () => {
      setFitScale(Math.min(1, Math.max(0.1, (container.clientWidth - 8) / pageWidth)));
      setContentHeight(content.scrollHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [pageWidth]);

  const scale = fitScale * zoom;

  return (
    <div className="flex h-full w-full min-h-0 flex-col overflow-hidden rounded-xl bg-slate-100">
      <div className="flex shrink-0 items-center justify-end gap-1.5 border-b border-slate-200 bg-white px-3 py-2">
        <button onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.15).toFixed(2))))} disabled={zoom <= 0.5} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35" title="Zoom out" aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></button>
        <span className="min-w-[58px] text-center text-xs font-bold text-slate-600">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((value) => Math.min(2.5, Number((value + 0.15).toFixed(2))))} disabled={zoom >= 2.5} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35" title="Zoom in" aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></button>
        <button onClick={() => setZoom(1)} className="ml-1 rounded-lg border border-[#b8d6ce] px-3 py-2 text-xs font-bold text-[#0d5c4d] hover:bg-[#eaf4f1]">Fit Page</button>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto p-1">
        <div className="mx-auto" style={{ width: pageWidth * scale, height: contentHeight * scale }}>
          <div ref={contentRef} style={{ width: pageWidth, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

function MediaPreviewFrame({ name, type, url }: { name: string; type: string; url: string }) {
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState(true);
  const changeZoom = (amount: number) => {
    setFitMode(false);
    setZoom((value) => Math.min(2.5, Math.max(0.5, Number((value + amount).toFixed(2)))));
  };
  const fitPage = () => {
    setZoom(1);
    setFitMode(true);
  };
  const pdfUrl = `${url}#toolbar=1&${fitMode ? "view=FitH" : `zoom=${Math.round(zoom * 100)}`}`;

  return (
    <div className="flex h-full w-full min-h-0 flex-col overflow-hidden rounded-xl bg-slate-100">
      <div className="flex shrink-0 items-center justify-end gap-1.5 border-b border-slate-200 bg-white px-3 py-2">
        <button onClick={() => changeZoom(-0.15)} disabled={zoom <= 0.5 && !fitMode} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35" title="Zoom out" aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></button>
        <span className="min-w-[58px] text-center text-xs font-bold text-slate-600">{fitMode ? "Fit" : `${Math.round(zoom * 100)}%`}</span>
        <button onClick={() => changeZoom(0.15)} disabled={zoom >= 2.5} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35" title="Zoom in" aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></button>
        <button onClick={fitPage} className="ml-1 rounded-lg border border-[#b8d6ce] px-3 py-2 text-xs font-bold text-[#0d5c4d] hover:bg-[#eaf4f1]">Fit Page</button>
      </div>
      {type === "application/pdf" ? <iframe key={pdfUrl} title={name} src={pdfUrl} className="min-h-0 flex-1 bg-white" /> : <div className="min-h-0 flex-1 overflow-auto p-2"><img src={url} alt={name} className="mx-auto h-auto max-w-none object-contain shadow-lg" style={{ width: `${zoom * 100}%` }} /></div>}
    </div>
  );
}

function PurchaseOrderReferencePreview({ order }: { order: Record<string, unknown> }) {
  const quote = order.purchase_quote && typeof order.purchase_quote === "object" ? order.purchase_quote as Record<string, unknown> : {};
  const terms = order.other_terms_and_condition && typeof order.other_terms_and_condition === "object" ? order.other_terms_and_condition as Record<string, unknown> : {};
  const rawItems = Array.isArray(order.item_details) && order.item_details.length ? order.item_details as Record<string, unknown>[] : Array.isArray(quote.order_lines) ? quote.order_lines as Record<string, unknown>[] : [];
  const items = rawItems.map((item) => {
    const quantity = Number(item.quantity ?? 0);
    const unitRate = Number(item.unit_rate ?? item.unitRate ?? 0);
    const gst = Number(item.gst_percent ?? item.gstPercent ?? 0);
    const base = quantity * unitRate;
    return { name: String(item.name ?? item.description ?? "Item"), quantity, unitRate, gst, uom: String(item.uom ?? ""), base, total: base + (base * gst / 100) };
  });
  const basic = items.reduce((sum, item) => sum + item.base, 0);
  const total = items.reduce((sum, item) => sum + item.total, 0);
  const poNumber = String(order.order_number ?? quote.poNo ?? quote.po_no ?? "");
  const vendorName = String(quote.vendorName ?? quote.vendor_name ?? quote.vendor_id ?? "Not recorded");
  const asRecord = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const stripHtml = (value: unknown) => String(value ?? "").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").trim();
  const annexureOne = asRecord(terms.annexure1);
  const customPage = asRecord(terms.custom_po_page);
  const requiredDocuments = Array.isArray(quote.requiredPurchaseDocuments) ? quote.requiredPurchaseDocuments : Array.isArray(quote.required_purchase_documents) ? quote.required_purchase_documents : [];
  const commercialSections = [
    ["Order Introduction", quote.coverOrderIntroduction], ["Commercial Reference", quote.coverCommercialReference],
    ["Scope of Work", terms.scopeOfWork], ["Basis of Price", terms.basisOfPrice], ["Taxes & Duties", terms.taxes],
    ["Delivery Timelines", terms.deliveryTimelines], ["Inspection", terms.inspection], ["Warranty / Guarantee", terms.warranty],
    ["Liquidated Damages / Delay Penalty", terms.ldPenalty], ["Installation Support", terms.installationSupport],
    ["Documents Required", terms.documentsRequired], ["Document Submission", terms.documents], ["Site & Billing Address", terms.siteBillingAddress],
  ].map(([title, content]) => ({ title: String(title), content: stripHtml(content) })).filter((section) => section.content);
  const correspondenceSections = [
    ["PO Acknowledgement", terms.correspondenceAcknowledgement], ["Order Acceptance", terms.correspondenceAcceptance],
  ].map(([title, content]) => ({ title: String(title), content: stripHtml(content) })).filter((section) => section.content);
  const annexureDetails = Array.isArray(order.annexure_details) ? order.annexure_details as unknown[] : [];
  const approval = asRecord(order.director_approval);
  const pageHeader = (title: string) => <><div className="border-b-4 border-[#0d473f] px-6 py-4 text-center"><p className="text-lg font-extrabold text-[#0d473f]">SAI BIORESOURCES PRIVATE LIMITED</p><p className="mt-1 text-[10px] text-slate-500">{poNumber}</p></div><div className="bg-[#0d473f] px-4 py-2 text-center text-sm font-extrabold uppercase tracking-[0.13em] text-white">{title}</div></>;

  return (
    <div className="w-full space-y-5 rounded-xl bg-slate-100 p-4 shadow-inner">
      <div className="mx-auto w-full max-w-[900px] border border-slate-300 bg-white text-slate-800">
        <div className="border-b-4 border-[#0d473f] px-6 py-5 text-center"><p className="text-lg font-extrabold text-[#0d473f]">SAI BIORESOURCES PRIVATE LIMITED</p><p className="mt-1 text-[10px] text-slate-500">Kachandur-Dhour Road, Village Jeora, Durg, Chhattisgarh – 491001</p></div>
        <div className="bg-[#0d473f] px-4 py-2 text-center text-sm font-extrabold tracking-[0.16em] text-white">PURCHASE ORDER</div>
        <div className="grid grid-cols-2 border-b border-slate-300 text-xs"><div className="border-r border-slate-300 p-3"><span className="font-bold">PO No.:</span> {poNumber || "—"}</div><div className="p-3"><span className="font-bold">PO Date:</span> {formatRegisterDate(String(quote.poDate ?? order.created_at ?? ""))}</div><div className="border-r border-t border-slate-300 p-3"><span className="font-bold">Vendor:</span> {vendorName}</div><div className="border-t border-slate-300 p-3"><span className="font-bold">Delivery Date:</span> {formatRegisterDate(String(quote.deliveryDate ?? ""))}</div></div>
        <div className="grid grid-cols-2 border-b border-slate-300 text-xs"><div className="border-r border-slate-300 p-3"><p className="font-bold">Vendor Address</p><p className="mt-1 text-slate-600">{String(quote.vendorAddr1 ?? quote.vendor_address ?? "Not recorded")}</p></div><div className="p-3"><p className="font-bold">Project / Ship To</p><p className="mt-1 text-slate-600">{String(quote.coverProject ?? quote.shipToAddress ?? "Not recorded")}</p></div></div>
        <table className="w-full text-xs"><thead className="bg-[#e7f3ef] text-[#0d473f]"><tr><th className="border border-slate-300 p-2">S.No.</th><th className="border border-slate-300 p-2 text-left">Item Description</th><th className="border border-slate-300 p-2">Qty</th><th className="border border-slate-300 p-2">UOM</th><th className="border border-slate-300 p-2 text-right">Unit Rate</th><th className="border border-slate-300 p-2">GST</th><th className="border border-slate-300 p-2 text-right">Total</th></tr></thead><tbody>{items.length ? items.map((item, index) => <tr key={`${item.name}-${index}`}><td className="border border-slate-300 p-2 text-center">{index + 1}</td><td className="border border-slate-300 p-2 font-semibold">{item.name}</td><td className="border border-slate-300 p-2 text-center">{item.quantity}</td><td className="border border-slate-300 p-2 text-center">{item.uom || "—"}</td><td className="border border-slate-300 p-2 text-right">{formatCurrency(item.unitRate)}</td><td className="border border-slate-300 p-2 text-center">{item.gst}%</td><td className="border border-slate-300 p-2 text-right font-bold">{formatCurrency(item.total)}</td></tr>) : <tr><td colSpan={7} className="border border-slate-300 p-5 text-center text-slate-400">No item details recorded</td></tr>}</tbody></table>
        <div className="ml-auto w-[45%] text-xs"><div className="flex justify-between border-x border-b border-slate-300 p-2"><span className="font-bold">Basic Order Value</span><span>{formatCurrency(basic)}</span></div><div className="flex justify-between border-x border-b border-slate-300 p-2"><span className="font-bold">GST</span><span>{formatCurrency(total - basic)}</span></div><div className="flex justify-between border-x border-b border-slate-300 bg-[#e7f3ef] p-2 text-[#0d473f]"><span className="font-extrabold">Total Order Value</span><span className="font-extrabold">{formatCurrency(total)}</span></div></div>
        <div className="grid grid-cols-2 gap-4 border-t border-slate-300 p-4 text-xs"><div><p className="font-bold text-[#0d473f]">Payment Terms</p><p className="mt-1 whitespace-pre-wrap text-slate-600">{String(quote.paymentTerms ?? terms.paymentTerms ?? "Not recorded")}</p></div><div><p className="font-bold text-[#0d473f]">Scope / Subject</p><p className="mt-1 whitespace-pre-wrap text-slate-600">{String(quote.coverSubject ?? terms.scopeOfWork ?? "Not recorded")}</p></div></div>
      </div>

      <div className="mx-auto w-full max-w-[900px] border border-slate-300 bg-white text-slate-800">
        {pageHeader("Commercial Terms & Conditions")}
        <div className="divide-y divide-slate-200 px-6 py-2">{commercialSections.length ? commercialSections.map((section, index) => <div key={section.title} className="py-4 text-xs"><p className="font-extrabold text-[#0d473f]">{index + 1}. {section.title}</p><p className="mt-2 whitespace-pre-wrap leading-5 text-slate-600">{section.content}</p></div>) : <p className="p-6 text-center text-xs text-slate-400">No commercial terms recorded</p>}</div>
      </div>

      {(annexureOne.termsText || correspondenceSections.length > 0) && <div className="mx-auto w-full max-w-[900px] border border-slate-300 bg-white text-slate-800">
        {pageHeader(String(annexureOne.annexureTitle || "General Terms & Conditions"))}
        <div className="space-y-5 p-6 text-xs leading-5 text-slate-600">{annexureOne.termsText && <p className="whitespace-pre-wrap">{stripHtml(annexureOne.termsText)}</p>}{correspondenceSections.map((section) => <div key={section.title}><p className="font-extrabold text-[#0d473f]">{section.title}</p><p className="mt-2 whitespace-pre-wrap">{section.content}</p></div>)}</div>
      </div>}

      {(customPage.contentHtml || customPage.annexureTitle) && <div className="mx-auto w-full max-w-[900px] border border-slate-300 bg-white text-slate-800">
        {pageHeader(String(customPage.annexureTitle || "Additional Clauses & Schedules"))}
        <div className="min-h-[220px] whitespace-pre-wrap p-6 text-xs leading-5 text-slate-600">{stripHtml(customPage.contentHtml) || "No additional clause content recorded."}</div>
      </div>}

      {annexureDetails.map((annexure, annexureIndex) => {
        const details = asRecord(annexure);
        const title = String(details.title ?? details.annexureTitle ?? `Annexure ${annexureIndex + 1}`);
        const entries = Object.entries(details).filter(([key]) => !["id", "title", "annexureTitle"].includes(key));
        return <div key={`${title}-${annexureIndex}`} className="mx-auto w-full max-w-[900px] border border-slate-300 bg-white text-slate-800">{pageHeader(title)}<div className="space-y-4 p-6">{entries.length ? entries.map(([key, value]) => <div key={key}><p className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-[#448274]">{key.replace(/_/g, " ")}</p><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">{typeof value === "string" ? stripHtml(value) : JSON.stringify(value, null, 2)}</p></div>) : <p className="text-xs text-slate-400">No annexure details recorded.</p>}</div></div>;
      })}

      <div className="mx-auto w-full max-w-[900px] border border-slate-300 bg-white text-slate-800">
        {pageHeader("Documents & Authorisation")}
        <div className="grid grid-cols-2 gap-6 p-6 text-xs"><div><p className="font-extrabold text-[#0d473f]">Required Purchase Documents</p>{requiredDocuments.length ? <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-600">{requiredDocuments.map((document, index) => <li key={`${String(document)}-${index}`}>{String(document)}</li>)}</ol> : <p className="mt-2 text-slate-400">Not recorded</p>}</div><div><p className="font-extrabold text-[#0d473f]">Director Approval</p><div className="mt-2 space-y-1 text-slate-600"><p><span className="font-bold">Status:</span> {String(approval.status ?? "Not recorded")}</p><p><span className="font-bold">Approved by:</span> {String(approval.staff_name ?? "Not recorded")}</p><p><span className="font-bold">Date:</span> {formatRegisterDate(String(approval.approval_date ?? ""))}</p><p><span className="font-bold">Time:</span> {String(approval.approval_time ?? "—")}</p></div></div></div>
      </div>
    </div>
  );
}

function ExactPurchaseOrderPreview({ order }: { order: Record<string, unknown> }) {
  const quote = order.purchase_quote && typeof order.purchase_quote === "object" ? order.purchase_quote as Record<string, unknown> : {};
  const poNumber = String(order.order_number ?? quote.poNo ?? quote.po_no ?? "").trim();
  const prNumber = String(order.pr_number ?? quote.pr_number ?? "").trim();
  const comparisonId = String(order.comparison_id ?? quote.comparison_id ?? "").trim();
  const vendorId = String(quote.vendor_id ?? quote.vendorId ?? quote.vendor_name ?? "").trim();
  const comparative = {
    id: comparisonId || prNumber || poNumber,
    indentId: prNumber,
    pr_number: prNumber,
    comparisonId,
    comparison_id: comparisonId,
    hoSelectedVendorId: vendorId,
  } as unknown as ComparativeModel;

  return <MakePurchaseOrderPopup open comparative={comparative} vendorId={vendorId} poNumber={poNumber} onClose={() => undefined} variant="inline" inlineSimulatePrint reviewOnly documentStatus="approved" />;
}

// Shown right after a bill is verified — books the liability against the vendor's accounts
// ledger via the same add_accounts_ledger_entry endpoint AccountsPayments.tsx already uses
// for its own "intake" step, so both flows post to the same place.
function LedgerEntryModal({ record, onClose, onPosted }: { record: FinanceRecord; onClose: () => void; onPosted: () => void }) {
  const totalGst = Number(record.cgstAmount || 0) + Number(record.sgstAmount || 0) + Number(record.igstAmount || 0);
  const totalPayable = Number(record.amount || 0) || (Number(record.baseAmount || 0) + totalGst + Number(record.otherAdjustment || 0));
  const [liabilityAmount, setLiabilityAmount] = useState(String(totalPayable || ""));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [selectedDocKey, setSelectedDocKey] = useState("");

  const documents = [
    ...(record.attachmentUrl ? [{ key: "bill", name: record.attachmentName || "Bill attachment", role: "bill" as const, type: record.attachmentType || (/\.pdf(\?|$)/i.test(record.attachmentUrl) ? "application/pdf" : "image/jpeg"), url: record.attachmentUrl }] : []),
    ...Object.entries(record.additionalDocumentUrls ?? {}).map(([name, url]) => ({ key: `add-${url}`, name, role: "supporting" as const, type: /\.pdf(\?|$)/i.test(url) ? "application/pdf" : "image/jpeg", url })),
  ];
  const selectedDocument = documents.find((document) => document.key === selectedDocKey) ?? documents[0];

  const handlePost = async () => {
    const amount = Number(liabilityAmount);
    if (!amount || amount <= 0) { toast.error("Enter the liability amount to book."); return; }
    if (!record.vendorId) { toast.error("This bill has no vendor on record."); return; }
    setSubmitting(true);
    try {
      const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/admin_accounts/add_accounts_ledger_entry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_id: record.vendorId,
          vendor_details: { vendor_name: record.party, gst_number: record.vendorGstin || "" },
          invoice_no: record.billInwardNo || record.reference || "",
          transfer_type: "debit",
          base_amount: amount,
          discount_percentage: 0,
          GST_percentage: 0,
          freight_charges: 0,
          other_charges: 0,
          tds_percentage: 0,
          date,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(data?.detail || data?.message || "Failed to post ledger entry");
      toast.success(`Liability of ${formatCurrency(amount)} booked for ${record.billInwardNo || record.reference}`);
      onPosted();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to post ledger entry");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-[2px]">
      <div className="flex max-h-[94vh] w-full max-w-[1300px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between bg-[#0d473f] px-6 py-5 text-white">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/60">Bills & Payables · Verification</p>
            <h2 className="mt-1 text-xl font-bold">Ledger Entry</h2>
            <p className="mt-1 text-xs font-medium text-white/60">{record.billInwardNo || record.reference} · {record.party} · verified, ready to book</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto bg-[#eef3f6] lg:grid-cols-[minmax(0,1fr)_minmax(400px,0.85fr)] lg:overflow-hidden">
          <section className="flex min-h-[420px] flex-col border-b border-slate-200 p-4 lg:min-h-0 lg:border-b-0 lg:border-r lg:p-5">
            <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.13em] text-slate-400">Documents on file</p>
            {documents.length > 1 && (
              <div className="mb-3 flex shrink-0 gap-2 overflow-x-auto pb-1">
                {documents.map((document) => (
                  <button key={document.key} type="button" onClick={() => setSelectedDocKey(document.key)} className={cn("flex min-w-[190px] items-center gap-2 rounded-xl border px-3 py-2 text-left", selectedDocument?.key === document.key ? "border-[#278b76] bg-[#e7f3ef] text-[#0d5c4d]" : "border-slate-200 bg-white text-slate-600 hover:border-[#b8d6ce]")}>
                    {document.type.startsWith("image/") ? <FileImage className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{document.name}</span><span className="mt-0.5 block text-[10px] font-semibold uppercase opacity-60">{document.role === "bill" ? "Bill Attachment" : "Supporting"}</span></span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex min-h-[380px] flex-1 items-center justify-center overflow-hidden rounded-2xl bg-slate-200/70 p-3 ring-1 ring-slate-300/70">
              {!selectedDocument ? (
                <div className="flex max-w-sm flex-col items-center px-6 text-center text-slate-400"><FileText className="h-9 w-9" /><p className="mt-3 text-sm font-bold text-slate-600">No documents on file</p></div>
              ) : selectedDocument.type === "application/pdf" || selectedDocument.type.startsWith("image/") ? (
                <MediaPreviewFrame name={selectedDocument.name} type={selectedDocument.type} url={selectedDocument.url} />
              ) : (
                <div className="flex max-w-xs flex-col items-center text-center text-slate-400"><FileText className="h-10 w-10" /><p className="mt-3 break-all text-sm font-bold text-slate-700">{selectedDocument.name}</p></div>
              )}
            </div>
          </section>

          <section className="overflow-y-auto bg-white p-5 sm:p-6">
            <div className="mb-4"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#18765f]">Invoice summary</p><h3 className="mt-1 text-lg font-bold text-slate-900">Confirm the liability to book</h3></div>
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Taxable / Base Amount</span><span className="font-semibold text-slate-800">{formatCurrency(Number(record.baseAmount || 0))}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">CGST</span><span className="font-semibold text-slate-800">{formatCurrency(Number(record.cgstAmount || 0))}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">SGST</span><span className="font-semibold text-slate-800">{formatCurrency(Number(record.sgstAmount || 0))}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">IGST</span><span className="font-semibold text-slate-800">{formatCurrency(Number(record.igstAmount || 0))}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-2"><span className="text-slate-500">Total GST</span><span className="font-semibold text-slate-800">{formatCurrency(totalGst)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Other Charges / Adjustment</span><span className="font-semibold text-slate-800">{formatCurrency(Number(record.otherAdjustment || 0))}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base"><span className="font-bold text-slate-700">Total Invoiced</span><span className="font-bold text-[#0d5c4d]">{formatCurrency(totalPayable)}</span></div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-xs font-bold text-slate-600">Liability Amount to Book *
                <input required type="number" min="0" step="0.01" value={liabilityAmount} onChange={(event) => setLiabilityAmount(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 outline-none focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10" />
              </label>
              <label className="space-y-2 text-xs font-bold text-slate-600">Entry Date *
                <input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 outline-none focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10" />
              </label>
            </div>
            {Number(liabilityAmount || 0) !== totalPayable && (
              <p className="mt-2 text-[11px] font-semibold text-amber-700">This differs from the invoice's total ({formatCurrency(totalPayable)}) — booking a partial or adjusted liability.</p>
            )}
          </section>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-6 py-4">
          <p className="text-xs font-medium text-slate-400">Posts to the vendor's accounts ledger as a liability.</p>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={submitting} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Skip for now</button>
            <button type="button" onClick={handlePost} disabled={submitting} className="h-11 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white hover:bg-[#0a4b3f] disabled:opacity-60">{submitting ? "Posting…" : "Post Ledger Entry"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BillVerificationPreview({ record, onClose, onVerify, onRequestPayment, onPostLedgerEntry, paymentRequested = false, actionMode = "verify" }: { record: FinanceRecord; onClose: () => void; onVerify: () => void; onRequestPayment?: () => void; onPostLedgerEntry?: () => void; paymentRequested?: boolean; actionMode?: "verify" | "pay" }) {
  const ledgerEntryPending = record.ledgerEntryStatus !== "completed";
  const [storedDocuments, setStoredDocuments] = useState<Array<StoredBillDocument & { url: string }>>([]);
  const [selectedDocumentKey, setSelectedDocumentKey] = useState("");
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [linkedDocumentsLoading, setLinkedDocumentsLoading] = useState(true);
  const [linkedDocumentPreviews, setLinkedDocumentPreviews] = useState<Record<string, { url: string; type: string }>>({});
  const [linkedPurchaseOrder, setLinkedPurchaseOrder] = useState<Record<string, unknown> | null>(null);
  const [linkedGrn, setLinkedGrn] = useState<GRNRecord | null>(null);

  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    void loadBillDocuments(record.id)
      .then((documents) => {
        if (!active) return;
        const withUrls = documents.map((document) => {
          const url = URL.createObjectURL(document.blob);
          urls.push(url);
          return { ...document, url };
        }).sort((a, b) => Number(a.role === "supporting") - Number(b.role === "supporting"));
        setStoredDocuments(withUrls);
        setSelectedDocumentKey(withUrls[0]?.key ?? "");
      })
      .catch(() => setStoredDocuments([]))
      .finally(() => active && setDocumentsLoading(false));
    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [record.id]);

  useEffect(() => {
    let active = true;
    const loadLinkedDocuments = async () => {
      const previews: Record<string, { url: string; type: string }> = {};
      const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
      const absoluteUrl = (value: string) => /^(https?:|blob:|data:)/i.test(value) ? value : `${baseUrl}/${value.replace(/^\//, "")}`;

      if (record.poWoReference && record.poWoReference !== "NA" && baseUrl) {
        try {
          const response = await fetch(`${baseUrl}/purchase_flow/get_all_purchase_orders`, { headers: { Accept: "application/json" } });
          const payload = response.ok ? await response.json().catch(() => null) : null;
          const orders: Record<string, unknown>[] = Array.isArray(payload?.purchase_orders) ? payload.purchase_orders : [];
          const selectedOrder = orders.find((order) => {
            const quote = order.purchase_quote && typeof order.purchase_quote === "object" ? order.purchase_quote as Record<string, unknown> : {};
            return [order.order_number, quote.order_number, quote.poNo, quote.po_no].some((value) => String(value ?? "").trim() === record.poWoReference);
          });
          if (selectedOrder) {
            if (active) setLinkedPurchaseOrder(selectedOrder);
            const quote = selectedOrder.purchase_quote && typeof selectedOrder.purchase_quote === "object" ? selectedOrder.purchase_quote as Record<string, unknown> : {};
            const rawUrl = String(selectedOrder.document_url ?? selectedOrder.doc_url ?? selectedOrder.file_url ?? quote.document_url ?? quote.doc_url ?? "").trim();
            previews.order = rawUrl ? { url: absoluteUrl(rawUrl), type: "application/pdf" } : { url: "", type: "application/x-purchase-order-preview" };
          }
        } catch {
          // The reference remains visible even when its saved PO file is unavailable.
        }
      }

      if (record.grnServiceReference && record.grnServiceReference !== "NA") {
        try {
          if (record.referenceType === "PO") {
            const grn = await getGrnById(record.grnServiceReference);
            if (active) setLinkedGrn(grn);
            previews.completion = { url: "", type: "application/x-grn-preview" };
          } else if (record.referenceType === "WO" && baseUrl) {
            const response = await fetch(`${baseUrl}/admin_wcc_certificate/get_by_order/${encodeURIComponent(record.poWoReference || "")}`, { headers: { Accept: "application/json" } });
            const payload = response.ok ? await response.json().catch(() => null) : null;
            const certificates: Record<string, unknown>[] = Array.isArray(payload?.certificates) ? payload.certificates : [];
            const certificate = certificates.find((item) => [item.certificate_id, item.wcc_number].some((value) => String(value ?? "").trim() === record.grnServiceReference));
            const rawUrl = certificate ? String(certificate.document_url ?? certificate.doc_url ?? certificate.file_url ?? certificate.certificate_url ?? "").trim() : "";
            if (rawUrl) previews.completion = { url: absoluteUrl(rawUrl), type: "application/pdf" };
          }
        } catch {
          // The linked GRN/WCC reference remains visible if generation fails.
        }
      }

      if (active) setLinkedDocumentPreviews(previews);
    };
    void loadLinkedDocuments().finally(() => active && setLinkedDocumentsLoading(false));
    return () => {
      active = false;
    };
  }, [record.grnServiceReference, record.poWoReference, record.referenceType]);

  const totalGst = Number(record.cgstAmount || 0) + Number(record.sgstAmount || 0) + Number(record.igstAmount || 0);
  const metadataDocuments = [
    ...(record.attachmentName ? [{ key: `${record.id}:bill-metadata`, recordId: record.id, role: "bill" as const, name: record.attachmentName, type: record.attachmentType || "", url: record.attachmentUrl || "" }] : []),
    ...(record.supportingDocumentNames ?? []).map((name) => ({ key: `${record.id}:supporting-metadata:${name}`, recordId: record.id, role: "supporting" as const, name, type: record.additionalDocumentUrls?.[name] ? "application/pdf" : "", url: record.additionalDocumentUrls?.[name] || "" })),
  ];
  const linkedReferenceDocuments = [
    ...(record.poWoReference && record.poWoReference !== "NA" ? [{ key: `${record.id}:order-reference`, recordId: record.id, role: "reference" as const, name: `${record.referenceType || "Order"} · ${record.poWoReference}`, type: linkedDocumentPreviews.order?.type || "application/x-linked-reference", url: linkedDocumentPreviews.order?.url || "", referenceLabel: `${record.referenceType || "Order"} Reference` }] : []),
    ...(record.grnServiceReference && record.grnServiceReference !== "NA" ? [{ key: `${record.id}:completion-reference`, recordId: record.id, role: "reference" as const, name: `${record.referenceType === "WO" ? "WCC" : "GRN"} · ${record.grnServiceReference}`, type: linkedDocumentPreviews.completion?.type || "application/x-linked-reference", url: linkedDocumentPreviews.completion?.url || "", referenceLabel: record.referenceType === "WO" ? "WCC / Service Completion Reference" : "Goods Receipt Note Reference" }] : []),
  ];
  const previewDocuments = [
    ...storedDocuments,
    ...metadataDocuments.filter((metadata) => !storedDocuments.some((stored) => stored.role === metadata.role && stored.name === metadata.name)),
    ...linkedReferenceDocuments,
  ];
  const selectedDocument = previewDocuments.find((document) => document.key === selectedDocumentKey) ?? previewDocuments[0];
  const detailGroups = [
    {
      title: "Invoice identity",
      fields: [
        ["Bill Inward No.", record.billInwardNo || record.reference], ["Status", record.status || "Draft"],
        ["Vendor", record.party], ["Vendor ID", record.vendorId], ["Vendor GSTIN", record.vendorGstin],
        ["Invoice Type", record.invoiceType], ["Invoice Number", record.reference], ["Invoice Date", formatRegisterDate(record.invoiceDate)],
        ["Bill Received Date", formatRegisterDate(record.date)], ["Payment Due Date", formatRegisterDate(record.dueDate)], ["Place of Supply", record.placeOfSupply],
      ],
    },
    {
      title: "References & allocation",
      fields: [
        ["Reference Type", record.referenceType], ["PO / WO / Contract", record.poWoReference], ["GRN / WCC Reference", record.grnServiceReference],
        ["Department", record.department], ["Project", record.project], ["Site / Land Parcel", record.site],
      ],
    },
    {
      title: "Commercial & tax details",
      fields: [
        ["Taxable / Base Amount", formatCurrency(Number(record.baseAmount || 0))], ["CGST", formatCurrency(Number(record.cgstAmount || 0))],
        ["SGST", formatCurrency(Number(record.sgstAmount || 0))], ["IGST", formatCurrency(Number(record.igstAmount || 0))],
        ["Total GST", formatCurrency(totalGst)], ["Other Charges / Adjustment", formatCurrency(Number(record.otherAdjustment || 0))],
        ["Total Payable", formatCurrency(Number(record.amount || 0))], ["TDS Applicable", record.tdsApplicable],
        ["Payment Terms", record.paymentTerms], ["Credit Days", record.creditDays != null ? String(record.creditDays) : ""],
      ],
    },
    {
      title: "Controls & documents",
      fields: [
        ["Bill Priority", record.billPriority], ["Bill Mode", record.billMode], ["Original Bill Received", record.originalBillReceived],
        ["Bill Attachment", record.attachmentName], ["Supporting Documents", record.supportingDocumentNames?.join(", ")], ["Narration / Notes", record.notes],
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="flex h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between bg-[#0d473f] px-6 py-5 text-white">
          <div><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/60">Bills & Payables · {actionMode === "pay" ? "Bills Paid" : "Verification"}</p><h2 className="mt-1 text-2xl font-bold">{actionMode === "pay" ? "Bill Payment Preview" : "Bill Inward Preview"}</h2><p className="mt-1 text-sm text-white/65">Review all captured bill details and documents before {actionMode === "pay" ? "confirming payment" : "verification"}.</p></div>
          <button onClick={onClose} className="rounded-xl p-2 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Close preview"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid min-h-0 flex-1 bg-[#f6f8fa] lg:grid-cols-2">
          <aside className="flex min-h-0 flex-col border-b border-slate-200 bg-[#eef3f7] p-4 lg:border-b-0 lg:border-r">
            <div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#0d5c4d]">Uploaded documents</p><p className="mt-1 text-xs text-slate-500">Bill attachment and every supporting document</p></div><span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600 shadow-sm">{previewDocuments.length}</span></div>
            <div className="mb-3 flex max-h-36 gap-2 overflow-x-auto pb-1">
              {documentsLoading ? <div className="flex h-16 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-400">Loading documents…</div> : previewDocuments.length ? previewDocuments.map((document) => (
                <button key={document.key} onClick={() => setSelectedDocumentKey(document.key)} className={cn("flex min-w-[190px] items-center gap-2 rounded-xl border px-3 py-2 text-left", selectedDocument?.key === document.key ? "border-[#278b76] bg-[#e7f3ef] text-[#0d5c4d]" : "border-slate-200 bg-white text-slate-600 hover:border-[#b8d6ce]")}>
                  {document.type.startsWith("image/") ? <FileImage className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}<span className="min-w-0"><span className="block truncate text-xs font-bold">{document.name}</span><span className="mt-0.5 block text-[10px] font-semibold uppercase opacity-60">{document.role === "bill" ? "Bill attachment" : document.role === "reference" ? "Linked reference" : "Supporting"}</span></span>
                </button>
              )) : <div className="flex h-16 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-400">No documents recorded</div>}
            </div>
            <div className="flex min-h-[360px] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-200/70 p-3">
              {!selectedDocument ? <p className="text-sm font-semibold text-slate-400">Select a document to preview</p> : selectedDocument.role === "reference" && linkedDocumentsLoading ? <div className="text-center"><RefreshCw className="mx-auto h-7 w-7 animate-spin text-[#0d5c4d]" /><p className="mt-3 text-sm font-semibold text-slate-500">Preparing linked document preview…</p></div> : selectedDocument.key.endsWith(":order-reference") && linkedPurchaseOrder ? <DocumentFitFrame pageWidth={794}><ExactPurchaseOrderPreview order={linkedPurchaseOrder} /></DocumentFitFrame> : selectedDocument.key.endsWith(":completion-reference") && linkedGrn ? <DocumentFitFrame pageWidth={1100}><GrnDocumentPreview grn={linkedGrn} /></DocumentFitFrame> : (selectedDocument.type === "application/pdf" || selectedDocument.type.startsWith("image/")) && selectedDocument.url ? <MediaPreviewFrame name={selectedDocument.name} type={selectedDocument.type} url={selectedDocument.url} /> : selectedDocument.role === "reference" ? <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-sm"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><FileText className="h-7 w-7" /></span><p className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.14em] text-amber-700">{"referenceLabel" in selectedDocument ? selectedDocument.referenceLabel : "Linked Reference"}</p><p className="mt-2 break-words text-lg font-bold text-slate-800">{selectedDocument.name}</p><p className="mt-2 text-xs leading-5 text-slate-500">The linked record could not be loaded. Reopen the preview to retry.</p></div> : !selectedDocument.url ? <div className="max-w-xs text-center"><FileText className="mx-auto h-10 w-10 text-slate-400" /><p className="mt-3 break-all text-sm font-bold text-slate-700">{selectedDocument.name}</p><p className="mt-2 text-xs leading-5 text-slate-500">This document was saved before document preview storage was enabled. Its name remains recorded, but the original file must be re-uploaded from Bill Inward to preview it.</p></div> : <div className="max-w-xs text-center"><FileText className="mx-auto h-10 w-10 text-[#0d5c4d]" /><p className="mt-3 break-all text-sm font-bold text-slate-700">{selectedDocument.name}</p><a href={selectedDocument.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg bg-white px-3 py-2 text-xs font-bold text-[#0d5c4d] shadow-sm">Open document</a></div>}
            </div>
          </aside>
          <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
            <div className="space-y-5">
            {detailGroups.map((group) => (
              <section key={group.title} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <h3 className="border-b border-slate-100 bg-[#edf5f2] px-5 py-3 text-xs font-extrabold uppercase tracking-[0.13em] text-[#0d5c4d]">{group.title}</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3">
                  {group.fields.map(([label, value]) => (
                    <div key={label} className="min-h-[78px] border-b border-r border-slate-100 px-5 py-4">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-slate-400">{label}</p>
                      <p className="mt-1.5 break-words text-sm font-semibold leading-5 text-slate-700">{value || "Not recorded"}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-6 py-4">
          <p className="text-xs font-medium text-slate-400">{actionMode === "pay" ? record.status === "Pending Approval" || record.status === "Draft" ? "The bill must be verified before it can be marked as paid." : "Confirm payment only after the complete bill amount has been settled." : record.status === "Verified" ? ledgerEntryPending ? "The bill is verified — post a ledger entry to record the liability before requesting payment." : paymentRequested ? "A payment request has been raised for this verified bill." : "The bill is verified and ready to be requested for payment." : "Verification confirms that the bill details and supporting references have been reviewed."}</p>
          <div className="flex gap-3"><button onClick={onClose} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 hover:bg-slate-50">Close</button>{actionMode === "verify" ? record.status === "Verified" ? ledgerEntryPending ? <button onClick={onPostLedgerEntry} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white hover:bg-[#0a4b3f]"><IndianRupee className="h-4 w-4" />Ledger Entry</button> : <button onClick={onRequestPayment} disabled={paymentRequested} className={cn("inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold", paymentRequested ? "cursor-not-allowed bg-emerald-50 text-emerald-700" : "bg-[#0d5c4d] text-white hover:bg-[#0a4b3f]")}><CreditCard className="h-4 w-4" />{paymentRequested ? "Payment Requested" : "Request Payment"}</button> : record.status !== "Paid" && <button onClick={onVerify} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white hover:bg-[#0a4b3f]"><CheckCircle2 className="h-4 w-4" />Verify Bill</button> : record.status === "Verified" && <button onClick={onVerify} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white hover:bg-[#0a4b3f]"><CheckCircle2 className="h-4 w-4" />Mark as Paid</button>}</div>
        </div>
      </div>
    </div>
  );
}

export function FinanceAccountsModule({ moduleKey }: { moduleKey: FinanceModuleKey }) {
  const module = moduleByKey[moduleKey];
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("tab");
  const activeTab = module.tabs.find((tab) => tab.label.toLowerCase() === requestedTab?.toLowerCase()) ?? module.tabs[0];
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceRecord | null>(null);
  const [verificationPreview, setVerificationPreview] = useState<FinanceRecord | null>(null);
  const [billPreviewMode, setBillPreviewMode] = useState<"verify" | "pay">("verify");
  const [prrModalRecord, setPrrModalRecord] = useState<FinanceRecord | null>(null);
  const [ledgerEntryRecord, setLedgerEntryRecord] = useState<FinanceRecord | null>(null);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState("");

  useEffect(() => setRecords(loadRecords()), []);

  const loadInvoices = () => {
    setInvoicesLoading(true);
    setInvoicesError("");
    fetch(`${String(getBaseUrl() ?? "").replace(/\/$/, "")}/admin_accounts/get_invoices`, { headers: { Accept: "application/json" } })
      .then(async (res) => {
        const data = await res.json().catch(() => null) as { success?: boolean; data?: Array<Record<string, unknown>>; detail?: string } | null;
        if (!res.ok || !data?.success || !Array.isArray(data.data)) {
          throw new Error(!res.ok ? `Invoice API not reachable (${res.status}${data?.detail ? ` — ${data.detail}` : ""}). Rows shown below may be stale local data, not the database.` : "Invoice API returned an unexpected response.");
        }
        setRecords((current) => mergeInvoiceRecords(current, data.data.map(mapInvoiceToRecord)));
      })
      .catch((error) => setInvoicesError(error instanceof Error ? error.message : "Could not load invoices from the backend."))
      .finally(() => setInvoicesLoading(false));
  };

  // Bills & Payables' Inward/Verification/Bills Paid tabs read real invoices from the
  // backend now that Bill Inward is saved there directly (see BillInwardModal) instead of
  // to localStorage — other modules are untouched and keep using only the local register.
  useEffect(() => {
    if (moduleKey !== "bills-payables") return;
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleKey]);

  const moduleRecords = records.filter((record) => record.module === moduleKey);
  const isVerificationRegister = moduleKey === "bills-payables" && activeTab.label === "Verification";
  const isBillsPaidRegister = moduleKey === "bills-payables" && activeTab.label === "Bills Paid";
  const isRequestRegister = moduleKey === "payments-receipts" && activeTab.label === "Requests";
  const tabRecords = isVerificationRegister || isBillsPaidRegister
    ? moduleRecords.filter((record) => record.tab === "Inward" && record.entryType === "Bill Inward")
    : moduleRecords.filter((record) => record.tab === activeTab.label);
  const isInwardRegister = moduleKey === "bills-payables" && activeTab.label === "Inward";
  const showsBillInwardRecords = isInwardRegister || isVerificationRegister || isBillsPaidRegister;
  const visibleRecords = tabRecords.filter((record) => {
    const query = search.toLowerCase().trim();
    const matchesSearch = !query || [record.billInwardNo, record.reference, record.entryType, record.party, record.notes].some((value) => String(value ?? "").toLowerCase().includes(query));
    const matchesStatus = status === "All statuses" || record.status === status;
    return matchesSearch && matchesStatus;
  });
  const totalValue = tabRecords.reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const pending = tabRecords.filter((record) => record.status === "Pending Approval").length;
  const completed = tabRecords.filter((record) => ["Posted", "Paid", "Reconciled", "Closed"].includes(record.status)).length;

  const saveRecords = (next: FinanceRecord[]) => {
    setRecords(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const saveEntry = (entry: FinanceRecord) => {
    const next = records.some((record) => record.id === entry.id)
      ? records.map((record) => record.id === entry.id ? entry : record)
      : [entry, ...records];
    saveRecords(next);
    setModalOpen(false);
    setEditing(null);
  };

  const verifyBill = async (entry: FinanceRecord) => {
    if (!window.confirm(`Verify ${entry.billInwardNo || entry.reference}?`)) return;
    try {
      const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/admin_accounts/update_invoice_approval_status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: entry.id, approval_status: "approved" }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(data?.detail || data?.message || "Failed to verify bill");
      const verifiedEntry = { ...entry, status: "Verified" };
      saveRecords(records.map((record) => record.id === entry.id ? verifiedEntry : record));
      toast.success(`${entry.billInwardNo || entry.reference} verified`);
      setVerificationPreview(null);
      setLedgerEntryRecord(verifiedEntry);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to verify bill");
    }
  };

  // No backend endpoint updates the invoice's own ledger_entery_status yet, so this is
  // recorded locally (preserved across get_invoices refetches by mergeInvoiceRecords) —
  // the real ledger entry itself is already posted for real via add_accounts_ledger_entry.
  const markLedgerEntryPosted = (entry: FinanceRecord) => {
    saveRecords(records.map((record) => record.id === entry.id ? { ...record, ledgerEntryStatus: "completed" } : record));
    setLedgerEntryRecord(null);
  };

  const requestPayment = (entry: FinanceRecord) => {
    const existingRequest = records.find((record) => record.module === "payments-receipts" && record.tab === "Requests" && record.sourceBillId === entry.id);
    if (existingRequest) return;
    if (!window.confirm(`Create a payment request for ${entry.billInwardNo || entry.reference}?`)) return;
    const requestNumber = nextPaymentRequestNumber(records);
    const paymentRequest: FinanceRecord = {
      id: crypto.randomUUID(),
      module: "payments-receipts",
      tab: "Requests",
      entryType: "Payment Request / PRR",
      reference: requestNumber,
      party: entry.party,
      vendorId: entry.vendorId,
      date: new Date().toISOString().slice(0, 10),
      dueDate: entry.dueDate,
      amount: entry.amount,
      status: "Pending Approval",
      notes: `Payment requested against Bill Inward ${entry.billInwardNo || entry.reference}.`,
      sourceBillId: entry.id,
      sourceBillInwardNo: entry.billInwardNo || entry.reference,
      poWoReference: entry.poWoReference,
      referenceType: entry.referenceType,
      grnServiceReference: entry.grnServiceReference,
      department: entry.department,
      project: entry.project,
      site: entry.site,
    };
    saveRecords([paymentRequest, ...records]);
  };

  const markBillPaid = (entry: FinanceRecord) => {
    if (!window.confirm(`Mark ${entry.billInwardNo || entry.reference} as paid?`)) return;
    saveRecords(records.map((record) => record.id === entry.id ? { ...record, status: "Paid" } : record));
    setVerificationPreview(null);
  };

  const openNewPrr = () => {
    setPrrModalRecord({
      id: crypto.randomUUID(),
      module: "payments-receipts",
      tab: "Requests",
      entryType: "Payment Request / PRR",
      reference: nextPaymentRequestNumber(records),
      party: "",
      date: new Date().toISOString().slice(0, 10),
      dueDate: "",
      amount: 0,
      status: "Draft",
      notes: "",
    });
  };

  const savePrr = (entry: FinanceRecord) => {
    saveRecords(records.some((record) => record.id === entry.id) ? records.map((record) => record.id === entry.id ? entry : record) : [entry, ...records]);
    setPrrModalRecord(null);
  };

  const selectTab = (tab: TabDefinition) => {
    setParams({ tab: tab.label.toLowerCase() });
    setSearch("");
    setStatus("All statuses");
  };

  const Icon = module.icon;

  return (
    <div className="min-h-full bg-[#f6f8fa] px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <PageHeading
          icon={Icon}
          eyebrow="Finance & Accounts"
          title={module.title}
          description={module.description}
          action={!isVerificationRegister && !isBillsPaidRegister ? <button onClick={() => isRequestRegister ? openNewPrr() : (setEditing(null), setModalOpen(true))} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(13,92,77,0.18)] hover:bg-[#0a4b3f]"><Plus className="h-4 w-4" />{isRequestRegister ? "Create PRR" : "New Entry"}</button> : undefined}
        />

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
          <div className="flex min-w-max gap-1">
            {module.tabs.map((tab) => (
              <button key={tab.label} onClick={() => selectTab(tab)} className={cn("rounded-xl px-5 py-3 text-sm font-bold transition", activeTab.label === tab.label ? "bg-[#0d5c4d] text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800")}>{tab.label}</button>
            ))}
          </div>
        </div>

        {moduleKey === "bills-payables" && invoicesError && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800">{invoicesError}</div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: `${activeTab.label} Entries`, value: tabRecords.length.toLocaleString("en-IN"), icon: ClipboardList },
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
            <div><h2 className="text-lg font-bold text-slate-950">{activeTab.label} Register{invoicesLoading && <span className="ml-2 align-middle text-xs font-semibold text-slate-400">Refreshing…</span>}</h2><p className="mt-1 text-sm text-slate-500">Search, review and maintain entries for this workflow.</p></div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-4 text-sm font-medium outline-none focus:border-[#278b76] sm:w-72" placeholder="Search reference, party or type" /></label>
              <label className="relative"><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 appearance-none rounded-xl border border-slate-200 bg-white pl-4 pr-10 text-sm font-bold text-slate-600 outline-none focus:border-[#278b76]"><option>All statuses</option>{["Draft", "Pending Approval", "Verified", "Posted", "Paid", "Reconciled", "Closed"].map((item) => <option key={item}>{item}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /></label>
            </div>
          </div>

          {visibleRecords.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="bg-[#0d473f] text-[11px] uppercase tracking-[0.11em] text-white"><tr><th className="px-5 py-4 text-center">{showsBillInwardRecords ? "BI No." : "Reference"}</th><th className="px-5 py-4 text-center">Date</th><th className="px-5 py-4 text-center">Due Date</th><th className="px-5 py-4 text-center">Entry Type</th><th className="px-5 py-4 text-center">Party / Account</th><th className="px-5 py-4 text-center">Amount</th><th className="px-5 py-4 text-center">Status</th><th className="px-5 py-4 text-center">Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleRecords.map((record) => (
                    <tr key={record.id} className="leading-5 hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-5 py-4 font-semibold text-[#0d5c4d]">{showsBillInwardRecords ? record.billInwardNo || record.reference : record.reference}</td><td className="whitespace-nowrap px-5 py-4 text-center font-medium text-slate-600">{formatRegisterDate(record.date)}</td><td className="whitespace-nowrap px-5 py-4 text-center font-medium text-slate-600">{formatRegisterDate(record.dueDate)}</td><td className="px-5 py-4 font-semibold text-slate-800">{record.entryType}</td><td className="px-5 py-4 font-medium text-slate-500">{record.party || "—"}</td><td className="whitespace-nowrap px-5 py-4 text-right font-semibold text-slate-900">{formatCurrency(record.amount)}</td><td className="px-5 py-4 text-center"><span className={cn("inline-flex whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold", record.status === "Pending Approval" ? "bg-amber-50 text-amber-700" : record.status === "Verified" || ["Posted", "Paid", "Reconciled", "Closed"].includes(record.status) ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>{record.status || "Draft"}</span></td>
                      <td className="px-5 py-4"><div className="flex justify-end gap-1">{isVerificationRegister || isBillsPaidRegister ? <button onClick={() => { setBillPreviewMode(isBillsPaidRegister ? "pay" : "verify"); setVerificationPreview(record); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-[#b8d6ce] hover:bg-[#eaf4f1] hover:text-[#0d5c4d]" title="Preview bill"><Eye className="h-4 w-4" />Preview</button> : isRequestRegister ? <button onClick={() => setPrrModalRecord(record)} className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-[#0d5c4d] px-4 text-sm font-bold text-white hover:bg-[#0a4b3f]"><Plus className="h-4 w-4" />Create PRR</button> : <><button onClick={() => { setEditing(record); setModalOpen(true); }} className={cn("inline-flex items-center gap-1.5 rounded-lg text-slate-500 hover:bg-[#eaf4f1] hover:text-[#0d5c4d]", record.entryType === "Bill Inward" ? "px-3 py-2 text-sm font-semibold" : "p-2")} title="Edit"><Pencil className="h-4 w-4" />{record.entryType === "Bill Inward" && "Edit"}</button><button onClick={() => window.confirm(`Delete ${record.reference}?`) && saveRecords(records.filter((item) => item.id !== record.id))} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 className="h-4 w-4" /></button></>}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex min-h-[300px] flex-col items-center justify-center px-6 py-12 text-center">
              <span className="rounded-2xl bg-[#edf5f2] p-4 text-[#6c9b90]"><FileBarChart className="h-8 w-8" /></span>
              <h3 className="mt-4 text-lg font-bold text-slate-800">No {activeTab.label.toLowerCase()} entries found</h3>
              <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{isVerificationRegister ? "Saved Bill Inward entries will appear here automatically for review and verification." : isBillsPaidRegister ? "Every Bill Inward entry will appear here. Verified bills can be marked as paid from their preview." : "Create the first entry for this workflow, or change the search and status filters."}</p>
              {!isVerificationRegister && !isBillsPaidRegister && <button onClick={() => isRequestRegister ? openNewPrr() : (setEditing(null), setModalOpen(true))} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-[#b8d6ce] px-4 text-sm font-bold text-[#0d5c4d] hover:bg-[#edf5f2]"><Plus className="h-4 w-4" />{isRequestRegister ? "Create PRR" : `Create ${activeTab.features[0] ?? "Entry"}`}</button>}
            </div>
          )}
        </section>
      </div>
      {modalOpen && <EntryModal module={module} tab={activeTab} existing={editing} onClose={() => { setModalOpen(false); setEditing(null); }} onSave={saveEntry} onSaved={loadInvoices} />}
      {prrModalRecord && <PrrModal record={prrModalRecord} bills={records.filter((record) => record.module === "bills-payables" && record.tab === "Inward" && record.entryType === "Bill Inward" && ["Verified", "Paid"].includes(record.status))} onClose={() => setPrrModalRecord(null)} onSave={savePrr} />}
      {verificationPreview && <BillVerificationPreview record={verificationPreview} actionMode={billPreviewMode} paymentRequested={records.some((record) => record.module === "payments-receipts" && record.tab === "Requests" && record.sourceBillId === verificationPreview.id)} onClose={() => setVerificationPreview(null)} onVerify={() => billPreviewMode === "pay" ? markBillPaid(verificationPreview) : verifyBill(verificationPreview)} onRequestPayment={() => requestPayment(verificationPreview)} onPostLedgerEntry={() => { setVerificationPreview(null); setLedgerEntryRecord(verificationPreview); }} />}
      {ledgerEntryRecord && <LedgerEntryModal record={ledgerEntryRecord} onClose={() => setLedgerEntryRecord(null)} onPosted={() => markLedgerEntryPosted(ledgerEntryRecord)} />}
    </div>
  );
}

export const BillsPayables = () => <FinanceAccountsModule moduleKey="bills-payables" />;
export const PaymentsReceipts = () => <FinanceAccountsModule moduleKey="payments-receipts" />;
export const Vouchers = () => <FinanceAccountsModule moduleKey="vouchers" />;
export const Banking = () => <FinanceAccountsModule moduleKey="banking" />;
export const LedgersReports = () => <FinanceAccountsModule moduleKey="ledgers-reports" />;
export const BudgetCosting = () => <FinanceAccountsModule moduleKey="budget-costing" />;
export const MastersControls = () => <FinanceAccountsModule moduleKey="masters-controls" />;
