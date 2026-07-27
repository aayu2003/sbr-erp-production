import { Fragment, useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, MapPin, Map as MapIcon, Sprout, Wheat, Leaf,
  LayoutGrid, Layers,
  RefreshCw, Video, Crosshair,
  TrendingUp, BookOpen, X, Filter, ChevronDown, ChevronLeft, ChevronRight, Ruler, IndianRupee, Settings, Eye,
  Droplets, Zap, Activity, Clock, Check,
} from 'lucide-react';
import { MapContainer, TileLayer, Polygon, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { toast } from 'sonner';
import getBaseUrl from '@/lib/config';
import PlotMarkingModal from '@/components/farm/PlotMarkingModal';
import { FarmActivityEntry } from '@/components/farm/FarmActivityModal';
import PremiumPlotterModal from '@/components/farm/PremiumPlotterModal';
import { loadGlobalMapColors, saveGlobalMapColors } from '@/lib/mapColorSettings';

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
  details?:            Record<string, unknown>;
  point_details?:      Record<string, unknown>;
  [key: string]:       unknown;
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
const MAP_COLOR_PALETTE = [
  '#fde047', '#facc15', '#f97316', '#ef4444', '#e11d48',
  '#800000', '#db2777', '#9333ea', '#4f46e5', '#2563eb',
  '#0891b2', '#06b6d4', '#14b8a6', '#22c55e', '#84cc16',
];

const ViewportPortal = ({ children }: { children: React.ReactNode }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
};

const CROP_COLORS: Record<string, string> = {
  rahar:  'var(--crop-rahar-color, #800000)',
  paddy:  'var(--crop-paddy-color, #22c55e)',
  napier: 'var(--crop-napier-color, #22c55e)',
};
const DEFAULT_DIRECTORY_CROP_COLORS: Record<string, string> = {
  rahar: '#800000',
  paddy: '#22c55e',
  napier: '#2563eb',
};
const cropPlotColor = (
  cropType: string | undefined,
  fallback: string,
  cropColors: Record<string, string> = CROP_COLORS,
) => cropType ? (cropColors[cropType.toLowerCase()] ?? fallback) : fallback;

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
  showPlots = false,
  landBoundaryColor = '#fde047',
  cropColors = CROP_COLORS,
}: {
  landCoords: [number, number][];
  plots?: LandPlot[];
  mappings?: AdditionalMapping[];
  showPlots?: boolean;
  landBoundaryColor?: string;
  cropColors?: Record<string, string>;
}) => {
  const hasPlots = showPlots && (plots?.length ?? 0) > 0;
  const parsedMappings = mappings.map(m => ({ ...m, coords: parseCoords(m.mapping_coordinates) }));

  const allCoords: [number, number][] = [
    ...landCoords,
    ...(hasPlots ? (plots ?? []).flatMap(p => p.plot_coordinates) : []),
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
          pathOptions={{
            color: landBoundaryColor,
            fillColor: landBoundaryColor === '#fde047' ? '#fef9c3' : landBoundaryColor,
            fillOpacity: 0.28,
            weight: 3,
          }}
        />
      )}
      {/* Plot polygons */}
      {hasPlots && plots!.map((plot, i) => {
        const c = cropPlotColor(plot.crop_type, PLOT_COLORS[i % PLOT_COLORS.length], cropColors);
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
  useLandOwnerBoundaryStyle = false,
}: {
  landCoords: [number, number][];
  plots?: LandPlot[];
  mappings?: AdditionalMapping[];
  visibleLayers: Set<string>;
  useLandOwnerBoundaryStyle?: boolean;
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
          pathOptions={{ color: 'var(--land-boundary-color, #fde047)', fillColor: 'var(--land-boundary-fill, #fef9c3)', fillOpacity: 0.28, weight: 3 }}
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
const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
};

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
const FarmDirectory = () => {
  const [farms, setFarms]     = useState<Farm[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [stateFilter, setStateFilter] = useState('all');
  const [cropFilter, setCropFilter] = useState('all');
  const [farmingFilter, setFarmingFilter] = useState('all');
  const [farmerNames, setFarmerNames] = useState<Record<string, string>>({});
  const [farmerIds, setFarmerIds] = useState<Record<string, string>>({});
  const [plotMarkingFarm, setPlotMarkingFarm]     = useState<Farm | null>(null);
  const [ledgerFarm, setLedgerFarm]               = useState<Farm | null>(null);
  const [expandMapFarm, setExpandMapFarm]         = useState<Farm | null>(null);
  const [plotterFarm, setPlotterFarm]             = useState<Farm | null>(null);
  const [cropSelectorFarm, setCropSelectorFarm]   = useState<Farm | null>(null);
  const [landConfigurationFarm, setLandConfigurationFarm] = useState<Farm | null>(null);
  const [landConfigurationTab, setLandConfigurationTab] = useState<
    'details' | 'crop' | 'marking' | 'plotter' | 'history' | 'ledger'
  >('details');
  const [configurationPlotsVisible, setConfigurationPlotsVisible] = useState(false);
  const [cardPlotViews, setCardPlotViews] = useState<Record<string, boolean>>({});
  const [mapColorSettingsOpen, setMapColorSettingsOpen] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<{ images: string[]; index: number } | null>(null);
  const [landDirectoryMapColors, setLandDirectoryMapColors] = useState<{
    land: string;
    crops: Record<string, string>;
  }>(() => loadGlobalMapColors());
  const [cropSelectorSaveState, setCropSelectorSaveState] = useState({ disabled: true, saving: false });
  const [configurationStaff, setConfigurationStaff] = useState<{
    supervisorName: string;
    supervisorContact: string;
    fieldManagers: Array<{ name: string; contact: string }>;
  }>({ supervisorName: '', supervisorContact: '', fieldManagers: [] });

  const openMediaViewer = (mediaImages: string[], index: number) => {
    const validImages = mediaImages.filter(Boolean);
    if (validImages.length === 0) return;
    setMediaViewer({
      images: validImages,
      index: Math.min(Math.max(index, 0), validImages.length - 1),
    });
  };

  useEffect(() => {
    if (!mediaViewer) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMediaViewer(null);
      } else if (event.key === 'ArrowLeft') {
        setMediaViewer(current => current ? ({
          ...current,
          index: (current.index - 1 + current.images.length) % current.images.length,
        }) : null);
      } else if (event.key === 'ArrowRight') {
        setMediaViewer(current => current ? ({
          ...current,
          index: (current.index + 1) % current.images.length,
        }) : null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mediaViewer]);

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

  useEffect(() => {
    saveGlobalMapColors(landDirectoryMapColors);
  }, [landDirectoryMapColors]);

  // After farms are loaded, batch-fetch owner names individually so they fill in progressively
  useEffect(() => {
    if (farms.length === 0) return;
    farms.forEach(farm => {
      fetch(`${BASE_URL}/farmer_managment/get_farmer_details_from_farm_id/${farm.farm_id}`)
        .then(r => r.json())
        .then((data: any) => {
          const name = data?.farmer?.farmer_name;
          const farmerId =
            data?.farmer?.farmer_id ??
            data?.farmer_details?.farmer_id ??
            data?.farmer?.id ??
            data?.farmer_id ??
            '';
          setFarmerNames(prev => ({ ...prev, [farm.farm_id]: name || '' }));
          setFarmerIds(prev => ({ ...prev, [farm.farm_id]: String(farmerId || '') }));
        })
        .catch(() => {
          setFarmerNames(prev => ({ ...prev, [farm.farm_id]: '' }));
          setFarmerIds(prev => ({ ...prev, [farm.farm_id]: '' }));
        });
    });
  }, [farms]);

  useEffect(() => {
    const farmId = landConfigurationFarm?.farm_id;
    if (!farmId) {
      setConfigurationStaff({ supervisorName: '', supervisorContact: '', fieldManagers: [] });
      return;
    }
    setConfigurationStaff({ supervisorName: '', supervisorContact: '', fieldManagers: [] });
    fetch(`${BASE_URL}/farmer_managment/get_assigned_supervisor_and_field_manager/${farmId}`)
      .then(response => response.ok ? response.json() : Promise.reject(response.status))
      .then((data: any) => {
        const supervisor = data?.assigned_supervisor ?? data?.supervisor ?? {};
        const managersSource = data?.assigned_field_manager ?? data?.field_manager ?? [];
        const managers = Array.isArray(managersSource) ? managersSource : managersSource ? [managersSource] : [];
        setConfigurationStaff({
          supervisorName: String(supervisor?.supervisor_name ?? supervisor?.name ?? ''),
          supervisorContact: String(
            supervisor?.suervisor_contact ?? supervisor?.supervisor_contact ?? supervisor?.contact ?? ''
          ),
          fieldManagers: managers.map((manager: any) => ({
            name: String(manager?.name ?? manager?.staff_name ?? ''),
            contact: String(manager?.contact ?? manager?.staff_contact ?? ''),
          })).filter((manager: { name: string }) => manager.name),
        });
      })
      .catch(() => {
        setConfigurationStaff({ supervisorName: '', supervisorContact: '', fieldManagers: [] });
      });
  }, [landConfigurationFarm?.farm_id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return farms.filter(f => {
      const matchesSearch = !q || [
        f.farm_id,
        farmerIds[f.farm_id] || f.farmer_id,
        farmerNames[f.farm_id],
        f.land_data?.village,
        f.land_data?.district,
        f.land_data?.state,
        f.crop_type,
        f.land_data?.farming_option,
      ].some(value => String(value ?? '').toLowerCase().includes(q));
      const matchesState = stateFilter === 'all' || f.land_data?.state === stateFilter;
      const matchesCrop = cropFilter === 'all' || (f.crop_type ?? '').toLowerCase() === cropFilter;
      const matchesFarming = farmingFilter === 'all' || f.land_data?.farming_option === farmingFilter;
      return matchesSearch && matchesState && matchesCrop && matchesFarming;
    });
  }, [cropFilter, farmingFilter, farmerIds, farms, farmerNames, search, stateFilter]);
  const filterStates = Array.from(new Set(farms.map(farm => farm.land_data?.state).filter(Boolean) as string[])).sort();
  const filterCrops = Array.from(new Set(farms.map(farm => (farm.crop_type ?? '').toLowerCase()).filter(Boolean))).sort();
  const filterFarmingOptions = Array.from(new Set(farms.map(farm => farm.land_data?.farming_option).filter(Boolean) as string[])).sort();
  const directoryCropKeys = Array.from(new Set(
    farms.flatMap(farm => [
      farm.crop_type,
      ...(farm.land_plots ?? []).map(plot => plot.crop_type),
    ])
      .map(crop => String(crop ?? '').trim().toLowerCase())
      .filter(Boolean)
  )).sort();
  const directoryCropColors = directoryCropKeys.reduce<Record<string, string>>((colors, crop, index) => {
    colors[crop] = landDirectoryMapColors.crops[crop]
      ?? DEFAULT_DIRECTORY_CROP_COLORS[crop]
      ?? PLOT_COLORS[index % PLOT_COLORS.length];
    return colors;
  }, {});
  const activeFilterCount = [stateFilter !== 'all', cropFilter !== 'all', farmingFilter !== 'all'].filter(Boolean).length;

  // KPIs
  const totalArea      = farms.reduce((s, f) => s + (f.area ?? 0), 0);
  const totalInvestment = farms.reduce((s, f) =>
    s + (f.farm_investment_ledger ?? []).reduce((si, e) => si + (e.amount ?? 0), 0), 0);
  const averageInvestmentPerAcre = totalArea > 0 ? totalInvestment / totalArea : 0;
  const cropWiseArea = Object.entries(farms.reduce<Record<string, number>>((summary, farm) => {
    const plots = farm.land_plots ?? [];
    if (plots.length > 0) {
      plots.forEach(plot => {
        const crop = String(plot.crop_type || 'Unassigned').trim() || 'Unassigned';
        summary[crop] = (summary[crop] ?? 0) + Number(plot.plot_area ?? 0);
      });
    } else {
      const crop = String(farm.crop_type || 'Unassigned').trim() || 'Unassigned';
      summary[crop] = (summary[crop] ?? 0) + Number(farm.area ?? 0);
    }
    return summary;
  }, {}))
    .map(([crop, area]) => ({ crop, area }))
    .sort((first, second) => second.area - first.area);
  const assignedCropArea = cropWiseArea
    .filter(item => item.crop.trim().toLowerCase() !== 'unassigned')
    .reduce((sum, item) => sum + item.area, 0);

  const kpis: Array<{
    label: string;
    value: string | number;
    icon: React.ComponentType<{ className?: string }>;
    details?: Array<{ label: string; value: string; color?: string }>;
  }> = [
    { label: 'Total Lands', value: farms.length, icon: LayoutGrid },
    { label: 'Total Area', value: `${totalArea.toLocaleString('en-IN', { maximumFractionDigits: 3 })} acres`, icon: Ruler },
    {
      label: 'Crop Wise Area',
      value: `${assignedCropArea.toLocaleString('en-IN', { maximumFractionDigits: 3 })} acres`,
      icon: Wheat,
      details: cropWiseArea.map(item => ({
        label: item.crop.charAt(0).toUpperCase() + item.crop.slice(1),
        value: `${item.area.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ac`,
        color: item.crop.trim().toLowerCase() === 'unassigned'
          ? '#94a3b8'
          : directoryCropColors[item.crop.trim().toLowerCase()] ?? '#0D3A35',
      })),
    },
    { label: 'Total Investment', value: `₹${totalInvestment.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, icon: IndianRupee },
    {
      label: 'Average Investment/Acre',
      value: `₹${averageInvestmentPerAcre.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
      icon: TrendingUp,
    },
  ];

  return (
    <div className="min-h-screen space-y-8 bg-[#fbfcfd] p-4 text-slate-900 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-emerald-700">Land Records</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Land Directory</h1>
          <p className="mt-3 text-base font-medium text-slate-600">Manage and view all registered land parcels</p>
        </div>
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => setMapColorSettingsOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#0D3A35]/15 bg-white text-[#0D3A35] shadow-sm transition hover:bg-[#0D3A35]/5"
            title="Map colour settings"
            aria-label="Open map colour settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {kpis.map(kpi => (
          <div key={kpi.label} className="h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-500">{kpi.label}</p>
                <p className="mt-3 break-words text-2xl font-bold text-slate-950">{kpi.value}</p>
                {kpi.details && (
                  <div className="mt-3 max-h-28 space-y-1.5 overflow-y-auto pr-1">
                    {kpi.details.map(detail => (
                      <div key={detail.label} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 text-[11px]">
                        <span className="flex min-w-0 items-center gap-2 truncate font-semibold capitalize text-slate-600">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
                            style={{ backgroundColor: detail.color ?? '#0D3A35' }}
                          />
                          <span className="truncate">{detail.label}</span>
                        </span>
                        <span className="shrink-0 font-bold text-[#0D3A35]">{detail.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0D3A35]/10 text-[#0D3A35] ring-2 ring-[#0D3A35]/10">
                <kpi.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-md flex-1">
            <Search className="absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by land ID, owner, location, or crop..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-12 rounded-lg border-slate-200 bg-white pl-11 text-sm font-semibold shadow-sm focus-visible:ring-emerald-100"
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen(open => !open)}
            className={`inline-flex h-12 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold shadow-sm transition ${
              filtersOpen || activeFilterCount > 0
                ? 'border-[#0D3A35] bg-[#0D3A35] text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Filter className="h-4 w-4" />
            Filter
            {activeFilterCount > 0 && <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-[#0D3A35]">{activeFilterCount}</span>}
            <ChevronDown className={`h-4 w-4 transition ${filtersOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {filtersOpen && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_rgba(15,23,42,0.06)]">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-slate-600">State</p>
                <Select value={stateFilter} onValueChange={setStateFilter}>
                  <SelectTrigger><span>{stateFilter === 'all' ? 'All states' : stateFilter}</span></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All states</SelectItem>
                    {filterStates.map(state => <SelectItem key={state} value={state}>{state}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-slate-600">Crop</p>
                <Select value={cropFilter} onValueChange={setCropFilter}>
                  <SelectTrigger><span className="capitalize">{cropFilter === 'all' ? 'All crops' : cropFilter}</span></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All crops</SelectItem>
                    {filterCrops.map(crop => <SelectItem key={crop} value={crop}><span className="capitalize">{crop}</span></SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-slate-600">Farming Type</p>
                <Select value={farmingFilter} onValueChange={setFarmingFilter}>
                  <SelectTrigger><span>{farmingFilter === 'all' ? 'All farming types' : farmingFilter}</span></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All farming types</SelectItem>
                    {filterFarmingOptions.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <p className="text-xs font-semibold text-slate-500">Showing {filtered.length} of {farms.length} land parcels</p>
              <Button
                variant="outline"
                className="h-9 border-slate-200 text-xs font-bold"
                disabled={activeFilterCount === 0}
                onClick={() => {
                  setStateFilter('all');
                  setCropFilter('all');
                  setFarmingFilter('all');
                }}
              >
                Clear filters
              </Button>
            </div>
          </div>
        )}
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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,360px),1fr))] items-stretch gap-6">
          {filtered.map(farm => {
            const ld           = farm.land_data;
            const coords       = ld.land_coordinates ?? [];
            const images       = ld.land_media?.images ?? [];
            const cardImages   = images.filter(Boolean).slice(0, 3);
            const video        = ld.land_media?.video ?? '';
            const location     = [ld.village, ld.district, ld.state].filter(Boolean).join(', ');
            const cropAreas = (farm.land_plots ?? []).reduce((areas, plot) => {
              const cropName = String(plot.crop_type ?? '').trim().toLowerCase();
              if (!cropName) return areas;
              areas.set(cropName, (areas.get(cropName) ?? 0) + (Number(plot.plot_area) || 0));
              return areas;
            }, new Map<string, number>());
            const plotCropSummaries = Array.from(cropAreas.entries())
              .sort(([firstCrop], [secondCrop]) => firstCrop.localeCompare(secondCrop))
              .map(([cropName, area]) => ({
                name: cropName.replace(/\b\w/g, character => character.toUpperCase()),
                area: area.toLocaleString('en-IN', { maximumFractionDigits: 3 }),
              }));

            return (
              <div
                key={farm.farm_id}
                className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_52px_rgba(15,23,42,0.10)]"
              >
                {/* ── Header: Leaflet satellite map ── */}
                <div className="relative h-[220px] w-full overflow-hidden border-b border-slate-100">
                  <FarmMiniMap
                    landCoords={coords}
                    plots={farm.land_plots}
                    mappings={farm.additional_mappings}
                    showPlots={cardPlotViews[farm.farm_id] !== false}
                    landBoundaryColor={landDirectoryMapColors.land}
                    cropColors={directoryCropColors}
                  />

                  {(farm.land_plots?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => setCardPlotViews(previous => ({
                        ...previous,
                        [farm.farm_id]: previous[farm.farm_id] === false,
                      }))}
                      className="absolute bottom-3 left-3 z-[1000] flex items-center gap-1.5 rounded-md bg-white/95 px-2.5 py-1.5 text-[10px] font-bold text-[#0D3A35] shadow-sm ring-1 ring-[#0D3A35]/10 transition hover:bg-white"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Plot View · {cardPlotViews[farm.farm_id] !== false ? 'On' : 'Off'}
                    </button>
                  )}
                </div>

                {/* ── Card body ── */}
                <div className="flex flex-1 flex-col gap-4 p-5">

                  <div>
                    {/* Parcel details */}
                    <div className="mt-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <table className="w-full table-fixed border-collapse text-left">
                        <tbody className="divide-y divide-slate-100">
                          <tr className="align-top">
                            <th className="w-[35%] bg-slate-50/80 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Land Parcel ID</th>
                            <td className="break-all px-3 py-2.5 text-xs font-bold text-emerald-600">{farm.farm_id}</td>
                          </tr>
                          <tr className="align-top">
                            <th className="bg-slate-50/80 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Land Owner</th>
                            <td className="break-words px-3 py-2.5 text-xs font-bold text-slate-700">
                              {farm.farm_id in farmerNames
                                ? farmerNames[farm.farm_id] || 'Unknown owner'
                                : <span className="inline-block h-3 w-24 animate-pulse rounded bg-slate-200" />}
                            </td>
                          </tr>
                          <tr className="align-top">
                            <th className="bg-slate-50/80 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Address</th>
                            <td className="break-words px-3 py-2.5 text-xs font-bold leading-relaxed text-slate-700">{location || 'N/A'}</td>
                          </tr>
                          <tr className="align-top">
                            <th className="bg-slate-50/80 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Block ID</th>
                            <td className="break-all px-3 py-2.5 text-xs font-bold text-slate-700">{farm.block_id || 'N/A'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Area, plot, and crop summary */}
                    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <table className="w-full table-fixed border-collapse text-center">
                        <tbody className="divide-y divide-slate-100">
                          <tr className="align-top">
                            <td colSpan={2} className="p-0">
                              <div className="grid grid-cols-2 divide-x divide-slate-100">
                                <div className="px-3 py-2.5 text-center">
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Total Area</p>
                                  <p className="mt-1 text-xs font-bold text-slate-700">
                                    {(farm.area ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })} acres
                                  </p>
                                </div>
                                <div className="px-3 py-2.5 text-center">
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">No. of Plots</p>
                                  <p className="mt-1 text-xs font-bold text-slate-700">{farm.land_plots?.length ?? 0}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                          <tr className="align-top">
                            <td colSpan={2} className="p-0">
                              {plotCropSummaries.length > 0 ? (
                                <div
                                  className="grid divide-x divide-slate-100 text-center"
                                  style={{ gridTemplateColumns: `repeat(${plotCropSummaries.length}, minmax(0, 1fr))` }}
                                >
                                  {plotCropSummaries.map(cropSummary => (
                                    <div key={cropSummary.name} className="min-w-0 px-3 py-2.5 text-center">
                                      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">{cropSummary.name}</p>
                                      <p className="mt-1 break-words text-xs font-bold text-slate-700">{cropSummary.area} acres</p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="px-3 py-2.5 text-center">
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Crop</p>
                                  <p className="mt-1 text-xs font-bold text-slate-700">Not assigned</p>
                                </div>
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

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
                          {cardImages[idx] ? (
                            <img
                              src={cardImages[idx]}
                              alt={`Farm ${idx + 1}`}
                              className="h-full w-full cursor-pointer object-cover transition duration-200 hover:scale-105"
                              onClick={() => openMediaViewer(cardImages, idx)}
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

                  <button
                    type="button"
                    onClick={() => {
                      setLandConfigurationTab('details');
                      setConfigurationPlotsVisible(false);
                      setCropSelectorSaveState({ disabled: true, saving: false });
                      setLandConfigurationFarm(farm);
                    }}
                    className="mt-auto flex h-11 min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-[#0D3A35] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#092b27]"
                  >
                    <Settings className="h-4 w-4" />
                    View Land Details
                  </button>

                </div>
              </div>
            );
          })}
        </div>
      )}

      {mediaViewer && (
        <ViewportPortal>
          <div
            className="fixed inset-0 z-[11000] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm"
            onMouseDown={event => {
              if (event.currentTarget === event.target) setMediaViewer(null);
            }}
          >
          <div className="relative flex h-full w-full max-w-7xl items-center justify-center">
            <button
              type="button"
              onClick={() => setMediaViewer(null)}
              className="absolute right-0 top-0 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              aria-label="Close image viewer"
            >
              <X className="h-5 w-5" />
            </button>

            {mediaViewer.images.length > 1 && (
              <button
                type="button"
                onClick={() => setMediaViewer(current => current ? ({
                  ...current,
                  index: (current.index - 1 + current.images.length) % current.images.length,
                }) : null)}
                className="absolute left-0 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:left-3"
                aria-label="View previous image"
              >
                <ChevronLeft className="h-7 w-7" />
              </button>
            )}

            <img
              src={mediaViewer.images[mediaViewer.index]}
              alt={`Land media ${mediaViewer.index + 1}`}
              className="max-h-[88vh] max-w-[calc(100%_-_5rem)] rounded-xl object-contain shadow-2xl"
            />

            {mediaViewer.images.length > 1 && (
              <button
                type="button"
                onClick={() => setMediaViewer(current => current ? ({
                  ...current,
                  index: (current.index + 1) % current.images.length,
                }) : null)}
                className="absolute right-0 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:right-3"
                aria-label="View next image"
              >
                <ChevronRight className="h-7 w-7" />
              </button>
            )}

            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1.5 text-xs font-bold text-white">
              {mediaViewer.index + 1} / {mediaViewer.images.length}
            </div>
            </div>
          </div>
        </ViewportPortal>
      )}

      {mapColorSettingsOpen && (
        <ViewportPortal>
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]"
            onMouseDown={event => {
              if (event.currentTarget === event.target) setMapColorSettingsOpen(false);
            }}
          >
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Map Colour Settings</h2>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Choose colours for the land mapping and crop plots
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMapColorSettingsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
                aria-label="Close colour settings"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/60 p-5">
              {[
                {
                  key: 'land',
                  label: 'Land Mapping',
                  value: landDirectoryMapColors.land,
                  onSelect: (color: string) => setLandDirectoryMapColors(previous => ({ ...previous, land: color })),
                },
                ...directoryCropKeys.map(crop => ({
                  key: `crop-${crop}`,
                  label: `${crop.charAt(0).toUpperCase()}${crop.slice(1)} Plots`,
                  value: directoryCropColors[crop],
                  onSelect: (color: string) => setLandDirectoryMapColors(previous => ({
                    ...previous,
                    crops: { ...previous.crops, [crop]: color },
                  })),
                })),
              ].map(option => (
                <section key={option.key} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-slate-800">{option.label}</p>
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Selected
                      <span
                        className="h-6 w-6 rounded-full border-2 border-white shadow ring-1 ring-slate-200"
                        style={{ backgroundColor: option.value }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
                    {MAP_COLOR_PALETTE.map((color, colorIndex) => {
                      const selected = option.value.toLowerCase() === color.toLowerCase();
                      return (
                        <button
                          key={`${option.key}-${color}`}
                          type="button"
                          onClick={() => option.onSelect(color)}
                          className={`relative h-9 rounded-lg border-2 transition hover:scale-105 ${
                            selected ? 'border-slate-900 shadow-sm' : 'border-white ring-1 ring-slate-200'
                          }`}
                          style={{ backgroundColor: color }}
                          title={`Colour ${colorIndex + 1}: ${color}`}
                          aria-label={`Set ${option.label} colour to ${color}`}
                        >
                          {selected && (
                            <Check className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5 py-3">
              <button
                type="button"
                onClick={() => setLandDirectoryMapColors({ land: '#fde047', crops: {} })}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
              >
                Reset Colours
              </button>
              <button
                type="button"
                onClick={() => setMapColorSettingsOpen(false)}
                className="rounded-lg bg-[#0D3A35] px-5 py-2 text-xs font-bold text-white transition hover:bg-[#092b27]"
              >
                Done
              </button>
            </div>
            </div>
          </div>
        </ViewportPortal>
      )}

      {/* Land Details Modal */}
      {landConfigurationFarm && (
        <ViewportPortal>
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) setLandConfigurationFarm(null);
            }}
          >
          <div className="flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-[#0D3A35] bg-[#0D3A35] px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-white">Land Details</h2>
                <p className="mt-1 text-xs font-semibold text-white/70">{landConfigurationFarm.farm_id}</p>
              </div>
              <button
                type="button"
                onClick={() => setLandConfigurationFarm(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label="Close land details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex shrink-0 items-end gap-8 overflow-x-auto border-b border-slate-200 px-6">
              {([
                { key: 'details', label: 'Land Parcel Details' },
                { key: 'crop', label: 'Crop Selector' },
                { key: 'marking', label: 'Plot Marking' },
                { key: 'plotter', label: 'Plotter' },
                { key: 'history', label: 'Land History' },
                { key: 'ledger', label: 'Investment Ledger' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setLandConfigurationTab(tab.key)}
                  className={`shrink-0 border-b-2 px-0 pb-3 pt-4 text-sm font-bold transition ${
                    landConfigurationTab === tab.key
                      ? 'border-[#0D3A35] text-slate-950'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              {landConfigurationTab === 'crop' && (
                <button
                  type="submit"
                  form={`land-config-crop-form-${landConfigurationFarm.farm_id}`}
                  disabled={cropSelectorSaveState.disabled || cropSelectorSaveState.saving}
                  className="mb-2 ml-auto inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-[#0D3A35] px-5 text-xs font-bold text-white shadow-sm transition hover:bg-[#092b27] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {cropSelectorSaveState.saving ? 'Saving…' : 'Save'}
                </button>
              )}
            </div>
            {landConfigurationTab === 'details' && (() => {
              const farm = landConfigurationFarm;
              const rawFarm = farm as Farm & Record<string, any>;
              const landData = farm.land_data;
              const plots = farm.land_plots ?? [];
              const sortedPlots = [...plots].sort((firstPlot, secondPlot) =>
                String(firstPlot.plot_name ?? '').localeCompare(
                  String(secondPlot.plot_name ?? ''),
                  undefined,
                  { numeric: true, sensitivity: 'base' },
                )
              );
              const mappings = farm.additional_mappings ?? [];
              const images = landData?.land_media?.images ?? [];
              const video = landData?.land_media?.video ?? '';
              const location = [landData?.village, landData?.district, landData?.state].filter(Boolean).join(', ');
              const formatInfrastructureValue = (value: unknown) => {
                if (typeof value === 'boolean') return value ? 'Yes' : 'No';
                if (value == null || String(value).trim() === '') return 'N/A';
                return String(value);
              };
              const readInfrastructureValue = (
                sources: Array<Record<string, any> | undefined>,
                keys: string[],
              ) => {
                for (const source of sources) {
                  if (!source) continue;
                  for (const key of keys) {
                    if (source[key] != null && String(source[key]).trim() !== '') {
                      return formatInfrastructureValue(source[key]);
                    }
                  }
                }
                return 'N/A';
              };
              const infrastructureFieldSets: Record<string, Array<{ label: string; keys: string[] }>> = {
                Borewell: [
                  { label: 'Borewell Depth', keys: ['borewell_depth', 'depth', 'depth_ft'] },
                  { label: 'Borewell Diameter', keys: ['borewell_diameter', 'diameter', 'diameter_inch'] },
                  { label: 'Pump Make', keys: ['pump_make', 'pump_manufacturer', 'make'] },
                  { label: 'Pump HP', keys: ['pump_hp', 'pump_capacity', 'motor_capacity', 'hp'] },
                ],
                'Electricity Connection': [
                  { label: 'Connection', keys: ['connection', 'connection_status', 'status', 'available'] },
                  { label: 'Consumer No.', keys: ['consumer_no', 'consumer_number'] },
                  { label: 'Meter No.', keys: ['meter_no', 'meter_number'] },
                  { label: 'Connected Load', keys: ['connected_load', 'load'] },
                ],
                Transformer: [
                  { label: 'Transformer No.', keys: ['transformer_no', 'transformer_number', 'number'] },
                  { label: 'Capacity', keys: ['capacity', 'capacity_kva', 'kva'] },
                  { label: 'Make', keys: ['make', 'manufacturer'] },
                  { label: 'Phase', keys: ['phase', 'phase_details'] },
                ],
                Poles: [
                  { label: 'Pole No.', keys: ['pole_no', 'pole_number', 'number'] },
                  { label: 'Pole Type', keys: ['pole_type', 'type'] },
                  { label: 'Height', keys: ['height', 'height_ft'] },
                  { label: 'Condition', keys: ['condition', 'status'] },
                ],
                'Electric Fencing Setup': [
                  { label: 'Setup ID', keys: ['setup_id', 'fence_id', 'id'] },
                  { label: 'Fence Length', keys: ['fence_length', 'length'] },
                  { label: 'Energizer Make', keys: ['energizer_make', 'make'] },
                  { label: 'Power Source', keys: ['power_source', 'source'] },
                ],
                House: [
                  { label: 'House No. / Name', keys: ['house_no', 'house_name', 'number', 'name'] },
                  { label: 'Built-up Area', keys: ['built_up_area', 'area'] },
                  { label: 'Usage', keys: ['usage', 'use'] },
                  { label: 'Occupancy', keys: ['occupancy', 'occupants'] },
                ],
                Shed: [
                  { label: 'Shed No. / Name', keys: ['shed_no', 'shed_name', 'number', 'name'] },
                  { label: 'Shed Type', keys: ['shed_type', 'type'] },
                  { label: 'Covered Area', keys: ['covered_area', 'area'] },
                  { label: 'Capacity', keys: ['capacity'] },
                ],
                Other: [
                  { label: 'Reference No.', keys: ['reference_no', 'reference_number', 'id'] },
                  { label: 'Description', keys: ['description', 'details'] },
                  { label: 'Condition', keys: ['condition', 'status'] },
                  { label: 'Remarks', keys: ['remarks', 'notes'] },
                ],
              };
              const getInfrastructureType = (mapping: AdditionalMapping) => {
                const key = `${mapping.mapping_type ?? ''} ${mapping.mapping_name ?? ''}`.toLowerCase();
                if (key.includes('bore')) return 'Borewell';
                if (key.includes('fenc')) return 'Electric Fencing Setup';
                if (key.includes('transform')) return 'Transformer';
                if (key.includes('pole')) return 'Poles';
                if (key.includes('electric') || key.includes('connection')) return 'Electricity Connection';
                if (key.includes('house')) return 'House';
                if (key.includes('shed')) return 'Shed';
                return 'Other';
              };
              const rawBorewellSource =
                rawFarm.borewells ??
                rawFarm.borewell_details ??
                rawFarm.bore_well_details ??
                rawFarm.borewell;
              const rawElectricitySource =
                rawFarm.electricity_connection_details ??
                rawFarm.electricity_connection ??
                rawFarm.electricity_details ??
                rawFarm.electricity;
              const infrastructureMappings = mappings.filter(mapping => mapping.shape_details === 'point');
              if (
                !infrastructureMappings.some(mapping => getInfrastructureType(mapping) === 'Borewell')
                && rawBorewellSource
              ) {
                const entries = Array.isArray(rawBorewellSource) ? rawBorewellSource : [rawBorewellSource];
                entries.forEach((entry: Record<string, unknown>, index: number) => {
                  infrastructureMappings.push({
                    mapping_name: String(entry?.borewell_name ?? entry?.name ?? `Borewell ${index + 1}`),
                    mapping_type: 'Borewell',
                    mapping_coordinates: [],
                    shape_details: 'point',
                    details: entry,
                  });
                });
              }
              if (
                !infrastructureMappings.some(mapping => getInfrastructureType(mapping) === 'Electricity Connection')
                && rawElectricitySource
              ) {
                infrastructureMappings.push({
                  mapping_name: 'Electricity Connection',
                  mapping_type: 'Electricity Connection',
                  mapping_coordinates: [],
                  shape_details: 'point',
                  details: rawElectricitySource,
                });
              }
              const infrastructureCards = infrastructureMappings.map((mapping, index) => {
                const type = getInfrastructureType(mapping);
                const mappingDetails = mapping.details ?? mapping.point_details ?? {};
                const categorySource = type === 'Borewell'
                  ? Array.isArray(rawBorewellSource) ? rawBorewellSource[index] : rawBorewellSource
                  : type === 'Electricity Connection' ? rawElectricitySource : undefined;
                const sources = [
                  mappingDetails as Record<string, any>,
                  mapping as Record<string, any>,
                  categorySource as Record<string, any> | undefined,
                  rawFarm,
                ];
                return {
                  id: `${mapping.mapping_name}-${index}`,
                  title: mapping.mapping_name || `${type} ${index + 1}`,
                  type,
                  items: (infrastructureFieldSets[type] ?? infrastructureFieldSets.Other).map(field => ({
                    label: field.label,
                    value: readInfrastructureValue(sources, field.keys),
                  })),
                };
              });
              const visibleLayers = new Set([
                'land',
                ...(configurationPlotsVisible ? ['plots'] : []),
                ...mappings.map(mapping => mapping.mapping_type.toLowerCase()),
              ]);
              const detailRows = [
                { label: 'Land Parcel ID', value: farm.farm_id, accent: true },
                { label: 'Land Owner', value: farmerNames[farm.farm_id] || 'Unknown owner' },
                { label: 'Land Owner ID', value: farmerIds[farm.farm_id] || farm.farmer_id || 'N/A' },
                { label: 'Block ID', value: farm.block_id || 'N/A' },
                { label: 'Farming Type', value: landData?.farming_option || 'N/A' },
                { label: 'Crop', value: farm.crop_type || 'Not assigned' },
                {
                  label: 'Total Area',
                  value: `${Number(farm.area ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })} acres`,
                },
                { label: 'Priority', value: farm.priority ? `P${farm.priority}` : 'Not assigned' },
                { label: 'Village', value: landData?.village || 'N/A' },
                { label: 'District', value: landData?.district || 'N/A' },
                { label: 'State', value: landData?.state || 'N/A' },
                { label: 'Complete Address', value: location || 'N/A' },
                { label: 'Plots', value: String(plots.length) },
                { label: 'Boundary Points', value: String(landData?.land_coordinates?.length ?? 0) },
                { label: 'Additional Mappings', value: String(mappings.length) },
                { label: 'Created On', value: fmtDate(farm.created_at) },
              ];
              const mapAndMediaPanel = (
                <div className="flex min-h-[480px] min-w-0 flex-col border-b border-slate-200 bg-white lg:h-full lg:min-h-0 lg:border-b-0">
                  <div className="min-h-[240px] basis-1/2 border-b border-slate-200 bg-slate-50 p-3">
                    <div className="relative h-full min-h-[240px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm">
                      <FarmExpandMap
                        landCoords={landData?.land_coordinates ?? []}
                        plots={plots}
                        mappings={mappings}
                        visibleLayers={visibleLayers}
                        useLandOwnerBoundaryStyle
                      />
                      {plots.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setConfigurationPlotsVisible(visible => !visible)}
                          className="absolute bottom-2.5 left-2.5 z-[1000] flex items-center gap-1.5 rounded-md bg-white/95 px-2.5 py-1.5 text-[10px] font-bold text-slate-700 shadow-sm transition hover:bg-white"
                          title={`${configurationPlotsVisible ? 'Hide' : 'Show'} plot boundaries`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Plot View · {configurationPlotsVisible ? 'On' : 'Off'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex min-h-[240px] basis-1/2 flex-col">
                    <div className="shrink-0 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Video className="h-3.5 w-3.5 text-emerald-700" />
                        <h3 className="text-xs font-bold text-slate-900">Land Media</h3>
                      </div>
                    </div>
                    <div className="grid min-h-0 flex-1 grid-rows-2 gap-2 p-3">
                      <div className="grid min-h-0 grid-cols-3 gap-2">
                        {[0, 1, 2].map(index => (
                          <div key={index} className="h-full min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                            {images[index] ? (
                              <img
                                src={images[index]}
                                alt={`Land ${index + 1}`}
                                className="h-full w-full cursor-pointer object-cover transition duration-200 hover:scale-105"
                                onClick={() => openMediaViewer(images, index)}
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-[9px] font-semibold text-slate-400">No image</div>
                            )}
                          </div>
                        ))}
                      </div>
                      {video ? (
                        <video src={video} controls className="h-full min-h-0 w-full rounded-lg bg-slate-950 object-cover" />
                      ) : (
                        <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-dashed border-slate-200 text-[10px] font-semibold text-slate-400">
                          No land video
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );

              return (
                <div className="grid min-h-0 flex-1 overflow-y-auto bg-[#fbfcfd] lg:grid-cols-2 lg:overflow-hidden">
                  {mapAndMediaPanel}
                  <div className="min-h-0 bg-[#fbfcfd] lg:overflow-y-auto lg:border-l lg:border-slate-200">
                    <div className="min-w-0 p-3">
                      <section className="h-full overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50">
                          <MapIcon className="h-3.5 w-3.5 text-emerald-700" />
                        </div>
                        <h3 className="text-xs font-bold text-slate-900">Land Parcel Details</h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[360px] table-fixed border-collapse text-left">
                          <tbody className="divide-y divide-slate-100">
                            {detailRows.map(detail => (
                              <tr key={detail.label} className="align-top">
                                <th className="w-[32%] bg-slate-50/80 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                                  {detail.label}
                                </th>
                                <td className={`w-[68%] break-words px-3 py-1.5 text-[11px] font-bold leading-4 ${
                                  'accent' in detail && detail.accent ? 'text-emerald-600' : 'text-slate-700'
                                }`}>
                                  {detail.value}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      </section>
                    </div>

                    <div className="space-y-2.5 px-3 pb-3">

                    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50">
                            <Layers className="h-3.5 w-3.5 text-emerald-700" />
                          </div>
                          <h3 className="text-xs font-bold text-slate-900">Plot Details</h3>
                        </div>
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
                          {plots.length} plot{plots.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="overflow-hidden">
                        <table className="w-full table-fixed text-left">
                          <thead>
                            <tr className="border-b border-slate-100">
                              <th className="w-[11%] px-2 py-1.5 text-center text-[8px] font-bold uppercase tracking-wide text-slate-500">Plot No.</th>
                              <th className="w-[37%] px-2 py-1.5 text-[8px] font-bold uppercase tracking-wide text-slate-500">Plot ID</th>
                              <th className="w-[18%] px-2 py-1.5 text-[8px] font-bold uppercase tracking-wide text-slate-500">Area</th>
                              <th className="w-[16%] px-2 py-1.5 text-[8px] font-bold uppercase tracking-wide text-slate-500">Crop</th>
                              <th className="w-[18%] px-2 py-1.5 text-[8px] font-bold uppercase tracking-wide text-slate-500">Points</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {sortedPlots.length > 0 ? sortedPlots.map((plot, index) => (
                              <tr key={plot.plot_id || `${farm.farm_id}-plot-${index}`}>
                                <td className="break-words px-2 py-1.5 text-center text-[10px] font-bold text-slate-700">{plot.plot_name || `Plot ${index + 1}`}</td>
                                <td className="break-all px-2 py-1.5 text-[10px] font-semibold leading-4 text-slate-600">{plot.plot_id || 'N/A'}</td>
                                <td className="break-words px-2 py-1.5 text-[10px] font-semibold text-slate-600">
                                  {Number(plot.plot_area ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })} acres
                                </td>
                                <td className="break-words px-2 py-1.5 text-[10px] font-semibold capitalize text-slate-600">{plot.crop_type || farm.crop_type || 'Not assigned'}</td>
                                <td className="px-2 py-1.5 text-[10px] font-semibold text-slate-600">{plot.plot_coordinates?.length ?? 0}</td>
                              </tr>
                            )) : (
                              <tr>
                                <td colSpan={5} className="px-4 py-5 text-center text-[11px] font-semibold text-slate-400">No plots configured</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50">
                            <MapPin className="h-3.5 w-3.5 text-emerald-700" />
                          </div>
                          <h3 className="text-xs font-bold text-slate-900">Infrastructure Details</h3>
                        </div>
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
                          {infrastructureCards.length} marked point{infrastructureCards.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      {infrastructureCards.length > 0 ? (
                        <div className="grid grid-cols-1 gap-2.5 p-2.5">
                          {infrastructureCards.map(card => (
                            <article key={card.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
                                {card.type === 'Borewell' ? (
                                  <Droplets className="h-3.5 w-3.5 text-emerald-700" />
                                ) : card.type === 'Electricity Connection' ? (
                                  <Zap className="h-3.5 w-3.5 text-emerald-700" />
                                ) : (
                                  <Crosshair className="h-3.5 w-3.5 text-emerald-700" />
                                )}
                                <div className="min-w-0">
                                  <h4 className="truncate text-[11px] font-bold text-slate-800">{card.title}</h4>
                                  <p className="text-[9px] font-semibold text-slate-500">{card.type}</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-x-3 gap-y-2 p-2.5">
                                {card.items.map(item => (
                                  <div key={item.label} className="min-w-0">
                                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{item.label}</p>
                                    <p className="mt-0.5 break-words text-[11px] font-bold text-slate-700">{item.value}</p>
                                  </div>
                                ))}
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="px-4 py-5 text-center text-[11px] font-semibold text-slate-400">
                          No borewell, electricity, or other infrastructure details available
                        </p>
                      )}
                    </section>

                    <section>
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
                          <Crosshair className="h-3.5 w-3.5 text-emerald-700" />
                          <h3 className="text-xs font-bold text-slate-900">Additional Mappings</h3>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {mappings.length > 0 ? mappings.map((mapping, index) => (
                            <div key={`${mapping.mapping_name}-${index}`} className="grid grid-cols-3 gap-3 px-3 py-1.5">
                              <div>
                                <p className="text-[9px] font-bold uppercase text-slate-400">Name</p>
                                <p className="mt-0.5 text-[11px] font-bold text-slate-700">{mapping.mapping_name || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-bold uppercase text-slate-400">Type</p>
                                <p className="mt-0.5 text-[11px] font-bold capitalize text-slate-700">{mapping.mapping_type || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-bold uppercase text-slate-400">Shape</p>
                                <p className="mt-0.5 text-[11px] font-bold capitalize text-slate-700">{mapping.shape_details || 'N/A'}</p>
                              </div>
                            </div>
                          )) : (
                            <p className="px-4 py-5 text-center text-[11px] font-semibold text-slate-400">No additional mappings</p>
                          )}
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
                </div>
              );
            })()}
            {landConfigurationTab === 'crop' && (
              <div className="min-h-0 flex-1">
                <CropSelectorModal
                  embedded
                  farm={landConfigurationFarm}
                  formId={`land-config-crop-form-${landConfigurationFarm.farm_id}`}
                  onSaveStateChange={setCropSelectorSaveState}
                  onClose={() => setLandConfigurationTab('details')}
                />
              </div>
            )}
            {landConfigurationTab === 'marking' && (
              <div className="min-h-0 flex-1">
                <PlotMarkingModal
                  embedded
                  farmId={landConfigurationFarm.farm_id}
                  farmTotalAcres={landConfigurationFarm.area}
                  farmLabel={[
                    landConfigurationFarm.land_data?.village,
                    landConfigurationFarm.land_data?.district,
                    landConfigurationFarm.land_data?.state,
                  ].filter(Boolean).join(', ')}
                  initialCoordinates={landConfigurationFarm.land_data?.land_coordinates ?? []}
                  initialPlots={landConfigurationFarm.land_plots ?? []}
                  onClose={() => setLandConfigurationTab('details')}
                  onSave={(plot) => {
                    toast.success(`Plot "${plot.plot_number}" saved — ${plot.coordinates.length} points · ${plot.acres} acres`);
                  }}
                />
              </div>
            )}
            {landConfigurationTab === 'plotter' && (
              <div className="min-h-0 flex-1">
                <PremiumPlotterModal
                  embedded
                  farmId={landConfigurationFarm.farm_id}
                  farmLabel={[
                    landConfigurationFarm.land_data?.village,
                    landConfigurationFarm.land_data?.district,
                    landConfigurationFarm.land_data?.state,
                  ].filter(Boolean).join(', ')}
                  landCoordinates={landConfigurationFarm.land_data?.land_coordinates ?? []}
                  landPlots={landConfigurationFarm.land_plots ?? []}
                  existingMappings={landConfigurationFarm.additional_mappings ?? []}
                  onClose={() => setLandConfigurationTab('details')}
                />
              </div>
            )}
            {landConfigurationTab === 'history' && (() => {
              const farm = landConfigurationFarm;
              const activities = farm.activities ?? [];
              const ledger = farm.farm_investment_ledger ?? [];
              const rawFarm = farm as Farm & Record<string, any>;
              const rawTasks = [
                ...(Array.isArray(rawFarm.tasks) ? rawFarm.tasks : []),
                ...(Array.isArray(rawFarm.task_history) ? rawFarm.task_history : []),
              ];
              const scopeActivities = Object.values(farm.scope_of_work ?? {}).flatMap((scope, scopeIndex) =>
                (scope.activities ?? []).map((activity, activityIndex) => ({
                  scope,
                  scopeIndex,
                  activityIndex,
                  title: activity,
                }))
              );
              const normalizeActivity = (value: unknown) =>
                String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
              const assignedStaff = [
                configurationStaff.supervisorName,
                ...configurationStaff.fieldManagers.map(manager => manager.name),
              ].filter(Boolean).join(', ') || 'N/A';
              const formatAcres = (value: unknown) => {
                const acres = Number(value);
                return Number.isFinite(acres) && acres > 0
                  ? `${acres.toLocaleString('en-IN', { maximumFractionDigits: 3 })} acres`
                  : 'N/A';
              };
              const calculateDelay = (completedDate: unknown, dueDate: unknown, explicitDelay: unknown) => {
                const explicit = Number(explicitDelay);
                if (Number.isFinite(explicit) && explicit > 0) return `${explicit} day${explicit === 1 ? '' : 's'}`;
                const completed = new Date(String(completedDate ?? '')).getTime();
                const due = new Date(String(dueDate ?? '')).getTime();
                if (!Number.isFinite(completed) || !Number.isFinite(due) || completed <= due) return 'No delay';
                const days = Math.ceil((completed - due) / 86400000);
                return `${days} day${days === 1 ? '' : 's'}`;
              };
              const now = Date.now();
              const scopeTitles = new Set(scopeActivities.map(item => normalizeActivity(item.title)));
              const scopeHistoryItems = scopeActivities.map(({ scope, scopeIndex, activityIndex, title }) => {
                const completedEntry = activities.find(entry => {
                  const recorded = normalizeActivity(entry.activity);
                  const planned = normalizeActivity(title);
                  return recorded === planned || recorded.includes(planned) || planned.includes(recorded);
                }) as (FarmActivityEntry & Record<string, any>) | undefined;
                const rawTask = rawTasks.find((task: any) => {
                  const taskTitle = normalizeActivity(task.task_name ?? task.name ?? task.activity ?? task.title);
                  const planned = normalizeActivity(title);
                  return taskTitle === planned || taskTitle.includes(planned) || planned.includes(taskTitle);
                });
                const startTime = new Date(scope.start_date).getTime();
                const endTime = new Date(scope.end_date).getTime();
                const rawStatus = String(rawTask?.status ?? '').trim();
                const isCompleted = Boolean(completedEntry)
                  || ['completed', 'done', 'closed'].includes(rawStatus.toLowerCase());
                const status = isCompleted
                  ? 'Completed'
                  : Number.isFinite(startTime) && startTime > now
                    ? 'Upcoming'
                    : Number.isFinite(endTime) && endTime < now
                      ? 'Delayed'
                      : rawStatus || 'In Progress';
                const completedDate = completedEntry?.date ?? rawTask?.completed_at ?? rawTask?.completion_date;
                return {
                  id: `scope-${scopeIndex}-${activityIndex}`,
                  kind: 'Task',
                  title,
                  date: String(completedDate ?? rawTask?.scheduled_date ?? scope.start_date ?? ''),
                  description: String(rawTask?.description ?? rawTask?.remarks ?? ''),
                  meta: '',
                  status,
                  assignedTo: String(
                    completedEntry?.assigned_staff_name ??
                    completedEntry?.assigned_to ??
                    rawTask?.assigned_staff_name ??
                    rawTask?.assigned_to ??
                    assignedStaff
                  ),
                  executedBy: String(
                    completedEntry?.vendor_name ??
                    completedEntry?.done_by ??
                    rawTask?.vendor_name ??
                    scope.vendor_details?.vendor_name ??
                    (completedEntry?.execution_type === 'self' ? 'Self' : 'Self / Internal Team')
                  ),
                  acres: formatAcres(
                    completedEntry?.area_done ??
                    completedEntry?.completed_area ??
                    completedEntry?.acres ??
                    rawTask?.area_done ??
                    rawTask?.planned_area
                  ),
                  delay: status === 'Delayed'
                    ? calculateDelay(new Date(now).toISOString(), scope.end_date, rawTask?.delay_days)
                    : calculateDelay(completedDate, scope.end_date, completedEntry?.delay_days ?? rawTask?.delay_days),
                  schedule: [scope.start_date, scope.end_date].filter(Boolean).map(fmtDate).join(' – ') || 'N/A',
                };
              });
              const historyItems = [
                ...scopeHistoryItems,
                ...activities
                  .filter(entry => !scopeTitles.has(normalizeActivity(entry.activity)))
                  .map((entry, index) => {
                  const rawEntry = entry as FarmActivityEntry & Record<string, any>;
                  return {
                  id: `activity-${index}`,
                  kind: String(entry.activity ?? '').toLowerCase().includes('task') ? 'Task' : 'Activity',
                  title: entry.activity || 'Land activity',
                  date: entry.date,
                  description: String(rawEntry.description ?? rawEntry.remarks ?? ''),
                  meta: '',
                  status: String(rawEntry.status ?? 'Completed'),
                  assignedTo: String(rawEntry.assigned_staff_name ?? rawEntry.assigned_to ?? assignedStaff),
                  executedBy: String(
                    rawEntry.vendor_name ??
                    rawEntry.done_by ??
                    (rawEntry.execution_type === 'self' ? 'Self' : 'Self / Internal Team')
                  ),
                  acres: formatAcres(rawEntry.area_done ?? rawEntry.completed_area ?? rawEntry.acres),
                  delay: calculateDelay(entry.date, rawEntry.due_date ?? rawEntry.planned_end_date, rawEntry.delay_days),
                  schedule: rawEntry.planned_date ? fmtDate(rawEntry.planned_date) : 'N/A',
                };
                }),
                ...rawTasks
                  .filter((task: any) => !scopeTitles.has(normalizeActivity(task.task_name ?? task.name ?? task.activity ?? task.title)))
                  .map((task: any, index: number) => ({
                  id: `task-${index}`,
                  kind: 'Task',
                  title: String(task.task_name ?? task.name ?? task.activity ?? task.title ?? `Task ${index + 1}`),
                  date: String(task.completed_at ?? task.scheduled_date ?? task.date ?? task.created_at ?? ''),
                  description: String(task.description ?? task.remarks ?? ''),
                  meta: '',
                  status: String(task.status ?? 'Planned'),
                  assignedTo: String(task.assigned_staff_name ?? task.assigned_to ?? assignedStaff),
                  executedBy: String(task.vendor_name ?? task.done_by ?? task.execution_type ?? 'N/A'),
                  acres: formatAcres(task.area_done ?? task.completed_area ?? task.planned_area ?? task.acres),
                  delay: calculateDelay(task.completed_at, task.due_date ?? task.end_date, task.delay_days),
                  schedule: task.scheduled_date ? fmtDate(task.scheduled_date) : 'N/A',
                })),
                ...ledger.map((entry, index) => ({
                  id: `input-${entry.voucher_number || index}`,
                  kind: 'Input',
                  title: entry.item_description?.item_name?.trim() || entry.description || 'Land input',
                  date: entry.date,
                  description: entry.description || '',
                  meta: [
                    entry.input ? `${entry.input} ${entry.item_description?.item_unit || entry.unit || ''}`.trim() : '',
                    entry.amount ? `₹${entry.amount.toLocaleString('en-IN')}` : '',
                  ].filter(Boolean).join(' · '),
                  status: 'Recorded',
                  assignedTo: 'N/A',
                  executedBy: String(
                    (entry as FarmInvestmentEntry & Record<string, any>).vendor_name ??
                    (entry as FarmInvestmentEntry & Record<string, any>).supplier_name ??
                    (entry as FarmInvestmentEntry & Record<string, any>).paid_to ??
                    'N/A'
                  ),
                  acres: formatAcres((entry as FarmInvestmentEntry & Record<string, any>).area_covered),
                  delay: 'N/A',
                  schedule: 'N/A',
                })),
              ].sort((first, second) => {
                const firstTime = new Date(first.date).getTime();
                const secondTime = new Date(second.date).getTime();
                return (Number.isFinite(secondTime) ? secondTime : 0) - (Number.isFinite(firstTime) ? firstTime : 0);
              });
              const taskCount = historyItems.filter(item => item.kind === 'Task').length;
              const activityCount = historyItems.filter(item => item.kind === 'Activity').length;
              const inputCount = historyItems.filter(item => item.kind === 'Input').length;
              const upcomingCount = historyItems.filter(item => item.status.toLowerCase() === 'upcoming').length;
              const delayedCount = historyItems.filter(item => item.status.toLowerCase() === 'delayed').length;

              return (
                <div className="min-h-0 flex-1 overflow-y-auto bg-[#fbfcfd] p-5 sm:p-6">
                  <div className="mx-auto max-w-5xl space-y-5">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      {[
                        { label: 'Tasks', value: taskCount },
                        { label: 'Activities', value: activityCount },
                        { label: 'Inputs Used', value: inputCount },
                        { label: 'Upcoming', value: upcomingCount },
                        { label: 'Delayed', value: delayedCount },
                      ].map(summary => (
                        <div key={summary.label} className="rounded-xl border border-slate-200 bg-white px-5 py-4">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{summary.label}</p>
                          <p className="mt-2 text-2xl font-extrabold text-[#0D3A35]">{summary.value}</p>
                        </div>
                      ))}
                    </div>

                    <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
                      <div className="rounded-lg bg-slate-50 px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Assigned Supervisor</p>
                        <p className="mt-1.5 text-sm font-bold text-slate-800">{configurationStaff.supervisorName || 'N/A'}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{configurationStaff.supervisorContact || 'Contact unavailable'}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Assigned Field Manager(s)</p>
                        <p className="mt-1.5 text-sm font-bold text-slate-800">
                          {configurationStaff.fieldManagers.map(manager => manager.name).join(', ') || 'N/A'}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {configurationStaff.fieldManagers.map(manager => manager.contact).filter(Boolean).join(', ') || 'Contact unavailable'}
                        </p>
                      </div>
                    </section>

                    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-emerald-700" />
                          <h3 className="text-sm font-bold text-slate-900">Complete Land History</h3>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500">Newest first</span>
                      </div>
                      {historyItems.length > 0 ? (
                        <div className="divide-y divide-slate-100">
                          {historyItems.map(item => (
                            <article key={item.id} className="grid gap-4 px-5 py-4 sm:grid-cols-[100px_1fr] sm:items-start">
                              <div>
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${
                                  item.kind === 'Input'
                                    ? 'bg-amber-50 text-amber-700'
                                    : item.kind === 'Task'
                                      ? 'bg-blue-50 text-blue-700'
                                      : 'bg-emerald-50 text-emerald-700'
                                }`}>
                                  {item.kind}
                                </span>
                                <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[9px] font-bold ${
                                  item.status.toLowerCase() === 'completed'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : item.status.toLowerCase() === 'delayed'
                                      ? 'bg-red-50 text-red-700'
                                      : item.status.toLowerCase() === 'upcoming'
                                        ? 'bg-violet-50 text-violet-700'
                                        : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {item.status}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <h4 className="text-sm font-bold text-slate-800">{item.title}</h4>
                                  <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold text-slate-500">
                                    <Clock className="h-3.5 w-3.5" />
                                    {item.date ? fmtDate(item.date) : 'Date unavailable'}
                                  </div>
                                </div>
                                {item.description && (
                                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.description}</p>
                                )}
                                {item.meta && (
                                  <p className="mt-2 text-[11px] font-semibold text-[#0D3A35]">{item.meta}</p>
                                )}
                                <div className="mt-3 grid gap-x-5 gap-y-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-2 lg:grid-cols-5">
                                  {[
                                    { label: 'Assigned Staff', value: item.assignedTo },
                                    { label: 'Done By', value: item.executedBy },
                                    { label: 'Area Done', value: item.acres },
                                    { label: 'Delay', value: item.delay },
                                    { label: 'Schedule', value: item.schedule },
                                  ].map(detail => (
                                    <div key={detail.label} className="min-w-0">
                                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{detail.label}</p>
                                      <p className="mt-1 break-words text-[11px] font-bold text-slate-700">{detail.value || 'N/A'}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center px-5 py-16 text-slate-400">
                          <Activity className="mb-3 h-9 w-9 opacity-30" />
                          <p className="text-sm font-semibold">No land history recorded yet</p>
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              );
            })()}
            {landConfigurationTab === 'ledger' && (() => {
              const ledger = landConfigurationFarm.farm_investment_ledger ?? [];
              const totalInvestment = ledger.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
              const averageInvestment = ledger.length > 0 ? totalInvestment / ledger.length : 0;
              const largestInvestment = ledger.reduce(
                (largest, entry) => Math.max(largest, Number(entry.amount ?? 0)),
                0
              );
              const validDates = ledger
                .map(entry => new Date(entry.date).getTime())
                .filter(Number.isFinite)
                .sort((first, second) => first - second);
              const ledgerPeriod = validDates.length > 0
                ? `${fmtDate(new Date(validDates[0]).toISOString())} – ${fmtDate(new Date(validDates[validDates.length - 1]).toISOString())}`
                : 'N/A';
              const itemBreakdown = Object.values(ledger.reduce<Record<string, {
                name: string;
                code: string;
                unit: string;
                quantity: number;
                entries: number;
                amount: number;
              }>>((summary, entry) => {
                const name = entry.item_description?.item_name?.trim() || 'Uncategorised';
                const key = `${entry.item_description?.item_code || ''}-${name}`.toLowerCase();
                if (!summary[key]) {
                  summary[key] = {
                    name,
                    code: entry.item_description?.item_code || 'N/A',
                    unit: entry.item_description?.item_unit || entry.unit || '',
                    quantity: 0,
                    entries: 0,
                    amount: 0,
                  };
                }
                summary[key].quantity += Number(entry.input ?? 0);
                summary[key].entries += 1;
                summary[key].amount += Number(entry.amount ?? 0);
                return summary;
              }, {})).sort((first, second) => second.amount - first.amount);

              return (
                <div className="min-h-0 flex-1 overflow-y-auto bg-[#fbfcfd] p-5 sm:p-6">
                  <div className="mx-auto max-w-6xl space-y-5">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      {[
                        { label: 'Total Investment', value: `₹${totalInvestment.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` },
                        { label: 'Ledger Entries', value: String(ledger.length) },
                        { label: 'Average Entry', value: `₹${averageInvestment.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` },
                        { label: 'Largest Entry', value: `₹${largestInvestment.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` },
                        { label: 'Ledger Period', value: ledgerPeriod },
                      ].map(summary => (
                        <div key={summary.label} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{summary.label}</p>
                          <p className="mt-2 break-words text-lg font-extrabold text-[#0D3A35]">{summary.value}</p>
                        </div>
                      ))}
                    </div>

                    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                        <TrendingUp className="h-4 w-4 text-emerald-700" />
                        <h3 className="text-sm font-bold text-slate-900">Investment Ledger</h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[1250px] text-left">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/40">
                              {[
                                'Date', 'Voucher No.', 'Item', 'Item Code', 'Quantity / Unit',
                                'Rate / Unit', 'Vendor / Paid To', 'Payment Mode', 'Description', 'Amount',
                              ].map(heading => (
                                <th key={heading} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                  {heading}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {ledger.length > 0 ? ledger.map((entry, index) => (
                              <tr key={entry.voucher_number || index} className="transition hover:bg-slate-50/60">
                                {(() => {
                                  const rawEntry = entry as FarmInvestmentEntry & Record<string, any>;
                                  const quantity = Number(entry.input ?? 0);
                                  const amount = Number(entry.amount ?? 0);
                                  const rate = quantity > 0 ? amount / quantity : Number(entry.investment ?? 0);
                                  return (
                                    <>
                                <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-600">{fmtDate(entry.date)}</td>
                                <td className="px-4 py-3 text-xs font-mono font-semibold text-slate-600">{entry.voucher_number || 'N/A'}</td>
                                <td className="px-4 py-3 text-xs font-bold text-slate-800">{entry.item_description?.item_name?.trim() || 'N/A'}</td>
                                <td className="px-4 py-3 text-xs font-semibold text-slate-600">{entry.item_description?.item_code || 'N/A'}</td>
                                <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                                  {entry.input || 'N/A'} {entry.item_description?.item_unit || entry.unit || ''}
                                </td>
                                <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-600">
                                  {rate > 0 ? `₹${rate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'N/A'}
                                </td>
                                <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                                  {rawEntry.vendor_name ?? rawEntry.supplier_name ?? rawEntry.paid_to ?? 'N/A'}
                                </td>
                                <td className="px-4 py-3 text-xs font-semibold capitalize text-slate-600">
                                  {rawEntry.payment_mode ?? rawEntry.payment_method ?? 'N/A'}
                                </td>
                                <td className="max-w-[260px] px-4 py-3 text-xs text-slate-500">{entry.description || 'N/A'}</td>
                                <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-extrabold text-[#0D3A35]">
                                  ₹{Number(entry.amount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </td>
                                    </>
                                  );
                                })()}
                              </tr>
                            )) : (
                              <tr>
                                <td colSpan={10} className="px-5 py-16 text-center text-sm font-semibold text-slate-400">
                                  No investment entries recorded yet
                                </td>
                              </tr>
                            )}
                          </tbody>
                          {ledger.length > 0 && (
                            <tfoot>
                              <tr className="border-t-2 border-slate-200 bg-emerald-50/50">
                                <td colSpan={9} className="px-4 py-3 text-sm font-bold text-slate-800">Total Investment</td>
                                <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-extrabold text-[#0D3A35]">
                                  ₹{totalInvestment.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </section>

                    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-emerald-700" />
                          <h3 className="text-sm font-bold text-slate-900">Item-wise Investment Breakdown</h3>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500">{itemBreakdown.length} item categories</span>
                      </div>
                      {itemBreakdown.length > 0 ? (
                        <div className="grid gap-3 p-4 md:grid-cols-2">
                          {itemBreakdown.map(item => {
                            const share = totalInvestment > 0 ? (item.amount / totalInvestment) * 100 : 0;
                            return (
                              <article key={`${item.code}-${item.name}`} className="rounded-lg border border-slate-200 p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <h4 className="truncate text-sm font-bold text-slate-800">{item.name}</h4>
                                    <p className="mt-1 text-[10px] font-semibold text-slate-500">
                                      Code: {item.code} · {item.entries} entr{item.entries === 1 ? 'y' : 'ies'}
                                    </p>
                                  </div>
                                  <p className="whitespace-nowrap text-sm font-extrabold text-[#0D3A35]">
                                    ₹{item.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                  </p>
                                </div>
                                <div className="mt-3 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                                  <span>Quantity: {item.quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {item.unit}</span>
                                  <span>{share.toFixed(1)}% of total</span>
                                </div>
                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                  <div className="h-full rounded-full bg-[#0D3A35]" style={{ width: `${Math.min(100, share)}%` }} />
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="px-5 py-10 text-center text-sm font-semibold text-slate-400">No item breakdown available</p>
                      )}
                    </section>
                  </div>
                </div>
              );
            })()}
            </div>
          </div>
        </ViewportPortal>
      )}

      {/* Plot Marking Modal */}
      {plotMarkingFarm && (
        <ViewportPortal>
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
        </ViewportPortal>
      )}

      {/* Investment Ledger Modal */}
      {ledgerFarm && (
        <ViewportPortal>
          <FarmInvestmentLedgerModal
            farm={ledgerFarm}
            onClose={() => setLedgerFarm(null)}
          />
        </ViewportPortal>
      )}

      {/* Map Expand Modal */}
      {expandMapFarm && (
        <ViewportPortal>
          <FarmMapExpandModal
            farm={expandMapFarm}
            onClose={() => setExpandMapFarm(null)}
          />
        </ViewportPortal>
      )}

      {/* Premium Plotter Modal */}
      {plotterFarm && (
        <ViewportPortal>
          <PremiumPlotterModal
            farmId={plotterFarm.farm_id}
            farmLabel={[
              plotterFarm.land_data?.village,
              plotterFarm.land_data?.district,
              plotterFarm.land_data?.state,
            ].filter(Boolean).join(', ')}
            landCoordinates={plotterFarm.land_data?.land_coordinates ?? []}
            landPlots={plotterFarm.land_plots ?? []}
            existingMappings={plotterFarm.additional_mappings ?? []}
            onClose={() => setPlotterFarm(null)}
          />
        </ViewportPortal>
      )}

      {/* Crop Selector Modal */}
      {cropSelectorFarm && (
        <ViewportPortal>
          <CropSelectorModal
            farm={cropSelectorFarm}
            onClose={() => setCropSelectorFarm(null)}
          />
        </ViewportPortal>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// CROP SELECTOR MODAL
// ─────────────────────────────────────────────────────────────
const CROP_OPTIONS: { key: string; label: string; Icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { key: 'rahar',  label: 'Rahar',  Icon: Sprout, color: 'var(--crop-rahar-color, #800000)' },
  { key: 'paddy',  label: 'Paddy',  Icon: Wheat,  color: 'var(--crop-paddy-color, #22c55e)' },
  { key: 'napier', label: 'Napier', Icon: Leaf,   color: 'var(--crop-napier-color, #2563eb)' },
];

const CropSelectorModal = ({
  embedded = false,
  farm,
  formId,
  onSaveStateChange,
  onClose,
}: {
  embedded?: boolean;
  farm: Farm;
  formId?: string;
  onSaveStateChange?: (state: { disabled: boolean; saving: boolean }) => void;
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
  const [expandedCropRows, setExpandedCropRows] = useState<Record<string, boolean>>({});

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
  const assignedPlots = plots.filter(plot => plotCropMap.has(plot.plot_name));
  const unassignedPlots = plots.filter(plot => !plotCropMap.has(plot.plot_name));
  const totalPlotAcres = plots.reduce((sum, plot) => sum + (plot.plot_area ?? 0), 0);
  const unassignedPlotAcres = unassignedPlots.reduce((sum, plot) => sum + (plot.plot_area ?? 0), 0);
  const parcelArea = Number(farm.area ?? 0);
  const balanceAreaLeft = Math.max(0, (parcelArea > 0 ? parcelArea : totalPlotAcres) - totalAssignedAcres);
  const cropWiseRows = CROP_OPTIONS.map(crop => {
    const cropPlots = plots.filter(plot => plotCropMap.get(plot.plot_name) === crop.key);
    return {
      ...crop,
      plots: cropPlots,
      acres: cropPlots.reduce((sum, plot) => sum + (plot.plot_area ?? 0), 0),
    };
  });

  useEffect(() => {
    onSaveStateChange?.({ disabled: plotCropMap.size === 0, saving });
  }, [onSaveStateChange, plotCropMap.size, saving]);

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
    if (saving) return;
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
    <div className={embedded
      ? 'flex h-full min-h-0 w-full items-stretch'
      : 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]'
    }>
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          handleSave();
        }}
        className={`flex w-full flex-col border-gray-200 bg-white ${
          embedded ? 'h-full' : 'max-w-2xl rounded-2xl border shadow-2xl'
        }`}
        style={{ height: embedded ? '100%' : '88vh' }}
      >

        {/* Header */}
        {!embedded && (
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <Sprout className="h-4 w-4 text-green-600" />
                <h2 className="text-base font-bold text-gray-900">Crop Selector</h2>
              </div>
              <p className="mt-0.5 text-xs text-gray-400">{location || farm.farm_id}</p>
            </div>
            <button onClick={onClose} className="rounded-md p-1.5 transition-colors hover:bg-gray-100">
              <X className="h-4 w-4 text-gray-400" />
            </button>
          </div>
        )}

        {/* Step 1 — Crop chips */}
        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Select active crop — then tap plots on the map
          </p>
          <div className="flex items-center gap-2">
            {CROP_OPTIONS.map(({ key, label, Icon, color }) => {
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
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  {acres > 0 && (
                    <span
                      className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: active ? 'rgba(255,255,255,0.3)' : color, color: '#fff' }}
                    >
                      {acres.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ac
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Map + legend */}
        <div className="flex min-h-0 flex-1">

          {/* Map area */}
          <div className="min-w-0 basis-[70%] p-4 pr-3">
            <div className="relative h-full overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-sm">
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
                    ? `Assigning: ${activeCrop.label} — tap a plot`
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
                      pathOptions={{ color: 'var(--land-boundary-color, #fde047)', fillColor: 'var(--land-boundary-fill, #fef9c3)', fillOpacity: 0.28, weight: 3 }}
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
                            <span className="text-[10px] text-gray-500 ml-1">
                              · {Number(plot.plot_area ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })} ac
                            </span>
                          </Tooltip>
                        </Polygon>
                      </>
                    );
                  })}
                  <FitBounds coords={allMapCoords} />
                </MapContainer>
              </>
            )}
            </div>
          </div>

          {/* Crop-wise plot table */}
          <div className="flex min-w-0 basis-[30%] shrink-0 flex-col border-l border-gray-100 bg-gray-50">
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Crop-wise Plot Table</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
                  Total Plots {plots.length}
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100">
                  Assigned {assignedPlots.length}
                </span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr className="border-b border-gray-100">
                    <th className="px-3 py-2.5 text-[11px] font-bold uppercase text-gray-500">Crop</th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold uppercase text-gray-500">Plots</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase text-gray-500">Area</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cropWiseRows.map(crop => (
                    <Fragment key={crop.key}>
                      <tr className="bg-white">
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            disabled={crop.plots.length === 0}
                            onClick={() => setExpandedCropRows(previous => ({
                              ...previous,
                              [crop.key]: !previous[crop.key],
                            }))}
                            className="flex w-full items-center gap-1.5 text-left disabled:cursor-default"
                          >
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: crop.color }} />
                            <span className="text-[13px] font-bold" style={{ color: crop.color }}>{crop.label}</span>
                            <ChevronDown className={`ml-auto h-3.5 w-3.5 text-slate-400 transition-transform ${
                              expandedCropRows[crop.key] ? 'rotate-180' : ''
                            } ${crop.plots.length === 0 ? 'opacity-30' : ''}`} />
                          </button>
                          <p className="mt-1 text-[11px] font-medium text-slate-500">
                            {crop.plots.length > 0 ? 'View assigned plots' : 'No plots assigned'}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-center text-[13px] font-bold text-slate-700">{crop.plots.length}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-bold text-slate-600">
                          {crop.acres.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ac
                        </td>
                      </tr>
                      {expandedCropRows[crop.key] && crop.plots.length > 0 && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={3} className="px-3 py-2">
                            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                              {crop.plots.map((plot, plotIndex) => (
                                <div
                                  key={plot.plot_id || `${crop.key}-${plot.plot_name}-${plotIndex}`}
                                  className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0"
                                >
                                  <span className="min-w-0 truncate text-xs font-bold text-slate-700">{plot.plot_name}</span>
                                  <span className="shrink-0 text-xs font-semibold text-slate-500">
                                    {Number(plot.plot_area ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })} ac
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  <tr className="bg-white">
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        disabled={unassignedPlots.length === 0}
                        onClick={() => setExpandedCropRows(previous => ({
                          ...previous,
                          unassigned: !previous.unassigned,
                        }))}
                        className="flex w-full items-center gap-1.5 text-left disabled:cursor-default"
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-300" />
                        <span className="text-[13px] font-bold text-slate-600">Unassigned</span>
                        <ChevronDown className={`ml-auto h-3.5 w-3.5 text-slate-400 transition-transform ${
                          expandedCropRows.unassigned ? 'rotate-180' : ''
                        } ${unassignedPlots.length === 0 ? 'opacity-30' : ''}`} />
                      </button>
                      <p className="mt-1 text-[11px] font-medium text-slate-500">
                        {unassignedPlots.length > 0 ? 'View unassigned plots' : 'All plots assigned'}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-center text-[13px] font-bold text-slate-700">{unassignedPlots.length}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-bold text-slate-600">
                      {unassignedPlotAcres.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ac
                    </td>
                  </tr>
                  {expandedCropRows.unassigned && unassignedPlots.length > 0 && (
                    <tr className="bg-slate-50/80">
                      <td colSpan={3} className="px-3 py-2">
                        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                          {unassignedPlots.map((plot, plotIndex) => (
                            <div
                              key={plot.plot_id || `unassigned-${plot.plot_name}-${plotIndex}`}
                              className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0"
                            >
                              <span className="min-w-0 truncate text-xs font-bold text-slate-700">{plot.plot_name}</span>
                              <span className="shrink-0 text-xs font-semibold text-slate-500">
                                {Number(plot.plot_area ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })} ac
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-emerald-50/70">
                    <th className="px-3 py-2.5 text-xs font-bold text-emerald-800">Assigned Total</th>
                    <td className="px-3 py-2.5 text-center text-[13px] font-bold text-emerald-800">{assignedPlots.length}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-bold text-emerald-800">
                      {totalAssignedAcres.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ac
                    </td>
                  </tr>
                  <tr className="bg-slate-100">
                    <th className="px-3 py-2.5 text-xs font-bold text-slate-700">All Plots</th>
                    <td className="px-3 py-2.5 text-center text-[13px] font-bold text-slate-700">{plots.length}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-bold text-slate-700">
                      {totalPlotAcres.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ac
                    </td>
                  </tr>
                  <tr className="border-t border-slate-200 bg-amber-50">
                    <th className="px-3 py-2.5 text-xs font-bold text-amber-800">Balance Area Left</th>
                    <td className="px-3 py-2.5 text-center text-[13px] font-bold text-amber-800">{unassignedPlots.length}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-bold text-amber-800">
                      {balanceAreaLeft.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ac
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        {!embedded && (
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex flex-col gap-0.5">
            {plotCropMap.size > 0 ? (
              <>
                <p className="text-xs font-semibold text-gray-700">
                  Total: {totalAssignedAcres.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ac across {assignedPlots.length} plot(s)
                </p>
                <p className="text-[11px] text-gray-400">
                  {CROP_OPTIONS.filter(c => acresByCrop(c.key) > 0)
                    .map(c => `${c.label} ${acresByCrop(c.key).toLocaleString('en-IN', { maximumFractionDigits: 3 })} ac`)
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
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={plotCropMap.size === 0 || saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        )}
      </form>
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
    { key: 'land',  label: 'Land Boundary', color: 'var(--land-boundary-color, #fde047)' },
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
