import type { InventoryTransferApproval } from '@/lib/inventoryApprovalStore';
import { SignatureBox, type SignatureData } from './SignatureBox';
import logo3f from '@/Assets/3f-logo.png';

// SAI Bioresources' fixed letterhead — same as the WCC certificate header.
const COMPANY_NAME = 'SAI BIORESOURCES PRIVATE LIMITED';
const COMPANY_ADDRESS = 'Khasra No. 121/1, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh – 491001';

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const docLabelCls = 'text-[8px] font-bold uppercase tracking-wide text-slate-400';

export interface TransferSlipLineItem {
  itemName: string;
  itemCode: string;
  unit: string;
  quantity: number;
  availableStock: number;
}

// Normalized view model — deliberately decoupled from any one data source, so this
// document can be fed from the localStorage inventoryApprovalStore record (Inventory
// page, Inventory Approvals) or the backend admin_inventory_stock_transfer record
// (Logistics Request) without either caller reshaping itself to match the other.
export interface TransferSlipViewData {
  transferSlipNumber: string;
  creationDate: string;
  transferDate: string;
  sourceStore: string;
  destinationStore: string;
  preparedBy: string;
  items: TransferSlipLineItem[];
  remarks: string;
  storeManagerSignature: SignatureData;
  headOfOperationsSignature: SignatureData;
  logisticsManagerSignature: SignatureData;
  // Only known once a vehicle has been assigned in the Logistics Request module —
  // the Logistics Details section only renders once vehicleNumber is set.
  vehicleNumber?: string;
  vehicleCompany?: string;
  vehicleModel?: string;
  driverName?: string;
  driverContact?: string;
}

// Maps the localStorage inventoryApprovalStore shape (used by the Inventory page's
// slip viewer and Inventory Approvals) into the normalized view model. The Logistics
// Request page builds its own mapping straight from the backend record instead.
export const transferSlipDataFromApproval = (record: InventoryTransferApproval): TransferSlipViewData => {
  const transfer = record.transfer;

  const storeManagerSignature: SignatureData = transfer.storeManagerSignature
    ? {
      staffName: transfer.storeManagerSignature.staffName,
      staffDesignation: transfer.storeManagerSignature.staffDesignation,
      signedAt: transfer.storeManagerSignature.signedAt,
    }
    : null;

  const headOfOperationsSignature: SignatureData = record.status === 'approved' && record.digitalSignature
    ? {
      staffName: record.approverName,
      staffDesignation: record.approverDesignation,
      signedAt: record.digitalSignature.signedAt,
    }
    : null;

  return {
    transferSlipNumber: transfer.transferSlipNumber,
    creationDate: transfer.creationDate,
    transferDate: transfer.transferDate,
    sourceStore: transfer.sourceStore,
    destinationStore: transfer.destinationStore,
    preparedBy: record.preparedBy,
    items: transfer.items.map((line) => ({
      itemName: line.itemName,
      itemCode: line.itemCode,
      unit: line.unit,
      quantity: line.quantity,
      availableStock: line.availableStock,
    })),
    remarks: transfer.remarks,
    storeManagerSignature,
    headOfOperationsSignature,
    logisticsManagerSignature: null,
  };
};

// Mirrors a row from the backend admin_inventory_stock_transfer table (GET
// /inventory/get_stock_transfers) — used by the Logistics Request page and the
// Inventory Request tab's Issue Slip Directory, so both read the same shape.
export type StockTransferSignature = {
  staff_id: string;
  staff_name: string;
  staff_designation: string;
  signed_at: string;
};

export type StockTransferLineItem = {
  item_id: string;
  item_name: string;
  item_code: string;
  category: string;
  unit: string;
  quantity: number;
  available_stock: number;
};

export type StockTransfer = {
  transfer_id: string;
  transfer_slip_number: string;
  creation_date: string;
  transfer_date: string;
  items: StockTransferLineItem[];
  source_store: string;
  destination_store: string;
  remarks: string;
  prepared_by: string;
  prepared_by_id: string;
  store_manager: StockTransferSignature;
  head_of_operations: StockTransferSignature;
  logistics_status: 'pending_vehicle' | 'pending_approval' | 'approved';
  vehicle_id: string;
  vehicle_number: string;
  vehicle_type: string;
  vehicle_make: string;
  vehicle_model: string;
  driver_name: string;
  driver_contact: string;
  logistics_manager: StockTransferSignature | null;
  created_at: string;
};

