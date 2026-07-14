import React, { useState, useEffect } from 'react';
import {
  X, CheckCircle2, Clock, Circle,
  Truck, Wrench, ClipboardCheck,
  Loader2, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
interface PlotItem {
  plot_id: string;
  plot_name: string;
  plot_area: number;
}

interface Assignment {
  farm_id: string;
  assigned_area: number;
  status?: string;
  plot?: PlotItem[];
  task_id?: string;
}

export interface MonitorTask {
  activity: string;
  date: string;
  farm_id: string;
  farmerName: string;
  block_id: string;
  totalArea: number;
  assignments: Assignment[];
  task_id?: string;
}

interface TaskDetails {
  task_id: string;
  status: {
    feild_manager_status: string;
    farmer_status: string;
    supervisor_status: string;
  };
  trasport_coordination_status: string | null;
  equipment_coordination_status: string | null;
  equipment_coordination_image?: string | null;
  plot: PlotItem[];
  vehicles?: { vehicle_id: string; vehicle_number: string }[];
  equipment?: { equipment_name: string; equipment_id: string; quantity: number }[];
  allocation_schema?: { allocated_acres: number; farm_id: string; completed_acres: number }[];
  progress_images?: string[];
}

interface TaskMonitorModalProps {
  task: MonitorTask;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
type StageState = 'done' | 'current' | 'pending';

interface Step {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  state: StageState;
  subContent?: React.ReactNode;
}

const stageColors: Record<StageState, { dot: string; label: string; desc: string; line: string; icon: string }> = {
  done:    { dot: 'bg-emerald-500 border-emerald-500',                         label: 'text-emerald-700 font-semibold', desc: 'text-emerald-600', line: 'bg-emerald-400', icon: 'text-white'      },
  current: { dot: 'bg-white border-blue-500 shadow-blue-200 shadow-md',        label: 'text-blue-700 font-semibold',   desc: 'text-blue-500',    line: 'bg-gray-200',    icon: 'text-blue-500'   },
  pending: { dot: 'bg-white border-gray-300',                                   label: 'text-gray-400',                 desc: 'text-gray-400',    line: 'bg-gray-200',    icon: 'text-gray-300'   },
};

const SubStatusChip = ({ label, done }: { label: string; done: boolean }) => (
  <span className={cn(
    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border',
    done
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-gray-50 text-gray-400 border-gray-200',
  )}>
    {done ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Circle className="w-2.5 h-2.5" />}
    {label}
  </span>
);

function deriveSteps(details: TaskDetails): { steps: Step[]; doneCount: number } {
  const steps: Step[] = [];
  let flowBlocked = false;

  // Step 1: Transport Coordination (only if the field is present and non-null)
  if (details.trasport_coordination_status != null) {
    const done = details.trasport_coordination_status === 'completed';
    const state: StageState = done ? 'done' : flowBlocked ? 'pending' : 'current';
    if (!done) flowBlocked = true;
    steps.push({
      key: 'transport',
      label: 'Transport Coordination',
      description: done ? 'Vehicles dispatched and confirmed on-site.' : 'Waiting for transport to be arranged.',
      icon: <Truck className="w-4 h-4" />,
      state,
    });
  }

  // Step 2: Equipment Coordination (only if the field is present and non-null)
  if (details.equipment_coordination_status != null) {
    const done = details.equipment_coordination_status === 'completed';
    const state: StageState = done ? 'done' : flowBlocked ? 'pending' : 'current';
    if (!done) flowBlocked = true;

    const imgUrl = done && details.equipment_coordination_image ? details.equipment_coordination_image : null;

    steps.push({
      key: 'equipment',
      label: 'Equipment Coordination',
      description: done ? 'Equipment received and confirmed on-site.' : 'Waiting for equipment to be arranged.',
      icon: <Wrench className="w-4 h-4" />,
      state,
      subContent: imgUrl ? (
        <div className="mt-2.5">
          <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-1.5">Equipment Receipt</p>
          <img
            src={imgUrl}
            alt="Equipment coordination receipt"
            className="rounded-xl border border-gray-200 max-h-40 object-cover w-full shadow-sm"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      ) : undefined,
    });
  }

  // Step 3: Task Completion (always present)
  const s = details.status;
  const supDone    = s.supervisor_status    === 'completed';
  const fmDone     = s.feild_manager_status === 'completed';
  const farmerDone = s.farmer_status        === 'completed';
  const taskDone   = supDone && fmDone && farmerDone;
  const taskState: StageState = taskDone ? 'done' : flowBlocked ? 'pending' : 'current';

  steps.push({
    key: 'completion',
    label: 'Task Completion',
    description: taskDone ? 'All approvals received. Task closed successfully.' : 'Awaiting approvals from stakeholders.',
    icon: <ClipboardCheck className="w-4 h-4" />,
    state: taskState,
    subContent: (
      <div className="mt-2 flex flex-wrap gap-1.5">
        <SubStatusChip label="Supervisor"    done={supDone}    />
        <SubStatusChip label="Field Manager" done={fmDone}     />
        <SubStatusChip label="Farmer"        done={farmerDone} />
      </div>
    ),
  });

  return { steps, doneCount: steps.filter((st) => st.state === 'done').length };
}

// ─────────────────────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────────────────────
const normalizeStatus = (raw?: string) => String(raw || '').trim().toLowerCase();

const StatusBadge = ({ raw }: { raw: string }) => {
  const s = normalizeStatus(raw);
  const map: Record<string, { label: string; cls: string }> = {
    unassigned:              { label: 'Unassigned',        cls: 'bg-gray-100 text-gray-600 border-gray-200'       },
    pending:                 { label: 'Pending',            cls: 'bg-orange-100 text-orange-700 border-orange-200' },
    sup_task_completed:      { label: 'Sup. Approved',      cls: 'bg-blue-100 text-blue-700 border-blue-200'       },
    completed:               { label: 'Completed',          cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    overdue:                 { label: 'Overdue',            cls: 'bg-red-100 text-red-700 border-red-200'          },
    rental_send_workorder:   { label: 'Workorder Sent',     cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    rental_pending:          { label: 'Rental Pending',     cls: 'bg-purple-100 text-purple-700 border-purple-200' },
    rental_completed:        { label: 'Rental Completed',   cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    contract_farm:           { label: 'Contract Farm',      cls: 'bg-slate-100 text-slate-700 border-slate-200'    },
    contract_farm_pending:   { label: 'Contract Pending',   cls: 'bg-amber-100 text-amber-700 border-amber-200'    },
    contract_farm_completed: { label: 'Contract Completed', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  };
  const { label, cls } = map[s] ?? { label: s || 'Unknown', cls: 'bg-gray-100 text-gray-600 border-gray-200' };
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border', cls)}>
      {label}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
const TaskMonitorModal = ({ task, onClose }: TaskMonitorModalProps) => {
  const [details, setDetails]     = useState<TaskDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const primaryStatus = task.assignments[0]?.status ?? 'unassigned';

  useEffect(() => {
    const taskId = task.task_id;
    if (!taskId) return;

    const BASE_URL = getBaseUrl().replace(/\/$/, '');
    setIsLoading(true);
    setFetchError(null);

    fetch(`${BASE_URL}/admin_all_task/get_task_details/${taskId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setDetails(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setFetchError(err?.message ?? 'Failed to load task details');
        setIsLoading(false);
      });
  }, [task.task_id]);

  const { steps, doneCount } = details
    ? deriveSteps(details)
    : { steps: [], doneCount: 0 };

  const totalSteps = steps.length;
  const progressPct = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0;

  // Use plots from API if available, otherwise fall back to assignment plots
  const plots = details?.plot?.length
    ? details.plot
    : task.assignments.flatMap((a) => a.plot ?? []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* ── Header ── */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4 bg-gradient-to-r from-gray-50 to-white">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">Task Monitor</p>
            <h2 className="text-base font-bold text-gray-900 truncate">{task.activity}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
              <span>{new Date(task.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <span className="text-gray-300">·</span>
              <span className="font-medium text-gray-700 truncate">{task.farmerName || task.farm_id}</span>
              <span className="text-gray-300">·</span>
              <span>{task.totalArea.toFixed(2)} ac</span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <StatusBadge raw={primaryStatus} />
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
              <Loader2 className="w-7 h-7 animate-spin text-violet-500" />
              <span className="text-sm">Loading task details…</span>
            </div>
          )}

          {/* Error */}
          {!isLoading && fetchError && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-red-400">
              <AlertCircle className="w-7 h-7" />
              <span className="text-sm font-medium">{fetchError}</span>
              {!task.task_id && (
                <span className="text-[11px] text-gray-400">No task ID available for this entry.</span>
              )}
            </div>
          )}

          {/* No task_id */}
          {!isLoading && !fetchError && !task.task_id && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
              <AlertCircle className="w-7 h-7" />
              <span className="text-sm">No task ID found for this assignment.</span>
            </div>
          )}

          {/* ── Progress + Timeline ── */}
          {!isLoading && !fetchError && details && (
            <>
              {/* Progress bar */}
              <div className="px-6 pt-5 pb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Overall Progress</span>
                  <span className="text-[11px] font-bold text-gray-700">{doneCount}/{totalSteps} steps</span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Timeline */}
              <div className="px-6 pb-4 pt-2 space-y-0">
                {steps.map((step, idx) => {
                  const c = stageColors[step.state];
                  const isLast = idx === steps.length - 1;
                  return (
                    <div key={step.key} className="flex gap-4">
                      {/* Dot + connector */}
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          'w-9 h-9 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                          c.dot,
                        )}>
                          <span className={c.icon}>
                            {step.state === 'done'
                              ? <CheckCircle2 className="w-4 h-4" />
                              : step.state === 'current'
                                ? <Clock className="w-4 h-4 animate-pulse" />
                                : <Circle className="w-4 h-4" />}
                          </span>
                        </div>
                        {!isLast && (
                          <div className={cn('w-0.5 flex-1 my-1 min-h-[28px]', c.line)} />
                        )}
                      </div>

                      {/* Content */}
                      <div className={cn('pb-5 min-w-0 flex-1', isLast && 'pb-3')}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={cn('text-sm', c.label)}>{step.label}</span>
                          {step.state === 'current' && (
                            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full">In Progress</span>
                          )}
                          {step.state === 'done' && (
                            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded-full">Done</span>
                          )}
                        </div>
                        <p className={cn('text-[11px] leading-relaxed', c.desc)}>{step.description}</p>
                        {step.subContent}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Progress Photos — shown whenever available, regardless of how far
                   along the approval workflow is ── */}
              {(details.progress_images?.length ?? 0) > 0 && (
                <div className="mx-6 mb-4 border border-gray-100 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Progress Photos</p>
                    <span className="text-[10px] font-bold text-gray-400">{details.progress_images!.length}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 p-3">
                    {details.progress_images!.map((url, idx) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
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
                </div>
              )}

              {/* ── Plots summary ── */}
              {plots.length > 0 && (
                <div className="mx-6 mb-4 border border-gray-100 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Assigned Plots</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 p-3">
                    {plots.map((p) => (
                      <div key={p.plot_id} className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-3 py-2">
                        <span className="text-[12px] font-medium text-gray-800">{p.plot_name}</span>
                        <span className="text-[11px] font-mono text-gray-500">{p.plot_area} ac</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/60 flex justify-end">
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

export default TaskMonitorModal;
