import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
Calendar as CalendarIcon,
ChevronDown,
ChevronRight,
Trash2,
X,
Plus,
Shovel,
Tractor,
Droplets,
Leaf,
ClipboardList,
Wheat,
Truck,
CheckCircle2,
Watch,
Wrench,
Minus,
Hash,
MapPin,
Eye,
ListChecks,
Check,
Monitor,
User,
FileText,
Map as MapIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';
import { getFarmerNames } from '@/lib/farmerNameCache';
import { toast } from 'sonner';

// ✅ Import the Sidebar
import { SidebarTask } from '@/components/cultivation/TaskSidebar';
import { InlineTimeline } from '@/components/cultivation/InlineTimeline';
import TaskMonitorModal, { MonitorTask } from '@/components/cultivation/TaskMonitorModal';
import PlotMapViewModal, { MapViewTask } from '@/components/cultivation/PlotMapViewModal';

// --- Types ---
interface PlotItem {
plot_id: string;
plot_name: string;
plot_area: number;
}

interface ApiActivity {
index: number;
activity: string;
crop_type?: string;
field_assignment: {
[date: string]: Array<{
farm_id: string;
assigned_area: number;
status?: string;
plot?: PlotItem[];
task_id?: string;
}>;
};
}

interface ApiPlan {
plan_id: string;
block_id: string;
date_mapping: ApiActivity[];
}

interface ApiResponse {
plan: {
[key: string]: ApiPlan;
};
}

interface ApiFarm {
created_at: string;
area: number;
harvest_log: Record<string, unknown>;
block_id: string;
priority: number;
land_data: {
farming_option: string;
state: string;
village: string;
district: string;
};
farmer_id: string;
farm_id: string;
}

interface FarmsResponse {
farms: ApiFarm[];
}

interface CalendarActivity {
index: number;
activity: string;
crop_type?: string;
block_id: string;
plan_id: string;
calander_id: string;
farm_id: string;
assignments: Array<{
farm_id: string;
assigned_area: number;
status?: string;
plot?: PlotItem[];
task_id?: string;
}>;
}

interface CalendarData {
[date: string]: CalendarActivity[];
}

// Rows configured in Operations Master → Dosage Control (src/modules/CultivationMasterModule.tsx),
// persisted to the same localStorage key. Read-only here — used to populate the "Choose Item" step.
type DosageControlRowLite = {
id: string;
cropName: string;
activityId: string;
inventoryItemId: string;
uom: string;
dosagePerAcre: string;
};
const DOSAGE_CONTROLS_STORAGE_KEY = 'operations-master-dosage-controls';

interface VendorScopeEntry {
vendor_details: { vendor_name: string; vendor_contact: string };
activities: string[];
start_date: string;
end_date: string;
}

// --- Asset Types (Self Work: vehicles + equipment) ---
interface Asset {
id: string;
name: string;
type: string;
category: 'Vehicle' | 'Equipment';
schedule: Record<string, number>;
}

type ApiVehicle = {
servise_history?: any[];
fuel_logs?: any[];
created_at?: string;
work_calandar?: any[] | Record<string, any> | null;
vehicle_information?: {
owned_by?: string;
company?: string;
model?: string;
type?: string;
last_service_date?: string;
vehicle_number?: string;
};
vehicle_id: string;
assigned_staff?: any;
};

type ApiInventoryItem = {
last_updated?: string;
unit?: string;
threshold?: number;
Invent_id?: string;
category?: string;
stock?: number;
item?: string;
item_name?: string;
name?: string;
id?: string;
};

type InventoryItemsResponse = {
inventory_items?: ApiInventoryItem[];
};

type FarmsById = Record<string, ApiFarm>;
type PendingByDate = Record<string, Record<string, boolean>>;

// --- Helper Functions ---
const normalizeAssignmentStatus = (raw?: string) => {
const s = String(raw || '').trim().toLowerCase();
if (!s) return 'unassigned';
if (s === 'unaasigned') return 'unassigned';
return s;
};

const isContractFarmPendingAssignmentStatus = (raw?: string) => normalizeAssignmentStatus(raw) === 'contract_farm_pending';
const isContractFarmCompletedAssignmentStatus = (raw?: string) => normalizeAssignmentStatus(raw) === 'contract_farm_completed';
const isContractFarmAssignmentStatus = (raw?: string) => {
const s = normalizeAssignmentStatus(raw);
return s === 'contract_farm' || s === 'contract_farm_pending' || s === 'contract_farm_completed';
};

const isRentalSendWorkorderAssignmentStatus = (raw?: string) => normalizeAssignmentStatus(raw) === 'rental_send_workorder';
const isRentalPendingAssignmentStatus = (raw?: string) => normalizeAssignmentStatus(raw) === 'rental_pending';
const isRentalCompletedAssignmentStatus = (raw?: string) => normalizeAssignmentStatus(raw) === 'rental_completed';
const isRentalAssignmentStatus = (raw?: string) => {
const s = normalizeAssignmentStatus(raw);
return s === 'rental_send_workorder' || s === 'rental_pending' || s === 'rental_completed';
};

// For calendar coloring and the little clock icon, treat contract_farm_pending as a kind of "pending".
const isPendingAssignmentStatus = (raw?: string) => {
const s = normalizeAssignmentStatus(raw);
return s === 'pending' || s === 'rental_pending' || s === 'contract_farm_pending' || s === 'sup_task_completed';
};

// For the "Pending" badge + pending counts in the modal, do NOT include contract_farm_pending
// because that should show as "Contract Farmer" and is not user-assignable.
const isUserPendingAssignmentStatus = (raw?: string) => {
const s = normalizeAssignmentStatus(raw);
return s === 'pending' || s === 'rental_pending' || s === 'sup_task_completed';
};

const isCompletedAssignmentStatus = (raw?: string) => {
const s = normalizeAssignmentStatus(raw);
return s === 'completed' || s === 'rental_completed' || s === 'contract_farm_completed';
};

// --- Approval helpers ---
// Backend can return partial approval statuses like `sup_task_completed`.
// Interpret as: Supervisor done, Field Manager still pending.
const isSupervisorApprovedAssignmentStatus = (raw?: string) => {
const s = normalizeAssignmentStatus(raw);
return isCompletedAssignmentStatus(s) || s === 'sup_task_completed';
};

const isFieldManagerApprovedAssignmentStatus = (raw?: string) => {
const s = normalizeAssignmentStatus(raw);
return isCompletedAssignmentStatus(s);
};

const isOverdueAssignmentStatus = (raw?: string) => normalizeAssignmentStatus(raw) === 'overdue';

const combineAssignmentStatus = (a?: string, b?: string) => {
const s1 = normalizeAssignmentStatus(a);
const s2 = normalizeAssignmentStatus(b);

if (
isContractFarmAssignmentStatus(s1) ||
isContractFarmAssignmentStatus(s2) ||
isContractFarmPendingAssignmentStatus(s1) ||
isContractFarmPendingAssignmentStatus(s2) ||
isContractFarmCompletedAssignmentStatus(s1) ||
isContractFarmCompletedAssignmentStatus(s2)
) {
if (isContractFarmPendingAssignmentStatus(s1) || isContractFarmPendingAssignmentStatus(s2)) return 'contract_farm_pending';
if (isContractFarmCompletedAssignmentStatus(s1) || isContractFarmCompletedAssignmentStatus(s2)) return 'contract_farm_completed';
return 'contract_farm';
}

if (isRentalAssignmentStatus(s1) || isRentalAssignmentStatus(s2)) {
if (isRentalPendingAssignmentStatus(s1) || isRentalPendingAssignmentStatus(s2)) return 'rental_pending';
if (isRentalSendWorkorderAssignmentStatus(s1) || isRentalSendWorkorderAssignmentStatus(s2)) return 'rental_send_workorder';
if (isRentalCompletedAssignmentStatus(s1) || isRentalCompletedAssignmentStatus(s2)) return 'rental_completed';
}

if (isCompletedAssignmentStatus(s1) || isCompletedAssignmentStatus(s2)) return 'completed';
if (s1 === 'sup_task_completed' || s2 === 'sup_task_completed') return 'sup_task_completed';
if (normalizeAssignmentStatus(s1) === 'pending' || normalizeAssignmentStatus(s2) === 'pending') return 'pending';
if (isOverdueAssignmentStatus(s1) || isOverdueAssignmentStatus(s2)) return 'overdue';
return s1 || s2 || 'unassigned';
};

const getActivityIcon = (activity: string) => {
const key = activity.trim().toLowerCase();
const iconClass = "w-4 h-4 text-gray-500";
if (key.includes('bed')) return <Shovel className={iconClass} />;
if (key.includes('plough')) return <Tractor className={iconClass} />;
if (key.includes('irrig')) return <Droplets className={iconClass} />;
if (key.includes('fert') || key.includes('weed')) return <Leaf className={iconClass} />;
if (key.includes('visit')) return <ClipboardList className={iconClass} />;
if (key.includes('harvest')) return <Wheat className={iconClass} />;
return <ClipboardList className={iconClass} />;
};

const isHarvestActivity = (activity: string) => activity.trim().toLowerCase().includes('harvest');

const isFieldVisitActivity = (activity: string) => activity.trim().toLowerCase().includes('visit');

