import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MapContainer, TileLayer, Polygon, Polyline,
  CircleMarker, useMap, useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  X, Plus, Trash2, Map, MapPin, CheckCircle,
  Layers, Hexagon, Minus, Sparkles, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import getBaseUrl from '@/lib/config';

// ─── Types ────────────────────────────────────────────────────────────────────

type DrawMode = 'polygon' | 'polyline' | 'point';
type ModalState = 'idle' | 'drawing' | 'naming';

// What geometry actually got saved (polygon only if user closed the loop)
type SavedGeometry = 'polygon' | 'polyline' | 'point';

interface LandPlot {
  plot_name: string;
  plot_area: number;
  plot_coordinates: [number, number][];
  crop_type?: string;
}

interface PlottedFeature {
  id: string;
  name: string;
  geometry: SavedGeometry;   // actual shape — may differ from draw intent
  coordinates: [number, number][];
  color: string;
}

interface PremiumPlotterModalProps {
  farmId: string;
  farmLabel: string;
  landCoordinates: [number, number][];
  landPlots?: LandPlot[];
  onClose: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FEATURE_COLORS = [
  '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316',
];

const PLOT_COLORS = [
  '#f59e0b', '#a855f7', '#06b6d4', '#ec4899',
  '#f97316', '#14b8a6', '#6366f1', '#84cc16',
];

const CROP_COLORS: Record<string, string> = {
  rahar:  '#f97316',
  paddy:  '#f59e0b',
  napier: '#22c55e',
};
const cropPlotColor = (cropType: string | undefined, fallback: string) =>
  cropType ? (CROP_COLORS[cropType] ?? fallback) : fallback;

const QUICK_PICKS = [
  'Unwanted Tree', 'Narrow Road', 'Small Shelter',
  'Bore Well', 'Canal', 'Huge Pipe', 'Boundary Wall',
  'Ditch', 'Pond', 'Electric Pole',
];

const TYPE_CONFIG: Record<DrawMode, {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  minPoints: number;
}> = {
  polygon:  { label: 'Area',  Icon: Hexagon, minPoints: 3 },
  polyline: { label: 'Line',  Icon: Minus,   minPoints: 2 },
  point:    { label: 'Point', Icon: MapPin,  minPoints: 1 },
};

// Pixel distance within which clicking counts as "clicking the first point"
const SNAP_RADIUS_PX = 14;

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// ─── FitBounds ────────────────────────────────────────────────────────────────

const FitBounds = ({ coords }: { coords: [number, number][] }) => {
  const map = useMap();
  useEffect(() => {
    if (coords.length > 0)
      map.fitBounds(L.latLngBounds(coords as L.LatLngTuple[]), { padding: [40, 40] });
  }, [map]);
  return null;
};

// ─── Drawing handler ──────────────────────────────────────────────────────────

const DrawingHandler = ({
  mode,
  active,
  currentPoints,
  onAddPoint,
  onFinishOpen,     // double-click or done button → open path / dot set
  onClosePolygon,   // user clicked back on first point → real polygon
}: {
  mode: DrawMode;
  active: boolean;
  currentPoints: [number, number][];
  onAddPoint: (pt: [number, number]) => void;
  onFinishOpen: () => void;
  onClosePolygon: () => void;
}) => {
  const map = useMap();

  const nearFirstPoint = useCallback((clickLatLng: L.LatLng): boolean => {
    if (currentPoints.length < 3) return false; // need ≥3 to close a polygon
    const [lat, lng] = currentPoints[0];
    const firstPx  = map.latLngToContainerPoint(L.latLng(lat, lng));
    const clickPx  = map.latLngToContainerPoint(clickLatLng);
    return firstPx.distanceTo(clickPx) <= SNAP_RADIUS_PX;
  }, [map, currentPoints]);

  useMapEvents({
    click(e) {
      if (!active) return;

      if (mode === 'point') {
        onAddPoint([e.latlng.lat, e.latlng.lng]);
        onFinishOpen();
        return;
      }

      if (mode === 'polygon' && nearFirstPoint(e.latlng)) {
        onClosePolygon();
        return;
      }

      onAddPoint([e.latlng.lat, e.latlng.lng]);
    },
    dblclick(e) {
      if (!active || mode === 'point') return;
      e.originalEvent.preventDefault();
      onFinishOpen();
    },
  });

  return null;
};

// ─── Main modal ───────────────────────────────────────────────────────────────

const PremiumPlotterModal = ({
  farmId,
  farmLabel,
  landCoordinates,
  landPlots = [],
  onClose,
}: PremiumPlotterModalProps) => {
  const [modalState, setModalState]       = useState<ModalState>('idle');
  const [drawMode, setDrawMode]           = useState<DrawMode>('polygon');
  const [currentPoints, setCurrentPoints] = useState<[number, number][]>([]);
  const [pendingGeometry, setPendingGeometry] = useState<SavedGeometry>('polyline');
  const [features, setFeatures]           = useState<PlottedFeature[]>([]);
  const [featureName, setFeatureName]     = useState('');
  const [saving, setSaving]               = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const BASE_URL = getBaseUrl().replace(/\/$/, '');

  const allCoords: [number, number][] = [
    ...landCoordinates,
    ...landPlots.flatMap(p => p.plot_coordinates),
  ];
  const center: [number, number] =
    allCoords.length > 0
      ? [
          allCoords.reduce((s, c) => s + c[0], 0) / allCoords.length,
          allCoords.reduce((s, c) => s + c[1], 0) / allCoords.length,
        ]
      : [20.5937, 78.9629];

  // ── Drawing callbacks ────────────────────────────────────────────────────────

  const startDrawing = (mode: DrawMode) => {
    setDrawMode(mode);
    setCurrentPoints([]);
    setModalState('drawing');
  };

  const handleAddPoint = useCallback((pt: [number, number]) => {
    setCurrentPoints(prev => [...prev, pt]);
  }, []);

  // User closed the polygon by clicking the first point
  const handleClosePolygon = useCallback(() => {
    setPendingGeometry('polygon');
    setModalState('naming');
    setFeatureName('');
    setTimeout(() => nameInputRef.current?.focus(), 60);
  }, []);

  // User finished without closing (double-click or Done button)
  const handleFinishOpen = useCallback(() => {
    if (currentPoints.length === 0) return;
    // Resolve actual geometry based on point count
    const geometry: SavedGeometry =
      drawMode === 'point'    ? 'point'
      : currentPoints.length >= 2 ? 'polyline'
      : 'point'; // single dot
    setPendingGeometry(geometry);
    setModalState('naming');
    setFeatureName('');
    setTimeout(() => nameInputRef.current?.focus(), 60);
  }, [currentPoints, drawMode]);

  const handleSaveFeature = () => {
    if (!featureName.trim() || currentPoints.length === 0) return;
    setFeatures(prev => [
      ...prev,
      {
        id: uid(),
        name: featureName.trim(),
        geometry: pendingGeometry,
        coordinates: currentPoints,
        color: FEATURE_COLORS[prev.length % FEATURE_COLORS.length],
      },
    ]);
    setCurrentPoints([]);
    setFeatureName('');
    setPendingGeometry('polyline');
    setModalState('idle');
  };

  const cancelCurrent = () => {
    setCurrentPoints([]);
    setFeatureName('');
    setModalState('idle');
  };

  const handleSaveAll = async () => {
    if (features.length === 0) return;
    setSaving(true);
    try {
      const shapeMap: Record<SavedGeometry, string> = {
        polygon:  'polygon',
        polyline: 'line',
        point:    'point',
      };

      const payload = {
        farm_id: farmId,
        additional_mapping: features.map(f => ({
          mapping_name:        f.name,
          mapping_coordinates: f.coordinates.map(([lat, lng]) => `${lat},${lng}`),
          mapping_type:        f.name.toLowerCase(),
          shape_details:       shapeMap[f.geometry],
        })),
      };

      const res = await fetch(`${BASE_URL}/farmer_managment/add_extra_mapping_to_farm`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.message || 'Save failed');

      toast.success(`${features.length} feature${features.length !== 1 ? 's' : ''} saved to farm`);
      setFeatures([]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save features');
    } finally {
      setSaving(false);
    }
  };

  const isDrawing = modalState === 'drawing';
  const isNaming  = modalState === 'naming';
  const canClose  = drawMode === 'polygon' && currentPoints.length >= 3;
  const canFinishOpen = currentPoints.length >= TYPE_CONFIG[drawMode].minPoints;

  // Hint shown in the drawing banner
  const drawingHint =
    drawMode === 'point'   ? 'Click on the map to place the point.' :
    drawMode === 'polyline'? 'Click to add points. Double-click to finish.' :
    currentPoints.length < 3
      ? 'Click to add points.'
      : 'Click the first point to close the shape — or double-click to save as open path.';

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-3">
      <div
        className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ height: '92vh' }}
      >

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Premium Plotter</h2>
              <p className="text-[11px] text-gray-400">{farmLabel || farmId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">

          {/* ── Map ── */}
          <div
            className="flex-1 relative min-h-0"
            style={{ cursor: isDrawing ? 'crosshair' : 'default' }}
          >
            {/* Drawing banner */}
            {isDrawing && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-violet-700 text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg flex items-center gap-2 max-w-xs text-center pointer-events-none">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
                {drawingHint}
              </div>
            )}

