import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getBaseUrl } from '@/lib/config';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type QuoteVendor = {
  id: string;
  name: string;
  phone?: string;
  location?: string;
  directoryVendorId?: string;
};

type SprItem = {
  id: string;
  srNo: number;
  serviceDescription: string;
  qty: number;
  uom: string;
  startDate: string;
  duration: string;
  servicesFrom: string;
  gstPercent?: number;
};

type VendorQuote = {
  vendorId: string;
  unitRateByItemId: Record<string, number>;
};

type CustomChargeRow = {
  id: string;
  label: string;
  values: Record<string, number>;
};

type CustomDetailRow = {
  id: string;
  label: string;
  values: Record<string, string>;
};

type SprComparative = {
  indentId: string;
  title: string;
  vendors: QuoteVendor[];
  items: SprItem[];
  quotes: VendorQuote[];
  isDraft?: boolean;
  technicalRecommendationVendorId?: string;
  lastSavedAt?: string;
  lastSavedSource?: 'server' | 'local';
  paymentTerms?: Record<string, string>;
  deliveryTimeline?: Record<string, string>;
  priceBasis?: Record<string, string>;
  warranty?: Record<string, string>;
  vendorStatus?: Record<string, string>;
  freightCharges?: Record<string, number>;
  otherCharges?: Record<string, number>;
  customChargeRows?: CustomChargeRow[];
  customDetailRows?: CustomDetailRow[];
};

type DirectoryVendor = {
  id: string;
  name: string;
  phone?: string;
  address?: string;
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const genId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const getApiBaseUrl = () => String(getBaseUrl() ?? '').replace(/\/$/, '');
const safeTrim = (v: unknown) => String(v ?? '').trim();
const toIsoNow = () => new Date().toISOString();

const inr = (n: number) => {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
  } catch { return `₹${Math.round(n)}`; }
};

const stableItemId = (name: string, idx: number) => {
  const safe = safeTrim(name).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `spr-${idx + 1}-${safe || 'x'}`;
};

// ─────────────────────────────────────────────────────────────
// API HELPERS
// ─────────────────────────────────────────────────────────────

const fetchComparativeDraft = async (prNumber: string) => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error('API base URL is not set');
  const res = await fetch(`${baseUrl}/purchase_flow/get_comparative_statement_draft`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ pr_number: prNumber }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: any = await res.json().catch(() => null);
  const items = Array.isArray(data?.items) ? data.items : [];
  return items[0] ?? null;
};

// Fetch SPR items from the indent API — always the source of truth for service fields
const fetchSprItemsFromIndent = async (prNumber: string): Promise<SprItem[]> => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return [];
  const res = await fetch(`${baseUrl}/purchase_flow/get_indents`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data: any = await res.json().catch(() => null);
  const indents: any[] = Array.isArray(data?.indents) ? data.indents : [];
  const indent = indents.find((r: any) => safeTrim(r?.pr_number) === prNumber);
  if (!indent) return [];
  const itemRows: any[] = Array.isArray(indent.indent_data?.item_row) ? indent.indent_data.item_row : [];
  return itemRows.map((it: any, idx: number) => ({
    id: stableItemId(safeTrim(it?.service_description), idx),
    srNo: it?.sr_no ?? idx + 1,
    serviceDescription: safeTrim(it?.service_description) || `Service ${idx + 1}`,
    qty: Number(it?.quantity ?? 0) || 0,
    uom: safeTrim(it?.uom) || '',
    startDate: safeTrim(it?.start_date_of_contract) || '',
    duration: safeTrim(it?.duration_of_contract) || '',
    servicesFrom: safeTrim(it?.services_required_from) || '',
    gstPercent: Number(it?.gst_percentage ?? 0) || 0,
  }));
};

const fetchVendorsForDropdown = async (): Promise<DirectoryVendor[]> => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return [];
  const doFetch = (method: 'GET' | 'POST') =>
    fetch(`${baseUrl}/purchase_flow/get_vendors`, { method, headers: { Accept: 'application/json' } });
  let res = await doFetch('GET');
  if (res.status === 405) res = await doFetch('POST');
  if (!res.ok) return [];
  const data: any = await res.json().catch(() => null);
  const list: any[] = Array.isArray(data?.vendors) ? data.vendors : [];
  return list
    .map((v) => ({ id: safeTrim(v?.vendor_id), name: safeTrim(v?.vendor_name), phone: safeTrim(v?.vendor_contact) || undefined, address: safeTrim(v?.vendor_address) || undefined }))
    .filter((v) => v.id && v.name);
};

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