const formatDateKey = (date: Date) => {
return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const addDays = (dateStr: string, days: number): string => {
const date = new Date(dateStr);
date.setDate(date.getDate() + days);
return formatDateKey(date);
};

const getDayName = (dateStr: string) => {
const date = new Date(dateStr);
return date.toLocaleDateString('en-US', { weekday: 'short' });
};

const getDayNum = (dateStr: string) => {
const date = new Date(dateStr);
return date.getDate();
};

// --- API Fetch ---
const BASE_URL = getBaseUrl().replace(/\/$/, '');

const fetchCalendarData = async (): Promise<CalendarData> => {
const url = `${BASE_URL}/admin_cultivation/fetch_cultivation_calander`;
try {
const res = await fetch(url);
if (!res.ok) throw new Error('Failed to fetch calendar data');
const data: ApiResponse = await res.json();
const calendarByDate: Record<string, Map<string, CalendarActivity>> = {};

for (const planKey in data.plan) {
const plan = data.plan[planKey];
plan.date_mapping.forEach((activity) => {
const fieldAssignment = activity.field_assignment || {};
Object.entries(fieldAssignment).forEach(([dateStr, assignments]) => {
if (!calendarByDate[dateStr]) calendarByDate[dateStr] = new Map();

const normalizedAssignments = Array.isArray(assignments)
? assignments
.filter((a) => !!a && typeof a === 'object')
.map((a: any) => ({
farm_id: String(a?.farm_id || '').trim(),
assigned_area: Number(a?.assigned_area) || 0,
status: normalizeAssignmentStatus(a?.status),
task_id: a?.task_id ? String(a.task_id) : undefined,
plot: Array.isArray(a?.plot)
? (a.plot as any[]).map((p) => ({
plot_id: String(p?.plot_id || ''),
plot_name: String(p?.plot_name || ''),
plot_area: Number(p?.plot_area) || 0,
}))
: [] as PlotItem[],
}))
.filter((a) => !!a.farm_id)
: [];

const byFarm = new Map<string, { farm_id: string; assigned_area: number; status: string; plot: PlotItem[]; task_id?: string }>();
for (const a of normalizedAssignments) {
const mapKey = `${a.farm_id}__${normalizeAssignmentStatus(a.status)}`;
const existing = byFarm.get(mapKey);
if (!existing) {
byFarm.set(mapKey, {
farm_id: a.farm_id,
assigned_area: Number(a.assigned_area) || 0,
status: normalizeAssignmentStatus(a.status),
plot: a.plot,
task_id: a.task_id,
});
continue;
}
const nextArea = (Number(existing.assigned_area) || 0) + (Number(a.assigned_area) || 0);
const existingPlotIds = new Set(existing.plot.map((p) => p.plot_id));
const mergedPlots = [...existing.plot, ...a.plot.filter((p) => !existingPlotIds.has(p.plot_id))];
byFarm.set(mapKey, {
farm_id: existing.farm_id,
assigned_area: nextArea,
status: existing.status,
plot: mergedPlots,
task_id: existing.task_id ?? a.task_id,
});
}

for (const farm of byFarm.values()) {
const rowKey = `${planKey}__${plan.plan_id}__${plan.block_id}__${activity.index}__${activity.activity}__${farm.farm_id}__${farm.status}`;
calendarByDate[dateStr].set(rowKey, {
index: activity.index,
activity: activity.activity,
crop_type: String((activity as any)?.crop_type || '').trim().toLowerCase(),
block_id: plan.block_id,
plan_id: plan.plan_id,
calander_id: planKey,
farm_id: farm.farm_id,
assignments: [farm],
});
}
});
});
}

const calendar: CalendarData = {};
for (const [dateStr, map] of Object.entries(calendarByDate)) {
calendar[dateStr] = Array.from(map.values()).sort((a, b) => a.index - b.index);
}
return calendar;
} catch (err) {
console.error('[CultivationCalendar] Fetch error:', err);
return {};
}
};

const fetchFarmsById = async (): Promise<FarmsById> => {
const url = `${BASE_URL}/farmer_managment/get_farms`;
try {
const res = await fetch(url);
if (!res.ok) throw new Error('Failed to fetch farms');
const data: FarmsResponse = await res.json();
const farms = Array.isArray(data.farms) ? data.farms : [];
return farms.reduce<FarmsById>((acc, farm) => {
acc[farm.farm_id] = farm;
return acc;
}, {});
} catch (error) {
console.error(error);
return {};
}
};

// --- Single Month Component ---
const MonthCard = ({
monthDate,
activities,
onDateClick,
currentDateKey,
pendingByDate,
onFieldVisitClick,
}: {
monthDate: Date;
activities: CalendarData;
onDateClick: (dateStr: string) => void;
currentDateKey: string;
pendingByDate: PendingByDate;
onFieldVisitClick: (monthDate: Date) => void;
}) => {
const year = monthDate.getFullYear();
const month = monthDate.getMonth();
const monthName = monthDate.toLocaleString('default', { month: 'long' });
const daysInMonth = new Date(year, month + 1, 0).getDate();
const firstDay = new Date(year, month, 1).getDay();
const todayDateObj = new Date();
todayDateObj.setHours(0, 0, 0, 0);

const hasAnyPendingOnDate = (dateStr: string) => {
const dayActs = activities[dateStr];
const fromApi = Array.isArray(dayActs)
? dayActs.some((act) => Array.isArray(act.assignments) && act.assignments.some((a) => isPendingAssignmentStatus(a?.status)))
: false;
const fromLocal = !!pendingByDate?.[dateStr] && Object.keys(pendingByDate[dateStr]).length > 0;
return fromApi || fromLocal;
};

const hasAnyOverdueOnDate = (dateStr: string) => {
const dayActs = activities[dateStr];
return Array.isArray(dayActs)
? dayActs.some((act) => Array.isArray(act.assignments) && act.assignments.some((a) => isOverdueAssignmentStatus(a?.status)))
: false;
};

const isAllCompletedOnDate = (dateStr: string) => {
const dayActs = activities[dateStr];
if (!Array.isArray(dayActs) || dayActs.length === 0) return false;
return dayActs.every(
(act) => Array.isArray(act.assignments) && act.assignments.some((a) => isCompletedAssignmentStatus(a?.status))
);
};

const monthVisitStats = useMemo(() => {
let total = 0;
let done = 0;

for (let d = 1; d <= daysInMonth; d++) {
const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dayActs = activities[dateStr];
if (!Array.isArray(dayActs) || dayActs.length === 0) continue;

const visitActs = dayActs.filter((a) => String(a?.activity || '').toLowerCase().includes('visit'));
for (const act of visitActs) {
const assignments = Array.isArray(act.assignments) ? act.assignments : [];
for (const a of assignments) {
const acres = Number(a?.assigned_area) || 0;
total += acres;
if (isCompletedAssignmentStatus(a?.status)) done += acres;
}
}
}

const progress = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
return { total, done, progress };
}, [activities, daysInMonth, month, year]);

const progressPct = Math.round(monthVisitStats.progress * 100);
const r = 10;
const c = 2 * Math.PI * r;
const dash = monthVisitStats.progress * c;
const gap = c - dash;

return (
<div className="bg-card border border-border rounded-xl p-4 flex flex-col h-full bg-white shadow-sm hover:shadow-md transition-shadow">
<div className="flex items-start justify-between mb-6 pt-2 gap-3">
<h3 className="text-sm font-medium text-foreground/80">{monthName} {year}</h3>

<button
type="button"
onClick={() => onFieldVisitClick(monthDate)}
title="View field visit weeks"
aria-label="View field visit weeks"
className="relative shrink-0 w-11 h-11 rounded-full bg-background border border-border hover:bg-muted transition-colors"
>
<svg viewBox="0 0 28 28" className="absolute inset-1 w-auto h-auto pointer-events-none">
<circle cx="14" cy="14" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-muted-foreground/25" />
<circle
cx="14"
cy="14"
r={r}
fill="none"
stroke="currentColor"
strokeWidth="4"
strokeLinecap="round"
strokeDasharray={`${dash} ${gap}`}
transform="rotate(-90 14 14)"
className="text-green-600"
/>
</svg>
<span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground leading-none">
{progressPct}%
</span>
</button>
</div>
<div className="grid grid-cols-7 mb-4">
{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
<div key={d} className="text-[10px] text-center text-muted-foreground/60 font-medium">
{d}
</div>
))}
</div>
<div className="grid grid-cols-7 gap-y-4 gap-x-1 flex-1 content-start">
{Array.from({ length: firstDay }).map((_, i) => (
<div key={`empty-${i}`} />
))}
{Array.from({ length: daysInMonth }).map((_, i) => {
const day = i + 1;
const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const cellDate = new Date(year, month, day);
cellDate.setHours(0, 0, 0, 0);
const isToday = cellDate.getTime() === todayDateObj.getTime();
const dayActs = activities[dateStr];
const hasActivity = dayActs && dayActs.length > 0;
const hasHarvesting = Array.isArray(dayActs) && dayActs.some((a) => isHarvestActivity(a.activity));
const hasOverdue = hasAnyOverdueOnDate(dateStr);
const hasPending = hasAnyPendingOnDate(dateStr);
const allCompleted = isAllCompletedOnDate(dateStr);

let bgClass = "hover:bg-secondary";
let textClass = "text-muted-foreground/60";

if (hasOverdue) {
bgClass = "bg-red-100 text-red-700 border border-red-200";
textClass = "text-red-700";
} else if (hasPending) {
bgClass = "bg-orange-100 text-orange-800 border border-orange-200";
textClass = "text-orange-800";
} else if (allCompleted) {
bgClass = "bg-green-600 text-white shadow-md shadow-green-200";
textClass = "text-white";
} else if (hasActivity) {
bgClass = "bg-gray-100 text-gray-700";
textClass = "text-gray-700";
} else if (isToday) {
bgClass = "bg-green-600 text-white shadow-md shadow-green-200";
textClass = "text-white";
}
return (
<div
key={day}
onClick={() => onDateClick(dateStr)}
className="flex items-center justify-center cursor-pointer group relative"
>
{(isToday || hasActivity) ? (
<div className={cn(
"w-8 h-8 rounded-md flex flex-col items-center justify-center transition-all shadow-sm relative",
bgClass,
null
)}>
<span className={cn("text-xs font-medium leading-none", isToday && "font-bold")}>{day}</span>
{hasHarvesting && (
<span className={cn(
"absolute -bottom-1 -right-1 rounded-full bg-background border border-border p-0.5 shadow-sm",
isToday && "bg-white/90"
)}>
<Wheat className={cn("w-3 h-3", isToday ? "text-green-800" : "text-muted-foreground")} />
</span>
)}
{hasPending && (
<span className={cn(
"absolute -bottom-1 -left-1 rounded-full bg-background border border-border p-0.5 shadow-sm"
)}>
<Watch className="w-3 h-3 text-orange-500" />
</span>
)}
{isToday && (
<span className="text-[6px] leading-tight mt-0.5 opacity-90 font-medium">Today</span>
)}
</div>
) : (
<span className={cn(
"text-xs hover:text-foreground hover:bg-secondary rounded-full w-7 h-7 flex items-center justify-center transition-colors",
textClass,
null
)}>
{day}
</span>
)}
</div>
);
})}
</div>
</div>
);
};

// --- Main Component ---
const CultivationCalendar = () => {
const [searchParams] = useSearchParams();
const [timelineMonth, setTimelineMonth] = useState<Date | null>(null);
const [baseDate] = useState(() => {
const monthParam = searchParams.get('month');
if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
const [y, m] = monthParam.split('-').map(Number);
return new Date(y, m - 1, 1);
}
return new Date();
});
const [selectedDate, setSelectedDate] = useState<string | null>(null);
const [isModalOpen, setIsModalOpen] = useState(false);
// New State for Assignment
const [isAssignmentOpen, setIsAssignmentOpen] = useState(false);
// All sections (Assign Staff, Self Work/Vendor Scope, Choose Item) render together in one
// scrollable popup — no step-by-step wizard.
const [availableSupervisors, setAvailableSupervisors] = useState<{ supervisor_id: string; name: string; phone: string }[]>([]);
const [selectedSupervisorId, setSelectedSupervisorId] = useState<string>('');
const [availableFieldManagers, setAvailableFieldManagers] = useState<{ manager_id: string; name: string; phone: string }[]>([]);
const [isLoadingStaff, setIsLoadingStaff] = useState(false);
const [selectedFieldManagerIds, setSelectedFieldManagerIds] = useState<string[]>([]);
// "Self Work" (own vehicles + equipment) vs "Vendor Scope" (assign to an external vendor)
const [vendorSectionTab, setVendorSectionTab] = useState<'self' | 'vendor'>('self');
const [selectedTaskVendorId, setSelectedTaskVendorId] = useState<string | null>(null);
const [taskVendor, setTaskVendor] = useState({ name: '', contact: '' });
const [dosageRows, setDosageRows] = useState<DosageControlRowLite[]>([]);
const [selectedDosageItemRowId, setSelectedDosageItemRowId] = useState<string>('');
const [isAssigningTask, setIsAssigningTask] = useState(false);
const [scopeVendors, setScopeVendors] = useState<Record<string, VendorScopeEntry>>({});
const [isLoadingScope, setIsLoadingScope] = useState(false);
// Self Work: vehicles (multi-select) + equipment (id -> quantity)
const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
const [equipmentCounts, setEquipmentCounts] = useState<Record<string, number>>({});
const [vehiclesForAssignment, setVehiclesForAssignment] = useState<Asset[]>([]);
const [isLoadingVehiclesForAssignment, setIsLoadingVehiclesForAssignment] = useState(false);
const [inventoryItems, setInventoryItems] = useState<ApiInventoryItem[]>([]);
const [isLoadingInventoryItems, setIsLoadingInventoryItems] = useState(false);
const [equipmentSearchTerm, setEquipmentSearchTerm] = useState('');

const [activitiesData, setActivitiesData] = useState<CalendarData>({});
const [farmsById, setFarmsById] = useState<FarmsById>({});
const [farmerNames, setFarmerNames] = useState<Record<string, string>>({});
const [selectedTaskKeys, setSelectedTaskKeys] = useState<Record<string, boolean>>({});
const [pendingByDate, setPendingByDate] = useState<PendingByDate>({});
const [dateSwapTaskKey, setDateSwapTaskKey] = useState<string | null>(null);
const [dateSwapValue, setDateSwapValue] = useState<string>('');
const [dateSwapPopupPos, setDateSwapPopupPos] = useState<{ top: number; left: number } | null>(null);
const [viewPlotsTaskKey, setViewPlotsTaskKey] = useState<string | null>(null);
const [monitorTask, setMonitorTask] = useState<MonitorTask | null>(null);
const [mapViewTask, setMapViewTask] = useState<MapViewTask | null>(null);
const [contactsById, setContactsById] = useState<Record<string, {
supervisorName: string;
supervisorContact: string;
fieldManagers: { name: string; contact: string }[];
}>>({});
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const taskModalRef = useRef<HTMLDivElement | null>(null);
const [filterBlockId, setFilterBlockId] = useState<string>('all');
const [filterCropType, setFilterCropType] = useState<string>('all');
const [filterActivity, setFilterActivity] = useState<string>('all');
const [filterFarmIds, setFilterFarmIds] = useState<string[]>([]);
const [collapsedActivityGroups, setCollapsedActivityGroups] = useState<Record<string, boolean>>({});
const [multiSelectGroups, setMultiSelectGroups] = useState<Record<string, boolean>>({});

const currentDateKey = formatDateKey(new Date());
const monthsToDisplay = Array.from({ length: 12 }, (_, i) => new Date(baseDate.getFullYear(), baseDate.getMonth() + i, 1));

