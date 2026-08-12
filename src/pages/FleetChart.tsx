import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2,
  CircleDashed,
  MapPin, 
  X, 
  Search,
  Calendar as CalendarIcon,
  Warehouse,
  Droplet,
  Clock,
  AlertTriangle,
  Route,
  Edit3,
  User,
  Phone,
  Fuel,
  Lock,
  Unlock,
  Info,
  HelpCircle,
  BookOpen,
  Download
} from 'lucide-react';
import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';
import { toast } from 'sonner';
import { downloadVehicleLogBookAsPdf, type VehicleLogBook } from '@/lib/vehicleLogBookPdf';
import { formatDateDDMMYYYY } from '@/lib/dateFormat';

// --- MAP IMPORTS ---
import { 
  MapContainer, 
  TileLayer, 
  Polygon, 
  Tooltip as LeafletTooltip, 
  useMap,
  LayersControl 
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix Leaflet's default icon path issues
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// --- Types ---

interface ApiVehicle {
  vehicle_id: string;
  vehicle_information?: {
    vehicle_number?: string;
    type?: string;
  };
  driver?: {
    name: string;
    phone: string;
    checkedIn: boolean;
  };
  currentFuelLevel?: number | null; // in Liters (optional; not provided by get_logistics_plan)
}

interface TaskAssignment {
  id: string; // Unique ID for keying
  location_name: string; 
  status: 'active' | 'completed' | 'pending';
  type: 'farm' | 'hub' | 'maintenance';
  geo_boundary?: [number, number][]; 
  center?: [number, number];
  farm_id?: string;
}

interface FuelData {
  input: number;    // Refueled amount (Liters)
  consumed: number; // Used amount (Liters)
}

interface DaySchedule {
  plan_id?: string;
  date: string;
  tasks: TaskAssignment[]; // Support multiple tasks
  fuel?: FuelData;
  // New tracking fields
  initialEngineHours?: number; // from driver
  finalEngineHours?: number; // from driver
  damageChecklist?: string; // from logistics manager - editable
  totalDistance?: number; // from logistics manager - editable
  tasksStatus?: 'completed' | 'pending' | 'partial'; // from driver
  // Locking system
  isLocked?: boolean; // from logistics manager
  damageChecklistTouched?: boolean; // track if damage field was interacted with
}

// Map: VehicleID -> DateString -> DaySchedule
type ScheduleMap = Record<string, Record<string, DaySchedule>>;

type LogisticsWsTaskStatusUpdated = {
  event: 'TASK_STATUS_UPDATED' | string;
  data?: {
    plan_id?: string;
    date?: string;
    activity?: string;
    farm_id?: string;
    status?: string;
  };
};

// --- Helper Functions ---

const getDaysInMonth = (year: number, month: number) => {
  const date = new Date(year, month, 1);
  const days = [];
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};

const formatDateKey = (date: Date) => {
  // IMPORTANT: Use local date parts (not UTC via toISOString), otherwise
  // dates can shift into the previous/next day depending on timezone.
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

type BackendPlanEntry = {
  usage_fuel: number;
  activity: string;
  total_distance: number;
  initial_engine_hours: number;
  input_fuel: number;
  final_engine_hours: number;
  locked: boolean;
  damage_notes: string;
  status: string;
  farm_id: string;
};

type BackendVehiclePlan = {
  plan_id: string;
  vehicle_id: string;
  vehicle_number: string;
  driver_contact?: string;
  driver_name?: string;
  plan: Record<string, BackendPlanEntry[]>;
  trip_status?: string | null;
  created_at?: string;
};

// --- REAL-WORLD DATA (MUMBAI / MAHARASHTRA) ---

const FIELD_POLYGONS: Record<string, [number, number][]> = {
  // Nashik (Farm A)
  'Farm A (Nashik)': [
    [20.0110, 73.7900], [20.0150, 73.8000], [20.0200, 73.7950], [20.0120, 73.7850]
  ],
  // Pune (Farm B)
  'Farm B (Pune)': [
    [18.3500, 73.8500], [18.3550, 73.8550], [18.3600, 73.8500], [18.3520, 73.8450]
  ],
  // Palghar (Farm C)
  'Farm C (Palghar)': [
    [19.7200, 72.9000], [19.7250, 72.9100], [19.7300, 72.9050], [19.7220, 72.8950]
  ],
  // Alibag (Farm D)
  'Farm D (Alibag)': [
    [18.7000, 73.0500], [18.7050, 73.0600], [18.7100, 73.0550], [18.7020, 73.0450]
  ],
  // Satara (Farm E)
  'Farm E (Satara)': [
    [17.9500, 73.9000], [17.9550, 73.9100], [17.9600, 73.9050], [17.9520, 73.8950]
  ],
  // Hubs
  'Hub Central (Bhiwandi)': [
    [19.3000, 73.0500], [19.3050, 73.0500], [19.3050, 73.0550], [19.3000, 73.0550]
  ],
  'Hub South (Navi Mumbai)': [
    [18.9900, 73.1000], [18.9950, 73.1000], [18.9950, 73.1050], [18.9900, 73.1050]
  ],
  'Transit Hub (Thane)': [
    [19.2000, 72.9800], [19.2020, 72.9820], [19.2020, 72.9780], [19.2000, 72.9780]
  ]
};

const normalizeTaskStatus = (status: string | undefined): 'active' | 'completed' | 'pending' => {
  const s = String(status ?? '').toLowerCase().trim();
  if (s === 'completed') return 'completed';
  if (s === 'pending') return 'pending';
  return 'active';
};

const combineTaskStatuses = (statuses: Array<'active' | 'completed' | 'pending'>): 'completed' | 'pending' | 'partial' => {
  if (statuses.length === 0) return 'pending';
  const allCompleted = statuses.every((s) => s === 'completed');
  if (allCompleted) return 'completed';
  const allPending = statuses.every((s) => s === 'pending');
  if (allPending) return 'pending';
  return 'partial';
};

const normalizeKey = (value: unknown) => String(value ?? '').trim().toLowerCase();

const toBooleanSafe = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const s = normalizeKey(value);
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === '') return false;
  // Fallback: treat any other non-empty string as truthy
  return Boolean(s);
};

const toDateKeySafe = (raw: unknown) => {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  // Most payloads come as YYYY-MM-DD; still guard for ISO timestamps.
  return s.length >= 10 ? s.slice(0, 10) : s;
};

