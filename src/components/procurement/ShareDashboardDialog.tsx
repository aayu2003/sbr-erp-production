import { useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  GUEST_SCOPE_PROCUREMENT,
  createGuestLink,
  guestShareUrl,
  listGuestLinks,
  revokeGuestLink,
  type GuestLink,
} from '@/lib/guestApi';

type Props = {
  open: boolean;
  onClose: () => void;
  createdBy?: string;
};

const ShareDashboardDialog = ({ open, onClose, createdBy }: Props) => {
  const [links, setLinks] = useState<GuestLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setLinks(await listGuestLinks(GUEST_SCOPE_PROCUREMENT));
    } catch {
      toast.error('Could not load existing links');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setLabel('');
      setCopied(null);
      void load();
    }
  }, [open]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createGuestLink(GUEST_SCOPE_PROCUREMENT, label.trim() || undefined, createdBy);
      setLabel('');
      toast.success('Share link created');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create link');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(guestShareUrl(token));
      setCopied(token);
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 1500);
    } catch {
      toast.error('Copy failed — select and copy manually');
    }
  };

  const handleRevoke = async (token: string) => {
    try {
      await revokeGuestLink(token);
      toast.success('Link revoked');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not revoke link');
    }
  };

  const active = links.filter((l) => !l.revoked);
  const revoked = links.filter((l) => l.revoked);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share the Procurement Dashboard</DialogTitle>
          <DialogDescription>
            Anyone with a link can view this dashboard read-only, without signing in. No other
            module opens. Revoke a link any time to kill it instantly.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Label (optional — e.g. "Auditor", "Vendor review")
            </label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Who is this link for?"
              className="h-10"
            />
          </div>
          <Button onClick={handleCreate} disabled={creating} className="h-10 shrink-0 gap-1.5">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create link
          </Button>
        </div>

        <div className="mt-1 max-h-[320px] space-y-2 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm font-semibold">Loading links…</span>
            </div>
          ) : links.length === 0 ? (
            <p className="py-8 text-center text-sm font-medium text-slate-400">
              No share links yet.
            </p>
          ) : (
            <>
              {active.map((l) => (
                <div key={l.token} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate text-sm font-semibold text-slate-700">
                      {l.label || 'Untitled link'}
                    </span>
                    <div className="ml-auto flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => handleCopy(l.token)}
                        title="Copy link"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                      >
                        {copied === l.token ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevoke(l.token)}
                        title="Revoke link"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-1.5 truncate rounded bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-500">
                    {guestShareUrl(l.token)}
                  </p>
                  {l.created_by && (
                    <p className="mt-1 text-[11px] font-medium text-slate-400">
                      Created by {l.created_by}
                    </p>
                  )}
                </div>
              ))}

              {revoked.length > 0 && (
                <details className="pt-1">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-400">
                    {revoked.length} revoked link{revoked.length > 1 ? 's' : ''}
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {revoked.map((l) => (
                      <div
                        key={l.token}
                        className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-400 line-through"
                      >
                        <Link2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">{l.label || 'Untitled link'}</span>
                        <span className="ml-auto shrink-0 no-underline">revoked</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareDashboardDialog;
