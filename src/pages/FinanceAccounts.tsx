import { useCallback, useEffect, useRef, useState, type ElementType, type FormEvent, type ReactNode } from "react";
import * as XLSX from "xlsx";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
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
import { useAuth } from "@/context/AuthContext";
import { getGrnById, type GRNRecord } from "@/lib/grnApi";
import { mergeSbrGlSeed } from "@/data/sbrGlSeed";
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
  | "masters-controls";

export type FinanceRecord = {
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
  // Set once a PRR has actually been created for this Bill Inward invoice (admin_accounts_invoice.
  // prr_number/payment_id) — drives the Outstanding tab's "Mark as Paid" action.
  prrNumber?: string;
  paymentId?: string;
  prrDetails?: PRRDetails;
  // Set once a PRR is approved — what happens next depends on PRR Type (see
  // PRR_TYPE_SKIPS_PAYMENT_DETAILS). Undefined until then; "ledger_posted" is terminal.
  prrStage?: "awaiting_payment_details" | "awaiting_ledger_posting" | "ledger_posted";
  paymentDetails?: { utr?: string; paymentDate?: string; paymentMode?: string; chequeNumber?: string };
  // Set when this Bill Inward is itself the leftover balance split off a partially-paid invoice
  // (see mark_payment_paid's split_from/split_note) — splitFrom is the root invoice_id every
  // split of the same original bill traces back to, splitNote is the auto-generated "X%
  // remaining against ..." narration shown on its card.
  splitFrom?: string;
  splitNote?: string;
};

// One row of the PRR's budget allocation — a specific line item within a specific budget,
// and how much of this payment is being drawn from it. Replaces the old free-text
// Ledger Head / Sub Ledger / Budget Head fields with real budget/line-item selection.
export type PrrBudgetLine = {
  key: string; // `${budgetId}::${lineItemId}`
  budgetId: string;
  budgetName: string;
  category: string;
  lineItem: string;
  lineItemId: string;
  amount: number;
};

