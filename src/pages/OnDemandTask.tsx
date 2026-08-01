import { useEffect, useMemo, useState } from 'react';
import { X, Plus, ChevronDown, UserCheck, Save, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskStepType = 'inventory' | 'logistics' | 'inspection' | 'cultivation' | 'on_field' | 'other';

type OnFieldTaskMode = 'cultivation' | 'non_cultivation';

interface TaskFlowStep {
  id: string;
  stepNumber: number;
  type: TaskStepType | '';
  expanded: boolean;
  details: {
    assignee: string;
    assigneeDesignation: string;
    title: string;
    notes: string;
    inventoryItems: Record<string, number>;
    allocationNeeded: boolean;
    vehicleIds: string[];
    inspectionInputType: string;
    inspectionFields: Array<{ id: string; fieldName: string; inputType: string; mandatory: boolean; options: string[] }>;
    landId: string;
    otherDescription: string;
    // On Field Task (vendor-scoped) fields
    onFieldMode: OnFieldTaskMode;
    onFieldCalendarId: string;
    vendorId: string;
    vendorName: string;
    onFieldActivity: string;
    onFieldStartDate: string;
    onFieldWorkQuantity: string;
    onFieldFromDate: string;
    onFieldToDate: string;
    // Plain-language quantity: "Do [2] [Borewells]", optionally "up to [250] [feet deep]"
    onFieldQty: string;
    onFieldUnit: string;
    onFieldSpecValue: string;
    onFieldSpecUnit: string;
  };
}

// Shape returned by /admin_cultivation/get_scope_of_work_for_land/{farmId}
interface VendorScopeEntry {
  vendor_details: { vendor_name: string; vendor_contact: string };
  activities: string[];
  start_date: string;
  end_date: string;
}

// A plot within a land, as returned by /admin_cultivation/get_scope_of_work_for_vendor
interface OnFieldPlot {
  plot_id: string;
  plot_name: string;
  crop_type: string | null;
  plot_area: number;
}

// Shape returned by /admin_cultivation/cultivation_calendars_for_farm/{farmId}
interface OnFieldCalendarOption {
  calander_id: string;
  plan_id: string;
  farm_id: string[];
  start_date: string;
  end_date: string;
}

// Shape returned by /admin_cultivation/get_cultivation_activities
interface ApiCultivationActivity {
  id: string;
  name: string;
  category?: string;
  icon?: string;
  crop_type?: string[];
}

type StaffRecord = {
  staff_id?: string;
  staff_information?: {
    staff_name?: string;
    staff_department?: string;
    staff_designation?: string;
  };
};

interface OnDemandTaskStepApi {
  type?: string;
  data?: any[];
  status?: string;
  equipment_otp?: string;
  handover_proof_delivery?: string;
  task_media?: string[];
}

interface OnDemandTaskApi {
  staff_id?: string;
  steps_dict?: Record<string, OnDemandTaskStepApi>;
  created_at?: string;
  task_id?: string;
}

interface StepViewModel {
  key: string;
  stepNumber: number;
  type: string;
  status: string;
  data: any[];
  title: string;
  equipmentOtp?: string;
  handoverProof?: string;
  taskMedia: string[];
}

interface TaskViewModel {
  taskId: string;
  staffId: string;
  createdAt: string;
  steps: StepViewModel[];
  totalSteps: number;
  completedSteps: number;
}

type AllocationItemForm = {
  id: string;
  inventoryItemId: string;
  totalQty: string;
};

type AllocationRecord = {
  id: string;
  staffId: string;
  staffName: string;
  designation: string;
  items: Array<{ id: string; inventoryItemId: string; itemName: string; totalQty: number }>;
  distribution: Record<string, Record<string, string>>;
  selectedFarms: Array<{ farmId: string; label: string }>;
  createdAt: string;
};

type ApiAllocationItem = {
  unit: string;
  item_name: string;
  quantity: number;
  farm_allocation: Record<string, { owner_name: string; quantity: number }>;
};

type ApiAllocationSchema = {
  task_id: string;
  allocation_schema: Record<string, ApiAllocationItem>;
  created_at: string;
  allocation_schema_status: 'pending' | 'partial' | 'completed';
  steps_dict?: Record<string, OnDemandTaskStepApi>;
  staff_id?: string;
};

type PendingAllocationTask = {
  task_id: string;
  staff_id: string;
  created_at: string;
  allocation_schema: Record<string, ApiAllocationItem>;
  allocation_schema_status: 'pending' | 'partial';
  steps_dict: Record<string, OnDemandTaskStepApi>;
};

type LockConfirmTarget = {
  taskId: string;
  stepsDict: Record<string, OnDemandTaskStepApi>;
  allocationSchema: Record<string, ApiAllocationItem>;
  createdAt: string;
  staffId?: string;
};


// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = getBaseUrl().replace(/\/$/, '');

const allocationStatusConfig: Record<string, { label: string; classes: string }> = {
  pending:   { label: 'Pending',   classes: 'bg-amber-100 text-amber-700 border-amber-200' },
  partial:   { label: 'Partial',   classes: 'bg-blue-100 text-blue-700 border-blue-200' },
  completed: { label: 'Completed', classes: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

const taskStepTypeMeta: Record<TaskStepType, { label: string; badge: string; shell: string; panel: string }> = {
  inventory: {
    label: 'Inventory',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    shell: 'border-emerald-200 bg-emerald-50/60',
    panel: 'border-emerald-200 bg-white',
  },
  logistics: {
    label: 'Logistics',
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    shell: 'border-amber-200 bg-amber-50/60',
    panel: 'border-amber-200 bg-white',
  },
  inspection: {
    label: 'Inspection',
    badge: 'bg-sky-100 text-sky-700 border-sky-200',
    shell: 'border-sky-200 bg-sky-50/60',
    panel: 'border-sky-200 bg-white',
  },
  cultivation: {
    label: 'Cultivation',
    badge: 'bg-lime-100 text-lime-800 border-lime-200',
    shell: 'border-lime-200 bg-lime-50/60',
    panel: 'border-lime-200 bg-white',
  },
  on_field: {
    label: 'On Field Task',
    badge: 'bg-lime-100 text-lime-800 border-lime-200',
    shell: 'border-lime-200 bg-lime-50/60',
    panel: 'border-lime-200 bg-white',
  },
  other: {
    label: 'Other',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    shell: 'border-slate-200 bg-slate-50/70',
    panel: 'border-slate-200 bg-white',
  },
};

// ─── Display helpers (task list) ──────────────────────────────────────────────

const formatTaskDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatShortDate = (dateStr: string) => {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const addDaysToDate = (dateStr: string, days: number) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  // Build the date string from local getters, not toISOString() (which is UTC-based) — in any
  // timezone ahead of UTC (e.g. IST), toISOString() rolls back onto the previous local day,
  // which silently cancelled out the +1 here and made every rollover collapse onto the start date.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Work quantity is a daily capacity, not a one-time total — e.g. 10 acres/day means a day can
// take anywhere from 7-13 acres (± tolerance). Auto-schedules every plot onto a date by filling
// each day with whole plots up to that ceiling (workQtyPerDay + tolerance), only rolling over to
// the next day once the next plot would push the day past it. Plots are never split, so a lone
// plot bigger than the ceiling still gets a day to itself.
const DAILY_WORK_QTY_TOLERANCE = 3;

const computePlotSchedule = (plots: OnFieldPlot[], startDate: string, workQtyPerDay: number): Array<{ plot: OnFieldPlot; assignedDate: string }> => {
  if (!startDate || workQtyPerDay <= 0) return [];
  const maxPerDay = workQtyPerDay + DAILY_WORK_QTY_TOLERANCE;
  let currentDate = startDate;
  let dayTotal = 0;
  return plots.map(plot => {
    const area = Number(plot.plot_area) || 0;
    if (dayTotal > 0 && dayTotal + area > maxPerDay) {
      currentDate = addDaysToDate(currentDate, 1);
      dayTotal = 0;
    }
    dayTotal += area;
    return { plot, assignedDate: currentDate };
  });
};

const toStepNumber = (stepKey: string) => {
  const match = stepKey.match(/step_(\d+)/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
};


const getStepStatusClasses = (status: string) => {
  const s = String(status || '').toLowerCase();
  if (s === 'completed') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (s === 'in_progress' || s === 'in-progress') return 'bg-blue-100 text-blue-700 border-blue-200';
  if (s === 'failed' || s === 'rejected') return 'bg-red-100 text-red-700 border-red-200';
  return 'bg-amber-100 text-amber-700 border-amber-200';
};

const stepTypeColor: Record<string, string> = {
  inventory: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  logistics: 'bg-amber-100 text-amber-800 border-amber-200',
  inspection: 'bg-sky-100 text-sky-700 border-sky-200',
  cultivation: 'bg-lime-100 text-lime-800 border-lime-200',
  on_field: 'bg-lime-100 text-lime-800 border-lime-200',
  others: 'bg-slate-100 text-slate-700 border-slate-200',
  other: 'bg-slate-100 text-slate-700 border-slate-200',
};

const renderStepCard = (step: StepViewModel) => {
  const t = String(step.type || '').toLowerCase();
  const isCompleted = step.status === 'completed';

  if (t === 'inventory') return (
    <div className="space-y-2.5">
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="grid grid-cols-[2fr_1fr_1fr] bg-slate-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
          <div>Item</div><div className="text-center">Qty</div><div className="text-right">Unit</div>
        </div>
        {step.data.map((item, i) => (
          <div key={i} className="grid grid-cols-[2fr_1fr_1fr] px-3 py-2 text-xs border-t border-slate-100 first:border-t-0 bg-white">
            <div className="font-medium text-slate-900 truncate">{item?.item_name || item?.name || `Item ${i + 1}`}</div>
            <div className="text-center text-slate-700">{item?.quantity ?? '—'}</div>
            <div className="text-right text-slate-500">{item?.unit || '—'}</div>
          </div>
        ))}
      </div>
      {step.equipmentOtp && (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Equipment OTP</span>
          <span className="font-mono text-lg font-bold tracking-widest text-slate-900">{step.equipmentOtp}</span>
        </div>
      )}
      {isCompleted && step.handoverProof && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Handover Proof</p>
          <img src={step.handoverProof} alt="Handover proof" className="w-full h-28 rounded-lg object-cover border border-slate-200" />
        </div>
      )}
    </div>
  );

  if (t === 'logistics') return (
    <div className="space-y-2">
      {step.data.map((item, i) => (
        <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="text-base font-bold text-slate-900 tracking-wide">{item?.vehicle_number || `Vehicle ${i + 1}`}</div>
          <div className="text-[11px] text-slate-400 font-mono mt-0.5">{item?.vehicle_id || '—'}</div>
        </div>
      ))}
    </div>
  );

  if (t === 'cultivation') return (
    <div className="space-y-2.5">
      {step.data.map((item, i) => {
        const farmer = item?.farmer_details;
        const farm = item?.farm_details;
        return (
          <div key={i} className="space-y-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Activity</span>
                <span className="font-semibold text-slate-900 capitalize">{item?.activity || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Due date</span>
                <span className="text-slate-700">{item?.due_date || '—'}</span>
              </div>
              {farm && <>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Village</span>
                  <span className="text-slate-700">{farm?.land_data?.village || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Area</span>
                  <span className="text-slate-700">{farm?.area ? `${farm.area} acres` : '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Crop</span>
                  <span className="text-slate-700 capitalize">{farm?.crop_type || '—'}</span>
                </div>
              </>}
              {farmer && <>
                <div className="border-t border-slate-200 pt-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Farmer</span>
                  <span className="font-medium text-slate-900">{farmer?.owner_name || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Contact</span>
                  <span className="text-slate-700">{farmer?.contact || '—'}</span>
                </div>
              </>}
            </div>
          </div>
        );
      })}
      {isCompleted && step.taskMedia.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Task Media</p>
          <div className="grid grid-cols-3 gap-1.5">
            {step.taskMedia.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt={`Media ${i + 1}`} className="w-full h-16 rounded-md object-cover border border-slate-200 hover:opacity-90 transition-opacity" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (t === 'on_field') return (
    <div className="space-y-2.5">
      {step.data.map((item, i) => (
        <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{item?.work_quantity_per_day != null ? 'Activity' : 'Task'}</span>
            <span className="font-semibold text-slate-900">{item?.activity || '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Vendor</span>
            <span className="text-slate-700">{item?.vendor_name || '—'}</span>
          </div>
          {item?.work_quantity_per_day != null ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Start date</span>
                <span className="text-slate-700">{item?.start_date || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Work qty</span>
                <span className="text-slate-700">{item?.work_quantity_per_day} acres/day · {Array.isArray(item?.plot_distribution) ? item.plot_distribution.length : 0} plot(s)</span>
              </div>
              {Array.isArray(item?.plot_distribution) && item.plot_distribution.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {item.plot_distribution.map((p: any, pi: number) => (
                    <span key={pi} className="text-[10px] px-1.5 py-0.5 bg-lime-100 text-lime-800 border border-lime-200 rounded font-medium">{p.plot_id}: {p.assigned_date}</span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Timeline</span>
                <span className="text-slate-700">{item?.from_date || '—'} → {item?.to_date || '—'}</span>
              </div>
              {item?.quantity != null && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Quantity</span>
                  <span className="text-slate-700">
                    {item.quantity} {item.unit}
                    {item?.spec_value != null && item?.spec_unit ? `, up to ${item.spec_value} ${item.spec_unit}` : ''}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );

  if (t === 'inspection') return (
    <div className="space-y-2">
      {step.data.map((field, i) => {
        const inputType = String(field?.input_type || '').toLowerCase();
        const hasResponse = field?.response != null && field?.response !== null;
        return (
          <div key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-900 truncate">{field?.field_name || `Field ${i + 1}`}</span>
              <span className={cn('shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border', inputType === 'mcq' ? 'bg-purple-50 text-purple-700 border-purple-200' : inputType === 'image_upload' ? 'bg-rose-50 text-rose-700 border-rose-200' : inputType === 'number' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200')}>
                {inputType === 'image_upload' ? 'Image' : inputType.toUpperCase()}
              </span>
            </div>
            {inputType === 'mcq' && field?.options && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {(field.options as string[]).map((opt, oi) => (
                  <span key={oi} className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium border', hasResponse && field.response === opt ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-slate-50 text-slate-500 border-slate-200')}>
                    {opt}
                  </span>
                ))}
              </div>
            )}
            {inputType === 'image_upload' && hasResponse && (
              <a href={String(field.response)} target="_blank" rel="noopener noreferrer">
                <img src={String(field.response)} alt={field?.field_name} className="w-full h-20 rounded-md object-cover border border-slate-200 hover:opacity-90 transition-opacity mt-1" />
              </a>
            )}
            {(inputType === 'text' || inputType === 'number') && hasResponse && (
              <div className="rounded-md bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 font-medium">{String(field.response)}</div>
            )}
            {!hasResponse && isCompleted && inputType !== 'mcq' && <div className="text-[10px] text-slate-400 italic">No response</div>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 leading-relaxed">
      {step.data.map((item, i) => <p key={i}>{item?.description || item?.note || '—'}</p>)}
    </div>
  );
};

const normalizeTaskSteps = (stepsDict: Record<string, OnDemandTaskStepApi> = {}): StepViewModel[] =>
  Object.entries(stepsDict).map(([key, step]) => {
    const stepNumber = toStepNumber(key);
    const type = String(step?.type || 'other');
    const data = Array.isArray(step?.data) ? step.data : [];
    const status = String(step?.status || 'pending');
    return {
      key, stepNumber, type, status, data,
      title: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      equipmentOtp: step?.equipment_otp,
      handoverProof: step?.handover_proof_delivery,
      taskMedia: Array.isArray(step?.task_media) ? step.task_media : [],
    };
  }).sort((a, b) => a.stepNumber - b.stepNumber);

const normalizeOndemandTask = (task: OnDemandTaskApi): TaskViewModel => {
  const steps = normalizeTaskSteps(task.steps_dict || {});
  const completedSteps = steps.filter(s => String(s.status).toLowerCase() === 'completed').length;
  return { taskId: String(task.task_id || 'Task'), staffId: String(task.staff_id || '—'), createdAt: formatTaskDate(task.created_at), steps, totalSteps: steps.length, completedSteps };
};

const normalizeDesignation = (v?: string) => String(v || '').trim().toLowerCase();
const formatDesignationLabel = (v?: string) => { const c = String(v || '').trim(); return c ? c.charAt(0).toUpperCase() + c.slice(1) : ''; };
const getInventoryItemId = (item: any) => String(item?.id || item?.Invent_id || item?.item_id || item?.item || '');
const getVehicleId = (vehicle: any) => String(vehicle?.vehicle_id || vehicle?.id || '');
const getInventoryItemName = (item: any) => String(item?.item_name || item?.name || item?.item || getInventoryItemId(item) || 'Unknown item');
const getVehicleName = (vehicle: any) => String(vehicle?.vehicle_information?.vehicle_number || vehicle?.vehicle_number || vehicle?.name || getVehicleId(vehicle) || 'Unknown vehicle');

// ─── Component ────────────────────────────────────────────────────────────────

const OnDemandTask = () => {
  // Task list state
  const [ondemandTasks, setOndemandTasks] = useState<TaskViewModel[]>([]);
  const [ondemandTasksLoading, setOndemandTasksLoading] = useState(false);
  const [ondemandTasksError, setOndemandTasksError] = useState<string | null>(null);

  // Shared resources
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [farms, setFarms] = useState<any[]>([]);
  const [cultivationActivities, setCultivationActivities] = useState<ApiCultivationActivity[]>([]);

  // Modal / task builder state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [staffByDesignation, setStaffByDesignation] = useState<Record<string, StaffRecord[]>>({});
  const [taskAssignment, setTaskAssignment] = useState<{ designation: string; staffId: string; staffName: string }>({ designation: '', staffId: '', staffName: '' });
  const [taskFlowSteps, setTaskFlowSteps] = useState<TaskFlowStep[]>([]);
  const [resourcePopup, setResourcePopup] = useState<{ stepId: string; type: 'inventory' | 'logistics' } | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [activeTab, setActiveTab] = useState<'task' | 'allocation'>('task');

  // On Field Task: vendor scope + plots, fetched per-step since each step can target a different farm/vendor
  const [scopeByStep, setScopeByStep] = useState<Record<string, Record<string, VendorScopeEntry>>>({});
  const [scopeLoadingByStep, setScopeLoadingByStep] = useState<Record<string, boolean>>({});
  const [plotsByStep, setPlotsByStep] = useState<Record<string, OnFieldPlot[]>>({});
  const [plotsLoadingByStep, setPlotsLoadingByStep] = useState<Record<string, boolean>>({});
  const [excludedPlotsByStep, setExcludedPlotsByStep] = useState<Record<string, string[]>>({});
  const [calendarsByStep, setCalendarsByStep] = useState<Record<string, OnFieldCalendarOption[]>>({});
  const [calendarsLoadingByStep, setCalendarsLoadingByStep] = useState<Record<string, boolean>>({});


  // Allocation modal state
  const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);
  const [allocationAssignment, setAllocationAssignment] = useState<{ designation: string; staffId: string; staffName: string }>({ designation: '', staffId: '', staffName: '' });
  const [allocationItems, setAllocationItems] = useState<AllocationItemForm[]>([]);
  const [allocationRecords, setAllocationRecords] = useState<AllocationRecord[]>([]);
  const [farmColumnSelectors, setFarmColumnSelectors] = useState<Record<string, string>>({});

  // API allocation list state
  const [apiAllocations, setApiAllocations] = useState<ApiAllocationSchema[]>([]);
  const [pendingAllocationTasks, setPendingAllocationTasks] = useState<PendingAllocationTask[]>([]);
  const [apiAllocationsLoading, setApiAllocationsLoading] = useState(false);
  const [apiAllocationsError, setApiAllocationsError] = useState<string | null>(null);

  // Per-allocation editable distribution state (for pending/partial)
  const [apiAllocFarms, setApiAllocFarms] = useState<Record<string, string[]>>({});
  const [apiAllocDistribution, setApiAllocDistribution] = useState<Record<string, Record<string, Record<string, string>>>>({});
  const [apiFarmSelectors, setApiFarmSelectors] = useState<Record<string, string>>({});

  // Lock confirmation popup
  const [lockConfirmTarget, setLockConfirmTarget] = useState<LockConfirmTarget | null>(null);

  // ── Fetch shared resources ──────────────────────────────────────────────────

  useEffect(() => {
    const fetchResources = async () => {
      try {
        const [invRes, vehRes, farmRes, actRes] = await Promise.all([
          fetch(`${BASE_URL}/inventory_management/get_inventory_items`),
          fetch(`${BASE_URL}/admin_vehicles/get_all_vehicles`),
          fetch(`${BASE_URL}/admin_ops_requests/get_farm_and_farmer`),
          fetch(`${BASE_URL}/admin_cultivation/get_cultivation_activities`),
        ]);
        const invJson = await invRes.json().catch(() => ({}));
        const vehJson = await vehRes.json().catch(() => ({}));
        const farmJson = await farmRes.json().catch(() => ({}));
        const actJson = await actRes.json().catch(() => ({}));
        const invList = Array.isArray(invJson?.inventory_items) ? invJson.inventory_items : [];
        const vehList = Array.isArray(vehJson) ? vehJson : Array.isArray(vehJson?.vehicles) ? vehJson.vehicles : [];
        const farmList = Array.isArray(farmJson?.farm_farmer_mapping) ? farmJson.farm_farmer_mapping : [];
        const activityList = actJson?.success && Array.isArray(actJson?.activities) ? actJson.activities : [];
        setInventoryItems(invList.length > 0 ? invList : [{ id: 'inv-1', item_name: 'Fertilizer A', stock: 50, unit: 'kg' }, { id: 'inv-2', item_name: 'Pesticide B', stock: 30, unit: 'ltr' }]);
        setVehicles(vehList.length > 0 ? vehList : [{ vehicle_id: 'veh-1', vehicle_information: { vehicle_number: 'TR-001', company: 'AgroCo' } }, { vehicle_id: 'veh-2', vehicle_information: { vehicle_number: 'TR-002', company: 'AgroCo' } }]);
        setFarms(farmList.length > 0 ? farmList : [{ farm_id: 'farm-1', farmer_id: 'farmer-1', area: 2.5, priority: 1, land_data: { village: 'Village A', district: 'District X' } }]);
        setCultivationActivities(activityList);
      } catch { /* keep defaults */ }
    };
    fetchResources();
  }, []);

  // ── Fetch task list ─────────────────────────────────────────────────────────

  const fetchOnDemandTasks = async () => {
    try {
      setOndemandTasksLoading(true);
      setOndemandTasksError(null);
      const response = await fetch(`${BASE_URL}/admin_all_task/get_all_ondemand_tasks`);
      if (!response.ok) throw new Error(`Failed to load on demand tasks (${response.status})`);
      const data = await response.json().catch(() => null);
      let list: any[] = [];
      if (Array.isArray(data)) {
        list = data;
      } else if (data?.allocated_tasks !== undefined || data?.pending_allocation_tasks !== undefined) {
        list = [
          ...(Array.isArray(data.allocated_tasks) ? data.allocated_tasks : []),
          ...(Array.isArray(data.pending_allocation_tasks) ? data.pending_allocation_tasks : []),
        ];
      }
      setOndemandTasks(list.map(t => normalizeOndemandTask(t as OnDemandTaskApi)));
    } catch (error) {
      setOndemandTasks([]);
      setOndemandTasksError('Unable to load on demand tasks.');
    } finally {
      setOndemandTasksLoading(false);
    }
  };

  useEffect(() => { fetchOnDemandTasks(); }, []);

  // ── Fetch allocations ───────────────────────────────────────────────────────

  const fetchAllocations = async () => {
    try {
      setApiAllocationsLoading(true);
      setApiAllocationsError(null);
      const response = await fetch(`${BASE_URL}/admin_ops_requests/get_on_demand_allocation_schema`);
      if (!response.ok) throw new Error(`Failed to load allocations (${response.status})`);
      const data = await response.json().catch(() => null);
      setPendingAllocationTasks(Array.isArray(data?.pending_allocations) ? data.pending_allocations : []);
      setApiAllocations(Array.isArray(data?.completed_allocations) ? data.completed_allocations : []);
    } catch (e) {
      setApiAllocationsError(e instanceof Error ? e.message : 'Failed to load allocations');
      setApiAllocations([]);
      setPendingAllocationTasks([]);
    } finally {
      setApiAllocationsLoading(false);
    }
  };

  useEffect(() => { fetchAllocations(); }, []);
  useEffect(() => { if (activeTab === 'allocation') fetchAllocations(); }, [activeTab]);

  // ── Task builder helpers ────────────────────────────────────────────────────

  const createTaskStep = (stepNumber: number): TaskFlowStep => ({
    id: `${Date.now()}-${stepNumber}-${Math.random().toString(16).slice(2)}`,
    stepNumber,
    type: '',
    expanded: true,
    details: {
      assignee: '', assigneeDesignation: '', title: `Step ${stepNumber}`, notes: '', inventoryItems: {}, allocationNeeded: false, vehicleIds: [], inspectionInputType: 'text', inspectionFields: [], landId: '', otherDescription: '',
      onFieldMode: 'cultivation', onFieldCalendarId: '', vendorId: '', vendorName: '', onFieldActivity: '', onFieldStartDate: '', onFieldWorkQuantity: '', onFieldFromDate: '', onFieldToDate: '', onFieldQty: '', onFieldUnit: '', onFieldSpecValue: '', onFieldSpecUnit: '',
    },
  });

  const openModal = async () => {
    setIsModalOpen(true);
    setTaskAssignment({ designation: '', staffId: '', staffName: '' });
    setTaskFlowSteps([]);
    setResourcePopup(null);
    try {
      const response = await fetch(`${BASE_URL}/admin_staff/get_all_staff`);
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const data = await response.json().catch(() => ({}));
      const list = Array.isArray(data) ? data : Array.isArray(data?.staffs) ? data.staffs : Array.isArray(data?.data) ? data.data : [];
      const grouped = list.reduce((acc: Record<string, StaffRecord[]>, staff: StaffRecord) => {
        const designation = normalizeDesignation(staff?.staff_information?.staff_designation);
        if (!designation) return acc;
        acc[designation] = [...(acc[designation] || []), staff];
        return acc;
      }, {});
      setStaffByDesignation(grouped);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load staff');
      setStaffByDesignation({});
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setTaskAssignment({ designation: '', staffId: '', staffName: '' });
    setTaskFlowSteps([]);
    setResourcePopup(null);
  };

  const buildStepsDict = (steps: TaskFlowStep[]) =>
    steps.reduce<Record<string, any>>((acc, step, index) => {
      if (!step.type) return acc;
      const key = `step_${index + 1}`;
      if (step.type === 'inventory') {
        acc[key] = { type: 'inventory', status: 'pending', allocation_needed: step.details.allocationNeeded, data: Object.entries(step.details.inventoryItems).filter(([, qty]) => Number(qty) > 0).map(([itemId, qty]) => { const item = inventoryItems.find(e => getInventoryItemId(e) === itemId); return { item_name: String(item ? getInventoryItemName(item) : itemId), quantity: Number(qty) || 0, unit: String(item?.unit || '—'), equipment_id: String(getInventoryItemId(item) || itemId) }; }) };
        return acc;
      }
      if (step.type === 'logistics') {
        acc[key] = { type: 'logistics', status: 'pending', data: step.details.vehicleIds.map(vid => { const v = vehicles.find(e => getVehicleId(e) === vid); if (!v) return null; return { vehicle_id: getVehicleId(v), vehicle_number: String(v?.vehicle_information?.vehicle_number || getVehicleName(v)) }; }).filter(Boolean) };
        return acc;
      }
      if (step.type === 'on_field') {
        const d = step.details;
        const land = farms.find(f => String(f?.farm_id || f?.id || '') === d.landId);
        const base = { farm_id: String(land?.farm_id || ''), vendor_id: d.vendorId, vendor_name: d.vendorName, activity: d.onFieldActivity };
        const data = d.onFieldMode === 'cultivation'
          ? [{
              ...base,
              calander_id: d.onFieldCalendarId,
              start_date: d.onFieldStartDate,
              work_quantity_per_day: Number(d.onFieldWorkQuantity) || 0,
              plot_distribution: computePlotSchedule(
                (plotsByStep[step.id] || []).filter(p => !(excludedPlotsByStep[step.id] || []).includes(p.plot_id)),
                d.onFieldStartDate, Number(d.onFieldWorkQuantity) || 0
              ).map(({ plot, assignedDate }) => ({ plot_id: plot.plot_id, plot_name: plot.plot_name, crop_type: plot.crop_type, quantity: Number(plot.plot_area) || 0, assigned_date: assignedDate })),
            }]
          : [{
              ...base,
              from_date: d.onFieldFromDate,
              to_date: d.onFieldToDate,
              quantity: Number(d.onFieldQty) || 0,
              unit: d.onFieldUnit,
              ...(d.onFieldSpecValue && d.onFieldSpecUnit ? { spec_value: Number(d.onFieldSpecValue) || 0, spec_unit: d.onFieldSpecUnit } : {}),
            }];
        acc[key] = { type: 'on_field', status: 'pending', task_mode: d.onFieldMode, data };
        return acc;
      }
      if (step.type === 'inspection') {
        acc[key] = { type: 'inspection', status: 'pending', data: step.details.inspectionFields.map(f => { const inputType = f.inputType === 'mcq' ? 'MCQ' : f.inputType === 'image' ? 'image_upload' : f.inputType; return { field_name: String(f.fieldName || ''), input_type: inputType, mandetory: Boolean(f.mandatory), ...(f.inputType === 'mcq' && { options: f.options }) }; }) };
        return acc;
      }
      acc[key] = { type: 'others', status: 'pending', data: [{ description: String(step.details.otherDescription || '') }] };
      return acc;
    }, {});

  const updateStep = (stepId: string, patch: Partial<TaskFlowStep>) =>
    setTaskFlowSteps(prev => prev.map(s => s.id === stepId ? { ...s, ...patch } : s));

  const updateStepDetails = (stepId: string, patch: Partial<TaskFlowStep['details']>) =>
    setTaskFlowSteps(prev => prev.map(s => s.id === stepId ? { ...s, details: { ...s.details, ...patch } } : s));

  // ── On Field Task helpers ───────────────────────────────────────────────────

  const fetchScopeForStep = async (stepId: string, farmId: string) => {
    setScopeLoadingByStep(prev => ({ ...prev, [stepId]: true }));
    setScopeByStep(prev => ({ ...prev, [stepId]: {} }));
    try {
      const res = await fetch(`${BASE_URL}/admin_cultivation/get_scope_of_work_for_land/${farmId}`);
      const data = await res.json().catch(() => null);
      if (data?.success && data?.scope_of_work && typeof data.scope_of_work === 'object') {
        setScopeByStep(prev => ({ ...prev, [stepId]: data.scope_of_work as Record<string, VendorScopeEntry> }));
      }
    } catch { /* leave empty */ } finally {
      setScopeLoadingByStep(prev => ({ ...prev, [stepId]: false }));
    }
  };

  const fetchCalendarsForStep = async (stepId: string, farmId: string) => {
    setCalendarsLoadingByStep(prev => ({ ...prev, [stepId]: true }));
    setCalendarsByStep(prev => ({ ...prev, [stepId]: [] }));
    try {
      const res = await fetch(`${BASE_URL}/admin_cultivation/cultivation_calendars_for_farm/${farmId}`);
      const data = await res.json().catch(() => null);
      if (data?.success && Array.isArray(data.calendars)) {
        setCalendarsByStep(prev => ({ ...prev, [stepId]: data.calendars as OnFieldCalendarOption[] }));
      }
    } catch { /* leave empty */ } finally {
      setCalendarsLoadingByStep(prev => ({ ...prev, [stepId]: false }));
    }
  };

  const fetchPlotsForStep = async (stepId: string, farmId: string, vendorId: string) => {
    setPlotsLoadingByStep(prev => ({ ...prev, [stepId]: true }));
    setPlotsByStep(prev => ({ ...prev, [stepId]: [] }));
    try {
      const res = await fetch(`${BASE_URL}/admin_cultivation/get_scope_of_work_for_vendor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_id: vendorId }),
      });
      const data = await res.json().catch(() => null);
      if (data?.success && Array.isArray(data.scope_of_work)) {
        const land = data.scope_of_work.find((s: any) => String(s?.land_id || '') === farmId);
        setPlotsByStep(prev => ({ ...prev, [stepId]: Array.isArray(land?.plots) ? land.plots : [] }));
      }
    } catch { /* leave empty */ } finally {
      setPlotsLoadingByStep(prev => ({ ...prev, [stepId]: false }));
    }
  };

  const handleOnFieldModeChange = (stepId: string, mode: OnFieldTaskMode) =>
    updateStepDetails(stepId, {
      onFieldMode: mode, vendorId: '', vendorName: '', onFieldActivity: '', onFieldWorkQuantity: '',
      onFieldQty: '', onFieldUnit: '', onFieldSpecValue: '', onFieldSpecUnit: '',
    });

  const handleOnFieldFarmChange = (stepId: string, farmId: string) => {
    updateStepDetails(stepId, { landId: farmId, vendorId: '', vendorName: '', onFieldActivity: '', onFieldCalendarId: '' });
    setPlotsByStep(prev => ({ ...prev, [stepId]: [] }));
    setExcludedPlotsByStep(prev => ({ ...prev, [stepId]: [] }));
    setCalendarsByStep(prev => ({ ...prev, [stepId]: [] }));
    if (farmId) {
      fetchScopeForStep(stepId, farmId);
      fetchCalendarsForStep(stepId, farmId);
    }
  };

  const handleOnFieldVendorChange = (stepId: string, farmId: string, vendorId: string, vendorName: string, mode: OnFieldTaskMode) => {
    updateStepDetails(stepId, { vendorId, vendorName, onFieldActivity: '' });
    setExcludedPlotsByStep(prev => ({ ...prev, [stepId]: [] }));
    if (vendorId && mode === 'cultivation') fetchPlotsForStep(stepId, farmId, vendorId);
  };

  const excludePlotFromStep = (stepId: string, plotId: string) =>
    setExcludedPlotsByStep(prev => ({ ...prev, [stepId]: [...(prev[stepId] || []), plotId] }));

  const restorePlotToStep = (stepId: string, plotId: string) =>
    setExcludedPlotsByStep(prev => ({ ...prev, [stepId]: (prev[stepId] || []).filter(id => id !== plotId) }));


  const addStep = () =>
    setTaskFlowSteps(prev => {
      const next = [...prev, createTaskStep(prev.length + 1)].map((s, i) => ({ ...s, stepNumber: i + 1, details: { ...s.details, title: s.details.title?.trim() ? s.details.title : `Step ${i + 1}` } }));
      return next;
    });

  const removeStep = (stepId: string) =>
    setTaskFlowSteps(prev => {
      const next = prev.filter(s => s.id !== stepId).map((s, i) => ({ ...s, stepNumber: i + 1 }));
      return next.length > 0 ? next : [createTaskStep(1)];
    });

  const addInspectionField = (stepId: string) =>
    setTaskFlowSteps(prev => prev.map(s => s.id !== stepId ? s : { ...s, details: { ...s.details, inspectionFields: [...s.details.inspectionFields, { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, fieldName: '', inputType: 'text', mandatory: false, options: [] }] } }));

  const updateInspectionField = (stepId: string, fieldId: string, patch: Partial<{ fieldName: string; inputType: string; mandatory: boolean; options: string[] }>) =>
    setTaskFlowSteps(prev => prev.map(s => s.id !== stepId ? s : { ...s, details: { ...s.details, inspectionFields: s.details.inspectionFields.map(f => f.id === fieldId ? { ...f, ...patch } : f) } }));

  const removeInspectionField = (stepId: string, fieldId: string) =>
    setTaskFlowSteps(prev => prev.map(s => s.id !== stepId ? s : { ...s, details: { ...s.details, inspectionFields: s.details.inspectionFields.filter(f => f.id !== fieldId) } }));

  const updateInventorySelection = (stepId: string, itemId: string, delta: number, max?: number) =>
    setTaskFlowSteps(prev => prev.map(s => {
      if (s.id !== stepId) return s;
      const cur = Number(s.details.inventoryItems[itemId] || 0);
      const next = Math.max(0, Math.min(typeof max === 'number' ? max : Infinity, cur + delta));
      return { ...s, details: { ...s.details, inventoryItems: { ...s.details.inventoryItems, [itemId]: next } } };
    }));

  const toggleVehicleSelection = (stepId: string, vehicleId: string) =>
    setTaskFlowSteps(prev => prev.map(s => {
      if (s.id !== stepId) return s;
      const cur = s.details.vehicleIds || [];
      return { ...s, details: { ...s.details, vehicleIds: cur.includes(vehicleId) ? cur.filter(id => id !== vehicleId) : [...cur, vehicleId] } };
    }));

  const handleAssignTask = async () => {
    const assignedSteps = taskFlowSteps.filter(s => s.type);
    const staffId = String(taskAssignment?.staffId || '').trim();
    if (assignedSteps.length === 0) { toast.error('Please add at least one task step'); return; }
    if (!staffId) { toast.error('Please choose an assignee first'); return; }

    setIsCreatingTask(true);
    try {
      const stepsDict = buildStepsDict(assignedSteps);
      const response = await fetch(`${BASE_URL}/admin_ops_requests/create_on_demand_tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps_dict: stepsDict, staff_id: staffId }),
      });
      let payload: any = null;
      try { payload = await response.json(); } catch { payload = null; }
      if (!response.ok) throw new Error(String(payload?.message || payload?.detail || payload?.error || `Request failed (${response.status})`));
      const isCached = payload?.message === 'Task created and cached successfully';
      if (isCached) {
        toast.warning('Task staged on server', { description: 'Awaiting allocation schema — will be committed to database once allocation is done.' });
      } else {
        toast.success('Task created successfully');
      }
      closeModal();
      fetchOnDemandTasks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create task');
    } finally {
      setIsCreatingTask(false);
    }
  };

  // ── Allocation modal helpers ──────────────────────────────────────────────────

  const mkId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const createAllocationItem = (): AllocationItemForm => ({
    id: mkId(), inventoryItemId: '', totalQty: '',
  });

  const openAllocationModal = async () => {
    setIsAllocationModalOpen(true);
    setAllocationAssignment({ designation: '', staffId: '', staffName: '' });
    setAllocationItems([createAllocationItem()]);
    if (Object.keys(staffByDesignation).length === 0) {
      try {
        const response = await fetch(`${BASE_URL}/admin_staff/get_all_staff`);
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        const list = Array.isArray(data) ? data : Array.isArray(data?.staffs) ? data.staffs : Array.isArray(data?.data) ? data.data : [];
        const grouped = list.reduce((acc: Record<string, StaffRecord[]>, staff: StaffRecord) => {
          const designation = normalizeDesignation(staff?.staff_information?.staff_designation);
          if (!designation) return acc;
          acc[designation] = [...(acc[designation] || []), staff];
          return acc;
        }, {});
        setStaffByDesignation(grouped);
      } catch { /* ignore */ }
    }
  };

  const closeAllocationModal = () => {
    setIsAllocationModalOpen(false);
    setAllocationAssignment({ designation: '', staffId: '', staffName: '' });
    setAllocationItems([]);
  };

  const addAllocationItem = () => setAllocationItems(prev => [...prev, createAllocationItem()]);

  const removeAllocationItem = (id: string) =>
    setAllocationItems(prev => prev.length > 1 ? prev.filter(i => i.id !== id) : prev);

  const updateAllocationItemField = (id: string, patch: Partial<AllocationItemForm>) =>
    setAllocationItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));

  const handleCreateAllocation = async () => {
    if (!allocationAssignment.staffId) { toast.error('Please select a responsible person'); return; }
    const validItems = allocationItems.filter(i => i.inventoryItemId && Number(i.totalQty) > 0);
    if (validItems.length === 0) { toast.error('Please add at least one item with a quantity'); return; }

    const payload = {
      staff_id: allocationAssignment.staffId,
      item_allocation_list: validItems.map(i => {
        const inv = inventoryItems.find(it => getInventoryItemId(it) === i.inventoryItemId);
        return {
          equipment_id: i.inventoryItemId,
          quantity: Number(i.totalQty),
          unit: String(inv?.unit || ''),
          item_name: inv ? getInventoryItemName(inv) : i.inventoryItemId,
        };
      }),
    };

    try {
      const res = await fetch(`${BASE_URL}/admin_ops_requests/create_new_allocation_schema`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.message || `Failed to create allocation (${res.status})`);
        return;
      }
      closeAllocationModal();
      toast.success('Allocation created — distribute items to farms in the table below.');
      fetchAllocations();
    } catch {
      toast.error('Failed to create allocation. Please check your connection.');
    }
  };

  const handleSaveAllocation = async (alloc: ApiAllocationSchema) => {
    const currentFarms: string[] = apiAllocFarms[alloc.task_id] ?? (() => {
      const s = new Set<string>();
      Object.values(alloc.allocation_schema).forEach(it =>
        Object.keys(it.farm_allocation || {}).forEach(f => s.add(f))
      );
      return [...s];
    })();

    if (currentFarms.length === 0) {
      toast.error('Add at least one farm column before saving.');
      return;
    }

    const requests = Object.entries(alloc.allocation_schema).map(([productId, item]) => {
      const farm_allocation: Record<string, { owner_name: string; quantity: number }> = {};
      for (const farmId of currentFarms) {
        const local = apiAllocDistribution[alloc.task_id]?.[productId]?.[farmId];
        const qty = local !== undefined ? Number(local) : (item.farm_allocation?.[farmId]?.quantity ?? 0);
        if (isNaN(qty) || qty <= 0) continue;
        const farmData = farms.find((f: any) => String(f?.farm_id || '') === farmId);
        const owner_name = String((farmData as any)?.owner_name || item.farm_allocation?.[farmId]?.owner_name || farmId);
        farm_allocation[farmId] = { owner_name, quantity: qty };
      }
      return fetch(`${BASE_URL}/admin_ops_requests/allocate_inventory_to_farm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: alloc.task_id, equipment_id: productId, farm_allocation }),
      });
    });

    try {
      const responses = await Promise.all(requests);
      const failed = responses.filter(r => !r.ok);
      if (failed.length > 0) {
        toast.error(`${failed.length} item(s) failed to save. Please try again.`);
      } else {
        toast.success('Allocation saved successfully.');
        fetchAllocations();
      }
    } catch {
      toast.error('Failed to save allocation. Please check your connection.');
    }
  };

  const handleLockAllocation = async (taskId: string) => {
    try {
      const res = await fetch(`${BASE_URL}/admin_ops_requests/lock_allocation_schema_status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast.error('Failed to lock allocation. Please try again.');
        return;
      }
      toast.success('Allocation locked — status is now Completed.');
      fetchAllocations();
    } catch {
      toast.error('Failed to lock allocation. Please check your connection.');
    }
  };

  const updateDistribution = (allocId: string, itemId: string, farmId: string, qty: string) =>
    setAllocationRecords(prev => prev.map(a =>
      a.id !== allocId ? a : {
        ...a,
        distribution: { ...a.distribution, [itemId]: { ...(a.distribution[itemId] || {}), [farmId]: qty } },
      }
    ));

  const addFarmColumn = (allocId: string, farmId: string) => {
    const farm = farms.find((f: any) => String(f?.farm_id || '') === farmId);
    if (!farm) return;
    const label = String((farm as any)?.owner_name || farmId);
    setAllocationRecords(prev => prev.map(a =>
      a.id !== allocId || a.selectedFarms.some(f => f.farmId === farmId)
        ? a
        : { ...a, selectedFarms: [...a.selectedFarms, { farmId, label }] }
    ));
    setFarmColumnSelectors(prev => ({ ...prev, [allocId]: '' }));
  };

  const removeFarmColumn = (allocId: string, farmId: string) =>
    setAllocationRecords(prev => prev.map(a =>
      a.id !== allocId ? a : { ...a, selectedFarms: a.selectedFarms.filter(f => f.farmId !== farmId) }
    ));

  const allocationDesignationOptions = Object.keys(staffByDesignation).sort();
  const allocationAssigneeOptions = allocationAssignment.designation
    ? (staffByDesignation[allocationAssignment.designation] || [])
    : [];

  // ─────────────────────────────────────────────────────────────────────────────

  // Deduped by name — the API can return multiple activity records sharing one display name
  // (different crop_type/category combos), same as ScopeOfWork.tsx's ACTIVITY_OPTIONS.
  const cultivationActivityOptions = useMemo(
    () => Array.from(new Set(cultivationActivities.map(a => a.name))).sort(),
    [cultivationActivities]
  );

  const designationOptions = Object.keys(staffByDesignation).sort();
  const assigneeOptions = taskAssignment.designation ? (staffByDesignation[taskAssignment.designation] || []) : [];
  const canAddSteps = Boolean(taskAssignment.designation && taskAssignment.staffId);
  const taskIdsWithAllocation = new Set(apiAllocations.map(a => a.task_id));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 space-y-6 bg-gray-50/50 min-h-screen">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">On Demand</h1>
          <p className="text-sm text-muted-foreground">Create and track step-wise on-demand tasks and allocations.</p>
        </div>
        {activeTab === 'task' && (
          <button onClick={openModal} className="px-4 py-2 bg-green-800 text-white rounded-md text-sm font-medium hover:bg-green-900 transition-colors">
            Create New Task
          </button>
        )}
        {activeTab === 'allocation' && (
          <button onClick={openAllocationModal} className="px-4 py-2 bg-green-800 text-white rounded-md text-sm font-medium hover:bg-green-900 transition-colors">
            + Create New Allocation
          </button>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-2 border-b border-gray-200">
        {([
          { key: 'task',       label: 'On Demand Task'       },
          { key: 'allocation', label: 'On Demand Allocation' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.key
                ? 'border-green-700 text-green-800'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── On Demand Task tab ── */}
      {activeTab === 'task' && (
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">On demand tasks</h2>
        {ondemandTasksLoading ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-muted-foreground">Loading on demand tasks...</div>
        ) : ondemandTasksError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{ondemandTasksError}</div>
        ) : ondemandTasks.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-muted-foreground">No on demand tasks found.</div>
        ) : (
          <div className="space-y-4">
            {ondemandTasks.map(task => {
              const pct = task.totalSteps > 0 ? Math.round((task.completedSteps / task.totalSteps) * 100) : 0;
              const isAllDone = task.completedSteps === task.totalSteps && task.totalSteps > 0;
              const needsAllocation = task.steps.some(s => s.type === 'inventory') && !taskIdsWithAllocation.has(task.taskId);
              return (
                <div key={task.taskId} className={cn('rounded-xl border bg-white shadow-sm overflow-hidden', needsAllocation ? 'border-red-400 animate-pulse' : 'border-slate-200')}>
                  {/* Task header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
                    <div className="flex items-center gap-3">
                      <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg text-white text-xs font-bold shrink-0', needsAllocation ? 'bg-red-600' : 'bg-slate-900')}>
                        {task.taskId.replace('TASK-', '')}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{task.taskId}</span>
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border', isAllDone ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200')}>
                            {isAllDone ? 'Completed' : 'In Progress'}
                          </span>
                          {needsAllocation && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-600 border border-red-300">
                              Allocation Required
                            </span>
                          )}
                        </div>
                        {needsAllocation && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('allocation')}
                            className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:text-red-700 hover:underline"
                          >
                            Fill Allocation →
                          </button>
                        )}
                        <p className="text-[11px] text-slate-400 mt-0.5">Staff: {task.staffId} · {task.createdAt}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-xs font-semibold text-slate-700">{task.completedSteps}/{task.totalSteps} steps</div>
                        <div className="text-[10px] text-slate-400">{pct}% complete</div>
                      </div>
                      <div className="w-24 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Steps rail */}
                  <div className="overflow-x-auto px-5 py-4">
                    <div className="flex items-start gap-0 min-w-max">
                      {task.steps.map((step, index) => (
                        <div key={step.key} className="flex items-start">
                          {/* Step card */}
                          <div className="w-[272px] rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                            {/* Step card header */}
                            <div className={cn('flex items-center justify-between px-3 py-2 border-b', stepTypeColor[step.type] ? `border-b ${stepTypeColor[step.type].split(' ')[0]}/30` : 'border-slate-100')}>
                              <div className="flex items-center gap-2">
                                <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide', stepTypeColor[step.type] || 'bg-slate-100 text-slate-600 border-slate-200')}>
                                  {step.type === 'others' ? 'Other' : step.type === 'on_field' ? 'On Field' : step.type}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-400">#{step.stepNumber}</span>
                              </div>
                              <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border', getStepStatusClasses(step.status))}>
                                {step.status === 'completed' ? '✓ Done' : step.status.replace(/_/g, ' ')}
                              </span>
                            </div>
                            {/* Step card body */}
                            <div className="p-3">
                              {step.data.length > 0 ? renderStepCard(step) : (
                                <p className="text-xs text-slate-400 italic">No data</p>
                              )}
                            </div>
                          </div>

                          {/* Connector arrow */}
                          {index < task.steps.length - 1 && (
                            <div className="flex items-center self-center mx-1.5 shrink-0">
                              <div className="h-px w-4 bg-slate-300" />
                              <div className="w-0 h-0 border-t-4 border-b-4 border-l-4 border-t-transparent border-b-transparent border-l-slate-300" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* ── On Demand Allocation tab ── */}
      {activeTab === 'allocation' && (
        <div className="space-y-5">

          {/* Pending allocation tasks */}
          {pendingAllocationTasks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-amber-200" />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-amber-500 px-1">Awaiting Farm Distribution</span>
                <div className="h-px flex-1 bg-amber-200" />
              </div>
              {pendingAllocationTasks.map(task => {
                const items = Object.entries(task.allocation_schema || {});
                const currentFarms: string[] = apiAllocFarms[task.task_id] ?? (() => {
                  const s = new Set<string>();
                  items.forEach(([, it]) => Object.keys(it.farm_allocation || {}).forEach(f => s.add(f)));
                  return [...s];
                })();
                const getFarmLabel = (farmId: string): string => {
                  const farm = farms.find((f: any) => String(f?.farm_id || '') === farmId);
                  if (farm) return String((farm as any)?.owner_name || farmId);
                  for (const [, it] of items) {
                    if (it.farm_allocation?.[farmId]?.owner_name) return it.farm_allocation[farmId].owner_name;
                  }
                  return farmId;
                };
                const getCellValue = (productId: string, farmId: string): string => {
                  const local = apiAllocDistribution[task.task_id]?.[productId]?.[farmId];
                  if (local !== undefined) return local;
                  const apiQty = task.allocation_schema[productId]?.farm_allocation?.[farmId]?.quantity;
                  return apiQty != null ? String(apiQty) : '';
                };
                const asSchema: ApiAllocationSchema = { task_id: task.task_id, allocation_schema: task.allocation_schema, created_at: task.created_at, allocation_schema_status: task.allocation_schema_status };
                return (
                  <div key={task.task_id} className="bg-white border border-amber-300 rounded-xl shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-amber-50/70 border-b border-amber-200">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-amber-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                          {task.task_id.replace(/^TASK-/i, '').slice(0, 5)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{task.task_id}</p>
                          <p className="text-[10px] text-slate-500">{items.length} item{items.length !== 1 ? 's' : ''} · {formatTaskDate(task.created_at)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveAllocation(asSchema)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
                        >
                          <Save className="h-3.5 w-3.5" /> Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setLockConfirmTarget({ taskId: task.task_id, stepsDict: task.steps_dict, allocationSchema: task.allocation_schema, createdAt: task.created_at, staffId: task.staff_id })}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-[11px] font-medium text-amber-700 hover:bg-amber-100 hover:border-amber-300 transition-colors shadow-sm"
                        >
                          <Lock className="h-3.5 w-3.5" /> Lock
                        </button>
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-amber-100 text-amber-700 border-amber-300">
                          Pending
                        </span>
                      </div>
                    </div>
                    {/* Editable farm distribution matrix */}
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="sticky left-0 bg-slate-50 z-10 text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 min-w-[160px] border-r border-slate-200">Item / Farm →</th>
                            {currentFarms.map(farmId => (
                              <th key={farmId} className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500 min-w-[120px] border-r border-slate-100">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="truncate">{getFarmLabel(farmId)}</span>
                                  <button type="button" onClick={() => setApiAllocFarms(prev => ({ ...prev, [task.task_id]: currentFarms.filter(f => f !== farmId) }))} className="shrink-0 text-slate-300 hover:text-red-500 transition-colors text-sm font-bold">×</button>
                                </div>
                              </th>
                            ))}
                            <th className="px-2 py-2 min-w-[180px] border-r border-slate-100">
                              <div className="flex items-center gap-1">
                                <select
                                  value={apiFarmSelectors[task.task_id] || ''}
                                  onChange={e => setApiFarmSelectors(prev => ({ ...prev, [task.task_id]: e.target.value }))}
                                  className="flex-1 rounded border border-dashed border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-500 focus:outline-none focus:border-green-500"
                                >
                                  <option value="">+ Add farm column</option>
                                  {farms.filter((f: any) => !currentFarms.includes(String(f?.farm_id || ''))).map((f: any) => (
                                    <option key={String(f?.farm_id || '')} value={String(f?.farm_id || '')}>
                                      {f?.owner_name || f?.farm_id}{f?.crop_type ? ` · ${f.crop_type}` : ''}{f?.area ? ` (${f.area}ac)` : ''}
                                    </option>
                                  ))}
                                </select>
                                {apiFarmSelectors[task.task_id] && (
                                  <button type="button" onClick={() => { const fid = apiFarmSelectors[task.task_id]; setApiAllocFarms(prev => ({ ...prev, [task.task_id]: [...currentFarms, fid] })); setApiFarmSelectors(prev => ({ ...prev, [task.task_id]: '' })); }} className="shrink-0 rounded bg-green-700 px-2 py-1 text-[10px] font-medium text-white hover:bg-green-800">Add</button>
                                )}
                              </div>
                            </th>
                            <th className="sticky right-0 z-10 px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500 min-w-[90px] bg-slate-100 border-l border-slate-200">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentFarms.length === 0 && (
                            <tr><td colSpan={100} className="px-4 py-6 text-center text-xs text-slate-400 italic">Use "+ Add farm column" above to start distributing.</td></tr>
                          )}
                          {items.map(([productId, item]) => {
                            const allocated = currentFarms.reduce((s, fid) => {
                              const local = apiAllocDistribution[task.task_id]?.[productId]?.[fid];
                              const val = local !== undefined ? Number(local) : (item.farm_allocation?.[fid]?.quantity ?? 0);
                              return s + (isNaN(val) ? 0 : val);
                            }, 0);
                            const isFullyAllocated = item.quantity > 0 && allocated === item.quantity;
                            const isOver = allocated > item.quantity;
                            return (
                              <tr key={productId} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/40">
                                <td className="sticky left-0 bg-white z-10 px-4 py-3 border-r border-slate-200">
                                  <div className="font-semibold text-slate-900 truncate max-w-[140px]">{item.item_name}</div>
                                  <div className="text-[10px] text-slate-400 mt-0.5">Need: {item.quantity} {item.unit}</div>
                                </td>
                                {currentFarms.map(farmId => (
                                  <td key={farmId} className="px-2 py-2 text-center border-r border-slate-100">
                                    <input
                                      type="number" min="0"
                                      value={getCellValue(productId, farmId)}
                                      onChange={e => setApiAllocDistribution(prev => ({ ...prev, [task.task_id]: { ...(prev[task.task_id] || {}), [productId]: { ...((prev[task.task_id] || {})[productId] || {}), [farmId]: e.target.value } } }))}
                                      placeholder="0"
                                      className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-center focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-200"
                                    />
                                  </td>
                                ))}
                                <td className="px-2 py-2 border-r border-slate-100 bg-slate-50/30" />
                                <td className="sticky right-0 z-10 px-3 py-2 text-center bg-white border-l border-slate-200">
                                  <span className={cn('text-xs font-bold block', isOver ? 'text-red-600' : isFullyAllocated ? 'text-emerald-700' : 'text-amber-600')}>{allocated}/{item.quantity}</span>
                                  {isFullyAllocated && <span className="text-[10px] text-emerald-600">Done</span>}
                                  {isOver && <span className="text-[10px] text-red-500">+{allocated - item.quantity} over</span>}
                                  {!isFullyAllocated && !isOver && <span className="text-[10px] text-amber-500">{item.quantity - allocated} left</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {apiAllocationsLoading ? (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-sm text-muted-foreground text-center">
              Loading allocations…
            </div>
          ) : apiAllocationsError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{apiAllocationsError}</div>
          ) : apiAllocations.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-200 rounded-lg p-10 text-sm text-muted-foreground text-center">
              No allocations yet. Use "+ Create New Allocation" to get started.
            </div>
          ) : (() => {
            const grouped = apiAllocations.reduce((acc: Record<string, ApiAllocationSchema[]>, a) => {
              const key = a.created_at ? a.created_at.split('T')[0] : 'unknown';
              (acc[key] = acc[key] || []).push(a);
              return acc;
            }, {});
            const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
            return sortedDates.map(dateKey => {
              const dateLabel = (() => {
                const d = new Date(dateKey);
                if (isNaN(d.getTime())) return dateKey;
                return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
              })();
              return (
                <div key={dateKey} className="space-y-3">
                  {/* Date divider */}
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-slate-200" />
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 px-1">{dateLabel}</span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>

                  {/* Cards for this date */}
                  {grouped[dateKey].map(alloc => {
                    const items = Object.entries(alloc.allocation_schema);
                    const statusCfg = allocationStatusConfig[alloc.allocation_schema_status] ?? allocationStatusConfig.pending;
                    const timeStr = (() => {
                      const d = new Date(alloc.created_at);
                      return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                    })();
                    return (
                      <div key={alloc.task_id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                        {/* Card header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-slate-50/70 border-b border-slate-200">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg bg-slate-900 flex items-center justify-center text-white text-[10px] font-bold shrink-0 tracking-tight">
                              {alloc.task_id.replace(/^TASK-/i, '').slice(0, 5)}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{alloc.task_id}</p>
                              <p className="text-[10px] text-slate-400">
                                {items.length} item{items.length !== 1 ? 's' : ''}{timeStr ? ` · ${timeStr}` : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {alloc.allocation_schema_status !== 'completed' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSaveAllocation(alloc)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
                                >
                                  <Save className="h-3.5 w-3.5" />
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setLockConfirmTarget({ taskId: alloc.task_id, stepsDict: alloc.steps_dict ?? {}, allocationSchema: alloc.allocation_schema, createdAt: alloc.created_at, staffId: alloc.staff_id })}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-[11px] font-medium text-amber-700 hover:bg-amber-100 hover:border-amber-300 transition-colors shadow-sm"
                                >
                                  <Lock className="h-3.5 w-3.5" />
                                  Lock
                                </button>
                              </>
                            )}
                            <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border capitalize', statusCfg.classes)}>
                              {statusCfg.label}
                            </span>
                          </div>
                        </div>

                        {/* Distribution matrix — read-only for completed, editable for pending/partial */}
                        {alloc.allocation_schema_status === 'completed' ? (() => {
                          const farmIds = [...new Set(
                            Object.values(alloc.allocation_schema)
                              .flatMap(it => Object.keys(it.farm_allocation || {}))
                          )];
                          const getFarmLabel = (farmId: string) => {
                            for (const it of Object.values(alloc.allocation_schema)) {
                              if (it.farm_allocation?.[farmId]?.owner_name) return it.farm_allocation[farmId].owner_name;
                            }
                            return farmId;
                          };
                          return (
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse text-xs">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="sticky left-0 bg-slate-50 z-10 text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 min-w-[160px] border-r border-slate-200">Item</th>
                                    {farmIds.map(fid => {
                                      const fd = farms.find((f: any) => String(f?.farm_id || '') === fid);
                                      return (
                                        <th key={fid} className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500 min-w-[120px] border-r border-slate-100">
                                          <div>{getFarmLabel(fid)}</div>
                                          {fd && (
                                            <div className="text-[9px] font-normal normal-case tracking-normal text-slate-400 mt-0.5 capitalize">
                                              {fd.crop_type}{fd.area ? ` · ${fd.area}ac` : ''}
                                            </div>
                                          )}
                                        </th>
                                      );
                                    })}
                                    <th className="sticky right-0 z-10 px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500 min-w-[80px] bg-slate-100 border-l border-slate-200">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map(([productId, item]) => {
                                    const total = Object.values(item.farm_allocation || {}).reduce((s, v) => s + (v.quantity || 0), 0);
                                    return (
                                      <tr key={productId} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/30 transition-colors">
                                        <td className="sticky left-0 bg-white z-10 px-4 py-2.5 border-r border-slate-200">
                                          <div className="font-medium text-slate-900">{item.item_name}</div>
                                          <div className="text-[10px] text-slate-400 mt-0.5">Total: {item.quantity} {item.unit}</div>
                                        </td>
                                        {farmIds.map(fid => (
                                          <td key={fid} className="px-3 py-2.5 text-center border-r border-slate-100">
                                            <span className="font-semibold text-slate-700">{item.farm_allocation?.[fid]?.quantity ?? '—'}</span>
                                          </td>
                                        ))}
                                        <td className="sticky right-0 z-10 px-3 py-2.5 text-center bg-white border-l border-slate-200">
                                          <span className="font-bold text-emerald-700">{total}/{item.quantity}</span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          );
                        })() : (() => {
                          const currentFarms: string[] = apiAllocFarms[alloc.task_id] ?? (() => {
                            const s = new Set<string>();
                            items.forEach(([, it]) => Object.keys(it.farm_allocation || {}).forEach(f => s.add(f)));
                            return [...s];
                          })();
                          const getFarmLabel = (farmId: string): string => {
                            const farm = farms.find((f: any) => String(f?.farm_id || '') === farmId);
                            if (farm) return String((farm as any)?.owner_name || farmId);
                            for (const [, it] of items) {
                              if (it.farm_allocation?.[farmId]?.owner_name) return it.farm_allocation[farmId].owner_name;
                            }
                            return farmId;
                          };
                          const getCellValue = (productId: string, farmId: string): string => {
                            const local = apiAllocDistribution[alloc.task_id]?.[productId]?.[farmId];
                            if (local !== undefined) return local;
                            const apiQty = alloc.allocation_schema[productId]?.farm_allocation?.[farmId]?.quantity;
                            return apiQty != null ? String(apiQty) : '';
                          };
                          return (
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse text-xs">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="sticky left-0 bg-slate-50 z-10 text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 min-w-[160px] border-r border-slate-200">Item / Farm →</th>
                                    {currentFarms.map(farmId => {
                                      const fd = farms.find((f: any) => String(f?.farm_id || '') === farmId);
                                      return (
                                      <th key={farmId} className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500 min-w-[120px] border-r border-slate-100">
                                        <div className="flex items-center justify-between gap-1">
                                          <div className="text-left min-w-0">
                                            <div className="truncate">{getFarmLabel(farmId)}</div>
                                            {fd && (
                                              <div className="text-[9px] font-normal normal-case tracking-normal text-slate-400 mt-0.5 capitalize">
                                                {fd.crop_type}{fd.area ? ` · ${fd.area}ac` : ''}
                                              </div>
                                            )}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => setApiAllocFarms(prev => ({ ...prev, [alloc.task_id]: currentFarms.filter(f => f !== farmId) }))}
                                            className="shrink-0 text-slate-300 hover:text-red-500 transition-colors leading-none text-sm font-bold"
                                          >×</button>
                                        </div>
                                      </th>
                                    ); })}
                                    <th className="px-2 py-2 min-w-[180px] border-r border-slate-100">
                                      <div className="flex items-center gap-1">
                                        <select
                                          value={apiFarmSelectors[alloc.task_id] || ''}
                                          onChange={e => setApiFarmSelectors(prev => ({ ...prev, [alloc.task_id]: e.target.value }))}
                                          className="flex-1 rounded border border-dashed border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-500 focus:outline-none focus:border-green-500"
                                        >
                                          <option value="">+ Add farm column</option>
                                          {farms
                                            .filter((f: any) => !currentFarms.includes(String(f?.farm_id || '')))
                                            .map((f: any) => (
                                              <option key={String(f?.farm_id || '')} value={String(f?.farm_id || '')}>
                                                {f?.owner_name || f?.farm_id}{f?.crop_type ? ` · ${f.crop_type}` : ''}{f?.area ? ` (${f.area}ac)` : ''}
                                              </option>
                                            ))}
                                        </select>
                                        {apiFarmSelectors[alloc.task_id] && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const fid = apiFarmSelectors[alloc.task_id];
                                              setApiAllocFarms(prev => ({ ...prev, [alloc.task_id]: [...currentFarms, fid] }));
                                              setApiFarmSelectors(prev => ({ ...prev, [alloc.task_id]: '' }));
                                            }}
                                            className="shrink-0 rounded bg-green-700 px-2 py-1 text-[10px] font-medium text-white hover:bg-green-800"
                                          >Add</button>
                                        )}
                                      </div>
                                    </th>
                                    <th className="sticky right-0 z-10 px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500 min-w-[90px] bg-slate-100 border-l border-slate-200">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {currentFarms.length === 0 && (
                                    <tr>
                                      <td colSpan={100} className="px-4 py-8 text-center text-xs text-slate-400 italic">
                                        No farm columns yet — use "+ Add farm column" above to start distributing.
                                      </td>
                                    </tr>
                                  )}
                                  {items.map(([productId, item]) => {
                                    const allocated = currentFarms.reduce((s, fid) => {
                                      const local = apiAllocDistribution[alloc.task_id]?.[productId]?.[fid];
                                      const val = local !== undefined ? Number(local) : (item.farm_allocation?.[fid]?.quantity ?? 0);
                                      return s + (isNaN(val) ? 0 : val);
                                    }, 0);
                                    const isFullyAllocated = item.quantity > 0 && allocated === item.quantity;
                                    const isOver = allocated > item.quantity;
                                    return (
                                      <tr key={productId} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/40 transition-colors">
                                        <td className="sticky left-0 bg-white z-10 px-4 py-3 border-r border-slate-200">
                                          <div className="font-semibold text-slate-900 truncate max-w-[140px]">{item.item_name}</div>
                                          <div className="text-[10px] text-slate-400 mt-0.5">Need: {item.quantity} {item.unit}</div>
                                        </td>
                                        {currentFarms.map(farmId => (
                                          <td key={farmId} className="px-2 py-2 text-center border-r border-slate-100">
                                            <input
                                              type="number"
                                              min="0"
                                              value={getCellValue(productId, farmId)}
                                              onChange={e => setApiAllocDistribution(prev => ({
                                                ...prev,
                                                [alloc.task_id]: {
                                                  ...(prev[alloc.task_id] || {}),
                                                  [productId]: {
                                                    ...((prev[alloc.task_id] || {})[productId] || {}),
                                                    [farmId]: e.target.value,
                                                  },
                                                },
                                              }))}
                                              placeholder="0"
                                              className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-center focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-200 transition-colors"
                                            />
                                          </td>
                                        ))}
                                        <td className="px-2 py-2 border-r border-slate-100 bg-slate-50/30" />
                                        <td className="sticky right-0 z-10 px-3 py-2 text-center bg-white border-l border-slate-200">
                                          <span className={cn('text-xs font-bold block', isOver ? 'text-red-600' : isFullyAllocated ? 'text-emerald-700' : 'text-amber-600')}>
                                            {allocated}/{item.quantity}
                                          </span>
                                          {isFullyAllocated && <span className="text-[10px] text-emerald-600">Done</span>}
                                          {isOver && <span className="text-[10px] text-red-500">+{allocated - item.quantity} over</span>}
                                          {!isFullyAllocated && !isOver && <span className="text-[10px] text-amber-500">{item.quantity - allocated} left</span>}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* ── Create Allocation Modal ──────────────────────────────────────────── */}
      {isAllocationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-2xl shadow-[0_24px_64px_rgba(15,23,42,0.18)] flex flex-col max-h-[92vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Create On Demand Allocation</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Allocate inventory items across farms and assign a responsible person.</p>
              </div>
              <button onClick={closeAllocationModal} className="p-1.5 rounded-md hover:bg-gray-100"><X className="w-4 h-4 text-gray-500" /></button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* Responsible Person */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-3">Responsible Person</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Designation</label>
                    <select
                      value={allocationAssignment.designation}
                      onChange={e => setAllocationAssignment({ designation: e.target.value, staffId: '', staffName: '' })}
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                    >
                      <option value="">Select designation</option>
                      {allocationDesignationOptions.length > 0
                        ? allocationDesignationOptions.map(d => <option key={d} value={d}>{formatDesignationLabel(d)}</option>)
                        : <option value="" disabled>Loading...</option>}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assign to</label>
                    <select
                      value={allocationAssignment.staffId}
                      disabled={!allocationAssignment.designation}
                      onChange={e => {
                        const staffId = e.target.value;
                        const matched = allocationAssigneeOptions.find(s => String(s?.staff_id || '') === staffId);
                        setAllocationAssignment(prev => ({ ...prev, staffId, staffName: String(matched?.staff_information?.staff_name || '') }));
                      }}
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      <option value="">{allocationAssignment.designation ? 'Select person' : 'Select designation first'}</option>
                      {allocationAssigneeOptions.map(s => (
                        <option key={String(s?.staff_id || '')} value={String(s?.staff_id || '')}>{String(s?.staff_information?.staff_name || 'Unknown')}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Items to Allocate */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Items to Allocate</p>
                  <button type="button" onClick={addAllocationItem} className="inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:underline">
                    <Plus className="h-3 w-3" /> Add Item
                  </button>
                </div>

                {allocationItems.map((item, itemIdx) => (
                  <div key={item.id} className="flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-xs font-semibold text-slate-700 shrink-0 mb-0.5">{itemIdx + 1}</div>
                    <div className="flex-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Inventory Item</label>
                      <select
                        value={item.inventoryItemId}
                        onChange={e => updateAllocationItemField(item.id, { inventoryItemId: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
                      >
                        <option value="">Select item</option>
                        {inventoryItems.map(inv => (
                          <option key={getInventoryItemId(inv)} value={getInventoryItemId(inv)}>
                            {getInventoryItemName(inv)}{inv?.stock != null ? ` (${inv.stock} ${String(inv?.unit || '')})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="shrink-0">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total Qty</label>
                      <input
                        type="number"
                        min="1"
                        value={item.totalQty}
                        onChange={e => updateAllocationItemField(item.id, { totalQty: e.target.value })}
                        placeholder="0"
                        className="mt-1 w-24 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
                      />
                    </div>
                    {allocationItems.length > 1 && (
                      <button type="button" onClick={() => removeAllocationItem(item.id)} className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 mb-0.5">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}

                <p className="text-[11px] text-slate-400 italic px-1">
                  Farm distribution is set in the matrix after creating the allocation.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 shrink-0">
              <p className="text-xs text-slate-500">{allocationItems.length} item{allocationItems.length !== 1 ? 's' : ''} selected</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={closeAllocationModal} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateAllocation}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-800 px-4 py-2 text-sm font-medium text-white hover:bg-green-900"
                >
                  <UserCheck className="h-4 w-4" />
                  Create Allocation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Task Modal ─────────────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-2xl shadow-[0_24px_64px_rgba(15,23,42,0.18)] flex flex-col max-h-[92vh]">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Create On Demand Task</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Build a step-wise task and allocate resources.</p>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-md hover:bg-gray-100"><X className="w-4 h-4 text-gray-500" /></button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* Designation + Assignee */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-3">Assignee</p>
                {!taskAssignment.designation && (
                  <p className="mb-3 rounded-md border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                    Select a designation and assignee to unlock steps.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Designation</label>
                    <select
                      value={taskAssignment.designation}
                      onChange={e => {
                        setTaskAssignment({ designation: e.target.value, staffId: '', staffName: '' });
                        setTaskFlowSteps([]);
                      }}
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                    >
                      <option value="">Select designation</option>
                      {designationOptions.length > 0
                        ? designationOptions.map(d => <option key={d} value={d}>{formatDesignationLabel(d)}</option>)
                        : <option value="" disabled>Loading...</option>}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assign to</label>
                    <select
                      value={taskAssignment.staffId}
                      disabled={!taskAssignment.designation}
                      onChange={e => {
                        const staffId = e.target.value;
                        const matched = assigneeOptions.find(s => String(s?.staff_id || '') === staffId);
                        const staffName = String(matched?.staff_information?.staff_name || '');
                        setTaskAssignment(prev => ({ ...prev, staffId, staffName }));
                        if (staffId) setTaskFlowSteps([{ ...createTaskStep(1), details: { ...createTaskStep(1).details, assignee: staffName, assigneeDesignation: taskAssignment.designation } }]);
                        else setTaskFlowSteps([]);
                      }}
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      <option value="">{taskAssignment.designation ? 'Select assignee' : 'Select designation first'}</option>
                      {assigneeOptions.length > 0
                        ? assigneeOptions.map(s => <option key={String(s?.staff_id || '')} value={String(s?.staff_id || '')}>{String(s?.staff_information?.staff_name || 'Unknown')}</option>)
                        : <option value="" disabled>No staff for this designation</option>}
                    </select>
                  </div>
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-3">
                {taskFlowSteps.length > 0 ? taskFlowSteps.map((step, index) => {
                  const meta = step.type ? taskStepTypeMeta[step.type] : null;
                  const selectedInventoryRows = Object.entries(step.details.inventoryItems).filter(([, qty]) => Number(qty) > 0).map(([itemId, qty]) => ({ itemId, qty: Number(qty), item: inventoryItems.find(it => getInventoryItemId(it) === itemId) }));
                  const selectedVehicles = step.details.vehicleIds.map(vid => vehicles.find(v => getVehicleId(v) === vid)).filter(Boolean);
                  const selectedLand = farms.find(f => String(f?.farm_id || f?.id || '') === step.details.landId);

                  return (
                    <div key={step.id} className={cn('relative rounded-xl border p-3 shadow-sm', meta?.shell || 'border-slate-200 bg-white')}>
                      <div className="absolute left-3 top-3 flex flex-col items-center">
                        <div className={cn('flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold', meta?.badge || 'border-slate-200 bg-slate-100 text-slate-700')}>
                          {step.stepNumber}
                        </div>
                        {index < taskFlowSteps.length - 1 && <div className="mt-1.5 h-full min-h-8 w-px bg-slate-200" />}
                      </div>

                      <div className="space-y-3 pt-12">
                        <div className={cn('rounded-xl border p-3', meta?.panel || 'border-slate-200 bg-white')}>
                          {/* Step header row */}
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Type</label>
                              <select
                                value={step.type}
                                onChange={e => updateStep(step.id, { type: e.target.value as TaskStepType, expanded: true })}
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
                              >
                                <option value="">Select type</option>
                                <option value="inventory">Inventory</option>
                                <option value="logistics">Logistics</option>
                                <option value="inspection">Inspection</option>
                                <option value="on_field">On Field Task</option>
                                <option value="other">Others</option>
                              </select>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 mt-4">
                              {taskFlowSteps.length > 1 && (
                                <button type="button" onClick={() => removeStep(step.id)} className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                                  Remove
                                </button>
                              )}
                              <button type="button" onClick={() => updateStep(step.id, { expanded: !step.expanded })} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', step.expanded ? 'rotate-180' : '')} />
                              </button>
                            </div>
                          </div>

                          {/* Step content */}
                          {step.type && step.expanded && (
                            <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                              {/* Inventory */}
                              {step.type === 'inventory' && (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                    <span className="text-xs font-semibold text-slate-700">Allocation needed?</span>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => updateStepDetails(step.id, { allocationNeeded: true })}
                                        className={cn('px-3 py-1 rounded-md text-xs font-semibold border transition-colors', step.details.allocationNeeded ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}
                                      >Yes</button>
                                      <button
                                        type="button"
                                        onClick={() => updateStepDetails(step.id, { allocationNeeded: false })}
                                        className={cn('px-3 py-1 rounded-md text-xs font-semibold border transition-colors', !step.details.allocationNeeded ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}
                                      >No</button>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-slate-900">Selected items</p>
                                    <button type="button" onClick={() => setResourcePopup({ stepId: step.id, type: 'inventory' })} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                                      Open inventory
                                    </button>
                                  </div>
                                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                    <div className="grid grid-cols-[2fr_1fr_1fr] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                      <div>Item</div><div>Unit</div><div className="text-right">Qty</div>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                      {selectedInventoryRows.length > 0 ? selectedInventoryRows.map(({ itemId, qty, item }) => (
                                        <div key={itemId} className="grid grid-cols-[2fr_1fr_1fr] items-center gap-2 px-3 py-2 text-xs">
                                          <div className="truncate font-medium text-slate-900">{item ? getInventoryItemName(item) : itemId}</div>
                                          <div className="text-slate-600">{String(item?.unit || '—')}</div>
                                          <div className="text-right font-semibold text-slate-900">{qty}</div>
                                        </div>
                                      )) : <div className="px-3 py-3 text-xs text-slate-500">No items selected yet.</div>}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Logistics */}
                              {step.type === 'logistics' && (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-slate-900">Selected vehicles</p>
                                    <button type="button" onClick={() => setResourcePopup({ stepId: step.id, type: 'logistics' })} className="rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-700">
                                      Open vehicles
                                    </button>
                                  </div>
                                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                    <div className="grid grid-cols-[2fr_1fr_1fr] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                      <div>Vehicle</div><div>Company</div><div className="text-right">Status</div>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                      {selectedVehicles.length > 0 ? selectedVehicles.map((v: any) => (
                                        <div key={getVehicleId(v)} className="grid grid-cols-[2fr_1fr_1fr] items-center gap-2 px-3 py-2 text-xs">
                                          <div className="truncate font-medium text-slate-900">{getVehicleName(v)}</div>
                                          <div className="text-slate-600">{String(v?.vehicle_information?.company || '—')}</div>
                                          <div className="text-right text-emerald-700">Selected</div>
                                        </div>
                                      )) : <div className="px-3 py-3 text-xs text-slate-500">No vehicles selected yet.</div>}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Inspection */}
                              {step.type === 'inspection' && (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-slate-900">Inspection fields</p>
                                    <button type="button" onClick={() => addInspectionField(step.id)} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
                                      <Plus className="h-3 w-3" /> Add field
                                    </button>
                                  </div>
                                  {step.details.inspectionFields.length > 0 ? step.details.inspectionFields.map((field, fi) => (
                                    <div key={field.id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-slate-600">Field {fi + 1}</span>
                                        <button type="button" onClick={() => removeInspectionField(step.id, field.id)} className="text-xs text-red-500 hover:underline">Remove</button>
                                      </div>
                                      <input value={field.fieldName} onChange={e => updateInspectionField(step.id, field.id, { fieldName: e.target.value })} placeholder="Field name" className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:border-slate-900 focus:outline-none" />
                                      <div className="flex items-center gap-2">
                                        <select value={field.inputType} onChange={e => updateInspectionField(step.id, field.id, { inputType: e.target.value, options: [] })} className="flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:border-slate-900 focus:outline-none">
                                          <option value="number">Number</option>
                                          <option value="text">Text</option>
                                          <option value="mcq">MCQ</option>
                                          <option value="image">Image upload</option>
                                        </select>
                                        <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 shrink-0">
                                          <input type="checkbox" checked={field.mandatory} onChange={e => updateInspectionField(step.id, field.id, { mandatory: e.target.checked })} className="h-3.5 w-3.5 rounded border-slate-300" />
                                          Mandatory
                                        </label>
                                      </div>
                                      {field.inputType === 'mcq' && (
                                        <div className="space-y-1.5">
                                          <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Options</span>
                                            <button type="button" onClick={() => updateInspectionField(step.id, field.id, { options: [...(field.options || []), ''] })} className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-600 hover:underline">
                                              <Plus className="h-3 w-3" /> Add option
                                            </button>
                                          </div>
                                          {(field.options || []).length === 0 ? (
                                            <p className="text-[10px] text-slate-400 italic">No options yet — click Add option.</p>
                                          ) : (field.options || []).map((opt, oi) => (
                                            <div key={oi} className="flex items-center gap-1.5">
                                              <span className="text-[10px] text-slate-400 w-4 shrink-0">{oi + 1}.</span>
                                              <input value={opt} onChange={e => { const next = [...(field.options || [])]; next[oi] = e.target.value; updateInspectionField(step.id, field.id, { options: next }); }} placeholder={`Option ${oi + 1}`} className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-slate-900 focus:outline-none" />
                                              <button type="button" onClick={() => { const next = (field.options || []).filter((_, i) => i !== oi); updateInspectionField(step.id, field.id, { options: next }); }} className="text-red-400 hover:text-red-600"><X className="h-3 w-3" /></button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )) : (
                                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">No fields yet. Use Add field above.</div>
                                  )}
                                </div>
                              )}

                              {/* On Field Task */}
                              {step.type === 'on_field' && (() => {
                                const scope = scopeByStep[step.id] || {};
                                const scopeVendorIds = Object.keys(scope);
                                const selectedScope = step.details.vendorId ? scope[step.details.vendorId] : undefined;
                                const plots = plotsByStep[step.id] || [];
                                const excludedPlotIds = excludedPlotsByStep[step.id] || [];
                                const activePlots = plots.filter(p => !excludedPlotIds.includes(p.plot_id));
                                const excludedPlots = plots.filter(p => excludedPlotIds.includes(p.plot_id));
                                const calendars = calendarsByStep[step.id] || [];
                                const schedule = computePlotSchedule(activePlots, step.details.onFieldStartDate, Number(step.details.onFieldWorkQuantity) || 0);
                                // Flatten into plot rows + a subtotal row whenever the assigned date changes
                                const scheduleRows = schedule.reduce<Array<{ kind: 'plot'; plot: OnFieldPlot; assignedDate: string } | { kind: 'subtotal'; date: string; total: number; count: number }>>((rows, { plot, assignedDate }, i) => {
                                  rows.push({ kind: 'plot', plot, assignedDate });
                                  const isLastOfDay = i === schedule.length - 1 || schedule[i + 1].assignedDate !== assignedDate;
                                  if (isLastOfDay) {
                                    const dayRows = schedule.filter(r => r.assignedDate === assignedDate);
                                    rows.push({ kind: 'subtotal', date: assignedDate, total: dayRows.reduce((s, r) => s + (Number(r.plot.plot_area) || 0), 0), count: dayRows.length });
                                  }
                                  return rows;
                                }, []);
                                return (
                                  <div className="space-y-2">
                                    {/* Mode switch + Farm, same row */}
                                    <div className="flex items-center gap-2">
                                      <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5 shrink-0">
                                        <button type="button" onClick={() => handleOnFieldModeChange(step.id, 'cultivation')} className={cn('px-2 py-1 rounded text-[11px] font-semibold transition-colors', step.details.onFieldMode === 'cultivation' ? 'bg-lime-700 text-white' : 'text-slate-600 hover:bg-white')}>Cultivation</button>
                                        <button type="button" onClick={() => handleOnFieldModeChange(step.id, 'non_cultivation')} className={cn('px-2 py-1 rounded text-[11px] font-semibold transition-colors', step.details.onFieldMode === 'non_cultivation' ? 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-white')}>Non-Cult.</button>
                                      </div>
                                      <select value={step.details.landId} onChange={e => handleOnFieldFarmChange(step.id, e.target.value)} className="flex-1 min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-slate-900 focus:outline-none">
                                        <option value="">Choose farm</option>
                                        {farms.map((f: any) => <option key={f.farm_id} value={f.farm_id}>{f?.owner_name || f?.farm_id}{f?.crop_type ? ` · ${f.crop_type}` : ''}{f?.area ? ` (${f.area}ac)` : ''}</option>)}
                                      </select>
                                    </div>
                                    {selectedLand && (
                                      <p className="text-[10px] text-slate-400">{Number(selectedLand?.area || 0).toFixed(2)} acres · {selectedLand?.land_data?.village || '—'}</p>
                                    )}

                                    {/* Calendar select — this farm may have multiple overlapping calendars, so ask which one this task belongs to */}
                                    {step.details.landId && step.details.onFieldMode === 'cultivation' && (
                                      <div>
                                        <select
                                          value={step.details.onFieldCalendarId}
                                          onChange={e => updateStepDetails(step.id, { onFieldCalendarId: e.target.value })}
                                          disabled={calendarsLoadingByStep[step.id] || calendars.length === 0}
                                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-slate-900 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                                        >
                                          <option value="">
                                            {calendarsLoadingByStep[step.id] ? 'Loading calendars…' : calendars.length === 0 ? 'No calendar found for this farm' : 'Select calendar'}
                                          </option>
                                          {calendars.map(c => (
                                            <option key={c.calander_id} value={c.calander_id}>{formatShortDate(c.start_date)} - {formatShortDate(c.end_date)}</option>
                                          ))}
                                        </select>
                                        {calendars.length > 1 && (
                                          <p className="mt-0.5 text-[10px] text-amber-600">This farm has {calendars.length} calendars — pick the one this task belongs to, or it may get created in the wrong one.</p>
                                        )}
                                      </div>
                                    )}

                                    {/* Vendors from scope of work — compact chips */}
                                    {step.details.landId && (
                                      <div className="space-y-1">
                                        {scopeLoadingByStep[step.id] ? (
                                          <p className="text-[11px] text-slate-400 italic">Loading vendors…</p>
                                        ) : scopeVendorIds.length === 0 ? (
                                          <p className="text-[11px] text-slate-400 italic">No vendor scope for this land — assign one in Scope of Work.</p>
                                        ) : (
                                          <div className="flex flex-wrap gap-1">
                                            {scopeVendorIds.map(vendorId => {
                                              const v = scope[vendorId];
                                              const isSelected = step.details.vendorId === vendorId;
                                              return (
                                                <button
                                                  key={vendorId}
                                                  type="button"
                                                  onClick={() => handleOnFieldVendorChange(step.id, step.details.landId, vendorId, v.vendor_details?.vendor_name || vendorId, step.details.onFieldMode)}
                                                  className={cn('rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors', isSelected ? 'border-lime-600 bg-lime-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-lime-300 hover:bg-lime-50/60')}
                                                >
                                                  {v.vendor_details?.vendor_name || vendorId}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}
                                        {selectedScope && selectedScope.activities?.length > 0 && step.details.onFieldMode === 'cultivation' && (
                                          <div className="flex flex-wrap gap-1">
                                            {selectedScope.activities.map(a => <span key={a} className="text-[10px] px-1.5 py-0.5 bg-lime-100 text-lime-800 border border-lime-200 rounded font-medium">{a}</span>)}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Cultivation: activity + date + qty in one row */}
                                    {step.details.vendorId && step.details.onFieldMode === 'cultivation' && (
                                      <div className="grid grid-cols-3 gap-1.5">
                                        <select value={step.details.onFieldActivity} onChange={e => updateStepDetails(step.id, { onFieldActivity: e.target.value })} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-slate-900 focus:outline-none">
                                          <option value="">Activity</option>
                                          {cultivationActivityOptions.map(a => <option key={a} value={a}>{a}</option>)}
                                        </select>
                                        <input type="date" value={step.details.onFieldStartDate} onChange={e => updateStepDetails(step.id, { onFieldStartDate: e.target.value })} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-slate-900 focus:outline-none" />
                                        <input type="number" min="0" value={step.details.onFieldWorkQuantity} onChange={e => updateStepDetails(step.id, { onFieldWorkQuantity: e.target.value })} placeholder="Qty/day (acres)" className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-slate-900 focus:outline-none" />
                                      </div>
                                    )}

                                    {step.details.vendorId && step.details.onFieldMode === 'cultivation' && (
                                      <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Auto-scheduled by plot</p>
                                        {plotsLoadingByStep[step.id] ? (
                                          <p className="mt-1 text-[11px] text-slate-400 italic">Loading plots…</p>
                                        ) : plots.length === 0 ? (
                                          <p className="mt-1 text-[11px] text-slate-400 italic">No plots found for this vendor's scope on this land.</p>
                                        ) : activePlots.length === 0 ? (
                                          <p className="mt-1 text-[11px] text-slate-400 italic">All plots removed — add one back below.</p>
                                        ) : !step.details.onFieldStartDate || !step.details.onFieldWorkQuantity ? (
                                          <p className="mt-1 text-[11px] text-slate-400 italic">Set a start date and work quantity to auto-schedule plots.</p>
                                        ) : (
                                          <div className="mt-1 overflow-hidden rounded-md border border-slate-200 bg-white">
                                            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                              <div>Plot</div><div>Crop</div><div className="text-right">Acres</div><div className="text-right">Date</div><div />
                                            </div>
                                            <div className="divide-y divide-slate-100">
                                              {scheduleRows.map((row, ri) => row.kind === 'plot' ? (
                                                <div key={`plot-${row.plot.plot_id}`} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center gap-2 px-2 py-1 text-[11px]">
                                                  <span className="truncate font-medium text-slate-900">{row.plot.plot_name || row.plot.plot_id}</span>
                                                  <span className="truncate text-slate-600">{row.plot.crop_type || '—'}</span>
                                                  <span className="text-right text-slate-600">{Number(row.plot.plot_area || 0).toFixed(2)}</span>
                                                  <span className="text-right font-medium text-slate-900">{formatShortDate(row.assignedDate)}</span>
                                                  <button type="button" onClick={() => excludePlotFromStep(step.id, row.plot.plot_id)} title="Remove plot" className="text-slate-300 hover:text-red-500 shrink-0"><X className="h-3.5 w-3.5" /></button>
                                                </div>
                                              ) : (
                                                <div key={`total-${row.date}-${ri}`} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center gap-2 bg-lime-50 px-2 py-1 text-[11px]">
                                                  <span className="col-span-2 font-semibold text-lime-800">Total ({row.count} plot{row.count !== 1 ? 's' : ''})</span>
                                                  <span className="text-right font-bold text-lime-800">{row.total.toFixed(2)}</span>
                                                  <span className="text-right font-semibold text-lime-800">{formatShortDate(row.date)}</span>
                                                  <span />
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        {excludedPlots.length > 0 && (
                                          <div className="mt-1 flex flex-wrap items-center gap-1">
                                            <span className="text-[10px] text-slate-400">Removed:</span>
                                            {excludedPlots.map(p => (
                                              <button key={p.plot_id} type="button" onClick={() => restorePlotToStep(step.id, p.plot_id)} title="Add back" className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500 hover:border-lime-300 hover:text-lime-700">
                                                {p.plot_name || p.plot_id} <Plus className="h-2.5 w-2.5" />
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Non-cultivation: task, timeline, then labelled quantity/unit lines */}
                                    {step.details.vendorId && step.details.onFieldMode === 'non_cultivation' && (
                                      <div className="space-y-2">
                                        <div>
                                          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Task / activity</label>
                                          <select value={step.details.onFieldActivity} onChange={e => updateStepDetails(step.id, { onFieldActivity: e.target.value })} className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-slate-900 focus:outline-none">
                                            <option value="">Choose task</option>
                                            {cultivationActivityOptions.map(a => <option key={a} value={a}>{a}</option>)}
                                          </select>
                                        </div>

                                        <div className="grid grid-cols-2 gap-1.5">
                                          <div>
                                            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">From date</label>
                                            <input type="date" value={step.details.onFieldFromDate} onChange={e => updateStepDetails(step.id, { onFieldFromDate: e.target.value })} className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-slate-900 focus:outline-none" />
                                          </div>
                                          <div>
                                            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">To date</label>
                                            <input type="date" value={step.details.onFieldToDate} onChange={e => updateStepDetails(step.id, { onFieldToDate: e.target.value })} className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-slate-900 focus:outline-none" />
                                          </div>
                                        </div>

                                        <div className="rounded-md border border-slate-200 bg-slate-50 p-2 space-y-1.5">
                                          <div className="flex items-center gap-1.5 text-xs text-slate-700">
                                            <span className="shrink-0 font-medium">Do</span>
                                            <input type="number" min="0" value={step.details.onFieldQty} onChange={e => updateStepDetails(step.id, { onFieldQty: e.target.value })} placeholder="2" className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-center focus:border-slate-900 focus:outline-none" />
                                            <input value={step.details.onFieldUnit} onChange={e => updateStepDetails(step.id, { onFieldUnit: e.target.value })} placeholder="Borewells" className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-slate-900 focus:outline-none" />
                                          </div>
                                          <div className="flex items-center gap-1.5 text-xs text-slate-700">
                                            <span className="shrink-0 font-medium">Up to</span>
                                            <input type="number" min="0" value={step.details.onFieldSpecValue} onChange={e => updateStepDetails(step.id, { onFieldSpecValue: e.target.value })} placeholder="250" className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-center focus:border-slate-900 focus:outline-none" />
                                            <input value={step.details.onFieldSpecUnit} onChange={e => updateStepDetails(step.id, { onFieldSpecUnit: e.target.value })} placeholder="feet deep" className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-slate-900 focus:outline-none" />
                                            <span className="shrink-0 text-[10px] text-slate-400">(optional)</span>
                                          </div>
                                          <p className="text-[10px] text-slate-400">Reads as: "Do {step.details.onFieldQty || '2'} {step.details.onFieldUnit || 'Borewells'}{step.details.onFieldSpecValue && step.details.onFieldSpecUnit ? `, up to ${step.details.onFieldSpecValue} ${step.details.onFieldSpecUnit}` : ''}".</p>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* Other */}
                              {step.type === 'other' && (
                                <div>
                                  <p className="text-xs font-semibold text-slate-900 mb-1.5">Description</p>
                                  <textarea value={step.details.otherDescription} onChange={e => updateStepDetails(step.id, { otherDescription: e.target.value })} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none" placeholder="Add task description" />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500 text-center">
                    Step 1 will appear after selecting a designation and assignee.
                  </div>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-200 shrink-0">
              <button type="button" onClick={handleAssignTask} disabled={isCreatingTask} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                <UserCheck className="h-4 w-4" />
                {isCreatingTask ? 'Creating...' : 'Assign Task'}
              </button>
              <button type="button" onClick={addStep} disabled={!canAddSteps} className={cn('inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors', canAddSteps ? 'bg-slate-900 text-white hover:bg-slate-800' : 'cursor-not-allowed bg-gray-200 text-gray-400')}>
                <Plus className="h-4 w-4" /> Add step
              </button>
              <button type="button" onClick={closeModal} className="ml-auto rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Resource popup ────────────────────────────────────────────────────── */}
      {resourcePopup && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.22)]">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{resourcePopup.type === 'inventory' ? 'Inventory popup' : 'Vehicle popup'}</p>
                <h4 className="text-base font-semibold text-slate-900">{resourcePopup.type === 'inventory' ? 'Select inventory items' : 'Select vehicles'}</h4>
              </div>
              <button type="button" onClick={() => setResourcePopup(null)} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50"><X className="h-4 w-4" /></button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-4">
              {resourcePopup.type === 'inventory' ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-[2fr_1fr_1fr_130px] gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <div>Item</div><div>Stock</div><div>Unit</div><div className="text-right">Qty</div>
                  </div>
                  {inventoryItems.map(item => {
                    const itemId = getInventoryItemId(item);
                    const current = Number(taskFlowSteps.find(s => s.id === resourcePopup.stepId)?.details.inventoryItems[itemId] || 0);
                    const max = Number(item?.stock || 0);
                    return (
                      <div key={itemId} className="grid grid-cols-[2fr_1fr_1fr_130px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm">
                        <div><div className="font-medium text-slate-900">{getInventoryItemName(item)}</div><div className="text-xs text-slate-500">{itemId}</div></div>
                        <div className="text-slate-700">{max}</div>
                        <div className="text-slate-600">{String(item?.unit || '—')}</div>
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => updateInventorySelection(resourcePopup.stepId, itemId, -1)} disabled={current === 0} className="h-7 w-7 rounded-md border border-slate-200 text-slate-600 disabled:cursor-not-allowed disabled:opacity-30">-</button>
                          <div className="w-8 text-center font-semibold text-slate-900 text-sm">{current}</div>
                          <button type="button" onClick={() => updateInventorySelection(resourcePopup.stepId, itemId, 1, max)} disabled={max === 0 || current >= max} className="h-7 w-7 rounded-md border border-slate-200 text-slate-600 disabled:cursor-not-allowed disabled:opacity-30">+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[2fr_1fr_1fr_100px] gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <div>Vehicle</div><div>Company</div><div>Status</div><div className="text-right">Action</div>
                  </div>
                  {vehicles.map(vehicle => {
                    const vehicleId = getVehicleId(vehicle);
                    const step = taskFlowSteps.find(s => s.id === resourcePopup.stepId);
                    const selected = !!step?.details.vehicleIds.includes(vehicleId);
                    return (
                      <div key={vehicleId} className={cn('grid grid-cols-[2fr_1fr_1fr_100px] items-center gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-sm', selected ? 'border-amber-300 bg-amber-50/70' : 'border-slate-200 bg-white')}>
                        <div><div className="font-medium text-slate-900">{getVehicleName(vehicle)}</div><div className="text-xs text-slate-500">{vehicleId}</div></div>
                        <div className="text-slate-700">{String(vehicle?.vehicle_information?.company || '—')}</div>
                        <div className={selected ? 'text-emerald-700 text-xs font-medium' : 'text-slate-500 text-xs'}>{selected ? 'Selected' : 'Available'}</div>
                        <div className="flex justify-end">
                          <button type="button" onClick={() => toggleVehicleSelection(resourcePopup.stepId, vehicleId)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                            {selected ? 'Remove' : 'Select'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end border-t border-slate-200 bg-white px-5 py-3">
              <button type="button" onClick={() => setResourcePopup(null)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Done</button>
            </div>
          </div>
        </div>
      )}
      {/* ── Lock Confirmation Modal ── */}
      {lockConfirmTarget && (() => {
        const target = lockConfirmTarget;
        const steps = normalizeTaskSteps(target.stepsDict);
        const allocItems = Object.entries(target.allocationSchema);
        const allFarms = Array.from(new Set(
          allocItems.flatMap(([, item]) => Object.keys(item.farm_allocation || {}))
        ));
        const getFarmName = (farmId: string): string => {
          const farm = farms.find((f: any) => String(f?.farm_id || '') === farmId);
          if (farm) return String((farm as any)?.owner_name || farmId);
          for (const [, it] of allocItems) {
            if (it.farm_allocation?.[farmId]?.owner_name) return it.farm_allocation[farmId].owner_name;
          }
          return farmId;
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
                    <Lock className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Confirm Allocation Lock</h2>
                    <p className="text-[11px] text-slate-500">{target.taskId}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setLockConfirmTarget(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
                {/* Task meta */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Task ID', value: target.taskId },
                    { label: 'Created', value: formatTaskDate(target.createdAt) },
                    { label: 'Staff ID', value: target.staffId || '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
                      <p className="text-xs font-medium text-slate-800 truncate">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Steps summary */}
                {steps.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Task Steps</p>
                    <div className="space-y-1.5">
                      {steps.map(step => (
                        <div key={step.key} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold text-slate-500 w-12">Step {step.stepNumber}</span>
                            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize', stepTypeColor[step.type] ?? stepTypeColor.other)}>
                              {step.type || 'unknown'}
                            </span>
                          </div>
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize', getStepStatusClasses(step.status))}>
                            {step.status || 'pending'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Allocation table */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Farm Distribution</p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 min-w-[140px]">Item</th>
                          <th className="text-center px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total Qty</th>
                          {allFarms.map(farmId => (
                            <th key={farmId} className="text-center px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 min-w-[100px]">
                              {getFarmName(farmId)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {allocItems.map(([productId, item]) => (
                          <tr key={productId} className="hover:bg-slate-50/50">
                            <td className="px-3 py-2">
                              <p className="font-medium text-slate-800 truncate">{item.item_name || productId}</p>
                              <p className="text-[10px] text-slate-400">{item.unit}</p>
                            </td>
                            <td className="px-3 py-2 text-center font-semibold text-slate-700">{item.quantity}</td>
                            {allFarms.map(farmId => {
                              const local = apiAllocDistribution[target.taskId]?.[productId]?.[farmId];
                              const qty = local !== undefined ? local : (item.farm_allocation?.[farmId]?.quantity ?? '—');
                              return (
                                <td key={farmId} className="px-3 py-2 text-center text-slate-700">
                                  {qty !== '' && qty !== undefined ? qty : '—'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Disclaimer */}
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex gap-3">
                  <div className="shrink-0 mt-0.5 h-4 w-4 rounded-full bg-red-500 flex items-center justify-center text-white text-[9px] font-bold">!</div>
                  <div>
                    <p className="text-xs font-semibold text-red-700 mb-0.5">Disclaimer</p>
                    <p className="text-[11px] text-red-600 leading-relaxed">
                      Locking this allocation will <span className="font-semibold">permanently commit</span> the farm distribution and may trigger changes in inventory stocks and allocation of items to land. This action cannot be undone.
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 shrink-0">
                <button
                  type="button"
                  onClick={() => setLockConfirmTarget(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { handleLockAllocation(target.taskId); setLockConfirmTarget(null); }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors shadow-sm"
                >
                  <Lock className="h-3.5 w-3.5" /> Confirm & Lock
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default OnDemandTask;
