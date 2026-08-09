import { cn } from '@/lib/utils';

export type SignatureData = {
  staffName: string;
  staffDesignation: string;
  signedAt: string; // ISO timestamp
} | null;

const formatSignatureStamp = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { time: '—', date: '—' };
  return {
    time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
  };
};

// A rectangular sign-off box: "{staff_name} | {staff_designation} | {time} | {date} | Approved"
// once signed, or a "Pending" placeholder before that.
export const SignatureBox = ({
  role,
  signature,
  className,
}: {
  role: string;
  signature: SignatureData;
  className?: string;
}) => {
  const stamp = signature ? formatSignatureStamp(signature.signedAt) : null;
  return (
    <div className={cn('rounded-md border border-gray-300 p-2 text-center', className)}>
      <p className="text-[8px] font-bold uppercase tracking-wide text-slate-400">{role}</p>
      {signature && stamp ? (
        <p className="mt-1.5 text-[8px] font-semibold leading-relaxed text-emerald-700">
          {signature.staffName} | {signature.staffDesignation} | {stamp.time} | {stamp.date} | Approved
        </p>
      ) : (
        <p className="mt-4 text-[9px] font-semibold text-slate-400">Pending</p>
      )}
    </div>
  );
};

export default SignatureBox;
