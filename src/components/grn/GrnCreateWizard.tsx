import { useEffect, useMemo, useState } from 'react';
import { Plus, X, Search } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';
import { useAuth } from '@/context/AuthContext';
import {
  createGrn,
  resubmitGrn,
  getGateEntries,
  type GrnOrderInfo,
  type GRNRecord,
  type GrnSigner,
  type GrnLineItemInput,
  type GateEntryRecord,
} from '@/lib/grnApi';
import { GrnDocumentPreview, type GrnDocumentData } from '@/components/grn/GrnDocumentPreview';

const EMPTY_NEW_ITEM = { unitPrice: '', billedQty: '', gstPercent: '18' };

// A selectable option in the "Add Item" inventory picker — mirrors the mapping in
// Inventory.tsx's get_all_item fetch, trimmed to what the GRN wizard needs.
type InventoryItemOption = {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  pipelineStock: number;
  lastUnitPrice: number;
};

async function fetchInventoryItems(): Promise<InventoryItemOption[]> {
  const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
  const res = await fetch(`${baseUrl}/inventory/get_all_item`);
  const data: { success?: boolean; items?: unknown[]; message?: string } | null = await res.json().catch(() => null);
  if (!res.ok || !data?.success || !Array.isArray(data?.items)) {
    throw new Error(data?.message || 'Failed to load inventory items');
  }
  return data.items
    .map((raw): InventoryItemOption => {
      const it = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const fifo = Array.isArray(it.fifo_list) ? (it.fifo_list as Record<string, unknown>[]) : [];
      const lastFifo = fifo.length ? fifo[fifo.length - 1] : null;
      return {
        id: String(it.Invent_id || it.new_item_code || ''),
        code: String(it.new_item_code || ''),
        name: String(it.item_name || ''),
        category: String(it.category || ''),
        unit: String(it.unit || ''),
        currentStock: Number(it.stock) || 0,
        pipelineStock: Number(it.stock_in_pipeline || it.pipeline_stock || 0),
        lastUnitPrice: lastFifo ? Number(lastFifo.per_unit_cost) || 0 : 0,
      };
    })
    .filter((it) => it.id);
}

export interface GrnCreateWizardProps {
  order: GrnOrderInfo;
  /** Present when revising a rejected ('needs_revision') GRN instead of creating a new one. */
  existingGrn?: GRNRecord | null;
  onDone: () => void;
  onCancel: () => void;
}

// An item on this GRN — items are never fetched from the PO (live orders don't carry
// item-level data); every one is added explicitly via the "+ Add Item" inventory picker,
// or (when revising) reconstructed from the rejected GRN's own item list.
type OrderItem = {
  id: string;
  itemCode?: string;
  description: string;
  uom: string;
  billedQty: number;
  unitPrice: number;
  location?: string;
};

type ItemValues = {
  selected: boolean;
  receivedQty: string;
  rejectedQty: string;
  discPercent: string;
  freight: string;
  gstPercent: string;
  pf: string;
};

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const orderItemsFromGrn = (grn?: GRNRecord | null): OrderItem[] =>
  (grn?.items || []).map((it) => ({
    id: it.itemId,
    itemCode: it.itemCode,
    description: it.description,
    uom: it.uom,
    billedQty: it.billedQty,
    unitPrice: it.unitPrice,
    location: it.location,
  }));

const initialValuesFor = (items: OrderItem[], existingGrn?: GRNRecord | null): Record<string, ItemValues> => {
  const map: Record<string, ItemValues> = {};
  for (const it of items) {
    const existing = existingGrn?.items.find((g) => g.itemId === it.id);
    map[it.id] = {
      selected: true,
      receivedQty: String(existing?.receivedQty ?? it.billedQty ?? 0),
      rejectedQty: String(existing?.rejectedQty ?? 0),
      discPercent: String(existing?.discPercent ?? 0),
      freight: String(existing?.freight ?? 0),
      gstPercent: String(existing?.gstPercent ?? 18),
      pf: String(existing?.pf ?? 0),
    };
  }
  return map;
};

