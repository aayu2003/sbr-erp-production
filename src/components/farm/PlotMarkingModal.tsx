import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  X, Save, MapPin, Loader2, UploadCloud, Check, AlertCircle, Pencil, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import getBaseUrl from '@/lib/config';
import { parseKmlFile } from '@/lib/kmlParser';

const BASE_URL = getBaseUrl().replace(/\/$/, '');

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
type LatLng = [number, number];

export type PlotData = {
  plot_number: string;
  acres: number;
  coordinates: LatLng[];
};

// Internal-only — carries plot_id so saved plots can be edited/deleted. Kept separate from
// the exported PlotData (used by the onSave callback) so that public contract stays unchanged.
type SavedPlotItem = PlotData & { plot_id: string };

type ApiPlot = {
  plot_id: string;
  plot_name: string;
  plot_area: number;
  plot_coordinates: LatLng[];
  created_at?: string;
};

export type PlotMarkingModalProps = {
  farmId: string;
  farmLabel: string;
  farmTotalAcres: number;
  initialCoordinates: LatLng[];
  initialPlots?: ApiPlot[];
  onClose: () => void;
  onSave?: (plot: PlotData) => void;
};

type KmlPlot = {
  kmlName: string;
  coordinates: LatLng[];
  area: number;
};

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────
const PLOT_COLORS = [
  '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#f97316',
  '#14b8a6', '#6366f1', '#84cc16', '#ef4444', '#3b82f6',
];
const plotColor = (i: number) => PLOT_COLORS[i % PLOT_COLORS.length];

const BATCH_SIZE = 10;

// ─────────────────────────────────────────────────────────────
// GEODESIC AREA → ACRES
// Uses the spherical excess formula; accurate enough for farm plots.
// ─────────────────────────────────────────────────────────────
const calculateAcres = (coords: LatLng[]): number => {
  if (coords.length < 3) return 0;
  const R = 6371000; // Earth radius in metres
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lat1 = coords[i][0] * (Math.PI / 180);
    const lat2 = coords[j][0] * (Math.PI / 180);
    const dLon = (coords[j][1] - coords[i][1]) * (Math.PI / 180);
    area += dLon * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs((area * R * R) / 2) / 4046.856;
};

// ─────────────────────────────────────────────────────────────
// MAP HELPERS
// ─────────────────────────────────────────────────────────────
const centerOf = (coords: LatLng[]): LatLng => {
  if (!coords.length) return [20.5937, 78.9629];
  return [
    coords.reduce((s, c) => s + c[0], 0) / coords.length,
    coords.reduce((s, c) => s + c[1], 0) / coords.length,
  ];
};

