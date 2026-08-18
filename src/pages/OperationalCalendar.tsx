import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Wrench, User, MapPin, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';

const BASE_URL = getBaseUrl().replace(/\/$/, '');

// ─── Types ────────────────────────────────────────────────────────────────────

// One WO line item within a task — a single vendor task can carry several of these (e.g.
// Borewell + Casing Pipe Fitting + Shaft Joining), each completed with its own quantity.
interface OperationalLineItem {
  lineItemId: string;
  activity: string;
  quantity: number;
  unit: string;
  specValue?: number;
  specUnit?: string;
  status: string;
  completedQuantity?: number;
  completionDate?: string;
}

// One (calander_id, date) group — "one task" as far as the UI/user is concerned. A calander_id
// alone isn't unique enough anymore: completing a line item for less than its assigned quantity
// rolls the shortfall onto a *new* row dated the next day, so the same calander_id can now span
// more than one calendar day — each day gets its own task card.
interface OperationalTask {
  calanderId: string;
  dateKey: string;
  taskId: string;
  farmId: string;
  vendorId: string;
  vendorName: string;
  fromDate: string;
  toDate: string;
  lineItems: OperationalLineItem[];
}

type OperationalCalendarData = Record<string, OperationalTask[]>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const normalizeStatus = (status?: string) => {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'completed' || s === 'done') return 'completed';
  return 'pending';
};

// A task's overall status is "completed" once every line item is; otherwise it's "overdue"
// the moment its own date has passed without being finished — not a status stored anywhere,
// derived fresh against today so it never goes stale.
const taskStatus = (task: OperationalTask, currentDateKey: string) => {
  if (task.lineItems.length > 0 && task.lineItems.every(li => normalizeStatus(li.status) === 'completed')) return 'completed';
  if (task.dateKey < currentDateKey) return 'overdue';
  return 'pending';
};

