import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getBaseUrl } from '@/lib/config';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { formatDateTimeDDMMYYYY } from '@/lib/dateFormat';

type QuoteVendor = {
  id: string;
  name: string;
  phone?: string;
  location?: string;
  directoryVendorId?: string; // selected vendor from Vendor Directory
};

type PrItem = {
  id: string;
  srNo: number;
  partName: string;
  uom: string;
  qty: number;
  gstPercent?: number;
};

type VendorQuote = {
  vendorId: string;
  unitRateByItemId: Record<string, number>; // itemId -> unitRate
};

type Comparative = {
  indentId: string;
  indentType?: 'PR' | 'SPR';
  title: string;
  subTitle?: string;
  vendors: QuoteVendor[];
  items: PrItem[];
  quotes: VendorQuote[];
  isDraft?: boolean;
  technicalRecommendationVendorId?: string;
  lastSavedAt?: string; // ISO or backend timestamp string
  lastSavedSource?: 'server' | 'local';
  // summary rows
  paymentTerms?: Record<string, string>; // vendorId -> text
  deliveryTimeline?: Record<string, string>;
  priceBasis?: Record<string, string>;
  warranty?: Record<string, string>;
  loading?: Record<string, string>;
  unloading?: Record<string, string>;
  vendorStatus?: Record<string, string>;
  gstPercent?: number; // legacy sheet-level (fallback)
  freightCharges?: Record<string, number>; // vendorId -> amount
  otherCharges?: Record<string, number>; // vendorId -> amount (includes any tax-like extras)
  // legacy fields kept for previously saved data
  baseAmountA?: Record<string, number>;
  baseAmountB?: Record<string, number>;
};

const KEY = 'farmconnect.prComparative.v1';
const genId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const readAll = (): Record<string, Comparative> => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeAll = (all: Record<string, Comparative>) => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
};

const inr = (n: number) => {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `₹${Math.round(n)}`;
  }
};

const getApiBaseUrl = () => String(getBaseUrl() ?? '').replace(/\/$/, '');

const safeTrim = (v: unknown) => String(v ?? '').trim();

const toIsoNow = () => new Date().toISOString();

const formatDateTime = (raw?: string) => {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  return formatDateTimeDDMMYYYY(v, v);
};

type DirectoryVendor = {
  id: string;
  name: string;
  phone?: string;
  address?: string;
};

const VENDOR_DIR_KEY = 'farmconnect.vendorDirectory.v1';

const DUMMY_DIRECTORY_VENDORS: DirectoryVendor[] = [
  { id: 'dv-1', name: 'CHHATTISGARH PORTABLE INFRATECH', phone: '9165271111', address: 'Bhilai, Chhattisgarh' },
  { id: 'dv-2', name: 'MAHAKAL PORTABLE CABIN & FABRICATION', phone: '9702430797', address: 'Durg, Chhattisgarh' },
  { id: 'dv-3', name: 'SHREE BALAJI FABRICATION WORKS', phone: '9000000000', address: 'Raipur, Chhattisgarh' },
];

const readVendorDirectory = (): DirectoryVendor[] => {
  try {
    const raw = window.localStorage.getItem(VENDOR_DIR_KEY);
    if (!raw) return DUMMY_DIRECTORY_VENDORS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DUMMY_DIRECTORY_VENDORS;
    const mapped = parsed
      .map((v: any) => ({
        id: String(v?.id ?? ''),
        name: String(v?.name ?? ''),
        phone: v?.phone ? String(v.phone) : undefined,
        address: v?.address ? String(v.address) : undefined,
      }))
      .filter((v: DirectoryVendor) => v.id && v.name.trim());

    return mapped.length ? mapped : DUMMY_DIRECTORY_VENDORS;
  } catch {
    return DUMMY_DIRECTORY_VENDORS;
  }
};

type GetVendorsApiVendor = {
  vendor_id?: unknown;
  vendor_name?: unknown;
  vendor_address?: unknown;
  vendor_contact?: unknown;
};

type GetComparativeDraftItemRow = {
  item_name?: unknown;
  UoM?: unknown;
  gst_percentage?: unknown;
  quantity?: unknown;
};

type GetComparativeDraftQuoter = {
  vendor_id?: unknown;
  item_costing?: unknown;
  freight_charges?: unknown;
  other_charges?: unknown;
  subtotal?: unknown;
  total_amount?: unknown;
  payment_terms?: unknown;
  delivery_time?: unknown;
  warrenty_garantee?: unknown;
};

type GetComparativeDraftItem = {
  created_at?: unknown;
  pr_number?: unknown;
  item_row?: unknown;
  quoters?: unknown;
  comparision_id?: unknown;
  status?: unknown;
};

type GetComparativeDraftResponse = {
  items?: unknown;
};

const fetchComparativeDraft = async (prNumber: string): Promise<GetComparativeDraftItem | null> => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error('API base URL is not set');

  const url = `${baseUrl}/purchase_flow/get_comparative_statement_draft`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pr_number: prNumber }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `HTTP ${res.status}`);
  }

  const data: GetComparativeDraftResponse | null = await res.json().catch(() => null);
  const items = Array.isArray((data as any)?.items) ? ((data as any).items as GetComparativeDraftItem[]) : [];
  return items[0] ?? null;
};

