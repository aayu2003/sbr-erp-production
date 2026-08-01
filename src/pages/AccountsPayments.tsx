import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  CalendarDays,
  CheckCircle,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileText,
  IndianRupee,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import getBaseUrl from "@/lib/config";
import { useAuth } from "@/context/AuthContext";
import { DocPreviewPane } from "@/components/accounts/PaymentImpactMesh";
import PRRDocumentPreview, { type PRRDocumentPreviewHandle } from "@/components/accounts/PRRDocumentPreview";
import PRRApprovalPanel from "@/components/accounts/PRRApprovalPanel";
import type { WccCertificateRecord } from "@/components/cultivation/WccCertificatePreview";

// ── Types ─────────────────────────────────────────────────────────────────────

// Financial specification captured when an invoice is "taken inward" — frontend-only for
// now (like the rest of this page beyond Invoice Register), keyed onto the invoice row
// client-side rather than persisted to any backend.
type InvoiceIntake = {
  vendor_id: string;
  vendor_details: { vendor_name?: string; [key: string]: unknown };
  invoice_no?: string;
  transfer_type: "debit" | "credit";
  base_amount: number;
  discount_percentage: number;
  GST_percentage: number;
  freight_charges: number;
  other_charges: number;
  tds_percentage: number;
  date: string;
  savedAt: string;
};

// What `POST /admin_accounts/add_payment_and_impact` writes back onto the invoice row, as
// returned by `get_payment_flow` — `payment` and `linvestment_impact` are populated together
// in one call today, but are checked independently below so the stepper stays correct if that
// ever changes.
type PaymentRequestDict = {
  payment?: { payment_amount?: number; liability_before_payment?: number; liability_after_payment?: number };
  linvestment_impact?: Record<string, unknown>;
  budget_impact?: Record<string, unknown>;
};

type InvoicePayment = {
  payment_id?: string;
  invoice_doc_url?: string;
  order_number?: string;
  vendor_name?: string;
  vendor_id?: string;
  created_at?: string;
  admin_ops_approval_status?: string;
  director_approval_status?: string;
  admin_ops_signature?: string;
  director_signature?: string;
  prr_number?: string;
  prr_receipt_id?: string;
  last_rejection?: { reason?: string; name_id?: string; timestamp?: string };
  payment_completed?: boolean;
  prr_url?: string;
  payment_request_dict?: PaymentRequestDict;
  payment_completion_metadata?: unknown;
  invoice_type?: string;
  ledger_entery_status?: string;
  ledger_entry?: string;
  linked_grn_number?: string;
  linked_wcc_certificate_id?: string;
  _intake?: InvoiceIntake;
};

type MilestoneStatus = "done" | "active" | "pending" | "rejected";

// ── Payment Request tab — real API-backed lookups ───────────────────────────────

type LedgerEntryRecord = {
  entry_id?: string;
  vendor_id?: string;
  vendor_details?: { vendor_name?: string };
  invoice_no?: string;
  amount?: number;
  balance?: number;
  date?: string;
};

type SupportingDocument = {
  document: string;
  doc_link: string;
};

type VendorAddress = {
  name_of_premises?: string;
  road?: string;
  district?: string;
  pin_code?: string;
  state?: string;
  plot_flat_unit_no_and_floor?: string;
  taluka_locality?: string;
};

type VendorDetailsRecord = {
  nature_of_vendor?: string;
  aadhar_card_number?: string;
  address?: VendorAddress;
  address_for_place_of_supply_of_goods_services?: VendorAddress & { gst_number?: string; contact_number?: string; e_mail_id?: string };
  income_tax_pan?: string;
  vendor_contact?: string;
  vendor_name?: string;
  gst_number?: string;
  vendor_address?: string;
  e_mail_id?: string;
};

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

