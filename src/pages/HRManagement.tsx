import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  useNodesState,
} from '@xyflow/react';
import {
  AlertCircle,
  BadgeCheck,
  BarChart3,
  Briefcase,
  Building2,
  CalendarDays,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Download,
  FileCheck2,
  IndianRupee,
  Lock,
  MapPin,
  Network,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  Trash2,
  Unlock,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/config';
import { AttendanceModule } from '@/modules/HRMSModule';
import { PayrollModule } from '@/modules/PayrollModule';
import '@xyflow/react/dist/style.css';

type HrView = 'Dashboard' | 'Payroll' | 'Attendance' | 'HR Budget' | 'Management Structure' | 'Leads' | 'Configuration';
type OrgNodeType = string;
type OrgNode = {
  id: string;
  parentId: string;
  name: string;
  role: string;
  owner: string;
  department: string;
  site: string;
  people: number;
  type: OrgNodeType;
};
type OrgCanvasData = { orgNode: OrgNode; onEdit?: (node: OrgNode) => void; tone?: string };
type OrgEdge = { id: string; source: string; target: string };
type StoredOrgCanvas = { nodes: OrgNode[]; edges: OrgEdge[]; positions: Record<string, { x: number; y: number }> };
type NodeTypeOption = { name: string; tone: string; dot: string };
type SiteOption = { id: string; name: string; kind: 'Cluster' | 'Zone' | 'Block' };
type HolidayScope = 'all' | 'specific';
type Holiday = { id: string; date: string; name: string; scope: HolidayScope; staffIds: string[] };
type WorkingDayOverride = { id: string; date: string; note: string };
type StaffDirectoryEntry = { id: string; name: string };
type CompLeaveStatus = 'Available' | 'Approved' | 'Rejected' | 'Redeemed';
type CompLeave = { id: string; staffId: string; staffName: string; earnedDate: string; reason: string; status: CompLeaveStatus };
type UnlockStatus = 'Pending' | 'Approved' | 'Rejected';
type AttendanceUnlockRequest = { id: string; staffId: string; staffName: string; date: string; requestedAt: string; status: UnlockStatus };
type SalaryStructure = {
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
};
type HrConfiguration = {
  roles: string[];
  departments: string[];
  nodeTypes: NodeTypeOption[];
  unitRoles: string[];
  holidays: Holiday[];
  workingDayOverrides: WorkingDayOverride[];
  compLeaves: CompLeave[];
  attendanceLockHours: number;
  unlockRequests: AttendanceUnlockRequest[];
  salaryStructures: Record<string, SalaryStructure>;
};
type DayStatus = 'P' | 'A' | 'PL' | 'PH';
type HRBudgetCard = {
  budget_id: string;
  budget_name: string;
  financial_year_start: string;
  financial_year_end: string;
  budget_cycle: string;
  project_start_date: string;
  project_end_date: string;
  budget_heads: string;
  owner: string;
  status: string;
  locked: boolean;
  allocated: string;
  utilized: string;
};

const emptySalaryStructure = (): SalaryStructure => ({
  basic: 0,
  hra: 0,
  otherAllowances: 0,
  leaveEncashment: 0,
  bonus: 0,
  lta: 0,
  epf: 0,
  esi: 0,
  profTax: 0,
  itds: 0,
  loan: 0,
  salAdvance: 0,
  travelAdvance: 0,
  advanceExpense: 0,
  advanceOther: 0,
  telephoneExpense: 0,
  leaveBalance: 0,
});

const ORG_CANVAS_STORAGE_KEY = 'sbr-hr-organogram-canvas-v1';
const HR_CONFIG_STORAGE_KEY = 'sbr-hr-configuration-v1';
const ATTENDANCE_MAP_STORAGE_KEY = 'sbr-hr-attendance-map-v1';
const DEFAULT_NODE_TONE = 'border-slate-200 bg-white text-slate-800';

const toneSwatches: { label: string; tone: string; dot: string }[] = [
  { label: 'Forest', tone: 'border-[#0D3A35] bg-[#0D3A35] text-white', dot: 'bg-[#0D3A35]' },
  { label: 'Emerald', tone: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-400' },
  { label: 'Blue', tone: 'border-blue-200 bg-blue-50 text-blue-800', dot: 'bg-blue-400' },
  { label: 'Amber', tone: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-400' },
  { label: 'Rose', tone: 'border-rose-200 bg-rose-50 text-rose-800', dot: 'bg-rose-400' },
  { label: 'Violet', tone: 'border-violet-200 bg-violet-50 text-violet-800', dot: 'bg-violet-400' },
  { label: 'Slate', tone: 'border-slate-200 bg-white text-slate-800', dot: 'bg-slate-400' },
];

const defaultNodeTypeOptions: NodeTypeOption[] = [
  { name: 'Company', tone: 'border-[#0D3A35] bg-[#0D3A35] text-white', dot: 'bg-[#0D3A35]' },
  { name: 'Department', tone: 'border-emerald-200 bg-emerald-50 text-[#0D3A35]', dot: 'bg-emerald-400' },
  { name: 'Team', tone: 'border-blue-200 bg-blue-50 text-blue-800', dot: 'bg-blue-400' },
  { name: 'Role', tone: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-400' },
  { name: 'Person', tone: 'border-slate-200 bg-white text-slate-800', dot: 'bg-slate-400' },
];

const defaultHrConfiguration = (): HrConfiguration => ({
  roles: ['Company', 'Executive leadership', 'People operations', 'Field execution', 'Zone and cluster control', 'Daily execution teams'],
  departments: ['Leadership', 'Human Resource', 'Operations'],
  nodeTypes: defaultNodeTypeOptions,
  unitRoles: ['Sai Bioresources Pvt Ltd', 'Director Office', 'HR Management', 'Operations Management', 'Field Supervisors', 'Field Staff'],
  holidays: [],
  workingDayOverrides: [],
  compLeaves: [],
  attendanceLockHours: 24,
  unlockRequests: [],
  salaryStructures: {},
});

const loadStoredAttendanceMap = (): Record<string, DayStatus | null> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(ATTENDANCE_MAP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const loadStoredOrgCanvas = (): StoredOrgCanvas | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(ORG_CANVAS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.nodes)) return null;
    return {
      nodes: parsed.nodes as OrgNode[],
      edges: Array.isArray(parsed.edges) ? (parsed.edges as OrgEdge[]) : [],
      positions: parsed.positions && typeof parsed.positions === 'object' ? parsed.positions : {},
    };
  } catch {
    return null;
  }
};

const loadStoredHrConfiguration = (): HrConfiguration | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(HR_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.roles) || !Array.isArray(parsed.departments) || !Array.isArray(parsed.nodeTypes)) return null;
    return {
      roles: parsed.roles,
      departments: parsed.departments,
      nodeTypes: parsed.nodeTypes,
      unitRoles: Array.isArray(parsed.unitRoles) ? parsed.unitRoles : [],
      holidays: Array.isArray(parsed.holidays)
        ? parsed.holidays.map((h: Partial<Holiday>) => ({
            id: h.id ?? `holiday-${h.date}-${Date.now()}`,
            date: h.date ?? '',
            name: h.name ?? '',
            scope: h.scope === 'specific' ? 'specific' : 'all',
            staffIds: Array.isArray(h.staffIds) ? h.staffIds : [],
          }))
        : [],
      workingDayOverrides: Array.isArray(parsed.workingDayOverrides) ? parsed.workingDayOverrides : [],
      compLeaves: Array.isArray(parsed.compLeaves) ? parsed.compLeaves : [],
      attendanceLockHours: typeof parsed.attendanceLockHours === 'number' ? parsed.attendanceLockHours : 24,
      unlockRequests: Array.isArray(parsed.unlockRequests) ? parsed.unlockRequests : [],
      salaryStructures: parsed.salaryStructures && typeof parsed.salaryStructures === 'object'
        ? Object.fromEntries(
            Object.entries(parsed.salaryStructures as Record<string, Partial<SalaryStructure>>).map(([staffId, s]) => [
              staffId,
              { ...emptySalaryStructure(), ...s },
            ])
          )
        : parsed.baseSalaries && typeof parsed.baseSalaries === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.baseSalaries as Record<string, number>).map(([staffId, basic]) => [
                staffId,
                { ...emptySalaryStructure(), basic },
              ])
            )
          : {},
    };
  } catch {
    return null;
  }
};

const views: { label: HrView; Icon: React.ElementType }[] = [
  { label: 'Dashboard', Icon: TrendingUp },
  { label: 'Payroll', Icon: IndianRupee },
  { label: 'Attendance', Icon: CalendarDays },
  { label: 'HR Budget', Icon: IndianRupee },
  { label: 'Management Structure', Icon: Network },
  { label: 'Leads', Icon: Users },
  { label: 'Configuration', Icon: Settings },
];

