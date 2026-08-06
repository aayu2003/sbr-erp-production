import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Check,
  CheckCircle2,
  Clock3,
  FileCheck2,
  MessageCircle,
  Printer,
  Search,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import getBaseUrl from '@/lib/config';
import logo3f from '@/Assets/3f-logo.png';
import {
  InventoryApprovalStatus,
  InventoryTransferApproval,
  readInventoryApprovals,
  subscribeToInventoryApprovals,
  updateInventoryApproval,
} from '@/lib/inventoryApprovalStore';
import { TransferSlipDocument, transferSlipDataFromApproval } from '@/components/inventory/TransferSlipDocument';

const BASE_URL = getBaseUrl().replace(/\/$/, '');

const COMPANY_NAME = 'SAI BIORESOURCES PRIVATE LIMITED';
const COMPANY_ADDRESS = 'Khasra No. 121/1, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh – 491001';

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const formatDate = (value?: string, withTime = false) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
};

const statusStyles: Record<InventoryApprovalStatus, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-red-200 bg-red-50 text-red-700',
};

const printTransferSlip = (record: InventoryTransferApproval) => {
  if (record.status !== 'approved') return toast.error('Only approved transfer slips can be printed');
  const popup = window.open('', '_blank', 'width=900,height=1100');
  if (!popup) return toast.error('Pop-up blocked. Please allow pop-ups to print.');
  const transfer = record.transfer;
  const logoUrl = new URL(logo3f, window.location.origin).href;
  const row = (label: string, value: unknown) =>
    `<div class="detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '—')}</strong></div>`;

  popup.document.write(`<!DOCTYPE html><html><head>
    <title>Stock Transfer Slip - ${escapeHtml(transfer.transferSlipNumber)}</title>
    <style>
      @page{size:A4;margin:11mm}*{box-sizing:border-box}
      body{margin:0;font-family:Arial,sans-serif;color:#18212f;background:#fff;font-size:11px}
      .sheet{border:1px solid #b8c5d1;padding:18px}.header{text-align:center;border-bottom:2px solid #0D3A35;padding-bottom:12px}
      .header img{height:58px;width:auto}.company{font-size:18px;font-weight:900;letter-spacing:.04em;margin-top:4px}
      .address{font-size:10px;color:#526173;line-height:1.5;margin:4px auto 0;max-width:680px}
      .title{background:#0D3A35;color:#fff;text-align:center;font-size:14px;font-weight:900;letter-spacing:.12em;padding:8px;margin-top:12px}
      .meta{display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #cbd5e1;border-top:0}.meta>div{padding:8px 10px;border-right:1px solid #cbd5e1}.meta>div:last-child{border-right:0}
      .label{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700}.value{font-size:11px;font-weight:800;margin-top:3px}
      .approved{display:inline-block;border:1px solid #15803d;background:#ecfdf5;color:#166534;border-radius:99px;padding:4px 12px;font-weight:800}
      .section{border:1px solid #cbd5e1;margin-top:10px}.section-title{background:#f1f5f9;border-bottom:1px solid #cbd5e1;padding:6px 9px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#334155}
      .grid{display:grid;grid-template-columns:1fr 1fr}.detail{display:flex;gap:10px;justify-content:space-between;padding:7px 9px;border-bottom:1px solid #e2e8f0}.detail:nth-child(odd){border-right:1px solid #e2e8f0}.detail span{color:#64748b;font-weight:700}.detail strong{text-align:right}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left}th{background:#0D3A35;color:#fff;font-size:9px;text-transform:uppercase}.num{text-align:right}
      .remarks{min-height:44px;padding:9px;line-height:1.5}.declaration{margin-top:10px;border:1px solid #cbd5e1;background:#f8fafc;padding:8px 10px;font-size:10px;line-height:1.5;color:#475569}
      .signatures{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:24px}.signature{border:1px solid #cbd5e1;min-height:86px;padding:8px;text-align:center}.line{border-top:1px solid #64748b;margin-top:34px;padding-top:5px;font-weight:800}.signature small{display:block;color:#64748b;margin-top:3px}
      .footer{display:flex;justify-content:space-between;margin-top:12px;padding-top:8px;border-top:1px solid #e2e8f0;color:#64748b;font-size:9px}
      @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style></head><body><div class="sheet">
      <div class="header"><img src="${logoUrl}" alt="Sai Bioresources"/><div class="company">${COMPANY_NAME}</div><div class="address">${COMPANY_ADDRESS}</div></div>
      <div class="title">STOCK TRANSFER SLIP</div>
      <div class="meta">
        <div><div class="label">Transfer Slip No.</div><div class="value">${escapeHtml(transfer.transferSlipNumber)}</div></div>
        <div><div class="label">Transfer Date</div><div class="value">${formatDate(transfer.transferDate)}</div></div>
        <div><div class="label">Approval Status</div><div class="value"><span class="approved">APPROVED</span></div></div>
      </div>
      <div class="section"><div class="section-title">Store Transfer Details</div><div class="grid">
        ${row('From Store', transfer.sourceStore)}${row('Destination Store', transfer.destinationStore)}
        ${row('Expected Arrival', formatDate(transfer.expectedArrival, true))}${row('Prepared By', record.preparedBy)}
      </div></div>
      <div class="section"><div class="section-title">Stock Particulars</div>
        <table><thead><tr><th>Item Code</th><th>Item Description</th><th>Category</th><th>Unit</th><th class="num">Transfer Qty.</th><th class="num">Available Qty.</th></tr></thead>
        <tbody>${transfer.items.map((line) => `<tr><td>${escapeHtml(line.itemCode || '—')}</td><td>${escapeHtml(line.itemName)}</td><td>${escapeHtml(line.category)}</td><td>${escapeHtml(line.unit)}</td><td class="num"><strong>${line.quantity.toLocaleString('en-IN')}</strong></td><td class="num">${line.availableStock.toLocaleString('en-IN')}</td></tr>`).join('')}</tbody></table>
      </div>
      <div class="section"><div class="section-title">Transport Details</div><div class="grid">
        ${row('Vehicle Number', transfer.vehicleNumber)}${row('Vehicle Type', transfer.vehicleType)}
        ${row('Make / Company', transfer.vehicleMake)}${row('Model', transfer.vehicleModel)}
        ${row('Driver Name', transfer.driverName)}${row('Driver Contact', transfer.driverContact)}
      </div></div>
      <div class="section"><div class="section-title">Approval Details</div><div class="grid">
        ${row('Approved By', record.approverName)}${row('Designation', record.approverDesignation)}
        ${row('Approval Date', formatDate(record.approvedAt, true))}${row('Approval ID', record.id)}
      </div></div>
      <div class="section"><div class="section-title">Remarks / Handling Instructions</div><div class="remarks">${escapeHtml(transfer.remarks || 'No additional remarks')}</div></div>
      <div class="declaration">The above material has been checked against the transfer request and is approved for movement from the Central Store to the stated destination. Quantity and condition must be verified by the receiving store before acknowledgement.</div>
      <div class="signatures">
        <div class="signature"><div class="line">Prepared By</div><small>${escapeHtml(record.preparedBy)}</small></div>
        <div class="signature"><div class="line">Central Store Keeper</div><small>Signature &amp; Date</small></div>
        <div class="signature"><div class="line">Approved By</div><small>${escapeHtml(record.digitalSignature?.signature || `${record.approverName} · ${record.approverDesignation}`)}</small></div>
        <div class="signature"><div class="line">Received By</div><small>Destination Store</small></div>
      </div>
      <div class="footer"><span>System-generated stock transfer slip</span><span>Original: Central Store · Copy: Destination Store · Copy: Accounts/Admin</span></div>
    </div></body></html>`);
  popup.document.close();
  popup.focus();
  setTimeout(() => { popup.print(); popup.close(); }, 450);
};