const fetchIndentByPrNumber = async (
  prNumber: string,
): Promise<{ items: PrItem[]; indentType: 'PR' | 'SPR' }> => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return { items: [], indentType: 'PR' };

  const res = await fetch(`${baseUrl}/purchase_flow/get_indents`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return { items: [], indentType: 'PR' };

  const data: any = await res.json().catch(() => null);
  const indents: any[] = Array.isArray(data?.indents) ? data.indents : [];
  const indent = indents.find((r: any) => safeTrim(r?.pr_number) === prNumber);
  if (!indent) return { items: [], indentType: 'PR' };

  const isSpr = Boolean(indent.indent_data?.area_of_service || indent.indent_data?.name_of_service);
  const itemRows: any[] = Array.isArray(indent.indent_data?.item_row) ? indent.indent_data.item_row : [];

  const items: PrItem[] = itemRows.map((it: any, idx: number) => {
    if (isSpr) {
      const name = safeTrim(it?.service_description) || `Service ${idx + 1}`;
      return {
        id: stableItemId(name, idx),
        srNo: idx + 1,
        partName: name,
        uom: safeTrim(it?.uom) || '',
        qty: Number(it?.quantity ?? 0) || 0,
        gstPercent: Number(it?.gst_percentage ?? 0) || 0,
      };
    } else {
      const name = safeTrim(it?.part_name) || `Item ${idx + 1}`;
      const totalQty = Number(it?.total_qty_required ?? 0) || 0;
      const lessQty = Number(it?.less_qty_available_in_stock ?? 0) || 0;
      const netQty = Number(it?.net_pr_qty) || Math.max(0, totalQty - lessQty);
      return {
        id: stableItemId(name, idx),
        srNo: idx + 1,
        partName: name,
        uom: safeTrim(it?.uom) || '',
        qty: netQty,
        gstPercent: 0,
      };
    }
  });

  return { items, indentType: isSpr ? 'SPR' : 'PR' };
};

const stableItemId = (itemName: string, idx: number) => {
  const base = safeTrim(itemName) || 'item';
  const safe = base.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `it-${idx + 1}-${safe || 'x'}`;
};

const fetchVendorsForDropdown = async (): Promise<DirectoryVendor[]> => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error('API base URL is not set');

  const url = `${baseUrl}/purchase_flow/get_vendors`;

  const doFetch = (method: 'GET' | 'POST') =>
    fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
      },
    });

  let res = await doFetch('GET');
  if (res.status === 405) res = await doFetch('POST');

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `HTTP ${res.status}`);
  }

  const data: any = await res.json().catch(() => null);
  const list: GetVendorsApiVendor[] = Array.isArray(data?.vendors) ? data.vendors : [];

  const mapped: DirectoryVendor[] = list
    .map((v) => {
      const id = String(v?.vendor_id ?? '').trim();
      const name = String(v?.vendor_name ?? '').trim();
      const phone = String(v?.vendor_contact ?? '').trim();
      const address = String(v?.vendor_address ?? '').trim();
      return {
        id,
        name,
        phone: phone ? phone : undefined,
        address: address ? address : undefined,
      };
    })
    .filter((v) => v.id && v.name);

  return mapped;
};

function AutoGrowTextarea({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ??
        'w-full resize-none overflow-hidden bg-transparent outline-none text-[12px] leading-[1.25]'
      }
      rows={1}
    />
  );
}

