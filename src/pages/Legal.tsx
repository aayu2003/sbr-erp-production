import { useEffect, useMemo, useState } from 'react';
import {
  Scale,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ChevronDown,
  Search,
  MapPin,
  Phone,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Lead } from '@/types/farm';
import getBaseUrl from '@/lib/config';
import { useToast } from '@/hooks/use-toast';

type CheckStatus = 'pending' | 'cleared' | 'flagged';

type ChecklistKey =
  | 'title_deed'
  | 'encumbrance_certificate'
  | 'land_record'
  | 'litigation_check'
  | 'boundary_survey'
  | 'legal_opinion';

type Checklist = Record<ChecklistKey, CheckStatus>;

type ReviewRecord = {
  checklist: Checklist;
  notes: string;
};

const CHECKLIST_ITEMS: { key: ChecklistKey; label: string; description: string }[] = [
  { key: 'title_deed', label: 'Title Deed / Ownership Document', description: 'Confirms the land is legally owned by the lead' },
  { key: 'encumbrance_certificate', label: 'Encumbrance Certificate', description: 'Checks the land is free of loans, mortgages or liens' },
  { key: 'land_record', label: 'Land Revenue Record (7/12 or equivalent)', description: 'Government record matches the claimed land area and owner' },
  { key: 'litigation_check', label: 'Litigation / Court Case Check', description: 'No pending disputes or court cases on the land' },
  { key: 'boundary_survey', label: 'Boundary & Survey Verification', description: 'Physical boundaries match the recorded survey numbers' },
  { key: 'legal_opinion', label: 'Legal Opinion Sign-off', description: 'Final written opinion from legal counsel' },
];

const defaultChecklist = (): Checklist =>
  CHECKLIST_ITEMS.reduce((acc, item) => ({ ...acc, [item.key]: 'pending' as CheckStatus }), {} as Checklist);

// No "legal due diligence" API exists yet — reviews are kept in sessionStorage per lead
// until a backend endpoint is wired up (same stopgap pattern used by the HR organogram/mesh).
const STORAGE_KEY = 'sbr-legal-due-diligence-v1';

const loadStoredReviews = (): Record<string, ReviewRecord> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const overallStatus = (checklist: Checklist): CheckStatus => {
  const values = Object.values(checklist);
  if (values.some(v => v === 'flagged')) return 'flagged';
  if (values.every(v => v === 'cleared')) return 'cleared';
  return 'pending';
};

