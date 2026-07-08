import { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';
import { toast } from 'sonner';
import activitiesData from '@/config/activities.json';

const BASE_URL = getBaseUrl().replace(/\/$/, '');

// --- Types ---
interface ApiFarm {
  farm_id: string;
  area: number;
  block_id: string;
  farmer_id: string;
  land_data: {
    village: string;
    district: string;
    state: string;
    farming_option?: string;
  };
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
}

// Shape of each item returned by /admin_cultivation/get_scope_of_work_for_vendor
interface ScopeItem {
  land_id: string;
  farmer_id: string;
  block_id: string;
  crop_type: string;
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

// --- Constants ---
// Sourced from the shared activity catalog (src/config/activities.json) so this list
// stays in sync with the activity types managed in the Cultivation Master module.
const ACTIVITY_OPTIONS = Array.from(
  new Set((activitiesData as { name: string }[]).map((activity) => activity.name))
);

const EMPTY_ASSIGN_FORM = { farm_ids: [] as string[], activities: [] as string[], area_acres: '', start_date: '', end_date: '' };

// --- Helpers ---
const formatDate = (d?: string) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

const vendorTotalAcres = (v: ActiveVendor) =>
  v.assignments.reduce((s, a) => s + (Number(a.area_acres) || 0), 0);

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
            const vs = s.vendor_scope?.[selectedVendorId] ?? {};
            return {
              land_id: s.land_id,
              farmer_id: s.farmer_id,
              block_id: s.block_id,
              crop_type: s.crop_type,
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

  // farmer_id → farmer name, built from the farms list + already-fetched farmerNames
  const farmerNamesByFarmerId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const farm of farms) {
      if (farm.farmer_id && farmerNames[farm.farm_id]) {
        map[farm.farmer_id] = farmerNames[farm.farm_id];
      }
    }
    return map;
  }, [farms, farmerNames]);

  const scopeTotalAcres = useMemo(() =>
    scopeItems.reduce((sum, item) => {
      const farm = farms.find(f => f.farm_id === item.land_id);
      return sum + (farm?.area ?? 0);
    }, 0),
  [scopeItems, farms]);

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
    <div className="p-8 space-y-6 animate-in fade-in duration-300 min-h-screen bg-gray-50/50 font-sans">

      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-100 shadow-sm">
            <Link2 className="w-7 h-7 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">Scope of Work</h1>
            <p className="mt-1 text-sm text-slate-500 max-w-lg">
              Map farm lands to active vendors with live Work Orders or Purchase Orders.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey(k => k + 1)}
          className="self-start md:self-auto inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-gray-400" />
          Refresh
        </button>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Active Vendors (Live WO / PO)', value: stats.liveCount, icon: Building2, color: 'indigo' as const },
          { label: 'Total Lands Assigned', value: stats.totalLands, icon: MapPin, color: 'green' as const },
          { label: 'Total Area Covered', value: `${stats.totalAcres.toFixed(1)} ac`, icon: Layers, color: 'orange' as const },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center gap-4">
            <div className={cn(
              'p-3 rounded-xl border',
              s.color === 'indigo' && 'bg-indigo-50 border-indigo-100 text-indigo-600',
              s.color === 'green'  && 'bg-green-50  border-green-100  text-green-600',
              s.color === 'orange' && 'bg-orange-50 border-orange-100 text-orange-600',
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
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col" style={{ maxHeight: '75vh' }}>
          {/* Panel Header */}
          <div className="p-4 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-indigo-600" />
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Active Vendors</h2>
              <span className="ml-auto text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
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
                className="w-full pl-8 pr-3 h-8 rounded-lg border border-gray-200 bg-gray-50 text-xs placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
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
                      ? 'bg-indigo-50/80 border-indigo-500'
                      : 'hover:bg-gray-50 border-transparent',
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
                        <span className="text-[11px] text-slate-400">
                          {vendor.assignments.length} land{vendor.assignments.length !== 1 ? 's' : ''}
                          {vendor.assignments.length > 0 && (
                            <> • {vendorTotalAcres(vendor).toFixed(1)} ac</>
                          )}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className={cn(
                      'w-4 h-4 shrink-0 mt-1 transition-colors',
                      selectedVendorId === vendor.vendor_id ? 'text-indigo-500' : 'text-gray-200 group-hover:text-gray-400',
                    )} />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT: Assignment Panel ── */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col" style={{ maxHeight: '75vh' }}>
          {!selectedVendor ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center p-16 gap-5 text-center">
              <div className="p-6 bg-indigo-50 border border-indigo-100 rounded-3xl">
                <Link2 className="w-12 h-12 text-indigo-300" />
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
              <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-indigo-50/50 via-white to-white shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2.5 bg-indigo-100 border border-indigo-200 rounded-xl shrink-0 mt-0.5">
                      <Building2 className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-slate-800 truncate">{selectedVendor.vendor_name}</h2>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        {selectedVendor.wo_number && (
                          <span className="flex items-center gap-1 font-medium">
                            <FileCheck className="w-3 h-3 text-indigo-400" /> WO: {selectedVendor.wo_number}
                          </span>
                        )}
                        {selectedVendor.po_number && (
                          <span className="flex items-center gap-1 font-medium">
                            <Hash className="w-3 h-3 text-indigo-400" /> PO: {selectedVendor.po_number}
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
                        <p className="mt-2 text-xs text-slate-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5 inline-block">
                          <span className="font-semibold text-indigo-700">Scope: </span>{selectedVendor.scope}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={selectedVendor.status} pulse />
                    <button
                      type="button"
                      onClick={openAssignModal}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
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
                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                    >
                      <Plus className="w-4 h-4" /> Assign First Land
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-gray-200">
                          <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Farmer / Land</th>
                          <th className="text-center px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Crop</th>
                          <th className="text-left px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Activities</th>
                          <th className="text-center px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Area</th>
                          <th className="text-center px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Period</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {scopeItems.map((item, idx) => {
                          const farm = farms.find(f => f.farm_id === item.land_id);
                          const farmerName =
                            farmerNames[item.land_id] ??
                            farmerNamesByFarmerId[item.farmer_id] ??
                            item.land_id;
                          return (
                            <tr
                              key={item.land_id}
                              className={cn(
                                'transition-colors',
                                idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40',
                                'hover:bg-indigo-50/30',
                              )}
                            >
                              {/* Farmer / Land */}
                              <td className="px-4 py-3 max-w-[200px]">
                                <div className="font-semibold text-slate-800 text-sm truncate">{farmerName}</div>
                                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400 flex-wrap">
                                  <span className="font-mono">{item.land_id.slice(0, 8)}…</span>
                                  {farm?.land_data?.village && (
                                    <><span className="text-slate-300">·</span><span>{farm.land_data.village}</span></>
                                  )}
                                </div>
                              </td>

                              {/* Crop */}
                              <td className="px-3 py-3 text-center">
                                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-xs font-semibold bg-green-50 text-green-700 border border-green-100 whitespace-nowrap capitalize">
                                  {item.crop_type || '—'}
                                </span>
                              </td>

                              {/* Activities */}
                              <td className="px-3 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {item.activities.map(act => (
                                    <span key={act} className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap">
                                      {act}
                                    </span>
                                  ))}
                                </div>
                              </td>

                              {/* Area */}
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                <span className="text-sm font-bold text-slate-800">{(farm?.area ?? 0).toFixed(1)}</span>
                                <span className="text-[10px] text-slate-400 ml-0.5">ac</span>
                              </td>

                              {/* Period */}
                              <td className="px-3 py-3 text-center whitespace-nowrap">
                                {item.start_date || item.end_date ? (
                                  <span className="flex items-center justify-center gap-1 text-[11px] text-slate-500">
                                    <Calendar className="w-3 h-3 shrink-0 text-gray-400" />
                                    {formatDate(item.start_date)} – {formatDate(item.end_date)}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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
          <div className="bg-white border border-gray-200 w-full max-w-lg max-h-[90vh] rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-indigo-50/60 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-800">Assign Land</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  For <span className="font-semibold text-indigo-700">{selectedVendor.vendor_name}</span>
                  {selectedVendor.wo_number && <span className="ml-1 text-slate-400">• {selectedVendor.wo_number}</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
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
                    <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
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
                    className="w-full pl-8 pr-3 h-8 rounded-lg border border-gray-200 bg-gray-50 text-xs placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
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
                            isChecked ? 'bg-indigo-50' : 'hover:bg-slate-50',
                          )}
                        >
                          {/* Checkbox */}
                          <div className={cn(
                            'shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                            isChecked ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300 bg-white',
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
                                isChecked ? 'text-indigo-800' : 'text-slate-800',
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
                              <span className={cn('font-semibold', isChecked ? 'text-indigo-600' : 'text-slate-600')}>
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
                    <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                      {assignForm.activities.length} selected
                    </span>
                  )}
                </div>
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
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-white text-slate-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600',
                        )}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
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
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">End Date</label>
                  <input
                    type="date"
                    value={assignForm.end_date}
                    onChange={e => setAssignForm(prev => ({ ...prev, end_date: e.target.value }))}
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
              </div>

              {/* Selected summary */}
              {assignForm.farm_ids.length > 0 && assignForm.activities.length > 0 && (
                <div className="flex items-start gap-3 px-3 py-2.5 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-700">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-indigo-500 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    {/* Farm chips */}
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {assignForm.farm_ids.map(fid => (
                        <span key={fid} className="px-2 py-0.5 rounded-md bg-white text-indigo-800 border border-indigo-200 font-semibold">
                          {farmerNames[fid] ?? fid}
                        </span>
                      ))}
                    </div>
                    {/* Activity chips */}
                    <div className="flex flex-wrap gap-1">
                      {assignForm.activities.map(act => (
                        <span key={act} className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold">
                          {act}
                        </span>
                      ))}
                    </div>
                    {assignForm.area_acres && (
                      <div className="mt-1 text-indigo-600 font-semibold">{assignForm.area_acres} ac total</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50 shrink-0">
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
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
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed',
                )}
              >
                {isSubmitting ? 'Assigning…' : 'Assign Land'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScopeOfWork;
