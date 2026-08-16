import { useEffect, useMemo, useState } from 'react';
import { Building2, FileCheck, Hash, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';
import WccModal from '@/components/cultivation/WccModal';
import type { TimelineFarm } from '@/components/cultivation/TaskTimelinePanel';

const BASE_URL = getBaseUrl().replace(/\/$/, '');

type LatLng = [number, number];

// The farm shape this flow needs — a superset of TimelineFarm (map thumbnails) plus
// farmer_id (used to resolve farmer_name for the vendor's scope-of-work cards).
export type WccCreateFlowFarm = TimelineFarm & { farmer_id?: string };

// Shape returned by /admin_cultivation/get_active_vendor
type ApiActiveVendor = { vendor_id: string; vendor_name: string; vendor_contact?: string; order_number?: string };

type ActiveVendor = { vendor_id: string; vendor_name: string; contact?: string; wo_number?: string };

// Shape of each plot within a land, as returned by /admin_cultivation/get_scope_of_work_for_vendor
type ApiPlot = { plot_id: string; plot_name: string; crop_type: string; plot_area: number; plot_coordinates: LatLng[]; created_at?: string };

// Shape of each item returned by /admin_cultivation/get_scope_of_work_for_vendor
type ScopeItem = {
  land_id: string;
  farmer_id: string;
  farmer_name?: string;
  block_id: string;
  crop_type: string | null;
  land_mapping: LatLng[];
  total_area: number;
  plots: ApiPlot[];
  activities: string[];
  start_date?: string;
  end_date?: string;
};

type Props = {
  farms: WccCreateFlowFarm[];
  onClose: () => void;
};

// Reuses the exact vendor -> scope-of-work -> WccModal flow already proven out on the
// Scope of Work page — this is the WCC module's own entry point for it, so "Create WCC"
// no longer needs to happen from Scope of Work.
export default function WccCreateFlow({ farms, onClose }: Props) {
  const [vendors, setVendors] = useState<ActiveVendor[]>([]);
  const [isLoadingVendors, setIsLoadingVendors] = useState(true);
  const [vendorSearch, setVendorSearch] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>([]);
  const [isLoadingScope, setIsLoadingScope] = useState(false);
  const [farmerNames, setFarmerNames] = useState<Record<string, string>>({});
  const [operationalDateRange, setOperationalDateRange] = useState<{ start?: string; end?: string }>({});
  const [isLoadingOperationalRange, setIsLoadingOperationalRange] = useState(false);

  // --- Fetch active vendors (live WO/PO) ---
  useEffect(() => {
    let mounted = true;
    setIsLoadingVendors(true);
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/admin_cultivation/get_active_vendor`);
        const data = await res.json().catch(() => null);
        if (!mounted) return;
        if (data?.success && Array.isArray(data?.vendors)) {
          const seen = new Set<string>();
          const mapped: ActiveVendor[] = [];
          for (const v of data.vendors as ApiActiveVendor[]) {
            if (!v?.vendor_id || seen.has(v.vendor_id)) continue;
            seen.add(v.vendor_id);
            mapped.push({
              vendor_id: v.vendor_id,
              vendor_name: v.vendor_name ?? v.vendor_id,
              contact: v.vendor_contact,
              wo_number: v.order_number,
            });
          }
          setVendors(mapped);
        } else {
          setVendors([]);
        }
      } catch {
        if (mounted) setVendors([]);
      } finally {
        if (mounted) setIsLoadingVendors(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // --- Fetch scope of work for selected vendor ---
  useEffect(() => {
    if (!selectedVendorId) {
      setScopeItems([]);
      return;
    }
    let mounted = true;
    setIsLoadingScope(true);
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/admin_cultivation/get_scope_of_work_for_vendor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vendor_id: selectedVendorId }),
        });
        const data = await res.json().catch(() => null);
        if (!mounted) return;
        if (data?.success && Array.isArray(data.scope_of_work)) {
          const items: ScopeItem[] = data.scope_of_work.map((s: any) => {
            const vs = s.vendor_scope ?? {};
            return {
              land_id: s.land_id,
              farmer_id: s.farmer_id,
              farmer_name: s.farmer_name,
              block_id: s.block_id,
              crop_type: s.crop_type ?? null,
              land_mapping: Array.isArray(s.land_mapping) ? s.land_mapping : [],
              total_area: Number(s.total_area) || 0,
              plots: Array.isArray(s.plots) ? s.plots : [],
              activities: vs.activities ?? [],
              start_date: vs.start_date,
              end_date: vs.end_date,
            };
          });
          setScopeItems(items);
        } else {
          setScopeItems([]);
        }
      } catch {
        if (mounted) setScopeItems([]);
      } finally {
        if (mounted) setIsLoadingScope(false);
      }
    })();
    return () => { mounted = false; };
  }, [selectedVendorId]);

  // --- Discover the selected vendor's actual operational (non-cultivation) task date span ---
  // A pure operational vendor (e.g. a borewell driller with no land scope) has no scope
  // start/end dates to seed WccModal's default range with, so it would otherwise fall back to
  // "last 30 days" and silently hide real tasks dated outside that window. Query without a
  // narrow date filter (a wide open window) so nothing gets excluded here, then use the
  // resulting min/max as part of the default range instead.
  useEffect(() => {
    if (!selectedVendorId) {
      setOperationalDateRange({});
      return;
    }
    let mounted = true;
    setIsLoadingOperationalRange(true);
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/admin_cultivation/get_operational_work_done_by_vendor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vendor_id: selectedVendorId, start_date: '2000-01-01', end_date: '2100-12-31' }),
        });
        const data = await res.json().catch(() => null);
        if (!mounted) return;
        const entries: Array<{ from_date?: string; to_date?: string }> = data?.success && Array.isArray(data.work_done) ? data.work_done : [];
        const starts = entries.map((e) => e.from_date).filter((d): d is string => !!d);
        const ends = entries.map((e) => e.to_date).filter((d): d is string => !!d);
        setOperationalDateRange({
          start: starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : undefined,
          end: ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : undefined,
        });
      } catch {
        if (mounted) setOperationalDateRange({});
      } finally {
        if (mounted) setIsLoadingOperationalRange(false);
      }
    })();
    return () => { mounted = false; };
  }, [selectedVendorId]);

  // --- Fetch farmer names for whichever farms show up in the selected vendor's scope ---
  useEffect(() => {
    const ids = scopeItems.map((s) => s.land_id).filter((id) => id && !farmerNames[id]);
    if (!ids.length) return;
    let mounted = true;
    (async () => {
      const results = await Promise.all(ids.map(async (id) => {
        try {
          const res = await fetch(`${BASE_URL}/farmer_managment/get_farmer_details_from_farm_id/${id}`);
          if (!res.ok) return { id, name: id };
          const d = await res.json().catch(() => null);
          const name = d?.farmer?.farmer_name;
          return { id, name: typeof name === 'string' && name.trim() ? name.trim() : id };
        } catch { return { id, name: id }; }
      }));
      if (!mounted) return;
      setFarmerNames((prev) => {
        const next = { ...prev };
        for (const r of results) next[r.id] = r.name;
        return next;
      });
    })();
    return () => { mounted = false; };
  }, [scopeItems]);

  const selectedVendor = useMemo(
    () => vendors.find((v) => v.vendor_id === selectedVendorId) ?? null,
    [vendors, selectedVendorId],
  );

  const filteredVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) =>
      v.vendor_name.toLowerCase().includes(q) || (v.wo_number ?? '').toLowerCase().includes(q),
    );
  }, [vendors, vendorSearch]);

  const farmsById = useMemo(() => {
    const map: Record<string, WccCreateFlowFarm> = {};
    for (const f of farms) map[f.farm_id] = f;
    return map;
  }, [farms]);

  const vendorScopeActivities = useMemo(() => {
    const set = new Set<string>();
    for (const item of scopeItems) for (const act of item.activities) set.add(act);
    return Array.from(set);
  }, [scopeItems]);

  // Combines the vendor's cultivation scope dates with their actual operational-task date
  // span, so the default range covers both regardless of which kind of work (or both) this
  // vendor does — a pure operational vendor still gets a real range instead of "no scope dates".
  const vendorScopeDateRange = useMemo(() => {
    const starts = [
      ...scopeItems.map((i) => i.start_date),
      operationalDateRange.start,
    ].filter((d): d is string => !!d);
    const ends = [
      ...scopeItems.map((i) => i.end_date),
      operationalDateRange.end,
    ].filter((d): d is string => !!d);
    return {
      start: starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : undefined,
      end: ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : undefined,
    };
  }, [scopeItems, operationalDateRange]);

  const isLoadingVendorDetail = isLoadingScope || isLoadingOperationalRange;

  // Once a vendor is picked, hand off straight to the existing task/date/generate modal —
  // but only once both its scope-of-work AND operational-task date span have actually
  // finished loading. WccModal seeds its date range from defaultStartDate/defaultEndDate via
  // a one-time useState initializer, so mounting it before those are ready would permanently
  // lock it onto the fallback "last 30 days" window instead of the vendor's real work dates —
  // hiding genuine tasks outside that window (especially for vendors with no land scope at all).
  if (selectedVendor && !isLoadingVendorDetail) {
    return (
      <WccModal
        vendorId={selectedVendor.vendor_id}
        vendorName={selectedVendor.vendor_name}
        vendorWoNumber={selectedVendor.wo_number}
        landIds={scopeItems.map((item) => item.land_id)}
        activities={vendorScopeActivities}
        farmsById={farmsById}
        farmerNames={farmerNames}
        scopeItems={scopeItems}
        defaultStartDate={vendorScopeDateRange.start}
        defaultEndDate={vendorScopeDateRange.end}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[#0D3A35] bg-[#0D3A35] px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-white">Create WCC</h3>
            <p className="mt-0.5 text-xs text-emerald-100">Select a vendor to see their tasks and generate a certificate</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 transition-colors hover:bg-white/10">
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        <div className="shrink-0 border-b border-slate-200 bg-slate-50/70 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={vendorSearch}
              onChange={(e) => setVendorSearch(e.target.value)}
              placeholder="Search vendor or WO…"
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {isLoadingVendors ? (
            <div className="flex flex-col gap-3 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse space-y-2 rounded-lg border border-gray-100 p-3">
                  <div className="h-3 w-2/3 rounded bg-gray-100" />
                  <div className="h-2.5 w-1/2 rounded bg-gray-50" />
                </div>
              ))}
            </div>
          ) : filteredVendors.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <Building2 className="h-8 w-8 text-slate-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-600">No active vendors found</p>
                <p className="mt-1 text-xs text-slate-400">Vendors with a live WO / PO will appear here once synced.</p>
              </div>
            </div>
          ) : (
            filteredVendors.map((vendor) => (
              <button
                key={vendor.vendor_id}
                type="button"
                disabled={isLoadingVendorDetail && selectedVendorId === vendor.vendor_id}
                onClick={() => setSelectedVendorId(vendor.vendor_id)}
                className={cn(
                  'w-full border-l-2 border-transparent px-4 py-3.5 text-left transition-all hover:bg-slate-50',
                  isLoadingVendorDetail && selectedVendorId === vendor.vendor_id && 'opacity-60',
                )}
              >
                <span className="text-sm font-semibold text-slate-800">{vendor.vendor_name}</span>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  {vendor.wo_number && (
                    <span className="flex items-center gap-1 font-medium"><FileCheck className="h-3 w-3 shrink-0" />{vendor.wo_number}</span>
                  )}
                  {vendor.contact && (
                    <span className="flex items-center gap-1 font-medium"><Hash className="h-3 w-3 shrink-0" />{vendor.contact}</span>
                  )}
                </div>
                {isLoadingVendorDetail && selectedVendorId === vendor.vendor_id && (
                  <p className="mt-1.5 text-[11px] font-semibold text-emerald-700">Loading vendor's work…</p>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
