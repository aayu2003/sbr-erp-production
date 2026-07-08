import { useState, useEffect, useMemo } from 'react';
import {
  Search, MapPin, Map as MapIcon, Sprout, Wheat, Leaf,
  LayoutGrid, Layers,
  TreePine, RefreshCw, Shovel, Video, Crosshair,
  TrendingUp, BookOpen, X, Maximize2,
} from 'lucide-react';
import { MapContainer, TileLayer, Polygon, Polyline, CircleMarker, Tooltip, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import getBaseUrl from '@/lib/config';
import PlotMarkingModal from '@/components/farm/PlotMarkingModal';
import FarmActivityModal, { FarmActivityEntry } from '@/components/farm/FarmActivityModal';
import PremiumPlotterModal from '@/components/farm/PremiumPlotterModal';

const BASE_URL = getBaseUrl().replace(/\/$/, '');

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
type FarmInvestmentEntry = {
  date: string;
  input: number;
  amount: number;
  unit: string;
  description: string;
  investment: number;
  voucher_number: string;
  item_description: {
    item_code: string;
    item_unit: string;
    item_name: string;
  };
};

type VendorScope = {
  start_date: string;
  end_date: string;
  activities: string[];
  vendor_details: { vendor_name: string; vendor_contact: string };
};

type LandPlot = {
  plot_id:          string;
  plot_name:        string;
  plot_area:        number;
  plot_coordinates: [number, number][];
  crop_type?:       string;
  created_at?:      string;
};

type AdditionalMapping = {
  mapping_name:        string;
  mapping_type:        string;
  mapping_coordinates: string[];          // "lat,lng" strings
  shape_details:       'polygon' | 'line' | 'point';
};

type Farm = {
  farm_id: string;
  farmer_id: string;
  block_id: string;
  crop_type: string;
  area: number;
  priority: number;
  created_at: string;
  activities?: FarmActivityEntry[];
  land_data: {
    land_coordinates: [number, number][];
    farming_option: string;
    state: string;
    village: string;
    district: string;
    land_media: { images: string[]; video: string };
  };
  land_plots?: LandPlot[];
  additional_mappings?: AdditionalMapping[];
  scope_of_work?: Record<string, VendorScope>;
  harvest_log: Record<string, unknown>;
  payment_log: Record<string, unknown>;
  farm_investment_ledger?: FarmInvestmentEntry[];
};

// ─────────────────────────────────────────────────────────────
// MINI MAP — Leaflet satellite with land boundary + plots
// ─────────────────────────────────────────────────────────────
const PLOT_COLORS = ['#f59e0b','#a855f7','#06b6d4','#ec4899','#f97316','#14b8a6','#6366f1','#84cc16'];

const CROP_COLORS: Record<string, string> = {
  rahar:  '#f97316',
  paddy:  '#f59e0b',
  napier: '#22c55e',
};
const cropPlotColor = (cropType: string | undefined, fallback: string) =>
  cropType ? (CROP_COLORS[cropType] ?? fallback) : fallback;

const MAPPING_COLORS: Record<string, string> = {
  'narrow road':   '#f97316',
  'narrow path':   '#f97316',
  'small shelter': '#eab308',
  'bore well':     '#3b82f6',
  'borewell':      '#3b82f6',
  'canal':         '#06b6d4',
  'huge pipe':     '#8b5cf6',
  'ditch':         '#b45309',
  'unwanted tree': '#16a34a',
  'boundary wall': '#6b7280',
  'pond':          '#0ea5e9',
  'electric pole': '#facc15',
};
const getMappingColor = (type: string) =>
  MAPPING_COLORS[type.toLowerCase()] ?? '#ef4444';

const parseCoords = (raw: string[]): [number, number][] =>
  raw.map(s => { const [a, b] = s.split(',').map(Number); return [a, b]; });

const FitBounds = ({ coords }: { coords: [number, number][] }) => {
  const map = useMap();
  useEffect(() => {
    if (coords.length > 0) {
      map.fitBounds(L.latLngBounds(coords as L.LatLngTuple[]), { padding: [14, 14] });
    }
  }, [map]);
  return null;
};

const FarmMiniMap = ({
  landCoords,
  plots,
  mappings = [],
}: {
  landCoords: [number, number][];
  plots?: LandPlot[];
  mappings?: AdditionalMapping[];
}) => {
  const hasPlots = (plots?.length ?? 0) > 0;
  const parsedMappings = mappings.map(m => ({ ...m, coords: parseCoords(m.mapping_coordinates) }));

  const allCoords: [number, number][] = [
    ...landCoords,
    ...(plots ?? []).flatMap(p => p.plot_coordinates),
    ...parsedMappings.flatMap(m => m.coords),
  ];

  const center: [number, number] = allCoords.length > 0
    ? [allCoords.reduce((s, c) => s + c[0], 0) / allCoords.length,
       allCoords.reduce((s, c) => s + c[1], 0) / allCoords.length]
    : [20.5937, 78.9629];

  if (landCoords.length === 0) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-gray-900 gap-1">
        <MapIcon className="h-8 w-8 text-gray-600" />
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
      {/* Land boundary */}
      {landCoords.length >= 3 && (
        <Polygon positions={landCoords}
          pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: hasPlots ? 0.08 : 0.22, weight: 2.5 }}
        />
      )}
      {/* Plot polygons */}
      {hasPlots && plots!.map((plot, i) => {
        const c = cropPlotColor(plot.crop_type, PLOT_COLORS[i % PLOT_COLORS.length]);
        return plot.plot_coordinates.length >= 3 ? (
          <Polygon key={i} positions={plot.plot_coordinates}
            pathOptions={{ color: c, fillColor: c, fillOpacity: 0.45, weight: 2 }}
          />
        ) : null;
      })}
      {/* Additional mappings */}
      {parsedMappings.map((m, i) => {
        const color = getMappingColor(m.mapping_type);
        if (m.shape_details === 'polygon' && m.coords.length >= 3)
          return <Polygon key={i} positions={m.coords} pathOptions={{ color, fillColor: color, fillOpacity: 0.3, weight: 1.5 }} />;
        if (m.shape_details === 'line' && m.coords.length >= 2)
          return <Polyline key={i} positions={m.coords} pathOptions={{ color, weight: 2 }} />;
        return m.coords.map((pt, j) =>
          <CircleMarker key={`${i}-${j}`} center={pt} radius={4} pathOptions={{ color, fillColor: color, fillOpacity: 0.9, weight: 1.5 }} />
        );
      })}
      <FitBounds coords={allCoords} />
    </MapContainer>
  );
};

