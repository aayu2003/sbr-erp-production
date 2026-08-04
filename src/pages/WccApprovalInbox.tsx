import { useState, useEffect, useCallback } from 'react';
import { FileCheck, RefreshCw, User, Calendar, Layers } from 'lucide-react';
import getBaseUrl from '@/lib/config';
import WccCertificatePreview, { type WccCertificateRecord } from '@/components/cultivation/WccCertificatePreview';

const BASE_URL = getBaseUrl().replace(/\/$/, '');

const formatDate = (d?: string) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

export interface WccApprovalInboxProps {
  stage: 'verification' | 'approval';
}

const STAGE_COPY = {
  verification: {
    title: 'WCC Verification',
    description: 'Certificates submitted by preparers, awaiting your verification.',
    empty: 'No certificates are currently awaiting verification.',
  },
  approval: {
    title: 'WCC Approval',
    description: 'Verified certificates awaiting final director approval.',
    empty: 'No certificates are currently awaiting approval.',
  },
} as const;

const WccApprovalInbox = ({ stage }: WccApprovalInboxProps) => {
  const [certificates, setCertificates] = useState<WccCertificateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WccCertificateRecord | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const copy = STAGE_COPY[stage];

  const fetchPending = useCallback(() => {
    setLoading(true);
    fetch(`${BASE_URL}/admin_wcc_certificate/get_pending/${stage}`)
      .then((res) => res.json())
      .then((data: { success?: boolean; certificates?: WccCertificateRecord[] }) => {
        setCertificates(data?.success && Array.isArray(data.certificates) ? data.certificates : []);
      })
      .catch(() => setCertificates([]))
      .finally(() => setLoading(false));
  }, [stage]);

  useEffect(() => { fetchPending(); }, [fetchPending, refreshKey]);

  return (
    <div className="p-8 space-y-6 animate-in fade-in duration-300 min-h-screen bg-gray-50/50 font-sans">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-100 shadow-sm">
            <FileCheck className="w-7 h-7 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">{copy.title}</h1>
            <p className="mt-1 text-sm text-slate-500 max-w-lg">{copy.description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="self-start md:self-auto inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-gray-400" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-xl border border-gray-100 bg-white animate-pulse" />
          ))}
        </div>
      ) : certificates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center bg-white rounded-xl border border-gray-100">
          <FileCheck className="w-10 h-10 text-gray-200" />
          <p className="text-sm font-semibold text-slate-600">Nothing pending</p>
          <p className="text-xs text-slate-400 max-w-xs">{copy.empty}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {certificates.map((cert) => (
            <button
              key={cert.certificate_id}
              type="button"
              onClick={() => setSelected(cert)}
              className="text-left bg-white border border-gray-200 rounded-xl shadow-sm p-4 hover:border-indigo-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{cert.vendor_name}</p>
                  <p className="text-[11px] text-slate-400 font-mono truncate">{cert.certificate_id}</p>
                </div>
                <span className="shrink-0 text-sm font-bold text-slate-800">
                  ₹{(cert.total_certified_value || 0).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(cert.from_date)} – {formatDate(cert.to_date)}</span>
                {cert.block_name && <span className="flex items-center gap-1"><Layers className="w-3 h-3" />{cert.block_name}</span>}
              </div>
              <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-400">
                <User className="w-3 h-3" /> Prepared by {cert.prepared_by?.name || '—'}
                {cert.revision_count > 0 && <span className="ml-1 text-orange-500 font-semibold">(revision {cert.revision_count})</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <WccCertificatePreview
          mode="review"
          existingRecord={selected}
          onChanged={() => setRefreshKey((k) => k + 1)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
};

export default WccApprovalInbox;