const TransferSlipPreview = ({ record }: { record: InventoryTransferApproval }) => (
  <TransferSlipDocument data={transferSlipDataFromApproval(record)} />
);

const InventoryApprovals = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState<InventoryTransferApproval[]>(readInventoryApprovals);
  const [statusFilter, setStatusFilter] = useState<'all' | InventoryApprovalStatus>('all');
  const [search, setSearch] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<InventoryTransferApproval | null>(null);
  const [question, setQuestion] = useState('');
  const [rejectingRecord, setRejectingRecord] = useState<InventoryTransferApproval | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const refresh = () => setRecords(readInventoryApprovals());
  useEffect(() => subscribeToInventoryApprovals(refresh), []);
  useEffect(() => {
    if (!selectedRecord) return;
    const current = records.find((record) => record.id === selectedRecord.id);
    if (current) setSelectedRecord(current);
  }, [records, selectedRecord?.id]);

  const counts = useMemo(() => ({
    all: records.length,
    pending: records.filter((record) => record.status === 'pending').length,
    approved: records.filter((record) => record.status === 'approved').length,
    rejected: records.filter((record) => record.status === 'rejected').length,
  }), [records]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => {
      const matchesStatus = statusFilter === 'all' || record.status === statusFilter;
      const haystack = [
        record.id,
        record.transfer.transferSlipNumber,
        ...record.transfer.items.map((line) => line.itemName),
        ...record.transfer.items.map((line) => line.itemCode),
        record.transfer.destinationStore,
        record.preparedBy,
        record.approverName,
      ].join(' ').toLowerCase();
      return matchesStatus && (!query || haystack.includes(query));
    });
  }, [records, search, statusFilter]);

  const canApprove = (record: InventoryTransferApproval) =>
    user?.id === 'sbr-admin'
    || user?.id === record.approverId
    || user?.name?.trim().toLowerCase() === record.approverName.trim().toLowerCase();

  const approve = async (record: InventoryTransferApproval) => {
    if (!canApprove(record)) return toast.error(`This approval is assigned to ${record.approverName}`);
    if (!user?.id || !user?.name) return toast.error('You must be logged in to digitally sign this approval');
    const signedAt = new Date();
    const signedAtIso = signedAt.toISOString();
    const signature = `Approver | ${user.name} | ${signedAt.toTimeString().slice(0, 5)} | ${signedAtIso.slice(0, 10)}`;
    const updated = updateInventoryApproval(record.id, {
      status: 'approved',
      approvedAt: signedAtIso,
      rejectedAt: undefined,
      rejectionReason: undefined,
      digitalSignature: {
        signerId: user.id,
        signerName: user.name,
        signerDesignation: user.designation || record.approverDesignation,
        signedAt: signedAtIso,
        signature,
      },
    });
    if (updated && selectedRecord?.id === record.id) setSelectedRecord(updated);
    refresh();
    toast.success(`${record.transfer.transferSlipNumber} approved and digitally signed`);

    // Only once Inventory Approval is granted does the slip actually land in the
    // stock-transfer table, ready for the Logistics Request module to pick up.
    try {
      const transfer = record.transfer;
      if (!transfer.storeManagerSignature) {
        throw new Error('This slip predates the Store Manager signature — recreate the transfer to send it to Logistics.');
      }
      const res = await fetch(`${BASE_URL}/inventory/create_stock_transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approval_id: record.id,
          transfer_slip_number: transfer.transferSlipNumber,
          creation_date: transfer.creationDate,
          transfer_date: transfer.transferDate,
          items: transfer.items.map((line) => ({
            item_id: line.itemId,
            item_name: line.itemName,
            item_code: line.itemCode,
            category: line.category,
            unit: line.unit,
            quantity: line.quantity,
            available_stock: line.availableStock,
          })),
          source_store: transfer.sourceStore,
          destination_store: transfer.destinationStore,
          remarks: transfer.remarks,
          prepared_by: record.preparedBy,
          prepared_by_id: record.preparedById,
          store_manager: {
            staff_id: transfer.storeManagerSignature.staffId,
            staff_name: transfer.storeManagerSignature.staffName,
            staff_designation: transfer.storeManagerSignature.staffDesignation,
            signed_at: transfer.storeManagerSignature.signedAt,
          },
          head_of_operations: {
            staff_id: record.approverId,
            staff_name: record.approverName,
            staff_designation: record.approverDesignation,
            signed_at: signedAtIso,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.detail || 'Failed to persist stock transfer');
      updateInventoryApproval(record.id, { backendTransferId: data.transfer_id });
      refresh();
    } catch (e) {
      console.error('create_stock_transfer failed:', e);
      toast.error(e instanceof Error ? e.message : 'Approved locally, but failed to create the backend stock transfer record');
    }
  };

  const askQuestion = () => {
    if (!selectedRecord) return;
    const value = question.trim();
    if (!value) return toast.error('Enter a question');
    const updated = updateInventoryApproval(selectedRecord.id, {
      questions: [
        ...(selectedRecord.questions ?? []),
        {
          id: `Q-${Date.now()}`,
          askedAt: new Date().toISOString(),
          askedBy: user?.name || user?.username || 'Inventory user',
          question: value,
        },
      ],
    });
    if (updated) setSelectedRecord(updated);
    setQuestion('');
    refresh();
    toast.success('Question added to the transfer request');
  };

  const reject = () => {
    if (!rejectingRecord) return;
    if (!canApprove(rejectingRecord)) return toast.error(`This approval is assigned to ${rejectingRecord.approverName}`);
    if (!rejectionReason.trim()) return toast.error('Enter a rejection reason');
    const updated = updateInventoryApproval(rejectingRecord.id, {
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectionReason: rejectionReason.trim(),
      approvedAt: undefined,
      digitalSignature: undefined,
    });
    if (updated && selectedRecord?.id === rejectingRecord.id) setSelectedRecord(updated);
    setRejectingRecord(null);
    setRejectionReason('');
    refresh();
    toast.success('Transfer request rejected');
  };

  return (
    <div className="min-h-screen space-y-7 bg-[#fbfcfd] p-4 text-slate-900 sm:p-6 lg:p-8">
      <div>
        <p className="text-sm font-bold text-emerald-700">Inventory Operations</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Inventory Approvals</h1>
        <p className="mt-3 text-base font-medium text-slate-600">Review and approve inventory requests assigned to employees</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'All Requests', value: counts.all, icon: FileCheck2 },
          { label: 'Pending', value: counts.pending, icon: Clock3 },
          { label: 'Approved', value: counts.approved, icon: CheckCircle2 },
          { label: 'Rejected', value: counts.rejected, icon: XCircle },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
            <div className="flex items-start justify-between">
              <div><p className="text-sm font-bold text-slate-500">{item.label}</p><p className="mt-3 text-2xl font-bold text-slate-950">{item.value}</p></div>
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0D3A35]/10 text-[#0D3A35]"><item.icon className="h-5 w-5" /></div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search slip, item, store, or employee…" className="h-11 pl-11" />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
              <button key={status} onClick={() => setStatusFilter(status)} className={cn(
                'rounded-lg border px-3 py-2 text-xs font-bold capitalize',
                statusFilter === status ? 'border-[#0D3A35] bg-[#0D3A35] text-white' : 'border-slate-200 bg-white text-slate-600',
              )}>{status} ({counts[status]})</button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-slate-400">
          <ShieldCheck className="mb-3 h-10 w-10 opacity-40" />
          <p className="font-bold">No approval requests found</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-5">
          {filtered.map((record) => (
            <button
              key={record.id}
              type="button"
              onClick={() => setSelectedRecord(record)}
              className="group flex min-h-[300px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-left shadow-[0_14px_40px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-[#0D3A35]/20 hover:shadow-[0_18px_48px_rgba(15,23,42,0.10)]"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0D3A35]/10 text-[#0D3A35]"><ArrowRightLeft className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">{record.transfer.transferSlipNumber}</p>
                    <p className="mt-1 truncate text-[10px] font-semibold text-slate-400">{formatDate(record.requestedAt, true)}</p>
                  </div>
                </div>
                <span className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold capitalize', statusStyles[record.status])}>{record.status}</span>
              </div>

              <div className="grid grid-cols-2 gap-px bg-slate-100">
                {[
                  ['Item(s)', record.transfer.items.length === 1
                    ? record.transfer.items[0].itemName
                    : `${record.transfer.items.length} items`],
                  ['Quantity', record.transfer.items.length === 1
                    ? `${record.transfer.items[0].quantity.toLocaleString('en-IN')} ${record.transfer.items[0].unit}`
                    : `${record.transfer.items.length} line items`],
                  ['Destination', record.transfer.destinationStore],
                  ['Vehicle', record.transfer.vehicleNumber || 'N/A'],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 bg-white px-4 py-3">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                    <p className="mt-1 truncate text-xs font-bold text-slate-700">{value}</p>
                  </div>
                ))}
              </div>

              <div className="flex-1 space-y-2 p-4">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold text-slate-400">Prepared by</span><strong className="truncate text-slate-700">{record.preparedBy}</strong>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold text-slate-400">Approver</span><strong className="truncate text-slate-700">{record.approverName}</strong>
                </div>
                {(record.questions?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-[#0D3A35]/5 px-2.5 py-2 text-[10px] font-bold text-[#0D3A35]">
                    <MessageCircle className="h-3.5 w-3.5" />{record.questions!.length} question{record.questions!.length === 1 ? '' : 's'}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs font-black text-[#0D3A35]">
                Open Approval <FileCheck2 className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(selectedRecord)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRecord(null);
            setQuestion('');
          }
        }}
      >
        <DialogContent className="h-[92vh] w-[96vw] max-w-[1500px] overflow-hidden border-0 p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Transfer Approval Review</DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <div className="grid h-full min-h-0 grid-cols-1 xl:grid-cols-[1.08fr_0.92fr]">
              <section className="min-h-0 overflow-y-auto bg-slate-200/70">
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
                  <div>
                    <p className="text-xs font-black text-slate-950">Transfer Slip Preview</p>
                    <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{selectedRecord.transfer.transferSlipNumber}</p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={selectedRecord.status !== 'approved'}
                    onClick={() => printTransferSlip(selectedRecord)}
                    className="gap-2 border-[#0D3A35]/20 font-bold text-[#0D3A35] hover:bg-[#0D3A35]/5"
                  >
                    <Printer className="h-4 w-4" />Print Slip
                  </Button>
                </div>
                <div className="p-5 sm:p-8">
                  <TransferSlipPreview record={selectedRecord} />
                </div>
              </section>

              <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-white">
                <div className="border-b border-slate-100 bg-[#0D3A35] px-6 py-5 text-white">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black">Transfer Approval</h2>
                    <span className={cn(
                      'rounded-full border px-2.5 py-1 text-[10px] font-bold capitalize',
                      selectedRecord.status === 'pending'
                        ? 'border-amber-300/30 bg-amber-400/15 text-amber-100'
                        : selectedRecord.status === 'approved'
                          ? 'border-emerald-300/30 bg-emerald-400/15 text-emerald-100'
                          : 'border-red-300/30 bg-red-400/15 text-red-100',
                    )}>{selectedRecord.status}</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-white/65">{selectedRecord.id}</p>
                </div>

                <div className="space-y-5 p-6">
                  <section className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3 text-xs font-black text-slate-800">Transfer Details</div>
                    <div className="grid grid-cols-2 gap-px bg-slate-100">
                      {[
                        ['Slip Number', selectedRecord.transfer.transferSlipNumber],
                        ['Requested', formatDate(selectedRecord.requestedAt, true)],
                        ['Line Items', String(selectedRecord.transfer.items.length)],
                        ['From Store', selectedRecord.transfer.sourceStore],
                        ['Destination', selectedRecord.transfer.destinationStore],
                        ['Vehicle', selectedRecord.transfer.vehicleNumber || 'N/A'],
                        ['Driver', selectedRecord.transfer.driverName || 'N/A'],
                        ['Prepared By', selectedRecord.preparedBy],
                        ['Assigned Approver', `${selectedRecord.approverName} · ${selectedRecord.approverDesignation}`],
                      ].map(([label, value]) => (
                        <div key={label} className="min-w-0 bg-white px-3 py-3">
                          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                          <p className="mt-1 break-words text-xs font-bold text-slate-700">{value}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  {selectedRecord.transfer.remarks && (
                    <section className="rounded-xl border border-slate-200 p-4">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Remarks / Instructions</p>
                      <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">{selectedRecord.transfer.remarks}</p>
                    </section>
                  )}

                  {selectedRecord.rejectionReason && (
                    <section className="rounded-xl border border-red-200 bg-red-50 p-4">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-red-400">Rejection Reason</p>
                      <p className="mt-2 text-xs font-bold leading-relaxed text-red-700">{selectedRecord.rejectionReason}</p>
                    </section>
                  )}

                  {selectedRecord.digitalSignature && (
                    <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex items-start gap-3">
                        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                        <div>
                          <p className="text-xs font-black text-emerald-900">Digitally Signed</p>
                          <p className="mt-1 text-xs font-bold text-emerald-800">
                            {selectedRecord.digitalSignature.signerName} · {selectedRecord.digitalSignature.signerDesignation}
                          </p>
                          <p className="mt-1 text-[10px] font-semibold text-emerald-700">
                            {formatDate(selectedRecord.digitalSignature.signedAt, true)}
                          </p>
                          <p className="mt-2 rounded-lg border border-emerald-200 bg-white/70 px-2.5 py-2 font-mono text-[9px] text-emerald-800">
                            {selectedRecord.digitalSignature.signature}
                          </p>
                        </div>
                      </div>
                    </section>
                  )}

                  <section className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                      <MessageCircle className="h-4 w-4 text-[#0D3A35]" />
                      <div>
                        <p className="text-xs font-black text-slate-800">Ask a Question</p>
                        <p className="text-[10px] font-semibold text-slate-400">Record a query regarding this transfer request</p>
                      </div>
                    </div>
                    {(selectedRecord.questions?.length ?? 0) > 0 && (
                      <div className="max-h-48 space-y-2 overflow-y-auto border-b border-slate-100 bg-slate-50/40 p-3">
                        {selectedRecord.questions!.map((entry) => (
                          <div key={entry.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                            <div className="p-3">
                              <p className="text-xs font-semibold leading-relaxed text-slate-700">{entry.question}</p>
                              <p className="mt-2 text-[9px] font-bold text-slate-400">{entry.askedBy} · {formatDate(entry.askedAt, true)}</p>
                            </div>
                            {entry.reply && (
                              <div className="border-t border-emerald-100 bg-emerald-50/70 p-3">
                                <p className="text-[9px] font-black uppercase tracking-wide text-emerald-700">
                                  Reply from {entry.repliedBy || selectedRecord.preparedBy}
                                </p>
                                <p className="mt-1.5 text-xs font-semibold leading-relaxed text-slate-700">{entry.reply}</p>
                                <p className="mt-2 text-[9px] font-bold text-slate-400">{formatDate(entry.repliedAt, true)}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="p-3">
                      <textarea
                        value={question}
                        onChange={(event) => setQuestion(event.target.value)}
                        rows={3}
                        placeholder="Type your question about the transfer…"
                        className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-[#0D3A35]"
                      />
                      <Button onClick={askQuestion} variant="outline" className="mt-2 w-full gap-2 border-[#0D3A35]/20 font-bold text-[#0D3A35] hover:bg-[#0D3A35]/5">
                        <MessageCircle className="h-4 w-4" />Ask Question
                      </Button>
                    </div>
                  </section>

                  {selectedRecord.status === 'pending' && (
                    <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                      {!canApprove(selectedRecord) && (
                        <p className="mb-3 text-xs font-semibold text-amber-700">
                          This request is assigned to {selectedRecord.approverName}.
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          variant="outline"
                          disabled={!canApprove(selectedRecord)}
                          onClick={() => setRejectingRecord(selectedRecord)}
                          className="gap-2 border-red-200 font-bold text-red-600 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />Reject
                        </Button>
                        <Button
                          disabled={!canApprove(selectedRecord)}
                          onClick={() => approve(selectedRecord)}
                          className="gap-2 bg-[#0D3A35] font-bold text-white hover:bg-[#092e2a]"
                        >
                          <Check className="h-4 w-4" />Approve &amp; Sign
                        </Button>
                      </div>
                    </section>
                  )}

                  {selectedRecord.status === 'approved' && (
                    <Button onClick={() => printTransferSlip(selectedRecord)} className="w-full gap-2 bg-[#0D3A35] font-bold text-white hover:bg-[#092e2a]">
                      <Printer className="h-4 w-4" />Print Approved Slip
                    </Button>
                  )}
                </div>
              </aside>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rejectingRecord)} onOpenChange={(open) => { if (!open) { setRejectingRecord(null); setRejectionReason(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Reject Transfer Approval</DialogTitle></DialogHeader>
          <div className="py-2">
            <label className="text-xs font-bold text-slate-600">Reason for rejection</label>
            <textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} rows={4} className="mt-2 w-full resize-none rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-red-400" placeholder="Explain why this transfer is being rejected" />
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setRejectingRecord(null)}>Cancel</Button><Button onClick={reject} className="bg-red-600 text-white hover:bg-red-700">Reject Request</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryApprovals;
