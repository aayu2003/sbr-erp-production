import { Lead } from '@/types/farm';
import StatusBadge from './StatusBadge';
import { cn } from '@/lib/utils';
import { MapPin, ArrowRight, Trash2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface LeadsTableProps {
  leads: Lead[];
  onRegister?: (lead: Lead) => void;
  onFlag?: (id: string, flagged: boolean) => void;
  onAddLand?: (lead: Lead) => void;
  onDelete?: (lead: Lead) => void;
}

const LeadsTable = ({ leads, onRegister, onFlag, onAddLand, onDelete }: LeadsTableProps) => {
  const getNextActionLabel = (status: Lead['status']) => {
    switch (status) {
      case 'contacted':
        return 'Verify';
      case 'verified':
        return 'Register';
      case 'registered':
        return 'View';
      case 'rejected':
        return 'Reopen';
      default:
        return 'Proceed';
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableHead className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Land Owner Name</TableHead>
            <TableHead className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Contact</TableHead>
            <TableHead className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Acres</TableHead>
            <TableHead className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Location</TableHead>
            <TableHead className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Lead By</TableHead>
            <TableHead className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Status</TableHead>
            <TableHead className="text-right text-xs font-extrabold uppercase tracking-wide text-slate-500">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-slate-100">
          {leads.map((lead, index) => (
            <TableRow
              key={lead.id}
              className="animate-fade-in hover:bg-slate-50/60"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <TableCell>
                <div>
                  <p className="font-extrabold text-slate-900">{lead.fullName}</p>
                  <p className="text-sm font-semibold text-slate-500">{lead.leadSource}</p>
                </div>
              </TableCell>
              <TableCell>
                <p className="text-sm font-bold text-slate-700">{lead.phoneNumber}</p>
                {lead.alternatePhone && (
                  <p className="text-xs font-semibold text-slate-400">{lead.alternatePhone}</p>
                )}
              </TableCell>
              <TableCell>
                <span className="text-sm font-bold text-slate-700">{lead.estimatedLandArea ?? 'N/A'}</span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                    <MapPin className="h-4 w-4 text-[#0D3A35]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{lead.village}</p>
                    <p className="text-xs font-semibold text-slate-400">{lead.district}, {lead.state}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm font-semibold text-slate-400">N/A</span>
              </TableCell>
              <TableCell>
                <StatusBadge status={lead.status} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onRegister && onRegister(lead)}
                    disabled={lead.status === 'registered'}
                    className={cn(
                      'inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-extrabold transition-colors',
                      lead.status === 'rejected'
                        ? 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        : 'bg-[#0D3A35] text-white hover:bg-[#092b27] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400'
                    )}
                  >
                    {getNextActionLabel(lead.status)}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete && onDelete(lead)}
                    aria-label={`Delete ${lead.fullName}`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default LeadsTable;