// Full interactive map used inside the expand modal
const FarmExpandMap = ({
  landCoords,
  plots,
  mappings = [],
  visibleLayers,
}: {
  landCoords: [number, number][];
  plots?: LandPlot[];
  mappings?: AdditionalMapping[];
  visibleLayers: Set<string>;
}) => {
  const hasPlots = (plots?.length ?? 0) > 0;
  const parsedMappings = mappings
    .filter(m => visibleLayers.has(m.mapping_type.toLowerCase()))
    .map(m => ({ ...m, coords: parseCoords(m.mapping_coordinates) }));

  const allCoords: [number, number][] = [
    ...landCoords,
    ...(plots ?? []).flatMap(p => p.plot_coordinates),
    ...parsedMappings.flatMap(m => m.coords),
  ];

  const center: [number, number] = allCoords.length > 0
    ? [allCoords.reduce((s, c) => s + c[0], 0) / allCoords.length,
       allCoords.reduce((s, c) => s + c[1], 0) / allCoords.length]
    : [20.5937, 78.9629];

  if (landCoords.length === 0) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-gray-900 gap-1">
        <MapIcon className="h-10 w-10 text-gray-600" />
        <span className="text-sm text-gray-500">No coordinates</span>
      </div>
    );
  }

  return (
    <MapContainer
      key={`expand-${landCoords[0]?.[0]}-${landCoords[0]?.[1]}`}
      center={center}
      zoom={15}
      style={{ height: '100%', width: '100%' }}
      zoomControl
      dragging
      scrollWheelZoom
      doubleClickZoom
      touchZoom
      attributionControl={false}
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        maxZoom={21}
      />
      {/* Land boundary */}
      {visibleLayers.has('land') && landCoords.length >= 3 && (
        <Polygon positions={landCoords}
          pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: hasPlots ? 0.06 : 0.20, weight: 2.5 }}
        />
      )}
      {/* Plot polygons with labels */}
      {visibleLayers.has('plots') && hasPlots && plots!.map((plot, i) => {
        const c = cropPlotColor(plot.crop_type, PLOT_COLORS[i % PLOT_COLORS.length]);
        return plot.plot_coordinates.length >= 3 ? (
          <Polygon key={i} positions={plot.plot_coordinates}
            pathOptions={{ color: c, fillColor: c, fillOpacity: 0.45, weight: 2 }}
          >
            <Tooltip permanent direction="center" opacity={1} className="plot-label-tooltip">
              <div className="text-center leading-tight">
                <div className="font-bold text-[11px]">{plot.plot_name}</div>
                <div className="text-[10px] opacity-80">{plot.plot_area} ac</div>
                {plot.crop_type && (
                  <div className="text-[10px] font-semibold mt-0.5 capitalize" style={{ color: c }}>{plot.crop_type}</div>
                )}
              </div>
            </Tooltip>
          </Polygon>
        ) : null;
      })}
      {/* Additional mappings with labels */}
      {parsedMappings.map((m, i) => {
        const color = getMappingColor(m.mapping_type);
        const tip = (
          <Tooltip sticky opacity={1}>
            <span className="text-[11px] font-semibold">{m.mapping_name}</span>
          </Tooltip>
        );
        if (m.shape_details === 'polygon' && m.coords.length >= 3)
          return (
            <Polygon key={i} positions={m.coords} pathOptions={{ color, fillColor: color, fillOpacity: 0.3, weight: 2 }}>
              {tip}
            </Polygon>
          );
        if (m.shape_details === 'line' && m.coords.length >= 2)
          return (
            <Polyline key={i} positions={m.coords} pathOptions={{ color, weight: 3 }}>
              {tip}
            </Polyline>
          );
        return m.coords.map((pt, j) => (
          <CircleMarker key={`${i}-${j}`} center={pt} radius={6} pathOptions={{ color, fillColor: color, fillOpacity: 0.9, weight: 2 }}>
            {tip}
          </CircleMarker>
        ));
      })}
      <FitBounds coords={allCoords} />
    </MapContainer>
  );
};

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────
type KnownCrop = 'napier' | 'paddy' | 'ragi';

const cropMeta: Record<KnownCrop, { label: string; Icon: React.ComponentType<{ className?: string }>; color: string }> = {
  napier: { label: 'Napier', Icon: Leaf,   color: 'text-green-700 bg-green-50 ring-green-100'    },
  paddy:  { label: 'Paddy',  Icon: Wheat,  color: 'text-yellow-700 bg-yellow-50 ring-yellow-100' },
  ragi:   { label: 'Ragi',   Icon: Sprout, color: 'text-orange-700 bg-orange-50 ring-orange-100' },
};

const farmingOptionMeta: Record<string, { color: string }> = {
  'Lease Farming':    { color: 'text-blue-700 bg-blue-50 ring-blue-200'       },
  'Contract Farming': { color: 'text-purple-700 bg-purple-50 ring-purple-200' },
};

const shortId = (id: string) => (id ?? '').slice(0, 8).toUpperCase();

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
};

const fmtShortDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  } catch { return iso; }
};

