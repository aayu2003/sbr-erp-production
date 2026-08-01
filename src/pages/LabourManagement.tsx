import { useEffect, useState, useMemo } from 'react';
import { Search, Plus, X, Phone, Wheat, Check, Map as MapIcon } from 'lucide-react';
import { MapContainer, TileLayer, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/config';
import { toast } from 'sonner';

// ─── TYPES ───────────────────────────────────────────────────
interface LandPlot {
  plot_id: string;
  plot_name: string;
  plot_area: number;
  plot_coordinates: [number, number][];
}

interface FarmGeoData {
  land_coordinates: [number, number][];
  land_plots: LandPlot[];
}

interface FarmItem {
  farm_id: string;
  farmer_id: string;
  owner_name: string;
  contact: string;
  address: string;
  area: number;
  block_id: string;
  crop_type: string;
  priority: number;
}

interface FarmLabour {
  staff_id: string;
  labour_name: string;
  contact_number: string;
  profile_image_url: string;
  employment_type: Record<string, any> | string;
}

interface StaffItem {
  staff_id: string;
  staff_information: {
    staff_name: string;
    staff_phone: string;
    staff_designation: string;
    employment_type: Record<string, any> | string;
    profile_image_url?: string;
  };
}

// ─── CONSTANTS ───────────────────────────────────────────────
const PLOT_COLORS = ['#f59e0b','#a855f7','#06b6d4','#ec4899','#f97316','#14b8a6','#6366f1','#84cc16'];

// ─── HELPERS ─────────────────────────────────────────────────
const getVendorName = (employmentType: Record<string, any> | string): string | null => {
  if (typeof employmentType === 'object' && employmentType !== null)
    return employmentType.type === 'Contract' ? employmentType.vendor ?? null : null;
  return null;
};

const getEmploymentTypeLabel = (employmentType: Record<string, any> | string): string => {
  if (typeof employmentType === 'object' && employmentType !== null)
    return employmentType.type ?? '-';
  return (employmentType as string) ?? '-';
};

// ─── MAP HELPERS ─────────────────────────────────────────────
const FitBounds = ({ coords }: { coords: [number, number][] }) => {
  const map = useMap();
  useEffect(() => {
    if (coords.length > 0)
      map.fitBounds(L.latLngBounds(coords as L.LatLngTuple[]), { padding: [10, 10] });
  }, [map]);
  return null;
};

const FarmMiniMap = ({ geo }: { geo: FarmGeoData }) => {
  const { land_coordinates: landCoords, land_plots: plots } = geo;
  const hasPlots = plots.length > 0;
  const allCoords: [number, number][] = hasPlots
    ? [...landCoords, ...plots.flatMap(p => p.plot_coordinates)]
    : landCoords;
  const center: [number, number] = allCoords.length > 0
    ? [allCoords.reduce((s, c) => s + c[0], 0) / allCoords.length,
       allCoords.reduce((s, c) => s + c[1], 0) / allCoords.length]
    : [20.5937, 78.9629];

  if (landCoords.length === 0) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-gray-900 gap-1">
        <MapIcon className="h-6 w-6 text-gray-600" />
        <span className="text-[10px] text-gray-500">No coordinates</span>
      </div>
    );
  }

  return (
    <MapContainer
      key={`${landCoords[0]?.[0]}-${landCoords[0]?.[1]}`}
      center={center}
      zoom={14}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        maxZoom={19}
      />
      {landCoords.length >= 3 && (
        <Polygon
          positions={landCoords}
          pathOptions={{ color: 'var(--land-boundary-color, #fde047)', fillColor: 'var(--land-boundary-fill, #fef9c3)', fillOpacity: 0.28, weight: 3 }}
        />
      )}
      {hasPlots && plots.map((plot, i) =>
        plot.plot_coordinates.length >= 3 ? (
          <Polygon
            key={plot.plot_id}
            positions={plot.plot_coordinates}
            pathOptions={{ color: PLOT_COLORS[i % PLOT_COLORS.length], fillColor: PLOT_COLORS[i % PLOT_COLORS.length], fillOpacity: 0.35, weight: 2 }}
          />
        ) : null
      )}
      <FitBounds coords={allCoords} />
    </MapContainer>
  );
};