const statusMeta: Record<CheckStatus, { label: string; tone: string; Icon: React.ElementType }> = {
  cleared: { label: 'Cleared', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100', Icon: ShieldCheck },
  flagged: { label: 'Flagged', tone: 'bg-rose-50 text-rose-700 ring-rose-100', Icon: AlertTriangle },
  pending: { label: 'Pending', tone: 'bg-amber-50 text-amber-700 ring-amber-100', Icon: Clock },
};

const Legal = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, ReviewRecord>>(() => loadStoredReviews());
  const { toast } = useToast();

  useEffect(() => {
    const loadLeads = async () => {
      try {
        const base = getBaseUrl().replace(/\/$/, '');
        const resp = await fetch(`${base}/farmer_managment/get_leads`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!resp.ok) throw new Error(`Server responded with ${resp.status}`);
        const result = await resp.json();
        const transformed: Lead[] = (result.leads || []).map((item: any) => {
          const farmer = item.farmer_data || {};
          return {
            id: String(item.lead_id),
            backendId: String(item.lead_id),
            fullName: farmer.full_name || 'N/A',
            phoneNumber: farmer.phone_number || 'N/A',
            leadSource: farmer.lead_source || 'N/A',
            village: farmer.village || 'N/A',
            district: farmer.district || 'N/A',
            state: farmer.state || 'N/A',
            estimatedLandArea: farmer.estimated_land_area,
            status: item.status,
          } as Lead;
        });
        setLeads(transformed);
      } catch (error) {
        toast({
          title: 'Error',
          description: `Failed to load leads: ${error instanceof Error ? error.message : 'Unknown error'}`,
          variant: 'destructive',
        });
        setLeads([]);
      } finally {
        setLoading(false);
      }
    };
    loadLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
    } catch {
      // sessionStorage unavailable — review still works in-memory for this session
    }
  }, [reviews]);

  // Legal review only applies before final registration — contacted/verified/follow-up leads.
  const pipelineLeads = useMemo(
    () => leads.filter(l => l.status !== 'registered' && l.status !== 'rejected'),
    [leads]
  );

  const filteredLeads = useMemo(
    () =>
      pipelineLeads.filter(
        lead =>
          lead.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lead.village.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lead.district.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [pipelineLeads, searchQuery]
  );

  const getReview = (leadId: string): ReviewRecord =>
    reviews[leadId] ?? { checklist: defaultChecklist(), notes: '' };

  const setChecklistItem = (leadId: string, key: ChecklistKey, status: CheckStatus) => {
    setReviews(prev => {
      const current = prev[leadId] ?? { checklist: defaultChecklist(), notes: '' };
      return {
        ...prev,
        [leadId]: { ...current, checklist: { ...current.checklist, [key]: status } },
      };
    });
  };

  const setNotes = (leadId: string, notes: string) => {
    setReviews(prev => {
      const current = prev[leadId] ?? { checklist: defaultChecklist(), notes: '' };
      return { ...prev, [leadId]: { ...current, notes } };
    });
  };

  const summary = useMemo(() => {
    const statuses = filteredLeads.map(l => overallStatus(getReview(l.id).checklist));
    return {
      total: filteredLeads.length,
      cleared: statuses.filter(s => s === 'cleared').length,
      flagged: statuses.filter(s => s === 'flagged').length,
      pending: statuses.filter(s => s === 'pending').length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredLeads, reviews]);

  const statCards = [
    { label: 'In Review', value: summary.total, Icon: Scale, tone: 'bg-blue-50 text-blue-700 ring-blue-100' },
    { label: 'Cleared', value: summary.cleared, Icon: ShieldCheck, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
    { label: 'Flagged', value: summary.flagged, Icon: AlertTriangle, tone: 'bg-rose-50 text-rose-700 ring-rose-100' },
    { label: 'Pending', value: summary.pending, Icon: Clock, tone: 'bg-amber-50 text-amber-700 ring-amber-100' },
  ];

  return (
    <div className="min-h-screen bg-[#fbfcfd] p-8 text-slate-900">
      {/* Header */}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Legal</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">Legal due diligence for leads, before registration</p>
        </div>
      </div>

      {/* Stats */}
      <section className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ label, value, Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-slate-500">{label}</p>
                <p className="mt-3 text-3xl font-extrabold text-slate-950">{value}</p>
              </div>
              <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl ring-1', tone)}>
                <Icon className="h-6 w-6" />
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Search */}
      <div className="mt-7">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Search by name, village, or district..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#0D3A35]"
          />
        </div>
      </div>

      {/* List */}
      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0D3A35] border-t-transparent" />
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="flex h-48 items-center justify-center rounded-xl border border-slate-200 bg-white">
            <p className="text-sm font-semibold text-slate-400">No leads awaiting legal review</p>
          </div>
        ) : (
          filteredLeads.map(lead => {
            const review = getReview(lead.id);
            const status = overallStatus(review.checklist);
            const meta = statusMeta[status];
            const isExpanded = expandedId === lead.id;

            return (
              <div key={lead.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50/60"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                      <FileText className="h-5 w-5 text-[#0D3A35]" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-extrabold text-slate-900">{lead.fullName}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-semibold text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {lead.village}, {lead.district}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {lead.phoneNumber}
                        </span>
                        {lead.estimatedLandArea != null && <span>{lead.estimatedLandArea} acres</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold ring-1', meta.tone)}>
                      <meta.Icon className="h-3.5 w-3.5" />
                      {meta.label}
                    </span>
                    <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', isExpanded && 'rotate-180')} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 px-5 py-4">
                    <div className="space-y-3">
                      {CHECKLIST_ITEMS.map(item => {
                        const itemStatus = review.checklist[item.key];
                        return (
                          <div key={item.key} className="flex flex-col gap-2 rounded-lg border border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-800">{item.label}</p>
                              <p className="text-xs font-semibold text-slate-400">{item.description}</p>
                            </div>
                            <div className="flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                              {(['pending', 'cleared', 'flagged'] as CheckStatus[]).map(s => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => setChecklistItem(lead.id, item.key, s)}
                                  className={cn(
                                    'rounded-md px-2.5 py-1 text-[11px] font-extrabold capitalize transition-colors',
                                    itemStatus === s
                                      ? s === 'cleared'
                                        ? 'bg-emerald-600 text-white'
                                        : s === 'flagged'
                                        ? 'bg-rose-600 text-white'
                                        : 'bg-amber-500 text-white'
                                      : 'text-slate-500 hover:bg-slate-100'
                                  )}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-4 space-y-2">
                      <label className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Remarks</label>
                      <textarea
                        value={review.notes}
                        onChange={e => setNotes(lead.id, e.target.value)}
                        placeholder="Add legal remarks or conditions for clearance..."
                        rows={2}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-[#0D3A35]"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Legal;
