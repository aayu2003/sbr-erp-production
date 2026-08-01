import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Wrench, User, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';

const BASE_URL = getBaseUrl().replace(/\/$/, '');

// ─── Types ────────────────────────────────────────────────────────────────────

interface OperationalTaskRow {
  activity: string;
  calander_id: string;
  farm_id: string;
  vendor_id: string;
  vendor_name: string;
  quantity: number;
  unit: string;
  spec_value?: number;
  spec_unit?: string;
  status: string;
  task_id: string;
  from_date: string;
  to_date: string;
}

type OperationalCalendarData = Record<string, OperationalTaskRow[]>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const normalizeStatus = (status?: string) => {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'completed' || s === 'done') return 'completed';
  if (s === 'overdue') return 'overdue';
  return 'pending';
};

const statusBadgeClasses = (status: string) => {
  const n = normalizeStatus(status);
  if (n === 'completed') return 'bg-green-100 text-green-700 border-green-200';
  if (n === 'overdue') return 'bg-red-100 text-red-700 border-red-200';
  return 'bg-orange-100 text-orange-800 border-orange-200';
};

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatDate = (d?: string) => {
  if (!d) return '—';
  const date = new Date(`${d}T00:00:00`);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fetchOperationalCalendarData = async (): Promise<OperationalCalendarData> => {
  const res = await fetch(`${BASE_URL}/admin_cultivation/fetch_operational_calander`);
  const data = await res.json().catch(() => null);
  const calendar: OperationalCalendarData = {};
  for (const calId in (data?.plan || {})) {
    const plan = data.plan[calId];
    (plan?.date_mapping || []).forEach((dm: any) => {
      const [fromDate, toDate] = Array.isArray(dm?.date) ? dm.date : [];
      const fieldAssignment = dm?.field_assignment || {};
      Object.entries(fieldAssignment).forEach(([dateStr, rows]) => {
        if (!Array.isArray(rows)) return;
        if (!calendar[dateStr]) calendar[dateStr] = [];
        rows.forEach((row: any) => {
          calendar[dateStr].push({
            activity: String(dm?.activity || ''),
            calander_id: calId,
            farm_id: String(row?.farm_id || ''),
            vendor_id: String(row?.vendor_id || ''),
            vendor_name: String(row?.vendor_name || ''),
            quantity: Number(row?.quantity) || 0,
            unit: String(row?.unit || ''),
            spec_value: row?.spec_value != null ? Number(row.spec_value) : undefined,
            spec_unit: row?.spec_unit || undefined,
            status: String(row?.status || 'pending'),
            task_id: String(row?.task_id || ''),
            from_date: String(fromDate || dateStr),
            to_date: String(toDate || dateStr),
          });
        });
      });
    });
  }
  return calendar;
};

// ─── Month grid ───────────────────────────────────────────────────────────────

const MonthCard = ({
  monthDate,
  activities,
  onDateClick,
  currentDateKey,
}: {
  monthDate: Date;
  activities: OperationalCalendarData;
  onDateClick: (dateStr: string) => void;
  currentDateKey: string;
}) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-bold text-slate-900">{monthDate.toLocaleDateString('default', { month: 'long', year: 'numeric' })}</h3>
      <div className="grid grid-cols-7 mb-2">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} className="text-[10px] text-center text-muted-foreground/60 font-medium">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-2 gap-x-1 flex-1 content-start">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const cellDate = new Date(year, month, day);
          const dStr = dateKey(cellDate);
          const rows = activities[dStr] || [];
          const hasTask = rows.length > 0;
          const isToday = dStr === currentDateKey;

          const hasOverdue = rows.some(r => normalizeStatus(r.status) === 'overdue');
          const hasPending = rows.some(r => normalizeStatus(r.status) === 'pending');
          const allCompleted = hasTask && rows.every(r => normalizeStatus(r.status) === 'completed');

          let bgClass = 'hover:bg-secondary';
          let textClass = 'text-muted-foreground/60';
          if (hasOverdue) { bgClass = 'bg-red-100 text-red-700 border border-red-200'; textClass = 'text-red-700'; }
          else if (hasPending) { bgClass = 'bg-orange-100 text-orange-800 border border-orange-200'; textClass = 'text-orange-800'; }
          else if (allCompleted) { bgClass = 'bg-green-600 text-white shadow-md shadow-green-200'; textClass = 'text-white'; }
          else if (hasTask) { bgClass = 'bg-gray-100 text-gray-700'; textClass = 'text-gray-700'; }
          else if (isToday) { bgClass = 'bg-lime-600 text-white shadow-md shadow-lime-200'; textClass = 'text-white'; }

          return (
            <div key={day} className="flex flex-col items-center gap-0.5">
              {hasTask || isToday ? (
                <button
                  type="button"
                  onClick={() => onDateClick(dStr)}
                  className={cn('relative flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold transition-colors', bgClass, textClass)}
                >
                  {day}
                  {hasTask && (
                    <span className="absolute -bottom-1 -right-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-slate-900 px-0.5 text-[8px] font-bold text-white">
                      {rows.length}
                    </span>
                  )}
                </button>
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-md text-xs text-muted-foreground/60">{day}</span>
              )}
              {isToday && <span className="text-[8px] font-semibold text-lime-700">Today</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

const OperationalCalendar = () => {
  const [activitiesData, setActivitiesData] = useState<OperationalCalendarData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleMonthStart, setVisibleMonthStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [farms, setFarms] = useState<any[]>([]);

  const [filterVendor, setFilterVendor] = useState('');
  const [filterActivity, setFilterActivity] = useState('');

  const currentDateKey = dateKey(new Date());

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    fetchOperationalCalendarData()
      .then(data => { if (mounted) setActivitiesData(data); })
      .catch(() => { if (mounted) setError('Unable to load operational calendar.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/admin_ops_requests/get_farm_and_farmer`);
        const data = await res.json().catch(() => ({}));
        if (mounted) setFarms(Array.isArray(data?.farm_farmer_mapping) ? data.farm_farmer_mapping : []);
      } catch { if (mounted) setFarms([]); }
    })();
    return () => { mounted = false; };
  }, []);

  const getFarmLabel = (farmId: string) => {
    const f = farms.find((x: any) => String(x?.farm_id || '') === farmId);
    return f ? String((f as any)?.owner_name || farmId) : farmId;
  };

  const monthsToDisplay = useMemo(
    () => Array.from({ length: 4 }, (_, i) => new Date(visibleMonthStart.getFullYear(), visibleMonthStart.getMonth() + i, 1)),
    [visibleMonthStart]
  );

  const vendorOptions = useMemo(() => {
    const names = new Set<string>();
    Object.values(activitiesData).forEach(rows => rows.forEach(r => { if (r.vendor_name) names.add(r.vendor_name); }));
    return Array.from(names).sort();
  }, [activitiesData]);

  const activityOptions = useMemo(() => {
    const names = new Set<string>();
    Object.values(activitiesData).forEach(rows => rows.forEach(r => { if (r.activity) names.add(r.activity); }));
    return Array.from(names).sort();
  }, [activitiesData]);

  const filteredActivitiesData = useMemo(() => {
    if (!filterVendor && !filterActivity) return activitiesData;
    const filtered: OperationalCalendarData = {};
    for (const [d, rows] of Object.entries(activitiesData)) {
      const matched = rows.filter(r =>
        (!filterVendor || r.vendor_name === filterVendor) &&
        (!filterActivity || r.activity === filterActivity)
      );
      if (matched.length > 0) filtered[d] = matched;
    }
    return filtered;
  }, [activitiesData, filterVendor, filterActivity]);

  const selectedRows = selectedDate ? (filteredActivitiesData[selectedDate] || []) : [];

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-300 min-h-screen bg-gray-50/50 font-sans">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="shrink-0">
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">Operational Calendar</h1>
          <p className="mt-1 text-sm text-slate-500 max-w-xl">Non-cultivation vendor tasks (borewells, fencing, transport, and other on-demand work).</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVisibleMonthStart(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-gray-50"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <span className="text-center text-sm font-bold text-slate-900">
              {monthsToDisplay[0]?.toLocaleDateString('default', { month: 'short', year: 'numeric' })}
              {' – '}
              {monthsToDisplay[monthsToDisplay.length - 1]?.toLocaleDateString('default', { month: 'short', year: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={() => setVisibleMonthStart(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-gray-50"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)} className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:border-slate-900">
            <option value="">All vendors</option>
            {vendorOptions.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={filterActivity} onChange={e => setFilterActivity(e.target.value)} className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:border-slate-900">
            <option value="">All tasks</option>
            {activityOptions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {(filterVendor || filterActivity) && (
            <button type="button" onClick={() => { setFilterVendor(''); setFilterActivity(''); }} className="text-xs font-medium text-slate-500 hover:underline">
              Clear
            </button>
          )}
          <div className="flex items-center gap-3 bg-white border border-gray-200 px-3 py-2 rounded-lg shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-green-600 rounded-sm shadow-sm" /><span className="text-xs font-semibold text-slate-700">Completed</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-orange-100 border border-orange-200 rounded-sm" /><span className="text-xs font-semibold text-slate-700">Pending</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-red-100 border border-red-200 rounded-sm" /><span className="text-xs font-semibold text-slate-700">Overdue</span></div>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-muted-foreground">Loading operational calendar…</div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {monthsToDisplay.map((monthDate, index) => (
            <MonthCard
              key={index}
              monthDate={monthDate}
              activities={filteredActivitiesData}
              onDateClick={setSelectedDate}
              currentDateKey={currentDateKey}
            />
          ))}
        </div>
      )}

      {/* Day detail popup */}
      {selectedDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-[0_24px_64px_rgba(15,23,42,0.18)] flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{formatDate(selectedDate)}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{selectedRows.length} operational task{selectedRows.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setSelectedDate(null)} className="p-1.5 rounded-md hover:bg-gray-100"><X className="w-4 h-4 text-gray-500" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {selectedRows.length === 0 ? (
                <p className="text-sm text-slate-400 italic text-center py-6">No operational tasks on this date.</p>
              ) : selectedRows.map((row, i) => (
                <div key={`${row.task_id}-${i}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{row.activity || 'Task'}</span>
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize', statusBadgeClasses(row.status))}>
                      {normalizeStatus(row.status)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600"><MapPin className="w-3.5 h-3.5 text-slate-400" /> {getFarmLabel(row.farm_id)}</div>
                  <div className="flex items-center gap-1.5 text-slate-600"><User className="w-3.5 h-3.5 text-slate-400" /> {row.vendor_name || '—'}</div>
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <Wrench className="w-3.5 h-3.5 text-slate-400" />
                    {row.quantity} {row.unit}
                    {row.spec_value != null && row.spec_unit ? `, up to ${row.spec_value} ${row.spec_unit}` : ''}
                  </div>
                  {row.from_date !== row.to_date && (
                    <div className="text-[10px] text-slate-400">Runs {formatDate(row.from_date)} → {formatDate(row.to_date)}</div>
                  )}
                  <div className="text-[10px] text-slate-400 font-mono">{row.task_id}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperationalCalendar;
