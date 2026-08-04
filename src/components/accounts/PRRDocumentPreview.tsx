import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { toast } from "sonner";
import getBaseUrl from "@/lib/config";
import logo3f from "@/Assets/3f-logo.png";

const safeStr = (v: unknown) => String(v ?? "").trim();
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDateShort = (raw?: string) => {
  const v = safeStr(raw);
  if (!v) return "—";
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return v;
  return new Intl.DateTimeFormat("en-IN", { year: "numeric", month: "short", day: "2-digit" }).format(d).replace(/ /g, "-");
};
const formatDateTimeLong = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", { year: "numeric", month: "long", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

const COMPANY_NAME = "SAI BIORESOURCES PRIVATE LIMITED";
const COMPANY_ADDRESS = "Khasra No. 121/1, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh – 491001";

// Narrower, self-contained shape (rather than importing AccountsPayments.tsx's InvoicePayment
// type) so this component stays decoupled — any object with this shape works, structurally.
export type PRRInvoiceData = {
  payment_id?: string;
  prr_number?: string;
  vendor_name?: string;
  vendor_id?: string;
  order_number?: string;
  created_at?: string;
  ledger_entry?: string;
  admin_ops_signature?: string;
  director_signature?: string;
  payment_request_dict?: {
    payment?: { payment_amount?: number; liability_before_payment?: number; liability_after_payment?: number; remarks?: string };
    linvestment_impact?: Record<string, unknown>;
    budget_impact?: Record<string, unknown>;
  };
};

export type PRRDocumentPreviewHandle = {
  print: () => void;
  downloadPdf: () => Promise<void>;
};

type VendorDetailsRecord = {
  vendor_name?: string;
  gst_number?: string;
  income_tax_pan?: string;
  vendor_address?: string;
};

type LedgerEntryRecord = { invoice_no?: string; date?: string };

// ── Small "label : value" particulars row, matching the printed PRR's key-value layout ──
const ParticularsRow = ({ label, value, isLast = false }: { label: string; value: ReactNode; isLast?: boolean }) => (
  <tr className={isLast ? "" : "border-b border-slate-200"}>
    <td className="w-60 bg-slate-50 px-3 py-2 align-top font-bold text-slate-600">{label}</td>
    <td className="w-4 px-1 py-2 align-top text-slate-400">:</td>
    <td className="px-3 py-2 font-semibold text-slate-800">{value}</td>
  </tr>
);

