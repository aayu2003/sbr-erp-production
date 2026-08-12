import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, AlertCircle } from 'lucide-react';
import getBaseUrl from '@/lib/config';

type LatLng = [number, number];

interface SplitPlotItem {
  plot_id: string;
  plot_name: string;
  plot_area: number;
}

interface ApiPlotData {
  plot_name: string;
  plot_area: number;
  plot_coordinates: LatLng[];
}

interface MapApiResponse {
  farm_coordinates: LatLng[];
  plot_map_data: ApiPlotData[];
}

interface SplitTaskPlotMapProps {
  farmId: string;
  plots: SplitPlotItem[];
  // plot_id -> 'A' | 'B', absent = not yet assigned to a side
  sides: Record<string, 'A' | 'B'>;
}

const SIDE_A_COLOR = '#0D3A35';
const SIDE_B_COLOR = '#7A2533';
const UNASSIGNED_COLOR = '#94a3b8';

const DEFAULT_CENTER: LatLng = [20.5937, 78.9629];
const DEFAULT_ZOOM = 5;

const FitBounds = ({ coords }: { coords: LatLng[] }) => {
  const map = useMap();
  useEffect(() => {
    if (coords.length < 2) return;
    const bounds = L.latLngBounds(coords.map(([lat, lng]) => L.latLng(lat, lng)));
    map.fitBounds(bounds, { padding: [30, 30], animate: true });
  }, [coords, map]);
  return null;
};

// Live preview map for the Split Task popup — colors each plot by which side
// (A/B) it's currently assigned to, updating as the user toggles plots, so
// both halves of the split are visible on the map at the same time.
const SplitTaskPlotMap = ({ farmId, plots, sides }: SplitTaskPlotMapProps) => {
  const [apiData, setApiData] = useState<MapApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const plotIds = plots.map((p) => p.plot_id).join(',');

  useEffect(() => {
    if (plots.length === 0) return;
    const BASE_URL = getBaseUrl().replace(/\/$/, '');
    setIsLoading(true);
    setFetchError(null);
    fetch(`${BASE_URL}/farmer_managment/get_plot_map_view_data_for_task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farm_id: farmId, plot_id: plots.map((p) => p.plot_id) }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        return res.json();
      })
      .then((data: MapApiResponse) => { setApiData(data); setIsLoading(false); })
      .catch((err) => { setFetchError(err?.message ?? 'Failed to load map data'); setIsLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId, plotIds]);

  const sideByName = new Map<string, 'A' | 'B' | undefined>(
    plots.map((p) => [p.plot_name, sides[p.plot_id]]),
  );
  const colorForName = (name: string) => {
    const side = sideByName.get(name);
    return side === 'A' ? SIDE_A_COLOR : side === 'B' ? SIDE_B_COLOR : UNASSIGNED_COLOR;
  };

  const farmCoords = apiData?.farm_coordinates ?? [];

  return (
    <div className="relative h-56 w-full overflow-hidden rounded-lg border border-gray-200">
      {isLoading && (
        <div className="absolute inset-0 z-[999] flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
          <span className="text-xs text-gray-500 font-medium">Loading map…</span>
        </div>
      )}
      {!isLoading && fetchError && (
        <div className="absolute inset-0 z-[999] flex flex-col items-center justify-center gap-2 text-red-400">
          <AlertCircle className="w-6 h-6" />
          <span className="text-xs font-medium">{fetchError}</span>
        </div>
      )}
      <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} style={{ height: '100%', width: '100%' }} className="z-0">
        <TileLayer
          attribution='&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />
        {farmCoords.length >= 2 && <FitBounds coords={farmCoords} />}
        {farmCoords.length >= 3 && (
          <Polygon
            positions={farmCoords}
            pathOptions={{ color: '#fde047', fillColor: '#fef9c3', fillOpacity: 0.15, weight: 2 }}
          />
        )}
        {(apiData?.plot_map_data ?? []).map((plot) => {
          const color = colorForName(plot.plot_name);
          return (
            <Polygon
              key={plot.plot_name}
              positions={plot.plot_coordinates}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.4, weight: 2.5 }}
            >
              <Tooltip sticky>
                <span className="font-semibold">{plot.plot_name}</span>
                <br />
                <span className="text-gray-500 text-[11px]">
                  {plot.plot_area} ac · Side {sideByName.get(plot.plot_name) ?? '—'}
                </span>
              </Tooltip>
            </Polygon>
          );
        })}
      </MapContainer>
      <div className="absolute bottom-2 left-2 z-[999] flex items-center gap-3 rounded-lg border border-gray-200 bg-white/90 px-2.5 py-1.5 text-[10px] font-semibold">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SIDE_A_COLOR }} />
          <span className="text-gray-600">Side A</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SIDE_B_COLOR }} />
          <span className="text-gray-600">Side B</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: UNASSIGNED_COLOR }} />
          <span className="text-gray-600">Unassigned</span>
        </div>
      </div>
    </div>
  );
};

export default SplitTaskPlotMap;