const stats = [
  { label: 'Total Workforce', value: '156', hint: '+12 this quarter', Icon: Users, tone: 'bg-blue-50 text-blue-700 ring-blue-100' },
  { label: 'Active Employees', value: '142', hint: '91% active rate', Icon: UserCheck, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  { label: 'Open Positions', value: '08', hint: '5 field, 3 office', Icon: Briefcase, tone: 'bg-amber-50 text-amber-700 ring-amber-100' },
  { label: 'Pending Actions', value: '17', hint: 'Docs, reviews, approvals', Icon: AlertCircle, tone: 'bg-rose-50 text-rose-700 ring-rose-100' },
];

const pipeline = [
  { stage: 'Requisition Raised', count: 12, progress: 86 },
  { stage: 'Screening', count: 9, progress: 64 },
  { stage: 'Interview', count: 6, progress: 42 },
  { stage: 'Offer / Agreement', count: 4, progress: 28 },
  { stage: 'Onboarding', count: 7, progress: 50 },
];

const complianceItems = [
  { label: 'Aadhaar / ID Proof', complete: 132, pending: 10 },
  { label: 'PAN / Tax Records', complete: 118, pending: 24 },
  { label: 'Bank Proof', complete: 126, pending: 16 },
  { label: 'Offer Letters / Agreements', complete: 109, pending: 33 },
];

const actions = [
  { title: 'Approve field manager consultant agreement', owner: 'HR Executive', due: 'Today', status: 'Urgent' },
  { title: 'Validate bank proof for 6 new joiners', owner: 'Payroll', due: 'Tomorrow', status: 'Review' },
  { title: 'Schedule induction for Operations batch', owner: 'HR Manager', due: '08 Jul', status: 'Planned' },
  { title: 'Close MRF feedback loop with Admin Ops', owner: 'HR Desk', due: '10 Jul', status: 'Pending' },
];

const attendanceRows = [
  ['Management Staff', '42', '39', '2', '1'],
  ['Field Staff', '114', '103', '7', '4'],
  ['Consultants', '21', '18', '2', '1'],
];

const hrBudgetRows = [
  ['Payroll - Management Staff', '₹2.20 Cr', '₹1.24 Cr', '56%', 'On Track'],
  ['Payroll - Field Staff', '₹3.10 Cr', '₹1.86 Cr', '60%', 'Review'],
  ['Consultant Retainers', '₹82.0L', '₹46.5L', '57%', 'On Track'],
  ['Hiring & Onboarding', '₹28.0L', '₹19.4L', '69%', 'Watch'],
  ['Training & Development', '₹18.0L', '₹8.2L', '46%', 'On Track'],
  ['Benefits & Welfare', '₹34.0L', '₹21.8L', '64%', 'Review'],
];

const hrBudgetCards = [
  { label: 'Annual HR Budget', value: '₹6.92 Cr', hint: 'Approved FY allocation' },
  { label: 'Utilized', value: '₹4.06 Cr', hint: '58.7% consumed' },
  { label: 'Committed', value: '₹1.12 Cr', hint: 'Payroll and hiring pipeline' },
  { label: 'Balance', value: '₹1.74 Cr', hint: 'Available for planning' },
];

const hrBudgetForecast = [
  { label: 'Payroll Run Rate', value: 62 },
  { label: 'Hiring Cost Absorption', value: 69 },
  { label: 'Training Utilization', value: 46 },
  { label: 'Welfare Utilization', value: 64 },
];

const HR_BUDGET_CYCLES: Record<string, string> = {
  Payroll: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Hiring: 'bg-amber-100 text-amber-700 border-amber-200',
  Welfare: 'bg-orange-100 text-orange-700 border-orange-200',
  Training: 'bg-blue-100 text-blue-700 border-blue-200',
};

const initialHRBudgets: HRBudgetCard[] = [
  {
    budget_id: 'HRB-2026-001',
    budget_name: 'FY 2026-27 Payroll Budget',
    financial_year_start: '2026',
    financial_year_end: '2027',
    budget_cycle: 'Payroll',
    project_start_date: '2026-04-01',
    project_end_date: '2027-03-31',
    budget_heads: 'Management, Field Staff, Consultants',
    owner: 'HR Manager',
    status: 'active',
    locked: false,
    allocated: '₹6.12 Cr',
    utilized: '₹3.56 Cr',
  },
  {
    budget_id: 'HRB-2026-002',
    budget_name: 'Hiring & Onboarding Budget',
    financial_year_start: '2026',
    financial_year_end: '2027',
    budget_cycle: 'Hiring',
    project_start_date: '2026-04-01',
    project_end_date: '2026-09-30',
    budget_heads: 'MRF, Joining Kits, Induction',
    owner: 'HR Executive',
    status: 'active',
    locked: false,
    allocated: '₹28.0L',
    utilized: '₹19.4L',
  },
  {
    budget_id: 'HRB-2026-003',
    budget_name: 'Employee Welfare Budget',
    financial_year_start: '2026',
    financial_year_end: '2027',
    budget_cycle: 'Welfare',
    project_start_date: '2026-04-01',
    project_end_date: '2027-03-31',
    budget_heads: 'Benefits, Medical, Engagement',
    owner: 'Admin HR',
    status: 'planning',
    locked: true,
    allocated: '₹34.0L',
    utilized: '₹21.8L',
  },
  {
    budget_id: 'HRB-2026-004',
    budget_name: 'Training & Development Budget',
    financial_year_start: '2026',
    financial_year_end: '2027',
    budget_cycle: 'Training',
    project_start_date: '2026-07-01',
    project_end_date: '2026-12-31',
    budget_heads: 'Safety, Field Training, HR Workshops',
    owner: 'HR Manager',
    status: 'active',
    locked: false,
    allocated: '₹18.0L',
    utilized: '₹8.2L',
  },
];

const initialOrgNodes: OrgNode[] = [
  { id: 'company', parentId: '', name: 'Sai Bioresources Pvt Ltd', role: 'Company', owner: 'Director Office', department: 'Leadership', site: '', people: 156, type: 'Company' },
  { id: 'director-office', parentId: 'company', name: 'Director Office', role: 'Executive leadership', owner: 'Director', department: 'Leadership', site: '', people: 4, type: 'Department' },
  { id: 'hr-management', parentId: 'director-office', name: 'HR Management', role: 'People operations', owner: 'HR Manager', department: 'Human Resource', site: '', people: 7, type: 'Department' },
  { id: 'operations-management', parentId: 'director-office', name: 'Operations Management', role: 'Field execution', owner: 'Operations Manager', department: 'Operations', site: '', people: 18, type: 'Department' },
  { id: 'field-supervisors', parentId: 'operations-management', name: 'Field Supervisors', role: 'Zone and cluster control', owner: 'Field Manager', department: 'Operations', site: '', people: 26, type: 'Team' },
  { id: 'field-staff', parentId: 'field-supervisors', name: 'Field Staff', role: 'Daily execution teams', owner: 'Supervisors', department: 'Operations', site: '', people: 88, type: 'Team' },
];

const leadRows = [
  ['Field Manager - Korba', 'Operations', 'Interview', 'Aashay Nanoti', 'High'],
  ['HR Executive', 'Human Resource', 'Screening', 'Priya Sharma', 'Medium'],
  ['Fleet Supervisor', 'Logistics', 'Requisition', 'Admin Ops', 'High'],
  ['Payroll Assistant', 'Finance', 'Offer', 'HR Desk', 'Low'],
  ['Zone Coordinator', 'Operations', 'Onboarding', 'Field Office', 'Medium'],
];

const statusClass = (status: string) => {
  if (['Urgent', 'High', 'Review'].includes(status)) return 'bg-rose-50 text-rose-700 ring-rose-100';
  if (['Ready', 'Offer', 'Onboarding', 'Planned'].includes(status)) return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
};

const DataTable = ({ headers, rows }: { headers: string[]; rows: string[][] }) => (
  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <table className="w-full text-left text-sm">
      <thead className="bg-slate-50 text-xs font-extrabold uppercase tracking-wide text-slate-500">
        <tr>
          {headers.map(header => <th key={header} className="px-4 py-3">{header}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
        {rows.map(row => (
          <tr key={row.join('-')}>
            {row.map((cell, index) => (
              <td key={`${cell}-${index}`} className="px-4 py-3">
                {index === row.length - 1 ? (
                  <span className={cn('rounded-full px-2.5 py-1 text-xs font-extrabold ring-1', statusClass(cell))}>{cell}</span>
                ) : cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const SectionCard = ({ title, subtitle, Icon, children, compact }: {
  title: string;
  subtitle: string;
  Icon: React.ElementType;
  children: React.ReactNode;
  compact?: boolean;
}) => (
  <section className={cn('rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]', compact ? 'p-4' : 'p-6')}>
    <div className="flex items-center justify-between gap-4">
      <div>
        <h2 className={cn('font-extrabold text-slate-950', compact ? 'text-base' : 'text-lg')}>{title}</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p>
      </div>
      <Icon className="h-5 w-5 text-[#0D3A35]" />
    </div>
    <div className={compact ? 'mt-4' : 'mt-6'}>{children}</div>
  </section>
);

const ConfigListEditor = ({
  title,
  subtitle,
  Icon,
  items,
  placeholder,
  onAdd,
  onRemove,
  isInUse,
}: {
  title: string;
  subtitle: string;
  Icon: React.ElementType;
  items: string[];
  placeholder: string;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  isInUse: (value: string) => boolean;
}) => {
  const [value, setValue] = useState('');

  const handleAdd = () => {
    const trimmed = value.trim();
    if (!trimmed || items.includes(trimmed)) return;
    onAdd(trimmed);
    setValue('');
  };

  return (
    <SectionCard title={title} subtitle={subtitle} Icon={Icon} compact>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          placeholder={placeholder}
          className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-800 outline-none focus:border-[#0D3A35]"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="flex h-9 items-center gap-2 rounded-lg bg-[#0D3A35] px-3.5 text-sm font-extrabold text-white hover:bg-[#092b27]"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>
      <div className="mt-3 max-h-52 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200">
        {items.length === 0 && (
          <p className="px-4 py-4 text-center text-xs font-semibold text-slate-400">No entries yet.</p>
        )}
        {items.map(item => (
          <div key={item} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="truncate text-sm font-extrabold text-slate-800">{item}</span>
            {isInUse(item) ? (
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold text-slate-500">In use</span>
            ) : (
              <button
                type="button"
                onClick={() => onRemove(item)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Remove ${item}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
};

const getBranchStrength = (nodeId: string, allNodes: OrgNode[]): number =>
  allNodes
    .filter(node => node.parentId === nodeId)
    .reduce((sum, child) => sum + child.people + getBranchStrength(child.id, allNodes), 0);

const resolveNodePeople = (node: OrgNode, allNodes: OrgNode[]): number => {
  if (node.parentId) return node.people;
  const branchTotal = getBranchStrength(node.id, allNodes);
  return branchTotal > 0 ? branchTotal : node.people;
};

const buildCanvasNode = (node: OrgNode, index: number, parentPosition?: { x: number; y: number }): Node<OrgCanvasData> => ({
  id: node.id,
  type: 'orgNode',
  position: parentPosition
    ? { x: parentPosition.x + 280, y: parentPosition.y + 140 }
    : { x: (index % 3) * 320, y: Math.floor(index / 3) * 190 },
  data: { orgNode: node },
});

const OrgCanvasNode = ({ data }: NodeProps<Node<OrgCanvasData>>) => {
  const node = data.orgNode;
  const isCompany = node.type === 'Company';

  return (
    <div className={cn('relative min-w-[230px] rounded-2xl border p-4 shadow-lg', data.tone ?? DEFAULT_NODE_TONE)}>
      <Handle type="target" position={Position.Top} className="!h-3 !w-3 !border-2 !border-white !bg-[#0D3A35]" />
      {data.onEdit && (
        <button
          type="button"
          onClick={() => data.onEdit?.(node)}
          className={cn(
            'nodrag absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md',
            isCompany ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:text-[#0D3A35]'
          )}
          aria-label={`Edit ${node.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="flex items-start gap-3">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', isCompany ? 'bg-white/15 text-white' : 'bg-white text-[#0D3A35] ring-1 ring-slate-200')}>
          {node.type === 'Person' ? <UserCheck className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="max-w-[160px] truncate text-sm font-extrabold">{node.name}</p>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-extrabold', isCompany ? 'bg-white/15 text-white' : 'bg-white/80 text-slate-600')}>
              {node.type}
            </span>
          </div>
          <p className={cn('mt-1 line-clamp-2 text-xs font-bold', isCompany ? 'text-white/80' : 'text-slate-500')}>{node.role}</p>
        </div>
      </div>
      <div className={cn('mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-[11px] font-bold', isCompany ? 'border-white/15 text-white/80' : 'border-slate-200 text-slate-500')}>
        <span>{node.department}</span>
        <span className="text-right">{node.people} People</span>
        <span className="col-span-2 truncate">Owner: {node.owner}</span>
        {node.site && <span className="col-span-2 truncate">Site: {node.site}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !border-2 !border-white !bg-[#0D3A35]" />
    </div>
  );
};

const orgNodeTypes = { orgNode: OrgCanvasNode };

const HRManagement = () => {
  const [activeView, setActiveView] = useState<HrView>('Dashboard');
  const [hrBudgets, setHrBudgets] = useState<HRBudgetCard[]>(initialHRBudgets);
  const [hrBudgetSearch, setHrBudgetSearch] = useState('');
  const [showCreateHRBudget, setShowCreateHRBudget] = useState(false);
  const [hrBudgetForm, setHrBudgetForm] = useState({
    budgetName: '',
    financialYear: '2026-27',
    budgetCycle: 'Payroll',
    startDate: '',
    endDate: '',
    budgetHeads: '',
    owner: '',
    allocated: '',
    masterFileName: '',
  });
  const storedOrgCanvas = loadStoredOrgCanvas();
  const [orgNodes, setOrgNodes] = useState<OrgNode[]>(storedOrgCanvas?.nodes ?? initialOrgNodes);
  const [orgEdges, setOrgEdges] = useState<OrgEdge[]>(storedOrgCanvas?.edges ?? []);
  const [orgCanvasNodes, setOrgCanvasNodes, onOrgCanvasNodesChange] = useNodesState<Node<OrgCanvasData>>(
    (storedOrgCanvas?.nodes ?? initialOrgNodes).map((node, index) => {
      const canvasNode = buildCanvasNode(node, index);
      const savedPosition = storedOrgCanvas?.positions?.[node.id];
      return savedPosition ? { ...canvasNode, position: savedPosition } : canvasNode;
    })
  );
  const [orgForm, setOrgForm] = useState<Omit<OrgNode, 'id'>>({
    parentId: 'company',
    name: '',
    role: '',
    owner: '',
    department: '',
    site: '',
    people: 1,
    type: 'Team',
  });
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [staffOwnerOptions, setStaffOwnerOptions] = useState<string[]>([]);
  const [staffDirectory, setStaffDirectory] = useState<StaffDirectoryEntry[]>([]);
  const storedHrConfig = loadStoredHrConfiguration();
  const [hrConfig, setHrConfig] = useState<HrConfiguration>(storedHrConfig ?? defaultHrConfiguration());
  const [attendanceMap, setAttendanceMap] = useState<Record<string, DayStatus | null>>(loadStoredAttendanceMap());
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeTone, setNewTypeTone] = useState(toneSwatches[1].tone);
  const [siteOptions, setSiteOptions] = useState<SiteOption[]>([]);
  const [configTab, setConfigTab] = useState<'Org Structure' | 'Holidays & Leave' | 'Attendance Lock'>('Org Structure');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayScope, setNewHolidayScope] = useState<HolidayScope>('all');
  const [newHolidayStaffIds, setNewHolidayStaffIds] = useState<string[]>([]);
  const [newOverrideDate, setNewOverrideDate] = useState('');
  const [newOverrideNote, setNewOverrideNote] = useState('');
  const [isSitesLoading, setIsSitesLoading] = useState(false);
  const [sitesError, setSitesError] = useState<string | null>(null);

  const fetchSiteOptions = async () => {
    setIsSitesLoading(true);
    setSitesError(null);
    try {
      const BASE_URL = getBaseUrl().replace(/\/$/, '');
      const [clustersRes, zonesRes, blocksRes] = await Promise.all([
        fetch(`${BASE_URL}/farmer_managment/get_clusters`, { headers: { Accept: 'application/json' } }),
        fetch(`${BASE_URL}/farmer_managment/get_zones`, { headers: { Accept: 'application/json' } }),
        fetch(`${BASE_URL}/farmer_managment/get_blocks`, { headers: { Accept: 'application/json' } }),
      ]);
      const [clustersData, zonesData, blocksData] = await Promise.all([
        clustersRes.json(),
        zonesRes.json(),
        blocksRes.json(),
      ]);
      const clusters: SiteOption[] = Array.isArray(clustersData?.clusters)
        ? clustersData.clusters.map((c: { cluster_id: string; cluster_name: string }) => ({ id: c.cluster_id, name: c.cluster_name, kind: 'Cluster' as const }))
        : [];
      const zones: SiteOption[] = Array.isArray(zonesData?.zones)
        ? zonesData.zones.map((z: { zone_id: string; zone_name: string }) => ({ id: z.zone_id, name: z.zone_name, kind: 'Zone' as const }))
        : [];
      const blocks: SiteOption[] = Array.isArray(blocksData?.blocks)
        ? blocksData.blocks.map((b: { block_id: string; block_name: string }) => ({ id: b.block_id, name: b.block_name, kind: 'Block' as const }))
        : [];
      setSiteOptions([...clusters, ...zones, ...blocks]);
    } catch {
      setSitesError('Failed to load sites from Clusters, Zones & Blocks');
    } finally {
      setIsSitesLoading(false);
    }
  };

  useEffect(() => {
    fetchSiteOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchStaffOwnerOptions = async () => {
      try {
        const BASE_URL = getBaseUrl().replace(/\/$/, '');
        const res = await fetch(`${BASE_URL}/admin_staff/get_all_staff`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        const data = await res.json();
        if (cancelled || !res.ok || !Array.isArray(data)) return;
        const directory: StaffDirectoryEntry[] = (data as { staff_id: string; staff_information?: { staff_name?: string } }[])
          .map(staff => ({ id: staff.staff_id, name: staff.staff_information?.staff_name?.trim() ?? '' }))
          .filter(entry => Boolean(entry.name));
        setStaffDirectory(directory);
        setStaffOwnerOptions(Array.from(new Set(directory.map(entry => entry.name))));
      } catch {
        // staff directory unavailable - Owner field still works as free text
      }
    };
    fetchStaffOwnerOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const positions = Object.fromEntries(orgCanvasNodes.map(node => [node.id, node.position]));
    try {
      window.sessionStorage.setItem(
        ORG_CANVAS_STORAGE_KEY,
        JSON.stringify({ nodes: orgNodes, edges: orgEdges, positions })
      );
    } catch {
      // sessionStorage unavailable (private mode / storage full) - canvas still works in-memory
    }
  }, [orgNodes, orgEdges, orgCanvasNodes]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(HR_CONFIG_STORAGE_KEY, JSON.stringify(hrConfig));
    } catch {
      // sessionStorage unavailable - configuration still works in-memory
    }
  }, [hrConfig]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(ATTENDANCE_MAP_STORAGE_KEY, JSON.stringify(attendanceMap));
    } catch {
      // sessionStorage unavailable - attendance still works in-memory
    }
  }, [attendanceMap]);

  const isRoleInUse = (role: string) => orgNodes.some(node => node.role === role);
  const isDepartmentInUse = (department: string) => orgNodes.some(node => node.department === department);
  const isNodeTypeInUse = (type: string) => orgNodes.some(node => node.type === type);
  const isUnitRoleInUse = (name: string) => orgNodes.some(node => node.name === name);

  const addRole = (name: string) => {
    setHrConfig(prev => (prev.roles.includes(name) ? prev : { ...prev, roles: [...prev.roles, name] }));
  };
  const removeRole = (name: string) => {
    setHrConfig(prev => ({ ...prev, roles: prev.roles.filter(role => role !== name) }));
  };

  const addDepartment = (name: string) => {
    setHrConfig(prev => (prev.departments.includes(name) ? prev : { ...prev, departments: [...prev.departments, name] }));
  };
  const removeDepartment = (name: string) => {
    setHrConfig(prev => ({ ...prev, departments: prev.departments.filter(department => department !== name) }));
  };

  const addNodeType = () => {
    const name = newTypeName.trim();
    if (!name || hrConfig.nodeTypes.some(type => type.name === name)) return;
    const swatch = toneSwatches.find(t => t.tone === newTypeTone) ?? toneSwatches[0];
    setHrConfig(prev => ({ ...prev, nodeTypes: [...prev.nodeTypes, { name, tone: swatch.tone, dot: swatch.dot }] }));
    setNewTypeName('');
  };
  const removeNodeType = (name: string) => {
    setHrConfig(prev => ({ ...prev, nodeTypes: prev.nodeTypes.filter(type => type.name !== name) }));
  };

  const addUnitRole = (name: string) => {
    setHrConfig(prev => (prev.unitRoles.includes(name) ? prev : { ...prev, unitRoles: [...prev.unitRoles, name] }));
  };
  const removeUnitRole = (name: string) => {
    setHrConfig(prev => ({ ...prev, unitRoles: prev.unitRoles.filter(unitRole => unitRole !== name) }));
  };

  const addHoliday = (date: string, name: string, scope: HolidayScope, staffIds: string[]) => {
    if (!date || !name.trim()) return;
    setHrConfig(prev => (prev.holidays.some(h => h.date === date) ? prev : {
      ...prev,
      holidays: [...prev.holidays, {
        id: `holiday-${date}-${Date.now()}`,
        date,
        name: name.trim(),
        scope,
        staffIds: scope === 'specific' ? staffIds : [],
      }],
    }));
  };
  const removeHoliday = (id: string) => {
    setHrConfig(prev => ({ ...prev, holidays: prev.holidays.filter(holiday => holiday.id !== id) }));
  };

  const addWorkingDayOverride = (date: string, note: string) => {
    if (!date) return;
    setHrConfig(prev => (prev.workingDayOverrides.some(o => o.date === date) ? prev : {
      ...prev,
      workingDayOverrides: [...prev.workingDayOverrides, { id: `wdo-${date}-${Date.now()}`, date, note: note.trim() }],
    }));
  };
  const removeWorkingDayOverride = (id: string) => {
    setHrConfig(prev => ({ ...prev, workingDayOverrides: prev.workingDayOverrides.filter(o => o.id !== id) }));
  };

  const earnCompLeave = (staffId: string, staffName: string, earnedDate: string, reason: string) => {
    setHrConfig(prev => (prev.compLeaves.some(c => c.staffId === staffId && c.earnedDate === earnedDate) ? prev : {
      ...prev,
      compLeaves: [...prev.compLeaves, { id: `comp-${staffId}-${earnedDate}`, staffId, staffName, earnedDate, reason, status: 'Available' as CompLeaveStatus }],
    }));
  };
  const revokeCompLeave = (staffId: string, earnedDate: string) => {
    setHrConfig(prev => ({
      ...prev,
      compLeaves: prev.compLeaves.filter(c => !(c.staffId === staffId && c.earnedDate === earnedDate && c.status === 'Available')),
    }));
  };
  const setCompLeaveStatus = (id: string, status: CompLeaveStatus) => {
    setHrConfig(prev => ({ ...prev, compLeaves: prev.compLeaves.map(c => (c.id === id ? { ...c, status } : c)) }));
  };

  const setAttendanceLockHours = (hours: number) => {
    setHrConfig(prev => ({ ...prev, attendanceLockHours: Math.max(0, Math.round(hours) || 0) }));
  };

  const requestAttendanceUnlock = (staffId: string, staffName: string, date: string) => {
    setHrConfig(prev => {
      const alreadyPending = prev.unlockRequests.some(r => r.staffId === staffId && r.date === date && r.status === 'Pending');
      if (alreadyPending) return prev;
      return {
        ...prev,
        unlockRequests: [...prev.unlockRequests, {
          id: `unlock-${staffId}-${date}-${Date.now()}`,
          staffId,
          staffName,
          date,
          requestedAt: new Date().toISOString(),
          status: 'Pending' as UnlockStatus,
        }],
      };
    });
  };

  const setUnlockRequestStatus = (id: string, status: UnlockStatus) => {
    setHrConfig(prev => ({ ...prev, unlockRequests: prev.unlockRequests.map(r => (r.id === id ? { ...r, status } : r)) }));
  };

  const setSalaryField = (staffId: string, field: keyof SalaryStructure, value: number) => {
    setHrConfig(prev => ({
      ...prev,
      salaryStructures: {
        ...prev.salaryStructures,
        [staffId]: { ...(prev.salaryStructures[staffId] ?? emptySalaryStructure()), [field]: Math.max(0, value) },
      },
    }));
  };

  const resetOrgForm = () => {
    setOrgForm({
      parentId: orgNodes[0]?.id ?? '',
      name: '',
      role: '',
      owner: '',
      department: '',
      site: '',
      people: 1,
      type: 'Team',
    });
  };

  const collectDescendantIds = (id: string, allNodes: OrgNode[]): string[] => {
    const childIds = allNodes.filter(node => node.parentId === id).flatMap(node => collectDescendantIds(node.id, allNodes));
    return [id, ...childIds];
  };

  const startEditNode = (node: OrgNode) => {
    setEditingNodeId(node.id);
    setOrgForm({
      parentId: node.parentId,
      name: node.name,
      role: node.role,
      owner: node.owner,
      department: node.department,
      site: node.site,
      people: node.people,
      type: node.type,
    });
  };

  const cancelEditNode = () => {
    setEditingNodeId(null);
    resetOrgForm();
  };

  const addOrgNode = () => {
    if (!orgForm.name.trim()) return;

    if (editingNodeId) {
      const updatedNode: OrgNode = {
        id: editingNodeId,
        parentId: orgForm.parentId === editingNodeId ? '' : orgForm.parentId,
        name: orgForm.name.trim(),
        role: orgForm.role.trim() || orgForm.type,
        owner: orgForm.owner.trim() || '-',
        department: orgForm.department.trim() || '-',
        site: orgForm.site,
        people: Math.max(0, Number(orgForm.people) || 0),
        type: orgForm.type,
      };
      setOrgNodes(prev => prev.map(node => (node.id === editingNodeId ? updatedNode : node)));
      setOrgCanvasNodes(prev => prev.map(node => (node.id === editingNodeId ? { ...node, data: { ...node.data, orgNode: updatedNode } } : node)));
      setEditingNodeId(null);
      resetOrgForm();
      return;
    }

    const parentCanvasNode = orgCanvasNodes.find(node => node.id === orgForm.parentId);
    const nextNode: OrgNode = {
      ...orgForm,
      id: `${orgForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'node'}-${Date.now()}`,
      name: orgForm.name.trim(),
      role: orgForm.role.trim() || orgForm.type,
      owner: orgForm.owner.trim() || '-',
      department: orgForm.department.trim() || '-',
      people: Math.max(0, Number(orgForm.people) || 0),
    };
    setOrgNodes(prev => [...prev, nextNode]);
    setOrgCanvasNodes(prev => [
      ...prev,
      buildCanvasNode(nextNode, prev.length, parentCanvasNode?.position),
    ]);
    resetOrgForm();
  };

  const removeOrgNode = (nodeId: string) => {
    setOrgNodes(prev => {
      const idsToRemove = collectDescendantIds(nodeId, prev);
      setOrgCanvasNodes(canvasNodes => canvasNodes.filter(node => !idsToRemove.includes(node.id)));
      setOrgEdges(edges => edges.filter(edge => !idsToRemove.includes(edge.source) && !idsToRemove.includes(edge.target)));
      return prev.filter(node => !idsToRemove.includes(node.id));
    });
    if (orgForm.parentId === nodeId) {
      setOrgForm(prev => ({ ...prev, parentId: '' }));
    }
    if (editingNodeId === nodeId) {
      cancelEditNode();
    }
  };

  const addQuickCard = () => {
    const cardNumber = orgNodes.length + 1;
    const nextNode: OrgNode = {
      id: `card-${Date.now()}`,
      parentId: '',
      name: `New Card ${cardNumber}`,
      role: 'Click a node below to edit, or remove and re-add with details',
      owner: '-',
      department: '-',
      site: '',
      people: 0,
      type: 'Team',
    };
    setOrgNodes(prev => [...prev, nextNode]);
    setOrgCanvasNodes(prev => [...prev, buildCanvasNode(nextNode, prev.length)]);
  };

  const getChildNodes = (parentId: string) => orgNodes.filter(node => node.parentId === parentId);

  const orgCanvasEdges = [
    ...orgNodes
      .filter(node => node.parentId && orgNodes.some(parent => parent.id === node.parentId))
      .map(node => ({
        id: `primary-${node.parentId}-${node.id}`,
        source: node.parentId,
        target: node.id,
        type: 'smoothstep',
        animated: false,
        deletable: false,
        style: { stroke: '#0D3A35', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#0D3A35' },
      })),
    ...orgEdges
      .filter(edge => orgNodes.some(node => node.id === edge.source) && orgNodes.some(node => node.id === edge.target))
      .filter(edge => !orgNodes.some(node => node.id === edge.target && node.parentId === edge.source))
      .map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        animated: false,
        deletable: true,
        style: { stroke: '#2563eb', strokeWidth: 2, strokeDasharray: '6 4' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb' },
        data: { manual: true },
      })),
  ];

  const onOrgConnect = (connection: Connection) => {
    const { source, target } = connection;
    if (!source || !target || source === target) return;
    const targetNode = orgNodes.find(node => node.id === target);
    if (targetNode?.parentId === source) return;
    setOrgEdges(prev => {
      if (prev.some(edge => edge.source === source && edge.target === target)) return prev;
      return [...prev, { id: `edge-${source}-${target}-${Date.now()}`, source, target }];
    });
  };

  const onOrgEdgeClick = (_: React.MouseEvent, edge: Edge) => {
    if (edge.data?.manual) {
      setOrgEdges(prev => prev.filter(existing => existing.id !== edge.id));
    }
  };

  const renderOrgNode = (node: OrgNode, depth = 0) => {
    const children = getChildNodes(node.id);
    return (
      <div key={node.id} className="relative">
        <div
          className={cn(
            'rounded-xl border border-slate-200 bg-white p-4 shadow-sm',
            depth === 0 && 'border-[#0D3A35]/25 bg-emerald-50/40'
          )}
          style={{ marginLeft: depth ? Math.min(depth * 24, 96) : 0 }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0D3A35] text-white">
                {node.type === 'Person' ? <UserCheck className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-extrabold text-slate-950">{node.name}</p>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-600">{node.type}</span>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">{node.role}</p>
                <p className="mt-2 text-xs font-bold text-slate-600">{node.department} · Owner: {node.owner}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-extrabold text-slate-600">
                {node.people} People
              </span>
              <button
                type="button"
                onClick={() => removeOrgNode(node.id)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Remove ${node.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        {children.length > 0 && (
          <div className="mt-3 space-y-3 border-l border-dashed border-slate-200 pl-4">
            {children.map(child => renderOrgNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderDashboard = () => (
    <>
      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, hint, Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-slate-500">{label}</p>
                <p className="mt-3 text-3xl font-extrabold text-slate-950">{value}</p>
                <p className="mt-2 text-sm font-semibold text-slate-500">{hint}</p>
              </div>
              <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl ring-1', tone)}>
                <Icon className="h-6 w-6" />
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard title="Hiring & Onboarding Pipeline" subtitle="Live view of current HR movement" Icon={TrendingUp}>
          <div className="space-y-5">
            {pipeline.map(item => (
              <div key={item.stage}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-700">{item.stage}</span>
                  <span className="font-extrabold text-slate-950">{item.count}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-[#0D3A35]" style={{ width: `${item.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Workforce Health" subtitle="Attendance snapshot by staff type" Icon={ShieldCheck}>
          <DataTable headers={['Group', 'Total', 'Present', 'Leave', 'Open']} rows={attendanceRows} />
        </SectionCard>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Compliance Readiness" subtitle="Document completion overview" Icon={FileCheck2}>
          <div className="space-y-4">
            {complianceItems.map(item => {
              const total = item.complete + item.pending;
              const progress = total ? Math.round((item.complete / total) * 100) : 0;
              return (
                <div key={item.label} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-extrabold text-slate-800">{item.label}</span>
                    <span className="text-sm font-bold text-[#0D3A35]">{progress}%</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-[#0D3A35]" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-500">{item.complete} complete · {item.pending} pending</p>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Open HR Actions" subtitle="Priority queue for the HR desk" Icon={Clock3}>
          <div className="space-y-3">
            {actions.map(action => (
              <div key={action.title} className="flex items-center gap-4 rounded-xl border border-slate-200 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-[#0D3A35] ring-1 ring-emerald-100">
                  {action.status === 'Urgent' ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-slate-900">{action.title}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{action.owner} · Due {action.due}</p>
                </div>
                <span className={cn('rounded-full px-3 py-1 text-xs font-extrabold ring-1', statusClass(action.status))}>
                  {action.status}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );

  const renderPayroll = () => (
    <PayrollModule
      attendanceMap={attendanceMap}
      salaryStructures={hrConfig.salaryStructures}
      onSetSalaryField={setSalaryField}
    />
  );

  const renderAttendance = () => (
    <AttendanceModule
      map={attendanceMap}
      setMap={setAttendanceMap}
      holidays={hrConfig.holidays}
      workingDayOverrides={hrConfig.workingDayOverrides}
      onEarnCompLeave={earnCompLeave}
      onRevokeCompLeave={revokeCompLeave}
      lockHours={hrConfig.attendanceLockHours}
      unlockRequests={hrConfig.unlockRequests}
      onRequestUnlock={requestAttendanceUnlock}
    />
  );

  const resetHRBudgetForm = () => {
    setHrBudgetForm({
      budgetName: '',
      financialYear: '2026-27',
      budgetCycle: 'Payroll',
      startDate: '',
      endDate: '',
      budgetHeads: '',
      owner: '',
      allocated: '',
      masterFileName: '',
    });
  };

  const createHRBudget = () => {
    if (!hrBudgetForm.budgetName.trim()) return;
    const [fyStart, fyEndShort] = hrBudgetForm.financialYear.split('-');
    const nextBudget: HRBudgetCard = {
      budget_id: `HRB-${Date.now()}`,
      budget_name: hrBudgetForm.budgetName.trim(),
      financial_year_start: fyStart || '2026',
      financial_year_end: fyStart?.slice(0, 2) + fyEndShort || '2027',
      budget_cycle: hrBudgetForm.budgetCycle,
      project_start_date: hrBudgetForm.startDate,
      project_end_date: hrBudgetForm.endDate,
      budget_heads: hrBudgetForm.budgetHeads.trim() || hrBudgetForm.budgetCycle,
      owner: hrBudgetForm.owner.trim() || 'HR Manager',
      status: 'active',
      locked: false,
      allocated: hrBudgetForm.allocated.trim() || '₹0',
      utilized: '₹0',
    };
    setHrBudgets(prev => [nextBudget, ...prev]);
    resetHRBudgetForm();
    setShowCreateHRBudget(false);
  };

  const renderHRBudgetCard = (budget: HRBudgetCard) => {
    const fmtDate = (date: string) =>
      date ? new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    const fy = `${budget.financial_year_start}-${String(parseInt(budget.financial_year_end) % 100).padStart(2, '0')}`;
    const cycleColor = HR_BUDGET_CYCLES[budget.budget_cycle] ?? 'bg-slate-100 text-slate-600 border-slate-200';

    return (
      <div
        key={budget.budget_id}
        className={cn(
          'group relative flex flex-col gap-4 rounded-xl border p-5 shadow-sm transition-all',
          budget.locked
            ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-70'
            : 'cursor-pointer border-slate-200 bg-white hover:border-[#173f70]/40 hover:shadow-md'
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className={cn('truncate text-base font-extrabold transition-colors', budget.locked ? 'text-slate-500' : 'text-slate-900 group-hover:text-[#173f70]')}>
              {budget.budget_name}
            </h3>
            <p className="mt-0.5 text-xs font-semibold text-slate-400">FY {fy}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {budget.locked ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-extrabold text-red-600">
                <Lock className="h-3 w-3" />
                Locked
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-extrabold text-emerald-600">
                <Unlock className="h-3 w-3" />
                Open
              </span>
            )}
            <span className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold', cycleColor)}>
              {budget.budget_cycle}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <IndianRupee className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <span className="font-semibold text-slate-700">{budget.budget_heads}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="font-semibold">{fmtDate(budget.project_start_date)} → {fmtDate(budget.project_end_date)}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Users className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            <span className="font-semibold text-blue-600">Owner: {budget.owner}</span>
          </div>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Allocated</p>
            <p className="mt-0.5 text-sm font-extrabold text-slate-700">{budget.allocated}</p>
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Status</p>
            <p className={cn('mt-0.5 text-sm font-extrabold capitalize', budget.status === 'active' ? 'text-emerald-600' : 'text-slate-500')}>
              {budget.status}
            </p>
          </div>
        </div>

        {!budget.locked && (
          <ChevronRight className="absolute bottom-4 right-4 h-4 w-4 text-[#173f70] opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </div>
    );
  };

  const renderHRBudget = () => (
    (() => {
      const filtered = hrBudgetSearch
        ? hrBudgets.filter(budget => {
            const q = hrBudgetSearch.toLowerCase();
            const fy = `${budget.financial_year_start}-${budget.financial_year_end}`;
            return (
              budget.budget_name.toLowerCase().includes(q) ||
              budget.budget_cycle.toLowerCase().includes(q) ||
              budget.budget_heads.toLowerCase().includes(q) ||
              fy.includes(q)
            );
          })
        : hrBudgets;

      return (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900">Budgets</h1>
              <p className="mt-1 text-sm font-medium text-slate-500">{hrBudgets.length} budget{hrBudgets.length !== 1 ? 's' : ''}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateHRBudget(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#173f70] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#12345e]"
            >
              <Plus className="h-4 w-4" />
              New Budget
            </button>
          </div>

          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={hrBudgetSearch}
              onChange={(e) => setHrBudgetSearch(e.target.value)}
              placeholder="Search by name, head, or year…"
              className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-4 text-sm font-semibold text-slate-800 outline-none focus:border-[#173f70] focus:ring-1 focus:ring-[#173f70]/20"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-slate-300 py-20">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100">
                <BarChart3 className="h-7 w-7 text-slate-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-extrabold text-slate-600">{hrBudgetSearch ? 'No budgets match your search' : 'No budgets yet'}</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">{hrBudgetSearch ? 'Try a different keyword' : 'Create your first HR budget to get started'}</p>
              </div>
              {!hrBudgetSearch && (
                <button
                  type="button"
                  onClick={() => setShowCreateHRBudget(true)}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#173f70] px-4 text-xs font-semibold text-white hover:bg-[#12345e]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create Budget
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(renderHRBudgetCard)}
            </div>
          )}

          {showCreateHRBudget && (
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 py-10">
              <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                  <div>
                    <h2 className="text-xl font-extrabold text-slate-900">Create New Budget</h2>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">Set up a new HR budget plan</p>
                  </div>
                  <button onClick={() => setShowCreateHRBudget(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4 p-6">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-extrabold text-slate-600">Budget Name *</label>
                    <input
                      value={hrBudgetForm.budgetName}
                      onChange={(e) => setHrBudgetForm(prev => ({ ...prev, budgetName: e.target.value }))}
                      placeholder="e.g. FY 2026-27 Payroll Budget"
                      className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#173f70] focus:ring-1 focus:ring-[#173f70]/20"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-extrabold text-slate-600">Financial Year *</label>
                      <select
                        value={hrBudgetForm.financialYear}
                        onChange={(e) => setHrBudgetForm(prev => ({ ...prev, financialYear: e.target.value }))}
                        className="h-10 w-full cursor-pointer rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#173f70] focus:ring-1 focus:ring-[#173f70]/20"
                      >
                        {['2025-26', '2026-27', '2027-28', '2028-29'].map(year => <option key={year} value={year}>{year}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-extrabold text-slate-600">Budget Cycle *</label>
                      <div className="flex h-10 gap-1.5">
                        {['Payroll', 'Hiring', 'Welfare'].map(cycle => (
                          <button
                            key={cycle}
                            type="button"
                            onClick={() => setHrBudgetForm(prev => ({ ...prev, budgetCycle: cycle }))}
                            className={cn(
                              'flex-1 rounded-md border text-xs font-extrabold transition-all',
                              hrBudgetForm.budgetCycle === cycle
                                ? HR_BUDGET_CYCLES[cycle]
                                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                            )}
                          >
                            {cycle}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-extrabold text-slate-600">Project Start *</label>
                      <input type="date" value={hrBudgetForm.startDate} onChange={(e) => setHrBudgetForm(prev => ({ ...prev, startDate: e.target.value }))} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#173f70] focus:ring-1 focus:ring-[#173f70]/20" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-extrabold text-slate-600">Project End *</label>
                      <input type="date" value={hrBudgetForm.endDate} onChange={(e) => setHrBudgetForm(prev => ({ ...prev, endDate: e.target.value }))} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#173f70] focus:ring-1 focus:ring-[#173f70]/20" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-extrabold text-slate-600">Budget Heads</label>
                    <input value={hrBudgetForm.budgetHeads} onChange={(e) => setHrBudgetForm(prev => ({ ...prev, budgetHeads: e.target.value }))} placeholder="e.g. Management, Field Staff, Consultants" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#173f70] focus:ring-1 focus:ring-[#173f70]/20" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-extrabold text-slate-600">Budget Owner</label>
                      <input value={hrBudgetForm.owner} onChange={(e) => setHrBudgetForm(prev => ({ ...prev, owner: e.target.value }))} placeholder="HR Manager" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#173f70] focus:ring-1 focus:ring-[#173f70]/20" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-extrabold text-slate-600">Allocated Amount</label>
                      <input value={hrBudgetForm.allocated} onChange={(e) => setHrBudgetForm(prev => ({ ...prev, allocated: e.target.value }))} placeholder="₹0" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#173f70] focus:ring-1 focus:ring-[#173f70]/20" />
                    </div>
                  </div>

                  <div className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-3 transition-all hover:border-[#173f70] hover:bg-blue-50/30">
                    <FileCheck2 className="h-5 w-5 shrink-0 text-slate-400" />
                    <div>
                      <p className="text-xs font-extrabold text-slate-600">Upload HR budget working file (optional)</p>
                      <p className="text-[10px] font-semibold text-slate-400">Linked to all HR budget line items</p>
                    </div>
                    <Upload className="ml-auto h-4 w-4 shrink-0 text-slate-400" />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
                  <button onClick={() => setShowCreateHRBudget(false)} className="h-10 rounded-lg border border-slate-200 px-5 text-sm font-semibold hover:bg-slate-50">
                    Cancel
                  </button>
                  <button type="button" onClick={createHRBudget} className="h-10 rounded-lg bg-[#173f70] px-5 text-sm font-semibold text-white hover:bg-[#12345e]">
                    Create Budget
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    })()
  );

  const invalidParentIds = editingNodeId ? collectDescendantIds(editingNodeId, orgNodes) : [];

  const renderManagementStructure = () => (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <SectionCard
        title={editingNodeId ? 'Edit Node' : 'Create Hierarchy'}
        subtitle={editingNodeId ? 'Update the selected card’s details' : 'Build any company structure with parent reporting lines'}
        Icon={editingNodeId ? Pencil : Network}
      >
        <div className="space-y-4">
          {editingNodeId && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 ring-1 ring-amber-100">
              <span>Editing "{orgNodes.find(node => node.id === editingNodeId)?.name}"</span>
              <button type="button" onClick={cancelEditNode} className="font-extrabold underline">Cancel</button>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Reports To</label>
            <select
              value={orgForm.parentId}
              onChange={(e) => setOrgForm(prev => ({ ...prev, parentId: e.target.value }))}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-[#0D3A35]"
            >
              <option value="">No parent / Top level</option>
              {orgNodes.filter(node => !invalidParentIds.includes(node.id)).map(node => (
                <option key={node.id} value={node.id}>{node.name}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Unit / Role / Person Name</label>
              <input
                value={orgForm.name}
                onChange={(e) => setOrgForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Cluster Head - North"
                list="org-unit-role-options"
                className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-800 outline-none focus:border-[#0D3A35]"
              />
              <datalist id="org-unit-role-options">
                {hrConfig.unitRoles.map(unitRole => (
                  <option key={unitRole} value={unitRole} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Type</label>
              <select
                value={orgForm.type}
                onChange={(e) => setOrgForm(prev => ({ ...prev, type: e.target.value }))}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-[#0D3A35]"
              >
                {hrConfig.nodeTypes.map(type => (
                  <option key={type.name} value={type.name}>{type.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">People</label>
              <input
                type="number"
                min="0"
                value={orgForm.people}
                onChange={(e) => setOrgForm(prev => ({ ...prev, people: Number(e.target.value) }))}
                className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-800 outline-none focus:border-[#0D3A35]"
              />
              {orgForm.parentId === '' && (
                <p className="text-[11px] font-semibold text-slate-400">Top-level cards auto-calculate this from their branches once child cards report in.</p>
              )}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Role / Responsibility</label>
              <input
                value={orgForm.role}
                onChange={(e) => setOrgForm(prev => ({ ...prev, role: e.target.value }))}
                placeholder="e.g. Zone operations and daily execution"
                list="org-role-options"
                className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-800 outline-none focus:border-[#0D3A35]"
              />
              <datalist id="org-role-options">
                {hrConfig.roles.map(role => (
                  <option key={role} value={role} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Owner</label>
              <input
                value={orgForm.owner}
                onChange={(e) => setOrgForm(prev => ({ ...prev, owner: e.target.value }))}
                placeholder="Pick a staff member or type a name"
                list="org-owner-options"
                className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-800 outline-none focus:border-[#0D3A35]"
              />
              <datalist id="org-owner-options">
                {staffOwnerOptions.map(name => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Department</label>
              <select
                value={orgForm.department}
                onChange={(e) => setOrgForm(prev => ({ ...prev, department: e.target.value }))}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-[#0D3A35]"
              >
                <option value="">Select department</option>
                {hrConfig.departments.map(department => (
                  <option key={department} value={department}>{department}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Site</label>
              <select
                value={orgForm.site}
                onChange={(e) => setOrgForm(prev => ({ ...prev, site: e.target.value }))}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-[#0D3A35]"
              >
                <option value="">No site</option>
                {(['Cluster', 'Zone', 'Block'] as const).map(kind => {
                  const options = siteOptions.filter(site => site.kind === kind);
                  if (options.length === 0) return null;
                  return (
                    <optgroup key={kind} label={`${kind}s`}>
                      {options.map(site => (
                        <option key={site.id} value={site.name}>{site.name}</option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
              {isSitesLoading && <p className="text-[11px] font-semibold text-slate-400">Loading sites from Clusters, Zones & Blocks…</p>}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={addOrgNode}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[#0D3A35] px-4 text-sm font-extrabold text-white hover:bg-[#092b27]"
            >
              {editingNodeId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingNodeId ? 'Save Changes' : 'Add To Structure'}
            </button>
            <button
              type="button"
              onClick={editingNodeId ? cancelEditNode : resetOrgForm}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              aria-label={editingNodeId ? 'Cancel edit' : 'Reset hierarchy form'}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </SectionCard>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-extrabold text-slate-950">Organogram Canvas</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addQuickCard}
                className="flex h-9 items-center gap-2 rounded-lg bg-[#0D3A35] px-3 text-xs font-extrabold text-white hover:bg-[#092b27]"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Card
              </button>
              <button
                type="button"
                onClick={() => setOrgCanvasNodes(orgNodes.map((node, index) => buildCanvasNode(node, index)))}
                className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Layout
              </button>
            </div>
          </div>
          <div className="relative h-[680px]">
            {orgNodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white/90 px-6 py-5 text-center shadow-sm">
                  <p className="text-sm font-extrabold text-slate-800">Canvas is empty</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Click "Add Card" above to start building the organogram from scratch.</p>
                </div>
              </div>
            )}
            <ReactFlowProvider>
              <ReactFlow
                nodes={orgCanvasNodes.map(canvasNode => {
                  const orgNode = orgNodes.find(node => node.id === canvasNode.id) ?? canvasNode.data.orgNode;
                  const tone = hrConfig.nodeTypes.find(type => type.name === orgNode.type)?.tone ?? DEFAULT_NODE_TONE;
                  return {
                    ...canvasNode,
                    data: { orgNode: { ...orgNode, people: resolveNodePeople(orgNode, orgNodes) }, onEdit: startEditNode, tone },
                  };
                })}
                edges={orgCanvasEdges}
                onNodesChange={onOrgCanvasNodesChange}
                onConnect={onOrgConnect}
                onEdgeClick={onOrgEdgeClick}
                nodeTypes={orgNodeTypes}
                fitView
                fitViewOptions={{ padding: 0.22 }}
                nodesDraggable
                nodesConnectable
                panOnDrag
                zoomOnScroll
              >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#cbd5e1" />
                <Controls />
                <MiniMap
                  pannable
                  zoomable
                  nodeColor={(node) => (node.id === 'company' ? '#0D3A35' : '#94a3b8')}
                  maskColor="rgba(15, 23, 42, 0.08)"
                />
              </ReactFlow>
            </ReactFlowProvider>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200">
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-extrabold text-slate-950">Structure Nodes</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Delete a node here to remove its full child branch from the organogram.</p>
          </div>
          <div className="max-h-72 divide-y divide-slate-100 overflow-auto">
            {orgNodes.map(node => (
              <div key={node.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-slate-900">{node.name}</p>
                  <p className="mt-1 truncate text-xs font-semibold text-slate-500">{node.type} · Reports to {orgNodes.find(parent => parent.id === node.parentId)?.name ?? 'Top level'}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEditNode(node)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-[#0D3A35]"
                    aria-label={`Edit ${node.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeOrgNode(node.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Remove ${node.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );

  const renderLeads = () => (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <SectionCard title="HR Leads" subtitle="Open hiring leads and ownership" Icon={Users}>
        <DataTable headers={['Lead', 'Department', 'Stage', 'Owner', 'Priority']} rows={leadRows} />
      </SectionCard>
      <SectionCard title="Lead Funnel" subtitle="Conversion from requisition to joining" Icon={TrendingUp}>
        <div className="space-y-5">
          {pipeline.map(item => (
            <div key={item.stage}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-slate-700">{item.stage}</span>
                <span className="font-extrabold text-slate-950">{item.count}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-[#0D3A35]" style={{ width: `${item.progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );

  const renderOrgStructureConfig = () => (
    <div className="grid gap-4 sm:grid-cols-2">
      <ConfigListEditor
        title="Unit Role"
        subtitle="Manage Unit / Role / Person Name suggestions for org cards"
        Icon={Users}
        items={hrConfig.unitRoles}
        placeholder="e.g. Cluster Head - North"
        onAdd={addUnitRole}
        onRemove={removeUnitRole}
        isInUse={isUnitRoleInUse}
      />
      <ConfigListEditor
        title="Roles"
        subtitle="Manage role / responsibility suggestions for org cards"
        Icon={BadgeCheck}
        items={hrConfig.roles}
        placeholder="e.g. Zone Coordinator"
        onAdd={addRole}
        onRemove={removeRole}
        isInUse={isRoleInUse}
      />
      <ConfigListEditor
        title="Departments"
        subtitle="Manage the Department dropdown in Management Structure"
        Icon={Building2}
        items={hrConfig.departments}
        placeholder="e.g. Logistics"
        onAdd={addDepartment}
        onRemove={removeDepartment}
        isInUse={isDepartmentInUse}
      />
      <SectionCard title="Node Types" subtitle="Manage the Type dropdown and canvas card colors" Icon={Network} compact>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNodeType(); } }}
              placeholder="e.g. Zone"
              className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-800 outline-none focus:border-[#0D3A35]"
            />
            <button
              type="button"
              onClick={addNodeType}
              className="flex h-9 items-center gap-2 rounded-lg bg-[#0D3A35] px-3.5 text-sm font-extrabold text-white hover:bg-[#092b27]"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {toneSwatches.map(swatch => (
              <button
                key={swatch.label}
                type="button"
                onClick={() => setNewTypeTone(swatch.tone)}
                className={cn(
                  'h-6 w-6 rounded-full border-2',
                  swatch.dot,
                  newTypeTone === swatch.tone ? 'border-slate-900' : 'border-transparent'
                )}
                aria-label={swatch.label}
              />
            ))}
          </div>
        </div>
        <div className="mt-3 max-h-52 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200">
          {hrConfig.nodeTypes.map(type => (
            <div key={type.name} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cn('h-3 w-3 shrink-0 rounded-full', type.dot)} />
                <span className="truncate text-sm font-extrabold text-slate-800">{type.name}</span>
              </div>
              {isNodeTypeInUse(type.name) ? (
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold text-slate-500">In use</span>
              ) : (
                <button
                  type="button"
                  onClick={() => removeNodeType(type.name)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label={`Remove ${type.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Site" subtitle="Live from Clusters, Zones & Blocks — feeds the Site dropdown in Management Structure" Icon={MapPin} compact>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-slate-500">{siteOptions.length} locations synced</p>
          <button
            type="button"
            onClick={fetchSiteOptions}
            disabled={isSitesLoading}
            className="flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className={cn('h-3.5 w-3.5', isSitesLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>
        {sitesError && <p className="mt-2 text-xs font-semibold text-rose-600">{sitesError}</p>}
        <div className="mt-3 space-y-3">
          {(['Cluster', 'Zone', 'Block'] as const).map(kind => {
            const options = siteOptions.filter(site => site.kind === kind);
            return (
              <div key={kind}>
                <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">{kind}s</p>
                <div className="mt-1.5 max-h-28 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200">
                  {options.length === 0 ? (
                    <p className="px-3 py-3 text-center text-xs font-semibold text-slate-400">
                      {isSitesLoading ? 'Loading…' : `No ${kind.toLowerCase()}s found`}
                    </p>
                  ) : (
                    options.map(site => (
                      <div key={site.id} className="px-3 py-2 text-sm font-bold text-slate-800">{site.name}</div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );

  const compLeaveStatusTone: Record<CompLeaveStatus, string> = {
    Available: 'bg-amber-50 text-amber-700 ring-amber-100',
    Approved: 'bg-blue-50 text-blue-700 ring-blue-100',
    Redeemed: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    Rejected: 'bg-rose-50 text-rose-700 ring-rose-100',
  };

  const renderHolidaysConfig = () => (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionCard title="Holiday Marker" subtitle="Mark company holidays — auto-marks PH for the staff it applies to" Icon={CalendarDays} compact>
        <div className="space-y-2.5">
          <div className="grid gap-2.5 sm:grid-cols-[1fr_1fr_auto]">
            <input
              type="date"
              value={newHolidayDate}
              onChange={(e) => setNewHolidayDate(e.target.value)}
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-800 outline-none focus:border-[#0D3A35]"
            />
            <input
              value={newHolidayName}
              onChange={(e) => setNewHolidayName(e.target.value)}
              placeholder="e.g. Diwali"
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-800 outline-none focus:border-[#0D3A35]"
            />
            <button
              type="button"
              onClick={() => {
                addHoliday(newHolidayDate, newHolidayName, newHolidayScope, newHolidayStaffIds);
                setNewHolidayDate('');
                setNewHolidayName('');
                setNewHolidayScope('all');
                setNewHolidayStaffIds([]);
              }}
              className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#0D3A35] px-4 text-sm font-extrabold text-white hover:bg-[#092b27]"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setNewHolidayScope('all')}
              className={cn(
                'h-8 flex-1 rounded-lg text-xs font-extrabold transition',
                newHolidayScope === 'all' ? 'bg-[#0D3A35] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              )}
            >
              Entire Staff
            </button>
            <button
              type="button"
              onClick={() => setNewHolidayScope('specific')}
              className={cn(
                'h-8 flex-1 rounded-lg text-xs font-extrabold transition',
                newHolidayScope === 'specific' ? 'bg-[#0D3A35] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              )}
            >
              Specific Staff
            </button>
          </div>
          {newHolidayScope === 'specific' && (
            <div className="max-h-32 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">
              {staffDirectory.length === 0 && (
                <p className="px-2 py-2 text-center text-xs font-semibold text-slate-400">Staff directory unavailable.</p>
              )}
              {staffDirectory.map(staff => (
                <label key={staff.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={newHolidayStaffIds.includes(staff.id)}
                    onChange={(e) => setNewHolidayStaffIds(prev => (
                      e.target.checked ? [...prev, staff.id] : prev.filter(id => id !== staff.id)
                    ))}
                    className="h-3.5 w-3.5 accent-[#0D3A35]"
                  />
                  {staff.name}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="mt-3 max-h-64 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200">
          {hrConfig.holidays.length === 0 && (
            <p className="px-4 py-5 text-center text-xs font-semibold text-slate-400">No holidays marked yet.</p>
          )}
          {[...hrConfig.holidays].sort((a, b) => a.date.localeCompare(b.date)).map(holiday => {
            const overridden = hrConfig.workingDayOverrides.some(o => o.date === holiday.date);
            const scopeLabel = holiday.scope === 'all' ? 'All Staff' : `${holiday.staffIds.length} staff`;
            return (
              <div key={holiday.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-slate-800">{holiday.name}</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-400">{format(new Date(`${holiday.date}T00:00:00`), 'EEE, MMM d, yyyy')}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold text-slate-500">{scopeLabel}</span>
                  {overridden && (
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-extrabold text-blue-700 ring-1 ring-blue-100">Working Day</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeHoliday(holiday.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Remove ${holiday.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Working Days" subtitle="Convert a Sunday or holiday into a working day" Icon={Briefcase} compact>
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
            <input
              type="date"
              value={newOverrideDate}
              onChange={(e) => setNewOverrideDate(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-800 outline-none focus:border-[#0D3A35]"
            />
            <input
              value={newOverrideNote}
              onChange={(e) => setNewOverrideNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addWorkingDayOverride(newOverrideDate, newOverrideNote); setNewOverrideDate(''); setNewOverrideNote(''); } }}
              placeholder="Reason (e.g. Dispatch deadline)"
              className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-800 outline-none focus:border-[#0D3A35]"
            />
          </div>
          {newOverrideDate && (() => {
            const d = new Date(`${newOverrideDate}T00:00:00`);
            const isSunday = d.getDay() === 0;
            const holidayName = hrConfig.holidays.find(h => h.date === newOverrideDate)?.name;
            const label = isSunday && holidayName
              ? `Sunday & marked holiday: ${holidayName}`
              : isSunday
                ? 'This is a Sunday'
                : holidayName
                  ? `Marked holiday: ${holidayName}`
                  : 'This is already a regular working day';
            return <p className="text-[11px] font-semibold text-slate-400">{label}</p>;
          })()}
          <button
            type="button"
            onClick={() => { addWorkingDayOverride(newOverrideDate, newOverrideNote); setNewOverrideDate(''); setNewOverrideNote(''); }}
            className="flex h-9 items-center justify-center gap-2 rounded-lg bg-[#0D3A35] px-4 text-sm font-extrabold text-white hover:bg-[#092b27]"
          >
            <Plus className="h-4 w-4" />
            Mark as Working Day
          </button>
        </div>
        <div className="mt-3 max-h-52 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200">
          {hrConfig.workingDayOverrides.length === 0 && (
            <p className="px-4 py-4 text-center text-xs font-semibold text-slate-400">No working-day overrides yet.</p>
          )}
          {[...hrConfig.workingDayOverrides].sort((a, b) => a.date.localeCompare(b.date)).map(override => {
            const holidayName = hrConfig.holidays.find(h => h.date === override.date)?.name;
            return (
              <div key={override.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-slate-800">{format(new Date(`${override.date}T00:00:00`), 'EEEE, MMM d, yyyy')}</p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">{holidayName ? `${holidayName} · ` : ''}{override.note || 'No reason given'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeWorkingDayOverride(override.id)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label="Remove working-day override"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="Compensatory Leaves"
        subtitle="Auto-calculated when staff work a holiday/Sunday — review and approve here"
        Icon={Clock3}
        compact
      >
        <div className="max-h-64 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200">
          {hrConfig.compLeaves.length === 0 && (
            <p className="px-4 py-4 text-center text-xs font-semibold text-slate-400">No compensatory leaves earned yet.</p>
          )}
          {[...hrConfig.compLeaves].sort((a, b) => b.earnedDate.localeCompare(a.earnedDate)).map(comp => (
            <div key={comp.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-slate-800">{comp.staffName}</p>
                <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">
                  Earned {format(new Date(`${comp.earnedDate}T00:00:00`), 'MMM d, yyyy')} · {comp.reason}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-extrabold ring-1', compLeaveStatusTone[comp.status])}>
                  {comp.status}
                </span>
                {comp.status === 'Available' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setCompLeaveStatus(comp.id, 'Approved')}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-600 hover:bg-slate-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompLeaveStatus(comp.id, 'Rejected')}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-rose-600 hover:bg-rose-50"
                    >
                      Reject
                    </button>
                  </>
                )}
                {comp.status === 'Approved' && (
                  <button
                    type="button"
                    onClick={() => setCompLeaveStatus(comp.id, 'Redeemed')}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-600 hover:bg-slate-50"
                  >
                    Mark Redeemed
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );

  const unlockStatusTone: Record<UnlockStatus, string> = {
    Pending: 'bg-amber-50 text-amber-700 ring-amber-100',
    Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    Rejected: 'bg-rose-50 text-rose-700 ring-rose-100',
  };

  const renderAttendanceLockConfig = () => (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionCard title="Attendance Lock" subtitle="Lock a punched attendance entry after this many hours" Icon={Lock} compact>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min="0"
            value={hrConfig.attendanceLockHours}
            onChange={(e) => setAttendanceLockHours(Number(e.target.value))}
            className="h-10 w-28 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-800 outline-none focus:border-[#0D3A35]"
          />
          <span className="text-sm font-bold text-slate-600">hours after punching</span>
        </div>
        <p className="mt-3 text-xs font-semibold text-slate-400">
          Once locked, editing that entry requires an unlock request approved by Director Corporate.
        </p>
      </SectionCard>

      <SectionCard title="Unlock Requests" subtitle="Approval from Director Corporate required to edit a locked entry" Icon={ShieldCheck} compact>
        <div className="max-h-64 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200">
          {hrConfig.unlockRequests.length === 0 && (
            <p className="px-4 py-4 text-center text-xs font-semibold text-slate-400">No unlock requests yet.</p>
          )}
          {[...hrConfig.unlockRequests].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)).map(req => (
            <div key={req.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-slate-800">{req.staffName}</p>
                <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">
                  {format(new Date(`${req.date}T00:00:00`), 'MMM d, yyyy')} · requested {format(new Date(req.requestedAt), 'MMM d, h:mm a')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-extrabold ring-1', unlockStatusTone[req.status])}>
                  {req.status}
                </span>
                {req.status === 'Pending' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setUnlockRequestStatus(req.id, 'Approved')}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-600 hover:bg-slate-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnlockRequestStatus(req.id, 'Rejected')}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-rose-600 hover:bg-rose-50"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );

  const renderConfiguration = () => (
    <div className="space-y-4">
      <div className="flex w-fit flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {([
          { label: 'Org Structure' as const, Icon: Network },
          { label: 'Holidays & Leave' as const, Icon: CalendarDays },
          { label: 'Attendance Lock' as const, Icon: Lock },
        ]).map(({ label, Icon }) => (
          <button
            key={label}
            type="button"
            onClick={() => setConfigTab(label)}
            className={cn(
              'flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-extrabold transition',
              configTab === label ? 'bg-[#0D3A35] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
      {configTab === 'Org Structure' && renderOrgStructureConfig()}
      {configTab === 'Holidays & Leave' && renderHolidaysConfig()}
      {configTab === 'Attendance Lock' && renderAttendanceLockConfig()}
    </div>
  );

  const renderActiveView = () => {
    if (activeView === 'Payroll') return renderPayroll();
    if (activeView === 'Attendance') return renderAttendance();
    if (activeView === 'HR Budget') return renderHRBudget();
    if (activeView === 'Management Structure') return renderManagementStructure();
    if (activeView === 'Leads') return renderLeads();
    if (activeView === 'Configuration') return renderConfiguration();
    return renderDashboard();
  };

  return (
    <div className="min-h-screen bg-[#fbfcfd] p-8 text-slate-900">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">HR Management</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="flex h-11 items-center gap-2 rounded-lg bg-[#0D3A35] px-4 text-sm font-bold text-white shadow-sm hover:bg-[#092b27]">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      <div className="mt-7 overflow-x-auto pb-1">
        <div className="flex min-w-max rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {views.map(({ label, Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => setActiveView(label)}
              className={cn(
                'flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-extrabold transition',
                activeView === label
                  ? 'bg-[#0D3A35] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <main className="mt-8">{renderActiveView()}</main>
    </div>
  );
};

export default HRManagement;