const blockOptions = useMemo(() => {
const set = new Set<string>();
Object.values(activitiesData).forEach((acts) => {
acts.forEach((a) => {
const blockId = String(a?.block_id || '').trim();
if (blockId) set.add(blockId);
});
});
return Array.from(set).sort((a, b) => a.localeCompare(b));
}, [activitiesData]);



const cropTypeOptions = useMemo(() => {
const set = new Set<string>();
Object.values(activitiesData).forEach((acts) => {
acts.forEach((a) => {
const cropType = String(a?.crop_type || '').trim().toLowerCase();
if (cropType) set.add(cropType);
});
});
return Array.from(set).sort((a, b) => a.localeCompare(b));
}, [activitiesData]);

const activityOptions = useMemo(() => {
const set = new Set<string>();
Object.values(activitiesData).forEach((acts) => {
acts.forEach((a) => {
const act = String(a?.activity || '').trim();
if (act) set.add(act);
});
});
return Array.from(set).sort((a, b) => a.localeCompare(b));
}, [activitiesData]);

const farmOptions = useMemo(() => {
const set = new Set<string>();
Object.values(activitiesData).forEach((acts) => {
acts.forEach((a) => {
const farmId = String(a?.farm_id || '').trim();
if (farmId) set.add(farmId);
});
});
return Array.from(set).sort((a, b) => a.localeCompare(b));
}, [activitiesData]);

// Load farmer names for visible farm options (cached)
useEffect(() => {
	const ids = farmOptions.filter((id) => id && !farmerNames[id]);
	if (ids.length === 0) return;
	let mounted = true;
	getFarmerNames(ids).then((names) => {
		if (!mounted) return;
		setFarmerNames((prev) => {
			const next = { ...prev };
			ids.forEach((id) => { next[id] = names[id] || id; });
			return next;
		});
	});
	return () => { mounted = false; };
}, [farmOptions]);

const filteredActivitiesData = useMemo(() => {
const next: CalendarData = {};
for (const [dateStr, acts] of Object.entries(activitiesData)) {
const filtered = acts.filter((task) => {
if (filterBlockId !== 'all' && String(task.block_id || '') !== filterBlockId) return false;
if (filterCropType !== 'all' && String(task.crop_type || '').trim().toLowerCase() !== filterCropType) return false;
if (filterActivity !== 'all' && String(task.activity || '') !== filterActivity) return false;
if (filterFarmIds.length > 0 && !filterFarmIds.includes(String(task.farm_id || ''))) return false;
return true;
});
if (filtered.length > 0) next[dateStr] = filtered;
}
return next;
}, [activitiesData, filterActivity, filterBlockId, filterCropType, filterFarmIds]);

useEffect(() => {
setLoading(true);
Promise.allSettled([fetchCalendarData(), fetchFarmsById()]).then((results) => {
const [calendarResult, farmsResult] = results;

if (calendarResult.status === 'fulfilled') {
setActivitiesData(calendarResult.value);
} else {
console.error(calendarResult.reason);
setError('Failed to load calendar data');
}

if (farmsResult.status === 'fulfilled') {
setFarmsById(farmsResult.value);
} else {
console.error(farmsResult.reason);
}

setLoading(false);
});
}, []);

// Fetch supervisor + field manager whenever the day popup opens
useEffect(() => {
if (!isModalOpen || !selectedDate) return;
const activities = activitiesData[selectedDate] ?? [];
const farmIds = [...new Set(activities.map((a) => a.farm_id).filter(Boolean))];
if (farmIds.length === 0) return;
setContactsById({});
Promise.allSettled(
farmIds.map((farmId) =>
fetch(`${BASE_URL}/farmer_managment/get_assigned_supervisor_and_field_manager/${farmId}`)
.then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
.then((data) => ({ farmId, data }))
.catch(() => ({ farmId, data: null }))
)
).then((results) => {
const next: Record<string, { supervisorName: string; supervisorContact: string; fieldManagers: { name: string; contact: string }[] }> = {};
for (const r of results) {
if (r.status === 'fulfilled' && r.value?.data?.success) {
const { farmId, data } = r.value;
const sup = data.assigned_supervisor;
const fms = Array.isArray(data.assigned_field_manager)
? data.assigned_field_manager
: data.assigned_field_manager ? [data.assigned_field_manager] : [];
next[farmId] = {
supervisorName:    sup?.supervisor_name ?? '',
supervisorContact: sup?.suervisor_contact ?? sup?.supervisor_contact ?? '',
fieldManagers:     fms.map((fm: any) => ({ name: fm.name ?? '', contact: fm.contact ?? '' })),
};
}
}
setContactsById(next);
});
}, [isModalOpen, selectedDate]);

// --- Logic to Populate Sidebar Data (from API or Mock) ---
const { pendingToday, carryForward, earlyCompletion } = useMemo(() => {
const today = new Date();
today.setHours(0,0,0,0);
const todayStr = formatDateKey(today);

const pending: SidebarTask[] = [];
const carry: SidebarTask[] = [];
const early: SidebarTask[] = [];

// Parse API Data
if (Object.keys(filteredActivitiesData).length > 0) {
Object.entries(filteredActivitiesData).forEach(([dateStr, activities]) => {
const activityDate = new Date(dateStr);
activityDate.setHours(0,0,0,0);

activities.forEach((act, idx) => {
const totalArea = act.assignments.reduce((sum, a) => sum + (Number(a.assigned_area) || 0), 0);
const landStr = `Cluster A - Zone 1 - Block ${act.block_id || 'Gen'} - Field ${act.farm_id}`;

const taskItem: SidebarTask = {
id: `${act.plan_id}-${act.index}-${idx}`,
taskNo: `TSK-${act.index.toString().padStart(3, '0')}`,
activity: act.activity,
date: dateStr,
land: landStr,
workAllocated: parseFloat(totalArea.toFixed(2)),
workDone: 0
};

if (dateStr === todayStr) {
pending.push(taskItem);
} else if (activityDate < today) {
carry.push(taskItem);
} else if (activityDate > today) {
early.push(taskItem);
}
});
});
}

return { pendingToday: pending, carryForward: carry, earlyCompletion: early };
}, [filteredActivitiesData]);

const handleDateClick = (dateStr: string) => {
setSelectedDate(dateStr);
setIsModalOpen(true);
};

const closeModal = () => {
setIsModalOpen(false);
setIsAssignmentOpen(false);
setDateSwapTaskKey(null);
setDateSwapValue('');
setDateSwapPopupPos(null);
setViewPlotsTaskKey(null);
};

const closeAssignmentModal = () => {
setIsAssignmentOpen(false);
setSelectedSupervisorId('');
setSelectedFieldManagerIds([]);
setVendorSectionTab('self');
setScopeVendors({});
setSelectedTaskVendorId(null);
setTaskVendor({ name: '', contact: '' });
setSelectedVehicleIds([]);
setEquipmentCounts({});
setEquipmentSearchTerm('');
setDosageRows([]);
setSelectedDosageItemRowId('');
};

const isTaskPending = (task: CalendarActivity) => {
const list = Array.isArray(task.assignments) ? task.assignments : [];
const fromApi = list.some((a) => isUserPendingAssignmentStatus(a?.status));
if (fromApi) return true;
if (!selectedDate) return false;
const taskKey = getTaskKey(task);
return !!pendingByDate?.[selectedDate]?.[taskKey];
};

const isTaskCompleted = (task: CalendarActivity) => {
const list = Array.isArray(task.assignments) ? task.assignments : [];
return list.some((a) => isCompletedAssignmentStatus(a?.status));
};

const isTaskContractFarm = (task: CalendarActivity) => {
const list = Array.isArray(task.assignments) ? task.assignments : [];
return list.some((a) => isContractFarmAssignmentStatus(a?.status));
};

const isTaskRental = (task: CalendarActivity) => {
const list = Array.isArray(task.assignments) ? task.assignments : [];
return list.some((a) => isRentalAssignmentStatus(a?.status));
};

const isTaskOverdue = (task: CalendarActivity) => {
const list = Array.isArray(task.assignments) ? task.assignments : [];
return list.some((a) => isOverdueAssignmentStatus(a?.status));
};

const isTaskAssignable = (task: CalendarActivity) =>
!isTaskPending(task) && !isTaskCompleted(task) && !isTaskContractFarm(task) && !isTaskOverdue(task);

const getInventoryItemId = (item: ApiInventoryItem): string => {
return String(item?.id || item?.Invent_id || item?.item || '');
};