const FitBounds = ({ coords }: { coords: LatLng[] }) => {
  const map = useMap();
  useEffect(() => {
    if (coords.length > 0)
      map.fitBounds(L.latLngBounds(coords as L.LatLngTuple[]), { padding: [24, 24] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords.length]);
  return null;
};

// ─────────────────────────────────────────────────────────────
// MAIN MODAL
// ─────────────────────────────────────────────────────────────
const PlotMarkingModal = ({
  farmId, farmLabel, farmTotalAcres: _farmTotalAcres,
  initialCoordinates, initialPlots = [], onClose, onSave,
}: PlotMarkingModalProps) => {

  type Screen = 'idle' | 'review' | 'saving';
  const [screen, setScreen]           = useState<Screen>('idle');
  const [isParsingKml, setIsParsingKml] = useState(false);
  const [kmlPlots, setKmlPlots]       = useState<KmlPlot[]>([]);
  const [plotNames, setPlotNames]     = useState<string[]>([]);

  // Progress
  const [progressDone,   setProgressDone]   = useState(0);
  const [progressTotal,  setProgressTotal]  = useState(0);
  const [progressSaved,  setProgressSaved]  = useState<string[]>([]);
  const [progressFailed, setProgressFailed] = useState<string[]>([]);

  // Plots already persisted on the server
  const [savedPlots, setSavedPlots] = useState<SavedPlotItem[]>(() =>
    initialPlots.map(p => ({
      plot_id:     p.plot_id,
      plot_number: p.plot_name,
      acres:       p.plot_area,
      coordinates: p.plot_coordinates,
    }))
  );

  // Editing an existing saved plot (rename and/or replace its shape via a new KML)
  const [editingPlotId, setEditingPlotId]     = useState<string | null>(null);
  const [editName, setEditName]               = useState('');
  const [editPendingShape, setEditPendingShape] = useState<{ coordinates: LatLng[]; area: number } | null>(null);
  const [isParsingEditKml, setIsParsingEditKml] = useState(false);
  const [savingEditId, setSavingEditId]       = useState<string | null>(null);
  const [deletingPlotId, setDeletingPlotId]   = useState<string | null>(null);

  // ESC closes (except during save)
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && screen !== 'saving') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, screen]);

  const allKmlCoords  = kmlPlots.flatMap(p => p.coordinates);
  const reviewCenter  = centerOf(allKmlCoords.length > 0 ? allKmlCoords : initialCoordinates);
  const idleCenter    = centerOf(initialCoordinates.length > 0 ? initialCoordinates : [[20.5937, 78.9629]]);
  const allNamed      = plotNames.length > 0 && plotNames.every(n => n.trim().length > 0);
  const namedCount    = plotNames.filter(n => n.trim().length > 0).length;

  // ── KML Upload ──────────────────────────────────────────────
  const handleKmlUpload = async (file: File) => {
    try {
      setIsParsingKml(true);
      const result = await parseKmlFile(file);
      const plots: KmlPlot[] = result.allPolygons.map(p => ({
        kmlName:     p.name,
        coordinates: p.coordinates,
        area:        parseFloat(calculateAcres(p.coordinates).toFixed(3)),
      }));
      if (plots.length === 0) { toast.error('No polygons found in KML file'); return; }
      setKmlPlots(plots);
      setPlotNames(plots.map(() => ''));
      setScreen('review');
      toast.success(`${plots.length} plot${plots.length > 1 ? 's' : ''} detected`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to read KML file');
    } finally {
      setIsParsingKml(false);
    }
  };

  // ── Edit an existing saved plot (rename + optionally replace its shape) ──────
  const startEdit = (plot: SavedPlotItem) => {
    setEditingPlotId(plot.plot_id);
    setEditName(plot.plot_number);
    setEditPendingShape(null);
  };

  const cancelEdit = () => {
    setEditingPlotId(null);
    setEditName('');
    setEditPendingShape(null);
  };

  const handleEditKmlUpload = async (file: File) => {
    try {
      setIsParsingEditKml(true);
      const result = await parseKmlFile(file);
      if (result.allPolygons.length === 0) { toast.error('No polygons found in KML file'); return; }
      if (result.allPolygons.length > 1) {
        toast(`${result.allPolygons.length} polygons found in file — using the first one`);
      }
      const poly = result.allPolygons[0];
      setEditPendingShape({
        coordinates: poly.coordinates,
        area: parseFloat(calculateAcres(poly.coordinates).toFixed(3)),
      });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to read KML file');
    } finally {
      setIsParsingEditKml(false);
    }
  };

  const saveEdit = async (plot: SavedPlotItem) => {
    const name = editName.trim();
    if (!name) { toast.error('Plot name is required'); return; }

    const coordinates = editPendingShape?.coordinates ?? plot.coordinates;
    const area = editPendingShape?.area ?? plot.acres;

    setSavingEditId(plot.plot_id);
    try {
      const res = await fetch(`${BASE_URL}/farmer_managment/edit_land_plot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farm_id: farmId,
          plot_id: plot.plot_id,
          plot_coordinates: coordinates,
          plot_area: area,
          plot_name: name,
        }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.message || 'Failed to save changes');

      setSavedPlots(prev => prev.map(p => (p.plot_id === plot.plot_id ? { ...p, plot_number: name, acres: area, coordinates } : p)));
      toast.success(`Plot "${name}" updated`);
      cancelEdit();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update plot');
    } finally {
      setSavingEditId(null);
    }
  };

  // ── Delete an existing saved plot ─────────────────────────────
  const handleDeletePlot = async (plot: SavedPlotItem) => {
    if (!window.confirm(`Delete plot "${plot.plot_number}"? This cannot be undone.`)) return;

    setDeletingPlotId(plot.plot_id);
    try {
      const res = await fetch(`${BASE_URL}/farmer_managment/delete_land_plot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farm_id: farmId, plot_id: plot.plot_id }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.message || 'Failed to delete plot');

      setSavedPlots(prev => prev.filter(p => p.plot_id !== plot.plot_id));
      if (editingPlotId === plot.plot_id) cancelEdit();
      toast.success(`Plot "${plot.plot_number}" deleted`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete plot');
    } finally {
      setDeletingPlotId(null);
    }
  };

  // ── Save All (batched parallel) ──────────────────────────────
  const handleSaveAll = async () => {
    const total = kmlPlots.length;
    setProgressDone(0);
    setProgressTotal(total);
    setProgressSaved([]);
    setProgressFailed([]);
    setScreen('saving');

    let totalDone  = 0;
    const allSaved: string[]  = [];
    const allFailed: string[] = [];
    let latestFarmPlots: ApiPlot[] | null = null;

    for (let i = 0; i < kmlPlots.length; i += BATCH_SIZE) {
      const end   = Math.min(i + BATCH_SIZE, kmlPlots.length);
      const batch = kmlPlots.slice(i, end);

      const results = await Promise.allSettled(
        batch.map((plot, bIdx) => {
          const name = plotNames[i + bIdx];
          return fetch(`${BASE_URL}/farmer_managment/save_land_plot`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              farm_id:          farmId,
              plot_coordinates: plot.coordinates,
              plot_area:        plot.area,
              plot_name:        name,
            }),
          })
          .then(r => r.json())
          .then(data => {
            if (!data?.success) throw new Error(data?.message || 'Failed');
            return { name, plot, farmPlots: data.farm?.land_plots as ApiPlot[] | undefined };
          });
        })
      );

      results.forEach((result, bIdx) => {
        const globalIdx = i + bIdx;
        if (result.status === 'fulfilled') {
          allSaved.push(result.value.name);
          if (result.value.farmPlots) latestFarmPlots = result.value.farmPlots;
          onSave?.({
            plot_number: result.value.name,
            acres:       result.value.plot.area,
            coordinates: result.value.plot.coordinates,
          });
        } else {
          allFailed.push(plotNames[globalIdx] || `Plot ${globalIdx + 1}`);
        }
        totalDone++;
      });

      setProgressDone(totalDone);
      setProgressSaved([...allSaved]);
      setProgressFailed([...allFailed]);
    }

    // The response carries the whole updated farm, so use it to pick up the real
    // (server-generated) plot_id for every plot — needed for Edit/Delete to work
    // without requiring a full page reload.
    if (latestFarmPlots) {
      setSavedPlots(latestFarmPlots.map(p => ({
        plot_id:     p.plot_id,
        plot_number: p.plot_name,
        acres:       p.plot_area,
        coordinates: p.plot_coordinates,
      })));
    }

    if (allFailed.length === 0) {
      toast.success(`All ${total} plots saved`);
      setTimeout(() => { setScreen('idle'); setKmlPlots([]); setPlotNames([]); }, 1400);
    } else {
      toast.error(`${allFailed.length} plot${allFailed.length > 1 ? 's' : ''} failed to save`);
    }
  };

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-3">
      <div
        className="w-full max-w-5xl rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ height: '88vh', background: '#111827' }}
      >

        {/* ══ TOOLBAR ══════════════════════════════════════ */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 bg-gray-900 gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-sm font-bold text-white">
                {screen === 'idle'   ? 'Plot Marking — Manage Plots'
                : screen === 'review' ? `Review & Name Plots (${kmlPlots.length} detected)`
                :                       'Saving Plots…'}
              </span>
              <p className="text-[11px] text-gray-500 truncate mt-0.5">{farmLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {screen === 'review' && (
              <>
                <button
                  onClick={() => { setScreen('idle'); setKmlPlots([]); setPlotNames([]); }}
                  className="rounded-lg border border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white hover:border-gray-400 transition-colors"
                >
                  Re-upload KML
                </button>
                <button
                  onClick={handleSaveAll}
                  disabled={!allNamed}
                  title={!allNamed ? `${kmlPlots.length - namedCount} plot(s) still need a name` : undefined}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-1.5 text-xs font-bold text-white transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save {kmlPlots.length} Plots
                </button>
              </>
            )}
            {screen !== 'saving' && (
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-600 bg-gray-800 p-1.5 text-gray-400 hover:text-white hover:border-gray-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* ══ CONTENT ══════════════════════════════════════ */}
        <div className="flex-1 flex overflow-hidden">

          {/* ── IDLE: saved plots list + map ────────────── */}
          {screen === 'idle' && (
            <div className="flex-1 flex overflow-hidden">

              {/* Left panel — saved plots */}
              <div className="w-[360px] shrink-0 flex flex-col bg-gray-900 border-r border-gray-700">
                <div className="px-4 py-3 border-b border-gray-700 shrink-0">
                  <p className="text-sm font-semibold text-white">
                    {savedPlots.length} Saved Plot{savedPlots.length === 1 ? '' : 's'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Edit a name/shape, delete, or upload a KML to add more</p>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                  {savedPlots.length === 0 ? (
                    <p className="text-xs text-gray-500 px-1 pt-6 text-center">No plots yet — upload a KML below to get started</p>
                  ) : (
                    savedPlots.map((plot, i) => {
                      const isEditing = editingPlotId === plot.plot_id;
                      return (
                        <div
                          key={plot.plot_id}
                          className={cn(
                            'rounded-lg px-3 py-2.5 transition-colors',
                            isEditing ? 'bg-gray-800 ring-1 ring-emerald-500' : 'bg-gray-800/70',
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: plotColor(i) }} />
                            {isEditing ? (
                              <input
                                type="text"
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                placeholder="Plot name…"
                                autoFocus
                                className="flex-1 min-w-0 rounded-md border border-gray-600 px-2.5 py-1.5 text-xs text-white bg-gray-700 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            ) : (
                              <span className="flex-1 min-w-0 truncate text-sm text-white font-medium">{plot.plot_number}</span>
                            )}
                            <span className="text-[11px] text-gray-400 shrink-0">
                              {(isEditing ? editPendingShape?.area ?? plot.acres : plot.acres).toFixed(2)} ac
                            </span>
                          </div>

                          {isEditing ? (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <label
                                className={cn(
                                  'flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] cursor-pointer transition-colors',
                                  isParsingEditKml
                                    ? 'border-emerald-500 text-emerald-400 cursor-wait'
                                    : editPendingShape
                                      ? 'border-emerald-600 text-emerald-400'
                                      : 'border-gray-600 text-gray-300 hover:border-emerald-500 hover:text-emerald-400',
                                )}
                              >
                                {isParsingEditKml ? <Loader2 className="w-3 h-3 animate-spin" /> : <UploadCloud className="w-3 h-3" />}
                                {editPendingShape ? 'Shape replaced' : 'Replace shape'}
                                <input
                                  type="file"
                                  accept=".kml,.kmz"
                                  className="hidden"
                                  disabled={isParsingEditKml}
                                  onChange={e => {
                                    const f = e.target.files?.[0];
                                    if (f) handleEditKmlUpload(f);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              <button
                                onClick={() => saveEdit(plot)}
                                disabled={!editName.trim() || savingEditId === plot.plot_id}
                                className="flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1 text-[11px] font-semibold text-white transition-colors"
                              >
                                {savingEditId === plot.plot_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                Save
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="rounded-md border border-gray-600 px-2.5 py-1 text-[11px] text-gray-300 hover:text-white hover:border-gray-400 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="mt-2 flex items-center gap-1.5">
                              <button
                                onClick={() => startEdit(plot)}
                                className="flex items-center gap-1 rounded-md border border-gray-600 px-2.5 py-1 text-[11px] text-gray-300 hover:text-white hover:border-gray-400 transition-colors"
                              >
                                <Pencil className="w-3 h-3" /> Edit
                              </button>
                              <button
                                onClick={() => handleDeletePlot(plot)}
                                disabled={deletingPlotId === plot.plot_id}
                                className="flex items-center gap-1 rounded-md border border-red-900 px-2.5 py-1 text-[11px] text-red-400 hover:text-red-300 hover:border-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                {deletingPlotId === plot.plot_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Upload new plot(s) */}
                <div className="px-3 py-3 border-t border-gray-700 shrink-0">
                  <label
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-3 text-xs font-semibold cursor-pointer transition-colors',
                      isParsingKml
                        ? 'border-emerald-500 text-emerald-400 cursor-wait'
                        : 'border-gray-600 text-gray-300 hover:border-emerald-500 hover:text-emerald-400',
                    )}
                  >
                    {isParsingKml ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                    {isParsingKml ? 'Reading KML…' : 'Upload KML to add plot(s)'}
                    <input
                      type="file"
                      accept=".kml,.kmz"
                      className="hidden"
                      disabled={isParsingKml}
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) handleKmlUpload(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Right panel — map */}
              <div className="flex-1 relative">
                <MapContainer
                  center={idleCenter}
                  zoom={initialCoordinates.length > 0 ? 15 : 5}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl
                >
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    maxZoom={19}
                    attribution="Tiles © Esri"
                  />
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                    opacity={0.6}
                    maxZoom={19}
                  />
                  {initialCoordinates.length >= 3 && (
                    <Polygon
                      positions={initialCoordinates}
                      pathOptions={{ color: '#94a3b8', fillColor: '#94a3b8', fillOpacity: 0.1, weight: 2, dashArray: '6 4' }}
                    />
                  )}
                  {savedPlots.map((sp, si) => {
                    const isEditing = editingPlotId === sp.plot_id;
                    const positions = (isEditing && editPendingShape ? editPendingShape.coordinates : sp.coordinates) as [number, number][];
                    return positions.length >= 3 ? (
                      <Polygon
                        key={sp.plot_id}
                        positions={positions}
                        pathOptions={{
                          color: plotColor(si),
                          fillColor: plotColor(si),
                          fillOpacity: isEditing ? 0.45 : 0.25,
                          weight: isEditing ? 3 : 2,
                        }}
                      />
                    ) : null;
                  })}
                </MapContainer>
              </div>
            </div>
          )}

          {/* ── REVIEW: name list + map ─────────────────── */}
          {screen === 'review' && (
            <div className="flex-1 flex overflow-hidden">

              {/* Left panel — plot list */}
              <div className="w-[360px] shrink-0 flex flex-col bg-gray-900 border-r border-gray-700">

                <div className="px-4 py-3 border-b border-gray-700 shrink-0">
                  <p className="text-sm font-semibold text-white">{kmlPlots.length} Plots Detected</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Enter a unique name for every plot — "Save" unlocks when all are filled
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                  {kmlPlots.map((plot, i) => {
                    const filled = !!plotNames[i]?.trim();
                    return (
                      <div
                        key={i}
                        className={cn(
                          'flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors',
                          filled ? 'bg-gray-800/70' : 'bg-gray-800',
                        )}
                      >
                        {/* Color swatch */}
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: plotColor(i) }}
                        />
                        {/* Row number */}
                        <span className="text-[11px] font-mono text-gray-500 w-5 shrink-0 text-right">{i + 1}</span>
                        {/* Area */}
                        <span className="text-[11px] text-gray-400 w-14 shrink-0">{plot.area.toFixed(2)} ac</span>
                        {/* Name input */}
                        <input
                          type="text"
                          placeholder="Plot name…"
                          value={plotNames[i] ?? ''}
                          onChange={e => {
                            const v = e.target.value;
                            setPlotNames(prev => { const n = [...prev]; n[i] = v; return n; });
                          }}
                          className={cn(
                            'flex-1 min-w-0 rounded-md border px-2.5 py-1.5 text-xs text-white bg-gray-700 placeholder-gray-500 focus:outline-none focus:ring-1 transition-colors',
                            filled
                              ? 'border-emerald-600/70 focus:ring-emerald-500'
                              : 'border-gray-600 focus:ring-gray-400',
                          )}
                        />
                        {/* Check */}
                        {filled && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      </div>
                    );
                  })}
                </div>

                {/* Footer counter */}
                <div className="px-4 py-3 border-t border-gray-700 shrink-0 bg-gray-900">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">
                      <span className={cn('font-semibold', allNamed ? 'text-emerald-400' : 'text-white')}>
                        {namedCount}
                      </span>
                      {' / '}{kmlPlots.length} named
                    </p>
                    {allNamed && (
                      <span className="text-[11px] text-emerald-400 font-medium">Ready to save ✓</span>
                    )}
                  </div>
                  {!allNamed && (
                    <div className="mt-1.5 h-1 w-full bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full transition-all"
                        style={{ width: `${(namedCount / kmlPlots.length) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Right panel — map */}
              <div className="flex-1 relative overflow-hidden">
                <MapContainer
                  center={reviewCenter}
                  zoom={14}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl
                >
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    maxZoom={19}
                    attribution="Tiles © Esri"
                  />
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                    opacity={0.6}
                    maxZoom={19}
                  />
                  {initialCoordinates.length >= 3 && (
                    <Polygon
                      positions={initialCoordinates}
                      pathOptions={{ color: '#94a3b8', fillColor: '#94a3b8', fillOpacity: 0.05, weight: 2, dashArray: '6 4' }}
                    />
                  )}
                  {kmlPlots.map((plot, i) =>
                    plot.coordinates.length >= 3 ? (
                      <Polygon
                        key={i}
                        positions={plot.coordinates}
                        pathOptions={{ color: plotColor(i), fillColor: plotColor(i), fillOpacity: 0.3, weight: 2.5 }}
                      />
                    ) : null
                  )}
                  <FitBounds coords={allKmlCoords} />
                </MapContainer>
              </div>
            </div>
          )}

          {/* ── SAVING: progress view ───────────────────── */}
          {screen === 'saving' && (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-950 px-8">
              <div className="w-full max-w-lg space-y-7">

                {/* Title */}
                <div className="text-center space-y-1">
                  {progressDone < progressTotal ? (
                    <>
                      <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mx-auto mb-3" />
                      <p className="text-xl font-bold text-white">Saving Plots…</p>
                      <p className="text-gray-400 text-sm">
                        Processing in batches of {BATCH_SIZE} — please wait
                      </p>
                    </>
                  ) : progressFailed.length === 0 ? (
                    <>
                      <Check className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                      <p className="text-xl font-bold text-white">All Plots Saved!</p>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                      <p className="text-xl font-bold text-white">
                        {progressSaved.length} Saved · {progressFailed.length} Failed
                      </p>
                    </>
                  )}
                </div>

                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{progressDone} / {progressTotal} plots</span>
                    <span>{progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0}%</span>
                  </div>
                  <div className="h-3 w-full bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300 ease-out"
                      style={{
                        width: `${progressTotal > 0 ? (progressDone / progressTotal) * 100 : 0}%`,
                        background: progressFailed.length > 0 ? '#f59e0b' : '#10b981',
                      }}
                    />
                  </div>
                </div>

                {/* Result list */}
                {(progressSaved.length > 0 || progressFailed.length > 0) && (
                  <div className="max-h-56 overflow-y-auto bg-gray-900 rounded-xl px-4 py-3 space-y-1.5 border border-gray-800">
                    {progressSaved.map((name, i) => (
                      <div key={`s-${i}`} className="flex items-center gap-2 text-sm">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-emerald-300">{name}</span>
                      </div>
                    ))}
                    {progressFailed.map((name, i) => (
                      <div key={`f-${i}`} className="flex items-center gap-2 text-sm">
                        <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        <span className="text-red-300">{name}</span>
                        <span className="text-gray-500 text-xs ml-auto">failed</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Close button — only shown after completion with failures */}
                {progressDone === progressTotal && progressFailed.length > 0 && (
                  <button
                    onClick={onClose}
                    className="w-full py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default PlotMarkingModal;
