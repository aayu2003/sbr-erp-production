import { useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle,
  Download,
  FileText,
  IndianRupee,
  Eye,
  MoreVertical,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
  TrendingUp,
  User,
  X,
} from "lucide-react";

type LeaseTab = "Lease Schedule" | "Payment Schedule" | "Lease Ledger";
type LedgerRow = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  boolean,
];

const tabs: LeaseTab[] = ["Lease Schedule", "Payment Schedule", "Lease Ledger"];

const summaryCards = [
  {
    label: "Active Leases",
    value: "1",
    helper: "Active lease agreements",
    icon: Building2,
    valueClass: "text-slate-900",
  },
  {
    label: "Advance Balance",
    value: "₹0",
    helper: "Adjustable against rent",
    icon: TrendingUp,
    valueClass: "text-slate-900",
  },
  {
    label: "Upcoming Payments",
    value: "1",
    helper: "Due in next 30 days",
    icon: CalendarDays,
    valueClass: "text-slate-900",
  },
  {
    label: "Overdue",
    value: "0",
    helper: "Requires attention",
    icon: AlertCircle,
    valueClass: "text-red-500",
    iconClass: "text-red-500",
  },
];

const lease = {
  lessor: "Rakesh",
  lessorPhone: "55151512522",
  farmer: "Rakesh",
  farmerCode: "SBR-F-68294",
  land: "SBR-F-68294-L01",
  area: "32",
  areaLabel: "32 acres",
  rate: "₹25,000",
  frequency: "Annual",
  periodStart: "28 Dec 2025",
  periodEnd: "27 Nov 2026",
  annualValue: "₹8,00,000",
  advanceBalance: "₹0",
  paidAmount: "₹2,00,000",
  status: "Active",
};

const leaseScheduleRows = [
  {
    land: "SBR-F-68294-L01",
    owner: "Rakesh",
    area: "32.50 acres",
    paymentDue: "15 Jul 2026",
    amount: "₹2,00,000",
    expiry: "27 Nov 2026",
    status: "Upcoming",
  },
  {
    land: "SBR-F-68294-L02",
    owner: "Mahesh",
    area: "18.75 acres",
    paymentDue: "30 Jul 2026",
    amount: "₹1,12,500",
    expiry: "14 Dec 2026",
    status: "Upcoming",
  },
  {
    land: "SBR-F-68294-L03",
    owner: "Suresh",
    area: "12.00 acres",
    paymentDue: "05 Aug 2026",
    amount: "₹75,000",
    expiry: "31 Mar 2027",
    status: "Scheduled",
  },
];

