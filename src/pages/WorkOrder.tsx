import React, { useEffect, useState } from 'react';
import { Loader2, Paperclip, Plus, Printer, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';
import { readUserProfile } from '@/lib/signatureDiary';

const BASE_URL = getBaseUrl().replace(/\/$/, '');

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
type ServiceRow = {
  id: string;
  serviceDescription: string;
  uom: string;
  quantity: string;
  startDate: string;
  duration: string;
  completionDate: string;
  validity: string;
  servicesFrom: string;
  scopeAttached: string;
  boqAttached: string;
  approxValue: string;
  gstPercent: string;
  proposedVendors: string;
  previousWO: string;
  remarks: string;
};

type ApiServiceRow = {
  srNo: number;
  serviceDescription: string;
  uom: string;
  quantity: number;
  startDate: string;
  duration: string;
  completionDate: string;
  validity: string;
  servicesFrom: string;
  scopeAttached: string;
  boqAttached: string;
  approxValue: number;
  gstPercent: number;
  gstAmount: number;
  proposedVendors: string;
  previousWO: string;
  remarks: string;
};

type WorkOrderForm = {
  plant: string;
  sprDate: string;
  sprNo: string;
  areaOfService: string;
  func: string;
  natureOfService: string;
  rows: ServiceRow[];
};

type WorkOrderRecord = {
  id: string;
  sprNo: string;
  sprDate: string;
  plant: string;
  areaOfService: string;
  func?: string;
  natureOfService: string;
  status: 'Draft' | 'Submitted' | 'Approved';
  createdAt: string;
  notes?: string;
  indentedBy?: string;
  indentedBySignature?: string;
  indentedByTimestamp?: string;
  forwardedBy?: string;
  forwardedBySignature?: string;
  approvedBy?: string;
  approvedBySignature?: string;
  serviceRows?: ApiServiceRow[];
};

// ─────────────────────────────────────────────────────────────
// BUDGET HEAD TYPES
// ─────────────────────────────────────────────────────────────
type ApiBudget = {
  budget_id: string;
  budget_name: string;
  crop_season: string;
  financial_year_start: string;
  financial_year_end: string;
  status: string;
};

type ApiBudgetLineItem = {
  line_item_id: string;
  budget_type: string;
  category: string;
  line_item: string;
  UoM: string;
  quantity_per_acre: number;
  total_acres: number;
  total_quantity: number;
  rate_per_unit: number;
  total_value: number;
  utilized_amount: number;
  savings: number;
};

type BudgetLineItemSelection = {
  id: string;
  lineNo: number;
  name: string;
  category: string;
  budgetType: string;
  uom: string;
  qtyPerAcre: number;
  totalAcres: number;
  totalQty: number;
  ratePerUnit: number;
  totalValue: number;
  amount: number;
};

type BudgetHeadSelection = {
  budgetId: string;
  budgetName: string;
  lineItems: BudgetLineItemSelection[];
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const genId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const emptyRow = (): ServiceRow => ({
  id: genId(),
  serviceDescription: '',
  uom: '',
  quantity: '',
  startDate: '',
  duration: '',
  completionDate: '',
  validity: '',
  servicesFrom: '',
  scopeAttached: '',
  boqAttached: '',
  approxValue: '',
  gstPercent: '18',
  proposedVendors: '',
  previousWO: '',
  remarks: '',
});

const emptyForm = (): WorkOrderForm => ({
  plant: 'SAI BIO RESOURCES PRIVATE LIMITED',
  sprDate: new Date().toISOString().slice(0, 10),
  sprNo: '',
  areaOfService: '',
  func: '',
  natureOfService: '',
  rows: [emptyRow(), emptyRow(), emptyRow()],
});

const INR = (n: number) =>
  '₹ ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const calcRowGst = (row: ServiceRow) =>
  (Number(row.approxValue) || 0) * ((Number(row.gstPercent) || 0) / 100);

const calcTotals = (rows: ServiceRow[]) => {
  const subtotal = rows.reduce((s, r) => s + (Number(r.approxValue) || 0), 0);
  const gst = rows.reduce((s, r) => s + calcRowGst(r), 0);
  return { subtotal, gst, total: subtotal + gst };
};

const toWorkOrderRow = (row: ServiceRow, idx: number) => ({
  sr_no: idx + 1,
  service_description: row.serviceDescription,
  uom: row.uom,
  quantity: Number(row.quantity) || 0,
  start_date_of_contract: row.startDate,
  duration_of_contract: row.duration,
  completion_date_of_contract: row.completionDate,
  validity_of_contract: row.validity,
  services_required_from: row.servicesFrom,
  detailed_scope_attached: row.scopeAttached,
  detailed_boq_attached: row.boqAttached,
  approx_value_of_services: Number(row.approxValue) || 0,
  gst_percentage: Number(row.gstPercent) || 0,
  gst_amount: (Number(row.approxValue) || 0) * ((Number(row.gstPercent) || 0) / 100),
  proposed_vendors: row.proposedVendors,
  previous_wo_details: row.previousWO,
  remarks: row.remarks,
});

const indentByAttachSignApi = async (payload: {
  pr_number: string;
  name_id: string;
  signature: string;
}) => {
  const res = await fetch(`${BASE_URL}/purchase_flow/indent_by_attach_sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  try { return text ? JSON.parse(text) : null; } catch { return null; }
};

// ─────────────────────────────────────────────────────────────
// INLINE-EDITABLE INPUT
// ─────────────────────────────────────────────────────────────
const DocInput = ({
  value, onChange, placeholder = '', type = 'text',
  align = 'left', small = false, className = '',
}: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
  align?: 'left' | 'center' | 'right'; small?: boolean; className?: string;
}) => (
  <input
    type={type}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    style={{ fontSize: small ? '9px' : '10px' }}
    className={cn(
      'w-full bg-transparent border-0 border-b border-dashed border-gray-400 focus:border-blue-500 focus:outline-none focus:bg-blue-50/40 rounded-none px-0.5 py-0',
      align === 'center' && 'text-center',
      align === 'right' && 'text-right',
      className,
    )}
  />
);

const DocSelect = ({
  value, onChange, options, small = false,
}: {
  value: string; onChange: (v: string) => void;
  options: string[]; small?: boolean;
}) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    style={{ fontSize: small ? '9px' : '10px' }}
    className="w-full bg-transparent border-0 border-b border-dashed border-gray-400 focus:border-blue-500 focus:outline-none focus:bg-blue-50/40 rounded-none px-0.5 py-0 cursor-pointer text-center"
  >
    {options.map((o) => <option key={o} value={o}>{o || '—'}</option>)}
  </select>
);

// ─────────────────────────────────────────────────────────────
// BUDGET HEAD PICKER MODAL
// ─────────────────────────────────────────────────────────────
const BudgetHeadPickerModal = ({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (selection: BudgetHeadSelection) => void;
  initial?: BudgetHeadSelection | null;
}) => {
  const [step, setStep] = React.useState<1 | 2>(1);
  const [budgets, setBudgets] = React.useState<ApiBudget[]>([]);
  const [budgetsLoading, setBudgetsLoading] = React.useState(false);
  const [budgetsError, setBudgetsError] = React.useState<string | null>(null);
  const [selectedBudget, setSelectedBudget] = React.useState<ApiBudget | null>(null);
  const [lineItems, setLineItems] = React.useState<ApiBudgetLineItem[]>([]);
  const [lineItemsLoading, setLineItemsLoading] = React.useState(false);
  const [lineItemsError, setLineItemsError] = React.useState<string | null>(null);
  const [lineItemSelections, setLineItemSelections] = React.useState<Record<string, { checked: boolean; amount: number }>>({});

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSelectedBudget(null);
    setLineItems([]);
    setLineItemSelections({});
    setBudgetsError(null);

    setBudgetsLoading(true);
    const ac = new AbortController();
    fetch(`${BASE_URL}/admin_accounts/get_budgets`, { headers: { Accept: 'application/json' }, signal: ac.signal })
      .then((r) => r.json())
      .then((d) => { if (d?.success) setBudgets(d.data ?? []); else setBudgetsError(d?.message || 'Failed to load budgets'); })
      .catch((e) => { if (e?.name !== 'AbortError') setBudgetsError('Failed to load budgets'); })
      .finally(() => setBudgetsLoading(false));

    return () => ac.abort();
  }, [open]);

  useEffect(() => {
    if (!selectedBudget) return;
    setLineItemsLoading(true);
    setLineItemsError(null);
    setLineItems([]);
    setLineItemSelections({});

    const ac = new AbortController();
    fetch(`${BASE_URL}/purchase_flow/get_budget_all_line_items/${selectedBudget.budget_id}`, {
      headers: { Accept: 'application/json' }, signal: ac.signal,
    })
      .then((r) => r.json())
      .then((d) => {
        const items: ApiBudgetLineItem[] = d?.line_items ?? [];
        setLineItems(items);
        const init: Record<string, { checked: boolean; amount: number }> = {};
        items.forEach((li) => { init[li.line_item_id] = { checked: false, amount: 0 }; });
        setLineItemSelections(init);
      })
      .catch((e) => { if (e?.name !== 'AbortError') setLineItemsError('Failed to load line items'); })
      .finally(() => setLineItemsLoading(false));

    return () => ac.abort();
  }, [selectedBudget]);

  const toggleLineItem = (id: string) =>
    setLineItemSelections((prev) => ({ ...prev, [id]: { ...prev[id], checked: !prev[id].checked } }));

  const updateAmount = (id: string, amount: number) =>
    setLineItemSelections((prev) => ({ ...prev, [id]: { ...prev[id], amount } }));

  const handleSave = () => {
    const selected = lineItems
      .map((li, idx) => ({ li, idx }))
      .filter(({ li }) => lineItemSelections[li.line_item_id]?.checked)
      .map(({ li, idx }) => ({
        id: li.line_item_id,
        lineNo: idx + 1,
        name: li.line_item,
        category: li.category,
        budgetType: li.budget_type,
        uom: li.UoM,
        qtyPerAcre: li.quantity_per_acre,
        totalAcres: li.total_acres,
        totalQty: li.total_quantity,
        ratePerUnit: li.rate_per_unit,
        totalValue: li.total_value,
        amount: lineItemSelections[li.line_item_id]?.amount ?? 0,
      }));

    if (selected.length === 0) { toast.error('Select at least one line item'); return; }
    const unfilled = selected.filter((s) => !s.amount);
    if (unfilled.length > 0) { toast.error(`Enter indent amount for: ${unfilled.map((s) => s.name).join(', ')}`); return; }

    onSave({ budgetId: selectedBudget!.budget_id, budgetName: selectedBudget!.budget_name, lineItems: selected });
    onClose();
  };

  const checkedCount = Object.values(lineItemSelections).filter((v) => v.checked).length;
  const totalAllocated = lineItems
    .filter((li) => lineItemSelections[li.line_item_id]?.checked)
    .reduce((s, li) => s + (lineItemSelections[li.line_item_id]?.amount ?? 0), 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl w-full">
        <DialogHeader>
          <DialogTitle>{step === 1 ? 'Select Budget' : 'Select Line Items'}</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-2 py-2">
            <p className="text-xs text-gray-500 mb-3">Choose the budget to link to this work order</p>
            {budgetsLoading ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-green-600" /><span className="text-xs text-gray-500 ml-2">Loading budgets…</span></div>
            ) : budgetsError ? (
              <div className="text-xs text-red-500 text-center py-8">{budgetsError}</div>
            ) : budgets.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-8">No budgets found</div>
            ) : (
              budgets.map((b) => (
                <button key={b.budget_id} type="button" onClick={() => { setSelectedBudget(b); setStep(2); }}
                  className="w-full text-left rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-green-400 hover:bg-green-50 transition-colors group">
                  <p className="text-sm font-semibold text-gray-800 group-hover:text-green-700">{b.budget_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{b.crop_season} · FY {b.financial_year_start}–{b.financial_year_end} · {b.status}</p>
                </button>
              ))
            )}
          </div>
        )}

        {step === 2 && selectedBudget && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setStep(1)} className="text-xs text-gray-400 hover:text-gray-700 underline">← Back</button>
              <span className="text-sm font-bold text-gray-800">{selectedBudget.budget_name}</span>
              <span className="text-xs text-gray-400">{selectedBudget.crop_season} · FY {selectedBudget.financial_year_start}–{selectedBudget.financial_year_end}</span>
            </div>

            {lineItemsLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-green-600" /><span className="text-xs text-gray-500 ml-2">Loading line items…</span></div>
            ) : lineItemsError ? (
              <div className="text-xs text-red-500 text-center py-10">{lineItemsError}</div>
            ) : lineItems.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-10">No line items found for this budget</div>
            ) : (
              <div className="overflow-auto rounded-lg border border-gray-200 max-h-[420px]">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100 sticky top-0 z-10">
                      <th className="w-9 px-2 py-2.5 border-b border-gray-200" />
                      {['Line #', 'Category', 'Line Item', 'UoM', 'Qty / Acre', 'Acres', 'Total Qty', 'Rate / Unit', 'Total Value', 'Indent Amount (₹) *'].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((li, idx) => {
                      const sel = lineItemSelections[li.line_item_id];
                      const isChecked = sel?.checked ?? false;
                      return (
                        <tr key={li.line_item_id} onClick={() => toggleLineItem(li.line_item_id)}
                          className={`cursor-pointer border-b border-gray-100 transition-colors ${isChecked ? 'bg-green-50 hover:bg-green-100' : idx % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/60 hover:bg-gray-100'}`}>
                          <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={isChecked} onChange={() => toggleLineItem(li.line_item_id)} className="w-3.5 h-3.5 accent-green-600" />
                          </td>
                          <td className="px-3 py-2.5 font-mono text-gray-500 font-semibold">{idx + 1}</td>
                          <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{li.category}</td>
                          <td className="px-3 py-2.5 font-medium text-gray-900 min-w-[160px]">{li.line_item}</td>
                          <td className="px-3 py-2.5 text-center text-gray-600">{li.UoM}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-gray-700">{li.quantity_per_acre?.toLocaleString() ?? '—'}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-gray-700">{li.total_acres?.toLocaleString() ?? '—'}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-gray-700">{li.total_quantity?.toLocaleString() ?? '—'}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-gray-700">{INR(li.rate_per_unit)}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-800">{INR(li.total_value)}</td>
                          <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                            {isChecked ? (
                              <input type="number" min={1}
                                value={sel!.amount === 0 ? '' : sel!.amount}
                                placeholder="Enter amount"
                                onChange={(e) => updateAmount(li.line_item_id, Number(e.target.value))}
                                className={`w-36 border rounded px-2 py-1 text-xs text-right bg-white focus:outline-none focus:ring-2 font-mono ${!sel!.amount ? 'border-red-300 focus:ring-red-400 placeholder-red-300' : 'border-green-300 focus:ring-green-500'}`}
                              />
                            ) : (
                              <span className="text-gray-300 font-mono text-[10px]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {checkedCount > 0 && (
                    <tfoot>
                      <tr className="bg-green-50 border-t-2 border-green-300">
                        <td colSpan={10} className="px-3 py-2.5 text-right text-xs font-bold text-gray-700">
                          {checkedCount} item{checkedCount !== 1 ? 's' : ''} selected — Total Indent Amount
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs font-bold text-green-700 font-mono">
                          {totalAllocated > 0 ? INR(totalAllocated) : <span className="text-red-400">Enter amounts ↑</span>}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {step === 2 && (
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleSave} disabled={checkedCount === 0 || lineItemsLoading}>
              Save Selection{checkedCount > 0 ? ` (${checkedCount})` : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────
// SPR PREVIEW — read-only document view
// ─────────────────────────────────────────────────────────────
const SprPreview = ({ record }: { record: WorkOrderRecord }) => {
  const rows = record.serviceRows ?? [];
  const subtotal = rows.reduce((s, r) => s + r.approxValue, 0);
  const gstTotal = rows.reduce((s, r) => s + r.gstAmount, 0);
  const total = subtotal + gstTotal;

  const C: React.CSSProperties = { border: '1px solid #000', padding: '3px 5px', verticalAlign: 'middle' };
  const TH: React.CSSProperties = { ...C, background: '#f0f0f0', fontWeight: 700, textAlign: 'center', fontSize: '8px', whiteSpace: 'pre-line', lineHeight: '1.2', padding: '3px 2px' };

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#000', width: '100%' }}>
      {/* Header */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2px' }}>
        <tbody>
          <tr>
            <td style={{ ...C, width: '28%' }}>
              <div style={{ fontWeight: 700 }}>Plant</div>
              <div>{record.plant || '—'}</div>
            </td>
            <td style={{ ...C, width: '44%', textAlign: 'center', fontWeight: 700, fontSize: '13px', textDecoration: 'underline' }}>
              SERVICE PURCHASE REQUISITION (SPR)
            </td>
            <td style={{ ...C, width: '28%' }}>
              <div><span style={{ fontWeight: 700 }}>SPR Date:</span> {record.sprDate || '—'}</div>
              <div><span style={{ fontWeight: 700 }}>SPR No:</span> {record.sprNo || '—'}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Area / Function / Nature */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2px' }}>
        <tbody>
          {[
            ['Area of Service', record.areaOfService || '—'],
            ['Function', record.func || '—'],
            ['Nature of Service', record.natureOfService || '—'],
          ].map(([label, value]) => (
            <tr key={label}>
              <td style={{ ...C, width: '50%', fontWeight: 700 }}>{label}</td>
              <td style={{ ...C, width: '50%' }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Items table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: '900px' }}>
          <thead>
            <tr>
              {['Sr.', 'Service\nDescription', 'UOM', 'Qty', 'Start\nDate', 'Duration', 'Completion', 'Validity', 'OEM /\nProp', 'Scope', 'BOQ', 'Approx\nValue (₹)', 'GST\n%', 'GST\nAmt', 'Proposed\nVendors', 'Prev\nWO', 'Remarks'].map((h) => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.srNo}>
                <td style={{ ...C, textAlign: 'center' }}>{row.srNo}</td>
                <td style={C}>{row.serviceDescription}</td>
                <td style={{ ...C, textAlign: 'center' }}>{row.uom}</td>
                <td style={{ ...C, textAlign: 'center' }}>{row.quantity}</td>
                <td style={{ ...C, textAlign: 'center' }}>{row.startDate}</td>
                <td style={{ ...C, textAlign: 'center' }}>{row.duration}</td>
                <td style={{ ...C, textAlign: 'center' }}>{row.completionDate}</td>
                <td style={{ ...C, textAlign: 'center' }}>{row.validity}</td>
                <td style={{ ...C, textAlign: 'center' }}>{row.servicesFrom}</td>
                <td style={{ ...C, textAlign: 'center' }}>{row.scopeAttached}</td>
                <td style={{ ...C, textAlign: 'center' }}>{row.boqAttached}</td>
                <td style={{ ...C, textAlign: 'right' }}>{INR(row.approxValue)}</td>
                <td style={{ ...C, textAlign: 'center' }}>{row.gstPercent}%</td>
                <td style={{ ...C, textAlign: 'right' }}>{INR(row.gstAmount)}</td>
                <td style={C}>{row.proposedVendors}</td>
                <td style={C}>{row.previousWO}</td>
                <td style={C}>{row.remarks}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={17} style={{ ...C, textAlign: 'center', color: '#999' }}>No service rows</td>
              </tr>
            )}
            <tr>
              <td colSpan={11} style={{ ...C, textAlign: 'right', fontWeight: 700 }}>Sub-Total</td>
              <td colSpan={6} style={{ ...C, textAlign: 'right', fontWeight: 700 }}>{INR(subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={11} style={{ ...C, textAlign: 'right', fontWeight: 700 }}>GST</td>
              <td colSpan={6} style={{ ...C, textAlign: 'right', fontWeight: 700 }}>{INR(gstTotal)}</td>
            </tr>
            <tr>
              <td colSpan={11} style={{ ...C, textAlign: 'right', fontWeight: 700, fontSize: '11px' }}>Total</td>
              <td colSpan={6} style={{ ...C, textAlign: 'right', fontWeight: 700, fontSize: '11px' }}>{INR(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Signature section */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '4px' }}>
        <thead>
          <tr>
            {['Sai Bio Energy, Bikaner', 'Name / ID', 'Signature', 'Date', 'Remarks / Notes'].map((h) => (
              <th key={h} style={TH}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...C, height: '40px', fontSize: '9px', verticalAlign: 'top', paddingTop: '4px' }}>Indentor Engineer</td>
            <td style={C}>{record.indentedBy || '—'}</td>
            <td style={{ ...C, fontSize: '9px', color: '#555' }}>{record.indentedBySignature || '—'}</td>
            <td style={C}>{record.indentedByTimestamp || record.sprDate || '—'}</td>
            <td style={C}>{record.notes || ''}</td>
          </tr>
          <tr>
            <td style={{ ...C, height: '40px', fontSize: '9px', verticalAlign: 'top', paddingTop: '4px' }}>Department HOD</td>
            <td style={C}>{record.forwardedBy || '—'}</td>
            <td style={{ ...C, fontSize: '9px', color: '#555' }}>{record.forwardedBySignature || '—'}</td>
            <td style={C}></td>
            <td style={C}></td>
          </tr>
          <tr>
            <td style={{ ...C, height: '40px', fontSize: '9px', verticalAlign: 'top', paddingTop: '4px' }}>Plant Head</td>
            <td style={C}>{record.approvedBy || '—'}</td>
            <td style={{ ...C, fontSize: '9px', color: '#555' }}>{record.approvedBySignature || '—'}</td>
            <td style={C}></td>
            <td style={C}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
const WorkOrder = () => {
  const [records, setRecords] = useState<WorkOrderRecord[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [previewRecord, setPreviewRecord] = useState<WorkOrderRecord | null>(null);
  const [attachingMap, setAttachingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${BASE_URL}/purchase_flow/get_indents`);
        if (!res.ok) throw new Error('Failed to fetch indents');
        const json = await res.json();
        const sprs: WorkOrderRecord[] = (json.indents || [])
          .filter((r: any) => r.indent_type === 'SPR')
          .map((r: any) => {
            const date = r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '';
            const hasFwd = Boolean(r.forwarded_by?.signature);
            const hasApproved = Boolean(r.approved_by?.signature);
            const status: WorkOrderRecord['status'] = hasApproved ? 'Approved' : hasFwd ? 'Submitted' : 'Draft';
            const serviceRows: ApiServiceRow[] = (r.indent_data?.item_row || []).map((it: any) => ({
              srNo: it.sr_no ?? 1,
              serviceDescription: it.service_description ?? '',
              uom: it.uom ?? '',
              quantity: it.quantity ?? 0,
              startDate: it.start_date_of_contract ?? '',
              duration: it.duration_of_contract ?? '',
              completionDate: it.completion_date_of_contract ?? '',
              validity: it.validity_of_contract ?? '',
              servicesFrom: it.services_required_from ?? '',
              scopeAttached: it.detailed_scope_attached ?? '',
              boqAttached: it.detailed_boq_attached ?? '',
              approxValue: it.approx_value_of_services ?? 0,
              gstPercent: it.gst_percentage ?? 0,
              gstAmount: it.gst_amount ?? 0,
              proposedVendors: it.proposed_vendors ?? '',
              previousWO: it.previous_wo_details ?? '',
              remarks: it.remarks ?? '',
            }));
            return {
              id: r.pr_number ?? date,
              sprNo: r.pr_number ?? '',
              sprDate: date,
              plant: r.indent_data?.project ?? 'SAI BIO RESOURCES PRIVATE LIMITED',
              areaOfService: r.indent_data?.area_of_service ?? '',
              func: r.indent_data?.function ?? '',
              natureOfService: r.indent_data?.name_of_service ?? '',
              status,
              createdAt: r.created_at ?? '',
              notes: r.notes ?? '',
              indentedBy: r.indented_by?.name_id ?? '',
              indentedBySignature: r.indented_by?.signature ?? '',
              indentedByTimestamp: r.indented_by?.timestamp
                ? new Date(r.indented_by.timestamp).toISOString().slice(0, 10)
                : '',
              forwardedBy: r.forwarded_by?.name_id ?? '',
              forwardedBySignature: r.forwarded_by?.signature ?? '',
              approvedBy: r.approved_by?.name_id ?? '',
              approvedBySignature: r.approved_by?.signature ?? '',
              serviceRows,
            };
          });
        setRecords(sprs);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load SPRs');
      }
    };
    load();
  }, []);

  const attachSign = async (record: WorkOrderRecord) => {
    if (!record.sprNo) { toast.error('Missing SPR number'); return; }
    const p = readUserProfile();
    const staffName = p.name.trim();
    const staffRole = p.role.trim();
    if (!staffName) { toast.error('No user profile set. Configure your name in Admin Ops → Configure.'); return; }
    const nameId = staffRole ? `${staffName} / ${staffRole}` : staffName;
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    const ymd = now.toISOString().slice(0, 10);
    const signature = `Approver | ${staffName} | ${hhmm} | ${ymd}`;

    setAttachingMap((s) => ({ ...s, [record.id]: true }));
    try {
      await indentByAttachSignApi({ pr_number: record.sprNo, name_id: nameId, signature });
      const updated: Partial<WorkOrderRecord> = {
        indentedBy: nameId,
        indentedBySignature: signature,
        indentedByTimestamp: ymd,
        status: 'Submitted',
      };
      setRecords((prev) => prev.map((x) => x.id === record.id ? { ...x, ...updated } : x));
      setPreviewRecord((prev) => prev?.id === record.id ? { ...prev, ...updated } : prev);
      toast.success(`Signature attached for ${staffName}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to attach signature');
    } finally {
      setAttachingMap((s) => ({ ...s, [record.id]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Work Order</h1>
          <p className="text-sm text-gray-500 mt-0.5">Service Purchase Requisitions (SPR)</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="bg-green-600 hover:bg-green-700 text-white gap-2">
          <Plus className="w-4 h-4" /> Create Work Order
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">All Work Orders</span>
          <span className="text-xs text-gray-400">Total: {records.length}</span>
        </div>
        {records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
            <Printer className="w-10 h-10 opacity-30" />
            <p className="text-sm font-medium">No work orders yet</p>
            <p className="text-xs">Click "Create Work Order" to raise a new SPR</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['SPR No.', 'Date', 'Plant', 'Area of Service', 'Nature of Service', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {records.map((r) => {
                  const alreadySigned = Boolean(r.indentedBySignature);
                  const isAttaching = Boolean(attachingMap[r.id]);
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{r.sprNo || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{r.sprDate}</td>
                      <td className="px-4 py-3 text-gray-600">{r.plant}</td>
                      <td className="px-4 py-3 text-gray-600">{r.areaOfService || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{r.natureOfService || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1',
                          r.status === 'Approved' ? 'bg-green-50 text-green-700 ring-green-100' :
                          r.status === 'Submitted' ? 'bg-blue-50 text-blue-700 ring-blue-100' :
                          'bg-amber-50 text-amber-700 ring-amber-100'
                        )}>{r.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            onClick={() => setPreviewRecord(r)}
                          >
                            View
                          </button>
                          <button
                            className={cn(
                              'flex items-center gap-1 text-xs font-medium',
                              alreadySigned
                                ? 'text-gray-400 cursor-default'
                                : 'text-green-700 hover:text-green-900',
                            )}
                            onClick={() => { if (!alreadySigned && !isAttaching) void attachSign(r); }}
                            disabled={alreadySigned || isAttaching}
                          >
                            <Paperclip className="w-3 h-3" />
                            {alreadySigned ? 'Signed' : isAttaching ? 'Attaching…' : 'Attach Sign'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SPR Preview Dialog */}
      <Dialog open={Boolean(previewRecord)} onOpenChange={(v) => { if (!v) setPreviewRecord(null); }}>
        <DialogContent className="max-w-[1200px] w-[1200px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>SPR Preview — {previewRecord?.sprNo}</DialogTitle>
          </DialogHeader>
          {previewRecord && <SprPreview record={previewRecord} />}
          {previewRecord && (
            <DialogFooter>
              <div className="flex justify-end gap-2 w-full pt-2">
                <Button variant="outline" onClick={() => setPreviewRecord(null)}>Close</Button>
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white gap-2"
                  disabled={Boolean(previewRecord.indentedBySignature) || Boolean(attachingMap[previewRecord.id])}
                  onClick={() => void attachSign(previewRecord)}
                >
                  <Paperclip className="w-4 h-4" />
                  {previewRecord.indentedBySignature
                    ? 'Already Signed'
                    : attachingMap[previewRecord.id]
                    ? 'Attaching…'
                    : 'Attach Signature'}
                </Button>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {modalOpen && (
        <WorkOrderModal
          onClose={() => setModalOpen(false)}
          onSave={(rec) => { setRecords((p) => [rec, ...p]); setModalOpen(false); }}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// WORK ORDER MODAL — live SPR document with inline editing
// ─────────────────────────────────────────────────────────────
const WorkOrderModal = ({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (rec: WorkOrderRecord) => void;
}) => {
  const [form, setForm] = useState<WorkOrderForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [budgetPickerOpen, setBudgetPickerOpen] = useState(false);
  const [budgetHeadSelection, setBudgetHeadSelection] = useState<BudgetHeadSelection | null>(null);

  const set = (k: keyof Omit<WorkOrderForm, 'rows'>, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const setRow = (id: string, k: keyof ServiceRow, v: string) =>
    setForm((p) => ({ ...p, rows: p.rows.map((r) => r.id === id ? { ...r, [k]: v } : r) }));

  const addRow = () =>
    setForm((p) => ({ ...p, rows: [...p.rows, emptyRow()] }));

  const removeRow = (id: string) =>
    setForm((p) => ({ ...p, rows: p.rows.filter((r) => r.id !== id) }));

  const { subtotal, gst, total } = calcTotals(form.rows);

  const handlePrint = () => {
    const el = document.getElementById('spr-doc');
    if (!el) return;
    const win = window.open('', '_blank', 'width=1400,height=900');
    if (!win) return;
    win.document.write(`<html><head><title>SPR - ${form.sprNo || 'Work Order'}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 9px; margin: 8mm; color: #000; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th, td { border: 1px solid #000; padding: 2px 3px; vertical-align: middle; word-break: break-word; }
        input, select { display: none; }
        .pv { display: block !important; }
        @media print { @page { size: A3 landscape; margin: 6mm; } }
      </style></head><body>${el.innerHTML}</body></html>`
    );
    win.document.close();
    win.focus();
    win.print();
  };

  const handleSave = async () => {
    if (!form.sprNo.trim()) return toast.error('SPR No. is required');
    setSaving(true);
    try {
      const payload = {
        project: form.plant,
        indent_type: 'SPR',
        area_of_service: form.areaOfService,
        function: form.func,
        name_of_service: form.natureOfService,
        item_row: form.rows.map(toWorkOrderRow),
        ...(budgetHeadSelection && {
          budget_head: {
            budget_id: budgetHeadSelection.budgetId,
            line_item: budgetHeadSelection.lineItems.map((li) => ({
              line_item_id: li.id,
              line_item: li.name,
              category: li.category,
              budget_type: li.budgetType,
              uom: li.uom,
              allocated_amount: li.amount,
            })),
          },
        }),
      };

      const res = await fetch(`${BASE_URL}/purchase_flow/create_indent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });

      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || data?.detail || `Server responded ${res.status}`);

      toast.success(`Work Order ${form.sprNo} saved`);
      onSave({
        id: genId(), sprNo: form.sprNo, sprDate: form.sprDate,
        plant: form.plant, areaOfService: form.areaOfService,
        natureOfService: form.natureOfService, status: 'Draft',
        createdAt: new Date().toISOString(),
      });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const C: React.CSSProperties = { border: '1px solid #000', padding: '3px 5px', verticalAlign: 'middle' };
  const CT: React.CSSProperties = { ...C, verticalAlign: 'top' };
  const TH: React.CSSProperties = { ...C, background: '#f0f0f0', fontWeight: 700, textAlign: 'center', fontSize: '8px', whiteSpace: 'pre-line', lineHeight: '1.2', padding: '3px 2px' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2">
      <div className="w-full max-w-[99vw] max-h-[97vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">Create Work Order — Service Purchase Requisition (SPR)</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">Edit directly in the document. Each field is inline-editable.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 text-xs">
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable document */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 bg-gray-100">
          <div
            id="spr-doc"
            style={{
              fontFamily: 'Arial, sans-serif', fontSize: '10px', background: '#fff',
              padding: '16px', boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
              borderRadius: '4px', color: '#000', width: '100%',
            }}
          >
            {/* ── Row 1: Plant | SPR Title | SPR Date + No ── */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2px' }}>
              <tbody>
                <tr>
                  <td style={{ ...C, width: '28%' }}>
                    <div style={{ fontWeight: 700, marginBottom: '2px' }}>Plant</div>
                    <DocInput value={form.plant} onChange={(v) => set('plant', v)} placeholder="Plant name" />
                  </td>
                  <td style={{ ...C, width: '44%', textAlign: 'center', fontWeight: 700, fontSize: '13px', textDecoration: 'underline' }}>
                    SERVICE PURCHASE REQUISITION (SPR)
                  </td>
                  <td style={{ ...C, width: '28%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>SPR Date:</span>
                      <DocInput type="date" value={form.sprDate} onChange={(v) => set('sprDate', v)} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>SPR No:</span>
                      <DocInput value={form.sprNo} onChange={(v) => set('sprNo', v)} placeholder="SPR/2026/001" />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ── Area of Service / Function / Nature of Service ── */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2px' }}>
              <tbody>
                {[
                  {
                    label: 'Area of Service',
                    hint: 'Seeds / Fertilizer / Irrigation / Borewell / water Storage etc',
                    input: <DocInput value={form.areaOfService} onChange={(v) => set('areaOfService', v)} placeholder="Enter area of service…" />,
                  },
                  {
                    label: 'Function',
                    hint: 'Mech / Elect / Civil / Security / Others',
                    input: (
                      <DocSelect
                        value={form.func}
                        onChange={(v) => set('func', v)}
                        options={['', 'Mech', 'Elect', 'Civil', 'Security', 'Others']}
                      />
                    ),
                  },
                  {
                    label: 'Nature of Service',
                    hint: 'One Time Service / AMC / O&M Contract',
                    input: (
                      <DocSelect
                        value={form.natureOfService}
                        onChange={(v) => set('natureOfService', v)}
                        options={['', 'One Time Service', 'AMC', 'O&M Contract']}
                      />
                    ),
                  },
                ].map(({ label, hint, input }) => (
                  <tr key={label}>
                    <td style={{ ...CT, width: '50%' }}>
                      <div style={{ fontWeight: 700 }}>{label}</div>
                      <div style={{ color: '#666', fontSize: '9px' }}>{hint}</div>
                    </td>
                    <td style={{ ...C, width: '50%' }}>
                      {input}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── Service Items Table ── */}
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '2%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '3%' }} />
                <col style={{ width: '3%' }} />
                <col style={{ width: '5.5%' }} />
                <col style={{ width: '4.5%' }} />
                <col style={{ width: '5.5%' }} />
                <col style={{ width: '5.5%' }} />
                <col style={{ width: '5%' }} />
                <col style={{ width: '3.5%' }} />
                <col style={{ width: '3.5%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '3.5%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '5%' }} />
                <col style={{ width: '5%' }} />
                <col style={{ width: '2%' }} />
              </colgroup>

              <thead>
                <tr>
                  {['1','2','3','4','6','7','8','9','10','11','12','13','13a','14','16','17',''].map((n, i) => (
                    <th key={i} style={TH}>{n}</th>
                  ))}
                </tr>
                <tr>
                  {[
                    'Sr.\nNo.',
                    'Service\nDescription',
                    'UOM',
                    'Qty',
                    'Start\nDate',
                    'Duration\nof Contract',
                    'Completion\nDate',
                    'Validity of\nContract',
                    'OEM /\nProp / Open',
                    'Scope\nAttached',
                    'BOQ\nAttached',
                    'Approx.\nValue (₹)',
                    'GST\n%',
                    'Proposed Vendors /\nContractor',
                    'Prev.\nWO',
                    'Remarks',
                    '',
                  ].map((h, i) => (
                    <th key={i} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {form.rows.map((row, idx) => {
                  const rowGst = calcRowGst(row);
                  return (
                    <tr key={row.id}>
                      <td style={{ ...C, textAlign: 'center', fontSize: '9px' }}>{idx + 1}</td>
                      <td style={C}><DocInput small value={row.serviceDescription} onChange={(v) => setRow(row.id, 'serviceDescription', v)} /></td>
                      <td style={C}><DocInput small value={row.uom} onChange={(v) => setRow(row.id, 'uom', v)} align="center" /></td>
                      <td style={C}><DocInput small value={row.quantity} onChange={(v) => setRow(row.id, 'quantity', v)} align="center" /></td>
                      <td style={C}><DocInput small type="date" value={row.startDate} onChange={(v) => setRow(row.id, 'startDate', v)} /></td>
                      <td style={C}><DocInput small value={row.duration} onChange={(v) => setRow(row.id, 'duration', v)} placeholder="e.g. 6 months" align="center" /></td>
                      <td style={C}><DocInput small type="date" value={row.completionDate} onChange={(v) => setRow(row.id, 'completionDate', v)} /></td>
                      <td style={C}><DocInput small type="date" value={row.validity} onChange={(v) => setRow(row.id, 'validity', v)} /></td>
                      <td style={C}>
                        <DocSelect small value={row.servicesFrom} onChange={(v) => setRow(row.id, 'servicesFrom', v)} options={['', 'OEM', 'Proprietary', 'Open']} />
                      </td>
                      <td style={C}>
                        <DocSelect small value={row.scopeAttached} onChange={(v) => setRow(row.id, 'scopeAttached', v)} options={['', 'Yes', 'No']} />
                      </td>
                      <td style={C}>
                        <DocSelect small value={row.boqAttached} onChange={(v) => setRow(row.id, 'boqAttached', v)} options={['', 'Yes', 'No']} />
                      </td>
                      <td style={C}>
                        <DocInput small value={row.approxValue} onChange={(v) => setRow(row.id, 'approxValue', v)} align="right" placeholder="0.00" />
                        {Number(row.approxValue) > 0 && (
                          <div style={{ fontSize: '8px', color: '#666', textAlign: 'right', marginTop: '1px' }}>
                            GST: {INR(rowGst)}
                          </div>
                        )}
                      </td>
                      <td style={C}>
                        <DocInput
                          small value={row.gstPercent}
                          onChange={(v) => setRow(row.id, 'gstPercent', v)}
                          align="center" placeholder="18"
                        />
                        <div style={{ fontSize: '8px', color: '#888', textAlign: 'center' }}>%</div>
                      </td>
                      <td style={C}><DocInput small value={row.proposedVendors} onChange={(v) => setRow(row.id, 'proposedVendors', v)} /></td>
                      <td style={C}><DocInput small value={row.previousWO} onChange={(v) => setRow(row.id, 'previousWO', v)} /></td>
                      <td style={C}><DocInput small value={row.remarks} onChange={(v) => setRow(row.id, 'remarks', v)} /></td>
                      <td style={{ ...C, textAlign: 'center', padding: '2px' }}>
                        <button onClick={() => removeRow(row.id)} className="text-red-400 hover:text-red-600 transition-colors" title="Remove row">
                          <Trash2 style={{ width: '10px', height: '10px' }} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                <tr>
                  <td colSpan={17} style={{ ...C, textAlign: 'center', padding: '4px' }}>
                    <button
                      onClick={addRow}
                      style={{ fontSize: '9px', color: '#2563eb', display: 'flex', alignItems: 'center', gap: '3px', margin: '0 auto' }}
                      className="hover:underline"
                    >
                      <Plus style={{ width: '10px', height: '10px' }} />
                      Add service row
                    </button>
                  </td>
                </tr>

                <tr>
                  <td colSpan={11} style={{ ...C, textAlign: 'right', fontWeight: 700, fontSize: '9px' }}>Sub-Total</td>
                  <td style={{ ...C, textAlign: 'right', fontWeight: 700, fontSize: '9px' }}>{INR(subtotal)}</td>
                  <td colSpan={5} style={C}></td>
                </tr>
                <tr>
                  <td colSpan={11} style={{ ...C, textAlign: 'right', fontWeight: 700, fontSize: '9px' }}>GST (as per row %)</td>
                  <td style={{ ...C, textAlign: 'right', fontWeight: 700, fontSize: '9px' }}>{INR(gst)}</td>
                  <td colSpan={5} style={C}></td>
                </tr>
                <tr>
                  <td colSpan={11} style={{ ...C, textAlign: 'right', fontWeight: 700, fontSize: '10px' }}>Total</td>
                  <td style={{ ...C, textAlign: 'right', fontWeight: 700, fontSize: '10px' }}>{INR(total)}</td>
                  <td colSpan={5} style={C}></td>
                </tr>
              </tbody>
            </table>

            {/* ── Signature section ── */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '4px' }}>
              <thead>
                <tr>
                  {['Sai Bio Energy, Bikaner', 'Name', 'Signature', 'Date', 'Remarks / Notes'].map((h) => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {['Indentor Engineer', 'Department HOD', 'Plant Head'].map((role) => (
                  <tr key={role}>
                    <td style={{ ...C, height: '40px', fontSize: '9px', verticalAlign: 'top', paddingTop: '4px' }}>{role}</td>
                    <td style={C}></td>
                    <td style={C}></td>
                    <td style={C}></td>
                    <td style={C}></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Budget Head section — below document */}
        <div className="mx-4 mb-4 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-800">Budget Head</span>
            <button
              type="button"
              onClick={() => setBudgetPickerOpen(true)}
              className="text-xs text-green-600 hover:text-green-700 font-semibold flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              {budgetHeadSelection ? 'Change' : 'Select Budget'}
            </button>
          </div>

          {budgetHeadSelection ? (
            <div className="px-4 py-3 space-y-1">
              {budgetHeadSelection.lineItems.map((li) => (
                <div key={li.id} className="text-xs text-gray-700 font-mono leading-snug">
                  {budgetHeadSelection.budgetName} | {li.category} | {li.name} | {INR(li.amount)}
                </div>
              ))}
              <div className="pt-1 text-xs font-bold text-green-700 text-right font-mono border-t border-green-200 mt-1">
                Total: {INR(budgetHeadSelection.lineItems.reduce((s, l) => s + l.amount, 0))}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setBudgetPickerOpen(true)}
              className="w-full px-4 py-5 text-center text-xs text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
            >
              Click to link a budget and select line items with allocation amounts
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">Fill in SPR details and save</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1.5" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Work Order'}
            </Button>
          </div>
        </div>
      </div>

      <BudgetHeadPickerModal
        open={budgetPickerOpen}
        onClose={() => setBudgetPickerOpen(false)}
        onSave={(sel) => setBudgetHeadSelection(sel)}
      />
    </div>
  );
};

export default WorkOrder;
