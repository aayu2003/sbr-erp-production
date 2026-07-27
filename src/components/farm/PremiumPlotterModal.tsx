import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MapContainer, TileLayer, Polygon, Polyline,
  CircleMarker, Tooltip, useMap, useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  X, Pencil, Trash2, MapPin, CheckCircle,
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

interface ExistingMapping {
  mapping_name: string;
  mapping_type: string;
  mapping_coordinates: string[];
  shape_details: 'polygon' | 'line' | 'point';
  details?: Record<string, unknown>;
  point_details?: Record<string, unknown>;
}

interface PlottedFeature {
  id: string;
  name: string;
  mappingType?: string;
  pointDetails?: Record<string, string>;
  geometry: SavedGeometry;   // actual shape — may differ from draw intent
  coordinates: [number, number][];
  color: string;
}

interface PremiumPlotterModalProps {
  embedded?: boolean;
  farmId: string;
  farmLabel: string;
  landCoordinates: [number, number][];
  landPlots?: LandPlot[];
  existingMappings?: ExistingMapping[];
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
  rahar:  'var(--crop-rahar-color, #800000)',
  paddy:  'var(--crop-paddy-color, #22c55e)',
  napier: 'var(--crop-napier-color, #2563eb)',
};
const cropPlotColor = (cropType: string | undefined, fallback: string) =>
  cropType ? (CROP_COLORS[cropType.toLowerCase()] ?? fallback) : fallback;

const QUICK_PICKS = [
  'Unwanted Tree', 'Narrow Road', 'Small Shelter',
  'Bore Well', 'Canal', 'Huge Pipe', 'Boundary Wall',
  'Ditch', 'Pond', 'Electric Pole',
];

const POINT_TYPES = [
  'Borewell',
  'Electricity Connection',
  'Transformer',
  'Poles',
  'Electric Fencing Setup',
  'House',
  'Shed',
  'Other (Please Specify)',
] as const;

type PointField = {
  key: string;
  label: string;
  placeholder: string;
};

