import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, FileCheck, FileClock, IndianRupee, Plus, Receipt, RefreshCw, Trash2, UploadCloud, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import getBaseUrl from "@/lib/config";
import { useAuth } from "@/context/AuthContext";
import { DocumentFitFrame, PrrDocumentPreview, buildPrrPreviewFromPaymentFlow, useAccountingDimensions, type FinanceRecord, type PRRDetails } from "./FinanceAccounts";

type InvoiceRecord = {
  invoice_id: string;
  vendor_details?: { vendor_name?: string; vendor_id?: string; gst_number?: string };
  invoice_details?: { invoice_number?: string; invoice_date?: string };
  purchase_order_details?: { order_number?: string; department?: string; cupporting_documents?: Array<{ document_type?: string; document_number?: string }> };
  tax_details?: { total_tax_amount?: number; payment_terms?: string; cgst_amount?: number; sgst_amount?: number; igst_amount?: number };
  total_amount_payable?: number;
  PRR_status?: string;
};

const initialPrrDetailsFromInvoice = (invoice: InvoiceRecord, requestedBy: string): PRRDetails => {
  const totalTax = Number(invoice.tax_details?.total_tax_amount || 0);
  const gross = Number(invoice.total_amount_payable || 0);
  const base = gross - totalTax;
  return {
    prrType: "Payment",
    requestingDepartment: invoice.purchase_order_details?.department || "",
    requestedBy,
    priority: "Normal",
    impact: "",
    payeeType: invoice.vendor_details?.vendor_id ? "Vendor" : "Other",
    vendorCode: invoice.vendor_details?.vendor_id || "",
    gstin: invoice.vendor_details?.gst_number || "",
    pan: "",
    bankAccount: "",
    paymentAgainst: invoice.purchase_order_details?.order_number ? "PO" : "Invoice",
    invoiceNumber: invoice.invoice_details?.invoice_number || "",
    invoiceDate: invoice.invoice_details?.invoice_date || "",
    costCentre: "",
    costAttribution: "",
    projectCluster: "",
    landSite: "",
    basicAmount: base,
    taxableAmount: base,
    cgst: Number(invoice.tax_details?.cgst_amount || 0),
    sgst: Number(invoice.tax_details?.sgst_amount || 0),
    igst: Number(invoice.tax_details?.igst_amount || 0),
    otherCharges: 0,
    grossInvoiceAmount: gross,
    advanceAdjusted: 0,
    noteAdjustment: 0,
    retentionAmount: 0,
    tdsDeduction: 0,
    otherDeduction: 0,
    netPayableAmount: gross,
    actualPayableAmount: gross,
    tdsApplicable: "No",
    tdsSection: "",
    tdsRate: 0,
    tdsBaseAmount: base,
    tdsAmount: 0,
    rcmApplicable: "No",
    accountingCostCentre: "",
    budgetLines: [],
    accountingNarration: "",
    paymentMode: "NEFT",
    paymentTerms: invoice.tax_details?.payment_terms || "",
    bankAccountFrom: "",
    paymentExtent: "Full Payment",
    requestedPaymentAmount: gross,
    supportingDocuments: [],
    requesterRemarks: "",
    accountsRemarks: "",
    preparedBy: "",
    approvedBy: "",
  };
};

