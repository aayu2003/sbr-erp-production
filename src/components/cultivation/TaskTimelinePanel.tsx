import { useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Image as ImageIcon, MapPinned, Users, User, RefreshCw, Maximize2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TimelinePlot = { plot_id: string; plot_name: string; plot_area: number };

export type TimelineTask = {
  key: string;
  date: string;
  activity: string;
  cropType?: string;
  farmId: string;
  farmerName: string;
  assignedArea: number;
  plots: TimelinePlot[];
  statusLabel: string;
  statusTone: 'green' | 'orange' | 'blue' | 'red' | 'yellow';
  taskId?: string;
};

export type TimelineFarm = {
  farm_id: string;
  crop_type?: string;
  land_data?: { land_coordinates?: [number, number][] };
  land_plots?: { plot_id: string; plot_name: string; plot_area: number; plot_coordinates: [number, number][]; crop_type?: string }[];
};

export type TimelineAssignment = { supervisorName: string; fieldManagerName: string };

const CROP_COLORS: Record<string, string> = {
  paddy: '#f59e0b',
  napier: '#22c55e',
  rahar: '#f97316',
  unspecified: '#94a3b8',
};
const FALLBACK_CROP_COLORS = ['#2563eb', '#6d28d9', '#0891b2', '#dc2626', '#0f766e'];
const normalizeCropKey = (crop?: string) => (crop && crop.trim() ? crop.trim().toLowerCase() : 'unspecified');
const cropColor = (key: string, index: number) => CROP_COLORS[key] ?? FALLBACK_CROP_COLORS[index % FALLBACK_CROP_COLORS.length];

const PILL_TONE_CLASSES: Record<TimelineTask['statusTone'], string> = {
  green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

const fmtTaskDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return Number.isNaN(date.getTime())
    ? dateStr
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const FitBounds = ({ coords }: { coords: [number, number][] }) => {
  const map = useMap();
  useEffect(() => {
    if (coords.length > 0) {
      map.fitBounds(L.latLngBounds(coords as L.LatLngTuple[]), { padding: [16, 16] });
    }
  }, [map, coords]);
  return null;
};

const TaskPlotMapThumbnail = ({ farm, plotIds }: { farm?: TimelineFarm; plotIds: string[] }) => {
  if (!farm) {
    return (
      <div className="flex h-full min-h-[80px] w-full flex-col items-center justify-center gap-1 bg-slate-900 text-slate-500">
        <MapPinned className="h-5 w-5 opacity-40" />
        <span className="text-[10px] font-bold">No farm data</span>
      </div>
    );
  }

  const landCoords = farm.land_data?.land_coordinates ?? [];
  const plots = farm.land_plots ?? [];
  const hasPlots = plots.length > 0;
  const plotIdSet = new Set(plotIds);
  const highlightAll = plotIdSet.size === 0;
  const allCoords: [number, number][] = [...landCoords, ...plots.flatMap((plot) => plot.plot_coordinates ?? [])];
  const center: [number, number] =
    allCoords.length > 0
      ? [allCoords.reduce((sum, c) => sum + c[0], 0) / allCoords.length, allCoords.reduce((sum, c) => sum + c[1], 0) / allCoords.length]
      : [20.5937, 78.9629];

  if (landCoords.length === 0) {
    return (
      <div className="flex h-full min-h-[80px] w-full flex-col items-center justify-center gap-1 bg-slate-900 text-slate-500">
        <MapPinned className="h-5 w-5 opacity-40" />
        <span className="text-[10px] font-bold">No coordinates</span>
      </div>
    );
  }

  return (
    <div className="h-full min-h-[80px] w-full">
      <MapContainer
        key={`${farm.farm_id}-${plotIds.join(',')}`}
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
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
        {landCoords.length >= 3 && (
          <Polygon positions={landCoords} pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: hasPlots ? 0.06 : 0.2, weight: 2 }} />
        )}
        {hasPlots &&
          plots.map((plot, index) => {
            if ((plot.plot_coordinates?.length ?? 0) < 3) return null;
            const isMatch = highlightAll || plotIdSet.has(plot.plot_id);
            const key = normalizeCropKey(plot.crop_type || farm.crop_type);
            const color = isMatch ? cropColor(key, index) : '#475569';
            return (
              <Polygon
                key={plot.plot_id || plot.plot_name || index}
                positions={plot.plot_coordinates}
                pathOptions={{ color, fillColor: color, fillOpacity: isMatch ? 0.55 : 0.12, weight: isMatch ? 2.5 : 1 }}
              />
            );
          })}
        <FitBounds coords={allCoords} />
      </MapContainer>
    </div>
  );
};