const PRRDocumentPreview = forwardRef<PRRDocumentPreviewHandle, { invoice: PRRInvoiceData }>(({ invoice }, ref) => {
  const contentRef = useRef<HTMLDivElement>(null);

  // Snapshot "now" once per mount — this is a live preview being generated/sent right now, not a
  // persisted timestamp (this app has no dedicated "PRR sent to accounts" field to read back).
  const [generatedAt] = useState(() => new Date());

  const [vendorDetails, setVendorDetails] = useState<VendorDetailsRecord | null>(null);
  useEffect(() => {
    const vendorId = safeStr(invoice.vendor_id);
    if (!vendorId) { setVendorDetails(null); return; }
    const ac = new AbortController();
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/admin_accounts/get_vendor_details/${encodeURIComponent(vendorId)}`, {
          headers: { Accept: "application/json" }, signal: ac.signal,
        });
        const data: { success?: boolean; data?: { vendor_details?: VendorDetailsRecord } } | null = await res.json().catch(() => null);
        if (res.ok && data?.success && data.data?.vendor_details) setVendorDetails(data.data.vendor_details);
      } catch {
        // best-effort
      }
    })();
    return () => ac.abort();
  }, [invoice.vendor_id]);

  const [ledgerEntry, setLedgerEntry] = useState<LedgerEntryRecord | null>(null);
  useEffect(() => {
    const entryId = safeStr(invoice.ledger_entry);
    if (!entryId) { setLedgerEntry(null); return; }
    const ac = new AbortController();
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/admin_accounts/get_accounts_ledger_entry/${encodeURIComponent(entryId)}`, {
          headers: { Accept: "application/json" }, signal: ac.signal,
        });
        const data: { success?: boolean; data?: LedgerEntryRecord } | null = await res.json().catch(() => null);
        if (res.ok && data?.success && data.data) setLedgerEntry(data.data);
      } catch {
        // best-effort
      }
    })();
    return () => ac.abort();
  }, [invoice.ledger_entry]);

  const budgetImpact = invoice.payment_request_dict?.budget_impact;
  const hasBudgetImpact = !!budgetImpact && typeof budgetImpact === "object" && Object.keys(budgetImpact).length > 0;

  const [budgetNames, setBudgetNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!hasBudgetImpact) return;
    const ac = new AbortController();
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/admin_accounts/get_budgets`, { headers: { Accept: "application/json" }, signal: ac.signal });
        const data: { success?: boolean; data?: { budget_id?: string; budget_name?: string }[] } | null = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          const map: Record<string, string> = {};
          (data.data ?? []).forEach((b) => { if (b.budget_id) map[b.budget_id] = safeStr(b.budget_name); });
          setBudgetNames(map);
        }
      } catch {
        // best-effort
      }
    })();
    return () => ac.abort();
  }, [hasBudgetImpact]);

  // "As Per Budget" column — the order's original allocated amount per line item, keyed the
  // same way BudgetImpactSection builds its rows (budgetId::category::lineItem).
  const [asPerBudget, setAsPerBudget] = useState<Record<string, number>>({});
  useEffect(() => {
    const orderNumber = safeStr(invoice.order_number);
    if (!hasBudgetImpact || !orderNumber) return;
    const ac = new AbortController();
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/admin_accounts/get_budget_allocated/${encodeURIComponent(orderNumber)}`, {
          headers: { Accept: "application/json" }, signal: ac.signal,
        });
        const data: { success?: boolean; data?: Record<string, { category?: string; line_item?: string; budgeted?: number }[]> } | null =
          await res.json().catch(() => null);
        if (res.ok && data?.success) {
          const map: Record<string, number> = {};
          Object.entries(data.data ?? {}).forEach(([budgetId, rows]) => {
            (rows ?? []).forEach((r) => {
              map[`${budgetId}::${safeStr(r.category)}::${safeStr(r.line_item)}`] = Number(r.budgeted) || 0;
            });
          });
          setAsPerBudget(map);
        }
      } catch {
        // best-effort
      }
    })();
    return () => ac.abort();
  }, [hasBudgetImpact, invoice.order_number]);

  const payment = invoice.payment_request_dict?.payment;
  const vendorDisplayName = safeStr(vendorDetails?.vendor_name) || safeStr(invoice.vendor_name) || "—";

  const investmentRows = useMemo(() => {
    const raw = invoice.payment_request_dict?.linvestment_impact as { entries?: Record<string, unknown> } | undefined;
    const entries = raw?.entries;
    if (!entries || typeof entries !== "object") return [];
    return Object.values(entries as Record<string, unknown>).map((v) => {
      const e = v as { land_owner?: string; investment_amount?: number };
      return { ownerName: safeStr(e.land_owner) || "Land Owner", amount: Number(e.investment_amount) || 0 };
    });
  }, [invoice.payment_request_dict?.linvestment_impact]);

  // This is exactly what Budget Impact records: how much of this payment is being taken from
  // which budget's line item. The line-items table mirrors that 1:1 — one row per line item,
  // with "Now Proposed" being the amount actually taken from it (not the invoice total).
  const budgetRows = useMemo(() => {
    if (!budgetImpact || typeof budgetImpact !== "object") return [];
    const rows: { budgetName: string; category: string; lineItem: string; asPerBudget?: number; amount: number }[] = [];
    Object.entries(budgetImpact as Record<string, unknown>).forEach(([budgetId, lineItems]) => {
      if (!lineItems || typeof lineItems !== "object") return;
      Object.values(lineItems as Record<string, unknown>).forEach((v) => {
        const e = v as { line_item_name?: string; category?: string; impact_amount?: number };
        const category = safeStr(e.category);
        const lineItem = safeStr(e.line_item_name);
        const amount = Number(e.impact_amount) || 0;
        if (amount <= 0) return; // nothing actually being taken from this line item — skip it
        rows.push({
          budgetName: budgetNames[budgetId] || budgetId,
          category,
          lineItem,
          asPerBudget: asPerBudget[`${budgetId}::${category}::${lineItem}`],
          amount,
        });
      });
    });
    return rows;
  }, [budgetImpact, budgetNames, asPerBudget]);

  const totalProposed = budgetRows.reduce((s, r) => s + r.amount, 0);

  const hasNothing = !payment && investmentRows.length === 0 && budgetRows.length === 0;

  const particulars: [string, ReactNode][] = [
    ["PRR No.", safeStr(invoice.prr_number) || "Pending Director Approval"],
    ["Date of PRR", formatDateShort(invoice.created_at)],
    ["PRR sent to Accounts", formatDateTimeLong(generatedAt)],
    ["Company / Project", COMPANY_NAME],
    ["Name of the Payee & Place", vendorDisplayName],
    ["Payable To", vendorDisplayName],
    ["Mode of Payment & Payable At", "—"],
    ["Nature of Payment", "Vendor Payment"],
    ["Reference NO (PO/LO/BL/LS)", safeStr(invoice.order_number) || "—"],
    ["Due Date", "—"],
  ];

  useImperativeHandle(ref, () => ({
    print: () => window.print(),
    // Snapshots the actual rendered card (same node the on-screen popup shows) rather than
    // rebuilding the document from primitives — guarantees the PDF looks like what's on screen
    // instead of drifting out of sync with it. Mirrors GrnStickerPrint.tsx's html2canvas+jsPDF
    // recipe, just paginated across as many A4 pages as the content needs.
    downloadPdf: async () => {
      const el = contentRef.current;
      if (!el) return;
      try {
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
        const imgData = canvas.toDataURL("image/png");

        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        let heightLeft = imgHeight;
        let position = 0;
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        while (heightLeft > 0) {
          position -= pageHeight;
          pdf.addPage();
          pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }

        pdf.save(`PRR_${safeStr(invoice.prr_number).replace(/[/\\]/g, "-") || safeStr(invoice.payment_id) || "draft"}.pdf`);
      } catch {
        toast.error("Failed to generate the PDF");
      }
    },
  }));

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .prr-print-area, .prr-print-area * { visibility: visible; }
          .prr-print-area { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      <section ref={contentRef} className="prr-print-area relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <span className="absolute right-6 top-6 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
          FOR PAYMENT
        </span>

        <div className="text-center">
          <img src={logo3f} alt="3F Logo" className="mx-auto h-10 w-auto" />
          <h1 className="mt-1 text-xl font-extrabold tracking-wide text-slate-900">{COMPANY_NAME}</h1>
          <p className="mt-0.5 text-xs text-slate-500">{COMPANY_ADDRESS}</p>
          <h2 className="mt-3 text-base font-extrabold uppercase tracking-wide text-slate-900">Payment Release Request Receipt</h2>
        </div>

        <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-xs">
            <tbody>
              {particulars.map(([label, value], i) => (
                <ParticularsRow key={label} label={label} value={value} isLast={i === particulars.length - 1} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="w-10 px-3 py-2 text-left font-semibold">S.No.</th>
                <th className="px-3 py-2 text-left font-semibold">Line Item (Budget Impact)</th>
                <th className="px-3 py-2 text-right font-semibold">As Per Budget (₹)</th>
                <th className="px-3 py-2 text-right font-semibold">Spent till Date (₹)</th>
                <th className="px-3 py-2 text-right font-semibold">Now Proposed (₹)</th>
              </tr>
            </thead>
            <tbody>
              {budgetRows.map((r, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-3 py-2 align-top text-slate-500">{i + 1}.</td>
                  <td className="px-3 py-2 align-top text-slate-700">
                    <div className="font-semibold text-slate-800">{r.lineItem || "—"}</div>
                    <div className="text-[10px] text-slate-400">{r.budgetName}{r.category ? ` · ${r.category}` : ""}</div>
                  </td>
                  <td className="px-3 py-2 text-right align-top text-slate-600">{r.asPerBudget !== undefined ? inr(r.asPerBudget) : "—"}</td>
                  <td className="px-3 py-2 text-right align-top text-slate-400">—</td>
                  <td className="px-3 py-2 text-right align-top font-semibold text-slate-800">{inr(r.amount)}</td>
                </tr>
              ))}
              {budgetRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                    No budget impact recorded for this payment yet.
                  </td>
                </tr>
              )}
              <tr className="border-t-2 border-slate-400 bg-slate-50 font-bold">
                <td className="px-3 py-2" colSpan={4}>Total</td>
                <td className="px-3 py-2 text-right">{inr(totalProposed)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 text-left">Sl No.</th>
                <th className="px-3 py-2 text-left">Bill No</th>
                <th className="px-3 py-2 text-left">Bill Date</th>
                <th className="px-3 py-2 text-left">PO / WO No.</th>
                <th className="px-3 py-2 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-2 font-semibold text-slate-700">1 of 1</td>
                <td className="px-3 py-2 text-slate-700">{safeStr(ledgerEntry?.invoice_no) || "—"}</td>
                <td className="px-3 py-2 text-slate-700">{ledgerEntry?.date ? formatDateShort(ledgerEntry.date) : "—"}</td>
                <td className="px-3 py-2 text-slate-700">{safeStr(invoice.order_number) || "—"}</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-800">{inr(Number(payment?.payment_amount) || 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-xs text-slate-700">
          <p><span className="font-bold">Any other Information:</span> {safeStr(payment?.remarks) || "—"}</p>
          <p className="mt-1 text-slate-500">WO No.: {safeStr(invoice.order_number) || "—"}</p>
        </div>

        <div className="mt-4 grid grid-cols-1 overflow-hidden rounded-lg border border-slate-200 sm:grid-cols-3">
          <div className="border-b border-slate-200 p-3 text-xs text-slate-400 sm:border-b-0 sm:border-r">Remarks:</div>
          <div className="flex flex-col items-center justify-end gap-1.5 border-b border-slate-200 p-3 sm:border-b-0 sm:border-r">
            {invoice.admin_ops_signature ? (
              <span className="inline-block rounded border border-gray-400 px-2 py-1 text-[10px] leading-tight">
                {invoice.admin_ops_signature}
              </span>
            ) : (
              <p className="text-sm font-semibold text-slate-400">—</p>
            )}
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Initiated By</p>
          </div>
          <div className="flex flex-col items-center justify-end gap-1.5 p-3">
            {invoice.director_signature ? (
              <span className="inline-block rounded border border-gray-400 px-2 py-1 text-[10px] leading-tight">
                {invoice.director_signature}
              </span>
            ) : (
              <p className="text-sm font-semibold text-slate-400">Pending</p>
            )}
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Authorised By</p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 p-3 text-xs">
          <p className="font-bold text-slate-700">Date received by Accounts</p>
          <p className="mt-0.5 text-slate-400">Pending</p>
        </div>

        {hasNothing && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-700">
            No payment request saved yet for this invoice — save a Payment Request first to populate the PRR.
          </div>
        )}
      </section>
    </>
  );
});

PRRDocumentPreview.displayName = "PRRDocumentPreview";

export default PRRDocumentPreview;