const formatDateOnly = (raw?: string) => {
  const v = safeStr(raw);
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  if (!Number.isFinite(d.getTime())) return v;
  return new Intl.DateTimeFormat("en-IN", { year: "numeric", month: "short", day: "2-digit" }).format(d);
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Root Component ────────────────────────────────────────────────────────────

export default function AccountsPayments() {
  return (
    <div className="min-h-full bg-[#f7f7f8] p-4 text-slate-900">
      <div className="mx-auto max-w-[1480px] space-y-5">
        {/* Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-normal text-slate-900">Vendor Payment</h1>
            <p className="mt-1.5 text-base font-medium text-slate-500">
              Every invoice, one row, four stages — click any stage to open it, done or not.
            </p>
          </div>
        </header>

        <InvoiceFlowView />
      </div>
    </div>
  );
}

// ── Tab: Invoice Flow — one row per invoice, four stages, click ANY stage to open it ────────

const FLOW_STAGE_LABELS = [
  "Inwarding Invoice",
  "Supporting Documents & Impact Calculation",
  "PRR Generation & Approval",
  "Payment Confirmation",
] as const;

function combineStage(steps: MilestoneStatus[]): MilestoneStatus {
  if (steps.some((s) => s === "rejected")) return "rejected";
  if (steps.every((s) => s === "done")) return "done";
  if (steps.some((s) => s === "active")) return "active";
  return "pending";
}

// Groups the existing fine-grained 8-milestone state machine into the 4 stages the row shows.
// Stage 2 covers BOTH drafting the payment request (s1) AND actually sending it for approval
// (s2 — admin_ops_approval_status flipping to "approved") — it can't be considered done the
// moment the draft is saved, because "Make PRR & Send for Approval" lives inside that same
// stage's panel. Marking it done at s1 alone (a prior bug) hid that button as soon as a draft
// was saved and jumped straight to Stage 3, where there was nothing yet for the director to
// approve — which is why the Approve button appeared to be missing.
function getStageStatuses(item: InvoicePayment): MilestoneStatus[] {
  const m = getMilestoneStatuses(item);
  return [
    combineStage([m[0], m[1]]),       // Inwarding Invoice
    combineStage([m[2], m[3]]),       // Supporting Documents & Impact Calculation (draft + sent)
    combineStage([m[4], m[5]]),       // PRR Generation & Approval (director decision + PRR issued)
    combineStage([m[6], m[7]]),       // Payment Confirmation
  ];
}

// director_reject_payment resets both approval fields straight to "not_initiated" rather than
// leaving a "rejected" value sitting on the record — so "just rejected, not yet resent" only
// shows up as: a draft already exists, but both approval fields are back to not_initiated.
function isAwaitingResend(item: InvoicePayment): boolean {
  return !!item.last_rejection
    && safeStr(item.admin_ops_approval_status).toLowerCase() === "not_initiated"
    && safeStr(item.director_approval_status).toLowerCase() === "not_initiated"
    && isNonEmpty(item.payment_request_dict?.payment);
}

// Ground truth for "has this already been sent" — the exact same check PaymentRequestPanel's
// own handleSendForApproval uses to short-circuit a resend. Stage 1's combined status (draft +
// sent) can read "active" instead of "done" if the draft flag and the approval flag ever drift
// out of sync (e.g. an eventually-consistent read right after a rapid save-then-send) — in that
// case combineStage still shows the live panel, so the button sits there fully clickable while
// silently no-op'ing on click. Checking this directly guarantees the panel/button never renders
// once admin_ops has actually sent it, regardless of what the coarser stage status says.
function hasSentForApproval(item: InvoicePayment): boolean {
  return !!item.admin_ops_approval_status && safeStr(item.admin_ops_approval_status).toLowerCase() !== "not_initiated";
}

const FLOW_ACTIVE_LABELS = ["Take Inward", "Draft / Send", "Awaiting Approval", "Ready to Pay"];

function getFlowRowMeta(item: InvoicePayment): { label: string; tone: "good" | "warn" | "bad" } {
  const stages = getStageStatuses(item);
  if (stages.every((s) => s === "done")) return { label: "Completed", tone: "good" };
  if (isAwaitingResend(item)) return { label: "Returned by Director", tone: "bad" };
  const activeIdx = stages.findIndex((s) => s === "active");
  if (activeIdx !== -1) return { label: FLOW_ACTIVE_LABELS[activeIdx], tone: "warn" };
  return { label: "—", tone: "warn" };
}

const rowAmount = (item: InvoicePayment): number => Number(item.payment_request_dict?.payment?.payment_amount) || 0;

// Rectangular, labelled step tabs — every stage is clickable regardless of its status, so a
// finished stage can be reopened for a read-only look and an unreached one can at least be
// previewed (it just shows a "not reached yet" placeholder instead of live content).
const FlowStepTabs = ({
  item, selected, onSelect,
}: { item: InvoicePayment; selected: number | null; onSelect: (i: number) => void }) => {
  const stages = getStageStatuses(item);
  return (
    <div className="flex flex-1 flex-wrap items-stretch gap-1.5 min-w-0">
      {FLOW_STAGE_LABELS.map((label, i) => {
        const status = stages[i];
        const isSelected = selected === i;
        const tone =
          status === "done"     ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" :
          status === "active"   ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100" :
          status === "rejected" ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100" :
                                   "border-slate-200 bg-white text-slate-400 hover:bg-slate-50";
        return (
          <button
            key={label}
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(i); }}
            className={`min-w-[132px] flex-1 rounded-md border px-2.5 py-1.5 text-left transition-colors ${tone} ${isSelected ? "ring-2 ring-slate-900 ring-offset-1" : ""}`}
          >
            <span className="block text-[9px] font-extrabold uppercase tracking-wide opacity-70">
              Step {i + 1} {status === "done" ? "· Done" : status === "rejected" ? "· Returned" : ""}
            </span>
            <span className="block text-[11px] font-bold leading-tight">{label}</span>
          </button>
        );
      })}
    </div>
  );
};

const StageActionCard = ({ title, hint, children }: { title: string; hint: string; children: ReactNode }) => (
  <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
    <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
    <p className="mb-3 mt-1 text-xs font-semibold text-slate-500">{hint}</p>
    {children}
  </section>
);

// A stage that hasn't been reached yet (an earlier stage isn't done) — still openable, just
// nothing live to act on until the prerequisite stage is finished.
const StageNotReached = () => (
  <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-xs font-semibold text-slate-400">
    Not reached yet — complete the previous stage first.
  </div>
);

// Read-only recap for Stage 1 once the invoice has been taken inward — inputs live in the
// intake modal itself, so there's nothing to disable here, just a confirmation summary.
const StageOneRecap = ({ invoice }: { invoice: InvoicePayment }) => (
  <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
    <h3 className="text-sm font-extrabold text-emerald-800">Stage 1 · Inwarding Invoice — completed</h3>
    <p className="mt-1 text-xs font-semibold text-emerald-700">Invoice logged and taken inward. Read-only.</p>
    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-semibold text-emerald-800">
      <span>Order: {safeStr(invoice.order_number) || "—"}</span>
      <span>Logged: {formatDate(invoice.created_at)}</span>
      {invoice.invoice_doc_url && (
        <a href={invoice.invoice_doc_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-700 underline">
          <FileText className="h-3.5 w-3.5" /> View Invoice Doc
        </a>
      )}
    </div>
  </section>
);

// Read-only recap for Stage 2 once it's been drafted and sent — PaymentRequestPanel itself has
// live editable inputs, so once this stage is done we show a plain summary instead of the form.
const StageTwoRecap = ({ invoice }: { invoice: InvoicePayment }) => {
  const payment = invoice.payment_request_dict?.payment;
  const rawEntries = (invoice.payment_request_dict?.linvestment_impact as { entries?: Record<string, unknown> } | undefined)?.entries;
  const investmentRows = rawEntries && typeof rawEntries === "object"
    ? Object.values(rawEntries as Record<string, unknown>).map((v) => {
        const e = v as { land_owner?: string; acres?: number; investment_amount?: number };
        return { owner: safeStr(e.land_owner), acres: Number(e.acres) || 0, amount: Number(e.investment_amount) || 0 };
      })
    : [];

  const budgetImpact = invoice.payment_request_dict?.budget_impact as
    Record<string, Record<string, { line_item_name?: string; category?: string; impact_amount?: number }>> | undefined;
  const budgetRows: { category: string; lineItem: string; amount: number }[] = [];
  if (budgetImpact && typeof budgetImpact === "object") {
    Object.values(budgetImpact).forEach((lineItems) => {
      if (!lineItems || typeof lineItems !== "object") return;
      Object.values(lineItems).forEach((li) => {
        const amt = Number(li?.impact_amount) || 0;
        if (amt <= 0) return;
        budgetRows.push({ category: safeStr(li?.category), lineItem: safeStr(li?.line_item_name), amount: amt });
      });
    });
  }

  return (
    <section className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-5">
      <div>
        <h3 className="text-sm font-extrabold text-emerald-800">Stage 2 · Supporting Documents &amp; Impact Calculation — completed</h3>
        <p className="mt-1 text-xs font-semibold text-emerald-700">Payment request drafted and sent for approval. Read-only.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-emerald-200 bg-white p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-600">Amount Raised</p>
          <p className="mt-1 text-sm font-extrabold text-slate-900">{inr(Number(payment?.payment_amount) || 0)}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-white p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-600">Liability Before</p>
          <p className="mt-1 text-sm font-extrabold text-slate-900">{inr(Number(payment?.liability_before_payment) || 0)}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-white p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-600">Liability After</p>
          <p className="mt-1 text-sm font-extrabold text-slate-900">{inr(Number(payment?.liability_after_payment) || 0)}</p>
        </div>
      </div>

      {investmentRows.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-emerald-600">Investment Impact</p>
          <div className="overflow-hidden rounded-lg border border-emerald-200 bg-white">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-emerald-100 bg-emerald-50/60 text-[10px] font-extrabold uppercase text-emerald-700">
                  <th className="px-3 py-1.5">Land Owner</th>
                  <th className="px-3 py-1.5 text-right">Acres</th>
                  <th className="px-3 py-1.5 text-right">Investment</th>
                </tr>
              </thead>
              <tbody>
                {investmentRows.map((r, i) => (
                  <tr key={i} className="border-b border-emerald-50 last:border-b-0">
                    <td className="px-3 py-1.5 font-semibold text-slate-700">{r.owner || "—"}</td>
                    <td className="px-3 py-1.5 text-right text-slate-600">{r.acres.toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-slate-800">{inr(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {budgetRows.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-emerald-600">Budget Impact</p>
          <div className="overflow-hidden rounded-lg border border-emerald-200 bg-white">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-emerald-100 bg-emerald-50/60 text-[10px] font-extrabold uppercase text-emerald-700">
                  <th className="px-3 py-1.5">Category</th>
                  <th className="px-3 py-1.5">Line Item</th>
                  <th className="px-3 py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {budgetRows.map((r, i) => (
                  <tr key={i} className="border-b border-emerald-50 last:border-b-0">
                    <td className="px-3 py-1.5 font-semibold text-slate-700">{r.category || "—"}</td>
                    <td className="px-3 py-1.5 text-slate-600">{r.lineItem || "—"}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-slate-800">{inr(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {invoice.admin_ops_signature && (
        <span className="inline-block rounded border border-emerald-300 bg-white px-2 py-1 text-[10px] leading-tight text-emerald-800">
          {invoice.admin_ops_signature}
        </span>
      )}
    </section>
  );
};

// Same supporting-documents list ApprovalsView used to show — self-contained so it can sit
// alongside PRRApprovalPanel inside Stage 3's content.
const FlowSupportingDocs = ({ invoice }: { invoice: InvoicePayment }) => {
  const [docs, setDocs] = useState<SupportingDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<SupportingDocument | null>(null);

  useEffect(() => {
    const orderNumber = safeStr(invoice.order_number);
    if (!orderNumber) { setDocs([]); return; }
    const ac = new AbortController();
    setDocsLoading(true);
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/admin_accounts/get_supporting_documents/${encodeURIComponent(orderNumber)}`, {
          headers: { Accept: "application/json" }, signal: ac.signal,
        });
        const data: { success?: boolean; data?: SupportingDocument[] } | null = await res.json().catch(() => null);
        if (res.ok && data?.success) setDocs(Array.isArray(data.data) ? data.data : []);
      } catch {
        // best-effort
      } finally {
        setDocsLoading(false);
      }
    })();
    return () => ac.abort();
  }, [invoice.order_number]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-extrabold text-slate-900">Supporting Documents</h3>
      <div className="space-y-2">
        {docsLoading && docs.length === 0 && <p className="text-xs font-semibold text-slate-400">Loading documents…</p>}
        {docs.map((d, i) => (
          <DocRow key={`${d.document}-${i}`} name={d.document} url={d.doc_link} onPreview={() => setPreviewDoc(d)} />
        ))}
        {!docsLoading && docs.length === 0 && (
          <p className="text-xs font-semibold text-slate-400">No documents on file for this order.</p>
        )}
      </div>
      {previewDoc && (
        <PRRAndDocumentPreviewModal invoice={invoice} doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      )}
    </section>
  );
};

// Picks which content to show for whichever step tab is currently selected — done stages get a
// read-only recap, the live stage gets its real editable panel, and anything not reached yet
// gets a placeholder instead of a panel that would otherwise render against empty data.
const StageContent = ({
  stage, invoice, stages, refresh, onIntake, onViewPrr,
}: {
  stage: number;
  invoice: InvoicePayment;
  stages: MilestoneStatus[];
  refresh: () => void;
  onIntake: (item: InvoicePayment) => void;
  onViewPrr: (item: InvoicePayment) => void;
}) => {
  const status = stages[stage];

  if ((stage === 1 || stage === 2) && status === "pending") {
    return <StageNotReached />;
  }

  if (stage === 0) {
    return status === "done" ? (
      <StageOneRecap invoice={invoice} />
    ) : (
      <StageActionCard
        title="Stage 1 · Inwarding Invoice"
        hint="This invoice hasn't been taken inward yet — financials must be logged before a payment request can be drafted."
      >
        <button
          type="button"
          onClick={() => onIntake(invoice)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-xs font-extrabold text-white hover:bg-slate-800"
        >
          <Upload className="h-3.5 w-3.5" /> Take Invoice Inward
        </button>
      </StageActionCard>
    );
  }

  if (stage === 1) {
    return (
      <div className="space-y-4">
        {isAwaitingResend(invoice) && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
            <p className="font-extrabold">Returned by Director</p>
            <p className="mt-1">{safeStr(invoice.last_rejection?.reason) || "No reason given."}</p>
            <p className="mt-1 text-red-500">
              {safeStr(invoice.last_rejection?.name_id)} · {formatDate(invoice.last_rejection?.timestamp)}
            </p>
          </div>
        )}
        {status === "done" || hasSentForApproval(invoice)
          ? <StageTwoRecap invoice={invoice} />
          : <PaymentRequestPanel invoice={invoice} onGoToApprovals={refresh} />}
      </div>
    );
  }

  if (stage === 2) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onViewPrr(invoice)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 hover:bg-slate-50"
          >
            <FileText className="h-3.5 w-3.5" /> View PRR &amp; Documents
          </button>
        </div>
        <PRRApprovalPanel invoice={invoice} onDecided={refresh} />
        <FlowSupportingDocs invoice={invoice} />
      </div>
    );
  }

  // stage === 3 — PaymentCompletionPanel already self-handles all three states (completed
  // recap / "waiting on approvals" notice / live UTR form), so no extra branching needed here.
  return <PaymentCompletionPanel invoice={invoice} refresh={refresh} />;
};

// One-click PRR download, straight from the row — no need to open the row or the "View PRR &
// Documents" modal first. Renders PRRDocumentPreview off-screen (html2canvas needs a real, laid-
// out DOM node to snapshot, so it can't be display:none) purely so its ref's downloadPdf() has
// something to capture; nothing here is ever visible to the user except the button itself.
const PRRDownloadButton = ({ invoice }: { invoice: InvoicePayment }) => {
  const prrRef = useRef<PRRDocumentPreviewHandle>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await prrRef.current?.downloadPdf();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to download PRR PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        title="Download PRR PDF"
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Download className="h-3.5 w-3.5" /> {downloading ? "Preparing…" : "Download PRR"}
      </button>
      <div className="pointer-events-none fixed -left-[9999px] top-0" aria-hidden="true">
        <div style={{ width: 794 }}>
          <PRRDocumentPreview ref={prrRef} invoice={invoice} />
        </div>
      </div>
    </>
  );
};

const InvoiceFlowRow = ({
  item, openStage, onSelectStage, onClose, onIntake, onViewPrr,
}: {
  item: InvoicePayment;
  openStage: number | null;
  onSelectStage: (stage: number) => void;
  onClose: () => void;
  onIntake: (item: InvoicePayment) => void;
  onViewPrr: (item: InvoicePayment) => void;
}) => {
  const isOpen = openStage !== null;
  const { record: freshInvoice, refresh } = useFreshPaymentRecord(isOpen ? item : null);
  // _intake is frontend-only (never comes back from the API), so start from `item` (which may
  // carry it) and overlay whatever fresher server fields we have on top.
  const invoice: InvoicePayment = { ...item, ...(freshInvoice ?? {}) };
  const stages = getStageStatuses(invoice);
  const meta = getFlowRowMeta(invoice);
  const amount = rowAmount(invoice);

  const toneClass =
    meta.tone === "good" ? "bg-emerald-100 text-emerald-700" :
    meta.tone === "bad"  ? "bg-red-100 text-red-700" :
                            "bg-amber-100 text-amber-700";

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-4 px-5 py-4">
        <div className="w-48 shrink-0 min-w-0">
          <p className="truncate text-sm font-extrabold text-slate-900">{safeStr(invoice.vendor_name) || "—"}</p>
          <p className="truncate text-[11px] font-semibold text-slate-400">
            {safeStr(invoice.order_number) || "—"} · {formatDateOnly(invoice.created_at)}
          </p>
        </div>
        <FlowStepTabs item={invoice} selected={openStage} onSelect={onSelectStage} />
        <div className="w-24 shrink-0 text-right">
          <p className="text-sm font-extrabold tabular-nums text-slate-900">{amount ? inr(amount) : "—"}</p>
        </div>
        <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-extrabold ${toneClass}`}>
          {meta.label}
        </span>
        {invoice.prr_number && <PRRDownloadButton invoice={invoice} />}
        {isOpen && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="border-t border-slate-200 bg-slate-50/60 p-5">
          <StageContent
            stage={openStage}
            invoice={invoice}
            stages={stages}
            refresh={refresh}
            onIntake={onIntake}
            onViewPrr={onViewPrr}
          />
        </div>
      )}
    </div>
  );
};

type VendorOption = { vendor_id?: string; vendor_name?: string };
type ReleasedDocOption = { type: "grn" | "wcc"; id: string; label: string };

// "+ General Payment" — creates an admin_payment_flow record with no PO/WO behind it (order_number
// stays empty). Deliberately minimal: vendor + invoice doc is the actual minimum to get this into
// the same 4-stage pipeline every other invoice uses; the optional GRN/WCC link is the only
// "supporting document" a general payment can have, since there's no purchase-flow to scan for docs.
const GeneralPaymentModal = ({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) => {
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorId, setVendorId] = useState("");

  // Independent of any order/order-type — the switch alone decides which document list gets
  // fetched, not what kind of PO/WO the vendor happens to be tied to elsewhere in the app.
  const [docType, setDocType] = useState<"grn" | "wcc">("grn");
  const [linkOptions, setLinkOptions] = useState<ReleasedDocOption[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkId, setLinkId] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    setVendorsLoading(true);
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/purchase_flow/get_vendors`, { headers: { Accept: "application/json" }, signal: ac.signal });
        const data: { vendors?: VendorOption[] } | null = await res.json().catch(() => null);
        setVendors(Array.isArray(data?.vendors) ? data.vendors : []);
      } catch {
        // best-effort
      } finally {
        setVendorsLoading(false);
      }
    })();
    return () => ac.abort();
  }, []);

  // Fetches only whichever list the switch is currently on — re-runs whenever the vendor or the
  // switch changes, rather than always fetching both GRN and WCC lists together.
  useEffect(() => {
    setLinkId("");
    if (!vendorId) { setLinkOptions([]); return; }
    const ac = new AbortController();
    setLinkLoading(true);
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        if (docType === "grn") {
          const res = await fetch(`${baseUrl}/admin_grn_inspection/list`, { headers: { Accept: "application/json" }, signal: ac.signal });
          const data: { success?: boolean; grns?: Array<{ grn_number?: string; vendor_id?: string; order_number?: string; status?: string }> } | null =
            await res.json().catch(() => null);
          setLinkOptions(
            (data?.grns ?? [])
              .filter((g) => safeStr(g.status).toLowerCase() === "approved" && safeStr(g.vendor_id) === vendorId)
              .map((g) => ({ type: "grn" as const, id: safeStr(g.grn_number), label: `GRN ${safeStr(g.grn_number)}${g.order_number ? ` · ${g.order_number}` : ""}` }))
          );
        } else {
          const res = await fetch(`${baseUrl}/admin_wcc_certificate/list`, { headers: { Accept: "application/json" }, signal: ac.signal });
          const data: { success?: boolean; certificates?: Array<{ certificate_id?: string; vendor_id?: string; order_number?: string; status?: string }> } | null =
            await res.json().catch(() => null);
          setLinkOptions(
            (data?.certificates ?? [])
              .filter((c) => safeStr(c.status).toLowerCase() === "approved" && safeStr(c.vendor_id) === vendorId)
              .map((c) => ({ type: "wcc" as const, id: safeStr(c.certificate_id), label: `WCC ${safeStr(c.certificate_id)}${c.order_number ? ` · ${c.order_number}` : ""}` }))
          );
        }
      } catch {
        // best-effort
      } finally {
        setLinkLoading(false);
      }
    })();
    return () => ac.abort();
  }, [vendorId, docType]);

  const selectedVendor = vendors.find((v) => v.vendor_id === vendorId);

  const handleSubmit = async () => {
    if (!vendorId) { toast.error("Select a vendor."); return; }
    if (!file) { toast.error("Upload the invoice document."); return; }

    setSubmitting(true);
    try {
      const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");

      const form = new FormData();
      form.append("document", file);
      const uploadRes = await fetch(
        `${baseUrl}/purchase_flow/upload_purchase_flow_document?order_number=${encodeURIComponent(`GENERAL/${vendorId}`)}`,
        { method: "POST", body: form },
      );
      const uploadData: { success?: boolean; file_url?: string } | null = await uploadRes.json().catch(() => null);
      if (!uploadRes.ok || !uploadData?.success || !uploadData.file_url) throw new Error("Failed to upload invoice document");

      const res = await fetch(`${baseUrl}/admin_accounts/create_invoice_payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          doc_url: uploadData.file_url,
          vendor_name: selectedVendor?.vendor_name || "",
          vendor_id: vendorId,
          invoice_type: "General Invoice",
          linked_grn_number: docType === "grn" ? (linkId || null) : null,
          linked_wcc_certificate_id: docType === "wcc" ? (linkId || null) : null,
        }),
      });
      const data: { success?: boolean; message?: string } | null = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || "Failed to create general payment");

      toast.success("General payment created");
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create general payment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">General Payment</h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500">No PO/WO involved — just a vendor and an invoice.</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-slate-500">Vendor<span className="text-red-500"> *</span></label>
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-slate-300"
            >
              <option value="">{vendorsLoading ? "Loading vendors…" : "Select a vendor"}</option>
              {vendors.map((v) => (
                <option key={v.vendor_id} value={v.vendor_id}>{v.vendor_name || v.vendor_id}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-slate-500">Invoice Document<span className="text-red-500"> *</span></label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm font-semibold text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-xs file:font-extrabold file:text-white hover:file:bg-slate-800"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-slate-500">Document Type</label>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setDocType("grn")}
                className={`h-8 rounded-md px-4 text-xs font-extrabold transition-colors ${docType === "grn" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                GRN
              </button>
              <button
                type="button"
                onClick={() => setDocType("wcc")}
                className={`h-8 rounded-md px-4 text-xs font-extrabold transition-colors ${docType === "wcc" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                WCC
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-slate-500">
              Link a released {docType === "grn" ? "GRN" : "WCC"} (optional)
            </label>
            <select
              value={linkId}
              onChange={(e) => setLinkId(e.target.value)}
              disabled={!vendorId || linkLoading}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">{!vendorId ? "Select a vendor first" : linkLoading ? "Loading…" : "None"}</option>
              {linkOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            {vendorId && !linkLoading && linkOptions.length === 0 && (
              <p className="text-[11px] font-semibold text-slate-400">
                No released {docType === "grn" ? "GRN" : "WCC"} found for this vendor — that's fine, it's optional.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create Payment"}
          </button>
        </div>
      </div>
    </div>
  );
};

const InvoiceFlowView = () => {
  const [items, setItems] = useState<InvoicePayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openRow, setOpenRow] = useState<{ id: string; stage: number } | null>(null);
  const [intakeTarget, setIntakeTarget] = useState<InvoicePayment | null>(null);
  const [prrDocTarget, setPrrDocTarget] = useState<InvoicePayment | null>(null);
  const [showGeneralPayment, setShowGeneralPayment] = useState(false);

  const handleIntakeSaved = (paymentId: string | undefined, intake: InvoiceIntake) => {
    if (!paymentId) return;
    setItems((prev) => prev.map((it) => (it.payment_id === paymentId ? { ...it, _intake: intake } : it)));
  };

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
      if (!baseUrl) throw new Error("API base URL is not set");
      const res = await fetch(`${baseUrl}/admin_accounts/get_payment_flow`, {
        headers: { Accept: "application/json" },
        signal,
      });
      const data: { success?: boolean; data?: InvoicePayment[]; message?: string } | null = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || `Failed to load invoices (HTTP ${res.status})`);
      setItems(Array.isArray(data?.data) ? data.data : []);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load invoice payments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, [load]);

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
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Invoice Flow</h2>
            <p className="mt-0.5 text-sm font-medium text-slate-500">
              Every invoice, one row, four stages — click any stage to open it, done or not.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vendor, order..."
                className="h-9 w-64 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-slate-300"
              />
            </div>
            <button
              type="button"
              onClick={() => load()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowGeneralPayment(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-extrabold text-white hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" /> General Payment
            </button>
          </div>
        </div>

        <div className="space-y-2 p-4">
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-400">Loading invoices…</div>
          ) : error ? (
            <div className="py-16 text-center text-sm text-red-500">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">
              {items.length === 0 ? "No invoices received yet." : "No results match your search."}
            </div>
          ) : (
            filtered.map((item, idx) => {
              const id = safeStr(item.payment_id) || String(idx);
              return (
                <InvoiceFlowRow
                  key={id}
                  item={item}
                  openStage={openRow?.id === id ? openRow.stage : null}
                  onSelectStage={(stage) => setOpenRow({ id, stage })}
                  onClose={() => setOpenRow((prev) => (prev?.id === id ? null : prev))}
                  onIntake={setIntakeTarget}
                  onViewPrr={setPrrDocTarget}
                />
              );
            })
          )}
        </div>
      </section>

      {intakeTarget && (
        <InvoiceIntakeWithPreview
          item={intakeTarget}
          onClose={() => setIntakeTarget(null)}
          onSaved={handleIntakeSaved}
        />
      )}

      {prrDocTarget && (
        <PRRAllDocsModal invoice={prrDocTarget} onClose={() => setPrrDocTarget(null)} />
      )}

      {showGeneralPayment && (
        <GeneralPaymentModal onClose={() => setShowGeneralPayment(false)} onCreated={() => load()} />
      )}
    </div>
  );
};

// ── Invoice Intake popup — "take the invoice inward" before the payment workflow starts ──

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const IntakeField = ({
  label, value, onChange, required = false, type = "number",
}: { label: string; value: string; onChange: (v: string) => void; required?: boolean; type?: "number" | "text" | "date" }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-extrabold text-slate-500">
      {label}{required ? <span className="text-red-500"> *</span> : null}
    </label>
    <input
      type={type}
      inputMode={type === "number" ? "decimal" : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-300"
    />
  </div>
);

// Invoice document preview — opens to the left of the intake card, same idea as the
// order-document side panel on the WCC certificate popup (WccCertificatePreview.tsx),
// but always shown (no toggle) since the doc URL is already known on the invoice row.
const DOC_BASE_WIDTH = 816; // ~8.5in @ 96dpi — typical print-page width

const InvoicePreviewPane = ({ url, title }: { url?: string; title: string }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !url) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setScale(width / DOC_BASE_WIDTH);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [url]);

  const isImage = url ? /\.(jpe?g|png|gif|webp|bmp)(\?|#|$)/i.test(url) : false;

  return (
    <div
      className="shrink-0 overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col"
      style={{ width: 'min(576px, 44vw)', height: '85vh' }}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 shrink-0">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-slate-900">Invoice Preview</h3>
          <p className="truncate text-[11px] font-medium text-slate-400">{title}</p>
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden bg-slate-100">
        {!url ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
            <FileText className="h-8 w-8" />
            <span className="text-sm font-medium">No invoice document available</span>
          </div>
        ) : isImage ? (
          <div className="h-full w-full overflow-auto">
            <img src={url} alt="Invoice" className="block w-full h-auto" />
          </div>
        ) : (
          <div ref={wrapRef} className="h-full w-full overflow-auto">
            <iframe
              src={`${url}#view=FitH`}
              title="Invoice preview"
              style={{
                width: DOC_BASE_WIDTH,
                height: DOC_BASE_WIDTH * 1.414,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                border: 0,
              }}
            />
          </div>
        )}
      </div>
      {url && (
        <div className="flex justify-end border-t border-slate-200 px-5 py-3 shrink-0">
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
            Open in new tab <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
};

const InvoiceIntakeCard = ({
  item, onClose, onSaved,
}: { item: InvoicePayment; onClose: () => void; onSaved: (paymentId: string | undefined, intake: InvoiceIntake) => void }) => {
  const existing = item._intake;
  const [invoiceNo, setInvoiceNo] = useState(existing?.invoice_no ?? "");
  const [transferType, setTransferType] = useState<"debit" | "credit">(existing?.transfer_type ?? "debit");
  const [date, setDate] = useState(existing?.date ?? new Date().toISOString().slice(0, 10));
  const [baseAmount, setBaseAmount] = useState(existing ? String(existing.base_amount) : "");
  const [discPercent, setDiscPercent] = useState(existing ? String(existing.discount_percentage) : "0");
  const [freight, setFreight] = useState(existing ? String(existing.freight_charges) : "0");
  const [gstPercent, setGstPercent] = useState(existing ? String(existing.GST_percentage) : "18");
  const [otherCharges, setOtherCharges] = useState(existing ? String(existing.other_charges) : "0");
  const [tdsPercent, setTdsPercent] = useState(existing ? String(existing.tds_percentage) : "0");

  const base = num(baseAmount);
  const disc = num(discPercent);
  const netBasic = base * (1 - disc / 100);
  const fr = num(freight);
  const gstPct = num(gstPercent);
  const gstAmount = (netBasic + fr) * (gstPct / 100);
  const other = num(otherCharges);
  const tdsPct = num(tdsPercent);
  const tdsAmount = netBasic * (tdsPct / 100);
  const netPayable = netBasic + fr + gstAmount + other - tdsAmount;

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!base || base <= 0 || !date) return;
    const intake: InvoiceIntake = {
      vendor_id: safeStr(item.vendor_id),
      vendor_details: { vendor_name: item.vendor_name },
      invoice_no: invoiceNo || undefined,
      transfer_type: transferType,
      base_amount: base,
      discount_percentage: disc,
      GST_percentage: gstPct,
      freight_charges: fr,
      other_charges: other,
      tds_percentage: tdsPct,
      date,
      savedAt: new Date().toISOString(),
    };
    setSaving(true);
    setSaveError(null);
    try {
      const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
      if (!baseUrl) throw new Error("API base URL is not set");
      const res = await fetch(`${baseUrl}/admin_accounts/add_accounts_ledger_entry`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          vendor_id: intake.vendor_id,
          vendor_details: intake.vendor_details,
          invoice_no: intake.invoice_no ?? "",
          transfer_type: intake.transfer_type,
          base_amount: intake.base_amount,
          discount_percentage: intake.discount_percentage,
          GST_percentage: intake.GST_percentage,
          freight_charges: intake.freight_charges,
          other_charges: intake.other_charges,
          tds_percentage: intake.tds_percentage,
          date: intake.date,
        }),
      });
      const data: { success?: boolean; message?: string; data?: { entry_id?: string } } | null =
        await res.json().catch(() => null);
      if (!res.ok || !data?.success)
        throw new Error(data?.message || `Failed to save invoice (HTTP ${res.status})`);

      const entryId = data.data?.entry_id;
      if (entryId && item.payment_id) {
        const statusRes = await fetch(`${baseUrl}/admin_accounts/update_accounts_flow_ledger_entry_status`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ payment_id: item.payment_id, entry_id: entryId }),
        });
        const statusData: { success?: boolean; message?: string } | null = await statusRes.json().catch(() => null);
        if (!statusRes.ok || !statusData?.success)
          throw new Error(statusData?.message || `Failed to link ledger entry (HTTP ${statusRes.status})`);
      }

      onSaved(item.payment_id, intake);
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="shrink-0 overflow-hidden rounded-xl bg-white shadow-2xl" style={{ width: 'min(512px, 40vw)' }}>
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Take Invoice Inward</h2>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            Record the invoice's financial specification before starting the payment workflow.
          </p>
        </div>
        <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-4 p-6">
        {/* Vendor info — auto-filled, read-only */}
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Vendor</p>
            <p className="text-sm font-extrabold text-slate-800">{safeStr(item.vendor_name) || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Order Number</p>
            <p className="text-sm font-extrabold text-slate-800">{safeStr(item.order_number) || "—"}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <IntakeField label="Invoice No." value={invoiceNo} onChange={setInvoiceNo} type="text" />
          <IntakeField label="Date" value={date} onChange={setDate} type="date" required />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-extrabold text-slate-500">Transfer Type</label>
          <div className="grid grid-cols-2 gap-2">
            {(["debit", "credit"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTransferType(t)}
                className={`h-10 rounded-md border text-sm font-extrabold capitalize transition-colors ${
                  transferType === t
                    ? "border-[#173f70] bg-[#173f70] text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <IntakeField label="Invoice Base Amount" value={baseAmount} onChange={setBaseAmount} required />
          <IntakeField label="Discount %" value={discPercent} onChange={setDiscPercent} />
          <IntakeField label="Freight Charges" value={freight} onChange={setFreight} />
          <IntakeField label="GST %" value={gstPercent} onChange={setGstPercent} />
          <IntakeField label="Other Charges" value={otherCharges} onChange={setOtherCharges} />
          <IntakeField label="TDS %" value={tdsPercent} onChange={setTdsPercent} />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
          <span className="text-sm font-extrabold text-emerald-700">Net Payable</span>
          <span className="text-lg font-extrabold text-emerald-700">
            ₹{netPayable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {saveError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-600">
            {saveError}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
        <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-lg border border-slate-200 px-5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!base || base <= 0 || !date || saving}
          className="h-10 rounded-lg bg-[#173f70] px-5 text-sm font-extrabold text-white shadow-sm hover:bg-[#12345e] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save & Continue"}
        </button>
      </div>
    </div>
  );
};

// Combined wrapper — invoice preview on the left, intake form on the right, in a single
// overlay (mirrors WccCertificatePreview.tsx's main-popup + order-preview side-by-side).
const InvoiceIntakeWithPreview = ({
  item, onClose, onSaved,
}: { item: InvoicePayment; onClose: () => void; onSaved: (paymentId: string | undefined, intake: InvoiceIntake) => void }) => (
  <div className="fixed inset-0 z-[95] flex items-center justify-center overflow-auto bg-slate-950/45 p-4">
    <div className="flex items-center gap-4 min-w-min mx-auto my-auto">
      <InvoicePreviewPane url={item.invoice_doc_url} title={safeStr(item.invoice_type) || "Invoice"} />
      <InvoiceIntakeCard item={item} onClose={onClose} onSaved={onSaved} />
    </div>
  </div>
);

// Both panes side by side — left is the PRR (built from this payment's own saved data, same
// as the standalone preview above), right is whichever supporting document was clicked.
const PRRAndDocumentPreviewModal = ({
  invoice, doc, onClose,
}: { invoice: InvoicePayment; doc: SupportingDocument; onClose: () => void }) => (
  <div className="fixed inset-0 z-[95] flex items-center justify-center overflow-auto bg-slate-950/45 p-4">
    <div className="flex min-w-min items-stretch gap-4 mx-auto my-auto">
      <div
        className="shrink-0 overflow-y-auto rounded-2xl bg-white shadow-2xl"
        style={{ width: "min(560px, 44vw)", maxHeight: "90vh" }}
      >
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-3">
          <h3 className="text-sm font-extrabold text-slate-900">PRR Preview</h3>
        </div>
        <div className="p-4">
          <PRRDocumentPreview invoice={invoice} />
        </div>
      </div>

      <div
        className="flex shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ width: "min(560px, 44vw)", height: "90vh" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-slate-900">Supporting Document</h3>
            <p className="truncate text-[11px] font-medium text-slate-400">{doc.document}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 p-4">
          <DocPreviewPane doc={doc} />
        </div>
        <div className="flex shrink-0 justify-end border-t border-slate-200 px-5 py-3">
          <a
            href={doc.doc_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
          >
            Open in new tab <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  </div>
);

// Triggered directly from the Invoice Register's "PRR Document" column — a self-contained
// popup (fetches its own supporting documents by order_number) rather than reusing
// PRRAndDocumentPreviewModal, since that one takes a single already-picked doc; this one needs
// its own selector to browse *all* of them, plus working Print/Download for the PRR itself.
const PRRAllDocsModal = ({ invoice, onClose }: { invoice: InvoicePayment; onClose: () => void }) => {
  const prrRef = useRef<PRRDocumentPreviewHandle>(null);
  const [docs, setDocs] = useState<SupportingDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<SupportingDocument | null>(null);

  useEffect(() => {
    const orderNumber = safeStr(invoice.order_number);
    if (!orderNumber) { setDocs([]); return; }
    const ac = new AbortController();
    setDocsLoading(true);
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/admin_accounts/get_supporting_documents/${encodeURIComponent(orderNumber)}`, {
          headers: { Accept: "application/json" }, signal: ac.signal,
        });
        const data: { success?: boolean; data?: SupportingDocument[] } | null = await res.json().catch(() => null);
        if (res.ok && data?.success) setDocs(Array.isArray(data.data) ? data.data : []);
      } catch {
        // best-effort
      } finally {
        setDocsLoading(false);
      }
    })();
    return () => ac.abort();
  }, [invoice.order_number]);

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center overflow-auto bg-slate-950/45 p-4">
      <div className="flex min-w-min items-stretch gap-4 mx-auto my-auto">
        <div
          className="flex shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          style={{ width: "min(600px, 46vw)", height: "90vh" }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
            <h3 className="text-sm font-extrabold text-slate-900">PRR Document</h3>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => prrRef.current?.print()}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                <Printer className="h-3.5 w-3.5" />
                Print
              </button>
              <button
                type="button"
                onClick={() => prrRef.current?.downloadPdf()}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
              <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-4">
            <PRRDocumentPreview ref={prrRef} invoice={invoice} />
          </div>
        </div>

        <div
          className="flex shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          style={{ width: "min(480px, 38vw)", height: "90vh" }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
            <h3 className="text-sm font-extrabold text-slate-900">Supporting Documents</h3>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            {docsLoading && docs.length === 0 && <p className="text-xs font-semibold text-slate-400">Loading documents…</p>}
            {!docsLoading && docs.length === 0 && (
              <p className="text-xs font-semibold text-slate-400">No documents on file for this order.</p>
            )}
            {docs.length > 0 && (
              <select
                value={selectedDoc?.doc_link ?? ""}
                onChange={(e) => setSelectedDoc(docs.find((d) => d.doc_link === e.target.value) ?? null)}
                className="h-9 w-full shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none focus:border-slate-300"
              >
                <option value="" disabled>Select document type…</option>
                {docs.map((d, i) => (
                  <option key={`${d.document}-${i}`} value={d.doc_link}>{d.document}</option>
                ))}
              </select>
            )}
            {selectedDoc && (
              <>
                <div className="min-h-0 flex-1">
                  <DocPreviewPane doc={selectedDoc} />
                </div>
                <a
                  href={selectedDoc.doc_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 self-end text-xs font-semibold text-blue-600 hover:underline"
                >
                  Open in new tab <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Payment Requests / Approvals now cross real time gaps (send now, a director approves later,
// possibly a different browser session) — the `item` prop a row was opened with is a snapshot
// from whenever the list last loaded, so approve/reject decisions here must read live data
// instead. Mirrors the fetch-and-match-by-payment_id pattern used earlier in this file.
function useFreshPaymentRecord(invoice: InvoicePayment | null): { record: InvoicePayment | null; refresh: () => void } {
  const [record, setRecord] = useState<InvoicePayment | null>(invoice);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => { setRecord(invoice); }, [invoice]);

  useEffect(() => {
    const paymentId = safeStr(invoice?.payment_id);
    if (!paymentId) return;
    const ac = new AbortController();
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/admin_accounts/get_payment_flow`, {
          headers: { Accept: "application/json" }, signal: ac.signal,
        });
        const data: { success?: boolean; data?: InvoicePayment[] } | null = await res.json().catch(() => null);
        if (!res.ok || !data?.success) return;
        const match = (data.data ?? []).find((it) => safeStr(it.payment_id) === paymentId);
        if (match) setRecord(match);
      } catch {
        // best-effort — keeps whatever the invoice prop already had
      }
    })();
    return () => ac.abort();
  }, [invoice?.payment_id, reloadKey]);

  return { record, refresh: () => setReloadKey((k) => k + 1) };
}

// Two popups reusing the exact same Investment Impact Calculator / Budget Impact editors from
// the Payment Request tab, pre-filled with whatever was saved before — shown only when the
// amount actually paid doesn't match what the PRR was raised for, so the split can be
// reconciled against the real amount before the payment is marked completed. No re-approval
// needed (admin_ops/director statuses are untouched here) — save then retry complete_payment.
const PaymentReconcileModal = ({
  invoice, utr, targetAmount, isWorkOrder, budgetAllocation, flowFound, onClose, onReconciled,
}: {
  invoice: InvoicePayment;
  utr: string;
  targetAmount: number;
  isWorkOrder: boolean;
  budgetAllocation: Record<string, unknown[]>;
  flowFound: boolean | null;
  onClose: () => void;
  onReconciled: () => void;
}) => {
  const { user } = useAuth();
  const investmentRef = useRef<InvestmentImpactCalculatorHandle>(null);
  const budgetRef = useRef<BudgetImpactSectionHandle>(null);
  const [saving, setSaving] = useState(false);

  const handleSaveAndComplete = async () => {
    if (!invoice.payment_id) { toast.error("Missing payment id."); return; }
    if (!user?.id || !user?.name) { toast.error("You must be logged in."); return; }

    setSaving(true);
    try {
      const investmentPayload = isWorkOrder ? investmentRef.current?.getPayload() ?? null : null;
      const budget_impact = (await budgetRef.current?.resolvePayload()) ?? {};
      const liabilityBefore = Number(invoice.payment_request_dict?.payment?.liability_before_payment) || 0;

      const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
      const saveRes = await fetch(`${baseUrl}/admin_accounts/add_payment_and_impact`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          payment_id: invoice.payment_id,
          linvestment_impact: investmentPayload?.linvestment_impact ?? {},
          payment_dict: {
            liability_before_payment: liabilityBefore,
            liability_after_payment: liabilityBefore - targetAmount,
            payment_amount: targetAmount,
            remarks: invoice.payment_request_dict?.payment?.remarks ?? "",
          },
          budget_impact,
        }),
      });
      const saveData: { success?: boolean; message?: string } | null = await saveRes.json().catch(() => null);
      if (!saveRes.ok || !saveData?.success) throw new Error(saveData?.message || "Failed to save the reconciled impact");

      const completeRes = await fetch(`${baseUrl}/admin_accounts/complete_payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          payment_id: invoice.payment_id,
          utr,
          amount_paid: targetAmount,
          staff_id: user.id,
          name: user.name,
          designation: user.designation || "",
        }),
      });
      const completeData: {
        success?: boolean; mismatch?: boolean; over_budget?: boolean; detail?: string;
        over_budget_lines?: { category?: string; line_item?: string; amount_needed?: number; amount_available?: number }[];
      } | null = await completeRes.json().catch(() => null);
      if (completeData?.over_budget) {
        const lines = completeData.over_budget_lines ?? [];
        const detail = lines.length
          ? lines.map((l) => `${l.line_item || "—"}: needs ₹${(l.amount_needed ?? 0).toLocaleString("en-IN")}, only ₹${(l.amount_available ?? 0).toLocaleString("en-IN")} available`).join("; ")
          : completeData.detail || "This reconciled amount still exceeds the remaining budget.";
        throw new Error(detail);
      }
      if (!completeRes.ok || !completeData?.success) throw new Error(completeData?.detail || "Failed to complete payment after reconciling");

      toast.success("Investment/Budget impact reconciled — payment marked as completed");
      onReconciled();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save and complete");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center overflow-auto bg-slate-950/45 p-4">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-5 py-3 shadow-lg">
          <div>
            <p className="text-sm font-extrabold text-slate-900">Reconcile to {inr(targetAmount)}</p>
            <p className="text-xs font-medium text-slate-400">Amount paid didn't match the raised PRR — update the allocation below, then save.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Popup 1: Investment Impact Calculator, Popup 2: Budget Impact — the same components
            used in the Payment Request tab, pre-filled with the previously saved data. */}
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <div className="max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
            {isWorkOrder ? (
              <InvestmentImpactCalculator
                ref={investmentRef}
                orderNumber={safeStr(invoice.order_number)}
                totalAmount={targetAmount}
                initialData={invoice.payment_request_dict?.linvestment_impact}
              />
            ) : (
              <p className="py-8 text-center text-xs font-semibold text-slate-400">Not applicable for this order type.</p>
            )}
          </div>
          <div className="max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
            <BudgetImpactSection
              ref={budgetRef}
              invoice={invoice}
              paymentAmount={targetAmount}
              budgetAllocation={budgetAllocation}
              flowFound={flowFound}
              initialBudgetImpact={invoice.payment_request_dict?.budget_impact}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 rounded-xl bg-white px-5 py-3 shadow-lg">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveAndComplete}
            disabled={saving}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save & Complete Payment"}
          </button>
        </div>
      </div>
    </div>
  );
};

