import { useEffect, useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { Loader2, Lock, Users, UserCheck, UserX, TrendingUp, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/config';

// ─────────────────────────────────────────────────────────────
// Types & data
// ─────────────────────────────────────────────────────────────

type DayStatus = 'P' | 'A' | 'PL' | 'PH';

interface Employee {
	id: string;
	name: string;
	department: string;
	designation: string;
}

interface StaffApiItem {
	staff_id: string;
	staff_information?: {
		staff_name?: string;
		staff_department?: string;
		staff_designation?: string;
	};
}

interface StatusMeta {
	key: DayStatus;
	label: string;
	tooltip: string;
	badge: string;
	dot: string;
}

interface Holiday {
	id: string;
	date: string;
	name: string;
	scope: 'all' | 'specific';
	staffIds: string[];
}

interface WorkingDayOverride {
	id: string;
	date: string;
	note: string;
}

interface AttendanceUnlockRequest {
	id: string;
	staffId: string;
	staffName: string;
	date: string;
	requestedAt: string;
	status: 'Pending' | 'Approved' | 'Rejected';
}

interface AttendanceModuleProps {
	map: Record<string, DayStatus | null>;
	setMap: (updater: (prev: Record<string, DayStatus | null>) => Record<string, DayStatus | null>) => void;
	holidays?: Holiday[];
	workingDayOverrides?: WorkingDayOverride[];
	onEarnCompLeave?: (staffId: string, staffName: string, earnedDate: string, reason: string) => void;
	onRevokeCompLeave?: (staffId: string, earnedDate: string) => void;
	lockHours?: number;
	unlockRequests?: AttendanceUnlockRequest[];
	onRequestUnlock?: (staffId: string, staffName: string, date: string) => void;
}

const STATUS: StatusMeta[] = [
	{ key: 'P',  label: 'P',  tooltip: 'Present',      badge: 'bg-emerald-50 text-emerald-700 ring-emerald-100', dot: 'bg-emerald-500' },
	{ key: 'A',  label: 'A',  tooltip: 'Absent',       badge: 'bg-rose-50 text-rose-700 ring-rose-100',          dot: 'bg-rose-500'    },
	{ key: 'PL', label: 'PL', tooltip: 'Paid Leave',   badge: 'bg-blue-50 text-blue-700 ring-blue-100',          dot: 'bg-blue-500'    },
	{ key: 'PH', label: 'PH', tooltip: 'Paid Holiday', badge: 'bg-amber-50 text-amber-700 ring-amber-100',       dot: 'bg-amber-500'   },
];

// null (unmarked) -> P -> A -> PL -> PH -> null
const STATUS_CYCLE: (DayStatus | null)[] = [null, 'P', 'A', 'PL', 'PH'];

// Server sends/expects the full label ("Present", "Absent", ...) rather than the short codes.
const STATUS_LABEL_TO_CODE = Object.fromEntries(STATUS.map(s => [s.tooltip, s.key])) as Record<string, DayStatus>;

const MONTHS = [
	'January','February','March','April','May','June',
	'July','August','September','October','November','December',
];
const YEARS = [2024, 2025, 2026, 2027];

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export const AttendanceModule = ({
	map,
	setMap,
	holidays = [],
	workingDayOverrides = [],
	onEarnCompLeave,
	onRevokeCompLeave,
	lockHours = 24,
	unlockRequests = [],
	onRequestUnlock,
}: AttendanceModuleProps) => {
	const today    = new Date();
	const todayStr = format(today, 'yyyy-MM-dd');

	const [month, setMonth] = useState(today.getMonth());
	const [year,  setYear]  = useState(today.getFullYear());
	const [markedAt, setMarkedAt] = useState<Record<string, string>>({});
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [isLoadingStaff, setIsLoadingStaff] = useState(false);
	const [markError, setMarkError] = useState<string | null>(null);
	const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
	const [attendanceFetchError, setAttendanceFetchError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		const monthParam = `${String(month + 1).padStart(2, '0')}/${year}`;
		(async () => {
			setIsLoadingAttendance(true);
			setAttendanceFetchError(null);
			try {
				const BASE_URL = getBaseUrl().replace(/\/$/, '');
				const res = await fetch(`${BASE_URL}/HRMS/get_complete_attandance_of_month/${monthParam}`);
				const data = await res.json();
				if (!res.ok || !data.success) throw new Error(data?.message || 'Failed to load attendance for this month');
				if (cancelled) return;
				const fetched: Record<string, DayStatus | null> = {};
				Object.entries(data.attendance ?? {}).forEach(([dateStr, staffStatuses]) => {
					const [dd, mm, yyyy] = dateStr.split('/');
					if (!dd || !mm || !yyyy) return;
					const isoDate = `${yyyy}-${mm}-${dd}`;
					Object.entries(staffStatuses as Record<string, string>).forEach(([staffId, statusLabel]) => {
						const code = STATUS_LABEL_TO_CODE[statusLabel];
						if (code) fetched[`${staffId}_${isoDate}`] = code;
					});
				});
				setMap(prev => ({ ...prev, ...fetched }));
			} catch (err) {
				if (!cancelled) setAttendanceFetchError(err instanceof Error ? err.message : 'Failed to load attendance for this month');
			} finally {
				if (!cancelled) setIsLoadingAttendance(false);
			}
		})();
		return () => { cancelled = true; };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [month, year]);

	useEffect(() => {
		let cancelled = false;
		const fetchStaff = async () => {
			setIsLoadingStaff(true);
			try {
				const BASE_URL = getBaseUrl().replace(/\/$/, '');
				const res = await fetch(`${BASE_URL}/admin_staff/get_all_staff`, {
					method: 'GET',
					headers: { Accept: 'application/json' },
				});
				const data = await res.json();
				if (cancelled || !res.ok || !Array.isArray(data)) return;
				const mapped: Employee[] = (data as StaffApiItem[]).map(staff => ({
					id: staff.staff_id,
					name: staff.staff_information?.staff_name || 'Unnamed Staff',
					department: staff.staff_information?.staff_department || '-',
					designation: staff.staff_information?.staff_designation || '-',
				}));
				setEmployees(mapped);
			} catch {
				// staff directory unavailable - register still renders, just empty
			} finally {
				if (!cancelled) setIsLoadingStaff(false);
			}
		};
		fetchStaff();
		return () => {
			cancelled = true;
		};
	}, []);

	const days = eachDayOfInterval({
		start: startOfMonth(new Date(year, month)),
		end:   endOfMonth(new Date(year, month)),
	});

	const getStatus = (empId: string, date: string): DayStatus | null =>
		map[`${empId}_${date}`] ?? null;

	const getHolidayFor = (date: string) => holidays.find(h => h.date === date);
	const getOverrideFor = (date: string) => workingDayOverrides.find(o => o.date === date);
	const isHolidayApplicable = (holiday: Holiday, staffId: string) =>
		holiday.scope === 'all' || holiday.staffIds.includes(staffId);
	const isConvertedWorkingDay = (d: Date, date: string) => {
		const isDefaultOff = d.getDay() === 0 || !!getHolidayFor(date);
		return isDefaultOff && !!getOverrideFor(date);
	};

	const hasApprovedUnlock = (empId: string, date: string) =>
		unlockRequests.some(r => r.staffId === empId && r.date === date && r.status === 'Approved');
	const hasPendingUnlock = (empId: string, date: string) =>
		unlockRequests.some(r => r.staffId === empId && r.date === date && r.status === 'Pending');
	const isLocked = (empId: string, date: string) => {
		const markedTime = markedAt[`${empId}_${date}`];
		if (!markedTime) return false;
		const hoursElapsed = (Date.now() - new Date(markedTime).getTime()) / 3_600_000;
		if (hoursElapsed <= lockHours) return false;
		return !hasApprovedUnlock(empId, date);
	};

	// Auto-mark PH for every day that's a holiday, for whichever staff it applies to -
	// only fills cells that have never been touched, so manual edits are never overwritten.
	useEffect(() => {
		if (holidays.length === 0 || employees.length === 0) return;
		setMap(prev => {
			let changed = false;
			const next = { ...prev };
			holidays.forEach(holiday => {
				employees
					.filter(emp => isHolidayApplicable(holiday, emp.id))
					.forEach(emp => {
						const key = `${emp.id}_${holiday.date}`;
						if (next[key] === undefined) {
							next[key] = 'PH';
							changed = true;
						}
					});
			});
			return changed ? next : prev;
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [holidays, employees]);

	const cycleStatus = async (empId: string, empName: string, d: Date, date: string) => {
		if (isLocked(empId, date)) {
			onRequestUnlock?.(empId, empName, date);
			return;
		}

		const key = `${empId}_${date}`;
		const current = map[key] ?? null;
		const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
		setMap(prev => ({ ...prev, [key]: next }));
		setMarkedAt(prev => ({ ...prev, [key]: new Date().toISOString() }));

		const holiday = getHolidayFor(date);
		const holidayApplies = !!holiday && isHolidayApplicable(holiday, empId);
		const overrideApplies = isConvertedWorkingDay(d, date);

		if (holidayApplies || overrideApplies) {
			if (next === 'P') {
				onEarnCompLeave?.(empId, empName, date, holiday ? `Worked on holiday: ${holiday.name}` : 'Worked on a Sunday (converted to working day)');
			} else {
				onRevokeCompLeave?.(empId, date);
			}
		}

		// Only push a status to the backend - cycling back to "unmarked" has no server-side
		// equivalent, so that step just stays local.
		if (next) {
			setMarkError(null);
			const statusLabel = STATUS.find(s => s.key === next)?.tooltip ?? next;
			try {
				const BASE_URL = getBaseUrl().replace(/\/$/, '');
				const res = await fetch(`${BASE_URL}/HRMS/mark_attendance`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ staff_id: empId, date: format(d, 'dd/MM/yyyy'), status: statusLabel }),
				});
				const data = await res.json();
				if (!res.ok || data?.success === false) throw new Error(data?.message || 'Failed to mark attendance');
			} catch (err) {
				setMap(prev => ({ ...prev, [key]: current }));
				setMarkError(`${empName}: ${err instanceof Error ? err.message : 'Failed to mark attendance'}`);
			}
		}
	};

	const rowTotals = (empId: string) => {
		const t = { P: 0, A: 0, PL: 0, PH: 0 };
		days.forEach(d => {
			const s = getStatus(empId, format(d, 'yyyy-MM-dd'));
			if (s) t[s]++;
		});
		return t;
	};

	const presentToday = employees.filter(e => getStatus(e.id, todayStr) === 'P').length;
	const absentToday  = employees.filter(e => getStatus(e.id, todayStr) === 'A').length;
	const markedToday  = employees.filter(e => getStatus(e.id, todayStr) !== null).length;
	const rate         = markedToday > 0 ? Math.round((presentToday / markedToday) * 100) : 0;

	const rowBg = (i: number) => i % 2 === 0 ? 'bg-white' : 'bg-slate-50';

	return (
		<div className="space-y-6">

			{/* ── Stats cards ── */}
			<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
				{([
					{ label: 'Total Staff',      value: employees.length, sub: 'Registered employees',    Icon: Users,      tone: 'bg-slate-50 text-slate-700 ring-slate-100'    },
					{ label: 'Present Today',     value: presentToday,     sub: `of ${employees.length} employees`, Icon: UserCheck, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
					{ label: 'Absent Today',      value: absentToday,      sub: `of ${employees.length} employees`, Icon: UserX,     tone: 'bg-rose-50 text-rose-700 ring-rose-100'       },
					{ label: 'Attendance Rate',   value: `${rate}%`,       sub: 'Of marked employees',     Icon: TrendingUp, tone: 'bg-blue-50 text-blue-700 ring-blue-100'       },
				] as const).map(({ label, value, sub, Icon, tone }) => (
					<div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
						<div className="flex items-start justify-between gap-4">
							<div className="min-w-0">
								<p className="text-sm font-bold text-slate-500">{label}</p>
								<p className="mt-3 text-3xl font-extrabold text-slate-950">{value}</p>
								<p className="mt-2 text-xs font-semibold text-slate-400">{sub}</p>
							</div>
							<div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1', tone)}>
								<Icon className="h-6 w-6" />
							</div>
						</div>
					</div>
				))}
			</div>

			{markError && (
				<div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-600">
					<span>{markError}</span>
					<button type="button" onClick={() => setMarkError(null)} className="shrink-0 rounded-md p-1 hover:bg-red-100">
						<X className="h-3.5 w-3.5" />
					</button>
				</div>
			)}
			{attendanceFetchError && (
				<div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-600">
					<span>{attendanceFetchError}</span>
					<button type="button" onClick={() => setAttendanceFetchError(null)} className="shrink-0 rounded-md p-1 hover:bg-red-100">
						<X className="h-3.5 w-3.5" />
					</button>
				</div>
			)}

			{/* ── Register card ── */}
			<div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">

				{/* Controls bar */}
				<div className="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3.5">
					<div className="flex items-center gap-2">
						<span className="text-xs font-bold uppercase tracking-wide text-slate-500">Month</span>
						<select
							value={month}
							onChange={(e) => setMonth(Number(e.target.value))}
							className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-bold text-slate-700 outline-none focus:border-[#0D3A35]"
						>
							{MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
						</select>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-xs font-bold uppercase tracking-wide text-slate-500">Year</span>
						<select
							value={year}
							onChange={(e) => setYear(Number(e.target.value))}
							className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-bold text-slate-700 outline-none focus:border-[#0D3A35]"
						>
							{YEARS.map(y => <option key={y} value={y}>{y}</option>)}
						</select>
					</div>

					{isLoadingAttendance && (
						<div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
							Loading attendance…
						</div>
					)}

					<div className="ml-auto flex flex-wrap items-center gap-2">
						{STATUS.map(s => (
							<span key={s.key} className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ring-1', s.badge)}>
								{s.label} · {s.tooltip}
							</span>
						))}
					</div>
				</div>

				{/* Scrollable table — one column per day */}
				<div className="overflow-x-auto">
					<table className="border-collapse text-sm" style={{ minWidth: 'max-content' }}>
						<thead>
							<tr>
								<th className="sticky left-0 z-30 w-10 border-r border-[#092b27] bg-[#0D3A35] py-3 text-center text-xs font-bold text-white/70">#</th>
								<th className="sticky left-[40px] z-30 w-[170px] border-r border-[#092b27] bg-[#0D3A35] py-3 px-3 text-left text-xs font-extrabold text-white">Employee</th>
								<th className="sticky left-[210px] z-30 w-[130px] border-r border-[#092b27] bg-[#0D3A35] py-3 px-3 text-left text-xs font-extrabold text-white">Department</th>
								<th className="sticky left-[340px] z-30 w-[150px] border-r-2 border-[#092b27] bg-[#0D3A35] py-3 px-3 text-left text-xs font-extrabold text-white">Designation</th>

								{days.map(d => {
									const ds       = format(d, 'yyyy-MM-dd');
									const isTdy    = ds === todayStr;
									const holiday  = getHolidayFor(ds);
									const override = getOverrideFor(ds);
									const isWorkingOverride = isConvertedWorkingDay(d, ds);
									const isOffTint = !!holiday && !isWorkingOverride;
									const title = holiday
										? `${holiday.name}${holiday.scope === 'specific' ? ' (selected staff only)' : ''}`
										: isWorkingOverride
											? `Working day${override?.note ? ` — ${override.note}` : ''} (comp-off eligible)`
											: undefined;
									return (
										<th
											key={d.toISOString()}
											title={title}
											className={cn(
												'w-11 border-r border-[#092b27] py-2 text-center',
												isTdy ? 'bg-emerald-600' : isWorkingOverride ? 'bg-blue-700' : isOffTint ? 'bg-[#0D3A35]/70' : 'bg-[#0D3A35]'
											)}
										>
											<div className={cn('text-sm font-extrabold leading-none', isTdy || isWorkingOverride ? 'text-white' : isOffTint ? 'text-amber-300' : 'text-white')}>
												{format(d, 'd')}
											</div>
											<div className={cn('mt-0.5 text-[10px]', isTdy ? 'text-emerald-100' : isWorkingOverride ? 'text-blue-200' : isOffTint ? 'text-amber-300/70' : 'text-white/60')}>
												{isWorkingOverride ? 'W' : holiday ? 'H' : format(d, 'EEEEE')}
											</div>
										</th>
									);
								})}

								<th className="sticky right-24 z-30 w-9 border-l-2 border-[#092b27] bg-[#0D3A35] py-3 text-center text-[11px] font-extrabold text-emerald-300">P</th>
								<th className="sticky right-16 z-30 w-9 border-l border-[#092b27] bg-[#0D3A35] py-3 text-center text-[11px] font-extrabold text-rose-300">A</th>
								<th className="sticky right-8  z-30 w-9 border-l border-[#092b27] bg-[#0D3A35] py-3 text-center text-[11px] font-extrabold text-blue-300">PL</th>
								<th className="sticky right-0  z-30 w-9 border-l border-[#092b27] bg-[#0D3A35] py-3 text-center text-[11px] font-extrabold text-amber-300">PH</th>
							</tr>
						</thead>

						<tbody>
							{isLoadingStaff && employees.length === 0 && (
								<tr>
									<td colSpan={4 + days.length + 4} className="py-10 text-center text-sm font-semibold text-slate-400">
										Loading staff directory…
									</td>
								</tr>
							)}
							{!isLoadingStaff && employees.length === 0 && (
								<tr>
									<td colSpan={4 + days.length + 4} className="py-10 text-center text-sm font-semibold text-slate-400">
										No staff found in the directory.
									</td>
								</tr>
							)}
							{employees.map((emp, idx) => {
								const bg = rowBg(idx);
								const t  = rowTotals(emp.id);
								return (
									<tr key={emp.id} className={cn('border-b border-slate-100 transition-colors hover:brightness-[0.98]', bg)}>

										<td className={cn('sticky left-0 z-20 w-10 border-r border-slate-200 px-2 py-3 text-center text-xs font-semibold text-slate-400', bg)}>
											{idx + 1}
										</td>
										<td className={cn('sticky left-[40px] z-20 w-[170px] border-r border-slate-200 px-3 py-3', bg)}>
											<div className="truncate text-xs font-extrabold text-slate-800">{emp.name}</div>
											<div className="mt-0.5 text-[10px] font-semibold text-slate-400">{emp.id}</div>
										</td>
										<td className={cn('sticky left-[210px] z-20 w-[130px] truncate border-r border-slate-200 px-3 py-3 text-xs font-bold text-slate-600', bg)}>
											{emp.department}
										</td>
										<td className={cn('sticky left-[340px] z-20 w-[150px] truncate border-r-2 border-slate-300 px-3 py-3 text-xs font-bold text-slate-600', bg)}>
											{emp.designation}
										</td>

										{days.map(d => {
											const ds       = format(d, 'yyyy-MM-dd');
											const cur      = getStatus(emp.id, ds);
											const meta     = STATUS.find(s => s.key === cur);
											const isTdy    = ds === todayStr;
											const holiday  = getHolidayFor(ds);
											const holidayApplies = !!holiday && isHolidayApplicable(holiday, emp.id);
											const isWorkingOverride = isConvertedWorkingDay(d, ds);
											const isOffTint = holidayApplies && !isWorkingOverride;
											const locked   = isLocked(emp.id, ds);
											const pendingUnlock = locked && hasPendingUnlock(emp.id, ds);

											const lockTitle = pendingUnlock
												? `${emp.name} — locked, unlock requested — awaiting Director Corporate approval`
												: locked
													? `${emp.name} — locked after ${lockHours}h — click to request unlock from Director Corporate`
													: `${emp.name} — ${meta?.tooltip ?? 'Unmarked'} — ${format(d, 'MMM d')}${holidayApplies ? ` — ${holiday!.name}` : ''}${isWorkingOverride ? ' (comp-off eligible)' : ''} — click to change`;

											return (
												<td
													key={`${emp.id}_${ds}`}
													onClick={() => cycleStatus(emp.id, emp.name, d, ds)}
													title={lockTitle}
													className={cn(
														'w-11 select-none border-r border-slate-100 py-2 text-center transition-colors',
														!meta && isOffTint && 'bg-amber-50/60',
														!meta && isWorkingOverride && 'bg-blue-50/50',
														!meta && isTdy && 'bg-emerald-50/50',
														locked ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-slate-100'
													)}
												>
													{locked ? (
														<Lock className={cn('mx-auto h-3.5 w-3.5', pendingUnlock ? 'text-amber-500' : 'text-slate-400')} />
													) : meta ? (
														<span className={cn('mx-auto inline-flex h-6 w-7 items-center justify-center rounded-md text-[10px] font-extrabold ring-1', meta.badge)}>
															{meta.label}
														</span>
													) : (
														<span className="mx-auto inline-block h-1.5 w-1.5 rounded-full bg-slate-200" />
													)}
												</td>
											);
										})}

										<td className={cn('sticky right-24 z-20 w-9 border-l-2 border-slate-200 py-3 text-center text-xs font-extrabold', t.P  ? 'text-emerald-600' : 'text-slate-300', bg)}>{t.P  || '—'}</td>
										<td className={cn('sticky right-16 z-20 w-9 border-l border-slate-100 py-3 text-center text-xs font-extrabold', t.A  ? 'text-rose-600'    : 'text-slate-300', bg)}>{t.A  || '—'}</td>
										<td className={cn('sticky right-8  z-20 w-9 border-l border-slate-100 py-3 text-center text-xs font-extrabold', t.PL ? 'text-blue-600'    : 'text-slate-300', bg)}>{t.PL || '—'}</td>
										<td className={cn('sticky right-0  z-20 w-9 border-l border-slate-100 py-3 text-center text-xs font-extrabold', t.PH ? 'text-amber-600'   : 'text-slate-300', bg)}>{t.PH || '—'}</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
};