type PaymentFlowRecord = {
  payment_id: string;
  vendor_name?: string;
  vendor_id?: string;
  order_number?: string;
  source_invoice_id?: string;
  admin_ops_approval_status?: string;
  director_approval_status?: string;
  admin_ops_signature?: string;
  director_signature?: string;
  prr_number?: string;
  payment_request_dict?: {
    payment?: { payment_amount?: number; actual_payable_amount?: number; remarks?: string };
    tds_tax_details?: { applicable?: boolean; section?: string; rate?: number; amount?: number };
  };
  created_at?: string;
  // Everything the Create PRR popup captured with no home in send_for_approval's own
  // admin_accounts_prr shape — stashed here by create_and_submit_prr, read back here so the
  // "Sent for Approval" preview can show the exact same document the popup did.
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

type PrrApiRecord = {
  prr_number?: string;
  header?: { prr_date?: string; prr_type?: string; requested_by?: string; requesting_department?: string; invoice_date?: string };
  party_details?: { vendor_id?: string; vendor_name?: string; vendor_code?: string; gstin?: string; pan?: string };
  reference_details?: { order_number?: string; grn?: string[]; wcc?: string[]; log_book?: string[] };
  amount_details?: { net_payable_amount?: number; actual_payable_amount?: number; remarks?: string };
  status?: string;
  supporting_document_details?: Array<{ document?: string; doc_link?: string }>;
};

type PrrRecord = {
  prr_number: string;
  status?: string;
  created_at?: string;
  header?: { prr_date?: string; invoice_date?: string };
  party_details?: { vendor_name?: string };
  amount_details?: { net_payable_amount?: number };
};

// Fallback department list offered even before any DEPARTMENT master records exist —
// merged with (and deduped against) the live Department Onboarding data at render time.
const DEFAULT_DEPARTMENTS = [
  "Accounts", "Finance", "Procurement", "Operations", "Production", "Quality Control",
  "Research & Development", "Sales & Marketing", "Supply Chain & Logistics",
  "Warehouse & Stores", "Projects", "Maintenance & Engineering", "HR", "Administration",
  "IT", "Legal & Compliance", "EHS (Safety & Environment)",
];

const money = (value?: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value) || 0);
const formatDate = (value?: string) => {
  if (!value) return "—";
  try { return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return value; }
};

