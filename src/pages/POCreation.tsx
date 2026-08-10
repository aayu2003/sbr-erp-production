import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, FileText, Search, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { MakePurchaseOrderPopup } from '@/components/ho-inbox/MakePurchaseOrderPopup';
import { type ComparativeModel } from '@/components/purchase/ComparativeStatementPreview';
import getBaseUrl from '@/lib/config';

const safe = (value: unknown) => String(value ?? '').trim();
const numberOrZero = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(safe(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

const mapNfaToComparative = (record: any): ComparativeModel | null => {
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

  const quoters = Array.isArray(record?.quoters) ? record.quoters : [];
  const vendors = quoters
    .map((quote: any) => {
      const id = safe(quote?.vendor_id);
      return id ? { id, name: safe(quote?.vendor_name) || id, directoryVendorId: id } : null;
    })
    .filter(Boolean) as NonNullable<ComparativeModel['vendors']>;

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

  const approvedVendorId = safe(
    record?.approved_vendor_id ?? record?.approved_vendor?.vendor_id ?? record?.approved_vendor?.vendorId,
  );

  return {
    indentId,
    comparisonId: safe(record?.comparison_id ?? record?.comparision_id) || undefined,
    comparisonNo: safe(record?.comparison_no) || undefined,
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
  const [createdOrders, setCreatedOrders] = useState<Record<string, string>>({});

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
    () => records.filter((record) => safe(record.nfaStatus).toLowerCase() === 'approved'),
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
      ...(record.items || []).map((item) => item.partName),
    ].some((value) => safe(value).toLowerCase().includes(needle)));
  }, [approvedRecords, query]);

  const totalItems = approvedRecords.reduce((sum, record) => sum + (record.items || []).length, 0);

  return (
    <div className="min-h-screen space-y-6 bg-slate-50/70 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0D3A35] text-white shadow-lg">
            <ShoppingCart className="h-7 w-7" />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0D3A35]">Purchase &amp; Procurement</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">PO Creation</h1>
            <p className="mt-1 text-sm text-slate-500">Create purchase orders from NFA-approved vendor comparative statements.</p>
          </div>
        </div>
      </header>

      <section className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid-cols-3">
        {[
          { label: 'NFA Approved', value: approvedRecords.length, icon: CheckCircle2 },
          { label: 'Items Ready', value: totalItems, icon: FileText },
          { label: 'PO Created', value: Object.keys(createdOrders).length, icon: ShoppingCart },
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

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] table-fixed border-collapse">
            <thead className="bg-[#0D3A35] text-white">
              <tr className="text-center text-[11px] uppercase tracking-[0.08em]">
                <th className="w-[17%] px-4 py-3">Comparative Statement No.</th>
                <th className="w-[14%] px-4 py-3">PR Number</th>
                <th className="w-[16%] px-4 py-3">Approved Vendor</th>
                <th className="w-[20%] px-4 py-3">Item Details</th>
                <th className="w-[8%] px-4 py-3">UoM</th>
                <th className="w-[8%] px-4 py-3">Qty.</th>
                <th className="w-[9%] px-4 py-3">Status</th>
                <th className="w-[12%] px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={8} className="px-6 py-16 text-center text-sm text-slate-500"><Clock3 className="mx-auto mb-3 h-7 w-7 animate-pulse" />Loading approved statements…</td></tr>
              ) : filteredRecords.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-16 text-center text-sm text-slate-500">No NFA-approved statements found.</td></tr>
              ) : filteredRecords.map((record) => {
                const orderNo = createdOrders[record.indentId];
                return (
                  <tr key={record.indentId} className="align-middle text-sm text-slate-700 hover:bg-[#f7faf9]">
                    <td className="px-4 py-4 text-center font-mono text-xs font-bold text-[#0D3A35]">{record.comparisonNo || record.comparisonId || 'Not recorded'}</td>
                    <td className="px-4 py-4 text-center font-mono text-xs font-semibold">{record.indentId}</td>
                    <td className="px-4 py-4 text-center font-semibold">{record.hoSelectedVendorId || 'Not recorded'}</td>
                    <td className="space-y-1 px-4 py-4">{(record.items || []).map((item) => <div key={item.id} className="truncate font-semibold">{item.partName}</div>)}</td>
                    <td className="space-y-1 px-4 py-4 text-center">{(record.items || []).map((item) => <div key={item.id}>{item.uom || '—'}</div>)}</td>
                    <td className="space-y-1 px-4 py-4 text-center font-semibold tabular-nums">{(record.items || []).map((item) => <div key={item.id}>{new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(item.qty)}</div>)}</td>
                    <td className="px-4 py-4 text-center"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${orderNo ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>{orderNo ? 'PO Created' : 'NFA Approved'}</span></td>
                    <td className="px-4 py-4 text-center">
                      <Button type="button" onClick={() => setSelected(record)} className="h-9 bg-[#0D3A35] text-white hover:bg-[#092e2a]">
                        {orderNo ? 'View / Edit PO' : 'Create PO'}
                      </Button>
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
        onClose={() => setSelected(null)}
        onConfirm={({ indentId, poNo }) => {
          setCreatedOrders((current) => ({ ...current, [indentId]: poNo }));
          setSelected(null);
          toast.success(`Purchase Order ${poNo} created`);
        }}
      />
    </div>
  );
}
