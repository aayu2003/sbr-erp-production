import { useState, useEffect, type ReactNode } from "react";
import getBaseUrl from "@/lib/config";
import {
  BookOpen,
  TrendingUp,
  TrendingDown,
  IndianRupee,
  FileText,
  Building2,
  CreditCard,
  AlertCircle,
  CheckCircle,
  Download,
  Plus,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Wallet,
  BarChart2,
  PieChart,
  Landmark,
  Receipt,
  Calculator,
  RefreshCw,
  Eye,
  Edit3,
  X,
  Layers,
  Target,
  Settings,
  Users,
  Trash2,
  Network,
  BookMarked,
  Phone,
  User,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type AccountingTab =
  | "Overview"
  | "Journal Vouchers"
  | "Trial Balance"
  | "Profit & Loss"
  | "Cash & Bank"
  | "GST Summary"
  | "Masters"
  | "Cost Centre";

type MasterSubTab = "Ledger Master" | "Group Master" | "Voucher Types";
type CostCentreSubTab = "Cost Centres" | "Allocation" | "Create";

// ── Mock Data ─────────────────────────────────────────────────────────────────

const kpiCards = [
  { label: "Total Assets", value: "₹2,84,50,000", change: "+8.2%", trend: "up", icon: Building2, color: "text-blue-600", bg: "bg-blue-50" },
  { label: "Total Liabilities", value: "₹89,30,000", change: "-3.1%", trend: "down", icon: Landmark, color: "text-red-500", bg: "bg-red-50" },
  { label: "Net Worth", value: "₹1,95,20,000", change: "+12.4%", trend: "up", icon: Wallet, color: "text-emerald-600", bg: "bg-emerald-50" },
  { label: "Revenue (Jun'26)", value: "₹43,80,000", change: "+6.5%", trend: "up", icon: TrendingUp, color: "text-indigo-600", bg: "bg-indigo-50" },
  { label: "Expenses (Jun'26)", value: "₹31,20,000", change: "+2.1%", trend: "up", icon: TrendingDown, color: "text-orange-600", bg: "bg-orange-50" },
  { label: "Net Profit (Jun'26)", value: "₹12,60,000", change: "+18.7%", trend: "up", icon: BarChart2, color: "text-emerald-600", bg: "bg-emerald-50" },
];

const voucherTypes = ["All", "Sales", "Purchase", "Payment", "Receipt", "Journal", "Contra", "Debit Note", "Credit Note"];

const voucherTypeColors: Record<string, string> = {
  Sales: "bg-emerald-100 text-emerald-700",
  Purchase: "bg-orange-100 text-orange-700",
  Payment: "bg-red-100 text-red-700",
  Receipt: "bg-blue-100 text-blue-700",
  Journal: "bg-slate-100 text-slate-700",
  Contra: "bg-purple-100 text-purple-700",
  "Debit Note": "bg-amber-100 text-amber-700",
  "Credit Note": "bg-teal-100 text-teal-700",
};

const journalVouchers = [
  { id: "JV-2026-0142", date: "05 Jun 2026", type: "Purchase", narration: "Diesel purchase from Agro Diesel Supplies", ledger: "Fuel Expenses A/c", dr: "₹3,00,000", cr: "-", party: "Agro Diesel Supplies", gst: "₹54,000", status: "Posted" },
  { id: "JV-2026-0141", date: "04 Jun 2026", type: "Payment", narration: "NEFT payment to Green Seeds Traders", ledger: "Accounts Payable A/c", dr: "-", cr: "₹1,45,000", party: "Green Seeds Traders", gst: "-", status: "Posted" },
  { id: "JV-2026-0140", date: "04 Jun 2026", type: "Receipt", narration: "Receipt from sugarcane sale — Lot #SC-0042", ledger: "Revenue A/c", dr: "-", cr: "₹8,50,000", party: "SBR Sugar Mill", gst: "₹1,53,000", status: "Posted" },
  { id: "JV-2026-0139", date: "03 Jun 2026", type: "Journal", narration: "Depreciation entry — Farm machinery (Jun'26)", ledger: "Machinery A/c", dr: "₹45,000", cr: "₹45,000", party: "-", gst: "-", status: "Posted" },
  { id: "JV-2026-0138", date: "03 Jun 2026", type: "Purchase", narration: "Fertiliser purchase — Shakti Fertilizers", ledger: "Agriculture Input A/c", dr: "₹2,10,000", cr: "-", party: "Shakti Fertilizers", gst: "₹37,800", status: "Posted" },
  { id: "JV-2026-0137", date: "02 Jun 2026", type: "Payment", narration: "Labour wages — May 2026 payroll disbursement", ledger: "Staff Salary A/c", dr: "₹6,80,000", cr: "-", party: "Multiple", gst: "-", status: "Posted" },
  { id: "JV-2026-0136", date: "02 Jun 2026", type: "Contra", narration: "Cash deposited to SBI current account", ledger: "Cash A/c → Bank A/c", dr: "₹5,00,000", cr: "₹5,00,000", party: "-", gst: "-", status: "Posted" },
  { id: "JV-2026-0135", date: "01 Jun 2026", type: "Credit Note", narration: "Return of damaged seeds — INV-VEN-2026-091", ledger: "Green Seeds Traders A/c", dr: "₹15,000", cr: "-", party: "Green Seeds Traders", gst: "₹2,700", status: "Posted" },
  { id: "JV-2026-0134", date: "01 Jun 2026", type: "Receipt", narration: "Lease advance received — Farm Block B4", ledger: "Lease Advance A/c", dr: "-", cr: "₹2,50,000", party: "Farmer: Ramesh Patil", gst: "-", status: "Posted" },
  { id: "JV-2026-0133", date: "31 May 2026", type: "Journal", narration: "Closing stock adjustment — Fertiliser warehouse", ledger: "Inventory A/c", dr: "₹80,000", cr: "₹80,000", party: "-", gst: "-", status: "Posted" },
];

const trialBalanceGroups = [
  {
    group: "Capital Account",
    accounts: [
      { name: "Share Capital A/c", dr: "-", cr: "₹1,50,00,000" },
      { name: "Retained Earnings A/c", dr: "-", cr: "₹45,20,000" },
    ],
    drTotal: "-",
    crTotal: "₹1,95,20,000",
  },
  {
    group: "Loans (Liability)",
    accounts: [
      { name: "SBI Term Loan A/c", dr: "-", cr: "₹52,00,000" },
      { name: "HDFC Working Capital Loan", dr: "-", cr: "₹18,00,000" },
    ],
    drTotal: "-",
    crTotal: "₹70,00,000",
  },
  {
    group: "Current Liabilities",
    accounts: [
      { name: "Accounts Payable A/c", dr: "-", cr: "₹12,80,000" },
      { name: "GST Payable A/c", dr: "-", cr: "₹4,50,000" },
      { name: "TDS Payable A/c", dr: "-", cr: "₹2,00,000" },
    ],
    drTotal: "-",
    crTotal: "₹19,30,000",
  },
  {
    group: "Fixed Assets",
    accounts: [
      { name: "Land & Building A/c", dr: "₹1,80,00,000", cr: "-" },
      { name: "Farm Machinery A/c", dr: "₹42,50,000", cr: "-" },
      { name: "Vehicles A/c", dr: "₹18,00,000", cr: "-" },
      { name: "Accumulated Depreciation", dr: "-", cr: "₹12,00,000" },
    ],
    drTotal: "₹2,40,50,000",
    crTotal: "₹12,00,000",
  },
  {
    group: "Current Assets",
    accounts: [
      { name: "Cash A/c", dr: "₹8,50,000", cr: "-" },
      { name: "Bank — SBI Current A/c", dr: "₹24,00,000", cr: "-" },
      { name: "Accounts Receivable A/c", dr: "₹9,50,000", cr: "-" },
      { name: "Inventory A/c", dr: "₹2,00,000", cr: "-" },
    ],
    drTotal: "₹44,00,000",
    crTotal: "-",
  },
  {
    group: "Revenue",
    accounts: [
      { name: "Sugarcane Sales A/c", dr: "-", cr: "₹38,00,000" },
      { name: "Lease Income A/c", dr: "-", cr: "₹5,80,000" },
    ],
    drTotal: "-",
    crTotal: "₹43,80,000",
  },
  {
    group: "Expenses",
    accounts: [
      { name: "Fuel Expenses A/c", dr: "₹6,40,000", cr: "-" },
      { name: "Agriculture Input A/c", dr: "₹8,20,000", cr: "-" },
      { name: "Staff Salary A/c", dr: "₹12,00,000", cr: "-" },
      { name: "Depreciation A/c", dr: "₹2,80,000", cr: "-" },
      { name: "Misc. Expenses A/c", dr: "₹1,80,000", cr: "-" },
    ],
    drTotal: "₹31,20,000",
    crTotal: "-",
  },
];

const plRevenue = [
  { name: "Sugarcane Sales", amount: "₹38,00,000" },
  { name: "Lease Income", amount: "₹5,80,000" },
];

const plExpenses = [
  { name: "Agriculture Inputs (Seeds, Fertilisers)", amount: "₹8,20,000" },
  { name: "Fuel & Consumables", amount: "₹6,40,000" },
  { name: "Staff Salaries & Wages", amount: "₹12,00,000" },
  { name: "Depreciation", amount: "₹2,80,000" },
  { name: "Miscellaneous Expenses", amount: "₹1,80,000" },
];

const bankAccounts = [
  { name: "SBI — Current A/c (12345678901)", balance: "₹24,00,000", lastTxn: "05 Jun 2026", status: "Active" },
  { name: "HDFC — OD A/c (9876543210)", balance: "₹6,50,000", lastTxn: "04 Jun 2026", status: "Active" },
  { name: "Cash in Hand", balance: "₹8,50,000", lastTxn: "05 Jun 2026", status: "Active" },
];

const bankTransactions = [
  { date: "05 Jun 2026", desc: "NEFT — Farm Machinery Works (WO-2026-006)", dr: "₹2,25,000", cr: "-", balance: "₹24,00,000" },
  { date: "04 Jun 2026", desc: "NEFT received — SBR Sugar Mill sugarcane payment", dr: "-", cr: "₹8,50,000", balance: "₹26,25,000" },
  { date: "03 Jun 2026", desc: "Cash deposit to SBI current account", dr: "-", cr: "₹5,00,000", balance: "₹17,75,000" },
  { date: "02 Jun 2026", desc: "RTGS — Labour wages disbursement (May 2026)", dr: "₹6,80,000", cr: "-", balance: "₹12,75,000" },
  { date: "01 Jun 2026", desc: "Interest received — FD maturity credit", dr: "-", cr: "₹42,000", balance: "₹19,55,000" },
];

const gstFiling = [
  { period: "Jun 2026", gstr1: "Pending", gstr3b: "Pending", itc: "₹94,500", liability: "₹1,46,200", paid: "-", due: "20 Jul 2026", status: "Pending" },
  { period: "May 2026", gstr1: "Filed", gstr3b: "Filed", itc: "₹94,500", liability: "₹1,42,000", paid: "₹47,500", due: "20 Jun 2026", status: "Paid" },
  { period: "Apr 2026", gstr1: "Filed", gstr3b: "Filed", itc: "₹88,200", liability: "₹1,30,000", paid: "₹41,800", due: "20 May 2026", status: "Paid" },
  { period: "Mar 2026", gstr1: "Filed", gstr3b: "Filed", itc: "₹1,05,000", liability: "₹1,55,000", paid: "₹50,000", due: "20 Apr 2026", status: "Paid" },
];

// ── Masters Data ──────────────────────────────────────────────────────────────



const costCategoryMasters = [
  { name: "Farm Operations", desc: "All field-level crop and farming activities", centres: 4, budget: "₹23,50,000" },
  { name: "Machinery & Equipment", desc: "Tractor, harvester, and farm equipment costs", centres: 1, budget: "₹4,00,000" },
  { name: "Logistics", desc: "Transportation, fleet, and delivery costs", centres: 1, budget: "₹3,50,000" },
  { name: "Corporate / Administration", desc: "HO, admin, HR and overhead costs", centres: 2, budget: "₹4,00,000" },
];

// ── Cost Centre Data ───────────────────────────────────────────────────────────

const costCentres = [
  { code: "CC-001", name: "Farm Block A", category: "Farm Operations", manager: "Rajesh Kumar", budget: 800000, actual: 680000 },
  { code: "CC-002", name: "Farm Block B", category: "Farm Operations", manager: "Suresh Patil", budget: 750000, actual: 590000 },
  { code: "CC-003", name: "Irrigation Division", category: "Farm Operations", manager: "Anil Sharma", budget: 300000, actual: 240000 },
  { code: "CC-004", name: "Harvest Operations", category: "Farm Operations", manager: "Vikram Rao", budget: 500000, actual: 420000 },
  { code: "CC-005", name: "Machinery & Equipment", category: "Machinery & Equipment", manager: "Mohan Desai", budget: 400000, actual: 380000 },
  { code: "CC-006", name: "Logistics", category: "Logistics", manager: "Kiran Joshi", budget: 350000, actual: 330000 },
  { code: "CC-007", name: "Administration", category: "Corporate / Administration", manager: "Priya Nair", budget: 250000, actual: 210000 },
  { code: "CC-008", name: "HO Corporate", category: "Corporate / Administration", manager: "Deepak Mehta", budget: 150000, actual: 130000 },
];

const ccAllocationRows = [
  { expense: "Fuel Expenses A/c", total: "₹6,40,000", blockA: "₹2,10,000", blockB: "₹1,80,000", irrigation: "₹80,000", harvest: "₹90,000", machinery: "₹60,000", logistics: "₹20,000" },
  { expense: "Agriculture Input A/c", total: "₹8,20,000", blockA: "₹3,20,000", blockB: "₹2,80,000", irrigation: "₹60,000", harvest: "₹1,60,000", machinery: "-", logistics: "-" },
  { expense: "Staff Salary A/c", total: "₹12,00,000", blockA: "₹2,40,000", blockB: "₹2,20,000", irrigation: "₹80,000", harvest: "₹1,60,000", machinery: "₹2,40,000", logistics: "₹2,60,000" },
  { expense: "Depreciation A/c", total: "₹2,80,000", blockA: "₹40,000", blockB: "₹40,000", irrigation: "₹20,000", harvest: "₹20,000", machinery: "₹1,40,000", logistics: "₹20,000" },
  { expense: "Misc. Expenses A/c", total: "₹1,80,000", blockA: "₹70,000", blockB: "₹70,000", irrigation: "₹10,000", harvest: "₹10,000", machinery: "₹10,000", logistics: "₹10,000" },
];

const natureColors: Record<string, string> = {
  Liability: "bg-red-100 text-red-700",
  Asset: "bg-blue-100 text-blue-700",
  Revenue: "bg-emerald-100 text-emerald-700",
  Expense: "bg-orange-100 text-orange-700",
};

// ── Bank onboarding helpers ───────────────────────────────────────────────────

type BankAccountEntry = {
  id: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branch?: string;
  holderName: string;
  accountType?: "Current" | "Savings" | "";
  authorisedPerson?: { name: string; phone: string };
  rmName?: string;
  rmPhone?: string;
};

type StaffOption = {
  id: string;
  name: string;
  phone: string;
};

type StaffApiItem = {
  staff_id?: string;
  staff_information?: {
    staff_name?: string;
    staff_phone?: string;
  };
};

const BANK_LOGO_MAP: Record<string, { bg: string; ring: string; abbr: string; textColor: string }> = {
  sbi:              { bg: "bg-[#2255a4]",  ring: "ring-blue-300",   abbr: "SBI",   textColor: "text-white" },
  "state bank":     { bg: "bg-[#2255a4]",  ring: "ring-blue-300",   abbr: "SBI",   textColor: "text-white" },
  hdfc:             { bg: "bg-[#004C8F]",  ring: "ring-blue-400",   abbr: "HDFC",  textColor: "text-white" },
  icici:            { bg: "bg-[#F37021]",  ring: "ring-orange-300", abbr: "ICICI", textColor: "text-white" },
  axis:             { bg: "bg-[#800000]",  ring: "ring-red-300",    abbr: "AXIS",  textColor: "text-white" },
  kotak:            { bg: "bg-[#EE1C25]",  ring: "ring-red-300",    abbr: "KMB",   textColor: "text-white" },
  pnb:              { bg: "bg-[#1A237E]",  ring: "ring-indigo-300", abbr: "PNB",   textColor: "text-white" },
  "punjab national":{ bg: "bg-[#1A237E]",  ring: "ring-indigo-300", abbr: "PNB",   textColor: "text-white" },
  canara:           { bg: "bg-[#007BC3]",  ring: "ring-cyan-300",   abbr: "CBK",   textColor: "text-white" },
  "union bank":     { bg: "bg-[#4A148C]",  ring: "ring-purple-300", abbr: "UBI",   textColor: "text-white" },
  "bank of baroda": { bg: "bg-[#F57C00]",  ring: "ring-orange-300", abbr: "BOB",   textColor: "text-white" },
  bob:              { bg: "bg-[#F57C00]",  ring: "ring-orange-300", abbr: "BOB",   textColor: "text-white" },
  idfc:             { bg: "bg-[#D81B60]",  ring: "ring-pink-300",   abbr: "IDFC",  textColor: "text-white" },
  "yes bank":       { bg: "bg-[#0d47a1]",  ring: "ring-blue-300",   abbr: "YES",   textColor: "text-white" },
  federal:          { bg: "bg-[#1565C0]",  ring: "ring-blue-300",   abbr: "FED",   textColor: "text-white" },
  "indian bank":    { bg: "bg-[#1B5E20]",  ring: "ring-green-300",  abbr: "IB",    textColor: "text-white" },
  rbl:              { bg: "bg-[#C62828]",  ring: "ring-red-300",    abbr: "RBL",   textColor: "text-white" },
  indusind:         { bg: "bg-[#7B1FA2]",  ring: "ring-purple-300", abbr: "IIB",   textColor: "text-white" },
  bandhan:          { bg: "bg-[#E65100]",  ring: "ring-orange-300", abbr: "BDN",   textColor: "text-white" },
};

function getBankLogo(name: string): { bg: string; ring: string; abbr: string; textColor: string } {
  const lower = name.toLowerCase();
  if (lower.includes("cash")) return { bg: "bg-emerald-600", ring: "ring-emerald-300", abbr: "CASH", textColor: "text-white" };
  for (const [key, val] of Object.entries(BANK_LOGO_MAP)) {
    if (lower.includes(key)) return val;
  }
  const abbr = name.replace(/[^A-Za-z ]/g, "").trim().split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 4);
  return { bg: "bg-slate-600", ring: "ring-slate-300", abbr: abbr || "BNK", textColor: "text-white" };
}