const recentActivities = (farm: Farm): FarmActivityEntry[] =>
  [...(farm.activities ?? [])]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 2);

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
const FarmDirectory = () => {
  const [farms, setFarms]     = useState<Farm[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState('');
  const [farmerNames, setFarmerNames] = useState<Record<string, string>>({});
  const [plotMarkingFarm, setPlotMarkingFarm]     = useState<Farm | null>(null);
  const [activityModalFarm, setActivityModalFarm] = useState<Farm | null>(null);
  const [ledgerFarm, setLedgerFarm]               = useState<Farm | null>(null);
  const [expandMapFarm, setExpandMapFarm]         = useState<Farm | null>(null);
  const [plotterFarm, setPlotterFarm]             = useState<Farm | null>(null);
  const [cropSelectorFarm, setCropSelectorFarm]   = useState<Farm | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${BASE_URL}/farmer_managment/get_farms`)
      .then(r => r.json())
      .then((data: any) => {
        if (Array.isArray(data?.farms)) setFarms(data.farms);
        else throw new Error(data?.message || 'Unexpected response format');
      })
      .catch((e: any) => {
        const msg = e?.message || 'Failed to load farms';
        setError(msg);
        toast.error(msg);
      })
      .finally(() => setLoading(false));
  }, []);

  // After farms are loaded, batch-fetch owner names individually so they fill in progressively
  useEffect(() => {
    if (farms.length === 0) return;
    farms.forEach(farm => {
      fetch(`${BASE_URL}/farmer_managment/get_farmer_details_from_farm_id/${farm.farm_id}`)
        .then(r => r.json())
        .then((data: any) => {
          const name = data?.farmer?.farmer_name;
          setFarmerNames(prev => ({ ...prev, [farm.farm_id]: name || '' }));
        })
        .catch(() => {
          setFarmerNames(prev => ({ ...prev, [farm.farm_id]: '' }));
        });
    });
  }, [farms]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return farms;
    return farms.filter(f =>
      f.farm_id.toLowerCase().includes(q) ||
      (farmerNames[f.farm_id] ?? '').toLowerCase().includes(q) ||
      (f.land_data?.village ?? '').toLowerCase().includes(q) ||
      (f.land_data?.district ?? '').toLowerCase().includes(q) ||
      (f.land_data?.state ?? '').toLowerCase().includes(q) ||
      (f.crop_type ?? '').toLowerCase().includes(q) ||
      (f.land_data?.farming_option ?? '').toLowerCase().includes(q)
    );
  }, [farms, farmerNames, search]);

  // KPIs
  const totalArea      = farms.reduce((s, f) => s + (f.area ?? 0), 0);
  const uniqueBlocks   = new Set(farms.map(f => f.block_id)).size;
  const leaseFarms     = farms.filter(f => f.land_data?.farming_option === 'Lease Farming').length;
  const contractFarms  = farms.filter(f => f.land_data?.farming_option === 'Contract Farming').length;
  const totalInvestment = farms.reduce((s, f) =>
    s + (f.farm_investment_ledger ?? []).reduce((si, e) => si + (e.amount ?? 0), 0), 0);

  const kpis = [
    { label: 'Total Farms',        value: farms.length,                                                                   icon: LayoutGrid,  color: 'text-gray-800'    },
    { label: 'Total Area (Acres)',  value: totalArea.toLocaleString('en-IN'),                                              icon: Layers,      color: 'text-blue-600'    },
    { label: 'Unique Blocks',       value: uniqueBlocks,                                                                   icon: MapIcon,     color: 'text-violet-600'  },
    { label: 'Lease Farming',       value: leaseFarms,                                                                     icon: TreePine,    color: 'text-emerald-600' },
    { label: 'Contract Farming',    value: contractFarms,                                                                  icon: Shovel,      color: 'text-orange-600'  },
    { label: 'Total Investment',    value: `₹${totalInvestment.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,   icon: TrendingUp,  color: 'text-rose-600'    },
  ];

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold">Farm Directory</h1>
        <p className="text-muted-foreground mt-1">All registered farm parcels and their details</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl p-5 shadow-sm border border-border">
            <div className="flex items-center gap-2 mb-1">
              <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
            </div>
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by village, district, crop, farm ID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
          <RefreshCw className="w-8 h-8 animate-spin opacity-40" />
          <p className="text-sm">Loading farms…</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-24 gap-2 text-red-400">
          <p className="text-sm font-medium">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <p className="text-sm">No farms found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5 items-start">
          {filtered.map(farm => {
            const ld           = farm.land_data;
            const coords       = ld.land_coordinates ?? [];
            const images       = ld.land_media?.images ?? [];
            const video        = ld.land_media?.video ?? '';
            const cropKey      = (farm.crop_type ?? '').toLowerCase() as KnownCrop;
            const crop         = cropMeta[cropKey] ?? null;
            const optionMeta   = farmingOptionMeta[ld.farming_option ?? ''] ?? { color: 'text-gray-600 bg-gray-50 ring-gray-200' };
            const location     = [ld.village, ld.district, ld.state].filter(Boolean).join(', ');
            const scopeEntries = Object.entries(farm.scope_of_work ?? {});

            // Separate SBR self-scope entries from external vendor entries
            const isSelfScope = (s: VendorScope) =>
              (s.vendor_details?.vendor_name ?? '').toLowerCase().includes('sai') ||
              (s.vendor_details?.vendor_name ?? '').toLowerCase().includes('sbr');

            const selfScopeEntries   = scopeEntries.filter(([k, s]) => k === 'self' || isSelfScope(s));
            const vendorScopeEntries = scopeEntries.filter(([k, s]) => k !== 'self' && !isSelfScope(s));
            const hasSelfScope   = selfScopeEntries.length > 0;
            const hasVendorScope = vendorScopeEntries.length > 0;
            const hasScope       = scopeEntries.length > 0;


            return (
              <div
                key={farm.farm_id}
                className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md flex flex-col"
              >
                {/* ── Header: Leaflet satellite map ── */}
                <div className="h-[220px] w-full relative overflow-hidden">
                  <FarmMiniMap landCoords={coords} plots={farm.land_plots} mappings={farm.additional_mappings} />

                  {/* Farming option badge */}
                  <span className={`absolute top-2 left-2 z-[1000] inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 backdrop-blur-sm bg-white/90 ${optionMeta.color}`}>
                    {ld.farming_option || 'Unknown'}
                  </span>

                  {/* Priority badge */}
                  {(farm.priority ?? 0) > 0 && (
                    <span className="absolute top-2 right-2 z-[1000] rounded-full bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5">
                      P{farm.priority}
                    </span>
                  )}

                  {/* Expand map button */}
                  <button
                    type="button"
                    onClick={() => setExpandMapFarm(farm)}
                    className="absolute bottom-2 left-2 z-[1000] p-1.5 rounded-md bg-black/60 hover:bg-black/80 text-white transition-colors"
                    title="Expand map"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Plot count badge */}
                  {(farm.land_plots?.length ?? 0) > 0 && (
                    <span className="absolute bottom-2 right-2 z-[1000] rounded bg-black/60 text-white text-[9px] px-1.5 py-0.5">
                      {farm.land_plots!.length} plots
                    </span>
                  )}
                </div>

                {/* ── Card body ── */}
                <div className="p-4 space-y-3 flex-1 flex flex-col">

                  {/* Farm ID + Owner + Block + Date */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-gray-950 font-mono leading-5 truncate">
                        {farm.farm_id}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 h-4">
                        {farm.farm_id in farmerNames ? (
                          farmerNames[farm.farm_id] ? (
                            <span className="text-[11px] font-medium text-gray-700 truncate">
                              {farmerNames[farm.farm_id]}
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground italic">Unknown owner</span>
                          )
                        ) : (
                          <span className="inline-block h-3 w-28 rounded bg-gray-200 animate-pulse" />
                        )}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {fmtDate(farm.created_at)}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-mono font-semibold text-slate-600 ring-1 ring-slate-200 max-w-[120px] truncate">
                      {shortId(farm.block_id)}…
                    </span>
                  </div>

                  {/* Location */}
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400 mt-0.5" />
                    <span className="text-xs line-clamp-2">{location || '—'}</span>
                  </div>

                  {/* Crop + Area */}
                  <div className="flex items-center justify-between">
                    {crop ? (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${crop.color}`}>
                        <crop.Icon className="h-3 w-3" />
                        {crop.label}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 bg-gray-50 text-gray-600 ring-gray-200 capitalize">
                        {farm.crop_type || 'Unknown'}
                      </span>
                    )}
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground">Area</div>
                      <div className="text-sm font-bold text-gray-900">
                        {(farm.area ?? 0).toLocaleString('en-IN')} acres
                      </div>
                    </div>
                  </div>

                  {/* ── Scope of Work ── */}

                  {/* SBR self-scope (from scope_of_work or fallback) */}
                  {(hasSelfScope || !hasScope) && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Scope of Work</div>
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] font-semibold text-gray-800">Sai BioResources</div>
                        <span className="text-[10px] font-mono text-emerald-600 bg-emerald-100 rounded px-1.5 py-0.5">self</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {hasSelfScope
                          ? (selfScopeEntries[0][1].activities ?? []).slice(0, 4).map(act => (
                              <span key={act} className="rounded-full bg-white border border-emerald-200 text-[10px] px-1.5 py-0.5 text-emerald-700">
                                {act}
                              </span>
                            ))
                          : (
                            <span className="rounded-full bg-white border border-emerald-200 text-[10px] px-2 py-0.5 text-emerald-700 font-medium">
                              All Activities
                            </span>
                          )
                        }
                        {hasSelfScope && (selfScopeEntries[0][1].activities ?? []).length > 4 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{selfScopeEntries[0][1].activities.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* External vendor scope */}
                  {hasVendorScope && (
                    <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2 space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Vendor Scope</div>
                      {vendorScopeEntries.map(([vendorId, scope]) => (
                        <div key={vendorId} className="space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <div className="text-[11px] font-semibold text-gray-800 truncate">
                              {scope.vendor_details?.vendor_name}
                            </div>
                            <span className="shrink-0 text-[10px] font-mono text-muted-foreground">{vendorId}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {(scope.activities ?? []).slice(0, 4).map(act => (
                              <span key={act} className="rounded-full bg-white border border-blue-200 text-[10px] px-1.5 py-0.5 text-blue-700">
                                {act}
                              </span>
                            ))}
                            {(scope.activities ?? []).length > 4 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{scope.activities.length - 4} more
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}


                  {/* ── Investment Ledger ── */}
                  {(() => {
                    const ledger = farm.farm_investment_ledger ?? [];
                    if (ledger.length === 0) {
                      return (
                        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5 flex items-center gap-2">
                          <TrendingUp className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                          <p className="text-[11px] text-gray-400 italic">Investment not started yet</p>
                        </div>
                      );
                    }
                    const totalAmt = ledger.reduce((s, e) => s + (e.amount ?? 0), 0);
                    return (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <TrendingUp className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Total Investment</p>
                            <p className="text-base font-extrabold text-rose-700 leading-tight">
                              ₹{totalAmt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setLedgerFarm(farm)}
                          className="shrink-0 inline-flex items-center gap-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold px-2.5 py-1.5 transition-colors"
                        >
                          <BookOpen className="w-3 h-3" />
                          View Ledger
                        </button>
                      </div>
                    );
                  })()}

                  {/* ── Land Media ── */}
                  <div>
                    <div className="mb-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Land Media
                    </div>

                    {/* 3 image thumbnails */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {[0, 1, 2].map(idx => (
                        <div
                          key={idx}
                          className="h-14 rounded-md border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden"
                        >
                          {images[idx] ? (
                            <img
                              src={images[idx]}
                              alt={`Farm ${idx + 1}`}
                              className="h-full w-full object-cover cursor-pointer"
                              onClick={() => window.open(images[idx], '_blank')}
                            />
                          ) : (
                            <span className="text-[10px] text-muted-foreground">No image</span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Video — full width spanning all 3 columns */}
                    {video ? (
                      <div className="mt-1.5 rounded-md border border-gray-200 overflow-hidden bg-black">
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-900">
                          <Video className="w-3 h-3 text-gray-400" />
                          <span className="text-[10px] text-gray-400 font-medium">Land Video</span>
                        </div>
                        <video
                          src={video}
                          controls
                          className="w-full"
                          style={{ maxHeight: '120px', display: 'block' }}
                        />
                      </div>
                    ) : (
                      <div className="mt-1.5 h-10 rounded-md border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center gap-1.5">
                        <Video className="w-3.5 h-3.5 text-gray-300" />
                        <span className="text-[10px] text-muted-foreground">No video</span>
                      </div>
                    )}
                  </div>

                  {/* ── Footer actions ── */}
                  <div className="flex items-center gap-2 pt-1 border-t border-gray-100 mt-auto flex-wrap">
                    <button
                      type="button"
                      onClick={() => setCropSelectorFarm(farm)}
                      className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2.5 py-1.5 text-[11px] font-medium text-green-700 hover:bg-green-100"
                    >
                      <Sprout className="h-3.5 w-3.5" />
                      Crop Selector
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlotMarkingFarm(farm)}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
                    >
                      <Crosshair className="h-3.5 w-3.5" />
                      Plot Marking
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlotterFarm(farm)}
                      className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[11px] font-medium text-violet-700 hover:bg-violet-100"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      Plotter
                    </button>
                  </div>

                  {/* ── Recent Activity timeline ── */}
                  {(() => {
                    const acts = recentActivities(farm);
                    const total = (farm.activities ?? []).length;
                    if (total === 0) return null;
                    return (
                      <button
                        type="button"
                        onClick={() => setActivityModalFarm(farm)}
                        className="w-full text-left border-t border-gray-100 pt-3 group/act"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Recent Activity
                          </span>
                          <span className="text-[10px] text-emerald-600 font-semibold group-hover/act:underline">
                            View all {total} →
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {acts.map((act, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                              <span className="text-[11px] font-medium text-gray-700 truncate flex-1">
                                {act.activity}
                              </span>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {fmtShortDate(act.date)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </button>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Activity Modal */}
      {activityModalFarm && (
        <FarmActivityModal
          farmId={activityModalFarm.farm_id}
          location={[
            activityModalFarm.land_data?.village,
            activityModalFarm.land_data?.district,
            activityModalFarm.land_data?.state,
          ].filter(Boolean).join(', ')}
          activities={activityModalFarm.activities ?? []}
          onClose={() => setActivityModalFarm(null)}
        />
      )}

      {/* Plot Marking Modal */}
      {plotMarkingFarm && (
        <PlotMarkingModal
          farmId={plotMarkingFarm.farm_id}
          farmTotalAcres={plotMarkingFarm.area}
          farmLabel={[
            plotMarkingFarm.land_data?.village,
            plotMarkingFarm.land_data?.district,
            plotMarkingFarm.land_data?.state,
          ].filter(Boolean).join(', ')}
          initialCoordinates={plotMarkingFarm.land_data?.land_coordinates ?? []}
          initialPlots={plotMarkingFarm.land_plots ?? []}
          onClose={() => setPlotMarkingFarm(null)}
          onSave={(plot) => {
            toast.success(`Plot "${plot.plot_number}" saved — ${plot.coordinates.length} points · ${plot.acres} acres`);
          }}
        />
      )}

      {/* Investment Ledger Modal */}
      {ledgerFarm && (
        <FarmInvestmentLedgerModal
          farm={ledgerFarm}
          onClose={() => setLedgerFarm(null)}
        />
      )}

      {/* Map Expand Modal */}
      {expandMapFarm && (
        <FarmMapExpandModal
          farm={expandMapFarm}
          onClose={() => setExpandMapFarm(null)}
        />
      )}

      {/* Premium Plotter Modal */}
      {plotterFarm && (
        <PremiumPlotterModal
          farmId={plotterFarm.farm_id}
          farmLabel={[
            plotterFarm.land_data?.village,
            plotterFarm.land_data?.district,
            plotterFarm.land_data?.state,
          ].filter(Boolean).join(', ')}
          landCoordinates={plotterFarm.land_data?.land_coordinates ?? []}
          landPlots={plotterFarm.land_plots ?? []}
          onClose={() => setPlotterFarm(null)}
        />
      )}

      {/* Crop Selector Modal */}
      {cropSelectorFarm && (
        <CropSelectorModal
          farm={cropSelectorFarm}
          onClose={() => setCropSelectorFarm(null)}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// CROP SELECTOR MODAL
// ─────────────────────────────────────────────────────────────
const CROP_OPTIONS: { key: string; label: string; Icon: React.ComponentType<{ className?: string }>; color: string; emoji: string }[] = [
  { key: 'rahar',  label: 'Rahar',  Icon: Sprout, color: '#f97316', emoji: '🫘' },
  { key: 'paddy',  label: 'Paddy',  Icon: Wheat,  color: '#f59e0b', emoji: '🌾' },
  { key: 'napier', label: 'Napier', Icon: Leaf,   color: '#22c55e', emoji: '🌿' },
];

const plotCentroid = (coords: [number, number][]): [number, number] => [
  coords.reduce((s, c) => s + c[0], 0) / coords.length,
  coords.reduce((s, c) => s + c[1], 0) / coords.length,
];

const CropSelectorModal = ({
  farm,
  onClose,
}: {
  farm: Farm;
  onClose: () => void;
}) => {
  const [selectedCrop, setSelectedCrop] = useState<string | null>(null);
  // plot_name → crop_key  (each plot tracks its own assigned crop)
  const [plotCropMap, setPlotCropMap] = useState<Map<string, string>>(() => {
    const initial = new Map<string, string>();
    (farm.land_plots ?? []).forEach(p => {
      if (p.crop_type) initial.set(p.plot_name, p.crop_type);
    });
    return initial;
  });
  const [saving, setSaving] = useState(false);

  const plots    = farm.land_plots ?? [];
  const coords   = farm.land_data?.land_coordinates ?? [];
  const location = [farm.land_data?.village, farm.land_data?.district, farm.land_data?.state]
    .filter(Boolean).join(', ');

  const activeCrop = CROP_OPTIONS.find(c => c.key === selectedCrop);

  const acresByCrop = (cropKey: string) =>
    plots
      .filter(p => plotCropMap.get(p.plot_name) === cropKey)
      .reduce((s, p) => s + (p.plot_area ?? 0), 0);

  const totalAssignedAcres = plots
    .filter(p => plotCropMap.has(p.plot_name))
    .reduce((s, p) => s + (p.plot_area ?? 0), 0);

  const togglePlot = (plotName: string) => {
    if (!selectedCrop) { toast.error('Select a crop first'); return; }
    setPlotCropMap(prev => {
      const next = new Map(prev);
      // same crop tapped again → remove; otherwise assign / reassign
      next.get(plotName) === selectedCrop ? next.delete(plotName) : next.set(plotName, selectedCrop);
      return next;
    });
  };

  const handleSave = async () => {
    if (plotCropMap.size === 0) { toast.error('Tap at least one plot on the map'); return; }
    setSaving(true);

    const payloads = [...plotCropMap.entries()].map(([plotName, cropKey]) => {
      const plot = plots.find(p => p.plot_name === plotName);
      return {
        farm_id:   farm.farm_id,
        plot_id:   plot?.plot_id ?? plotName,
        crop_type: cropKey,
      };
    });

    try {
      // process in batches of 10, each batch fully parallel
      for (let i = 0; i < payloads.length; i += 10) {
        const batch = payloads.slice(i, i + 10);
        const results = await Promise.all(
          batch.map(payload =>
            fetch(`${BASE_URL}/farmer_managment/add_crop_type_to_plot`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify(payload),
            }).then(r => r.json())
          )
        );

        const failed = results.filter(r => !r.success);
        if (failed.length > 0) {
          toast.error(`${failed.length} assignment(s) failed — please retry`);
          setSaving(false);
          return;
        }
      }

      toast.success(`Crop assignment saved for ${plotCropMap.size} plot(s)`);
      onClose();
    } catch {
      toast.error('Network error — crop assignment not saved');
    } finally {
      setSaving(false);
    }
  };

  const allMapCoords: [number, number][] = [
    ...coords,
    ...plots.flatMap(p => p.plot_coordinates),
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col" style={{ height: '88vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Sprout className="w-4 h-4 text-green-600" />
              <h2 className="text-base font-bold text-gray-900">Crop Selector</h2>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{location || farm.farm_id}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Step 1 — Crop chips */}
        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Select active crop — then tap plots on the map
          </p>
          <div className="flex items-center gap-2">
            {CROP_OPTIONS.map(({ key, label, Icon, color, emoji }) => {
              const active = selectedCrop === key;
              const acres  = acresByCrop(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedCrop(key)}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${
                    active ? 'text-white shadow-md ring-2 ring-offset-1' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                  style={active ? { background: color, borderColor: color } : {}}
                >
                  <span className="text-base leading-none">{emoji}</span>
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  {acres > 0 && (
                    <span
                      className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: active ? 'rgba(255,255,255,0.3)' : color, color: '#fff' }}
                    >
                      {acres} ac
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Map + legend */}
        <div className="flex flex-1 min-h-0">

          {/* Map area */}
          <div className="flex-1 relative">
            {plots.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center bg-gray-900 gap-2">
                <Crosshair className="w-8 h-8 text-gray-500" />
                <p className="text-sm text-gray-400 font-medium">No plots marked yet</p>
                <p className="text-xs text-gray-500">Use "Plot Marking" to add plots first</p>
              </div>
            ) : (
              <>
                {/* Hint pill */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[400] bg-black/60 text-white text-[11px] font-medium px-3 py-1.5 rounded-full pointer-events-none whitespace-nowrap">
                  {activeCrop
                    ? `Assigning: ${activeCrop.emoji} ${activeCrop.label} — tap a plot`
                    : 'Select a crop above first'}
                </div>
                <MapContainer
                  key={farm.farm_id}
                  center={
                    allMapCoords.length > 0
                      ? [
                          allMapCoords.reduce((s, c) => s + c[0], 0) / allMapCoords.length,
                          allMapCoords.reduce((s, c) => s + c[1], 0) / allMapCoords.length,
                        ]
                      : [20.5937, 78.9629]
                  }
                  zoom={15}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={true}
                  scrollWheelZoom={true}
                  attributionControl={false}
                >
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    maxZoom={19}
                  />
                  {/* Land boundary */}
                  {coords.length >= 3 && (
                    <Polygon
                      positions={coords}
                      pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.07, weight: 2 }}
                    />
                  )}
                  {/* Plot polygons + centroid icons */}
                  {plots.map((plot) => {
                    if (plot.plot_coordinates.length < 3) return null;
                    const assignedKey = plotCropMap.get(plot.plot_name);
                    const crop        = CROP_OPTIONS.find(c => c.key === assignedKey);
                    return (
                      <>
                        <Polygon
                          key={`poly-${plot.plot_name}`}
                          positions={plot.plot_coordinates}
                          pathOptions={
                            crop
                              ? { color: crop.color, fillColor: crop.color, fillOpacity: 0.55, weight: 3 }
                              : { color: '#ffffff', fillColor: '#ffffff', fillOpacity: 0.12, weight: 1.5, dashArray: '5 5' }
                          }
                          eventHandlers={{ click: () => togglePlot(plot.plot_name) }}
                        >
                          <Tooltip sticky direction="center">
                            <span className="text-[11px] font-semibold">{plot.plot_name}</span>
                            {crop && <span className="ml-1">{crop.emoji}</span>}
                            <span className="text-[10px] text-gray-500 ml-1">· {plot.plot_area} ac</span>
                          </Tooltip>
                        </Polygon>
                        {/* Crop icon badge at polygon centroid */}
                        {crop && (
                          <Marker
                            key={`icon-${plot.plot_name}`}
                            position={plotCentroid(plot.plot_coordinates)}
                            interactive={false}
                            icon={L.divIcon({
                              html: `<div style="
                                width:32px;height:32px;border-radius:50%;
                                background:${crop.color};
                                border:2.5px solid white;
                                box-shadow:0 2px 8px rgba(0,0,0,0.5);
                                display:flex;align-items:center;justify-content:center;
                                font-size:16px;line-height:1;
                              ">${crop.emoji}</div>`,
                              className: '',
                              iconSize:   [32, 32],
                              iconAnchor: [16, 16],
                            })}
                          />
                        )}
                      </>
                    );
                  })}
                  <FitBounds coords={allMapCoords} />
                </MapContainer>
              </>
            )}
          </div>

          {/* Side legend */}
          <div className="w-44 border-l border-gray-100 bg-gray-50 flex flex-col shrink-0">
            <div className="px-3 pt-3 pb-2 border-b border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Plots</p>
            </div>
            <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1.5">
              {plots.length === 0
                ? <p className="text-[11px] text-gray-400 px-1 pt-2">No plots</p>
                : plots.map((plot) => {
                    const assignedKey = plotCropMap.get(plot.plot_name);
                    const crop        = CROP_OPTIONS.find(c => c.key === assignedKey);
                    return (
                      <button
                        key={plot.plot_name}
                        type="button"
                        onClick={() => togglePlot(plot.plot_name)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-all text-[11px] ${
                          crop ? 'border-transparent text-white font-semibold' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
                        }`}
                        style={crop ? { background: crop.color } : {}}
                      >
                        <span className="shrink-0 text-sm leading-none">{crop ? crop.emoji : '○'}</span>
                        <span className="flex-1 truncate leading-tight">{plot.plot_name}</span>
                        <span className="text-[10px] opacity-70 shrink-0">{plot.plot_area}a</span>
                      </button>
                    );
                  })
              }
            </div>
            {plotCropMap.size > 0 && (
              <div className="px-3 py-2 border-t border-gray-100 text-center">
                <p className="text-xs font-bold text-gray-700">{plotCropMap.size} assigned</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex flex-col gap-0.5">
            {plotCropMap.size > 0 ? (
              <>
                <p className="text-xs font-semibold text-gray-700">
                  Total: {totalAssignedAcres} ac across {plotCropMap.size} plot(s)
                </p>
                <p className="text-[11px] text-gray-400">
                  {CROP_OPTIONS.filter(c => acresByCrop(c.key) > 0)
                    .map(c => `${c.emoji} ${c.label} ${acresByCrop(c.key)} ac`)
                    .join(' · ')}
                </p>
              </>
            ) : (
              <p className="text-xs text-gray-400">
                {activeCrop ? `Tap plots to assign ${activeCrop.label}` : 'Select a crop first, then tap plots'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={plotCropMap.size === 0 || saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// FARM INVESTMENT LEDGER MODAL
// ─────────────────────────────────────────────────────────────
const FarmInvestmentLedgerModal = ({
  farm,
  onClose,
}: {
  farm: Farm;
  onClose: () => void;
}) => {
  const ledger = farm.farm_investment_ledger ?? [];
  const totalAmt = ledger.reduce((s, e) => s + (e.amount ?? 0), 0);
  const location = [farm.land_data?.village, farm.land_data?.district, farm.land_data?.state]
    .filter(Boolean).join(', ');

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return iso; }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[88vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-rose-600" />
              <h2 className="text-lg font-bold text-gray-900">Investment Ledger</h2>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{location || farm.farm_id}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Total Investment</p>
              <p className="text-xl font-extrabold text-rose-600">
                ₹{totalAmt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 transition-colors">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          {ledger.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <TrendingUp className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm font-medium">No investment entries yet</p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 min-w-[100px]">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 min-w-[160px]">Item</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 min-w-[90px]">Item Code</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 min-w-[60px]">Unit</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Description</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-rose-600 min-w-[100px]">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((entry, idx) => (
                  <tr key={entry.voucher_number || idx} className="border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{fmtDate(entry.date)}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900">{entry.item_description?.item_name?.trim() || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-500">{entry.item_description?.item_code || '—'}</td>
                    <td className="px-4 py-3 text-center text-xs text-gray-600">{entry.item_description?.item_unit || entry.unit || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 max-w-[220px]">
                      <span className="line-clamp-2" title={entry.description}>{entry.description || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-rose-600">
                      ₹{(entry.amount ?? 0).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
                {/* Total row */}
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td colSpan={5} className="px-4 py-3 text-sm font-bold text-gray-700">Total</td>
                  <td className="px-4 py-3 text-right font-extrabold text-rose-700">
                    ₹{totalAmt.toLocaleString('en-IN')}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// FARM MAP EXPAND MODAL
// ─────────────────────────────────────────────────────────────
const FarmMapExpandModal = ({
  farm,
  onClose,
}: {
  farm: Farm;
  onClose: () => void;
}) => {
  const plots    = farm.land_plots ?? [];
  const mappings = farm.additional_mappings ?? [];
  const coords   = farm.land_data?.land_coordinates ?? [];
  const location = [farm.land_data?.village, farm.land_data?.district, farm.land_data?.state]
    .filter(Boolean).join(', ');

  const uniqueMappingTypes = Array.from(new Set(mappings.map(m => m.mapping_type.toLowerCase())));
  const allLayers = ['land', ...(plots.length > 0 ? ['plots'] : []), ...uniqueMappingTypes];
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(() => new Set(allLayers));
  const [sheetSearch, setSheetSearch]     = useState('');
  const [sheetCropFilter, setSheetCropFilter] = useState<string | null>(null);

  const toggleLayer = (key: string) =>
    setVisibleLayers(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const filterPills = [
    { key: 'land',  label: 'Land Boundary', color: '#22c55e' },
    ...(plots.length > 0 ? [{ key: 'plots', label: 'Plot Mapping', color: PLOT_COLORS[0] }] : []),
    ...uniqueMappingTypes.map(t => ({
      key: t,
      label: t.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
      color: getMappingColor(t),
    })),
  ];

  // Summary stats
  const totalArea     = plots.reduce((s, p) => s + (p.plot_area ?? 0), 0);
  const cropBreakdown = plots.reduce<Record<string, { count: number; area: number }>>((acc, p) => {
    const k = p.crop_type ?? 'unassigned';
    if (!acc[k]) acc[k] = { count: 0, area: 0 };
    acc[k].count++;
    acc[k].area = +(acc[k].area + (p.plot_area ?? 0)).toFixed(3);
    return acc;
  }, {});

  const filteredPlots = plots.filter(p => {
    const matchSearch = !sheetSearch || p.plot_name.toLowerCase().includes(sheetSearch.toLowerCase());
    const matchCrop   = !sheetCropFilter || (p.crop_type ?? 'unassigned') === sheetCropFilter;
    return matchSearch && matchCrop;
  });

  const cropKeys = Object.keys(cropBreakdown);

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col" style={{ height: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <MapIcon className="w-4 h-4 text-emerald-600" />
            <div>
              <h2 className="text-base font-bold text-gray-900">Land Map</h2>
              <p className="text-xs text-gray-400">{location || farm.farm_id}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Filter strip */}
        <div className="shrink-0 flex items-center gap-2 flex-wrap px-5 py-2 border-b border-gray-100 bg-gray-50/60">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mr-1">Layers</span>
          {filterPills.map(pill => {
            const active = visibleLayers.has(pill.key);
            return (
              <button
                key={pill.key}
                type="button"
                onClick={() => toggleLayer(pill.key)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all"
                style={{
                  borderColor:     active ? pill.color : '#d1d5db',
                  backgroundColor: active ? pill.color + '22' : 'transparent',
                  color:           active ? pill.color : '#9ca3af',
                }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: active ? pill.color : '#d1d5db' }} />
                {pill.label}
              </button>
            );
          })}
        </div>

        {/* Body: map + summary sheet */}
        <div className="flex flex-1 min-h-0">

          {/* ── Map (left, ~60%) ── */}
          <div className="flex-1 relative min-h-0 min-w-0">
            <FarmExpandMap landCoords={coords} plots={plots} mappings={mappings} visibleLayers={visibleLayers} />
          </div>

          {/* ── Summary Sheet (right, fixed 340px) ── */}
          <div className="w-[340px] shrink-0 border-l border-gray-100 flex flex-col bg-gray-50/40 min-h-0">

            {/* Stats row */}
            <div className="shrink-0 px-4 py-3 border-b border-gray-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Plot Summary</span>
                <span className="text-[11px] font-semibold text-gray-600">{plots.length} plots · {totalArea.toFixed(2)} ac</span>
              </div>

              {/* Crop breakdown chips */}
              {cropKeys.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {cropKeys.map(k => {
                    const color = CROP_COLORS[k] ?? '#6b7280';
                    const active = sheetCropFilter === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setSheetCropFilter(active ? null : k)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all"
                        style={{
                          borderColor:     active ? color : color + '55',
                          backgroundColor: active ? color : color + '18',
                          color:           active ? '#fff' : color,
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: active ? '#fff' : color }} />
                        <span className="capitalize">{k}</span>
                        <span className="opacity-80">· {cropBreakdown[k].count} · {cropBreakdown[k].area} ac</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search plot…"
                  value={sheetSearch}
                  onChange={e => setSheetSearch(e.target.value)}
                  className="w-full pl-7 pr-3 py-1.5 text-[11px] rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
              </div>
            </div>

            {/* Plot list */}
            <div className="flex-1 overflow-y-auto">
              {filteredPlots.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-1">
                  <MapPin className="w-6 h-6 opacity-30" />
                  <p className="text-xs">No plots match</p>
                </div>
              ) : (
                <table className="w-full text-[11px] border-collapse">
                  <thead className="sticky top-0 z-10 bg-gray-100/80 backdrop-blur-sm">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500 w-[44%]">Plot</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-500 w-[22%]">Area</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500 w-[34%]">Crop</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlots.map((plot, i) => {
                      const c = cropPlotColor(plot.crop_type, PLOT_COLORS[i % PLOT_COLORS.length]);
                      return (
                        <tr key={plot.plot_id ?? i} className="border-b border-gray-100 hover:bg-white transition-colors">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: c }} />
                              <span className="font-semibold text-gray-800 truncate">{plot.plot_name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-gray-600">{plot.plot_area} ac</td>
                          <td className="px-3 py-2">
                            {plot.crop_type ? (
                              <span
                                className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold capitalize text-white"
                                style={{ background: CROP_COLORS[plot.crop_type] ?? '#6b7280' }}
                              >
                                {plot.crop_type}
                              </span>
                            ) : (
                              <span className="text-gray-300 italic">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer count */}
            <div className="shrink-0 px-4 py-2 border-t border-gray-100 text-center">
              <p className="text-[10px] text-gray-400">
                Showing {filteredPlots.length} of {plots.length} plots
              </p>
            </div>
          </div>
        </div>

        {/* Mapping features legend (only shown when mappings exist) */}
        {mappings.length > 0 && (
          <div className="shrink-0 border-t border-gray-100 px-5 py-2.5 bg-gray-50 rounded-b-2xl flex flex-wrap gap-x-5 gap-y-1.5 items-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Features</span>
            {mappings.map((m, i) => {
              const color = getMappingColor(m.mapping_type);
              const shape = m.shape_details === 'point' ? 'rounded-full' : m.shape_details === 'polygon' ? 'rounded-sm' : 'rounded-full';
              const size  = m.shape_details === 'line' ? 'w-4 h-1' : 'w-3 h-3';
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <span className={`${size} ${shape} shrink-0`} style={{ background: color }} />
                  <span className="text-xs font-semibold text-gray-800">{m.mapping_name}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default FarmDirectory;