// Dosage/crop-input categories belong in the "Choose Item" step (sourced from Dosage Control),
// not here — this list is for physical equipment/machinery only.
const DOSAGE_INPUT_CATEGORY_KEYWORDS = ['seed', 'fertilizer', 'pesticide', 'fungicide', 'herbicide', 'chemical', 'manure', 'nutrient'];
const isDosageInputCategory = (category: string) => {
const normalized = category.trim().toLowerCase();
return DOSAGE_INPUT_CATEGORY_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

const buildVehicleSchedule = (raw: any): Record<string, number> => {
if (!raw) return {};
if (!Array.isArray(raw) && typeof raw === 'object') {
const schedule: Record<string, number> = {};
for (const [k, v] of Object.entries(raw)) {
if (!k) continue;
if (typeof v === 'string') {
schedule[k] = 0;
} else if (v && typeof v === 'object') {
const acres = Number((v as any)?.acres_covered);
schedule[k] = Number.isFinite(acres) ? acres : 0;
} else {
schedule[k] = 0;
}
}
return schedule;
}
if (Array.isArray(raw)) {
const schedule: Record<string, number> = {};
for (const item of raw) {
const date = item?.date || item?.day || item?.created_at;
if (!date) continue;
const acres = Number(item?.acres_covered);
schedule[String(date).slice(0, 10)] = Number.isFinite(acres) ? acres : 0;
}
return schedule;
}
return {};
};

const getTaskKey = (task: CalendarActivity) => {
const status = normalizeAssignmentStatus(Array.isArray(task.assignments) ? task.assignments[0]?.status : undefined);
return `${task.calander_id}__${task.plan_id}__${task.block_id}__${task.index}__${task.activity}__${task.farm_id}__${status}`;
};

useEffect(() => {
if (isModalOpen) {
setSelectedTaskKeys({});
setMultiSelectGroups({});
}
}, [isModalOpen, selectedDate]);

// Fetch scope-of-work vendors whenever the assignment popup is open (Choose Vendor section)
useEffect(() => {
if (!isAssignmentOpen) {
setScopeVendors({});
return;
}
const selectedTask = selectedActivities.find(
(t) => selectedTaskKeys[getTaskKey(t)] && isTaskAssignable(t)
);
const farmId = selectedTask?.farm_id;
if (!farmId) return;

let mounted = true;
setIsLoadingScope(true);
setScopeVendors({});
(async () => {
try {
const res = await fetch(`${BASE_URL}/admin_cultivation/get_scope_of_work_for_land/${farmId}`);
const data = await res.json().catch(() => null);
if (!mounted) return;
if (data?.success && data?.scope_of_work && typeof data.scope_of_work === 'object') {
setScopeVendors(data.scope_of_work as Record<string, VendorScopeEntry>);
} else {
setScopeVendors({});
}
} catch {
if (mounted) setScopeVendors({});
} finally {
if (mounted) setIsLoadingScope(false);
}
})();
return () => { mounted = false; };
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [isAssignmentOpen]);

// Fetch supervisors + field managers when the popup opens; prefill from this land's currently-assigned staff
useEffect(() => {
if (!isAssignmentOpen) return;
let mounted = true;
setIsLoadingStaff(true);
(async () => {
try {
const [supRes, fmRes] = await Promise.all([
fetch(`${BASE_URL}/supervisor_management/get_all_supervisors`),
fetch(`${BASE_URL}/field_manager/get_all_field_managers`),
]);
const supData: any = await supRes.json().catch(() => null);
const fmData: any = await fmRes.json().catch(() => null);
if (!mounted) return;

const supervisors = (Array.isArray(supData?.supervisors) ? supData.supervisors : [])
.filter((s: any) => !!s?.sup_id)
.map((s: any) => ({
supervisor_id: String(s.sup_id),
name: s.supervisor_info?.staff_name || 'Unknown',
phone: s.supervisor_info?.staff_phone || 'N/A',
}));
const fieldManagers = (Array.isArray(fmData?.field_managers) ? fmData.field_managers : [])
.filter((m: any) => !!m?.manager_id)
.map((m: any) => ({
manager_id: String(m.manager_id),
name: m.field_manager_info?.staff_name || 'Unknown',
phone: m.field_manager_info?.staff_phone || 'N/A',
}));
setAvailableSupervisors(supervisors);
setAvailableFieldManagers(fieldManagers);

const selectedTask = selectedActivities.find((t) => selectedTaskKeys[getTaskKey(t)] && isTaskAssignable(t));
const contact = selectedTask ? contactsById[selectedTask.farm_id] : undefined;
if (contact?.supervisorName && !selectedSupervisorId) {
const match = supervisors.find((s) => s.name === contact.supervisorName);
if (match) setSelectedSupervisorId(match.supervisor_id);
}
if (contact?.fieldManagers?.length && selectedFieldManagerIds.length === 0) {
const matchedIds = contact.fieldManagers
.map((fm) => fieldManagers.find((f) => f.name === fm.name)?.manager_id)
.filter((id): id is string => !!id);
if (matchedIds.length > 0) setSelectedFieldManagerIds(matchedIds);
}
} catch {
if (mounted) {
setAvailableSupervisors([]);
setAvailableFieldManagers([]);
}
} finally {
if (mounted) setIsLoadingStaff(false);
}
})();
return () => { mounted = false; };
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [isAssignmentOpen]);

// Load Dosage Control rows (Operations Master → Dosage Control) whenever the popup is open
useEffect(() => {
if (!isAssignmentOpen) return;
try {
const raw = localStorage.getItem(DOSAGE_CONTROLS_STORAGE_KEY);
const parsed = raw ? JSON.parse(raw) : [];
setDosageRows(Array.isArray(parsed) ? parsed : []);
} catch {
setDosageRows([]);
}
}, [isAssignmentOpen]);

const selectedActivities = selectedDate && filteredActivitiesData[selectedDate] ? filteredActivitiesData[selectedDate] : [];
const selectedActivityGroups = useMemo(() => {
const groups = new Map<string, {
key: string;
activity: string;
tasks: CalendarActivity[];
totalAcres: number;
assigned: number;
pending: number;
done: number;
overdue: number;
supPending: number;
fmPending: number;
}>();

for (const act of selectedActivities) {
const activity = String(act?.activity || 'Activity').trim() || 'Activity';
const key = activity.toLowerCase();
const current = groups.get(key) || {
key,
activity,
tasks: [],
totalAcres: 0,
assigned: 0,
pending: 0,
done: 0,
overdue: 0,
supPending: 0,
fmPending: 0,
};

const completedTask = isTaskCompleted(act);
const pendingTask = isTaskPending(act);
const overdueTask = !completedTask && isTaskOverdue(act);
const assignments = Array.isArray(act.assignments) ? act.assignments : [];
const isFieldVisit = isFieldVisitActivity(activity);
const supApproved = assignments.some((a) => isSupervisorApprovedAssignmentStatus(a?.status));
const fmApproved = assignments.some((a) => isFieldManagerApprovedAssignmentStatus(a?.status));
const assignedTask = assignments.some((a) => normalizeAssignmentStatus(a?.status) !== 'unassigned');

current.tasks.push(act);
current.totalAcres += assignments.reduce((sum, a) => sum + (Number(a.assigned_area) || 0), 0);
if (assignedTask) current.assigned += 1;
if (pendingTask) current.pending += 1;
if (completedTask) current.done += 1;
if (overdueTask) current.overdue += 1;
if (!isFieldVisit && !supApproved) current.supPending += 1;
if (!isFieldVisit && !fmApproved) current.fmPending += 1;
groups.set(key, current);
}

return Array.from(groups.values());
}, [selectedActivities]);
const allSelectedKeys = selectedActivities.map(getTaskKey);
const anySelected = allSelectedKeys.some((k) => !!selectedTaskKeys[k]);
const allSelected = allSelectedKeys.length > 0 && allSelectedKeys.every((k) => !!selectedTaskKeys[k]);
const activeDateSwapTask = useMemo(
() => selectedActivities.find((t) => getTaskKey(t) === dateSwapTaskKey) || null,
[dateSwapTaskKey, selectedActivities]
);

const handleApplyDateSwap = async () => {
if (!selectedDate) return;
if (!dateSwapValue) {
toast.error('Please select a new date');
return;
}
if (!activeDateSwapTask) {
toast.error('Task not found for date swap');
return;
}
if (dateSwapValue === selectedDate) {
toast.error('New date cannot be same as current date');
return;
}

const payload = {
calendar_id: activeDateSwapTask.calander_id,
activity: activeDateSwapTask.activity,
farm_id: activeDateSwapTask.farm_id,
old_date: selectedDate,
new_date: dateSwapValue,
};

try {
const res = await fetch(`${BASE_URL}/admin_cultivation/change_task_date`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(payload),
});
const data: any = await res.json().catch(() => null);
if (!res.ok || data?.success !== true) {
throw new Error(data?.message || 'Failed to change task date');
}

setActivitiesData((prev) => {
const next: CalendarData = { ...prev };
const oldList = Array.isArray(next[selectedDate]) ? [...next[selectedDate]] : [];
const movingTask = oldList.find((t) => getTaskKey(t) === getTaskKey(activeDateSwapTask));
if (!movingTask) return prev;

next[selectedDate] = oldList.filter((t) => getTaskKey(t) !== getTaskKey(activeDateSwapTask));
if (next[selectedDate].length === 0) delete next[selectedDate];

const newList = Array.isArray(next[dateSwapValue]) ? [...next[dateSwapValue]] : [];
const existingIdx = newList.findIndex((t) => getTaskKey(t) === getTaskKey(movingTask));
if (existingIdx >= 0) {
const existing = newList[existingIdx];
const mergedByFarm = new Map<string, { farm_id: string; assigned_area: number; status?: string; plot?: PlotItem[] }>();
for (const a of [...(existing.assignments || []), ...(movingTask.assignments || [])]) {
const fid = String(a?.farm_id || '');
if (!fid) continue;
const old = mergedByFarm.get(fid);
if (!old) {
mergedByFarm.set(fid, { farm_id: fid, assigned_area: Number(a?.assigned_area) || 0, status: a?.status, plot: a?.plot || [] });
} else {
const oldPlotIds = new Set((old.plot || []).map((p) => p.plot_id));
const mergedPlots = [...(old.plot || []), ...(a?.plot || []).filter((p) => !oldPlotIds.has(p.plot_id))];
mergedByFarm.set(fid, {
farm_id: fid,
assigned_area: (Number(old.assigned_area) || 0) + (Number(a?.assigned_area) || 0),
status: combineAssignmentStatus(old.status, a?.status),
plot: mergedPlots,
});
}
}
newList[existingIdx] = { ...existing, assignments: Array.from(mergedByFarm.values()) };
} else {
newList.push(movingTask);
}

next[dateSwapValue] = newList.sort((a, b) => a.index - b.index);
return next;
});

toast.success(`Task moved to ${dateSwapValue}`);
setDateSwapTaskKey(null);
setDateSwapValue('');
setDateSwapPopupPos(null);
} catch (e: any) {
toast.error(e?.message || 'Failed to change task date');
}
};

const approvalSummary = useMemo(() => {
let eligible = 0;
let supDone = 0;
let fmDone = 0;

for (const act of selectedActivities) {
if (isFieldVisitActivity(String(act?.activity || ''))) continue;
eligible += 1;
const list = Array.isArray(act.assignments) ? act.assignments : [];
const supApproved = list.some((a) => isSupervisorApprovedAssignmentStatus(a?.status));
const fmApproved = list.some((a) => isFieldManagerApprovedAssignmentStatus(a?.status));
if (supApproved) supDone += 1;
if (fmApproved) fmDone += 1;
}

return {
eligible,
sup_done: supDone,
sup_pending: Math.max(0, eligible - supDone),
fm_done: fmDone,
fm_pending: Math.max(0, eligible - fmDone),
};
}, [selectedActivities]);

const anyAssignableSelected = selectedActivities.some((t) => {
if (!isTaskAssignable(t)) return false;
return !!selectedTaskKeys[getTaskKey(t)];
});

const toggleSelectAll = () => {
if (allSelectedKeys.length === 0) return;
if (allSelected) {
setSelectedTaskKeys({});
return;
}
const next: Record<string, boolean> = {};
for (const k of allSelectedKeys) next[k] = true;
setSelectedTaskKeys(next);
};

const filteredInventoryItems = useMemo(() => {
const equipmentOnly = inventoryItems.filter((item) => !isDosageInputCategory(String(item?.category || '')));
const query = equipmentSearchTerm.trim().toLowerCase();
if (!query) return equipmentOnly;

return equipmentOnly.filter((item) => {
const id = getInventoryItemId(item).toLowerCase();
const name = String(item?.item || '').trim().toLowerCase();
const category = String(item?.category || '').trim().toLowerCase();
const unit = String(item?.unit || '').trim().toLowerCase();
return [id, name, category, unit].some((value) => value.includes(query));
});
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [equipmentSearchTerm, inventoryItems]);

const fetchInventoryItems = async () => {
setIsLoadingInventoryItems(true);
try {
const res = await fetch(`${BASE_URL}/inventory_management/get_inventory_items`, {
method: 'GET',
headers: { 'Content-Type': 'application/json' },
});
const data: any = await res.json().catch(() => null);
if (!res.ok) {
toast.error(data?.message || 'Failed to load inventory items');
setInventoryItems([]);
return;
}

const items: ApiInventoryItem[] = Array.isArray(data?.inventory_items)
? data.inventory_items
: Array.isArray((data as InventoryItemsResponse)?.inventory_items)
? (data as InventoryItemsResponse).inventory_items!
: [];

setInventoryItems(items);
} catch (e: any) {
toast.error(e?.message || 'Failed to load inventory items');
setInventoryItems([]);
} finally {
setIsLoadingInventoryItems(false);
}
};

const fetchVehiclesForAssignment = async () => {
setIsLoadingVehiclesForAssignment(true);
try {
const res = await fetch(`${BASE_URL}/admin_vehicles/get_all_vehicles`, {
method: 'GET',
headers: { 'Content-Type': 'application/json' },
});
const data: any = await res.json().catch(() => null);
if (!res.ok) {
toast.error(data?.message || 'Failed to load vehicles');
setVehiclesForAssignment([]);
return;
}

const list: ApiVehicle[] = Array.isArray(data) ? data : [];
const mapped: Asset[] = list.map((v) => {
const info = v?.vehicle_information || {};
const vehicleNumber = info?.vehicle_number || '';
return {
id: v.vehicle_id,
name: vehicleNumber || v.vehicle_id,
type: info?.type || 'Vehicle',
category: 'Vehicle',
schedule: buildVehicleSchedule(v?.work_calandar),
};
});

setVehiclesForAssignment(mapped);
} catch (e: any) {
toast.error(e?.message || 'Failed to load vehicles');
setVehiclesForAssignment([]);
} finally {
setIsLoadingVehiclesForAssignment(false);
}
};

const toggleVehicleSelection = (vId: string) => {
setSelectedVehicleIds(prev =>
prev.includes(vId) ? prev.filter(id => id !== vId) : [...prev, vId]
);
};

const updateEquipmentCount = (eId: string, delta: number, max?: number) => {
setEquipmentCounts(prev => {
const current = prev[eId] || 0;
const boundedMax = typeof max === 'number' && Number.isFinite(max) ? Math.max(0, Math.floor(max)) : undefined;
const rawNext = current + delta;
const next = Math.max(0, boundedMax !== undefined ? Math.min(boundedMax, rawNext) : rawNext);
if (next === 0) {
const { [eId]: _, ...rest } = prev;
return rest;
}
return { ...prev, [eId]: next };
});
};

const handleAssignTasksClick = () => {
if (!anyAssignableSelected) return;
setIsAssignmentOpen(true);
fetchVehiclesForAssignment();
fetchInventoryItems();
};

const handleAssignSingleTaskClick = (task: CalendarActivity) => {
if (!isTaskAssignable(task)) return;
setSelectedTaskKeys({ [getTaskKey(task)]: true });
setIsAssignmentOpen(true);
fetchVehiclesForAssignment();
fetchInventoryItems();
};

const handleConfirmAssignment = async () => {
if (!selectedDate) return;

const selectedTasks = selectedActivities.filter((t) => selectedTaskKeys[getTaskKey(t)] && isTaskAssignable(t));
if (selectedTasks.length === 0) {
toast.error('Please select at least one task');
return;
}
const selectedCalendarIds = Array.from(
	new Set(selectedTasks.map((task) => String(task?.calander_id || '').trim()).filter(Boolean))
);
if (selectedCalendarIds.length !== 1) {
	toast.error('Please select tasks from a single calendar before assigning resources');
	return;
}
const calanderId = selectedCalendarIds[0];

const assignedByFarmActivity = new Map<string, { farm_id: string; activity: string; assigned_acres: number; date: string }>();
const assignedByCalendarFarmActivity = new Map<string, Map<string, { farm_id: string; activity: string; assigned_acres: number; date: string }>>();
const feildIdSet = new Set<string>();

for (const task of selectedTasks) {
const activity = String(task?.activity || '').trim();
const calanderId = String(task?.calander_id || '').trim();
const assignments = Array.isArray(task.assignments) ? task.assignments : [];
for (const a of assignments) {
const farmId = String(a?.farm_id || '');
if (!farmId) continue;
feildIdSet.add(farmId);

const acres = Number(a?.assigned_area) || 0;
const key = `${farmId}__${activity}`;
const existing = assignedByFarmActivity.get(key);
if (!existing) {
assignedByFarmActivity.set(key, { farm_id: farmId, activity: activity || 'Activity', assigned_acres: acres, date: selectedDate });
} else {
assignedByFarmActivity.set(key, { ...existing, assigned_acres: (Number(existing.assigned_acres) || 0) + acres });
}

if (calanderId) {
const perCalendar = assignedByCalendarFarmActivity.get(calanderId) ?? new Map();
const calKey = `${farmId}__${activity}`;
const calExisting = perCalendar.get(calKey);
if (!calExisting) {
perCalendar.set(calKey, { farm_id: farmId, activity: activity || 'Activity', assigned_acres: acres, date: selectedDate });
} else {
perCalendar.set(calKey, { ...calExisting, assigned_acres: (Number(calExisting.assigned_acres) || 0) + acres });
}
assignedByCalendarFarmActivity.set(calanderId, perCalendar);
}
}
}

const feildIds = Array.from(feildIdSet);
const assignedAcres = Array.from(assignedByFarmActivity.values());

const seenPlotIds = new Set<string>();
const plots = selectedTasks
.flatMap((t) => t.assignments.flatMap((a) => a.plot ?? []))
.filter((p) => {
if (!p.plot_id || seenPlotIds.has(p.plot_id)) return false;
seenPlotIds.add(p.plot_id);
return true;
})
.map((p) => ({ plot_id: p.plot_id, plot_name: p.plot_name, plot_area: p.plot_area }));

const vehicles = vendorSectionTab === 'self'
? selectedVehicleIds.map((vehicleId) => {
const v = vehiclesForAssignment.find((x) => x.id === vehicleId);
return { vehicle_id: vehicleId, vehicle_number: v?.name || vehicleId };
})
: [];

const equipment = vendorSectionTab === 'self'
? Object.entries(equipmentCounts)
.filter(([, qty]) => (Number(qty) || 0) > 0)
.map(([equipmentId, qty]) => {
const item = inventoryItems.find((it) => getInventoryItemId(it) === equipmentId);
return {
equipment_id: equipmentId,
equipment_name: String(item?.item_name || item?.name || item?.item || equipmentId),
quantity: Math.max(0, Math.floor(Number(qty) || 0))
};
})
: [];

const payload: Record<string, any> = {
feild_id: feildIds,
plot: plots,
assigned_acres: assignedAcres,
calander_id: calanderId,
...(selectedSupervisorId && { supervisor_id: selectedSupervisorId }),
...(selectedFieldManagerIds.length > 0 && { field_manager_id: selectedFieldManagerIds }),
...(vendorSectionTab === 'self' && vehicles.length > 0 && { vehicles }),
...(vendorSectionTab === 'self' && equipment.length > 0 && { equipment }),
...(vendorSectionTab === 'vendor' && selectedTaskVendorId && taskVendor.name && {
task_vendor: [{ vendor_id: selectedTaskVendorId, vendor_name: taskVendor.name }],
}),
...(selectedDosageItemRowId && (() => {
const row = dosageRows.find((r) => r.id === selectedDosageItemRowId);
return row ? { dosage_item: { item_id: row.inventoryItemId, dosage_per_acre: row.dosagePerAcre, uom: row.uom } } : {};
})()),
};

const totalAssignedAcres = assignedAcres.reduce((sum, x) => sum + (Number(x.assigned_acres) || 0), 0);

const updateVehicleCalendar = async (vehicleId: string, acresCovered: number, blockId: string, farmId: string, activity: string) => {
const res = await fetch(`${BASE_URL}/admin_vehicles/update_vehicle_calander`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
date: selectedDate,
acres_covered: acresCovered,
vehicle_id: vehicleId,
block_id: blockId,
farm_id: farmId,
activity: activity,
}),
});
const data: any = await res.json().catch(() => null);
if (!res.ok) throw new Error(data?.message || 'Failed to update vehicle calendar');
if (data?.success !== true) throw new Error(data?.message || 'Vehicle calendar did not return success');
return data;
};

setIsAssigningTask(true);
try {
const res = await fetch(`${BASE_URL}/admin_cultivation/assign-task`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(payload),
});
const data: any = await res.json().catch(() => null);
if (!res.ok) {
toast.error(data?.message || 'Failed to assign task');
return;
}

if (data?.success === true) {
const taskId = data?.task_id ?? data?.task?.task_id;
const updateCalls = Array.from(assignedByCalendarFarmActivity.entries()).map(async ([calanderId, map]) => {
const updatePayload = { calander_id: calanderId, assigned_acres: Array.from(map.values()), task_id: taskId };
const updateRes = await fetch(`${BASE_URL}/admin_cultivation/update_task_status`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(updatePayload),
});
if (!updateRes.ok) throw new Error('Failed to update task status');
return await updateRes.json();
});

if (updateCalls.length > 0) await Promise.allSettled(updateCalls);

// Update vehicle calendars only when self-work vehicles were assigned
if (vendorSectionTab === 'self' && vehicles.length > 0) {
const vehiclesCount = Math.max(1, vehicles.length);
const acresPerVehicle = vehiclesCount > 0 ? totalAssignedAcres / vehiclesCount : 0;
const taskDetails = selectedTasks.map(t => ({
blockId: t.block_id,
farmId: t.farm_id,
activity: t.activity
}));
const vehicleCalendarCalls = vehicles.flatMap((v) =>
taskDetails.map((detail) =>
updateVehicleCalendar(
String(v.vehicle_id),
Number.isFinite(acresPerVehicle) ? acresPerVehicle : 0,
detail.blockId,
detail.farmId,
detail.activity
)
)
);
if (vehicleCalendarCalls.length > 0) {
const results = await Promise.allSettled(vehicleCalendarCalls);
const failed = results.filter((r) => r.status === 'rejected');
if (failed.length > 0) {
toast.error(`Vehicle calendar update failed for ${failed.length} vehicle(s)`);
}
}
}

setPendingByDate((prev) => {
const current = prev[selectedDate] ?? {};
const nextForDate: Record<string, boolean> = { ...current };
for (const t of selectedTasks) nextForDate[getTaskKey(t)] = true;
return { ...prev, [selectedDate]: nextForDate };
});

toast.success('Task assigned successfully');
setSelectedTaskKeys({});
setSelectedVehicleIds([]);
setEquipmentCounts({});
setIsAssignmentOpen(false);
} else {
toast.error(data?.message || 'Failed to assign task');
}
} catch (e: any) {
toast.error(e?.message || 'Failed to assign task');
} finally {
setIsAssigningTask(false);
}
};

