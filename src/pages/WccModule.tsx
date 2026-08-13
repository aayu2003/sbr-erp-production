import { useEffect, useMemo, useState } from 'react';
import {
  Clock3, Download, Eye, FileCheck2, Filter, History, Pencil, Plus, RefreshCw, Search, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import getBaseUrl from '@/lib/config';
import { formatDateDDMMYYYY } from '@/lib/dateFormat';
import { cn } from '@/lib/utils';
import WccWorkspace from '@/components/wcc/WccWorkspace';
import WccCertificatePreview, { type WccCertificateRecord } from '@/components/cultivation/WccCertificatePreview';
import { WCC_WORK_TEMPLATES, calculateWccTotals, type WccEnterpriseDraft } from '@/lib/wccEnterprise';
import { deleteLocalWccDraft, listLocalWccDrafts } from '@/lib/wccEnterpriseApi';

const BASE_URL = getBaseUrl().replace(/\/$/, '');
type FarmOption = { farm_id: string; farmer_id?: string; farmer_name?: string; block_id?: string; area?: number };
type EnterpriseAnnexure = WccCertificateRecord['annexure'] & { enterprise?: WccEnterpriseDraft };

const STATUS_META: Record<string, { label: string; tone: string; approver: string }> = {
  draft: { label: 'Draft', tone: 'border-slate-200 bg-slate-50 text-slate-700', approver: 'Preparer' },
  pending_verification: { label: 'Technical Verification', tone: 'border-amber-200 bg-amber-50 text-amber-800', approver: 'Technical Verifier' },
  technical_verification: { label: 'Technical Verification', tone: 'border-amber-200 bg-amber-50 text-amber-800', approver: 'Technical Verifier' },
  commercial_verification: { label: 'Commercial Verification', tone: 'border-purple-200 bg-purple-50 text-purple-800', approver: 'Commercial Verifier' },
  pending_approval: { label: 'Pending Approval', tone: 'border-blue-200 bg-blue-50 text-blue-800', approver: 'Final Approver' },
  partially_approved: { label: 'Partially Approved', tone: 'border-cyan-200 bg-cyan-50 text-cyan-800', approver: 'Workflow' },
  approved: { label: 'Approved', tone: 'border-emerald-200 bg-emerald-50 text-emerald-800', approver: 'Completed' },
  needs_revision: { label: 'Changes Requested', tone: 'border-orange-200 bg-orange-50 text-orange-800', approver: 'Preparer' },
  changes_requested: { label: 'Changes Requested', tone: 'border-orange-200 bg-orange-50 text-orange-800', approver: 'Preparer' },
  rejected: { label: 'Rejected', tone: 'border-red-200 bg-red-50 text-red-800', approver: '—' },
  reversed: { label: 'Reversed', tone: 'border-red-200 bg-red-50 text-red-800', approver: '—' },
  cancelled: { label: 'Cancelled', tone: 'border-slate-200 bg-slate-100 text-slate-600', approver: '—' },
};

const money = (value: number) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const enterpriseOf = (record: WccCertificateRecord) => (record.annexure as EnterpriseAnnexure)?.enterprise;

type RegisterRow = {
  key: string; kind: 'draft' | 'certificate'; draft?: WccEnterpriseDraft; certificate?: WccCertificateRecord;
  number: string; revision: number; wccType: string; vendor: string; vendorId: string; order: string; project: string;
  category: string; periodFrom: string; periodTo: string; currentValue: number; cumulativeValue: number; status: string;
  preparedBy: string; currentApprover: string; invoiceStatus: string; createdAt: string;
};

export default function WccModule() {
  const [certificates, setCertificates] = useState<WccCertificateRecord[]>([]);
  const [drafts, setDrafts] = useState<WccEnterpriseDraft[]>([]);
  const [farms, setFarms] = useState<FarmOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [workspaceDraft, setWorkspaceDraft] = useState<WccEnterpriseDraft | null | undefined>(undefined);
  const [selectedRecord, setSelectedRecord] = useState<WccCertificateRecord | null>(null);
  const [recordMode, setRecordMode] = useState<'view' | 'revise'>('view');
  const [auditRow, setAuditRow] = useState<RegisterRow | null>(null);

  const refresh = () => setRefreshTick((value) => value + 1);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      fetch(`${BASE_URL}/admin_wcc_certificate/list`, { signal: controller.signal }).then((response) => response.json()).then((data) => data?.success && Array.isArray(data.certificates) ? data.certificates as WccCertificateRecord[] : []),
      fetch(`${BASE_URL}/farmer_managment/get_farms`, { signal: controller.signal }).then((response) => response.json()).then((data) => Array.isArray(data?.farms) ? data.farms as FarmOption[] : []),
    ]).then(([certificateRows, farmRows]) => { setCertificates(certificateRows); setFarms(farmRows); setDrafts(listLocalWccDrafts()); })
      .catch((error) => { if (!(error instanceof DOMException && error.name === 'AbortError')) toast.error('Failed to load WCC register'); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [refreshTick]);

  const rows = useMemo<RegisterRow[]>(() => {
    const draftRows = drafts.map((draft) => {
      const totals = calculateWccTotals(draft);
      return { key: draft.draftId, kind: 'draft' as const, draft, number: draft.draftId, revision: draft.revision, wccType: draft.header.wccType, vendor: draft.header.vendorName, vendorId: draft.header.vendorId, order: draft.header.referenceNumber, project: draft.header.projectSiteLabel || draft.header.site, category: draft.header.workCategory, periodFrom: draft.header.statementFrom, periodTo: draft.header.statementTo, currentValue: totals.gross, cumulativeValue: totals.cumulative, status: 'draft', preparedBy: draft.header.preparedByName, currentApprover: 'Preparer', invoiceStatus: 'Not Eligible', createdAt: draft.updatedAt };
    });
    const certificateRows = certificates.map((certificate) => {
      const enterprise = enterpriseOf(certificate);
      const totals = enterprise ? calculateWccTotals(enterprise) : null;
      const status = enterprise?.status && enterprise.status !== 'submitted' ? enterprise.status : certificate.status;
      return { key: certificate.certificate_id, kind: 'certificate' as const, certificate, number: certificate.certificate_id, revision: enterprise?.revision ?? certificate.revision_count ?? 0, wccType: enterprise?.header.wccType || 'partial', vendor: certificate.vendor_name, vendorId: certificate.vendor_id, order: certificate.order_number, project: enterprise?.header.projectSiteLabel || certificate.block_name, category: enterprise?.header.workCategory || 'cultivation', periodFrom: certificate.from_date, periodTo: certificate.to_date, currentValue: totals?.gross ?? certificate.total_certified_value, cumulativeValue: totals?.cumulative ?? certificate.total_certified_value, status, preparedBy: certificate.prepared_by?.name || enterprise?.header.preparedByName || '', currentApprover: STATUS_META[status]?.approver || 'Workflow', invoiceStatus: status === 'approved' ? 'Eligible for Matching' : 'Not Eligible', createdAt: certificate.created_at };
    });
    return [...draftRows, ...certificateRows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [certificates, drafts]);

  const vendors = useMemo(() => Array.from(new Set(rows.map((row) => row.vendor).filter(Boolean))).sort(), [rows]);
  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => (!normalized || [row.number, row.vendor, row.vendorId, row.order, row.project, row.preparedBy].some((value) => value.toLowerCase().includes(normalized))) && (statusFilter === 'all' || row.status === statusFilter) && (categoryFilter === 'all' || row.category === categoryFilter) && (typeFilter === 'all' || row.wccType === typeFilter) && (vendorFilter === 'all' || row.vendor === vendorFilter));
  }, [categoryFilter, query, rows, statusFilter, typeFilter, vendorFilter]);

  const counters = useMemo(() => ({
    draft: rows.filter((row) => row.status === 'draft').length,
    technical: rows.filter((row) => ['pending_verification', 'technical_verification', 'submitted'].includes(row.status)).length,
    commercial: rows.filter((row) => row.status === 'commercial_verification').length,
    approval: rows.filter((row) => row.status === 'pending_approval').length,
    approved: rows.filter((row) => row.status === 'approved').length,
    changes: rows.filter((row) => ['needs_revision', 'changes_requested'].includes(row.status)).length,
    rejected: rows.filter((row) => ['rejected', 'reversed'].includes(row.status)).length,
    value: rows.filter((row) => row.kind === 'certificate').reduce((sum, row) => sum + row.currentValue, 0),
  }), [rows]);

  const openCertificate = (certificate: WccCertificateRecord, mode: 'view' | 'revise') => { setSelectedRecord(certificate); setRecordMode(mode); };
  const removeDraft = (draft: WccEnterpriseDraft) => { if (!window.confirm(`Delete draft ${draft.draftId}?`)) return; deleteLocalWccDraft(draft.draftId); setDrafts(listLocalWccDrafts()); toast.success('Draft deleted'); };

  if (workspaceDraft !== undefined) {
    return <div className="min-h-screen bg-slate-50/70 p-4 sm:p-6"><WccWorkspace farms={farms} initialDraft={workspaceDraft || undefined} onClose={() => { setWorkspaceDraft(undefined); setDrafts(listLocalWccDrafts()); }} onSubmitted={() => { setWorkspaceDraft(undefined); refresh(); }} /></div>;
  }

  return <div className="min-h-screen space-y-6 bg-slate-50/70 p-4 font-sans sm:p-6 lg:p-8">
    <header className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-4"><div className="rounded-2xl bg-[#0D3A35] p-3.5 text-white shadow-[0_12px_28px_-12px_rgba(13,58,53,0.75)]"><FileCheck2 className="h-7 w-7" /></div><div><p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#0D3A35]">Procurement · Work Order</p><h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Work Completion Certificates</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Service completion, measurement, acceptance and payment-eligibility control for every contracted work category.</p></div></div><div className="flex gap-2"><button type="button" onClick={() => setWorkspaceDraft(null)} className="inline-flex items-center gap-2 rounded-xl bg-[#0D3A35] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#092e2a]"><Plus className="h-4 w-4" /> Create WCC</button><button type="button" onClick={refresh} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh</button></div></header>

    <section className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid-cols-2 lg:grid-cols-4">{[
      ['Draft', counters.draft], ['Technical Verification', counters.technical], ['Commercial Verification', counters.commercial], ['Pending Approval', counters.approval], ['Approved', counters.approved], ['Changes Requested', counters.changes], ['Rejected / Reversed', counters.rejected], ['Total Current Certified Value', money(counters.value)],
    ].map(([label, value], index) => <div key={String(label)} className={cn('px-5 py-4', index % 4 !== 0 && 'lg:border-l', index > 1 && 'sm:border-t', index > 3 && 'lg:border-t', 'border-slate-200')}><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className="mt-1 text-xl font-bold text-slate-900">{value}</p></div>)}</section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-5 py-4"><div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div><h2 className="text-base font-bold text-slate-900">WCC Service Entry Register</h2><p className="mt-0.5 text-xs text-slate-500">{filteredRows.length} of {rows.length} records · approved WCCs are eligible for invoice matching</p></div><div className="flex flex-wrap gap-2"><div className="relative min-w-[260px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="WCC, order, vendor, project or preparer" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-[#0D3A35]" /></div><FilterSelect value={statusFilter} onChange={setStatusFilter} options={[['all', 'All Statuses'], ...Object.entries(STATUS_META).map(([value, meta]) => [value, meta.label])]} /><FilterSelect value={categoryFilter} onChange={setCategoryFilter} options={[['all', 'All Work Categories'], ...WCC_WORK_TEMPLATES.map((item) => [item.id, item.label])]} /><FilterSelect value={typeFilter} onChange={setTypeFilter} options={[['all', 'All WCC Types'], ['partial', 'Partial'], ['milestone', 'Milestone'], ['periodic', 'Periodic'], ['final', 'Final'], ['rectification', 'Rectification']]} /><FilterSelect value={vendorFilter} onChange={setVendorFilter} options={[['all', 'All Vendors'], ...vendors.map((vendor) => [vendor, vendor])]} /></div></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1560px] table-fixed text-xs"><thead className="bg-[#0D3A35] text-white"><tr>{['WCC No. / Revision', 'WCC Type', 'Vendor', 'Reference Order', 'Project / Site', 'Work Category', 'Service Period', 'Current Value', 'Cumulative Value', 'Status', 'Current Approver', 'Invoice Status', 'Actions'].map((heading) => <th key={heading} className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.06em]">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={13} className="py-16 text-center text-slate-500">Loading WCC register…</td></tr> : filteredRows.length === 0 ? <tr><td colSpan={13} className="py-16 text-center"><FileCheck2 className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-2 font-semibold text-slate-600">No WCC records found</p></td></tr> : filteredRows.map((row) => { const meta = STATUS_META[row.status] || STATUS_META.draft; const category = WCC_WORK_TEMPLATES.find((item) => item.id === row.category)?.label || row.category || 'Legacy WCC'; return <tr key={`${row.kind}-${row.key}`} className="hover:bg-emerald-50/30"><td className="px-3 py-3 text-center"><p className="font-mono font-bold text-[#0D3A35]">{row.number}</p><p className="mt-0.5 text-[10px] text-slate-400">Revision {row.revision}</p></td><td className="px-3 text-center font-semibold capitalize text-slate-700">{row.wccType}</td><td className="px-3 text-left"><p className="line-clamp-2 font-semibold text-slate-800">{row.vendor || '—'}</p><p className="font-mono text-[10px] text-slate-400">{row.vendorId}</p></td><td className="px-3 text-center font-mono text-slate-700">{row.order || '—'}</td><td className="px-3 text-left text-slate-600"><p className="line-clamp-2">{row.project || '—'}</p></td><td className="px-3 text-left text-slate-600"><p className="line-clamp-2">{category}</p></td><td className="px-3 text-center text-slate-600">{formatDateDDMMYYYY(row.periodFrom)} to {formatDateDDMMYYYY(row.periodTo)}</td><td className="px-3 text-right font-semibold text-slate-800">{money(row.currentValue)}</td><td className="px-3 text-right font-semibold text-slate-800">{money(row.cumulativeValue)}</td><td className="px-3 text-center"><span className={cn('inline-flex rounded-full border px-2 py-1 text-[10px] font-bold', meta.tone)}>{meta.label}</span></td><td className="px-3 text-center text-slate-600">{row.currentApprover}</td><td className="px-3 text-center"><span className={cn('rounded-full px-2 py-1 text-[10px] font-bold', row.invoiceStatus.startsWith('Eligible') ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500')}>{row.invoiceStatus}</span></td><td className="px-3"><div className="flex items-center justify-center gap-1">{row.kind === 'draft' && row.draft ? <><Action title="Edit Draft" onClick={() => setWorkspaceDraft(row.draft)} icon={Pencil} /><Action title="Delete Draft" onClick={() => removeDraft(row.draft!)} icon={Trash2} danger /></> : row.certificate ? <><Action title="View / Download / Print" onClick={() => openCertificate(row.certificate!, 'view')} icon={Eye} />{['needs_revision', 'changes_requested'].includes(row.status) && <Action title="Revise" onClick={() => openCertificate(row.certificate!, 'revise')} icon={Pencil} />}<Action title="Download PDF" onClick={() => openCertificate(row.certificate!, 'view')} icon={Download} /></> : null}<Action title="View Audit Trail" onClick={() => setAuditRow(row)} icon={History} /></div></td></tr>; })}</tbody></table></div>
    </section>

    {selectedRecord && <WccCertificatePreview mode={recordMode} existingRecord={selectedRecord} onChanged={refresh} onClose={() => setSelectedRecord(null)} />}
    {auditRow && <AuditModal row={auditRow} onClose={() => setAuditRow(null)} />}
  </div>;
}

function FilterSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[][] }) { return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 max-w-[210px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none focus:border-[#0D3A35]">{options.map(([optionValue, label]) => <option key={`${optionValue}-${label}`} value={optionValue}>{label}</option>)}</select>; }
function Action({ title, onClick, icon: Icon, danger = false }: { title: string; onClick: () => void; icon: React.ElementType; danger?: boolean }) { return <button type="button" title={title} onClick={onClick} className={cn('inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition', danger ? 'border-red-100 text-red-500 hover:bg-red-50' : 'border-slate-200 text-[#0D3A35] hover:border-emerald-300 hover:bg-emerald-50')}><Icon className="h-3.5 w-3.5" /></button>; }
function AuditModal({ row, onClose }: { row: RegisterRow; onClose: () => void }) { const history = row.draft?.history || enterpriseOf(row.certificate as WccCertificateRecord)?.history || []; return <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"><div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between bg-[#0D3A35] px-5 py-4 text-white"><div><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">Audit & Status History</p><h3 className="mt-1 font-bold">{row.number}</h3></div><button onClick={onClose}><X className="h-5 w-5" /></button></div><div className="max-h-[65vh] overflow-y-auto p-5">{history.length === 0 ? <div className="py-12 text-center text-sm text-slate-400"><Clock3 className="mx-auto mb-2 h-8 w-8 text-slate-300" />No extended status history is available for this legacy record.</div> : <div className="space-y-3">{history.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-bold capitalize text-slate-800">{item.from || 'New'} → {item.to.replace(/_/g, ' ')}</p><p className="text-[11px] text-slate-400">{formatDateDDMMYYYY(item.at)}</p></div><p className="mt-1 text-xs text-slate-600">{item.userName} · {item.designation || '—'}</p><p className="mt-2 text-xs text-slate-500">{item.comments || 'No comments'}</p></div>)}</div>}</div></div></div>; }