export default function QuotationComparative() {
  const { indentId } = useParams<{ indentId: string }>();
  const navigate = useNavigate();
  const [model, setModel] = useState<Comparative | null>(null);
  const [openRecommendation, setOpenRecommendation] = useState(false);
  const [recommendationVendorId, setRecommendationVendorId] = useState<string>('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [savingFinal, setSavingFinal] = useState(false);

  const normalizedIndentId = useMemo(() => {
    if (!indentId) return '';
    try {
      return decodeURIComponent(indentId);
    } catch {
      return indentId;
    }
  }, [indentId]);

  const [directoryVendors, setDirectoryVendors] = useState<DirectoryVendor[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const list = await fetchVendorsForDropdown();
        if (list.length) {
          setDirectoryVendors(list);
          return;
        }
        setDirectoryVendors(readVendorDirectory());
      } catch {
        setDirectoryVendors(readVendorDirectory());
      }
    };
    void load();
  }, []);

  const updateVendorFromDirectory = (vendorId: string, directoryVendorId: string) => {
    const selected = directoryVendors.find((x) => x.id === directoryVendorId);
    if (!selected) return;
    setModel((p) => {
      if (!p) return p;
      return {
        ...p,
        vendors: p.vendors.map((v) =>
          v.id === vendorId
            ? {
                ...v,
                directoryVendorId,
                name: selected.name,
                phone: selected.phone || v.phone,
                location: selected.address ? selected.address : v.location,
              }
            : v,
        ),
      };
    });
  };

  useEffect(() => {
    if (!normalizedIndentId) return;
    let cancelled = false;

    const load = async () => {
      // 1) Try server draft first (source of truth for last saved draft)
      try {
        const draft = await fetchComparativeDraft(normalizedIndentId);
        if (cancelled) return;
        if (draft) {
          const createdAt = safeTrim((draft as any)?.created_at);
          const itemRows: GetComparativeDraftItemRow[] = Array.isArray((draft as any)?.item_row)
            ? ((draft as any).item_row as GetComparativeDraftItemRow[])
            : [];
          const quoters: GetComparativeDraftQuoter[] = Array.isArray((draft as any)?.quoters)
            ? ((draft as any).quoters as GetComparativeDraftQuoter[])
            : [];

          const items: PrItem[] = itemRows.map((r, idx) => {
            // PR drafts use item_name; SPR drafts may use service_description
            const itemName = safeTrim((r as any)?.item_name) || safeTrim((r as any)?.service_description);
            const uom = safeTrim((r as any)?.UoM) || safeTrim((r as any)?.uom);
            const qty = Number((r as any)?.quantity ?? 0) || 0;
            const gst = Number((r as any)?.gst_percentage ?? 0);
            return {
              id: stableItemId(itemName, idx),
              srNo: idx + 1,
              partName: itemName,
              uom,
              qty,
              gstPercent: Number.isFinite(gst) ? gst : 0,
            };
          });

          const vendors: QuoteVendor[] = quoters
            .map((q) => safeTrim((q as any)?.vendor_id))
            .filter(Boolean)
            .map((vendorId) => ({
              id: vendorId,
              directoryVendorId: vendorId,
              name: vendorId,
            }));

          const paymentTerms: Record<string, string> = {};
          const deliveryTimeline: Record<string, string> = {};
          const warranty: Record<string, string> = {};
          const priceBasis: Record<string, string> = {};
          const freightCharges: Record<string, number> = {};
          const otherCharges: Record<string, number> = {};

          const quotes: VendorQuote[] = quoters
            .map((q) => ({ q, vendorId: safeTrim((q as any)?.vendor_id) }))
            .filter((x) => Boolean(x.vendorId))
            .map(({ q, vendorId }) => {
              const unitRateByItemId: Record<string, number> = {};

            const costing = (q as any)?.item_costing;
            const costingObj = costing && typeof costing === 'object' ? costing : {};

            for (const it of items) {
              const name = safeTrim(it.partName);
              const row = (costingObj as any)?.[name];
              const perUnit = Number((row as any)?.per_unit_costing ?? 0);
              unitRateByItemId[it.id] = Number.isFinite(perUnit) ? perUnit : 0;
            }

              freightCharges[vendorId] = Number((q as any)?.freight_charges ?? 0) || 0;
              otherCharges[vendorId] = Number((q as any)?.other_charges ?? 0) || 0;

              const pt = safeTrim((q as any)?.payment_terms);
              const dt = safeTrim((q as any)?.delivery_time);
              const wg = safeTrim((q as any)?.warrenty_garantee);
              const pb = safeTrim((q as any)?.price_basis);
              if (pt) paymentTerms[vendorId] = pt;
              if (dt) deliveryTimeline[vendorId] = dt;
              if (wg) warranty[vendorId] = wg;
              if (pb) priceBasis[vendorId] = pb;

              return {
                vendorId,
                unitRateByItemId,
              };
            });

          // If the draft had no item_row (or all items have blank names), seed from indent API
          let resolvedItems = items;
          let resolvedIndentType: 'PR' | 'SPR' = 'PR';
          if (resolvedItems.length === 0 || resolvedItems.every((it) => !it.partName)) {
            try {
              const seeded = await fetchIndentByPrNumber(normalizedIndentId);
              resolvedItems = seeded.items;
              resolvedIndentType = seeded.indentType;
            } catch {
              // ignore, keep empty
            }
          }

          const next: Comparative = {
            indentId: normalizedIndentId,
            indentType: resolvedIndentType,
            title: 'Price Comparative Statement',
            subTitle: 'for office Porta Cabins at Chhattisgarh',
            vendors,
            items: resolvedItems,
            quotes,
            gstPercent: undefined,
            freightCharges,
            otherCharges,
            baseAmountA: {},
            baseAmountB: {},
            paymentTerms,
            deliveryTimeline,
            warranty,
            priceBasis,
            lastSavedAt: createdAt || undefined,
            lastSavedSource: createdAt ? 'server' : undefined,
          };
          setModel(next);
          return;
        }
      } catch {
        // ignore - we will fallback to local/empty
      }

      // 2) Fallback to local draft (older behavior)
      const all = readAll();
      if (cancelled) return;
      if (all[normalizedIndentId]) {
        setModel(all[normalizedIndentId]);
        return;
      }

      // 3) Finally, start fresh — seed items from the indent API
      let freshItems: PrItem[] = [];
      let freshIndentType: 'PR' | 'SPR' = 'PR';
      try {
        const seeded = await fetchIndentByPrNumber(normalizedIndentId);
        freshItems = seeded.items;
        freshIndentType = seeded.indentType;
      } catch {
        // ignore, keep empty
      }

      const empty: Comparative = {
        indentId: normalizedIndentId,
        indentType: freshIndentType,
        title: 'Price Comparative Statement',
        subTitle: 'for office Porta Cabins at Chhattisgarh',
        vendors: [
          { id: genId(), name: 'CHHATTISGARH PORTABLE INFRATECH', location: '(Bhilai, Chhattisgarh -', phone: '9165271111)' },
          { id: genId(), name: 'MAHAKAL PORTABLE CABIN & FABRICATION', location: '(Khasra, Durg, Chhattisgarh -', phone: '9702430797)' },
        ],
        items: freshItems,
        quotes: [],
        gstPercent: undefined,
        freightCharges: {},
        otherCharges: {},
        baseAmountA: {},
        baseAmountB: {},
        lastSavedAt: undefined,
        lastSavedSource: undefined,
      };
      setModel(empty);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [normalizedIndentId]);

  // After directory vendors list loads, hydrate names/phone/address for vendors coming from backend draft.
  useEffect(() => {
    if (!directoryVendors.length) return;
    setModel((p) => {
      if (!p) return p;
      let changed = false;
      const nextVendors = p.vendors.map((v) => {
        if (!v.directoryVendorId) return v;
        const dv = directoryVendors.find((x) => x.id === v.directoryVendorId);
        if (!dv) return v;

        const next = {
          ...v,
          name: dv.name || v.name,
          phone: dv.phone || v.phone,
          location: dv.address || v.location,
        };
        if (next.name !== v.name || next.phone !== v.phone || next.location !== v.location) changed = true;
        return next;
      });
      return changed ? { ...p, vendors: nextVendors } : p;
    });
  }, [directoryVendors]);

  const vendorOrder = model?.vendors ?? [];

  const vendorSelectedById = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const v of vendorOrder) out[v.id] = Boolean(v.directoryVendorId);
    return out;
  }, [vendorOrder]);

  const amountsByVendor = useMemo(() => {
    if (!model) return {} as Record<string, number[]>;
    const out: Record<string, number[]> = {};
    for (const v of model.vendors) {
      const q = model.quotes.find((x) => x.vendorId === v.id);
      out[v.id] = model.items.map((it) => {
        const unit = q?.unitRateByItemId?.[it.id] ?? 0;
        return unit * it.qty;
      });
    }
    return out;
  }, [model]);

  const totalByVendor = useMemo(() => {
    if (!model) return {} as Record<string, number>;
    const out: Record<string, number> = {};
    for (const v of model.vendors) {
      const amts = amountsByVendor[v.id] || [];
      out[v.id] = amts.reduce((s, a) => s + a, 0);
    }
    return out;
  }, [model, amountsByVendor]);

  const baseABByVendor = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of vendorOrder) out[v.id] = totalByVendor[v.id] || 0;
    return out;
  }, [vendorOrder, totalByVendor]);

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

  // NOTE: No default GST. Each item must carry its own GST% (blank => 0).

  // GST is calculated on Base Amount only, and ONLY from per-item GST%.
  const gstByVendor = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of vendorOrder) {
      let sum = 0;
      const q = model?.quotes?.find((x) => x.vendorId === v.id);
      for (const it of model?.items ?? []) {
        const unit = q?.unitRateByItemId?.[it.id] ?? 0;
        const amt = unit * it.qty;
        const gp = Number(isFinite(Number(it.gstPercent)) ? it.gstPercent : 0) || 0;
        sum += amt * (gp / 100);
      }
      out[v.id] = sum;
    }
    return out;
  }, [vendorOrder, model]);

  const taxableSubtotalByVendor = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of vendorOrder) {
      // "Sub Total" now means Base + Freight + Other (GST not included)
      out[v.id] = (baseABByVendor[v.id] || 0) + (freightByVendor[v.id] || 0) + (otherByVendor[v.id] || 0);
    }
    return out;
  }, [vendorOrder, baseABByVendor, freightByVendor, otherByVendor]);

  const grandTotalByVendor = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of vendorOrder) {
      out[v.id] = (taxableSubtotalByVendor[v.id] || 0) + (gstByVendor[v.id] || 0);
    }
    return out;
  }, [vendorOrder, taxableSubtotalByVendor, gstByVendor]);

  const vendorLTagByVendorId = useMemo(() => {
    const totals = vendorOrder
      .map((v) => ({ vendorId: v.id, total: Number(grandTotalByVendor[v.id] ?? 0) || 0 }))
      .filter((x) => x.vendorId);

    // Only rank vendors once they have a non-zero total.
    const rankable = totals.filter((x) => x.total > 0);
    if (rankable.length === 0) return {} as Record<string, string>;

    rankable.sort((a, b) => a.total - b.total);

    const out: Record<string, string> = {};
    rankable.forEach((x, idx) => {
      out[x.vendorId] = `L${idx + 1}`;
    });
    return out;
  }, [vendorOrder, grandTotalByVendor]);

  const eligibleRecommendationVendors = useMemo(() => {
    return vendorOrder
      .filter((v) => Boolean(v.directoryVendorId))
      .map((v) => ({
        vendorId: v.id,
        vendorDirectoryId: String(v.directoryVendorId || '').trim(),
        name: v.name,
        total: Number(grandTotalByVendor[v.id] ?? 0) || 0,
        status: String(vendorLTagByVendorId[v.id] || '').trim(),
      }))
      .filter((x) => x.vendorId);
  }, [vendorOrder, grandTotalByVendor, vendorLTagByVendorId]);

  const setVendorRate = (vendorId: string, itemId: string, val: string) => {
    if (!model) return;
    const rate = Number(val);
    setModel((prev) => {
      if (!prev) return prev;
      const quotes = [...prev.quotes];
      const idx = quotes.findIndex((q) => q.vendorId === vendorId);
      if (idx === -1) {
        quotes.push({ vendorId, unitRateByItemId: { [itemId]: Number.isFinite(rate) ? rate : 0 } });
      } else {
        quotes[idx] = {
          ...quotes[idx],
          unitRateByItemId: { ...(quotes[idx].unitRateByItemId || {}), [itemId]: Number.isFinite(rate) ? rate : 0 },
        };
      }
      return { ...prev, quotes };
    });
  };

  const addVendor = () => {
    if (!model) return;
    setModel((p) => {
      if (!p) return p;
      const vendors = [...p.vendors, { id: genId(), name: `Vendor ${p.vendors.length + 1}` }];
      return { ...p, vendors };
    });
  };

  const removeVendor = (vendorId: string) => {
    if (!model) return;
    setModel((p) => {
      if (!p) return p;
      return {
        ...p,
        vendors: p.vendors.filter((v) => v.id !== vendorId),
        quotes: p.quotes.filter((q) => q.vendorId !== vendorId),
      };
    });
  };

  const updateVendorName = (vendorId: string, name: string) => {
    if (!model) return;
    setModel((p) => {
      if (!p) return p;
      return { ...p, vendors: p.vendors.map((v) => (v.id === vendorId ? { ...v, name } : v)) };
    });
  };

  const setMeta = (
    key:
      | 'paymentTerms'
      | 'deliveryTimeline'
      | 'priceBasis'
      | 'warranty'
      | 'loading'
      | 'unloading'
      | 'vendorStatus',
    vendorId: string,
    value: string,
  ) => {
    if (!model) return;
    setModel((p) => {
      if (!p) return p;
      return { ...p, [key]: { ...(p as any)[key], [vendorId]: value } } as Comparative;
    });
  };

  const setBase = (key: 'baseAmountA' | 'baseAmountB', vendorId: string, value: string) => {
    const num = Number(value);
    setModel((p) => {
      if (!p) return p;
      return { ...p, [key]: { ...(p as any)[key], [vendorId]: Number.isFinite(num) ? num : 0 } } as Comparative;
    });
  };

  const setCharge = (key: 'freightCharges' | 'otherCharges', vendorId: string, value: string) => {
    const num = Number(value);
    setModel((p) => {
      if (!p) return p;
      const cur = (p as any)[key] || {};
      return { ...p, [key]: { ...cur, [vendorId]: Number.isFinite(num) ? num : 0 } } as Comparative;
    });
  };

  const setPercent = (key: 'gstPercent' | 'taxPercent', value: string) => {
    const num = Number(value);
    setModel((p) => {
      if (!p) return p;
      return { ...p, [key]: Number.isFinite(num) ? num : 0 } as Comparative;
    });
  };

  const persist = (next: Comparative) => {
    if (!normalizedIndentId) return;
    const all = readAll();
    // Vendor Status (L1/L2/...) is derived from totals, but persist it as well
    // so reloads/export-like flows keep the same snapshot.
    const vendorStatus: Record<string, string> = {};
    for (const v of vendorOrder) vendorStatus[v.id] = vendorLTagByVendorId[v.id] || '';
    all[normalizedIndentId] = { ...next, vendorStatus };
    writeAll(all);
  };

  type SaveComparativeDraftItemRow = {
    item_name: string;
    quantity: number;
    UoM: string;
    gst_percentage: number;
  };

  type SaveComparativeDraftQuoter = {
    vendor_id: string;
    item_costing: Record<
      string,
      {
        per_unit_costing: number;
        quanity: number;
        final_costing: number;
      }
    >;
    freight_charges?: number | null;
    other_charges?: number | null;
    subtotal: number;
    total_amount: number;
    payment_terms?: string | null;
    delivery_time?: string | null;
    warrenty_garantee?: string | null;
    price_basis?: string | null;
  };

  type SaveComparativeDraftPayload = {
    pr_number: string;
    item_row: SaveComparativeDraftItemRow[];
    quoters: SaveComparativeDraftQuoter[];
  };

  type SaveComparativeFinalPayload = SaveComparativeDraftPayload & {
    technical_recommendation: string;
  };

  const buildSaveDraftPayload = (m: Comparative): SaveComparativeDraftPayload => {
    const prNumber = String(normalizedIndentId || m.indentId || '').trim();

    const item_row: SaveComparativeDraftItemRow[] = (m.items ?? []).map((it) => {
      const gst = Number.isFinite(Number(it.gstPercent)) ? Number(it.gstPercent) : 0;
      return {
        item_name: String(it.partName ?? '').trim(),
        quantity: Number(it.qty ?? 0) || 0,
        UoM: String(it.uom ?? '').trim(),
        gst_percentage: Number.isFinite(gst) ? gst : 0,
      };
    });

    const quoters: SaveComparativeDraftQuoter[] = (m.vendors ?? [])
      .map((v) => {
        const vendor_id = String(v.directoryVendorId ?? '').trim();
        if (!vendor_id) return null;

        const q = (m.quotes ?? []).find((x) => x.vendorId === v.id);
        const item_costing: SaveComparativeDraftQuoter['item_costing'] = {};
        for (const it of m.items ?? []) {
          const productName = String(it.partName ?? '').trim();
          if (!productName) continue;
          const unit = Number(q?.unitRateByItemId?.[it.id] ?? 0) || 0;
          const quantity = Number(it.qty ?? 0) || 0;
          const final = unit * quantity;
          item_costing[productName] = {
            per_unit_costing: unit,
            quanity: quantity,
            final_costing: final,
          };
        }

        const freight = Number(freightByVendor[v.id] ?? 0) || 0;
        const other = Number(otherByVendor[v.id] ?? 0) || 0;
        const subtotal = Number(taxableSubtotalByVendor[v.id] ?? 0) || 0;
        const total_amount = Number(grandTotalByVendor[v.id] ?? 0) || 0;

        const payment_terms = String((m.paymentTerms as any)?.[v.id] ?? '').trim();
        const delivery_time = String((m.deliveryTimeline as any)?.[v.id] ?? '').trim();
        const warrenty_garantee = String((m.warranty as any)?.[v.id] ?? '').trim();

        return {
          vendor_id,
          item_costing,
          freight_charges: freight,
          other_charges: other,
          subtotal,
          total_amount,
          payment_terms: payment_terms ? payment_terms : null,
          delivery_time: delivery_time ? delivery_time : null,
          warrenty_garantee: warrenty_garantee ? warrenty_garantee : null,
          price_basis: String((m.priceBasis as any)?.[v.id] ?? '').trim() || null,
        } satisfies SaveComparativeDraftQuoter;
      })
      .filter(Boolean) as SaveComparativeDraftQuoter[];

    return {
      pr_number: prNumber,
      item_row,
      quoters,
    };
  };

  const saveDraftToApi = async (payload: SaveComparativeDraftPayload) => {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) throw new Error('API base URL is not set');
    const url = `${baseUrl}/purchase_flow/save_comparative_statement_draft`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(errText || `HTTP ${res.status}`);
    }

    return res.json().catch(() => null);
  };

  const saveFinalToApi = async (payload: SaveComparativeFinalPayload) => {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) throw new Error('API base URL is not set');
    const url = `${baseUrl}/purchase_flow/save_comparative_statement`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(errText || `HTTP ${res.status}`);
    }

    return res.json().catch(() => null);
  };

  const saveDraft = async () => {
    if (!model) return;
    if (savingDraft) return;

    if ((model.items ?? []).length === 0) {
      toast.error('Add at least 1 item before saving draft');
      return;
    }

    // Always persist locally first so the user never loses progress.
    const localSnapshot: Comparative = { ...model, isDraft: true, lastSavedAt: toIsoNow(), lastSavedSource: 'local' };
    persist(localSnapshot);
    setModel(localSnapshot);

    setSavingDraft(true);
    try {
      const payload = buildSaveDraftPayload(localSnapshot);
      const apiRes: any = await saveDraftToApi(payload);

      const serverSavedAt = safeTrim(apiRes?.created_at || apiRes?.updated_at || apiRes?.saved_at);
      setModel((p) => {
        if (!p) return p;
        return {
          ...p,
          lastSavedAt: serverSavedAt || p.lastSavedAt || toIsoNow(),
          lastSavedSource: serverSavedAt ? 'server' : p.lastSavedSource || 'local',
        };
      });
      toast.success('Draft saved');
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? '').trim();
      toast.error(`Draft saved locally, but server save failed${msg ? `: ${msg}` : ''}`);
    } finally {
      setSavingDraft(false);
    }
  };

  const askRecommendationAndSave = () => {
    if (!model) return;

    if ((model.items ?? []).length === 0) {
      toast.error('No items found to save');
      return;
    }

    // model.technicalRecommendationVendorId stores the DIRECTORY vendor_id.
    // recommendationVendorId state stores the internal column vendorId (QuoteVendor.id).
    const alreadyChosenDirectoryId = String(model.technicalRecommendationVendorId || '').trim();
    const alreadyChosenInternalId = alreadyChosenDirectoryId
      ? vendorOrder.find((v) => String(v.directoryVendorId || '').trim() === alreadyChosenDirectoryId)?.id
      : '';
    const firstEligibleInternalId = eligibleRecommendationVendors[0]?.vendorId || '';
    setRecommendationVendorId(alreadyChosenInternalId || firstEligibleInternalId);
    setOpenRecommendation(true);
  };

  const confirmRecommendationAndSave = () => {
    if (!model) return;
    if (savingFinal) return;

    const chosenInternalVendorId = String(recommendationVendorId || '').trim();
    if (!chosenInternalVendorId) {
      toast.error('Please select a vendor for technical recommendation');
      return;
    }

    const chosenDirectoryVendorId = String(
      model.vendors.find((v) => v.id === chosenInternalVendorId)?.directoryVendorId ||
        chosenInternalVendorId,
    ).trim();
    if (!chosenDirectoryVendorId) {
      toast.error('Selected vendor is missing Vendor ID');
      return;
    }

    const nextModel: Comparative = {
      ...model,
      isDraft: false,
      technicalRecommendationVendorId: chosenDirectoryVendorId,
      lastSavedAt: toIsoNow(),
      lastSavedSource: 'local',
    };

    // Always persist locally first so the user never loses progress.
    persist(nextModel);

    setSavingFinal(true);

    const base = buildSaveDraftPayload(nextModel);
    const payload: SaveComparativeFinalPayload = {
      ...base,
      technical_recommendation: chosenDirectoryVendorId,
    };

    void saveFinalToApi(payload)
      .then(() => {
        toast.success('Quotation saved');
        setOpenRecommendation(false);
        navigate('/purchase-requisition');
      })
      .catch((e: any) => {
        const msg = String(e?.message ?? e ?? '').trim();
        toast.error(`Saved locally, but server save failed${msg ? `: ${msg}` : ''}`);
        setOpenRecommendation(false);
      })
      .finally(() => {
        setSavingFinal(false);
      });
  };

  const statusBgClass = (value: string) => {
    const v = (value || '').toLowerCase();
    if (v.includes('l1') || v.includes('l 1')) return 'bg-green-100';
    return '';
  };

  const statusTextClass = (value: string) => {
    const v = (value || '').toLowerCase();
    if (v.includes('l1') || v.includes('l 1')) return 'font-semibold';
    if (v.includes('l2') || v.includes('l 2')) return 'font-semibold';
    return '';
  };

  const emphasizeLx = (value: string) => {
    const raw = value || '';
    // highlight only the L1/L2 token similar to the sheet
    return raw.replace(/\b(L\s*1|L\s*2)\b/gi, (m) => `<b>${m.toUpperCase().replace(/\s+/g, ' ')}</b>`);
  };

  const getDirectoryVendorById = (id?: string) => {
    if (!id) return undefined;
    return directoryVendors.find((x) => x.id === id);
  };

  if (!indentId) {
    return <div className="p-6">Invalid indent.</div>;
  }

  if (!model) {
    return <div className="p-6">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => navigate('/purchase-requisition')}>
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div>
            <div className="text-lg font-bold">Add Quotation</div>
            <div className="text-xs text-muted-foreground">Indent: {normalizedIndentId || indentId}</div>
            {model.lastSavedAt ? (
              <div className="text-[11px] text-muted-foreground">
                Last saved: <span className="text-foreground/80 font-medium">{formatDateTime(model.lastSavedAt)}</span>
                {model.lastSavedSource ? (
                  <span className="text-muted-foreground"> ({model.lastSavedSource})</span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={addVendor} disabled={savingDraft || savingFinal}>
            <Plus className="w-4 h-4" /> Add Vendor
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={saveDraft}
            disabled={savingDraft || savingFinal || (model.items ?? []).length === 0}
          >
            {savingDraft ? 'Saving draft…' : 'Save as draft'}
          </Button>
          <Button className="gap-2" onClick={askRecommendationAndSave} disabled={savingDraft || savingFinal}>
            <Save className="w-4 h-4" /> {savingFinal ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <Dialog open={openRecommendation} onOpenChange={setOpenRecommendation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Technical Recommendation</DialogTitle>
            <DialogDescription>Select one vendor quotation as the recommendation.</DialogDescription>
          </DialogHeader>

          {eligibleRecommendationVendors.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No vendors available to recommend. Select at least one vendor first.
            </div>
          ) : (
            <RadioGroup value={recommendationVendorId} onValueChange={setRecommendationVendorId}>
              {eligibleRecommendationVendors.map((v) => (
                <label
                  key={v.vendorId}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                >
                  <RadioGroupItem value={v.vendorId} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-muted-foreground">
                      Vendor ID: <span className="font-mono text-foreground">{v.vendorDirectoryId || '—'}</span>
                    </div>
                    <div className="text-sm font-medium truncate">{v.name || 'Vendor'}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Total: <span className="text-foreground">{v.total ? inr(v.total) : '—'}</span>
                      </span>
                      <span>
                        Status:{' '}
                        <span className="text-foreground font-medium">{v.status || '-'}</span>
                      </span>
                    </div>
                  </div>
                </label>
              ))}
            </RadioGroup>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenRecommendation(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmRecommendationAndSave}
              disabled={eligibleRecommendationVendors.length === 0 || !recommendationVendorId || savingFinal}
            >
              {savingFinal ? 'Saving…' : 'Confirm & Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Layout table matching provided image */}
      <div className="overflow-auto rounded-xl border border-border bg-card shadow-card">
        <table className="w-max min-w-[1100px] border-collapse text-[12px] table-fixed">
          {/* Fix column widths so they never shrink */}
          <colgroup>
            <col style={{ width: 60 }} />
            <col style={{ width: 320 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 80 }} />
            {vendorOrder.map((v) => (
              <Fragment key={`${v.id}-cols`}>
                <col style={{ width: 140 }} />
                <col style={{ width: 140 }} />
              </Fragment>
            ))}
          </colgroup>

          <thead>
            <tr>
              <th className="border border-border bg-primary/10 text-center px-2 py-2" colSpan={4}>
                <div className="space-y-1">
                  <Input
                    value={model.title || ''}
                    onChange={(e) => setModel((p) => (p ? { ...p, title: e.target.value } : p))}
                    className="h-8 bg-background font-semibold text-center"
                    placeholder="Price Comparative Statement"
                  />
                  <Input
                    value={model.subTitle || ''}
                    onChange={(e) => setModel((p) => (p ? { ...p, subTitle: e.target.value } : p))}
                    className="h-7 bg-background text-[11px] text-center"
                    placeholder="for ..."
                  />
                  <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                    <span className="text-foreground/80">Indent:</span>
                    <span className="font-medium text-foreground">{normalizedIndentId || indentId}</span>
                  </div>
                </div>
              </th>

              {vendorOrder.map((v) => {
                const selectedDirVendor = getDirectoryVendorById(v.directoryVendorId);
                const isSelected = Boolean(v.directoryVendorId);
                return (
                  <th key={v.id} className="border border-border bg-secondary/40 px-2 py-2" colSpan={2}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        {/* Vendor Id (show only after selecting vendor name) */}
                        {v.directoryVendorId ? (
                          <div className="text-[10px] text-muted-foreground mb-1">
                            Vendor ID: <span className="font-mono text-foreground">{v.directoryVendorId}</span>
                          </div>
                        ) : null}

                        {/* FULL name visible (wrapped) */}
                        <div className="text-[12px] font-semibold text-foreground whitespace-normal break-words leading-snug">
                          {selectedDirVendor?.name || (v.name?.trim() ? v.name : 'Select vendor')}
                        </div>

                        {/* Selector kept below for changing vendor */}
                        <div className="mt-1">
                          <select
                            value={v.directoryVendorId ?? ''}
                            onChange={(e) => updateVendorFromDirectory(v.id, e.target.value)}
                            className="h-8 w-full rounded-md border border-input bg-background px-2 text-[12px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            {directoryVendors.length === 0 ? (
                              <option value="" disabled>
                                Loading vendors...
                              </option>
                            ) : (
                              <option value="" disabled>
                                Select vendor
                              </option>
                            )}
                            {directoryVendors.map((dv) => (
                              <option key={dv.id} value={dv.id}>
                                {dv.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="mt-2 grid grid-cols-1 gap-1">
                          <Input
                            value={v.location || ''}
                            onChange={(e) =>
                              setModel((p) =>
                                p
                                  ? {
                                      ...p,
                                      vendors: p.vendors.map((x) => (x.id === v.id ? { ...x, location: e.target.value } : x)),
                                    }
                                  : p,
                              )
                            }
                            className="h-7 bg-background text-[11px]"
                            placeholder="Address / location"
                            disabled={!isSelected}
                          />
                          <Input
                            value={v.phone || ''}
                            onChange={(e) =>
                              setModel((p) =>
                                p
                                  ? {
                                      ...p,
                                      vendors: p.vendors.map((x) => (x.id === v.id ? { ...x, phone: e.target.value } : x)),
                                    }
                                  : p,
                              )
                            }
                            className="h-7 bg-background text-[11px]"
                            placeholder="Phone"
                            disabled={!isSelected}
                          />
                        </div>
                      </div>
                      <button type="button" className="text-muted-foreground hover:text-destructive mt-1" onClick={() => removeVendor(v.id)}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>

            <tr className="bg-muted/40">
              <th className="border border-border px-2 py-1 w-[60px]">Sr.No</th>
              <th className="border border-border px-2 py-1">
                Item / Part Name
              </th>
              <th className="border border-border px-2 py-1 w-[80px]">QTY</th>
              <th className="border border-border px-2 py-1 w-[80px]">UOM</th>
              {vendorOrder.map((v) => (
                <Fragment key={`${v.id}-headcols`}>
                  <th className="border border-border bg-info/10 px-2 py-1 w-[140px]">Unit Rate</th>
                  <th className="border border-border bg-info/10 px-2 py-1 w-[140px]">Amount</th>
                </Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            {model.items.length === 0 ? (
              <tr>
                <td
                  className="border border-border px-2 py-6 text-center text-muted-foreground"
                  colSpan={4 + vendorOrder.length * 2}
                >
                  No items found for this indent.
                </td>
              </tr>
            ) : (
              model.items.map((it, idx) => (
                <tr key={it.id}>
                  <td className="border border-border px-2 py-1 text-center">{idx + 1}</td>
                  <td className="border border-border px-2 py-1">
                    <div className="flex items-center justify-between gap-2">
                      <span>{it.partName}</span>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span>GST%</span>
                        <Input
                          className="h-7 w-[70px] bg-background text-right"
                          value={String(Number.isFinite(it.gstPercent as any) ? it.gstPercent : '')}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const num = Number(raw);
                            setModel((p) => {
                              if (!p) return p;
                              const items = p.items.map((x) =>
                                x.id === it.id
                                  ? {
                                      ...x,
                                      gstPercent: raw.trim() === '' ? undefined : Number.isFinite(num) ? num : x.gstPercent,
                                    }
                                  : x,
                              );
                              return { ...p, items };
                            });
                          }}
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </td>
                  <td className="border border-border px-2 py-1 text-center">{it.qty}</td>
                  <td className="border border-border px-2 py-1 text-center">{it.uom}</td>
                  {vendorOrder.map((v) => {
                    const q = model.quotes.find((x) => x.vendorId === v.id);
                    const unit = q?.unitRateByItemId?.[it.id] ?? 0;
                    const amt = unit * it.qty;
                    const locked = !vendorSelectedById[v.id];
                    return (
                      <Fragment key={`${it.id}-${v.id}-cells`}>
                        <td className="border border-border px-2 py-1">
                          <Input
                            className="h-8"
                            value={String(unit || '')}
                            onChange={(e) => setVendorRate(v.id, it.id, e.target.value)}
                            placeholder="0"
                            disabled={locked}
                          />
                        </td>
                        <td className="border border-border px-2 py-1 text-right">{amt ? inr(amt) : ''}</td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))
            )}

            {/* Summary section */}
            {vendorOrder.length > 0 && (
              <>
                {/* Base Amount under respective vendor columns */}
                <tr className="bg-primary/10 font-semibold">
                  <td className="border border-border px-2 py-2" colSpan={4}>
                    Base Amount
                  </td>
                  {vendorOrder.map((v) => (
                    <Fragment key={`${v.id}-base`}> 
                      <td className="border border-border px-2 py-2"></td>
                      <td className="border border-border px-2 py-2 text-right">
                        {baseABByVendor[v.id] ? inr(baseABByVendor[v.id]) : ''}
                      </td>
                    </Fragment>
                  ))}
                </tr>

                <tr className="bg-background">
                  <td className="border border-border px-2 py-1 text-right font-semibold" colSpan={4}>
                    GST (as per item GST%)
                  </td>
                  {vendorOrder.map((v) => (
                    <td key={`${v.id}-gst`} className="border border-border px-2 py-1 text-right" colSpan={2}>
                      {gstByVendor[v.id] ? inr(gstByVendor[v.id]) : ''}
                    </td>
                  ))}
                </tr>

                <tr className="bg-background">
                  <td className="border border-border px-2 py-1 text-right font-semibold" colSpan={4}>
                    Freight Charges
                  </td>
                  {vendorOrder.map((v) => (
                    <td key={`${v.id}-freight`} className="border border-border px-2 py-1" colSpan={2}>
                      <Input
                        className="h-8 w-full"
                        value={String(freightByVendor[v.id] || '')}
                        onChange={(e) => setCharge('freightCharges', v.id, e.target.value)}
                        placeholder="0"
                        disabled={!vendorSelectedById[v.id]}
                      />
                    </td>
                  ))}
                </tr>

                <tr className="bg-background">
                  <td className="border border-border px-2 py-1 text-right font-semibold" colSpan={4}>
                    Other Charges
                  </td>
                  {vendorOrder.map((v) => (
                    <td key={`${v.id}-other`} className="border border-border px-2 py-1" colSpan={2}>
                      <Input
                        className="h-8 w-full"
                        value={String(otherByVendor[v.id] || '')}
                        onChange={(e) => setCharge('otherCharges', v.id, e.target.value)}
                        placeholder="0"
                        disabled={!vendorSelectedById[v.id]}
                      />
                    </td>
                  ))}
                </tr>

                <tr className="bg-primary/10 font-semibold">
                  <td className="border border-border px-2 py-1 text-right" colSpan={4}>
                    Sub Total
                  </td>
                  {vendorOrder.map((v) => (
                    <td key={`${v.id}-sub`} className="border border-border px-2 py-1 text-right" colSpan={2}>
                      {taxableSubtotalByVendor[v.id] ? inr(taxableSubtotalByVendor[v.id]) : ''}
                    </td>
                  ))}
                </tr>

                <tr className="bg-primary/10 font-semibold">
                  <td className="border border-border px-2 py-1 text-right" colSpan={4}>
                    Total Amount
                  </td>
                  {vendorOrder.map((v) => (
                    <td key={`${v.id}-gt`} className="border border-border px-2 py-1 text-right" colSpan={2}>
                      {grandTotalByVendor[v.id] ? inr(grandTotalByVendor[v.id]) : ''}
                    </td>
                  ))}
                </tr>
              </>
            )}

            {/* meta rows */}
            {(
              [
                ['Payment Terms', 'paymentTerms'],
                ['Delivery Timeline', 'deliveryTimeline'],
                ['Price Basis', 'priceBasis'],
                ['Warranty/Guarantee', 'warranty'],
                ['Loading of Porta Cabin', 'loading'],
                ['Unloading of Porta Cabin', 'unloading'],
                ['Vendor Status', 'vendorStatus'],
              ] as const
            ).map(([label, key]) => (
              <tr key={key}>
                <td className="border border-border px-2 py-1 font-semibold align-top" colSpan={4}>
                  {label}
                </td>
                {vendorOrder.map((v) => {
                  const value =
                    key === 'vendorStatus'
                      ? String(vendorLTagByVendorId[v.id] || '')
                      : String((model as any)[key]?.[v.id] ?? '');
                  const isStatus = key === 'vendorStatus';
                  const locked = !vendorSelectedById[v.id];
                  const cls = `border border-border px-2 py-1 align-top ${isStatus ? statusBgClass(value) : ''}`;
                  return (
                    <td key={`${key}-${v.id}`} className={cls} colSpan={2}>
                      {isStatus ? (
                        <div className="min-h-[44px]">
                          <div className="h-8 flex items-center">
                            <span className={`text-[12px] ${statusTextClass(value)}`}>{value || '-'}</span>
                          </div>
                        </div>
                      ) : (
                        <AutoGrowTextarea
                          value={value}
                          onChange={(t) => {
                            if (locked) return;
                            setMeta(key, v.id, t);
                          }}
                          placeholder={locked ? 'Select vendor first' : '-'}
                          className="w-full resize-none overflow-hidden bg-transparent outline-none text-[12px] leading-[1.25]"
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-muted-foreground">
        Tip: This page is a full page (not a popup). Use Save to store the quotation.
      </div>
    </div>
  );
}
