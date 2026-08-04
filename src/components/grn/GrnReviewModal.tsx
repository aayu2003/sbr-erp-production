import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { useAuth } from '@/context/AuthContext';
import { actionGrn, type GRNRecord } from '@/lib/grnApi';
import { GrnPrint } from './GrnPrint';
import { GrnDocumentPreview } from './GrnDocumentPreview';

export interface GrnReviewModalProps {
  grn: GRNRecord;
  onClose: () => void;
  onChanged: () => void;
}

export function GrnReviewModal({ grn, onClose, onChanged }: GrnReviewModalProps) {
  const { user } = useAuth();
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const nextAction: 'verify' | 'approve' = grn.status === 'pending_verification' ? 'verify' : 'approve';

  const handle = async (action: 'verify' | 'approve' | 'reject') => {
    if (!user?.id || !user?.name) { toast.error('You must be logged in.'); return; }
    if (action === 'reject' && !showReject) { setShowReject(true); return; }
    if (action === 'reject' && !reason.trim()) { toast.error('Please provide a rejection reason.'); return; }

    setBusy(true);
    try {
      await actionGrn(
        grn.grnNo,
        action,
        { staffId: user.id, name: user.name, designation: user.designation || '', timestamp: new Date().toISOString() },
        action === 'reject' ? reason.trim() : undefined,
      );
      toast.success(action === 'verify' ? 'GRN verified' : action === 'approve' ? 'GRN approved' : 'GRN sent back for revision');
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {grn.grnNo}
            <span className="text-xs font-normal text-muted-foreground">· {grn.vendorName}</span>
          </DialogTitle>
        </DialogHeader>

        {grn.rejection && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            <span className="font-bold">Previously rejected</span> by {grn.rejection.by.name}: {grn.rejection.reason}
          </div>
        )}

        <GrnDocumentPreview grn={grn} />

        {showReject && (
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for rejection…"
            autoFocus
          />
        )}

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <GrnPrint grn={grn} />
          </div>
          <div className="flex items-center gap-2">
            {showReject && (
              <Button type="button" variant="outline" onClick={() => { setShowReject(false); setReason(''); }}>
                Cancel
              </Button>
            )}
            <Button type="button" variant="outline" className="text-red-600 border-red-200" disabled={busy} onClick={() => handle('reject')}>
              {showReject ? 'Confirm Reject' : 'Reject'}
            </Button>
            {!showReject && (
              <Button type="button" disabled={busy} onClick={() => handle(nextAction)}>
                {nextAction === 'verify' ? 'Verify' : 'Approve'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default GrnReviewModal;
