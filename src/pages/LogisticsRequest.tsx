import { useEffect, useMemo, useState } from 'react';
import { Truck, PackageCheck, MapPin, ArrowRight, Loader2, ClipboardList, FileText, CheckCircle2, Sprout } from 'lucide-react';
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

// ─────────────────────────────────────────────────────────────
// MATERIAL DISPATCH — task-driven requests to move dosage/equipment items from a
// warehouse to a field, queued whenever "Logistics required" is toggled on while
// assigning a cultivation task (see CultivationCalendar.tsx). Deliberately separate
// from the StockTransfer flow above (different shape, different destination — a farm,
// not another store), but reuses the same vehicle-availability calendar UI that
// CultivationCalendar.tsx's own "Select Vehicles" step already has, replicated here
// (not imported — it's defined inline there too) since a dropdown doesn't show whether
// a truck is actually free on the day it's needed.
// ─────────────────────────────────────────────────────────────

// One request per warehouse now (not per task) — "store" is the single source
// ("From"), farm_id is the single destination ("To"), matching how the backend
// splits a task's store_allocations into one task_material_dispatch row per store.
type MaterialDispatchItem = { equipment_id: string; equipment_name: string; quantity: number };
type MaterialDispatchRequest = {
  request_id: string;
  task_id: string;
  calander_id?: string;
  farm_id: string;
  store: string;
  type: string;
  activity: string;
  date: string;
  items: MaterialDispatchItem[];
  status: 'pending_vehicle' | 'dispatched';
  vehicle_id: string;
  vehicle_number: string;
  vehicle_type: string;
  vehicle_make: string;
  vehicle_model: string;
  driver_name: string;
  driver_contact: string;
  created_at: string;
};

// Same vehicle-availability grid shape as CultivationCalendar.tsx's Asset/schedule.
interface DispatchAsset {
  id: string;
  name: string;
  type: string;
  schedule: Record<string, number>;
}

const formatDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (dateStr: string, days: number): string => {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
};
const getDayName = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' });
const getDayNum = (dateStr: string) => new Date(dateStr).getDate();

// Normalizes the vehicle API's work_calandar (object-keyed-by-date or array form) into
// a plain { date: acresCovered } map — identical to CultivationCalendar.tsx's version.
const buildVehicleSchedule = (raw: unknown): Record<string, number> => {
  if (!raw) return {};
  if (!Array.isArray(raw) && typeof raw === 'object') {
    const schedule: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!k) continue;
      if (typeof v === 'string') {
        schedule[k] = 0;
      } else if (v && typeof v === 'object') {
        const acres = Number((v as Record<string, unknown>)?.acres_covered);
        schedule[k] = Number.isFinite(acres) ? acres : 0;
      } else {
        schedule[k] = 0;
      }
    }
    return schedule;
  }
  if (Array.isArray(raw)) {
    const schedule: Record<string, number> = {};
    for (const item of raw as Record<string, unknown>[]) {
      const date = item?.date || item?.day || item?.created_at;
      if (!date) continue;
      const acres = Number(item?.acres_covered);
      schedule[String(date).slice(0, 10)] = Number.isFinite(acres) ? acres : 0;
    }
    return schedule;
  }
  return {};
};

