import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Building2,
  MapPin,
  Plus,
  Search,
  FileCheck,
  X,
  CheckCircle2,
  ChevronRight,
  Link2,
  Hash,
  Layers,
  User,
  Calendar,
  RefreshCw,
  ScrollText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';
import { toast } from 'sonner';
import WccModal from '@/components/cultivation/WccModal';
import WccCertificateReleasesModal from '@/components/cultivation/WccCertificateReleasesModal';

const BASE_URL = getBaseUrl().replace(/\/$/, '');

type LatLng = [number, number];

// --- Types ---
interface ApiLandPlot {
  plot_id: string;
  plot_name: string;
  plot_area: number;
  plot_coordinates: LatLng[];
  crop_type?: string;
}

interface ApiFarm {
  farm_id: string;
  area: number;
  block_id: string;
  farmer_id: string;
  crop_type?: string;
  land_data: {
    village: string;
    district: string;
    state: string;
    farming_option?: string;
    land_coordinates?: LatLng[];
  };
  land_plots?: ApiLandPlot[];
}

interface LandAssignment {
  assignment_id: string;
  farm_id: string;
  block_id: string;
  area_acres: number;
  activities: string[];
  start_date?: string;
  end_date?: string;
  status: 'active' | 'completed' | 'pending';
  farmer_name?: string;
}

// Shape returned by /admin_cultivation/get_active_vendor
interface ApiActiveVendor {
  vendor_id: string;
  vendor_name: string;
  vendor_contact?: string;
  order_number?: string;
}

// Shape of each plot within a land, as returned by /admin_cultivation/get_scope_of_work_for_vendor
interface ApiPlot {
  plot_id: string;
  plot_name: string;
  crop_type: string;
  plot_area: number;
  plot_coordinates: LatLng[];
  created_at?: string;
}

// Shape of each item returned by /admin_cultivation/get_scope_of_work_for_vendor
interface ScopeItem {
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
}

interface ActiveVendor {
  vendor_id: string;
  vendor_name: string;
  contact?: string;
  wo_number?: string;
  po_number?: string;
  scope?: string;
  start_date?: string;
  end_date?: string;
  status: 'live' | 'pending' | 'completed';
  assignments: LandAssignment[];
}

// Shape returned by /admin_cultivation/get_cultivation_activities
interface ApiCultivationActivity {
  id: string;
  name: string;
  category?: string;
  icon?: string;
  crop_type?: string[];
}

const EMPTY_ASSIGN_FORM = { farm_ids: [] as string[], activities: [] as string[], area_acres: '', start_date: '', end_date: '' };

// --- Helpers ---
const formatDate = (d?: string) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

// Crop-wise colors, shared between the acreage bars and the map polygons on each card
const CROP_COLORS = ['#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#6366f1', '#84cc16', '#f97316'];
const cropColor = (crop: string, allCrops: string[]) => {
  const idx = allCrops.indexOf(crop);
  return CROP_COLORS[(idx < 0 ? 0 : idx) % CROP_COLORS.length];
};

// Group a land's plots by crop type, summing area per crop
const cropWiseAcres = (item: ScopeItem): Record<string, number> => {
  const acc: Record<string, number> = {};
  for (const plot of item.plots) {
    const crop = plot.crop_type || 'Unknown';
    acc[crop] = (acc[crop] ?? 0) + (Number(plot.plot_area) || 0);
  }
  return acc;
};

// Fits the map viewport to the land boundary once it's known — must live inside <MapContainer>
const FitLandBounds = ({ coords }: { coords: LatLng[] }) => {
  const map = useMap();
  useEffect(() => {
    if (coords.length < 2) return;
    const bounds = L.latLngBounds(coords.map(([lat, lng]) => L.latLng(lat, lng)));
    map.fitBounds(bounds, { padding: [24, 24], animate: false });
  }, [coords, map]);
  return null;
};

// --- Status Badge ---
const StatusBadge = ({ status, pulse = false }: { status: ActiveVendor['status']; pulse?: boolean }) => (
  <span className={cn(
    'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border',
    status === 'live' ? 'bg-green-100 text-green-700 border-green-200' :
    status === 'pending' ? 'bg-orange-100 text-orange-700 border-orange-200' :
    'bg-gray-100 text-gray-600 border-gray-200',
  )}>
    <span className={cn(
      'w-1.5 h-1.5 rounded-full',
      pulse && status === 'live' && 'animate-pulse',
      status === 'live' ? 'bg-green-500' : status === 'pending' ? 'bg-orange-500' : 'bg-gray-400',
    )} />
    {status.toUpperCase()}
  </span>
);


