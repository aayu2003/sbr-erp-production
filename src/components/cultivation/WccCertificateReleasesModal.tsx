import { useState, useEffect, useMemo } from 'react';
import { X, Search, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';
import WccCertificatePreview, { type WccCertificateRecord, STATUS_LABEL, STATUS_TONE } from './WccCertificatePreview';

const BASE_URL = getBaseUrl().replace(/\/$/, '');

const formatDate = (d?: string) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

export interface WccCertificateReleasesModalProps {
  onClose: () => void;
}

const WccCertificateReleasesModal = ({ onClose }: WccCertificateReleasesModalProps) => {
  const [certificates, setCertificates] = useState<WccCertificateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<WccCertificateRecord | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch(`${BASE_URL}/admin_wcc_certificate/list`)
      .then((res) => res.json())
      .then((data: { success?: boolean; certificates?: WccCertificateRecord[] }) => {
        if (!mounted) return;
        setCertificates(data?.success && Array.isArray(data.certificates) ? data.certificates : []);
      })
      .catch(() => { if (mounted) setCertificates([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return certificates;
    return certificates.filter((c) =>
      c.vendor_id.toLowerCase().includes(q) || c.vendor_name.toLowerCase().includes(q));
  }, [certificates, search]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white border border-gray-200 w-full max-w-4xl max-h-[85vh] rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-800">Certificate Releases</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by vendor ID or vendor name…"
              className="w-full pl-8 pr-3 h-9 rounded-lg border border-gray-200 bg-gray-50 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">No certificates found.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Certificate</th>
                    <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Vendor</th>
                    <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Period</th>
                    <th className="text-center px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                    <th className="text-right px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Certified Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((cert) => (
                    <tr
                      key={cert.certificate_id}
                      onClick={() => setSelected(cert)}
                      className="cursor-pointer hover:bg-indigo-50/30 transition-colors"
                    >
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-600 whitespace-nowrap">{cert.certificate_id}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-800">{cert.vendor_name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{cert.vendor_id}</div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                        {formatDate(cert.from_date)} – {formatDate(cert.to_date)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap', STATUS_TONE[cert.status])}>
                          {STATUS_LABEL[cert.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-800 whitespace-nowrap">
                        ₹{(cert.total_certified_value || 0).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <WccCertificatePreview
          mode={selected.status === 'needs_revision' ? 'revise' : 'view'}
          existingRecord={selected}
          onChanged={() => setRefreshKey((k) => k + 1)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
};

export default WccCertificateReleasesModal;
