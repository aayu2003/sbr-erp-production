import { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  CalendarRange,
  FileCheck,
  ArrowLeft,
  Shovel,
  Tractor,
  Droplets,
  Leaf,
  ClipboardList,
  Wheat,
} from 'lucide-react';
import getBaseUrl from '@/lib/config';
import { getTaskDetailsBulk } from '@/lib/taskDetailsCache';
import { getFarmerNames } from '@/lib/farmerNameCache';
import { getAssignedSupervisorAndFieldManagers } from '@/lib/supervisorFieldManagerCache';
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
  order_number?: string;
}

// Non-cultivation vendor work (e.g. rental vehicle log books), from
// /admin_cultivation/get_operational_work_done_by_vendor — the WCC evidence source for
// vendors who have no land scope-of-work at all.
export interface ApiOperationalWorkDoneEntry {
  activity: string;
  from_date: string;
  // The row's real completion date when it has one (to_date already carries this same value
  // as a fallback-safe default) — from_date/to_date otherwise describe the whole task's
  // planned window, not the day this specific line item was actually finished.
  to_date: string;
  completion_date?: string;
  // Actually-completed quantity (what a WCC certifies) — the backend only ever returns
  // completed line items here, falling back to the originally assigned amount only for
  // rows completed before completed_quantity existed.
  quantity?: number;
  // The originally assigned quantity, kept alongside `quantity` for reference/audit —
  // may differ from it when only part of the line item was actually completed.
  assigned_quantity?: number;
  unit?: string;
  spec_value?: number;
  spec_unit?: string;
  status?: string;
  task_id?: string;
  // Unique per line item — several line items from one on-field task now share the same
  // task_id, so this (not task_id) is what's unique enough for React keys / annexure line ids.
  line_item_id?: string;
  farm_id?: string;
  // The WO this line item was drawn from, if the task was created against one.
  order_number?: string;
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
  onBack?: () => void;
  onClose: () => void;
}