const TimelineTaskCard = ({
  task,
  farm,
  assignment,
  assignmentLoading,
  renderActivityIcon,
  onExpandMap,
  progressImages,
}: {
  task: TimelineTask;
  farm?: TimelineFarm;
  assignment?: TimelineAssignment;
  assignmentLoading: boolean;
  renderActivityIcon: (activity: string) => React.ReactNode;
  onExpandMap: (task: TimelineTask) => void;
  progressImages?: string[];
}) => {
  const accentColor = cropColor(normalizeCropKey(task.cropType), 0);
  const isPending = task.statusTone === 'orange';
  const isCompleted = task.statusTone === 'green';

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-2xl border-2 bg-white shadow-md',
        isPending ? 'border-orange-400' : 'border-slate-200',
      )}
    >
      {isPending && (
        <span className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-orange-400 animate-ping" />
      )}
      <div className="h-2" style={{ backgroundColor: accentColor }} />
      <div className="space-y-3 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
              {renderActivityIcon(task.activity)}
            </span>
            <p className="truncate text-sm font-black text-slate-950">{task.activity}</p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap',
              PILL_TONE_CLASSES[task.statusTone],
              task.statusTone === 'orange' && 'animate-pulse',
            )}
          >
            {task.statusLabel}
          </span>
        </div>

        {/* Map View + Informations */}
        <div className="flex min-h-[190px] items-stretch gap-2">
          <div className="flex w-3/5 shrink-0 flex-col">
            <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">Map View</p>
            <div className="relative flex-1 overflow-hidden rounded-lg border border-slate-100">
              <TaskPlotMapThumbnail farm={farm} plotIds={task.plots.map((plot) => plot.plot_id)} />
              <button
                type="button"
                onClick={() => onExpandMap(task)}
                className="absolute right-1.5 top-1.5 z-[1000] flex h-7 w-7 items-center justify-center rounded-md bg-white/90 text-slate-700 shadow hover:bg-white"
                title="Expand map"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex w-2/5 min-w-0 flex-col">
            <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">Informations</p>
            <div className="flex-1 space-y-1.5 rounded-lg bg-slate-50 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <p className="truncate text-[13px] font-extrabold text-slate-900">{task.farmerName}</p>
              </div>
              <p className="text-xs font-bold text-slate-500">{fmtTaskDate(task.date)}</p>
              <div>
                <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">
                  <Users className="h-3 w-3" /> Team
                </p>
                {assignmentLoading ? (
                  <span className="mt-1 block h-3 w-24 animate-pulse rounded bg-slate-200" />
                ) : (
                  <>
                    <p className="mt-1 truncate text-xs font-bold text-slate-700">Sup: {assignment?.supervisorName || '—'}</p>
                    <p className="truncate text-xs font-bold text-slate-700">FM: {assignment?.fieldManagerName || '—'}</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Photos — always full-width, capped at 3 */}
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">
            <ImageIcon className="h-3 w-3" /> Photos
          </p>
          {isCompleted ? (
            progressImages === undefined ? (
              <div className="grid grid-cols-3 gap-1.5">
                {[0, 1, 2].map((idx) => (
                  <div
                    key={idx}
                    className="flex aspect-square animate-pulse items-center justify-center rounded-lg border border-slate-200 bg-slate-100"
                  >
                    <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                  </div>
                ))}
              </div>
            ) : progressImages.length === 0 ? (
              <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 py-4 text-center text-[10px] font-bold text-slate-300">
                No photos uploaded
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {progressImages.slice(0, 3).map((url, idx) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                  >
                    <img
                      src={url}
                      alt={`Progress photo ${idx + 1}`}
                      className="h-full w-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  </a>
                ))}
              </div>
            )
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {[0, 1, 2].map((idx) => (
                <div
                  key={idx}
                  className="flex aspect-square flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-300"
                  title="Sample photo placeholder — no task-photo API yet"
                >
                  <ImageIcon className="h-4 w-4" />
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-[10px] font-bold text-slate-400">
          {farm?.farm_id ?? task.farmId} · {task.assignedArea.toFixed(2)} ac
        </p>
      </div>
    </div>
  );
};

export const TaskTimelinePanel = ({
  tasks,
  farmsById,
  assignmentByFarm,
  loading,
  renderActivityIcon,
  onExpandMap,
  progressImagesByTaskId,
}: {
  tasks: TimelineTask[];
  farmsById: Record<string, TimelineFarm>;
  assignmentByFarm: Record<string, TimelineAssignment>;
  loading: boolean;
  renderActivityIcon: (activity: string) => React.ReactNode;
  onExpandMap: (task: TimelineTask) => void;
  progressImagesByTaskId: Record<string, string[]>;
}) => (
  <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white shadow-sm">
    <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
      <h3 className="text-sm font-bold text-slate-900">Task Timeline</h3>
      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">{tasks.length} Tasks</span>
    </div>
    <div className="flex-1 overflow-y-auto p-4">
      {loading ? (
        <div className="flex h-56 flex-col items-center justify-center gap-2 text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin opacity-50" />
          <p className="text-xs font-bold">Loading tasks…</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex h-56 items-center justify-center text-center text-sm font-bold text-slate-400">
          No tasks scheduled in these months
        </div>
      ) : (
        <div className="relative flex flex-col gap-5 pl-1">
          <div className="pointer-events-none absolute left-[13px] top-2 bottom-2 w-0.5 bg-slate-200" />
          {tasks.map((task) => (
            <div key={task.key} className="relative z-10 flex items-start gap-3">
              <span className="relative mt-1 flex h-3.5 w-3.5 shrink-0">
                {task.statusTone === 'orange' && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                )}
                <span
                  className={cn(
                    'relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-white shadow',
                    task.statusTone === 'orange' ? 'bg-orange-500' : 'bg-emerald-500',
                  )}
                />
              </span>
              <div className="min-w-0 flex-1">
                <TimelineTaskCard
                  task={task}
                  farm={farmsById[task.farmId]}
                  assignment={assignmentByFarm[task.farmId]}
                  assignmentLoading={!(task.farmId in assignmentByFarm)}
                  renderActivityIcon={renderActivityIcon}
                  onExpandMap={onExpandMap}
                  progressImages={task.taskId ? progressImagesByTaskId[task.taskId] : []}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);
