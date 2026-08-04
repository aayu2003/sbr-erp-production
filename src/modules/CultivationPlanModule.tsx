import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Plus } from 'lucide-react';
import getBaseUrl from '@/lib/config';
import { toast } from 'sonner';
import { formatDateDDMMYYYY } from '@/lib/dateFormat';

type ApiCultivationPlanItem = {
  plan_id: string;
  block_id: string;
  date_mapping: Array<{
    index: number;
    activity: string;
    date: string[];
    work_quantity?: number;
  }>;
};

type FetchCultivationPlansResponse = {
  plan: Record<string, ApiCultivationPlanItem>;
};

type UiCultivationPlanRow = {
  id: string; // API key (calendar/entry id)
  plan_id: string;
  block_id: string;
  activities_count: number;
  total_work_quantity: number;
  start_date: string;
  end_date: string;
};

const getPlanDateRange = (mapping: ApiCultivationPlanItem['date_mapping']) => {
  const dates: string[] = [];
  for (const item of mapping || []) {
    const arr = Array.isArray(item?.date) ? item.date : [];
    for (const d of arr) {
      const ds = String(d || '').slice(0, 10);
      if (ds) dates.push(ds);
    }
  }
  if (dates.length === 0) return { start: '—', end: '—' };
  dates.sort();
  return { start: dates[0], end: dates[dates.length - 1] };
};

export default function CultivationPlanModule() {
  const [plans, setPlans] = useState<UiCultivationPlanRow[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const base = getBaseUrl().replace(/\/$/, '');
    const url = `${base}/admin_cultivation/fetch_cultivation_plans`;
    let cancelled = false;

    const load = async () => {
      setIsLoadingPlans(true);
      try {
        const res = await fetch(url);
        const data: any = await res.json().catch(() => null);
        if (!res.ok) {
          toast.error(data?.message || 'Failed to fetch cultivation plans');
          if (!cancelled) setPlans([]);
          return;
        }

        const src: FetchCultivationPlansResponse | null = data && typeof data === 'object' ? data : null;
        const entries = Object.entries(src?.plan || {});
        const mapped: UiCultivationPlanRow[] = entries.map(([id, p]) => {
          const mapping = Array.isArray(p?.date_mapping) ? p.date_mapping : [];
          const range = getPlanDateRange(mapping);
          const totalWorkQty = mapping.reduce((sum, x) => sum + (Number(x?.work_quantity) || 0), 0);
          return {
            id,
            plan_id: String(p?.plan_id || ''),
            block_id: String(p?.block_id || ''),
            activities_count: mapping.length,
            total_work_quantity: Number.isFinite(totalWorkQty) ? totalWorkQty : 0,
            start_date: range.start,
            end_date: range.end,
          };
        });

        if (!cancelled) setPlans(mapped);
      } catch (e: any) {
        toast.error(e?.message || 'Failed to fetch cultivation plans');
        if (!cancelled) setPlans([]);
      } finally {
        if (!cancelled) setIsLoadingPlans(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalPlans = plans.length;
  const uniqueBlocks = useMemo(() => new Set(plans.map((p) => p.block_id).filter(Boolean)).size, [plans]);

  const handleDeletePlan = async (blockId: string) => {
    const block_id = String(blockId || '').trim();
    if (!block_id) {
      toast.error('block_id not available for this plan');
      return;
    }
    if (deletingBlockId) return;

    setDeletingBlockId(block_id);
    try {
      const base = getBaseUrl().replace(/\/$/, '');
      const res = await fetch(`${base}/admin_cultivation/delete_cultivation_plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block_id }),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.message || 'Failed to delete cultivation plan');
        return;
      }
      if (data?.status !== 'success') {
        toast.error(data?.message || 'Delete did not return success');
        return;
      }

      toast.success('Plan deleted successfully');
      window.location.reload();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete cultivation plan');
    } finally {
      setDeletingBlockId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-1 text-foreground">Cultivation Plan</h1>
          <p className="text-muted-foreground">Click on <span className='font-semibold'>+ Add planer</span> to create new plan</p>
        </div>
        <Button className="gap-2" size="lg" onClick={() => navigate("/cultivation-plan/create")}>
          <Plus className="h-5 w-5" />
          Add Planer
        </Button>
      </div>
      <div className="flex flex-col md:flex-row gap-6 mb-8">
        <Card className="flex-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-foreground">Total Plans</CardTitle>
            <CardDescription>All cultivation plans</CardDescription>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-foreground">{totalPlans}</span>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-foreground">Blocks Covered</CardTitle>
            <CardDescription>Unique blocks with plans</CardDescription>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-foreground">{uniqueBlocks}</span>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="p-4 border-b">
          <CardTitle className="text-lg font-semibold text-foreground">Plan List</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-20">Plan No.</TableHead>
                <TableHead>Block ID</TableHead>
                <TableHead>Master Plan ID</TableHead>
                <TableHead>Activities</TableHead>
                <TableHead>Date Range</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-40">Cultivation Calendar</TableHead>
                <TableHead className="w-40">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingPlans ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    Loading plans…
                  </TableCell>
                </TableRow>
              ) : plans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No plans found.
                  </TableCell>
                </TableRow>
              ) : (
                plans.map((plan, idx) => (
                  <TableRow key={plan.id} className="hover:bg-muted transition">
                    <TableCell className="font-semibold text-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{plan.block_id || '—'}</TableCell>
                    <TableCell className="text-foreground">{plan.plan_id || '—'}</TableCell>
                    <TableCell className="text-foreground font-semibold">{plan.activities_count}</TableCell>
                    <TableCell className="text-foreground">
                      {formatDateDDMMYYYY(plan.start_date)} → {formatDateDDMMYYYY(plan.end_date)}
                    </TableCell>
                    <TableCell>
                      <span title="Live" className="inline-flex items-center gap-1 text-green-600 font-bold">
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" className="animate-pulse"><circle cx="10" cy="10" r="7" /></svg>
                        Live
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="View Calendar"
                        onClick={() => navigate('/cultivation-calendar')}
                      >
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="14" height="13" rx="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="17" y2="10" />
                        </svg>
                      </Button>
                    </TableCell>
                    <TableCell className="flex gap-2">
                      <Button variant="ghost" size="icon" title="Edit" disabled>
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19.5 2 20l.5-5L16.5 3.5z" /></svg>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete"
                        onClick={() => handleDeletePlan(plan.block_id)}
                        disabled={isLoadingPlans || deletingBlockId === plan.block_id}
                      >
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m5 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
