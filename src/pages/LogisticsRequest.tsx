import { useEffect, useMemo, useState } from 'react';
import { Truck, PackageCheck, MapPin, ArrowRight, Loader2, ClipboardList, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import getBaseUrl from '@/lib/config';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  TransferSlipDocument,
  transferSlipDataFromStockTransfer as toSlipData,
  type StockTransfer,
} from '@/components/inventory/TransferSlipDocument';

const BASE_URL = getBaseUrl().replace(/\/$/, '');

type VehicleOption = {
  id: string;
  registrationNo: string;
  type: string;
  make: string;
  model: string;
  driverName: string;
  driverContact: string;
};

const STATUS_LABEL: Record<StockTransfer['logistics_status'], string> = {
  pending_vehicle: 'Awaiting Vehicle',
  pending_approval: 'Awaiting Approval',
  approved: 'Dispatched',
};
const STATUS_CLASS: Record<StockTransfer['logistics_status'], string> = {
  pending_vehicle: 'border-amber-200 bg-amber-50 text-amber-700',
  pending_approval: 'border-blue-200 bg-blue-50 text-blue-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

// ─────────────────────────────────────────────────────────────
// STOCK MOVE — deduct `qty` from the source store's batch list (in whatever
// order the backend already stores them, which encodes the item's issue
// method), and add a new batch of the same total quantity/weighted cost to
// the destination store.
// ─────────────────────────────────────────────────────────────
type DissociationBatch = { per_unit_cost: number; stock: number; po_number: string };
type RawDissociationEntry = Record<string, unknown>;

const moveDissociationQuantity = (
  raw: Record<string, RawDissociationEntry>,
  fromStore: string,
  toStore: string,
  qty: number,
  poReference: string,
): Record<string, RawDissociationEntry> => {
  const next: Record<string, RawDissociationEntry> = JSON.parse(JSON.stringify(raw || {}));
  const source: RawDissociationEntry = next[fromStore] || { quantity: 0 };
  const dest: RawDissociationEntry = next[toStore] || { quantity: 0 };

  // The batch-list key is supposed to reflect the item's issue method (e.g. "LIFO"),
  // but the backend seeds every item's dissociation entry with a literal "LIFO" key
  // at creation regardless of its configured stock_issue_method — so trusting the
  // declared method here can point at a key that doesn't exist, silently moving 0
  // stock. Detect whichever non-"quantity" key the source (or dest) entry actually
  // uses instead, matching how Inventory.tsx already reads this same data.
  const methodKey =
    Object.keys(source).find((key) => key !== 'quantity') ||
    Object.keys(dest).find((key) => key !== 'quantity') ||
    'LIFO';
  const sourceBatches: DissociationBatch[] = Array.isArray(source[methodKey]) ? source[methodKey] as DissociationBatch[] : [];
  const destBatches: DissociationBatch[] = Array.isArray(dest[methodKey]) ? dest[methodKey] as DissociationBatch[] : [];

  let remaining = qty;
  let movedCost = 0;
  const keptBatches: DissociationBatch[] = [];
  for (const batch of sourceBatches) {
    if (remaining <= 0) { keptBatches.push(batch); continue; }
    const stock = Number(batch.stock) || 0;
    const cost = Number(batch.per_unit_cost) || 0;
    if (stock <= remaining) {
      movedCost += stock * cost;
      remaining -= stock;
    } else {
      movedCost += remaining * cost;
      keptBatches.push({ ...batch, stock: stock - remaining });
      remaining = 0;
    }
  }
  const movedQty = qty - remaining;
  const avgCost = movedQty > 0 ? movedCost / movedQty : 0;

  source[methodKey] = keptBatches;
  source.quantity = Math.max(0, (Number(source.quantity) || 0) - movedQty);

  dest[methodKey] = [...destBatches, { per_unit_cost: Number(avgCost.toFixed(2)), stock: movedQty, po_number: poReference }];
  dest.quantity = (Number(dest.quantity) || 0) + movedQty;

  next[fromStore] = source;
  next[toStore] = dest;
  return next;
};

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const LogisticsRequest = () => {
  const { user } = useAuth();
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [transfersLoading, setTransfersLoading] = useState(true);
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [selectedVehicleByTransfer, setSelectedVehicleByTransfer] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const refreshTransfers = async () => {
    setTransfersLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/inventory/get_stock_transfers`);
      const data = await res.json().catch(() => null);
      if (!data?.success || !Array.isArray(data.transfers)) throw new Error('Unexpected response');
      // Rows created before multi-item transfers shipped still have a flat
      // item_id/item_name/... instead of `items: []` — migrate at the read
      // boundary so nothing downstream needs to guard against a missing array.
      setTransfers(data.transfers.map((raw: any) => (
        Array.isArray(raw.items) ? raw : {
          ...raw,
          items: raw.item_id ? [{
            item_id: raw.item_id,
            item_name: raw.item_name,
            item_code: raw.item_code,
            category: raw.category,
            unit: raw.unit,
            quantity: raw.quantity,
            available_stock: raw.available_stock,
          }] : [],
        }
      )));
    } catch {
      toast.error('Failed to load stock transfers');
    } finally {
      setTransfersLoading(false);
    }
  };

  useEffect(() => { refreshTransfers(); }, []);

  useEffect(() => {
    setVehiclesLoading(true);
    fetch(`${BASE_URL}/admin_vehicles/get_all_vehicles`)
      .then((res) => res.json())
      .then((data: unknown) => {
        const list = Array.isArray(data) ? data : [];
        setVehicleOptions(
          list
            .map((vehicle: any) => {
              const information = vehicle?.vehicle_information ?? {};
              const assigned = Array.isArray(vehicle?.assigned_staff) ? vehicle.assigned_staff[0] : vehicle?.assigned_staff;
              const staffInformation = assigned?.staff_information ?? assigned ?? {};
              return {
                id: String(vehicle?.vehicle_id ?? ''),
                registrationNo: String(information?.vehicle_number ?? '').trim(),
                type: String(information?.type ?? '').trim(),
                make: String(information?.company ?? '').trim(),
                model: String(information?.model ?? '').trim(),
                driverName: String(
                  staffInformation?.staff_name ?? staffInformation?.name ?? staffInformation?.full_name ?? assigned?.staff_name ?? '',
                ).trim(),
                driverContact: String(
                  staffInformation?.staff_phone ?? staffInformation?.phone ?? staffInformation?.contact ?? assigned?.staff_phone ?? '',
                ).trim(),
              };
            })
            .filter((vehicle: VehicleOption) => vehicle.id && vehicle.registrationNo),
        );
      })
      .catch(() => toast.error('Failed to load fleet vehicles'))
      .finally(() => setVehiclesLoading(false));
  }, []);


  const pendingVehicle = useMemo(() => transfers.filter((t) => t.logistics_status === 'pending_vehicle'), [transfers]);
  const pendingApproval = useMemo(() => transfers.filter((t) => t.logistics_status === 'pending_approval'), [transfers]);
  const approved = useMemo(() => transfers.filter((t) => t.logistics_status === 'approved'), [transfers]);

  const selectedTransfer = useMemo(
    () => transfers.find((t) => t.transfer_id === selectedTransferId) ?? null,
    [transfers, selectedTransferId],
  );

  const assignVehicle = async (transfer: StockTransfer) => {
    const vehicleId = selectedVehicleByTransfer[transfer.transfer_id];
    const vehicle = vehicleOptions.find((v) => v.id === vehicleId);
    if (!vehicle) return toast.error('Select a vehicle');
    setSubmittingId(transfer.transfer_id);
    try {
      const res = await fetch(`${BASE_URL}/inventory/assign_stock_transfer_vehicle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transfer_id: transfer.transfer_id,
          vehicle_id: vehicle.id,
          vehicle_number: vehicle.registrationNo,
          vehicle_type: vehicle.type,
          vehicle_make: vehicle.make,
          vehicle_model: vehicle.model,
          driver_name: vehicle.driverName,
          driver_contact: vehicle.driverContact,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.detail || 'Failed to assign vehicle');
      toast.success(`Vehicle assigned to ${transfer.transfer_slip_number}`);
      refreshTransfers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to assign vehicle');
    } finally {
      setSubmittingId(null);
    }
  };

  const approveLogistics = async (transfer: StockTransfer) => {
    if (!user?.id || !user?.name) return toast.error('You must be logged in to approve');
    setSubmittingId(transfer.transfer_id);
    try {
      const approveRes = await fetch(`${BASE_URL}/inventory/approve_stock_transfer_logistics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transfer_id: transfer.transfer_id,
          staff_id: user.id,
          staff_name: user.name,
          staff_designation: user.designation || '—',
        }),
      });
      const approveData = await approveRes.json().catch(() => null);
      if (!approveRes.ok || !approveData?.success) throw new Error(approveData?.detail || 'Failed to approve logistics');

      // New task on the assigned vehicle's Fleet Chart schedule for the transfer date.
      const activitySummary = transfer.items.length === 1
        ? `${transfer.items[0].item_name} (${transfer.items[0].quantity} ${transfer.items[0].unit})`
        : `${transfer.items.length} items`;
      try {
        await fetch(`${BASE_URL}/admin_vehicles/save_logistics_plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicle_id: transfer.vehicle_id,
            plan: {
              [transfer.transfer_date]: {
                plans: [{
                  activity: `Stock Transfer: ${activitySummary} — ${transfer.source_store} to ${transfer.destination_store}`,
                  status: 'pending',
                }],
              },
            },
          }),
        });
      } catch {
        toast.error('Logistics approved, but failed to add a Fleet Chart task');
      }

      // Actually move the stock between warehouses — one dissociation move per line item.
      try {
        for (const line of transfer.items) {
          const dissRes = await fetch(`${BASE_URL}/inventory/get_inventory_item_dissociation/${line.item_id}`);
          const dissData = await dissRes.json().catch(() => null);
          const rawDissociation: Record<string, RawDissociationEntry> = dissData?.success && dissData.dissociation ? dissData.dissociation : {};
          const updatedDissociation = moveDissociationQuantity(
            rawDissociation, transfer.source_store, transfer.destination_store, line.quantity, transfer.transfer_slip_number,
          );
          const updateRes = await fetch(`${BASE_URL}/inventory/update_inventory_item_dissosiation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              item_id: line.item_id,
              dissociation: updatedDissociation,
              issue_slipt_id: transfer.transfer_slip_number,
              from_store: transfer.source_store,
              to_store: transfer.destination_store,
              quantity: line.quantity,
            }),
          });
          const updateData = await updateRes.json().catch(() => null);
          if (!updateRes.ok || !updateData?.success) {
            throw new Error(updateData?.detail || `Failed to move stock for ${line.item_name}`);
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Logistics approved, but failed to move stock between warehouses');
      }

      toast.success(`${transfer.transfer_slip_number} approved — stock transfer complete`);
      refreshTransfers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to approve logistics');
    } finally {
      setSubmittingId(null);
    }
  };

  const rejectLogistics = async (transfer: StockTransfer) => {
    if (!user?.id || !user?.name) return toast.error('You must be logged in to reject');
    if (!rejectReason.trim()) return toast.error('Enter a reason for rejecting');
    setSubmittingId(transfer.transfer_id);
    try {
      const res = await fetch(`${BASE_URL}/inventory/reject_stock_transfer_logistics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transfer_id: transfer.transfer_id,
          staff_id: user.id,
          staff_name: user.name,
          reason: rejectReason.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.detail || 'Failed to reject');
      toast.success(`${transfer.transfer_slip_number} sent back for a new vehicle`);
      setShowRejectReason(false);
      setRejectReason('');
      refreshTransfers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reject');
    } finally {
      setSubmittingId(null);
    }
  };

  const TransferCard = ({ transfer }: { transfer: StockTransfer }) => (
    <button
      type="button"
      onClick={() => setSelectedTransferId(transfer.transfer_id)}
      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-left shadow-[0_14px_40px_rgba(15,23,42,0.05)] transition hover:border-[#0D3A35]/30 hover:shadow-[0_14px_40px_rgba(15,23,42,0.1)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <div>
          <p className="text-sm font-bold text-slate-950">{transfer.transfer_slip_number}</p>
          <p className="text-[11px] font-medium text-slate-500">{formatDate(transfer.transfer_date)}</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <span>{transfer.source_store}</span>
          <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
          <span>{transfer.destination_store}</span>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <PackageCheck className="h-4 w-4 text-[#0D3A35]" />
          {transfer.items.length === 1 ? transfer.items[0].item_name : `${transfer.items.length} items`}
          {transfer.items.length === 1 && (
            <span className="text-xs font-semibold text-slate-400">({transfer.items[0].item_code || '—'})</span>
          )}
        </div>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          {transfer.items.length === 1
            ? `${transfer.items[0].quantity.toLocaleString()} ${transfer.items[0].unit}`
            : `${transfer.items.length} line items`} · Prepared by {transfer.prepared_by}
        </p>
        <p className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs font-bold text-[#0D3A35]">
          <FileText className="h-3.5 w-3.5" /> View Slip
        </p>
      </div>
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50/50 p-8 font-sans">
      <div className="flex items-center gap-4">
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-3 shadow-sm">
          <Truck className="h-7 w-7 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">Logistics Request</h1>
          <p className="mt-1 max-w-lg text-sm text-slate-500">
            Assign a vehicle to inventory-approved stock transfers, then approve for dispatch.
          </p>
        </div>
      </div>

      {transfersLoading ? (
        <div className="mt-10 flex items-center justify-center gap-2 text-sm font-semibold text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading stock transfers…
        </div>
      ) : transfers.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <ClipboardList className="h-10 w-10 text-slate-200" />
          <p className="text-sm font-semibold text-slate-600">No stock transfers yet</p>
          <p className="max-w-xs text-xs text-slate-400">
            Transfers show up here once they're approved in the Inventory Approvals module.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <section>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
              Awaiting Vehicle ({pendingVehicle.length})
            </h2>
            {pendingVehicle.length === 0 ? (
              <p className="text-xs font-semibold text-slate-400">Nothing waiting on a vehicle right now.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {pendingVehicle.map((transfer) => <TransferCard key={transfer.transfer_id} transfer={transfer} />)}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
              Awaiting Logistics Approval ({pendingApproval.length})
            </h2>
            {pendingApproval.length === 0 ? (
              <p className="text-xs font-semibold text-slate-400">Nothing waiting on approval right now.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {pendingApproval.map((transfer) => <TransferCard key={transfer.transfer_id} transfer={transfer} />)}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-500">
              <MapPin className="h-3.5 w-3.5" /> Dispatched ({approved.length})
            </h2>
            {approved.length === 0 ? (
              <p className="text-xs font-semibold text-slate-400">No completed transfers yet.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {approved.map((transfer) => <TransferCard key={transfer.transfer_id} transfer={transfer} />)}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Slip popup — single pane: the slip itself, plus a status-specific action footer.
          Vehicle/driver details now render inside the slip's own Logistics Details section
          once assigned, so there's no separate summary panel duplicating the slip. */}
      <Dialog
        open={!!selectedTransfer}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTransferId(null);
            setShowRejectReason(false);
            setRejectReason('');
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl border-0 bg-slate-100 p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Stock Transfer Slip</DialogTitle>
          </DialogHeader>
          {selectedTransfer && (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-6 py-4">
                <div>
                  <p className="text-sm font-bold text-slate-950">{selectedTransfer.transfer_slip_number}</p>
                  <p className="text-[11px] font-medium text-slate-500">Logistics</p>
                </div>
                <span className={cn('rounded-full border px-2.5 py-1 text-[10px] font-bold', STATUS_CLASS[selectedTransfer.logistics_status])}>
                  {STATUS_LABEL[selectedTransfer.logistics_status]}
                </span>
              </div>

              <div className="p-5">
                <TransferSlipDocument data={toSlipData(selectedTransfer)} />
              </div>

              {selectedTransfer.logistics_status === 'pending_vehicle' && (
                <div className="border-t border-slate-200 bg-white px-6 py-4">
                  <p className="mb-2 text-xs font-bold text-slate-700">Assign a Vehicle</p>
                  <select
                    value={selectedVehicleByTransfer[selectedTransfer.transfer_id] ?? ''}
                    onChange={(event) => setSelectedVehicleByTransfer((prev) => ({ ...prev, [selectedTransfer.transfer_id]: event.target.value }))}
                    disabled={vehiclesLoading}
                    className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-[#0D3A35] disabled:bg-slate-50"
                  >
                    <option value="">{vehiclesLoading ? 'Loading vehicles…' : 'Select vehicle'}</option>
                    {vehicleOptions.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.registrationNo} · {[vehicle.type, vehicle.make, vehicle.model].filter(Boolean).join(' ')}
                      </option>
                    ))}
                  </select>
                  <Button
                    onClick={() => assignVehicle(selectedTransfer)}
                    disabled={submittingId === selectedTransfer.transfer_id}
                    className="mt-3 w-full gap-2 bg-[#0D3A35] font-bold text-white hover:bg-[#092e2a]"
                  >
                    {submittingId === selectedTransfer.transfer_id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Assign Vehicle
                  </Button>
                </div>
              )}

              {selectedTransfer.logistics_status === 'pending_approval' && (
                <>
                  {showRejectReason && (
                    <div className="border-t border-slate-200 bg-white px-6 py-4">
                      <p className="mb-2 text-xs font-bold text-slate-700">Reason for Rejection</p>
                      <textarea
                        value={rejectReason}
                        onChange={(event) => setRejectReason(event.target.value)}
                        rows={2}
                        placeholder="Why is this vehicle/driver being sent back?"
                        className="w-full resize-none rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-red-400"
                        autoFocus
                      />
                    </div>
                  )}
                  <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4">
                    {showRejectReason ? (
                      <>
                        <Button variant="outline" className="font-bold" onClick={() => { setShowRejectReason(false); setRejectReason(''); }}>
                          Cancel
                        </Button>
                        <Button
                          onClick={() => rejectLogistics(selectedTransfer)}
                          disabled={submittingId === selectedTransfer.transfer_id}
                          className="gap-2 bg-red-600 font-bold text-white hover:bg-red-700"
                        >
                          {submittingId === selectedTransfer.transfer_id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Confirm Reject
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          className="border-red-200 font-bold text-red-600 hover:bg-red-50"
                          onClick={() => setShowRejectReason(true)}
                        >
                          Reject
                        </Button>
                        <Button
                          onClick={() => approveLogistics(selectedTransfer)}
                          disabled={submittingId === selectedTransfer.transfer_id}
                          className="gap-2 bg-[#0D3A35] font-bold text-white hover:bg-[#092e2a]"
                        >
                          {submittingId === selectedTransfer.transfer_id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Approve &amp; Dispatch
                        </Button>
                      </>
                    )}
                  </DialogFooter>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LogisticsRequest;
