import { useEffect, useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { IndianRupee, TrendingDown, Users, Wallet } from 'lucide-react';

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

interface SalaryStructure {
	basic: number;
	hra: number;
	otherAllowances: number;
	leaveEncashment: number;
	bonus: number;
	lta: number;
	epf: number;
	esi: number;
	profTax: number;
	itds: number;
	loan: number;
	salAdvance: number;
	travelAdvance: number;
	advanceExpense: number;
	advanceOther: number;
	telephoneExpense: number;
	leaveBalance: number;
}

interface PayrollModuleProps {
	attendanceMap: Record<string, DayStatus | null>;
	salaryStructures: Record<string, SalaryStructure>;
	onSetSalaryField: (staffId: string, field: keyof SalaryStructure, value: number) => void;
}

const EMPTY_STRUCTURE: SalaryStructure = {
	basic: 0, hra: 0, otherAllowances: 0, leaveEncashment: 0, bonus: 0, lta: 0,
	epf: 0, esi: 0, profTax: 0, itds: 0, loan: 0, salAdvance: 0,
	travelAdvance: 0, advanceExpense: 0, advanceOther: 0, telephoneExpense: 0, leaveBalance: 0,
};

const EARNING_FIELDS: { key: keyof SalaryStructure; label: string; prorated: boolean }[] = [
	{ key: 'basic',           label: 'Basic',        prorated: true  },
	{ key: 'hra',             label: 'H.R.A.',       prorated: true  },
	{ key: 'otherAllowances', label: 'Oth. All',     prorated: true  },
	{ key: 'leaveEncashment', label: 'Leave Encash', prorated: false },
	{ key: 'bonus',           label: 'Bonus',        prorated: false },
	{ key: 'lta',             label: 'LTA',          prorated: false },
];

const DEDUCTION_FIELDS: { key: keyof SalaryStructure; label: string }[] = [
	{ key: 'epf',              label: 'E.P.F.'    },
	{ key: 'esi',               label: 'E.S.I.'    },
	{ key: 'profTax',           label: 'Prof Tax'  },
	{ key: 'itds',              label: 'ITDS'      },
	{ key: 'loan',              label: 'Loan'      },
	{ key: 'salAdvance',        label: 'Sal Adv'   },
	{ key: 'travelAdvance',     label: 'Trav Adv'  },
	{ key: 'advanceExpense',    label: 'Adv Exp'   },
	{ key: 'advanceOther',      label: 'Adv. Oth.' },
	{ key: 'telephoneExpense',  label: 'Tele. Exp' },
];

const MONTHS = [
	'January','February','March','April','May','June',
	'July','August','September','October','November','December',
];
const YEARS = [2024, 2025, 2026, 2027];

const formatINR = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const TOTAL_COLUMNS = 3 + 4 + EARNING_FIELDS.length + 1 + DEDUCTION_FIELDS.length + 1 + 1 + 1 + 1;

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export const PayrollModule = ({ attendanceMap, salaryStructures, onSetSalaryField }: PayrollModuleProps) => {
	const today = new Date();

	const [month, setMonth] = useState(today.getMonth());
	const [year,  setYear]  = useState(today.getFullYear());
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [isLoadingStaff, setIsLoadingStaff] = useState(false);

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
	const totalDaysInMonth = days.length;

	const getStatus = (empId: string, date: string): DayStatus | null =>
		attendanceMap[`${empId}_${date}`] ?? null;

	const computePayroll = (emp: Employee) => {
		let present = 0, absent = 0, paidLeave = 0, paidHoliday = 0;
		days.forEach(d => {
			const s = getStatus(emp.id, format(d, 'yyyy-MM-dd'));
			if (s === 'P') present++;
			else if (s === 'A') absent++;
			else if (s === 'PL') paidLeave++;
			else if (s === 'PH') paidHoliday++;
		});
		const daysPaid = present + paidLeave + paidHoliday;
		const lossOfPay = absent;
		const structure = salaryStructures[emp.id] ?? EMPTY_STRUCTURE;
		const prorationFactor = totalDaysInMonth > 0 ? daysPaid / totalDaysInMonth : 0;

		const earningPayable = Object.fromEntries(
			EARNING_FIELDS.map(f => [f.key, f.prorated ? structure[f.key] * prorationFactor : structure[f.key]])
		) as Record<string, number>;
		const totalEarnings = EARNING_FIELDS.reduce((sum, f) => sum + earningPayable[f.key], 0);
		const totalDeductions = DEDUCTION_FIELDS.reduce((sum, f) => sum + structure[f.key], 0);
		const netPayable = Math.max(0, totalEarnings - totalDeductions);

		return { present, absent, paidLeave, paidHoliday, daysPaid, lossOfPay, structure, totalEarnings, totalDeductions, netPayable };
	};

	const rows = employees.map(emp => ({ emp, calc: computePayroll(emp) }));

	const totals = rows.reduce(
		(acc, r) => ({
			earnings: acc.earnings + r.calc.totalEarnings,
			deductions: acc.deductions + r.calc.totalDeductions,
			net: acc.net + r.calc.netPayable,
		}),
		{ earnings: 0, deductions: 0, net: 0 }
	);

	const rowBg = (i: number) => i % 2 === 0 ? 'bg-white' : 'bg-slate-50';

	const statusFor = (calc: ReturnType<typeof computePayroll>) => {
		if (calc.structure.basic === 0) return { label: 'Setup Needed', tone: 'bg-slate-100 text-slate-600 ring-slate-200' };
		if (calc.lossOfPay > 5) return { label: 'Review', tone: 'bg-rose-50 text-rose-700 ring-rose-100' };
		return { label: 'Ready', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' };
	};

	const inputCell = (key: string, bg: string, value: number, onChange: (val: number) => void) => (
		<td key={key} className={cn('border-r border-slate-100 px-1.5 py-2', bg)}>
			<input
				type="number"
				min="0"
				value={value || ''}
				onChange={(e) => onChange(Number(e.target.value))}
				placeholder="0"
				className="h-8 w-20 rounded-md border border-slate-200 px-1.5 text-[11px] font-bold text-slate-800 outline-none focus:border-[#0D3A35]"
			/>
		</td>
	);

	return (
		<div className="space-y-6">

			{/* ── Stats cards ── */}
			<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
				{([
					{ label: 'Employees',    value: employees.length,          sub: `Payroll for ${MONTHS[month]} ${year}`, Icon: Users,        tone: 'bg-slate-50 text-slate-700 ring-slate-100'    },
					{ label: 'Total Earnings', value: formatINR(totals.earnings),   sub: 'Sum of payable earnings',  Icon: IndianRupee,  tone: 'bg-blue-50 text-blue-700 ring-blue-100'       },
					{ label: 'Total Deductions', value: formatINR(totals.deductions), sub: 'EPF, ESI, tax, advances etc.', Icon: TrendingDown, tone: 'bg-rose-50 text-rose-700 ring-rose-100'       },
					{ label: 'Net Payable',   value: formatINR(totals.net),        sub: 'Earnings minus deductions', Icon: Wallet,       tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
				] as const).map(({ label, value, sub, Icon, tone }) => (
					<div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
						<div className="flex items-start justify-between gap-4">
							<div className="min-w-0">
								<p className="text-sm font-bold text-slate-500">{label}</p>
								<p className="mt-3 truncate text-2xl font-extrabold text-slate-950">{value}</p>
								<p className="mt-2 text-xs font-semibold text-slate-400">{sub}</p>
							</div>
							<div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1', tone)}>
								<Icon className="h-6 w-6" />
							</div>
						</div>
					</div>
				))}
			</div>

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
					<p className="ml-auto text-xs font-semibold text-slate-400">
						Basic / H.R.A. / Oth. All are pro-rated by Days Pd ÷ {totalDaysInMonth} days · Other earnings & all deductions are taken as entered
					</p>
				</div>

				{/* Table */}
				<div className="overflow-x-auto">
					<table className="border-collapse text-sm" style={{ minWidth: 'max-content' }}>
						<thead>
							<tr>
								<th className="sticky left-0 z-30 w-10 border-r border-[#092b27] bg-[#0D3A35] py-3 text-center text-xs font-bold text-white/70">#</th>
								<th className="sticky left-[40px] z-30 w-[170px] border-r border-[#092b27] bg-[#0D3A35] py-3 px-3 text-left text-xs font-extrabold text-white">Employee</th>
								<th className="sticky left-[210px] z-30 w-[130px] border-r-2 border-[#092b27] bg-[#0D3A35] py-3 px-3 text-left text-xs font-extrabold text-white">Department</th>

								<th className="w-12 border-r border-[#092b27] bg-[#0D3A35] py-3 text-center text-[11px] font-extrabold text-emerald-300">Present</th>
								<th className="w-12 border-r border-[#092b27] bg-[#0D3A35] py-3 text-center text-[11px] font-extrabold text-blue-300">Leaves</th>
								<th className="w-14 border-r border-[#092b27] bg-[#0D3A35] py-3 text-center text-[11px] font-extrabold text-rose-300">L-O-P</th>
								<th className="w-16 border-r-2 border-[#092b27] bg-[#0D3A35] py-3 text-center text-[11px] font-extrabold text-white">Days Pd</th>

								{EARNING_FIELDS.map(f => (
									<th key={f.key} className="w-20 border-r border-[#092b27] bg-[#0D3A35] py-3 px-1.5 text-center text-[11px] font-extrabold text-white">{f.label}</th>
								))}
								<th className="w-24 border-r-2 border-[#092b27] bg-[#0D3A35] py-3 px-2 text-right text-[11px] font-extrabold text-blue-200">Tot. Earnings</th>

								{DEDUCTION_FIELDS.map(f => (
									<th key={f.key} className="w-20 border-r border-[#092b27] bg-[#0D3A35] py-3 px-1.5 text-center text-[11px] font-extrabold text-white">{f.label}</th>
								))}
								<th className="w-24 border-r-2 border-[#092b27] bg-[#0D3A35] py-3 px-2 text-right text-[11px] font-extrabold text-rose-200">Tot. Deductions</th>

								<th className="w-28 border-r border-[#092b27] bg-[#0D3A35] py-3 px-2 text-right text-[11px] font-extrabold text-emerald-300">Net Payable</th>
								<th className="w-20 border-r border-[#092b27] bg-[#0D3A35] py-3 px-1.5 text-center text-[11px] font-extrabold text-white">Leave Bal.</th>
								<th className="w-24 bg-[#0D3A35] py-3 px-2 text-left text-[11px] font-extrabold text-white">Status</th>
							</tr>
						</thead>

						<tbody>
							{isLoadingStaff && employees.length === 0 && (
								<tr>
									<td colSpan={TOTAL_COLUMNS} className="py-10 text-center text-sm font-semibold text-slate-400">
										Loading staff directory…
									</td>
								</tr>
							)}
							{!isLoadingStaff && employees.length === 0 && (
								<tr>
									<td colSpan={TOTAL_COLUMNS} className="py-10 text-center text-sm font-semibold text-slate-400">
										No staff found in the directory.
									</td>
								</tr>
							)}
							{rows.map(({ emp, calc }, idx) => {
								const bg = rowBg(idx);
								const status = statusFor(calc);
								return (
									<tr key={emp.id} className={cn('border-b border-slate-100 transition-colors hover:brightness-[0.98]', bg)}>
										<td className={cn('sticky left-0 z-20 w-10 border-r border-slate-200 px-2 py-3 text-center text-xs font-semibold text-slate-400', bg)}>
											{idx + 1}
										</td>
										<td className={cn('sticky left-[40px] z-20 w-[170px] border-r border-slate-200 px-3 py-3', bg)}>
											<div className="truncate text-xs font-extrabold text-slate-800">{emp.name}</div>
											<div className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">{emp.designation}</div>
										</td>
										<td className={cn('sticky left-[210px] z-20 w-[130px] truncate border-r-2 border-slate-300 px-3 py-3 text-xs font-bold text-slate-600', bg)}>
											{emp.department}
										</td>

										<td className={cn('border-r border-slate-100 py-3 text-center text-xs font-extrabold', calc.present ? 'text-emerald-600' : 'text-slate-300', bg)}>{calc.present || '—'}</td>
										<td className={cn('border-r border-slate-100 py-3 text-center text-xs font-extrabold', calc.paidLeave ? 'text-blue-600' : 'text-slate-300', bg)}>{calc.paidLeave || '—'}</td>
										<td className={cn('border-r border-slate-100 py-3 text-center text-xs font-extrabold', calc.lossOfPay ? 'text-rose-600' : 'text-slate-300', bg)}>{calc.lossOfPay || '—'}</td>
										<td className={cn('border-r-2 border-slate-300 py-3 text-center text-xs font-extrabold text-slate-700', bg)}>{calc.daysPaid}</td>

										{EARNING_FIELDS.map(f =>
											inputCell(f.key, bg, calc.structure[f.key], (val) => onSetSalaryField(emp.id, f.key, val))
										)}
										<td className={cn('border-r-2 border-slate-300 px-2 py-3 text-right text-xs font-extrabold text-blue-700', bg)}>{formatINR(calc.totalEarnings)}</td>

										{DEDUCTION_FIELDS.map(f =>
											inputCell(f.key, bg, calc.structure[f.key], (val) => onSetSalaryField(emp.id, f.key, val))
										)}
										<td className={cn('border-r-2 border-slate-300 px-2 py-3 text-right text-xs font-extrabold text-rose-700', bg)}>{formatINR(calc.totalDeductions)}</td>

										<td className={cn('border-r border-slate-100 px-2 py-3 text-right text-xs font-extrabold text-emerald-700', bg)}>{formatINR(calc.netPayable)}</td>
										{inputCell('leaveBalance', bg, calc.structure.leaveBalance, (val) => onSetSalaryField(emp.id, 'leaveBalance', val))}
										<td className={cn('px-2 py-3', bg)}>
											<span className={cn('rounded-full px-2 py-1 text-[10px] font-extrabold ring-1', status.tone)}>{status.label}</span>
										</td>
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