const fetchLogisticsPlan = async (): Promise<{ vehicles: ApiVehicle[]; schedule: ScheduleMap }> => {
  const base = getBaseUrl().replace(/\/$/, '');
  const url = `${base}/admin_vehicles/get_logistics_plan`;

  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  let data: any = null;
  try {
    data = await resp.json();
  } catch {
    // ignore
  }

  if (!resp.ok) {
    const message = data?.message || data?.error || `Server responded ${resp.status}`;
    throw new Error(message);
  }

  const list: Array<Record<string, BackendVehiclePlan>> = Array.isArray(data) ? data : [];
  // The backend can return more than one plan entry for the same vehicle (e.g. separate
  // dispatch bookings) — key by vehicle_id so every booking folds into one row instead of
  // spawning a duplicate row per booking.
  const vehicleMap = new Map<string, ApiVehicle>();
  const schedule: ScheduleMap = {};

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const entries = Object.entries(item);
    for (const [vehicleNumberKey, planObj] of entries) {
      if (!planObj || typeof planObj !== 'object') continue;
      const vehicleId = String(planObj.vehicle_id ?? vehicleNumberKey);
      const vehicleNumber = String(planObj.vehicle_number ?? vehicleNumberKey);
      const driverName = String(planObj.driver_name ?? '—');
      const driverPhone = String(planObj.driver_contact ?? '—');
      const checkedIn = Boolean(planObj.trip_status);

      const existingVehicle = vehicleMap.get(vehicleId);
      if (!existingVehicle) {
        vehicleMap.set(vehicleId, {
          vehicle_id: vehicleId,
          vehicle_information: { vehicle_number: vehicleNumber, type: '—' },
          driver: { name: driverName, phone: driverPhone, checkedIn },
          currentFuelLevel: null,
        });
      } else if (existingVehicle.driver?.name === '—' && driverName !== '—') {
        existingVehicle.driver = { name: driverName, phone: driverPhone, checkedIn };
      }

      const plan = planObj.plan && typeof planObj.plan === 'object' ? planObj.plan : {};
      schedule[vehicleId] = schedule[vehicleId] || {};

      for (const [dateKey, dayEntriesRaw] of Object.entries(plan)) {
        // Support two shapes:
        // 1) dateKey: [ { ...entry... }, ... ] (legacy)
        // 2) dateKey: { usage_fuel, plans: [ { locked, activity, status, farm_id }, ... ], total_distance, ... }
        const raw: any = dayEntriesRaw;

        let dayEntriesArray: any[] = [];
        if (Array.isArray(raw)) {
          dayEntriesArray = raw;
        } else if (raw && Array.isArray(raw.plans)) {
          dayEntriesArray = raw.plans;
        } else {
          dayEntriesArray = [];
        }

        // skip if no task entries and no top-level data
        const hasTopLevelData = raw && (raw.total_distance != null || raw.input_fuel != null || raw.usage_fuel != null || raw.initial_engine_hours != null || raw.final_engine_hours != null || (raw.plans && raw.plans.length));
        if (dayEntriesArray.length === 0 && !hasTopLevelData) continue;

        const tasks: TaskAssignment[] = dayEntriesArray.map((e: any, idx: number) => ({
          id: `${vehicleId}-${dateKey}-${idx}-${e?.farm_id ?? 'farm'}`,
          location_name: String(e?.activity ?? e?.location_name ?? 'Activity'),
          status: normalizeTaskStatus(e?.status),
          type: 'farm',
          farm_id: e?.farm_id ? String(e.farm_id) : undefined,
        }));

        // Totals: prefer top-level fields if present, otherwise aggregate from entries
        const totalDistance = Number(raw?.total_distance) || dayEntriesArray.reduce((acc: number, e: any) => acc + (Number(e?.total_distance) || 0), 0);
        const inputFuel = Number(raw?.input_fuel) || dayEntriesArray.reduce((acc: number, e: any) => acc + (Number(e?.input_fuel) || 0), 0);
        const usageFuel = Number(raw?.usage_fuel) || dayEntriesArray.reduce((acc: number, e: any) => acc + (Number(e?.usage_fuel) || 0), 0);

        const initialEngineHours = (raw && Number(raw.initial_engine_hours)) || dayEntriesArray.reduce((min: number | null, e: any) => {
          const v = Number(e?.initial_engine_hours);
          if (Number.isNaN(v)) return min;
          return min == null ? v : Math.min(min, v);
        }, null as number | null);

        const finalEngineHours = (raw && Number(raw.final_engine_hours)) || dayEntriesArray.reduce((max: number | null, e: any) => {
          const v = Number(e?.final_engine_hours);
          if (Number.isNaN(v)) return max;
          return max == null ? v : Math.max(max, v);
        }, null as number | null);

        const damageNotes = (raw && String(raw.damage_notes || '').trim() ? [String(raw.damage_notes).trim()] : []).concat(
          dayEntriesArray.map((e: any) => String(e?.damage_notes ?? '').trim()).filter((s: string) => s.length > 0)
        ).filter(Boolean);

        const isLocked = toBooleanSafe(raw?.locked) || dayEntriesArray.some((e: any) => toBooleanSafe(e?.locked));

        // A vehicle can have more than one plan entry landing on the same date (multiple
        // bookings) — fold them into the existing day instead of overwriting it, so all of
        // that vehicle's tasks for the day show up together in its single row.
        const existingDay = schedule[vehicleId][dateKey];
        const mergedTasks = existingDay ? [...existingDay.tasks, ...tasks] : tasks;
        const mergedStatuses = mergedTasks.map((t) => t.status);

        schedule[vehicleId][dateKey] = {
          plan_id: existingDay?.plan_id ?? (planObj?.plan_id ? String(planObj.plan_id) : undefined),
          date: dateKey,
          tasks: mergedTasks,
          fuel: {
            input: (existingDay?.fuel?.input ?? 0) + inputFuel,
            consumed: (existingDay?.fuel?.consumed ?? 0) + usageFuel,
          },
          totalDistance: (existingDay?.totalDistance ?? 0) + totalDistance,
          initialEngineHours: existingDay?.initialEngineHours
            ? Math.min(existingDay.initialEngineHours, initialEngineHours ?? existingDay.initialEngineHours)
            : (initialEngineHours ?? 0),
          finalEngineHours: Math.max(existingDay?.finalEngineHours ?? 0, finalEngineHours ?? 0),
          damageChecklist: [existingDay?.damageChecklist, damageNotes.join(' | ')].filter(Boolean).join(' | '),
          tasksStatus: combineTaskStatuses(mergedStatuses),
          isLocked: Boolean(existingDay?.isLocked) || isLocked,
          // From API we can safely consider this "checked" even if notes empty
          damageChecklistTouched: true,
        };
      }
    }
  }

  const vehicles = Array.from(vehicleMap.values());
  return { vehicles, schedule };
};

// --- Map Components ---

const RecenterMap = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => { map.setView(center, 13); }, [center, map]); 
  return null;
};