const itemsSummary = (items: MaterialDispatchItem[]) =>
  items.map((it) => `${it.equipment_name} (${it.quantity})`).join('; ');

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

  // Material dispatch — separate from the stock-transfer state above.
  const [dispatchRequests, setDispatchRequests] = useState<MaterialDispatchRequest[]>([]);
  const [dispatchRequestsLoading, setDispatchRequestsLoading] = useState(true);
  const [dispatchVehicles, setDispatchVehicles] = useState<DispatchAsset[]>([]);
  const [dispatchVehiclesLoading, setDispatchVehiclesLoading] = useState(false);
  const [selectedDispatchRequestId, setSelectedDispatchRequestId] = useState<string | null>(null);
  const [selectedDispatchVehicleId, setSelectedDispatchVehicleId] = useState<string>('');
  const [dispatchSubmittingId, setDispatchSubmittingId] = useState<string | null>(null);

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

  const refreshDispatchRequests = async () => {
    setDispatchRequestsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/admin_cultivation/get_material_dispatch_requests`);
      const data = await res.json().catch(() => null);
      if (!data?.success || !Array.isArray(data.requests)) throw new Error('Unexpected response');
      setDispatchRequests(data.requests as MaterialDispatchRequest[]);
    } catch {
      toast.error('Failed to load material dispatch requests');
    } finally {
      setDispatchRequestsLoading(false);
    }
  };

  useEffect(() => { refreshDispatchRequests(); }, []);

  // Fetched lazily when a dispatch request's vehicle-assignment popup opens — same
  // endpoint CultivationCalendar.tsx's own "Select Vehicles" step uses.
  const fetchDispatchVehicles = async () => {
    setDispatchVehiclesLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/admin_vehicles/get_all_vehicles`);
      const data: unknown = await res.json().catch(() => null);
      const list = Array.isArray(data) ? data : [];
      setDispatchVehicles(list.map((vehicle: any) => {
        const info = vehicle?.vehicle_information || {};
        const vehicleNumber = info?.vehicle_number || '';
        return {
          id: String(vehicle?.vehicle_id ?? ''),
          name: vehicleNumber || String(vehicle?.vehicle_id ?? ''),
          type: String(info?.type || 'Vehicle'),
          schedule: buildVehicleSchedule(vehicle?.work_calandar),
        };
      }).filter((v: DispatchAsset) => v.id));
    } catch {
      toast.error('Failed to load fleet vehicles');
      setDispatchVehicles([]);
    } finally {
      setDispatchVehiclesLoading(false);
    }
  };

  const pendingVehicle = useMemo(() => transfers.filter((t) => t.logistics_status === 'pending_vehicle'), [transfers]);
  const pendingApproval = useMemo(() => transfers.filter((t) => t.logistics_status === 'pending_approval'), [transfers]);
  const approved = useMemo(() => transfers.filter((t) => t.logistics_status === 'approved'), [transfers]);

  const selectedTransfer = useMemo(
    () => transfers.find((t) => t.transfer_id === selectedTransferId) ?? null,
    [transfers, selectedTransferId],
  );

  const pendingDispatch = useMemo(() => dispatchRequests.filter((r) => r.status === 'pending_vehicle'), [dispatchRequests]);
  const dispatchedRequests = useMemo(() => dispatchRequests.filter((r) => r.status === 'dispatched'), [dispatchRequests]);
  const selectedDispatchRequest = useMemo(
    () => dispatchRequests.find((r) => r.request_id === selectedDispatchRequestId) ?? null,
    [dispatchRequests, selectedDispatchRequestId],
  );
  // 5-day availability window anchored on the request's own delivery date, instead of a
  // clicked calendar cell (there's no month grid on this page).
  const dispatchChartDates = useMemo(() => {
    if (!selectedDispatchRequest?.date) return [];
    const dates: string[] = [];
    for (let i = 0; i < 5; i++) dates.push(addDays(selectedDispatchRequest.date, i));
    return dates;
  }, [selectedDispatchRequest?.date]);

  const openDispatchVehiclePicker = (request: MaterialDispatchRequest) => {
    setSelectedDispatchRequestId(request.request_id);
    setSelectedDispatchVehicleId('');
    fetchDispatchVehicles();
  };

  const assignDispatchVehicle = async (request: MaterialDispatchRequest) => {
    const vehicle = dispatchVehicles.find((v) => v.id === selectedDispatchVehicleId);
    if (!vehicle) return toast.error('Select a vehicle');
    setDispatchSubmittingId(request.request_id);
    try {
      const res = await fetch(`${BASE_URL}/admin_cultivation/assign_material_dispatch_vehicle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: request.request_id,
          vehicle_id: vehicle.id,
          vehicle_number: vehicle.name,
          vehicle_type: vehicle.type,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.detail || 'Failed to assign vehicle');

      // Two separate calendars need this booking, fed by two separate endpoints:
      // - work_calandar (on the vehicle record itself, via update_vehicle_calander) is what
      //   the "Select Vehicles" busy/free availability grids read (CultivationCalendar.tsx's
      //   own picker, and this page's dispatch-vehicle popup above).
      // - admin_logistics_plan (via save_logistics_plan) is what the actual Fleet Chart page
      //   (FleetChart.tsx, route /fleet-chart, GET get_logistics_plan) reads — a *different*
      //   page from LogisticsManagement.tsx, which was the wrong target for an earlier fix
      //   here. Both are best-effort; neither should block the vehicle assignment itself.
      const dispatchDescription = `Material Dispatch: ${itemsSummary(request.items)} — from ${request.store}`;
      try {
        await fetch(`${BASE_URL}/admin_vehicles/update_vehicle_calander`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicle_id: vehicle.id,
            date: request.date,
            acres_covered: 0,
            activity: 'Logistics Request',
            farm_id: request.farm_id,
            description: dispatchDescription,
            request_id: request.request_id,
          }),
        });
      } catch {
        toast.error('Vehicle assigned, but failed to add a Fleet Chart task');
      }
      try {
        await fetch(`${BASE_URL}/admin_vehicles/save_logistics_plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicle_id: vehicle.id,
            plan: {
              [request.date]: {
                plans: [{ activity: dispatchDescription, status: 'pending', farm_id: request.farm_id }],
              },
            },
          }),
        });
      } catch {
        toast.error('Vehicle assigned, but failed to add a Fleet Chart task');
      }

      toast.success(`Vehicle assigned to ${request.task_id}`);
      setSelectedDispatchRequestId(null);
      refreshDispatchRequests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to assign vehicle');
    } finally {
      setDispatchSubmittingId(null);
    }
  };

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

  const DispatchRequestCard = ({ request }: { request: MaterialDispatchRequest }) => (
    <button
      type="button"
      onClick={() => request.status === 'pending_vehicle' ? openDispatchVehiclePicker(request) : undefined}
      disabled={request.status !== 'pending_vehicle'}
      className={cn(
        'overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-left shadow-[0_14px_40px_rgba(15,23,42,0.05)] transition',
        request.status === 'pending_vehicle' ? 'hover:border-[#0D3A35]/30 hover:shadow-[0_14px_40px_rgba(15,23,42,0.1)]' : 'cursor-default',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">{request.type || 'Logistics Request'}</p>
          <p className="text-sm font-bold text-slate-950">{request.task_id}</p>
        </div>
        <p className="text-[11px] font-medium text-slate-500">{formatDate(request.date)}</p>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <span>{request.store}</span>
          <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
          <span>{request.farm_id}</span>
        </div>
        <div className="mt-2 flex items-start gap-2 text-sm font-bold text-slate-900">
          <Sprout className="mt-0.5 h-4 w-4 shrink-0 text-[#0D3A35]" />
          <span>{request.items.length === 1 ? request.items[0].equipment_name : `${request.items.length} items`}</span>
        </div>
        <div className="mt-1.5 space-y-0.5">
          {request.items.map((it) => (
            <p key={it.equipment_id} className="text-xs font-semibold text-slate-500">
              {it.equipment_name}: {it.quantity}
            </p>
          ))}
        </div>
        {request.status === 'pending_vehicle' ? (
          <p className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs font-bold text-[#0D3A35]">
            <Truck className="h-3.5 w-3.5" /> Assign Vehicle
          </p>
        ) : (
          <p className="mt-3 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500">
            {request.vehicle_number} · {request.driver_name || 'Driver not recorded'}
          </p>
        )}
      </div>
    </button>
  );

  // Same visual pattern as CultivationCalendar.tsx's VehicleAvailabilityRow — a 5-day
  // grid of busy (red, acres-covered) vs free (highlighted on the anchor day) cells.
  const DispatchVehicleAvailabilityRow = ({ asset, isSelected, onSelect }: { asset: DispatchAsset; isSelected: boolean; onSelect: () => void }) => (
    <div
      onClick={onSelect}
      className={cn(
        'grid grid-cols-[1.5fr_repeat(5,1fr)] gap-2 rounded-lg border p-2 transition-all cursor-pointer items-center group',
        isSelected ? 'border-[#0D3A35] bg-[#0D3A35]/5 ring-1 ring-[#0D3A35]/30' : 'border-border hover:border-[#0D3A35]/40',
      )}
    >
      <div className="flex items-center gap-3 pr-2">
        <div className={cn('rounded-md border p-2 shadow-sm', isSelected ? 'bg-[#0D3A35] text-white' : 'bg-white text-muted-foreground')}><Truck className="h-4 w-4" /></div>
        <div className="min-w-0"><div className="truncate text-sm font-semibold text-foreground">{asset.name}</div><div className="text-[10px] text-muted-foreground">{asset.type}</div></div>
      </div>
      {dispatchChartDates.map((date) => {
        const acresCovered = asset.schedule[date];
        const isBusy = acresCovered !== undefined;
        return (
          <div key={date} className="flex h-full items-center justify-center">
            {isBusy ? (
              <div className="group/tooltip relative flex h-8 w-full items-center justify-center rounded-md border border-red-200 bg-red-100">
                <span className="text-[10px] font-bold text-red-700">{Number(acresCovered || 0).toFixed(0)} ac</span>
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-black px-2 py-1 text-[10px] text-white opacity-0 group-hover/tooltip:opacity-100">Acres covered: {Number(acresCovered || 0).toFixed(2)}</div>
              </div>
            ) : (
              <div className={cn('flex h-8 w-full items-center justify-center rounded-md border transition-colors', date === dispatchChartDates[0] ? (isSelected ? 'border-[#0D3A35] bg-[#0D3A35] text-white' : 'border-[#0D3A35]/20 bg-[#0D3A35]/10 text-[#0D3A35]') : 'border-gray-100 bg-gray-50')}>
                {date === dispatchChartDates[0] && isSelected && <CheckCircle2 className="h-4 w-4" />}
                {date === dispatchChartDates[0] && !isSelected && <span className="text-[10px] font-bold">Free</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
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

      <div className="mt-8">
        <h2 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-500">
          <Sprout className="h-3.5 w-3.5" /> Material Dispatch Requests
        </h2>
        {dispatchRequestsLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm font-semibold text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading dispatch requests…
          </div>
        ) : dispatchRequests.length === 0 ? (
          <p className="text-xs font-semibold text-slate-400">
            Nothing queued yet — these show up when a cultivation task is assigned with "Logistics required" turned on.
          </p>
        ) : (
          <div className="space-y-6">
            <section>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Awaiting Vehicle ({pendingDispatch.length})
              </h3>
              {pendingDispatch.length === 0 ? (
                <p className="text-xs font-semibold text-slate-400">Nothing waiting on a vehicle right now.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {pendingDispatch.map((request) => <DispatchRequestCard key={request.request_id} request={request} />)}
                </div>
              )}
            </section>
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                <MapPin className="h-3.5 w-3.5" /> Dispatched ({dispatchedRequests.length})
              </h3>
              {dispatchedRequests.length === 0 ? (
                <p className="text-xs font-semibold text-slate-400">No completed dispatches yet.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {dispatchedRequests.map((request) => <DispatchRequestCard key={request.request_id} request={request} />)}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <div className="mt-10 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Stock Transfers</span>
        <div className="h-px flex-1 bg-slate-200" />
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

      {/* Material dispatch vehicle picker — the calendar view, not a dropdown, so whoever's
          assigning a truck can actually see who's free on the day the field needs it. */}
      <Dialog open={!!selectedDispatchRequest} onOpenChange={(open) => { if (!open) setSelectedDispatchRequestId(null); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl border-0 bg-slate-100 p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Assign Vehicle to Material Dispatch</DialogTitle>
          </DialogHeader>
          {selectedDispatchRequest && (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-6 py-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">{selectedDispatchRequest.type || 'Logistics Request'}</p>
                  <p className="text-sm font-bold text-slate-950">{selectedDispatchRequest.task_id}</p>
                </div>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">Awaiting Vehicle</span>
              </div>

              <div className="grid grid-cols-3 gap-3 border-b border-slate-200 bg-white px-6 py-4">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">From</p>
                  <p className="text-xs font-bold text-slate-800">{selectedDispatchRequest.store}</p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">To</p>
                  <p className="text-xs font-bold text-slate-800">{selectedDispatchRequest.farm_id}</p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">Date of Delivery</p>
                  <p className="text-xs font-bold text-slate-800">{formatDate(selectedDispatchRequest.date)}</p>
                </div>
              </div>

              <div className="space-y-1 border-b border-slate-200 bg-white px-6 py-4">
                <p className="mb-1.5 text-xs font-bold text-slate-700">Items to Move</p>
                {selectedDispatchRequest.items.map((it) => (
                  <p key={it.equipment_id} className="text-xs font-semibold text-slate-500">
                    {it.equipment_name}: {it.quantity}
                  </p>
                ))}
              </div>

              <div className="px-6 py-4">
                <p className="mb-2 text-xs font-bold text-slate-700">Select a Vehicle</p>
                <div className="overflow-x-auto rounded-lg border border-border bg-white p-4 shadow-sm">
                  <div className="min-w-[600px]">
                    <div className="mb-3 grid grid-cols-[1.5fr_repeat(5,1fr)] gap-2 text-xs font-semibold text-muted-foreground">
                      <div className="self-end pb-2">Vehicle</div>
                      {dispatchChartDates.map((date) => (
                        <div key={date} className={cn('border-b-2 pb-2 text-center', date === dispatchChartDates[0] ? 'border-[#0D3A35] text-[#0D3A35]' : 'border-transparent')}>
                          <div className="text-[10px] uppercase">{getDayName(date)}</div>
                          <div>{getDayNum(date)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      {dispatchVehiclesLoading ? (
                        <div className="p-4 text-sm text-muted-foreground">Loading vehicles…</div>
                      ) : dispatchVehicles.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground">No vehicles found.</div>
                      ) : (
                        dispatchVehicles.map((vehicle) => (
                          <DispatchVehicleAvailabilityRow
                            key={vehicle.id}
                            asset={vehicle}
                            isSelected={selectedDispatchVehicleId === vehicle.id}
                            onSelect={() => setSelectedDispatchVehicleId(vehicle.id)}
                          />
                        ))
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => assignDispatchVehicle(selectedDispatchRequest)}
                  disabled={dispatchSubmittingId === selectedDispatchRequest.request_id || !selectedDispatchVehicleId}
                  className="mt-3 w-full gap-2 bg-[#0D3A35] font-bold text-white hover:bg-[#092e2a]"
                >
                  {dispatchSubmittingId === selectedDispatchRequest.request_id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Assign & Dispatch
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LogisticsRequest;