// ============================================================
// MAIN PAGE
// ============================================================
const ScopeOfWork = () => {
  const [vendors, setVendors] = useState<ActiveVendor[]>([]);
  const [farms, setFarms] = useState<ApiFarm[]>([]);
  const [farmerNames, setFarmerNames] = useState<Record<string, string>>({});
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [vendorSearch, setVendorSearch] = useState('');
  const [farmSearch, setFarmSearch] = useState('');
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ ...EMPTY_ASSIGN_FORM });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingVendors, setIsLoadingVendors] = useState(true);
  const [isLoadingFarms, setIsLoadingFarms] = useState(true);
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>([]);
  const [isLoadingScope, setIsLoadingScope] = useState(false);
  const [scopeRefreshKey, setScopeRefreshKey] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isWccOpen, setIsWccOpen] = useState(false);
  const [isCertificateReleasesOpen, setIsCertificateReleasesOpen] = useState(false);
  const [activities, setActivities] = useState<ApiCultivationActivity[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(true);

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
          // Deduplicate by vendor_id, then map to internal shape
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
              status: 'live',
              assignments: [],
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
  }, [refreshKey]);

  // --- Fetch cultivation activities (for the assign-land popup's activity checklist) ---
  useEffect(() => {
    let mounted = true;
    setIsLoadingActivities(true);
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/admin_cultivation/get_cultivation_activities`);
        const data = await res.json().catch(() => null);
        if (!mounted) return;
        if (data?.success && Array.isArray(data?.activities)) {
          setActivities(data.activities as ApiCultivationActivity[]);
        } else {
          setActivities([]);
        }
      } catch {
        if (mounted) setActivities([]);
      } finally {
        if (mounted) setIsLoadingActivities(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Same "dedupe by name" behaviour the old static activities.json-derived list had — the API
  // can return multiple activity records sharing one display name (different crop_type/category
  // combos, e.g. "Bed Making" for both Rahar and the generic "Other" category).
  const ACTIVITY_OPTIONS = useMemo(
    () => Array.from(new Set(activities.map((activity) => activity.name))),
    [activities]
  );

  // --- Fetch all farms ---
  useEffect(() => {
    let mounted = true;
    setIsLoadingFarms(true);
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/farmer_managment/get_farms`);
        const data = await res.json().catch(() => null);
        if (!mounted) return;
        if (res.ok && Array.isArray(data?.farms)) {
          setFarms(data.farms);
        } else {
          setFarms([]);
        }
      } catch {
        if (mounted) setFarms([]);
      } finally {
        if (mounted) setIsLoadingFarms(false);
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
  }, [selectedVendorId, scopeRefreshKey]);

  // --- Fetch farmer names ---
  useEffect(() => {
    const ids = farms.map(f => f.farm_id).filter(id => id && !farmerNames[id]);
    if (!ids.length) return;
    let mounted = true;
    (async () => {
      const results = await Promise.all(ids.map(async id => {
        try {
          const res = await fetch(`${BASE_URL}/farmer_managment/get_farmer_details_from_farm_id/${id}`);
          if (!res.ok) return { id, name: id };
          const d = await res.json().catch(() => null);
          const name = d?.farmer?.farmer_name;
          return { id, name: typeof name === 'string' && name.trim() ? name.trim() : id };
        } catch { return { id, name: id }; }
      }));
      if (!mounted) return;
      setFarmerNames(prev => {
        const next = { ...prev };
        for (const r of results) next[r.id] = r.name;
        return next;
      });
    })();
    return () => { mounted = false; };
  }, [farms]);

  // --- Derived ---
  const selectedVendor = useMemo(
    () => vendors.find(v => v.vendor_id === selectedVendorId) ?? null,
    [vendors, selectedVendorId],
  );

  const filteredVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter(v =>
      v.vendor_name.toLowerCase().includes(q) ||
      (v.wo_number ?? '').toLowerCase().includes(q) ||
      (v.po_number ?? '').toLowerCase().includes(q),
    );
  }, [vendors, vendorSearch]);

  const scopeTotalAcres = useMemo(() =>
    scopeItems.reduce((sum, item) => sum + (item.total_area || 0), 0),
  [scopeItems]);

  // Distinct activities declared across this vendor's scope (from vendor_scope.activities on each land)
  const vendorScopeActivities = useMemo(() => {
    const set = new Set<string>();
    for (const item of scopeItems) {
      for (const act of item.activities) set.add(act);
    }
    return Array.from(set);
  }, [scopeItems]);

  // farm_id → full farm record, for the WCC modal's task-timeline map thumbnails
  const farmsById = useMemo(() => {
    const map: Record<string, ApiFarm> = {};
    for (const f of farms) map[f.farm_id] = f;
    return map;
  }, [farms]);

  // Earliest declared start_date / latest end_date across this vendor's scope — used to
  // pre-fill the WCC date range with a sensible default.
  const vendorScopeDateRange = useMemo(() => {
    const starts = scopeItems.map(i => i.start_date).filter((d): d is string => !!d);
    const ends = scopeItems.map(i => i.end_date).filter((d): d is string => !!d);
    return {
      start: starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : undefined,
      end: ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : undefined,
    };
  }, [scopeItems]);

  const alreadyAssignedFarmIds = useMemo(
    () => new Set(scopeItems.map(s => s.land_id)),
    [scopeItems],
  );

  const filteredFarmsForAssign = useMemo(() => {
    const q = farmSearch.trim().toLowerCase();
    return farms.filter(f => {
      if (alreadyAssignedFarmIds.has(f.farm_id)) return false;
      if (!q) return true;
      const name = (farmerNames[f.farm_id] ?? f.farm_id).toLowerCase();
      return (
        f.farm_id.toLowerCase().includes(q) ||
        name.includes(q) ||
        f.block_id.toLowerCase().includes(q) ||
        (f.land_data?.village ?? '').toLowerCase().includes(q) ||
        (f.land_data?.district ?? '').toLowerCase().includes(q)
      );
    });
  }, [farms, farmSearch, alreadyAssignedFarmIds, farmerNames]);

  // Total area is derived from the selected farms, not entered manually.
  const selectedFarmsTotalArea = useMemo(() => {
    return assignForm.farm_ids.reduce((sum, id) => {
      const farm = farms.find(f => f.farm_id === id);
      return sum + (Number(farm?.area) || 0);
    }, 0);
  }, [assignForm.farm_ids, farms]);

  useEffect(() => {
    setAssignForm(prev => ({
      ...prev,
      area_acres: selectedFarmsTotalArea ? selectedFarmsTotalArea.toFixed(2) : '',
    }));
  }, [selectedFarmsTotalArea]);

  const stats = useMemo(() => ({
    liveCount: vendors.filter(v => v.status === 'live').length,
    totalLands: scopeItems.length,
    totalAcres: scopeTotalAcres,
  }), [vendors, scopeItems, scopeTotalAcres]);

  // --- Handlers ---
  const handleAssignLand = async () => {
    if (!selectedVendor) return;
    if (!assignForm.farm_ids.length) { toast.error('Please select at least one farm'); return; }
    if (!assignForm.activities.length) { toast.error('Please select at least one activity'); return; }
    const acres = Number(assignForm.area_acres);
    if (!acres || acres <= 0) { toast.error('Please enter a valid area'); return; }

    // Build one optimistic assignment per selected farm, each keeping its own actual area
    const newAssignments: LandAssignment[] = assignForm.farm_ids.map((farmId, i) => {
      const farm = farms.find(f => f.farm_id === farmId);
      return {
        assignment_id: `local_${Date.now()}_${i}`,
        farm_id: farmId,
        block_id: farm?.block_id ?? '',
        area_acres: Number(farm?.area) || 0,
        activities: assignForm.activities,
        start_date: assignForm.start_date || undefined,
        end_date: assignForm.end_date || undefined,
        status: 'active' as const,
        farmer_name: farmerNames[farmId],
      };
    });

    // Optimistic update
    setVendors(prev => prev.map(v =>
      v.vendor_id === selectedVendor.vendor_id
        ? { ...v, assignments: [...v.assignments, ...newAssignments] }
        : v,
    ));
    setIsAssignModalOpen(false);
    setAssignForm({ ...EMPTY_ASSIGN_FORM });
    setFarmSearch('');

    setIsSubmitting(true);
    try {
      // Build scope_of_work: { [farm_id]: { [vendor_id]: { vendor_details, activities, start_date, end_date } } }
      const scope_of_work: Record<string, Record<string, unknown>> = {};
      for (const farmId of assignForm.farm_ids) {
        scope_of_work[farmId] = {
          [selectedVendor.vendor_id]: {
            vendor_details: {
              vendor_name: selectedVendor.vendor_name,
              vendor_contact: selectedVendor.contact ?? '',
            },
            activities: assignForm.activities,
            start_date: assignForm.start_date || '',
            end_date: assignForm.end_date || '',
          },
        };
      }

      const res = await fetch(`${BASE_URL}/admin_cultivation/add_scope_of_work_to_land`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope_of_work }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.message || 'Failed to assign lands');
        // Roll back optimistic update
        setVendors(prev => prev.map(v =>
          v.vendor_id === selectedVendor.vendor_id
            ? { ...v, assignments: v.assignments.filter(a => !newAssignments.some(n => n.assignment_id === a.assignment_id)) }
            : v,
        ));
        return;
      }
      toast.success(`${newAssignments.length} land${newAssignments.length > 1 ? 's' : ''} assigned successfully`);
      setScopeRefreshKey(k => k + 1);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to assign lands');
      // Roll back
      setVendors(prev => prev.map(v =>
        v.vendor_id === selectedVendor.vendor_id
          ? { ...v, assignments: v.assignments.filter(a => !newAssignments.some(n => n.assignment_id === a.assignment_id)) }
          : v,
      ));
    } finally {
      setIsSubmitting(false);
    }
  };

  const openAssignModal = () => {
    setAssignForm({ ...EMPTY_ASSIGN_FORM });
    setFarmSearch('');
    setIsAssignModalOpen(true);
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="min-h-screen space-y-6 bg-slate-50/70 p-4 font-sans animate-in fade-in duration-300 sm:p-6 lg:p-8">

      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl border border-[#0D3A35] bg-[#0D3A35] p-3 shadow-sm">
            <Link2 className="h-7 w-7 text-white" />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Procurement · Work Order</p>
            <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">Scope of Work</h1>
            <p className="mt-1 text-sm text-slate-500 max-w-lg">
              Map farm lands to active vendors with live Work Orders and approved scopes.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setIsCertificateReleasesOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50"
          >
            <ScrollText className="h-4 w-4 text-emerald-700" />
            Certificate Releases
          </button>
          <button
            type="button"
            onClick={() => setRefreshKey(k => k + 1)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50"
          >
            <RefreshCw className="h-4 w-4 text-emerald-700" />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Active Vendors (Live WO / PO)', value: stats.liveCount, icon: Building2, color: 'emerald' as const },
          { label: 'Total Lands Assigned', value: stats.totalLands, icon: MapPin, color: 'green' as const },
          { label: 'Total Area Covered', value: `${stats.totalAcres.toFixed(1)} ac`, icon: Layers, color: 'orange' as const },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={cn(
              'p-3 rounded-xl border',
              s.color === 'emerald' && 'border-emerald-100 bg-emerald-50 text-emerald-700',
              s.color === 'green'  && 'border-green-100 bg-green-50 text-green-700',
              s.color === 'orange' && 'border-amber-100 bg-amber-50 text-amber-700',
            )}>
              <s.icon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-800">{s.value}</div>
              <div className="text-xs text-slate-500 font-medium mt-0.5">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main Two-Column Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">

        {/* ── LEFT: Vendor Panel ── */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" style={{ maxHeight: '75vh' }}>
          {/* Panel Header */}
          <div className="shrink-0 border-b border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-emerald-700" />
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Active Vendors</h2>
              <span className="ml-auto rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                {stats.liveCount} Live
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={vendorSearch}
                onChange={e => setVendorSearch(e.target.value)}
                placeholder="Search vendor, WO or PO…"
                className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>

          {/* Vendor List */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {isLoadingVendors ? (
              <div className="flex flex-col gap-3 p-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse space-y-2 p-3 rounded-lg border border-gray-100">
                    <div className="h-3 bg-gray-100 rounded w-2/3" />
                    <div className="h-2.5 bg-gray-50 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : filteredVendors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 gap-3 text-center">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <Building2 className="w-8 h-8 text-slate-300" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-600">No active vendors found</p>
                  <p className="text-xs text-slate-400 mt-1">Vendors with a live WO / PO will appear here once synced.</p>
                </div>
              </div>
            ) : (
              filteredVendors.map(vendor => (
                <button
                  key={vendor.vendor_id}
                  type="button"
                  onClick={() => setSelectedVendorId(vendor.vendor_id)}
                  className={cn(
                    'w-full text-left px-4 py-3.5 transition-all group border-l-2',
                    selectedVendorId === vendor.vendor_id
                      ? 'border-emerald-700 bg-emerald-50/80'
                      : 'border-transparent hover:bg-slate-50',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800 truncate">{vendor.vendor_name}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        {vendor.wo_number && (
                          <span className="flex items-center gap-1 font-medium"><FileCheck className="w-3 h-3 shrink-0" />{vendor.wo_number}</span>
                        )}
                        {vendor.po_number && (
                          <span className="flex items-center gap-1 font-medium"><Hash className="w-3 h-3 shrink-0" />{vendor.po_number}</span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <StatusBadge status={vendor.status} />
                      </div>
                    </div>
                    <ChevronRight className={cn(
                      'w-4 h-4 shrink-0 mt-1 transition-colors',
                      selectedVendorId === vendor.vendor_id ? 'text-emerald-700' : 'text-slate-200 group-hover:text-slate-400',
                    )} />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT: Assignment Panel ── */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" style={{ maxHeight: '75vh' }}>
          {!selectedVendor ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center p-16 gap-5 text-center">
              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-6">
                <Link2 className="h-12 w-12 text-emerald-400" />
              </div>
              <div>
                <p className="text-base font-semibold text-slate-700">Select a Vendor</p>
                <p className="text-sm text-slate-400 mt-1 max-w-xs">
                  Pick a vendor from the left panel to view and manage their land assignments.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Vendor Detail Header */}
              <div className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-emerald-50/80 via-white to-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 shrink-0 rounded-xl border border-[#0D3A35] bg-[#0D3A35] p-2.5">
                      <Building2 className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-slate-800 truncate">{selectedVendor.vendor_name}</h2>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        {selectedVendor.wo_number && (
                          <span className="flex items-center gap-1 font-medium">
                            <FileCheck className="h-3 w-3 text-emerald-600" /> WO: {selectedVendor.wo_number}
                          </span>
                        )}
                        {selectedVendor.po_number && (
                          <span className="flex items-center gap-1 font-medium">
                            <Hash className="h-3 w-3 text-emerald-600" /> PO: {selectedVendor.po_number}
                          </span>
                        )}
                        {selectedVendor.contact && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3 text-gray-400" /> {selectedVendor.contact}
                          </span>
                        )}
                        {(selectedVendor.start_date || selectedVendor.end_date) && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-gray-400" />
                            {formatDate(selectedVendor.start_date)} – {formatDate(selectedVendor.end_date)}
                          </span>
                        )}
                      </div>
                      {selectedVendor.scope && (
                        <p className="mt-2 inline-block rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs text-slate-600">
                          <span className="font-semibold text-emerald-800">Scope: </span>{selectedVendor.scope}
                        </p>
                      )}
                      {vendorScopeActivities.length > 0 && (
                        <div className="mt-2">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Activities in Scope</div>
                          <div className="flex flex-wrap gap-1">
                            {vendorScopeActivities.map(act => (
                              <span
                                key={act}
                                className="inline-flex items-center whitespace-nowrap rounded-md border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800"
                              >
                                {act}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={selectedVendor.status} pulse />
                    <button
                      type="button"
                      onClick={() => setIsWccOpen(true)}
                      title={scopeItems.length === 0 ? 'No land scope for this vendor — evidence (if any) will come from their operational calendar work, e.g. rental vehicle log books' : undefined}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors shadow-sm border border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"
                    >
                      <FileCheck className="w-3.5 h-3.5" /> Create WCC
                    </button>
                    <button
                      type="button"
                      onClick={openAssignModal}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D3A35] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#092e2a]"
                    >
                      <Plus className="w-3.5 h-3.5" /> Assign Land
                    </button>
                  </div>
                </div>

                {/* Vendor mini-stats */}
                <div className="mt-4 flex items-center gap-5 text-xs text-slate-500 bg-white border border-gray-100 rounded-lg px-4 py-2.5 shadow-sm">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-green-500" />
                    <span className="font-bold text-slate-700">{scopeItems.length}</span>
                    &nbsp;lands in scope
                  </span>
                  <span className="h-3 w-px bg-gray-200" />
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-orange-500" />
                    <span className="font-bold text-slate-700">{scopeTotalAcres.toFixed(2)}</span>
                    &nbsp;acres covered
                  </span>
                  <span className="h-3 w-px bg-gray-200" />
                  <span className="flex items-center gap-1.5">
                    {scopeItems.length > 0
                      ? <><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /><span className="text-green-600 font-semibold">{scopeItems.length} active</span></>
                      : <><span className="w-2 h-2 rounded-full bg-gray-300" /><span>0 active</span></>
                    }
                  </span>
                </div>
              </div>

              {/* Scope Body */}
              <div className="flex-1 overflow-y-auto p-5">
                {isLoadingScope ? (
                  <div className="flex flex-col gap-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="animate-pulse flex gap-4 p-4 rounded-xl border border-gray-100 bg-white">
                        <div className="flex-1 space-y-2">
                          <div className="h-3 bg-gray-100 rounded w-1/3" />
                          <div className="h-2.5 bg-gray-50 rounded w-1/2" />
                        </div>
                        <div className="h-3 bg-gray-100 rounded w-16 self-center" />
                      </div>
                    ))}
                  </div>
                ) : scopeItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-12 gap-4 text-center">
                    <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl">
                      <MapPin className="w-10 h-10 text-gray-200" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-600">No scope of work found</p>
                      <p className="text-xs text-slate-400 mt-1">Click "Assign Land" above to map farm lands to this vendor.</p>
                    </div>
                    <button
                      type="button"
                      onClick={openAssignModal}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#0D3A35] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#092e2a]"
                    >
                      <Plus className="w-4 h-4" /> Assign First Land
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {scopeItems.map(item => {
                      const cropAcres = cropWiseAcres(item);
                      const crops = Object.keys(cropAcres);
                      const hasCenter = item.land_mapping.length >= 1;
                      const hasBoundary = item.land_mapping.length >= 3;
                      return (
                        <div
                          key={item.land_id}
                          className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                        >
                          {/* Card Header: Owner + Land identifiers */}
                          <div className="px-4 py-3 bg-slate-50 border-b border-gray-100 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800 truncate">
                                <User className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                                {item.farmer_name || item.farmer_id}
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                                <span className="font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5">{item.land_id}</span>
                                {item.block_id && (
                                  <span className="font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5">
                                    Block {item.block_id.slice(0, 8)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-lg font-bold text-slate-800 leading-none">{item.total_area.toFixed(1)}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5">total acres</div>
                            </div>
                          </div>

                          {/* Land + plot map */}
                          <div className="h-48 relative border-b border-gray-100 bg-slate-100 shrink-0">
                            {hasCenter ? (
                              <MapContainer
                                center={item.land_mapping[0]}
                                zoom={16}
                                style={{ height: '100%', width: '100%' }}
                                className="z-0"
                                scrollWheelZoom={false}
                              >
                                <TileLayer
                                  attribution='&copy; <a href="https://www.esri.com/">Esri</a> — Source: Esri, Maxar, Earthstar Geographics'
                                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                  maxZoom={19}
                                />
                                {hasBoundary && <FitLandBounds coords={item.land_mapping} />}
                                {hasBoundary && (
                                  <Polygon
                                    positions={item.land_mapping}
                                    pathOptions={{ color: '#ffffff', fillColor: '#ffffff', fillOpacity: 0.06, weight: 2.5, dashArray: '8 5' }}
                                  >
                                    <Tooltip sticky>
                                      <span className="font-semibold">Land Boundary</span>
                                    </Tooltip>
                                  </Polygon>
                                )}
                                {item.plots.filter(p => p.plot_coordinates?.length >= 3).map(plot => {
                                  const color = cropColor(plot.crop_type || 'Unknown', crops);
                                  return (
                                    <Polygon
                                      key={plot.plot_id}
                                      positions={plot.plot_coordinates}
                                      pathOptions={{ color, fillColor: color, fillOpacity: 0.35, weight: 2 }}
                                    >
                                      <Tooltip sticky>
                                        <span className="font-semibold">{plot.plot_name}</span>
                                        <br />
                                        <span className="text-gray-500 text-[11px] capitalize">{plot.crop_type || 'Unknown'} · {plot.plot_area} ac</span>
                                      </Tooltip>
                                    </Polygon>
                                  );
                                })}
                              </MapContainer>
                            ) : (
                              <div className="h-full flex items-center justify-center text-xs text-slate-400 gap-1.5">
                                <MapPin className="w-3.5 h-3.5" /> No map data available
                              </div>
                            )}
                          </div>

                          {/* Plot data */}
                          <div className="px-4 py-3 flex-1">
                            <div className="flex items-center gap-4 text-xs text-slate-500 mb-2.5">
                              <span className="flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-orange-500" />
                                <b className="text-slate-700">{item.plots.length}</b> plot{item.plots.length !== 1 ? 's' : ''}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <b className="text-slate-700">{crops.length}</b> crop{crops.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              {crops.map(crop => {
                                const acres = cropAcres[crop];
                                const pct = item.total_area ? (acres / item.total_area) * 100 : 0;
                                const color = cropColor(crop, crops);
                                return (
                                  <div key={crop} className="flex items-center gap-2 text-[11px]">
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                    <span className="w-16 shrink-0 capitalize font-medium text-slate-600 truncate">{crop}</span>
                                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                                    </div>
                                    <span className="w-14 shrink-0 text-right font-semibold text-slate-700">{acres.toFixed(2)} ac</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── ASSIGN LAND MODAL ── */}
      {isAssignModalOpen && selectedVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-[#0D3A35] bg-[#0D3A35] px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-white">Assign Land</h3>
                <p className="mt-0.5 text-xs text-emerald-100">
                  For <span className="font-semibold text-white">{selectedVendor.vendor_name}</span>
                  {selectedVendor.wo_number && <span className="ml-1 text-emerald-200">• {selectedVendor.wo_number}</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                className="rounded-lg p-1.5 transition-colors hover:bg-white/10"
              >
                <X className="h-5 w-5 text-white" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
              {/* Farm / Land multi-select */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700">
                    Farm / Land <span className="text-red-500">*</span>
                  </label>
                  {assignForm.farm_ids.length > 0 && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                      {assignForm.farm_ids.length} selected
                    </span>
                  )}
                </div>
                {/* Search */}
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={farmSearch}
                    onChange={e => setFarmSearch(e.target.value)}
                    placeholder="Search by farm ID, farmer, block, village…"
                    className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
                {/* Farm List */}
                {isLoadingFarms ? (
                  <div className="h-32 rounded-xl border border-gray-200 flex items-center justify-center text-xs text-slate-400">
                    Loading farms…
                  </div>
                ) : (
                  <div className="max-h-52 overflow-y-auto rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
                    {filteredFarmsForAssign.length === 0 ? (
                      <div className="py-8 text-xs text-center text-slate-400">No available farms found</div>
                    ) : filteredFarmsForAssign.map(farm => {
                      const isChecked = assignForm.farm_ids.includes(farm.farm_id);
                      const displayName = farmerNames[farm.farm_id] ?? farm.farm_id;
                      return (
                        <button
                          key={farm.farm_id}
                          type="button"
                          onClick={() => setAssignForm(prev => ({
                            ...prev,
                            farm_ids: isChecked
                              ? prev.farm_ids.filter(id => id !== farm.farm_id)
                              : [...prev.farm_ids, farm.farm_id],
                          }))}
                          className={cn(
                            'w-full text-left px-3 py-2.5 transition-colors flex items-center gap-3',
                            isChecked ? 'bg-emerald-50' : 'hover:bg-slate-50',
                          )}
                        >
                          {/* Checkbox */}
                          <div className={cn(
                            'shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                            isChecked ? 'border-emerald-700 bg-emerald-700' : 'border-slate-300 bg-white',
                          )}>
                            {isChecked && (
                              <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                                <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>

                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            {/* Row 1: name + ID */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn(
                                'text-sm font-semibold truncate',
                                isChecked ? 'text-emerald-900' : 'text-slate-800',
                              )}>
                                {displayName}
                              </span>
                              <span className="shrink-0 text-[10px] font-mono bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded">
                                {farm.farm_id}
                              </span>
                            </div>
                            {/* Row 2: block · village · area */}
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400 flex-wrap">
                              <span>Block {farm.block_id || '—'}</span>
                              {farm.land_data?.village && (
                                <><span className="text-slate-300">·</span><span>{farm.land_data.village}</span></>
                              )}
                              {farm.land_data?.district && (
                                <><span className="text-slate-300">·</span><span>{farm.land_data.district}</span></>
                              )}
                              <span className="text-slate-300">·</span>
                              <span className={cn('font-semibold', isChecked ? 'text-emerald-700' : 'text-slate-600')}>
                                {farm.area} ac
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Activity multi-select */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700">
                    Activities <span className="text-red-500">*</span>
                  </label>
                  {assignForm.activities.length > 0 && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                      {assignForm.activities.length} selected
                    </span>
                  )}
                </div>
                {isLoadingActivities ? (
                  <p className="text-xs font-semibold text-slate-400">Loading activities…</p>
                ) : (
                <div className="flex flex-wrap gap-2">
                  {ACTIVITY_OPTIONS.map(opt => {
                    const isChosen = assignForm.activities.includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setAssignForm(prev => ({
                          ...prev,
                          activities: isChosen
                            ? prev.activities.filter(a => a !== opt)
                            : [...prev.activities, opt],
                        }))}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                          isChosen
                            ? 'border-emerald-700 bg-emerald-700 text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700',
                        )}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                )}
              </div>

              {/* Area + Dates */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Total Area (acres) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={assignForm.area_acres}
                    placeholder="Select lands to compute"
                    className="h-9 w-full rounded-lg border border-gray-200 bg-gray-100 px-3 text-sm text-slate-600 cursor-not-allowed focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Start Date</label>
                  <input
                    type="date"
                    value={assignForm.start_date}
                    onChange={e => setAssignForm(prev => ({ ...prev, start_date: e.target.value }))}
                    className="h-9 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">End Date</label>
                  <input
                    type="date"
                    value={assignForm.end_date}
                    onChange={e => setAssignForm(prev => ({ ...prev, end_date: e.target.value }))}
                    className="h-9 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
              </div>

              {/* Selected summary */}
              {assignForm.farm_ids.length > 0 && assignForm.activities.length > 0 && (
                <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div className="min-w-0 flex-1">
                    {/* Farm chips */}
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {assignForm.farm_ids.map(fid => (
                        <span key={fid} className="rounded-md border border-emerald-200 bg-white px-2 py-0.5 font-semibold text-emerald-900">
                          {farmerNames[fid] ?? fid}
                        </span>
                      ))}
                    </div>
                    {/* Activity chips */}
                    <div className="flex flex-wrap gap-1">
                      {assignForm.activities.map(act => (
                        <span key={act} className="rounded-md border border-emerald-200 bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-900">
                          {act}
                        </span>
                      ))}
                    </div>
                    {assignForm.area_acres && (
                      <div className="mt-1 font-semibold text-emerald-700">{assignForm.area_acres} ac total</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssignLand}
                disabled={isSubmitting || !assignForm.farm_ids.length || !assignForm.activities.length || !assignForm.area_acres}
                className={cn(
                  'px-4 py-2 text-sm font-semibold rounded-lg transition-colors',
                  !isSubmitting && assignForm.farm_ids.length && assignForm.activities.length && assignForm.area_acres
                    ? 'bg-[#0D3A35] hover:bg-[#092e2a] text-white shadow-sm'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed',
                )}
              >
                {isSubmitting ? 'Assigning…' : 'Assign Land'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── WORK COMPLETION CERTIFICATE (WCC) ── */}
      {isWccOpen && selectedVendor && (
        <WccModal
          vendorId={selectedVendor.vendor_id}
          vendorName={selectedVendor.vendor_name}
          vendorWoNumber={selectedVendor.wo_number}
          landIds={scopeItems.map(item => item.land_id)}
          activities={vendorScopeActivities}
          farmsById={farmsById}
          farmerNames={farmerNames}
          scopeItems={scopeItems}
          defaultStartDate={vendorScopeDateRange.start}
          defaultEndDate={vendorScopeDateRange.end}
          onClose={() => setIsWccOpen(false)}
        />
      )}

      {isCertificateReleasesOpen && (
        <WccCertificateReleasesModal onClose={() => setIsCertificateReleasesOpen(false)} />
      )}
    </div>
  );
};

export default ScopeOfWork;
