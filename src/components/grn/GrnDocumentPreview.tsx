import { useEffect, useState } from 'react';
import { type GrnLineItem, type GrnSigner, type GrnStatus } from '@/lib/grnApi';
import logo3f from '@/Assets/3f-logo.png';
import { formatDateDDMMYYYY } from '@/lib/dateFormat';
import { getPersonEntry } from '@/lib/signatureDiary';
import { loadGrnAnnexure, type GrnAnnexureData } from '@/lib/grnAnnexure';

const COMPANY_NAME = 'SAI BIORESOURCES PRIVATE LIMITED';
const COMPANY_ADDRESS = 'Khasra No. 121/1, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh - 491001';

const PROJECT_GREEN = '#0D3A35';

// Relaxed shape so this same layout can render either a real, already-created GRNRecord, or
// a "draft" built live from the wizard's in-progress state (grnNo/dates not assigned yet).
export type GrnDocumentData = {
  grnNo?: string;
  grnDate?: string;
  poNo: string;
  poDate?: string;
  prNo?: string;
  prDate?: string;
  prBy?: string;
  vendorId?: string;
  vendorName: string;
  vendorAddress?: string;
  department?: string;
  group?: string;
  gateEntryIds?: string[];
  geNo?: string;
  geDate?: string;
  invNo?: string;
  invDate?: string;
  challanNo?: string;
  challanDate?: string;
  lrNo?: string;
  lrDate?: string;
  items: GrnLineItem[];
  remarks?: string;
  status?: GrnStatus;
  preparedBy?: GrnSigner;
  verifiedBy?: GrnSigner;
  approvedBy?: GrnSigner;
};

const formatDate = (v?: string) => formatDateDDMMYYYY(v, v || '');

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
const formatNumber = (value: number, decimals = 2) => value.toLocaleString('en-IN', {
  minimumFractionDigits: decimals,
  maximumFractionDigits: decimals,
});

const Kv = ({ k, v }: { k: string; v?: React.ReactNode }) => (
  <>
    <td className="border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 w-1/5">{k}</td>
    <td className="border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-700 w-[30%]">{v || '-'}</td>
  </>
);