// Stage 4 of the Invoice Flow row — UTR/amount entry, extracted out of the old standalone
// Approvals tab so it can slot in as just the "Payment Completion" stage's live content.
const PaymentCompletionPanel = ({ invoice, refresh }: { invoice: InvoicePayment; refresh: () => void }) => {
  const { user } = useAuth();
  const { orderType, budgetAllocation, flowFound } = usePurchaseFlowInfo(safeStr(invoice.order_number));
  const isWorkOrder = orderType === "SPR";

  const [utr, setUtr] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [completing, setCompleting] = useState(false);
  const [reconcileAmount, setReconcileAmount] = useState<number | null>(null);

  const bothApproved = safeStr(invoice.admin_ops_approval_status).toLowerCase() === "approved"
    && safeStr(invoice.director_approval_status).toLowerCase() === "approved";

  const handleAddToLedger = async () => {
    const amountNum = num(amountPaid);
    if (!amountNum || amountNum <= 0) { toast.error("Enter a valid amount paid."); return; }
    if (!utr.trim()) { toast.error("Enter the UTR / reference number."); return; }
    if (!invoice.payment_id) { toast.error("Missing payment id."); return; }
    if (!user?.id || !user?.name) { toast.error("You must be logged in to complete this payment."); return; }

    setCompleting(true);
    try {
      const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/admin_accounts/complete_payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          payment_id: invoice.payment_id,
          utr: utr.trim(),
          amount_paid: amountNum,
          staff_id: user.id,
          name: user.name,
          designation: user.designation || "",
        }),
      });
      const resData: {
        success?: boolean; mismatch?: boolean; over_budget?: boolean; detail?: string;
        over_budget_lines?: { category?: string; line_item?: string; amount_needed?: number; amount_available?: number }[];
      } | null = await res.json().catch(() => null);
      if (!res.ok) throw new Error(resData?.detail || `Failed (HTTP ${res.status})`);
      if (resData?.mismatch) {
        toast.warning(resData.detail || "Amount doesn't match the raised PRR — reconcile Investment/Budget Impact below.");
        setReconcileAmount(amountNum);
        return;
      }
      if (resData?.over_budget) {
        const lines = resData.over_budget_lines ?? [];
        const detail = lines.length
          ? lines.map((l) => `${l.line_item || "—"}: needs ₹${(l.amount_needed ?? 0).toLocaleString("en-IN")}, only ₹${(l.amount_available ?? 0).toLocaleString("en-IN")} available`).join("; ")
          : resData.detail || "This payment exceeds the remaining budget.";
        toast.error(detail, { duration: 8000 });
        return;
      }
      if (!resData?.success) throw new Error(resData?.detail || "Failed to complete payment");
      toast.success("Payment marked as completed");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to complete payment");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-extrabold text-slate-900">Stage 4 · Payment Completion</h3>

      {invoice.payment_completed ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
          <p className="font-extrabold">Payment completed</p>
          {invoice.payment_completion_metadata != null && typeof invoice.payment_completion_metadata === "object" && (
            <>
              <p className="mt-1">UTR: {safeStr((invoice.payment_completion_metadata as { utr?: string }).utr) || "—"}</p>
              <p>Amount: {inr(Number((invoice.payment_completion_metadata as { amount_paid?: number }).amount_paid) || 0)}</p>
            </>
          )}
        </div>
      ) : !bothApproved ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
          Available once both Admin Ops and Director approvals are complete.
        </div>
      ) : (
        <>
          <p className="text-xs font-semibold text-slate-500">Both approvals are complete — enter the transfer details to close this out.</p>
          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-slate-500">UTR / Reference No.</label>
            <input
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              placeholder="Enter UTR number"
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-slate-300"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-slate-500">Amount Paid</label>
            <div className="relative">
              <IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="number"
                inputMode="decimal"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder="0.00"
                className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-800 outline-none focus:border-slate-300"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleAddToLedger}
            disabled={completing}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-extrabold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4" />
            {completing ? "Processing…" : "Add to Ledger"}
          </button>
        </>
      )}

      {reconcileAmount !== null && (
        <PaymentReconcileModal
          invoice={invoice}
          utr={utr}
          targetAmount={reconcileAmount}
          isWorkOrder={isWorkOrder}
          budgetAllocation={budgetAllocation}
          flowFound={flowFound}
          onClose={() => setReconcileAmount(null)}
          onReconciled={() => { setReconcileAmount(null); refresh(); }}
        />
      )}
    </section>
  );
};