const getChartDates = () => {
if (!selectedDate) return [];
const dates = [];
for (let i = 0; i < 5; i++) {
dates.push(addDays(selectedDate, i));
}
return dates;
};

const chartDates = getChartDates();

const VehicleAvailabilityRow = ({ asset, isSelected, onSelect }: { asset: Asset, isSelected: boolean, onSelect: () => void }) => {
return (
<div
onClick={onSelect}
className={cn(
"grid grid-cols-[1.5fr_repeat(5,1fr)] gap-2 p-2 rounded-lg border transition-all cursor-pointer items-center group",
isSelected ? "border-[#0D3A35] bg-[#0D3A35]/5 ring-1 ring-[#0D3A35]/30" : "border-border hover:border-[#0D3A35]/40"
)}
>
<div className="flex items-center gap-3 pr-2">
<div className={cn("p-2 rounded-md border shadow-sm", isSelected ? "bg-[#0D3A35] text-white" : "bg-white text-muted-foreground")}><Truck className="w-4 h-4" /></div>
<div className="min-w-0"><div className="text-sm font-semibold truncate text-foreground">{asset.name}</div><div className="text-[10px] text-muted-foreground">{asset.type}</div></div>
</div>
{chartDates.map(date => {
const acresCovered = asset.schedule[date];
const isBusy = acresCovered !== undefined;
return (
<div key={date} className="flex justify-center h-full items-center">
{isBusy ? (
<div className="w-full h-8 bg-red-100 border border-red-200 rounded-md flex items-center justify-center group/tooltip relative">
<span className="text-[10px] font-bold text-red-700">{Number(acresCovered || 0).toFixed(0)} ac</span>
<div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover/tooltip:opacity-100 whitespace-nowrap pointer-events-none z-10">Acres covered: {Number(acresCovered || 0).toFixed(2)}</div>
</div>
) : (
<div className={cn("w-full h-8 border rounded-md flex items-center justify-center transition-colors", date === selectedDate ? (isSelected ? "bg-[#0D3A35] border-[#0D3A35] text-white" : "bg-[#0D3A35]/10 border-[#0D3A35]/20 text-[#0D3A35]") : "bg-gray-50 border-gray-100")}>
{date === selectedDate && isSelected && <CheckCircle2 className="w-4 h-4" />}
{date === selectedDate && !isSelected && <span className="text-[10px] font-bold">Free</span>}
</div>
)}
</div>
);
})}
</div>
);
};

