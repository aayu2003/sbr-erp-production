import { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  CalendarRange,
  FileCheck,
  ChevronRight,
  Shovel,
  Tractor,
  Droplets,
  Leaf,
  ClipboardList,
  Wheat,
} from 'lucide-react';
import getBaseUrl from '@/lib/config';
import { TaskTimelinePanel, type TimelineTask, type TimelineFarm, type TimelineAssignment } from './TaskTimelinePanel';
import PlotMapViewModal, { type MapViewTask } from './PlotMapViewModal';
import WccCertificatePreview from './WccCertificatePreview';

const BASE_URL = getBaseUrl().replace(/\/$/, '');

// ─────────────────────────────────────────────────────────────
// Types for /admin_cultivation/get_work_done_by_vendor_so_far
// ─────────────────────────────────────────────────────────────
export interface ApiWorkDonePlot {
  plot_id: string;
  plot_name: string;
  plot_area: number;
  status?: string;
}

export interface ApiWorkDoneEntry {
  farm_id: string;
  date: string;
  plot: ApiWorkDonePlot[];
  task_id: string;
}

// Raw shape of a `Tasks` table item — only the fields this modal (and the certificate
// preview it opens) read.
export interface ApiTaskDetails {
  assigned_acres?: Array<{ farm_id: string; activity: string; assigned_acres?: number }>;
  progress_images?: string[];
}

// A land + its declared crop-wise plots, as returned by get_scope_of_work_for_vendor —
// the certificate preview uses this to know each plot's crop_type and each land's owner.
export interface WccScopeLand {
  land_id: string;
  farmer_id: string;
  farmer_name?: string;
  block_id: string;
  plots: Array<{ plot_id: string; crop_type: string | null; plot_area: number }>;
}

const getActivityIcon = (activity: string) => {
  const key = activity.trim().toLowerCase();
  const iconClass = 'w-4 h-4 text-gray-500';
  if (key.includes('bed')) return <Shovel className={iconClass} />;
  if (key.includes('plough')) return <Tractor className={iconClass} />;
  if (key.includes('irrig')) return <Droplets className={iconClass} />;
  if (key.includes('fert') || key.includes('weed')) return <Leaf className={iconClass} />;
  if (key.includes('visit')) return <ClipboardList className={iconClass} />;
  if (key.includes('harvest')) return <Wheat className={iconClass} />;
  return <ClipboardList className={iconClass} />;
};

const formatDate = (d?: string) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

const todayKey = () => new Date().toISOString().slice(0, 10);
const daysAgoKey = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

// A work-done entry's plots can be a mix of statuses — roll them up into one card-level tone.
const aggregatePlotStatus = (plots: ApiWorkDonePlot[]): { tone: TimelineTask['statusTone']; label: string } => {
  if (plots.length === 0) return { tone: 'blue', label: 'In Progress' };
  const completed = plots.filter((p) => (p.status || '').trim().toLowerCase() === 'completed').length;
  if (completed === plots.length) return { tone: 'green', label: 'Completed' };
  if (completed === 0) return { tone: 'orange', label: 'Pending' };
  return { tone: 'blue', label: 'Partially Completed' };
};

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
export interface WccModalProps {
  vendorId: string;
  vendorName: string;
  vendorWoNumber?: string;
  landIds: string[];
  activities: string[];
  farmsById: Record<string, TimelineFarm>;
  farmerNames: Record<string, string>;
  scopeItems: WccScopeLand[];
  defaultStartDate?: string;
  defaultEndDate?: string;
  onClose: () => void;
}