const POINT_DETAIL_FIELDS: Record<string, PointField[]> = {
  Borewell: [
    { key: 'borewell_depth', label: 'Borewell Depth', placeholder: 'Enter depth (ft)' },
    { key: 'borewell_diameter', label: 'Borewell Diameter', placeholder: 'Enter diameter (inch)' },
    { key: 'pump_make', label: 'Pump Make', placeholder: 'Enter pump make' },
    { key: 'pump_hp', label: 'Pump HP', placeholder: 'Enter HP' },
  ],
  'Electricity Connection': [
    { key: 'connection', label: 'Connection', placeholder: 'Enter connection type' },
    { key: 'consumer_no', label: 'Consumer No.', placeholder: 'Enter consumer number' },
    { key: 'meter_no', label: 'Meter No.', placeholder: 'Enter meter number' },
    { key: 'connected_load', label: 'Connected Load', placeholder: 'Enter connected load' },
  ],
  Transformer: [
    { key: 'transformer_no', label: 'Transformer No.', placeholder: 'Enter transformer number' },
    { key: 'capacity', label: 'Capacity', placeholder: 'Enter capacity (kVA)' },
    { key: 'make', label: 'Make', placeholder: 'Enter manufacturer' },
    { key: 'phase', label: 'Phase', placeholder: 'Enter phase details' },
  ],
  Poles: [
    { key: 'pole_no', label: 'Pole No.', placeholder: 'Enter pole number' },
    { key: 'pole_type', label: 'Pole Type', placeholder: 'Enter pole type' },
    { key: 'height', label: 'Height', placeholder: 'Enter height (ft)' },
    { key: 'condition', label: 'Condition', placeholder: 'Enter current condition' },
  ],
  'Electric Fencing Setup': [
    { key: 'setup_id', label: 'Setup ID', placeholder: 'Enter setup ID' },
    { key: 'fence_length', label: 'Fence Length', placeholder: 'Enter total length' },
    { key: 'energizer_make', label: 'Energizer Make', placeholder: 'Enter energizer make' },
    { key: 'power_source', label: 'Power Source', placeholder: 'Enter power source' },
  ],
  House: [
    { key: 'house_no', label: 'House No. / Name', placeholder: 'Enter house number or name' },
    { key: 'built_up_area', label: 'Built-up Area', placeholder: 'Enter area' },
    { key: 'usage', label: 'Usage', placeholder: 'Enter usage' },
    { key: 'occupancy', label: 'Occupancy', placeholder: 'Enter occupancy details' },
  ],
  Shed: [
    { key: 'shed_no', label: 'Shed No. / Name', placeholder: 'Enter shed number or name' },
    { key: 'shed_type', label: 'Shed Type', placeholder: 'Enter shed type' },
    { key: 'covered_area', label: 'Covered Area', placeholder: 'Enter covered area' },
    { key: 'capacity', label: 'Capacity', placeholder: 'Enter capacity' },
  ],
  'Other (Please Specify)': [
    { key: 'reference_no', label: 'Reference No.', placeholder: 'Enter reference number' },
    { key: 'description', label: 'Description', placeholder: 'Enter description' },
    { key: 'condition', label: 'Condition', placeholder: 'Enter current condition' },
    { key: 'remarks', label: 'Remarks', placeholder: 'Enter remarks' },
  ],
};

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
  onPlacePoint,
  onFinishOpen,     // double-click or done button → open path / dot set
  onClosePolygon,   // user clicked back on first point → real polygon
}: {
  mode: DrawMode;
  active: boolean;
  currentPoints: [number, number][];
  onAddPoint: (pt: [number, number]) => void;
  onPlacePoint: (pt: [number, number]) => void;
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
        onPlacePoint([e.latlng.lat, e.latlng.lng]);
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
  embedded = false,
  farmId,
  farmLabel,
  landCoordinates,
  landPlots = [],
  existingMappings = [],
  onClose,
}: PremiumPlotterModalProps) => {
  const [modalState, setModalState]       = useState<ModalState>('idle');
  const [drawMode, setDrawMode]           = useState<DrawMode>('polygon');
  const [currentPoints, setCurrentPoints] = useState<[number, number][]>([]);
  const [pendingGeometry, setPendingGeometry] = useState<SavedGeometry>('polyline');
  const [features, setFeatures]           = useState<PlottedFeature[]>([]);
  const [featureName, setFeatureName]     = useState('');
  const [selectedPointType, setSelectedPointType] = useState('');
  const [customPointType, setCustomPointType] = useState('');
  const [pointDetails, setPointDetails] = useState<Record<string, string>>({});
  const [editingFeatureId, setEditingFeatureId] = useState<string | null>(null);
  const [editingExistingPointId, setEditingExistingPointId] = useState<string | null>(null);
  const [hiddenExistingPointIds, setHiddenExistingPointIds] = useState<string[]>([]);
  const [existingPointOverrides, setExistingPointOverrides] = useState<Record<string, {
    name: string;
    type: string;
    details: Record<string, string>;
  }>>({});
  const [saving, setSaving]               = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const BASE_URL = getBaseUrl().replace(/\/$/, '');

  const existingPointMappings = existingMappings
    .map((mapping, sourceIndex) => ({ mapping, sourceIndex }))
    .filter(({ mapping }) => mapping.shape_details === 'point')
    .map(({ mapping, sourceIndex }) => {
      const clientId = `saved-point-${sourceIndex}`;
      const override = existingPointOverrides[clientId];
      return {
        ...mapping,
        clientId,
        mapping_name: override?.name ?? mapping.mapping_name,
        mapping_type: override?.type ?? mapping.mapping_type,
        details: override?.details ?? mapping.details ?? mapping.point_details,
        coordinates: mapping.mapping_coordinates
        .map(coordinate => {
          const [lat, lng] = coordinate.split(',').map(Number);
          return [lat, lng] as [number, number];
        })
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)),
      };
    })
    .filter(mapping => !hiddenExistingPointIds.includes(mapping.clientId))
    .filter(mapping => mapping.coordinates.length > 0);

  const allCoords: [number, number][] = [
    ...landCoordinates,
    ...landPlots.flatMap(p => p.plot_coordinates),
    ...existingPointMappings.flatMap(mapping => mapping.coordinates),
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

  const handlePlacePoint = useCallback((pt: [number, number]) => {
    setCurrentPoints([pt]);
    setPendingGeometry('point');
    setFeatureName('');
    setCustomPointType('');
    setPointDetails({});
    setModalState('naming');
    setTimeout(() => nameInputRef.current?.focus(), 60);
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
    const pointType = selectedPointType === 'Other (Please Specify)'
      ? customPointType.trim()
      : selectedPointType;
    if (pendingGeometry === 'point' && !pointType) return;
    if (editingExistingPointId) {
      setExistingPointOverrides(previous => ({
        ...previous,
        [editingExistingPointId]: {
          name: featureName.trim(),
          type: pointType,
          details: pointDetails,
        },
      }));
      setCurrentPoints([]);
      setFeatureName('');
      setSelectedPointType('');
      setCustomPointType('');
      setPointDetails({});
      setEditingExistingPointId(null);
      setPendingGeometry('polyline');
      setModalState('idle');
      return;
    }
    setFeatures(prev => {
      const existingFeature = editingFeatureId
        ? prev.find(feature => feature.id === editingFeatureId)
        : undefined;
      const nextFeature: PlottedFeature = {
        id: existingFeature?.id ?? uid(),
        name: featureName.trim(),
        mappingType: pendingGeometry === 'point' ? pointType : undefined,
        pointDetails: pendingGeometry === 'point' ? pointDetails : undefined,
        geometry: pendingGeometry,
        coordinates: currentPoints,
        color: existingFeature?.color ?? FEATURE_COLORS[prev.length % FEATURE_COLORS.length],
      };
      return existingFeature
        ? prev.map(feature => feature.id === existingFeature.id ? nextFeature : feature)
        : [...prev, nextFeature];
    });
    setCurrentPoints([]);
    setFeatureName('');
    setSelectedPointType('');
    setCustomPointType('');
    setPointDetails({});
    setEditingFeatureId(null);
    setEditingExistingPointId(null);
    setPendingGeometry('polyline');
    setModalState('idle');
  };

  const editFeature = (feature: PlottedFeature) => {
    setEditingFeatureId(feature.id);
    setEditingExistingPointId(null);
    setCurrentPoints(feature.coordinates);
    setPendingGeometry(feature.geometry);
    setFeatureName(feature.name);
    setPointDetails(feature.pointDetails ?? {});
    if (feature.geometry === 'point') {
      setDrawMode('point');
      const knownPointType = POINT_TYPES
        .filter(pointType => pointType !== 'Other (Please Specify)')
        .some(pointType => pointType === feature.mappingType);
      setSelectedPointType(knownPointType ? (feature.mappingType ?? '') : 'Other (Please Specify)');
      setCustomPointType(knownPointType ? '' : (feature.mappingType ?? ''));
    } else {
      setDrawMode(feature.geometry === 'polygon' ? 'polygon' : 'polyline');
      setSelectedPointType('');
      setCustomPointType('');
    }
    setModalState('naming');
    setTimeout(() => nameInputRef.current?.focus(), 60);
  };

  const editExistingPoint = (mapping: (typeof existingPointMappings)[number]) => {
    const mappingType = mapping.mapping_type || 'Other';
    const knownPointType = POINT_TYPES
      .filter(pointType => pointType !== 'Other (Please Specify)')
      .find(pointType => pointType.toLowerCase() === mappingType.toLowerCase());
    const rawDetails = mapping.details ?? {};
    setEditingFeatureId(null);
    setEditingExistingPointId(mapping.clientId);
    setDrawMode('point');
    setCurrentPoints(mapping.coordinates);
    setPendingGeometry('point');
    setFeatureName(mapping.mapping_name);
    setSelectedPointType(knownPointType ?? 'Other (Please Specify)');
    setCustomPointType(knownPointType ? '' : mappingType);
    setPointDetails(Object.fromEntries(
      Object.entries(rawDetails).map(([key, value]) => [key, value == null ? '' : String(value)])
    ));
    setModalState('naming');
    setTimeout(() => nameInputRef.current?.focus(), 60);
  };

  const cancelCurrent = () => {
    setCurrentPoints([]);
    setFeatureName('');
    if (drawMode === 'point') {
      setSelectedPointType('');
      setCustomPointType('');
      setPointDetails({});
    }
    setEditingFeatureId(null);
    setEditingExistingPointId(null);
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
          mapping_type:        (f.mappingType || f.name).toLowerCase(),
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
  const pointTypeReady = selectedPointType !== 'Other (Please Specify)' || customPointType.trim().length > 0;
  const canSaveFeature = featureName.trim().length > 0
    && currentPoints.length > 0
    && (pendingGeometry !== 'point' || (selectedPointType.length > 0 && pointTypeReady));

  // Hint shown in the drawing banner
  const drawingHint =
    drawMode === 'point'   ? 'Click on the map to place the point.' :
    drawMode === 'polyline'? 'Click to add points. Double-click to finish.' :
    currentPoints.length < 3
      ? 'Click to add points.'
      : 'Click the first point to close the shape — or double-click to save as open path.';

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={embedded
      ? 'flex h-full min-h-0 w-full items-stretch'
      : 'fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-3'
    }>
      <div
        className={`flex w-full flex-col overflow-hidden bg-white ${
          embedded ? 'h-full' : 'max-w-6xl rounded-2xl shadow-2xl'
        }`}
        style={{ height: embedded ? '100%' : '92vh' }}
      >

        {/* Header */}
        {!embedded && (
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0D3A35]">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Premium Plotter</h2>
                <p className="text-[11px] text-slate-500">{farmLabel || farmId}</p>
              </div>
            </div>
            <button onClick={onClose} className="rounded-md p-1.5 transition-colors hover:bg-slate-100">
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex min-h-0 flex-1 bg-slate-50/70">

          {/* ── Map ── */}
          <div
            className={embedded
              ? 'relative m-4 min-h-0 min-w-0 basis-[70%] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm'
              : 'relative min-h-0 flex-1'
            }
            style={{ cursor: isDrawing ? 'crosshair' : 'default' }}
          >
            {/* Drawing banner */}
            {isDrawing && (
              <div className="pointer-events-none absolute left-1/2 top-3 z-[1000] flex max-w-xs -translate-x-1/2 items-center gap-2 rounded-full bg-[#0D3A35] px-4 py-2 text-center text-xs font-medium text-white shadow-lg">
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
                  pathOptions={{ color: 'var(--land-boundary-color, #fde047)', fillColor: 'var(--land-boundary-fill, #fef9c3)', fillOpacity: 0.28, weight: 3 }}
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

              {/* Existing saved point mappings */}
              {existingPointMappings.flatMap((mapping, mappingIndex) =>
                mapping.coordinates.map((coordinate, coordinateIndex) => (
                  <CircleMarker
                    key={`existing-point-${mappingIndex}-${coordinateIndex}`}
                    center={coordinate}
                    radius={7}
                    pathOptions={{
                      color: '#ffffff',
                      fillColor: '#0D3A35',
                      fillOpacity: 1,
                      weight: 2.5,
                    }}
                  >
                    <Tooltip permanent direction="top" offset={[0, -8]} opacity={1} className="plot-label-tooltip">
                      <span className="text-[11px] font-bold text-slate-900">{mapping.mapping_name}</span>
                    </Tooltip>
                  </CircleMarker>
                ))
              )}

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
                    pathOptions={{ color: '#ffffff', fillColor: f.color, fillOpacity: 1, weight: 2.5 }}
                  >
                    <Tooltip permanent direction="top" offset={[0, -8]} opacity={1} className="plot-label-tooltip">
                      <span className="text-[11px] font-bold text-slate-900">{f.name}</span>
                    </Tooltip>
                  </CircleMarker>
                ));
              })}

              {/* ── In-progress drawing ── */}
              {isDrawing && currentPoints.length > 0 && (
                <>
                  {/* Connecting lines between points */}
                  {currentPoints.length >= 2 && (
                    <Polyline
                      positions={currentPoints}
                      pathOptions={{ color: '#0D3A35', weight: 2, dashArray: '5 4' }}
                    />
                  )}

                  {/* All intermediate points */}
                  {currentPoints.slice(1).map((pt, i) => (
                    <CircleMarker key={`mid-${i}`} center={pt} radius={5}
                      pathOptions={{ color: '#0D3A35', fillColor: '#fff', fillOpacity: 1, weight: 2 }} />
                  ))}

                  {/* First point — larger + green ring when closeable */}
                  <CircleMarker
                    center={currentPoints[0]}
                    radius={canClose ? 9 : 5}
                    pathOptions={{
                      color: '#0D3A35',
                      fillColor: canClose ? '#0D3A35' : '#fff',
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
                onPlacePoint={handlePlacePoint}
                onFinishOpen={handleFinishOpen}
                onClosePolygon={handleClosePolygon}
              />
              <FitBounds coords={allCoords.length > 0 ? allCoords : [[20.5937, 78.9629]]} />
            </MapContainer>

            {/* ── Naming overlay ── */}
            {isNaming && (
              <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-slate-950/45 p-4">
                <div className="max-h-[calc(100%-2rem)] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
                  <div>
                    <h3 className="font-bold text-slate-900">
                      {pendingGeometry === 'point'
                        ? editingFeatureId || editingExistingPointId ? 'Edit Point Information' : 'Point Information'
                        : editingFeatureId || editingExistingPointId ? 'Edit Feature' : 'What is this?'
                      }
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {pendingGeometry === 'point'
                        ? selectedPointType
                        : `${currentPoints.length} point${currentPoints.length !== 1 ? 's' : ''}`
                      }
                      {pendingGeometry !== 'point' && (
                        <>
                          &nbsp;·&nbsp;
                          <span className="font-medium capitalize text-[#0D3A35]">{pendingGeometry}</span>
                        </>
                      )}
                    </p>
                  </div>

                  {pendingGeometry === 'point' ? (
                    <>
                      <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Latitude</p>
                          <p className="mt-1 text-xs font-semibold text-slate-700">
                            {currentPoints[0]?.[0].toFixed(6)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Longitude</p>
                          <p className="mt-1 text-xs font-semibold text-slate-700">
                            {currentPoints[0]?.[1].toFixed(6)}
                          </p>
                        </div>
                      </div>
                      {selectedPointType === 'Other (Please Specify)' && (
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                            Specify point type
                          </span>
                          <input
                            type="text"
                            placeholder="Enter point type"
                            value={customPointType}
                            onChange={event => setCustomPointType(event.target.value)}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#0D3A35] focus:ring-2 focus:ring-[#0D3A35]/15"
                          />
                        </label>
                      )}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {(POINT_DETAIL_FIELDS[selectedPointType] ?? []).map(field => (
                          <label key={field.key} className="block">
                            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                              {field.label}
                            </span>
                            <input
                              type="text"
                              placeholder={field.placeholder}
                              value={pointDetails[field.key] ?? ''}
                              onChange={event => {
                                const value = event.target.value;
                                setPointDetails(previous => ({ ...previous, [field.key]: value }));
                              }}
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#0D3A35] focus:ring-2 focus:ring-[#0D3A35]/15"
                            />
                          </label>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_PICKS.map(pick => (
                        <button key={pick} type="button" onClick={() => setFeatureName(pick)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                            featureName === pick
                              ? 'border-[#0D3A35] bg-[#0D3A35] text-white'
                              : 'border-slate-200 text-slate-600 hover:border-[#0D3A35]/40 hover:text-[#0D3A35]'
                          }`}
                        >
                          {pick}
                        </button>
                      ))}
                    </div>
                  )}

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                      {pendingGeometry === 'point' ? 'Point name / identification number' : 'Feature name'}
                    </span>
                    <input
                      ref={nameInputRef}
                      type="text"
                      placeholder={pendingGeometry === 'point' ? `Enter ${selectedPointType} name or ID` : 'Type a custom name…'}
                      value={featureName}
                      onChange={e => setFeatureName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && canSaveFeature && handleSaveFeature()}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#0D3A35] focus:ring-2 focus:ring-[#0D3A35]/15"
                    />
                  </label>

                  <div className="flex gap-2">
                    <button type="button" onClick={cancelCurrent}
                      className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50">
                      Cancel
                    </button>
                    <button type="button" onClick={handleSaveFeature} disabled={!canSaveFeature}
                      className="flex-1 rounded-lg bg-[#0D3A35] py-2 text-sm font-semibold text-white transition-colors hover:bg-[#092b27] disabled:cursor-not-allowed disabled:opacity-40">
                      {editingFeatureId || editingExistingPointId
                        ? 'Update'
                        : pendingGeometry === 'point' ? 'Add Point' : 'Save Feature'
                      }
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Right panel ── */}
          <div className={embedded
            ? 'flex min-w-[300px] basis-[30%] shrink-0 flex-col border-l border-slate-200 bg-white'
            : 'flex w-64 shrink-0 flex-col border-l border-slate-200 bg-slate-50'
          }>

            <div className="space-y-4 border-b border-slate-200 bg-white p-4">
              {modalState === 'idle' && (
                <>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Choose draw type
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(TYPE_CONFIG) as DrawMode[]).map(type => {
                      const cfg = TYPE_CONFIG[type];
                      const active = drawMode === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setDrawMode(type);
                            setSelectedPointType('');
                            setCustomPointType('');
                            setPointDetails({});
                            if (type !== 'point') startDrawing(type);
                          }}
                          className={`flex flex-col items-center gap-1.5 rounded-lg border py-3 text-xs font-semibold transition-colors ${
                            active
                              ? 'border-[#0D3A35] bg-[#0D3A35] text-white shadow-sm'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-[#0D3A35]/40 hover:text-[#0D3A35]'
                          }`}
                        >
                          <cfg.Icon className="h-4 w-4" />
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                  {drawMode === 'point' && (
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-slate-700">Point type</span>
                      <select
                        value={selectedPointType}
                        onChange={event => {
                          const value = event.target.value;
                          setSelectedPointType(value);
                          setPointDetails({});
                          if (value) startDrawing('point');
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-[#0D3A35] focus:ring-2 focus:ring-[#0D3A35]/15"
                      >
                        <option value="">Select point type</option>
                        {POINT_TYPES.map(pointType => (
                          <option key={pointType} value={pointType}>{pointType}</option>
                        ))}
                      </select>
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                        Select a type, then tap its location on the map.
                      </p>
                    </label>
                  )}
                </>
              )}

              {isDrawing && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#0D3A35]" />
                    <span className="text-xs font-bold capitalize text-[#0D3A35]">
                      Drawing {drawMode}…
                    </span>
                  </div>

                  {/* Polygon-specific close hint */}
                  {drawMode === 'polygon' && (
                    <div className={`rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
                      canClose
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border border-[#0D3A35]/10 bg-[#0D3A35]/5 text-[#0D3A35]'
                    }`}>
                      {canClose
                        ? '🟢 Click the first point (green) to close the polygon.'
                        : `Add ${3 - currentPoints.length} more point${3 - currentPoints.length !== 1 ? 's' : ''} to enable closing.`
                      }
                    </div>
                  )}

                  <p className="text-center text-[11px] text-slate-500">
                    {currentPoints.length} point{currentPoints.length !== 1 ? 's' : ''} added
                  </p>

                  {canFinishOpen && (
                    <button type="button" onClick={handleFinishOpen}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0D3A35] py-2 text-xs font-bold text-white transition-colors hover:bg-[#092b27]">
                      <CheckCircle className="w-3.5 h-3.5" />
                      {drawMode === 'polygon' ? 'Finish as Open Path' : 'Done Drawing'}
                    </button>
                  )}

                  <button type="button" onClick={cancelCurrent}
                    className="w-full rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50">
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Feature list */}
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Mapped Features ({existingPointMappings.length + features.length})
              </p>

              {existingPointMappings.length === 0 && features.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-10 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0D3A35]/8">
                    <Layers className="h-5 w-5 text-[#0D3A35]" />
                  </div>
                  <p className="text-xs font-semibold text-slate-600">Nothing mapped yet</p>
                  <p className="text-[11px] leading-relaxed text-slate-400">Choose Area or Line to draw,<br />or select a Point type</p>
                </div>
              ) : (
                <>
                  {existingPointMappings.map((mapping, index) => (
                    <div
                      key={`saved-${mapping.mapping_name}-${index}`}
                      className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
                    >
                      <span className="h-3 w-3 shrink-0 rounded-full bg-[#0D3A35]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-800">{mapping.mapping_name}</p>
                        <p className="text-[10px] capitalize text-slate-500">
                          {mapping.mapping_type || 'Point'} · Saved
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => editExistingPoint(mapping)}
                        className="rounded p-1 text-slate-500 transition hover:bg-[#0D3A35]/8 hover:text-[#0D3A35]"
                        aria-label={`Edit ${mapping.mapping_name}`}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setHiddenExistingPointIds(previous => [...previous, mapping.clientId])}
                        className="rounded p-1 text-red-500 transition hover:bg-red-50"
                        aria-label={`Delete ${mapping.mapping_name}`}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {features.map(f => (
                    <div key={f.id}
                      className="group flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-[#0D3A35]/30"
                    >
                      {/* Shape indicator */}
                      <span
                        className={`shrink-0 ${f.geometry === 'point' ? 'w-3 h-3 rounded-full' : f.geometry === 'polygon' ? 'w-3 h-3 rounded-sm' : 'w-4 h-1 rounded-full'}`}
                        style={{ background: f.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-800">{f.name}</p>
                        <p className="text-[10px] capitalize text-slate-500">
                          {f.mappingType || f.geometry}&nbsp;·&nbsp;{f.coordinates.length} pt{f.coordinates.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => editFeature(f)}
                        className="rounded p-1 text-slate-500 transition hover:bg-[#0D3A35]/8 hover:text-[#0D3A35]"
                        aria-label={`Edit ${f.name}`}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button"
                        onClick={() => setFeatures(prev => prev.filter(x => x.id !== f.id))}
                        className="rounded p-1 text-red-500 transition hover:bg-red-50"
                        aria-label={`Remove ${f.name}`}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>

            {features.length > 0 && (
              <div className="shrink-0 border-t border-slate-200 bg-white p-4">
                <button
                  type="button"
                  onClick={handleSaveAll}
                  disabled={saving}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0D3A35] py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#092b27] disabled:cursor-not-allowed disabled:opacity-50"
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