const toSignatureData = (signature: StockTransferSignature | null): SignatureData =>
  signature
    ? { staffName: signature.staff_name, staffDesignation: signature.staff_designation, signedAt: signature.signed_at }
    : null;

// Maps a backend admin_inventory_stock_transfer record into the normalized view model.
export const transferSlipDataFromStockTransfer = (transfer: StockTransfer): TransferSlipViewData => ({
  transferSlipNumber: transfer.transfer_slip_number,
  creationDate: transfer.creation_date,
  transferDate: transfer.transfer_date,
  sourceStore: transfer.source_store,
  destinationStore: transfer.destination_store,
  preparedBy: transfer.prepared_by,
  items: transfer.items.map((line) => ({
    itemName: line.item_name,
    itemCode: line.item_code,
    unit: line.unit,
    quantity: line.quantity,
    availableStock: line.available_stock,
  })),
  remarks: transfer.remarks,
  storeManagerSignature: toSignatureData(transfer.store_manager),
  headOfOperationsSignature: toSignatureData(transfer.head_of_operations),
  logisticsManagerSignature: toSignatureData(transfer.logistics_manager),
  vehicleNumber: transfer.vehicle_number || undefined,
  vehicleCompany: transfer.vehicle_make || undefined,
  vehicleModel: transfer.vehicle_model || undefined,
  driverName: transfer.driver_name || undefined,
  driverContact: transfer.driver_contact || undefined,
});