// ─── AVATAR ──────────────────────────────────────────────────
const Avatar = ({ name, imageUrl, size = 'sm' }: { name: string; imageUrl?: string; size?: 'sm' | 'xs' }) => {
  const sizeClass = size === 'xs' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs';
  return (
    <div className={cn('rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold overflow-hidden shrink-0', sizeClass)}>
      {imageUrl
        ? <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
        : (name || '?').charAt(0).toUpperCase()
      }
    </div>
  );
};

// ─── MAIN COMPONENT ──────────────────────────────────────────
const LabourManagement = () => {
  const [farms, setFarms]               = useState<FarmItem[]>([]);
  const [geoByFarm, setGeoByFarm]       = useState<Record<string, FarmGeoData>>({});
  const [laboursByFarm, setLaboursByFarm] = useState<Record<string, FarmLabour[]>>({});
  const [allLabours, setAllLabours]     = useState<StaffItem[]>([]);
  const [isLoading, setIsLoading]       = useState(false);
  const [search, setSearch]             = useState('');

  // Per-card labour search
  const [cardSearch, setCardSearch]     = useState<Record<string, string>>({});

  // Popup state
  const [popupFarm, setPopupFarm]       = useState<FarmItem | null>(null);
  const [labourSearch, setLabourSearch] = useState('');
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [isAssigning, setIsAssigning]   = useState(false);
  const [removingKey, setRemovingKey]   = useState<string | null>(null);

  const BASE_URL = getBaseUrl().replace(/\/$/, '');

  // ── Fetch ──────────────────────────────────────────────────
  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [mappingRes, farmsRes, staffRes] = await Promise.all([
        fetch(`${BASE_URL}/admin_ops_requests/get_farm_and_farmer`, { headers: { Accept: 'application/json' } }),
        fetch(`${BASE_URL}/farmer_managment/get_farms`,             { headers: { Accept: 'application/json' } }),
        fetch(`${BASE_URL}/admin_staff/get_all_staff`,              { headers: { Accept: 'application/json' } }),
      ]);
      const [mappingData, farmsData, staffData] = await Promise.all([
        mappingRes.json(), farmsRes.json(), staffRes.json(),
      ]);

      if (mappingRes.ok && Array.isArray(mappingData?.farm_farmer_mapping))
        setFarms(mappingData.farm_farmer_mapping);
      else toast.error('Failed to load farms');

      if (farmsRes.ok && Array.isArray(farmsData?.farms)) {
        const labourMap: Record<string, FarmLabour[]> = {};
        const geoMap:    Record<string, FarmGeoData>  = {};
        for (const farm of farmsData.farms) {
          if (Array.isArray(farm.labours) && farm.labours.length > 0)
            labourMap[farm.farm_id] = farm.labours;
          if (farm.land_data?.land_coordinates?.length > 0)
            geoMap[farm.farm_id] = {
              land_coordinates: farm.land_data.land_coordinates,
              land_plots: farm.land_plots ?? [],
            };
        }
        setLaboursByFarm(labourMap);
        setGeoByFarm(geoMap);
      }

      if (staffRes.ok && Array.isArray(staffData))
        setAllLabours(staffData.filter((s: StaffItem) => s.staff_information?.staff_designation === 'Labour'));
      else toast.error('Failed to load staff');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // ── Derived ───────────────────────────────────────────────
  const filteredFarms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return farms;
    return farms.filter(f =>
      f.owner_name?.toLowerCase().includes(q) ||
      f.crop_type?.toLowerCase().includes(q) ||
      f.farm_id.toLowerCase().includes(q)
    );
  }, [farms, search]);

  const filteredLabours = useMemo(() => {
    const q = labourSearch.trim().toLowerCase();
    if (!q) return allLabours;
    return allLabours.filter(l =>
      l.staff_information?.staff_name?.toLowerCase().includes(q) ||
      l.staff_information?.staff_phone?.includes(q)
    );
  }, [allLabours, labourSearch]);

  // ── Popup ─────────────────────────────────────────────────
  const openPopup = (farm: FarmItem) => {
    setSelected(new Set((laboursByFarm[farm.farm_id] ?? []).map(l => l.staff_id)));
    setLabourSearch('');
    setPopupFarm(farm);
  };
  const closePopup = () => { setPopupFarm(null); setSelected(new Set()); };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Remove ────────────────────────────────────────────────
  const handleRemoveLabour = async (farm_id: string, staff_id: string) => {
    const key = `${farm_id}__${staff_id}`;
    try {
      setRemovingKey(key);
      const res = await fetch(`${BASE_URL}/farmer_managment/remove_labour_from_farm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ farm_id, staff_id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.message || 'Failed to remove labour'); return; }
      toast.success('Labour removed');
      await fetchData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove labour');
    } finally {
      setRemovingKey(null);
    }
  };

  // ── Assign ────────────────────────────────────────────────
  const handleAssign = async () => {
    if (!popupFarm) return;
    try {
      setIsAssigning(true);
      const labourPayload = allLabours
        .filter(s => selected.has(s.staff_id))
        .map(s => ({
          staff_id:          s.staff_id,
          labour_name:       s.staff_information?.staff_name ?? '',
          contact_number:    s.staff_information?.staff_phone ?? '',
          employment_type:   s.staff_information?.employment_type ?? {},
          profile_image_url: s.staff_information?.profile_image_url ?? '',
        }));
      const res = await fetch(`${BASE_URL}/farmer_managment/add_labours_to_farm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ farm_id: popupFarm.farm_id, labours: labourPayload }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.message || 'Failed to assign labours'); return; }
      toast.success('Labours assigned successfully');
      closePopup();
      await fetchData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to assign labours');
    } finally {
      setIsAssigning(false);
    }
  };

  // ─────────────────────────────────────────────────────────
  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-300">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Labour Management</h1>
        <p className="text-muted-foreground mt-1">View farms, map boundaries, and manage labour assignments.</p>
      </div>

      {/* Global Search */}
      <div className="flex gap-4 items-center bg-card border border-border p-3 rounded-lg shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by owner name or crop type..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 w-full text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background"
          />
        </div>
      </div>

      {/* Farm Cards */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading farms...</div>
      ) : filteredFarms.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No farms found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredFarms.map(farm => {
            const assignedLabours = laboursByFarm[farm.farm_id] ?? [];
            const geo = geoByFarm[farm.farm_id];
            const q = (cardSearch[farm.farm_id] ?? '').toLowerCase();
            const visibleLabours = q
              ? assignedLabours.filter(l => l.labour_name.toLowerCase().includes(q))
              : assignedLabours;

            return (
              <div key={farm.farm_id} className="bg-white border border-border rounded-xl shadow-sm flex flex-col overflow-hidden hover:shadow-md transition-shadow">

                {/* Mini Map */}
                <div className="h-40 w-full overflow-hidden bg-gray-900">
                  {geo ? <FarmMiniMap geo={geo} /> : (
                    <div className="h-full w-full flex flex-col items-center justify-center bg-gray-900 gap-1">
                      <MapIcon className="h-6 w-6 text-gray-600" />
                      <span className="text-[10px] text-gray-500">No map data</span>
                    </div>
                  )}
                </div>

                {/* Card Header */}
                <div className="px-5 py-3 border-b border-border bg-muted/30">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{farm.owner_name}</p>
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3 shrink-0" />
                        <span className="truncate">{farm.contact || '—'}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1">
                        <Wheat className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground capitalize">{farm.crop_type || '—'}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">{farm.area ? `${farm.area} ac` : ''}</span>
                    </div>
                  </div>
                </div>

                {/* Labour Section */}
                <div className="px-5 py-3 flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Labours {assignedLabours.length > 0 ? `(${assignedLabours.length})` : ''}
                    </p>
                  </div>

                  {/* Per-card search — only shown when there are labours */}
                  {assignedLabours.length > 0 && (
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search labours..."
                        value={cardSearch[farm.farm_id] ?? ''}
                        onChange={e => setCardSearch(prev => ({ ...prev, [farm.farm_id]: e.target.value }))}
                        className="pl-7 pr-3 py-1.5 w-full text-xs border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background"
                      />
                    </div>
                  )}

                  {/* Scrollable labour list */}
                  <div className="overflow-y-auto max-h-44 space-y-1.5 pr-0.5">
                    {assignedLabours.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No labours assigned yet.</p>
                    ) : visibleLabours.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No results.</p>
                    ) : (
                      visibleLabours.map(l => {
                        const vendor = getVendorName(l.employment_type);
                        const key = `${farm.farm_id}__${l.staff_id}`;
                        const isRemoving = removingKey === key;
                        return (
                          <div key={l.staff_id} className="flex items-center gap-2 group">
                            <Avatar name={l.labour_name} imageUrl={l.profile_image_url} size="xs" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-foreground truncate">{l.labour_name}</p>
                              {vendor && (
                                <p className="text-[10px] text-orange-600 truncate">Contract · {vendor}</p>
                              )}
                            </div>
                            <button
                              onClick={() => handleRemoveLabour(farm.farm_id, l.staff_id)}
                              disabled={isRemoving}
                              className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                              title="Remove labour"
                            >
                              {isRemoving
                                ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                : <X className="w-3 h-3" />
                              }
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Add Labour Button */}
                <div className="px-5 py-3 border-t border-border bg-gray-50">
                  <button
                    onClick={() => openPopup(farm)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    {assignedLabours.length > 0 ? 'Manage Labours' : 'Add Labour'}
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* ── Manage Labour Popup ── */}
      {popupFarm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-background w-full max-w-lg rounded-xl shadow-2xl border border-border flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200">

            <div className="px-6 py-4 border-b border-border flex items-start justify-between bg-white">
              <div>
                <h3 className="font-bold text-lg text-foreground">Manage Labours</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {popupFarm.owner_name} · {popupFarm.crop_type} · {popupFarm.area} acres
                </p>
              </div>
              <button onClick={closePopup} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 pt-4 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search labour by name or phone..."
                  value={labourSearch}
                  onChange={e => setLabourSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 w-full text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background"
                  autoFocus
                />
              </div>
              {selected.size > 0 && (
                <p className="text-xs text-primary font-medium mt-2">{selected.size} selected</p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
              {filteredLabours.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No labours found.</div>
              ) : (
                filteredLabours.map(labour => {
                  const isChecked  = selected.has(labour.staff_id);
                  const vendorName = getVendorName(labour.staff_information?.employment_type);
                  const typeLabel  = getEmploymentTypeLabel(labour.staff_information?.employment_type);
                  return (
                    <button
                      key={labour.staff_id}
                      onClick={() => toggleSelect(labour.staff_id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all',
                        isChecked ? 'border-primary bg-primary/5' : 'border-border bg-white hover:bg-muted/40'
                      )}
                    >
                      <div className={cn(
                        'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                        isChecked ? 'border-primary bg-primary' : 'border-muted-foreground'
                      )}>
                        {isChecked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                      </div>
                      <Avatar name={labour.staff_information?.staff_name} imageUrl={labour.staff_information?.profile_image_url} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{labour.staff_information?.staff_name}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground">{labour.staff_information?.staff_phone || '—'}</span>
                        </div>
                        {vendorName && (
                          <p className="text-[11px] text-orange-600 font-medium mt-0.5 truncate">Contract · {vendorName}</p>
                        )}
                      </div>
                      <span className={cn(
                        'shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium border',
                        typeLabel === 'Contract'
                          ? 'bg-orange-50 text-orange-700 border-orange-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      )}>
                        {typeLabel}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="px-6 py-4 border-t border-border bg-gray-50 flex justify-end gap-3">
              <button onClick={closePopup} className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={isAssigning || selected.size === 0}
                className="px-5 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAssigning ? 'Saving...' : `Save (${selected.size})`}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default LabourManagement;
