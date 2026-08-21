import { useEffect, useMemo, useState } from 'react';
import { X, Plus, UserCheck, Save, Lock, ClipboardCheck, Boxes, Shapes, Search, ChevronLeft, Camera, Video, MapPin, FileText, MoreHorizontal, Zap, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';
import { toast } from 'sonner';
import { listWccOrderReferences } from '@/lib/wccEnterpriseApi';
import { getGateEntries, listGrns } from '@/lib/grnApi';

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskStepType = 'inventory' | 'logistics' | 'inspection' | 'cultivation' | 'on_field' | 'other';

type OnFieldTaskMode = 'cultivation' | 'non_cultivation';
type WorkspaceTab = 'task' | 'allocation' | 'templates';
type CreateMode = 'quick' | 'structured' | 'template';
type BuilderSection = 'details' | 'assignment' | 'work' | 'controls' | 'review';
type TaskWorkspaceSection = 'overview' | 'steps' | 'resources' | 'evidence' | 'activity';
type SystemRecordOption = { id: string; label: string; detail?: string };

interface UniversalTaskDraft {
  title: string;
  category: string;
  description: string;
  priority: string;
  plannedStart: string;
  dueDate: string;
  department: string;
  project: string;
  costCentre: string;
  tags: string;
  relatedTo: string;
  relatedId: string;
  locationType: string;
  locationId: string;
  owner: string;
  supervisor: string;
  verifier: string;
  approvalMode: string;
  evidenceRule: string;
  recurrence: string;
  taskQuantity: string;
  taskUnit: string;
  specification: string;
  verificationRequired: boolean;
  requiredPhotos: number;
  requiredVideos: number;
  landIds: string[];
}

// Pseudo-vendor selectable when no vendor is in scope for the land — the task is done in-house
const SELF_VENDOR_ID = 'self';

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
    capabilities: string[];
    inventoryItems: Record<string, number>;
    allocationNeeded: boolean;
    // Add-ons attached to an inventory step, managed inline in the same popup rather than as separate steps
    includeLogistics: boolean;
    includeOnField: boolean;
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
    onFieldOrderNumber: string;
    onFieldActivity: string;
    // Non-cultivation, real-vendor case: quantity entered per WO line item name, keyed by
    // item.name — a task can now cover several line items from the same WO in one step.
    onFieldLineItemQuantities: Record<string, string>;
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

// A Work Order line item, as returned by /admin_wcc_certificate/get_active_vendor_orders/{vendor_id} —
// a WCC is always raised against a WO's line items, so on-field tasks pick their activity from
// here instead of a generic activity list, keeping the two in sync.
interface WoLineItem {
  name: string;
  description: string;
  quantity: number;
  unit_rate: number;
  uom: string;
  gst_percent: number;
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
  task_details?: Partial<UniversalTaskDraft>;
  required_media?: { photos?: number; videos?: number };
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
  taskDetails?: Partial<UniversalTaskDraft>;
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

type StoreAllocationEntry = { store: string; quantity: number };

type ApiAllocationItem = {
  unit: string;
  item_name: string;
  quantity: number;
  farm_allocation: Record<string, { owner_name: string; quantity: number; store_allocations?: StoreAllocationEntry[] }>;
};

// A single editable row in the store-split UI (Lock Confirmation modal) — quantity is
// string-valued while editing, same convention as the rest of this file's numeric inputs.
type StoreSplitRow = { store: string; quantity: string };

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

const EMPTY_UNIVERSAL_TASK: UniversalTaskDraft = {
  title: '', category: 'field_operations', description: '', priority: 'medium', plannedStart: '', dueDate: '',
  department: '', project: '', costCentre: '', tags: '', relatedTo: 'none', relatedId: '', locationType: 'none',
  locationId: '', owner: '', supervisor: '', verifier: '', approvalMode: 'none', evidenceRule: 'none', recurrence: 'one_time',
  taskQuantity: '', taskUnit: 'Nos.', specification: '', verificationRequired: false,
  requiredPhotos: 0, requiredVideos: 0,
  landIds: [],
};

const TASK_CATEGORIES = [
  ['field_operations', 'Field Operations'], ['cultivation', 'Cultivation'], ['maintenance', 'Maintenance'],
  ['inspection', 'Inspection'], ['inventory', 'Inventory'], ['logistics', 'Logistics'], ['procurement', 'Procurement'],
  ['finance', 'Finance'], ['hr_admin', 'HR / Administration'], ['documentation', 'Documentation'],
  ['compliance', 'Compliance'], ['project', 'Project'], ['it', 'IT'], ['other', 'Other'],
];

const UNIVERSAL_TASK_TEMPLATES = [
  { id: 'borewell', name: 'Borewell Drilling', category: 'field_operations', priority: 'high', description: 'Drill, measure, test and document a borewell.', steps: ['on_field', 'inspection'] as TaskStepType[] },
  { id: 'farm-inspection', name: 'Farm Inspection', category: 'inspection', priority: 'medium', description: 'Inspect field condition and submit evidence.', steps: ['inspection'] as TaskStepType[] },
  { id: 'manure', name: 'Organic Manure Spreading', category: 'cultivation', priority: 'medium', description: 'Allocate material and execute manure spreading against measured acreage.', steps: ['inventory', 'on_field', 'inspection'] as TaskStepType[] },
  { id: 'vehicle-maintenance', name: 'Vehicle Maintenance', category: 'maintenance', priority: 'medium', description: 'Inspect, repair and verify a vehicle.', steps: ['logistics', 'inspection'] as TaskStepType[] },
  { id: 'inventory-transfer', name: 'Inventory Transfer', category: 'inventory', priority: 'high', description: 'Allocate, transport and confirm inventory handover.', steps: ['inventory', 'logistics', 'inspection'] as TaskStepType[] },
  { id: 'document-collection', name: 'Document Collection', category: 'documentation', priority: 'low', description: 'Collect and verify required documents.', steps: ['other', 'inspection'] as TaskStepType[] },
];

const BUILDER_SECTIONS: Array<[BuilderSection, string]> = [
  ['details', 'Details'], ['assignment', 'Assignment'], ['work', 'Work'], ['controls', 'Controls'], ['review', 'Review'],
];

const STEP_CAPABILITIES = [
  'Quantity / Work Measurement', 'Inventory', 'Logistics', 'Vehicle', 'Equipment', 'Manpower',
  'Vendor', 'Work Order', 'Inspection Form', 'Checklist', 'Photos', 'Videos', 'Documents', 'GPS', 'Signature',
  'Approval', 'Expense', 'Material Consumption', 'Custom Fields',
];

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
      taskDetails: step?.task_details,
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
  const [stepFieldsPopupId, setStepFieldsPopupId] = useState<string | null>(null);
  // Per-step farm distribution — only used when an inventory step's "Allocation needed?" is Yes.
  // Distributes the items already picked on the left across farms, right there in the same popup;
  // submitted as a paired create_new_allocation_schema + allocate_inventory_to_farm call (see handleAssignTask).
  const [stepAllocation, setStepAllocation] = useState<Record<string, { farms: string[]; distribution: Record<string, Record<string, string>>; farmSelector: string }>>({});
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('task');
  const [createMode, setCreateMode] = useState<CreateMode>('structured');
  const [builderSection, setBuilderSection] = useState<BuilderSection>('details');
  const [universalTask, setUniversalTask] = useState<UniversalTaskDraft>(EMPTY_UNIVERSAL_TASK);
  const [isCreateChooserOpen, setIsCreateChooserOpen] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState('all');
  const [taskCategoryFilter, setTaskCategoryFilter] = useState('all');
  const [selectedTask, setSelectedTask] = useState<TaskViewModel | null>(null);
  const [taskWorkspaceSection, setTaskWorkspaceSection] = useState<TaskWorkspaceSection>('overview');
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateCategory, setTemplateCategory] = useState('all');
  const [relatedRecordOptions, setRelatedRecordOptions] = useState<Record<string, SystemRecordOption[]>>({});
  const [relatedRecordsLoading, setRelatedRecordsLoading] = useState(false);
  const [relatedRecordsError, setRelatedRecordsError] = useState('');

  // On Field Task: vendor scope + plots, fetched per-step since each step can target a different farm/vendor
  const [scopeByStep, setScopeByStep] = useState<Record<string, Record<string, VendorScopeEntry>>>({});
  const [scopeLoadingByStep, setScopeLoadingByStep] = useState<Record<string, boolean>>({});
  const [plotsByStep, setPlotsByStep] = useState<Record<string, OnFieldPlot[]>>({});
  const [plotsLoadingByStep, setPlotsLoadingByStep] = useState<Record<string, boolean>>({});
  const [excludedPlotsByStep, setExcludedPlotsByStep] = useState<Record<string, string[]>>({});
  const [calendarsByStep, setCalendarsByStep] = useState<Record<string, OnFieldCalendarOption[]>>({});
  const [calendarsLoadingByStep, setCalendarsLoadingByStep] = useState<Record<string, boolean>>({});
  // The vendor's active Work Orders + their line items — activities are picked from here
  // (rather than the generic cultivation activity list) so tasks line up with what a WCC
  // will later be raised against. Self has no WO, so this stays empty for it.
  const [activeOrdersByStep, setActiveOrdersByStep] = useState<Record<string, string[]>>({});
  const [orderItemsByStep, setOrderItemsByStep] = useState<Record<string, Record<string, WoLineItem[]>>>({});
  const [activeOrdersLoadingByStep, setActiveOrdersLoadingByStep] = useState<Record<string, boolean>>({});


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
  // Store-wise split entered in the Lock Confirmation modal, before it's actually locked —
  // keyed by [productId][farmId]. Reset whenever the modal is (re)opened.
  const [storeSplits, setStoreSplits] = useState<Record<string, Record<string, StoreSplitRow[]>>>({});

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

  useEffect(() => {
    const type = universalTask.relatedTo;
    if (!isModalOpen || !type || ['none', 'custom'].includes(type) || relatedRecordOptions[type]) return;
    let cancelled = false;
    const loadRelatedRecords = async () => {
      setRelatedRecordsLoading(true);
      setRelatedRecordsError('');
      try {
        let options: SystemRecordOption[] = [];
        if (['purchase_requirement', 'purchase_request', 'purchase_order', 'work_order', 'vendor'].includes(type)) {
          const orders = await listWccOrderReferences();
          if (type === 'purchase_requirement' || type === 'purchase_request') {
            options = Array.from(new Map(orders.filter((row) => row.prNumber).map((row) => [row.prNumber, { id: row.prNumber, label: row.prNumber, detail: row.department || row.vendorName }])).values());
          } else if (type === 'vendor') {
            options = Array.from(new Map(orders.filter((row) => row.vendorId).map((row) => [row.vendorId, { id: row.vendorId, label: row.vendorName || row.vendorId, detail: row.vendorId }])).values());
          } else {
            options = orders.filter((row) => {
              const isWorkOrder = row.orderType.toLowerCase().includes('work') || /(^|\/)WO(\/|$)/i.test(row.orderNumber);
              return type === 'work_order' ? isWorkOrder : !isWorkOrder;
            }).map((row) => ({ id: row.orderNumber, label: row.orderNumber, detail: row.vendorName || row.department }));
          }
        } else if (type === 'grn') {
          options = (await listGrns()).map((row) => ({ id: row.grnNo, label: row.grnNo, detail: [row.poNo, row.vendorName].filter(Boolean).join(' · ') }));
        } else if (type === 'gate_entry') {
          options = (await getGateEntries()).map((row) => ({ id: row.enteryId, label: row.siteEntryNo || row.enteryId, detail: [row.vendorName, row.orderNumber].filter(Boolean).join(' · ') }));
        } else if (type === 'wcc') {
          const response = await fetch(`${BASE_URL}/admin_wcc_certificate/list`, { headers: { Accept: 'application/json' } });
          const data = await response.json().catch(() => null);
          if (!response.ok) throw new Error(data?.detail || 'Failed to load WCC records');
          const certificates = Array.isArray(data?.certificates) ? data.certificates : [];
          options = certificates.map((row: any) => ({ id: String(row?.certificate_id || row?.wcc_number || ''), label: String(row?.certificate_id || row?.wcc_number || 'WCC'), detail: [row?.order_number, row?.vendor_name].filter(Boolean).join(' · ') })).filter((row: SystemRecordOption) => row.id);
        } else if (type === 'land_parcel' || type === 'plot' || type === 'farm') {
          options = farms.map((farm) => ({ id: String(farm?.farm_id || farm?.id || ''), label: String(farm?.land_data?.village || farm?.owner_name || farm?.farm_id || 'Land parcel'), detail: String(farm?.farm_id || '') })).filter((row) => row.id);
        } else if (type === 'vehicle') {
          options = vehicles.map((vehicle) => ({ id: getVehicleId(vehicle), label: getVehicleName(vehicle), detail: getVehicleId(vehicle) })).filter((row) => row.id);
        } else if (type === 'inventory_item' || type === 'equipment' || type === 'asset') {
          options = inventoryItems.map((item) => ({ id: getInventoryItemId(item), label: getInventoryItemName(item), detail: String(item?.unit || '') })).filter((row) => row.id);
        } else if (type === 'employee') {
          options = Object.values(staffByDesignation).flat().map((staff) => ({ id: String(staff.staff_id || ''), label: String(staff.staff_information?.staff_name || staff.staff_id || 'Employee'), detail: String(staff.staff_information?.staff_designation || '') })).filter((row) => row.id);
        } else if (type === 'calendar_activity' || type === 'cultivation_plan') {
          options = cultivationActivities.map((activity) => ({ id: activity.id, label: activity.name, detail: activity.category || '' }));
        } else if (type === 'another_task') {
          options = ondemandTasks.map((task) => ({ id: task.taskId, label: String(task.steps.find((step) => step.taskDetails)?.taskDetails?.title || task.taskId), detail: task.taskId }));
        }
        if (!cancelled) setRelatedRecordOptions((current) => ({ ...current, [type]: options }));
      } catch (error) {
        if (!cancelled) setRelatedRecordsError(error instanceof Error ? error.message : 'Unable to load system records');
      } finally {
        if (!cancelled) setRelatedRecordsLoading(false);
      }
    };
    void loadRelatedRecords();
    return () => { cancelled = true; };
  }, [isModalOpen, universalTask.relatedTo, relatedRecordOptions, farms, vehicles, inventoryItems, ondemandTasks, staffByDesignation, cultivationActivities]);

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
      assignee: '', assigneeDesignation: '', title: `Step ${stepNumber}`, notes: '', capabilities: [], inventoryItems: {}, allocationNeeded: false, includeLogistics: false, includeOnField: false, vehicleIds: [], inspectionInputType: 'text', inspectionFields: [], landId: '', otherDescription: '',
      onFieldMode: 'cultivation', onFieldCalendarId: '', vendorId: '', vendorName: '', onFieldOrderNumber: '', onFieldActivity: '', onFieldLineItemQuantities: {}, onFieldStartDate: '', onFieldWorkQuantity: '', onFieldFromDate: '', onFieldToDate: '', onFieldQty: '', onFieldUnit: '', onFieldSpecValue: '', onFieldSpecUnit: '',
    },
  });

  const openModal = async (mode: CreateMode = 'structured') => {
    setIsModalOpen(true);
    setCreateMode(mode);
    setBuilderSection(mode === 'quick' ? 'details' : 'details');
    setUniversalTask(EMPTY_UNIVERSAL_TASK);
    setTaskAssignment({ designation: '', staffId: '', staffName: '' });
    setTaskFlowSteps([]);
    setResourcePopup(null);
    setStepFieldsPopupId(null);
    setStepAllocation({});
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
    setCreateMode('structured');
    setBuilderSection('details');
    setUniversalTask(EMPTY_UNIVERSAL_TASK);
    setTaskAssignment({ designation: '', staffId: '', staffName: '' });
    setTaskFlowSteps([]);
    setResourcePopup(null);
    setStepFieldsPopupId(null);
    setStepAllocation({});
  };

  const buildLogisticsEntry = (step: TaskFlowStep) => ({
    type: 'logistics', status: 'pending',
    data: step.details.vehicleIds.map(vid => {
      const v = vehicles.find(e => getVehicleId(e) === vid);
      if (!v) return null;
      return { vehicle_id: getVehicleId(v), vehicle_number: String(v?.vehicle_information?.vehicle_number || getVehicleName(v)) };
    }).filter(Boolean),
  });

  const buildOnFieldEntry = (step: TaskFlowStep) => {
    const d = step.details;
    const land = farms.find(f => String(f?.farm_id || f?.id || '') === d.landId);
    const base = { farm_id: String(land?.farm_id || ''), vendor_id: d.vendorId, vendor_name: d.vendorName };
    const data = d.onFieldMode === 'cultivation'
      ? [{
          ...base,
          activity: d.onFieldActivity,
          calander_id: d.onFieldCalendarId,
          start_date: d.onFieldStartDate,
          work_quantity_per_day: Number(d.onFieldWorkQuantity) || 0,
          plot_distribution: computePlotSchedule(
            (plotsByStep[step.id] || []).filter(p => !(excludedPlotsByStep[step.id] || []).includes(p.plot_id)),
            d.onFieldStartDate, Number(d.onFieldWorkQuantity) || 0
          ).map(({ plot, assignedDate }) => ({ plot_id: plot.plot_id, plot_name: plot.plot_name, crop_type: plot.crop_type, quantity: Number(plot.plot_area) || 0, assigned_date: assignedDate })),
        }]
      : d.vendorId !== SELF_VENDOR_ID
        // Real vendor — one entry per WO line item the user put a quantity against.
        ? (orderItemsByStep[step.id]?.[d.onFieldOrderNumber] || [])
            .filter(item => Number(d.onFieldLineItemQuantities[item.name] || 0) > 0)
            .map(item => ({
              ...base,
              activity: item.name,
              from_date: d.onFieldFromDate,
              to_date: d.onFieldToDate,
              quantity: Number(d.onFieldLineItemQuantities[item.name]) || 0,
              unit: item.uom,
              order_number: d.onFieldOrderNumber,
            }))
        // Self — no Work Order to draw line items from, so this stays free-form.
        : [{
            ...base,
            activity: d.onFieldActivity,
            from_date: d.onFieldFromDate,
            to_date: d.onFieldToDate,
            quantity: Number(d.onFieldQty) || 0,
            unit: d.onFieldUnit,
            ...(d.onFieldSpecValue && d.onFieldSpecUnit ? { spec_value: Number(d.onFieldSpecValue) || 0, spec_unit: d.onFieldSpecUnit } : {}),
          }];
    return { type: 'on_field', status: 'pending', task_mode: d.onFieldMode, data };
  };

  // A single inventory step can carry logistics/on-field add-ons (configured inline in the same
  // popup rather than as separate steps), so it can expand into more than one dict entry.
  const buildStepsDict = (steps: TaskFlowStep[]) => {
    const acc: Record<string, any> = {};
    let stepCounter = 0;
    const nextKey = () => `step_${++stepCounter}`;

    for (const step of steps) {
      if (!step.type) continue;
      if (step.type === 'inventory') {
        acc[nextKey()] = { type: 'inventory', status: 'pending', allocation_needed: step.details.allocationNeeded, data: Object.entries(step.details.inventoryItems).filter(([, qty]) => Number(qty) > 0).map(([itemId, qty]) => { const item = inventoryItems.find(e => getInventoryItemId(e) === itemId); return { item_name: String(item ? getInventoryItemName(item) : itemId), quantity: Number(qty) || 0, unit: String(item?.unit || '—'), equipment_id: String(getInventoryItemId(item) || itemId) }; }) };
        if (step.details.includeLogistics) acc[nextKey()] = buildLogisticsEntry(step);
        if (step.details.includeOnField) acc[nextKey()] = buildOnFieldEntry(step);
        continue;
      }
      if (step.type === 'logistics') { acc[nextKey()] = buildLogisticsEntry(step); continue; }
      if (step.type === 'on_field') { acc[nextKey()] = buildOnFieldEntry(step); continue; }
      if (step.type === 'inspection') {
        acc[nextKey()] = { type: 'inspection', status: 'pending', data: step.details.inspectionFields.map(f => { const inputType = f.inputType === 'mcq' ? 'MCQ' : f.inputType === 'image' ? 'image_upload' : f.inputType; return { field_name: String(f.fieldName || ''), input_type: inputType, mandetory: Boolean(f.mandatory), ...(f.inputType === 'mcq' && { options: f.options }) }; }) };
        continue;
      }
      acc[nextKey()] = { type: 'others', status: 'pending', data: [{ description: String(step.details.otherDescription || '') }] };
    }
    const taskDetails = {
      ...universalTask,
      source_type: 'manual',
      source_id: null,
      creation_mode: createMode,
      capabilities: Array.from(new Set(steps.flatMap((step) => step.details.capabilities))),
      evidence_rules: { photos: universalTask.requiredPhotos, videos: universalTask.requiredVideos },
    };
    return Object.fromEntries(Object.entries(acc).map(([key, value]) => [key, { ...value, task_details: taskDetails, required_media: { photos: universalTask.requiredPhotos, videos: universalTask.requiredVideos } }]));
  };

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

  const fetchActiveOrdersForStep = async (stepId: string, vendorId: string) => {
    setActiveOrdersLoadingByStep(prev => ({ ...prev, [stepId]: true }));
    setActiveOrdersByStep(prev => ({ ...prev, [stepId]: [] }));
    setOrderItemsByStep(prev => ({ ...prev, [stepId]: {} }));
    try {
      const res = await fetch(`${BASE_URL}/admin_wcc_certificate/get_active_vendor_orders/${vendorId}`);
      const data = await res.json().catch(() => null);
      if (data?.success && Array.isArray(data.active_orders)) {
        const orders = data.active_orders as string[];
        const items = data.items_details && typeof data.items_details === 'object' ? data.items_details as Record<string, WoLineItem[]> : {};
        setActiveOrdersByStep(prev => ({ ...prev, [stepId]: orders }));
        setOrderItemsByStep(prev => ({ ...prev, [stepId]: items }));
        // Only one active order — pick it automatically instead of making the user do it.
        if (orders.length === 1) updateStepDetails(stepId, { onFieldOrderNumber: orders[0] });
      }
    } catch { /* leave empty */ } finally {
      setActiveOrdersLoadingByStep(prev => ({ ...prev, [stepId]: false }));
    }
  };

  const handleOnFieldModeChange = (stepId: string, mode: OnFieldTaskMode) =>
    updateStepDetails(stepId, {
      onFieldMode: mode, vendorId: '', vendorName: '', onFieldOrderNumber: '', onFieldActivity: '', onFieldLineItemQuantities: {}, onFieldWorkQuantity: '',
      onFieldQty: '', onFieldUnit: '', onFieldSpecValue: '', onFieldSpecUnit: '',
    });

  const handleOnFieldFarmChange = (stepId: string, farmId: string) => {
    updateStepDetails(stepId, { landId: farmId, vendorId: '', vendorName: '', onFieldOrderNumber: '', onFieldActivity: '', onFieldLineItemQuantities: {}, onFieldCalendarId: '' });
    setPlotsByStep(prev => ({ ...prev, [stepId]: [] }));
    setExcludedPlotsByStep(prev => ({ ...prev, [stepId]: [] }));
    setCalendarsByStep(prev => ({ ...prev, [stepId]: [] }));
    setActiveOrdersByStep(prev => ({ ...prev, [stepId]: [] }));
    setOrderItemsByStep(prev => ({ ...prev, [stepId]: {} }));
    if (farmId) {
      fetchScopeForStep(stepId, farmId);
      fetchCalendarsForStep(stepId, farmId);
    }
  };

  const handleOnFieldVendorChange = (stepId: string, farmId: string, vendorId: string, vendorName: string, mode: OnFieldTaskMode) => {
    updateStepDetails(stepId, { vendorId, vendorName, onFieldOrderNumber: '', onFieldActivity: '', onFieldLineItemQuantities: {}, onFieldUnit: '' });
    setExcludedPlotsByStep(prev => ({ ...prev, [stepId]: [] }));
    if (vendorId && vendorId !== SELF_VENDOR_ID && mode === 'cultivation') {
      fetchPlotsForStep(stepId, farmId, vendorId);
    } else {
      setPlotsByStep(prev => ({ ...prev, [stepId]: [] }));
    }
    // Self has no Work Order to draw activities from — the generic activity list is its fallback.
    if (vendorId && vendorId !== SELF_VENDOR_ID) {
      fetchActiveOrdersForStep(stepId, vendorId);
    } else {
      setActiveOrdersByStep(prev => ({ ...prev, [stepId]: [] }));
      setOrderItemsByStep(prev => ({ ...prev, [stepId]: {} }));
    }
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

  const removeStep = (stepId: string) => {
    setTaskFlowSteps(prev => {
      const next = prev.filter(s => s.id !== stepId).map((s, i) => ({ ...s, stepNumber: i + 1 }));
      return next.length > 0 ? next : [createTaskStep(1)];
    });
    setStepAllocation(prev => {
      if (!(stepId in prev)) return prev;
      const { [stepId]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const emptyStepAllocation = () => ({ farms: [] as string[], distribution: {} as Record<string, Record<string, string>>, farmSelector: '' });

  const setAllocationFarmSelector = (stepId: string, farmId: string) =>
    setStepAllocation(prev => ({ ...prev, [stepId]: { ...(prev[stepId] || emptyStepAllocation()), farmSelector: farmId } }));

  const addAllocationFarm = (stepId: string) =>
    setStepAllocation(prev => {
      const current = prev[stepId] || emptyStepAllocation();
      if (!current.farmSelector || current.farms.includes(current.farmSelector)) return prev;
      return { ...prev, [stepId]: { ...current, farms: [...current.farms, current.farmSelector], farmSelector: '' } };
    });

  const removeAllocationFarm = (stepId: string, farmId: string) =>
    setStepAllocation(prev => {
      const current = prev[stepId] || emptyStepAllocation();
      return { ...prev, [stepId]: { ...current, farms: current.farms.filter(f => f !== farmId) } };
    });

  const updateAllocationQty = (stepId: string, itemId: string, farmId: string, qty: string) =>
    setStepAllocation(prev => {
      const current = prev[stepId] || emptyStepAllocation();
      return {
        ...prev,
        [stepId]: { ...current, distribution: { ...current.distribution, [itemId]: { ...(current.distribution[itemId] || {}), [farmId]: qty } } },
      };
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

  const updateUniversalTask = (patch: Partial<UniversalTaskDraft>) =>
    setUniversalTask((current) => ({ ...current, ...patch }));

  const handleSaveDraft = () => {
    window.localStorage.setItem('on-demand-task-draft', JSON.stringify({ task: universalTask, assignment: taskAssignment, steps: taskFlowSteps, savedAt: new Date().toISOString() }));
    toast.success('Task draft saved');
  };

  const applyTaskTemplate = (template: (typeof UNIVERSAL_TASK_TEMPLATES)[number]) => {
    void openModal('template');
    setUniversalTask({ ...EMPTY_UNIVERSAL_TASK, title: template.name, category: template.category, priority: template.priority, description: template.description });
    setTaskFlowSteps(template.steps.map((type, index) => ({ ...createTaskStep(index + 1), type, details: { ...createTaskStep(index + 1).details, title: `${template.name} - Step ${index + 1}` } })));
    setBuilderSection('details');
    setActiveTab('task');
  };

  const handleCreateQuickTask = async () => {
    const staffId = String(taskAssignment.staffId || '').trim();
    if (!universalTask.title.trim()) { toast.error('Task title is required'); return; }
    if (!staffId) { toast.error('Please choose an assignee'); return; }
    if (!universalTask.dueDate) { toast.error('Due date is required'); return; }
    setIsCreatingTask(true);
    try {
      const response = await fetch(`${BASE_URL}/admin_ops_requests/create_on_demand_tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: staffId,
          steps_dict: {
            step_1: {
              type: 'others', status: 'pending',
              data: [{ description: universalTask.description || universalTask.title, title: universalTask.title, priority: universalTask.priority, due_date: universalTask.dueDate }],
              task_details: { ...universalTask, source_type: 'manual', source_id: null, creation_mode: 'quick', evidence_rules: { photos: universalTask.requiredPhotos, videos: universalTask.requiredVideos } },
              required_media: { photos: universalTask.requiredPhotos, videos: universalTask.requiredVideos },
            },
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || payload?.detail || `Request failed (${response.status})`);
      toast.success('Quick task created successfully');
      closeModal();
      fetchOnDemandTasks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create quick task');
    } finally {
      setIsCreatingTask(false);
    }
  };

  const handleAssignTask = async () => {
    const assignedSteps = taskFlowSteps.filter(s => s.type);
    const staffId = String(taskAssignment?.staffId || '').trim();
    if (!universalTask.title.trim()) { toast.error('Task title is required'); return; }
    if (!universalTask.category) { toast.error('Task category is required'); return; }
    if (!universalTask.description.trim()) { toast.error('Task description is required'); return; }
    if (!universalTask.plannedStart) { toast.error('Planned start date is required'); return; }
    if (!universalTask.dueDate) { toast.error('Due date is required'); return; }
    if (assignedSteps.length === 0) { toast.error('Please add at least one task step'); return; }
    if (!staffId) { toast.error('Please choose an assignee first'); return; }

    // Steps whose selected items need distributing to farms — each becomes its own
    // create_new_allocation_schema + allocate_inventory_to_farm pair after the task is created.
    const allocationSteps = assignedSteps.filter(s => s.type === 'inventory' && s.details.allocationNeeded);
    for (const step of allocationSteps) {
      const items = Object.entries(step.details.inventoryItems).filter(([, qty]) => Number(qty) > 0);
      if (items.length === 0) { toast.error(`Step ${step.stepNumber}: select at least one item before allocating it to farms`); return; }
      const alloc = stepAllocation[step.id];
      const hasDistribution = alloc?.farms.length && items.some(([itemId]) => alloc.farms.some(fid => Number(alloc.distribution[itemId]?.[fid]) > 0));
      if (!hasDistribution) { toast.error(`Step ${step.stepNumber}: distribute at least one item to a farm`); return; }
    }

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

      for (const step of allocationSteps) {
        const items = Object.entries(step.details.inventoryItems).filter(([, qty]) => Number(qty) > 0);
        const alloc = stepAllocation[step.id] || { farms: [], distribution: {}, farmSelector: '' };
        try {
          const itemAllocationList = items.map(([itemId, qty]) => {
            const inv = inventoryItems.find(it => getInventoryItemId(it) === itemId);
            return { equipment_id: itemId, quantity: Number(qty), unit: String(inv?.unit || ''), item_name: inv ? getInventoryItemName(inv) : itemId };
          });
          const schemaResponse = await fetch(`${BASE_URL}/admin_ops_requests/create_new_allocation_schema`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ staff_id: staffId, item_allocation_list: itemAllocationList }),
          });
          const schemaPayload = await schemaResponse.json().catch(() => null);
          if (!schemaResponse.ok || !schemaPayload?.task_id) {
            toast.error(schemaPayload?.message || `Step ${step.stepNumber}: allocation schema failed to submit`);
            continue;
          }
          const allocationTaskId = String(schemaPayload.task_id);

          const distributeResponses = await Promise.all(items.map(([itemId]) => {
            const farmAllocation: Record<string, { owner_name: string; quantity: number }> = {};
            for (const farmId of alloc.farms) {
              const qty = Number(alloc.distribution[itemId]?.[farmId]) || 0;
              if (qty <= 0) continue;
              const farmData = farms.find((f: any) => String(f?.farm_id || '') === farmId);
              farmAllocation[farmId] = { owner_name: String((farmData as any)?.owner_name || farmId), quantity: qty };
            }
            if (Object.keys(farmAllocation).length === 0) return Promise.resolve(null);
            return fetch(`${BASE_URL}/admin_ops_requests/allocate_inventory_to_farm`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ task_id: allocationTaskId, equipment_id: itemId, farm_allocation: farmAllocation }),
            });
          }));
          const failed = distributeResponses.filter(r => r && !r.ok);
          if (failed.length > 0) {
            toast.error(`Step ${step.stepNumber}: ${failed.length} item(s) failed to allocate to farms`);
          } else {
            toast.success(`Step ${step.stepNumber}: allocated to farms`);
          }
        } catch {
          toast.error(`Step ${step.stepNumber}: allocation to farms failed. Please check your connection.`);
        }
      }
      if (allocationSteps.length > 0) fetchAllocations();

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

  // ── Store-wise allocation (Lock Confirmation modal) ─────────────────────────
  // Deduction now happens per-store (Inventory.dissociation[store].LIFO) instead of the
  // item's shared fifo_list, so every farm's quantity must be split across store(s) before
  // the allocation can actually be locked.

  const getItemDissociationStores = (productId: string): string[] => {
    const inv = inventoryItems.find(it => getInventoryItemId(it) === productId);
    const dissociation = (inv as any)?.dissociation;
    return dissociation && typeof dissociation === 'object' ? Object.keys(dissociation) : [];
  };

  const getStoreSplitRows = (productId: string, farmId: string): StoreSplitRow[] =>
    storeSplits[productId]?.[farmId] ?? [];

  const setStoreSplitRows = (productId: string, farmId: string, rows: StoreSplitRow[]) =>
    setStoreSplits(prev => ({ ...prev, [productId]: { ...(prev[productId] || {}), [farmId]: rows } }));

  const addStoreSplitRow = (productId: string, farmId: string) =>
    setStoreSplitRows(productId, farmId, [...getStoreSplitRows(productId, farmId), { store: '', quantity: '' }]);

  const updateStoreSplitRow = (productId: string, farmId: string, index: number, patch: Partial<StoreSplitRow>) =>
    setStoreSplitRows(productId, farmId, getStoreSplitRows(productId, farmId).map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const removeStoreSplitRow = (productId: string, farmId: string, index: number) =>
    setStoreSplitRows(productId, farmId, getStoreSplitRows(productId, farmId).filter((_, i) => i !== index));

  const getStoreSplitTotal = (productId: string, farmId: string): number =>
    getStoreSplitRows(productId, farmId).reduce((s, r) => s + (Number(r.quantity) || 0), 0);

  // Same "local edit overrides API value" fallback used everywhere else in this file
  // (handleSaveAllocation, the pending-allocation table) for a farm's needed quantity.
  const neededQtyFor = (target: LockConfirmTarget, productId: string, item: ApiAllocationItem, farmId: string): number => {
    const local = apiAllocDistribution[target.taskId]?.[productId]?.[farmId];
    const val = local !== undefined ? Number(local) : (item.farm_allocation?.[farmId]?.quantity ?? 0);
    return isNaN(val) ? 0 : val;
  };

  const farmIdsNeedingSplitFor = (target: LockConfirmTarget, productId: string, item: ApiAllocationItem): string[] => {
    const farmIds = Object.keys(item.farm_allocation || {});
    const localFarmIds = Object.keys(apiAllocDistribution[target.taskId]?.[productId] || {});
    return Array.from(new Set([...farmIds, ...localFarmIds])).filter(
      (farmId) => neededQtyFor(target, productId, item, farmId) > 0,
    );
  };

  const handleConfirmLockWithStores = async (target: LockConfirmTarget) => {
    const allocItems = Object.entries(target.allocationSchema);

    // Validate every farm's quantity is fully accounted for across its chosen store(s).
    for (const [productId, item] of allocItems) {
      for (const farmId of farmIdsNeedingSplitFor(target, productId, item)) {
        const needed = neededQtyFor(target, productId, item, farmId);
        const rows = getStoreSplitRows(productId, farmId).filter((r) => r.store && Number(r.quantity) > 0);
        if (rows.length === 0) {
          toast.error(`${item.item_name || productId} → ${farmId}: assign at least one store for ${needed} ${item.unit}`);
          return;
        }
        const allocated = rows.reduce((s, r) => s + Number(r.quantity), 0);
        if (Math.abs(allocated - needed) > 0.001) {
          toast.error(`${item.item_name || productId} → ${farmId}: store split totals ${allocated}, but ${needed} ${item.unit} is needed`);
          return;
        }
      }
    }

    try {
      // Persist store_allocations onto each farm's allocation entry before locking —
      // allocate_inventory_to_farm replaces each farm's whole entry, so owner_name/quantity
      // must be resent alongside the new store_allocations.
      for (const [productId, item] of allocItems) {
        const farmIds = farmIdsNeedingSplitFor(target, productId, item);
        if (farmIds.length === 0) continue;

        const farm_allocation: Record<string, { owner_name: string; quantity: number; store_allocations: StoreAllocationEntry[] }> = {};
        for (const farmId of farmIds) {
          const farmData = farms.find((f: any) => String(f?.farm_id || '') === farmId);
          const owner_name = String((farmData as any)?.owner_name || item.farm_allocation?.[farmId]?.owner_name || farmId);
          const rows = getStoreSplitRows(productId, farmId).filter((r) => r.store && Number(r.quantity) > 0);
          farm_allocation[farmId] = {
            owner_name,
            quantity: neededQtyFor(target, productId, item, farmId),
            store_allocations: rows.map((r) => ({ store: r.store, quantity: Number(r.quantity) })),
          };
        }

        const res = await fetch(`${BASE_URL}/admin_ops_requests/allocate_inventory_to_farm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: target.taskId, equipment_id: productId, farm_allocation }),
        });
        if (!res.ok) {
          toast.error(`Failed to save store allocation for ${item.item_name || productId}`);
          return;
        }
      }
    } catch {
      toast.error('Failed to save store allocation. Please check your connection.');
      return;
    }

    await handleLockAllocation(target.taskId);
    setLockConfirmTarget(null);
    setStoreSplits({});
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
  const taskKpis = {
    total: ondemandTasks.length,
    todo: ondemandTasks.filter((task) => task.completedSteps === 0).length,
    inProgress: ondemandTasks.filter((task) => task.completedSteps > 0 && task.completedSteps < task.totalSteps).length,
    verification: pendingAllocationTasks.length,
    overdue: ondemandTasks.filter((task) => { const due = task.steps.find((step) => step.taskDetails)?.taskDetails?.dueDate; return Boolean(due && new Date(`${due}T23:59:59`) < new Date() && task.completedSteps < task.totalSteps); }).length,
    completed: ondemandTasks.filter((task) => task.totalSteps > 0 && task.completedSteps === task.totalSteps).length,
  };
  const getTaskMeta = (task: TaskViewModel) => task.steps.find((step) => step.taskDetails)?.taskDetails || {};
  const filteredTasks = ondemandTasks.filter((task) => {
    const meta = getTaskMeta(task);
    const title = String(meta.title || task.steps[0]?.title || task.taskId);
    const category = String(meta.category || 'other');
    const pct = task.totalSteps > 0 ? Math.round((task.completedSteps / task.totalSteps) * 100) : 0;
    const status = pct === 100 ? 'completed' : pct > 0 ? 'in_progress' : 'to_do';
    const query = taskSearch.trim().toLowerCase();
    return (!query || [title, task.taskId, task.staffId, meta.locationId].some((value) => String(value || '').toLowerCase().includes(query)))
      && (taskStatusFilter === 'all' || taskStatusFilter === status)
      && (taskCategoryFilter === 'all' || taskCategoryFilter === category);
  });
  const systemRelatedTypes = new Set(['purchase_requirement', 'purchase_request', 'purchase_order', 'work_order', 'grn', 'wcc', 'gate_entry', 'vendor', 'land_parcel', 'plot', 'farm', 'vehicle', 'inventory_item', 'equipment', 'asset', 'employee', 'cultivation_plan', 'calendar_activity', 'another_task']);
  const renderRelatedRecordSelector = () => {
    const type = universalTask.relatedTo;
    const options = relatedRecordOptions[type] || [];
    if (!type || type === 'none') return <select disabled className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-400"><option>Select a document type first</option></select>;
    if (!systemRelatedTypes.has(type) || type === 'custom' || (!relatedRecordsLoading && options.length === 0)) return <><input value={universalTask.relatedId} onChange={(event) => updateUniversalTask({ relatedId: event.target.value })} placeholder={relatedRecordsError || 'No system records found — enter reference manually'} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0D3A35]" />{relatedRecordsError && <span className="mt-1 block text-[10px] text-amber-700">System list unavailable; manual reference is allowed.</span>}</>;
    return <select value={universalTask.relatedId} disabled={relatedRecordsLoading} onChange={(event) => updateUniversalTask({ relatedId: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-100"><option value="">{relatedRecordsLoading ? 'Loading system records…' : `Select from ${options.length} available record${options.length === 1 ? '' : 's'}`}</option>{options.map((record) => <option key={record.id} value={record.id}>{record.label}{record.detail ? ` — ${record.detail}` : ''}</option>)}</select>;
  };
  const renderOptionalLandSelector = () => (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold text-slate-700">Lands <span className="font-medium text-slate-400">(optional)</span></p><p className="mt-0.5 text-[11px] text-slate-500">Choose one or more land parcels where this task applies.</p></div>{universalTask.landIds.length > 0 && <button type="button" onClick={() => updateUniversalTask({ landIds: [] })} className="text-[10px] font-bold text-slate-400 hover:text-red-600">Clear all</button>}</div>
      {farms.length === 0 ? <p className="mt-3 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-400">No land parcels are currently available.</p> : <div className="mt-3 grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">{farms.map((farm) => { const id = String(farm?.farm_id || farm?.id || ''); const selected = universalTask.landIds.includes(id); const label = String(farm?.land_data?.village || farm?.owner_name || farm?.farmer_name || id || 'Land parcel'); const detail = [id, farm?.area ? `${farm.area} acre` : '', farm?.crop_type || ''].filter(Boolean).join(' · '); return <button key={id} type="button" onClick={() => updateUniversalTask({ landIds: selected ? universalTask.landIds.filter((landId) => landId !== id) : [...universalTask.landIds, id] })} className={cn('flex items-start gap-2 rounded-lg border p-2.5 text-left transition', selected ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-emerald-200 hover:bg-slate-50')}><span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold', selected ? 'border-[#0D3A35] bg-[#0D3A35] text-white' : 'border-slate-300 bg-white')}>{selected ? '✓' : ''}</span><span className="min-w-0"><span className="block truncate text-xs font-bold text-slate-700">{label}</span><span className="mt-0.5 block truncate text-[10px] text-slate-400">{detail}</span></span></button>; })}</div>}
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen space-y-6 bg-slate-50/70 p-4 font-sans sm:p-6 lg:p-8">
      {/* Page header */}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0D3A35] text-white shadow-lg shadow-emerald-950/10">
            <ClipboardCheck className="h-7 w-7" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#0D3A35]">Operations · Universal Task Engine</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Task Workspace</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Create, assign and monitor operational work through one consistent task workflow.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setActiveTab('task'); setSelectedTask(null); setIsCreateChooserOpen(true); }} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0D3A35] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#164E46]">
            <Plus className="h-4 w-4" /> Create Task
          </button>
          {activeTab === 'allocation' && (
            <button onClick={openAllocationModal} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-[#0D3A35] shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50">
              <Boxes className="h-4 w-4" /> New Allocation
            </button>
          )}
        </div>
      </div>

      <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid-cols-2 lg:grid-cols-6">
        {[
          ['Total Tasks', taskKpis.total], ['To Do', taskKpis.todo], ['In Progress', taskKpis.inProgress],
          ['Verification', taskKpis.verification], ['Overdue', taskKpis.overdue], ['Completed', taskKpis.completed],
        ].map(([label, value], index) => (
          <div key={String(label)} className={cn('relative px-5 py-4', index > 0 && 'lg:border-l', index > 1 && 'sm:border-t lg:border-t-0', 'border-slate-200')}>
            <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-emerald-700/0 transition group-hover:bg-emerald-700" />
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="inline-flex w-full gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm sm:w-auto">
        {([
          { key: 'task',       label: 'Tasks'       },
          { key: 'allocation', label: 'Allocations' },
          { key: 'templates',  label: 'Templates'   },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-1 rounded-xl px-5 py-2.5 text-sm font-bold transition-colors sm:flex-none',
              activeTab === tab.key
                ? 'bg-[#0D3A35] text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isCreateChooserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) setIsCreateChooserOpen(false); }}>
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl">
            <div className="flex items-start justify-between bg-[#0D3A35] px-6 py-5 text-white">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200">Create Task</p><h2 className="mt-1 text-xl font-semibold">How do you want to create it?</h2></div>
              <button type="button" onClick={() => setIsCreateChooserOpen(false)} className="rounded-lg p-2 text-emerald-100 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-3">
              {([
                ['quick', 'Quick Task', 'Simple assignment', Zap],
                ['structured', 'Structured Task', 'Steps and resources', ListChecks],
                ['template', 'From Template', 'Use a saved workflow', Shapes],
              ] as const).map(([mode, title, detail, Icon]) => (
                <button key={mode} type="button" onClick={() => { setIsCreateChooserOpen(false); if (mode === 'template') setActiveTab('templates'); else void openModal(mode); }} className="group rounded-2xl border border-slate-200 p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/50 hover:shadow-md">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-[#0D3A35] group-hover:bg-[#0D3A35] group-hover:text-white"><Icon className="h-5 w-5" /></span>
                  <p className="mt-4 text-sm font-bold text-slate-900">{title}</p><p className="mt-1 text-xs text-slate-500">{detail}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'task' && selectedTask && (() => {
        const meta = getTaskMeta(selectedTask);
        const pct = selectedTask.totalSteps > 0 ? Math.round((selectedTask.completedSteps / selectedTask.totalSteps) * 100) : 0;
        const title = String(meta.title || selectedTask.steps[0]?.title || selectedTask.taskId);
        const taskStatus = pct === 100 ? 'Completed' : pct > 0 ? 'In Progress' : 'Assigned';
        const mediaFiles = selectedTask.steps.flatMap((step) => step.taskMedia);
        const uploadedVideos = mediaFiles.filter((url) => /\.(mp4|mov|webm|avi)(\?|$)/i.test(url)).length;
        const uploadedPhotos = mediaFiles.length - uploadedVideos;
        return (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-5 sm:px-6">
              <button type="button" onClick={() => setSelectedTask(null)} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-[#0D3A35]"><ChevronLeft className="h-4 w-4" /> Tasks</button>
              <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{selectedTask.taskId}</span><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-800">{taskStatus}</span></div><h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-500">{meta.landIds?.length ? `${meta.landIds.length} land parcel${meta.landIds.length === 1 ? '' : 's'}` : String(meta.locationId || 'No land selected')} · Due {meta.dueDate ? formatShortDate(String(meta.dueDate)) : '—'}</p></div>
                <div className="flex gap-2"><button className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600">On Hold</button><button className="h-10 rounded-xl bg-[#0D3A35] px-4 text-sm font-bold text-white">Submit</button><button className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"><MoreHorizontal className="h-4 w-4" /></button></div>
              </div>
            </div>
            <div className="border-b border-slate-200 px-4 pt-3 sm:px-6"><div className="flex gap-1 overflow-x-auto">{(['overview','steps','resources','evidence','activity'] as TaskWorkspaceSection[]).map((item) => <button key={item} type="button" onClick={() => setTaskWorkspaceSection(item)} className={cn('shrink-0 border-b-2 px-4 py-3 text-xs font-bold capitalize', taskWorkspaceSection === item ? 'border-[#0D3A35] text-[#0D3A35]' : 'border-transparent text-slate-400 hover:text-slate-700')}>{item}</button>)}</div></div>
            <div className="p-5 sm:p-6">
              {taskWorkspaceSection === 'overview' && <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]"><div className="rounded-2xl border border-slate-200 p-5"><div className="flex justify-between"><h3 className="font-bold text-slate-900">Progress</h3><span className="text-sm font-bold text-[#0D3A35]">{pct}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0D3A35]" style={{ width: `${pct}%` }} /></div><div className="mt-6 grid gap-4 sm:grid-cols-3">{[['Planned', selectedTask.totalSteps], ['Completed', selectedTask.completedSteps], ['Remaining', Math.max(selectedTask.totalSteps - selectedTask.completedSteps, 0)]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-xl font-semibold text-slate-900">{value}</p></div>)}</div></div><div className="rounded-2xl border border-slate-200 p-5"><h3 className="font-bold text-slate-900">Task Details</h3><dl className="mt-4 space-y-3 text-sm">{[['Owner', meta.owner || '—'], ['Executor', selectedTask.staffId], ['Supervisor', meta.supervisor || '—'], ['Verifier', meta.verifier || '—'], ['Lands', meta.landIds?.join(', ') || 'None selected'], ['Start', meta.plannedStart || '—'], ['Due', meta.dueDate || '—']].map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt className="text-slate-400">{label}</dt><dd className="max-w-[65%] text-right font-semibold text-slate-700">{value}</dd></div>)}</dl></div></div>}
              {taskWorkspaceSection === 'steps' && <div><div className="mb-4 flex items-center justify-between"><h3 className="font-bold text-slate-900">Steps</h3><span className="text-xs font-bold text-slate-500">{selectedTask.completedSteps} / {selectedTask.totalSteps} completed</span></div><div className="space-y-2">{selectedTask.steps.map((step) => <details key={step.key} className="group rounded-xl border border-slate-200 bg-white"><summary className="flex cursor-pointer list-none items-center gap-3 p-4"><span className={cn('flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold', step.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{step.status === 'completed' ? '✓' : step.stepNumber}</span><span className="flex-1 text-sm font-semibold text-slate-800">{step.title}</span><span className="text-[10px] font-bold uppercase text-slate-400">{step.status.replaceAll('_', ' ')}</span></summary><div className="border-t border-slate-100 p-4">{renderStepCard(step)}</div></details>)}</div></div>}
              {taskWorkspaceSection === 'resources' && <div className="grid gap-3 md:grid-cols-2">{[['Inventory','No inventory allocated'],['Equipment','Review task steps'],['Vehicle','Review task steps'],['Vendor',selectedTask.staffId]].map(([label,value]) => <div key={label} className="flex items-center justify-between rounded-xl border border-slate-200 p-4"><div><p className="text-sm font-bold text-slate-800">{label}</p><p className="mt-1 text-xs text-slate-500">{value}</p></div><button className="text-xs font-bold text-emerald-800">+ Allocate</button></div>)}</div>}
              {taskWorkspaceSection === 'evidence' && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{[[Camera,'Completion Photos',`${uploadedPhotos} uploaded · ${Number(meta.requiredPhotos || 0)} required`],[Video,'Completion Videos',`${uploadedVideos} uploaded · ${Number(meta.requiredVideos || 0)} required`],[MapPin,'GPS','Not captured'],[FileText,'Documents','No attachments']].map(([Icon,label,value]) => <div key={String(label)} className="rounded-xl border border-slate-200 p-4"><Icon className="h-5 w-5 text-[#0D3A35]" /><p className="mt-3 text-sm font-bold text-slate-800">{String(label)}</p><p className="mt-1 text-xs text-slate-500">{String(value)}</p></div>)}</div>}
              {taskWorkspaceSection === 'activity' && <div className="space-y-4 border-l-2 border-emerald-100 pl-5"><div><p className="text-xs font-bold text-slate-400">{selectedTask.createdAt}</p><p className="mt-1 text-sm text-slate-700">Task created and assigned to {selectedTask.staffId}</p></div>{selectedTask.steps.filter((step) => step.status === 'completed').map((step) => <div key={step.key}><p className="text-xs font-bold text-slate-400">Latest activity</p><p className="mt-1 text-sm text-slate-700">{step.title} completed</p></div>)}</div>}
            </div>
          </section>
        );
      })()}

      {/* ── On Demand Task tab ── */}
      {activeTab === 'task' && !selectedTask && (
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Task Register</h2>
            <p className="mt-0.5 text-xs text-slate-500">{ondemandTasks.length} task{ondemandTasks.length === 1 ? '' : 's'} across all operational categories</p>
          </div>
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800">Live workspace</span>
        </div>
        <div className="space-y-5 p-4 sm:p-6">

        {/* ── Inline task creator row ── */}
        {!isModalOpen ? (
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_repeat(2,180px)_auto]">
            <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} placeholder="Search tasks, IDs or assignees..." className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-[#0D3A35]" /></label>
            <select value={taskStatusFilter} onChange={(event) => setTaskStatusFilter(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600"><option value="all">All statuses</option><option value="to_do">To Do</option><option value="in_progress">In Progress</option><option value="completed">Completed</option></select>
            <select value={taskCategoryFilter} onChange={(event) => setTaskCategoryFilter(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600"><option value="all">All categories</option>{TASK_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <button type="button" onClick={() => setIsCreateChooserOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0D3A35] px-4 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Create Task</button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-emerald-900/20 bg-white shadow-xl shadow-emerald-950/10">
            {/* Creator header — title + compact designation/assignee selects + close */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-emerald-900/30 bg-[#0D3A35] px-5 py-4 text-white">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200">New operational task</p>
                <h3 className="mt-0.5 text-lg font-semibold">Create On Demand Task</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold">{createMode === 'quick' ? 'Quick Task' : 'Structured Task'}</span>
                <button onClick={closeModal} className="rounded-lg p-2 text-emerald-100 transition hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {createMode === 'quick' ? (
                <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 md:grid-cols-2">
                  <label className="md:col-span-2"><span className="text-xs font-bold text-slate-700">Task title *</span><input value={universalTask.title} onChange={(e) => updateUniversalTask({ title: e.target.value })} placeholder="e.g. Call vendor regarding pump quotation" className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0D3A35]" /></label>
                  <label><span className="text-xs font-bold text-slate-700">Category *</span><select value={universalTask.category} onChange={(e) => updateUniversalTask({ category: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">{TASK_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label><span className="text-xs font-bold text-slate-700">Priority *</span><select value={universalTask.priority} onChange={(e) => updateUniversalTask({ priority: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
                  <label><span className="text-xs font-bold text-slate-700">Designation *</span><select value={taskAssignment.designation} onChange={(e) => setTaskAssignment({ designation: e.target.value, staffId: '', staffName: '' })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Select designation</option>{designationOptions.map((value) => <option key={value} value={value}>{formatDesignationLabel(value)}</option>)}</select></label>
                  <label><span className="text-xs font-bold text-slate-700">Assign to *</span><select value={taskAssignment.staffId} disabled={!taskAssignment.designation} onChange={(e) => { const staffId = e.target.value; const matched = assigneeOptions.find((staff) => String(staff.staff_id || '') === staffId); setTaskAssignment((previous) => ({ ...previous, staffId, staffName: String(matched?.staff_information?.staff_name || '') })); }} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-100"><option value="">Select assignee</option>{assigneeOptions.map((staff) => <option key={String(staff.staff_id || '')} value={String(staff.staff_id || '')}>{staff.staff_information?.staff_name || 'Unknown'}</option>)}</select></label>
                  <label><span className="text-xs font-bold text-slate-700">Due date *</span><input type="date" value={universalTask.dueDate} onChange={(e) => updateUniversalTask({ dueDate: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" /></label>
                  <label><span className="text-xs font-bold text-slate-700">Related to</span><select value={universalTask.relatedTo} onChange={(e) => updateUniversalTask({ relatedTo: e.target.value, relatedId: '' })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">{['None','Purchase Requirement','Purchase Order','Work Order','GRN','WCC','Gate Entry','Land Parcel','Vendor','Vehicle','Equipment','Inventory Item','Employee','Cultivation Plan','Calendar Activity','Another Task','Other Document'].map((item) => <option key={item} value={item === 'Other Document' ? 'custom' : item.toLowerCase().replaceAll(' ', '_')}>{item}</option>)}</select></label>
                  <label><span className="text-xs font-bold text-slate-700">Related record</span>{renderRelatedRecordSelector()}</label>
                  <div className="md:col-span-2">{renderOptionalLandSelector()}</div>
                  <div className="md:col-span-2">
                    <div className="mb-2"><p className="text-xs font-bold text-slate-700">Completion evidence</p><p className="mt-0.5 text-[11px] text-slate-500">Ask the assignee to submit photos, video, or both before completing the task.</p></div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className={cn('rounded-xl border p-3 transition', universalTask.requiredPhotos > 0 ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-white')}>
                        <div className="flex items-center gap-3"><button type="button" onClick={() => updateUniversalTask({ requiredPhotos: universalTask.requiredPhotos > 0 ? 0 : 1 })} className={cn('flex h-10 w-10 items-center justify-center rounded-xl', universalTask.requiredPhotos > 0 ? 'bg-[#0D3A35] text-white' : 'bg-slate-100 text-slate-400')}><Camera className="h-5 w-5" /></button><button type="button" onClick={() => updateUniversalTask({ requiredPhotos: universalTask.requiredPhotos > 0 ? 0 : 1 })} className="flex-1 text-left"><span className="block text-sm font-bold text-slate-800">Require photos</span><span className="mt-0.5 block text-[11px] text-slate-500">Photo proof at completion</span></button>{universalTask.requiredPhotos > 0 && <label className="text-[10px] font-bold uppercase text-slate-400">Minimum<input type="number" min="1" max="20" value={universalTask.requiredPhotos} onChange={(event) => updateUniversalTask({ requiredPhotos: Math.max(1, Number(event.target.value) || 1) })} className="mt-1 block h-8 w-16 rounded-lg border border-emerald-200 bg-white px-2 text-center text-sm text-slate-700" /></label>}</div>
                      </div>
                      <div className={cn('rounded-xl border p-3 transition', universalTask.requiredVideos > 0 ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-white')}>
                        <div className="flex items-center gap-3"><button type="button" onClick={() => updateUniversalTask({ requiredVideos: universalTask.requiredVideos > 0 ? 0 : 1 })} className={cn('flex h-10 w-10 items-center justify-center rounded-xl', universalTask.requiredVideos > 0 ? 'bg-[#0D3A35] text-white' : 'bg-slate-100 text-slate-400')}><Video className="h-5 w-5" /></button><button type="button" onClick={() => updateUniversalTask({ requiredVideos: universalTask.requiredVideos > 0 ? 0 : 1 })} className="flex-1 text-left"><span className="block text-sm font-bold text-slate-800">Require video</span><span className="mt-0.5 block text-[11px] text-slate-500">Video proof at completion</span></button>{universalTask.requiredVideos > 0 && <label className="text-[10px] font-bold uppercase text-slate-400">Minimum<input type="number" min="1" max="5" value={universalTask.requiredVideos} onChange={(event) => updateUniversalTask({ requiredVideos: Math.max(1, Number(event.target.value) || 1) })} className="mt-1 block h-8 w-16 rounded-lg border border-emerald-200 bg-white px-2 text-center text-sm text-slate-700" /></label>}</div>
                      </div>
                    </div>
                  </div>
                  <label className="md:col-span-2"><span className="text-xs font-bold text-slate-700">Description</span><textarea value={universalTask.description} onChange={(e) => updateUniversalTask({ description: e.target.value })} rows={3} placeholder="Optional instructions or remarks" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0D3A35]" /></label>
                </div>
              ) : (
                <>
                  <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1.5">
                    {BUILDER_SECTIONS.map(([key, label], index) => (
                      <button key={key} type="button" onClick={() => setBuilderSection(key)} className={cn('shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition', builderSection === key ? 'bg-[#0D3A35] text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-slate-800')}><span className={cn('mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px]', builderSection === key ? 'bg-white/15' : 'bg-slate-200')}>{index + 1}</span>{label}</button>
                    ))}
                  </div>

                  {builderSection === 'details' && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="md:col-span-2"><span className="text-xs font-bold text-slate-700">Task title *</span><input value={universalTask.title} onChange={(e) => updateUniversalTask({ title: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" placeholder="What needs to be done?" /></label>
                      <label><span className="text-xs font-bold text-slate-700">Category *</span><select value={universalTask.category} onChange={(e) => updateUniversalTask({ category: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">{TASK_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                      <label><span className="text-xs font-bold text-slate-700">Priority *</span><select value={universalTask.priority} onChange={(e) => updateUniversalTask({ priority: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
                      <label><span className="text-xs font-bold text-slate-700">Planned start *</span><input type="date" value={universalTask.plannedStart} onChange={(e) => updateUniversalTask({ plannedStart: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
                      <label><span className="text-xs font-bold text-slate-700">Due date *</span><input type="date" value={universalTask.dueDate} onChange={(e) => updateUniversalTask({ dueDate: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
                      <label className="md:col-span-2"><span className="text-xs font-bold text-slate-700">Description *</span><textarea value={universalTask.description} onChange={(e) => updateUniversalTask({ description: e.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
                      <button type="button" onClick={() => setShowMoreDetails((value) => !value)} className="text-left text-xs font-bold text-emerald-800 md:col-span-2">{showMoreDetails ? '− Hide more details' : '+ More Details'}</button>
                      {showMoreDetails && <><label><span className="text-xs font-bold text-slate-700">Department</span><input value={universalTask.department} onChange={(e) => updateUniversalTask({ department: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label><label><span className="text-xs font-bold text-slate-700">Tags</span><input value={universalTask.tags} onChange={(e) => updateUniversalTask({ tags: e.target.value })} placeholder="farm, urgent, vendor" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label></>}
                    </div>
                  )}

                  {builderSection === 'details' && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <label><span className="text-xs font-bold text-slate-700">Related to</span><select value={universalTask.relatedTo} onChange={(e) => updateUniversalTask({ relatedTo: e.target.value, relatedId: '' })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">{['None','Land Parcel','Plot','Project','Site','Office','Warehouse','Vehicle','Equipment','Asset','Employee','Vendor','Purchase Request','Purchase Order','Work Order','GRN','WCC','Gate Entry','Bill','Inventory Item','Cultivation Plan','Calendar Activity','Another Task','Other Document'].map((item) => <option key={item} value={item === 'Other Document' ? 'custom' : item.toLowerCase().replaceAll(' ', '_')}>{item}</option>)}</select></label>
                      <label><span className="text-xs font-bold text-slate-700">Related record</span>{renderRelatedRecordSelector()}</label>
                      <label><span className="text-xs font-bold text-slate-700">Location type</span><select value={universalTask.locationType} onChange={(e) => updateUniversalTask({ locationType: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">{['No Location','Farm','Plot','Site','Office','Warehouse','Vendor Location','Customer Location','GPS Location','Other'].map((item) => <option key={item} value={item.toLowerCase().replaceAll(' ', '_')}>{item}</option>)}</select></label>
                      <label><span className="text-xs font-bold text-slate-700">Location / route</span><input value={universalTask.locationId} onChange={(e) => updateUniversalTask({ locationId: e.target.value })} placeholder="Location, source → destination, or GPS" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
                      <div className="md:col-span-2">{renderOptionalLandSelector()}</div>
                    </div>
                  )}

                  {builderSection === 'assignment' && (
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="md:col-span-3"><p className="text-xs font-bold text-slate-700">Execution by</p><div className="mt-2 flex flex-wrap gap-4">{['Employee','Team','Vendor'].map((item, index) => <label key={item} className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="radio" name="execution-by" defaultChecked={index === 0} className="accent-[#0D3A35]" /> {item}</label>)}</div></div>
                      <label><span className="text-xs font-bold text-slate-700">Designation *</span><select value={taskAssignment.designation} onChange={(e) => { setTaskAssignment({ designation: e.target.value, staffId: '', staffName: '' }); setTaskFlowSteps([]); }} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Select designation</option>{designationOptions.map((value) => <option key={value} value={value}>{formatDesignationLabel(value)}</option>)}</select></label>
                      <label><span className="text-xs font-bold text-slate-700">Executor *</span><select value={taskAssignment.staffId} disabled={!taskAssignment.designation} onChange={(e) => { const staffId = e.target.value; const matched = assigneeOptions.find((staff) => String(staff.staff_id || '') === staffId); setTaskAssignment((previous) => ({ ...previous, staffId, staffName: String(matched?.staff_information?.staff_name || '') })); setTaskFlowSteps([]); }} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-100"><option value="">Select executor</option>{assigneeOptions.map((staff) => <option key={String(staff.staff_id || '')} value={String(staff.staff_id || '')}>{staff.staff_information?.staff_name || 'Unknown'}</option>)}</select></label>
                      <label><span className="text-xs font-bold text-slate-700">Task owner</span><input value={universalTask.owner} onChange={(e) => updateUniversalTask({ owner: e.target.value })} placeholder="Accountable person" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
                      <label><span className="text-xs font-bold text-slate-700">Supervisor</span><input value={universalTask.supervisor} onChange={(e) => updateUniversalTask({ supervisor: e.target.value })} placeholder="Monitoring person" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
                      <label><span className="text-xs font-bold text-slate-700">Verifier</span><input value={universalTask.verifier} onChange={(e) => updateUniversalTask({ verifier: e.target.value })} placeholder="Completion verifier" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
                    </div>
                  )}

                  {builderSection === 'controls' && (
                    <div className="grid gap-3 md:grid-cols-4">
                      {['Inventory','Vehicle','Equipment','Manpower'].map((item) => <button key={item} type="button" onClick={() => setBuilderSection('work')} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:border-emerald-300 hover:bg-emerald-50"><p className="text-sm font-bold text-slate-800">{item}</p><span className="text-xs font-bold text-emerald-800">+ Add</span></button>)}
                    </div>
                  )}

                  {builderSection === 'controls' && (
                    <div className="grid gap-4 md:grid-cols-3">
                      <label><span className="text-xs font-bold text-slate-700">Approval mode</span><select value={universalTask.approvalMode} onChange={(e) => updateUniversalTask({ approvalMode: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="none">No Approval</option><option value="before_assignment">Before Assignment</option><option value="before_start">Before Start</option><option value="before_completion">Before Completion</option><option value="before_closure">Before Closure</option></select></label>
                      <label><span className="text-xs font-bold text-slate-700">Evidence rule</span><select value={universalTask.evidenceRule} onChange={(e) => updateUniversalTask({ evidenceRule: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="none">No additional evidence</option><option value="before_after">Before + After photos</option><option value="document">Document</option><option value="gps_photo">GPS + Photo</option><option value="signature">Signature</option><option value="verification">Supervisor verification</option></select></label>
                      <label><span className="text-xs font-bold text-slate-700">Recurrence</span><select value={universalTask.recurrence} onChange={(e) => updateUniversalTask({ recurrence: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="one_time">One Time</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom</option><option value="event">Event-Based</option></select></label>
                      <label><span className="text-xs font-bold text-slate-700">Minimum photos</span><div className="relative mt-1"><Camera className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="number" min="0" max="20" value={universalTask.requiredPhotos} onChange={(event) => updateUniversalTask({ requiredPhotos: Math.max(0, Number(event.target.value) || 0) })} className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm" /></div></label>
                      <label><span className="text-xs font-bold text-slate-700">Minimum videos</span><div className="relative mt-1"><Video className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="number" min="0" max="5" value={universalTask.requiredVideos} onChange={(event) => updateUniversalTask({ requiredVideos: Math.max(0, Number(event.target.value) || 0) })} className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm" /></div></label>
                      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-3"><input type="checkbox" checked={universalTask.verificationRequired} onChange={(event) => updateUniversalTask({ verificationRequired: event.target.checked })} className="h-4 w-4 accent-[#0D3A35]" /><span><span className="block text-xs font-bold text-slate-700">Verification required</span><span className="mt-0.5 block text-[11px] text-slate-500">Require verifier confirmation before closure.</span></span></label>
                    </div>
                  )}

                  {builderSection === 'review' && (
                    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
                      {[['Task', universalTask.title || 'Not entered'], ['Category', TASK_CATEGORIES.find(([value]) => value === universalTask.category)?.[1] || universalTask.category], ['Schedule', `${universalTask.plannedStart || '—'} → ${universalTask.dueDate || '—'}`], ['Executor', taskAssignment.staffName || 'Not selected'], ['Steps', String(taskFlowSteps.filter((step) => step.type).length)], ['Evidence', `${universalTask.requiredPhotos} photo(s) · ${universalTask.requiredVideos} video(s)`], ['Approval', universalTask.approvalMode.replaceAll('_', ' ')]].map(([label, value]) => <div key={label} className="rounded-lg bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold capitalize text-slate-800">{value}</p></div>)}
                    </div>
                  )}

                  {builderSection === 'work' && (<>
              <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-[160px_180px_1fr]">
                <label><span className="text-xs font-bold text-slate-700">Task Quantity</span><input type="number" min="0" value={universalTask.taskQuantity} onChange={(event) => updateUniversalTask({ taskQuantity: event.target.value })} placeholder="2" className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" /></label>
                <label><span className="text-xs font-bold text-slate-700">Unit</span><select value={universalTask.taskUnit} onChange={(event) => updateUniversalTask({ taskUnit: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option>Nos.</option><option>Acre</option><option>Kg</option><option>Litre</option><option>Hours</option><option>Feet</option></select></label>
                <label><span className="text-xs font-bold text-slate-700">Specification</span><input value={universalTask.specification} onChange={(event) => updateUniversalTask({ specification: event.target.value })} placeholder="e.g. Up to 250 feet depth" className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" /></label>
              </div>
              <div className="flex items-center justify-between"><div><h4 className="text-sm font-bold text-slate-900">Work Steps</h4><p className="mt-0.5 text-xs text-slate-500">Add instructions, responsibility and required evidence.</p></div><span className="text-xs font-semibold text-slate-400">{taskFlowSteps.length} step{taskFlowSteps.length === 1 ? '' : 's'}</span></div>
              {/* Steps rail — one by one: click the dashed "+" card to add the next step,
                  pick its type, and only that type's fields appear inside the card. */}
              <div className="overflow-x-auto pb-1">
                <div className="flex items-stretch gap-3 min-w-max">
                  {taskFlowSteps.length === 0 && (
                      <button
                        type="button"
                        onClick={addStep}
                        disabled={!canAddSteps}
                        title={canAddSteps ? 'Add a task' : 'Select a designation and assignee first'}
                        className={cn('flex w-[160px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-8 transition-colors', canAddSteps ? 'border-emerald-300 bg-emerald-50/50 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700' : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300')}
                      >
                        <Plus className="h-5 w-5" />
                        <span className="text-[11px] font-semibold">Add a task</span>
                      </button>
                    )}
                    {taskFlowSteps.map((step, index) => {
                      const meta = step.type ? taskStepTypeMeta[step.type] : null;
                      const selectedInventoryRows = Object.entries(step.details.inventoryItems).filter(([, qty]) => Number(qty) > 0).map(([itemId, qty]) => ({ itemId, qty: Number(qty), item: inventoryItems.find(it => getInventoryItemId(it) === itemId) }));
                      const selectedVehicles = step.details.vehicleIds.map(vid => vehicles.find(v => getVehicleId(v) === vid)).filter(Boolean);
                      const selectedLand = farms.find(f => String(f?.farm_id || f?.id || '') === step.details.landId);

                      return (
                        <div key={step.id} className="flex items-stretch gap-3">
                          <div className="flex w-[300px] shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                            {/* Step card header — mirrors the read-only step card style */}
                            <div className={cn('flex items-center justify-between gap-2 border-b px-3 py-2', meta ? `${meta.badge.split(' ')[2] || 'border-slate-200'}` : 'border-slate-100')}>
                              <div className="flex min-w-0 items-center gap-2">
                                <select
                                  value={step.type}
                                  onChange={e => {
                                    const nextType = e.target.value as TaskStepType;
                                    updateStep(step.id, { type: nextType });
                                    if (nextType) setStepFieldsPopupId(step.id);
                                  }}
                                  className={cn('min-w-0 shrink rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide focus:outline-none', meta?.badge || 'border-slate-200 bg-slate-100 text-slate-500')}
                                >
                                  <option value="">Select type</option>
                                  <option value="inventory">Inventory</option>
                                  <option value="logistics">Logistics</option>
                                  <option value="inspection">Inspection</option>
                                  <option value="on_field">On Field Task</option>
                                  <option value="other">Others</option>
                                </select>
                                <span className="shrink-0 text-[10px] font-semibold text-slate-400">#{step.stepNumber}</span>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                {step.type && (
                                  <span className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Draft</span>
                                )}
                                {taskFlowSteps.length > 1 && (
                                  <button type="button" onClick={() => removeStep(step.id)} title="Remove step" className="rounded-md p-0.5 text-red-400 hover:bg-red-50 hover:text-red-600">
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Step card body — compact summary; clicking it reopens the popup to edit this step's fields */}
                            <div className="flex-1 p-3">
                              <p className="mb-2 truncate text-sm font-bold text-slate-900">{step.details.title || `Step ${step.stepNumber}`}</p>
                              {step.type ? (
                                <button
                                  type="button"
                                  onClick={() => setStepFieldsPopupId(step.id)}
                                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-left text-[11px] text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100"
                                >
                                  {step.type === 'inventory' && (selectedInventoryRows.length > 0
                                    ? `${selectedInventoryRows.length} item${selectedInventoryRows.length !== 1 ? 's' : ''} selected · Allocation: ${step.details.allocationNeeded ? 'Yes' : 'No'}`
                                    : 'No items selected yet — click to configure')}
                                  {step.type === 'logistics' && (selectedVehicles.length > 0
                                    ? `${selectedVehicles.length} vehicle${selectedVehicles.length !== 1 ? 's' : ''} selected`
                                    : 'No vehicles selected yet — click to configure')}
                                  {step.type === 'inspection' && (step.details.inspectionFields.length > 0
                                    ? `${step.details.inspectionFields.length} field${step.details.inspectionFields.length !== 1 ? 's' : ''} defined`
                                    : 'No fields yet — click to configure')}
                                  {step.type === 'on_field' && (step.details.vendorId
                                    ? (() => {
                                        const selectedLineItemCount = Object.values(step.details.onFieldLineItemQuantities).filter(qty => Number(qty || 0) > 0).length;
                                        const activitySummary = step.details.onFieldActivity
                                          ? step.details.onFieldActivity
                                          : selectedLineItemCount > 0 ? `${selectedLineItemCount} line item${selectedLineItemCount !== 1 ? 's' : ''}` : '';
                                        return `${selectedLand?.land_data?.village || 'Farm'} · ${step.details.vendorName || 'Vendor'}${activitySummary ? ` · ${activitySummary}` : ''}`;
                                      })()
                                    : step.details.landId ? 'Choose a vendor — click to configure' : 'Not configured yet — click to configure')}
                                  {step.type === 'other' && (step.details.otherDescription ? step.details.otherDescription : 'No description yet — click to configure')}
                                </button>
                              ) : (
                                <p className="text-xs italic text-slate-400">Choose a type above to configure this step.</p>
                              )}
                            </div>
                          </div>

                          {/* Field popup — opens on type selection or when the summary above is clicked */}
                              {step.type && stepFieldsPopupId === step.id && (
                                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={() => setStepFieldsPopupId(null)}>
                                <div className={cn('flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.22)]', step.type === 'inventory' && step.details.allocationNeeded ? 'max-w-4xl' : 'max-w-2xl')} onClick={e => e.stopPropagation()}>
                                <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5">
                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Step {step.stepNumber}</p>
                                    <h4 className="text-base font-semibold text-slate-900">{meta?.label || 'Task'} details</h4>
                                  </div>
                                  <button type="button" onClick={() => setStepFieldsPopupId(null)} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50"><X className="h-4 w-4" /></button>
                                </div>
                                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                                  <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-2">
                                    <label className="md:col-span-2"><span className="text-xs font-bold text-slate-700">Step name</span><input value={step.details.title} onChange={(event) => updateStepDetails(step.id, { title: event.target.value })} placeholder="e.g. Borewell drilling" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
                                    <label className="md:col-span-2"><span className="text-xs font-bold text-slate-700">Instructions</span><textarea value={step.details.notes} onChange={(event) => updateStepDetails(step.id, { notes: event.target.value })} rows={2} placeholder="What must be completed in this step?" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
                                    <label><span className="text-xs font-bold text-slate-700">Assigned designation</span><select value={step.details.assigneeDesignation} onChange={(event) => updateStepDetails(step.id, { assigneeDesignation: event.target.value, assignee: '' })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Use task executor</option>{designationOptions.map((value) => <option key={value} value={value}>{formatDesignationLabel(value)}</option>)}</select></label>
                                    <label><span className="text-xs font-bold text-slate-700">Assigned to</span><select value={step.details.assignee} disabled={!step.details.assigneeDesignation} onChange={(event) => updateStepDetails(step.id, { assignee: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-100"><option value="">Use task executor</option>{(staffByDesignation[step.details.assigneeDesignation] || []).map((staff) => <option key={String(staff.staff_id || '')} value={String(staff.staff_id || '')}>{staff.staff_information?.staff_name || 'Unknown'}</option>)}</select></label>
                                  </div>
                                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                    <p className="text-xs font-bold text-slate-900">What does this step require?</p>
                                    <p className="mt-0.5 text-[11px] text-slate-500">Select every capability needed for this step. The primary workflow below keeps the legacy API compatible.</p>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                      {STEP_CAPABILITIES.map((capability) => {
                                        const checked = step.details.capabilities.includes(capability);
                                        return <label key={capability} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition', checked ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600')}><input type="checkbox" checked={checked} onChange={() => updateStepDetails(step.id, { capabilities: checked ? step.details.capabilities.filter((item) => item !== capability) : [...step.details.capabilities, capability] })} className="accent-emerald-700" />{capability}</label>;
                                      })}
                                    </div>
                                  </div>
                                  {/* Inventory */}
                                  {step.type === 'inventory' && (
                                    <div className="space-y-3">
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

                                      <div className={cn(step.details.allocationNeeded && 'grid grid-cols-2 gap-4')}>
                                        {/* Left — item selection for the task itself */}
                                        <div className="space-y-2">
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

                                        {/* Right — allocate the items above to farms/lands, only when allocation is needed */}
                                        {step.details.allocationNeeded && (() => {
                                          const alloc = stepAllocation[step.id] || { farms: [], distribution: {}, farmSelector: '' };
                                          const availableFarms = farms.filter((f: any) => !alloc.farms.includes(String(f?.farm_id || '')));
                                          return (
                                            <div className="space-y-2 border-l border-slate-200 pl-4">
                                              <p className="text-xs font-semibold text-slate-900">Allocate to lands</p>
                                              <p className="text-[11px] text-slate-500">Add the lands receiving these items, then split each item's quantity across them.</p>
                                              {selectedInventoryRows.length === 0 ? (
                                                <p className="text-[11px] italic text-slate-400">Select items on the left first.</p>
                                              ) : (
                                                <>
                                                  <div className="flex items-center gap-1.5">
                                                    <select
                                                      value={alloc.farmSelector}
                                                      onChange={e => setAllocationFarmSelector(step.id, e.target.value)}
                                                      className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-slate-900 focus:outline-none"
                                                    >
                                                      <option value="">+ Add land</option>
                                                      {availableFarms.map((f: any) => (
                                                        <option key={f.farm_id} value={f.farm_id}>{f?.owner_name || f?.farm_id}{f?.area ? ` (${f.area}ac)` : ''}</option>
                                                      ))}
                                                    </select>
                                                    <button type="button" disabled={!alloc.farmSelector} onClick={() => addAllocationFarm(step.id)} className="shrink-0 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">
                                                      Add
                                                    </button>
                                                  </div>

                                                  {alloc.farms.length === 0 ? (
                                                    <p className="text-[11px] italic text-slate-400">Add a land above to start distributing.</p>
                                                  ) : (
                                                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                                                      <table className="w-full text-[11px]">
                                                        <thead>
                                                          <tr className="bg-slate-50">
                                                            <th className="px-2 py-1.5 text-left font-semibold text-slate-500">Land</th>
                                                            {selectedInventoryRows.map(({ itemId, qty, item }) => {
                                                              const allocated = alloc.farms.reduce((sum, fid) => sum + (Number(alloc.distribution[itemId]?.[fid]) || 0), 0);
                                                              return (
                                                                <th key={itemId} className="px-2 py-1.5 text-right font-semibold text-slate-500">
                                                                  <div className="max-w-[80px] truncate" title={item ? getInventoryItemName(item) : itemId}>{item ? getInventoryItemName(item) : itemId}</div>
                                                                  <div className={cn('text-[10px] font-normal', allocated > qty ? 'text-red-500' : 'text-slate-400')}>{allocated}/{qty}</div>
                                                                </th>
                                                              );
                                                            })}
                                                          </tr>
                                                        </thead>
                                                        <tbody>
                                                          {alloc.farms.map(farmId => {
                                                            const farm = farms.find((f: any) => String(f?.farm_id || '') === farmId);
                                                            return (
                                                              <tr key={farmId} className="border-t border-slate-100">
                                                                <td className="px-2 py-1.5">
                                                                  <div className="flex items-center justify-between gap-1">
                                                                    <div className="min-w-0">
                                                                      <div className="max-w-[90px] truncate font-medium text-slate-900" title={farm?.owner_name || farmId}>{farm?.owner_name || farmId}</div>
                                                                      {farm?.area != null && <div className="text-[10px] text-slate-400">{farm.area}ac</div>}
                                                                    </div>
                                                                    <button type="button" onClick={() => removeAllocationFarm(step.id, farmId)} title="Remove land" className="shrink-0 text-slate-300 hover:text-red-500">×</button>
                                                                  </div>
                                                                </td>
                                                                {selectedInventoryRows.map(({ itemId }) => (
                                                                  <td key={itemId} className="px-2 py-1.5 text-right">
                                                                    <input
                                                                      type="number"
                                                                      min="0"
                                                                      value={alloc.distribution[itemId]?.[farmId] || ''}
                                                                      onChange={e => updateAllocationQty(step.id, itemId, farmId, e.target.value)}
                                                                      className="w-14 rounded border border-slate-200 px-1 py-1 text-right text-[11px] focus:border-slate-900 focus:outline-none"
                                                                    />
                                                                  </td>
                                                                ))}
                                                              </tr>
                                                            );
                                                          })}
                                                        </tbody>
                                                      </table>
                                                    </div>
                                                  )}
                                                </>
                                              )}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  )}

                                  {/* Logistics — its own step, or an add-on attached to an inventory step */}
                                  {(step.type === 'logistics' || (step.type === 'inventory' && step.details.includeLogistics)) && (
                                    <div className={cn('space-y-2', step.type === 'inventory' && 'border-t border-slate-100 pt-3')}>
                                      {step.type === 'inventory' && (
                                        <div className="flex items-center justify-between">
                                          <p className="text-xs font-semibold text-slate-900">Logistics — transport these items</p>
                                          <button type="button" onClick={() => updateStepDetails(step.id, { includeLogistics: false })} className="text-[11px] font-medium text-red-500 hover:underline">Remove</button>
                                        </div>
                                      )}
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

                                  {/* On Field Task — its own step, or an add-on attached to an inventory step */}
                                  {(step.type === 'on_field' || (step.type === 'inventory' && step.details.includeOnField)) && (() => {
                                    const scope = scopeByStep[step.id] || {};
                                    const scopeVendorIds = Object.keys(scope);
                                    const selectedScope = step.details.vendorId ? scope[step.details.vendorId] : undefined;
                                    const plots = plotsByStep[step.id] || [];
                                    const excludedPlotIds = excludedPlotsByStep[step.id] || [];
                                    const activePlots = plots.filter(p => !excludedPlotIds.includes(p.plot_id));
                                    const excludedPlots = plots.filter(p => excludedPlotIds.includes(p.plot_id));
                                    const calendars = calendarsByStep[step.id] || [];
                                    const activeVendorOrders = activeOrdersByStep[step.id] || [];
                                    const orderItems = orderItemsByStep[step.id] || {};
                                    const selectedOrderItems = step.details.onFieldOrderNumber ? (orderItems[step.details.onFieldOrderNumber] || []) : [];
                                    // Self has no Work Order — falls back to the generic activity list. A real vendor's
                                    // activities always come from its selected WO's line items, so a task can only be
                                    // matched to a WCC line item it actually corresponds to.
                                    const activityOptions = step.details.vendorId && step.details.vendorId !== SELF_VENDOR_ID
                                      ? selectedOrderItems.map(item => item.name).filter(Boolean)
                                      : cultivationActivityOptions;
                                    const schedule = computePlotSchedule(activePlots, step.details.onFieldStartDate, Number(step.details.onFieldWorkQuantity) || 0);
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
                                      <div className={cn('space-y-2', step.type === 'inventory' && 'border-t border-slate-100 pt-3')}>
                                        {step.type === 'inventory' && (
                                          <div className="flex items-center justify-between">
                                            <p className="text-xs font-semibold text-slate-900">On field task — what these items are for</p>
                                            <button type="button" onClick={() => updateStepDetails(step.id, { includeOnField: false })} className="text-[11px] font-medium text-red-500 hover:underline">Remove</button>
                                          </div>
                                        )}
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

                                        {step.details.landId && (
                                          <div className="space-y-1">
                                            {scopeLoadingByStep[step.id] ? (
                                              <p className="text-[11px] text-slate-400 italic">Loading vendors…</p>
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
                                                <button
                                                  type="button"
                                                  onClick={() => handleOnFieldVendorChange(step.id, step.details.landId, SELF_VENDOR_ID, 'Self', step.details.onFieldMode)}
                                                  className={cn('rounded-full border border-dashed px-2.5 py-1 text-[11px] font-semibold transition-colors', step.details.vendorId === SELF_VENDOR_ID ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50')}
                                                >
                                                  Self
                                                </button>
                                              </div>
                                            )}
                                            {!scopeLoadingByStep[step.id] && scopeVendorIds.length === 0 && (
                                              <p className="text-[11px] text-slate-400 italic">No vendor scope for this land — assign one in Scope of Work, or select Self.</p>
                                            )}
                                            {selectedScope && selectedScope.activities?.length > 0 && step.details.onFieldMode === 'cultivation' && (
                                              <div className="flex flex-wrap gap-1">
                                                {selectedScope.activities.map(a => <span key={a} className="text-[10px] px-1.5 py-0.5 bg-lime-100 text-lime-800 border border-lime-200 rounded font-medium">{a}</span>)}
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {step.details.vendorId && step.details.vendorId !== SELF_VENDOR_ID && (
                                          <div>
                                            {activeOrdersLoadingByStep[step.id] ? (
                                              <p className="text-[11px] text-slate-400 italic">Loading work orders…</p>
                                            ) : activeVendorOrders.length === 0 ? (
                                              <p className="text-[11px] text-amber-600 italic">No active Work Order found for this vendor — activities can't be selected until one exists.</p>
                                            ) : (
                                              <select
                                                value={step.details.onFieldOrderNumber}
                                                onChange={e => updateStepDetails(step.id, { onFieldOrderNumber: e.target.value, onFieldActivity: '', onFieldLineItemQuantities: {}, onFieldUnit: '' })}
                                                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-slate-900 focus:outline-none"
                                              >
                                                <option value="">Select Work Order</option>
                                                {activeVendorOrders.map(orderNumber => <option key={orderNumber} value={orderNumber}>{orderNumber}</option>)}
                                              </select>
                                            )}
                                          </div>
                                        )}

                                        {step.details.vendorId && step.details.onFieldMode === 'cultivation' && (
                                          <div className="grid grid-cols-3 gap-1.5">
                                            <select value={step.details.onFieldActivity} onChange={e => updateStepDetails(step.id, { onFieldActivity: e.target.value })} disabled={activityOptions.length === 0} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-slate-900 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100">
                                              <option value="">Activity</option>
                                              {activityOptions.map(a => <option key={a} value={a}>{a}</option>)}
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
                                              <p className="mt-1 text-[11px] text-slate-400 italic">
                                                {step.details.vendorId === SELF_VENDOR_ID ? 'Plot-level scheduling isn\'t available for Self — set the date and quantity above.' : "No plots found for this vendor's scope on this land."}
                                              </p>
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

                                        {step.details.vendorId && step.details.onFieldMode === 'non_cultivation' && (
                                          <div className="space-y-2">
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

                                            {step.details.vendorId !== SELF_VENDOR_ID ? (
                                              <div>
                                                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Line items — set the quantity done for each</label>
                                                {activeOrdersLoadingByStep[step.id] ? (
                                                  <p className="mt-1 text-[11px] text-slate-400 italic">Loading work order…</p>
                                                ) : !step.details.onFieldOrderNumber ? (
                                                  <p className="mt-1 text-[11px] text-slate-400 italic">Select a Work Order above to see its line items.</p>
                                                ) : selectedOrderItems.length === 0 ? (
                                                  <p className="mt-1 text-[11px] text-slate-400 italic">This Work Order has no line items.</p>
                                                ) : (
                                                  <div className="mt-1 overflow-hidden rounded-md border border-slate-200 bg-white">
                                                    <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                                      <div>Activity</div><div className="text-right">UOM</div><div className="text-right">Rate</div><div className="text-right">Quantity</div>
                                                    </div>
                                                    <div className="divide-y divide-slate-100">
                                                      {selectedOrderItems.map(item => (
                                                        <div key={item.name} className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center gap-2 px-2 py-1 text-[11px]">
                                                          <span className="truncate font-medium text-slate-900" title={item.name}>{item.name}</span>
                                                          <span className="text-right text-slate-600">{item.uom}</span>
                                                          <span className="text-right text-slate-600">{item.unit_rate}</span>
                                                          <input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={step.details.onFieldLineItemQuantities[item.name] || ''}
                                                            onChange={e => updateStepDetails(step.id, { onFieldLineItemQuantities: { ...step.details.onFieldLineItemQuantities, [item.name]: e.target.value } })}
                                                            placeholder="0"
                                                            className="w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-right text-xs focus:border-slate-900 focus:outline-none"
                                                          />
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            ) : (
                                              <div>
                                                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Task / activity</label>
                                                <select value={step.details.onFieldActivity} onChange={e => updateStepDetails(step.id, { onFieldActivity: e.target.value })} className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-slate-900 focus:outline-none">
                                                  <option value="">Choose task</option>
                                                  {cultivationActivityOptions.map(a => <option key={a} value={a}>{a}</option>)}
                                                </select>
                                                <div className="mt-1.5 rounded-md border border-slate-200 bg-slate-50 p-2 space-y-1.5">
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
                                <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5 py-3">
                                  <div className="flex items-center gap-2">
                                    {step.type === 'inventory' && (
                                      <>
                                        {!step.details.includeLogistics && (
                                          <button type="button" onClick={() => updateStepDetails(step.id, { includeLogistics: true })} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100">
                                            + Add logistics
                                          </button>
                                        )}
                                        {!step.details.includeOnField && (
                                          <button type="button" onClick={() => updateStepDetails(step.id, { includeOnField: true })} className="rounded-lg border border-lime-200 bg-lime-50 px-3 py-2 text-xs font-medium text-lime-700 hover:bg-lime-100">
                                            + Add on field task
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                  <button type="button" onClick={() => setStepFieldsPopupId(null)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Done</button>
                                </div>
                                </div>
                                </div>
                              )}
                          {index === taskFlowSteps.length - 1 && (
                            <button
                              type="button"
                              onClick={addStep}
                              disabled={!canAddSteps}
                              title="Add another step"
                              className={cn('flex w-[120px] shrink-0 flex-col items-center justify-center gap-1.5 self-stretch rounded-xl border-2 border-dashed transition-colors', canAddSteps ? 'border-emerald-300 bg-emerald-50/50 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700' : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300')}
                            >
                              <Plus className="h-5 w-5" />
                              <span className="text-[11px] font-semibold">Add step</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                  </>)}
                </>
              )}
            </div>

            {/* Creator footer */}
            <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50/80 px-5 py-4">
              {createMode !== 'quick' && <button type="button" onClick={handleSaveDraft} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 hover:bg-slate-100"><Save className="h-4 w-4" /> Save Draft</button>}
              <button type="button" onClick={closeModal} className="ml-auto h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-100">
                Cancel
              </button>
              <button type="button" onClick={createMode === 'quick' ? handleCreateQuickTask : handleAssignTask} disabled={isCreatingTask} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0D3A35] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#164E46] disabled:opacity-50">
                <UserCheck className="h-4 w-4" />
                {isCreatingTask ? 'Creating...' : createMode === 'quick' ? 'Create Quick Task' : 'Create & Assign'}
              </button>
            </div>
          </div>
        )}

        {ondemandTasksLoading ? <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">Loading tasks...</div> : ondemandTasksError ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{ondemandTasksError}</div> : filteredTasks.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">No tasks match the selected filters.</div> : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[920px] border-collapse text-left">
              <thead><tr className="bg-[#0D3A35] text-white">{['Task','Category','Location','Assigned To','Due','Status','Progress'].map((heading) => <th key={heading} className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.12em]">{heading}</th>)}</tr></thead>
              <tbody>{filteredTasks.map((task) => { const meta = getTaskMeta(task); const pct = task.totalSteps > 0 ? Math.round((task.completedSteps / task.totalSteps) * 100) : 0; const isDone = pct === 100; const title = String(meta.title || task.steps[0]?.title || task.taskId); const category = TASK_CATEGORIES.find(([value]) => value === meta.category)?.[1] || String(meta.category || 'General'); return <tr key={task.taskId} onClick={() => { setSelectedTask(task); setTaskWorkspaceSection('overview'); }} className="cursor-pointer border-b border-slate-100 transition last:border-0 hover:bg-emerald-50/40"><td className="px-4 py-4"><p className="text-sm font-bold text-slate-900">{title}</p><p className="mt-1 text-[10px] font-semibold text-slate-400">{task.taskId}</p></td><td className="px-4 py-4 text-sm text-slate-600">{category}</td><td className="px-4 py-4 text-sm text-slate-600">{String(meta.locationId || '—')}</td><td className="px-4 py-4 text-sm font-semibold text-slate-700">{task.staffId}</td><td className="px-4 py-4 text-sm text-slate-600">{meta.dueDate ? formatShortDate(String(meta.dueDate)) : '—'}</td><td className="px-4 py-4"><span className={cn('rounded-full px-2.5 py-1 text-[10px] font-bold uppercase', isDone ? 'bg-emerald-100 text-emerald-700' : pct > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600')}>{isDone ? 'Completed' : pct > 0 ? 'In Progress' : 'Assigned'}</span></td><td className="px-4 py-4"><div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0D3A35]" style={{ width: `${pct}%` }} /></div><span className="text-xs font-bold text-slate-500">{pct}%</span></div></td></tr>; })}</tbody>
            </table>
          </div>
        )}
        </div>
      </section>
      )}

      {activeTab === 'templates' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-bold text-slate-900">Task Templates</h2><p className="mt-1 text-sm text-slate-500">Reusable starting points with editable steps, evidence and resources.</p></div>
            <button type="button" onClick={() => { setActiveTab('task'); void openModal('structured'); }} className="h-10 rounded-xl bg-[#0D3A35] px-4 text-sm font-bold text-white shadow-sm hover:bg-[#164E46]">+ Blank Structured Task</button>
          </div>
          <div className="mt-5 flex flex-col gap-3 border-y border-slate-100 py-4 lg:flex-row lg:items-center lg:justify-between"><label className="relative w-full lg:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={templateSearch} onChange={(event) => setTemplateSearch(event.target.value)} placeholder="Search templates..." className="h-10 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-sm outline-none focus:border-[#0D3A35]" /></label><div className="flex flex-wrap gap-1">{[['all','All'],['field_operations','Field'],['inspection','Inspection'],['inventory','Inventory'],['maintenance','Maintenance']].map(([value,label]) => <button key={value} type="button" onClick={() => setTemplateCategory(value)} className={cn('rounded-lg px-3 py-2 text-xs font-bold', templateCategory === value ? 'bg-[#0D3A35] text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-800')}>{label}</button>)}</div></div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {UNIVERSAL_TASK_TEMPLATES.filter((template) => (templateCategory === 'all' || template.category === templateCategory) && (!templateSearch.trim() || `${template.name} ${template.description}`.toLowerCase().includes(templateSearch.trim().toLowerCase()))).map((template) => (
              <article key={template.id} className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-5 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/30 hover:shadow-md">
                <div className="flex items-start justify-between gap-3"><span className="rounded-lg bg-[#0D3A35] p-2 text-white"><Save className="h-4 w-4" /></span><span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase text-slate-500">{template.priority}</span></div>
                <h3 className="mt-4 font-bold text-slate-900">{template.name}</h3>
                <p className="mt-2 flex-1 text-xs leading-5 text-slate-500">{template.description}</p>
                <p className="mt-3 text-[11px] font-semibold text-slate-500">{template.steps.length} default step{template.steps.length === 1 ? '' : 's'} · {TASK_CATEGORIES.find(([value]) => value === template.category)?.[1]}</p>
                <button type="button" onClick={() => applyTaskTemplate(template)} className="mt-4 rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50">Use Template</button>
              </article>
            ))}
          </div>
        </section>
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
                          onClick={() => { setStoreSplits({}); setLockConfirmTarget({ taskId: task.task_id, stepsDict: task.steps_dict, allocationSchema: task.allocation_schema, createdAt: task.created_at, staffId: task.staff_id }); }}
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
                                  <button type="button" onClick={() => setApiAllocFarms(prev => ({ ...prev, [task.task_id]: currentFarms.filter(f => f !== farmId) }))} className="shrink-0 text-slate-300 hover:text-red-500 transition-colors text-sm font-bold">×</button>
                                </div>
                              </th>
                              );
                            })}
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
                                  onClick={() => { setStoreSplits({}); setLockConfirmTarget({ taskId: alloc.task_id, stepsDict: alloc.steps_dict ?? {}, allocationSchema: alloc.allocation_schema, createdAt: alloc.created_at, staffId: alloc.staff_id }); }}
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

                {/* Store-wise allocation — required before locking, since stock is now debited
                    per-store (dissociation[store].LIFO) rather than the item's shared fifo_list. */}
                {(() => {
                  const rowsToRender = allocItems.flatMap(([productId, item]) =>
                    farmIdsNeedingSplitFor(target, productId, item).map((farmId) => ({
                      productId,
                      item,
                      farmId,
                      needed: neededQtyFor(target, productId, item, farmId),
                    })),
                  );
                  return (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Store-wise Allocation</p>
                      {rowsToRender.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No farm quantities set yet — nothing to allocate to stores.</p>
                      ) : (
                        <div className="space-y-3">
                          {rowsToRender.map(({ productId, item, farmId, needed }) => {
                            const rows = getStoreSplitRows(productId, farmId);
                            const allocated = getStoreSplitTotal(productId, farmId);
                            const matches = Math.abs(allocated - needed) <= 0.001;
                            const storeOptions = getItemDissociationStores(productId);
                            return (
                              <div key={`${productId}::${farmId}`} className="rounded-lg border border-slate-200 p-3">
                                <div className="flex items-center justify-between gap-3 mb-2">
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-slate-800 truncate">{item.item_name || productId} → {getFarmName(farmId)}</p>
                                    <p className="text-[10px] text-slate-400">Needed: {needed} {item.unit}</p>
                                  </div>
                                  <span className={cn(
                                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                    matches ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                                  )}>
                                    Allocated: {allocated} / {needed}
                                  </span>
                                </div>
                                <div className="space-y-1.5">
                                  {rows.map((row, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                      <select
                                        value={row.store}
                                        onChange={(e) => updateStoreSplitRow(productId, farmId, idx, { store: e.target.value })}
                                        className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 focus:outline-none focus:border-green-500"
                                      >
                                        <option value="">Select store…</option>
                                        {storeOptions.map((store) => (
                                          <option key={store} value={store}>{store}</option>
                                        ))}
                                      </select>
                                      <input
                                        type="number"
                                        min="0"
                                        value={row.quantity}
                                        onChange={(e) => updateStoreSplitRow(productId, farmId, idx, { quantity: e.target.value })}
                                        placeholder="Qty"
                                        className="w-24 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-right text-slate-700 focus:outline-none focus:border-green-500"
                                      />
                                      <button type="button" onClick={() => removeStoreSplitRow(productId, farmId, idx)} className="shrink-0 text-slate-300 hover:text-red-500 text-sm font-bold">×</button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => addStoreSplitRow(productId, farmId)}
                                    className="text-[11px] font-medium text-green-700 hover:underline"
                                  >
                                    + Add store
                                  </button>
                                  {storeOptions.length === 0 && (
                                    <p className="text-[10px] text-amber-600">No stores currently hold stock for this item.</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

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
                  onClick={() => handleConfirmLockWithStores(target)}
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