export type PRRDetails = {
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
  actualPayableAmount: number;
  tdsApplicable: string;
  tdsSection: string;
  tdsRate: number;
  tdsBaseAmount: number;
  tdsAmount: number;
  rcmApplicable: string;
  accountingCostCentre: string;
  budgetLines: PrrBudgetLine[];
  accountingNarration: string;
  paymentMode: string;
  paymentTerms: string;
  bankAccountFrom: string;
  paymentExtent: string;
  requestedPaymentAmount: number;
  supportingDocuments: string[];
  requesterRemarks: string;
  accountsRemarks: string;
  // Stamped signature strings — "{name} | {designation} | {date} | {time} | Approved" — set
  // once by the actual action that happens (send-for-approval / director-approve), not editable.
  preparedBy: string;
  approvedBy: string;
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
      { label: "Ledger Posting", description: "Book ledger liability entries for bills awaiting posting.", features: ["Ledger Entry", "Bill Attachments"] },
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
      { label: "Requests", description: "Raise and monitor requests before approval.", features: ["Payment Request / PRR"] },
      { label: "Ledger Posting", description: "Post the accounting entry for approved PRRs.", features: ["Ledger Entry"] },
      { label: "Receipts", description: "Record payment details for approved PRRs awaiting disbursement.", features: ["Payment Details"] },
      { label: "History", description: "Every PRR, every stage, permanently.", features: ["Payment History"] },
    ],
  },
  {
    // Rendered by the standalone src/pages/Vouchers.tsx now, not FinanceAccountsModule —
    // kept here only so the dashboard's module-card grid and counts still include it.
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

// This module has no backend of its own — PRR Approval (PRRApprovalInbox.tsx) reads this to
// surface locally-drafted, submitted PRRs alongside the real backend-tracked ones in the same
// director inbox, without making this module depend on the API for anything. Returns the full
// record (not just a summary) so the approval page can render it through the exact same
// PrrDocumentPreview this module itself uses — same layout, same fields, everywhere.
export const getLocalPendingPrrRecords = (): FinanceRecord[] =>
  loadRecords().filter((record) => record.module === "payments-receipts" && record.tab === "Requests" && ["Submitted", "Pending Approval"].includes(record.status));

// A PRR's own attachmentUrl is always blank (this form doesn't take its own upload) — its real
// Tax Invoice / supporting-document URLs live on the Bill Inward record it was raised against,
// looked up by sourceBillId. Used by PRRApprovalInbox.tsx to resolve that linked bill.
export const getLocalRecordById = (id: string): FinanceRecord | undefined =>
  loadRecords().find((record) => record.id === id);

// Approve/Reject from PRRApprovalPanel.tsx write straight back to this same localStorage
// register — there's no backend record for these, so nothing calls director_approve_payment /
// director_reject_payment for them. On approval this is also where "Approved By" gets stamped
// with the director's real signature — the same "{name} | {designation} | {date} | {time} |
// Approved" format Send for Approval stamps onto "Prepared By".
export const updateLocalPrrStatus = (
  id: string,
  status: "Approved" | "Rejected",
  signer: { name: string; designation?: string },
  rejectionReason?: string,
): void => {
  const records = loadRecords();
  const next = records.map((record) => {
    if (record.id !== id) return record;
    const prrDetails = record.prrDetails ? { ...record.prrDetails } : undefined;
    let prrStage = record.prrStage;
    if (status === "Approved") {
      // The stage transition must not depend on prrDetails existing — records created
      // without it (e.g. the "Request Payment" button on a Bill Inward) would otherwise
      // get stamped "Approved" but never receive a prrStage, leaving them invisible in
      // every Payments & Receipts tab (each one filters on either status or prrStage).
      if (prrDetails) prrDetails.approvedBy = formatPrrSignature(signer.name, signer.designation || "");
      prrStage = prrSkipsPaymentDetails(prrDetails?.prrType ?? "") ? "awaiting_ledger_posting" : "awaiting_payment_details";
    }
    if (prrDetails && rejectionReason) {
      prrDetails.accountsRemarks = [prrDetails.accountsRemarks, `Rejected: ${rejectionReason}`].filter(Boolean).join(" — ");
    }
    return { ...record, status, prrDetails, prrStage };
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);

// "{name} | {designation} | {date} | {time} | Approved" — stamped once, at the moment each
// step actually happens (Prepared By when sent for approval, Approved By when the director
// approves) rather than editable free text.
const formatPrrSignature = (name: string, designation: string, when: Date = new Date()) =>
  `${name} | ${designation || "—"} | ${when.toLocaleDateString("en-IN")} | ${when.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} | Approved`;

// TYPE 2 (Accounting) skips payment-details capture and goes straight to ledger posting once
// approved. Every other PRR Type (Payment, Advance, Reimbursement, Statutory, Salary) is
// TYPE 1 — payment details first, then ledger posting.
const prrSkipsPaymentDetails = (prrType: string) => prrType === "Accounting";

// Falls back to deriving the stage from status when prrStage itself is missing — covers
// records already sitting in localStorage from before prrStage was reliably stamped on
// every approval path (see updateLocalPrrStatus), so they self-heal into the right tab on
// the next render instead of staying stuck invisible in every Payments & Receipts tab.
const effectivePrrStage = (record: FinanceRecord): FinanceRecord["prrStage"] => {
  if (record.prrStage) return record.prrStage;
  if (record.status === "Approved") return prrSkipsPaymentDetails(record.prrDetails?.prrType ?? "") ? "awaiting_ledger_posting" : "awaiting_payment_details";
  return record.prrStage;
};

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
  const prrStatus = String(invoice.PRR_status ?? "").toLowerCase();
  if (prrStatus === "paid" || ["posted", "paid"].includes(ledger)) return "Paid";
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
    placeOfSupply: String(purchaseOrder.place_of_supply ?? ""),
    project: String(purchaseOrder.project ?? ""),
    site: String(purchaseOrder.site ?? ""),
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
    prrNumber: invoice.prr_number ? String(invoice.prr_number) : "",
    paymentId: invoice.payment_id ? String(invoice.payment_id) : "",
    splitFrom: invoice.split_from ? String(invoice.split_from) : "",
    splitNote: invoice.split_note ? String(invoice.split_note) : "",
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
    if (!existing) return record;
    // "Verified" is real backend state (director_approval_status, set by the real
    // update_invoice_approval_status call) — always trust the fresh fetch for it. Only "Paid"
    // (markBillPaid) and a completed ledger entry are truly local-only with no backend field
    // of their own, so those are the only local values worth surviving a refetch. Blindly
    // preserving *any* cached status by id (the old behaviour) meant a reused invoice_id
    // (e.g. after the backend table is cleared/reset, or a new financial year restarts
    // numbering) would silently inherit a stale "Verified"/"Paid" tag from an unrelated old
    // record that happened to share the same id.
    return {
      ...record,
      status: existing.status === "Paid" ? "Paid" : record.status,
      ledgerEntryStatus: existing.ledgerEntryStatus === "completed" ? "completed" : record.ledgerEntryStatus,
    };
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

type EntryModalProps = { module: ModuleDefinition; tab: TabDefinition; existing?: FinanceRecord | null; onClose: () => void; onSave: (record: FinanceRecord) => void; onSaved?: () => void; initialFile?: File; initialInvoiceDocUrl?: string; initialFileName?: string; initialVendorId?: string; initialVendorName?: string; initialOrderNumber?: string; initialInvoiceDirectoryId?: string; initialSupportingFiles?: File[]; initialAdditionalDocuments?: Array<{ name: string; url: string }> };

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

// Departments/projects/sites still come from this legacy local settings blob (unchanged,
// out of scope) — only costCentres/costAttributions below are wired to live Accounting
// Master data, since those are the two dimensions actually being connected right now.
const loadAccountingDimensionDefaults = (): AccountingDimensions => {
  try {
    const raw = localStorage.getItem("sbr-accounting-master-v1");
    const costing = raw ? JSON.parse(raw)?.costing ?? {} : {};
    return {
      departments: Array.isArray(costing.departments) ? costing.departments : [],
      costCentres: [],
      costAttributions: [],
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

// Cost Centre / Cost Attribution options for the PRR form, read straight from the same
// admin_accounting_masters backend the Accounting Master "Cost Centre"/"Cost Attribution"
// tabs save to (COST_CENTRE / COST_ATTRIBUTION) — previously these came from three
// localStorage keys nothing ever wrote to, so the dropdowns were permanently empty no
// matter what was configured in Accounting Master. Only Active, direct-posting-eligible
// cost centres are offered — "Parent / Group" centres exist purely for hierarchy roll-up
// and can't take a direct posting (see CostCentreMaster.tsx's "Posting Allowed" state).
export const useAccountingDimensions = (): AccountingDimensions => {
  const [dimensions, setDimensions] = useState<AccountingDimensions>(loadAccountingDimensionDefaults);
  useEffect(() => {
    let cancelled = false;
    const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
    (async () => {
      try {
        const [centresRes, attributionsRes, departmentsRes] = await Promise.all([
          fetch(`${baseUrl}/admin_accounting_masters/list/COST_CENTRE`, { headers: { Accept: "application/json" } }),
          fetch(`${baseUrl}/admin_accounting_masters/list/COST_ATTRIBUTION`, { headers: { Accept: "application/json" } }),
          fetch(`${baseUrl}/admin_accounting_masters/list/DEPARTMENT`, { headers: { Accept: "application/json" } }),
        ]);
        const centresPayload = centresRes.ok ? await centresRes.json().catch(() => null) : null;
        const attributionsPayload = attributionsRes.ok ? await attributionsRes.json().catch(() => null) : null;
        const departmentsPayload = departmentsRes.ok ? await departmentsRes.json().catch(() => null) : null;
        const centreItems: Array<Record<string, unknown>> = Array.isArray(centresPayload?.data) ? centresPayload.data : [];
        const attributionItems: Array<Record<string, unknown>> = Array.isArray(attributionsPayload?.data) ? attributionsPayload.data : [];
        const departmentItems: Array<Record<string, unknown>> = Array.isArray(departmentsPayload?.data) ? departmentsPayload.data : [];
        const costCentres = centreItems
          .filter((item) => String(item.status ?? "") === "Active" && Boolean(item.directPosting))
          .map((item) => ({ id: String(item.item_id ?? ""), code: String(item.code ?? ""), name: String(item.name ?? "") }));
        // Department is its own master type now (Project superset → Department Onboarding),
        // not folded into Cost Centre's "type" field anymore.
        const departments = departmentItems
          .filter((item) => String(item.status ?? "") === "Active")
          .map((item) => ({ id: String(item.item_id ?? ""), code: String(item.code ?? ""), name: String(item.name ?? "") }));
        const costAttributions = attributionItems
          .filter((item) => String(item.status ?? "") === "Active")
          .map((item) => ({ id: String(item.item_id ?? ""), code: String(item.code ?? ""), name: String(item.name ?? ""), level: String(item.level ?? "") }));
        if (!cancelled) setDimensions((current) => ({ ...current, costCentres, departments, costAttributions }));
      } catch {
        // Accounting Master unreachable — PRR form still works, just without live dimension options.
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return dimensions;
};

const vendorOrderLabel = (orderType: string) => {
  const normalized = String(orderType ?? "").trim().toUpperCase();
  if (normalized.includes("CONTRACT")) return "Contract";
  if (normalized.includes("SPR") || normalized.includes("WORK") || normalized === "WO") return "WO";
  return "PO";
};

export function BillInwardModal({ module, tab, existing, onClose, onSaved, initialFile, initialInvoiceDocUrl, initialFileName, initialVendorId, initialVendorName, initialOrderNumber, initialInvoiceDirectoryId, initialSupportingFiles, initialAdditionalDocuments }: EntryModalProps) {
  const [form, setForm] = useState<Omit<FinanceRecord, "id">>(() => {
    const base = existing ? { ...initialForm(module, tab), ...existing } : initialForm(module, tab);
    if (!existing && initialVendorId) return { ...base, vendorId: initialVendorId, party: initialVendorName || base.party, poWoReference: initialOrderNumber || base.poWoReference };
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
  const accountingDimensions = useAccountingDimensions();
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

  // Selecting a vendor from the dropdown sets both vendorId and party (see its onChange
  // below), but vendorId can also arrive pre-filled (initialVendorId, from an Invoice
  // Directory folder that only resolved an ID and not a name) without ever going through
  // that onChange — leaving party silently blank while the dropdown still shows the right
  // vendor selected. Keeping party in sync with the loaded vendor directory here, regardless
  // of how vendorId was set, is what actually saved to the backend as vendor_name.
  useEffect(() => {
    const vendorId = String(form.vendorId ?? "").trim();
    if (!vendorId) return;
    const vendor = vendors.find((item) => item.id === vendorId);
    if (vendor?.name && vendor.name !== form.party) update("party", vendor.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.vendorId, vendors]);

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
        // This endpoint returns its list under "order_info", not "purchase_flows"
        // (that key belongs to the /get_purchase_flows fallback below).
        let list = Array.isArray(payload?.order_info) ? payload.order_info : [];

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

  // The order number pre-filled from an Invoice Directory folder is right, but its PO/WO
  // Reference Type defaults to "PO" until the vendor's real orders load — correct it once
  // they do, so the (type-filtered) order dropdown actually shows the pre-filled value.
  useEffect(() => {
    if (existing || !initialOrderNumber || !vendorOrders.length) return;
    const match = vendorOrders.find((order) => order.orderNumber === initialOrderNumber);
    if (!match) return;
    const derivedType = vendorOrderLabel(match.orderType);
    setForm((current) => (current.referenceType === derivedType && current.poWoReference === initialOrderNumber ? current : { ...current, referenceType: derivedType, poWoReference: initialOrderNumber }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorOrders]);

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
            place_of_supply: form.placeOfSupply || "",
            project: form.project || "",
            site: form.site || "",
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
    actualPayableAmount: gross,
    tdsApplicable: source.tdsApplicable || "No",
    tdsSection: "",
    tdsRate: 0,
    tdsBaseAmount: base,
    tdsAmount: 0,
    rcmApplicable: "No",
    accountingCostCentre: source.costCentre || "",
    budgetLines: [],
    accountingNarration: source.notes || "",
    paymentMode: "NEFT",
    paymentTerms: source.paymentTerms || "",
    bankAccountFrom: "",
    paymentExtent: "Full Payment",
    requestedPaymentAmount: gross,
    supportingDocuments: source.supportingDocumentNames || [],
    requesterRemarks: "",
    accountsRemarks: "",
    preparedBy: "",
    approvedBy: "",
    ...record.prrDetails,
  };
};

// The admin_payment_flow row a backend-tracked PRR actually lives in — same shape the PRR
// Module fetches from get_payment_flow, structurally compatible with whatever richer type the
// caller (PRRModule's "Sent for Approval" preview, PRRApprovalPanel's director review) uses.
export type PrrPaymentFlowLike = {
  payment_id?: string;
  prr_number?: string;
  vendor_name?: string;
  vendor_id?: string;
  order_number?: string;
  source_invoice_id?: string;
  created_at?: string;
  admin_ops_signature?: string;
  director_signature?: string;
  payment_request_dict?: {
    payment?: { payment_amount?: number; actual_payable_amount?: number; remarks?: string };
    tds_tax_details?: { applicable?: boolean; section?: string; rate?: number; amount?: number };
  };
  // Everything the Create PRR popup captured with no home in send_for_approval's own
  // admin_accounts_prr shape — stashed here by create_and_submit_prr.
  prr_form_extra?: {
    prr_type?: string; requesting_department?: string; priority?: string; cost_centre?: string; cost_attribution?: string;
    project_cluster?: string; land_site?: string; payment_mode?: string; payment_terms?: string; impact?: string;
    payee_type?: string; pan?: string; basic_amount?: number; taxable_amount?: number; cgst?: number; sgst?: number; igst?: number;
    other_charges?: number; gross_invoice_amount?: number; advance_adjusted?: number; note_adjustment?: number; retention_amount?: number;
    other_deduction?: number; rcm_applicable?: boolean; accounting_narration?: string; bank_account_from?: string; payment_extent?: string;
    requested_payment_amount?: number; accounts_remarks?: string; due_date?: string;
    budget_lines?: Array<{ key?: string; budgetId?: string; budgetName?: string; category?: string; lineItem?: string; lineItemId?: string; amount?: number }>;
  };
};

// The admin_accounts_prr row itself, as returned by GET /admin_accounts/get_prr/{prr_number}.
export type PrrApiRecordLike = {
  prr_number?: string;
  header?: { prr_date?: string; prr_type?: string; requested_by?: string; requesting_department?: string; invoice_date?: string };
  party_details?: { vendor_id?: string; vendor_name?: string; vendor_code?: string; gstin?: string; pan?: string };
  reference_details?: { order_number?: string; grn?: string[]; wcc?: string[]; log_book?: string[] };
  amount_details?: { net_payable_amount?: number; actual_payable_amount?: number; remarks?: string };
  status?: string;
  supporting_document_details?: Array<{ document?: string; doc_link?: string }>;
};

// Reconstructs the exact same {record, details} pair the Create PRR popup builds live, but from
// what actually got persisted (the payment-flow row + its admin_accounts_prr record) instead of
// from in-progress form state — so any view of an already-sent PRR (PRR Module's "Sent for
// Approval" tab, the director's PRRApprovalPanel) renders through the identical PrrDocumentPreview
// component and looks identical to the "Ready to Draft" live preview, not a different document.
export function buildPrrPreviewFromPaymentFlow(flow: PrrPaymentFlowLike, prr: PrrApiRecordLike | null): { details: PRRDetails; record: FinanceRecord } {
  const extra = flow.prr_form_extra ?? {};
  const payment = flow.payment_request_dict?.payment;
  const tds = flow.payment_request_dict?.tds_tax_details;
  const grnWcc = [...(prr?.reference_details?.grn ?? []), ...(prr?.reference_details?.wcc ?? [])].join(", ");

  const details: PRRDetails = {
    prrType: extra.prr_type || prr?.header?.prr_type || "Payment",
    requestingDepartment: extra.requesting_department || prr?.header?.requesting_department || "",
    requestedBy: prr?.header?.requested_by || "",
    priority: extra.priority || "Normal",
    impact: extra.impact || "",
    payeeType: extra.payee_type || "Vendor",
    vendorCode: prr?.party_details?.vendor_code || flow.vendor_id || "",
    gstin: prr?.party_details?.gstin || "",
    pan: extra.pan || prr?.party_details?.pan || "",
    bankAccount: "",
    paymentAgainst: prr?.reference_details?.order_number ? "PO" : "Invoice",
    invoiceNumber: flow.source_invoice_id || "",
    invoiceDate: prr?.header?.invoice_date || "",
    costCentre: extra.cost_centre || "",
    costAttribution: extra.cost_attribution || "",
    projectCluster: extra.project_cluster || "",
    landSite: extra.land_site || "",
    basicAmount: Number(extra.basic_amount) || 0,
    taxableAmount: Number(extra.taxable_amount) || 0,
    cgst: Number(extra.cgst) || 0,
    sgst: Number(extra.sgst) || 0,
    igst: Number(extra.igst) || 0,
    otherCharges: Number(extra.other_charges) || 0,
    grossInvoiceAmount: Number(extra.gross_invoice_amount) || Number(payment?.payment_amount) || 0,
    advanceAdjusted: Number(extra.advance_adjusted) || 0,
    noteAdjustment: Number(extra.note_adjustment) || 0,
    retentionAmount: Number(extra.retention_amount) || 0,
    tdsDeduction: Number(tds?.amount) || 0,
    otherDeduction: Number(extra.other_deduction) || 0,
    netPayableAmount: Number(prr?.amount_details?.net_payable_amount ?? payment?.payment_amount) || 0,
    actualPayableAmount: Number(prr?.amount_details?.actual_payable_amount ?? payment?.actual_payable_amount) || 0,
    tdsApplicable: tds?.applicable ? "Yes" : "No",
    tdsSection: tds?.section || "",
    tdsRate: Number(tds?.rate) || 0,
    tdsBaseAmount: Number(extra.taxable_amount) || 0,
    tdsAmount: Number(tds?.amount) || 0,
    rcmApplicable: extra.rcm_applicable ? "Yes" : "No",
    accountingCostCentre: extra.cost_centre || "",
    budgetLines: (extra.budget_lines ?? []).map((line) => ({
      key: line.key || `${line.budgetId ?? ""}::${line.lineItemId ?? ""}`,
      budgetId: line.budgetId || "",
      budgetName: line.budgetName || "",
      category: line.category || "",
      lineItem: line.lineItem || "",
      lineItemId: line.lineItemId || "",
      amount: Number(line.amount) || 0,
    })),
    accountingNarration: extra.accounting_narration || "",
    paymentMode: extra.payment_mode || "NEFT",
    paymentTerms: extra.payment_terms || "",
    bankAccountFrom: extra.bank_account_from || "",
    paymentExtent: extra.payment_extent || "Full Payment",
    requestedPaymentAmount: Number(extra.requested_payment_amount) || Number(payment?.payment_amount) || 0,
    supportingDocuments: (prr?.supporting_document_details ?? []).map((doc) => doc.document || "").filter(Boolean),
    requesterRemarks: payment?.remarks || "",
    accountsRemarks: extra.accounts_remarks || "",
    preparedBy: flow.admin_ops_signature || "",
    approvedBy: flow.director_signature || "",
  };

  const record: FinanceRecord = {
    id: flow.payment_id || "",
    module: "payments-receipts",
    tab: "Requests",
    entryType: "Payment Request / PRR",
    reference: flow.prr_number || "Pending",
    party: flow.vendor_name || prr?.party_details?.vendor_name || "",
    date: prr?.header?.prr_date || flow.created_at || "",
    dueDate: extra.due_date || "",
    amount: details.requestedPaymentAmount || details.netPayableAmount,
    status: prr?.status || "Pending Director Approval",
    notes: details.accountingNarration || details.requesterRemarks,
    poWoReference: flow.order_number || prr?.reference_details?.order_number || "",
    grnServiceReference: grnWcc,
    sourceBillInwardNo: flow.source_invoice_id || "",
  };

  return { details, record };
}

// TYPE 1 PRRs (everything except "Accounting") land here once approved — how it was actually
// paid, captured before the ledger entry gets posted. Reachable only from the "Receipts" tab's
// row action, one PRR at a time.
function PrrPaymentDetailsModal({
  record, onClose, onSave,
}: { record: FinanceRecord; onClose: () => void; onSave: (details: NonNullable<FinanceRecord["paymentDetails"]>) => void }) {
  const [utr, setUtr] = useState(record.paymentDetails?.utr || "");
  const [paymentDate, setPaymentDate] = useState(record.paymentDetails?.paymentDate || new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState(record.paymentDetails?.paymentMode || "NEFT");
  const [chequeNumber, setChequeNumber] = useState(record.paymentDetails?.chequeNumber || "");

  const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10";
  const labelClass = "space-y-2 text-xs font-bold text-slate-600";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!utr.trim()) { toast.error("Enter the UTR before saving."); return; }
    onSave({ utr: utr.trim(), paymentDate, paymentMode, chequeNumber: paymentMode === "Cheque" ? chequeNumber.trim() : "" });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form onSubmit={submit} className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between bg-[#0d473f] px-6 py-5 text-white">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/60">Payments & Receipts · Receipts</p>
            <h2 className="mt-1 text-lg font-bold">Payment Details — {record.reference}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-6">
          <label className={labelClass}>UTR<span className="text-red-500"> *</span><input required className={inputClass} value={utr} onChange={(event) => setUtr(event.target.value)} placeholder="Unique Transaction Reference" /></label>
          <label className={labelClass}>Payment Date<input required type="date" className={inputClass} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label>
          <label className={labelClass}>Payment Mode<select className={inputClass} value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}>{["NEFT", "RTGS", "IMPS", "UPI", "Cheque", "Cash"].map((item) => <option key={item}>{item}</option>)}</select></label>
          {paymentMode === "Cheque" && (
            <label className={labelClass}>Cheque Number<span className="ml-2 font-medium normal-case text-slate-400">(optional)</span><input className={inputClass} value={chequeNumber} onChange={(event) => setChequeNumber(event.target.value)} placeholder="Cheque number" /></label>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button type="button" onClick={onClose} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="submit" className="h-11 rounded-xl bg-[#0d5c4d] px-6 text-sm font-bold text-white hover:bg-[#0a4b3f]">Save & Move to Ledger Posting</button>
        </div>
      </form>
    </div>
  );
}

type PrrModalProps = {
  record: FinanceRecord;
  bills: FinanceRecord[];
  onClose: () => void;
  onSave: (record: FinanceRecord) => void;
};

export function PrrDocumentPreview({ record, details, taxInvoiceName, poWoName, completionName }: { record: FinanceRecord; details: PRRDetails; taxInvoiceName: string; poWoName: string; completionName: string }) {
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
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center justify-between border-2 border-[#0D3A35] bg-emerald-50/50 px-4 py-3"><span className="text-[12px] font-extrabold text-[#0D3A35]">NET PAYABLE AMOUNT</span><span className="text-[16px] font-extrabold text-[#0D3A35]">{formatCurrency(details.netPayableAmount)}</span></div>
        <div className="flex items-center justify-between border-2 border-amber-600 bg-amber-50/50 px-4 py-3"><span className="text-[12px] font-extrabold text-amber-700">ACTUAL PAYABLE AMOUNT</span><span className="text-[16px] font-extrabold text-amber-700">{formatCurrency(details.actualPayableAmount)}</span></div>
      </div>

      {band("ACCOUNTING & PAYMENT DETAILS")}
      <table className="w-full border-collapse"><tbody>
        <tr><Kv label="Cost Centre">{value(details.accountingCostCentre)}</Kv><Kv label="Cost Attribution">{value(details.costAttribution)}</Kv></tr>
        <tr><Kv label="TDS">{details.tdsApplicable === "Yes" ? `${value(details.tdsSection)} @ ${details.tdsRate || 0}%` : "Not Applicable"}</Kv><Kv label="RCM Applicable">{value(details.rcmApplicable)}</Kv></tr>
        <tr><Kv label="Payment Mode">{value(details.paymentMode)}</Kv><Kv label="Payment Type">{value(details.paymentExtent)}</Kv></tr>
        <tr><Kv label="Bank Account From">{value(details.bankAccountFrom)}</Kv><Kv label="Requested Amount">{formatCurrency(details.requestedPaymentAmount)}</Kv></tr>
        <tr><Kv label="Payment Terms">{value(details.paymentTerms)}</Kv><Kv label="Narration">{value(details.accountingNarration)}</Kv></tr>
      </tbody></table>

      {band("BUDGET LINE ITEMS")}
      <table className="w-full border-collapse text-[10px]">
        <thead><tr className="bg-slate-800 text-white"><th className="border border-slate-200 px-2 py-1.5 text-left">Budget</th><th className="border border-slate-200 px-2 py-1.5 text-left">Line Item</th><th className="border border-slate-200 px-2 py-1.5 text-right">Amount</th></tr></thead>
        <tbody>
          {details.budgetLines.length === 0 ? (
            <tr><td colSpan={3} className="border border-slate-200 px-2 py-3 text-center text-slate-400">No budget line items selected.</td></tr>
          ) : details.budgetLines.map((line) => (
            <tr key={line.key}>
              <td className="border border-slate-200 px-2 py-1.5">{line.budgetName}</td>
              <td className="border border-slate-200 px-2 py-1.5">{line.lineItem}{line.category ? ` · ${line.category}` : ""}</td>
              <td className="border border-slate-200 px-2 py-1.5 text-right font-bold">{formatCurrency(line.amount)}</td>
            </tr>
          ))}
          {details.budgetLines.length > 0 && (
            <tr className="bg-slate-50 font-bold"><td className="border border-slate-200 px-2 py-1.5" colSpan={2}>Total</td><td className="border border-slate-200 px-2 py-1.5 text-right">{formatCurrency(details.budgetLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0))}</td></tr>
          )}
        </tbody>
      </table>

      {band("SUPPORTING DOCUMENTS")}
      <table className="w-full border-collapse"><tbody>
        <tr><Kv label="Tax Invoice">{value(taxInvoiceName)}</Kv><Kv label="PO / WO">{value(poWoName)}</Kv></tr>
        <tr><Kv label="GRN / WCC">{value(completionName)}</Kv><Kv label="Other Documents">{details.supportingDocuments.join(", ") || "—"}</Kv></tr>
      </tbody></table>

      {band("REMARKS")}
      <div className="grid min-h-16 grid-cols-2 border border-slate-200 text-[10px]"><div className="border-r border-slate-200 p-2"><b>Requester:</b> {value(details.requesterRemarks)}</div><div className="p-2"><b>Accounts:</b> {value(details.accountsRemarks)}</div></div>

      {band("APPROVAL TRAIL")}
      <div className="grid grid-cols-2 border-x border-b border-slate-200 text-center text-[9px]">
        {[["Prepared By", details.preparedBy], ["Approved By", details.approvedBy]].map(([label, person]) => <div key={label} className="min-h-20 border-r border-slate-200 p-2 last:border-r-0"><div className="font-extrabold text-[#0D3A35]">{label}</div><div className="mt-4 text-slate-600">{value(person)}</div></div>)}
      </div>
      <div className="mt-3 flex justify-between border-t border-slate-200 pt-2 text-[8px] text-slate-400"><span>System-generated Payment Request</span><span>{record.reference || "Draft PRR"}</span><span>Page 1</span></div>
    </div>
  );
}

function PrrModal({ record, bills, onClose, onSave }: PrrModalProps) {
  const { user } = useAuth();
  const linkedBill = bills.find((bill) => bill.id === record.sourceBillId || bill.billInwardNo === record.sourceBillInwardNo);
  const [form, setForm] = useState<FinanceRecord>(() => ({ ...record, status: record.status === "Pending Approval" ? "Draft" : record.status || "Draft" }));
  const [details, setDetails] = useState<PRRDetails>(() => initialPrrDetails(record, linkedBill));
  const accountingDimensions = useAccountingDimensions();

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

  // ── Budget line item picker — pick a budget, then a line item within it, then an amount ──
  const [availableBudgets, setAvailableBudgets] = useState<{ budget_id: string; budget_name: string }[]>([]);
  const [budgetLineItemsCache, setBudgetLineItemsCache] = useState<Record<string, { line_item_id: string; category: string; line_item: string }[]>>({});
  const [pickedBudgetId, setPickedBudgetId] = useState("");
  const [pickedLineItemId, setPickedLineItemId] = useState("");
  const [pickedLineItemAmount, setPickedLineItemAmount] = useState("");
  const [budgetLineItemsLoading, setBudgetLineItemsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
        const response = await fetch(`${baseUrl}/admin_accounts/get_budgets`, { headers: { Accept: "application/json" } });
        const payload = await response.json().catch(() => null);
        const list: { budget_id?: string; budget_name?: string; locked?: boolean }[] = Array.isArray(payload?.data) ? payload.data : [];
        if (!active) return;
        setAvailableBudgets(list.filter((b) => b.budget_id && !b.locked).map((b) => ({ budget_id: b.budget_id!, budget_name: b.budget_name || b.budget_id! })));
      } catch {
        // best-effort — budget picker just stays empty
      }
    })();
    return () => { active = false; };
  }, []);

  // A budget's line items only live in its xlsx — fetched and parsed on demand, same recipe
  // AccountsPayments.tsx's Budget Impact picker uses (admin_accounts.get_budget/{budget_id}).
  const fetchBudgetLineItems = useCallback(async (budgetId: string) => {
    if (budgetLineItemsCache[budgetId]) return budgetLineItemsCache[budgetId];
    setBudgetLineItemsLoading(true);
    try {
      const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/admin_accounts/get_budget/${budgetId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buf = await response.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buf), { type: "array" });
      const sheet = workbook.Sheets["budget"] || workbook.Sheets[workbook.SheetNames[0]];
      const rows: Record<string, unknown>[] = sheet ? XLSX.utils.sheet_to_json(sheet) : [];
      const items = rows
        .map((r, i) => {
          const rawId = String(r.line_item_id ?? "").trim().toLowerCase();
          const hasRealId = rawId && rawId !== "undefined" && rawId !== "null";
          return {
            line_item_id: hasRealId ? String(r.line_item_id) : `item_${i}`,
            category: String(r.category ?? "").trim(),
            line_item: String(r.line_item ?? "").trim(),
          };
        })
        .filter((item) => item.line_item);
      setBudgetLineItemsCache((prev) => ({ ...prev, [budgetId]: items }));
      return items;
    } catch {
      toast.error("Failed to load line items for this budget");
      return [];
    } finally {
      setBudgetLineItemsLoading(false);
    }
  }, [budgetLineItemsCache]);

  useEffect(() => {
    setPickedLineItemId("");
    if (pickedBudgetId) void fetchBudgetLineItems(pickedBudgetId);
  }, [pickedBudgetId, fetchBudgetLineItems]);

  const pickedBudgetLineItems = budgetLineItemsCache[pickedBudgetId] ?? [];

  const addBudgetLine = () => {
    const budget = availableBudgets.find((b) => b.budget_id === pickedBudgetId);
    const lineItem = pickedBudgetLineItems.find((li) => li.line_item_id === pickedLineItemId);
    const amountNum = Number(pickedLineItemAmount) || 0;
    if (!budget || !lineItem || amountNum <= 0) { toast.error("Select a budget, a line item and an amount first."); return; }
    const key = `${budget.budget_id}::${lineItem.line_item_id}`;
    update("budgetLines", [
      ...details.budgetLines.filter((l) => l.key !== key),
      { key, budgetId: budget.budget_id, budgetName: budget.budget_name, category: lineItem.category, lineItem: lineItem.line_item, lineItemId: lineItem.line_item_id, amount: amountNum },
    ]);
    setPickedLineItemId("");
    setPickedLineItemAmount("");
  };

  const removeBudgetLine = (key: string) => update("budgetLines", details.budgetLines.filter((l) => l.key !== key));

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

  // Two submit buttons below share this one form (so required-field validation still runs
  // natively on both) — which one was clicked decides the status the record is saved with,
  // regardless of whatever's currently sitting in the Approval section's Status dropdown.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const sending = submitter?.value === "send";
    if (sending && !user?.name) { toast.error("You must be logged in to send this for approval."); return; }
    const status = sending ? "Submitted" : form.status || "Draft";
    const nextDetails = sending ? { ...details, preparedBy: formatPrrSignature(user!.name, user!.designation || "") } : details;
    onSave({ ...form, entryType: "Payment Request / PRR", party: form.party, vendorId: details.vendorCode || form.vendorId, amount: details.requestedPaymentAmount || details.netPayableAmount, notes: details.accountingNarration || details.requesterRemarks, department: details.requestingDepartment, costCentre: details.costCentre, costAttribution: details.costAttribution, project: details.projectCluster, site: details.landSite, status, prrDetails: nextDetails });
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
              <label className={labelClass}>PRR Type<select className={inputClass} value={details.prrType} onChange={(event) => update("prrType", event.target.value)}>{["Payment", "Accounting", "Advance", "Reimbursement", "Statutory", "Salary"].map((item) => <option key={item}>{item}</option>)}</select></label>
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
              <label className={`${labelClass} sm:col-span-2`}>Actual Payable Amount<span className="ml-2 font-medium normal-case text-slate-400">(lower this if part of the payment is on hold or disputed)</span><div className="relative"><IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="number" min="0" step="0.01" className={`${inputClass} pl-9`} value={String(details.actualPayableAmount ?? "")} onChange={(event) => numberUpdate("actualPayableAmount", event.target.value)} placeholder="0.00" /></div></label>
            </>)}

            {section("TDS / Tax", "Configure withholding tax and reverse charge.", <>
              <label className={labelClass}>TDS Applicable<select className={inputClass} value={details.tdsApplicable} onChange={(event) => update("tdsApplicable", event.target.value)}><option>No</option><option>Yes</option></select></label>
              <label className={labelClass}>TDS Section<select disabled={details.tdsApplicable !== "Yes"} className={inputClass} value={details.tdsSection} onChange={(event) => update("tdsSection", event.target.value)}><option value="">Select section</option>{["194C", "194J", "194I", "194H", "194Q"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className={labelClass}>TDS Rate (%)<input disabled={details.tdsApplicable !== "Yes"} type="number" min="0" step="0.01" className={inputClass} value={details.tdsRate || ""} onChange={(event) => numberUpdate("tdsRate", event.target.value)} /></label>
              {moneyField("TDS Base Amount", "tdsBaseAmount")}{moneyField("TDS Amount", "tdsAmount", true)}
              <label className={labelClass}>RCM Applicable<select className={inputClass} value={details.rcmApplicable} onChange={(event) => update("rcmApplicable", event.target.value)}><option>No</option><option>Yes</option></select></label>
            </>)}

            {section("Accounting", "Budget and cost allocation.", <>
              <label className={labelClass}>Cost Centre<select className={inputClass} value={details.accountingCostCentre} onChange={(event) => setDetails((current) => ({ ...current, accountingCostCentre: event.target.value, costCentre: event.target.value }))}><option value="">Select active cost centre</option>{accountingDimensions.costCentres.map((item) => <option key={item.id} value={item.name}>{item.code} · {item.name}</option>)}</select></label>
              <label className={labelClass}>Cost Attribution<select className={inputClass} value={details.costAttribution} onChange={(event) => update("costAttribution", event.target.value)}><option value="">Select active cost attribution</option>{accountingDimensions.costAttributions.map((item) => <option key={item.id} value={item.code}>{item.code} · {item.name}{item.level ? ` · ${item.level}` : ""}</option>)}</select></label>

              <div className="sm:col-span-2 space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <p className="text-xs font-bold text-slate-600">Budget Line Items</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.2fr_1.2fr_0.8fr_auto]">
                  <select className={inputClass} value={pickedBudgetId} onChange={(event) => setPickedBudgetId(event.target.value)}>
                    <option value="">Select budget</option>
                    {availableBudgets.map((b) => <option key={b.budget_id} value={b.budget_id}>{b.budget_name}</option>)}
                  </select>
                  <select className={inputClass} value={pickedLineItemId} onChange={(event) => setPickedLineItemId(event.target.value)} disabled={!pickedBudgetId || budgetLineItemsLoading}>
                    <option value="">{budgetLineItemsLoading ? "Loading line items…" : "Select line item"}</option>
                    {pickedBudgetLineItems.map((li) => <option key={li.line_item_id} value={li.line_item_id}>{li.line_item}{li.category ? ` · ${li.category}` : ""}</option>)}
                  </select>
                  <div className="relative"><IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="number" min="0" step="0.01" className={`${inputClass} pl-9`} value={pickedLineItemAmount} onChange={(event) => setPickedLineItemAmount(event.target.value)} placeholder="Amount" /></div>
                  <button type="button" onClick={addBudgetLine} className="h-11 rounded-xl border border-[#278b76] px-4 text-sm font-bold text-[#0d5c4d] hover:bg-[#edf7f4]">Add</button>
                </div>

                {details.budgetLines.length === 0 ? (
                  <p className="text-xs text-slate-400">No budget line items added yet.</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <table className="w-full border-collapse text-xs"><tbody>
                      {details.budgetLines.map((line) => (
                        <tr key={line.key} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-3 py-2 font-semibold text-slate-700">{line.budgetName}</td>
                          <td className="px-3 py-2 text-slate-600">{line.lineItem}{line.category ? ` · ${line.category}` : ""}</td>
                          <td className="px-3 py-2 text-right font-bold text-slate-800">{formatCurrency(line.amount)}</td>
                          <td className="w-8 px-2 text-center"><button type="button" onClick={() => removeBudgetLine(line.key)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button></td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50 font-bold">
                        <td className="px-3 py-2" colSpan={2}>Total</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(details.budgetLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0))}</td>
                        <td />
                      </tr>
                    </tbody></table>
                  </div>
                )}
              </div>

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
              <label className={labelClass}>Prepared By<input readOnly className={`${inputClass} bg-slate-50`} value={details.preparedBy || "Stamped when sent for approval"} /></label>
              <label className={labelClass}>Approved By<input readOnly className={`${inputClass} bg-slate-50`} value={details.approvedBy || "Stamped on director approval"} /></label>
              {/* Locked once a real decision exists (Approved/Rejected) — those only ever get
                  set by the actual approve/reject actions (Send for Approval → PRR Approval
                  page), never picked here, which is what keeps preparedBy/approvedBy in sync
                  with whatever this shows. Still listed as options so an already-decided
                  record's status still renders correctly here. */}
              <label className={labelClass}>Status<select className={inputClass} value={form.status} disabled={form.status === "Approved" || form.status === "Rejected"} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>{["Draft", "Submitted", "Under Review", "Approved", "Rejected", "Paid"].map((item) => <option key={item}>{item}</option>)}</select></label>
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
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" name="intent" value="draft" className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-600 hover:bg-slate-50">Save Draft</button>
            <button type="submit" name="intent" value="send" className="h-11 rounded-xl bg-[#0d5c4d] px-6 text-sm font-bold text-white hover:bg-[#0a4b3f]">Send for Approval</button>
          </div>
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

export function DocumentFitFrame({ pageWidth, children }: { pageWidth: number; children: ReactNode }) {
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
      {type === "application/pdf" ? (
        <iframe key={pdfUrl} title={name} src={pdfUrl} className="min-h-0 flex-1 bg-white" />
      ) : (
        <div className={cn("min-h-0 flex-1 p-2", fitMode ? "flex items-center justify-center overflow-hidden" : "overflow-auto")}>
          {fitMode ? (
            <img src={url} alt={name} className="h-full max-h-full w-full max-w-full object-contain shadow-lg" />
          ) : (
            <img src={url} alt={name} className="mx-auto h-auto max-w-none object-contain shadow-lg" style={{ width: `${zoom * 100}%` }} />
          )}
        </div>
      )}
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

// Non-interactive, cropped-to-fit rendering of a PDF's first page — used as the Inward card's
// live body preview, same recipe as Invoice Directory's own card preview.
function BillPdfFirstPagePreview({ url }: { url: string }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-white">
      <iframe
        src={`${url}#page=1&zoom=page-width&toolbar=0&navpanes=0&scrollbar=0&pagemode=none`}
        title="Invoice first page preview"
        loading="lazy"
        tabIndex={-1}
        className="pointer-events-none absolute left-1/2 top-0 h-[86%] w-[116%] -translate-x-1/2 border-0 bg-white"
      />
    </div>
  );
}

function BillCardPreview({ url }: { url: string }) {
  const isImage = /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(url);
  if (isImage) return <img src={url} alt="Invoice preview" loading="lazy" className="h-full w-full object-cover" />;
  return <BillPdfFirstPagePreview url={url} />;
}

// Shared full-screen shell for every card-triggered preview below (the invoice itself, or a
// linked PO/GRN reference) — same header/close-button chrome as Invoice Directory's preview.
function CardPreviewModal({
  eyebrow, title, onClose, children,
}: {
  eyebrow: string; title: string; onClose: () => void; children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-4 bg-[#0d473f] px-5 py-4 text-white">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">{eyebrow}</p>
            <h2 className="truncate text-base font-bold text-white">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/20" aria-label="Close preview"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 bg-slate-100 p-3 sm:p-4">{children}</div>
      </div>
    </div>
  );
}

// Full preview of the Bill Inward's own tax invoice document, opened by clicking an Inward
// card's body.
function InvoiceDocumentPreviewModal({ record, onClose }: { record: FinanceRecord; onClose: () => void }) {
  return (
    <CardPreviewModal eyebrow={`Bill Inward · ${record.billInwardNo || record.reference}`} title={record.attachmentName || "Tax Invoice"} onClose={onClose}>
      <div className="h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-inner">
        {record.attachmentUrl ? (
          <MediaPreviewFrame name={record.attachmentName || "Tax Invoice"} type={record.attachmentType || "application/pdf"} url={record.attachmentUrl} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><FileText className="h-7 w-7" /></span>
            <p className="font-bold text-slate-900">No invoice document on file</p>
          </div>
        )}
      </div>
    </CardPreviewModal>
  );
}

// Resolves and previews whichever real record (Purchase Order / GRN / WCC certificate) a Bill
// Inward's PO or GRN reference points at — same lookups BillVerificationPreview's own linked-
// document effect uses, kept separate here since the card's "oblique arrow" opens straight into
// just this one document rather than the full bill preview.
function ReferenceDocumentPreviewModal({
  record, kind, onClose,
}: {
  record: FinanceRecord; kind: "order" | "completion"; onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [linkedPurchaseOrder, setLinkedPurchaseOrder] = useState<Record<string, unknown> | null>(null);
  const [linkedGrn, setLinkedGrn] = useState<GRNRecord | null>(null);
  const [fallback, setFallback] = useState<{ url: string; type: string } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLinkedPurchaseOrder(null);
    setLinkedGrn(null);
    setFallback(null);
    const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
    const absoluteUrl = (value: string) => (/^(https?:|blob:|data:)/i.test(value) ? value : `${baseUrl}/${value.replace(/^\//, "")}`);

    const load = async () => {
      try {
        if (kind === "order" && record.poWoReference && record.poWoReference !== "NA" && baseUrl) {
          const response = await fetch(`${baseUrl}/purchase_flow/get_all_purchase_orders`, { headers: { Accept: "application/json" } });
          const payload = response.ok ? await response.json().catch(() => null) : null;
          const orders: Record<string, unknown>[] = Array.isArray(payload?.purchase_orders) ? payload.purchase_orders : [];
          const selectedOrder = orders.find((order) => {
            const quote = order.purchase_quote && typeof order.purchase_quote === "object" ? order.purchase_quote as Record<string, unknown> : {};
            return [order.order_number, quote.order_number, quote.poNo, quote.po_no].some((value) => String(value ?? "").trim() === record.poWoReference);
          });
          if (active && selectedOrder) setLinkedPurchaseOrder(selectedOrder);
        } else if (kind === "completion" && record.grnServiceReference && record.grnServiceReference !== "NA") {
          if (record.referenceType === "PO") {
            const grn = await getGrnById(record.grnServiceReference);
            if (active) setLinkedGrn(grn);
          } else if (record.referenceType === "WO" && baseUrl) {
            const response = await fetch(`${baseUrl}/admin_wcc_certificate/get_by_order/${encodeURIComponent(record.poWoReference || "")}`, { headers: { Accept: "application/json" } });
            const payload = response.ok ? await response.json().catch(() => null) : null;
            const certificates: Record<string, unknown>[] = Array.isArray(payload?.certificates) ? payload.certificates : [];
            const certificate = certificates.find((item) => [item.certificate_id, item.wcc_number].some((value) => String(value ?? "").trim() === record.grnServiceReference));
            const rawUrl = certificate ? String(certificate.document_url ?? certificate.doc_url ?? certificate.file_url ?? certificate.certificate_url ?? "").trim() : "";
            if (active && rawUrl) setFallback({ url: absoluteUrl(rawUrl), type: "application/pdf" });
          }
        }
      } catch {
        // Surfaced below as "could not be loaded" — the reference itself remains visible.
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [record.poWoReference, record.grnServiceReference, record.referenceType, kind]);

  const isOrder = kind === "order";
  const referenceNumber = (isOrder ? record.poWoReference : record.grnServiceReference) || "—";
  const referenceLabel = isOrder ? (record.referenceType || "Order") : record.referenceType === "WO" ? "WCC / Service Completion" : "Goods Receipt Note";

  return (
    <CardPreviewModal eyebrow={`${referenceLabel} Reference`} title={referenceNumber} onClose={onClose}>
      <div className="h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-inner">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-[#0d5c4d]"><RefreshCw className="h-8 w-8 animate-spin" /><p className="text-sm font-bold">Loading linked document…</p></div>
        ) : isOrder && linkedPurchaseOrder ? (
          <DocumentFitFrame pageWidth={794}><ExactPurchaseOrderPreview order={linkedPurchaseOrder} /></DocumentFitFrame>
        ) : !isOrder && linkedGrn ? (
          <DocumentFitFrame pageWidth={1100}><GrnDocumentPreview grn={linkedGrn} /></DocumentFitFrame>
        ) : fallback ? (
          <MediaPreviewFrame name={referenceNumber} type={fallback.type} url={fallback.url} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><FileText className="h-7 w-7" /></span>
            <p className="font-bold text-slate-900">This document could not be loaded</p>
            <p className="text-sm text-slate-500">The linked {referenceLabel.toLowerCase()} record wasn't found.</p>
          </div>
        )}
      </div>
    </CardPreviewModal>
  );
}

// Read-only preview of a Payment Request / PRR — the same formatted document PrrModal renders
// live in its own "Live PRR Preview" pane, just without the surrounding editable form (opening
// PrrModal itself on an already-submitted PRR re-primes it as an editable Draft, which is not
// what a preview click should do).
function PrrDocumentPreviewModal({
  record: prrRecord, linkedBill, onClose,
}: {
  record: FinanceRecord; linkedBill?: FinanceRecord; onClose: () => void;
}) {
  const details = initialPrrDetails(prrRecord, linkedBill);
  const taxInvoiceName = linkedBill?.attachmentName || "Not linked";
  const poWoName = prrRecord.poWoReference || "Not linked";
  const completionName = prrRecord.grnServiceReference || "Not linked";

  return (
    <CardPreviewModal eyebrow="Payment Request / PRR" title={prrRecord.reference || "PRR"} onClose={onClose}>
      <div className="h-full overflow-hidden rounded-xl border border-slate-200 bg-slate-200/70 p-2 shadow-inner">
        <DocumentFitFrame pageWidth={794}>
          <PrrDocumentPreview record={prrRecord} details={details} taxInvoiceName={taxInvoiceName} poWoName={poWoName} completionName={completionName} />
        </DocumentFitFrame>
      </div>
    </CardPreviewModal>
  );
}

// One Bill Inward, rendered as its own live-preview card (Invoice Directory's layout) rather
// than a table row — used by every bills-payables register (Inward, Verification, Ledger
// Posting, Outstanding, Bills Paid), so a bill looks the same wherever it currently sits.
// Header carries the bill's own identity, the body IS the tax invoice document, the footer
// surfaces amount/party plus jump-off points to whatever PO/GRN it was raised against, and
// `actions` is whatever that particular tab lets you do with it next.
function BillRegisterCard({
  record, vendorName, onPreviewInvoice, onPreviewReference, prrInfo, onPreviewPrr, actions,
}: {
  record: FinanceRecord;
  vendorName: string;
  onPreviewInvoice: () => void;
  onPreviewReference: (kind: "order" | "completion") => void;
  prrInfo?: { prrNumber: string; prrType: string; preparedStatus: string; directorStatus: string } | null;
  onPreviewPrr?: () => void;
  actions: ReactNode;
}) {
  const hasOrderReference = Boolean(record.poWoReference) && record.poWoReference !== "NA";
  const hasCompletionReference = Boolean(record.grnServiceReference) && record.grnServiceReference !== "NA";
  const completionLabel = record.referenceType === "WO" ? "WCC" : "GRN";

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.035)] transition hover:-translate-y-0.5 hover:border-[#8bbcaf] hover:shadow-[0_14px_34px_rgba(13,71,63,0.09)]">
      <div className="shrink-0 border-b border-slate-100 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#18765f]">Bill Inward No.</p>
            <p className="truncate text-base font-bold text-slate-900" title={record.billInwardNo || record.reference}>{record.billInwardNo || record.reference || "—"}</p>
          </div>
          <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase", record.status === "Pending Approval" ? "bg-amber-50 text-amber-700" : record.status === "Verified" || ["Posted", "Paid", "Reconciled", "Closed"].includes(record.status) ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>{record.status || "Draft"}</span>
        </div>
        <p className="mt-1.5 text-[11px] font-semibold text-slate-400">Invoice Date: {formatRegisterDate(record.invoiceDate)}</p>
        {record.splitNote && (
          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-700" title={record.splitFrom ? `Split from ${record.splitFrom}` : undefined}>
            ↳ {record.splitNote}
          </p>
        )}
      </div>

      <button type="button" onClick={onPreviewInvoice} className="relative min-h-[220px] flex-1 cursor-pointer overflow-hidden bg-slate-50 outline-none" title="Preview invoice">
        {record.attachmentUrl ? <BillCardPreview url={record.attachmentUrl} /> : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-300">
            <FileText className="h-8 w-8" />
            <p className="text-xs font-semibold">No invoice document</p>
          </div>
        )}
      </button>

      <div className="shrink-0 space-y-3 border-t border-slate-100 px-4 py-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900" title={vendorName}>{vendorName}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Party</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-base font-extrabold text-[#0d5c4d]">{formatCurrency(record.amount)}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Amount Payable</p>
          </div>
        </div>

        {(hasOrderReference || hasCompletionReference || prrInfo) && (
          <div className="flex flex-wrap gap-1.5">
            {hasOrderReference && (
              <button
                type="button"
                onClick={() => onPreviewReference("order")}
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:border-[#b8d6ce] hover:bg-[#eaf4f1] hover:text-[#0d5c4d]"
                title={`Preview ${record.referenceType || "PO"} ${record.poWoReference}`}
              >
                <span className="truncate">{record.referenceType || "PO"}: {record.poWoReference}</span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
              </button>
            )}
            {hasCompletionReference && (
              <button
                type="button"
                onClick={() => onPreviewReference("completion")}
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:border-[#b8d6ce] hover:bg-[#eaf4f1] hover:text-[#0d5c4d]"
                title={`Preview ${completionLabel} ${record.grnServiceReference}`}
              >
                <span className="truncate">{completionLabel}: {record.grnServiceReference}</span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
              </button>
            )}
            {prrInfo && (
              prrInfo.prrNumber && onPreviewPrr ? (
                <button
                  type="button"
                  onClick={onPreviewPrr}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:border-[#b8d6ce] hover:bg-[#eaf4f1] hover:text-[#0d5c4d]"
                  title={`Preview PRR ${prrInfo.prrNumber}`}
                >
                  <span className="truncate">PRR: {prrInfo.prrNumber}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                </button>
              ) : (
                <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-400">PRR: {prrInfo.prrNumber || "Awaiting PRR"}</span>
              )
            )}
          </div>
        )}

        <p className="truncate text-[11px] font-medium text-slate-400" title={vendorName}>
          Vendor ID: {record.vendorId || "—"}{record.vendorGstin && ` · GSTIN: ${record.vendorGstin}`}
        </p>

        {prrInfo?.prrNumber && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5 text-[11px] font-bold">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{prrInfo.prrType}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Prepared: {prrInfo.preparedStatus}</span>
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5", prrInfo.directorStatus === "Approved" ? "bg-emerald-50 text-emerald-700" : prrInfo.directorStatus === "Rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700")}>Director: {prrInfo.directorStatus}</span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 px-4 py-3">{actions}</div>
    </div>
  );
}

// Shown right after a bill is verified — books the liability against the vendor's accounts
// ledger via the same add_accounts_ledger_entry endpoint AccountsPayments.tsx already uses
// for its own "intake" step, so both flows post to the same place.
type JournalLine = { id: string; glAccount: string; subLedger: string; debit: string; credit: string };
type MasterItem = Record<string, unknown>;

type PostedVoucherLine = { gl_account: string; sub_ledger?: string; cost_centre?: string; cost_attribution?: string; debit?: number; credit?: number };
type PostedVoucherData = { voucher_no: string; party?: string; narration?: string; lines: PostedVoucherLine[] };

const masterOptionLabel = (item: MasterItem): string => {
  const code = String(item.code ?? "").trim();
  const name = String(item.name ?? item.label ?? "").trim();
  if (code && name) return `${code} - ${name}`;
  return name || code || String(item.item_id ?? "");
};

// Just the leading code portion of a "CODE - Name" / "CODE · Name" label — AccountingMaster's
// Control GL picker (AccountingMaster.tsx) stores a Sub Ledger's linked GL as "code · name"
// while this modal's own GL datalist renders "code - name", so matching on the full label
// would never line up. Codes are the one thing both sides agree on.
const masterCode = (value: string): string => String(value ?? "").split(/\s*[-·]\s*/)[0].trim();

function LedgerEntryModal({ record, onClose, onPosted }: { record: FinanceRecord; onClose: () => void; onPosted: (voucher: PostedVoucherData) => void }) {
  const totalGst = Number(record.cgstAmount || 0) + Number(record.sgstAmount || 0) + Number(record.igstAmount || 0);
  const totalPayable = Number(record.amount || 0) || (Number(record.baseAmount || 0) + totalGst + Number(record.otherAdjustment || 0));
  const sourceReference = record.billInwardNo || record.reference || "";
  const [postingDate, setPostingDate] = useState(new Date().toISOString().slice(0, 10));
  const [voucherType, setVoucherType] = useState("Purchase");
  const [narration, setNarration] = useState(`${record.entryType || "Bill Inward"} ${sourceReference} - ${record.party || ""}`.trim());
  const [voucherNo, setVoucherNo] = useState("Generating…");
  const [lines, setLines] = useState<JournalLine[]>(() => [
    { id: "l1", glAccount: "", subLedger: "", debit: totalPayable ? String(totalPayable) : "", credit: "" },
    { id: "l2", glAccount: "", subLedger: record.party || "", debit: "", credit: totalPayable ? String(totalPayable) : "" },
  ]);
  // One Cost Centre / Cost Attribution for the whole voucher, not per line — set once here
  // rather than repeated on every ledger line.
  const [costCentre, setCostCentre] = useState("");
  const [costAttribution, setCostAttribution] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedDocKey, setSelectedDocKey] = useState("");
  const [masters, setMasters] = useState<{ glAccounts: MasterItem[]; subLedgers: MasterItem[]; costCentres: MasterItem[]; costAttributions: MasterItem[]; voucherTypes: MasterItem[] }>({ glAccounts: [], subLedgers: [], costCentres: [], costAttributions: [], voucherTypes: [] });
  // Fallback for records saved before the vendor-name-sync fix (BillInwardModal), where
  // vendor_name was stored blank even though vendorId/gstin came through fine — resolves the
  // real name live from the vendor directory instead of showing a permanently blank Party.
  const [resolvedVendorName, setResolvedVendorName] = useState("");
  useEffect(() => {
    if (record.party || !record.vendorId) { setResolvedVendorName(""); return; }
    let cancelled = false;
    const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
    (async () => {
      try {
        const request = (method: "GET" | "POST") => fetch(`${baseUrl}/purchase_flow/get_vendors`, { method, headers: { Accept: "application/json" } });
        let response = await request("GET");
        if (response.status === 405) response = await request("POST");
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        const list: Array<Record<string, unknown>> = Array.isArray(payload?.vendors) ? payload.vendors : [];
        const match = list.find((item) => String(item.vendor_id ?? "").trim() === record.vendorId);
        const name = match ? String(match.vendor_name ?? "").trim() : "";
        if (!cancelled && name) setResolvedVendorName(name);
      } catch {
        // best-effort — Party falls back to showing vendor id/GSTIN only
      }
    })();
    return () => { cancelled = true; };
  }, [record.party, record.vendorId]);

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
          glAccounts: mergeSbrGlSeed(data.data?.GL_ACCOUNT ?? []) as MasterItem[],
          subLedgers: data.data?.SUB_LEDGER ?? [],
          costCentres: data.data?.COST_CENTRE ?? [],
          costAttributions: data.data?.COST_ATTRIBUTION ?? [],
          voucherTypes: data.data?.VOUCHER_TYPE ?? [],
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const documents = [
    ...(record.attachmentUrl ? [{ key: "bill", name: record.attachmentName || "Bill attachment", role: "bill" as const, type: record.attachmentType || (/\.pdf(\?|$)/i.test(record.attachmentUrl) ? "application/pdf" : "image/jpeg"), url: record.attachmentUrl }] : []),
    ...Object.entries(record.additionalDocumentUrls ?? {}).map(([name, url]) => ({ key: `add-${url}`, name, role: "supporting" as const, type: /\.pdf(\?|$)/i.test(url) ? "application/pdf" : "image/jpeg", url })),
  ];
  const selectedDocument = documents.find((document) => document.key === selectedDocKey) ?? documents[0];

  const updateLine = (id: string, patch: Partial<JournalLine>) => setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  const addLine = () => setLines((prev) => [...prev, { id: `l${Date.now()}`, glAccount: "", subLedger: "", debit: "", credit: "" }]);
  const removeLine = (id: string) => setLines((prev) => (prev.length > 2 ? prev.filter((line) => line.id !== id) : prev));

  const totalDebit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
  const difference = Math.round((totalDebit - totalCredit) * 100) / 100;
  const isBalanced = difference === 0 && totalDebit > 0;

  const handlePost = async () => {
    const completedLines = lines.filter((line) => line.glAccount.trim() && ((Number(line.debit) || 0) > 0 || (Number(line.credit) || 0) > 0));
    if (completedLines.length < 2) { toast.error("Add at least two ledger lines with a GL Account and an amount."); return; }
    if (!isBalanced) { toast.error("Debit and Credit totals must match before posting."); return; }
    setSubmitting(true);
    try {
      const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
      // For a PRR with budget lines, move each line's amount Allocated-first-then-Remaining
      // into Utilized before the real (irreversible) ledger voucher posts — a budget shortfall
      // must block posting outright, not get discovered after the entry is already live.
      const budgetLines = record.entryType === "Payment Request / PRR" ? (record.prrDetails?.budgetLines ?? []) : [];
      if (budgetLines.length > 0) {
        const budgetResponse = await fetch(`${baseUrl}/admin_accounts/consume_budget_on_ledger_post`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reference: sourceReference,
            lines: budgetLines.map((line) => ({ budget_id: line.budgetId, category: line.category, line_item: line.lineItem, amount: line.amount })),
          }),
        });
        const budgetData = await budgetResponse.json().catch(() => null);
        if (!budgetResponse.ok || !budgetData?.success) {
          const shortfalls: Array<{ line_item?: string; requested?: number; available?: number }> = budgetData?.detail?.shortfalls ?? [];
          const message = shortfalls.length
            ? `Insufficient budget for ${shortfalls.map((s) => s.line_item).join(", ")} — only ${formatCurrency(shortfalls[0].available || 0)} available against ${formatCurrency(shortfalls[0].requested || 0)} requested.`
            : (typeof budgetData?.detail === "string" ? budgetData.detail : "Insufficient budget to post this ledger entry.");
          throw new Error(message);
        }
      }
      const response = await fetch(`${baseUrl}/admin_accounts/post_journal_voucher`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posting_date: postingDate,
          voucher_type: voucherType,
          source_module: "Purchase",
          source_reference: sourceReference,
          invoice_no: record.reference || "",
          invoice_id: record.id,
          party: record.party || "",
          vendor_id: record.vendorId || "",
          narration,
          lines: completedLines.map((line) => ({ gl_account: line.glAccount, sub_ledger: line.subLedger, cost_centre: costCentre, cost_attribution: costAttribution, debit: Number(line.debit) || 0, credit: Number(line.credit) || 0 })),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(data?.detail || data?.message || "Failed to post journal voucher");
      toast.success(`${data.data?.voucher_no || voucherNo} posted for ${sourceReference}`);
      onPosted(data.data as PostedVoucherData);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to post journal voucher");
    } finally {
      setSubmitting(false);
    }
  };

  // Bigger, more spacious field styling to match the rest of the redesigned Accounting
  // Master dialogs — a chevron overlay (selectAffordance) is added on top of the fields that
  // are meant to feel like "pick from a list" (they're still text+datalist underneath, same
  // as before, just visually cued as selectable).
  const smallInput = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 outline-none transition focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10";
  const selectAffordance = "relative [&>input]:pr-9 [&>svg]:pointer-events-none [&>svg]:absolute [&>svg]:right-3 [&>svg]:top-1/2 [&>svg]:-translate-y-1/2 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-slate-400";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-[2px]">
      <div className="flex max-h-[96vh] w-full max-w-[1800px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between bg-gradient-to-br from-[#0d473f] to-[#134f43] px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border-2 border-white/25 bg-white/5"><FileText className="h-5 w-5" /></span>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/60">{record.entryType === "Payment Request / PRR" ? "Payments & Receipts" : "Bills & Payables"} · Ledger Posting</p>
              <h2 className="mt-0.5 text-xl font-bold">Post Accounting Entry</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto bg-[#eef3f6] lg:grid-cols-[3fr_7fr] lg:overflow-hidden">
          <section className="flex min-h-[460px] flex-col border-b border-slate-200 p-4 lg:min-h-0 lg:border-b-0 lg:border-r lg:p-5">
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-slate-400">Document on File</p>
              {selectedDocument && <span className="truncate text-[11px] font-semibold text-slate-500">{selectedDocument.name}</span>}
            </div>
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
            <div className="flex min-h-[400px] flex-1 items-center justify-center overflow-hidden rounded-2xl bg-slate-200/70 p-3 ring-1 ring-slate-300/70">
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
            <div className="mb-5 grid grid-cols-2 gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-xs sm:grid-cols-4">
              {[["Voucher No.", voucherNo], ["Date", formatRegisterDate(postingDate)], ["Source", record.entryType || "Bill Inward"], ["Reference No.", sourceReference || "—"], ["Party", record.party || resolvedVendorName || "—"], ["Amount", formatCurrency(totalPayable)], ["Status", "Draft"]].map(([label, value]) => (
                <div key={label}><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</p><p className="mt-1 truncate text-sm font-bold text-slate-800">{value}</p></div>
              ))}
            </div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#18765f]">A. Source Details</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Posting Date *
                <input required type="date" value={postingDate} onChange={(event) => setPostingDate(event.target.value)} className={smallInput} />
              </label>
              <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Voucher Type *
                <div className={selectAffordance}><input required list="ledger-voucher-types" value={voucherType} onChange={(event) => setVoucherType(event.target.value)} className={smallInput} placeholder="Purchase" /><ChevronDown /></div>
                <datalist id="ledger-voucher-types">{(masters.voucherTypes.length ? masters.voucherTypes.map((item) => masterOptionLabel(item)) : ["Purchase", "Journal", "Payment"]).map((label) => <option key={label} value={label} />)}</datalist>
              </label>
              <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Source Module
                <div className={selectAffordance}><input disabled value="Bill Inward" className={cn(smallInput, "bg-slate-50 text-slate-500")} /><ChevronDown /></div>
              </label>
              <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Source Reference
                <input disabled value={sourceReference || "—"} className={cn(smallInput, "bg-slate-50 text-slate-500")} />
              </label>
              <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Invoice / Document No.
                <input disabled value={record.reference || "—"} className={cn(smallInput, "bg-slate-50 text-slate-500")} />
              </label>
              <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Party *
                {/* Always the vendor's own name and details, sourced from the record's vendorId/
                    vendorGstin (see BillInwardModal's party-sync effect) — never free text here,
                    so this can't drift from the actual vendor. */}
                <div className="flex min-h-[2.75rem] w-full flex-col justify-center gap-0.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2">
                  <span className="truncate text-sm font-bold text-slate-700">{record.party || resolvedVendorName || "—"}</span>
                  {(record.vendorId || record.vendorGstin) && <span className="truncate text-[11px] font-medium text-slate-400">{[record.vendorId, record.vendorGstin].filter(Boolean).join(" · ")}</span>}
                </div>
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
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{["#", "GL Account *", "Sub Ledger", "Debit (₹)", "Credit (₹)", ""].map((label) => <th key={label} className="px-3 py-3 font-bold">{label}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line, index) => {
                    // Only Sub Ledgers whose Control GL matches this row's selected GL Account —
                    // matched on the GL code alone since Accounting Master's Control GL picker
                    // stores "code · name" while this modal's own GL datalist renders "code - name".
                    const glCode = masterCode(line.glAccount);
                    const rowSubLedgers = glCode ? masters.subLedgers.filter((item) => masterCode(String(item.control ?? "")) === glCode) : masters.subLedgers;
                    const rowDatalistId = `ledger-sub-ledgers-${line.id}`;
                    return (
                      <tr key={line.id}>
                        <td className="px-3 py-2.5 font-semibold text-slate-500">{index + 1}</td>
                        <td className="px-3 py-2.5"><div className={selectAffordance}><input list="ledger-gl-accounts" value={line.glAccount} onChange={(event) => updateLine(line.id, { glAccount: event.target.value, subLedger: "" })} className={smallInput} placeholder="Select GL account" /><ChevronDown /></div></td>
                        <td className="px-3 py-2.5">
                          <div className={selectAffordance}><input list={rowDatalistId} value={line.subLedger} onChange={(event) => updateLine(line.id, { subLedger: event.target.value })} className={smallInput} placeholder={glCode ? (rowSubLedgers.length ? "Select sub ledger" : "No sub ledgers under this GL") : "Select a GL account first"} /><ChevronDown /></div>
                          <datalist id={rowDatalistId}>{rowSubLedgers.map((item) => <option key={String(item.item_id)} value={masterOptionLabel(item)} />)}</datalist>
                        </td>
                        <td className="px-3 py-2.5"><input type="number" min="0" step="0.01" onWheel={(e) => e.currentTarget.blur()} value={line.debit} onChange={(event) => updateLine(line.id, { debit: event.target.value, credit: event.target.value ? "" : line.credit })} className={smallInput} /></td>
                        <td className="px-3 py-2.5"><input type="number" min="0" step="0.01" onWheel={(e) => e.currentTarget.blur()} value={line.credit} onChange={(event) => updateLine(line.id, { credit: event.target.value, debit: event.target.value ? "" : line.debit })} className={smallInput} /></td>
                        <td className="px-3 py-2.5 text-center"><button type="button" onClick={() => removeLine(line.id)} disabled={lines.length <= 2} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <datalist id="ledger-gl-accounts">{masters.glAccounts.map((item) => <option key={String(item.item_id)} value={masterOptionLabel(item)} />)}</datalist>
            </div>

            <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-2 lg:grid-cols-5">
              <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 lg:col-span-1">Cost Centre
                <div className={selectAffordance}><input list="ledger-cost-centres" value={costCentre} onChange={(event) => setCostCentre(event.target.value)} className={smallInput} placeholder="—" /><ChevronDown /></div>
                <datalist id="ledger-cost-centres">{masters.costCentres.map((item) => <option key={String(item.item_id)} value={masterOptionLabel(item)} />)}</datalist>
              </label>
              <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 lg:col-span-1">Cost Attribution
                <div className={selectAffordance}><input list="ledger-cost-attributions" value={costAttribution} onChange={(event) => setCostAttribution(event.target.value)} className={smallInput} placeholder="—" /><ChevronDown /></div>
                <datalist id="ledger-cost-attributions">{masters.costAttributions.map((item) => <option key={String(item.item_id)} value={masterOptionLabel(item)} />)}</datalist>
              </label>
              <div className="flex items-end justify-between gap-3 border-t border-slate-200 pt-3 sm:col-span-2 sm:border-t-0 sm:pt-0 lg:col-span-3 lg:justify-end">
                <span><span className="text-slate-500">Total Debit (₹) </span><span className="font-bold text-slate-800">{formatCurrency(totalDebit)}</span></span>
                <span><span className="text-slate-500">Total Credit (₹) </span><span className="font-bold text-slate-800">{formatCurrency(totalCredit)}</span></span>
                <span className={cn("inline-flex items-center gap-1.5 font-bold", isBalanced ? "text-emerald-700" : "text-amber-700")}>Difference (₹) {formatCurrency(Math.abs(difference))} {isBalanced ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}</span>
              </div>
            </div>
          </section>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-6 py-4">
          <p className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", isBalanced ? "text-emerald-700" : "text-slate-400")}>{isBalanced && <CheckCircle2 className="h-4 w-4" />}{isBalanced ? "Ready to post — debit and credit are balanced." : "Debit and credit must be equal before this can be posted."}</p>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={submitting} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Skip for now</button>
            <button type="button" onClick={handlePost} disabled={submitting || !isBalanced} className="h-11 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white hover:bg-[#0a4b3f] disabled:opacity-60">{submitting ? "Posting…" : "Post Ledger Entry"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

type PaymentDetailsForm = { paymentMode: string; utr: string; amount: string; chequeNumber: string };

// Outstanding's action per row depends on the PRR type behind it: a "Payment" (or Advance/
// Reimbursement/Statutory/Salary) PRR needs a real transaction settled — Payment Details plus
// the ledger entry. An "Accounting" PRR never has a transaction at all (a provision, write-
// off, reallocation, etc.) — only the ledger entry closes it out, so Payment Details is
// skipped entirely and the Ledger Entry section is always open, not collapsible.
function MarkPaidModal({ record, isAccounting = false, onClose, onPaid }: { record: FinanceRecord; isAccounting?: boolean; onClose: () => void; onPaid: () => void }) {
  const { user } = useAuth();
  const [form, setForm] = useState<PaymentDetailsForm>({ paymentMode: "NEFT", utr: "", amount: record.amount ? String(record.amount) : "", chequeNumber: "" });
  const set = <K extends keyof PaymentDetailsForm>(key: K, value: PaymentDetailsForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const [ledgerOpen, setLedgerOpen] = useState(isAccounting);
  const [postingDate, setPostingDate] = useState(new Date().toISOString().slice(0, 10));
  const [voucherType, setVoucherType] = useState(isAccounting ? "Journal" : "Payment");
  const [narration, setNarration] = useState(`${isAccounting ? "Accounting adjustment for" : "Payment against"} ${record.billInwardNo || record.reference} - ${record.party || ""}`.trim());
  const totalPayable = Number(record.amount || 0);
  const [lines, setLines] = useState<JournalLine[]>(() => [
    { id: "l1", glAccount: "", subLedger: record.party || "", debit: totalPayable ? String(totalPayable) : "", credit: "" },
    { id: "l2", glAccount: "", subLedger: "", debit: "", credit: totalPayable ? String(totalPayable) : "" },
  ]);
  const [costCentre, setCostCentre] = useState("");
  const [costAttribution, setCostAttribution] = useState("");
  const [masters, setMasters] = useState<{ glAccounts: MasterItem[]; subLedgers: MasterItem[]; costCentres: MasterItem[]; costAttributions: MasterItem[]; voucherTypes: MasterItem[] }>({ glAccounts: [], subLedgers: [], costCentres: [], costAttributions: [], voucherTypes: [] });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
    let cancelled = false;
    fetch(`${baseUrl}/admin_accounting_masters/list_all`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data?.success) return;
        setMasters({
          glAccounts: mergeSbrGlSeed(data.data?.GL_ACCOUNT ?? []) as MasterItem[],
          subLedgers: data.data?.SUB_LEDGER ?? [],
          costCentres: data.data?.COST_CENTRE ?? [],
          costAttributions: data.data?.COST_ATTRIBUTION ?? [],
          voucherTypes: data.data?.VOUCHER_TYPE ?? [],
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // True until the preparer manually types a debit/credit amount or adds/removes a line — while
  // true, the two default lines track whatever "Amount Paid" says (see effect below), so a
  // partial payment's ledger entry defaults to the partial amount instead of silently staying at
  // the full row amount it was first seeded from.
  const [linesAmountPristine, setLinesAmountPristine] = useState(true);
  const updateLine = (id: string, patch: Partial<JournalLine>) => {
    if (patch.debit !== undefined || patch.credit !== undefined) setLinesAmountPristine(false);
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };
  const addLine = () => {
    setLinesAmountPristine(false);
    setLines((prev) => [...prev, { id: `l${Date.now()}`, glAccount: "", subLedger: "", debit: "", credit: "" }]);
  };
  const removeLine = (id: string) => {
    setLinesAmountPristine(false);
    setLines((prev) => (prev.length > 2 ? prev.filter((line) => line.id !== id) : prev));
  };

  useEffect(() => {
    if (isAccounting || !linesAmountPristine) return;
    const amount = Number(form.amount) || 0;
    setLines((prev) => (prev.length === 2 ? [
      { ...prev[0], debit: amount ? String(amount) : "", credit: "" },
      { ...prev[1], debit: "", credit: amount ? String(amount) : "" },
    ] : prev));
  }, [form.amount, isAccounting, linesAmountPristine]);

  const totalDebit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
  const difference = Math.round((totalDebit - totalCredit) * 100) / 100;
  const isBalanced = difference === 0 && totalDebit > 0;

  const smallInput = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 outline-none transition focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10";
  const selectAffordance = "relative [&>input]:pr-9 [&>svg]:pointer-events-none [&>svg]:absolute [&>svg]:right-3 [&>svg]:top-1/2 [&>svg]:-translate-y-1/2 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-slate-400";

  const submit = async () => {
    if (!isAccounting) {
      if (!form.paymentMode) { toast.error("Select a payment mode."); return; }
      if (!(Number(form.amount) > 0)) { toast.error("Enter the amount paid."); return; }
    }
    const completedLines = lines.filter((line) => line.glAccount.trim() && ((Number(line.debit) || 0) > 0 || (Number(line.credit) || 0) > 0));
    if (completedLines.length < 2 || !isBalanced) {
      setLedgerOpen(true);
      toast.error(`Add the ledger entry ${isAccounting ? "for this adjustment" : "for this payment"} — at least two balanced GL lines are required before ${isAccounting ? "closing this out" : "marking as paid"}.`);
      return;
    }
    if (!user?.id && !user?.name) { toast.error("You must be logged in to continue."); return; }
    setSubmitting(true);
    try {
      const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");

      // Three independent side effects of closing this out — post the ledger entry, mark the
      // payment paid, and (for a real payment, not an accounting-only entry with no actual
      // transaction) deduct the paid amount from its PRR's budget. None of them depend on
      // another's response, so they're fired together rather than chained.
      const voucherPromise = fetch(`${baseUrl}/admin_accounts/post_journal_voucher`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posting_date: postingDate,
          voucher_type: voucherType,
          source_module: isAccounting ? "Accounting" : "Payment",
          source_reference: record.billInwardNo || record.reference || "",
          invoice_no: record.reference || "",
          invoice_id: record.id,
          party: record.party || "",
          vendor_id: record.vendorId || "",
          narration,
          lines: completedLines.map((line) => ({ gl_account: line.glAccount, sub_ledger: line.subLedger, cost_centre: costCentre, cost_attribution: costAttribution, debit: Number(line.debit) || 0, credit: Number(line.credit) || 0 })),
        }),
      });

      const markPaidPromise = fetch(`${baseUrl}/admin_accounts/mark_payment_paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: record.id,
          staff_id: user?.id || "",
          name: user?.name || "",
          payment_mode: isAccounting ? "" : form.paymentMode,
          utr: isAccounting ? "" : form.utr,
          amount: isAccounting ? undefined : Number(form.amount) || 0,
          cheque_number: !isAccounting && form.paymentMode === "Cheque" ? form.chequeNumber : "",
        }),
      });

      const budgetDeductionPromise = isAccounting ? null : fetch(`${baseUrl}/admin_accounts/deduct_from_budget_against_payment_completion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prr_number: record.prrNumber || "", amount_paid: Number(form.amount) || 0 }),
      });

      const [voucherResponse, markPaidResponse, budgetResponse] = await Promise.all([voucherPromise, markPaidPromise, budgetDeductionPromise]);

      const voucherData = await voucherResponse.json().catch(() => null);
      if (!voucherResponse.ok || !voucherData?.success) throw new Error(voucherData?.detail || voucherData?.message || "Failed to post the ledger entry");

      const markPaidData = await markPaidResponse.json().catch(() => null);
      if (!markPaidResponse.ok || !markPaidData?.success) throw new Error(markPaidData?.message || markPaidData?.detail || "Failed to close this out");

      if (budgetResponse) {
        const budgetData = await budgetResponse.json().catch(() => null);
        if (!budgetResponse.ok || !budgetData?.success) throw new Error(budgetData?.message || budgetData?.detail || "Failed to deduct the paid amount from the budget");
      }

      if (markPaidData?.split_invoice_id) {
        toast.success(`${record.billInwardNo || record.reference} settled for ${formatCurrency(Number(form.amount) || 0)} — ${markPaidData.split_invoice_id} created for the remaining balance`);
      } else {
        toast.success(isAccounting ? `${record.billInwardNo || record.reference} closed with the ledger entry` : `${record.billInwardNo || record.reference} marked as paid`);
      }
      onPaid();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to close this out");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-[2px]">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between bg-gradient-to-br from-[#0d473f] to-[#134f43] px-6 py-5 text-white">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/60">Bills & Payables · Outstanding</p>
            <h2 className="mt-0.5 text-xl font-bold">{isAccounting ? "Post Ledger Entry" : "Mark as Paid"}</h2>
            <p className="mt-1 text-xs text-white/70">{record.billInwardNo || record.reference} · {record.party || "—"} · {record.prrNumber}{isAccounting ? " · Accounting PRR — no transaction, ledger entry only" : ""}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {!isAccounting && (
            <>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#18765f]">Payment Details</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-xs font-bold text-slate-600">Mode of Payment
                  <select value={form.paymentMode} onChange={(event) => set("paymentMode", event.target.value)} className={smallInput}>
                    {["NEFT", "RTGS", "IMPS", "UPI", "Cheque", "Cash"].map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5 text-xs font-bold text-slate-600">UTR / Reference No.
                  <input value={form.utr} onChange={(event) => set("utr", event.target.value)} className={smallInput} placeholder="Transaction reference" />
                </label>
                <label className="space-y-1.5 text-xs font-bold text-slate-600">Amount
                  <div className="relative"><IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => set("amount", event.target.value)} className={cn(smallInput, "pl-9")} /></div>
                </label>
                {form.paymentMode === "Cheque" && (
                  <label className="space-y-1.5 text-xs font-bold text-slate-600">Cheque Number <span className="font-medium normal-case text-slate-400">(optional)</span>
                    <input value={form.chequeNumber} onChange={(event) => set("chequeNumber", event.target.value)} className={smallInput} placeholder="Cheque no." />
                  </label>
                )}
              </div>
            </>
          )}

          {isAccounting ? (
            <p className={cn("flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-extrabold uppercase tracking-[0.14em] text-[#18765f]")}>Ledger Entry</p>
          ) : (
            <button type="button" onClick={() => setLedgerOpen((open) => !open)} className="mt-6 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left">
              <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#18765f]">Ledger Entry</span>
              <ChevronDown className={cn("h-4 w-4 text-slate-500 transition-transform", ledgerOpen && "rotate-180")} />
            </button>
          )}

          {ledgerOpen && (
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Posting Date
                  <input type="date" value={postingDate} onChange={(event) => setPostingDate(event.target.value)} className={smallInput} />
                </label>
                <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Voucher Type
                  <div className={selectAffordance}><input list="mark-paid-voucher-types" value={voucherType} onChange={(event) => setVoucherType(event.target.value)} className={smallInput} /><ChevronDown /></div>
                  <datalist id="mark-paid-voucher-types">{(masters.voucherTypes.length ? masters.voucherTypes.map((item) => masterOptionLabel(item)) : ["Payment", "Bank Payment Voucher", "Cash Payment Voucher"]).map((label) => <option key={label} value={label} />)}</datalist>
                </label>
                <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Source Reference
                  <input disabled value={record.billInwardNo || record.reference || "—"} className={cn(smallInput, "bg-slate-50 text-slate-500")} />
                </label>
              </div>
              <label className="block space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Narration
                <textarea rows={2} value={narration} onChange={(event) => setNarration(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-[#278b76] focus:ring-2 focus:ring-[#278b76]/10" />
              </label>

              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Ledger Lines</p>
                <button type="button" onClick={addLine} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0d5c4d] hover:underline"><Plus className="h-3.5 w-3.5" />Add Ledger Line</button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{["#", "GL Account", "Sub Ledger", "Debit (₹)", "Credit (₹)", ""].map((label) => <th key={label} className="px-3 py-3 font-bold">{label}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((line, index) => {
                      const glCode = masterCode(line.glAccount);
                      const rowSubLedgers = glCode ? masters.subLedgers.filter((item) => masterCode(String(item.control ?? "")) === glCode) : masters.subLedgers;
                      const rowDatalistId = `mark-paid-sub-ledgers-${line.id}`;
                      return (
                        <tr key={line.id}>
                          <td className="px-3 py-2.5 font-semibold text-slate-500">{index + 1}</td>
                          <td className="px-3 py-2.5"><div className={selectAffordance}><input list="mark-paid-gl-accounts" value={line.glAccount} onChange={(event) => updateLine(line.id, { glAccount: event.target.value, subLedger: "" })} className={smallInput} placeholder="Select GL account" /><ChevronDown /></div></td>
                          <td className="px-3 py-2.5">
                            <div className={selectAffordance}><input list={rowDatalistId} value={line.subLedger} onChange={(event) => updateLine(line.id, { subLedger: event.target.value })} className={smallInput} placeholder="Select sub ledger" /><ChevronDown /></div>
                            <datalist id={rowDatalistId}>{rowSubLedgers.map((item) => <option key={String(item.item_id)} value={masterOptionLabel(item)} />)}</datalist>
                          </td>
                          <td className="px-3 py-2.5"><input type="number" min="0" step="0.01" onWheel={(e) => e.currentTarget.blur()} value={line.debit} onChange={(event) => updateLine(line.id, { debit: event.target.value, credit: event.target.value ? "" : line.credit })} className={smallInput} /></td>
                          <td className="px-3 py-2.5"><input type="number" min="0" step="0.01" onWheel={(e) => e.currentTarget.blur()} value={line.credit} onChange={(event) => updateLine(line.id, { credit: event.target.value, debit: event.target.value ? "" : line.debit })} className={smallInput} /></td>
                          <td className="px-3 py-2.5 text-center"><button type="button" onClick={() => removeLine(line.id)} disabled={lines.length <= 2} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <datalist id="mark-paid-gl-accounts">{masters.glAccounts.map((item) => <option key={String(item.item_id)} value={masterOptionLabel(item)} />)}</datalist>
              </div>

              <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Cost Centre
                  <div className={selectAffordance}><input list="mark-paid-cost-centres" value={costCentre} onChange={(event) => setCostCentre(event.target.value)} className={smallInput} placeholder="—" /><ChevronDown /></div>
                  <datalist id="mark-paid-cost-centres">{masters.costCentres.map((item) => <option key={String(item.item_id)} value={masterOptionLabel(item)} />)}</datalist>
                </label>
                <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Cost Attribution
                  <div className={selectAffordance}><input list="mark-paid-cost-attributions" value={costAttribution} onChange={(event) => setCostAttribution(event.target.value)} className={smallInput} placeholder="—" /><ChevronDown /></div>
                  <datalist id="mark-paid-cost-attributions">{masters.costAttributions.map((item) => <option key={String(item.item_id)} value={masterOptionLabel(item)} />)}</datalist>
                </label>
                <div className="flex items-end justify-between gap-3 border-t border-slate-200 pt-3 sm:col-span-2 sm:border-t-0 sm:pt-0 lg:col-span-2 lg:justify-end">
                  <span><span className="text-slate-500">Debit </span><span className="font-bold text-slate-800">{formatCurrency(totalDebit)}</span></span>
                  <span><span className="text-slate-500">Credit </span><span className="font-bold text-slate-800">{formatCurrency(totalCredit)}</span></span>
                  <span className={cn("inline-flex items-center gap-1.5 font-bold", isBalanced ? "text-emerald-700" : "text-amber-700")}>{isBalanced ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}{isBalanced ? "Balanced" : `Diff ${formatCurrency(Math.abs(difference))}`}</span>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4">
          <p className="text-xs font-medium text-slate-400">{ledgerOpen ? (isBalanced ? "Ledger entry ready to post." : `Debit and credit must balance before ${isAccounting ? "this can be closed out" : "this can be marked as paid"}.`) : "Expand Ledger Entry to record how this payment was booked."}</p>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={submitting} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={submit} disabled={submitting} className="h-11 rounded-xl bg-[#0d5c4d] px-6 text-sm font-bold text-white hover:bg-[#0a4b3f] disabled:opacity-60">{submitting ? (isAccounting ? "Posting…" : "Marking…") : isAccounting ? "Post & Close" : "Mark as Paid"}</button>
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
  const { user } = useAuth();
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
  const [paymentDetailsRecord, setPaymentDetailsRecord] = useState<FinanceRecord | null>(null);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState("");
  const [markPaidRecord, setMarkPaidRecord] = useState<FinanceRecord | null>(null);
  // Inward register's card view — clicking a card's body previews its own tax invoice,
  // clicking a PO/GRN reference chip previews that linked document instead.
  const [invoicePreviewRecord, setInvoicePreviewRecord] = useState<FinanceRecord | null>(null);
  const [referencePreview, setReferencePreview] = useState<{ record: FinanceRecord; kind: "order" | "completion" } | null>(null);
  // Outstanding's PRR reference chip — a read-only preview, never the editable PrrModal.
  const [prrPreview, setPrrPreview] = useState<{ prr: FinanceRecord; bill: FinanceRecord } | null>(null);
  // Same fallback recipe as LedgerEntryModal's resolvedVendorName — some invoices were saved
  // before the Bill Inward vendor-name-sync fix and have a permanently blank party.
  const [vendorNameById, setVendorNameById] = useState<Record<string, string>>({});
  // Outstanding's "PRR Status" / "PRR Type" columns read straight off the linked
  // admin_payment_flow row (keyed by payment_id) rather than the invoice itself, since that's
  // where admin_ops_approval_status/director_approval_status/prr_form_extra actually live.
  const [paymentFlowByPaymentId, setPaymentFlowByPaymentId] = useState<Record<string, { admin_ops_approval_status?: string; director_approval_status?: string; prr_type?: string }>>({});

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

  useEffect(() => {
    if (moduleKey !== "bills-payables") return;
    let cancelled = false;
    const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
    (async () => {
      try {
        const request = (method: "GET" | "POST") => fetch(`${baseUrl}/purchase_flow/get_vendors`, { method, headers: { Accept: "application/json" } });
        let response = await request("GET");
        if (response.status === 405) response = await request("POST");
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        const list: Array<Record<string, unknown>> = Array.isArray(payload?.vendors) ? payload.vendors : [];
        if (cancelled) return;
        setVendorNameById(Object.fromEntries(list.map((item) => [String(item.vendor_id ?? "").trim(), String(item.vendor_name ?? "").trim()]).filter(([id, name]) => id && name)));
      } catch {
        // best-effort — Party just falls back to whatever the invoice itself carries
      }
    })();
    return () => { cancelled = true; };
  }, [moduleKey]);

  useEffect(() => {
    if (moduleKey !== "bills-payables") return;
    let cancelled = false;
    const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");
    fetch(`${baseUrl}/admin_accounts/get_payment_flow`, { headers: { Accept: "application/json" } })
      .then((res) => res.json())
      .then((data: { success?: boolean; data?: Array<Record<string, unknown>> }) => {
        if (cancelled) return;
        const list = Array.isArray(data?.data) ? data.data : [];
        setPaymentFlowByPaymentId(Object.fromEntries(list.map((item) => [String(item.payment_id ?? ""), {
          admin_ops_approval_status: String(item.admin_ops_approval_status ?? ""),
          director_approval_status: String(item.director_approval_status ?? ""),
          prr_type: String((item.prr_form_extra as Record<string, unknown> | undefined)?.prr_type ?? ""),
        }]).filter(([id]) => id)));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [moduleKey]);

  const moduleRecords = records.filter((record) => record.module === moduleKey);
  const isVerificationRegister = moduleKey === "bills-payables" && activeTab.label === "Verification";
  const isBillsPaidRegister = moduleKey === "bills-payables" && activeTab.label === "Bills Paid";
  const isLedgerPostingRegister = moduleKey === "bills-payables" && activeTab.label === "Ledger Posting";
  // Every ledger-posted Bill Inward invoice that isn't fully paid yet — the PRR Number column
  // only has a value once the PRR Module's Create PRR popup has actually run for it, which is
  // what gates whether "Mark as Paid" appears on that row (opens MarkPaidModal below).
  const isOutstandingRegister = moduleKey === "bills-payables" && activeTab.label === "Outstanding";
  const isRequestRegister = moduleKey === "payments-receipts" && activeTab.label === "Requests";
  // PRRs stay tagged tab: "Requests" for life (never reassigned) — Ledger Posting/Receipts/
  // History in this module are all different views over that same bucket, exactly like Bills &
  // Payables' Verification/Bills Paid/Ledger Posting tabs all read the same tab: "Inward" bucket.
  const isPrrLedgerPostingRegister = moduleKey === "payments-receipts" && activeTab.label === "Ledger Posting";
  const isPrrReceiptsRegister = moduleKey === "payments-receipts" && activeTab.label === "Receipts";
  const isPrrHistoryRegister = moduleKey === "payments-receipts" && activeTab.label === "History";
  const isPrrDownstreamRegister = isPrrLedgerPostingRegister || isPrrReceiptsRegister || isPrrHistoryRegister;
  const prrBucket = (record: FinanceRecord) => record.tab === "Requests" && record.entryType === "Payment Request / PRR";
  // Each Bill Inward sits in exactly one of these four tabs at a time, driven purely by how
  // far it's progressed — never in more than one, so nothing sits cluttering a tab it's already
  // moved past: still needs director verification -> Verification; verified but not yet booked
  // -> Ledger Posting; booked but not yet paid (with or without a PRR raised) -> Outstanding;
  // marked paid -> Bills Paid.
  const tabRecords = isVerificationRegister
    ? moduleRecords.filter((record) => record.tab === "Inward" && record.entryType === "Bill Inward" && record.status !== "Verified" && record.status !== "Paid")
    : isLedgerPostingRegister
      ? moduleRecords.filter((record) => record.tab === "Inward" && record.entryType === "Bill Inward" && record.status === "Verified" && record.ledgerEntryStatus !== "completed")
      : isOutstandingRegister
        ? moduleRecords.filter((record) => record.tab === "Inward" && record.entryType === "Bill Inward" && record.ledgerEntryStatus === "completed" && record.status !== "Paid")
        : isBillsPaidRegister
          ? moduleRecords.filter((record) => record.tab === "Inward" && record.entryType === "Bill Inward" && record.status === "Paid")
          : isRequestRegister
      // "Pending Approval" is the status both PRR-creation paths actually set (see buildAutoPrr/
      // requestPayment) — Draft/Submitted/Under Review are kept only in case something upstream
      // still relies on them, but Pending Approval is what real records carry pre-decision.
      ? moduleRecords.filter((record) => prrBucket(record) && ["Draft", "Submitted", "Under Review", "Pending Approval"].includes(record.status))
      : isPrrLedgerPostingRegister
        ? moduleRecords.filter((record) => prrBucket(record) && effectivePrrStage(record) === "awaiting_ledger_posting")
        : isPrrReceiptsRegister
          ? moduleRecords.filter((record) => prrBucket(record) && effectivePrrStage(record) === "awaiting_payment_details")
          : isPrrHistoryRegister
            ? moduleRecords.filter((record) => prrBucket(record) && effectivePrrStage(record) === "ledger_posted")
            : moduleRecords.filter((record) => record.tab === activeTab.label);
  const isInwardRegister = moduleKey === "bills-payables" && activeTab.label === "Inward";
  const showsBillInwardRecords = isInwardRegister || isVerificationRegister || isBillsPaidRegister || isLedgerPostingRegister || isOutstandingRegister;
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

  // Outstanding's "PRR Status" column — Prepared (admin ops / Send for Approval) is always
  // "Approved" the moment a PRR exists (that's what admin_ops_signature stamps), Director is
  // whatever director_approval_status on the linked payment flow currently says.
  const prrStageInfo = (record: FinanceRecord) => {
    const flow = paymentFlowByPaymentId[record.paymentId ?? ""];
    if (!record.prrNumber) return null;
    const preparedStatus = flow?.admin_ops_approval_status && flow.admin_ops_approval_status !== "not_initiated" ? "Approved" : "Pending";
    const directorStatus = flow?.director_approval_status === "approved" ? "Approved" : flow?.director_approval_status === "rejected" ? "Rejected" : "Pending";
    return { preparedStatus, directorStatus, prrType: flow?.prr_type || "—" };
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

  // Everything a PRR needs — party, reference, amount, TDS/tax, payment terms and
  // supporting documents — already lives on the Bill Inward record; the only thing the
  // ledger posting step adds is the real Cost Centre/Cost Attribution that were actually
  // posted, replacing initialPrrDetails' blank guesses for those fields.
  // Budget lines are deliberately left blank — no budget selection in this flow.
  const buildAutoPrr = (bill: FinanceRecord, voucher: PostedVoucherData, currentRecords: FinanceRecord[]): FinanceRecord | null => {
    const existingRequest = currentRecords.find((record) => record.module === "payments-receipts" && record.tab === "Requests" && record.sourceBillId === bill.id);
    if (existingRequest) {
      // This used to fail silently — no toast either way — which made a real duplicate
      // indistinguishable from some other bug suppressing creation entirely. Bill IDs can be
      // reused (this table gets reset/cleared during testing), so surfacing exactly which
      // existing PRR blocked creation is what actually lets this be diagnosed instead of guessed at.
      toast.info(`${existingRequest.reference} already exists for ${bill.billInwardNo || bill.reference} — not creating a duplicate.`);
      return null;
    }
    const debitLine = voucher.lines.find((line) => (line.debit || 0) > 0);
    const details: PRRDetails = {
      ...initialPrrDetails(bill, bill),
      accountingCostCentre: debitLine?.cost_centre || "",
      costAttribution: debitLine?.cost_attribution || "",
      accountingNarration: voucher.narration || bill.notes || "",
    };
    return {
      id: crypto.randomUUID(),
      module: "payments-receipts",
      tab: "Requests",
      entryType: "Payment Request / PRR",
      reference: nextPaymentRequestNumber(currentRecords),
      party: bill.party,
      vendorId: details.vendorCode || bill.vendorId,
      date: new Date().toISOString().slice(0, 10),
      dueDate: bill.dueDate,
      amount: details.requestedPaymentAmount || details.netPayableAmount,
      status: "Pending Approval",
      notes: details.accountingNarration,
      sourceBillId: bill.id,
      sourceBillInwardNo: bill.billInwardNo || bill.reference,
      poWoReference: bill.poWoReference,
      referenceType: bill.referenceType,
      grnServiceReference: bill.grnServiceReference,
      department: details.requestingDepartment,
      costCentre: details.costCentre,
      costAttribution: details.costAttribution,
      project: bill.project,
      site: bill.site,
      prrDetails: details,
    };
  };

  // No backend endpoint updates the invoice's own ledger_entery_status yet, so this is
  // recorded locally (preserved across get_invoices refetches by mergeInvoiceRecords) —
  // the real ledger entry itself is already posted for real via add_accounts_ledger_entry.
  const markLedgerEntryPosted = (entry: FinanceRecord, voucher: PostedVoucherData) => {
    const updatedEntry = { ...entry, ledgerEntryStatus: "completed" };
    const next = records.map((record) => record.id === entry.id ? updatedEntry : record);
    const prr = buildAutoPrr(updatedEntry, voucher, next);
    saveRecords(prr ? [prr, ...next] : next);
    setLedgerEntryRecord(null);
    if (prr) toast.success(`Payment request ${prr.reference} auto-created for ${updatedEntry.billInwardNo || updatedEntry.reference}`);
  };

  // A PRR's own ledger posting (as opposed to markLedgerEntryPosted above, which is the Bill
  // Inward side and auto-creates a PRR) — terminal stage, and "Posted" already picks up this
  // register's existing green "completed" badge styling with no other changes needed.
  const markPrrLedgerPosted = (entry: FinanceRecord) => {
    saveRecords(records.map((record) => record.id === entry.id ? { ...record, prrStage: "ledger_posted", status: "Posted" } : record));
    setLedgerEntryRecord(null);
    toast.success(`${entry.reference} ledger entry posted`);
  };

  const savePrrPaymentDetails = (entry: FinanceRecord, details: NonNullable<FinanceRecord["paymentDetails"]>) => {
    saveRecords(records.map((record) => record.id === entry.id ? { ...record, paymentDetails: details, prrStage: "awaiting_ledger_posting" } : record));
    setPaymentDetailsRecord(null);
    toast.success(`Payment details saved for ${entry.reference}`);
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
      // Without this, approval (updateLocalPrrStatus) has no prrType to key off — see the
      // comment there — and the request can never progress to Ledger Posting/Receipts.
      prrDetails: initialPrrDetails(entry, entry),
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
          action={!isVerificationRegister && !isBillsPaidRegister && !isLedgerPostingRegister && !isOutstandingRegister && !isPrrDownstreamRegister ? <button onClick={() => isRequestRegister ? openNewPrr() : (setEditing(null), setModalOpen(true))} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0d5c4d] px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(13,92,77,0.18)] hover:bg-[#0a4b3f]"><Plus className="h-4 w-4" />{isRequestRegister ? "Create PRR" : "New Entry"}</button> : undefined}
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
            showsBillInwardRecords ? (
              <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
                {visibleRecords.map((record) => {
                  const prrStage = isOutstandingRegister ? prrStageInfo(record) : null;
                  return (
                    <BillRegisterCard
                      key={record.id}
                      record={record}
                      vendorName={record.party || vendorNameById[record.vendorId ?? ""] || "—"}
                      onPreviewInvoice={() => setInvoicePreviewRecord(record)}
                      onPreviewReference={(kind) => setReferencePreview({ record, kind })}
                      prrInfo={isOutstandingRegister ? { prrNumber: record.prrNumber || "", prrType: prrStage?.prrType || "—", preparedStatus: prrStage?.preparedStatus || "Pending", directorStatus: prrStage?.directorStatus || "Pending" } : null}
                      onPreviewPrr={isOutstandingRegister ? () => {
                        const linkedPrr = records.find((item) => item.module === "payments-receipts" && item.tab === "Requests" && item.sourceBillId === record.id);
                        if (linkedPrr) setPrrPreview({ prr: linkedPrr, bill: record });
                        else toast.error("The linked PRR record could not be found.");
                      } : undefined}
                      actions={
                        isVerificationRegister || isBillsPaidRegister ? (
                          <button onClick={() => { setBillPreviewMode(isBillsPaidRegister ? "pay" : "verify"); setVerificationPreview(record); }} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:border-[#b8d6ce] hover:bg-[#eaf4f1] hover:text-[#0d5c4d]" title="Preview bill">
                            <Eye className="h-4 w-4" />Preview
                          </button>
                        ) : isLedgerPostingRegister ? (
                          <button onClick={() => setLedgerEntryRecord(record)} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0d5c4d] text-sm font-bold text-white hover:bg-[#0a4b3f]" title="Post ledger entry">
                            <IndianRupee className="h-4 w-4" />Post Ledger Entry
                          </button>
                        ) : isOutstandingRegister ? (
                          record.prrNumber ? (
                            <button onClick={() => setMarkPaidRecord(record)} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0d5c4d] text-sm font-bold text-white hover:bg-[#0a4b3f]" title={prrStage?.prrType === "Accounting" ? "Post ledger entry" : "Mark as paid"}>
                              <IndianRupee className="h-4 w-4" />{prrStage?.prrType === "Accounting" ? "Ledger Entry" : "Mark as Paid"}
                            </button>
                          ) : (
                            <span className="flex h-10 flex-1 items-center justify-center rounded-xl bg-slate-50 text-xs font-bold text-slate-400">Awaiting PRR</span>
                          )
                        ) : (
                          <>
                            <button onClick={() => { setEditing(record); setModalOpen(true); }} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0d5c4d] px-3 text-sm font-bold text-white hover:bg-[#0a4b3f]"><Pencil className="h-4 w-4" />Edit</button>
                            <button onClick={() => window.confirm(`Delete ${record.reference}?`) && saveRecords(records.filter((item) => item.id !== record.id))} className="rounded-xl p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 className="h-4 w-4" /></button>
                          </>
                        )
                      }
                    />
                  );
                })}
              </div>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="bg-[#0d473f] text-[11px] uppercase tracking-[0.11em] text-white"><tr><th className="px-5 py-4 text-center">{showsBillInwardRecords ? "BI No." : "Reference"}</th><th className="px-5 py-4 text-center">Date</th><th className="px-5 py-4 text-center">Due Date</th><th className="px-5 py-4 text-center">Entry Type</th><th className="px-5 py-4 text-center">Party / Account</th><th className="px-5 py-4 text-center">Amount</th>{isOutstandingRegister && <><th className="px-5 py-4 text-center">PRR No.</th><th className="px-5 py-4 text-center">PRR Type</th><th className="px-5 py-4 text-center">PRR Approval</th></>}<th className="px-5 py-4 text-center">Status</th><th className="px-5 py-4 text-center">Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleRecords.map((record) => {
                    const prrStage = isOutstandingRegister ? prrStageInfo(record) : null;
                    return (
                    <tr key={record.id} className="leading-5 hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-5 py-4 font-semibold text-[#0d5c4d]">{showsBillInwardRecords ? record.billInwardNo || record.reference : record.reference}</td><td className="whitespace-nowrap px-5 py-4 text-center font-medium text-slate-600">{formatRegisterDate(record.date)}</td><td className="whitespace-nowrap px-5 py-4 text-center font-medium text-slate-600">{formatRegisterDate(record.dueDate)}</td><td className="px-5 py-4 font-semibold text-slate-800">{record.entryType}</td><td className="px-5 py-4 font-medium text-slate-500">{record.party || vendorNameById[record.vendorId ?? ""] || "—"}</td><td className="whitespace-nowrap px-5 py-4 text-right font-semibold text-slate-900">{formatCurrency(record.amount)}</td>
                      {isOutstandingRegister && <>
                        <td className="whitespace-nowrap px-5 py-4 text-center font-mono font-semibold text-[#0d5c4d]">{record.prrNumber || "—"}</td>
                        <td className="whitespace-nowrap px-5 py-4 text-center font-medium text-slate-600">{prrStage?.prrType || "—"}</td>
                        <td className="px-5 py-4 text-center">
                          {prrStage ? (
                            <div className="flex flex-col items-center gap-1 text-[11px] font-bold">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Prepared: {prrStage.preparedStatus}</span>
                              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5", prrStage.directorStatus === "Approved" ? "bg-emerald-50 text-emerald-700" : prrStage.directorStatus === "Rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700")}>Director: {prrStage.directorStatus}</span>
                            </div>
                          ) : <span className="text-xs font-semibold text-slate-400">—</span>}
                        </td>
                      </>}
                      <td className="px-5 py-4 text-center"><span className={cn("inline-flex whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold", record.status === "Pending Approval" ? "bg-amber-50 text-amber-700" : record.status === "Verified" || ["Posted", "Paid", "Reconciled", "Closed"].includes(record.status) ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>{record.status || "Draft"}</span></td>
                      <td className="px-5 py-4"><div className="flex justify-end gap-1">{isVerificationRegister || isBillsPaidRegister ? <button onClick={() => { setBillPreviewMode(isBillsPaidRegister ? "pay" : "verify"); setVerificationPreview(record); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-[#b8d6ce] hover:bg-[#eaf4f1] hover:text-[#0d5c4d]" title="Preview bill"><Eye className="h-4 w-4" />Preview</button> : isLedgerPostingRegister ? <button onClick={() => setLedgerEntryRecord(record)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0d5c4d] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0a4b3f]" title="Post ledger entry"><IndianRupee className="h-4 w-4" />Post Ledger Entry</button> : isOutstandingRegister ? (record.prrNumber ? <button onClick={() => setMarkPaidRecord(record)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0d5c4d] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0a4b3f]" title={prrStage?.prrType === "Accounting" ? "Post ledger entry" : "Mark as paid"}><IndianRupee className="h-4 w-4" />{prrStage?.prrType === "Accounting" ? "Ledger Entry" : "Mark as Paid"}</button> : <span className="text-xs font-semibold text-slate-400">Awaiting PRR</span>) : isRequestRegister ? <button onClick={() => setPrrModalRecord(record)} className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-[#0d5c4d] px-4 text-sm font-bold text-white hover:bg-[#0a4b3f]"><Plus className="h-4 w-4" />Create PRR</button> : isPrrLedgerPostingRegister ? <button onClick={() => setLedgerEntryRecord(record)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0d5c4d] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0a4b3f]" title="Post ledger entry"><IndianRupee className="h-4 w-4" />Post Ledger Entry</button> : isPrrReceiptsRegister ? <button onClick={() => setPaymentDetailsRecord(record)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0d5c4d] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0a4b3f]" title="Add payment details"><CreditCard className="h-4 w-4" />Add Payment Details</button> : isPrrHistoryRegister ? <button onClick={() => setPrrModalRecord(record)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-[#b8d6ce] hover:bg-[#eaf4f1] hover:text-[#0d5c4d]" title="View PRR"><Eye className="h-4 w-4" />View PRR</button> : <><button onClick={() => { setEditing(record); setModalOpen(true); }} className={cn("inline-flex items-center gap-1.5 rounded-lg text-slate-500 hover:bg-[#eaf4f1] hover:text-[#0d5c4d]", record.entryType === "Bill Inward" ? "px-3 py-2 text-sm font-semibold" : "p-2")} title="Edit"><Pencil className="h-4 w-4" />{record.entryType === "Bill Inward" && "Edit"}</button><button onClick={() => window.confirm(`Delete ${record.reference}?`) && saveRecords(records.filter((item) => item.id !== record.id))} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 className="h-4 w-4" /></button></>}</div></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )
          ) : (
            <div className="flex min-h-[300px] flex-col items-center justify-center px-6 py-12 text-center">
              <span className="rounded-2xl bg-[#edf5f2] p-4 text-[#6c9b90]"><FileBarChart className="h-8 w-8" /></span>
              <h3 className="mt-4 text-lg font-bold text-slate-800">No {activeTab.label.toLowerCase()} entries found</h3>
              <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{isVerificationRegister ? "Saved Bill Inward entries will appear here automatically for review and verification, until they're verified." : isLedgerPostingRegister ? "Director-approved (Verified) bills with a pending ledger entry will appear here for posting, until it's booked." : isBillsPaidRegister ? "Bills move here only once they've been marked as paid — everything else is still in Verification, Ledger Posting or Outstanding." : isOutstandingRegister ? "Ledger-posted bills stay here — with their PRR Number once one exists — until they're marked as paid." : "Create the first entry for this workflow, or change the search and status filters."}</p>
              {!isVerificationRegister && !isBillsPaidRegister && !isLedgerPostingRegister && !isOutstandingRegister && !isPrrDownstreamRegister && <button onClick={() => isRequestRegister ? openNewPrr() : (setEditing(null), setModalOpen(true))} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-[#b8d6ce] px-4 text-sm font-bold text-[#0d5c4d] hover:bg-[#edf5f2]"><Plus className="h-4 w-4" />{isRequestRegister ? "Create PRR" : `Create ${activeTab.features[0] ?? "Entry"}`}</button>}
            </div>
          )}
        </section>
      </div>
      {modalOpen && <EntryModal module={module} tab={activeTab} existing={editing} onClose={() => { setModalOpen(false); setEditing(null); }} onSave={saveEntry} onSaved={loadInvoices} />}
      {prrModalRecord && <PrrModal record={prrModalRecord} bills={records.filter((record) => record.module === "bills-payables" && record.tab === "Inward" && record.entryType === "Bill Inward" && ["Verified", "Paid"].includes(record.status))} onClose={() => setPrrModalRecord(null)} onSave={savePrr} />}
      {verificationPreview && <BillVerificationPreview record={verificationPreview} actionMode={billPreviewMode} paymentRequested={records.some((record) => record.module === "payments-receipts" && record.tab === "Requests" && record.sourceBillId === verificationPreview.id)} onClose={() => setVerificationPreview(null)} onVerify={() => billPreviewMode === "pay" ? markBillPaid(verificationPreview) : verifyBill(verificationPreview)} onRequestPayment={() => requestPayment(verificationPreview)} onPostLedgerEntry={() => { setVerificationPreview(null); setLedgerEntryRecord(verificationPreview); }} />}
      {ledgerEntryRecord && (
        <LedgerEntryModal
          record={ledgerEntryRecord}
          onClose={() => setLedgerEntryRecord(null)}
          onPosted={(voucher) => ledgerEntryRecord.entryType === "Payment Request / PRR" ? markPrrLedgerPosted(ledgerEntryRecord) : markLedgerEntryPosted(ledgerEntryRecord, voucher)}
        />
      )}
      {paymentDetailsRecord && (
        <PrrPaymentDetailsModal
          record={paymentDetailsRecord}
          onClose={() => setPaymentDetailsRecord(null)}
          onSave={(details) => savePrrPaymentDetails(paymentDetailsRecord, details)}
        />
      )}
      {markPaidRecord && (
        <MarkPaidModal
          record={markPaidRecord}
          isAccounting={prrStageInfo(markPaidRecord)?.prrType === "Accounting"}
          onClose={() => setMarkPaidRecord(null)}
          onPaid={() => { setMarkPaidRecord(null); loadInvoices(); }}
        />
      )}
      {invoicePreviewRecord && <InvoiceDocumentPreviewModal record={invoicePreviewRecord} onClose={() => setInvoicePreviewRecord(null)} />}
      {referencePreview && <ReferenceDocumentPreviewModal record={referencePreview.record} kind={referencePreview.kind} onClose={() => setReferencePreview(null)} />}
      {prrPreview && <PrrDocumentPreviewModal record={prrPreview.prr} linkedBill={prrPreview.bill} onClose={() => setPrrPreview(null)} />}
    </div>
  );
}

export const BillsPayables = () => <FinanceAccountsModule moduleKey="bills-payables" />;
export const PaymentsReceipts = () => <FinanceAccountsModule moduleKey="payments-receipts" />;
export const Banking = () => <FinanceAccountsModule moduleKey="banking" />;
export const LedgersReports = () => <FinanceAccountsModule moduleKey="ledgers-reports" />;
export const MastersControls = () => <FinanceAccountsModule moduleKey="masters-controls" />;