const WccModal = ({ vendorId, vendorName, vendorWoNumber, landIds, activities, farmsById, farmerNames, scopeItems, defaultStartDate, defaultEndDate, onBack, onClose }: WccModalProps) => {
  const [fromDate, setFromDate] = useState(defaultStartDate || daysAgoKey(30));
  const [toDate, setToDate] = useState(defaultEndDate || todayKey());
  const [workDone, setWorkDone] = useState<ApiWorkDoneEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [operationalWorkDone, setOperationalWorkDone] = useState<ApiOperationalWorkDoneEntry[]>([]);
  const [loadingOperational, setLoadingOperational] = useState(true);
  const [mapViewTask, setMapViewTask] = useState<MapViewTask | null>(null);
  const [showCertificatePreview, setShowCertificatePreview] = useState(false);

  // Fetch the vendor's completed/in-progress work for the selected period whenever the
  // period (or the underlying scope) changes.
  useEffect(() => {
    if (activities.length === 0) {
      setWorkDone([]);
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    fetch(`${BASE_URL}/admin_cultivation/get_work_done_by_vendor_so_far`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendor_id: vendorId, order_number: vendorWoNumber, start_date: fromDate, end_date: toDate, farm_id: landIds, activities }),
    })
      .then((res) => res.json())
      .then((data: { success?: boolean; work_done?: ApiWorkDoneEntry[] }) => {
        if (!mounted) return;
        const entries = data?.success && Array.isArray(data.work_done) ? data.work_done : [];
        setWorkDone(entries.filter((entry) => !vendorWoNumber || !entry.order_number || entry.order_number === vendorWoNumber));
      })
      .catch(() => { if (mounted) setWorkDone([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, vendorWoNumber, fromDate, toDate, landIds.join(','), activities.join(',')]);

  // Fetch the vendor's non-cultivation (operational calendar) work for the same period —
  // independent of `activities`, so vendors with no land scope-of-work still get evidence.
  useEffect(() => {
    let mounted = true;
    setLoadingOperational(true);
    fetch(`${BASE_URL}/admin_cultivation/get_operational_work_done_by_vendor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendor_id: vendorId, order_number: vendorWoNumber, start_date: fromDate, end_date: toDate }),
    })
      .then((res) => res.json())
      .then((data: { success?: boolean; work_done?: ApiOperationalWorkDoneEntry[] }) => {
        if (!mounted) return;
        const entries = data?.success && Array.isArray(data.work_done) ? data.work_done : [];
        setOperationalWorkDone(entries.filter((entry) => !vendorWoNumber || !entry.order_number || entry.order_number === vendorWoNumber));
      })
      .catch(() => { if (mounted) setOperationalWorkDone([]); })
      .finally(() => { if (mounted) setLoadingOperational(false); });
    return () => { mounted = false; };
  }, [vendorId, vendorWoNumber, fromDate, toDate]);

  // Farmer names for farm_ids that show up in operational (non-cultivation) work but aren't
  // already covered by the vendor's own land scope-of-work (e.g. a borewell driller with no
  // cultivation scope at all) — the Annexure's "Place" column needs the owner's name either way.
  const [operationalFarmerNames, setOperationalFarmerNames] = useState<Record<string, string>>({});
  const fetchedOperationalFarmIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const farmIds = Array.from(new Set(
      operationalWorkDone.map((w) => w.farm_id).filter((id): id is string => !!id && !farmerNames[id]),
    ));
    const idsToFetch = farmIds.filter((farmId) => !fetchedOperationalFarmIds.current.has(farmId));
    if (idsToFetch.length === 0) return;
    idsToFetch.forEach((farmId) => fetchedOperationalFarmIds.current.add(farmId));

    getFarmerNames(idsToFetch).then((names) => {
      setOperationalFarmerNames((prev) => {
        const next = { ...prev };
        idsToFetch.forEach((farmId) => {
          const name = names[farmId];
          if (name) next[farmId] = name;
        });
        return next;
      });
    });
  }, [operationalWorkDone, farmerNames]);

  const mergedFarmerNames = useMemo(
    () => ({ ...operationalFarmerNames, ...farmerNames }),
    [operationalFarmerNames, farmerNames],
  );

  // Task details (activity name + progress photos) — fetched once per unique task_id.
  const [taskDetailsById, setTaskDetailsById] = useState<Record<string, ApiTaskDetails>>({});
  const fetchedTaskIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const taskIds = Array.from(new Set([
      ...workDone.map((w) => w.task_id),
      ...operationalWorkDone.map((w) => w.task_id),
    ].filter((taskId): taskId is string => Boolean(taskId))));
    const idsToFetch = taskIds.filter((taskId) => !fetchedTaskIds.current.has(taskId));
    if (idsToFetch.length === 0) return;
    idsToFetch.forEach((taskId) => fetchedTaskIds.current.add(taskId));

    getTaskDetailsBulk(idsToFetch).then((details) => {
      setTaskDetailsById((prev) => {
        const next = { ...prev };
        idsToFetch.forEach((taskId) => { next[taskId] = (details[taskId] ?? {}) as ApiTaskDetails; });
        return next;
      });
    });
  }, [workDone, operationalWorkDone]);

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
    const idsToFetch = farmIds.filter((farmId) => !fetchedAssignmentFarmIds.current.has(farmId));
    if (idsToFetch.length === 0) return;
    idsToFetch.forEach((farmId) => fetchedAssignmentFarmIds.current.add(farmId));

    getAssignedSupervisorAndFieldManagers(idsToFetch).then((assignments) => {
      setAssignmentByFarm((prev) => {
        const next = { ...prev };
        idsToFetch.forEach((farmId) => {
          const assignment = assignments[farmId];
          next[farmId] = {
            supervisorName: assignment?.supervisorName ?? '',
            fieldManagerName: assignment?.fieldManagers?.[0]?.name ?? '',
          };
        });
        return next;
      });
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
      <div className="fixed inset-0 z-[120] bg-slate-950/55 backdrop-blur-sm animate-in fade-in duration-200" />
      <div className="fixed inset-0 z-[121] flex items-center justify-center p-4 sm:p-6">
      <div className="flex max-h-[94vh] w-full max-w-[1600px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#0D3A35] bg-[#0D3A35] px-6 py-4 text-white">
          <div className="flex min-w-0 items-start gap-3">
            {onBack && (
              <button type="button" onClick={onBack} className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/15 text-white/80 transition-colors hover:bg-white/10 hover:text-white" title="Back to vendor selection">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-widest text-emerald-200">Create WCC · Step 3 of 3</p>
              <h2 className="truncate text-lg font-bold text-white">{vendorName}</h2>
              <p className="mt-0.5 text-xs text-emerald-100">{vendorWoNumber || 'Work order not recorded'} · {landIds.length} land{landIds.length !== 1 ? 's' : ''} in scope</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-white/20 p-1.5 text-white transition-colors hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Date range */}
        <div className="shrink-0 border-b border-gray-100 bg-white px-6 py-4">
          <div className="mb-3 flex items-center gap-2">
            <CalendarRange className="h-3.5 w-3.5 text-emerald-700" />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Certificate Period</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full table-fixed border-collapse">
              <thead className="bg-[#eef5f3] text-[#0D3A35]">
                <tr>
                  <th className="w-1/4 border-r border-slate-200 px-4 py-2 text-left text-[10px] font-extrabold uppercase tracking-[0.1em]">From Date</th>
                  <th className="w-1/4 border-r border-slate-200 px-4 py-2 text-left text-[10px] font-extrabold uppercase tracking-[0.1em]">To Date</th>
                  <th className="w-1/4 border-r border-slate-200 px-3 py-2 text-center text-[10px] font-extrabold uppercase tracking-[0.1em]">Tasks</th>
                  <th className="w-1/4 px-3 py-2 text-center text-[10px] font-extrabold uppercase tracking-[0.1em]">Total Area</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-white">
                  <td className="border-r border-t border-slate-200 p-2.5">
                    <input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 focus:border-[#0D3A35] focus:outline-none focus:ring-2 focus:ring-[#0D3A35]/10" />
                  </td>
                  <td className="border-r border-t border-slate-200 p-2.5">
                    <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 focus:border-[#0D3A35] focus:outline-none focus:ring-2 focus:ring-[#0D3A35]/10" />
                  </td>
                  <td className="border-r border-t border-slate-200 px-3 py-2.5 text-center"><p className="text-lg font-black tabular-nums text-slate-900">{timelineTasks.length}</p><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Tasks</p></td>
                  <td className="border-t border-slate-200 px-3 py-2.5 text-center"><p className="text-lg font-black tabular-nums text-slate-900">{totalAcres.toFixed(1)}</p><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Acres</p></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Task Timeline */}
        <div className="flex-1 overflow-y-auto p-5 min-h-0 space-y-5">
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
            columns={3}
          />

          {/* Operational (non-cultivation) work — e.g. rental vehicle log books */}
          {(loadingOperational || operationalWorkDone.length > 0) && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Operational Work</span>
                {operationalWorkDone.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{operationalWorkDone.length}</span>
                )}
              </div>
              {loadingOperational ? (
                <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
                  <div className="h-4 w-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  Loading…
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] table-fixed border-collapse text-xs">
                      <thead className="bg-[#0D3A35] text-white">
                        <tr>
                          {[['S. No.', 'w-[7%]'], ['Activity', 'w-[20%]'], ['Place', 'w-[14%]'], ['Date of Completion', 'w-[14%]'], ['Work Order No.', 'w-[18%]'], ['UOM', 'w-[7%]'], ['Quantity', 'w-[8%]'], ['Status', 'w-[12%]']].map(([label, width]) => (
                            <th key={label} className={`${width} px-3 py-3 text-center text-[10px] font-bold uppercase tracking-[0.06em] text-white/90`}>{label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {operationalWorkDone.map((entry, idx) => (
                          <tr key={entry.line_item_id || `${entry.task_id || 'entry'}-${idx}`} className="transition-colors hover:bg-[#0D3A35]/[0.025]">
                            <td className="px-3 py-3 text-center font-medium text-slate-500">{idx + 1}</td>
                            <td className="px-3 py-3 font-semibold text-slate-800">{entry.activity}</td>
                            <td className="px-3 py-3 text-slate-600">{entry.farm_id ? mergedFarmerNames[entry.farm_id] || entry.farm_id : '—'}</td>
                            <td className="px-3 py-3 text-center font-medium text-slate-600">{formatDate(entry.completion_date || entry.to_date)}</td>
                            <td className="px-3 py-3 text-center font-mono text-[11px] text-[#0D3A35]">{entry.order_number || vendorWoNumber || '—'}</td>
                            <td className="px-3 py-3 text-center font-medium text-slate-600">{entry.unit || '—'}</td>
                            <td className="px-3 py-3 text-right font-bold tabular-nums text-slate-800">{entry.quantity ?? '—'}</td>
                            <td className="px-3 py-3 text-center"><span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold capitalize text-emerald-700">{entry.status || 'Completed'}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between gap-3 shrink-0">
          <p className="text-[11px] text-slate-400">
            Covers {timelineTasks.length} task{timelineTasks.length !== 1 ? 's' : ''}
            {operationalWorkDone.length > 0 ? ` · ${operationalWorkDone.length} operational entr${operationalWorkDone.length !== 1 ? 'ies' : 'y'}` : ''}
            {' '}· {formatDate(fromDate)} – {formatDate(toDate)}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {onBack && <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /> Change Work Order</button>}
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
              className="inline-flex items-center gap-2 rounded-xl bg-[#0D3A35] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#092e2a]"
            >
              <FileCheck className="w-4 h-4" /> Generate Certificate
            </button>
          </div>
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
          operationalWorkDone={operationalWorkDone}
          taskDetailsById={taskDetailsById}
          scopeItems={scopeItems}
          farmerNames={mergedFarmerNames}
          onClose={() => setShowCertificatePreview(false)}
        />
      )}
    </>
  );
};

export default WccModal;
