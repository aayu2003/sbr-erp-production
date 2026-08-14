import { Fragment } from 'react';

export type ComparativeVendor = {
  id: string;
  name: string;
  directoryVendorId?: string;
  phone?: string;
  location?: string;
  address?: string;
  attachmentName?: string;
  quotationNo?: string;
};

export type ComparativeItem = {
  id: string;
  srNo?: number;
  partName?: string;
  specification?: string;
  uom?: string;
  qty: number;
  gstPercent?: number;
  taxType?: string;
};

export type ComparativeQuote = {
  vendorId: string;
  unitRateByItemId: Record<string, number>;
  discountPercentByItemId?: Record<string, number>;
};

export type ComparativeCharge = {
  id: string;
  label: string;
  nature: 'Charge' | 'Discount';
  calculation: 'Fixed' | '% of Basic';
  taxPercent?: number;
  values?: Record<string, number>;
};

export type ComparativeParameter = {
  id: string;
  label: string;
  values?: Record<string, string>;
};

export type ComparativeModel = {
  indentId: string;
  comparisonId?: string;
  comparisonNo?: string;
  revision?: number;
  revisionOf?: string;
  revisionDate?: string;
  indentDate?: string;
  department?: string;
  projectCluster?: string;
  deliveryLocation?: string;
  requirementType?: string;
  comparisonBasis?: string;
  requiredByDate?: string;
  preparedBy?: string;
  purposeRemarks?: string;
  title?: string;
  subTitle?: string;
  vendors?: ComparativeVendor[];
  items?: ComparativeItem[];
  quotes?: ComparativeQuote[];
  gstPercent?: number;
  freightCharges?: Record<string, number>;
  otherCharges?: Record<string, number>;
  itemDiscountAmount?: Record<string, number>;
  additionalChargesAmount?: Record<string, number>;
  commercialDiscountAmount?: Record<string, number>;
  roundOffAmount?: Record<string, number>;
  charges?: ComparativeCharge[];
  comparisonParameters?: ComparativeParameter[];
  technicalRecommendationVendorId?: string;
  technicalRecommendedVendorId?: string;
  lastSavedAt?: string;
  isDraft?: boolean;
  hoSelectedVendorId?: string;
  hoForwardedAt?: string;
  paymentTerms?: Record<string, string>;
  deliveryTimeline?: Record<string, string>;
  priceBasis?: Record<string, string>;
  warranty?: Record<string, string>;
  vendorStatus?: Record<string, string>;

  // Backend status fields (optional; used by HO Inbox timeline)
  flowStatus?: string;
  tcStatus?: string;
  nfaStatus?: string;
  backendApprovedVendorId?: string;

  // HO approval
  tcApprovedVendorId?: string;
  tcApprovedAt?: string;

  // HO local-only UI state
  hoLocked?: boolean;

  // Indent type — drives upload dialog heading (PR | SPR | WO | PO | …)
  indent_type?: 'PR' | 'SPR' | 'WO' | 'PO' | (string & {});

  // Purchase order state — backend-authoritative when sourced from
  // get_order_communication, otherwise filled in locally after PO creation.
  poNo?: string;
  poStatus?: string;
  poCreatedAt?: string;
  poDocUrl?: string;
};

const formatInr = (value: number) => {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `₹${Math.round(value)}`;
  }
};

const numOr0 = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};