const WccModal = ({ vendorId, vendorName, vendorWoNumber, landIds, activities, farmsById, farmerNames, scopeItems, defaultStartDate, defaultEndDate, onClose }: WccModalProps) => {
  const [fromDate, setFromDate] = useState(defaultStartDate || daysAgoKey(30));
  const [toDate, setToDate] = useState(defaultEndDate || todayKey());
  const [workDone, setWorkDone] = useState<ApiWorkDoneEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapViewTask, setMapViewTask] = useState<MapViewTask | null>(null);
  const [showCertificatePreview, setShowCertificatePreview] = useState(false);

  // Fetch the vendor's completed/in-progress work for the selected period whenever the
  // period (or the underlying scope) changes.
  useEffect(() => {
    if (landIds.length === 0 || activities.length === 0) {
      setWorkDone([]);
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    fetch(`${BASE_URL}/admin_cultivation/get_work_done_by_vendor_so_far`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendor_id: vendorId, start_date: fromDate, end_date: toDate, farm_id: landIds, activities }),
    })
      .then((res) => res.json())
      .then((data: { success?: boolean; work_done?: ApiWorkDoneEntry[] }) => {
        if (!mounted) return;
        setWorkDone(data?.success && Array.isArray(data.work_done) ? data.work_done : []);
      })
      .catch(() => { if (mounted) setWorkDone([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, fromDate, toDate, landIds.join(','), activities.join(',')]);

  // Task details (activity name + progress photos) — fetched once per unique task_id.
  const [taskDetailsById, setTaskDetailsById] = useState<Record<string, ApiTaskDetails>>({});
  const fetchedTaskIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const taskIds = Array.from(new Set(workDone.map((w) => w.task_id).filter(Boolean)));
    taskIds.forEach((taskId) => {
      if (fetchedTaskIds.current.has(taskId)) return;
      fetchedTaskIds.current.add(taskId);

      fetch(`${BASE_URL}/admin_all_task/get_task_details/${taskId}`)
        .then((res) => res.json())
        .then((data: ApiTaskDetails) => {
          setTaskDetailsById((prev) => ({ ...prev, [taskId]: data || {} }));
        })
        .catch(() => setTaskDetailsById((prev) => ({ ...prev, [taskId]: {} })));
    });
  }, [workDone]);

  const timelineTasks = useMemo<TimelineTask[]>(() => {
    return workDone.map((entry, index) => {
      const details = taskDetailsById[entry.task_id];
      const activity = details?.assigned_acres?.find((a) => a.farm_id === entry.farm_id)?.activity || 'Activity';
      const { tone, label } = aggregatePlotStatus(entry.plot);
      return {
        key: `${entry.task_id}-${entry.farm_id}-${entry.date}-${index}`,
        date: entry.date,
        activity,
        farmId: entry.farm_id,
        farmerName: farmerNames[entry.farm_id] || entry.farm_id,
        assignedArea: entry.plot.reduce((sum, p) => sum + (Number(p.plot_area) || 0), 0),
        plots: entry.plot.map((p) => ({ plot_id: p.plot_id, plot_name: p.plot_name, plot_area: p.plot_area })),
        statusTone: tone,
        statusLabel: label,
        taskId: entry.task_id,
      };
    }).sort((a, b) => a.date.localeCompare(b.date));
  }, [workDone, taskDetailsById, farmerNames]);

  // Supervisor / field manager per farm — fetched once per unique farm that shows up in view
  const [assignmentByFarm, setAssignmentByFarm] = useState<Record<string, TimelineAssignment>>({});
  const fetchedAssignmentFarmIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const farmIds = Array.from(new Set(timelineTasks.map((t) => t.farmId)));
    farmIds.forEach((farmId) => {
      if (fetchedAssignmentFarmIds.current.has(farmId)) return;
      fetchedAssignmentFarmIds.current.add(farmId);

      fetch(`${BASE_URL}/farmer_managment/get_assigned_supervisor_and_field_manager/${farmId}`)
        .then((res) => res.json())
        .then((data: { assigned_supervisor?: { supervisor_name?: string }; assigned_field_manager?: { name?: string } | { name?: string }[] }) => {
          const fm = Array.isArray(data?.assigned_field_manager) ? data.assigned_field_manager[0] : data?.assigned_field_manager;
          setAssignmentByFarm((prev) => ({
            ...prev,
            [farmId]: { supervisorName: data?.assigned_supervisor?.supervisor_name ?? '', fieldManagerName: fm?.name ?? '' },
          }));
        })
        .catch(() => setAssignmentByFarm((prev) => ({ ...prev, [farmId]: { supervisorName: '', fieldManagerName: '' } })));
    });
  }, [timelineTasks]);

  // Progress photos — only relevant for fully-completed cards, sourced from the same task-details fetch
  const progressImagesByTaskId = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const t of timelineTasks) {
      if (t.statusTone !== 'green' || !t.taskId) continue;
      const details = taskDetailsById[t.taskId];
      if (details) map[t.taskId] = Array.isArray(details.progress_images) ? details.progress_images : [];
    }
    return map;
  }, [timelineTasks, taskDetailsById]);

  const totalAcres = useMemo(() => timelineTasks.reduce((sum, t) => sum + (t.assignedArea || 0), 0), [timelineTasks]);

  return (
    <>
      <div className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" />
      <div className="fixed inset-y-0 right-0 z-[91] w-full max-w-3xl bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4 bg-gradient-to-r from-indigo-50/60 to-white shrink-0">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-indigo-400 uppercase tracking-widest mb-0.5">Work Completion Certificate</p>
            <h2 className="text-lg font-bold text-slate-900 truncate">{vendorName}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{landIds.length} land{landIds.length !== 1 ? 's' : ''} in scope</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Date range */}
        <div className="px-6 py-4 border-b border-gray-100 bg-white shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <CalendarRange className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Certificate Period</span>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-slate-400 block mb-1">From</label>
              <input
                type="date"
                value={fromDate}
                max={toDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 mb-2.5 shrink-0" />
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-slate-400 block mb-1">To</label>
              <input
                type="date"
                value={toDate}
                min={fromDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
            <div className="text-right shrink-0 pl-2">
              <div className="text-lg font-bold text-slate-800 leading-none">{timelineTasks.length}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">tasks · {totalAcres.toFixed(1)} ac</div>
            </div>
          </div>
        </div>

        {/* Task Timeline */}
        <div className="flex-1 overflow-hidden p-5 min-h-0">
          <TaskTimelinePanel
            tasks={timelineTasks}
            farmsById={farmsById}
            assignmentByFarm={assignmentByFarm}
            loading={loading}
            renderActivityIcon={getActivityIcon}
            onExpandMap={(task) => setMapViewTask({
              activity: task.activity,
              date: task.date,
              farm_id: task.farmId,
              farmerName: task.farmerName,
              plots: task.plots,
            })}
            progressImagesByTaskId={progressImagesByTaskId}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between gap-3 shrink-0">
          <p className="text-[11px] text-slate-400">
            Covers {timelineTasks.length} task{timelineTasks.length !== 1 ? 's' : ''} · {formatDate(fromDate)} – {formatDate(toDate)}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => setShowCertificatePreview(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
            >
              <FileCheck className="w-4 h-4" /> Generate Certificate
            </button>
          </div>
        </div>
      </div>

      {mapViewTask && <PlotMapViewModal task={mapViewTask} onClose={() => setMapViewTask(null)} />}

      {showCertificatePreview && (
        <WccCertificatePreview
          mode="create"
          vendorId={vendorId}
          vendorName={vendorName}
          vendorWoNumber={vendorWoNumber}
          scopeActivities={activities}
          fromDate={fromDate}
          toDate={toDate}
          workDone={workDone}
          taskDetailsById={taskDetailsById}
          scopeItems={scopeItems}
          onClose={() => setShowCertificatePreview(false)}
        />
      )}
    </>
  );
};

export default WccModal;
