import { Lock } from 'lucide-react';

const LandsPage = () => (
	<div className="flex flex-col items-center justify-center min-h-[65vh] px-6 text-center">
		<div className="w-20 h-20 rounded-3xl bg-amber-100 flex items-center justify-center mb-5 shadow-sm">
			<Lock className="w-10 h-10 text-amber-500" />
		</div>
		<h2 className="text-xl font-bold text-gray-900">Temporarily Closed</h2>
		<p className="text-sm text-gray-500 mt-2 leading-relaxed max-w-[280px]">
			The Lands section has been temporarily disabled. Please check back later or contact the Admin for more information.
		</p>
		<div className="mt-6 inline-flex items-center gap-2.5 rounded-full bg-amber-50 border border-amber-200 px-5 py-2.5 shadow-sm">
			<span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
			<span className="text-xs font-bold text-amber-700 tracking-wide">Disabled by Admin</span>
		</div>
	</div>
);

export default LandsPage;
