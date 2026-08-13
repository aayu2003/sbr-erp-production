import { useEffect, useMemo, useState } from 'react';
import { Clock3, Download, Eye, IndianRupee, MessageCircleQuestion, Printer, Search, Send, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MakePurchaseOrderPopup } from '@/components/ho-inbox/MakePurchaseOrderPopup';
import { type ComparativeModel } from '@/components/purchase/ComparativeStatementPreview';
import getBaseUrl from '@/lib/config';
import { formatDateDDMMYYYY } from '@/lib/dateFormat';
import { downloadPoRegisterAsPdf, printPoRegisterAsPdf, type PoRegisterPdfRow } from '@/lib/poRegisterPdf';
import {
  PO_APPROVALS_CHANGED_EVENT,
  markPoRevisedForApproval,
  readPoApprovals,
  replyToPoApprovalQuestion,
  saveCreatedPoForApproval,
  sendPoForFinanceApproval,
  type PoApprovalRecord,
} from '@/lib/poApprovalStore';
import { readUserProfile } from '@/lib/signatureDiary';

const safe = (value: unknown) => String(value ?? '').trim();
const numberOrZero = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(safe(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

const comparativeStatementNumber = (record: any, index: number) => {
  const existing = safe(record?.comparison_no);
  if (/^SBRPL\/CS\/\d{3,}$/i.test(existing)) return existing.toUpperCase();

  return `SBRPL/CS/${String(index + 1).padStart(3, '0')}`;
};

const approvedVendorName = (record: ComparativeModel) => {
  const selectedVendorId = safe(record.hoSelectedVendorId);
  if (!selectedVendorId) return 'Not recorded';

  return record.vendors?.find((vendor) =>
    [vendor.id, vendor.directoryVendorId].some((id) => safe(id) === selectedVendorId),
  )?.name || selectedVendorId;
};

const totalForApprovedVendor = (record: ComparativeModel) => {
  const vendorId = safe(record.hoSelectedVendorId);
  if (!vendorId) return 0;

  const quote = record.quotes?.find((entry) => safe(entry.vendorId) === vendorId);
  const unitRates = quote?.unitRateByItemId || {};
  const itemsTotal = (record.items || []).reduce((sum, item) => {
    const base = numberOrZero(unitRates[item.id]) * numberOrZero(item.qty);
    return sum + base + (base * numberOrZero(item.gstPercent)) / 100;
  }, 0);

  return itemsTotal
    + numberOrZero(record.freightCharges?.[vendorId])
    + numberOrZero(record.otherCharges?.[vendorId]);
};

const mapNfaToComparative = (record: any, index: number): ComparativeModel | null => {
  const indentId = safe(record?.pr_number);
  if (!indentId) return null;

  const rows = Array.isArray(record?.item_row) ? record.item_row : [];
  const items = rows.map((row: any, index: number) => ({
    id: `po-item-${index + 1}`,
    srNo: index + 1,
    partName: safe(row?.item_name) || 'Item not recorded',
    uom: safe(row?.UoM ?? row?.uom),
    qty: numberOrZero(row?.quantity),
    gstPercent: numberOrZero(row?.gst_percentage),
  }));

  const approvedVendorId = safe(
    record?.approved_vendor_id ?? record?.approved_vendor?.vendor_id ?? record?.approved_vendor?.vendorId,
  );
  const quoters = Array.isArray(record?.quoters) ? record.quoters : [];
  const vendors = quoters
    .map((quote: any) => {
      const id = safe(quote?.vendor_id);
      return id ? { id, name: safe(quote?.vendor_name) || id, directoryVendorId: id } : null;
    })
    .filter(Boolean) as NonNullable<ComparativeModel['vendors']>;
  if (approvedVendorId && !vendors.some((vendor) => vendor.id === approvedVendorId)) {
    vendors.push({
      id: approvedVendorId,
      name: safe(record?.approved_vendor_name ?? record?.approved_vendor?.vendor_name) || approvedVendorId,
      directoryVendorId: approvedVendorId,
    });
  }

  const quotes = quoters
    .map((quote: any) => {
      const vendorId = safe(quote?.vendor_id);
      if (!vendorId) return null;
      const itemCosting = quote?.item_costing && typeof quote.item_costing === 'object' ? quote.item_costing : {};
      const unitRateByItemId: Record<string, number> = {};
      items.forEach((item, index) => {
        const sourceRow = rows[index];
        const byName = itemCosting[safe(sourceRow?.item_name)];
        unitRateByItemId[item.id] = numberOrZero(byName?.per_unit_costing ?? sourceRow?.rate);
      });
      return { vendorId, unitRateByItemId };
    })
    .filter(Boolean) as NonNullable<ComparativeModel['quotes']>;

  return {
    indentId,
    comparisonId: safe(record?.comparison_id ?? record?.comparision_id) || undefined,
    comparisonNo: comparativeStatementNumber(record, index),
    indentDate: safe(record?.created_at) || undefined,
    department: safe(record?.department) || undefined,
    projectCluster: safe(record?.project ?? record?.project_cluster) || undefined,
    requirementType: 'Goods',
    comparisonBasis: 'Landed Cost',
    vendors,
    items,
    quotes,
    freightCharges: Object.fromEntries(quoters.map((quote: any) => [safe(quote?.vendor_id), numberOrZero(quote?.freight_charges)])),
    otherCharges: Object.fromEntries(quoters.map((quote: any) => [safe(quote?.vendor_id), numberOrZero(quote?.other_charges)])),
    paymentTerms: Object.fromEntries(quoters.map((quote: any) => [safe(quote?.vendor_id), safe(quote?.payment_terms)])),
    deliveryTimeline: Object.fromEntries(quoters.map((quote: any) => [safe(quote?.vendor_id), safe(quote?.delivery_time)])),
    warranty: Object.fromEntries(quoters.map((quote: any) => [safe(quote?.vendor_id), safe(quote?.warrenty_garantee)])),
    hoSelectedVendorId: approvedVendorId || undefined,
    tcApprovedVendorId: approvedVendorId || undefined,
    tcStatus: safe(record?.TC_status ?? record?.tc_status) || undefined,
    nfaStatus: safe(record?.NFA_status ?? record?.nfa_status) || undefined,
    indent_type: safe(record?.indent_type).toUpperCase() || 'PR',
    isDraft: false,
  };
};

export default function POCreation() {
  const [records, setRecords] = useState<ComparativeModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ComparativeModel | null>(null);
  const [selectedReviewOnly, setSelectedReviewOnly] = useState(false);
  const [createdOrders, setCreatedOrders] = useState<Record<string, string>>({});
  const [poApprovalRecords, setPoApprovalRecords] = useState<PoApprovalRecord[]>(() => readPoApprovals());
  const [approvalPrompt, setApprovalPrompt] = useState<PoApprovalRecord | null>(null);
  const [questionReplyRecord, setQuestionReplyRecord] = useState<PoApprovalRecord | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfPrinting, setPdfPrinting] = useState(false);

  useEffect(() => {
    const refreshPoState = () => {
      const approvals = readPoApprovals();
      setPoApprovalRecords(approvals);
      const ordersByPr: Record<string, string> = {};
      approvals.forEach((record) => {
        if (record.prNumber && !ordersByPr[record.prNumber]) ordersByPr[record.prNumber] = record.poNumber;
      });
      setCreatedOrders(ordersByPr);
      setQuestionReplyRecord((current) => current
        ? approvals.find((record) => record.poNumber === current.poNumber) || null
        : null);
    };
    refreshPoState();
    window.addEventListener(PO_APPROVALS_CHANGED_EVENT, refreshPoState);
    window.addEventListener('storage', refreshPoState);
    return () => {
      window.removeEventListener(PO_APPROVALS_CHANGED_EVENT, refreshPoState);
      window.removeEventListener('storage', refreshPoState);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      try {
        const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
        if (!baseUrl) throw new Error('Missing API base URL');
        const response = await fetch(`${baseUrl}/purchase_flow/get_NFA`, { signal: controller.signal });
        const text = await response.text().catch(() => '');
        if (!response.ok) throw new Error(text || `HTTP ${response.status}`);
        const payload = text ? JSON.parse(text) : [];
        const list = Array.isArray(payload) ? payload : Array.isArray(payload?.nfa) ? payload.nfa : [];
        setRecords(list.map(mapNfaToComparative).filter(Boolean) as ComparativeModel[]);
      } catch (error: any) {
        if (error?.name !== 'AbortError') toast.error(`Failed to load NFA-approved statements: ${safe(error?.message) || 'Unknown error'}`);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  const approvedRecords = useMemo(
    () => records.filter((record) => safe(record.nfaStatus).toLowerCase() === 'approved' && safe(record.indent_type).toUpperCase() !== 'SPR'),
    [records],
  );

  const filteredRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return approvedRecords;
    return approvedRecords.filter((record) => [
      record.comparisonNo,
      record.comparisonId,
      record.indentId,
      record.hoSelectedVendorId,
      approvedVendorName(record),
      ...(record.items || []).map((item) => item.partName),
    ].some((value) => safe(value).toLowerCase().includes(needle)));
  }, [approvedRecords, query]);

  const totalPoValue = approvedRecords.reduce((sum, record) =>
    createdOrders[record.indentId] ? sum + totalForApprovedVendor(record) : sum,
  0);

  const selectedApprovalRecord = useMemo(() => {
    if (!selected) return null;
    const mappedPoNumber = createdOrders[selected.indentId];
    return poApprovalRecords.find((record) => record.prNumber === selected.indentId && (!mappedPoNumber || record.poNumber === mappedPoNumber))
      || poApprovalRecords.find((record) => record.prNumber === selected.indentId && record.status === 'approved')
      || null;
  }, [selected, createdOrders, poApprovalRecords]);

  const registerPdfRows = (): PoRegisterPdfRow[] => filteredRecords.map((record) => {
    const orderNo = createdOrders[record.indentId];
    const approvalRecord = poApprovalRecords.find((entry) =>
      entry.prNumber === record.indentId && (!orderNo || entry.poNumber === orderNo),
    );
    const status = !orderNo
      ? 'NFA Approved'
      : approvalRecord?.status === 'approved'
        ? 'PO Approved'
        : approvalRecord?.status === 'rejected'
          ? 'PO Rejected'
          : approvalRecord?.status === 'pending'
            ? 'Pending Approval'
            : approvalRecord?.revisionNo
              ? `Amendment ${approvalRecord.revisionNo} Draft`
              : 'PO Created';
    return {
      comparativeNo: record.comparisonNo || record.comparisonId || 'Not recorded',
      prNumber: record.indentId,
      poNumber: approvalRecord?.poNumber || orderNo || 'Not created',
      approvedVendor: approvedVendorName(record),
      itemDetails: (record.items || []).map((item) => item.partName || 'Item not recorded'),
      uoms: (record.items || []).map((item) => item.uom || '-'),
      quantities: (record.items || []).map((item) => numberOrZero(item.qty)),
      status,
      poValue: orderNo ? totalForApprovedVendor(record) : 0,
      statementDate: record.indentDate,
    };
  });

  const registerPdfOptions = () => ({
    generatedBy: readUserProfile().name?.trim() || 'System User',
  });

  const downloadRegisterPdf = async () => {
    setPdfDownloading(true);
    try {
      await downloadPoRegisterAsPdf(registerPdfRows(), registerPdfOptions());
      toast.success('PO Register PDF downloaded');
    } catch (error: any) {
      toast.error(`Failed to generate PO Register PDF: ${safe(error?.message) || 'Unknown error'}`);
    } finally {
      setPdfDownloading(false);
    }
  };

  const printRegisterPdf = async () => {
    setPdfPrinting(true);
    try {
      await printPoRegisterAsPdf(registerPdfRows(), registerPdfOptions());
    } catch (error: any) {
      toast.error(`Failed to print PO Register PDF: ${safe(error?.message) || 'Unknown error'}`);
    } finally {
      setPdfPrinting(false);
    }
  };

  return (
    <div className="min-h-screen space-y-6 bg-slate-50/70 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0D3A35] text-white shadow-lg">
            <ShoppingCart className="h-7 w-7" />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0D3A35]">Procurement · Purchase Order</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">PO Creation</h1>
            <p className="mt-1 text-sm text-slate-500">Create purchase orders from NFA-approved vendor comparative statements.</p>
          </div>
        </div>
        <div className="flex self-start gap-2 lg:self-auto">
          <Button
            type="button"
            variant="outline"
            onClick={() => void printRegisterPdf()}
            disabled={pdfPrinting}
            className="h-11 gap-2 rounded-xl border-[#0D3A35]/20 bg-white px-4 font-bold text-[#0D3A35] shadow-sm hover:bg-[#0D3A35]/5"
          >
            <Printer className="h-4 w-4" /> {pdfPrinting ? 'Preparing Print...' : 'Print PO Register'}
          </Button>
          <Button
            type="button"
            onClick={() => void downloadRegisterPdf()}
            disabled={pdfDownloading}
            className="h-11 gap-2 rounded-xl bg-[#0D3A35] px-4 font-bold text-white shadow-sm hover:bg-[#092e2a]"
          >
            <Download className="h-4 w-4" /> {pdfDownloading ? 'Generating PDF...' : 'Download PDF'}
          </Button>
        </div>
      </header>

      <section className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid-cols-2">
        {[
          {
            label: 'Total PO Value',
            value: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(totalPoValue),
            icon: IndianRupee,
          },
          { label: "No. Of PO's Created", value: Object.keys(createdOrders).length, icon: ShoppingCart },
        ].map(({ label, value, icon: Icon }, index) => (
          <div key={label} className={`flex items-center justify-between px-5 py-5 ${index ? 'border-t border-slate-200 sm:border-l sm:border-t-0' : ''}`}>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></div>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf5f2] text-[#0D3A35]"><Icon className="h-5 w-5" /></span>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="font-bold text-slate-900">Approved Statement Register</h2><p className="mt-0.5 text-xs text-slate-500">Only NFA-approved records are eligible for PO creation.</p></div>
          <label className="relative block w-full lg:w-[380px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search comparison, PR, vendor or item" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none focus:border-[#0D3A35] focus:bg-white" />
          </label>
        </div>

        <div className="w-full overflow-hidden">
          <table className="w-full table-fixed border-collapse">
            <thead className="bg-[#0D3A35] text-white">
              <tr className="text-center text-[10px] uppercase tracking-[0.05em]">
                <th className="w-[13%] px-2 py-2.5">Comparative Statement No.</th>
                <th className="w-[10%] px-2 py-2.5">PR Number</th>
                <th className="w-[11%] px-2 py-2.5">PO Number</th>
                <th className="w-[12%] px-2 py-2.5">Approved Vendor</th>
                <th className="w-[14%] px-2 py-2.5">Item Details</th>
                <th className="w-[5%] px-1 py-2.5">UoM</th>
                <th className="w-[5%] px-1 py-2.5">Qty.</th>
                <th className="w-[9%] px-2 py-2.5">Status</th>
                <th className="w-[21%] px-2 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={9} className="px-6 py-16 text-center text-sm text-slate-500"><Clock3 className="mx-auto mb-3 h-7 w-7 animate-pulse" />Loading approved statements…</td></tr>
              ) : filteredRecords.length === 0 ? (
                <tr><td colSpan={9} className="px-6 py-16 text-center text-sm text-slate-500">No NFA-approved statements found.</td></tr>
              ) : filteredRecords.map((record) => {
                const orderNo = createdOrders[record.indentId];
                const approvalRecord = poApprovalRecords.find((entry) => entry.prNumber === record.indentId && (!orderNo || entry.poNumber === orderNo));
                const unansweredQuestions = approvalRecord?.questions?.filter((question) => !question.reply?.trim()).length || 0;
                const statusLabel = !orderNo
                  ? 'NFA Approved'
                  : approvalRecord?.status === 'approved'
                    ? 'PO Approved'
                    : approvalRecord?.status === 'rejected'
                      ? 'PO Rejected'
                      : approvalRecord?.status === 'pending'
                        ? 'Pending Approval'
                        : approvalRecord?.revisionNo
                          ? `Amendment ${approvalRecord.revisionNo} Draft`
                          : 'PO Created';
                return (
                  <tr key={record.indentId} className="align-middle text-xs text-slate-700 hover:bg-[#f7faf9]">
                    <td className="break-words px-2 py-3 text-center font-mono text-[11px] font-bold leading-4 text-[#0D3A35]">{record.comparisonNo || record.comparisonId || 'Not recorded'}</td>
                    <td className="break-words px-2 py-3 text-center font-mono text-[11px] font-semibold leading-4">{record.indentId}</td>
                    <td className="break-words px-2 py-3 text-center font-mono text-[11px] font-bold leading-4 text-[#0D3A35]">{approvalRecord?.poNumber || orderNo || 'Not created'}</td>
                    <td className="break-words px-2 py-3 text-center font-semibold leading-4">{approvedVendorName(record)}</td>
                    <td className="space-y-0.5 px-2 py-3">{(record.items || []).map((item) => <div key={item.id} className="truncate font-semibold">{item.partName}</div>)}</td>
                    <td className="space-y-0.5 px-1 py-3 text-center">{(record.items || []).map((item) => <div key={item.id}>{item.uom || '—'}</div>)}</td>
                    <td className="space-y-0.5 px-1 py-3 text-center font-semibold tabular-nums">{(record.items || []).map((item) => <div key={item.id}>{new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(item.qty)}</div>)}</td>
                    <td className="px-2 py-3 text-center"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold leading-4 ${approvalRecord?.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : approvalRecord?.status === 'rejected' ? 'bg-red-50 text-red-700' : orderNo ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>{statusLabel}</span></td>
                    <td className="px-2 py-3 text-center">
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        {approvalRecord?.status === 'approved' ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-8 gap-1 border-[#0D3A35]/20 px-2 text-xs text-[#0D3A35] hover:bg-[#0D3A35]/5"
                              onClick={() => { setSelectedReviewOnly(true); setSelected(record); }}
                            >
                              <Eye className="h-4 w-4" /> View PO
                            </Button>
                            <Button
                              type="button"
                              className="h-8 bg-[#0D3A35] px-2 text-xs text-white hover:bg-[#092e2a]"
                              onClick={() => { setSelectedReviewOnly(false); setSelected(record); }}
                            >
                              Revise PO
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            onClick={() => { setSelectedReviewOnly(false); setSelected(record); }}
                            className="h-8 bg-[#0D3A35] px-2 text-xs text-white hover:bg-[#092e2a]"
                          >
                            {orderNo ? 'View / Edit PO' : 'Create PO'}
                          </Button>
                        )}
                        {approvalRecord && (approvalRecord.questions?.length || 0) > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title="View and reply to approval questions"
                            className="relative h-8 w-8 rounded-lg border-amber-200 text-amber-700 hover:bg-amber-50"
                            onClick={() => { setQuestionReplyRecord(approvalRecord); setReplyDrafts({}); }}
                          >
                            <MessageCircleQuestion className="h-4 w-4" />
                            {unansweredQuestions > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">{unansweredQuestions}</span>}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <MakePurchaseOrderPopup
        open={Boolean(selected)}
        comparative={selected}
        vendorId={selected?.hoSelectedVendorId}
        poNumber={selectedApprovalRecord?.poNumber || (selected ? createdOrders[selected.indentId] : undefined)}
        amendmentNumber={selectedApprovalRecord ? (selectedReviewOnly ? (selectedApprovalRecord.revisionNo || 0) : (selectedApprovalRecord.revisionNo || 0) + 1) : 0}
        reviewOnly={selectedReviewOnly}
        documentStatus={selectedReviewOnly ? 'approved' : 'draft'}
        revisionMode={Boolean(!selectedReviewOnly && selectedApprovalRecord?.status === 'approved')}
        onClose={() => { setSelected(null); setSelectedReviewOnly(false); }}
        onConfirm={({ indentId, poNo }) => {
          setCreatedOrders((current) => ({ ...current, [indentId]: poNo }));
          const source = selected;
          const previousApproval = poApprovalRecords.find((record) => record.prNumber === indentId && record.poNumber === poNo)
            || poApprovalRecords.find((record) => record.prNumber === indentId && record.status === 'approved');
          const approvedVendorId = safe(source?.hoSelectedVendorId);
          const vendorName = source?.vendors?.find((vendor) => safe(vendor.id) === approvedVendorId)?.name || approvedVendorId;
          const savedApprovalRecord = saveCreatedPoForApproval({
            poNumber: poNo,
            orderType: 'PR',
            prNumber: indentId,
            comparisonId: safe(source?.comparisonId),
            vendorId: approvedVendorId,
            vendorName,
            itemDetails: (source?.items || []).map((item) => ({
              name: safe(item.partName) || 'Item not recorded',
              uom: safe(item.uom),
              quantity: numberOrZero(item.qty),
            })),
            createdAt: new Date().toISOString(),
          });
          const approvalRecord = previousApproval?.status === 'approved'
            ? markPoRevisedForApproval(poNo) || savedApprovalRecord
            : savedApprovalRecord;
          setSelected(null);
          setSelectedReviewOnly(false);
          setApprovalPrompt(approvalRecord);
          toast.success(previousApproval?.status === 'approved' ? `Purchase Order ${poNo} revised` : `Purchase Order ${poNo} created`);
        }}
      />

      <Dialog open={Boolean(questionReplyRecord)} onOpenChange={(open) => { if (!open) { setQuestionReplyRecord(null); setReplyDrafts({}); } }}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-hidden rounded-2xl border-0 p-0 shadow-2xl">
          <DialogHeader className="bg-[#0D3A35] px-6 py-5 text-left text-white">
            <DialogTitle className="flex items-center gap-3 text-xl font-bold text-white">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"><MessageCircleQuestion className="h-5 w-5" /></span>
              Approval Questions
            </DialogTitle>
            <p className="pl-[52px] text-sm text-white/70">PO {questionReplyRecord?.poNumber || '—'} · Reply to Admin Ops Finance</p>
          </DialogHeader>
          <div className="max-h-[calc(88vh-150px)] space-y-4 overflow-y-auto px-6 py-5">
            {questionReplyRecord?.questions?.map((question, index) => (
              <section key={question.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Question {index + 1}</p>
                      <p className="mt-1 text-sm font-semibold leading-6 text-slate-900">{question.question}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${question.reply ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{question.reply ? 'Replied' : 'Reply Required'}</span>
                  </div>
                  <p className="mt-2 text-[11px] font-medium text-slate-500">Raised by {question.askedBy} · {formatDateDDMMYYYY(question.askedAt)}</p>
                </div>
                {question.reply ? (
                  <div className="bg-emerald-50/50 px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-emerald-700">Reply</p>
                    <p className="mt-1 text-sm font-medium leading-6 text-slate-800">{question.reply}</p>
                    <p className="mt-2 text-[11px] font-medium text-slate-500">{question.repliedBy} · {question.repliedAt ? formatDateDDMMYYYY(question.repliedAt) : ''}</p>
                  </div>
                ) : (
                  <div className="space-y-3 px-4 py-4">
                    <Textarea
                      value={replyDrafts[question.id] || ''}
                      onChange={(event) => setReplyDrafts((current) => ({ ...current, [question.id]: event.target.value }))}
                      placeholder="Enter your reply or clarification"
                      className="min-h-24 resize-y rounded-xl border-slate-200 bg-[#fbfaf7] text-sm focus-visible:ring-[#0D3A35]/20"
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        className="gap-2 bg-[#0D3A35] text-white hover:bg-[#092e2a]"
                        disabled={!safe(replyDrafts[question.id])}
                        onClick={() => {
                          if (!questionReplyRecord || !safe(replyDrafts[question.id])) return;
                          const repliedBy = readUserProfile().name?.trim() || 'PO Creator';
                          replyToPoApprovalQuestion(questionReplyRecord.poNumber, question.id, replyDrafts[question.id], repliedBy);
                          setReplyDrafts((current) => ({ ...current, [question.id]: '' }));
                          toast.success('Reply submitted to Admin Ops Finance');
                        }}
                      >
                        <Send className="h-4 w-4" /> Submit Reply
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            ))}
          </div>
          <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4">
            <Button type="button" variant="outline" onClick={() => { setQuestionReplyRecord(null); setReplyDrafts({}); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(approvalPrompt)} onOpenChange={(open) => { if (!open) setApprovalPrompt(null); }}>
        <DialogContent className="max-w-md overflow-hidden rounded-2xl border-0 p-0 shadow-2xl">
          <DialogHeader className="bg-[#0D3A35] px-6 py-5 text-left text-white">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
              <Send className="h-5 w-5" />
            </span>
            <DialogTitle className="text-xl font-bold text-white">Send for Approval?</DialogTitle>
            <DialogDescription className="text-sm text-white/70">
              Purchase Order {approvalPrompt?.poNumber || '—'} has been {approvalPrompt?.revisionNo ? 'revised' : 'created'} successfully.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Approval Destination</p>
              <p className="mt-1 font-bold text-slate-950">Admin Ops Finance</p>
              <p className="mt-1 text-sm text-slate-500">The {approvalPrompt?.revisionNo ? 'revised PO' : 'PO'} will appear in Finance Admin Ops under PO Approvals.</p>
            </div>
          </div>
          <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setApprovalPrompt(null)}>Not Now</Button>
            <Button
              type="button"
              className="gap-2 bg-[#0D3A35] text-white hover:bg-[#092e2a]"
              onClick={() => {
                if (!approvalPrompt) return;
                sendPoForFinanceApproval(approvalPrompt.poNumber);
                toast.success(`PO ${approvalPrompt.poNumber} sent to Admin Ops Finance for approval`);
                setApprovalPrompt(null);
              }}
            >
              <Send className="h-4 w-4" /> Send for Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
