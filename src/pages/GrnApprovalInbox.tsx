import { useState, useEffect, useCallback } from 'react';
import { PackageCheck, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { getPendingGrns, type GRNRecord } from '@/lib/grnApi';
import { GrnReviewModal } from '@/components/grn/GrnReviewModal';

export interface GrnApprovalInboxProps {
  stage: 'verification' | 'approval';
}

const STAGE_COPY = {
  verification: {
    title: 'GRN Verification',
    description: 'GRNs forwarded by preparers, awaiting your verification.',
  },
  approval: {
    title: 'GRN Approval',
    description: 'Verified GRNs awaiting final director approval.',
  },
} as const;

export function GrnApprovalInbox({ stage }: GrnApprovalInboxProps) {
  const [grns, setGrns] = useState<GRNRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<GRNRecord | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const copy = STAGE_COPY[stage];

  const refresh = useCallback(() => {
    setIsLoading(true);
    getPendingGrns(stage)
      .then(setGrns)
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to load GRNs'))
      .finally(() => setIsLoading(false));
  }, [stage]);

  useEffect(() => { refresh(); }, [refresh, refreshTick]);

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-2xl font-bold flex items-center gap-2">
            <PackageCheck className="h-6 w-6" /> {copy.title}
          </div>
          <div className="text-xs text-muted-foreground">{copy.description}</div>
        </div>
        <Button type="button" variant="outline" onClick={() => setRefreshTick((x) => x + 1)}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>GRN No</TableHead>
              <TableHead>PO No</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Prepared By</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grns.map((g) => {
              const total = g.items.reduce((s, it) => s + (it.totalGrnValue || 0), 0);
              return (
                <TableRow key={g.grnNo}>
                  <TableCell className="font-medium">{g.grnNo}</TableCell>
                  <TableCell>{g.poNo}</TableCell>
                  <TableCell>{g.vendorName}</TableCell>
                  <TableCell>
                    {g.preparedBy?.name || '—'}
                    {(g.revisionCount ?? 0) > 0 && (
                      <span className="ml-1 text-orange-500 text-xs font-semibold">(rev {g.revisionCount})</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">₹{total.toLocaleString('en-IN')}</TableCell>
                  <TableCell className="text-right">
                    <Button type="button" size="sm" variant="outline" onClick={() => setSelected(g)}>
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}

            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">
                  Loading…
                </TableCell>
              </TableRow>
            ) : grns.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">
                  Nothing pending.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {selected && (
        <GrnReviewModal
          grn={selected}
          onClose={() => setSelected(null)}
          onChanged={() => setRefreshTick((x) => x + 1)}
        />
      )}
    </div>
  );
}

export default GrnApprovalInbox;