// ── Shared Sub-components ─────────────────────────────────────────────────────

// Fetches the order's purchase-flow record once — shared by the panel (to decide whether this
// is a Service Purchase Requisition, i.e. a "Work Order" whose impact is measured in completed
// work rather than goods, which gates the Investment Impact Calculator) and the Budget Impact
// section. PurchaseFlow.tsx only ever writes `order_type` as `'PR'` (Purchase Requisition —
// goods) or `'SPR'` (Service Purchase Requisition — labor/services, the one WCCs get raised
// against) — never "PO"/"WO" literally. Budget allocation comes from the dedicated
// `get_budget_allocated/{order_id}` endpoint (a server-side filter on order_number) rather than
// scanning+matching the full purchase-flow list client-side, the way order_type still has to
// (there's no equivalent single-order lookup for order_type). `flowFound` starts `null` until
// the budget-allocation fetch resolves so callers can tell "still loading" apart from "no
// allocation exists for this order" (a 404 from that endpoint).
function usePurchaseFlowInfo(orderNumber: string) {
  const [orderType, setOrderType] = useState("PR");
  const [budgetAllocation, setBudgetAllocation] = useState<Record<string, unknown[]>>({});
  const [flowFound, setFlowFound] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orderNumber) { setOrderType("PR"); setBudgetAllocation({}); setFlowFound(null); return; }
    const ac = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const [flowsRes, budgetRes] = await Promise.all([
          fetch(`${baseUrl}/purchase_flow/get_purchase_flows`, { signal: ac.signal }),
          fetch(`${baseUrl}/admin_accounts/get_budget_allocated/${encodeURIComponent(orderNumber)}`, { signal: ac.signal }),
        ]);

        const flowsData: { purchase_flows?: unknown[] } | null = await flowsRes.json().catch(() => null);
        const flows = Array.isArray(flowsData?.purchase_flows) ? flowsData.purchase_flows : [];
        const flow = flows.find((f) => safeStr((f as { order_number?: unknown })?.order_number) === orderNumber) as
          | { order_type?: string }
          | undefined;
        setOrderType(safeStr(flow?.order_type).toUpperCase() || "PR");

        const budgetData: { success?: boolean; data?: Record<string, unknown[]> } | null = await budgetRes.json().catch(() => null);
        if (budgetRes.ok && budgetData?.success) {
          setBudgetAllocation(budgetData.data ?? {});
          setFlowFound(true);
        } else {
          setBudgetAllocation({});
          setFlowFound(false);
        }
      } catch {
        // best-effort — defaults to PR (no Investment Impact Calculator) and an empty allocation
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [orderNumber]);

  return { orderType, budgetAllocation, flowFound, loading };
}

