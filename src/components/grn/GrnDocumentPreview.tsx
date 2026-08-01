import { type GrnLineItem, type GrnSigner, type GrnStatus } from '@/lib/grnApi';
import logo3f from '@/Assets/3f-logo.png';

const COMPANY_NAME = 'SAI BIORESOURCES PRIVATE LIMITED';
const COMPANY_ADDRESS = 'Khasra No. 121/1, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh – 491001';

const NAVY = '#1e3a5f';

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

const formatDate = (v?: string) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
};

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

const Kv = ({ k, v }: { k: string; v?: React.ReactNode }) => (
  <>
    <td className="border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 w-1/5">{k}</td>
    <td className="border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-700 w-[30%]">{v || '-'}</td>
  </>
);

export function GrnDocumentPreview({ grn }: { grn: GrnDocumentData }) {
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
    <div className="bg-white border border-slate-200 rounded-2xl p-5 text-slate-800">
      {/* Header */}
      <div className="text-center">
        <img src={logo3f} alt="Sai Bioresources" className="h-10 w-auto mx-auto mb-1" />
        <div className="font-extrabold text-base tracking-wide">{COMPANY_NAME}</div>
        <div className="text-[10.5px] text-slate-500 mt-0.5">{COMPANY_ADDRESS}</div>
        <div className="font-extrabold text-sm tracking-widest mt-1.5">GOODS RECEIPT NOTE (GRN)</div>
      </div>

      {/* GRN No / Date + Gate Entry No / Date */}
      <table className="w-full border-collapse mt-3">
        <tbody>
          <tr><Kv k="GRN No.:" v={grn.grnNo || 'Will be generated on submit'} /><Kv k="GRN Date:" v={formatDate(grn.grnDate) || 'Today'} /></tr>
          <tr><Kv k="Gate Entry No.:" v={grn.geNo} /><Kv k="Gate Entry Date:" v={grn.geDate} /></tr>
        </tbody>
      </table>

      {/* Particulars */}
      <div className="mt-3 text-center text-[11px] font-extrabold tracking-widest text-white py-1.5 rounded-t-md" style={{ backgroundColor: NAVY }}>
        PARTICULARS
      </div>
      <table className="w-full border-collapse">
        <tbody>
          <tr><Kv k="Work Order No." v={grn.poNo} /><Kv k="PO Date" v={formatDate(grn.poDate)} /></tr>
          <tr><Kv k="Vendor / Supplier" v={grn.vendorName} /><Kv k="Vendor Code" v={grn.vendorId} /></tr>
          <tr><Kv k="Invoice No." v={grn.invNo} /><Kv k="Invoice Date" v={grn.invDate} /></tr>
          <tr><Kv k="Challan No." v={grn.challanNo} /><Kv k="Challan Date" v={grn.challanDate} /></tr>
          <tr><Kv k="LR / Transport No." v={grn.lrNo} /><Kv k="PR No." v={grn.prNo} /></tr>
          <tr><Kv k="Department" v={grn.department} /><Kv k="Group" v={grn.group} /></tr>
          <tr>
            <td className="border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-600">Remarks</td>
            <td className="border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-700" colSpan={3}>{grn.remarks || '-'}</td>
          </tr>
        </tbody>
      </table>

      {/* Items */}
      <div className="mt-3 overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full border-collapse text-[10px] min-w-[900px]">
          <thead>
            <tr className="text-white" style={{ backgroundColor: NAVY }}>
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
                <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">{(it.unitPrice || 0).toFixed(2)}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">{it.billedQty}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">{it.receivedQty}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">{((it.receivedQty || 0) - (it.rejectedQty || 0)).toFixed(2)}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">{(it.rejectedQty || 0).toFixed(2)}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">{(it.shortQty || 0).toFixed(2)}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">{(it.basicValue || 0).toFixed(2)}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-center">{it.discPercent || '-'}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">{(it.freight || 0).toFixed(2)}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-center">{it.gstPercent || 0}%</td>
                <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">{(it.valueWithTax || 0).toFixed(2)}</td>
                <td className="border border-slate-200 px-1.5 py-1 text-right font-bold tabular-nums">{(it.totalGrnValue || 0).toFixed(2)}</td>
              </tr>
            ))}
            {grn.items.length === 0 && (
              <tr><td colSpan={16} className="border border-slate-200 px-2 py-4 text-center text-slate-400">No items added yet</td></tr>
            )}
            {grn.items.length > 0 && (
              <tr className="bg-slate-50 font-extrabold">
                <td className="border border-slate-200 px-1.5 py-1.5 text-center" colSpan={5}>TOTAL</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums">{totals.billed}</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums">{totals.received}</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums">{totals.accepted.toFixed(2)}</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums">{totals.rejected.toFixed(2)}</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums">{totals.short.toFixed(2)}</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums">{totals.basic.toFixed(2)}</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-center">-</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums">{totals.freight ? totals.freight.toFixed(2) : '-'}</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-center">-</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums">{totals.withTax.toFixed(2)}</td>
                <td className="border border-slate-200 px-1.5 py-1.5 text-right tabular-nums">{totals.total.toFixed(2)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Totals summary */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
        <table className="w-full border-collapse text-[11px]">
          <tbody>
            <tr><td className="border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-bold text-slate-600">Total PO Quantity</td><td className="border border-slate-200 px-2.5 py-1.5 text-right tabular-nums">{totals.billed}</td></tr>
            <tr><td className="border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-bold text-slate-600">Total Received Quantity</td><td className="border border-slate-200 px-2.5 py-1.5 text-right tabular-nums">{totals.received}</td></tr>
            <tr><td className="border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-bold text-slate-600">Total Accepted Quantity</td><td className="border border-slate-200 px-2.5 py-1.5 text-right tabular-nums">{totals.accepted.toFixed(2)}</td></tr>
            <tr><td className="border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-bold text-slate-600">Total Rejected Quantity</td><td className="border border-slate-200 px-2.5 py-1.5 text-right tabular-nums">{totals.rejected.toFixed(2)}</td></tr>
          </tbody>
        </table>
        <div className="border-2 rounded-lg px-4 py-3 flex items-center justify-between font-extrabold" style={{ borderColor: NAVY }}>
          <span className="text-sm">Total GRN Value (₹)</span>
          <span className="text-base" style={{ color: NAVY }}>
            ₹{totals.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Certification */}
      <div className="mt-3 text-center text-[11px] font-extrabold tracking-widest text-white py-1.5 rounded-t-md" style={{ backgroundColor: NAVY }}>
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
        ] as const).map(([label, signer]) => (
          <div key={label} className="border border-slate-200 rounded-lg px-3 py-2 text-[10.5px]">
            <div className="font-extrabold mb-1" style={{ color: NAVY }}>{label}</div>
            <div>Name: {signer?.name || '-'}</div>
            <div>Designation: {signer?.designation || '-'}</div>
            <div className="mt-3 border-t border-dashed border-slate-200 pt-1 text-slate-500">
              Date: {formatDate(signer?.timestamp) || '-'}
            </div>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <div className="mt-3 flex items-end justify-between text-[9.5px] text-slate-500">
        <div>
          <b>Note:</b>
          <ol className="list-decimal ml-4 mt-0.5">
            <li>This is a system generated document.</li>
            <li>No signature is required if digitally approved.</li>
          </ol>
        </div>
        <div className="w-12 h-12 border border-dashed border-slate-300 rounded flex items-center justify-center text-[9px] text-slate-400 shrink-0">
          QR
        </div>
      </div>
    </div>
  );
}

export default GrnDocumentPreview;
