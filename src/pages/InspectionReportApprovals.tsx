import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Eye, Search, ShieldCheck, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/context/AuthContext';
import { CertificatePreview } from '@/pages/InspectionReport';
import {
  INSPECTION_REPORTS_CHANGED_EVENT,
  listInspectionReports,
  reviewInspectionReport,
  type InspectionReportRecord,
} from '@/lib/inspectionReportStore';
import { readUserProfile } from '@/lib/signatureDiary';

type Stage = 'admin_ops' | 'finance_admin_ops';

const labels = {
  admin_ops: { title: 'Inspection Report Approval', eyebrow: 'Admin Ops', pending: 'pending_admin_ops' as const, next: 'Finance Admin Ops' },
  finance_admin_ops: { title: 'Inspection Report Final Approval', eyebrow: 'Finance Admin Ops', pending: 'pending_finance_admin_ops' as const, next: 'Approved' },
};

const statusText = {
  draft: 'Draft', pending_admin_ops: 'Pending Admin Ops', pending_finance_admin_ops: 'Pending Finance Admin Ops', approved: 'Approved', rejected: 'Rejected',
};

export default function InspectionReportApprovals({ stage }: { stage: Stage }) {
  const { user } = useAuth();
  const config = labels[stage];
  const [reports, setReports] = useState<InspectionReportRecord[]>(() => listInspectionReports());
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<'pending' | 'records'>('pending');
  const [selected, setSelected] = useState<InspectionReportRecord | null>(null);
  const [remarks, setRemarks] = useState('');

  const refresh = () => setReports(listInspectionReports());
  useEffect(() => {
    window.addEventListener('storage', refresh);
    window.addEventListener(INSPECTION_REPORTS_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(INSPECTION_REPORTS_CHANGED_EVENT, refresh);
    };
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter(report => {
      const belongsToStage = viewMode === 'pending'
        ? report.status === config.pending
        : stage === 'admin_ops' ? Boolean(report.adminOpsApproval) : Boolean(report.financeAdminOpsApproval);
      return belongsToStage && (!q || [report.certificateNo, report.grnNo, report.poNo, report.vendorName].some(value => value.toLowerCase().includes(q)));
    });
  }, [config.pending, query, reports, stage, viewMode]);

  const pendingCount = reports.filter(report => report.status === config.pending).length;
  const recordCount = reports.filter(report => stage === 'admin_ops' ? Boolean(report.adminOpsApproval) : Boolean(report.financeAdminOpsApproval)).length;
  const canReviewSelected = selected?.status === config.pending;

  const act = (decision: 'approve' | 'reject') => {
    if (!selected) return;
    if (decision === 'reject' && !remarks.trim()) { toast.error('Enter rejection remarks'); return; }
    const profile = readUserProfile();
    const name = user?.name || profile.name;
    if (!name) { toast.error('Logged-in employee details are unavailable'); return; }
    try {
      reviewInspectionReport(selected.id, stage, decision, {
        employeeId: user?.id || user?.username || name,
        name,
        designation: user?.designation || profile.role || config.eyebrow,
      }, remarks);
      toast.success(decision === 'approve'
        ? stage === 'admin_ops' ? `${selected.certificateNo} forwarded to Finance Admin Ops` : `${selected.certificateNo} finally approved`
        : `${selected.certificateNo} rejected`);
      setSelected(null);
      setRemarks('');
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update approval');
    }
  };

  return <div className="min-h-screen space-y-6 bg-slate-50/70 p-4 sm:p-6 lg:p-8">
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="flex items-center gap-4"><div className="rounded-2xl bg-[#0D3A35] p-3.5 text-white"><ShieldCheck className="h-7 w-7" /></div><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#0D3A35]">{config.eyebrow}</p><h1 className="mt-1 text-2xl font-semibold text-slate-900 md:text-3xl">{config.title}</h1><p className="mt-1 text-sm text-slate-500">Review inspection certificates and forward them through the approval workflow.</p></div></div>
      <div className="relative w-full md:w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search certificate, GRN, PO or vendor" className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#0D3A35]"/></div>
    </div>
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Pending Review</p><p className="mt-2 text-3xl font-extrabold text-slate-900">{pendingCount}</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Approved at this stage</p><p className="mt-2 text-3xl font-extrabold text-emerald-700">{reports.filter(report => stage === 'admin_ops' ? Boolean(report.adminOpsApproval) && report.status !== 'rejected' : report.status === 'approved').length}</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Forwarded To</p><p className="mt-2 text-lg font-extrabold text-[#0D3A35]">{config.next}</p></div>
    </div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-900">{viewMode === 'pending' ? 'Pending Inspection Certificates' : 'Approval Records'}</h2><p className="mt-1 text-xs text-slate-500">{viewMode === 'pending' ? 'Reports awaiting your action.' : 'All reports processed at this approval stage.'}</p></div><div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1"><button onClick={() => setViewMode('pending')} className={`rounded-lg px-4 py-2 text-xs font-bold transition ${viewMode === 'pending' ? 'bg-[#0D3A35] text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>Pending ({pendingCount})</button><button onClick={() => setViewMode('records')} className={`rounded-lg px-4 py-2 text-xs font-bold transition ${viewMode === 'records' ? 'bg-[#0D3A35] text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>Records ({recordCount})</button></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-sm"><thead className="bg-[#0D3A35] text-white"><tr>{['Certificate No.', 'GRN No.', 'PO Number', 'Vendor', 'Prepared By', 'Items', 'Status', 'Review'].map(head => <th key={head} className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wide">{head}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">
        {visible.length ? visible.map(report => <tr key={report.id} className="hover:bg-emerald-50/30"><td className="px-4 py-3 text-center font-mono text-xs font-bold text-[#0D3A35]">{report.certificateNo}</td><td className="px-4 py-3 text-center font-mono text-xs">{report.grnNo}</td><td className="px-4 py-3 text-center font-mono text-xs">{report.poNo || '-'}</td><td className="px-4 py-3 font-semibold">{report.vendorName}</td><td className="px-4 py-3 text-center">{report.preparedByName}</td><td className="px-4 py-3 text-center">{report.items.length}</td><td className="px-4 py-3 text-center"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${report.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : report.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{statusText[report.status]}</span></td><td className="px-4 py-3 text-center"><button onClick={() => { setSelected(report); setRemarks(''); }} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D3A35] px-3 py-2 text-xs font-bold text-white"><Eye className="h-3.5 w-3.5"/>{viewMode === 'pending' ? 'Review' : 'View'}</button></td></tr>) : <tr><td colSpan={8} className="px-6 py-16 text-center"><ClipboardCheck className="mx-auto h-9 w-9 text-slate-300"/><p className="mt-3 font-semibold text-slate-600">{viewMode === 'pending' ? 'No reports pending approval' : 'No approval records found'}</p></td></tr>}
      </tbody></table></div>
    </section>
    {selected && <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between bg-[#0D3A35] px-5 py-4 text-white"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-200">{config.eyebrow} {canReviewSelected ? 'Review' : 'Record'}</p><h2 className="mt-1 text-lg font-bold">{selected.certificateNo}</h2></div><button onClick={() => setSelected(null)} className="rounded-lg p-2 hover:bg-white/10"><X className="h-5 w-5"/></button></div><div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-5"><CertificatePreview report={selected}/></div>{canReviewSelected ? <div className="border-t border-slate-200 bg-white p-5"><label className="text-xs font-bold text-slate-600">Approval / rejection remarks<textarea value={remarks} onChange={event => setRemarks(event.target.value)} rows={2} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0D3A35]" placeholder="Add remarks (required for rejection)"/></label><div className="mt-4 flex justify-end gap-2"><button onClick={() => act('reject')} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50"><XCircle className="h-4 w-4"/>Reject</button><button onClick={() => act('approve')} className="inline-flex items-center gap-2 rounded-xl bg-[#0D3A35] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#092e2a]"><CheckCircle2 className="h-4 w-4"/>{stage === 'admin_ops' ? 'Approve & Forward' : 'Final Approve'}</button></div></div> : <div className="flex justify-end border-t border-slate-200 bg-white px-5 py-4"><button onClick={() => setSelected(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Close</button></div>}</div></div>}
  </div>;
}