const statusBadgeClasses = (status: string) => {
  if (status === 'completed') return 'bg-green-100 text-green-700 border-green-200';
  if (status === 'overdue') return 'bg-red-100 text-red-700 border-red-200';
  return 'bg-orange-100 text-orange-800 border-orange-200';
};

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatDate = (d?: string) => {
  if (!d) return '—';
  const date = new Date(`${d}T00:00:00`);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Groups operational_calander.json by (calander_id, date) — every date_mapping block under one
// calander_id shares farm/vendor, but its field_assignment rows can now be spread across
// several actual dates (a rollover shortfall lands on the day after it was logged), so each
// date gets its own task card instead of collapsing the whole calander_id onto one day.
const fetchOperationalCalendarData = async (): Promise<OperationalCalendarData> => {
  const res = await fetch(`${BASE_URL}/admin_cultivation/fetch_operational_calander`);
  const data = await res.json().catch(() => null);
  const groups = new Map<string, OperationalTask>();

  for (const calId in (data?.plan || {})) {
    const plan = data.plan[calId];
    const dateMapping = Array.isArray(plan?.date_mapping) ? plan.date_mapping : [];

    dateMapping.forEach((dm: Record<string, unknown>, dmIndex: number) => {
      const [blockFrom, blockTo] = Array.isArray(dm?.date) ? dm.date as [string, string] : [];
      const fieldAssignment = (dm?.field_assignment || {}) as Record<string, unknown>;
      Object.entries(fieldAssignment).forEach(([dateStr, rows]) => {
        if (!Array.isArray(rows)) return;
        rows.forEach((row: Record<string, unknown>, rowIndex: number) => {
          const groupKey = `${calId}::${dateStr}`;
          let group = groups.get(groupKey);
          if (!group) {
            group = {
              calanderId: calId, dateKey: dateStr, taskId: '', farmId: '', vendorId: '', vendorName: '',
              fromDate: String(blockFrom || dateStr), toDate: String(blockTo || dateStr), lineItems: [],
            };
            groups.set(groupKey, group);
          }
          group.farmId = String(row?.farm_id || group.farmId);
          group.vendorId = String(row?.vendor_id || group.vendorId);
          group.vendorName = String(row?.vendor_name || group.vendorName);
          group.taskId = String(row?.task_id || group.taskId);
          group.lineItems.push({
            lineItemId: String(row?.line_item_id || `${calId}-${dmIndex}-${rowIndex}`),
            activity: String(dm?.activity || ''),
            quantity: Number(row?.quantity) || 0,
            unit: String(row?.unit || ''),
            specValue: row?.spec_value != null ? Number(row.spec_value) : undefined,
            specUnit: row?.spec_unit || undefined,
            status: String(row?.status || 'pending'),
            completedQuantity: row?.completed_quantity != null ? Number(row.completed_quantity) : undefined,
            completionDate: (row?.completion_date as string | undefined) || undefined,
          });
        });
      });
    });
  }

  const calendar: OperationalCalendarData = {};
  for (const group of groups.values()) {
    if (group.lineItems.length === 0) continue;
    if (!calendar[group.dateKey]) calendar[group.dateKey] = [];
    calendar[group.dateKey].push(group);
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

          const hasOverdue = rows.some(r => taskStatus(r, currentDateKey) === 'overdue');
          const hasPending = rows.some(r => taskStatus(r, currentDateKey) === 'pending');
          const allCompleted = hasTask && rows.every(r => taskStatus(r, currentDateKey) === 'completed');

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

// ─── Completion modal ─────────────────────────────────────────────────────────
// Replaces a single "mark completed" click — every not-yet-completed line item in the task
// needs its own completed quantity, and the whole task shares one completion date (defaulted
// to the task's own date, not today's real date — completions are usually logged after the
// fact). Any line item completed for less than its assigned quantity has the shortfall rolled
// onto a new pending row the day after completion_date, handled entirely server-side.

const CompleteTaskModal = ({
  task,
  onClose,
  onCompleted,
}: {
  task: OperationalTask;
  onClose: () => void;
  onCompleted: () => void;
}) => {
  const pendingLineItems = task.lineItems.filter(li => normalizeStatus(li.status) !== 'completed');
  const [completionDate, setCompletionDate] = useState(task.dateKey);
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(pendingLineItems.map(li => [li.lineItemId, String(li.quantity)])),
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!completionDate) { toast.error('Enter the date of completion.'); return; }
    const completions = pendingLineItems.map(li => ({ lineItemId: li.lineItemId, completedQuantity: Number(quantities[li.lineItemId]) || 0 }));
    if (completions.some(c => c.completedQuantity <= 0)) {
      toast.error('Enter a completed quantity for every line item.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}/admin_cultivation/complete_operational_task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calander_id: task.calanderId,
          completions: completions.map(c => ({ line_item_id: c.lineItemId, completed_quantity: c.completedQuantity, completion_date: completionDate })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.detail || 'Failed to complete task');
      toast.success(data?.rollovers_created ? `Completed — ${data.rollovers_created} line item${data.rollovers_created !== 1 ? 's' : ''} rolled over to the next day` : 'Task marked as completed');
      onCompleted();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to complete task');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-[0_24px_64px_rgba(15,23,42,0.18)] flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Complete task</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{task.vendorName || 'Vendor'} · provide the quantity actually completed for each line item</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Date of completion</label>
            <input
              type="date"
              value={completionDate}
              onChange={e => setCompletionDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-slate-900 focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-slate-400">Defaults to the task's own date — change it if the work was actually done on a different day.</p>
          </div>
          {pendingLineItems.map(li => (
            <div key={li.lineItemId} className="rounded-lg border border-slate-200 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">{li.activity || 'Activity'}</span>
                <span className="text-[10px] text-slate-400">Assigned: {li.quantity} {li.unit}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={quantities[li.lineItemId] ?? ''}
                  onChange={e => setQuantities(prev => ({ ...prev, [li.lineItemId]: e.target.value }))}
                  className="w-28 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-right focus:border-slate-900 focus:outline-none"
                />
                <span className="text-xs text-slate-500">{li.unit} completed</span>
              </div>
              {Number(quantities[li.lineItemId] || 0) > 0 && Number(quantities[li.lineItemId]) < li.quantity && (
                <p className="text-[10px] text-amber-600">Remaining {(li.quantity - Number(quantities[li.lineItemId])).toFixed(2)} {li.unit} will roll over to the next day as a new pending task.</p>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 shrink-0">
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Check className="h-3 w-3" /> {submitting ? 'Completing…' : 'Submit completion'}
          </button>
        </div>
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
  const [farms, setFarms] = useState<Array<Record<string, unknown>>>([]);

  const [filterVendor, setFilterVendor] = useState('');
  const [filterActivity, setFilterActivity] = useState('');
  const [completingTask, setCompletingTask] = useState<OperationalTask | null>(null);

  const currentDateKey = dateKey(new Date());

  const loadCalendar = () => {
    setLoading(true);
    setError(null);
    fetchOperationalCalendarData()
      .then(data => setActivitiesData(data))
      .catch(() => setError('Unable to load operational calendar.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCalendar(); }, []);

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
    const f = farms.find((x) => String(x?.farm_id || '') === farmId);
    return f ? String(f?.owner_name || farmId) : farmId;
  };

  // A completion can roll leftover quantity onto a brand-new row on a different day (which
  // this page hasn't fetched before), so a fresh full reload is simpler and safer than trying
  // to hand-patch local state for that. The day popup stays open — it re-renders reactively
  // once the reload lands, since it's already reading straight from activitiesData.
  const handleTaskCompleted = () => {
    loadCalendar();
  };

  const monthsToDisplay = useMemo(
    () => Array.from({ length: 4 }, (_, i) => new Date(visibleMonthStart.getFullYear(), visibleMonthStart.getMonth() + i, 1)),
    [visibleMonthStart]
  );

  const vendorOptions = useMemo(() => {
    const names = new Set<string>();
    Object.values(activitiesData).forEach(tasks => tasks.forEach(t => { if (t.vendorName) names.add(t.vendorName); }));
    return Array.from(names).sort();
  }, [activitiesData]);

  const activityOptions = useMemo(() => {
    const names = new Set<string>();
    Object.values(activitiesData).forEach(tasks => tasks.forEach(t => t.lineItems.forEach(li => { if (li.activity) names.add(li.activity); })));
    return Array.from(names).sort();
  }, [activitiesData]);

  const filteredActivitiesData = useMemo(() => {
    if (!filterVendor && !filterActivity) return activitiesData;
    const filtered: OperationalCalendarData = {};
    for (const [d, tasks] of Object.entries(activitiesData)) {
      const matched = tasks.filter(t =>
        (!filterVendor || t.vendorName === filterVendor) &&
        (!filterActivity || t.lineItems.some(li => li.activity === filterActivity))
      );
      if (matched.length > 0) filtered[d] = matched;
    }
    return filtered;
  }, [activitiesData, filterVendor, filterActivity]);

  const selectedTasks = selectedDate ? (filteredActivitiesData[selectedDate] || []) : [];

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
                <p className="text-xs text-muted-foreground mt-0.5">{selectedTasks.length} operational task{selectedTasks.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setSelectedDate(null)} className="p-1.5 rounded-md hover:bg-gray-100"><X className="w-4 h-4 text-gray-500" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {selectedTasks.length === 0 ? (
                <p className="text-sm text-slate-400 italic text-center py-6">No operational tasks on this date.</p>
              ) : selectedTasks.map((task) => {
                const status = taskStatus(task, currentDateKey);
                const isMultiLineItem = task.lineItems.length > 1;
                return (
                  <div key={`${task.calanderId}-${task.dateKey}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900">
                        {isMultiLineItem ? `${task.lineItems.length} activities` : (task.lineItems[0]?.activity || 'Task')}
                      </span>
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize', statusBadgeClasses(status))}>
                        {status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-600"><MapPin className="w-3.5 h-3.5 text-slate-400" /> {getFarmLabel(task.farmId)}</div>
                    <div className="flex items-center gap-1.5 text-slate-600"><User className="w-3.5 h-3.5 text-slate-400" /> {task.vendorName || '—'}</div>

                    <div className="space-y-1 rounded-md border border-slate-200 bg-white p-2">
                      {task.lineItems.map(li => (
                        <div key={li.lineItemId} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-slate-600 min-w-0">
                            <Wrench className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{li.activity || 'Activity'}</span>
                          </div>
                          <span className="shrink-0 text-slate-700">
                            {normalizeStatus(li.status) === 'completed' && li.completedQuantity != null
                              ? `${li.completedQuantity} / ${li.quantity} ${li.unit}`
                              : `${li.quantity} ${li.unit}`}
                            {li.specValue != null && li.specUnit ? `, up to ${li.specValue} ${li.specUnit}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                    {task.lineItems.some(li => li.completionDate) && (
                      <div className="text-[10px] text-slate-400">Completed on {formatDate(task.lineItems.find(li => li.completionDate)?.completionDate)}</div>
                    )}

                    {task.fromDate !== task.toDate && (
                      <div className="text-[10px] text-slate-400">Runs {formatDate(task.fromDate)} → {formatDate(task.toDate)}</div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] text-slate-400 font-mono">{task.taskId}</div>
                      {status !== 'completed' && (
                        <button
                          type="button"
                          onClick={() => setCompletingTask(task)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-[10px] font-semibold text-green-700 transition-colors hover:bg-green-100"
                        >
                          <Check className="h-3 w-3" /> Complete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {completingTask && (
        <CompleteTaskModal
          task={completingTask}
          onClose={() => setCompletingTask(null)}
          onCompleted={handleTaskCompleted}
        />
      )}
    </div>
  );
};

export default OperationalCalendar;