const PaymentRequestPanel = ({ invoice, onGoToApprovals }: { invoice: InvoicePayment; onGoToApprovals: () => void }) => {
  const { user } = useAuth();
  const intake = invoice._intake;
  const netBasic = intake ? intake.base_amount * (1 - intake.discount_percentage / 100) : 0;
  const gstAmount = intake ? (netBasic + intake.freight_charges) * (intake.GST_percentage / 100) : 0;
  const tdsAmount = intake ? netBasic * (intake.tds_percentage / 100) : 0;
  const fallbackLiability = intake ? netBasic + intake.freight_charges + gstAmount + intake.other_charges - tdsAmount : 0;
  const fallbackBalance = invoice.payment_completed ? 0 : fallbackLiability;

  // Authoritative source: the posted ledger entry (survives reload, shared across sessions).
  // Falls back to the locally-saved intake breakdown if the entry hasn't loaded / doesn't exist.
  const [ledgerEntry, setLedgerEntry] = useState<LedgerEntryRecord | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [docs, setDocs] = useState<SupportingDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<SupportingDocument | null>(null);

  const [vendorId, setVendorId] = useState(() => safeStr(invoice.vendor_id) || null);
  const [vendorDetails, setVendorDetails] = useState<VendorDetailsRecord | null>(null);
  const [vendorLoading, setVendorLoading] = useState(false);

  useEffect(() => {
    setVendorId(safeStr(invoice.vendor_id) || null);
    const entryId = safeStr(invoice.ledger_entry);
    if (!entryId) { setLedgerEntry(null); return; }
    const ac = new AbortController();
    setLedgerLoading(true);
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/admin_accounts/get_accounts_ledger_entry/${encodeURIComponent(entryId)}`, {
          headers: { Accept: "application/json" }, signal: ac.signal,
        });
        const data: { success?: boolean; data?: LedgerEntryRecord } | null = await res.json().catch(() => null);
        if (res.ok && data?.success && data.data) setLedgerEntry(data.data);
      } catch {
        // best-effort — falls back to locally-saved intake breakdown below
      } finally {
        setLedgerLoading(false);
      }
    })();
    return () => ac.abort();
  }, [invoice.ledger_entry, invoice.vendor_id]);

  useEffect(() => {
    const orderNumber = safeStr(invoice.order_number);
    if (!orderNumber) { setDocs([]); return; }
    const ac = new AbortController();
    setDocsLoading(true);
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/admin_accounts/get_supporting_documents/${encodeURIComponent(orderNumber)}`, {
          headers: { Accept: "application/json" }, signal: ac.signal,
        });
        const data: { success?: boolean; data?: SupportingDocument[]; vendor_id?: string } | null = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          setDocs(Array.isArray(data.data) ? data.data : []);
          if (safeStr(data.vendor_id)) setVendorId(safeStr(data.vendor_id));
        }
      } catch {
        // best-effort
      } finally {
        setDocsLoading(false);
      }
    })();
    return () => ac.abort();
  }, [invoice.order_number]);

  useEffect(() => {
    if (!vendorId) { setVendorDetails(null); return; }
    const ac = new AbortController();
    setVendorLoading(true);
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/admin_accounts/get_vendor_details/${encodeURIComponent(vendorId)}`, {
          headers: { Accept: "application/json" }, signal: ac.signal,
        });
        const data: { success?: boolean; data?: { vendor_id?: string; vendor_details?: VendorDetailsRecord } } | null =
          await res.json().catch(() => null);
        if (res.ok && data?.success && data.data?.vendor_details) setVendorDetails(data.data.vendor_details);
      } catch {
        // best-effort
      } finally {
        setVendorLoading(false);
      }
    })();
    return () => ac.abort();
  }, [vendorId]);

  const liability = ledgerEntry?.amount ?? (intake ? fallbackLiability : undefined);
  const balance = ledgerEntry?.balance ?? (intake ? fallbackBalance : undefined);
  const invoiceDate = ledgerEntry?.date ?? intake?.date;
  const hasLiabilityData = liability !== undefined;

  // A previously-saved payment amount (from add_payment_and_impact) takes priority over the
  // raw outstanding balance — otherwise reopening this payment would silently reset "Amount"
  // back to the full balance instead of showing what was actually chosen. `invoice` is a
  // stable snapshot for the lifetime of this component (Payment Request / Investment Impact /
  // Budget Impact are now one screen with one save, so there's no other tab that could save
  // over it mid-session), so no re-fetch is needed to stay in sync with itself.
  const savedPaymentAmount = invoice.payment_request_dict?.payment?.payment_amount;
  const [amount, setAmount] = useState("");
  useEffect(() => {
    if (savedPaymentAmount !== undefined) { setAmount(savedPaymentAmount.toFixed(2)); return; }
    if (balance !== undefined) setAmount(balance.toFixed(2));
  }, [balance, savedPaymentAmount]);
  const [remarks, setRemarks] = useState("");

  const amountNum = num(amount);
  const remainingLiability = balance !== undefined ? balance - amountNum : undefined;
  const liabilityBeforePayment = balance ?? 0;
  const liabilityAfterPayment = liabilityBeforePayment - amountNum;

  const { orderType, budgetAllocation, flowFound } = usePurchaseFlowInfo(safeStr(invoice.order_number));
  // 'SPR' = Service Purchase Requisition — the service/labor order type WCCs get raised
  // against, i.e. this codebase's equivalent of a "Work Order". 'PR' (goods) never needs the
  // land-investment calculator, only Budget Impact.
  const isWorkOrder = orderType === "SPR";

  const investmentRef = useRef<InvestmentImpactCalculatorHandle>(null);
  const budgetRef = useRef<BudgetImpactSectionHandle>(null);
  const [saving, setSaving] = useState<"draft" | "final" | null>(null);
  const [summary, setSummary] = useState<{ mode: "draft" | "final"; rows: InvestmentSummaryRow[] } | null>(null);

  const handleSave = async (mode: "draft" | "final") => {
    if (!invoice.payment_id) {
      toast.error("Missing payment id — cannot save the payment request.");
      return;
    }
    if (!amountNum || amountNum <= 0) {
      toast.error("Enter a valid amount before saving.");
      return;
    }

    setSaving(mode);
    try {
      const investmentPayload = isWorkOrder ? investmentRef.current?.getPayload() ?? null : null;
      const budget_impact = (await budgetRef.current?.resolvePayload()) ?? {};

      const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/admin_accounts/add_payment_and_impact`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          payment_id: invoice.payment_id,
          linvestment_impact: investmentPayload?.linvestment_impact ?? {},
          payment_dict: {
            liability_before_payment: liabilityBeforePayment,
            liability_after_payment: liabilityAfterPayment,
            payment_amount: amountNum,
            remarks,
          },
          budget_impact,
        }),
      });
      const resData: { success?: boolean; message?: string } | null = await res.json().catch(() => null);
      if (!res.ok || !resData?.success) throw new Error(resData?.message || `Failed to save (HTTP ${res.status})`);

      if (investmentPayload && investmentPayload.summaryRows.length > 0) {
        setSummary({ mode, rows: investmentPayload.summaryRows });
      }
      toast.success(mode === "draft" ? "Draft saved" : "Payment request saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save the payment request");
    } finally {
      setSaving(null);
    }
  };

  const [sendingForApproval, setSendingForApproval] = useState(false);

  const handleSendForApproval = async () => {
    // admin_ops_approval_status starts "not_initiated" — once this payment has already been
    // sent (or even fully approved), re-clicking just takes you back to the Approvals tab
    // instead of re-signing / resetting director_approval_status back to "pending".
    const alreadySent = !!invoice.admin_ops_approval_status && invoice.admin_ops_approval_status !== "not_initiated";
    if (alreadySent) {
      toast.info("This payment has already been sent for approval — refreshing status…");
      onGoToApprovals();
      return;
    }

    if (!invoice.payment_id) { toast.error("Missing payment id — cannot send for approval."); return; }
    if (!user?.id || !user?.name) { toast.error("You must be logged in to send this for approval."); return; }

    setSendingForApproval(true);
    try {
      const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/admin_accounts/send_for_approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          payment_id: invoice.payment_id,
          staff_id: user.id,
          name: user.name,
          designation: user.designation || "",
        }),
      });
      const resData: { success?: boolean; message?: string } | null = await res.json().catch(() => null);
      if (!res.ok || !resData?.success) throw new Error(resData?.message || `Failed to send for approval (HTTP ${res.status})`);
      toast.success("PRR created and sent for director approval");
      onGoToApprovals();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send for approval");
    } finally {
      setSendingForApproval(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Invoice Liability" value={liability !== undefined ? inr(liability) : ledgerLoading ? "Loading…" : "—"} icon={IndianRupee} />
        <StatTile label="Balance Amount" value={balance !== undefined ? inr(balance) : ledgerLoading ? "Loading…" : "—"} valueClass={balance !== undefined && balance > 0 ? "text-orange-600" : "text-emerald-600"} icon={CreditCard} />
        <StatTile label="Invoice Date" value={invoiceDate ? formatDateOnly(invoiceDate) : formatDate(invoice.created_at)} valueClass="text-blue-600" icon={CalendarDays} />
      </section>

      {!hasLiabilityData && !ledgerLoading && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
          No posted ledger entry or intake breakdown found for this invoice yet — enter the payable amount manually below.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr_1fr] xl:items-stretch">
        <section className="flex flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-extrabold text-slate-900">Vendor Details</h3>
          {vendorLoading && !vendorDetails && <p className="mt-2 text-xs font-semibold text-slate-400">Loading vendor details…</p>}
          <div className="mt-4 grid grid-cols-2 gap-4">
            <InfoLine label="Vendor Name" value={safeStr(vendorDetails?.vendor_name) || safeStr(invoice.vendor_name) || "—"} />
            <InfoLine label="Vendor ID" value={vendorId || "—"} />
            <InfoLine label="Contact" value={safeStr(vendorDetails?.vendor_contact) || "—"} />
            <InfoLine label="Email" value={safeStr(vendorDetails?.e_mail_id) || "—"} />
            <InfoLine label="PAN" value={safeStr(vendorDetails?.income_tax_pan) || "—"} />
            <InfoLine label="GSTIN" value={safeStr(vendorDetails?.gst_number) || "—"} />
            <InfoLine label="Nature of Vendor" value={safeStr(vendorDetails?.nature_of_vendor) || "—"} />
            <InfoLine label="Order Number" value={safeStr(invoice.order_number) || "—"} valueClass="text-blue-600" />
            <InfoLine label="Invoice No." value={safeStr(ledgerEntry?.invoice_no ?? intake?.invoice_no) || "—"} />
            <InfoLine label="Transfer Type" value={intake ? intake.transfer_type : "—"} valueClass="capitalize" />
            {vendorDetails?.vendor_address && (
              <div className="col-span-2">
                <InfoLine label="Address" value={vendorDetails.vendor_address} />
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-extrabold text-slate-900">Amount to be Paid</h3>
          <div className="mt-4 flex flex-1 flex-col space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-500">Amount<span className="text-red-500"> *</span></label>
              <div className="relative">
                <IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-11 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-base font-extrabold text-slate-900 outline-none focus:border-slate-300"
                />
              </div>
            </div>

            {balance !== undefined && (
              <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-500">Current Liability</span>
                  <span className="font-extrabold text-slate-800">{inr(balance)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-500">This Payment</span>
                  <span className="font-extrabold text-blue-600">− {inr(amountNum)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 text-xs">
                  <span className="font-bold text-slate-600">Remaining Liability</span>
                  <span className={`font-extrabold ${(remainingLiability ?? 0) > 0 ? "text-orange-600" : "text-emerald-600"}`}>
                    {inr(Math.max(remainingLiability ?? 0, 0))}
                  </span>
                </div>
                {remainingLiability !== undefined && remainingLiability < 0 && (
                  <p className="text-[11px] font-semibold text-red-500">
                    Amount exceeds current liability by {inr(Math.abs(remainingLiability))}.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-500">Remarks</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                maxLength={250}
                placeholder="Add a note…"
                className="min-h-20 w-full resize-none rounded-md border border-slate-200 p-3 text-sm font-semibold text-slate-800 outline-none focus:border-slate-300"
              />
              <p className="text-xs font-semibold text-slate-400">{remarks.length} / 250</p>
            </div>
          </div>
        </section>

        <section className="flex flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-extrabold text-slate-900">Supporting Documents</h3>
          <div className="mt-4 space-y-2">
            {docsLoading && docs.length === 0 && <p className="text-xs font-semibold text-slate-400">Loading documents…</p>}
            {docs.map((d, i) => (
              <DocRow key={`${d.document}-${i}`} name={d.document} url={d.doc_link} onPreview={() => setPreviewDoc(d)} />
            ))}
            {!docsLoading && docs.length === 0 && (
              <p className="text-xs font-semibold text-slate-400">No documents on file for this order.</p>
            )}
          </div>
        </section>
      </div>

      {previewDoc && <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}

      {intake && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-extrabold text-slate-900">Liability Breakdown</h3>
          <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
            <BreakdownLine label="Base Amount" value={intake.base_amount} />
            <BreakdownLine label={`Discount (${intake.discount_percentage}%)`} value={-(intake.base_amount - netBasic)} />
            <BreakdownLine label="Freight Charges" value={intake.freight_charges} />
            <BreakdownLine label={`GST (${intake.GST_percentage}%)`} value={gstAmount} />
            <BreakdownLine label="Other Charges" value={intake.other_charges} />
            <BreakdownLine label={`TDS (${intake.tds_percentage}%)`} value={-tdsAmount} />
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-sm font-extrabold text-emerald-700">
            <span>Net Liability</span>
            <span>{inr(fallbackLiability)}</span>
          </div>
        </section>
      )}

      <div className={`grid grid-cols-1 items-start gap-4 ${isWorkOrder ? "xl:grid-cols-2" : ""}`}>
        {isWorkOrder && (
          <InvestmentImpactCalculator
            ref={investmentRef}
            orderNumber={safeStr(invoice.order_number)}
            totalAmount={amountNum}
            initialData={invoice.payment_request_dict?.linvestment_impact}
          />
        )}

        <BudgetImpactSection
          ref={budgetRef}
          invoice={invoice}
          paymentAmount={amountNum}
          budgetAllocation={budgetAllocation}
          flowFound={flowFound}
          initialBudgetImpact={invoice.payment_request_dict?.budget_impact}
        />
      </div>

      <div className="flex items-center justify-end gap-2 rounded-lg border border-slate-200 bg-white px-5 py-3 shadow-sm">
        <button
          type="button"
          onClick={() => handleSave("draft")}
          disabled={saving !== null || !amountNum}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-4 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {saving === "draft" ? "Saving…" : "Save Draft"}
        </button>
        <button
          type="button"
          onClick={() => handleSave("final")}
          disabled={saving !== null || !amountNum}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCircle className="h-3.5 w-3.5" />
          {saving === "final" ? "Saving…" : "Save Payment Request"}
        </button>
        <button
          type="button"
          onClick={handleSendForApproval}
          disabled={saving !== null || sendingForApproval || !amountNum}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-indigo-200 bg-white px-4 text-xs font-bold text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          {sendingForApproval ? "Sending…" : "Make PRR & Send for Approval"}
        </button>
      </div>

      {summary && (
        <InvestmentMatrixSummaryModal
          mode={summary.mode}
          totalAmount={amountNum}
          rows={summary.rows}
          onClose={() => setSummary(null)}
        />
      )}
    </div>
  );
};

type InvestmentSummaryRow = { ownerName: string; acres: number; investment: number };

const InvestmentMatrixSummaryModal = ({
  mode, totalAmount, rows, onClose,
}: { mode: "draft" | "final"; totalAmount: number; rows: InvestmentSummaryRow[]; onClose: () => void }) => {
  const totalAcres = rows.reduce((s, r) => s + r.acres, 0);
  const totalInvestment = rows.reduce((s, r) => s + r.investment, 0);
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900">Investment Impact</h2>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${mode === "draft" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                {mode === "draft" ? "Draft" : "Final"}
              </span>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Amount to be Paid: <span className="font-extrabold text-slate-800">{inr(totalAmount)}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-3">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">S.No.</th>
                <th className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Land Owner</th>
                <th className="px-3 py-2 text-right text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Acres</th>
                <th className="px-3 py-2 text-right text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Investment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.ownerName}-${i}`} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/60">
                  <td className="px-3 py-2 font-semibold text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2 font-bold text-slate-800">{r.ownerName || "Unassigned"}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-700">{r.acres.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-bold text-slate-900">{inr(r.investment)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-xs font-semibold text-slate-400">
                    No land rows yet.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Total</td>
                <td className="px-3 py-2.5 text-right font-extrabold text-slate-900">{totalAcres.toFixed(2)}</td>
                <td className="px-3 py-2.5 text-right font-extrabold text-emerald-700">{inr(totalInvestment)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex justify-end border-t border-slate-200 px-5 py-3.5">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-bold hover:bg-slate-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Small on/off switch — used to let the user explicitly skip Investment Impact / Budget Impact
// for a payment where that side genuinely doesn't apply (e.g. no land investment involved, or
// nothing budget-allocated), so the save sends an empty `{}` for that section instead of
// whatever happens to be sitting in the table.
const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? "bg-emerald-500" : "bg-slate-300"}`}
  >
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
  </button>
);

// ── Investment Impact Calculator — WO-only. Pulls per-land investment straight from a released
// (approved) Work Completion Certificate's Annexure (land → acres) times its rate_per_acre;
// every row stays editable for the "not calculable from the WCC" manual-override case, and rows
// can also be added by hand for orders that don't have a WCC yet.
type InvestmentRow = {
  id: string; // land_id for WCC-sourced rows, `manual_<ts>` for hand-added rows
  ownerName: string;
  acres: string;
  investment: string;
  source: "wcc" | "manual";
};

type InvestmentImpactCalculatorHandle = {
  getPayload: () => { linvestment_impact: Record<string, unknown>; summaryRows: InvestmentSummaryRow[] };
};

function buildInitialInvestmentState(raw: Record<string, unknown> | undefined): { rows: InvestmentRow[]; certId: string } {
  if (!raw || typeof raw !== "object") return { rows: [], certId: "" };
  const entries = raw.entries;
  if (!entries || typeof entries !== "object") return { rows: [], certId: "" };
  const rows: InvestmentRow[] = Object.entries(entries as Record<string, unknown>).map(([id, v]) => {
    const e = v as { land_owner?: string; acres?: number; investment_amount?: number; source?: string };
    return {
      id,
      ownerName: safeStr(e.land_owner),
      acres: e.acres !== undefined ? String(e.acres) : "",
      investment: e.investment_amount !== undefined ? String(e.investment_amount) : "",
      source: e.source === "manual" ? "manual" : "wcc",
    };
  });
  return { rows, certId: safeStr(raw.wcc_certificate_id) };
}

const InvestmentImpactCalculator = forwardRef<InvestmentImpactCalculatorHandle, {
  orderNumber: string;
  totalAmount: number;
  initialData?: Record<string, unknown>;
}>(({ orderNumber, totalAmount, initialData }, ref) => {
  const [initialState] = useState(() => buildInitialInvestmentState(initialData));
  const [rows, setRows] = useState<InvestmentRow[]>(initialState.rows);
  const [certificates, setCertificates] = useState<WccCertificateRecord[]>([]);
  const [certLoading, setCertLoading] = useState(false);
  const [selectedCertId, setSelectedCertId] = useState(initialState.certId);
  // Defaults off for a fresh payment, but stays on when reopening one that already has saved
  // investment rows — otherwise the toggle would silently wipe previously-saved data on save.
  const [enabled, setEnabled] = useState(() => initialState.rows.length > 0);

  useEffect(() => {
    if (!orderNumber) { setCertificates([]); return; }
    const ac = new AbortController();
    setCertLoading(true);
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/admin_wcc_certificate/get_by_order/${encodeURIComponent(orderNumber)}`, {
          headers: { Accept: "application/json" }, signal: ac.signal,
        });
        const data: { success?: boolean; certificates?: WccCertificateRecord[] } | null = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          setCertificates((data.certificates ?? []).filter((c) => c.status === "approved"));
        }
      } catch {
        // best-effort
      } finally {
        setCertLoading(false);
      }
    })();
    return () => ac.abort();
  }, [orderNumber]);

  const selectedCert = certificates.find((c) => c.certificate_id === selectedCertId) ?? null;

  const applyCertificate = (certId: string) => {
    setSelectedCertId(certId);
    const cert = certificates.find((c) => c.certificate_id === certId);
    if (!cert) return;
    const byLand = new Map<string, { farmerName: string; acres: number }>();
    cert.annexure.crops.forEach((group) => {
      group.rows.forEach((r) => {
        const prev = byLand.get(r.landId);
        if (prev) prev.acres += r.total;
        else byLand.set(r.landId, { farmerName: r.farmerName, acres: r.total });
      });
    });
    const rate = cert.rate_per_acre;
    const newRows: InvestmentRow[] = Array.from(byLand.entries()).map(([landId, v]) => ({
      id: landId,
      ownerName: v.farmerName,
      acres: v.acres.toFixed(2),
      investment: (v.acres * rate).toFixed(2),
      source: "wcc",
    }));
    setRows(newRows);
  };

  const setRowField = (id: string, field: "ownerName" | "acres" | "investment", value: string) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const addManualRow = () =>
    setRows((prev) => [...prev, { id: `manual_${Date.now()}`, ownerName: "", acres: "", investment: "", source: "manual" }]);

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const totalInvestment = rows.reduce((s, r) => s + (num(r.investment) || 0), 0);

  useImperativeHandle(ref, () => ({
    getPayload: () => {
      if (!enabled) return { linvestment_impact: {}, summaryRows: [] };
      const entries: Record<string, unknown> = {};
      rows.forEach((r) => {
        entries[r.id] = {
          land_owner: r.ownerName,
          acres: num(r.acres) || 0,
          investment_amount: num(r.investment) || 0,
          source: r.source,
        };
      });
      return {
        linvestment_impact: {
          wcc_certificate_id: selectedCertId || null,
          rate_per_acre: selectedCert?.rate_per_acre ?? null,
          entries,
        },
        summaryRows: rows.map((r) => ({ ownerName: r.ownerName, acres: num(r.acres) || 0, investment: num(r.investment) || 0 })),
      };
    },
  }), [enabled, rows, selectedCertId, selectedCert]);

  return (
    <section className="min-w-0 space-y-2.5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-900">Investment Impact Calculator</h3>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">
            Pull land-owner investment from a released WCC, then adjust by hand if needed.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">{enabled ? "On" : "Off"}</span>
          <ToggleSwitch checked={enabled} onChange={setEnabled} />
        </div>
      </div>

      {!enabled ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-[11px] font-semibold text-slate-400">
          Not applicable for this payment — no land investment will be recorded.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={selectedCertId}
              onChange={(e) => applyCertificate(e.target.value)}
              disabled={certLoading}
              className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none focus:border-slate-300 disabled:opacity-50"
            >
              <option value="">{certLoading ? "Loading WCCs…" : "Select a released WCC…"}</option>
              {certificates.map((c) => (
                <option key={c.certificate_id} value={c.certificate_id}>
                  {c.certificate_id} · ₹{c.rate_per_acre}/acre
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addManualRow}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Row
            </button>
          </div>

          {!certLoading && certificates.length === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
              No released WCC found for this order yet — add land rows manually below.
            </div>
          )}

          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
            <span>Amount: <span className="font-extrabold text-slate-800">{inr(totalAmount)}</span></span>
            <span className="text-slate-300">|</span>
            <span>
              Investment:{" "}
              <span className={`font-extrabold ${totalInvestment > totalAmount ? "text-red-500" : "text-slate-800"}`}>{inr(totalInvestment)}</span>
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[420px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
                  <th className="px-2.5 py-1.5">Land Owner</th>
                  <th className="px-2.5 py-1.5 text-right">Acres</th>
                  <th className="px-2.5 py-1.5 text-right">Investment</th>
                  <th className="px-2.5 py-1.5 w-6" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-2.5 py-1.5">
                      <input
                        type="text"
                        value={r.ownerName}
                        onChange={(e) => setRowField(r.id, "ownerName", e.target.value)}
                        disabled={r.source === "wcc"}
                        className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-500"
                      />
                    </td>
                    <td className="px-2.5 py-1.5 text-right">
                      <input
                        type="number"
                        value={r.acres}
                        onChange={(e) => setRowField(r.id, "acres", e.target.value)}
                        className="h-7 w-20 rounded-md border border-slate-200 bg-white px-2 text-right text-xs font-bold text-slate-800 outline-none focus:border-slate-300"
                      />
                    </td>
                    <td className="px-2.5 py-1.5 text-right">
                      <input
                        type="number"
                        value={r.investment}
                        onChange={(e) => setRowField(r.id, "investment", e.target.value)}
                        className="h-7 w-24 rounded-md border border-slate-200 bg-white px-2 text-right text-xs font-bold text-slate-800 outline-none focus:border-slate-300"
                      />
                    </td>
                    <td className="px-2.5 py-1.5 text-center">
                      <button type="button" onClick={() => removeRow(r.id)} className="text-slate-400 hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-xs font-semibold text-slate-400">
                      No rows yet — select a WCC or add a row manually.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
});
InvestmentImpactCalculator.displayName = "InvestmentImpactCalculator";

// ── Budget Impact — draws this payment from the order's original budget line items ─────────
// `budget_allocation` is only ever written by PurchaseFlow.tsx at order-creation time (never
// read back there), so this fetches purchase flows directly and matches by order_number, plus
// /admin_accounts/get_budgets for human-readable budget names.

type BudgetLineItemRow = {
  key: string; // `${budgetId}::${category}::${lineItem}` — stable across both the order's
               // original allocation snapshot and a budget's full xlsx line-item list, so the
               // two sources de-dupe against each other when merged.
  budgetId: string;
  budgetName: string;
  category: string;
  lineItem: string;
  type: string;
  budgeted: number;
  originalAllocated: number;
  checked: boolean;
  amount: string;
  // Only known when this row came from (or has since been matched against) the budget's xlsx —
  // the order's original allocation snapshot never stored a line_item_id, only category+name.
  lineItemId?: string;
};

type FullBudgetLineItem = { lineItemId: string; category: string; lineItem: string; budgetType: string; totalValue: number };
type BudgetOption = { budget_id: string; budget_name: string; crop_season: string };

const rowKey = (budgetId: string, category: string, lineItem: string) => `${budgetId}::${category}::${lineItem}`;

type BudgetImpactSectionHandle = {
  resolvePayload: () => Promise<Record<string, Record<string, unknown>>>;
};

const BudgetImpactSection = forwardRef<BudgetImpactSectionHandle, {
  invoice: InvoicePayment;
  paymentAmount: number;
  budgetAllocation: Record<string, unknown[]>;
  flowFound: boolean | null;
  initialBudgetImpact?: Record<string, unknown>;
}>(({ invoice, paymentAmount, budgetAllocation, flowFound, initialBudgetImpact }, ref) => {
  const [rows, setRows] = useState<BudgetLineItemRow[]>([]);
  const [originalRows, setOriginalRows] = useState<BudgetLineItemRow[]>([]);
  const [allBudgets, setAllBudgets] = useState<BudgetOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lineItemsCache, setLineItemsCache] = useState<Record<string, FullBudgetLineItem[]>>({});
  const [pickedBudgetId, setPickedBudgetId] = useState("");
  const [addingBudget, setAddingBudget] = useState(false);
  // Defaults off for a fresh payment, but stays on when reopening one that already has a saved
  // budget impact — otherwise the toggle would silently wipe previously-saved data on save.
  const [enabled, setEnabled] = useState(() => !!initialBudgetImpact && Object.keys(initialBudgetImpact).length > 0);

  // A budget's line items only ever live in its xlsx (same source PurchaseFlow.tsx reads at
  // order-creation time) — fetched and parsed on demand rather than up front, since every
  // budget referenced here would otherwise mean a full xlsx download just to open this tab.
  const fetchBudgetFullLineItems = useCallback(async (budgetId: string): Promise<FullBudgetLineItem[]> => {
    if (lineItemsCache[budgetId]) return lineItemsCache[budgetId];
    const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
    const res = await fetch(`${baseUrl}/admin_accounts/get_budget/${budgetId}`);
    if (!res.ok) throw new Error(`Failed to fetch budget (HTTP ${res.status})`);
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
    const ws = wb.Sheets["budget"] || wb.Sheets[wb.SheetNames[0]];
    if (!ws) return [];
    const sheetRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws);
    const items: FullBudgetLineItem[] = sheetRows
      .map((r, i) => {
        // Some rows in the wild carry the literal text "undefined"/"null" in line_item_id
        // (a stale artifact from elsewhere, e.g. Budget.tsx's bulk-import path) — treat that
        // the same as genuinely missing rather than using it verbatim as a real id.
        const rawId = safeStr(r.line_item_id).toLowerCase();
        const hasRealId = rawId && rawId !== "undefined" && rawId !== "null";
        return {
          lineItemId: hasRealId ? safeStr(r.line_item_id) : `item_${i}`,
          category: safeStr(r.category),
          lineItem: safeStr(r.line_item),
          budgetType: safeStr(r.budget_type),
          totalValue:
            Number(r.total_value) ||
            (Number(r.quantity_per_acre) || 0) * (Number(r.total_acres) || 0) * (Number(r.rate_per_unit) || 0),
        };
      })
      .filter((it) => it.lineItem);
    setLineItemsCache((prev) => ({ ...prev, [budgetId]: items }));
    return items;
  }, [lineItemsCache]);

  useEffect(() => {
    const orderNumber = safeStr(invoice.order_number);
    // Waits for the parent's purchase-flow fetch to resolve (flowFound starts `null`) so this
    // only runs once with the real budgetAllocation, instead of once empty then once real.
    if (!orderNumber || flowFound === null) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const budgetsRes = await fetch(`${baseUrl}/admin_accounts/get_budgets`, { signal: ac.signal });
        const budgetsData: { success?: boolean; data?: { budget_id?: string; budget_name?: string; crop_season?: string; locked?: boolean }[] } | null =
          await budgetsRes.json().catch(() => null);

        const budgetNameById = new Map<string, string>();
        (budgetsData?.data ?? []).forEach((b) => {
          if (b.budget_id) budgetNameById.set(b.budget_id, safeStr(b.budget_name));
        });
        setAllBudgets(
          (budgetsData?.data ?? [])
            .filter((b) => b.budget_id && !b.locked)
            .map((b) => ({ budget_id: b.budget_id!, budget_name: safeStr(b.budget_name), crop_season: safeStr(b.crop_season) }))
        );

        const built: BudgetLineItemRow[] = [];
        Object.entries(budgetAllocation).forEach(([budgetId, items]) => {
          if (!Array.isArray(items)) return;
          items.forEach((raw) => {
            const it = raw as { category?: string; line_item?: string; type?: string; budgeted?: number; allocated?: number };
            const originalAllocated = Number(it.allocated) || 0;
            const category = safeStr(it.category);
            const lineItem = safeStr(it.line_item);
            built.push({
              key: rowKey(budgetId, category, lineItem),
              budgetId,
              budgetName: budgetNameById.get(budgetId) || budgetId,
              category,
              lineItem,
              type: safeStr(it.type),
              budgeted: Number(it.budgeted) || 0,
              originalAllocated,
              checked: originalAllocated > 0,
              amount: "",
            });
          });
        });
        setRows(built);
        setOriginalRows(built);
        if (built.length === 0) setError(flowFound ? "This order has no budget line items allocated." : "No purchase flow found for this order.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load budget line items");
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [invoice.order_number, budgetAllocation, flowFound]);

  // Overlays whatever was actually saved for THIS payment (checked state + amount) on top of
  // the PO's original snapshot — without this, a previously-saved budget impact never showed
  // up here at all, since `rows` above only ever reflected the order's original allocation.
  // Entries whose (budgetId, category, line_item) don't match any snapshot row (e.g. added via
  // "More Line Items" / "+ Add Budget" in an earlier session) are inserted as new rows.
  useEffect(() => {
    const savedBudgetImpact = initialBudgetImpact;
    if (!savedBudgetImpact || typeof savedBudgetImpact !== "object" || Object.keys(savedBudgetImpact).length === 0) return;

    setRows((prev) => {
      const next = [...prev];
      Object.entries(savedBudgetImpact as Record<string, unknown>).forEach(([budgetId, lineItems]) => {
        if (!lineItems || typeof lineItems !== "object") return;
        Object.entries(lineItems as Record<string, unknown>).forEach(([lineItemId, raw]) => {
          const entry = raw as { line_item_name?: string; category?: string; type?: string; impact_amount?: number };
          const category = safeStr(entry.category);
          const lineItem = safeStr(entry.line_item_name);
          const key = rowKey(budgetId, category, lineItem);
          const idx = next.findIndex((r) => r.key === key);
          if (idx !== -1) {
            next[idx] = { ...next[idx], checked: true, amount: String(entry.impact_amount ?? 0), lineItemId };
          } else {
            next.push({
              key,
              budgetId,
              budgetName: allBudgets.find((b) => b.budget_id === budgetId)?.budget_name || budgetId,
              category,
              lineItem,
              type: safeStr(entry.type),
              budgeted: 0,
              originalAllocated: 0,
              checked: true,
              amount: String(entry.impact_amount ?? 0),
              lineItemId,
            });
          }
        });
      });
      return next;
    });
    // Only re-run when the saved data itself changes (or the snapshot it overlays onto loads) —
    // deliberately excludes `rows`/`allBudgets` so this doesn't fight the user's own edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBudgetImpact, originalRows]);

  const toggleRow = (key: string) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, checked: !r.checked } : r)));

  const setRowAmount = (key: string, amount: string) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, amount } : r)));

  // Drops back to exactly what was fetched at load — any budgets/line items pulled in via
  // "More Line Items" or "+ Add Budget" are discarded, matching "continue with the same
  // bifurcation as earlier made at purchase flow".
  const resetRows = () =>
    setRows(originalRows.map((r) => ({ ...r, checked: r.originalAllocated > 0, amount: "" })));

  const handleAddBudget = async () => {
    const budget = allBudgets.find((b) => b.budget_id === pickedBudgetId);
    if (!budget) { toast.error("Select a budget first"); return; }
    if (rows.some((r) => r.budgetId === budget.budget_id)) {
      toast.error('That budget is already listed below — use "More Line Items" on its card instead.');
      return;
    }
    setAddingBudget(true);
    try {
      const items = await fetchBudgetFullLineItems(budget.budget_id);
      if (items.length === 0) { toast.error("No line items found for this budget"); return; }
      setRows((prev) => [
        ...prev,
        ...items.map((li) => ({
          key: rowKey(budget.budget_id, li.category, li.lineItem),
          budgetId: budget.budget_id,
          budgetName: budget.budget_name,
          category: li.category,
          lineItem: li.lineItem,
          type: li.budgetType,
          budgeted: li.totalValue,
          originalAllocated: 0,
          checked: false,
          amount: "",
          lineItemId: li.lineItemId,
        })),
      ]);
      setPickedBudgetId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load budget line items");
    } finally {
      setAddingBudget(false);
    }
  };

  // Pulls in any line items that exist in this budget's xlsx but weren't part of the order's
  // original allocation — e.g. the vendor's invoice covers a task the purchase order didn't
  // originally earmark money for.
  const [loadingMoreBudgetId, setLoadingMoreBudgetId] = useState<string | null>(null);

  const handleMoreLineItems = async (budgetId: string, budgetName: string) => {
    setLoadingMoreBudgetId(budgetId);
    try {
      const items = await fetchBudgetFullLineItems(budgetId);
      const existingKeys = new Set(rows.filter((r) => r.budgetId === budgetId).map((r) => r.key));
      const additions: BudgetLineItemRow[] = items
        .filter((li) => !existingKeys.has(rowKey(budgetId, li.category, li.lineItem)))
        .map((li) => ({
          key: rowKey(budgetId, li.category, li.lineItem),
          budgetId,
          budgetName,
          category: li.category,
          lineItem: li.lineItem,
          type: li.budgetType,
          budgeted: li.totalValue,
          originalAllocated: 0,
          checked: false,
          amount: "",
          lineItemId: li.lineItemId,
        }));
      if (additions.length === 0) {
        toast.info("No additional line items found in this budget.");
        return;
      }
      setRows((prev) => [...prev, ...additions]);
      toast.success(`Added ${additions.length} more line item(s) from ${budgetName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load budget line items");
    } finally {
      setLoadingMoreBudgetId(null);
    }
  };

  const totalAllocated = rows.filter((r) => r.checked).reduce((sum, r) => sum + (num(r.amount) || 0), 0);

  const groupedByBudget = useMemo(() => {
    const map = new Map<string, { budgetId: string; budgetName: string; rows: BudgetLineItemRow[] }>();
    rows.forEach((r) => {
      if (!map.has(r.budgetId)) map.set(r.budgetId, { budgetId: r.budgetId, budgetName: r.budgetName, rows: [] });
      map.get(r.budgetId)!.rows.push(r);
    });
    return Array.from(map.values());
  }, [rows]);

  useImperativeHandle(ref, () => ({
    resolvePayload: async () => {
      if (!enabled) return {};
      const checkedRows = rows.filter((r) => r.checked);

      // Rows from the order's original allocation snapshot never carry a real line_item_id (that
      // snapshot only ever stored category/line_item names) — resolve it now by matching against
      // each involved budget's current xlsx, which is the only place the id actually lives.
      const budgetIdsNeedingLookup = Array.from(new Set(checkedRows.filter((r) => !r.lineItemId).map((r) => r.budgetId)));
      const fullItemsByBudget = new Map<string, FullBudgetLineItem[]>();
      try {
        await Promise.all(
          budgetIdsNeedingLookup.map(async (budgetId) => {
            fullItemsByBudget.set(budgetId, await fetchBudgetFullLineItems(budgetId));
          }),
        );
      } catch (e) {
        throw new Error(e instanceof Error ? e.message : "Failed to look up budget line item ids");
      }

      const unmatched: string[] = [];
      const resolvedRows = checkedRows
        .map((r) => {
          if (r.lineItemId) return r;
          const match = (fullItemsByBudget.get(r.budgetId) ?? []).find(
            (li) => li.category === r.category && li.lineItem === r.lineItem,
          );
          if (!match) { unmatched.push(r.lineItem || r.category || r.key); return null; }
          return { ...r, lineItemId: match.lineItemId };
        })
        .filter((r): r is BudgetLineItemRow => r !== null);

      if (unmatched.length > 0) {
        toast.warning(`Skipped ${unmatched.length} line item(s) no longer found in their budget: ${unmatched.join(", ")}`);
      }

      const budget_impact: Record<string, Record<string, unknown>> = {};
      resolvedRows.forEach((r) => {
        if (!budget_impact[r.budgetId]) budget_impact[r.budgetId] = {};
        budget_impact[r.budgetId][r.lineItemId!] = {
          line_item_name: r.lineItem,
          category: r.category,
          type: r.type,
          impact_amount: num(r.amount) || 0,
        };
      });
      return budget_impact;
    },
  }), [enabled, rows, fetchBudgetFullLineItems]);

  return (
    <div className="min-w-0 space-y-2.5">
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-900">Budget Impact</h3>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">
            Line items this payment draws from — pre-checked from the order's original allocation.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">{enabled ? "On" : "Off"}</span>
            <ToggleSwitch checked={enabled} onChange={setEnabled} />
          </div>
          <button
            type="button"
            onClick={resetRows}
            disabled={loading || !enabled}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      </div>

      {!enabled ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-[11px] font-semibold text-slate-400">
          Not applicable for this payment — no budget allocation will be recorded.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
            <span>Amount: <span className="font-extrabold text-slate-800">{inr(paymentAmount)}</span></span>
            <span className="text-slate-300">|</span>
            <span>
              Allocated:{" "}
              <span className={`font-extrabold ${totalAllocated > paymentAmount ? "text-red-500" : "text-slate-800"}`}>{inr(totalAllocated)}</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-3 py-2">
            <select
              value={pickedBudgetId}
              onChange={(e) => setPickedBudgetId(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none focus:border-slate-300"
            >
              <option value="">Select a budget to add…</option>
              {allBudgets
                .filter((b) => !rows.some((r) => r.budgetId === b.budget_id))
                .map((b) => (
                  <option key={b.budget_id} value={b.budget_id}>
                    {b.budget_name}{b.crop_season ? ` · ${b.crop_season}` : ""}
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={handleAddBudget}
              disabled={!pickedBudgetId || addingBudget}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {addingBudget ? "Loading…" : "Add"}
            </button>
          </div>

          {loading && rows.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-white py-10 text-center text-xs text-slate-400 shadow-sm">Loading budget line items…</div>
          )}
          {!loading && error && rows.length === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">{error}</div>
          )}

          {groupedByBudget.map((g) => (
            <section key={g.budgetId} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
                <h4 className="text-xs font-extrabold text-slate-700">{g.budgetName}</h4>
                <button
                  type="button"
                  onClick={() => handleMoreLineItems(g.budgetId, g.budgetName)}
                  disabled={loadingMoreBudgetId === g.budgetId}
                  className="inline-flex h-6 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw className={`h-3 w-3 ${loadingMoreBudgetId === g.budgetId ? "animate-spin" : ""}`} />
                  {loadingMoreBudgetId === g.budgetId ? "Fetching…" : "More"}
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr className="border-b border-slate-200 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
                      <th className="px-2.5 py-1.5 w-6" />
                      <th className="px-2.5 py-1.5">Category</th>
                      <th className="px-2.5 py-1.5">Line Item</th>
                      <th className="px-2.5 py-1.5 text-right">Allocated</th>
                      <th className="px-2.5 py-1.5 text-right">This Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.key} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-2.5 py-1.5">
                          <input
                            type="checkbox"
                            checked={r.checked}
                            onChange={() => toggleRow(r.key)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </td>
                        <td className="px-2.5 py-1.5 font-semibold text-slate-600">{r.category || "—"}</td>
                        <td className="px-2.5 py-1.5 font-bold text-slate-800">{r.lineItem || "—"}</td>
                        <td className="px-2.5 py-1.5 text-right font-semibold text-slate-700">{inr(r.originalAllocated)}</td>
                        <td className="px-2.5 py-1.5 text-right">
                          <input
                            type="number"
                            min={0}
                            value={r.amount}
                            onChange={(e) => setRowAmount(r.key, e.target.value)}
                            disabled={!r.checked}
                            placeholder="0.00"
                            className="h-7 w-24 rounded-md border border-slate-200 bg-white px-2 text-right text-xs font-bold text-slate-800 outline-none focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-300"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
});
BudgetImpactSection.displayName = "BudgetImpactSection";

const StatTile = ({
  label, value, valueClass = "text-slate-900", icon: Icon,
}: { label: string; value: string; valueClass?: string; icon: ComponentType<{ className?: string }> }) => (
  <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
      <Icon className="h-5 w-5 text-slate-500" />
    </div>
    <div className="min-w-0">
      <p className="truncate text-[11px] font-extrabold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 truncate text-lg font-extrabold ${valueClass}`}>{value}</p>
    </div>
  </div>
);

const BreakdownLine = ({ label, value }: { label: string; value: number }) => (
  <div className="flex items-center justify-between text-sm">
    <span className="font-semibold text-slate-500">{label}</span>
    <span className={`font-extrabold ${value < 0 ? "text-red-500" : "text-slate-800"}`}>
      {value < 0 ? "− " : ""}{inr(Math.abs(value))}
    </span>
  </div>
);

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
  const ledger   = safeStr(item.ledger_entery_status).toLowerCase();

  // The ledger posts twice: once at intake (liability) and once at payment (balancing
  // credit). `ledger_entery_status` on this record reflects the FIRST (intake) posting —
  // "completed" means the invoice has been taken inward and is ready for a payment request,
  // not that the whole flow's accounting is done.
  const s0: MilestoneStatus = item.invoice_doc_url                              ? "done" : "active";
  const sIntake: MilestoneStatus = (!!item._intake || ledger === "completed")   ? "done" : s0 === "done" ? "active" : "pending";
  // Payment Request / Investment Impact / Budget Impact are now one screen with one save —
  // `add_payment_and_impact` writes `payment`, `linvestment_impact`, and `budget_impact` onto
  // payment_request_dict together in a single call, so one combined milestone covers all three.
  const s1: MilestoneStatus = isNonEmpty(item.payment_request_dict?.payment)    ? "done" : sIntake === "done" ? "active" : "pending";
  const s2: MilestoneStatus = admin    === "approved"                           ? "done" : admin    === "rejected" ? "rejected" : s1 === "done" ? "active" : "pending";
  const s3: MilestoneStatus = director === "approved"                          ? "done" : director === "rejected" ? "rejected" : s2 === "done" ? "active" : "pending";
  const s4: MilestoneStatus = item.prr_number                                   ? "done" : s3 === "done" ? "active" : "pending";
  const s5: MilestoneStatus = isNonEmpty(item.payment_completion_metadata)      ? "done" : s4 === "done" ? "active" : "pending";
  // No separate API signal yet for the second (balancing) ledger posting — it fires as part
  // of payment completion, so treat it as done whenever payment itself is done.
  const s6: MilestoneStatus = s5 === "done"                                     ? "done" : "pending";

  return [s0, sIntake, s1, s2, s3, s4, s5, s6];
}


