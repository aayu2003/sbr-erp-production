import { useEffect, useState } from 'react';
import { X, FileCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import getBaseUrl from '@/lib/config';
import { getGrnsByOrder, type GRNRecord } from '@/lib/grnApi';
import { buildGrnPdfBlob } from '@/lib/grnPdf';
import {
  buildCertificatePdfBlob,
  wccParamsFromRecord,
  type WccCertificateRecord,
} from '@/components/cultivation/WccCertificatePreview';

const safeTrim = (v: unknown) => String(v ?? '').trim();

export interface GenerateFromRecordPopupProps {
  orderNumber: string;
  orderType: string; // 'PR' (goods → GRN) or 'SPR' (services → WCC certificate)
  stepLabel: string;
  onClose: () => void;
  /** Wired by the caller to the existing upload+link-to-step flow. */
  onGenerate: (file: File) => Promise<void>;
}

export function GenerateFromRecordPopup({ orderNumber, orderType, stepLabel, onClose, onGenerate }: GenerateFromRecordPopupProps) {
  const isGrn = safeTrim(orderType).toUpperCase() === 'PR';

  const [isLoading, setIsLoading] = useState(true);
  const [grnRecords, setGrnRecords] = useState<GRNRecord[]>([]);
  const [wccRecords, setWccRecords] = useState<WccCertificateRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    (async () => {
      try {
        if (isGrn) {
          const grns = await getGrnsByOrder(orderNumber);
          if (mounted) setGrnRecords(grns.filter((g) => g.status === 'approved'));
        } else {
          const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
          const res = await fetch(`${baseUrl}/admin_wcc_certificate/get_by_order/${encodeURIComponent(orderNumber)}`);
          const data = await res.json().catch(() => null);
          const certs: WccCertificateRecord[] = data?.success && Array.isArray(data.certificates) ? data.certificates : [];
          if (mounted) setWccRecords(certs.filter((c) => c.status === 'approved'));
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load records');
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [orderNumber, isGrn]);

  const handleGenerate = async () => {
    if (!selectedId) { toast.error(isGrn ? 'Select a GRN' : 'Select a certificate'); return; }
    setGenerating(true);
    try {
      let file: File;
      if (isGrn) {
        const grn = grnRecords.find((g) => g.grnNo === selectedId);
        if (!grn) throw new Error('GRN not found');
        const { blob, filename } = await buildGrnPdfBlob(grn);
        file = new File([blob], filename, { type: 'application/pdf' });
      } else {
        const cert = wccRecords.find((c) => c.certificate_id === selectedId);
        if (!cert) throw new Error('Certificate not found');
        const { blob, filename } = await buildCertificatePdfBlob(wccParamsFromRecord(cert));
        file = new File([blob], filename, { type: 'application/pdf' });
      }
      await onGenerate(file);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate document');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <div className="font-semibold text-sm">Generate from {isGrn ? 'GRN' : 'WCC Certificate'}</div>
            <div className="text-xs text-muted-foreground mt-0.5">For step: {stepLabel}</div>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <div className="text-xs text-muted-foreground">Order Number</div>
            <div className="text-sm font-semibold">{orderNumber}</div>
          </div>

          {isLoading ? (
            <div className="py-8 text-xs text-center text-muted-foreground">Loading approved {isGrn ? 'GRNs' : 'certificates'}…</div>
          ) : isGrn && grnRecords.length === 0 ? (
            <div className="py-8 text-xs text-center text-muted-foreground">No approved GRNs found for this order yet.</div>
          ) : !isGrn && wccRecords.length === 0 ? (
            <div className="py-8 text-xs text-center text-muted-foreground">No approved WCC certificates found for this order yet.</div>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {isGrn ? grnRecords.map((g) => {
                const total = g.items.reduce((s, it) => s + (it.totalGrnValue || 0), 0);
                const checked = selectedId === g.grnNo;
                return (
                  <button
                    key={g.grnNo}
                    type="button"
                    onClick={() => setSelectedId(g.grnNo)}
                    className={`w-full text-left px-3 py-2.5 transition-colors ${checked ? 'bg-muted' : 'hover:bg-muted/50'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{g.grnNo}</span>
                      <span className="text-xs text-muted-foreground">{g.grnDate}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">₹{total.toLocaleString('en-IN')} · {g.items.length} item{g.items.length !== 1 ? 's' : ''}</div>
                  </button>
                );
              }) : wccRecords.map((c) => {
                const checked = selectedId === c.certificate_id;
                return (
                  <button
                    key={c.certificate_id}
                    type="button"
                    onClick={() => setSelectedId(c.certificate_id)}
                    className={`w-full text-left px-3 py-2.5 transition-colors ${checked ? 'bg-muted' : 'hover:bg-muted/50'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{c.certificate_id}</span>
                      <span className="text-xs text-muted-foreground">{c.from_date} – {c.to_date}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">₹{(c.total_certified_value || 0).toLocaleString('en-IN')}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={generating}>Cancel</Button>
          <Button onClick={handleGenerate} className="gap-2" disabled={generating || !selectedId}>
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
            {generating ? 'Generating…' : 'Generate & Attach'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default GenerateFromRecordPopup;