// The actual PRR creation popup — rebuilt to match the old local Payments & Receipts PrrModal
// section-for-section (PRR Header / Party Details / Reference Details / Amount Details /
// TDS-Tax / Accounting / Payment Details / Supporting Documents / Remarks / Approval), with
// the exact same live document preview on the left. Submitting hits the real backend in one
// shot (create_and_submit_prr) instead of saving to localStorage — no separate Save Draft
// stage, per the locked-in one-shot flow.
function CreatePrrModal({ invoice, onClose, onSubmitted }: { invoice: InvoiceRecord; onClose: () => void; onSubmitted: () => void }) {
  const { user } = useAuth();
  const accountingDimensions = useAccountingDimensions();
  const [details, setDetails] = useState<PRRDetails>(() => initialPrrDetailsFromInvoice(invoice, user?.name || ""));
  const [prrDate, setPrrDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [party, setParty] = useState(invoice.vendor_details?.vendor_name || "");
  const [submitting, setSubmitting] = useState(false);
  const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");

  const update = <K extends keyof PRRDetails>(key: K, value: PRRDetails[K]) => setDetails((current) => ({ ...current, [key]: value }));
  const numberUpdate = (key: keyof PRRDetails, value: string) => update(key, (Number(value) || 0) as never);
  const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10 disabled:bg-slate-50 disabled:text-slate-500";
  const textareaClass = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium text-slate-800 outline-none focus:border-[#278b76] focus:ring-4 focus:ring-[#278b76]/10";
  const labelClass = "space-y-2 text-xs font-bold text-slate-600";
  const moneyField = (fieldLabel: string, key: keyof PRRDetails, readOnly = false) => (
    <label className={labelClass}>{fieldLabel}<div className="relative"><IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="number" min="0" step="0.01" readOnly={readOnly} className={`${inputClass} pl-9 ${readOnly ? "bg-slate-50" : ""}`} value={String(details[key] || "")} onChange={(event) => numberUpdate(key, event.target.value)} placeholder="0.00" /></div></label>
  );
  const section = (title: string, description: string, children: ReactNode) => (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-[#edf5f2] px-5 py-3"><h3 className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#0d5c4d]">{title}</h3><p className="mt-1 text-xs text-slate-500">{description}</p></div>
      <div className="grid gap-4 p-5 sm:grid-cols-2">{children}</div>
    </section>
  );

  const supportingDocs = invoice.purchase_order_details?.cupporting_documents ?? [];
  const poWoName = supportingDocs.find((doc) => ["PO", "WO", "CONTRACT"].includes(String(doc.document_type ?? "").toUpperCase()))?.document_number || invoice.purchase_order_details?.order_number || "Not linked";
  const completionName = supportingDocs.find((doc) => ["GRN", "WCC"].includes(String(doc.document_type ?? "").toUpperCase()))?.document_number || "Not linked";
  const taxInvoiceName = invoice.invoice_details?.invoice_number || "Not linked";

  // Cost Centre / Cost Attribution are no longer picked here — they're pulled straight from
  // the journal voucher that was actually posted for this invoice at Bill Inward → Ledger
  // Posting time (post_journal_voucher stores voucher.invoice_id, and every voucher line
  // carries the same voucher-level cost_centre/cost_attribution string). Locked read-only
  // below so the PRR can never disagree with what was actually posted to the ledger.
  const [ledgerLoaded, setLedgerLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch(`${baseUrl}/admin_accounts/get_journal_vouchers`, { headers: { Accept: "application/json" } });
        const payload = await response.json().catch(() => null);
        const vouchers: Array<{ invoice_id?: string; lines?: Array<{ cost_centre?: string; cost_attribution?: string }> }> = Array.isArray(payload?.data) ? payload.data : [];
        const voucher = vouchers.find((v) => v.invoice_id === invoice.invoice_id);
        const line = voucher?.lines?.find((l) => l.cost_centre || l.cost_attribution);
        if (!active) return;
        if (line) {
          setDetails((current) => ({ ...current, costCentre: line.cost_centre || "", accountingCostCentre: line.cost_centre || "", costAttribution: line.cost_attribution || "" }));
        }
      } catch {
        // best-effort — Cost Centre/Attribution just stay blank if the ledger lookup fails
      } finally {
        if (active) setLedgerLoaded(true);
      }
    })();
    return () => { active = false; };
  }, [invoice.invoice_id, baseUrl]);

  // Net payable auto-recalculated on every keystroke, same derivation as the old PrrModal:
  // gross - adjustments - retention - tds - other deduction, clamped at 0.
  useEffect(() => {
    const tds = details.tdsApplicable === "Yes" ? Number(details.tdsBaseAmount || 0) * Number(details.tdsRate || 0) / 100 : 0;
    const gross = Number(details.grossInvoiceAmount || 0);
    const net = Math.max(0, gross - Number(details.advanceAdjusted || 0) - Number(details.noteAdjustment || 0) - Number(details.retentionAmount || 0) - tds - Number(details.otherDeduction || 0));
    setDetails((current) => current.tdsAmount === tds && current.tdsDeduction === tds && current.netPayableAmount === net ? current : { ...current, tdsAmount: tds, tdsDeduction: tds, netPayableAmount: net, requestedPaymentAmount: current.paymentExtent === "Full Payment" ? net : Math.min(current.requestedPaymentAmount || 0, net) });
  }, [details.advanceAdjusted, details.grossInvoiceAmount, details.noteAdjustment, details.otherDeduction, details.paymentExtent, details.retentionAmount, details.tdsApplicable, details.tdsBaseAmount, details.tdsRate]);

  // Some invoices were created before the Bill Inward vendor-name-sync fix and still have a
  // permanently blank vendor_details.vendor_name — falls back to resolving it from the live
  // Vendor Master by vendor_id, same recipe as LedgerEntryModal's resolvedVendorName.
  useEffect(() => {
    if (party || !details.vendorCode) return;
    let cancelled = false;
    (async () => {
      try {
        const request = (method: "GET" | "POST") => fetch(`${baseUrl}/purchase_flow/get_vendors`, { method, headers: { Accept: "application/json" } });
        let response = await request("GET");
        if (response.status === 405) response = await request("POST");
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        const list: Array<Record<string, unknown>> = Array.isArray(payload?.vendors) ? payload.vendors : [];
        const match = list.find((item) => String(item.vendor_id ?? "").trim() === details.vendorCode);
        const name = match ? String(match.vendor_name ?? "").trim() : "";
        if (!cancelled && name) setParty(name);
      } catch {
        // best-effort — Vendor / Payee Name just stays whatever the invoice already carried
      }
    })();
    return () => { cancelled = true; };
  }, [party, details.vendorCode, baseUrl]);

  // Fills GSTIN/PAN from the live Vendor Master if the invoice itself didn't already carry them.
  useEffect(() => {
    let active = true;
    const vendorCode = details.vendorCode.trim();
    if (!vendorCode) return () => { active = false; };
    (async () => {
      try {
        const response = await fetch(`${baseUrl}/admin_accounts/get_vendor_details/${encodeURIComponent(vendorCode)}`, { headers: { Accept: "application/json" } });
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        const vendor = payload?.vendor_details ?? payload?.data?.vendor_details ?? payload?.data?.data?.vendor_details ?? {};
        if (!active) return;
        setDetails((current) => ({ ...current, gstin: current.gstin || String(vendor?.gst_number ?? vendor?.gstin ?? ""), pan: current.pan || String(vendor?.pan_number ?? vendor?.pan ?? "") }));
      } catch {
        // Invoice-linked vendor data remains available if the live Vendor Master is unreachable.
      }
    })();
    return () => { active = false; };
  }, [details.vendorCode, baseUrl]);

  // Budget line item picker — pick a budget, then a line item within it, then an amount.
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
  }, [baseUrl]);

  const fetchBudgetLineItems = useCallback(async (budgetId: string) => {
    if (budgetLineItemsCache[budgetId]) return budgetLineItemsCache[budgetId];
    setBudgetLineItemsLoading(true);
    try {
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
          return { line_item_id: hasRealId ? String(r.line_item_id) : `item_${i}`, category: String(r.category ?? "").trim(), line_item: String(r.line_item ?? "").trim() };
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
  }, [budgetLineItemsCache, baseUrl]);

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

  const submit = async () => {
    if (!user?.id || !user?.name) { toast.error("You must be logged in to submit a PRR."); return; }
    setSubmitting(true);
    try {
      const response = await fetch(`${baseUrl}/admin_accounts/create_and_submit_prr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          staff_id: user.id,
          name: user.name,
          designation: user.designation || "",
          prr_type: details.prrType,
          requesting_department: details.requestingDepartment,
          priority: details.priority,
          cost_centre: details.costCentre,
          cost_attribution: details.costAttribution,
          project_cluster: details.projectCluster,
          land_site: details.landSite,
          net_payable_amount: details.netPayableAmount || undefined,
          actual_payable_amount: details.actualPayableAmount || undefined,
          tds_applicable: details.tdsApplicable === "Yes",
          tds_section: details.tdsSection,
          tds_rate: details.tdsRate,
          tds_amount: details.tdsAmount,
          payment_mode: details.paymentMode,
          payment_terms: details.paymentTerms,
          requester_remarks: details.requesterRemarks,
          invoice_date: details.invoiceDate,
          prr_date: prrDate,
          impact: details.impact,
          payee_type: details.payeeType,
          pan: details.pan,
          basic_amount: details.basicAmount,
          taxable_amount: details.taxableAmount,
          cgst: details.cgst,
          sgst: details.sgst,
          igst: details.igst,
          other_charges: details.otherCharges,
          gross_invoice_amount: details.grossInvoiceAmount,
          advance_adjusted: details.advanceAdjusted,
          note_adjustment: details.noteAdjustment,
          retention_amount: details.retentionAmount,
          other_deduction: details.otherDeduction,
          rcm_applicable: details.rcmApplicable === "Yes",
          accounting_narration: details.accountingNarration,
          bank_account_from: details.bankAccountFrom,
          payment_extent: details.paymentExtent,
          requested_payment_amount: details.requestedPaymentAmount,
          accounts_remarks: details.accountsRemarks,
          due_date: dueDate,
          budget_lines: details.budgetLines,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.message || "Failed to create PRR");
      toast.success(result.prr_number ? `${result.prr_number} created and sent for approval` : "PRR created and sent for approval");
      onSubmitted();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create PRR");
    } finally {
      setSubmitting(false);
    }
  };

  const previewRecord: FinanceRecord = {
    id: invoice.invoice_id,
    module: "payments-receipts",
    tab: "Requests",
    entryType: "Payment Request / PRR",
    reference: "Assigned on submit",
    party,
    date: prrDate,
    dueDate,
    amount: details.requestedPaymentAmount || details.netPayableAmount,
    status: "Draft",
    notes: details.accountingNarration || details.requesterRemarks,
    poWoReference: invoice.purchase_order_details?.order_number || "",
    grnServiceReference: completionName,
    sourceBillInwardNo: invoice.invoice_id,
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="flex h-[95vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-3xl bg-[#f6f8fa] shadow-2xl">
        <div className="flex shrink-0 items-start justify-between bg-[#0d473f] px-7 py-5 text-white">
          <div><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/60">Payments & Receipts · Payment Request</p><h2 className="mt-1 text-2xl font-bold">Create Payment Request / PRR</h2><p className="mt-1 text-sm text-white/65">Complete the payable, accounting, tax and approval information.</p></div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-white/70 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid min-h-0 flex-1 lg:grid-cols-2">
          <div className="min-h-0 overflow-y-auto border-b border-slate-200 p-5 sm:p-6 lg:order-2 lg:border-b-0 lg:border-l">
            <div className="space-y-5">
              {section("PRR Header", "Request identity and priority.", <>
                <label className={labelClass}>PRR No.<input readOnly className={`${inputClass} bg-slate-50`} value="Assigned on submit" /></label>
                <label className={labelClass}>PRR Date<input required type="date" className={inputClass} value={prrDate} onChange={(event) => setPrrDate(event.target.value)} /></label>
                <label className={labelClass}>PRR Type<select className={inputClass} value={details.prrType} onChange={(event) => update("prrType", event.target.value)}>{["Payment", "Accounting", "Advance", "Reimbursement", "Statutory", "Salary"].map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className={labelClass}>Requesting Department<select className={inputClass} value={details.requestingDepartment} onChange={(event) => update("requestingDepartment", event.target.value)}><option value="">Select department</option>{Array.from(new Set([...DEFAULT_DEPARTMENTS, ...accountingDimensions.departments.map((item) => item.name)])).map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className={labelClass}>Requested By<input required className={inputClass} value={details.requestedBy} onChange={(event) => update("requestedBy", event.target.value)} placeholder="Employee name" /></label>
                <label className={labelClass}>Priority<select className={inputClass} value={details.priority} onChange={(event) => update("priority", event.target.value)}>{["Normal", "Urgent", "Critical"].map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className={`${labelClass} sm:col-span-2`}>Impact<input className={inputClass} value={details.impact} onChange={(event) => update("impact", event.target.value)} placeholder="Describe the business, operational or compliance impact" /></label>
              </>)}

              {section("Party Details", "Payee identity and settlement account.", <>
                <label className={labelClass}>Payee Type<select className={inputClass} value={details.payeeType} onChange={(event) => update("payeeType", event.target.value)}>{["Vendor", "Employee", "Government", "Other"].map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className={labelClass}>Vendor / Payee Name<input required className={inputClass} value={party} onChange={(event) => setParty(event.target.value)} placeholder="Search payee" /></label>
                <label className={labelClass}>Vendor Code<input readOnly className={`${inputClass} bg-slate-50`} value={details.vendorCode} placeholder="Auto from vendor" /></label>
                <label className={labelClass}>GSTIN<input readOnly className={`${inputClass} bg-slate-50`} value={details.gstin} placeholder="Auto from vendor" /></label>
                <label className={labelClass}>PAN<input className={inputClass} value={details.pan} onChange={(event) => update("pan", event.target.value.toUpperCase())} placeholder="Vendor PAN" /></label>
              </>)}

              {section("Reference Details", "Link the verified source bill and receiving documents.", <>
                <label className={labelClass}>Payment Against<select className={inputClass} value={details.paymentAgainst} onChange={(event) => update("paymentAgainst", event.target.value)}>{["Invoice", "PO", "WO", "Advance", "Expense", "Salary", "Statutory", "Other"].map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className={labelClass}>Bill Inward No.<input readOnly className={`${inputClass} bg-slate-50`} value={invoice.invoice_id} /></label>
                <label className={labelClass}>Invoice No.<input readOnly className={`${inputClass} bg-slate-50`} value={details.invoiceNumber} /></label>
                <label className={labelClass}>Invoice Date<input type="date" className={inputClass} value={details.invoiceDate} onChange={(event) => update("invoiceDate", event.target.value)} /></label>
                <label className={labelClass}>PO / WO No.<input readOnly className={`${inputClass} bg-slate-50`} value={poWoName} /></label>
                <label className={labelClass}>GRN / WCC / Service Entry<input readOnly className={`${inputClass} bg-slate-50`} value={completionName} /></label>
                <label className={labelClass}>Cost Centre<input readOnly className={`${inputClass} bg-slate-50`} value={details.costCentre || (ledgerLoaded ? "Not recorded on the posted ledger entry" : "Loading from ledger entry…")} /></label>
                <label className={labelClass}>Cost Attribution<input readOnly className={`${inputClass} bg-slate-50`} value={details.costAttribution || (ledgerLoaded ? "Not recorded on the posted ledger entry" : "Loading from ledger entry…")} /></label>
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
                <label className={labelClass}>Cost Centre<input readOnly className={`${inputClass} bg-slate-50`} value={details.accountingCostCentre || (ledgerLoaded ? "Not recorded on the posted ledger entry" : "Loading from ledger entry…")} /></label>
                <label className={labelClass}>Cost Attribution<input readOnly className={`${inputClass} bg-slate-50`} value={details.costAttribution || (ledgerLoaded ? "Not recorded on the posted ledger entry" : "Loading from ledger entry…")} /></label>

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
                            <td className="px-3 py-2 text-right font-bold text-slate-800">{money(line.amount)}</td>
                            <td className="w-8 px-2 text-center"><button type="button" onClick={() => removeBudgetLine(line.key)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button></td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50 font-bold">
                          <td className="px-3 py-2" colSpan={2}>Total</td>
                          <td className="px-3 py-2 text-right">{money(details.budgetLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0))}</td>
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
                <label className={labelClass}>Payment Due Date<input type="date" className={inputClass} value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
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
                <label className={labelClass}>Prepared By<input readOnly className={`${inputClass} bg-slate-50`} value="Stamped when sent for approval" /></label>
                <label className={labelClass}>Approved By<input readOnly className={`${inputClass} bg-slate-50`} value="Stamped on director approval" /></label>
                <label className={labelClass}>Status<select disabled className={inputClass} value="Draft"><option>Draft</option></select></label>
              </>)}
            </div>
          </div>
          <aside className="flex min-h-0 flex-col bg-[#eef3f7] p-4 sm:p-5 lg:order-1">
            <div className="mb-3 shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#0d5c4d]">Live PRR Preview</p>
              <p className="mt-1 text-xs text-slate-500">Updates automatically as the payment request is completed.</p>
            </div>
            <div className="min-h-[480px] flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-200/70 p-2">
              <DocumentFitFrame pageWidth={794}><PrrDocumentPreview record={previewRecord} details={details} taxInvoiceName={taxInvoiceName} poWoName={poWoName} completionName={completionName} /></DocumentFitFrame>
            </div>
          </aside>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-7 py-4">
          <p className="text-xs font-medium text-slate-400">Net payable: <span className="font-extrabold text-[#0d5c4d]">{money(details.netPayableAmount)}</span></p>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={submitting} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={submitting} className="h-11 rounded-xl bg-[#0d5c4d] px-6 text-sm font-bold text-white hover:bg-[#0a4b3f] disabled:opacity-60">{submitting ? "Submitting…" : "Send for Approval"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

type Tab = "Ready to Draft" | "Sent for Approval" | "PRR Register";
const TABS: Tab[] = ["Ready to Draft", "Sent for Approval", "PRR Register"];

export default function PRRModule() {
  const [tab, setTab] = useState<Tab>("Ready to Draft");
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [paymentFlows, setPaymentFlows] = useState<PaymentFlowRecord[]>([]);
  const [prrs, setPrrs] = useState<PrrRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingFor, setCreatingFor] = useState<InvoiceRecord | null>(null);
  const [viewingFlow, setViewingFlow] = useState<PaymentFlowRecord | null>(null);
  const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      fetch(`${baseUrl}/admin_accounts/get_invoices`).then((res) => res.json()).catch(() => null),
      fetch(`${baseUrl}/admin_accounts/get_payment_flow`).then((res) => res.json()).catch(() => null),
      fetch(`${baseUrl}/admin_accounts/get_all_prr`).then((res) => res.json()).catch(() => null),
    ]).then(([invoicesRes, flowsRes, prrRes]) => {
      setInvoices(invoicesRes?.success && Array.isArray(invoicesRes.data) ? invoicesRes.data : []);
      setPaymentFlows(Array.isArray(flowsRes?.data) ? flowsRes.data : []);
      setPrrs(prrRes?.success && Array.isArray(prrRes.data) ? prrRes.data : []);
    }).finally(() => setLoading(false));
  };

  useEffect(fetchAll, [baseUrl]);

  const readyToDraft = invoices.filter((invoice) => String(invoice.PRR_status ?? "").toLowerCase() === "pending");
  // "Sent for Approval" — payment flows that came out of this module's own create-and-submit
  // popup (source_invoice_id set) and are genuinely awaiting the director, not just drafted.
  const sentForApproval = paymentFlows.filter((flow) => flow.source_invoice_id && String(flow.director_approval_status ?? "").toLowerCase() === "pending");

  const statusBadge = (status?: string) => {
    const value = String(status ?? "").toLowerCase();
    if (value === "approved") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 className="h-3 w-3" />Approved</span>;
    if (value === "rejected") return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-700"><XCircle className="h-3 w-3" />Rejected</span>;
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700"><FileClock className="h-3 w-3" />{status || "Pending Director Approval"}</span>;
  };

  return (
    <div className="min-h-full bg-[#f6f8fa] p-5 lg:p-8">
      <div className="mx-auto max-w-[1400px] space-y-5">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#0d473f] text-white shadow-sm"><Receipt className="h-6 w-6" /></div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#18765f]">Finance & Accounts</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">PRR Module</h1>
              <p className="mt-1 text-sm text-slate-500">Bill Inward → ledger posted → create PRR → sent for approval → tracked in the PRR register.</p>
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={fetchAll} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"><RefreshCw className="h-4 w-4" />Refresh</button>
            <Link to="/director/prr-approval" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0d5c4d] px-4 text-xs font-bold text-white hover:bg-[#0a4a3f]"><FileCheck className="h-4 w-4" />Approval Inbox</Link>
          </div>
        </header>

        <nav className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {TABS.map((tabLabel) => {
            const count = tabLabel === "Ready to Draft" ? readyToDraft.length : tabLabel === "Sent for Approval" ? sentForApproval.length : prrs.length;
            return <button key={tabLabel} type="button" onClick={() => setTab(tabLabel)} className={`flex-1 rounded-lg px-3 py-2.5 text-xs font-bold ${tab === tabLabel ? "bg-[#0d5c4d] text-white" : "text-slate-500 hover:bg-slate-50"}`}>{tabLabel} <span className="opacity-70">({count})</span></button>;
          })}
        </nav>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {tab === "Ready to Draft" && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{["Bill Inward Number", "Order Number", "Vendor", "Amount", ""].map((column) => <th key={column} className="px-4 py-3 font-bold">{column}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {readyToDraft.map((invoice) => (
                    <tr key={invoice.invoice_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-bold text-[#0d5c4d]">{invoice.invoice_id}</td>
                      <td className="px-4 py-3 text-slate-500">{invoice.purchase_order_details?.order_number || "—"}</td>
                      <td className="px-4 py-3 text-slate-700">{invoice.vendor_details?.vendor_name || "—"}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{money(invoice.total_amount_payable)}</td>
                      <td className="px-4 py-3 text-right"><button type="button" onClick={() => setCreatingFor(invoice)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0d5c4d] px-3 py-2 text-xs font-bold text-white hover:bg-[#0a4a3f]"><Plus className="h-3.5 w-3.5" />Create PRR</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !readyToDraft.length && <div className="py-16 text-center"><FileClock className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">Nothing ready</p><p className="mt-1 text-xs text-slate-400">Bills show up here once their ledger entry is posted.</p></div>}
            </div>
          )}

          {tab === "Sent for Approval" && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{["PRR Number", "Vendor", "Order Number", "Amount", "Created"].map((column) => <th key={column} className="px-4 py-3 font-bold">{column}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {sentForApproval.map((flow) => (
                    <tr key={flow.payment_id} onClick={() => setViewingFlow(flow)} className="cursor-pointer hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-bold text-[#0d5c4d]">{flow.prr_number || "—"}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">{flow.vendor_name || "—"}</td>
                      <td className="px-4 py-3 text-slate-500">{flow.order_number || "—"}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{money(flow.payment_request_dict?.payment?.payment_amount)}</td>
                      <td className="px-4 py-3 text-slate-400">{formatDate(flow.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !sentForApproval.length && <div className="py-16 text-center"><FileClock className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">Nothing sent for approval yet</p></div>}
            </div>
          )}

          {tab === "PRR Register" && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{["PRR Number", "Vendor", "Amount", "Invoice Date", "PRR Date", "Status"].map((column) => <th key={column} className="px-4 py-3 font-bold">{column}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {prrs.map((prr) => (
                    <tr key={prr.prr_number} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-bold text-[#0d5c4d]">{prr.prr_number}</td>
                      <td className="px-4 py-3 text-slate-700">{prr.party_details?.vendor_name || "—"}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{money(prr.amount_details?.net_payable_amount)}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(prr.header?.invoice_date)}</td>
                      <td className="px-4 py-3 text-slate-400">{formatDate(prr.header?.prr_date || prr.created_at)}</td>
                      <td className="px-4 py-3">{statusBadge(prr.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !prrs.length && <div className="py-16 text-center"><Receipt className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No PRRs sent for approval yet</p></div>}
            </div>
          )}
        </section>
      </div>

      {creatingFor && <CreatePrrModal invoice={creatingFor} onClose={() => setCreatingFor(null)} onSubmitted={() => { fetchAll(); setTab("Sent for Approval"); }} />}
      {viewingFlow && <ViewPrrModal flow={viewingFlow} onClose={() => setViewingFlow(null)} />}
    </div>
  );
}

// Read-only look at the PRR that was actually sent — the exact same document (with the same
// "Initiated By" / "Authorised By" signature boxes) the director sees on the Approval Inbox,
// just without the approve/reject actions.
// Read-only look at the PRR that was actually sent — rendered through the exact same
// PrrDocumentPreview component (and DocumentFitFrame wrapper) the Create PRR popup's left
// panel uses, so this looks identical to the "Ready to Draft" preview, just no longer live.
function ViewPrrModal({ flow, onClose }: { flow: PaymentFlowRecord; onClose: () => void }) {
  const [prr, setPrr] = useState<PrrApiRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");

  useEffect(() => {
    let active = true;
    if (!flow.prr_number) { setLoading(false); return () => { active = false; }; }
    (async () => {
      try {
        const response = await fetch(`${baseUrl}/admin_accounts/get_prr/${encodeURIComponent(flow.prr_number!)}`, { headers: { Accept: "application/json" } });
        const payload = await response.json().catch(() => null);
        if (active && payload?.success && payload?.data) setPrr(payload.data);
      } catch {
        // best-effort — the preview still renders from the payment-flow fields alone
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [flow.prr_number, baseUrl]);

  const { details, record: previewRecord } = buildPrrPreviewFromPaymentFlow(flow, prr);
  const grnWcc = [...(prr?.reference_details?.grn ?? []), ...(prr?.reference_details?.wcc ?? [])].join(", ");

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="flex max-h-[96vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between bg-[#0d473f] px-6 py-4 text-white">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/60">PRR Module · Sent for Approval</p>
            <h2 className="mt-0.5 text-lg font-bold">{flow.prr_number || "PRR"} · {previewRecord.party || "Vendor"}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#eef3f7] p-4 sm:p-5">
          <div className="mb-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#0d5c4d]">PRR Preview</p>
            <p className="mt-1 text-xs text-slate-500">{loading ? "Loading the sent PRR…" : "The payment request as sent for director approval."}</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-200/70 p-2">
            <DocumentFitFrame pageWidth={794}><PrrDocumentPreview record={previewRecord} details={details} taxInvoiceName={details.invoiceNumber || "Not linked"} poWoName={previewRecord.poWoReference || "Not linked"} completionName={grnWcc || "Not linked"} /></DocumentFitFrame>
          </div>
        </div>
      </div>
    </div>
  );
}
