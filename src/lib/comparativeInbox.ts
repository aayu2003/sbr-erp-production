import { type ComparativeModel } from '@/components/purchase/ComparativeStatementPreview';

export type ApiTcItemRow = {
  item_name?: unknown;
  UoM?: unknown;
  gst_percentage?: unknown;
  quantity?: unknown;
};

export type ApiTcQuoter = {
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

export type ApiTcComparative = {
  created_at?: unknown;
  quoters?: unknown;
  item_row?: unknown;
  technical_recommendation?: unknown;
  status?: unknown;
  pr_number?: unknown;
  approved_vendor_id?: unknown;
  TC_status?: unknown;
  NFA_status?: unknown;
  comparison_id?: unknown;
  comparision_id?: unknown;
  indent_type?: unknown;
  meta?: unknown;
};

export const safeTrim = (v: unknown) => String(v ?? '').trim();

export const numOr0 = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};

const stableItemId = (itemName: string, idx: number) => {
  const base = safeTrim(itemName) || 'item';
  const safe = base.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `it-${idx + 1}-${safe || 'x'}`;
};

export const mapTcToModel = (x: ApiTcComparative): ComparativeModel | null => {
  const prNumber = safeTrim((x as any)?.pr_number);
  if (!prNumber) return null;

  const comparisonId = safeTrim((x as any)?.comparison_id ?? (x as any)?.comparision_id);
  const flowStatus = safeTrim((x as any)?.status);
  const tcStatus = safeTrim((x as any)?.TC_status);
  const nfaStatus = safeTrim((x as any)?.NFA_status);
  const backendApprovedVendorId = safeTrim((x as any)?.approved_vendor_id);

  const tcStatusLower = tcStatus.toLowerCase();
  const isTcApproved =
    tcStatusLower === 'approved' ||
    (Boolean(backendApprovedVendorId) && (!tcStatusLower || tcStatusLower !== 'pending'));

  const rawItems = Array.isArray((x as any)?.item_row) ? ((x as any).item_row as ApiTcItemRow[]) : [];
  const itemIdByName: Record<string, string> = {};
  const items: ComparativeModel['items'] = rawItems
    .map((r, idx) => {
      const name = safeTrim((r as any)?.item_name);
      const id = stableItemId(name || `item-${idx + 1}`, idx);
      if (name) itemIdByName[name.toLowerCase()] = id;
      return {
        id,
        srNo: idx + 1,
        partName: name,
        uom: safeTrim((r as any)?.UoM),
        qty: numOr0((r as any)?.quantity),
        gstPercent: numOr0((r as any)?.gst_percentage),
      };
    })
    .filter((it) => it.id);

  const rawQuoters = Array.isArray((x as any)?.quoters) ? ((x as any).quoters as ApiTcQuoter[]) : [];

  const vendors: NonNullable<ComparativeModel['vendors']> = [];
  const seenVendor: Record<string, true | undefined> = {};
  for (const q of rawQuoters) {
    const vendorId = safeTrim((q as any)?.vendor_id);
    if (!vendorId || seenVendor[vendorId]) continue;
    seenVendor[vendorId] = true;
    vendors.push({ id: vendorId, name: vendorId, directoryVendorId: vendorId });
  }

  const paymentTerms: Record<string, string> = {};
  const deliveryTimeline: Record<string, string> = {};
  const warranty: Record<string, string> = {};
  const freightCharges: Record<string, number> = {};
  const otherCharges: Record<string, number> = {};

  const quotes: NonNullable<ComparativeModel['quotes']> = rawQuoters
    .map((q) => {
      const vendorId = safeTrim((q as any)?.vendor_id);
      if (!vendorId) return null;

      const pt = safeTrim((q as any)?.payment_terms);
      const dt = safeTrim((q as any)?.delivery_time);
      const wg = safeTrim((q as any)?.warrenty_garantee);
      if (pt) paymentTerms[vendorId] = pt;
      if (dt) deliveryTimeline[vendorId] = dt;
      if (wg) warranty[vendorId] = wg;

      freightCharges[vendorId] = numOr0((q as any)?.freight_charges);
      otherCharges[vendorId] = numOr0((q as any)?.other_charges);

      const itemCosting = (q as any)?.item_costing;
      const unitRateByItemId: Record<string, number> = {};
      if (itemCosting && typeof itemCosting === 'object') {
        for (const [itemName, row] of Object.entries(itemCosting as Record<string, any>)) {
          const key = safeTrim(itemName).toLowerCase();
          const mappedId = itemIdByName[key];
          if (!mappedId) continue;
          const unit = numOr0((row as any)?.per_unit_costing);
          if (mappedId) unitRateByItemId[mappedId] = unit;
        }
      }

      return {
        vendorId,
        unitRateByItemId,
      };
    })
    .filter(Boolean) as any;

  const techRec = safeTrim((x as any)?.technical_recommendation);
  const createdAt = safeTrim((x as any)?.created_at);

  // Rows saved after the "meta" field was introduced carry the entire
  // Comparative model from QuotationComparative.tsx/SprQuotationComparative.tsx
  // (comparisonNo, revision, comparison basis, award strategy, custom charges,
  // technical/scope parameters, etc.). Use it to fill in everything this
  // function doesn't otherwise compute from item_row/quoters — the explicit
  // fields below still win since backend status fields must stay authoritative.
  const rawMeta = (x as any)?.meta;
  const meta: Partial<ComparativeModel> = rawMeta && typeof rawMeta === 'object' ? rawMeta : {};

  const model: ComparativeModel = {
    ...meta,
    indentId: prNumber,
    comparisonId: comparisonId || undefined,
    title: meta.title || 'Price Comparative Statement',
    vendors,
    items,
    quotes,
    freightCharges,
    otherCharges,
    paymentTerms,
    deliveryTimeline,
    priceBasis: meta.priceBasis || {},
    warranty,
    vendorStatus: meta.vendorStatus || {},
    technicalRecommendationVendorId: techRec || undefined,
    lastSavedAt: createdAt || undefined,
    isDraft: false,
    hoSelectedVendorId: backendApprovedVendorId || undefined,
    hoForwardedAt: undefined,
    backendApprovedVendorId: backendApprovedVendorId || undefined,
    flowStatus: flowStatus || undefined,
    tcStatus: tcStatus || undefined,
    nfaStatus: nfaStatus || undefined,

    tcApprovedVendorId: isTcApproved ? (backendApprovedVendorId || undefined) : undefined,
    tcApprovedAt: undefined,
    indent_type: (() => {
      const t = safeTrim((x as any)?.indent_type).toUpperCase();
      return t === 'SPR' ? 'SPR' : t === 'PR' ? 'PR' : undefined;
    })(),
  };

  return model;
};

export const tcApproved = (item: ComparativeModel) =>
  safeTrim(item.tcStatus).toLowerCase() === 'approved' || Boolean(safeTrim(item.tcApprovedVendorId));
export const nfaApproved = (item: ComparativeModel) => safeTrim(item.nfaStatus).toLowerCase() === 'approved';
export const orderCreated = (item: ComparativeModel) =>
  Boolean(safeTrim((item as any).poNo) || safeTrim((item as any).poCreatedAt));