const STEP_LABELS = ['Select Items', 'Enter Values', 'Mark Gate Entry', 'Final Preview'] as const;
type Step = 1 | 2 | 3 | 4;

const Checkmark = ({ checked }: { checked: boolean }) => (
  <div className={cn(
    'shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
    checked ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300 bg-white',
  )}>
    {checked && (
      <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
        <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
  </div>
);

const CellInput = ({ value, onChange, width = 'w-20' }: { value: string; onChange: (v: string) => void; width?: string }) => (
  <input
    type="text"
    inputMode="decimal"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={cn(
      'h-8 rounded-lg border border-gray-200 bg-white px-2 text-right text-xs tabular-nums text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400',
      width,
    )}
  />
);

export function GrnCreateWizard({ order, existingGrn, onDone, onCancel }: GrnCreateWizardProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [orderItems, setOrderItems] = useState<OrderItem[]>(() => orderItemsFromGrn(existingGrn));
  const [values, setValues] = useState<Record<string, ItemValues>>(() => initialValuesFor(orderItemsFromGrn(existingGrn), existingGrn));
  const [busy, setBusy] = useState(false);
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [newItem, setNewItem] = useState({ ...EMPTY_NEW_ITEM });

  // Inventory picker for the "Add Item" card — item identity (code/description/UOM) comes
  // from the selected inventory record rather than being typed in.
  const [inventoryItems, setInventoryItems] = useState<InventoryItemOption[]>([]);
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<InventoryItemOption | null>(null);

  useEffect(() => {
    if (!isAddItemOpen || inventoryItems.length > 0) return;
    setIsLoadingInventory(true);
    fetchInventoryItems()
      .then(setInventoryItems)
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to load inventory items'))
      .finally(() => setIsLoadingInventory(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAddItemOpen]);

  const filteredInventoryItems = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();
    if (!q) return inventoryItems;
    return inventoryItems.filter((it) => (
      it.name.toLowerCase().includes(q) ||
      it.code.toLowerCase().includes(q) ||
      it.category.toLowerCase().includes(q)
    ));
  }, [inventoryItems, inventorySearch]);

  const selectInventoryItem = (item: InventoryItemOption) => {
    setSelectedInventoryItem(item);
    setNewItem((p) => ({ ...p, unitPrice: item.lastUnitPrice > 0 ? String(item.lastUnitPrice) : '' }));
  };

  const closeAddItemModal = () => {
    setIsAddItemOpen(false);
    setNewItem({ ...EMPTY_NEW_ITEM });
    setSelectedInventoryItem(null);
    setInventorySearch('');
  };

  const setItem = (id: string, patch: Partial<ItemValues>) => {
    setValues((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const selectedItems = useMemo(
    () => orderItems.filter((it) => values[it.id]?.selected),
    [orderItems, values],
  );

  const handleAddItem = () => {
    if (!selectedInventoryItem) { toast.error('Please select an inventory item'); return; }
    const unitPrice = num(newItem.unitPrice);
    const billedQty = num(newItem.billedQty);
    if (!unitPrice || unitPrice <= 0) { toast.error('Please enter a valid unit price'); return; }
    if (!billedQty || billedQty <= 0) { toast.error('Please enter a valid quantity'); return; }

    const added: OrderItem = {
      id: `${selectedInventoryItem.id}-${Date.now()}`,
      itemCode: selectedInventoryItem.code || undefined,
      description: selectedInventoryItem.name,
      uom: selectedInventoryItem.unit,
      billedQty,
      unitPrice,
    };
    setOrderItems((prev) => [...prev, added]);
    setValues((prev) => ({
      ...prev,
      [added.id]: {
        selected: true,
        receivedQty: String(billedQty),
        rejectedQty: '0',
        discPercent: '0',
        freight: '0',
        gstPercent: String(num(newItem.gstPercent) || 18),
        pf: '0',
      },
    }));
    toast.success('Item added');
    closeAddItemModal();
  };

  const computed = useMemo(() => selectedItems.map((it) => {
    const v = values[it.id];
    const receivedQty = num(v.receivedQty);
    const rejectedQty = num(v.rejectedQty);
    const shortQty = Math.max(0, (it.billedQty || 0) - receivedQty - rejectedQty);
    const grossBasic = (it.unitPrice || 0) * receivedQty;
    const discPercent = num(v.discPercent);
    const basicValue = grossBasic * (1 - discPercent / 100);
    const freight = num(v.freight);
    const gstPercent = num(v.gstPercent);
    const gstAmount = (basicValue + freight) * (gstPercent / 100);
    const valueWithTax = basicValue + freight + gstAmount;
    const pf = num(v.pf);
    const totalGrnValue = valueWithTax + pf;
    return { item: it, receivedQty, rejectedQty, shortQty, basicValue, discPercent, freight, gstPercent, gstAmount, valueWithTax, pf, totalGrnValue };
  }), [selectedItems, values]);

  // ── Step 3: Mark Gate Entry ──
  const [gateEntries, setGateEntries] = useState<GateEntryRecord[]>([]);
  const [isLoadingGateEntries, setIsLoadingGateEntries] = useState(false);
  const [selectedGateEntryIds, setSelectedGateEntryIds] = useState<string[]>(existingGrn?.gateEntryIds ?? []);

  useEffect(() => {
    setIsLoadingGateEntries(true);
    getGateEntries()
      .then(setGateEntries)
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to load gate entries'))
      .finally(() => setIsLoadingGateEntries(false));
  }, []);

  // Entries logged against this PO that are either still unused, or already locked to this
  // very GRN (relevant when revising a rejected GRN — its own entries were released back to
  // "available" on reject, but may also still show as locked to this grn_number briefly).
  const gateEntriesForOrder = useMemo(
    () => gateEntries.filter((ge) => (
      ge.orderNumber === order.poNo &&
      (!ge.usedInGrn || ge.usedInGrn === existingGrn?.grnNo)
    )),
    [gateEntries, order.poNo, existingGrn?.grnNo],
  );

  const toggleGateEntry = (enteryId: string) => {
    setSelectedGateEntryIds((prev) => (
      prev.includes(enteryId) ? prev.filter((id) => id !== enteryId) : [...prev, enteryId]
    ));
  };

  // ── Step 4: Final Preview — a live "draft" of the actual GRN document, built from
  // whatever's been picked so far. Mirrors the backend's own gate-entry aggregation
  // (admin_grn_inspection.py's _aggregate_gate_entry_fields) so the preview matches what
  // create_grn will actually produce.
  const selectedGateEntries = useMemo(
    () => gateEntries.filter((ge) => selectedGateEntryIds.includes(ge.enteryId)),
    [gateEntries, selectedGateEntryIds],
  );

  const draftGrn = useMemo<GrnDocumentData>(() => {
    const joined = (pick: (ge: GateEntryRecord) => string | undefined) =>
      Array.from(new Set(selectedGateEntries.map(pick).filter((v): v is string => !!v))).sort().join(', ');

    return {
      poNo: order.poNo,
      poDate: order.poDate,
      prNo: order.prNo,
      prDate: order.prDate,
      prBy: order.prBy,
      vendorId: order.vendorId,
      vendorName: order.vendorName,
      vendorAddress: order.vendorAddress,
      department: order.department,
      group: order.group,
      geNo: selectedGateEntries.map((ge) => ge.enteryId).sort().join(', '),
      geDate: joined((ge) => ge.entryDate),
      invNo: joined((ge) => ge.invoiceNumber),
      invDate: joined((ge) => ge.invoiceDate),
      challanNo: joined((ge) => ge.challanNumber),
      challanDate: joined((ge) => ge.challanDate),
      lrNo: joined((ge) => ge.lrNumber),
      lrDate: joined((ge) => ge.lrDate),
      items: computed.map((c) => ({
        itemId: c.item.id,
        itemCode: c.item.itemCode,
        description: c.item.description,
        uom: c.item.uom,
        billedQty: c.item.billedQty,
        receivedQty: c.receivedQty,
        rejectedQty: c.rejectedQty,
        shortQty: c.shortQty,
        unitPrice: c.item.unitPrice,
        basicValue: c.basicValue,
        discPercent: c.discPercent,
        freight: c.freight,
        gstPercent: c.gstPercent,
        gstAmount: c.gstAmount,
        valueWithTax: c.valueWithTax,
        pf: c.pf,
        totalGrnValue: c.totalGrnValue,
        location: c.item.location,
      })),
      status: 'pending_verification',
      preparedBy: user?.id ? { staffId: user.id, name: user.name || '', designation: user.designation || '', timestamp: new Date().toISOString() } : undefined,
      verifiedBy: existingGrn?.verifiedBy,
      approvedBy: existingGrn?.approvedBy,
    };
  }, [order, selectedGateEntries, computed, user, existingGrn]);

  const goNext = () => {
    if (step === 1 && selectedItems.length === 0) { toast.error('Select at least one item to continue'); return; }
    if (step === 3 && selectedGateEntryIds.length === 0) { toast.error('Mark at least one gate entry to continue'); return; }
    setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  };
  const goBack = () => setStep((s) => (s > 1 ? ((s - 1) as Step) : s));

  const handleSubmit = async () => {
    if (!user?.id || !user?.name) { toast.error('You must be logged in.'); return; }
    if (selectedGateEntryIds.length === 0) { toast.error('Mark at least one gate entry'); return; }

    const items: GrnLineItemInput[] = computed.map((c) => ({
      itemId: c.item.id,
      itemCode: c.item.itemCode,
      description: c.item.description,
      uom: c.item.uom,
      billedQty: c.item.billedQty,
      receivedQty: c.receivedQty,
      rejectedQty: c.rejectedQty,
      shortQty: c.shortQty,
      unitPrice: c.item.unitPrice,
      basicValue: c.basicValue,
      discPercent: c.discPercent,
      freight: c.freight,
      gstPercent: c.gstPercent,
      gstAmount: c.gstAmount,
      valueWithTax: c.valueWithTax,
      pf: c.pf,
      totalGrnValue: c.totalGrnValue,
      location: c.item.location,
    }));

    setBusy(true);
    try {
      const signer: GrnSigner = { staffId: user.id, name: user.name, designation: user.designation || '', timestamp: new Date().toISOString() };
      if (existingGrn) {
        const grn = await resubmitGrn({ grnNo: existingGrn.grnNo, gateEntryIds: selectedGateEntryIds, items, preparedBy: signer });
        toast.success(`${grn.grnNo} resubmitted for verification`);
      } else {
        const grn = await createGrn({
          orderNumber: order.poNo,
          poDate: order.poDate,
          prNumber: order.prNo,
          prDate: order.prDate,
          prBy: order.prBy,
          vendorId: order.vendorId,
          vendorName: order.vendorName,
          vendorAddress: order.vendorAddress,
          department: order.department,
          group: order.group,
          gateEntryIds: selectedGateEntryIds,
          items,
          preparedBy: signer,
        });
        toast.success(`${grn.grnNo} created and sent for verification`);
      }
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate GRN');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Stepper header */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 bg-gradient-to-r from-indigo-50/50 via-white to-white shrink-0 overflow-x-auto">
        {STEP_LABELS.map((label, idx) => {
          const n = (idx + 1) as Step;
          return (
            <div key={label} className="flex items-center gap-2 shrink-0">
              <div
                className={cn(
                  'h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold border',
                  step === n ? 'bg-indigo-600 border-indigo-600 text-white' :
                  step > n ? 'bg-green-100 border-green-200 text-green-700' :
                  'bg-slate-100 border-slate-200 text-slate-400',
                )}
              >
                {n}
              </div>
              <span className={cn('text-xs font-semibold', step === n ? 'text-slate-800' : 'text-slate-400')}>{label}</span>
              {idx < STEP_LABELS.length - 1 && <div className="w-6 h-px bg-gray-200 mx-1" />}
            </div>
          );
        })}
        <div className="ml-auto text-xs font-medium text-slate-400 whitespace-nowrap">
          {existingGrn ? `Revising ${existingGrn.grnNo}` : order.poNo}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {step === 1 && (
          <div>
            <p className="text-xs text-slate-400 mb-3">Add the items received against this PO, from inventory.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {orderItems.map((it) => {
                const v = values[it.id];
                return (
                  <button
                    type="button"
                    key={it.id}
                    onClick={() => setItem(it.id, { selected: !v.selected })}
                    className={cn(
                      'flex items-start gap-3 border rounded-xl p-3.5 transition-colors text-left h-full',
                      v.selected ? 'bg-indigo-50/60 border-indigo-200 shadow-sm' : 'border-gray-200 hover:bg-gray-50',
                    )}
                  >
                    <Checkmark checked={v.selected} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 line-clamp-2">{it.description}</div>
                      <div className="text-xs text-slate-400 mt-1.5 flex flex-wrap gap-x-1.5">
                        {it.itemCode && <span className="font-mono bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-[10px]">{it.itemCode}</span>}
                        <span>{it.uom}</span>
                        <span className="text-slate-300">·</span>
                        <span>Billed: <span className="font-semibold text-slate-600">{it.billedQty}</span></span>
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Blank "+" card — adds a genuinely new item to the order & inventory */}
              <button
                type="button"
                onClick={() => setIsAddItemOpen(true)}
                className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl p-3.5 h-full min-h-[84px] text-slate-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/40 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span className="text-xs font-semibold">Add Item</span>
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-gray-200">
                <tr>
                  {['Item', 'Billed Qty', 'Received Qty', 'Rejected Qty', 'Shortage Qty', 'Basic Value', 'Disc %', 'Freight', 'GST %', 'Value With Tax', 'P&F'].map((h) => (
                    <th key={h} className={cn('px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap', h === 'Item' ? 'text-left' : 'text-right')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {computed.map((c) => (
                  <tr key={c.item.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2 max-w-[160px] truncate text-slate-700 font-medium">{c.item.description}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{c.item.billedQty}</td>
                    <td className="px-3 py-2 text-right">
                      <CellInput value={values[c.item.id].receivedQty} onChange={(v) => setItem(c.item.id, { receivedQty: v })} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <CellInput value={values[c.item.id].rejectedQty} onChange={(v) => setItem(c.item.id, { rejectedQty: v })} />
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600">{c.shortQty}</td>
                    <td className="px-3 py-2 text-right text-slate-700">₹{c.basicValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-right">
                      <CellInput width="w-14" value={values[c.item.id].discPercent} onChange={(v) => setItem(c.item.id, { discPercent: v })} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <CellInput value={values[c.item.id].freight} onChange={(v) => setItem(c.item.id, { freight: v })} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <CellInput width="w-14" value={values[c.item.id].gstPercent} onChange={(v) => setItem(c.item.id, { gstPercent: v })} />
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">₹{c.valueWithTax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-right">
                      <CellInput value={values[c.item.id].pf} onChange={(v) => setItem(c.item.id, { pf: v })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {step === 3 && (
          <div>
            <p className="text-xs text-slate-400 mb-3">
              Select the gate entries this GRN covers — their invoice, challan and e-way bill numbers will populate the GRN header.
            </p>
            {isLoadingGateEntries ? (
              <div className="py-8 text-xs text-center text-slate-400">Loading gate entries…</div>
            ) : gateEntriesForOrder.length === 0 ? (
              <div className="py-8 text-xs text-center text-slate-400">No available gate entries logged for this PO yet.</div>
            ) : (
              <div className="space-y-2">
                {gateEntriesForOrder.map((ge) => {
                  const checked = selectedGateEntryIds.includes(ge.enteryId);
                  return (
                    <button
                      type="button"
                      key={ge.enteryId}
                      onClick={() => toggleGateEntry(ge.enteryId)}
                      className={cn(
                        'w-full flex items-start gap-3 border rounded-xl p-3 text-left transition-colors',
                        checked ? 'bg-indigo-50/60 border-indigo-200' : 'border-gray-200 hover:bg-gray-50',
                      )}
                    >
                      <Checkmark checked={checked} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800">{ge.enteryId}</div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                          <span>{ge.entryDate} · Gate {ge.gateNo}</span>
                          {ge.invoiceNumber && <span>Inv: {ge.invoiceNumber}</span>}
                          {ge.challanNumber && <span>Challan: {ge.challanNumber}</span>}
                          {ge.lrNumber && <span>LR: {ge.lrNumber}</span>}
                          {ge.ewayBillNumber && <span>E-way: {ge.ewayBillNumber}</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div>
            <p className="text-xs text-slate-400 mb-3">
              This is exactly how the GRN document will look once generated — review it, then confirm below.
            </p>
            <GrnDocumentPreview grn={draftGrn} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-gray-50/50 shrink-0">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">
          Cancel
        </button>
        <div className="flex items-center gap-2">
          {step > 1 && (
            <button
              type="button"
              onClick={goBack}
              className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
          )}
          {step < 4 && (
            <button
              type="button"
              onClick={goNext}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors"
            >
              Next
            </button>
          )}
          {step === 4 && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={busy}
              className={cn(
                'px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-colors',
                busy ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white',
              )}
            >
              {busy ? 'Submitting…' : existingGrn ? 'Resubmit GRN' : 'Generate GRN'}
            </button>
          )}
        </div>
      </div>

      {/* ── Add Item Modal ── */}
      {isAddItemOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-gray-200 w-full max-w-lg max-h-[85vh] rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-indigo-50/60 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-800">Add Item</h3>
                <p className="text-xs text-slate-500 mt-0.5">Pick an item from inventory to receive against this order.</p>
              </div>
              <button
                type="button"
                onClick={closeAddItemModal}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Inventory Item <span className="text-red-500">*</span>
                </label>

                {selectedInventoryItem ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">{selectedInventoryItem.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                        {selectedInventoryItem.code && (
                          <span className="font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5">{selectedInventoryItem.code}</span>
                        )}
                        <span>{selectedInventoryItem.unit}</span>
                        <span className="text-slate-300">·</span>
                        <span>In stock: <span className="font-semibold text-slate-600">{selectedInventoryItem.currentStock}</span></span>
                        {selectedInventoryItem.pipelineStock > 0 && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span>In pipeline: <span className="font-semibold text-slate-600">{selectedInventoryItem.pipelineStock}</span></span>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedInventoryItem(null)}
                      className="shrink-0 text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                      <input
                        type="text"
                        value={inventorySearch}
                        onChange={(e) => setInventorySearch(e.target.value)}
                        placeholder="Search inventory by name, code or category…"
                        className="w-full pl-8 pr-3 h-9 rounded-lg border border-gray-300 bg-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                    </div>
                    <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
                      {isLoadingInventory ? (
                        <div className="py-8 text-xs text-center text-slate-400">Loading inventory…</div>
                      ) : filteredInventoryItems.length === 0 ? (
                        <div className="py-8 text-xs text-center text-slate-400">No inventory items found</div>
                      ) : filteredInventoryItems.map((it) => (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => selectInventoryItem(it)}
                          className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors"
                        >
                          <div className="text-sm font-medium text-slate-800 truncate">{it.name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                            {it.code && <span className="font-mono">{it.code}</span>}
                            <span>{it.unit}</span>
                            <span className="text-slate-300">·</span>
                            <span>Stock: {it.currentStock}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Unit Price <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={!selectedInventoryItem}
                    value={newItem.unitPrice}
                    onChange={(e) => setNewItem((p) => ({ ...p, unitPrice: e.target.value }))}
                    placeholder="0"
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Qty <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={!selectedInventoryItem}
                    value={newItem.billedQty}
                    onChange={(e) => setNewItem((p) => ({ ...p, billedQty: e.target.value }))}
                    placeholder="0"
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">GST %</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={!selectedInventoryItem}
                    value={newItem.gstPercent}
                    onChange={(e) => setNewItem((p) => ({ ...p, gstPercent: e.target.value }))}
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50 shrink-0">
              <button
                type="button"
                onClick={closeAddItemModal}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddItem}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors"
              >
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GrnCreateWizard;