// ── Main Component ────────────────────────────────────────────────────────────

const Accounting = () => {
  const [activeTab, setActiveTab] = useState<AccountingTab>("Overview");
  const [showNewJVModal, setShowNewJVModal] = useState(false);
  const [showAddBankModal, setShowAddBankModal] = useState(false);
  const [addedBanks, setAddedBanks] = useState<BankAccountEntry[]>([]);

  const accountingTabs: AccountingTab[] = [
    "Overview",
    "Journal Vouchers",
    "Trial Balance",
    "Profit & Loss",
    "Cash & Bank",
    "GST Summary",
    "Masters",
    "Cost Centre",
  ];

  return (
    <div className="min-h-full bg-[#f7f7f8] p-4 text-slate-900">
      <div className="mx-auto max-w-[1480px] space-y-5">
        {/* Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-normal text-slate-900">Accounting</h1>
            <p className="mt-1.5 text-base font-medium text-slate-500">
              Double-entry bookkeeping · Journals · Ledgers · GST · Financial Statements
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold shadow-sm hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
            {activeTab === "Cash & Bank" ? (
              <button
                type="button"
                onClick={() => setShowAddBankModal(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#173f70] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#12345e]"
              >
                <Plus className="h-4 w-4" />
                Add Bank
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowNewJVModal(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#173f70] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#12345e]"
              >
                <Plus className="h-4 w-4" />
                New Journal Entry
              </button>
            )}
          </div>
        </header>

        {/* KPI Cards */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {kpiCards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${card.bg}`}>
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <p className="text-xs font-semibold text-slate-500">{card.label}</p>
                <p className={`mt-1 text-xl font-extrabold ${card.color}`}>{card.value}</p>
                <p className={`mt-1 text-xs font-semibold ${card.trend === "up" ? "text-emerald-600" : "text-red-500"}`}>
                  {card.change} vs last month
                </p>
              </article>
            );
          })}
        </section>

        {/* Tabs */}
        <div className="inline-flex flex-wrap rounded-lg bg-slate-100/80 p-1 shadow-sm gap-0.5">
          {accountingTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={[
                "h-9 rounded-md px-4 text-sm font-medium transition-colors",
                activeTab === tab ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
              ].join(" ")}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "Overview" && <OverviewTab onNewJV={() => setShowNewJVModal(true)} />}
        {activeTab === "Journal Vouchers" && <JournalVouchersTab />}
        {activeTab === "Trial Balance" && <TrialBalanceTab />}
        {activeTab === "Profit & Loss" && <ProfitLossTab />}
        {activeTab === "Cash & Bank" && <CashBankTab addedBanks={addedBanks} />}
        {activeTab === "GST Summary" && <GSTSummaryTab />}
        {activeTab === "Masters" && <MastersTab />}
        {activeTab === "Cost Centre" && <CostCentreTab />}
      </div>

      {showNewJVModal && <NewJournalEntryModal onClose={() => setShowNewJVModal(false)} />}
      {showAddBankModal && (
        <AddBankModal
          onClose={() => setShowAddBankModal(false)}
          onSave={(bank) => {
            setAddedBanks((prev) => [...prev, bank]);
            setShowAddBankModal(false);
          }}
        />
      )}
    </div>
  );
};

// ── Overview Tab ──────────────────────────────────────────────────────────────

const OverviewTab = ({ onNewJV }: { onNewJV: () => void }) => (
  <div className="space-y-5">
    {/* Quick Access Modules */}
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {[
        { icon: FileText, label: "Journal Voucher", desc: "Record all transactions", color: "text-indigo-600", bg: "bg-indigo-50", action: true },
        { icon: BookOpen, label: "General Ledger", desc: "Account-wise entries", color: "text-blue-600", bg: "bg-blue-50" },
        { icon: BarChart2, label: "Trial Balance", desc: "Dr–Cr verification", color: "text-emerald-600", bg: "bg-emerald-50" },
        { icon: PieChart, label: "P&L Statement", desc: "Monthly financials", color: "text-orange-600", bg: "bg-orange-50" },
        { icon: Wallet, label: "Cash & Bank", desc: "Liquidity position", color: "text-teal-600", bg: "bg-teal-50" },
        { icon: Calculator, label: "GST Returns", desc: "GSTR-1, GSTR-3B filing", color: "text-amber-600", bg: "bg-amber-50" },
        { icon: Receipt, label: "Voucher Types", desc: "Pmt · Rcpt · JV · Contra", color: "text-purple-600", bg: "bg-purple-50" },
        { icon: TrendingUp, label: "Cash Flow", desc: "Inflow / Outflow analysis", color: "text-slate-600", bg: "bg-slate-100" },
      ].map(({ icon: Icon, label, desc, color, bg, action }) => (
        <button
          key={label}
          type="button"
          onClick={action ? onNewJV : undefined}
          className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 hover:bg-slate-50 text-left transition-colors"
        >
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${bg}`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <div>
            <p className="text-sm font-extrabold text-slate-800">{label}</p>
            <p className="text-xs font-medium text-slate-500">{desc}</p>
          </div>
        </button>
      ))}
    </div>

    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
      {/* Recent Journal Entries */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">Recent Journal Entries</h2>
            <p className="text-xs font-medium text-slate-500 mt-0.5">Last 5 posted vouchers</p>
          </div>
          <button type="button" className="text-xs font-extrabold text-blue-600 hover:underline">
            View All
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs font-extrabold text-slate-500">
                <th className="px-4 py-3">Voucher No.</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Narration</th>
                <th className="px-4 py-3">Dr</th>
                <th className="px-4 py-3">Cr</th>
              </tr>
            </thead>
            <tbody>
              {journalVouchers.slice(0, 5).map((jv) => (
                <tr key={jv.id} className="border-b border-slate-100 text-sm last:border-b-0 hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 font-extrabold text-blue-600">{jv.id}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{jv.date}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${voucherTypeColors[jv.type] ?? "bg-slate-100 text-slate-700"}`}>
                      {jv.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-700 max-w-[240px] truncate">{jv.narration}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-extrabold text-emerald-600">{jv.dr}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-extrabold text-red-500">{jv.cr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Side Panels */}
      <div className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-extrabold text-slate-900 mb-4">Accounting Position</h2>
          {[
            { label: "Total Assets", value: "₹2,84,50,000", color: "text-blue-600" },
            { label: "Total Liabilities", value: "₹89,30,000", color: "text-red-500" },
            { label: "Net Worth (Capital)", value: "₹1,95,20,000", color: "text-emerald-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center justify-between border-b border-slate-100 py-3 last:border-b-0 last:pb-0">
              <span className="text-sm font-semibold text-slate-600">{label}</span>
              <span className={`text-sm font-extrabold ${color}`}>{value}</span>
            </div>
          ))}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-extrabold text-slate-900 mb-4">Pending Actions</h2>
          {[
            { icon: AlertCircle, label: "GST-3B filing pending", sub: "Due: 20 Jul 2026", color: "text-orange-600", bg: "bg-orange-50" },
            { icon: FileText, label: "3 vouchers in draft", sub: "Awaiting review & posting", color: "text-amber-600", bg: "bg-amber-50" },
            { icon: RefreshCw, label: "Bank reconciliation due", sub: "Last done: 01 Jun 2026", color: "text-blue-600", bg: "bg-blue-50" },
          ].map(({ icon: Icon, label, sub, color, bg }) => (
            <div key={label} className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-b-0 last:pb-0">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${bg}`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              <div>
                <p className="text-sm font-extrabold text-slate-800">{label}</p>
                <p className="text-xs font-semibold text-slate-500">{sub}</p>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  </div>
);

// ── Journal Vouchers Tab ──────────────────────────────────────────────────────

const JournalVouchersTab = () => {
  const [selectedType, setSelectedType] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = journalVouchers.filter((jv) => {
    const matchType = selectedType === "All" || jv.type === selectedType;
    const q = search.toLowerCase();
    const matchSearch =
      jv.narration.toLowerCase().includes(q) ||
      jv.id.toLowerCase().includes(q) ||
      jv.party.toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">Journal Vouchers</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">
            All accounting entries — Sales · Purchase · Payment · Receipt · Journal · Contra
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold shadow-sm hover:bg-slate-50">
            <Filter className="h-4 w-4" />
            Filter Period
          </button>
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold shadow-sm hover:bg-slate-50">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Type filter chips */}
      <div className="flex flex-wrap gap-2">
        {voucherTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setSelectedType(type)}
            className={[
              "h-8 rounded-md px-3 text-xs font-extrabold transition-colors",
              selectedType === type
                ? "bg-[#173f70] text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            ].join(" ")}
          >
            {type}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search voucher, party..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-slate-300"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500">
                <th className="px-4 py-3">Voucher No.</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Narration</th>
                <th className="px-4 py-3">Party</th>
                <th className="px-4 py-3">Dr Amount</th>
                <th className="px-4 py-3">Cr Amount</th>
                <th className="px-4 py-3">GST</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((jv) => (
                <tr key={jv.id} className="border-b border-slate-100 text-sm last:border-b-0 hover:bg-blue-50/30">
                  <td className="whitespace-nowrap px-4 py-3 font-extrabold text-blue-600">{jv.id}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{jv.date}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${voucherTypeColors[jv.type] ?? "bg-slate-100 text-slate-700"}`}>
                      {jv.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-700 max-w-[240px] truncate">{jv.narration}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{jv.party}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-extrabold text-emerald-600">{jv.dr}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-extrabold text-red-500">{jv.cr}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{jv.gst}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-700">
                      {jv.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <FileText className="h-8 w-8 mb-2" />
            <p className="text-sm font-medium">No vouchers match your filter</p>
          </div>
        )}
      </section>
    </div>
  );
};

// ── Trial Balance Tab ─────────────────────────────────────────────────────────

const TrialBalanceTab = () => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (group: string) =>
    setExpanded((prev) => ({ ...prev, [group]: !prev[group] }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">Trial Balance</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Debit–Credit verification of all ledger accounts · As on 05 Jun 2026
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold shadow-sm outline-none">
            <option>Jun 2026</option>
            <option>May 2026</option>
            <option>Apr 2026</option>
            <option>FY 2025-26</option>
          </select>
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold shadow-sm hover:bg-slate-50">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500">
              <th className="px-5 py-3 w-[55%]">Account / Group</th>
              <th className="px-5 py-3 text-right">Debit (Dr)</th>
              <th className="px-5 py-3 text-right">Credit (Cr)</th>
            </tr>
          </thead>
          <tbody>
            {trialBalanceGroups.map((grp) => (
              <TrialBalanceGroup
                key={grp.group}
                grp={grp}
                isExpanded={!!expanded[grp.group]}
                onToggle={() => toggle(grp.group)}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-900 text-white">
              <td className="px-5 py-4 text-sm font-extrabold">Grand Total</td>
              <td className="px-5 py-4 text-right text-sm font-extrabold">₹3,15,70,000</td>
              <td className="px-5 py-4 text-right text-sm font-extrabold">₹3,15,70,000</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <p className="text-xs font-semibold text-slate-500 text-center">
        ✓ Trial Balance is balanced — Total Debits = Total Credits (₹3,15,70,000)
      </p>
    </div>
  );
};

const TrialBalanceGroup = ({
  grp,
  isExpanded,
  onToggle,
}: {
  grp: (typeof trialBalanceGroups)[number];
  isExpanded: boolean;
  onToggle: () => void;
}) => (
  <>
    <tr
      onClick={onToggle}
      className="cursor-pointer border-b border-slate-200 bg-slate-50/60 hover:bg-slate-100 transition-colors"
    >
      <td className="px-5 py-3 font-extrabold text-slate-800">
        <span className="flex items-center gap-2">
          {isExpanded
            ? <ChevronDown className="h-4 w-4 text-slate-500" />
            : <ChevronRight className="h-4 w-4 text-slate-500" />}
          {grp.group}
        </span>
      </td>
      <td className={`px-5 py-3 text-right font-extrabold text-sm ${grp.drTotal !== "-" ? "text-emerald-700" : "text-slate-400"}`}>
        {grp.drTotal}
      </td>
      <td className={`px-5 py-3 text-right font-extrabold text-sm ${grp.crTotal !== "-" ? "text-red-600" : "text-slate-400"}`}>
        {grp.crTotal}
      </td>
    </tr>
    {isExpanded &&
      grp.accounts.map((acc) => (
        <tr key={acc.name} className="border-b border-slate-100 hover:bg-blue-50/30">
          <td className="px-5 py-2.5 pl-12 text-sm font-semibold text-slate-700">{acc.name}</td>
          <td className={`px-5 py-2.5 text-right text-sm font-semibold ${acc.dr !== "-" ? "text-emerald-600" : "text-slate-400"}`}>
            {acc.dr}
          </td>
          <td className={`px-5 py-2.5 text-right text-sm font-semibold ${acc.cr !== "-" ? "text-red-500" : "text-slate-400"}`}>
            {acc.cr}
          </td>
        </tr>
      ))}
  </>
);

// ── Profit & Loss Tab ─────────────────────────────────────────────────────────

const ProfitLossTab = () => (
  <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900">Profit & Loss Statement</h2>
        <p className="text-sm font-medium text-slate-500 mt-1">
          Income and expenditure for the period · Jun 2026
        </p>
      </div>
      <div className="flex items-center gap-3">
        <select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold shadow-sm outline-none">
          <option>Jun 2026</option>
          <option>May 2026</option>
          <option>FY 2025-26</option>
        </select>
        <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold shadow-sm hover:bg-slate-50">
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {/* Revenue */}
      <section className="overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-sm">
        <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-4">
          <h3 className="text-base font-extrabold text-emerald-700">Revenue / Income</h3>
        </div>
        <table className="w-full border-collapse">
          <tbody>
            {plRevenue.map((item) => (
              <tr key={item.name} className="border-b border-slate-100">
                <td className="px-5 py-3 text-sm font-semibold text-slate-700">{item.name}</td>
                <td className="px-5 py-3 text-right text-sm font-extrabold text-emerald-600">{item.amount}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-emerald-200 bg-emerald-50">
              <td className="px-5 py-4 text-sm font-extrabold text-emerald-700">Total Revenue</td>
              <td className="px-5 py-4 text-right text-lg font-extrabold text-emerald-700">₹43,80,000</td>
            </tr>
          </tfoot>
        </table>
      </section>

      {/* Expenses */}
      <section className="overflow-hidden rounded-lg border border-red-200 bg-white shadow-sm">
        <div className="border-b border-red-100 bg-red-50 px-5 py-4">
          <h3 className="text-base font-extrabold text-red-600">Expenses / Expenditure</h3>
        </div>
        <table className="w-full border-collapse">
          <tbody>
            {plExpenses.map((item) => (
              <tr key={item.name} className="border-b border-slate-100">
                <td className="px-5 py-3 text-sm font-semibold text-slate-700">{item.name}</td>
                <td className="px-5 py-3 text-right text-sm font-extrabold text-red-500">{item.amount}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-red-200 bg-red-50">
              <td className="px-5 py-4 text-sm font-extrabold text-red-600">Total Expenses</td>
              <td className="px-5 py-4 text-right text-lg font-extrabold text-red-600">₹31,20,000</td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>

    {/* Net Profit Summary */}
    <section className="rounded-lg border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-400">Net Profit — Jun 2026</p>
          <p className="text-4xl font-extrabold text-emerald-400 mt-1">₹12,60,000</p>
          <p className="text-sm font-semibold text-slate-400 mt-1">Profit Margin: 28.77%</p>
        </div>
        <div className="space-y-3 min-w-[280px]">
          {[
            { label: "Total Revenue", value: "₹43,80,000", color: "text-emerald-400" },
            { label: "(-) Total Expenses", value: "₹31,20,000", color: "text-red-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center justify-between gap-8">
              <span className="text-sm font-semibold text-slate-300">{label}</span>
              <span className={`text-sm font-extrabold ${color}`}>{value}</span>
            </div>
          ))}
          <div className="border-t border-slate-700 pt-3 flex items-center justify-between gap-8">
            <span className="text-sm font-extrabold text-white">Net Profit</span>
            <span className="text-lg font-extrabold text-emerald-400">₹12,60,000</span>
          </div>
        </div>
      </div>
    </section>
  </div>
);

// ── Cash & Bank Tab ───────────────────────────────────────────────────────────

const CashBankTab = ({ addedBanks }: { addedBanks: BankAccountEntry[] }) => {
  return (
  <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900">Cash & Bank</h2>
        <p className="text-sm font-medium text-slate-500 mt-1">
          Bank balances, cash position, and reconciliation
        </p>
      </div>
      <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold shadow-sm hover:bg-slate-50">
        <RefreshCw className="h-4 w-4" />
        Reconcile
      </button>
    </div>

    {/* Bank account cards */}
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {bankAccounts.map((bank) => {
        const logo = getBankLogo(bank.name);
        return (
          <article key={bank.name} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-2 ${logo.bg} ${logo.ring}`}>
                <span className={`text-[10px] font-extrabold leading-none tracking-tight ${logo.textColor}`}>{logo.abbr}</span>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-700">
                {bank.status}
              </span>
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500 leading-snug">{bank.name}</p>
            <p className="mt-2 text-2xl font-extrabold text-blue-600">{bank.balance}</p>
            <p className="mt-1 text-xs font-semibold text-slate-400">Last txn: {bank.lastTxn}</p>
          </article>
        );
      })}
      {addedBanks.map((bank) => {
        const logo = getBankLogo(bank.bankName);
        return (
          <article key={bank.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-2 ${logo.bg} ${logo.ring}`}>
                <span className={`text-[10px] font-extrabold leading-none tracking-tight ${logo.textColor}`}>{logo.abbr}</span>
              </div>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-extrabold text-blue-700">Active</span>
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500 leading-snug">
              {bank.bankName}{bank.accountType ? ` - ${bank.accountType} A/c` : ""}
            </p>
            <p className="mt-2 text-sm font-extrabold text-slate-800">{bank.holderName}</p>
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
              <BankDetailRow label="Account No." value={bank.accountNumber} />
              <BankDetailRow label="IFSC Code" value={bank.ifscCode} />
              <BankDetailRow label="Branch" value={bank.branch || "-"} />
              <BankDetailRow label="Holder" value={bank.holderName} />
              <BankDetailRow label="Account Type" value={bank.accountType || "-"} />
              <BankDetailRow label="Authorised Person" value={bank.authorisedPerson ? `${bank.authorisedPerson.name} (${bank.authorisedPerson.phone})` : "-"} />
              <BankDetailRow label="Relationship Manager" value={bank.rmName ? `${bank.rmName}${bank.rmPhone ? ` (${bank.rmPhone})` : ""}` : "-"} />
            </div>
          </article>
        );
      })}
    </div>

    {/* Total liquidity bar */}
    <div className="rounded-lg bg-slate-900 px-6 py-4 flex items-center justify-between">
      <p className="text-sm font-semibold text-slate-400">Total Liquidity (Cash + Bank)</p>
      <p className="text-2xl font-extrabold text-emerald-400">₹39,00,000</p>
    </div>

    {/* SBI statement */}
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-900">SBI — Current A/c Statement</h3>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">Recent transactions · Jun 2026</p>
        </div>
        <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold hover:bg-slate-50">
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500">
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Description</th>
              <th className="px-5 py-3 text-right">Debit (Dr)</th>
              <th className="px-5 py-3 text-right">Credit (Cr)</th>
              <th className="px-5 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {bankTransactions.map((txn) => (
              <tr key={`${txn.date}-${txn.desc}`} className="border-b border-slate-100 text-sm last:border-b-0 hover:bg-slate-50">
                <td className="whitespace-nowrap px-5 py-3 font-semibold text-slate-600">{txn.date}</td>
                <td className="px-5 py-3 font-semibold text-slate-700">{txn.desc}</td>
                <td className={`whitespace-nowrap px-5 py-3 text-right font-extrabold ${txn.dr !== "-" ? "text-red-500" : "text-slate-400"}`}>
                  {txn.dr}
                </td>
                <td className={`whitespace-nowrap px-5 py-3 text-right font-extrabold ${txn.cr !== "-" ? "text-emerald-600" : "text-slate-400"}`}>
                  {txn.cr}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right font-extrabold text-blue-600">{txn.balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  </div>
  );
};

// ── GST Summary Tab ───────────────────────────────────────────────────────────

const BankDetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-start justify-between gap-3 text-xs">
    <span className="shrink-0 font-semibold text-slate-400">{label}</span>
    <span className="break-all text-right font-extrabold text-slate-700">{value}</span>
  </div>
);

const GSTSummaryTab = () => (
  <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900">GST Summary</h2>
        <p className="text-sm font-medium text-slate-500 mt-1">
          GSTR-1 · GSTR-3B filing status · Input Tax Credit · Tax liability
        </p>
      </div>
      <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#173f70] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#12345e]">
        <FileText className="h-4 w-4" />
        File GSTR-3B
      </button>
    </div>

    {/* Current month GST position */}
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {[
        { label: "ITC Available (Jun'26)", value: "₹94,500", sub: "Input Tax Credit claimable", color: "text-emerald-600", bg: "bg-emerald-50", icon: CheckCircle },
        { label: "GST Liability (Jun'26)", value: "₹1,46,200", sub: "Output tax on sales", color: "text-red-500", bg: "bg-red-50", icon: AlertCircle },
        { label: "Net GST Payable", value: "₹51,700", sub: "Liability minus ITC", color: "text-orange-600", bg: "bg-orange-50", icon: IndianRupee },
      ].map(({ label, value, sub, color, bg, icon: Icon }) => (
        <article key={label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className={`mt-1 text-2xl font-extrabold ${color}`}>{value}</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-400">{sub}</p>
        </article>
      ))}
    </div>

    {/* GST Breakdown */}
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
      {/* Filing status table */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-extrabold text-slate-900">GST Return Filing Status</h3>
          <p className="text-xs font-medium text-slate-500 mt-0.5">
            GSTIN: 22AAACS1234A1Z5 · SaiBioresources Private Limited
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500">
                <th className="px-5 py-3">Period</th>
                <th className="px-5 py-3">GSTR-1</th>
                <th className="px-5 py-3">GSTR-3B</th>
                <th className="px-5 py-3 text-right">ITC Claimed</th>
                <th className="px-5 py-3 text-right">GST Liability</th>
                <th className="px-5 py-3 text-right">Net Paid</th>
                <th className="px-5 py-3">Due Date</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {gstFiling.map((row) => (
                <tr key={row.period} className="border-b border-slate-100 text-sm last:border-b-0 hover:bg-slate-50">
                  <td className="whitespace-nowrap px-5 py-3 font-extrabold text-slate-800">{row.period}</td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${row.gstr1 === "Filed" ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>
                      {row.gstr1}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${row.gstr3b === "Filed" ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>
                      {row.gstr3b}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-extrabold text-emerald-600">{row.itc}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-extrabold text-red-500">{row.liability}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-extrabold text-slate-700">{row.paid}</td>
                  <td className="whitespace-nowrap px-5 py-3 font-semibold text-slate-600">{row.due}</td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${row.status === "Paid" ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* GST component breakdown */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-extrabold text-slate-900 mb-4">Jun'26 Tax Component Breakup</h3>
        {[
          { label: "CGST (9%)", itc: "₹47,250", liability: "₹73,100" },
          { label: "SGST (9%)", itc: "₹47,250", liability: "₹73,100" },
          { label: "IGST (18%)", itc: "-", liability: "-" },
          { label: "Cess", itc: "-", liability: "-" },
        ].map(({ label, itc, liability }) => (
          <div key={label} className="border-b border-slate-100 py-3 last:border-b-0 last:pb-0">
            <p className="text-xs font-extrabold text-slate-700 mb-1.5">{label}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">ITC: <span className="text-emerald-600 font-extrabold">{itc}</span></span>
              <span className="text-xs font-semibold text-slate-500">Liability: <span className="text-red-500 font-extrabold">{liability}</span></span>
            </div>
          </div>
        ))}
        <div className="mt-4 rounded-lg bg-orange-50 border border-orange-200 px-4 py-3">
          <p className="text-xs font-semibold text-orange-600">Net GST Payable (Jun'26)</p>
          <p className="text-xl font-extrabold text-orange-700 mt-1">₹51,700</p>
          <p className="text-xs font-semibold text-orange-500 mt-0.5">Due by 20 Jul 2026</p>
        </div>
      </section>
    </div>
  </div>
);

// ── Add Bank Modal ────────────────────────────────────────────────────────────

const AddBankModal = ({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (bank: BankAccountEntry) => void;
}) => {
  const [form, setForm] = useState({
    bankName: "",
    accountNumber: "",
    ifscCode: "",
    branch: "",
    holderName: "",
    accountType: "" as "" | "Current" | "Savings",
    authorisedPersonId: "",
    rmName: "",
    rmPhone: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState("");

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const logo = form.bankName.trim() ? getBankLogo(form.bankName) : null;

  const selectedStaff = staffList.find((s) => s.id === form.authorisedPersonId);

  useEffect(() => {
    const fetchStaff = async () => {
      setStaffLoading(true);
      setStaffError("");
      try {
        const res = await fetch(`${getBaseUrl()}/admin_staff/get_all_staff`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const data = await res.json().catch(() => null);
        const staffRows = Array.isArray(data) ? data : Array.isArray(data?.staff) ? data.staff : [];

        if (!res.ok) {
          setStaffError(data?.message || data?.error || "Failed to load staff.");
          return;
        }

        setStaffList(
          staffRows
            .map((staff: StaffApiItem) => ({
              id: String(staff?.staff_id || ""),
              name: String(staff?.staff_information?.staff_name || ""),
              phone: String(staff?.staff_information?.staff_phone || ""),
            }))
            .filter((staff: StaffOption) => staff.id && staff.name)
        );
      } catch {
        setStaffError("Failed to load staff.");
      } finally {
        setStaffLoading(false);
      }
    };

    fetchStaff();
  }, []);

  const handleSave = async () => {
    if (!form.bankName || !form.accountNumber || !form.ifscCode || !form.holderName) return;
    setSaving(true);
    setError("");

    const bank: BankAccountEntry = {
      id: `bank-${Date.now()}`,
      bankName: form.bankName.trim(),
      accountNumber: form.accountNumber.trim(),
      ifscCode: form.ifscCode.trim().toUpperCase(),
      branch: form.branch.trim() || undefined,
      holderName: form.holderName.trim(),
      accountType: form.accountType || undefined,
      authorisedPerson: selectedStaff
        ? { name: selectedStaff.name, phone: selectedStaff.phone }
        : undefined,
      rmName: form.rmName.trim() || undefined,
      rmPhone: form.rmPhone.trim() || undefined,
    };

    try {
      const res = await fetch(`${getBaseUrl()}/admin_accounts/add_new_bank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bank_name: bank.bankName,
          account_number: bank.accountNumber,
          IFSC_code: bank.ifscCode,
          branch_name: bank.branch || "",
          account_type: bank.accountType || "",
          holder_name: bank.holderName,
          authorised_person: {
            name: bank.authorisedPerson?.name || "",
            contact_number: bank.authorisedPerson?.phone || "",
          },
          relationship_manager: {
            name: bank.rmName || "",
            contact_number: bank.rmPhone || "",
          },
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        setError(data.message || "Failed to add bank.");
        return;
      }

      onSave(bank);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            {logo ? (
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-2 ${logo.bg} ${logo.ring}`}>
                <span className={`text-[10px] font-extrabold leading-none tracking-tight ${logo.textColor}`}>{logo.abbr}</span>
              </div>
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 ring-2 ring-slate-200">
                <Landmark className="h-5 w-5 text-slate-400" />
              </div>
            )}
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Onboard Bank Account</h2>
              <p className="text-xs font-medium text-slate-400">Add a new bank account to Cash & Bank</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-4">
          {/* Row 1: Bank name + logo preview */}
          <div>
            <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-slate-500">Bank Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              placeholder="e.g. State Bank of India"
              value={form.bankName}
              onChange={(e) => set("bankName", e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Row 2: Account number + IFSC */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-slate-500">Account Number <span className="text-red-500">*</span></label>
              <input
                type="text"
                placeholder="e.g. 12345678901"
                value={form.accountNumber}
                onChange={(e) => set("accountNumber", e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-slate-500">IFSC Code <span className="text-red-500">*</span></label>
              <input
                type="text"
                placeholder="e.g. SBIN0001234"
                value={form.ifscCode}
                onChange={(e) => set("ifscCode", e.target.value.toUpperCase())}
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-mono font-semibold text-slate-800 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          {/* Row 3: Branch + Account Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-slate-500">Branch <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
              <input
                type="text"
                placeholder="e.g. Hyderabad Main"
                value={form.branch}
                onChange={(e) => set("branch", e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-slate-500">Account Type <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
              <select
                value={form.accountType}
                onChange={(e) => set("accountType", e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Select type</option>
                <option value="Current">Current</option>
                <option value="Savings">Savings</option>
              </select>
            </div>
          </div>

          {/* Row 4: Holder Name */}
          <div>
            <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-slate-500">Account Holder's Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              placeholder="e.g. SBR Agrotech Pvt Ltd"
              value={form.holderName}
              onChange={(e) => set("holderName", e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Row 5: Authorised person */}
          <div>
            <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-slate-500">Authorised Person</label>
            <select
              value={form.authorisedPersonId}
              onChange={(e) => set("authorisedPersonId", e.target.value)}
              disabled={staffLoading}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">{staffLoading ? "Loading staff..." : "Select staff member"}</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>{s.phone ? `${s.name} - ${s.phone}` : s.name}</option>
              ))}
            </select>
            {staffError && (
              <p className="mt-1.5 text-xs font-semibold text-red-500">{staffError}</p>
            )}
            {selectedStaff && (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2">
                <User className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs font-extrabold text-blue-700">{selectedStaff.name}</span>
                <Phone className="ml-auto h-3.5 w-3.5 text-blue-400" />
                <span className="text-xs font-semibold text-blue-500">{selectedStaff.phone}</span>
              </div>
            )}
          </div>

          {/* Row 6: Relationship Manager */}
          <div>
            <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-slate-500">Relationship Manager</label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="RM Name"
                value={form.rmName}
                onChange={(e) => set("rmName", e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  placeholder="RM Phone"
                  value={form.rmPhone}
                  onChange={(e) => set("rmPhone", e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-slate-200 px-5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !form.bankName || !form.accountNumber || !form.ifscCode || !form.holderName}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#173f70] px-5 text-sm font-semibold text-white shadow-sm hover:bg-[#12345e] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Landmark className="h-4 w-4" />
            {saving ? "Saving..." : "Save Bank"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── New Journal Entry Modal ───────────────────────────────────────────────────

const NewJournalEntryModal = ({ onClose }: { onClose: () => void }) => {
  const [voucherType, setVoucherType] = useState("Journal");

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-xl font-extrabold text-slate-900">New Journal Entry</h2>
          <button onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          {/* Header fields */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <JVField label="Voucher Type *">
              <select
                value={voucherType}
                onChange={(e) => setVoucherType(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-300"
              >
                {["Journal", "Payment", "Receipt", "Purchase", "Sales", "Contra", "Debit Note", "Credit Note"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </JVField>
            <JVField label="Voucher No.">
              <input
                readOnly
                value="JV-2026-0143"
                className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500 outline-none"
              />
            </JVField>
            <JVField label="Date *">
              <input
                type="date"
                defaultValue="2026-06-06"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-300"
              />
            </JVField>
          </div>

          {/* Ledger Dr/Cr lines */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-extrabold text-slate-800">Ledger Entries (Dr / Cr)</h3>
              <span className="text-xs font-semibold text-slate-500">Double-entry — Total Dr must equal Total Cr</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500">
                    <th className="px-4 py-2.5 text-left">Account Name (Ledger)</th>
                    <th className="px-4 py-2.5 text-left w-28">Dr / Cr</th>
                    <th className="px-4 py-2.5 text-right w-40">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { account: "Fuel Expenses A/c", type: "Dr" },
                    { account: "Accounts Payable A/c", type: "Cr" },
                  ].map((row, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-4 py-2.5">
                        <input
                          defaultValue={row.account}
                          className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm font-semibold outline-none focus:border-slate-300"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          defaultValue={row.type}
                          className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm font-semibold outline-none"
                        >
                          <option>Dr</option>
                          <option>Cr</option>
                        </select>
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          placeholder="0.00"
                          className="h-9 w-full rounded-md border border-slate-200 px-2 text-right text-sm font-semibold outline-none focus:border-slate-300"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="mt-2 flex items-center gap-1.5 text-xs font-extrabold text-blue-600 hover:underline">
              <Plus className="h-3.5 w-3.5" />
              Add Ledger Row
            </button>
          </div>

          {/* Narration + Party + GST */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <JVField label="Narration *">
              <textarea
                placeholder="Enter narration / description..."
                className="min-h-[80px] w-full resize-none rounded-md border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-slate-300"
              />
            </JVField>
            <div className="space-y-4">
              <JVField label="Party Name">
                <input
                  placeholder="Vendor / Customer name"
                  className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-slate-300"
                />
              </JVField>
              <JVField label="GST Amount (if applicable)">
                <input
                  placeholder="₹0.00"
                  className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-slate-300"
                />
              </JVField>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            onClick={onClose}
            className="h-10 rounded-lg border border-slate-200 px-5 text-sm font-semibold hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            className="h-10 rounded-lg border border-slate-200 bg-white px-5 text-sm font-semibold hover:bg-slate-50"
          >
            Save as Draft
          </button>
          <button
            type="button"
            className="h-10 rounded-lg bg-[#173f70] px-5 text-sm font-semibold text-white hover:bg-[#12345e]"
          >
            Post Entry
          </button>
        </div>
      </div>
    </div>
  );
};

const JVField = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-extrabold text-slate-500">{label}</label>
    {children}
  </div>
);

// ── Tab: Masters ──────────────────────────────────────────────────────────────

type LedgerMasterItem = {
  master_id: string;
  name: string;
  group: string;
  opening_balance: number;
  dr_cr: string;
  cost_center_applicable: boolean;
  voucher_type: string;
  description: string;
  created_at: string;
};

const MastersTab = () => {
  const [sub, setSub] = useState<MasterSubTab>("Ledger Master");
  const [showCreateLedger, setShowCreateLedger] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [search, setSearch] = useState("");
  const [ledgerData, setLedgerData] = useState<LedgerMasterItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [voucherData, setVoucherData] = useState<{ name: string; abbr: string; numbering: string; printable: boolean; active: boolean; desc: string }[]>([]);
  const [groupData, setGroupData] = useState<{ name: string; under: string; nature: string; ledgers: number; active: boolean }[]>([]);
  const [groupRefreshKey, setGroupRefreshKey] = useState(0);

  useEffect(() => {
    if (sub !== "Ledger Master") return;
    fetch(`${getBaseUrl()}/admin_accounts/get_ledger_master`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setLedgerData(d.data); })
      .catch(() => {});
  }, [sub, refreshKey]);

  useEffect(() => {
    if (sub !== "Voucher Types") return;
    fetch(`${getBaseUrl()}/admin_accounts/get_voucher_types`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setVoucherData(d.data); })
      .catch(() => {});
  }, [sub]);

  useEffect(() => {
    fetch(`${getBaseUrl()}/admin_accounts/get_group_master`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setGroupData(d.data); })
      .catch(() => {});
  }, [groupRefreshKey]);

  const masterSubTabs: { key: MasterSubTab; icon: typeof BookOpen; desc: string }[] = [
    { key: "Ledger Master", icon: BookMarked, desc: "Chart of accounts — all debit/credit ledgers" },
    { key: "Group Master", icon: Network, desc: "Account groups & hierarchy" },
    { key: "Voucher Types", icon: Settings, desc: "Voucher type configuration" },
  ];

  const filteredLedgers = ledgerData.filter(
    (l) =>
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.group.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">Masters</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Define ledgers, account groups, and voucher types — the backbone of your books
          </p>
        </div>
        {(sub === "Ledger Master" || sub === "Group Master") && (
          <button
            type="button"
            onClick={() => sub === "Ledger Master" ? setShowCreateLedger(true) : setShowCreateGroup(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#173f70] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#12345e]"
          >
            <Plus className="h-4 w-4" />
            Create {sub === "Ledger Master" ? "Ledger" : "Group"}
          </button>
        )}
      </div>

      {/* Master type cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {masterSubTabs.map(({ key, icon: Icon, desc }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setSub(key); setSearch(""); }}
            className={[
              "flex flex-col gap-2 rounded-lg border p-4 text-left transition-all",
              sub === key
                ? "border-[#173f70] bg-[#173f70]/5 shadow-sm"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 shadow-sm",
            ].join(" ")}
          >
            <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${sub === key ? "bg-[#173f70]/10" : "bg-slate-100"}`}>
              <Icon className={`h-5 w-5 ${sub === key ? "text-[#173f70]" : "text-slate-500"}`} />
            </div>
            <p className={`text-sm font-extrabold ${sub === key ? "text-[#173f70]" : "text-slate-800"}`}>{key}</p>
            <p className="text-xs font-medium text-slate-500 leading-snug">{desc}</p>
          </button>
        ))}
      </div>

      {/* Ledger Master */}
      {sub === "Ledger Master" && (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Ledger Master</h3>
              <p className="text-xs font-medium text-slate-500 mt-0.5">{ledgerData.length} ledgers defined · Chart of Accounts</p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ledger or group..."
                className="h-9 w-56 rounded-lg border border-slate-200 pl-9 pr-3 text-sm font-semibold outline-none focus:border-slate-300"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500">
                  <th className="px-4 py-3">Ledger Name</th>
                  <th className="px-4 py-3">Group Type</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedgers.map((l) => (
                  <tr key={l.name} className="border-b border-slate-100 text-sm last:border-b-0 hover:bg-blue-50/30">
                    <td className="whitespace-nowrap px-4 py-3 font-extrabold text-slate-800">{l.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-blue-600">{l.group}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-400 hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Group Master */}
      {sub === "Group Master" && (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="text-base font-extrabold text-slate-900">Group Master</h3>
            <p className="text-xs font-medium text-slate-500 mt-0.5">Account group hierarchy — defines how ledgers are grouped for reports</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[740px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500">
                  <th className="px-4 py-3">Group Name</th>
                  <th className="px-4 py-3">Under</th>
                  <th className="px-4 py-3">Nature</th>
                  <th className="px-4 py-3">Ledgers</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groupData.map((g) => (
                  <tr key={g.name} className="border-b border-slate-100 text-sm last:border-b-0 hover:bg-blue-50/30">
                    <td className="whitespace-nowrap px-4 py-3 font-extrabold text-slate-800">{g.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{g.under}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${natureColors[g.nature] ?? "bg-slate-100 text-slate-700"}`}>
                        {g.nature}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-extrabold text-slate-700">{g.ledgers}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-700">Active</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-400 hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Voucher Types */}
      {sub === "Voucher Types" && (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="text-base font-extrabold text-slate-900">Voucher Type Master</h3>
            <p className="text-xs font-medium text-slate-500 mt-0.5">Configure voucher types used for journal entries — numbering, printing, and behaviour</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500">
                  <th className="px-4 py-3">Voucher Type</th>
                  <th className="px-4 py-3">Abbreviation</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Numbering</th>
                  <th className="px-4 py-3">Printable</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {voucherData.map((v) => (
                  <tr key={v.name} className="border-b border-slate-100 text-sm last:border-b-0 hover:bg-blue-50/30">
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${voucherTypeColors[v.name] ?? "bg-slate-100 text-slate-700"}`}>
                        {v.name}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-extrabold text-slate-700">{v.abbr}</td>
                    <td className="px-4 py-3 font-semibold text-slate-600 max-w-[280px]">{v.desc}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{v.numbering}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${v.printable ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                        {v.printable ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-700">Active</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Create Ledger Modal */}
      {showCreateLedger && (
        <CreateLedgerModal
          groups={groupData}
          onClose={() => setShowCreateLedger(false)}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      )}
      {showCreateGroup && (
        <CreateGroupModal
          groups={groupData}
          onClose={() => setShowCreateGroup(false)}
          onSaved={() => setGroupRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
};

// ── Tab: Cost Centre ──────────────────────────────────────────────────────────

const CostCentreTab = () => {
  const [sub, setSub] = useState<CostCentreSubTab>("Cost Centres");
  const [showCreate, setShowCreate] = useState(false);

  const totalBudget = costCentres.reduce((s, c) => s + c.budget, 0);
  const totalActual = costCentres.reduce((s, c) => s + c.actual, 0);
  const totalVariance = totalBudget - totalActual;

  const fmt = (n: number) =>
    "₹" + (n / 100000).toFixed(2).replace(/\.00$/, "") + " L";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">Cost Centre</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Allocate expenses to farm blocks, divisions, and departments · Track budget vs actual per centre
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#173f70] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#12345e]"
        >
          <Plus className="h-4 w-4" />
          Create Cost Centre
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Cost Centres", value: String(costCentres.length), sub: "Active centres", icon: Target, color: "text-indigo-600", bg: "bg-indigo-50" },
          { label: "Total Budget", value: fmt(totalBudget), sub: "Jun 2026", icon: Calculator, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Total Actual", value: fmt(totalActual), sub: "Spent so far", icon: BarChart2, color: "text-orange-600", bg: "bg-orange-50" },
          { label: "Total Savings", value: fmt(totalVariance), sub: "Under budget", icon: TrendingDown, color: "text-emerald-600", bg: "bg-emerald-50" },
        ].map(({ label, value, sub: subLabel, icon: Icon, color, bg }) => (
          <article key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className={`mt-1 text-xl font-extrabold ${color}`}>{value}</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-400">{subLabel}</p>
          </article>
        ))}
      </div>

      {/* Sub tabs */}
      <div className="inline-flex rounded-lg bg-slate-100/80 p-1 shadow-sm gap-0.5">
        {(["Cost Centres", "Allocation"] as CostCentreSubTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSub(t)}
            className={[
              "h-9 rounded-md px-4 text-sm font-medium transition-colors",
              sub === t ? "bg-white text-slate-900 shadow-sm font-semibold" : "text-slate-500 hover:text-slate-800",
            ].join(" ")}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Cost Centres list */}
      {sub === "Cost Centres" && (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="text-base font-extrabold text-slate-900">All Cost Centres</h3>
            <p className="text-xs font-medium text-slate-500 mt-0.5">Budget vs actual spend · Jun 2026</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Cost Centre</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Manager</th>
                  <th className="px-4 py-3 text-right">Budget</th>
                  <th className="px-4 py-3 text-right">Actual</th>
                  <th className="px-4 py-3 text-right">Variance</th>
                  <th className="px-4 py-3">Utilisation</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {costCentres.map((cc) => {
                  const variance = cc.budget - cc.actual;
                  const pct = Math.round((cc.actual / cc.budget) * 100);
                  const overBudget = pct > 100;
                  return (
                    <tr key={cc.code} className="border-b border-slate-100 text-sm last:border-b-0 hover:bg-blue-50/30">
                      <td className="whitespace-nowrap px-4 py-3 font-extrabold text-blue-600">{cc.code}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-extrabold text-slate-800">{cc.name}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{cc.category}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{cc.manager}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-extrabold text-slate-700">
                        ₹{cc.budget.toLocaleString("en-IN")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-extrabold text-orange-600">
                        ₹{cc.actual.toLocaleString("en-IN")}
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right font-extrabold ${variance >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {variance >= 0 ? "+" : ""}₹{Math.abs(variance).toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${overBudget ? "bg-red-500" : pct >= 90 ? "bg-orange-500" : "bg-emerald-500"}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className={`text-xs font-extrabold w-8 text-right ${overBudget ? "text-red-500" : pct >= 90 ? "text-orange-600" : "text-emerald-600"}`}>
                            {pct}%
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 text-sm font-extrabold">
                  <td colSpan={4} className="px-4 py-3 text-slate-700">Total</td>
                  <td className="px-4 py-3 text-right text-slate-800">₹{totalBudget.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-right text-orange-600">₹{totalActual.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-right text-emerald-600">+₹{totalVariance.toLocaleString("en-IN")}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* Cost Centre Allocation */}
      {sub === "Allocation" && (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="text-base font-extrabold text-slate-900">Expense Allocation by Cost Centre</h3>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              How each expense ledger is split across cost centres · Jun 2026
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1060px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500">
                  <th className="px-4 py-3">Expense Ledger</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Block A</th>
                  <th className="px-4 py-3 text-right">Block B</th>
                  <th className="px-4 py-3 text-right">Irrigation</th>
                  <th className="px-4 py-3 text-right">Harvest</th>
                  <th className="px-4 py-3 text-right">Machinery</th>
                  <th className="px-4 py-3 text-right">Logistics</th>
                </tr>
              </thead>
              <tbody>
                {ccAllocationRows.map((row) => (
                  <tr key={row.expense} className="border-b border-slate-100 text-sm last:border-b-0 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 font-extrabold text-slate-800">{row.expense}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-extrabold text-slate-900">{row.total}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-orange-600">{row.blockA}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-orange-600">{row.blockB}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-orange-600">{row.irrigation}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-orange-600">{row.harvest}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-orange-600">{row.machinery}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-orange-600">{row.logistics}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-900 text-white text-sm font-extrabold">
                  <td className="px-4 py-3">Total Expenses</td>
                  <td className="px-4 py-3 text-right">₹31,20,000</td>
                  <td className="px-4 py-3 text-right text-orange-300">₹8,80,000</td>
                  <td className="px-4 py-3 text-right text-orange-300">₹7,90,000</td>
                  <td className="px-4 py-3 text-right text-orange-300">₹2,50,000</td>
                  <td className="px-4 py-3 text-right text-orange-300">₹4,40,000</td>
                  <td className="px-4 py-3 text-right text-orange-300">₹4,50,000</td>
                  <td className="px-4 py-3 text-right text-orange-300">₹3,10,000</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {showCreate && <CreateCostCentreModal onClose={() => setShowCreate(false)} />}
    </div>
  );
};

// ── Create Ledger Modal ───────────────────────────────────────────────────────

type GroupItem = { name: string; under: string; nature: string; ledgers: number; active: boolean };

const CreateLedgerModal = ({ onClose, onSaved, groups }: { onClose: () => void; onSaved: () => void; groups: GroupItem[] }) => {
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [drCr, setDrCr] = useState("DR");
  const [costCenterApplicable, setCostCenterApplicable] = useState(false);
  const [voucherType, setVoucherType] = useState("All Types");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!name.trim() || !group) {
      setError("Ledger Name and Group are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${getBaseUrl()}/admin_accounts/create_ledger_master`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          group,
          opening_balance: parseFloat(openingBalance) || 0,
          dr_cr: drCr,
          cost_center_applicable: costCenterApplicable,
          voucher_type: voucherType,
          description: description.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        onSaved();
        onClose();
      } else {
        setError(data.message || "Failed to create ledger.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Create Ledger</h2>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">Add a new ledger account to the Chart of Accounts</p>
          </div>
          <button onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <MField label="Ledger Name *">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Office Rent A/c"
                className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-slate-300"
              />
            </MField>
            <MField label="Under (Group) *">
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-slate-300"
              >
                <option value="">Select group...</option>
                {groups.map((g) => <option key={g.name}>{g.name}</option>)}
              </select>
            </MField>
            <MField label="Opening Balance">
              <input
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0.00"
                type="number"
                min="0"
                className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-slate-300"
              />
            </MField>
            <MField label="Dr / Cr *">
              <select
                value={drCr}
                onChange={(e) => setDrCr(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-slate-300"
              >
                <option value="DR">Debit (Dr)</option>
                <option value="CR">Credit (Cr)</option>
              </select>
            </MField>
            <MField label="Cost Centre Applicable">
              <select
                value={costCenterApplicable ? "Yes" : "No"}
                onChange={(e) => setCostCenterApplicable(e.target.value === "Yes")}
                className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-slate-300"
              >
                <option>Yes</option>
                <option>No</option>
              </select>
            </MField>
            <MField label="Voucher Types Allowed">
              <select
                value={voucherType}
                onChange={(e) => setVoucherType(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-slate-300"
              >
                <option>All Types</option>
                <option>Purchase only</option>
                <option>Payment only</option>
                <option>Journal only</option>
              </select>
            </MField>
          </div>
          <MField label="Description / Notes">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about this ledger..."
              className="min-h-[72px] w-full resize-none rounded-md border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-slate-300"
            />
          </MField>
          {error && <p className="text-sm font-semibold text-red-500">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button onClick={onClose} className="h-10 rounded-lg border border-slate-200 px-5 text-sm font-semibold hover:bg-slate-50">Cancel</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="h-10 rounded-lg bg-[#173f70] px-5 text-sm font-semibold text-white hover:bg-[#12345e] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Ledger"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Create Group Modal ────────────────────────────────────────────────────────

const CreateGroupModal = ({ onClose, onSaved, groups }: { onClose: () => void; onSaved: () => void; groups: GroupItem[] }) => {
  const [name, setName] = useState("");
  const [parentGroup, setParentGroup] = useState("");
  const [nature, setNature] = useState("Asset");
  const [affectsGrossProfit, setAffectsGrossProfit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!name.trim() || !parentGroup) {
      setError("Group Name and Parent Group are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${getBaseUrl()}/admin_accounts/create_group_master`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          parent_group: parentGroup,
          nature,
          affects_gross_profit: affectsGrossProfit,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onSaved();
        onClose();
      } else {
        setError(data.message || "Failed to create group.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Create Account Group</h2>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">Define a new group in the account hierarchy</p>
          </div>
          <button onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}
          <MField label="Group Name *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Provisions & Reserves"
              className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-slate-300"
            />
          </MField>
          <MField label="Under (Parent Group) *">
            <select
              value={parentGroup}
              onChange={(e) => setParentGroup(e.target.value)}
              className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-slate-300"
            >
              <option value="">Select parent group...</option>
              <option value="Primary">Primary</option>
              {groups.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
            </select>
          </MField>
          <MField label="Nature *">
            <select
              value={nature}
              onChange={(e) => setNature(e.target.value)}
              className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-slate-300"
            >
              <option value="Asset">Asset</option>
              <option value="Liability">Liability</option>
              <option value="Revenue">Revenue</option>
              <option value="Expense">Expense</option>
            </select>
          </MField>
          <MField label="Affect Gross Profit">
            <select
              value={affectsGrossProfit ? "Yes" : "No"}
              onChange={(e) => setAffectsGrossProfit(e.target.value === "Yes")}
              className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-slate-300"
            >
              <option>No</option>
              <option>Yes</option>
            </select>
          </MField>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button onClick={onClose} className="h-10 rounded-lg border border-slate-200 px-5 text-sm font-semibold hover:bg-slate-50">Cancel</button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="h-10 rounded-lg bg-[#173f70] px-5 text-sm font-semibold text-white hover:bg-[#12345e] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Group"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Create Cost Centre Modal ──────────────────────────────────────────────────

const CreateCostCentreModal = ({ onClose }: { onClose: () => void }) => (
  <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4">
    <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Create Cost Centre</h2>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">Define a new cost centre for expense allocation</p>
        </div>
        <button onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <MField label="Cost Centre Code *">
            <input placeholder="e.g. CC-009" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-slate-300" />
          </MField>
          <MField label="Cost Centre Name *">
            <input placeholder="e.g. Farm Block C" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-slate-300" />
          </MField>
        </div>
        <MField label="Category *">
          <select className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-slate-300">
            <option value="">Select category...</option>
            {costCategoryMasters.map((c) => <option key={c.name}>{c.name}</option>)}
          </select>
        </MField>
        <MField label="Responsible Manager">
          <input placeholder="Manager name" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-slate-300" />
        </MField>
        <div className="grid grid-cols-2 gap-4">
          <MField label="Budget (Monthly) *">
            <input placeholder="₹0.00" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-slate-300" />
          </MField>
          <MField label="Effective From">
            <input type="date" defaultValue="2026-06-01" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-slate-300" />
          </MField>
        </div>
        <MField label="Applicable Ledgers">
          <div className="rounded-md border border-slate-200 p-3 space-y-2 max-h-32 overflow-y-auto">
            {["Fuel Expenses A/c", "Agriculture Input A/c", "Staff Salary A/c", "Depreciation A/c", "Misc. Expenses A/c"].map((l) => (
              <label key={l} className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-[#173f70]" defaultChecked />
                {l}
              </label>
            ))}
          </div>
        </MField>
        <MField label="Notes">
          <textarea placeholder="Optional description..." className="min-h-[60px] w-full resize-none rounded-md border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-slate-300" />
        </MField>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
        <button onClick={onClose} className="h-10 rounded-lg border border-slate-200 px-5 text-sm font-semibold hover:bg-slate-50">Cancel</button>
        <button type="button" className="h-10 rounded-lg bg-[#173f70] px-5 text-sm font-semibold text-white hover:bg-[#12345e]">Save Cost Centre</button>
      </div>
    </div>
  </div>
);

const MField = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-extrabold text-slate-500">{label}</label>
    {children}
  </div>
);

export default Accounting;