export default function SprQuotationComparative() {
  const { indentId } = useParams<{ indentId: string }>();
  const navigate = useNavigate();
  const [model, setModel] = useState<SprComparative | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savingFinal, setSavingFinal] = useState(false);
  const [directoryVendors, setDirectoryVendors] = useState<DirectoryVendor[]>([]);

  const normalizedIndentId = useMemo(() => {
    if (!indentId) return '';
    try { return decodeURIComponent(indentId); } catch { return indentId; }
  }, [indentId]);

  // Load vendor directory
  useEffect(() => {
    void fetchVendorsForDropdown().then((list) => { if (list.length) setDirectoryVendors(list); }).catch(() => {});
  }, []);

  // Load model
  useEffect(() => {
    if (!normalizedIndentId) return;
    let cancelled = false;
    const load = async () => {
      // Always fetch items from indent API for accurate SPR fields
      let indentItems: SprItem[] = [];
      try { indentItems = await fetchSprItemsFromIndent(normalizedIndentId); } catch {}
      if (cancelled) return;

      // Try to get vendor/quote data from comparative draft
      try {
        const draft = await fetchComparativeDraft(normalizedIndentId);
        if (cancelled) return;
        if (draft) {
          const createdAt = safeTrim(draft?.created_at);
          const meta = draft?.meta && typeof draft.meta === 'object' ? draft.meta as Partial<SprComparative> : null;
          const quoters: any[] = Array.isArray(draft?.quoters) ? draft.quoters : [];

          const vendors: QuoteVendor[] = quoters.map((q) => safeTrim(q?.vendor_id)).filter(Boolean)
            .map((vid) => ({ id: vid, directoryVendorId: vid, name: vid }));

          const paymentTerms: Record<string, string> = {};
          const deliveryTimeline: Record<string, string> = {};
          const warranty: Record<string, string> = {};
          const priceBasis: Record<string, string> = {};
          const freightCharges: Record<string, number> = {};
          const otherCharges: Record<string, number> = {};

          const quotes: VendorQuote[] = quoters
            .map((q) => ({ q, vendorId: safeTrim(q?.vendor_id) }))
            .filter((x) => Boolean(x.vendorId))
            .map(({ q, vendorId }) => {
              const unitRateByItemId: Record<string, number> = {};
              const costing = q?.item_costing && typeof q.item_costing === 'object' ? q.item_costing : {};
              for (const it of indentItems) {
                const row = (costing as any)?.[it.serviceDescription];
                const perUnit = Number((row as any)?.per_unit_costing ?? 0);
                unitRateByItemId[it.id] = Number.isFinite(perUnit) ? perUnit : 0;
              }
              freightCharges[vendorId] = Number(q?.freight_charges ?? 0) || 0;
              otherCharges[vendorId] = Number(q?.other_charges ?? 0) || 0;
              const pt = safeTrim(q?.payment_terms); const dt = safeTrim(q?.delivery_time);
              const wg = safeTrim(q?.warrenty_garantee); const pb = safeTrim(q?.price_basis);
              if (pt) paymentTerms[vendorId] = pt;
              if (dt) deliveryTimeline[vendorId] = dt;
              if (wg) warranty[vendorId] = wg;
              if (pb) priceBasis[vendorId] = pb;
              return { vendorId, unitRateByItemId };
            });

          setModel({
            indentId: normalizedIndentId,
            title: 'Service Comparative Statement',
            vendors,
            items: indentItems,
            quotes,
            freightCharges,
            otherCharges,
            paymentTerms,
            deliveryTimeline,
            warranty,
            priceBasis,
            customChargeRows: meta?.customChargeRows || [],
            customDetailRows: meta?.customDetailRows || [],
            lastSavedAt: createdAt || undefined,
            lastSavedSource: createdAt ? 'server' : undefined,
          });
          return;
        }
      } catch {}
      if (cancelled) return;

      // Fresh start: items from indent, NO vendors (user adds manually)
      setModel({
        indentId: normalizedIndentId,
        title: 'Service Comparative Statement',
        vendors: [],
        items: indentItems,
        quotes: [],
        freightCharges: {},
        otherCharges: {},
        customChargeRows: [],
        customDetailRows: [],
      });
    };
    void load();
    return () => { cancelled = true; };
  }, [normalizedIndentId]);

  // Hydrate vendor names from directory after directory loads
  useEffect(() => {
    if (!directoryVendors.length) return;
    setModel((p) => {
      if (!p) return p;
      let changed = false;
      const nextVendors = p.vendors.map((v) => {
        if (!v.directoryVendorId) return v;
        const dv = directoryVendors.find((x) => x.id === v.directoryVendorId);
        if (!dv) return v;
        const next = { ...v, name: dv.name || v.name, phone: dv.phone || v.phone, location: dv.address || v.location };
        if (next.name !== v.name || next.phone !== v.phone || next.location !== v.location) changed = true;
        return next;
      });
      return changed ? { ...p, vendors: nextVendors } : p;
    });
  }, [directoryVendors]);

  // ─── Computed totals ──────────────────────────────────────
  const vendorOrder = model?.vendors ?? [];

  const vendorSelectedById = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const v of vendorOrder) out[v.id] = Boolean(v.directoryVendorId);
    return out;
  }, [vendorOrder]);

  const baseByVendor = useMemo(() => {
    if (!model) return {} as Record<string, number>;
    const out: Record<string, number> = {};
    for (const v of vendorOrder) {
      const q = model.quotes.find((x) => x.vendorId === v.id);
      out[v.id] = (model.items || []).reduce((s, it) => s + (q?.unitRateByItemId?.[it.id] ?? 0) * it.qty, 0);
    }
    return out;
  }, [model, vendorOrder]);

  const gstByVendor = useMemo(() => {
    if (!model) return {} as Record<string, number>;
    const out: Record<string, number> = {};
    for (const v of vendorOrder) {
      const q = model.quotes.find((x) => x.vendorId === v.id);
      out[v.id] = (model.items || []).reduce((s, it) => {
        const amt = (q?.unitRateByItemId?.[it.id] ?? 0) * it.qty;
        return s + amt * ((Number(it.gstPercent ?? 0)) / 100);
      }, 0);
    }
    return out;
  }, [model, vendorOrder]);

  const freightByVendor = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of vendorOrder) out[v.id] = Number((model as any)?.freightCharges?.[v.id] ?? 0) || 0;
    return out;
  }, [vendorOrder, model]);

  const otherByVendor = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of vendorOrder) out[v.id] = Number((model as any)?.otherCharges?.[v.id] ?? 0) || 0;
    return out;
  }, [vendorOrder, model]);

  const customChargesByVendor = useMemo(() => {
    const out: Record<string, number> = {};
    for (const vendor of vendorOrder) {
      out[vendor.id] = (model?.customChargeRows || []).reduce(
        (sum, row) => sum + (Number(row.values?.[vendor.id]) || 0),
        0,
      );
    }
    return out;
  }, [vendorOrder, model?.customChargeRows]);

  const subtotalByVendor = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of vendorOrder) out[v.id] = (baseByVendor[v.id] || 0) + (freightByVendor[v.id] || 0) + (otherByVendor[v.id] || 0) + (customChargesByVendor[v.id] || 0);
    return out;
  }, [vendorOrder, baseByVendor, freightByVendor, otherByVendor, customChargesByVendor]);

  const grandTotalByVendor = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of vendorOrder) out[v.id] = (subtotalByVendor[v.id] || 0) + (gstByVendor[v.id] || 0);
    return out;
  }, [vendorOrder, subtotalByVendor, gstByVendor]);

  const vendorLTagByVendorId = useMemo(() => {
    const rankable = vendorOrder.map((v) => ({ id: v.id, total: Number(grandTotalByVendor[v.id] ?? 0) || 0 })).filter((x) => x.total > 0);
    if (!rankable.length) return {} as Record<string, string>;
    rankable.sort((a, b) => a.total - b.total);
    const out: Record<string, string> = {};
    rankable.forEach((x, i) => { out[x.id] = `L${i + 1}`; });
    return out;
  }, [vendorOrder, grandTotalByVendor]);

  // The technical recommendation is never a manual choice — it's always the
  // vendor currently ranked L1 (lowest grand total) on the comparison.
  const l1RecommendationVendor = useMemo(() => {
    const l1Id = Object.keys(vendorLTagByVendorId).find((id) => vendorLTagByVendorId[id] === 'L1');
    if (!l1Id) return undefined;
    const vendor = vendorOrder.find((v) => v.id === l1Id);
    const directoryVendorId = String(vendor?.directoryVendorId ?? '').trim();
    if (!vendor || !directoryVendorId) return undefined;
    return { id: vendor.id, directoryVendorId, name: vendor.name, total: Number(grandTotalByVendor[l1Id] ?? 0) || 0 };
  }, [vendorLTagByVendorId, vendorOrder, grandTotalByVendor]);

  // ─── Mutators ─────────────────────────────────────────────
  const setVendorRate = (vendorId: string, itemId: string, val: string) => {
    const rate = Number(val);
    setModel((prev) => {
      if (!prev) return prev;
      const quotes = [...prev.quotes];
      const idx = quotes.findIndex((q) => q.vendorId === vendorId);
      if (idx === -1) quotes.push({ vendorId, unitRateByItemId: { [itemId]: Number.isFinite(rate) ? rate : 0 } });
      else quotes[idx] = { ...quotes[idx], unitRateByItemId: { ...quotes[idx].unitRateByItemId, [itemId]: Number.isFinite(rate) ? rate : 0 } };
      return { ...prev, quotes };
    });
  };

  const addVendor = () => setModel((p) => p ? { ...p, vendors: [...p.vendors, { id: genId(), name: `Vendor ${p.vendors.length + 1}` }] } : p);
  const removeVendor = (id: string) => setModel((p) => p ? { ...p, vendors: p.vendors.filter((v) => v.id !== id), quotes: p.quotes.filter((q) => q.vendorId !== id) } : p);

  const updateVendorFromDirectory = (vendorId: string, directoryVendorId: string) => {
    const selected = directoryVendors.find((x) => x.id === directoryVendorId);
    if (!selected) return;
    setModel((p) => p ? { ...p, vendors: p.vendors.map((v) => v.id === vendorId ? { ...v, directoryVendorId, name: selected.name, phone: selected.phone || v.phone, location: selected.address || v.location } : v) } : p);
  };

  const setMeta = (key: 'paymentTerms' | 'deliveryTimeline' | 'priceBasis' | 'warranty' | 'vendorStatus', vendorId: string, value: string) =>
    setModel((p) => p ? { ...p, [key]: { ...(p as any)[key], [vendorId]: value } } as SprComparative : p);

  const setCharge = (key: 'freightCharges' | 'otherCharges', vendorId: string, value: string) => {
    const num = Number(value);
    setModel((p) => {
      if (!p) return p;
      return { ...p, [key]: { ...((p as any)[key] || {}), [vendorId]: Number.isFinite(num) ? num : 0 } } as SprComparative;
    });
  };

  const addCustomChargeRow = () => setModel((previous) => previous ? {
    ...previous,
    customChargeRows: [...(previous.customChargeRows || []), { id: genId(), label: `Charge ${(previous.customChargeRows || []).length + 1}`, values: {} }],
  } : previous);

  const addCustomDetailRow = () => setModel((previous) => previous ? {
    ...previous,
    customDetailRows: [...(previous.customDetailRows || []), { id: genId(), label: `Detail ${(previous.customDetailRows || []).length + 1}`, values: {} }],
  } : previous);

  // ─── Save payload ──────────────────────────────────────────
  const buildPayload = (m: SprComparative) => ({
    pr_number: String(normalizedIndentId || m.indentId || '').trim(),
    indent_type: 'SPR',
    item_row: (m.items || []).map((it) => ({
      item_name: it.serviceDescription,
      quantity: it.qty,
      UoM: it.uom,
      gst_percentage: Number(it.gstPercent ?? 0) || 0,
    })),
    quoters: (m.vendors || []).map((v) => {
      const vendor_id = String(v.directoryVendorId ?? '').trim();
      if (!vendor_id) return null;
      const q = (m.quotes || []).find((x) => x.vendorId === v.id);
      const item_costing: Record<string, { per_unit_costing: number; quanity: number; final_costing: number }> = {};
      for (const it of m.items || []) {
        const unit = Number(q?.unitRateByItemId?.[it.id] ?? 0) || 0;
        item_costing[it.serviceDescription] = { per_unit_costing: unit, quanity: it.qty, final_costing: unit * it.qty };
      }
      return {
        vendor_id, item_costing,
        freight_charges: freightByVendor[v.id] || 0,
        other_charges: (otherByVendor[v.id] || 0) + (customChargesByVendor[v.id] || 0),
        subtotal: subtotalByVendor[v.id] || 0,
        total_amount: grandTotalByVendor[v.id] || 0,
        payment_terms: String((m.paymentTerms as any)?.[v.id] ?? '').trim() || null,
        delivery_time: String((m.deliveryTimeline as any)?.[v.id] ?? '').trim() || null,
        warrenty_garantee: String((m.warranty as any)?.[v.id] ?? '').trim() || null,
        price_basis: String((m.priceBasis as any)?.[v.id] ?? '').trim() || null,
      };
    }).filter(Boolean),
    technical_recommendation: String(m.technicalRecommendationVendorId ?? '').trim() || null,
    // Full model, so fields the backend doesn't otherwise track (customChargeRows,
    // customDetailRows, etc.) round-trip losslessly instead of relying on local storage.
    meta: m,
  });

  const saveDraftToApi = async (payload: any) => {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/purchase_flow/save_comparative_statement_draft`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json().catch(() => null);
  };

  const saveFinalToApi = async (payload: any) => {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/purchase_flow/save_comparative_statement`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json().catch(() => null);
  };

  const saveDraft = async () => {
    if (!model || savingDraft) return;
    if (!model.items.length) { toast.error('No service items found'); return; }
    const snapshot = { ...model, isDraft: true, lastSavedAt: toIsoNow(), lastSavedSource: 'local' as const };
    setModel(snapshot);
    setSavingDraft(true);
    try {
      const apiRes: any = await saveDraftToApi(buildPayload(snapshot));
      const serverSavedAt = safeTrim(apiRes?.created_at || apiRes?.updated_at);
      setModel((p) => p ? { ...p, lastSavedAt: serverSavedAt || p.lastSavedAt || toIsoNow(), lastSavedSource: serverSavedAt ? 'server' : (p.lastSavedSource || 'local') } : p);
      toast.success('Draft saved');
    } catch (e: any) {
      toast.error(`Failed to save draft${e?.message ? `: ${e.message}` : ''}`);
    } finally {
      setSavingDraft(false);
    }
  };

  const saveFinal = () => {
    if (!model || savingFinal) return;
    if (!model.items.length) { toast.error('No service items found'); return; }
    if (!l1RecommendationVendor) {
      toast.error('Enter vendor rates so an L1 (lowest cost) vendor can be determined');
      return;
    }
    const nextModel: SprComparative = { ...model, isDraft: false, technicalRecommendationVendorId: l1RecommendationVendor.directoryVendorId, lastSavedAt: toIsoNow(), lastSavedSource: 'local' };
    setSavingFinal(true);
    void saveFinalToApi(buildPayload(nextModel))
      .then(() => { toast.success('Comparative statement saved'); navigate('/work-comparative-statement'); })
      .catch((e: any) => { toast.error(`Failed to save${e?.message ? `: ${e.message}` : ''}`); })
      .finally(() => setSavingFinal(false));
  };

  const getDirectoryVendorById = (id?: string) => id ? directoryVendors.find((x) => x.id === id) : undefined;

  if (!indentId) return <div className="p-6">Invalid indent.</div>;
  if (!model) return <div className="p-6">Loading…</div>;

  const FIXED_COLS = 4; // S. No. | Service | Qty | UOM — matches Purchase Comparative

  return (
    <div className="min-h-screen bg-[#f7f8f7] p-3 text-foreground md:p-4">
      {/* Header */}
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => navigate('/work-comparative-statement')}>
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div>
            <div className="text-xl font-bold text-slate-900">Quotation Comparative Statement</div>
            <div className="text-xs text-slate-500">SR: {normalizedIndentId || indentId}</div>
            {model.lastSavedAt && (
              <div className="text-[11px] text-muted-foreground">
                Last saved: <span className="font-medium text-foreground/80">{new Date(model.lastSavedAt).toLocaleString()}</span>
                {model.lastSavedSource && <span className="text-muted-foreground"> ({model.lastSavedSource})</span>}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={addVendor} disabled={savingDraft || savingFinal}>
            <Plus className="w-4 h-4" /> Add Vendor
          </Button>
          <Button variant="outline" className="gap-2" onClick={saveDraft}
            disabled={savingDraft || savingFinal || !model.items.length}>
            {savingDraft ? 'Saving draft…' : 'Save as draft'}
          </Button>
          <Button className="gap-2 bg-[#0b463f] text-white hover:bg-[#083a34]" onClick={saveFinal} disabled={savingDraft || savingFinal}>
            <Save className="w-4 h-4" /> {savingFinal ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Comparative table */}
      <div className="overflow-auto rounded-xl border border-[#d5e1dd] bg-white shadow-sm">
        <table className="border-collapse table-fixed text-[12px] text-[#20352f]" style={{ width: `${490 + vendorOrder.length * 225}px`, minWidth: `${490 + vendorOrder.length * 225}px` }}>
          <colgroup>
            <col style={{ width: 55 }} />
            <col style={{ width: 265 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 85 }} />
            {vendorOrder.map((v) => <col key={`${v.id}-cols`} style={{ width: 225 }} />)}
          </colgroup>

          <thead>
            {/* Vendor header row */}
            <tr>
              <th className="border border-[#d5e1dd] bg-[#edf5f2] p-0 text-left align-top" colSpan={FIXED_COLS + vendorOrder.length}>
                <div className="space-y-2 p-4 text-center">
                  <Input
                    value={model.title || ''}
                    onChange={(e) => setModel((p) => p ? { ...p, title: e.target.value } : p)}
                    className="h-10 border-[#cddbd6] bg-white text-center text-base font-bold text-[#0b463f]"
                    placeholder="Service Comparative Statement"
                  />
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-600">
                    <span className="text-foreground/80">Service Requisition:</span>
                    <span className="font-medium text-foreground">{normalizedIndentId || indentId}</span>
                  </div>
                </div>
              </th>
            </tr>

            <tr className="bg-[#0b463f] text-white">
              <th className="border border-[#2d625b] px-2 py-1">S. No.</th>
              <th className="border border-[#2d625b] px-2 py-1">Service Description</th>
              <th className="border border-[#2d625b] px-2 py-1">QTY</th>
              <th className="border border-[#2d625b] px-2 py-1">UOM</th>
              {vendorOrder.map((v) => {
                const selectedDirVendor = getDirectoryVendorById(v.directoryVendorId);
                const selected = Boolean(v.directoryVendorId);
                return (
                  <th key={`${v.id}-headcols`} className="border border-[#2d625b] bg-[#0b463f] px-2 py-2 text-[#20352f]">
                    <div className="flex items-center gap-1">
                      <select value={v.directoryVendorId ?? ''} onChange={(e) => updateVendorFromDirectory(v.id, e.target.value)} className="h-8 w-0 min-w-0 flex-1 truncate rounded-md border border-[#b9cec7] bg-white px-2 text-[11px] font-semibold text-[#20352f] outline-none focus:ring-2 focus:ring-white/40">
                        <option value="">Select vendor</option>
                        {directoryVendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name} · {vendor.id}</option>)}
                      </select>
                      <button type="button" className="rounded-md bg-white p-2 text-red-500 hover:bg-red-50" onClick={() => removeVendor(v.id)} aria-label={`Remove ${v.name || 'vendor'}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-1 truncate text-left text-[10px] font-semibold text-[#d8eee7]">{selectedDirVendor?.name || 'Vendor not selected'}</div>
                    <div className="mt-1 grid grid-cols-[1fr_82px] gap-1">
                      <Input value={v.location || ''} onChange={(e) => setModel((p) => p ? { ...p, vendors: p.vendors.map((x) => x.id === v.id ? { ...x, location: e.target.value } : x) } : p)} className="h-7 bg-white px-2 text-[10px]" placeholder="Vendor address" disabled={!selected} />
                      <Input value={v.phone || ''} onChange={(e) => setModel((p) => p ? { ...p, vendors: p.vendors.map((x) => x.id === v.id ? { ...x, phone: e.target.value } : x) } : p)} className="h-7 bg-white px-2 text-[10px]" placeholder="Phone" disabled={!selected} />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {/* Items */}
            {model.items.length === 0 ? (
              <tr>
                <td className="border border-border px-2 py-8 text-center text-muted-foreground" colSpan={FIXED_COLS + vendorOrder.length}>
                  No service items found for this SPR.
                </td>
              </tr>
            ) : (
              model.items.map((it, idx) => (
                <tr key={it.id} className="text-center align-middle">
                  <td className="border border-border px-2 py-1 align-middle">{idx + 1}</td>
                  <td className="border border-border px-3 py-2 text-left align-middle">
                    <div className="font-semibold text-[#20352f]">{it.serviceDescription}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
                      <span>Start: {it.startDate || '—'}</span><span>Duration: {it.duration || '—'}</span><span>Source: {it.servicesFrom || '—'}</span><span>GST: {Number(it.gstPercent || 0)}%</span>
                    </div>
                  </td>
                  <td className="border border-border px-2 py-1 align-middle">{it.qty}</td>
                  <td className="border border-border px-2 py-1 align-middle">{it.uom || '—'}</td>
                  {vendorOrder.map((v) => {
                    const q = model.quotes.find((x) => x.vendorId === v.id);
                    const unit = q?.unitRateByItemId?.[it.id] ?? 0;
                    const amt = unit * it.qty;
                    const locked = !vendorSelectedById[v.id];
                    return (
                      <td key={`${it.id}-${v.id}`} className="border border-border px-3 py-2 align-middle">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Unit Rate</div>
                        <Input type="number" onWheel={(e) => e.currentTarget.blur()} min="0" step="0.01" className="h-9 text-center" value={String(unit || '')} onChange={(e) => setVendorRate(v.id, it.id, e.target.value)} placeholder="0" disabled={locked} />
                        <div className="mt-1 text-[10px] text-slate-500">Amount: <span className="font-semibold text-[#20352f]">{amt ? inr(amt) : inr(0)}</span></div>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}

            {/* Summary rows */}
            {vendorOrder.length > 0 && (
              <>
                <tr className="bg-[#edf5f2] font-semibold">
                  <td className="border border-border px-2 py-2" colSpan={FIXED_COLS}>Base Amount</td>
                  {vendorOrder.map((v) => <td key={`${v.id}-base`} className="border border-border px-3 py-2 text-center tabular-nums">{inr(baseByVendor[v.id] || 0)}</td>)}
                </tr>
                <tr>
                  <td className="border border-border px-2 py-1 text-right font-semibold" colSpan={FIXED_COLS}>GST</td>
                  {vendorOrder.map((v) => <td key={`${v.id}-gst`} className="border border-border px-3 py-2 text-center tabular-nums">{inr(gstByVendor[v.id] || 0)}</td>)}
                </tr>
                <tr>
                  <td className="border border-border px-2 py-1 text-right font-semibold" colSpan={FIXED_COLS}>Freight Charges</td>
                  {vendorOrder.map((v) => (
                    <td key={`${v.id}-freight`} className="border border-border p-1">
                      <Input className="h-7 bg-[#fbfdfc] text-center tabular-nums" value={String(freightByVendor[v.id] || '')} onChange={(e) => setCharge('freightCharges', v.id, e.target.value)} placeholder="0" disabled={!vendorSelectedById[v.id]} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="border border-border px-2 py-1 text-right font-semibold" colSpan={FIXED_COLS}>Other Charges</td>
                  {vendorOrder.map((v) => (
                    <td key={`${v.id}-other`} className="border border-border p-1">
                      <Input className="h-7 bg-[#fbfdfc] text-center tabular-nums" value={String(otherByVendor[v.id] || '')} onChange={(e) => setCharge('otherCharges', v.id, e.target.value)} placeholder="0" disabled={!vendorSelectedById[v.id]} />
                    </td>
                  ))}
                </tr>
                {(model.customChargeRows || []).map((row) => (
                  <tr key={row.id} className="bg-white">
                    <td className="border border-border p-1" colSpan={FIXED_COLS}>
                      <div className="flex items-center gap-2">
                        <Input
                          value={row.label}
                          onChange={(event) => setModel({ ...model, customChargeRows: (model.customChargeRows || []).map((entry) => entry.id === row.id ? { ...entry, label: event.target.value } : entry) })}
                          placeholder="Charge name"
                          className="h-8 border-0 bg-transparent px-3 text-[12px] font-semibold shadow-none"
                        />
                        <button type="button" onClick={() => setModel({ ...model, customChargeRows: (model.customChargeRows || []).filter((entry) => entry.id !== row.id) })} className="rounded-md p-1.5 text-red-500 hover:bg-red-50" aria-label={`Delete ${row.label || 'charge'}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    {vendorOrder.map((vendor) => (
                      <td key={`${row.id}-${vendor.id}`} className="border border-border p-1">
                        <Input
                          type="number" onWheel={(e) => e.currentTarget.blur()}
                          value={String(Number(row.values?.[vendor.id] || 0) || '')}
                          onChange={(event) => setModel({ ...model, customChargeRows: (model.customChargeRows || []).map((entry) => entry.id === row.id ? { ...entry, values: { ...entry.values, [vendor.id]: Number(event.target.value) || 0 } } : entry) })}
                          placeholder="0"
                          disabled={!vendorSelectedById[vendor.id]}
                          className="h-7 appearance-none bg-[#fbfdfc] text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-[#f7faf9]">
                  <td className="border border-border px-3 py-2" colSpan={FIXED_COLS + vendorOrder.length}>
                    <Button type="button" variant="outline" size="sm" onClick={addCustomChargeRow} className="h-8 gap-1.5 border-[#0b463f]/30 bg-white px-3 text-[12px] font-semibold text-[#0b463f] hover:bg-[#edf3ef] hover:text-[#0b463f]">
                      <Plus className="h-3.5 w-3.5" /> Add Charge Row
                    </Button>
                  </td>
                </tr>
                <tr className="bg-[#edf5f2] font-semibold">
                  <td className="border border-border px-2 py-1 text-right" colSpan={FIXED_COLS}>Sub Total</td>
                  {vendorOrder.map((v) => (
                    <td key={`${v.id}-sub`} className="border border-border px-3 py-2 text-center tabular-nums">{inr(subtotalByVendor[v.id] || 0)}</td>
                  ))}
                </tr>
                <tr className="bg-[#0b463f] font-bold text-white">
                  <td className="border border-[#2d625b] px-3 py-2" colSpan={FIXED_COLS}>Landed Cost / Grand Total</td>
                  {vendorOrder.map((v) => (
                    <td key={`${v.id}-gt`} className="border border-[#2d625b] px-3 py-2 text-center tabular-nums">{inr(grandTotalByVendor[v.id] || 0)}</td>
                  ))}
                </tr>
              </>
            )}

            {/* Meta rows */}
            {(['Payment Terms', 'Delivery Timeline', 'Price Basis', 'Warranty/Guarantee'] as const).map((label, i) => {
              const keys = ['paymentTerms', 'deliveryTimeline', 'priceBasis', 'warranty'] as const;
              const key = keys[i];
              return (
                <tr key={key} className="bg-white">
                  <td className="border border-border px-4 py-4 text-left text-[12px] font-semibold align-middle" colSpan={FIXED_COLS}>{label}</td>
                  {vendorOrder.map((v) => {
                    const value = String((model as any)[key]?.[v.id] ?? '');
                    const locked = !vendorSelectedById[v.id];
                    return (
                      <td key={`${key}-${v.id}`} className="border border-border p-2 align-middle">
                        <Input
                          value={value}
                          onChange={(event) => { if (!locked) setMeta(key, v.id, event.target.value); }}
                          placeholder={locked ? 'Select vendor first' : 'Enter details'}
                          disabled={locked}
                          className="h-10 rounded-xl border-[#d5e1dd] bg-[#fbfdfc] px-3 text-[12px] font-normal text-[#20352f] placeholder:text-slate-400 focus-visible:border-[#0b463f] focus-visible:ring-[#0b463f]/20"
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {(model.customDetailRows || []).map((row) => (
              <tr key={row.id} className="bg-white">
                <td className="border border-border p-2" colSpan={FIXED_COLS}>
                  <div className="flex items-center gap-2">
                    <Input
                      value={row.label}
                      onChange={(event) => setModel({ ...model, customDetailRows: (model.customDetailRows || []).map((entry) => entry.id === row.id ? { ...entry, label: event.target.value } : entry) })}
                      placeholder="Detail name"
                      className="h-10 border-0 bg-transparent px-2 text-[12px] font-semibold shadow-none"
                    />
                    <button type="button" onClick={() => setModel({ ...model, customDetailRows: (model.customDetailRows || []).filter((entry) => entry.id !== row.id) })} className="rounded-md p-1.5 text-red-500 hover:bg-red-50" aria-label={`Delete ${row.label || 'detail'}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
                {vendorOrder.map((vendor) => (
                  <td key={`${row.id}-${vendor.id}`} className="border border-border p-2 align-middle">
                    <Input
                      value={row.values?.[vendor.id] || ''}
                      onChange={(event) => setModel({ ...model, customDetailRows: (model.customDetailRows || []).map((entry) => entry.id === row.id ? { ...entry, values: { ...entry.values, [vendor.id]: event.target.value } } : entry) })}
                      placeholder={vendorSelectedById[vendor.id] ? 'Enter details' : 'Select vendor first'}
                      disabled={!vendorSelectedById[vendor.id]}
                      className="h-10 rounded-xl border-[#d5e1dd] bg-[#fbfdfc] px-3 text-[12px] font-normal text-[#20352f] placeholder:text-slate-400 focus-visible:border-[#0b463f] focus-visible:ring-[#0b463f]/20"
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-[#f7faf9]">
              <td className="border border-border px-3 py-2" colSpan={FIXED_COLS + vendorOrder.length}>
                <Button type="button" variant="outline" size="sm" onClick={addCustomDetailRow} className="h-8 gap-1.5 border-[#0b463f]/30 bg-white px-3 text-[12px] font-semibold text-[#0b463f] hover:bg-[#edf3ef] hover:text-[#0b463f]">
                  <Plus className="h-3.5 w-3.5" /> Add Detail Row
                </Button>
              </td>
            </tr>
            <tr className="bg-[#edf5f2]">
              <td className="border border-border px-4 py-4 text-left text-[12px] font-semibold text-[#0b463f]" colSpan={FIXED_COLS}>Vendor Status</td>
              {vendorOrder.map((vendor) => <td key={`${vendor.id}-status`} className="border border-border px-4 py-4 text-[12px] font-semibold text-[#0b463f]">{vendorLTagByVendorId[vendor.id] || '—'}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-slate-500">
        Service comparative statement. Add vendors, enter unit rates and commercial terms, then save the recommendation.
      </div>
    </div>
  );
}
