import { cn } from '@/lib/utils';
import { LeadStatus } from '@/types/farm';

interface StatusBadgeProps {
  status: LeadStatus;
}

const statusConfig: Record<LeadStatus, { label: string; className: string }> = {
  contacted: {
    label: 'Contacted',
    className: 'bg-blue-50 text-blue-700 ring-blue-100',
  },
  verified: {
    label: 'Verified',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  },
  registered: {
    label: 'Registered',
    className: 'bg-[#0D3A35]/10 text-[#0D3A35] ring-[#0D3A35]/20',
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-rose-50 text-rose-700 ring-rose-100',
  },
  follow_up: {
    label: 'Follow Up',
    className: 'bg-amber-50 text-amber-700 ring-amber-100',
  },
};

const StatusBadge = ({ status }: StatusBadgeProps) => {
  const config = statusConfig[status] || {
    label: String(status) || 'Unknown',
    className: 'bg-slate-100 text-slate-600 ring-slate-200',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold ring-1',
        config.className
      )}
    >
      {config.label}
    </span>
  );
};

export default StatusBadge;