// The read-only "Stock Transfer Slip" document — same visual design as the
// Transfer Stock creation popup (letterhead, small fonts, item table, no
// vehicle section, {name}|{designation}|{time}|{date}|Approved signature
// boxes), shared by every place a transfer slip is viewed so they can never
// visually drift apart.
export const TransferSlipDocument = ({ data }: { data: TransferSlipViewData }) => (
  <div className="mx-auto w-full max-w-[680px] overflow-hidden rounded-lg border-2 border-gray-800 bg-white text-[10px] text-slate-800 shadow-[0_18px_50px_rgba(15,23,42,0.15)]">
    {/* Letterhead */}
    <div className="border-b-2 border-gray-800 px-4 py-3 text-center">
      <img src={logo3f} alt="3F Logo" className="mx-auto mb-1 h-10 w-auto" />
      <h1 className="text-sm font-bold tracking-wide text-slate-900">{COMPANY_NAME}</h1>
      <p className="mt-0.5 text-[9px] text-slate-600">{COMPANY_ADDRESS}</p>
      <h2 className="mt-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-900">Stock Transfer Slip</h2>
    </div>

    {/* Slip No. / Date of Creation / Date of Transfer */}
    <div className="grid grid-cols-3 border-b border-gray-300">
      <div className="border-r border-gray-300 p-2">
        <p className={docLabelCls}>Slip No.</p>
        <p className="mt-1 font-bold text-[#0D3A35]">{data.transferSlipNumber}</p>
      </div>
      <div className="border-r border-gray-300 p-2">
        <p className={docLabelCls}>Date of Creation</p>
        <p className="mt-1 font-bold text-slate-800">{formatDate(data.creationDate)}</p>
      </div>
      <div className="p-2">
        <p className={docLabelCls}>Date of Transfer</p>
        <p className="mt-1 font-bold text-slate-800">{formatDate(data.transferDate)}</p>
      </div>
    </div>

    {/* From / To / Prepared By */}
    <div className="grid grid-cols-3 border-b border-gray-300">
      <div className="border-r border-gray-300 p-2">
        <p className={docLabelCls}>From</p>
        <p className="mt-1 font-bold text-slate-800">{data.sourceStore}</p>
      </div>
      <div className="border-r border-gray-300 p-2">
        <p className={docLabelCls}>To</p>
        <p className="mt-1 font-bold text-slate-800">{data.destinationStore}</p>
      </div>
      <div className="p-2">
        <p className={docLabelCls}>Prepared By</p>
        <p className="mt-1 font-bold text-slate-800">{data.preparedBy}</p>
      </div>
    </div>

    {/* Item table */}
    <div className="border-b border-gray-300 bg-slate-100 px-2.5 py-1 text-center text-[9px] font-bold uppercase tracking-wide text-slate-600">
      {data.items.length > 1 ? 'Items Being Transferred' : 'Item Being Transferred'}
    </div>
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-slate-800 text-white">
          <th className="px-2.5 py-1.5 text-left font-semibold">S.No</th>
          <th className="px-2.5 py-1.5 text-left font-semibold">Item</th>
          <th className="px-2.5 py-1.5 text-left font-semibold">Item Code</th>
          <th className="px-2.5 py-1.5 text-center font-semibold">UOM</th>
          <th className="px-2.5 py-1.5 text-right font-semibold">Quantity</th>
          <th className="px-2.5 py-1.5 text-right font-semibold">Available Stock</th>
        </tr>
      </thead>
      <tbody>
        {data.items.map((line, index) => (
          <tr key={`${line.itemCode}-${index}`} className="border-b border-gray-200 last:border-b-0">
            <td className="px-2.5 py-1.5">{index + 1}</td>
            <td className="px-2.5 py-1.5 font-bold">{line.itemName}</td>
            <td className="px-2.5 py-1.5">{line.itemCode || '—'}</td>
            <td className="px-2.5 py-1.5 text-center">{line.unit}</td>
            <td className="px-2.5 py-1.5 text-right font-bold">{line.quantity.toLocaleString('en-IN')}</td>
            <td className="px-2.5 py-1.5 text-right text-slate-500">{line.availableStock.toLocaleString('en-IN')}</td>
          </tr>
        ))}
      </tbody>
    </table>

    {/* Logistics Details — only once a vehicle has been assigned */}
    {data.vehicleNumber && (
      <>
        <div className="border-b border-gray-300 bg-slate-100 px-2.5 py-1 text-center text-[9px] font-bold uppercase tracking-wide text-slate-600">
          Logistics Details
        </div>
        <table className="w-full border-collapse">
          <tbody>
            {[
              ['Vehicle Number', data.vehicleNumber || '—'],
              ['Vehicle Company', data.vehicleCompany || '—'],
              ['Vehicle Model', data.vehicleModel || '—'],
              ["Driver's Name", data.driverName || '—'],
              ["Driver's Contact", data.driverContact || '—'],
            ].map(([label, value]) => (
              <tr key={label} className="border-b border-gray-200 last:border-b-0">
                <td className="w-1/3 border-r border-gray-200 bg-slate-50 px-2.5 py-1.5 font-semibold">{label}</td>
                <td className="px-2.5 py-1.5 font-bold text-slate-800">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )}

    {/* Approval */}
    <div className="border-y border-gray-300 bg-slate-100 px-2.5 py-1 text-center text-[9px] font-bold uppercase tracking-wide text-slate-600">
      Approval
    </div>
    <div className="grid grid-cols-3 gap-2 p-2">
      <SignatureBox role="Store Manager" signature={data.storeManagerSignature} />
      <SignatureBox role="Head of Operations" signature={data.headOfOperationsSignature} />
      <div>
        <SignatureBox role="Logistics Manager" signature={data.logisticsManagerSignature} className={data.logisticsManagerSignature ? undefined : 'border-dashed'} />
        {!data.logisticsManagerSignature && (
          <p className="mt-1 text-center text-[7px] font-semibold text-slate-400">Assigned in Logistics module</p>
        )}
      </div>
    </div>

    {/* Remarks */}
    <div className="border-t border-gray-300 p-2">
      <p className={docLabelCls}>Remarks / Handling Instructions</p>
      <p className="mt-1 min-h-8 text-[10px] leading-relaxed text-slate-700">{data.remarks || 'No additional remarks'}</p>
    </div>
  </div>
);

export default TransferSlipDocument;