export function GrnDocumentPreview({ grn }: { grn: GrnDocumentData }) {
  const isApproved = grn.status === 'approved';
  const [annexure, setAnnexure] = useState<GrnAnnexureData>({ gateEntries: [], itemPictures: [] });

  useEffect(() => {
    if (!grn.gateEntryIds?.length) {
      setAnnexure({ gateEntries: [], itemPictures: grn.items.map((item) => ({ itemId: item.itemId, itemCode: item.itemCode, itemName: item.description })) });
      return;
    }
    let active = true;
    loadGrnAnnexure({ gateEntryIds: grn.gateEntryIds, items: grn.items })
      .then((data) => { if (active) setAnnexure(data); })
      .catch(() => { if (active) setAnnexure({ gateEntries: [], itemPictures: [] }); });
    return () => { active = false; };
  }, [grn.gateEntryIds, grn.items]);
  const totals = {
    billed: sum(grn.items.map((x) => x.billedQty || 0)),
    received: sum(grn.items.map((x) => x.receivedQty || 0)),
    accepted: sum(grn.items.map((x) => (x.receivedQty || 0) - (x.rejectedQty || 0))),
    rejected: sum(grn.items.map((x) => x.rejectedQty || 0)),
    short: sum(grn.items.map((x) => x.shortQty || 0)),
    basic: sum(grn.items.map((x) => x.basicValue || 0)),
    freight: sum(grn.items.map((x) => x.freight || 0)),
    withTax: sum(grn.items.map((x) => x.valueWithTax || 0)),
    total: sum(grn.items.map((x) => x.totalGrnValue || 0)),
  };

  return (
    <div className="space-y-5">
    <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-800">
      {/* Header */}
      <div className="text-center">
        <img src={logo3f} alt="Sai Bioresources" className="mx-auto mb-1 h-16 w-auto object-contain" />
        <div className="font-extrabold text-base tracking-wide">{COMPANY_NAME}</div>
        <div className="text-[10.5px] text-slate-500 mt-0.5">{COMPANY_ADDRESS}</div>
        <div className="font-extrabold text-sm tracking-widest mt-1.5">GOODS RECEIPT NOTE (GRN)</div>
      </div>

      {/* GRN No / Date + Gate Entry No / Date */}
      <table className="w-full border-collapse mt-3">
        <tbody>
          <tr><Kv k="GRN No.:" v={grn.grnNo || 'Will be generated on submit'} /><Kv k="GRN Date:" v={formatDate(grn.grnDate) || 'Today'} /></tr>
          <tr><Kv k="Gate Entry No.:" v={grn.geNo} /><Kv k="Gate Entry Date:" v={formatDate(grn.geDate)} /></tr>
        </tbody>
      </table>

      {/* Particulars */}
      <div className="mt-3 rounded-t-md bg-[#0D3A35] py-1.5 text-center text-[11px] font-extrabold tracking-widest text-white">
        PARTICULARS
      </div>
      <table className="w-full border-collapse">
        <tbody>
          <tr><Kv k="Purchase Order No." v={grn.poNo} /><Kv k="PO Date" v={formatDate(grn.poDate)} /></tr>
          <tr><Kv k="Vendor / Supplier" v={grn.vendorName} /><Kv k="Vendor Code" v={grn.vendorId} /></tr>
          <tr><Kv k="Invoice No." v={grn.invNo} /><Kv k="Invoice Date" v={formatDate(grn.invDate)} /></tr>
          <tr><Kv k="Challan No." v={grn.challanNo} /><Kv k="Challan Date" v={formatDate(grn.challanDate)} /></tr>
          <tr><Kv k="LR / Transport No." v={grn.lrNo} /><Kv k="PR No." v={grn.prNo} /></tr>
          <tr><Kv k="Department" v={grn.department} /><Kv k="Group" v={grn.group} /></tr>
        </tbody>
      </table>

      {/* Items */}
      <div className="mt-3 overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full border-collapse text-[10px] min-w-[900px]">
          <thead>
            <tr className="bg-white text-slate-800">
              <th className="border border-slate-200 px-1.5 py-1.5 font-bold">S.No.</th>
              <th className="border border-slate-200 px-1.5 py-1.5 font-bold">Item Code</th>
              <th className="border border-slate-200 px-1.5 py-1.5 font-bold text-left">Item Description</th>
              <th className="border border-slate-200 px-1.5 py-1.5 font-bold">UOM</th>
              <th className="border border-slate-200 px-1.5 py-1.5 font-bold">Rate (₹)</th>
              <th className="border border-slate-200 px-1.5 py-1.5 font-bold">PO Qty</th>
              <th className="border border-slate-200 px-1.5 py-1.5 font-bold">Received</th>
              <th className="border border-slate-200 px-1.5 py-1.5 font-bold">Accepted</th>
              <th className="border border-slate-200 px-1.5 py-1.5 font-bold">Rejected</th>
              <th className="border border-slate-200 px-1.5 py-1.5 font-bold">Shortage</th>
              <th className="border border-slate-200 px-1.5 py-1.5 font-bold">Basic Value</th>
              <th className="border border-slate-200 px-1.5 py-1.5 font-bold">Disc %</th>
              <th className="border border-slate-200 px-1.5 py-1.5 font-bold">Freight</th>
              <th className="border border-slate-200 px-1.5 py-1.5 font-bold">GST %</th>
              <th className="border border-slate-200 px-1.5 py-1.5 font-bold">Value With Tax</th>
              <th className="border border-slate-200 px-1.5 py-1.5 font-bold">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            {grn.items.map((it, idx) => (
              <tr key={it.itemId} className="hover:bg-slate-50/60">
                <td className="border border-slate-200 px-1.5 py-1 text-center">{idx + 1}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-center">{it.itemCode || ''}</td>
                <td className="border border-slate-200 px-1.5 py-1">{it.description}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-center">{it.uom}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">{formatNumber(it.unitPrice || 0, 2)}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">{formatNumber(it.billedQty || 0)}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">{formatNumber(it.receivedQty || 0)}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">{formatNumber((it.receivedQty || 0) - (it.rejectedQty || 0), 2)}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">{formatNumber(it.rejectedQty || 0, 2)}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">{formatNumber(it.shortQty || 0, 2)}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">{formatNumber(it.basicValue || 0, 2)}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-center">{formatNumber(it.discPercent || 0)}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">{formatNumber(it.freight || 0, 2)}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-center">{formatNumber(it.gstPercent || 0)}%</td>
                <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">{formatNumber(it.valueWithTax || 0, 2)}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-right font-bold tabular-nums">{formatNumber(it.totalGrnValue || 0, 2)}</td>
              </tr>
            ))}
            {grn.items.length === 0 && (
              <tr><td colSpan={16} className="border border-slate-200 px-2 py-4 text-center text-slate-400">No items added yet</td></tr>
            )}
            {grn.items.length > 0 && (
              <tr className="bg-slate-50 font-extrabold">
                <td className="border border-slate-200 px-1.5 py-1.5 text-center" colSpan={5}>TOTAL</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums">{formatNumber(totals.billed)}</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums">{formatNumber(totals.received)}</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums">{formatNumber(totals.accepted, 2)}</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums">{formatNumber(totals.rejected, 2)}</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums">{formatNumber(totals.short, 2)}</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums">{formatNumber(totals.basic, 2)}</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-center">-</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums">{formatNumber(totals.freight, 2)}</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-center">-</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums">{formatNumber(totals.withTax, 2)}</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums">{formatNumber(totals.total, 2)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Totals summary */}
      <div className="mt-3 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2">
        <table className="w-full border-collapse text-[11px]">
          <tbody>
            <tr><td className="border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-bold text-slate-600">Total PO Quantity</td><td className="border border-slate-200 px-2.5 py-1.5 text-right tabular-nums">{formatNumber(totals.billed)}</td></tr>
            <tr><td className="border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-bold text-slate-600">Total Received Quantity</td><td className="border border-slate-200 px-2.5 py-1.5 text-right tabular-nums">{formatNumber(totals.received)}</td></tr>
            <tr><td className="border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-bold text-slate-600">Total Accepted Quantity</td><td className="border border-slate-200 px-2.5 py-1.5 text-right tabular-nums">{formatNumber(totals.accepted, 2)}</td></tr>
            <tr><td className="border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-bold text-slate-600">Total Rejected Quantity</td><td className="border border-slate-200 px-2.5 py-1.5 text-right tabular-nums">{formatNumber(totals.rejected, 2)}</td></tr>
          </tbody>
        </table>
        <div className="flex h-full min-h-full items-center justify-between rounded-lg border-2 border-[#0D3A35] bg-emerald-50/40 px-5 py-4 font-extrabold">
          <span className="text-sm">Total GRN Value (₹)</span>
          <span className="text-xl text-[#0D3A35]">
            ₹{formatNumber(totals.total, 2)}
          </span>
        </div>
      </div>

      {/* Notes */}
      <div className="mt-3 rounded-t-md bg-[#0D3A35] py-1.5 text-center text-[11px] font-extrabold tracking-widest text-white">
        NOTES
      </div>
      <div className="min-h-12 rounded-b-md border border-slate-200 bg-emerald-50/20 px-3 py-2 text-[10.5px] text-slate-600">
        {grn.remarks || 'No additional notes recorded.'}
      </div>

      {/* Certification */}
      <div className="mt-3 rounded-t-md bg-[#0D3A35] py-1.5 text-center text-[11px] font-extrabold tracking-widest text-white">
        CERTIFICATION
      </div>
      <div className="border border-slate-200 rounded-b-md px-3 py-2 text-[10.5px] text-slate-600 space-y-0.5">
        <p>This is to certify that the items specified above have been received in good condition and quantity as mentioned.</p>
        <p>The quality and quantity of the material have been verified and found satisfactory.</p>
      </div>

      {/* Signatures */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {([
          ['Prepared By', grn.preparedBy],
          ['Verified By', grn.verifiedBy],
          ['Approved By', grn.approvedBy],
        ] as const).map(([label, signer]) => {
          const savedSignature = signer?.name ? getPersonEntry(signer.name)?.signature : '';
          return (
          <div key={label} className="rounded-lg border border-slate-200 px-3 py-2 text-[10.5px]">
            <div className="mb-1 font-extrabold text-[#0D3A35]">{label}</div>
            {isApproved && signer && (
              <div className="mb-2 flex min-h-12 flex-col items-center justify-center rounded-md border border-emerald-200 bg-emerald-50/60 px-2 py-1.5 text-center">
                {savedSignature ? <img src={savedSignature} alt={`${signer.name} digital signature`} className="mb-1 h-8 max-w-full object-contain" /> : null}
                <div className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-emerald-700">Digitally Signed</div>
                <div className="text-[9px] text-emerald-700">Approval recorded electronically</div>
              </div>
            )}
            <div>Name: {signer?.name || '-'}</div>
            <div>Designation: {signer?.designation || '-'}</div>
            <div className="mt-3 border-t border-dashed border-slate-200 pt-1 text-slate-500">
              Date: {formatDate(signer?.timestamp) || '-'}
            </div>
          </div>
          );
        })}
      </div>

    </div>

    <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-800">
      <div className="text-center">
        <img src={logo3f} alt="Sai Bioresources" className="mx-auto mb-1 h-14 w-auto object-contain" />
        <div className="text-base font-extrabold tracking-wide">{COMPANY_NAME}</div>
        <div className="mt-0.5 text-[10.5px] text-slate-500">{COMPANY_ADDRESS}</div>
        <div className="mt-2 rounded-md bg-[#0D3A35] py-2 text-sm font-extrabold tracking-[0.18em] text-white">ANNEXURE - A</div>
        <div className="mt-2 text-[10.5px] text-slate-500">Gate Entry Details and Item Pictures - GRN {grn.grnNo || 'Draft'} - PO {grn.poNo}</div>
      </div>

      <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
        <table className="w-full border-collapse text-[10px]">
          <thead className="bg-slate-50 text-slate-700">
            <tr>{['Gate Entry No.', 'Date & Time', 'Gate / Destination', 'Vendor', 'Invoice / Challan', 'Item', 'Quantity'].map((heading) => <th key={heading} className="border border-slate-200 px-2 py-2 text-center font-bold">{heading}</th>)}</tr>
          </thead>
          <tbody>
            {annexure.gateEntries.length ? annexure.gateEntries.map((entry) => (
              <tr key={entry.enteryId}>
                <td className="border border-slate-200 px-2 py-2 text-center font-mono">{entry.siteEntryNo || entry.enteryId}</td>
                <td className="border border-slate-200 px-2 py-2 text-center">{formatDate(entry.entryDate)} {entry.entryTime || ''}</td>
                <td className="border border-slate-200 px-2 py-2">{entry.destinationName || entry.gateNo || '-'}</td>
                <td className="border border-slate-200 px-2 py-2">{entry.vendorName || '-'}</td>
                <td className="border border-slate-200 px-2 py-2">{entry.invoiceNumber || '-'} / {entry.challanNumber || '-'}</td>
                <td className="border border-slate-200 px-2 py-2">{entry.itemName || '-'}</td>
                <td className="border border-slate-200 px-2 py-2 text-right tabular-nums">{formatNumber(entry.itemQuantity || 0)} {entry.itemUnit || ''}</td>
              </tr>
            )) : <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Gate entry details are not available.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-t-md bg-[#0D3A35] py-1.5 text-center text-[11px] font-extrabold tracking-widest text-white">ITEM PICTURES</div>
      <div className="grid grid-cols-1 gap-3 rounded-b-md border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-3">
        {annexure.itemPictures.length ? annexure.itemPictures.map((picture) => (
          <div key={`${picture.itemId}-${picture.itemCode || ''}`} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {picture.imageUrl ? <img src={picture.imageUrl} alt={picture.itemName} className="h-36 w-full bg-white object-contain p-2" /> : <div className="flex h-36 items-center justify-center bg-white px-3 text-center text-xs text-slate-400">No picture recorded</div>}
            <div className="border-t border-slate-200 px-3 py-2"><p className="text-xs font-bold text-slate-700">{picture.itemName}</p><p className="mt-0.5 font-mono text-[10px] text-slate-400">{picture.itemCode || picture.itemId}</p></div>
          </div>
        )) : <div className="col-span-full py-8 text-center text-xs text-slate-400">No item pictures are available.</div>}
      </div>
    </div>
    </div>
  );
}

export default GrnDocumentPreview;