const LeaseScheduleView = () => (
  <>
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {[
        ["Active Lands", "3", "Land parcels under lease", Building2, "text-slate-900"],
        ["Upcoming Dues", "₹3,87,500", "Due in next 60 days", CalendarDays, "text-orange-600"],
        ["Expiring Soon", "1", "Lease ending within 180 days", AlertCircle, "text-red-500"],
        ["Annual Lease Value", "₹13,42,500", "Across all active lands", TrendingUp, "text-emerald-600"],
      ].map(([label, value, helper, Icon, valueClass]) => {
        const MetricIcon = Icon as typeof Building2;

        return (
          <article key={label as string} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-semibold text-slate-800">{label as string}</p>
                <p className={`mt-4 text-3xl font-extrabold tracking-normal ${valueClass as string}`}>{value as string}</p>
                <p className="mt-1 text-sm font-medium text-slate-500">{helper as string}</p>
              </div>
              <MetricIcon className="h-5 w-5 text-slate-500" />
            </div>
          </article>
        );
      })}
    </section>

    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-normal text-slate-900">Lease Schedule</h2>
          <p className="mt-1.5 text-base font-medium text-slate-500">
            Payment schedule, upcoming dues, and lease expiry across all lands
          </p>
        </div>
        <select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none">
          <option>Next 60 days</option>
          <option>Next 30 days</option>
          <option>All active leases</option>
        </select>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-extrabold text-slate-500">
              <th className="px-4 py-3">Land Code</th>
              <th className="px-4 py-3">Land Owner</th>
              <th className="px-4 py-3">Area</th>
              <th className="px-4 py-3">Next Payment Due</th>
              <th className="px-4 py-3">Due Amount</th>
              <th className="px-4 py-3">Lease Expiry</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {leaseScheduleRows.map((row) => (
              <tr key={row.land} className="border-b border-slate-100 text-sm text-slate-800 last:border-b-0">
                <td className="whitespace-nowrap px-4 py-4 font-extrabold text-blue-600">{row.land}</td>
                <td className="whitespace-nowrap px-4 py-4 font-semibold">{row.owner}</td>
                <td className="whitespace-nowrap px-4 py-4 font-semibold">{row.area}</td>
                <td className="whitespace-nowrap px-4 py-4 font-semibold text-blue-600">{row.paymentDue}</td>
                <td className="whitespace-nowrap px-4 py-4 font-extrabold text-orange-600">{row.amount}</td>
                <td className="whitespace-nowrap px-4 py-4 font-semibold">{row.expiry}</td>
                <td className="whitespace-nowrap px-4 py-4">
                  <span
                    className={[
                      "rounded-full px-3 py-1 text-xs font-extrabold",
                      row.status === "Upcoming" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700",
                    ].join(" ")}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-4">
                  <button
                    type="button"
                    onClick={() => window.alert(`Opening schedule for ${row.land}`)}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>

    <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-extrabold text-slate-900">Upcoming Dues</h3>
        <div className="mt-4 space-y-3">
          {leaseScheduleRows.slice(0, 2).map((row) => (
            <div key={row.land} className="flex items-center justify-between rounded-lg bg-slate-50 p-4">
              <div>
                <p className="font-extrabold text-slate-900">{row.owner}</p>
                <p className="text-sm font-medium text-slate-500">{row.land} • Due {row.paymentDue}</p>
              </div>
              <p className="text-lg font-extrabold text-orange-600">{row.amount}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-extrabold text-slate-900">Lease Expiry Watch</h3>
        <div className="mt-4 space-y-3">
          {leaseScheduleRows.map((row) => (
            <div key={row.land} className="flex items-center justify-between rounded-lg bg-slate-50 p-4">
              <div>
                <p className="font-extrabold text-slate-900">{row.land}</p>
                <p className="text-sm font-medium text-slate-500">{row.owner} • {row.area}</p>
              </div>
              <p className="text-sm font-extrabold text-slate-700">{row.expiry}</p>
            </div>
          ))}
        </div>
      </article>
    </section>
  </>
);

const LeaseSummaryRow = () => (
  <tr className="border-b border-slate-100 text-sm text-slate-800 last:border-b-0">
    <td className="whitespace-nowrap px-4 py-4 font-medium">{lease.lessor}</td>
    <td className="px-4 py-4">
      <div className="flex items-center gap-3">
        <User className="h-4 w-4 text-slate-500" />
        <div>
          <p className="font-semibold text-slate-800">{lease.farmer}</p>
          <p className="mt-0.5 text-xs text-slate-500">{lease.farmerCode}</p>
        </div>
      </div>
    </td>
    <td className="whitespace-nowrap px-4 py-4 font-medium">{lease.land}</td>
    <td className="whitespace-nowrap px-4 py-4 font-medium">{lease.areaLabel}</td>
    <td className="whitespace-nowrap px-4 py-4 font-medium">{lease.rate}</td>
    <td className="whitespace-nowrap px-4 py-4">
      <StatusBadge label={lease.status} />
    </td>
    <td className="whitespace-nowrap px-4 py-4">
      <LeaseActions />
    </td>
  </tr>
);

const AllLeasesView = () => (
  <>
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input
        className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium outline-none placeholder:text-slate-500 focus:border-slate-300"
        placeholder="Search by lessor, farmer name, or land code..."
      />
    </div>

    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1060px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
              <th className="px-3 py-3">Lessor</th>
              <th className="px-3 py-3">Farmer</th>
              <th className="px-3 py-3">Land Code</th>
              <th className="px-3 py-3">Area</th>
              <th className="px-3 py-3">Lease Period</th>
              <th className="px-3 py-3">Rate/Acre/Year</th>
              <th className="px-3 py-3">Frequency</th>
              <th className="px-3 py-3">Advance</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr className="text-sm text-slate-800">
              <td className="px-3 py-4">
                <p className="font-semibold">{lease.lessor}</p>
                <p className="mt-0.5 text-xs text-slate-500">{lease.lessorPhone}</p>
              </td>
              <td className="px-3 py-4">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-500" />
                  <div>
                    <p className="font-semibold">{lease.farmer}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{lease.farmerCode}</p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-4 font-semibold">{lease.land}</td>
              <td className="px-3 py-4 font-semibold">{lease.area}</td>
              <td className="px-3 py-4">
                <p className="font-semibold">{lease.periodStart}</p>
                <p className="text-xs text-slate-500">to {lease.periodEnd}</p>
              </td>
              <td className="px-3 py-4 font-semibold">{lease.rate}</td>
              <td className="px-3 py-4 font-semibold">{lease.frequency}</td>
              <td className="px-3 py-4 font-semibold text-emerald-600">{lease.advanceBalance}</td>
              <td className="px-3 py-4">
                <StatusBadge label={lease.status} />
              </td>
              <td className="px-3 py-4">
                <LeaseActions highlightedPayment />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </>
);

const PaymentScheduleView = () => (
  <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-2xl font-extrabold tracking-normal text-slate-900">Payment Schedule</h2>
        <p className="mt-1 text-base font-medium text-slate-500">View and manage lease payment schedules</p>
      </div>

      <LeaseSelect />
    </div>

    <LeaseInfoStrip
      items={[
        ["Lessor", lease.lessor],
        ["Total Annual Value", lease.annualValue],
        ["Frequency", lease.frequency],
        ["Advance Balance", lease.advanceBalance, "text-emerald-600"],
      ]}
    />

    <div className="mt-8 overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 text-sm font-semibold text-slate-500">
            <th className="px-4 py-4">Period</th>
            <th className="px-4 py-4">Scheduled Amount</th>
            <th className="px-4 py-4">Adjustment</th>
            <th className="px-4 py-4">Net Payable</th>
            <th className="px-4 py-4">Paid Amount</th>
            <th className="px-4 py-4">Due Date</th>
            <th className="px-4 py-4">Status</th>
            <th className="px-4 py-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-sm text-slate-800">
            <td className="px-4 py-6">
              <p className="font-semibold">{lease.periodStart}</p>
              <p className="text-slate-500">to {lease.periodEnd}</p>
            </td>
            <td className="px-4 py-6 font-semibold">{lease.annualValue}</td>
            <td className="px-4 py-6 text-slate-400">-</td>
            <td className="px-4 py-6 font-semibold">{lease.annualValue}</td>
            <td className="px-4 py-6 font-semibold text-emerald-600">{lease.paidAmount}</td>
            <td className="px-4 py-6 font-semibold">26 Jun 2026</td>
            <td className="px-4 py-6">
              <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                Partially Paid
              </span>
            </td>
            <td className="px-4 py-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => window.alert(`Recording payment for ${lease.land}`)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#173f70] px-4 text-sm font-bold text-white hover:bg-[#12345e]"
                >
                  <IndianRupee className="h-4 w-4" />
                  Pay
                </button>
                <button
                  type="button"
                  onClick={() => window.confirm("Delete this scheduled payment?")}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
);

const LeaseLedgerView = () => {
  const ledgerRows = [
    ["28 Dec 2025", "JV-2025-001", "Lease Agreement Created", "Opening Entry", "Opening Entry", "-", "₹8,00,000", "₹8,00,000 Cr", "Cr", "-", false],
    ["06 Jan 2026", "PV-2026-015", "Advance Lease Payment", "Against Invoice INV-2026-001", "UTR: HDFC0001234", "₹2,00,000", "-", "₹6,00,000 Cr", "Cr", "NEFT", true],
    ["12 Jan 2026", "PV-2026-028", "Advance Lease Payment", "Against Invoice INV-2026-002", "UTR: ICIC0005678", "₹2,00,000", "-", "₹4,00,000 Cr", "Cr", "NEFT", true],
    ["15 Apr 2026", "(Expected)", "Next Installment Due", "As per Schedule", "-", "-", "-", "₹4,00,000 Cr", "Cr", "-", false],
    ["15 Jul 2026", "(Expected)", "Next Installment Due", "As per Schedule", "-", "-", "-", "₹4,00,000 Cr", "Cr", "-", false],
  ] as const satisfies readonly LedgerRow[];
  const [selectedEntry, setSelectedEntry] = useState<LedgerRow | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-3xl font-extrabold tracking-normal text-slate-900">Lease Ledger</h2>
          <p className="mt-1.5 text-base font-medium text-slate-500">
            Complete accounting ledger for lease agreement
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select className="h-10 min-w-[220px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-blue-300">
            <option>Rakesh</option>
            <option>All Land Owners</option>
            <option>Mahesh</option>
            <option>Suresh</option>
          </select>
          <button
            type="button"
            onClick={() => window.alert("Back to leases")}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Leases
          </button>
          <button
            type="button"
            onClick={() => window.alert("Exporting lease ledger")}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Export Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(240px,0.9fr)_minmax(260px,1fr)_minmax(240px,0.9fr)]">
            <div className="flex min-w-0 items-center gap-4 border-slate-200 xl:border-r xl:pr-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <User className="h-9 w-9" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-500">Lessor Name</p>
                <p className="mt-2 text-xl font-extrabold text-slate-900">{lease.lessor}</p>
                <div className="my-4 h-px bg-slate-200" />
                <p className="text-sm font-semibold text-slate-500">Farm ID</p>
                <p className="mt-2 break-words text-lg font-extrabold text-emerald-600">{lease.land}</p>
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-4 border-slate-200 md:grid-cols-3 xl:grid-cols-1 xl:border-r xl:px-5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-500">Lease Period</p>
                <p className="mt-2 flex min-w-0 items-center gap-2 text-sm font-extrabold text-slate-900">
                  <CalendarDays className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="break-words">{lease.periodStart} - {lease.periodEnd}</span>
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-500">Area</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-extrabold text-slate-900">
                  <Building2 className="h-4 w-4 shrink-0 text-slate-500" />
                  32.50 Acres
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-500">Agreement Date</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-extrabold text-slate-900">
                  <CalendarDays className="h-4 w-4 shrink-0 text-slate-500" />
                  {lease.periodStart}
                </p>
              </div>
            </div>

            <div className="min-w-0 space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-500">Annual Lease Value</p>
                <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-2xl font-extrabold text-emerald-600 sm:max-w-sm">
                  {lease.annualValue}
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500">Payment Frequency</p>
                <p className="mt-1 text-sm font-extrabold text-slate-900">Quarterly</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500">Payment Mode</p>
                <p className="mt-1 text-sm font-extrabold text-slate-900">NEFT</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-extrabold text-blue-600">Lease Summary</h3>
          {[
            ["Annual Lease Value", lease.annualValue, "text-slate-900"],
            ["Advance Paid", "₹4,00,000", "text-emerald-600"],
            ["Outstanding Amount", "₹4,00,000", "text-red-500"],
            ["Next Due Date", "15 Jul 2026", "text-blue-600"],
          ].map(([label, value, valueClass]) => (
            <div key={label} className="flex items-center justify-between border-b border-slate-200 py-3 text-sm">
              <span className="font-semibold text-slate-800">{label}</span>
              <span className={`font-extrabold ${valueClass}`}>{value}</span>
            </div>
          ))}
          <div className="flex items-center justify-between py-3 text-sm">
            <span className="font-semibold text-slate-800">Status</span>
            <span className="rounded-md bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-700">Partially Paid</span>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500">
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Voucher No.</th>
                <th className="px-3 py-3">Particulars / Narration</th>
                <th className="px-3 py-3">Ref. / Description</th>
                <th className="px-3 py-3">Debit (Dr)</th>
                <th className="px-3 py-3">Credit (Cr)</th>
                <th className="px-3 py-3">Running Balance</th>
                <th className="px-3 py-3">Balance Type</th>
                <th className="px-3 py-3">Mode</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.map((row) => {
                const [date, voucher, particulars, narration, ref, debit, credit, balance, balanceType, mode] = row;

                return (
                <tr
                  key={`${date}-${voucher}`}
                  onClick={() => setSelectedEntry(row)}
                  className="cursor-pointer border-b border-slate-200 text-sm text-slate-800 transition-colors last:border-b-0 hover:bg-blue-50/40"
                >
                  <td className="whitespace-nowrap px-3 py-3 font-semibold">{date}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-extrabold text-blue-600">{voucher}</td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <p className="font-extrabold">{particulars}</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">{narration}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold">{ref}</td>
                  <td className={`whitespace-nowrap px-3 py-3 font-extrabold ${debit !== "-" ? "text-emerald-600" : ""}`}>
                    {debit}
                  </td>
                  <td className={`whitespace-nowrap px-3 py-3 font-extrabold ${credit !== "-" ? "text-red-500" : ""}`}>
                    {credit}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-extrabold text-red-500">{balance}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-extrabold text-red-500">{balanceType}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-extrabold">{mode}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-5 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3 text-sm font-extrabold">
            <p>
              <span className="text-emerald-600">Dr (Debit)</span>
              <span className="text-slate-700"> = Amount paid by SBR to Lessor</span>
            </p>
            <p>
              <span className="text-red-500">Cr (Credit)</span>
              <span className="text-slate-700"> = Amount payable by SBR to Lessor (Liability)</span>
            </p>
          </div>

          <div className="rounded-lg bg-slate-100 px-8 py-5 text-center">
            <p className="text-sm font-extrabold text-slate-500">Closing Outstanding (Payable to Lessor)</p>
            <p className="mt-2 text-3xl font-extrabold tracking-normal text-red-500">₹4,00,000 Cr</p>
            <p className="mt-1 text-xs font-extrabold text-slate-500">As on 12 Jan 2026</p>
          </div>
        </div>
      </section>
      <LedgerEntryDetailsModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </div>
  );
};

const LedgerEntryDetailsModal = ({ entry, onClose }: { entry: LedgerRow | null; onClose: () => void }) => {
  if (!entry) return null;

  const [date, voucher, particulars, narration, ref, debit, credit, balance, balanceType, mode] = entry;
  const isPayment = voucher.startsWith("PV");
  const documents = [
    ["Invoice_INV-2026-001.pdf", "Uploaded on 05 Jan 2026", "pdf"],
    ["Payment Proof_UTR_HDFC0001234.pdf", "Uploaded on 06 Jan 2026", "pdf"],
    ["Bank Statement_Screenshot.png", "Uploaded on 06 Jan 2026", "image"],
    ["Lease Agreement.pdf", "Uploaded on 28 Dec 2025", "pdf"],
  ];
  const approvals = [
    ["Field Manager", "Suresh Kumar", "06 Jan 2026 11:35 AM"],
    ["Manager Operations", "Mahesh Patel", "06 Jan 2026 02:40 PM"],
    ["Finance Manager", "Neha Gupta", "06 Jan 2026 05:10 PM"],
    ["Director", "Rohit Verma", "07 Jan 2026 10:20 AM"],
  ];

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-2xl font-extrabold tracking-normal text-slate-900">Ledger Entry Details</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid max-h-[calc(92vh-132px)] overflow-y-auto lg:grid-cols-[1fr_1fr]">
          <div className="space-y-5 border-slate-200 p-6 lg:border-r">
            <DetailSection title="Entry Information">
              <DetailLine label="Date" value={date} />
              <DetailLine label="Voucher No." value={voucher} valueClass="text-blue-600" />
              <DetailLine label="Entry Type" value={particulars} />
              <DetailLine label="Particulars / Narration" value={`${particulars}\n${narration}`} />
              <DetailLine label="Ref. / Description" value={ref} />
              <DetailLine label="Mode of Payment" value={mode} />
              <DetailLine label="Bank Account" value={isPayment ? "SBI - Current A/c\n(12345678901)" : "-"} />
            </DetailSection>

            <DetailSection title="Amount Details">
              <DetailLine label="Debit (Dr)" value={debit} valueClass={debit !== "-" ? "text-emerald-600" : ""} />
              <DetailLine label="Credit (Cr)" value={credit} valueClass={credit !== "-" ? "text-red-500" : ""} />
              <DetailLine label="Running Balance" value={balance} valueClass="text-red-500" />
              <DetailLine label="Balance Type" value={`${balanceType} (Credit)`} valueClass="text-red-500" />
            </DetailSection>

            <DetailSection title="Additional Details">
              <DetailLine label="Payment Date" value={isPayment ? date : "-"} />
              <DetailLine label="UTR / Reference No." value={isPayment ? ref.replace("UTR: ", "") : "-"} />
              <DetailLine label="Remarks" value={isPayment ? "Advance for Q1 lease payment" : "Lease liability created"} />
            </DetailSection>
          </div>

          <div className="space-y-5 p-6">
            <DetailSection title="Supported Documents (4)" noBorder>
              <div className="space-y-3">
                {documents.map(([name, uploaded, type]) => (
                  <div key={name} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                    <FileText className={type === "image" ? "h-7 w-7 text-emerald-600" : "h-7 w-7 text-red-500"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold text-slate-800">{name}</p>
                      <p className="text-xs font-medium text-slate-500">{uploaded}</p>
                    </div>
                    <button type="button" className="text-sm font-extrabold text-blue-600 hover:text-blue-700">
                      View
                    </button>
                    <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-blue-600 hover:bg-blue-50">
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </DetailSection>

            <DetailSection title="Uploaded By">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-extrabold text-slate-700">
                  RL
                </div>
                <div>
                  <p className="text-sm font-extrabold text-slate-800">Ravi (Land Executive)</p>
                  <p className="text-xs font-medium text-slate-500">06 Jan 2026 11:25 AM</p>
                </div>
              </div>
            </DetailSection>

            <DetailSection title="Approved By" noBorder>
              <div className="relative space-y-4">
                <div className="absolute left-[11px] top-3 bottom-3 w-px bg-emerald-300" />
                {approvals.map(([role, person, time]) => (
                  <div key={role} className="relative flex items-start gap-3">
                    <CheckCircle className="relative z-10 h-6 w-6 fill-emerald-600 text-white" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-extrabold text-slate-800">{role}</p>
                          <p className="text-xs font-medium text-slate-500">{person}</p>
                        </div>
                        <p className="whitespace-nowrap text-xs font-semibold text-slate-500">{time}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </DetailSection>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => window.alert(`Printing entry ${voucher}`)}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Print Entry
          </button>
        </div>
      </div>
    </div>
  );
};

const RequestInput = ({ label, value, required = false }: { label: string; value: string; required?: boolean }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-extrabold text-slate-500">
      {label}
      {required ? <span className="text-red-500"> *</span> : null}
    </label>
    <input
      defaultValue={value}
      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-slate-300"
    />
  </div>
);

const RequestSelect = ({ label, value, options, required = false }: { label: string; value: string; options: string[]; required?: boolean }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-extrabold text-slate-500">
      {label}
      {required ? <span className="text-red-500"> *</span> : null}
    </label>
    <select
      defaultValue={value}
      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-slate-300"
    >
      {options.map((option) => (
        <option key={option}>{option}</option>
      ))}
    </select>
  </div>
);

const CreatePaymentRequestView = () => {
  const docs = [
    ["Invoice_INV-2026-001.pdf", "248 KB", "Uploaded on 05 Jan 2026"],
    ["Lease Agreement.pdf", "1.2 MB", "Uploaded on 28 Dec 2025"],
    ["Aadhaar Card.pdf", "512 KB", "Uploaded on 05 Jan 2026"],
    ["PAN Card.pdf", "320 KB", "Uploaded on 05 Jan 2026"],
    ["Bank Passbook.pdf", "1.1 MB", "Uploaded on 05 Jan 2026"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-2xl font-extrabold tracking-normal text-slate-900">Create Payment Request</h3>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Enter payment details and upload supporting documents
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => window.alert("Payment request saved as draft")}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            <Save className="h-4 w-4" />
            Save as Draft
          </button>
          <button
            type="button"
            onClick={() => window.alert("Payment request submitted for approval")}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-extrabold text-white shadow-sm hover:bg-emerald-700"
          >
            <Send className="h-4 w-4" />
            Submit for Approval
          </button>
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h4 className="text-sm font-extrabold text-slate-900">Select Lease</h4>
        <div className="mt-4 max-w-xl">
          <RequestSelect
            label="Choose Lease / Land"
            value="Rakesh - SBR-F-68294-L01"
            options={[
              "Rakesh - SBR-F-68294-L01",
              "Mahesh - SBR-F-68294-L02",
              "Suresh - SBR-F-68294-L03",
            ]}
            required
          />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h4 className="text-sm font-extrabold text-slate-900">Farmer & Lease Details</h4>
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr_1fr_370px]">
          <div className="flex items-center gap-4 border-slate-200 lg:border-r lg:pr-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <User className="h-9 w-9" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-500">Farmer / Lessor</p>
              <p className="mt-1 text-lg font-extrabold text-slate-900">{lease.lessor}</p>
              <p className="mt-4 text-xs font-extrabold text-slate-500">Farm ID</p>
              <p className="mt-1 text-base font-extrabold text-emerald-600">{lease.land}</p>
            </div>
          </div>
          <div className="space-y-5 border-slate-200 lg:border-r lg:px-5">
            <div>
              <p className="text-xs font-extrabold text-slate-500">Village</p>
              <p className="mt-1 text-sm font-extrabold text-slate-900">Khairagarh</p>
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-500">Area</p>
              <p className="mt-1 text-sm font-extrabold text-slate-900">32.50 Acres</p>
            </div>
          </div>
          <div className="space-y-5 border-slate-200 lg:border-r lg:px-5">
            <div>
              <p className="text-xs font-extrabold text-slate-500">Lease Period</p>
              <p className="mt-1 text-sm font-extrabold text-slate-900">{lease.periodStart} - {lease.periodEnd}</p>
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-500">Annual Lease Value</p>
              <p className="mt-1 text-sm font-extrabold text-slate-900">{lease.annualValue}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 rounded-lg border border-emerald-100 bg-emerald-50/30">
            {[
              ["Paid Till Date", "₹4,00,000", "text-emerald-600"],
              ["Outstanding Amount", "₹4,00,000", "text-red-500"],
              ["Next Due Date", "15 Jul 2026", "text-blue-600"],
              ["Payment Frequency", "Quarterly", "text-slate-900"],
            ].map(([label, value, valueClass]) => (
              <div key={label} className="border-b border-r border-emerald-100 p-4 last:border-r-0">
                <p className="text-xs font-extrabold text-slate-500">{label}</p>
                <p className={`mt-2 text-base font-extrabold ${valueClass}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.7fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="text-sm font-extrabold text-slate-900">Payment Request Information</h4>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <RequestInput label="Invoice Number" value="INV-2026-001" required />
            <RequestInput label="Payment Request Date" value="06 Jan 2026" required />
            <RequestInput label="Invoice Date" value="05 Jan 2026" required />
            <RequestSelect label="Payment For" value="Advance for Q1 lease payment" options={["Advance for Q1 lease payment", "Quarterly lease payment"]} required />
            <RequestInput label="Invoice Amount" value="₹2,00,000" required />
            <RequestSelect label="Payment Mode" value="NEFT" options={["NEFT", "RTGS", "Cheque", "Cash"]} required />
            <div className="grid grid-cols-2 gap-3">
              <RequestSelect label="GST Applicable" value="No" options={["No", "Yes"]} />
              <RequestSelect label="TDS Applicable" value="Yes (10%)" options={["Yes (10%)", "No"]} />
            </div>
            <RequestSelect label="Bank Account" value="SBI - Current A/c (12345678901)" options={["SBI - Current A/c (12345678901)", "HDFC - Current A/c (9876543210)"]} required />
            <RequestInput label="TDS Amount" value="₹20,000" />
            <RequestInput label="Due Date (As per Schedule)" value="15 Apr 2026" />
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-emerald-600">Net Payable Amount</label>
              <input
                defaultValue="₹1,80,000"
                className="h-10 w-full rounded-md border border-emerald-100 bg-emerald-50 px-3 text-sm font-extrabold text-emerald-600 outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-500">Remarks</label>
              <textarea
                defaultValue="Advance for Q1 lease payment as per agreement."
                maxLength={250}
                className="min-h-20 w-full resize-none rounded-md border border-slate-200 p-3 text-sm font-semibold text-slate-800 outline-none focus:border-slate-300"
              />
              <p className="text-xs font-semibold text-slate-500">49 / 250</p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-extrabold text-slate-900">Supporting Documents</h4>
            <div className="flex items-center gap-4">
              <span className="text-sm font-extrabold text-emerald-600">(5/5)</span>
              <button
                type="button"
                onClick={() => window.alert("Upload more documents")}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-extrabold text-slate-800 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Upload More
              </button>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {docs.map(([name, size, uploaded]) => (
              <div key={name} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                <FileText className="h-6 w-6 text-red-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-slate-800">{name}</p>
                  <p className="text-xs font-semibold text-slate-500">{size} • {uploaded}</p>
                </div>
                <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-blue-600 hover:bg-blue-50">
                  <Eye className="h-4 w-4" />
                </button>
                <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-blue-600 hover:bg-blue-50">
                  <Download className="h-4 w-4" />
                </button>
                <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-red-500 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-extrabold text-blue-600">
            Note: All documents are mandatory.
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h4 className="text-sm font-extrabold text-slate-900">Payment Summary</h4>
        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-center">
          <SummaryBox label="Invoice Amount" value="₹2,00,000" />
          <span className="text-xl font-extrabold text-slate-500">-</span>
          <SummaryBox label="TDS Amount (10%)" value="₹20,000" />
          <span className="text-xl font-extrabold text-slate-500">=</span>
          <SummaryBox label="Net Payable Amount" value="₹1,80,000" valueClass="text-emerald-600" />
          <span className="text-xl font-extrabold text-slate-500">→</span>
          <div className="min-w-[360px] rounded-lg border border-slate-200 p-4">
            <p className="text-xs font-extrabold text-slate-500">Amount in Words</p>
            <p className="mt-2 text-sm font-extrabold text-slate-900">One Lakh Eighty Thousand Rupees Only</p>
          </div>
        </div>
      </section>
    </div>
  );
};

const SummaryBox = ({ label, value, valueClass = "text-slate-900" }: { label: string; value: string; valueClass?: string }) => (
  <div className="min-w-[160px] rounded-lg border border-slate-200 p-4">
    <p className="text-xs font-extrabold text-slate-500">{label}</p>
    <p className={`mt-2 text-lg font-extrabold ${valueClass}`}>{value}</p>
  </div>
);

const DetailSection = ({
  title,
  children,
  noBorder = false,
}: {
  title: string;
  children: ReactNode;
  noBorder?: boolean;
}) => (
  <section className={noBorder ? "" : "border-b border-slate-200 pb-5"}>
    <h3 className="mb-4 text-base font-extrabold text-blue-600">{title}</h3>
    {children}
  </section>
);

const DetailLine = ({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) => (
  <div className="grid grid-cols-[150px_1fr] gap-4 py-2 text-sm">
    <span className="font-semibold text-slate-500">{label}</span>
    <span className={`whitespace-pre-line font-extrabold text-slate-800 ${valueClass}`}>{value}</span>
  </div>
);

const LeaseSelect = () => (
  <select className="h-11 min-w-[300px] rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-800 outline-none focus:border-slate-300">
    <option>Rakesh - SBR-F-68294-L01</option>
    <option>All active leases</option>
  </select>
);

const LeaseInfoStrip = ({ items }: { items: [string, string, string?][] }) => (
  <div className="mt-7 grid grid-cols-1 gap-4 rounded-lg bg-slate-50 px-5 py-5 md:grid-cols-4">
    {items.map(([label, value, valueClass]) => (
      <div key={label}>
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className={`mt-1 text-base font-semibold text-slate-900 ${valueClass ?? ""}`}>{value}</p>
      </div>
    ))}
  </div>
);

const StatusBadge = ({ label }: { label: string }) => (
  <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
    {label}
  </span>
);

const LeaseActions = ({ highlightedPayment = false }: { highlightedPayment?: boolean }) => (
  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={() => window.alert(`Opening payment schedule for ${lease.land}`)}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
    >
      <CalendarDays className="h-4 w-4" />
    </button>
    <button
      type="button"
      onClick={() => window.alert(`Opening lease document for ${lease.land}`)}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
    >
      <FileText className="h-4 w-4" />
    </button>
    <button
      type="button"
      onClick={() => window.alert(`Recording payment for ${lease.land}`)}
      className={[
        "inline-flex h-9 w-9 items-center justify-center rounded-md shadow-sm",
        highlightedPayment
          ? "bg-[#173f70] text-white hover:bg-[#12345e]"
          : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
      ].join(" ")}
    >
      <IndianRupee className="h-4 w-4" />
    </button>
    <button
      type="button"
      onClick={() => window.confirm(`Delete lease ${lease.land}?`)}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-red-500 hover:bg-red-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
    {!highlightedPayment ? (
      <button
        type="button"
        onClick={() => window.alert(`More actions for ${lease.land}`)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
    ) : null}
  </div>
);

const FieldLabel = ({ children }: { children: ReactNode }) => (
  <label className="text-sm font-semibold text-slate-800">{children}</label>
);

const SelectLike = ({
  value,
  options = [value],
  className = "",
}: {
  value: string;
  options?: string[];
  className?: string;
}) => (
  <select
    defaultValue={value}
    className={`h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm outline-none focus:border-slate-300 ${className}`}
  >
    {options.map((option) => (
      <option key={option}>{option}</option>
    ))}
  </select>
);

const NewLeaseModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [allowAdvanceAdjustment, setAllowAdvanceAdjustment] = useState(true);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-extrabold tracking-normal text-slate-900">New Lease</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Create a lease agreement and payment terms</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-140px)] overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel>Select Land</FieldLabel>
              <SelectLike
                value="Select land to auto-fill"
                options={["Select land to auto-fill", "SBR-F-68294-L01", "Manual entry"]}
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>Lease Area (Acres) *</FieldLabel>
              <input
                type="number"
                defaultValue="0"
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm outline-none focus:border-slate-300"
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>Lease Start Date *</FieldLabel>
              <input
                type="date"
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm outline-none focus:border-slate-300"
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>Lease End Date *</FieldLabel>
              <input
                type="date"
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm outline-none focus:border-slate-300"
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>Rate per Acre per Year (₹) *</FieldLabel>
              <input
                type="number"
                defaultValue="0"
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm outline-none focus:border-slate-300"
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>Payment Frequency *</FieldLabel>
              <SelectLike value="Monthly" options={["Monthly", "Quarterly", "Half-yearly", "Annual"]} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <FieldLabel>Payment Due Date</FieldLabel>
              <SelectLike
                value="6 months after period start"
                options={["Monthly due date", "3 months after period start", "6 months after period start", "End of lease period"]}
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>Security Deposit (₹)</FieldLabel>
              <input
                type="number"
                defaultValue="0"
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm outline-none focus:border-slate-300"
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>Advance Paid (₹)</FieldLabel>
              <input
                type="number"
                defaultValue="0"
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm outline-none focus:border-slate-300"
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 md:col-span-2">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Allow Advance Adjustment</p>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    Adjust advance against future lease payments
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAllowAdvanceAdjustment((value) => !value)}
                  className={[
                    "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                    allowAdvanceAdjustment ? "bg-[#173f70]" : "bg-slate-300",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                      allowAdvanceAdjustment ? "translate-x-[22px]" : "translate-x-1",
                    ].join(" ")}
                  />
                </button>
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <FieldLabel>Remarks</FieldLabel>
              <textarea
                placeholder="Additional notes..."
                className="min-h-24 w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm outline-none placeholder:text-slate-500 focus:border-slate-300"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              window.alert("Lease saved");
              onClose();
            }}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[#173f70] px-5 text-sm font-semibold text-white hover:bg-[#12345e]"
          >
            Save Lease
          </button>
        </div>
      </div>
    </div>
  );
};

const AccountsLedger = () => {
  const [activeTab, setActiveTab] = useState<LeaseTab>("Lease Schedule");
  const [isNewLeaseOpen, setIsNewLeaseOpen] = useState(false);

  return (
    <div className="min-h-full bg-[#f7f7f8] p-4 text-slate-900">
      <div className="mx-auto max-w-[1480px] space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-normal text-slate-900">Lease Management</h1>
            <p className="mt-1.5 text-base font-medium text-slate-500">
              Manage lease agreements, payments, and accounting
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsNewLeaseOpen(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#173f70] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#12345e]"
          >
            <Plus className="h-4 w-4" />
            New Lease
          </button>
        </header>

        <div className="inline-flex rounded-lg bg-slate-100/80 p-1 shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={[
                "h-9 rounded-md px-4 text-sm font-medium transition-colors",
                activeTab === tab ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
              ].join(" ")}
            >
              {tab === "Payment Schedule" ? "Create Payment Request" : tab}
            </button>
          ))}
        </div>

        {activeTab === "Lease Schedule" ? <LeaseScheduleView /> : null}
        {activeTab === "Payment Schedule" ? <CreatePaymentRequestView /> : null}
        {activeTab === "Lease Ledger" ? <LeaseLedgerView /> : null}
      </div>
      <NewLeaseModal open={isNewLeaseOpen} onClose={() => setIsNewLeaseOpen(false)} />
    </div>
  );
};

export default AccountsLedger;