const EquipmentQuantityRow = ({ item, count }: { item: ApiInventoryItem; count: number }) => {
const id = getInventoryItemId(item);
const title = String(item?.item_name || item?.name || item?.item || '').trim() || 'Equipment';
const category = item?.category || 'Inventory';
const unit = item?.unit || '';
const maxQty = Number(item?.stock ?? 0);
const maxSafe = Number.isFinite(maxQty) ? Math.max(0, Math.floor(maxQty)) : 0;

return (
<div className={cn("flex items-center justify-between p-3 rounded-lg border transition-all", count > 0 ? "border-[#0D3A35]/20 bg-[#0D3A35]/5" : "border-border hover:border-gray-300 bg-white")}>
<div className="flex items-center gap-3">
<div className={cn("p-2 rounded-md border shadow-sm", count > 0 ? "bg-[#0D3A35]/10 text-[#0D3A35] border-[#0D3A35]/20" : "bg-gray-50 text-muted-foreground")}><Wrench className="w-4 h-4" /></div>
<div>
<div className="text-sm font-semibold text-foreground">{title}</div>
<div className="text-[10px] text-muted-foreground">{category}{unit ? ` • Unit: ${unit}` : ''}</div>
<div className="mt-1 text-[10px] text-muted-foreground">Item ID: {id || 'N/A'}</div>
</div>
</div>
<div className="flex items-center gap-3">
<div className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold border", maxSafe > 0 ? "bg-[#0D3A35]/10 text-[#0D3A35] border-[#0D3A35]/20" : "bg-slate-100 text-slate-600 border-slate-200")}>
<Hash className="w-3 h-3" />
Stock: {maxSafe}
</div>
<div className="flex items-center gap-3 bg-white rounded-md border border-gray-200 p-1 shadow-sm">
<button onClick={() => updateEquipmentCount(id, -1, maxSafe)} disabled={count === 0} className="p-1 hover:bg-gray-100 rounded text-gray-500 disabled:opacity-30 disabled:hover:bg-transparent"><Minus className="w-3 h-3" /></button>
<span className="w-4 text-center text-sm font-bold text-foreground">{count}</span>
<button onClick={() => updateEquipmentCount(id, 1, maxSafe)} disabled={maxSafe === 0 || count >= maxSafe} className="p-1 hover:bg-gray-100 rounded text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"><Plus className="w-3 h-3" /></button>
</div>
</div>
</div>
);
};

return (
<div className="p-8 space-y-8 animate-in fade-in duration-300 min-h-screen bg-gray-50/50 font-sans">
<div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
	<div className="shrink-0">
		<h1 className="text-2xl md:text-3xl font-semibold text-slate-900">Cultivation Calendar</h1>
		<p className="mt-1 text-sm text-slate-500 max-w-xl">Manage your cultivation schedule and track pending tasks.</p>
	</div>
	<div className="flex min-w-0 max-w-full flex-nowrap items-center gap-2 overflow-x-auto pb-1">
		<select value={filterBlockId} onChange={(e) => setFilterBlockId(e.target.value)} className="h-10 w-[135px] shrink-0 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm">
			<option value="all">{filterBlockId === 'all' ? '✓ ' : ''}All Blocks</option>
			{blockOptions.map((b) => (<option key={b} value={b}>{filterBlockId === b ? '✓ ' : ''}{b}</option>))}
		</select>
		<select value={filterCropType} onChange={(e) => setFilterCropType(e.target.value)} className="h-10 w-[130px] shrink-0 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm">
			<option value="all">{filterCropType === 'all' ? '✓ ' : ''}All Crops</option>
			{cropTypeOptions.map((c) => (<option key={c} value={c}>{filterCropType === c ? '✓ ' : ''}{c.toUpperCase()}</option>))}
		</select>
		<select value={filterActivity} onChange={(e) => setFilterActivity(e.target.value)} className="h-10 w-[165px] shrink-0 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm">
			<option value="all">{filterActivity === 'all' ? '✓ ' : ''}All Activities</option>
			{activityOptions.map((a) => (<option key={a} value={a}>{filterActivity === a ? '✓ ' : ''}{a}</option>))}
		</select>
		<select value="" onChange={(e) => { const v = e.target.value; if (!v) return; setFilterFarmIds((prev) => (prev.includes(v) ? prev.filter((id) => id !== v) : [...prev, v])); }} className="h-10 w-[145px] shrink-0 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm">
			<option value="">{filterFarmIds.length > 0 ? `${filterFarmIds.length} farm${filterFarmIds.length > 1 ? 's' : ''} selected` : 'Add farm'}</option>
			{farmOptions.map((f) => (<option key={f} value={f}>{filterFarmIds.includes(f) ? '✓ ' : ''}{farmerNames[f] || f}</option>))}
		</select>
		<button
			type="button"
			onClick={() => {
				setFilterBlockId('all');
				setFilterCropType('all');
				setFilterActivity('all');
				setFilterFarmIds([]);
			}}
			className="h-10 shrink-0 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-gray-50"
		>
			Clear
		</button>
	</div>
</div>

<div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
	<div className="flex items-center gap-3 bg-white border border-gray-200 px-3 py-2 rounded-lg shadow-sm">
		<div className="flex items-center gap-4">
			<div className="flex items-center gap-3">
				<div className="w-3 h-3 bg-green-600 rounded-sm shadow-sm" />
				<span className="text-xs font-semibold text-slate-700">All Done</span>
			</div>
			<div className="flex items-center gap-3">
				<div className="w-3 h-3 bg-orange-100 border border-orange-200 rounded-sm" />
				<span className="text-xs font-semibold text-slate-700">Pending</span>
			</div>
			<div className="flex items-center gap-3">
				<div className="w-3 h-3 bg-red-100 border border-red-200 rounded-sm" />
				<span className="text-xs font-semibold text-slate-700">Overdue</span>
			</div>
		</div>
	</div>
</div>

{/* ✅ REMOVED: Weekly Field Visit Calendar Section (Horizontal Strip) */}
{/* Inline Timeline is displayed when month progress is clicked */}
{!loading && !error && timelineMonth && (
<InlineTimeline
activities={filteredActivitiesData}
monthDate={timelineMonth}
onClose={() => setTimelineMonth(null)}
/>
)}

{!loading && !error && (
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
{monthsToDisplay.map((monthDate, index) => (
<MonthCard
key={index}
monthDate={monthDate}
activities={filteredActivitiesData}
onDateClick={handleDateClick}
currentDateKey={currentDateKey}
pendingByDate={pendingByDate}
onFieldVisitClick={(m) =>
setTimelineMonth((prev) => {
if (prev && prev.getFullYear() === m.getFullYear() && prev.getMonth() === m.getMonth()) return null;
return new Date(m);
})
}
/>
))}
</div>
)}

{/* --- MODALS --- */}
{isModalOpen && selectedDate && (
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
<div ref={taskModalRef} className="bg-[#FBF6F0] border border-[#B1B7AB] w-full max-w-4xl rounded-xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[85vh]">
<div className="flex items-center justify-between px-5 py-4 border-b border-[#276152] bg-[#0D3A35] text-white shrink-0">
<div className="flex flex-col">
<h2 className="text-lg font-bold flex items-center gap-2"><CalendarIcon className="w-5 h-5 text-white/80" /><span>{new Date(selectedDate).toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })}</span></h2>
<div className="mt-1 flex items-center gap-3 text-sm text-white/75">
<span>Total Tasks: <span className="font-semibold text-white">{selectedActivities.length}</span></span>
<span className="text-white/40">•</span>
<span>Pending: <span className="font-semibold text-[#B1B7AB]">{selectedActivities.filter((act) => isTaskPending(act)).length}</span></span>
{approvalSummary.eligible > 0 && (
<>
<span className="text-white/40">•</span>
<span>Supervisor Approval: <span className={cn("font-semibold", approvalSummary.sup_pending > 0 ? "text-[#B1B7AB]" : "text-white")}>{approvalSummary.sup_pending > 0 ? `${approvalSummary.sup_pending} pending` : 'done'}</span></span>
<span className="text-white/40">•</span>
<span>Field Manager Approval: <span className={cn("font-semibold", approvalSummary.fm_pending > 0 ? "text-[#B1B7AB]" : "text-white")}>{approvalSummary.fm_pending > 0 ? `${approvalSummary.fm_pending} pending` : 'done'}</span></span>
</>
)}
</div>
</div>
<button onClick={closeModal} className="text-white/75 hover:text-white p-2 rounded-md hover:bg-white/10 transition-colors"><X className="w-5 h-5" /></button>
</div>

<div className="flex-1 overflow-hidden flex flex-col bg-[#FBF6F0]">
<div className="overflow-y-auto flex-1">
{selectedActivities.length > 0 ? (
<div className="divide-y divide-border">
{selectedActivityGroups.map((group) => {
const isExpanded = !collapsedActivityGroups[group.key];
const groupSelectedCount = group.tasks.filter((task) => !!selectedTaskKeys[getTaskKey(task)]).length;
const isMultiSelect = !!multiSelectGroups[group.key];
return (
<div key={group.key} className="bg-[#FBF6F0]">
<div
role="button"
tabIndex={0}
onClick={() => setCollapsedActivityGroups((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
onKeyDown={(e) => {
if (e.key === 'Enter' || e.key === ' ') {
e.preventDefault();
setCollapsedActivityGroups((prev) => ({ ...prev, [group.key]: !prev[group.key] }));
}
}}
className="grid w-full cursor-pointer grid-cols-[40px_1.5fr_2.9fr_40px] gap-x-4 border-b border-[#276152]/20 bg-[#0D3A35]/5 px-5 py-2 text-left transition-colors hover:bg-[#0D3A35]/10"
>
<div className="flex items-center justify-center text-[#0D3A35]">
{isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
</div>
<div className="flex min-w-0 items-center gap-2">
<div className="shrink-0 rounded-md border border-[#276152]/20 bg-[#FBF6F0] p-1 text-[#0D3A35]">{getActivityIcon(group.activity)}</div>
<div className="min-w-0">
<div className="truncate text-sm font-extrabold text-slate-950">{group.activity}</div>
<div className="text-[10px] font-semibold text-[#276152]">{group.tasks.length} task{group.tasks.length === 1 ? '' : 's'}{groupSelectedCount > 0 ? ` • ${groupSelectedCount} selected` : ''}</div>
</div>
</div>
<div className="flex flex-nowrap items-center gap-1.5">
<span className="rounded-full border border-[#0D3A35]/30 bg-white px-2.5 py-1 text-[11px] font-bold text-[#0D3A35] whitespace-nowrap">{group.totalAcres.toFixed(2)} Acres</span>
<span className="rounded-full border border-[#0D3A35]/30 bg-white px-2.5 py-1 text-[11px] font-bold text-[#0D3A35] whitespace-nowrap">{group.tasks.reduce((sum, task) => sum + (Array.isArray(task.assignments) ? task.assignments.flatMap((a) => a.plot || []).length : 0), 0)} Plots</span>
<span className="rounded-full border border-[#0D3A35]/30 bg-white px-2.5 py-1 text-[11px] font-bold text-[#0D3A35] whitespace-nowrap">Assigned {group.assigned}</span>
<span className="rounded-full border border-[#276152]/30 bg-white px-2.5 py-1 text-[11px] font-bold text-[#276152] whitespace-nowrap">Pending {group.pending}</span>
<span className="rounded-full border border-[#276152]/30 bg-white px-2.5 py-1 text-[11px] font-bold text-[#0D3A35] whitespace-nowrap">Done {group.done}</span>
{group.overdue > 0 && <span className="rounded-full border border-[#0D3A35] bg-white px-2.5 py-1 text-[11px] font-bold text-[#0D3A35] whitespace-nowrap">Overdue {group.overdue}</span>}
</div>
<div className="flex items-center justify-center">
{isExpanded && (
<button
type="button"
onClick={(e) => {
e.stopPropagation();
setMultiSelectGroups((prev) => ({ ...prev, [group.key]: !prev[group.key] }));
}}
className={cn(
"flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
isMultiSelect
? "border-[#0D3A35] bg-[#0D3A35] text-white"
: "border-[#0D3A35]/30 bg-white text-[#0D3A35] hover:bg-[#0D3A35]/10"
)}
title="Select multiple tasks"
>
<ListChecks className="h-4 w-4" />
</button>
)}
</div>
</div>
{isExpanded && (
<div className="divide-y divide-gray-200">
{group.tasks.map((act, idx) => {
const taskKey = getTaskKey(act);
const pendingTask = isTaskPending(act);
const completedTask = isTaskCompleted(act);
const contractTask = isTaskContractFarm(act);
const rentalTask = isTaskRental(act);
const overdueTask = !completedTask && isTaskOverdue(act);
const isFieldVisit = isFieldVisitActivity(String(act?.activity || ''));
const supApproved = Array.isArray(act.assignments) ? act.assignments.some((a) => isSupervisorApprovedAssignmentStatus(a?.status)) : false;
const fmApproved = Array.isArray(act.assignments) ? act.assignments.some((a) => isFieldManagerApprovedAssignmentStatus(a?.status)) : false;
const totalArea = Array.isArray(act.assignments) ? act.assignments.reduce((sum, a) => sum + (Number(a.assigned_area) || 0), 0) : 0;
const farmMeta = farmsById[act.farm_id];
const landLocation = [farmMeta?.land_data?.village, farmMeta?.land_data?.district].filter(Boolean).join(', ');
const assignedTask = Array.isArray(act.assignments) && act.assignments.some((a) => normalizeAssignmentStatus(a?.status) !== 'unassigned');
const contact = contactsById[act.farm_id];
const supText = contact?.supervisorName
? [contact.supervisorName, contact.supervisorContact].filter(Boolean).join(', ')
: '—';
const fmText = contact?.fieldManagers.length
? contact.fieldManagers.map(fm => [fm.name, fm.contact].filter(Boolean).join(', ')).join(' | ')
: '—';
return (
<div key={taskKey || `${group.key}-${idx}`} className="group bg-white transition-colors hover:bg-gray-50">
<div className="grid grid-cols-[70px_2.2fr_0.85fr_0.85fr_0.85fr_250px] gap-x-4 px-5 py-4 items-center">
<div className="flex justify-center pt-0.5">
{isMultiSelect ? (
<button
type="button"
onClick={() => setSelectedTaskKeys((prev) => {
const next = { ...prev };
if (next[taskKey]) delete next[taskKey];
else next[taskKey] = true;
return next;
})}
className={cn(
"flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors",
selectedTaskKeys[taskKey]
? "border-[#0D3A35] bg-[#0D3A35] text-white"
: "border-[#276152]/30 bg-white text-transparent hover:border-[#0D3A35]"
)}
title="Select task"
>
<Check className="h-3.5 w-3.5" />
</button>
) : (
<span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#276152]/20 bg-white text-xs font-extrabold text-[#0D3A35]">{idx + 1}</span>
)}
</div>
<div className="min-w-0">
<div className="flex flex-wrap items-center gap-2">
<span className="text-[13px] font-extrabold text-[#0D3A35]">
{farmerNames[act.farm_id] || act.farm_id || '—'}
</span>
</div>
<div className="mt-1 flex w-full min-w-0 items-center gap-1 text-[12px] font-semibold text-[#276152]">
<MapPin className="h-3 w-3 shrink-0 text-[#276152]" />
<span className="truncate">{landLocation || '—'}</span>
</div>
{assignedTask && (
<div className="mt-1.5 flex min-w-0 flex-col gap-0.5 text-[11px] font-semibold text-[#0D3A35]">
<div className="flex min-w-0 items-center gap-1.5">
<User className="h-3 w-3 shrink-0 text-[#276152]" />
<span className="shrink-0 text-[#276152]">Assigned Supervisor:</span>
<span className="truncate">{supText}</span>
</div>
<div className="flex min-w-0 items-center gap-1.5">
<User className="h-3 w-3 shrink-0 text-[#276152]" />
<span className="shrink-0 text-[#276152]">Field Manager:</span>
<span className="truncate">{fmText}</span>
</div>
</div>
)}
</div>
<div className="text-center text-sm font-bold text-[#0D3A35]">{totalArea.toFixed(2)} <span className="text-xs text-[#276152]">Acres</span></div>
{/* Assigned Plots column */}
{(() => {
const plots = act.assignments.flatMap((a) => a.plot || []);
const isViewing = viewPlotsTaskKey === taskKey;
return (
<div className="relative flex justify-center">
{plots.length > 0 ? (
<button
type="button"
onClick={() => setViewPlotsTaskKey(isViewing ? null : taskKey)}
className={cn(
"inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-semibold transition-colors",
isViewing
? "bg-[#276152] text-white border-[#276152]"
: "bg-white text-[#276152] border-[#276152]/30 hover:bg-[#276152] hover:text-white"
)}
>
{plots.length} {plots.length === 1 ? 'Plot' : 'Plots'}
<Eye className="w-3 h-3 shrink-0" />
</button>
) : (
<span className="text-[11px] text-[#276152]">—</span>
)}
{isViewing && plots.length > 0 && (
<div className="absolute top-full left-0 mt-1.5 z-[80] w-64 overflow-hidden rounded-lg border border-[#276152]/25 bg-white shadow-xl">
<div className="flex items-center justify-between px-3 py-2 border-b border-[#276152]/20 bg-[#0D3A35]">
<span className="text-[11px] font-bold text-white uppercase tracking-wide flex items-center gap-1">
<MapPin className="w-3 h-3" /> Assigned Plots
</span>
<button type="button" onClick={() => setViewPlotsTaskKey(null)} className="text-white/70 hover:text-white">
<X className="w-3.5 h-3.5" />
</button>
</div>
<div className="grid grid-cols-[32px_1fr_70px] gap-x-2 border-b border-[#276152]/15 bg-slate-50 px-3 py-1.5">
<span className="text-center text-[9px] font-bold uppercase tracking-wide text-[#276152]">#</span>
<span className="text-center text-[9px] font-bold uppercase tracking-wide text-[#276152]">Plot Name</span>
<span className="text-center text-[9px] font-bold uppercase tracking-wide text-[#276152]">Area</span>
</div>
<div className="max-h-48 divide-y divide-slate-100 overflow-y-auto">
{plots.map((p, pi) => (
<div key={p.plot_id} className="grid grid-cols-[32px_1fr_70px] gap-x-2 px-3 py-1.5 hover:bg-slate-50">
<span className="text-center text-[11px] font-semibold text-[#0D3A35]">{pi + 1}</span>
<span className="truncate text-center text-[11px] font-medium text-[#0D3A35]">{p.plot_name}</span>
<span className="text-center text-[10px] font-mono text-[#276152]">{p.plot_area} ac</span>
</div>
))}
</div>
</div>
)}
</div>
);
})()}
<div className="flex justify-center">
{(() => {
const status = overdueTask
? { label: 'Overdue', className: 'border-[#0D3A35] bg-[#0D3A35] text-white' }
: completedTask
? { label: 'Completed', className: 'border-[#276152]/30 bg-[#FBF6F0] text-[#0D3A35]' }
: contractTask
? { label: 'Contract Farm', className: 'border-[#E9D986] bg-[#FFF8D8] text-[#0D3A35]' }
: rentalTask
? { label: 'Rental', className: 'border-sky-200 bg-sky-50 text-sky-700' }
: pendingTask
? { label: 'Pending', className: 'border-[#276152]/30 bg-[#276152] text-white' }
: assignedTask
? { label: 'Assigned', className: 'border-[#0D3A35]/30 bg-[#0D3A35]/10 text-[#0D3A35]' }
: { label: 'Unassigned', className: 'border-slate-200 bg-slate-100 text-slate-500' };
return (
<span className={cn('rounded-full border px-2 py-1 text-[10px] font-bold whitespace-nowrap', status.className)}>
{status.label}
</span>
);
})()}
</div>
<div className="flex items-end justify-center gap-3">
<div className="flex flex-col items-center gap-1">
<button
type="button"
onClick={() => handleAssignSingleTaskClick(act)}
disabled={!isTaskAssignable(act)}
className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#276152]/30 bg-white text-[#276152] transition-colors hover:bg-[#276152] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-[#276152]"
title="Assign task"
>
<User className="h-4 w-4" />
</button>
<span className="text-[10px] font-semibold leading-none text-[#276152]">Assign</span>
</div>
<div className="flex flex-col items-center gap-1">
<button
type="button"
onClick={(e) => {
if (dateSwapTaskKey === taskKey) {
setDateSwapTaskKey(null);
setDateSwapValue('');
setDateSwapPopupPos(null);
return;
}
setDateSwapTaskKey(taskKey);
setDateSwapValue(selectedDate || '');
const btnRect = e.currentTarget.getBoundingClientRect();
const modalRect = taskModalRef.current?.getBoundingClientRect();
if (modalRect) {
setDateSwapPopupPos({
top: Math.max(16, btnRect.top - 8),
left: modalRect.right + 14,
});
}
}}
className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-sky-200 bg-white text-sky-600 hover:bg-sky-50 transition-colors"
title="Prepone / Postpone"
>
<CalendarIcon className="w-4 h-4" />
</button>
<span className="text-[10px] font-semibold text-sky-700 leading-none">Swap Date</span>
</div>
{normalizeAssignmentStatus(act.assignments[0]?.status) !== 'unassigned' && (
<div className="flex flex-col items-center gap-1">
<button
type="button"
onClick={() => setMonitorTask({
activity:   act.activity,
date:       selectedDate!,
farm_id:    act.farm_id,
farmerName: farmerNames[act.farm_id] || act.farm_id,
block_id:   act.block_id,
totalArea,
assignments: act.assignments,
task_id:    act.assignments.find(a => a.task_id)?.task_id,
})}
className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-[#276152]/30 bg-white text-[#276152] hover:bg-[#276152] hover:text-white transition-colors"
title="Monitor task progress"
>
<Monitor className="w-4 h-4" />
</button>
<span className="text-[10px] font-semibold text-[#276152] leading-none">Monitor</span>
</div>
)}
<div className="flex flex-col items-center gap-1">
<button
type="button"
onClick={() => setMapViewTask({
activity:   act.activity,
date:       selectedDate!,
farm_id:    act.farm_id,
farmerName: farmerNames[act.farm_id] || act.farm_id,
plots:      act.assignments.flatMap((a) => (a.plot ?? []).map((p) => ({
plot_id:   p.plot_id,
plot_name: p.plot_name,
plot_area: p.plot_area,
}))),
})}
className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-[#7A2533]/30 bg-white text-[#7A2533] hover:bg-[#7A2533] hover:text-white transition-colors"
title="View plot map"
>
<MapIcon className="w-4 h-4" />
</button>
<span className="text-[10px] font-semibold text-[#7A2533] leading-none">Map View</span>
</div>
<div className="flex flex-col items-center gap-1">
<button
type="button"
onClick={() => {
if (!selectedDate) return;
setActivitiesData((prev) => {
const list = prev[selectedDate] || [];
return { ...prev, [selectedDate]: list.filter((item) => getTaskKey(item) !== taskKey) };
});
setSelectedTaskKeys((prev) => {
const next = { ...prev };
delete next[taskKey];
return next;
});
toast.success('Task deleted');
}}
className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50"
title="Delete task"
>
<Trash2 className="h-4 w-4" />
</button>
<span className="text-[10px] font-semibold leading-none text-red-600">Delete</span>
</div>
</div>
</div>
</div>
);
})}
</div>
)}
</div>
);
})}
</div>
) : (
<div className="h-full flex flex-col items-center justify-center text-[#276152] p-8"><ClipboardList className="w-10 h-10 mb-2 opacity-40" /><p className="text-sm">No scheduled activities for this date.</p></div>
)}
</div>
</div>

{Object.values(multiSelectGroups).some(Boolean) && (
<div className="p-4 border-t border-[#276152]/25 bg-[#FBF6F0] flex justify-between items-center shrink-0">
<div className="text-xs text-[#276152]"><span className="font-medium text-[#0D3A35]">{allSelectedKeys.filter((k) => !!selectedTaskKeys[k]).length}</span> tasks selected</div>
<div className="flex gap-2">
<button onClick={closeModal} className="px-4 py-2 text-sm font-medium border border-[#B1B7AB] rounded-md bg-[#FBF6F0] text-[#0D3A35] hover:bg-[#B1B7AB]/25 transition-colors">Cancel</button>
{anyAssignableSelected ? <button type="button" onClick={handleAssignTasksClick} className="px-4 py-2 text-sm font-medium rounded-md transition-colors bg-[#0D3A35] hover:bg-[#276152] text-white">Assign Task</button> : <span className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md bg-[#B1B7AB] text-[#0D3A35] border border-[#276152]/25">Not Assignable</span>}
</div>
</div>
)}
</div>
{dateSwapTaskKey && dateSwapPopupPos && (
<div
className="fixed z-[70] w-64 rounded-lg border border-[#276152]/30 bg-[#FBF6F0] shadow-2xl p-3"
style={{ top: `${dateSwapPopupPos.top}px`, left: `${dateSwapPopupPos.left}px` }}
>
<div className="text-xs font-semibold text-[#0D3A35] mb-1">Change Task Date</div>
<div className="text-[11px] text-[#276152] mb-2">Pick a new date to prepone or postpone this task.</div>
<div className="space-y-2">
<div>
<label className="text-[10px] font-medium text-[#276152]">Current Date</label>
<div className="mt-1 h-8 rounded-md border border-[#B1B7AB] bg-[#B1B7AB]/25 px-2 text-xs flex items-center text-[#0D3A35]">
{selectedDate}
</div>
</div>
<div>
<label className="text-[10px] font-medium text-[#276152]">New Date</label>
<input
type="date"
value={dateSwapValue}
onChange={(e) => setDateSwapValue(e.target.value)}
className="mt-1 h-8 w-full rounded-md border border-[#B1B7AB] bg-[#FBF6F0] px-2 text-xs text-[#0D3A35] focus:border-[#276152] focus:outline-none"
/>
</div>
<div className="pt-1 flex justify-end gap-2">
<button
type="button"
onClick={() => {
setDateSwapTaskKey(null);
setDateSwapValue('');
setDateSwapPopupPos(null);
}}
className="h-7 px-2 rounded-md border border-[#B1B7AB] bg-[#FBF6F0] text-[11px] font-medium text-[#0D3A35] hover:bg-[#B1B7AB]/25"
>
Cancel
</button>
<button
type="button"
onClick={handleApplyDateSwap}
className="h-7 px-2 rounded-md bg-[#0D3A35] text-white text-[11px] font-medium hover:bg-[#276152]"
>
Apply
</button>
</div>
</div>
</div>
)}
</div>
)}

{/* --- ASSIGNMENT MODAL (Overlay) --- */}
{isAssignmentOpen && selectedDate && (
<div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/65 backdrop-blur-[2px] p-4">
<div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]">
<div className="flex items-center justify-between p-4 border-b border-[#276152]/20 bg-[#0D3A35]">
<div>
<h3 className="text-lg font-semibold text-white">Assign Resources</h3>
<p className="text-sm text-white/70">Staff, Vendor & Item • {new Date(selectedDate).toDateString()}</p>
</div>
<button onClick={closeAssignmentModal} className="p-1 hover:bg-white/10 rounded-md"><X className="w-5 h-5 text-white/80" /></button>
</div>

<div className="flex-1 overflow-y-auto bg-[#FBF6F0] p-6 space-y-8">
<div>
<h4 className="mb-3 text-sm font-bold text-[#0D3A35] uppercase tracking-wide flex items-center gap-2">
<User className="w-4 h-4" /> Assign Staff
</h4>
{isLoadingStaff ? (
<div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground bg-white rounded-lg border border-[#276152]/15">
<div className="w-4 h-4 border-2 border-[#276152] border-t-transparent rounded-full animate-spin" />
Loading staff…
</div>
) : (
<div className="grid gap-6 md:grid-cols-2">
<div>
<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#276152]">Supervisor</p>
<div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
{availableSupervisors.length === 0 ? (
<div className="p-3 text-sm text-muted-foreground bg-white rounded-lg border border-dashed border-gray-200">No supervisors found.</div>
) : availableSupervisors.map((s) => {
const isSelected = selectedSupervisorId === s.supervisor_id;
return (
<button
key={s.supervisor_id}
type="button"
onClick={() => setSelectedSupervisorId(s.supervisor_id)}
className={cn(
"w-full flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left transition-all",
isSelected ? "border-[#0D3A35] bg-[#0D3A35]/5" : "border-gray-200 bg-white hover:border-[#0D3A35]/30 hover:bg-[#0D3A35]/5"
)}
>
<div className="flex min-w-0 items-baseline gap-1.5">
<span className="truncate text-xs font-semibold text-slate-800">{s.name}</span>
<span className="shrink-0 text-[10px] text-slate-500">{s.phone}</span>
</div>
{isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[#0D3A35]" />}
</button>
);
})}
</div>
</div>
<div>
<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#276152]">Field Manager(s)</p>
<div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
{availableFieldManagers.length === 0 ? (
<div className="p-3 text-sm text-muted-foreground bg-white rounded-lg border border-dashed border-gray-200">No field managers found.</div>
) : availableFieldManagers.map((m) => {
const isSelected = selectedFieldManagerIds.includes(m.manager_id);
return (
<button
key={m.manager_id}
type="button"
onClick={() => setSelectedFieldManagerIds((prev) => prev.includes(m.manager_id) ? prev.filter((id) => id !== m.manager_id) : [...prev, m.manager_id])}
className={cn(
"w-full flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left transition-all",
isSelected ? "border-[#0D3A35] bg-[#0D3A35]/5" : "border-gray-200 bg-white hover:border-[#0D3A35]/30 hover:bg-[#0D3A35]/5"
)}
>
<div className="flex min-w-0 items-baseline gap-1.5">
<span className="truncate text-xs font-semibold text-slate-800">{m.name}</span>
<span className="shrink-0 text-[10px] text-slate-500">{m.phone}</span>
</div>
{isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[#0D3A35]" />}
</button>
);
})}
</div>
</div>
</div>
)}
</div>

<div className="border-t border-[#276152]/20 pt-8">
<div className="mb-3 flex items-center justify-between">
<h4 className="text-sm font-bold text-[#0D3A35] uppercase tracking-wide flex items-center gap-2">
<User className="w-4 h-4" /> Self Work / Vendor Scope
</h4>
<div className="flex items-center rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold shadow-sm">
<button type="button" onClick={() => setVendorSectionTab('self')} className={cn("px-3 py-1.5 flex items-center gap-1.5 transition-colors", vendorSectionTab === 'self' ? "bg-[#0D3A35] text-white" : "bg-white text-gray-600 hover:bg-gray-50")}>
<Truck className="w-3 h-3" /> Self Work
</button>
<button type="button" onClick={() => setVendorSectionTab('vendor')} className={cn("px-3 py-1.5 flex items-center gap-1.5 border-l border-gray-200 transition-colors", vendorSectionTab === 'vendor' ? "bg-[#0D3A35] text-white" : "bg-white text-gray-600 hover:bg-gray-50")}>
<User className="w-3 h-3" /> Vendor Scope
</button>
</div>
</div>
{vendorSectionTab === 'self' ? (
<div className="space-y-6">
<div>
<div className="flex items-center justify-between mb-2">
<p className="text-xs font-semibold uppercase tracking-wide text-[#0D3A35] flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> Select Vehicles</p>
{selectedVehicleIds.length > 0 && (
<span className="text-xs font-medium text-[#0D3A35] bg-[#0D3A35]/10 px-2 py-0.5 rounded border border-[#0D3A35]/20">{selectedVehicleIds.length} Selected</span>
)}
</div>
<div className="overflow-x-auto bg-white rounded-lg border border-border shadow-sm p-4">
<div className="min-w-[600px]">
<div className="grid grid-cols-[1.5fr_repeat(5,1fr)] gap-2 mb-4 text-xs font-semibold text-muted-foreground">
<div className="self-end pb-2">Vehicle Name</div>
{chartDates.map(date => <div key={date} className={cn("text-center pb-2 border-b-2", date === selectedDate ? "border-[#0D3A35] text-[#0D3A35]" : "border-transparent")}><div className="text-[10px] uppercase">{getDayName(date)}</div><div>{getDayNum(date)}</div></div>)}
</div>
<div className="space-y-2">
{isLoadingVehiclesForAssignment ? <div className="p-4 text-sm text-muted-foreground">Loading vehicles…</div> : vehiclesForAssignment.length === 0 ? <div className="p-4 text-sm text-muted-foreground">No vehicles found.</div> : vehiclesForAssignment.map(vehicle => <VehicleAvailabilityRow key={vehicle.id} asset={vehicle} isSelected={selectedVehicleIds.includes(vehicle.id)} onSelect={() => toggleVehicleSelection(vehicle.id)} />)}
</div>
</div>
</div>
</div>
<div>
<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#0D3A35] flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5" /> Select Equipment</p>
<div className="mb-3">
<input
type="text"
value={equipmentSearchTerm}
onChange={(e) => setEquipmentSearchTerm(e.target.value)}
placeholder="Search equipment by name, ID, category, or unit"
className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
/>
</div>
<div className="max-h-[40vh] overflow-y-auto pr-1">
<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
{isLoadingInventoryItems ? <div className="col-span-full p-4 text-sm text-muted-foreground">Loading inventory items…</div> : filteredInventoryItems.length === 0 ? <div className="col-span-full p-4 text-sm text-muted-foreground">No inventory items found.</div> : filteredInventoryItems.filter((it) => !!getInventoryItemId(it)).map((it) => { const id = getInventoryItemId(it); return <EquipmentQuantityRow key={id} item={it} count={equipmentCounts[id] || 0} />; })}
</div>
</div>
</div>
</div>
) : (
<div className="space-y-2">
{isLoadingScope ? (
<div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground bg-white rounded-lg border border-[#276152]/15">
<div className="w-4 h-4 border-2 border-[#276152] border-t-transparent rounded-full animate-spin" />
Loading vendors for this land…
</div>
) : Object.keys(scopeVendors).length > 0 ? (
<>
<p className="text-xs font-semibold text-[#0D3A35] uppercase tracking-wide flex items-center gap-1.5">
<CheckCircle2 className="w-3.5 h-3.5" /> Select a vendor scoped for this land
</p>
{Object.entries(scopeVendors).map(([vendorId, scope]) => {
const isSelected = selectedTaskVendorId === vendorId;
return (
<button
key={vendorId}
type="button"
onClick={() => {
setSelectedTaskVendorId(vendorId);
setTaskVendor({ name: scope.vendor_details.vendor_name, contact: scope.vendor_details.vendor_contact });
}}
className={cn(
"w-full text-left rounded-lg border p-3 transition-all",
isSelected ? "border-[#0D3A35] bg-[#0D3A35]/5 ring-1 ring-[#0D3A35]/30" : "border-gray-200 bg-white hover:border-[#0D3A35]/30 hover:bg-[#0D3A35]/5"
)}
>
<div className="flex items-start justify-between gap-3">
<div className="min-w-0">
<div className="flex items-center gap-2">
<span className="text-sm font-semibold text-slate-800">{scope.vendor_details.vendor_name}</span>
{isSelected && <span className="text-[10px] font-bold text-white bg-[#0D3A35] px-1.5 py-0.5 rounded">Selected</span>}
</div>
<div className="mt-0.5 text-xs text-slate-500 flex items-center gap-2 flex-wrap">
<span className="font-mono text-slate-400">{vendorId}</span>
{scope.vendor_details.vendor_contact && <span>· {scope.vendor_details.vendor_contact}</span>}
</div>
{scope.activities.length > 0 && (
<div className="mt-1.5 flex flex-wrap gap-1">
{scope.activities.map(a => (
<span key={a} className="text-[10px] px-1.5 py-0.5 bg-[#0D3A35]/10 text-[#0D3A35] border border-[#0D3A35]/20 rounded font-medium">{a}</span>
))}
</div>
)}
</div>
<div className="text-[10px] text-slate-400 text-right shrink-0">
{scope.start_date && <div>{scope.start_date}</div>}
{scope.end_date && <div>→ {scope.end_date}</div>}
</div>
</div>
</button>
);
})}
</>
) : (
<div className="flex flex-col items-center gap-2 py-8 text-center bg-white rounded-lg border border-dashed border-gray-200">
<User className="w-6 h-6 text-gray-300" />
<p className="text-sm text-slate-500 font-medium">No vendor scope found for this land</p>
<p className="text-xs text-slate-400">Assign a vendor in Scope of Work before using this option.</p>
</div>
)}
</div>
)}
</div>

<div className="border-t border-[#276152]/20 pt-8">
{(() => {
const selectedTaskForItem = selectedActivities.find((t) => selectedTaskKeys[getTaskKey(t)] && isTaskAssignable(t));
const taskCrop = String(selectedTaskForItem?.crop_type || '').trim().toLowerCase();
const matchingDosageRows = dosageRows.filter((row) => String(row.cropName || '').trim().toLowerCase() === taskCrop);
return (
<div>
<h4 className="mb-1 text-sm font-bold text-[#0D3A35] uppercase tracking-wide flex items-center gap-2">
<ClipboardList className="w-4 h-4" /> Choose Item
</h4>
<p className="mb-3 text-xs text-muted-foreground">Items configured in Operations Master → Dosage Control for {selectedTaskForItem?.crop_type || 'this crop'}.</p>
{matchingDosageRows.length === 0 ? (
<div className="flex flex-col items-center gap-2 py-8 text-center bg-white rounded-lg border border-dashed border-gray-200">
<ClipboardList className="w-6 h-6 text-gray-300" />
<p className="text-sm text-slate-500 font-medium">No dosage items configured for this crop</p>
<p className="text-xs text-slate-400">Add a dosage row in Operations Master → Dosage Control first.</p>
</div>
) : (
<div className="grid gap-2 md:grid-cols-2">
{matchingDosageRows.map((row) => {
const isSelected = selectedDosageItemRowId === row.id;
return (
<button
key={row.id}
type="button"
onClick={() => setSelectedDosageItemRowId(row.id)}
className={cn(
"w-full text-left rounded-lg border p-3 transition-all",
isSelected ? "border-[#0D3A35] bg-[#0D3A35]/5 ring-1 ring-[#0D3A35]/30" : "border-gray-200 bg-white hover:border-[#0D3A35]/30 hover:bg-[#0D3A35]/5"
)}
>
<div className="flex items-center justify-between gap-2">
<span className="text-sm font-semibold text-slate-800">{row.inventoryItemId}</span>
{isSelected && <span className="text-[10px] font-bold text-white bg-[#0D3A35] px-1.5 py-0.5 rounded">Selected</span>}
</div>
<div className="mt-0.5 text-xs text-slate-500">{row.dosagePerAcre || '0'} {row.uom} / acre</div>
</button>
);
})}
</div>
)}
</div>
);
})()}
</div>

</div>

<div className="p-4 border-t border-[#276152]/20 bg-[#FBF6F0] flex justify-end items-center">
<div className="flex gap-2">
<button onClick={closeAssignmentModal} className="px-4 py-2 text-sm font-medium border border-[#276152]/30 rounded-md bg-white text-[#0D3A35] hover:bg-[#0D3A35]/5 transition-colors">Cancel</button>
<button onClick={handleConfirmAssignment} disabled={isAssigningTask} className="px-4 py-2 text-sm font-medium rounded-md transition-colors bg-[#0D3A35] text-white hover:bg-[#276152]">{isAssigningTask ? 'Assigning…' : 'Confirm Assignment'}</button>
</div>
</div>
</div>
</div>
)}

{/* Task Monitor Modal */}
{monitorTask && (
<TaskMonitorModal
task={monitorTask}
onClose={() => setMonitorTask(null)}
/>
)}

{/* Plot Map View Modal */}
{mapViewTask && (
<PlotMapViewModal
task={mapViewTask}
onClose={() => setMapViewTask(null)}
/>
)}
</div>
);
};

export default CultivationCalendar;