const LocationMapPopup = ({ data, onClose }: { data: TaskAssignment & { vehicle: string, date: string }, onClose: () => void }) => {
  const isHub = data.type === 'hub';
  const hasBoundary = Array.isArray(data.geo_boundary) && data.geo_boundary.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl h-[80vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50 shrink-0">
          <div>
            <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
              {isHub ? <Warehouse className="w-5 h-5 text-purple-600" /> : <MapPin className="w-5 h-5 text-red-600" />}
              {data.location_name}
            </h3>
            <p className="text-sm text-gray-500">
              Vehicle <b>{data.vehicle}</b> • {data.date} • <span className="uppercase text-xs font-bold tracking-wider">{data.type} View</span>
              {data.farm_id ? <span className="text-gray-400"> • Farm: {data.farm_id}</span> : null}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Map */}
        <div className="flex-1 bg-slate-100 relative">
          <MapContainer center={data.center || [19.0760, 72.8777]} zoom={13} style={{ height: "100%", width: "100%" }}>
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="Street Map">
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Satellite">
                <TileLayer
                  attribution='&copy; Esri'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
              </LayersControl.BaseLayer>
            </LayersControl>
            <RecenterMap center={data.center || [19.0760, 72.8777]} />

            {hasBoundary ? (
              <Polygon 
                positions={data.geo_boundary || []} 
                pathOptions={{ 
                  color: isHub ? '#9333ea' : '#ef4444', 
                  fillColor: isHub ? '#a855f7' : '#ef4444', 
                  fillOpacity: 0.3, 
                  weight: 2
                }}
              >
                <LeafletTooltip permanent direction="center" className={cn("border-0 shadow-md text-xs font-bold px-2 py-1 rounded bg-white/90", isHub ? "text-purple-700" : "text-red-700")}>
                  {data.location_name}
                </LeafletTooltip>
              </Polygon>
            ) : null}
          </MapContainer>

          {!hasBoundary ? (
            <div className="absolute bottom-3 left-3 bg-white/90 border border-gray-200 rounded-md px-3 py-2 text-xs text-gray-700 shadow">
              No boundary/map data for this activity.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

// --- Main Component ---

const FleetChart = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [vehicles, setVehicles] = useState<ApiVehicle[]>([]);
  const [schedule, setSchedule] = useState<ScheduleMap>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedCell, setSelectedCell] = useState<(TaskAssignment & { vehicle: string, date: string }) | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Log Book popup (generate + history) for the vehicle currently being acted on
  const [logBookVehicle, setLogBookVehicle] = useState<ApiVehicle | null>(null);
  const [logBookStartDate, setLogBookStartDate] = useState('');
  const [logBookEndDate, setLogBookEndDate] = useState('');
  const [isGeneratingLogBook, setIsGeneratingLogBook] = useState(false);
  const [vehicleLogBooks, setVehicleLogBooks] = useState<VehicleLogBook[]>([]);
  const [isLoadingLogBooks, setIsLoadingLogBooks] = useState(false);

  const lockFleetCard = async (payload: {
    vehicle_id: string;
    date: string;
    distance_traveled: number;
    fuel_consumed: number;
    damage_notes: string;
  }) => {
    const base = getBaseUrl().replace(/\/$/, '');
    const url = `${base}/admin_vehicles/lock_fleet_card`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    let data: any = null;
    try {
      data = await resp.json();
    } catch {
      // ignore
    }

    if (!resp.ok) {
      const message = data?.message || data?.error || `Server responded ${resp.status}`;
      throw new Error(message);
    }

    return data;
  };

  // Fetch a vehicle's past log books whenever the Log Book popup is opened for it
  useEffect(() => {
    if (!logBookVehicle) {
      setVehicleLogBooks([]);
      return;
    }
    let mounted = true;
    setIsLoadingLogBooks(true);
    const base = getBaseUrl().replace(/\/$/, '');
    fetch(`${base}/admin_vehicles/get_log_books/${logBookVehicle.vehicle_id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mounted) return;
        if (data?.success && Array.isArray(data.log_books)) {
          setVehicleLogBooks(data.log_books as VehicleLogBook[]);
        }
      })
      .catch(() => { if (mounted) setVehicleLogBooks([]); })
      .finally(() => { if (mounted) setIsLoadingLogBooks(false); });
    return () => { mounted = false; };
  }, [logBookVehicle]);

  const closeLogBookPopup = () => {
    setLogBookVehicle(null);
    setLogBookStartDate('');
    setLogBookEndDate('');
  };

  const handleGenerateLogBook = async () => {
    if (!logBookVehicle) return;
    if (!logBookStartDate || !logBookEndDate) {
      toast.error('Pick both a start and end date');
      return;
    }
    if (logBookStartDate > logBookEndDate) {
      toast.error('Start date must be on or before the end date');
      return;
    }
    setIsGeneratingLogBook(true);
    try {
      const base = getBaseUrl().replace(/\/$/, '');
      const res = await fetch(`${base}/admin_vehicles/generate_log_book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle_id: logBookVehicle.vehicle_id,
          start_date: logBookStartDate,
          end_date: logBookEndDate,
        }),
      });
      const body: any = await res.json().catch(() => null);
      if (!res.ok || body?.success !== true) throw new Error(body?.detail || body?.message || 'Failed to generate log book');
      setVehicleLogBooks((prev) => [body.log_book as VehicleLogBook, ...prev]);
      setLogBookStartDate('');
      setLogBookEndDate('');
      toast.success('Log book generated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate log book');
    } finally {
      setIsGeneratingLogBook(false);
    }
  };

  const handleDownloadLogBook = async (book: VehicleLogBook) => {
    try {
      await downloadVehicleLogBookAsPdf(book);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate PDF');
    }
  };

  // Keep a ref so websocket callbacks can access latest vehicles list
  const vehiclesRef = useRef<ApiVehicle[]>([]);
  useEffect(() => {
    vehiclesRef.current = vehicles;
  }, [vehicles]);

  const updateScheduleData = (vehicleId: string, date: string, field: string, value: any) => {
    setSchedule(prev => ({
      ...prev,
      [vehicleId]: {
        ...prev[vehicleId],
        [date]: {
          ...prev[vehicleId]?.[date],
          [field]: value
        }
      }
    }));
  };

  // Helper function to check if logistics manager data is complete
  const isDataComplete = (dayData: DaySchedule | undefined) => {
    if (!dayData || !dayData.tasks?.length) return false;
    return (
      dayData.totalDistance !== undefined && 
      dayData.totalDistance > 0 &&
      dayData.damageChecklistTouched === true
    );
  };

  // Helper function to get cell background color
  // Grey = no task assigned, Orange = task assigned (in progress), Green = all tasks completed
  const getCellBackgroundColor = (dayData: DaySchedule | undefined) => {
    if (!dayData || !dayData.tasks?.length) return 'bg-gray-100';
    if (dayData.tasksStatus === 'completed') return 'bg-green-200';
    return 'bg-orange-200';
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { vehicles: vData, schedule: sData } = await fetchLogisticsPlan();
        setVehicles(vData);
        setSchedule(sData);
      } catch (e) {
        console.error(e);
        setVehicles([]);
        setSchedule({});
      }
      setLoading(false);
    };
    load();
  }, []);

  // WebSocket: listen for logistics task status updates and update task state in real-time
  useEffect(() => {
    const base = getBaseUrl().replace(/\/$/, '');
    const wsPath = '/ws/logistics';

    let ws: WebSocket | null = null;
    let reconnectAttempts = 0;
    let stopped = false;

    const buildWsUrl = () => {
      const isHttps = base.startsWith('https');
      const host = base.replace(/^https?:\/\//, '');
      return `${isHttps ? 'wss' : 'ws'}://${host}${wsPath}`;
    };

    const scheduleReconnect = () => {
      if (stopped) return;
      if (reconnectAttempts >= 5) {
        console.warn('WS(/ws/logistics): max reconnect attempts reached');
        return;
      }
      reconnectAttempts += 1;
      const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts));
      setTimeout(() => { if (!stopped) connect(); }, delay);
    };

    const connect = () => {
      const wsUrl = buildWsUrl();
      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        console.warn('WS(/ws/logistics) connection failed', err);
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        reconnectAttempts = 0;
      };

      ws.onmessage = (ev) => {
        try {
          const msg: LogisticsWsTaskStatusUpdated = JSON.parse(ev.data);
          if (normalizeKey(msg?.event) !== 'task_status_updated') return;

          const data = msg?.data || {};
          const dateKey = toDateKeySafe(data.date);
          const activityKey = normalizeKey(data.activity);
          const farmKey = normalizeKey(data.farm_id);
          const statusKey = normalizeKey(data.status);

          if (!dateKey || !activityKey || !farmKey) return;
          if (statusKey !== 'completed') return;

          const toastMessage = `${String(data.activity)} is completed for ${dateKey} in the farm : ${String(data.farm_id)}`;

          setSchedule((prev) => {
            let didChange = false;
            let next: ScheduleMap | null = null;

            for (const [vehicleId, byDate] of Object.entries(prev)) {
              const day = byDate?.[dateKey];
              if (!day || !Array.isArray(day.tasks) || day.tasks.length === 0) continue;

              let touchedThisDay = false;
              const updatedTasks = day.tasks.map((t) => {
                const tActivity = normalizeKey(t.location_name);
                const tFarm = normalizeKey(t.farm_id);
                if (tActivity === activityKey && tFarm === farmKey) {
                  if (t.status !== 'completed') {
                    touchedThisDay = true;
                    didChange = true;
                    return { ...t, status: 'completed' as const };
                  }
                }
                return t;
              });

              if (!touchedThisDay) continue;

              if (!next) next = { ...prev };
              const statuses = updatedTasks.map((t) => t.status);
              next[vehicleId] = {
                ...(next[vehicleId] || byDate),
                [dateKey]: {
                  ...day,
                  tasks: updatedTasks,
                  tasksStatus: combineTaskStatuses(statuses),
                },
              };
            }

            if (didChange) {
              // Avoid calling toast synchronously inside React state calculation.
              queueMicrotask(() => toast.success(toastMessage));
            }

            return next || prev;
          });
        } catch (e) {
          console.debug('WS(/ws/logistics) message parse error', e);
        }
      };

      ws.onerror = (err) => {
        console.warn('WS(/ws/logistics) error', err);
      };

      ws.onclose = (ev) => {
        console.warn('WS(/ws/logistics) closed', ev);
        if (!stopped) scheduleReconnect();
      };
    };

    connect();

    return () => {
      stopped = true;
      try { ws?.close(); } catch { /* ignore */ }
    };
  }, []);

  // WebSocket: listen for driver check-in events and update vehicle state in real-time
  useEffect(() => {
    const base = getBaseUrl().replace(/\/$/, '');
    const wsPath = '/ws/check_in';

    let ws: WebSocket | null = null;
    let reconnectAttempts = 0;
    let stopped = false;

    const buildWsUrl = () => {
      // Ensure we use correct ws/wss scheme and preserve host/path
      const isHttps = base.startsWith('https');
      const host = base.replace(/^https?:\/\//, '');
      return `${isHttps ? 'wss' : 'ws'}://${host}${wsPath}`;
    };

    const scheduleReconnect = () => {
      if (stopped) return;
      if (reconnectAttempts >= 5) {
        console.warn('WS: max reconnect attempts reached');
        return;
      }
      reconnectAttempts += 1;
      const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts));
      console.debug(`WS: reconnect attempt ${reconnectAttempts} in ${delay}ms`);
      setTimeout(() => { if (!stopped) connect(); }, delay);
    };

    const connect = () => {
      const wsUrl = buildWsUrl();
      console.debug('WS connecting to', wsUrl);
      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        console.warn('WS connection failed', err);
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        console.debug('WS connected to', wsUrl);
        reconnectAttempts = 0;
      };

      ws.onmessage = (ev) => {
        // Debug: log everything we receive from the socket
        console.log('[WS] /ws/check_in raw message:', ev.data);
        try {
          const msg = JSON.parse(ev.data);
          console.log('[WS] /ws/check_in parsed message:', msg);
          const eventName = msg?.event || msg?.type || null;

          // Support several shapes: { payload }, { checkin }, or flat
          const raw = msg?.payload ?? msg?.checkin ?? msg;
          const checkin = msg?.checkin ?? raw;

          console.log('[WS] /ws/check_in resolved payload:', {
            eventName,
            raw,
            checkin,
          });

          const vehicleNumber = checkin?.vehicle_number || raw?.vehicle_number || '';
          const staffName = checkin?.staff_name || raw?.staff_name || '';

          const hasCheckin = eventName === 'USER_CHECK_IN' || eventName === 'USER_CHECKIN' || Boolean(checkin?.staff_id) || Boolean(raw?.staff_id);

          if (hasCheckin && vehicleNumber) {
            // Parse optional fields from payload (API has a known typo: intial_engine_hours)
            const rawInitialHours =
              checkin?.initial_engine_hours ??
              raw?.initial_engine_hours ??
              checkin?.intial_engine_hours ??
              raw?.intial_engine_hours ??
              raw?.initialEngineHours ??
              checkin?.initialEngineHours;

            const initialEngineHours = Number(rawInitialHours);
            const safeInitialEngineHours = Number.isFinite(initialEngineHours) ? initialEngineHours : 0;

            // Fuel input requested by driver during check-in
            const rawInputFuel =
              checkin?.input_fuel_requested ??
              raw?.input_fuel_requested ??
              checkin?.inputFuelRequested ??
              raw?.inputFuelRequested ??
              checkin?.input_fuel ??
              raw?.input_fuel;
            const inputFuel = Number(rawInputFuel);
            const safeInputFuel = Number.isFinite(inputFuel) ? inputFuel : null;

            const rawDate = checkin?.date || raw?.date || null;
            const checkinDate = rawDate
              ? toDateKeySafe(rawDate)
              : (checkin?.timestamp ? formatDateKey(new Date(checkin.timestamp)) : null);

            // Resolve vehicleId from the latest vehicles list (row = vehicle number)
            const currentVehicles = vehiclesRef.current;
            const matched = currentVehicles.find((v) => {
              const vNum = (v.vehicle_information?.vehicle_number || '').toString().trim().toLowerCase();
              return vNum && vNum === vehicleNumber.toString().trim().toLowerCase();
            });
            const matchedVehicleId = matched?.vehicle_id || vehicleNumber.toString();

            console.log('[WS] /ws/check_in mapping:', {
              vehicleNumber,
              matchedVehicleId,
              checkinDate,
              safeInitialEngineHours,
              safeInputFuel,
            });

            // Update vehicle check-in badge/name
            setVehicles((prev) =>
              prev.map((v) => {
                const vNum = (v.vehicle_information?.vehicle_number || '').toString().trim().toLowerCase();
                if (vNum && vNum === vehicleNumber.toString().trim().toLowerCase()) {
                  return {
                    ...v,
                    driver: {
                      name: String(staffName || v.driver?.name || '—'),
                      phone: String(v.driver?.phone || '—'),
                      checkedIn: true,
                    },
                  };
                }
                return v;
              })
            );

            // Update the exact cell (column = date) with initial engine hours
            if (checkinDate) {
              setSchedule((prev) => {
                const existingDay = prev[matchedVehicleId]?.[checkinDate];
                const nextFuel =
                  safeInputFuel !== null
                    ? {
                        input: safeInputFuel,
                        consumed: existingDay?.fuel?.consumed ?? 0,
                      }
                    : existingDay?.fuel;
                return {
                  ...prev,
                  [matchedVehicleId]: {
                    ...(prev[matchedVehicleId] || {}),
                    [checkinDate]: {
                      plan_id: existingDay?.plan_id,
                      date: checkinDate,
                      tasks: existingDay?.tasks || [],
                      fuel: nextFuel,
                      initialEngineHours: safeInitialEngineHours,
                      finalEngineHours: existingDay?.finalEngineHours ?? 0,
                      damageChecklist: existingDay?.damageChecklist ?? '',
                      totalDistance: existingDay?.totalDistance,
                      tasksStatus: existingDay?.tasksStatus,
                      isLocked: existingDay?.isLocked,
                      damageChecklistTouched: existingDay?.damageChecklistTouched ?? false,
                    },
                  },
                };
              });
            }

            toast.success(`${staffName || 'Driver'} checked in (${vehicleNumber})`);
          }
        } catch (e) {
          console.debug('WS message parse error', e);
        }
      };

      ws.onerror = (err) => {
        console.warn('WS error', err);
        toast.error('WebSocket error');
      };

      ws.onclose = (ev) => {
        console.warn('WS closed', ev);
        if (!stopped) scheduleReconnect();
      };
    };

    connect();

    return () => { stopped = true; try { ws?.close(); } catch (e) { /* ignore */ } };
  }, []);

  // WebSocket: listen for driver check-out events and update vehicle state in real-time
  useEffect(() => {
    const base = getBaseUrl().replace(/\/$/, '');
    const wsPath = '/ws/check_out';

    let ws: WebSocket | null = null;
    let reconnectAttempts = 0;
    let stopped = false;

    const buildWsUrl = () => {
      const isHttps = base.startsWith('https');
      const host = base.replace(/^https?:\/\//, '');
      return `${isHttps ? 'wss' : 'ws'}://${host}${wsPath}`;
    };

    const scheduleReconnect = () => {
      if (stopped) return;
      if (reconnectAttempts >= 5) {
        console.warn('WS(/ws/check_out): max reconnect attempts reached');
        return;
      }
      reconnectAttempts += 1;
      const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts));
      console.debug(`WS(/ws/check_out): reconnect attempt ${reconnectAttempts} in ${delay}ms`);
      setTimeout(() => { if (!stopped) connect(); }, delay);
    };

    const connect = () => {
      const wsUrl = buildWsUrl();
      console.debug('WS(/ws/check_out) connecting to', wsUrl);
      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        console.warn('WS(/ws/check_out) connection failed', err);
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        console.debug('WS(/ws/check_out) connected to', wsUrl);
        reconnectAttempts = 0;
      };

      ws.onmessage = (ev) => {
        console.log('[WS] /ws/check_out raw message:', ev.data);
        try {
          const msg = JSON.parse(ev.data);
          console.log('[WS] /ws/check_out parsed message:', msg);

          const eventName = msg?.event || msg?.type || null;
          if (normalizeKey(eventName) !== 'user_check_out') return;

          const raw = msg?.checkout ?? msg?.payload ?? msg;
          const checkout = msg?.checkout ?? raw;

          const vehicleNumber = checkout?.vehicle_number || raw?.vehicle_number || '';
          const staffName = checkout?.staff_name || raw?.staff_name || '';

          const rawFinalHours =
            checkout?.final_engine_hours ??
            raw?.final_engine_hours ??
            checkout?.finalEngineHours ??
            raw?.finalEngineHours;
          const finalEngineHours = Number(rawFinalHours);
          const safeFinalEngineHours = Number.isFinite(finalEngineHours) ? finalEngineHours : 0;

          const rawDate = checkout?.date || raw?.date || null;
          const checkoutDate = rawDate
            ? toDateKeySafe(rawDate)
            : (checkout?.timestamp ? formatDateKey(new Date(checkout.timestamp)) : '');

          if (!vehicleNumber) return;

          // Resolve vehicleId from the latest vehicles list (row = vehicle number)
          const currentVehicles = vehiclesRef.current;
          const matched = currentVehicles.find((v) => {
            const vNum = (v.vehicle_information?.vehicle_number || '').toString().trim().toLowerCase();
            return vNum && vNum === vehicleNumber.toString().trim().toLowerCase();
          });
          const matchedVehicleId = matched?.vehicle_id || vehicleNumber.toString();

          console.log('[WS] /ws/check_out mapping:', {
            vehicleNumber,
            matchedVehicleId,
            checkoutDate,
            safeFinalEngineHours,
          });

          // Update vehicle check-in badge/name
          setVehicles((prev) =>
            prev.map((v) => {
              const vNum = (v.vehicle_information?.vehicle_number || '').toString().trim().toLowerCase();
              if (vNum && vNum === vehicleNumber.toString().trim().toLowerCase()) {
                return {
                  ...v,
                  driver: {
                    name: String(staffName || v.driver?.name || '—'),
                    phone: String(v.driver?.phone || '—'),
                    checkedIn: false,
                  },
                };
              }
              return v;
            })
          );

          // Update the exact cell (column = date) with final engine hours
          if (checkoutDate) {
            setSchedule((prev) => {
              const existingDay = prev[matchedVehicleId]?.[checkoutDate];
              return {
                ...prev,
                [matchedVehicleId]: {
                  ...(prev[matchedVehicleId] || {}),
                  [checkoutDate]: {
                    plan_id: existingDay?.plan_id,
                    date: checkoutDate,
                    tasks: existingDay?.tasks || [],
                    fuel: existingDay?.fuel,
                    initialEngineHours: existingDay?.initialEngineHours ?? 0,
                    finalEngineHours: safeFinalEngineHours,
                    damageChecklist: existingDay?.damageChecklist ?? '',
                    totalDistance: existingDay?.totalDistance,
                    tasksStatus: existingDay?.tasksStatus,
                    isLocked: existingDay?.isLocked,
                    damageChecklistTouched: existingDay?.damageChecklistTouched ?? false,
                  },
                },
              };
            });
          }

          toast.success(`${staffName || 'Driver'} checked out (${vehicleNumber})`);
        } catch (e) {
          console.debug('WS(/ws/check_out) message parse error', e);
        }
      };

      ws.onerror = (err) => {
        console.warn('WS(/ws/check_out) error', err);
        toast.error('WebSocket error');
      };

      ws.onclose = (ev) => {
        console.warn('WS(/ws/check_out) closed', ev);
        if (!stopped) scheduleReconnect();
      };
    };

    connect();

    return () => {
      stopped = true;
      try { ws?.close(); } catch { /* ignore */ }
    };
  }, []);

  const days = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const filteredVehicles = vehicles.filter(v => 
    (v.vehicle_information?.vehicle_number || v.vehicle_id).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleMonthChange = (offset: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setCurrentDate(newDate);
  };

  const getCellColor = (type?: string) => {
    switch(type) {
      case 'maintenance': return 'bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700';
      case 'hub': return 'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700';
      default: return 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700';
    }
  };

  const handleHubClick = (vehicleName: string, date: string) => {
    const transitHubPoly = FIELD_POLYGONS['Transit Hub (Thane)'];
    const center = transitHubPoly[0];
    
    setSelectedCell({
      id: 'transit',
      vehicle: vehicleName,
      date: date,
      location_name: "Transit Hub (Thane)",
      status: 'active',
      type: 'hub',
      geo_boundary: transitHubPoly,
      center: center
    });
  };

  return (
    <div className="h-[calc(100vh-1rem)] flex flex-col bg-white overflow-hidden rounded-tl-xl">
      
      {/* Header */}
      <div className="h-16 border-b border-gray-200 px-6 flex items-center justify-between shrink-0 bg-white z-20">
        <h1 className="text-xl font-display font-bold text-gray-900 flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-blue-600" />
          Fleet Chart
        </h1>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" placeholder="Search vehicle..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-gray-100 border-transparent focus:bg-white border focus:border-blue-500 rounded-md text-sm transition-all w-48"
            />
          </div>
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button onClick={() => handleMonthChange(-1)} className="p-1 hover:bg-white rounded shadow-sm transition-all"><ChevronLeft className="w-4 h-4 text-gray-600" /></button>
            <span className="px-4 text-sm font-bold text-gray-700 w-32 text-center select-none">{currentDate.toLocaleString('default', { month: 'short', year: 'numeric' })}</span>
            <button onClick={() => handleMonthChange(1)} className="p-1 hover:bg-white rounded shadow-sm transition-all"><ChevronRight className="w-4 h-4 text-gray-600" /></button>
          </div>
          {/* Help Button */}
          <button 
            onClick={() => setShowHelpModal(true)}
            className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
            title="Help & Instructions"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">Loading Fleet Data...</div>
        ) : (
          <div className="flex-1 overflow-auto relative custom-scrollbar">
            <table className="border-collapse w-full min-w-max">
              <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="sticky left-0 top-0 z-50 bg-gray-50 border-b border-r border-gray-200 w-52 min-w-[13rem] p-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Vehicle Info</th>
                  {days.map((day, i) => (
                    <th key={i} className="border-b border-gray-200 min-w-[10rem] p-2 text-center bg-gray-50">
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] text-gray-400 font-medium uppercase">{day.toLocaleString('default', { weekday: 'short' })}</span>
                        <span className={cn("text-sm font-bold text-gray-700 w-8 h-8 flex items-center justify-center rounded-full mt-1", day.toDateString() === new Date().toDateString() ? "bg-blue-600 text-white shadow-md" : "")}>{day.getDate()}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white">
                {filteredVehicles.map((vehicle) => {
                  const vId = vehicle.vehicle_id;
                  const vName = vehicle.vehicle_information?.vehicle_number || vId;
                  const vSchedule = schedule[vId] || {};

                  return (
                    // WRAPPER for Row spanning 2 rows
                    <Fragment key={vId}>
                    {/* ROW 1: TASKS */}
                    <tr key={`${vId}-tasks`} className="bg-white">
                      <td rowSpan={2} className="sticky left-0 z-40 bg-white border-r border-b border-gray-100 p-3 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)] align-top min-w-[200px]">
                        {/* Vehicle Info */}
                        <div className="space-y-2">
                          <div>
                            <div className="font-bold text-gray-900 text-sm whitespace-nowrap">{vName}</div>
                            <div className="text-[10px] text-gray-400 font-medium uppercase mt-0.5">{vehicle.vehicle_information?.type}</div>
                          </div>

                          {/* Fuel Level */}
                          <div className="border-t border-gray-100 pt-2">
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <Fuel className="w-3 h-3 text-gray-500" />
                              <span className="text-gray-600">Fuel:</span>
                              {typeof vehicle.currentFuelLevel === 'number' && Number.isFinite(vehicle.currentFuelLevel) ? (
                                <span
                                  className={cn(
                                    "font-bold",
                                    vehicle.currentFuelLevel > 50
                                      ? "text-green-600"
                                      : vehicle.currentFuelLevel > 20
                                        ? "text-yellow-600"
                                        : "text-red-600"
                                  )}
                                >
                                  {vehicle.currentFuelLevel}L
                                </span>
                              ) : (
                                <span className="font-bold text-gray-400">-</span>
                              )}

                              {/* Fuel Bar */}
                              <div className="flex-1 ml-1">
                                <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full transition-all duration-300 rounded-full",
                                      typeof vehicle.currentFuelLevel === 'number' && Number.isFinite(vehicle.currentFuelLevel)
                                        ? vehicle.currentFuelLevel > 50
                                          ? "bg-green-500"
                                          : vehicle.currentFuelLevel > 20
                                            ? "bg-yellow-500"
                                            : "bg-red-500"
                                        : "bg-gray-300"
                                    )}
                                    style={{
                                      width: `${Math.min(
                                        100,
                                        typeof vehicle.currentFuelLevel === 'number' && Number.isFinite(vehicle.currentFuelLevel)
                                          ? vehicle.currentFuelLevel
                                          : 0
                                      )}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          {/* Driver Info */}
                          {vehicle.driver && (
                            <div className="border-t border-gray-100 pt-2 space-y-1">
                              <div className="flex items-center gap-1.5 text-[11px] text-gray-700">
                                <User className="w-3 h-3 text-gray-500" />
                                <span className="font-medium">{vehicle.driver.name}</span>
                                <span className={cn(
                                  "ml-auto px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase",
                                  vehicle.driver.checkedIn 
                                    ? "bg-green-100 text-green-700" 
                                    : "bg-gray-100 text-gray-600"
                                )}>
                                  {vehicle.driver.checkedIn ? 'IN' : 'OUT'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
                                <Phone className="w-3 h-3 text-gray-400" />
                                <span>{vehicle.driver.phone}</span>
                              </div>
                            </div>
                          )}

                          {/* Log Book */}
                          <div className="border-t border-gray-100 pt-2">
                            <button
                              type="button"
                              onClick={() => setLogBookVehicle(vehicle)}
                              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                              title="Generate / view log books"
                            >
                              <BookOpen className="w-3 h-3" />
                              Log Book
                            </button>
                          </div>
                        </div>
                      </td>

                      {days.map((day, dIndex) => {
                        const dateKey = formatDateKey(day);
                        const nextDateKey = formatDateKey(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1));
                        
                        const dayData = vSchedule[dateKey];
                        const nextDayData = vSchedule[nextDateKey];
                        
                        const tasks = dayData?.tasks || [];
                        const hasTasks = tasks.length > 0;

                        // Hub Connector Logic (Simplified to first task of day)
                        const showHubConnector = hasTasks && nextDayData?.tasks?.length > 0 && tasks[0].type === 'farm' && nextDayData.tasks[0].type === 'farm';

                        return (
                          <td key={`${vId}-t-${dIndex}`} className={cn(
                            "border-r border-gray-100 p-1 h-32 relative align-top min-w-[12rem]",
                            getCellBackgroundColor(dayData)
                          )}>
                            <div className="w-full h-full flex flex-col gap-1">
                              {/* Task buttons — only when tasks are assigned */}
                              {hasTasks && (
                                <div className="flex-1">
                                  {tasks.map((task, tIdx) => (
                                    <button
                                      key={task.id}
                                      onClick={() => setSelectedCell({ ...task, vehicle: vName, date: dateKey })}
                                      className={cn(
                                        "w-full rounded-md border flex flex-col items-start justify-center px-2 py-1 transition-all group relative overflow-hidden shadow-sm hover:shadow-md mb-1",
                                        getCellColor(task.type)
                                      )}
                                    >
                                      <span className="text-xs font-bold w-full text-left flex items-center gap-1 min-w-0">
                                        {task.status === 'completed' ? (
                                          <span className="shrink-0">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                                          </span>
                                        ) : (
                                          <span className="shrink-0">
                                            <CircleDashed className="w-3.5 h-3.5 text-amber-600" />
                                          </span>
                                        )}
                                        <span className="truncate">{task.location_name}</span>
                                      </span>
                                      <span className="text-[10px] opacity-70 truncate w-full text-left capitalize flex items-center gap-1">
                                        {task.type === 'hub' ? <Warehouse className="w-3 h-3" /> : null}
                                        {task.type}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* Engine hours / distance / damage — always shown for every cell */}
                              <div className={cn(
                                "rounded p-1 text-[9px] space-y-0.5",
                                hasTasks ? "bg-gray-50" : "bg-white/60 mt-auto"
                              )}>
                                {/* Engine Hours */}
                                <div className="flex items-center gap-1 text-gray-600">
                                  <Clock className="w-3 h-3" />
                                  <span>Start: {dayData?.initialEngineHours || 0}h</span>
                                  <span className="text-gray-400">|</span>
                                  <span>End: {dayData?.finalEngineHours || 0}h</span>
                                </div>

                                {/* Distance & (task status badge only when tasks exist) */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1 text-gray-600">
                                    <Route className="w-3 h-3" />
                                    <input
                                      type="number"
                                      value={dayData?.totalDistance || ''}
                                      onChange={(e) => {
                                        const value = parseInt(e.target.value) || 0;
                                        updateScheduleData(vId, dateKey, 'totalDistance', value);
                                      }}
                                      disabled={dayData?.isLocked}
                                      className={cn(
                                        "w-12 px-1 border border-gray-300 rounded text-[9px] text-center",
                                        dayData?.isLocked ? "bg-gray-100 cursor-not-allowed" : "bg-white"
                                      )}
                                      placeholder="km"
                                    />
                                    <span>km</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {hasTasks && (
                                      <span className={cn(
                                        "px-1 py-0.5 rounded text-[8px] font-bold uppercase",
                                        dayData?.tasksStatus === 'completed' ? "bg-green-100 text-green-700" :
                                        dayData?.tasksStatus === 'pending' ? "bg-red-100 text-red-700" :
                                        "bg-yellow-100 text-yellow-700"
                                      )}>
                                        {dayData?.tasksStatus || 'N/A'}
                                      </span>
                                    )}
                                    {/* Lock/Unlock Button */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const currentlyLocked = Boolean(dayData?.isLocked);

                                        if (currentlyLocked) {
                                          updateScheduleData(vId, dateKey, 'isLocked', false);
                                          return;
                                        }

                                        const distanceTraveled = Number(dayData?.totalDistance) || 0;
                                        const fuelConsumed = Number(dayData?.fuel?.consumed) || 0;
                                        const damageNotes = String(dayData?.damageChecklist ?? '');

                                        lockFleetCard({
                                          vehicle_id: vId,
                                          date: dateKey,
                                          distance_traveled: distanceTraveled,
                                          fuel_consumed: fuelConsumed,
                                          damage_notes: damageNotes,
                                        })
                                          .then(() => {
                                            updateScheduleData(vId, dateKey, 'isLocked', true);
                                            toast.success('Fleet card locked');
                                          })
                                          .catch((err) => {
                                            toast.error(err instanceof Error ? err.message : 'Failed to lock fleet card');
                                          });
                                      }}
                                      className={cn(
                                        "p-0.5 rounded transition-colors",
                                        dayData?.isLocked ? "text-red-600 hover:bg-red-100" : "text-gray-500 hover:bg-gray-100"
                                      )}
                                      title={dayData?.isLocked ? "Unlock" : "Lock"}
                                    >
                                      {dayData?.isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                                    </button>
                                  </div>
                                </div>

                                {/* Damage Notes */}
                                {dayData?.damageChecklist && (
                                  <div className="flex items-center gap-1 text-orange-600">
                                    <AlertTriangle className="w-3 h-3" />
                                    <span className="truncate flex-1">{dayData.damageChecklist}</span>
                                  </div>
                                )}
                                <input
                                  type="text"
                                  value={dayData?.damageChecklist || ''}
                                  onChange={(e) => {
                                    updateScheduleData(vId, dateKey, 'damageChecklist', e.target.value);
                                    if (!dayData?.damageChecklistTouched) {
                                      updateScheduleData(vId, dateKey, 'damageChecklistTouched', true);
                                    }
                                  }}
                                  disabled={dayData?.isLocked}
                                  className={cn(
                                    "w-full px-1 py-0.5 border border-gray-300 rounded text-[9px]",
                                    dayData?.isLocked ? "bg-gray-100 cursor-not-allowed" : "bg-white"
                                  )}
                                  placeholder="Damage notes..."
                                />
                              </div>
                            </div>

                            {showHubConnector && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleHubClick(vName, `${dateKey} - ${nextDateKey}`);
                                }}
                                className="absolute top-1/2 -right-2 -translate-y-1/2 z-30 group/hub hover:scale-105 transition-all opacity-40 hover:opacity-80"
                                title="Transit Hub"
                              >
                                <div className="bg-gray-300 text-gray-600 text-[8px] font-medium px-1 py-0.5 rounded shadow-sm border border-gray-200 flex items-center justify-center min-w-[20px]">
                                  →
                                </div>
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    
                    {/* ROW 2: FUEL & CONSUMPTION */}
                    <tr key={`${vId}-fuel`} className="bg-gray-50/30">
                        {/* No first TD here because of rowSpan above */}
                        {days.map((day, dIndex) => {
                            const dateKey = formatDateKey(day);
                            const dayData = vSchedule[dateKey];
                            const fuel = dayData?.fuel;
                            const hasDayData = Boolean(dayData?.tasks?.length) || Boolean(fuel);
                            const inputFuel = fuel ? (Number(fuel.input) || 0) : 0;
                            const usedFuel = fuel ? (Number(fuel.consumed) || 0) : 0;
                            const balance = hasDayData ? inputFuel - usedFuel : null;

                            return (
                                <td key={`${vId}-f-${dIndex}`} className="border-r border-b border-gray-100 p-1 h-12 text-center align-middle">
                                    {hasDayData ? (
                                      <div className="flex items-center justify-between gap-2 px-2 text-[10px] font-medium text-gray-500">
                                        <span
                                          className={cn(
                                            "flex items-center gap-1 whitespace-nowrap",
                                            (balance ?? 0) > 0
                                              ? "text-emerald-700 font-bold"
                                              : (balance ?? 0) < 0
                                                ? "text-red-700 font-bold"
                                                : "text-gray-600"
                                          )}
                                        >
                                          Balance: {balance !== null ? `${balance}L` : '-'}
                                        </span>
                                        <span className="text-gray-300">|</span>
                                        <span
                                          className={cn(
                                            "flex items-center gap-1 whitespace-nowrap",
                                            inputFuel > 0 ? "text-green-600 font-bold" : ""
                                          )}
                                        >
                                          In: {inputFuel > 0 ? `${inputFuel}L` : '-'}
                                        </span>
                                        <span className="text-gray-300">|</span>
                                        <span className="flex items-center gap-1 whitespace-nowrap text-gray-600">
                                          Use:
                                          <input
                                            type="number"
                                            inputMode="decimal"
                                            value={fuel ? (fuel.consumed ?? '') : ''}
                                            onChange={(e) => {
                                              const raw = e.target.value;
                                              const nextUsed = raw === '' ? 0 : Number(raw);
                                              const safeNextUsed = Number.isFinite(nextUsed) ? nextUsed : 0;

                                              updateScheduleData(vId, dateKey, 'fuel', {
                                                input: inputFuel,
                                                consumed: safeNextUsed,
                                              });
                                            }}
                                            disabled={dayData?.isLocked}
                                            className={cn(
                                              "w-12 px-1 border border-gray-300 rounded text-[9px] text-center",
                                              dayData?.isLocked ? "bg-gray-100 cursor-not-allowed" : "bg-white"
                                            )}
                                            placeholder="L"
                                            min={0}
                                          />
                                          L
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="text-[10px] text-gray-300">-</div>
                                    )}
                                </td>
                            )
                        })}
                    </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedCell && <LocationMapPopup data={selectedCell} onClose={() => setSelectedCell(null)} />}
      
      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-4xl h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
            
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-blue-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <HelpCircle className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Fleet Chart Instructions</h2>
                  <p className="text-sm text-gray-600">Complete guide for logistics managers</p>
                </div>
              </div>
              <button onClick={() => setShowHelpModal(false)} className="p-2 hover:bg-blue-100 rounded-full transition-colors">
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 space-y-6">
              
              {/* Vehicle Information */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" />
                  Vehicle Information (Left Column)
                </h3>
                <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                    <div>
                      <p className="font-medium text-gray-900">Vehicle Details</p>
                      <p className="text-sm text-gray-600">Vehicle number and type (Truck, Tractor, etc.)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                    <div>
                      <p className="font-medium text-gray-900">Driver Information</p>
                      <p className="text-sm text-gray-600">Name, phone number, and check-in status (IN/OUT badge)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-orange-500 rounded-full mt-2"></div>
                    <div>
                      <p className="font-medium text-gray-900">Current Fuel Level</p>
                      <p className="text-sm text-gray-600">Liters remaining with color-coded bar (Green &gt;50L, Yellow 20-50L, Red &lt;20L)</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Task Cells */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-600" />
                  Task Cells (Daily Schedule)
                </h3>
                <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                    <div>
                      <p className="font-medium text-gray-900">Task Information</p>
                      <p className="text-sm text-gray-600">Location name and task type (Farm, Hub, Maintenance). Click to view on map.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-purple-500 rounded-full mt-2"></div>
                    <div>
                      <p className="font-medium text-gray-900">Engine Hours</p>
                      <p className="text-sm text-gray-600">Start and end engine hours (provided by driver - read only)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                    <div>
                      <p className="font-medium text-gray-900">Task Status</p>
                      <p className="text-sm text-gray-600">Completion status from driver (Completed, Pending, Partial)</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Color Coding System */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-blue-600" />
                  Background Color System
                </h3>
                <div className="space-y-3">
                  <div className="bg-orange-200 p-3 rounded-lg border-l-4 border-orange-400">
                    <p className="font-bold text-orange-800">🟠 Orange Background - Work in Progress</p>
                    <p className="text-sm text-orange-700">Cell is not locked. You can edit distance and damage notes.</p>
                  </div>
                  <div className="bg-green-200 p-3 rounded-lg border-l-4 border-green-400">
                    <p className="font-bold text-green-800">🟢 Green Background - Complete & Locked</p>
                    <p className="text-sm text-green-700">All required data is filled and cell is locked. Good quality control!</p>
                  </div>
                  <div className="bg-red-200 p-3 rounded-lg border-l-4 border-red-400">
                    <p className="font-bold text-red-800">🔴 Red Background - Incomplete but Locked</p>
                    <p className="text-sm text-red-700">Cell is locked but missing required data. Needs attention!</p>
                  </div>
                </div>
              </section>

              {/* Your Tasks as Logistics Manager */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-blue-600" />
                  Your Tasks as Logistics Manager
                </h3>
                <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                  <div className="flex items-start gap-3">
                    <Route className="w-4 h-4 text-blue-600 mt-1" />
                    <div>
                      <p className="font-medium text-gray-900">Distance Tracking</p>
                      <p className="text-sm text-gray-600">Enter total kilometers traveled in the distance input field</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-orange-600 mt-1" />
                    <div>
                      <p className="font-medium text-gray-900">Damage Inspection</p>
                      <p className="text-sm text-gray-600">Add damage notes or leave empty if no damage found. Touching this field marks it as 'checked'.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Lock className="w-4 h-4 text-red-600 mt-1" />
                    <div>
                      <p className="font-medium text-gray-900">Lock/Unlock System</p>
                      <p className="text-sm text-gray-600">Lock cells when review is complete. Locked cells cannot be edited until unlocked.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Fuel Tracking */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <Fuel className="w-5 h-5 text-blue-600" />
                  Fuel Tracking (Bottom Row)
                </h3>
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                  <p className="text-sm text-gray-600"><strong>In:</strong> Fuel input from inventory (API data)</p>
                  <p className="text-sm text-gray-600"><strong>Use:</strong> Daily fuel consumption you track</p>
                </div>
              </section>

              {/* Navigation Tips */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <Info className="w-5 h-5 text-blue-600" />
                  Navigation Tips
                </h3>
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                  <p className="text-sm text-gray-600">• Use the search bar to quickly find specific vehicles</p>
                  <p className="text-sm text-gray-600">• Navigate months using the arrow buttons</p>
                  <p className="text-sm text-gray-600">• Click on farm/hub tasks to view location on map</p>
                  <p className="text-sm text-gray-600">• Today's date is highlighted in blue</p>
                  <p className="text-sm text-gray-600">• Subtle arrows (→) indicate transit between farm locations</p>
                </div>
              </section>

            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 text-center">
              <p className="text-sm text-gray-600">Need more help? Contact your system administrator</p>
            </div>
            
          </div>
        </div>
      )}

      {/* Log Book popup — generate a new log book and view a vehicle's past ones */}
      {logBookVehicle && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => !isGeneratingLogBook && closeLogBookPopup()}>
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-600" /> Vehicle Log Book
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {logBookVehicle.vehicle_information?.vehicle_number || logBookVehicle.vehicle_id}
                  {logBookVehicle.vehicle_information?.type ? ` · ${logBookVehicle.vehicle_information.type}` : ''}
                </p>
              </div>
              <button type="button" onClick={closeLogBookPopup} className="text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Generate section */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Generate a new log book</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500">Start Date</label>
                    <input
                      type="date"
                      value={logBookStartDate}
                      onChange={(e) => setLogBookStartDate(e.target.value)}
                      className="mt-0.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500">End Date</label>
                    <input
                      type="date"
                      value={logBookEndDate}
                      onChange={(e) => setLogBookEndDate(e.target.value)}
                      className="mt-0.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateLogBook}
                  disabled={isGeneratingLogBook}
                  className="w-full rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isGeneratingLogBook ? 'Generating…' : 'Generate Log Book'}
                </button>
              </div>

              {/* History */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Past log books</p>
                {isLoadingLogBooks ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
                    <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    Loading…
                  </div>
                ) : vehicleLogBooks.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">No log books generated yet for this vehicle.</p>
                ) : (
                  <div className="space-y-1.5">
                    {vehicleLogBooks.map((book) => (
                      <div key={book.log_id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800">
                            {formatDateDDMMYYYY(book.start_date)} – {formatDateDDMMYYYY(book.end_date)}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {book.vendor_details?.vendor_name ? `Rental — ${book.vendor_details.vendor_name} · ` : ''}
                            Generated {formatDateDDMMYYYY(book.generated_at)}
                          </p>
                          {book.operational_calendar_id && (
                            <Link
                              to="/operational-calendar"
                              title="This log book's vendor work is also recorded in the Operational Calendar, where it becomes available as WCC evidence"
                              className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                            >
                              <CalendarIcon className="h-2.5 w-2.5" /> Logged in Operational Calendar
                            </Link>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownloadLogBook(book)}
                          title="Download PDF"
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default FleetChart;