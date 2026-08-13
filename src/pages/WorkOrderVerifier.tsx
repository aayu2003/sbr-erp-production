import { useMemo } from 'react';
import { FileCheck, FileText, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/context/AuthContext';
import AdminOpsIndent from '@/pages/AdminOpsIndent';
import WccApprovalInbox from '@/pages/WccApprovalInbox';

const TABS = [
  {
    value: 'requisitions',
    label: 'Service Requisition',
    icon: FileText,
    permissions: ['admin-ops-indents', 'work-verifier'],
    content: <AdminOpsIndent indentTypeFilter="SPR" />,
  },
  {
    value: 'wcc',
    label: 'WCC Verification',
    icon: FileCheck,
    permissions: ['admin-wcc-approval', 'work-verifier'],
    content: <WccApprovalInbox stage="verification" />,
  },
] as const;

export default function WorkOrderVerifier() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const fullAccess = user?.id === 'sbr-admin' || user?.module_access?.includes('work-verifier') || user?.module_access?.includes('work-order');
  const tabs = useMemo(() => {
    if (fullAccess) return TABS;
    const allowed = user?.module_access ?? [];
    return TABS.filter((tab) => tab.permissions.some((permission) => allowed.includes(permission)));
  }, [fullAccess, user?.module_access]);
  const requested = params.get('tab');
  const active = tabs.some((tab) => tab.value === requested) ? requested! : tabs[0]?.value ?? 'requisitions';

  return <div className="min-h-screen bg-slate-50/70">
    <header className="border-b border-slate-200 bg-white px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-center gap-4"><div className="rounded-2xl bg-[#0D3A35] p-3.5 text-white"><ShieldCheck className="h-7 w-7" /></div><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-emerald-700">Procurement · Work Order</p><h1 className="mt-1 text-2xl font-semibold text-slate-900 md:text-3xl">Work Verifier</h1><p className="mt-1 text-sm text-slate-500">Verify service requisitions and work-completion certificates independently from purchase orders.</p></div></div>
    </header>
    {tabs.length ? <Tabs value={active} onValueChange={(value) => { const next = new URLSearchParams(params); next.set('tab', value); setParams(next, { replace: true }); }}>
      <div className="overflow-x-auto border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8"><TabsList className="h-auto min-w-max justify-start rounded-none bg-transparent p-0">{tabs.map((tab) => { const Icon = tab.icon; return <TabsTrigger key={tab.value} value={tab.value} className="gap-2 rounded-none border-b-2 border-transparent px-4 py-4 font-semibold data-[state=active]:border-[#0D3A35] data-[state=active]:bg-transparent data-[state=active]:text-[#0D3A35] data-[state=active]:shadow-none"><Icon className="h-4 w-4" />{tab.label}</TabsTrigger>; })}</TabsList></div>
      {tabs.map((tab) => <TabsContent key={tab.value} value={tab.value} className="m-0 focus-visible:ring-0">{tab.content}</TabsContent>)}
    </Tabs> : <div className="p-8"><div className="rounded-2xl border bg-white p-10 text-center text-sm text-slate-500">You do not currently have access to a work verification queue.</div></div>}
  </div>;
}
