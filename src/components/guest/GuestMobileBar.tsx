import { Eye } from 'lucide-react';

/**
 * Slim top bar shown to guest-link visitors on small screens, where the full
 * sidebar is hidden. Desktop guests keep the normal sidebar.
 */
const GuestMobileBar = () => (
  <div className="flex items-center gap-2.5 border-b border-white/10 bg-[var(--brand-primary)] px-4 py-2.5 lg:hidden">
    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-white/95 p-1">
      <img
        src="/3f-logo.png"
        alt=""
        className="h-full w-full object-contain"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
    </div>
    <div className="min-w-0">
      <p className="truncate text-sm font-extrabold text-white">Procurement Dashboard</p>
      <p className="flex items-center gap-1 text-[11px] font-semibold text-white/70">
        <Eye className="h-3 w-3 shrink-0" /> Shared read-only view
      </p>
    </div>
  </div>
);

export default GuestMobileBar;