export function ComparativeStatementPreview({
  c,
  showForwardedStamp,
}: {
  c: ComparativeModel;
  showForwardedStamp?: boolean;
}) {
  const vendors = Array.isArray(c?.vendors) ? c.vendors : [];
  const items = Array.isArray(c?.items) ? c.items : [];
  const quotes = Array.isArray(c?.quotes) ? c.quotes : [];

  const techRecId = String((c as any)?.technicalRecommendationVendorId ?? (c as any)?.technicalRecommendedVendorId ?? '').trim();
  const approvedVendorId = String((c as any)?.tcApprovedVendorId ?? '').trim();
  const isApproved = Boolean(approvedVendorId);
  const isRecommendedVendor = (v: ComparativeVendor) => {
    if (!techRecId) return false;
    const internalId = String(v?.id ?? '').trim();
    const directoryId = String(v?.directoryVendorId ?? '').trim();
    return Boolean((internalId && techRecId === internalId) || (directoryId && techRecId === directoryId));
  };

  const isApprovedVendor = (v: ComparativeVendor) => {
    if (!approvedVendorId) return false;
    const internalId = String(v?.id ?? '').trim();
    const directoryId = String(v?.directoryVendorId ?? '').trim();
    return Boolean((internalId && approvedVendorId === internalId) || (directoryId && approvedVendorId === directoryId));
  };

  const techRecVendor = techRecId ? vendors.find((v) => isRecommendedVendor(v)) : undefined;
  const techRecName = techRecId ? (techRecVendor?.name || techRecId) : '';

  const highlightBg = (v: ComparativeVendor) => {
    if (isApproved) return isApprovedVendor(v) ? 'bg-emerald-50/80' : '';
    return isRecommendedVendor(v) ? 'bg-[#edf5f2]' : '';
  };

  const quoteByVendorId: Record<string, ComparativeQuote | undefined> = {};
  for (const q of quotes) quoteByVendorId[String((q as any)?.vendorId ?? '')] = q;

  const gstPctForItem = (it: ComparativeItem) => {
    const ip = numOr0((it as any)?.gstPercent);
    if (ip) return ip;
    return numOr0((c as any)?.gstPercent);
  };

  const baseForVendor = (vendorId: string) => {
    const q = quoteByVendorId[vendorId];
    return items.reduce((sum, it) => {
      const unit = numOr0(q?.unitRateByItemId?.[it.id]);
      return sum + unit * numOr0(it.qty);
    }, 0);
  };

  const lineDiscountForVendor = (vendorId: string) => {
    const q = quoteByVendorId[vendorId];
    return items.reduce((sum, it) => {
      const gross = numOr0(q?.unitRateByItemId?.[it.id]) * numOr0(it.qty);
      return sum + gross * (numOr0(q?.discountPercentByItemId?.[it.id]) / 100);
    }, 0);
  };

  const itemDiscountForVendor = (vendorId: string) =>
    lineDiscountForVendor(vendorId) + numOr0(c.itemDiscountAmount?.[vendorId]);

  const netBasicForVendor = (vendorId: string) =>
    Math.max(0, baseForVendor(vendorId) - itemDiscountForVendor(vendorId));

  const gstForVendor = (vendorId: string) => {
    const q = quoteByVendorId[vendorId];
    return items.reduce((sum, it) => {
      const unit = numOr0(q?.unitRateByItemId?.[it.id]);
      const gross = unit * numOr0(it.qty);
      const discount = gross * (numOr0(q?.discountPercentByItemId?.[it.id]) / 100);
      const amt = Math.max(0, gross - discount);
      const gp = gstPctForItem(it);
      const taxType = String(it.taxType || '').toLowerCase();
      return sum + (/(exempt|nil rated|rcm|inclusive)/.test(taxType) ? 0 : amt * (gp / 100));
    }, 0);
  };

  const freightForVendor = (vendorId: string) => numOr0((c as any)?.freightCharges?.[vendorId]);
  const otherForVendor = (vendorId: string) => numOr0((c as any)?.otherCharges?.[vendorId]);

  const adjustmentForVendor = (vendorId: string) => {
    let charges = otherForVendor(vendorId) + numOr0(c.additionalChargesAmount?.[vendorId]);
    let discounts = numOr0(c.commercialDiscountAmount?.[vendorId]);
    let tax = 0;
    for (const entry of c.charges || []) {
      const entered = numOr0(entry.values?.[vendorId]);
      const amount = entry.calculation === '% of Basic' ? netBasicForVendor(vendorId) * entered / 100 : entered;
      if (entry.nature === 'Discount') discounts += amount;
      else {
        charges += amount;
        tax += amount * numOr0(entry.taxPercent) / 100;
      }
    }
    return { charges, discounts, tax };
  };

  const grandTotalForVendor = (vendorId: string) => {
    const adjustment = adjustmentForVendor(vendorId);
    return netBasicForVendor(vendorId) + freightForVendor(vendorId) + adjustment.charges - adjustment.discounts + gstForVendor(vendorId) + adjustment.tax + numOr0(c.roundOffAmount?.[vendorId]);
  };

  const vendorLTagByVendorId = (() => {
    const totals = vendors
      .map((v) => ({ vendorId: String(v.id), total: Number(grandTotalForVendor(String(v.id)) ?? 0) || 0 }))
      .filter((x) => x.vendorId);

    const rankable = totals.filter((x) => x.total > 0);
    if (rankable.length === 0) return {} as Record<string, string>;

    rankable.sort((a, b) => a.total - b.total);

    const out: Record<string, string> = {};
    rankable.forEach((x, idx) => {
      out[x.vendorId] = `L${idx + 1}`;
    });
    return out;
  })();

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

  if (!vendors.length || !items.length) {
    return <div className="text-sm text-muted-foreground">No comparative statement details found for this indent.</div>;
  }

  const savedAt = c.lastSavedAt
    ? new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(c.lastSavedAt)).replace(',', ' ·')
    : '';
  const displayDate = (value?: string) => {
    if (!value) return 'Not Recorded';
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
  };
  const commercialParameters = (c.comparisonParameters || []).filter((parameter) =>
    vendors.some((vendor) => String(parameter.values?.[vendor.id] || '').trim()),
  );
  const legacyParameters = [
    ['Payment Terms', c.paymentTerms],
    ['Delivery / Completion Period', c.deliveryTimeline],
    ['Price Basis', c.priceBasis],
    ['Warranty / Guarantee', c.warranty],
    ['Vendor Status', c.vendorStatus],
  ].filter(([, values]) => vendors.some((vendor) => String((values as Record<string, string> | undefined)?.[vendor.id] || '').trim()));

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {isApproved ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden">
          <div className="rotate-[-8deg] rounded-xl border-4 border-emerald-700/15 px-10 py-4 text-4xl font-black tracking-[0.22em] text-emerald-700/15">
            APPROVED
          </div>
        </div>
      ) : showForwardedStamp ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden">
          <div className="rotate-[-8deg] rounded-xl border-4 border-[#0D3A35]/15 px-10 py-4 text-4xl font-black tracking-[0.22em] text-[#0D3A35]/15">
            FORWARDED
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#58716a]">Commercial evaluation</p>
          <h3 className="mt-1 text-base font-bold text-slate-900">Commercial Comparative Statement</h3>
          <p className="mt-0.5 font-mono text-xs font-semibold text-slate-500">{c.comparisonId || c.indentId}</p>
        </div>
        <div className="flex items-center gap-3 sm:text-right">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Document status</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">{c.isDraft ? 'Draft' : 'Saved'}{savedAt ? ` · ${savedAt}` : ''}</p>
          </div>
          <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[10px] font-bold uppercase tracking-wide ${isApproved ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-[#bfd3ce] bg-[#edf5f2] text-[#0D3A35]'}`}>
            {isApproved ? 'Approved' : 'Under review'}
          </span>
        </div>
      </div>

      {techRecId ? (
        <div className="flex flex-col gap-2 border-b border-[#d7e4e0] bg-[#f6faf9] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#58716a]">Technical recommendation</span>
            <span className="ml-2 text-sm font-bold text-[#0D3A35]">{techRecName}</span>
          </div>
          <span className="inline-flex w-fit items-center rounded-full bg-[#0D3A35] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">Recommended vendor</span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50/70 text-xs md:grid-cols-4">
        {[
          ['Indent Date', displayDate(c.indentDate)],
          ['Department', c.department || 'Not Recorded'],
          ['Project / Cluster', c.projectCluster || 'Not Recorded'],
          ['Requirement', c.requirementType || 'Goods'],
          ['Delivery Location', c.deliveryLocation || 'Not Recorded'],
          ['Required By', displayDate(c.requiredByDate)],
          ['Prepared By', c.preparedBy || 'Not Recorded'],
          ['Purpose / Remarks', c.purposeRemarks || 'Not Recorded'],
        ].map(([label, value]) => (
          <div key={label} className="min-h-14 border-b border-r border-slate-200 px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</p>
            <p className="mt-1 break-words font-semibold text-slate-700">{value}</p>
          </div>
        ))}
      </div>

      <div className="border-b border-slate-200 bg-[#edf5f2] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#0D3A35]">Vendor Details</div>
      <div className="grid border-b border-slate-200" style={{ gridTemplateColumns: `repeat(${Math.max(vendors.length, 1)}, minmax(0, 1fr))` }}>
        {vendors.map((vendor, index) => (
          <div key={vendor.id} className={`min-w-0 border-r border-slate-200 px-4 py-3 text-xs last:border-r-0 ${highlightBg(vendor)}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#58716a]">Vendor {index + 1}</p>
                <p className="mt-1 truncate text-sm font-bold text-slate-900">{vendor.name || vendor.directoryVendorId || vendor.id}</p>
              </div>
              {(isApprovedVendor(vendor) || isRecommendedVendor(vendor)) && <span className="shrink-0 rounded-full bg-[#0D3A35] px-2 py-1 text-[8px] font-bold uppercase text-white">{isApprovedVendor(vendor) ? 'Approved' : 'Recommended'}</span>}
            </div>
            <p className="mt-2 break-words text-slate-500">{vendor.address || vendor.location || 'Address not recorded'}</p>
            <p className="mt-1 text-slate-500">Phone: {vendor.phone || 'Not Recorded'}</p>
            <p className="mt-1 truncate text-slate-500">Quotation: {vendor.attachmentName || vendor.quotationNo || 'Not Uploaded'}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#edf5f2] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#0D3A35]">Item &amp; Vendor Comparison</div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-xs text-slate-700">
          <colgroup>
            <col className="w-[54px]" />
            <col className="w-[28%]" />
            <col className="w-[80px]" />
            <col className="w-[80px]" />
            {vendors.map((v) => (
              <Fragment key={`col-${v.id}`}>
                <col />
                <col />
              </Fragment>
            ))}
          </colgroup>
          <thead>
            <tr className="bg-[#0D3A35] text-white">
              <th className="border-r border-white/15 px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide" rowSpan={2}>S. No.</th>
              <th className="border-r border-white/15 px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide" rowSpan={2}>Item</th>
              <th className="border-r border-white/15 px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide" rowSpan={2}>Qty.</th>
              <th className="border-r border-white/15 px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide" rowSpan={2}>UoM</th>
              {vendors.map((v) => (
                <th
                  key={`vh-${v.id}`}
                  className={`border-r border-white/15 px-3 py-2 text-center ${isRecommendedVendor(v) || isApprovedVendor(v) ? 'bg-[#18564e]' : ''}`}
                  colSpan={2}
                >
                  <span className="block truncate text-[11px] font-bold uppercase tracking-wide">{v.name || v.directoryVendorId || v.id}</span>
                </th>
              ))}
            </tr>
            <tr className="bg-[#174b45] text-white">
              {vendors.map((v) => (
                <Fragment key={`vh2-${v.id}`}>
                  <th className="border-r border-white/15 px-3 py-2 text-right text-[9px] font-bold uppercase tracking-wide">Unit Rate</th>
                  <th className="border-r border-white/15 px-3 py-2 text-right text-[9px] font-bold uppercase tracking-wide">Amount</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={it.id} className="border-b border-slate-200 even:bg-slate-50/50">
                <td className="border-r border-slate-200 px-3 py-3 text-center tabular-nums">{(it as any)?.srNo ?? idx + 1}</td>
                <td className="border-r border-slate-200 px-3 py-3 text-left"><p className="font-semibold text-slate-800">{String((it as any)?.partName ?? '')}</p>{it.specification ? <p className="mt-0.5 text-[10px] text-slate-400">{it.specification}</p> : null}</td>
                <td className="border-r border-slate-200 px-3 py-3 text-center tabular-nums">{numOr0(it.qty).toLocaleString('en-IN')}</td>
                <td className="border-r border-slate-200 px-3 py-3 text-center">{String((it as any)?.uom ?? '')}</td>
                {vendors.map((v) => {
                  const q = quoteByVendorId[v.id];
                  const unit = numOr0(q?.unitRateByItemId?.[it.id]);
                  const amt = unit * numOr0(it.qty);
                  return (
                    <Fragment key={`${it.id}-${v.id}`}>
                      <td className={`border-r border-slate-200 px-3 py-3 text-right tabular-nums ${highlightBg(v)}`}>{unit ? formatInr(unit) : '—'}</td>
                      <td className={`border-r border-slate-200 px-3 py-3 text-right font-semibold tabular-nums ${highlightBg(v)}`}>{amt ? formatInr(amt) : '—'}</td>
                    </Fragment>
                  );
                })}
              </tr>
            ))}

            <tr className="border-b border-slate-200 bg-slate-50">
              <td className="px-3 py-2 text-right font-semibold text-slate-600" colSpan={4}>
                Base total
              </td>
              {vendors.map((v) => (
                <td key={`base-${v.id}`} className={`border-l border-slate-200 px-3 py-2 text-right font-semibold tabular-nums ${highlightBg(v)}`} colSpan={2}>
                  {formatInr(baseForVendor(v.id))}
                </td>
              ))}
            </tr>
            <tr className="border-b border-slate-200">
              <td className="px-3 py-2 text-right font-medium text-slate-500" colSpan={4}>Item Discount</td>
              {vendors.map((v) => <td key={`discount-${v.id}`} className={`border-l border-slate-200 px-3 py-2 text-right tabular-nums ${highlightBg(v)}`} colSpan={2}>{formatInr(itemDiscountForVendor(v.id))}</td>)}
            </tr>
            <tr className="border-b border-slate-200 bg-slate-50">
              <td className="px-3 py-2 text-right font-semibold text-slate-600" colSpan={4}>Net Basic Amount</td>
              {vendors.map((v) => <td key={`net-${v.id}`} className={`border-l border-slate-200 px-3 py-2 text-right font-semibold tabular-nums ${highlightBg(v)}`} colSpan={2}>{formatInr(netBasicForVendor(v.id))}</td>)}
            </tr>
            <tr className="border-b border-slate-200">
              <td className="px-3 py-2 text-right font-medium text-slate-500" colSpan={4}>
                Freight
              </td>
              {vendors.map((v) => (
                <td key={`freight-${v.id}`} className={`border-l border-slate-200 px-3 py-2 text-right tabular-nums ${highlightBg(v)}`} colSpan={2}>
                  {formatInr(freightForVendor(v.id))}
                </td>
              ))}
            </tr>
            <tr className="border-b border-slate-200">
              <td className="px-3 py-2 text-right font-medium text-slate-500" colSpan={4}>
                Additional Charges
              </td>
              {vendors.map((v) => (
                <td key={`other-${v.id}`} className={`border-l border-slate-200 px-3 py-2 text-right tabular-nums ${highlightBg(v)}`} colSpan={2}>
                  {formatInr(adjustmentForVendor(v.id).charges)}
                </td>
              ))}
            </tr>
            <tr className="border-b border-slate-200">
              <td className="px-3 py-2 text-right font-medium text-slate-500" colSpan={4}>Commercial Discount</td>
              {vendors.map((v) => <td key={`commercial-discount-${v.id}`} className={`border-l border-slate-200 px-3 py-2 text-right tabular-nums ${highlightBg(v)}`} colSpan={2}>{formatInr(adjustmentForVendor(v.id).discounts)}</td>)}
            </tr>
            <tr className="border-b border-slate-200">
              <td className="px-3 py-2 text-right font-medium text-slate-500" colSpan={4}>Round Off</td>
              {vendors.map((v) => <td key={`round-off-${v.id}`} className={`border-l border-slate-200 px-3 py-2 text-right tabular-nums ${highlightBg(v)}`} colSpan={2}>{formatInr(numOr0(c.roundOffAmount?.[v.id]))}</td>)}
            </tr>
            <tr className="border-b border-slate-200">
              <td className="px-3 py-2 text-right font-medium text-slate-500" colSpan={4}>
                GST
              </td>
              {vendors.map((v) => (
                <td key={`gst-${v.id}`} className={`border-l border-slate-200 px-3 py-2 text-right tabular-nums ${highlightBg(v)}`} colSpan={2}>
                  {formatInr(gstForVendor(v.id))}
                </td>
              ))}
            </tr>
            <tr className="bg-[#0D3A35] text-white">
              <td className="px-3 py-2.5 text-right font-bold uppercase tracking-wide" colSpan={4}>
                Grand total
              </td>
              {vendors.map((v) => (
                <td
                  key={`grand-${v.id}`}
                  className="border-l border-white/15 px-3 py-2.5 text-right font-extrabold tabular-nums"
                  colSpan={2}
                >
                  {formatInr(grandTotalForVendor(v.id))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {(commercialParameters.length > 0 || legacyParameters.length > 0) && (
        <>
          <div className="border-t border-slate-200 bg-[#edf5f2] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#0D3A35]">Commercial Terms</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] table-fixed border-collapse text-xs">
              <colgroup><col className="w-[32%]" />{vendors.map((vendor) => <col key={vendor.id} />)}</colgroup>
              <thead><tr className="bg-[#0D3A35] text-white"><th className="border-r border-white/15 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide">Comparison Parameter</th>{vendors.map((vendor) => <th key={vendor.id} className="border-r border-white/15 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wide">{vendor.name || vendor.id}</th>)}</tr></thead>
              <tbody>
                {(commercialParameters.length ? commercialParameters.map((parameter) => ({ label: parameter.label, values: parameter.values || {} })) : legacyParameters.map(([label, values]) => ({ label: String(label), values: (values || {}) as Record<string, string> }))).map((parameter) => (
                  <tr key={parameter.label} className="border-b border-slate-200">
                    <td className="bg-slate-50 px-3 py-2.5 font-semibold text-slate-600">{parameter.label}</td>
                    {vendors.map((vendor) => {
                      const raw = String(parameter.values[vendor.id] || '').trim();
                      const value = /vendor status/i.test(parameter.label) ? raw || vendorLTagByVendorId[vendor.id] : raw;
                      return <td key={vendor.id} className={`border-l border-slate-200 px-3 py-2.5 text-center ${highlightBg(vendor)} ${/vendor status/i.test(parameter.label) ? statusBgClass(value) : ''}`}><span className={/vendor status/i.test(parameter.label) ? statusTextClass(value) : ''}>{value || 'Not Recorded'}</span></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
