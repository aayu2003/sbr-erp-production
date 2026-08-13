import { useMemo } from 'react';
import { ClipboardCheck, FileText, PackageCheck, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/context/AuthContext';
import AdminOpsIndent from '@/pages/AdminOpsIndent';
import GrnApprovalInbox from '@/pages/GrnApprovalInbox';
import InspectionReportApprovals from '@/pages/InspectionReportApprovals';

const VERIFIER_TABS = [
  {
    value: 'indents',
    label: 'Indent Approval',
    icon: FileText,
    permissions: ['admin-ops-indents'],
    content: <AdminOpsIndent indentTypeFilter="PR" />,
  },
  {
    value: 'grn',
    label: 'GRN Approval',
    icon: PackageCheck,
    permissions: ['admin-grn-approval'],
    content: <GrnApprovalInbox stage="verification" />,
  },
  {
    value: 'inspection',
    label: 'Inspection Approval',
    icon: ClipboardCheck,
    permissions: ['admin-inspection-approval', 'admin-grn-approval', 'admin-ops-indents'],
    content: <InspectionReportApprovals stage="admin_ops" />,
  },
] as const;

export default function PurchaseVerifier() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasFullAccess = user?.id === 'sbr-admin' || user?.module_access?.includes('purchase-verifier');

  const tabs = useMemo(() => {
    if (hasFullAccess) return VERIFIER_TABS;
    const allowed = user?.module_access ?? [];
    return VERIFIER_TABS.filter((tab) => tab.permissions.some((permission) => allowed.includes(permission)));
  }, [hasFullAccess, user?.module_access]);

  const requestedTab = searchParams.get('tab');
  const activeTab = tabs.some((tab) => tab.value === requestedTab)
    ? requestedTab!
    : tabs[0]?.value ?? 'indents';

  const changeTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50/70">
      <header className="border-b border-slate-200 bg-white px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl bg-[#0D3A35] p-3.5 text-white shadow-sm">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.18em] text-emerald-700">Procurement · Purchase Order</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 md:text-3xl">Purchase Verifier</h1>
            <p className="mt-1 text-sm text-slate-500">Verify all purchase documents and requests from one approval workspace.</p>
          </div>
        </div>
      </header>

      {tabs.length > 0 ? (
        <Tabs value={activeTab} onValueChange={changeTab} className="w-full">
          <div className="overflow-x-auto border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
            <TabsList className="h-auto min-w-max justify-start rounded-none bg-transparent p-0">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="gap-2 rounded-none border-b-2 border-transparent px-4 py-4 font-semibold data-[state=active]:border-[#0D3A35] data-[state=active]:bg-transparent data-[state=active]:text-[#0D3A35] data-[state=active]:shadow-none"
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {tabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="m-0 focus-visible:ring-0">
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="p-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            You do not currently have access to a purchase verification queue.
          </div>
        </div>
      )}
    </div>
  );
}
