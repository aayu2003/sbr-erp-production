import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, MapPin, Layers, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';

// Fix default marker icons broken by bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
type LatLng = [number, number];

export interface MapPlotItem {
  plot_id:   string;
  plot_name: string;
  plot_area: number;
}

export interface MapViewTask {
  activity:   string;
  date:       string;
  farm_id:    string;
  farmerName: string;
  plots:      MapPlotItem[];
}

interface ApiPlotData {
  plot_name:        string;
  plot_area:        number;
  plot_coordinates: LatLng[];
}

interface MapApiResponse {
  farm_coordinates: LatLng[];
  plot_map_data:    ApiPlotData[];
}

interface PlotMapViewModalProps {
  task:    MapViewTask;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────
const PLOT_COLORS = [
  '#f59e0b', '#a855f7', '#06b6d4', '#ec4899',
  '#f97316', '#14b8a6', '#6366f1', '#84cc16',
];
const plotColor = (i: number) => PLOT_COLORS[i % PLOT_COLORS.length];

const DEFAULT_CENTER: LatLng = [20.5937, 78.9629];
const DEFAULT_ZOOM   = 5;

// ─────────────────────────────────────────────────────────────
// FIT BOUNDS HELPER (must be inside MapContainer)
// ─────────────────────────────────────────────────────────────
const FitBounds = ({ coords }: { coords: LatLng[] }) => {
  const map = useMap();
  useEffect(() => {
    if (coords.length < 2) return;
    const bounds = L.latLngBounds(coords.map(([lat, lng]) => L.latLng(lat, lng)));
    map.fitBounds(bounds, { padding: [40, 40], animate: true });
  }, [coords, map]);
  return null;
};

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
const PlotMapViewModal = ({ task, onClose }: PlotMapViewModalProps) => {
  const [apiData, setApiData]       = useState<MapApiResponse | null>(null);
  const [isLoading, setIsLoading]   = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (task.plots.length === 0) return;
    const BASE_URL = getBaseUrl().replace(/\/$/, '');
    setIsLoading(true);
    setFetchError(null);

    fetch(`${BASE_URL}/farmer_managment/get_plot_map_view_data_for_task`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        farm_id: task.farm_id,
        plot_id: task.plots.map((p) => p.plot_id),
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        return res.json();
      })
      .then((data: MapApiResponse) => { setApiData(data); setIsLoading(false); })
      .catch((err) => { setFetchError(err?.message ?? 'Failed to load map data'); setIsLoading(false); });
  }, [task.farm_id, task.plots]);

  // Build name → sidebar-index map so polygon colors match the sidebar legend
  const nameToIdx = new Map<string, number>(
    task.plots.map((p, i) => [p.plot_name, i]),
  );

  // Which plots got mapped (by name) for the "Mapped" badge
  const mappedNames = new Set(apiData?.plot_map_data.map((p) => p.plot_name) ?? []);

  const farmCoords = apiData?.farm_coordinates ?? [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">

        {/* ── Header ── */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4 bg-gradient-to-r from-gray-50 to-white shrink-0">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">Plot Map View</p>
            <h2 className="text-base font-bold text-gray-900 truncate">{task.activity}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
              <span>{new Date(task.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <span className="text-gray-300">·</span>
              <span className="font-medium text-gray-700">{task.farmerName || task.farm_id}</span>
              <span className="text-gray-300">·</span>
              <span className="font-mono text-gray-400 text-[10px]">{task.farm_id}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Left sidebar: plot list ── */}
          <div className="w-64 shrink-0 border-r border-gray-100 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Assigned Plots</span>
                <span className="ml-auto text-[10px] font-semibold bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5">
                  {task.plots.length}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {task.plots.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <MapPin className="w-6 h-6 mx-auto mb-2 opacity-40" />
                  <p className="text-[12px]">No plots assigned</p>
                </div>
              ) : (
                task.plots.map((plot, idx) => (
                  <div
                    key={plot.plot_id}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-gray-100 bg-white hover:border-gray-200 transition-colors"
                  >
                    <div
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: plotColor(idx) }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-gray-800 truncate">{plot.plot_name}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{plot.plot_area} ac</p>
                    </div>
                    {isLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin text-gray-300 shrink-0" />
                    ) : mappedNames.has(plot.plot_name) ? (
                      <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 px-1 py-0.5 rounded shrink-0">
                        Mapped
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold bg-gray-100 text-gray-400 border border-gray-200 px-1 py-0.5 rounded shrink-0">
                        Pending
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Total area */}
            {task.plots.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/60">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-500 font-medium">Total Area</span>
                  <span className="font-bold text-gray-800">
                    {task.plots.reduce((s, p) => s + p.plot_area, 0).toFixed(2)} ac
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── Right: map ── */}
          <div className="flex-1 relative">

            {/* Loading overlay */}
            {isLoading && (
              <div className="absolute inset-0 z-[999] flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                <span className="text-sm text-gray-500 font-medium">Loading map data…</span>
              </div>
            )}

            {/* Error overlay */}
            {!isLoading && fetchError && (
              <div className="absolute inset-0 z-[999] flex flex-col items-center justify-center gap-3 text-red-400">
                <AlertCircle className="w-8 h-8" />
                <span className="text-sm font-medium">{fetchError}</span>
              </div>
            )}

            <MapContainer
              center={DEFAULT_CENTER}
              zoom={DEFAULT_ZOOM}
              style={{ height: '100%', width: '100%' }}
              className="z-0"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
              />

              {/* Auto-fit to farm boundary when data loads */}
              {farmCoords.length >= 2 && <FitBounds coords={farmCoords} />}

              {/* Farm boundary */}
              {farmCoords.length >= 3 && (
                <Polygon
                  positions={farmCoords}
                  pathOptions={{
                    color:       'var(--land-boundary-color, #fde047)',
                    fillColor:   'var(--land-boundary-fill, #fef9c3)',
                    fillOpacity: 0.28,
                    weight:      3,
                  }}
                >
                  <Tooltip sticky>
                    <span className="font-semibold">Farm Boundary</span>
                    <br />
                    <span className="text-gray-500 text-[11px]">{task.farmerName || task.farm_id}</span>
                  </Tooltip>
                </Polygon>
              )}

              {/* Plot polygons */}
              {(apiData?.plot_map_data ?? []).map((plot) => {
                const colorIdx = nameToIdx.get(plot.plot_name) ?? 0;
                const color    = plotColor(colorIdx);
                return (
                  <Polygon
                    key={plot.plot_name}
                    positions={plot.plot_coordinates}
                    pathOptions={{
                      color,
                      fillColor:   color,
                      fillOpacity: 0.3,
                      weight:      2.5,
                    }}
                  >
                    <Tooltip sticky>
                      <span className="font-semibold">{plot.plot_name}</span>
                      <br />
                      <span className="text-gray-500 text-[11px]">{plot.plot_area} ac</span>
                    </Tooltip>
                  </Polygon>
                );
              })}
            </MapContainer>

            {/* Legend chip — shown after load when farm boundary is present */}
            {!isLoading && !fetchError && farmCoords.length >= 3 && (
              <div className="absolute bottom-4 left-4 z-[999] bg-white/90 border border-gray-200 rounded-xl shadow-sm px-3 py-2 flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-0.5 border-t-2 border-dashed border-gray-400" />
                  <span className="text-[10px] text-gray-600 font-medium">Farm Boundary</span>
                </div>
                {(apiData?.plot_map_data ?? []).map((plot) => {
                  const colorIdx = nameToIdx.get(plot.plot_name) ?? 0;
                  return (
                    <div key={plot.plot_name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: plotColor(colorIdx) }} />
                      <span className="text-[10px] text-gray-600">{plot.plot_name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/60 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlotMapViewModal;
