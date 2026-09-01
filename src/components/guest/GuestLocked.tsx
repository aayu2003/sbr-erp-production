import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';

/**
 * Shown in place of a page's content when a guest-link visitor navigates to any
 * module other than the one their link unlocks — or, with `invalid`, when a
 * visitor reaches a shared page with no valid link at all.
 */
const GuestLocked = ({ invalid = false }: { invalid?: boolean }) => (
  <div className="flex min-h-full items-center justify-center bg-[#f7f7f8] p-6">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
        <Lock className="h-6 w-6 text-slate-500" />
      </div>
      <h1 className="text-lg font-extrabold text-slate-900">
        {invalid ? 'This shared link isn’t valid' : 'This module is locked'}
      </h1>
      <p className="mt-2 text-sm font-medium text-slate-500">
        {invalid
          ? 'The link may have been revoked or mistyped. Ask whoever shared it for a new one, or sign in.'
          : "You're viewing a shared link that only unlocks the Procurement Dashboard. Everything else needs a sign-in."}
      </p>
      <div className="mt-6 flex flex-col gap-2">
        {!invalid && (
          <Link
            to="/procurement-dashboard"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[#173f70] px-4 text-sm font-semibold text-white hover:bg-[#12345e]"
          >
            Back to Procurement Dashboard
          </Link>
        )}
        <Link
          to="/login"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Sign in
        </Link>
      </div>
    </div>
  </div>
);

export default GuestLocked;