// ── Small helpers ─────────────────────────────────────────────────────────────

const DocRow = ({ name, url, onPreview }: { name: string; url?: string; onPreview: () => void }) => {
  if (!url) return null;
  return (
    <button
      type="button"
      onClick={onPreview}
      className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-3 text-left transition-colors hover:bg-slate-50"
    >
      <FileText className="h-5 w-5 shrink-0 text-red-500" />
      <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-slate-800">{name}</span>
      <Eye className="h-4 w-4 shrink-0 text-blue-600" />
    </button>
  );
};

const DocumentPreviewModal = ({ doc, onClose }: { doc: SupportingDocument; onClose: () => void }) => (
  <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/45 p-4">
    <div className="flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-slate-900">Document Preview</h3>
          <p className="truncate text-[11px] font-medium text-slate-400">{doc.document}</p>
        </div>
        <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 p-4">
        <DocPreviewPane doc={doc} />
      </div>
      <div className="flex shrink-0 justify-end border-t border-slate-200 px-5 py-3">
        <a
          href={doc.doc_link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
        >
          Open in new tab <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  </div>
);

const InfoLine = ({ label, value, valueClass = "text-slate-900" }: { label: string; value: string; valueClass?: string }) => (
  <div>
    <p className="text-sm font-semibold text-slate-500">{label}</p>
    <p className={`mt-1 text-sm font-extrabold ${valueClass}`}>{value}</p>
  </div>
);