            <MapContainer
              key="premium-plotter-map"
              center={center}
              zoom={15}
              style={{ height: '100%', width: '100%' }}
              zoomControl
              dragging={!isDrawing}
              scrollWheelZoom
              doubleClickZoom={false}
              attributionControl={false}
            >
              <TileLayer
                url="https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                subdomains={['0', '1', '2', '3']}
                maxZoom={21}
              />

              {/* Land boundary */}
              {landCoordinates.length >= 3 && (
                <Polygon
                  positions={landCoordinates}
                  pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.06, weight: 2.5 }}
                />
              )}

              {/* Existing plots — colored by crop if assigned */}
              {landPlots.map((plot, i) => {
                const c = cropPlotColor(plot.crop_type, PLOT_COLORS[i % PLOT_COLORS.length]);
                return plot.plot_coordinates.length >= 3 ? (
                  <Polygon
                    key={i}
                    positions={plot.plot_coordinates}
                    pathOptions={{
                      color: c, fillColor: c,
                      fillOpacity: plot.crop_type ? 0.35 : 0.12,
                      weight: 1.5, dashArray: plot.crop_type ? undefined : '5 4',
                    }}
                  />
                ) : null;
              })}

              {/* Saved features */}
              {features.map(f => {
                if (f.geometry === 'polygon' && f.coordinates.length >= 3)
                  return (
                    <Polygon key={f.id} positions={f.coordinates}
                      pathOptions={{ color: f.color, fillColor: f.color, fillOpacity: 0.28, weight: 2.5 }} />
                  );
                if (f.geometry === 'polyline' && f.coordinates.length >= 2)
                  return (
                    <Polyline key={f.id} positions={f.coordinates}
                      pathOptions={{ color: f.color, weight: 3 }} />
                  );
                // point or single dot
                return f.coordinates.map((pt, i) => (
                  <CircleMarker key={`${f.id}-${i}`} center={pt} radius={7}
                    pathOptions={{ color: f.color, fillColor: f.color, fillOpacity: 0.9, weight: 2.5 }} />
                ));
              })}

              {/* ── In-progress drawing ── */}
              {isDrawing && currentPoints.length > 0 && (
                <>
                  {/* Connecting lines between points */}
                  {currentPoints.length >= 2 && (
                    <Polyline
                      positions={currentPoints}
                      pathOptions={{ color: '#7c3aed', weight: 2, dashArray: '5 4' }}
                    />
                  )}

                  {/* All intermediate points */}
                  {currentPoints.slice(1).map((pt, i) => (
                    <CircleMarker key={`mid-${i}`} center={pt} radius={5}
                      pathOptions={{ color: '#7c3aed', fillColor: '#fff', fillOpacity: 1, weight: 2 }} />
                  ))}

                  {/* First point — larger + green ring when closeable */}
                  <CircleMarker
                    center={currentPoints[0]}
                    radius={canClose ? 9 : 5}
                    pathOptions={{
                      color: canClose ? '#22c55e' : '#7c3aed',
                      fillColor: canClose ? '#22c55e' : '#fff',
                      fillOpacity: 1,
                      weight: 2.5,
                    }}
                  />
                </>
              )}

              <DrawingHandler
                mode={drawMode}
                active={isDrawing}
                currentPoints={currentPoints}
                onAddPoint={handleAddPoint}
                onFinishOpen={handleFinishOpen}
                onClosePolygon={handleClosePolygon}
              />
              <FitBounds coords={allCoords.length > 0 ? allCoords : [[20.5937, 78.9629]]} />
            </MapContainer>

            {/* ── Naming overlay ── */}
            {isNaming && (
              <div className="absolute inset-0 z-[1100] bg-black/40 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
                  <div>
                    <h3 className="font-bold text-gray-900">What is this?</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {currentPoints.length} point{currentPoints.length !== 1 ? 's' : ''}
                      &nbsp;·&nbsp;
                      <span className="capitalize font-medium text-violet-600">{pendingGeometry}</span>
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_PICKS.map(pick => (
                      <button key={pick} type="button" onClick={() => setFeatureName(pick)}
                        className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                          featureName === pick
                            ? 'bg-violet-600 border-violet-600 text-white'
                            : 'border-gray-200 text-gray-600 hover:border-violet-300 hover:text-violet-700'
                        }`}
                      >
                        {pick}
                      </button>
                    ))}
                  </div>

                  <input
                    ref={nameInputRef}
                    type="text"
                    placeholder="Or type a custom name…"
                    value={featureName}
                    onChange={e => setFeatureName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveFeature()}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />

                  <div className="flex gap-2">
                    <button type="button" onClick={cancelCurrent}
                      className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                    <button type="button" onClick={handleSaveFeature} disabled={!featureName.trim()}
                      className="flex-1 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      Save Feature
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Right panel ── */}
          <div className="w-64 border-l border-gray-100 flex flex-col bg-gray-50 shrink-0">

            <div className="p-3 border-b border-gray-100 bg-white space-y-3">
              {modalState === 'idle' && (
                <>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Choose draw type
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(Object.keys(TYPE_CONFIG) as DrawMode[]).map(type => {
                      const cfg = TYPE_CONFIG[type];
                      const active = drawMode === type;
                      return (
                        <button key={type} type="button" onClick={() => setDrawMode(type)}
                          className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border text-[10px] font-semibold transition-colors ${
                            active
                              ? 'bg-violet-600 border-violet-600 text-white'
                              : 'bg-white border-gray-200 text-gray-500 hover:border-violet-300 hover:text-violet-700'
                          }`}
                        >
                          <cfg.Icon className="w-3.5 h-3.5" />
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                  <button type="button" onClick={() => startDrawing(drawMode)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-colors shadow-sm">
                    <Plus className="w-3.5 h-3.5" />
                    Add New Feature
                  </button>
                </>
              )}

              {isDrawing && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse shrink-0" />
                    <span className="text-xs font-bold text-violet-700 capitalize">
                      Drawing {drawMode}…
                    </span>
                  </div>

                  {/* Polygon-specific close hint */}
                  {drawMode === 'polygon' && (
                    <div className={`rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
                      canClose
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-violet-50 text-violet-700'
                    }`}>
                      {canClose
                        ? '🟢 Click the first point (green) to close the polygon.'
                        : `Add ${3 - currentPoints.length} more point${3 - currentPoints.length !== 1 ? 's' : ''} to enable closing.`
                      }
                    </div>
                  )}

                  <p className="text-[11px] text-gray-400 text-center">
                    {currentPoints.length} point{currentPoints.length !== 1 ? 's' : ''} added
                  </p>

                  {canFinishOpen && (
                    <button type="button" onClick={handleFinishOpen}
                      className="w-full py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition-colors flex items-center justify-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" />
                      {drawMode === 'polygon' ? 'Finish as Open Path' : 'Done Drawing'}
                    </button>
                  )}

                  <button type="button" onClick={cancelCurrent}
                    className="w-full py-1.5 rounded-xl border border-gray-200 text-gray-500 text-xs font-medium hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Feature list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Mapped Features ({features.length})
              </p>

              {features.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                  <Layers className="w-8 h-8 text-gray-200" />
                  <p className="text-xs text-gray-400">Nothing mapped yet</p>
                  <p className="text-[11px] text-gray-300">Pick a type and click<br />"Add New Feature"</p>
                </div>
              ) : (
                features.map(f => (
                  <div key={f.id}
                    className="flex items-center gap-2.5 bg-white rounded-lg border border-gray-100 px-3 py-2.5 group hover:border-gray-200 transition-colors"
                  >
                    {/* Shape indicator */}
                    <span
                      className={`shrink-0 ${f.geometry === 'point' ? 'w-3 h-3 rounded-full' : f.geometry === 'polygon' ? 'w-3 h-3 rounded-sm' : 'w-4 h-1 rounded-full'}`}
                      style={{ background: f.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{f.name}</p>
                      <p className="text-[10px] text-gray-400 capitalize">
                        {f.geometry}&nbsp;·&nbsp;{f.coordinates.length} pt{f.coordinates.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <button type="button"
                      onClick={() => setFeatures(prev => prev.filter(x => x.id !== f.id))}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50"
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {features.length > 0 && (
              <div className="p-3 border-t border-gray-100 bg-white shrink-0">
                <button
                  type="button"
                  onClick={handleSaveAll}
                  disabled={saving}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                >
                  {saving
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                    : `Save All to Farm (${features.length})`
                  }
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PremiumPlotterModal;
