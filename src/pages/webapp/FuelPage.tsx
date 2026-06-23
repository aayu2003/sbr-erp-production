import { useState, useEffect, useCallback } from 'react';
import {
	Fuel, Hash, User, Package, FileText, RefreshCw,
	Car, Check, X, ChevronRight, UserCheck, Loader2, Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { getBaseUrl } from '@/lib/config';
import type { Approval } from './WebApp';

const BASE_URL = getBaseUrl().replace(/\/$/, '');

// ─── API types ──────────────────────────────────────────────────

interface FuelRequest {
	request_id:     string;
	purpose:        string;
	fuel_requested: number;
	source:         string;
	date:           string;
	admin_ops_status: string;
	requestor_status: string;
	director_status:  string;
	vehicle_details: {
		model:          string;
		company:        string;
		type:           string;
		vehicle_number: string;
	};
	staff_details: {
		name:    string;
		contact: string;
	};
	admin_ops_approval_details: {
		approver_designation: string;
		approved_date:        string;
		approver_name:        string;
		approved_time:        string;
	};
	director_approval_details: {
		approver_designation: string;
		approved_date:        string;
		approver_name:        string;
		approved_time:        string;
	};
}

interface Director {
	staff_id:      string;
	staff_name:    string;
	staff_contact: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────

const fmtDate = (iso: string) => {
	try {
		return new Date(iso).toLocaleDateString('en-IN', {
			day: '2-digit', month: 'short', year: 'numeric',
		});
	} catch { return iso; }
};

// ─── Props ──────────────────────────────────────────────────────

interface Props {
	approvals: Approval[];
	onApprove: (id: string) => void;
	onReject:  (id: string) => void;
}

// ─── Page ───────────────────────────────────────────────────────

const FuelPage = (_props: Props) => {
	const { user, token } = useAuth();
	const isEA = user?.designation === 'EA To Director';

	const [requests, setRequests]           = useState<FuelRequest[]>([]);
	const [approvedRequests, setApprovedRequests] = useState<FuelRequest[]>([]);
	const [loading, setLoading]             = useState(false);
	const [error, setError]                 = useState<string | null>(null);
	// which request is being forwarded — drives the director picker modal
	const [forwardingReq, setForwardingReq] = useState<FuelRequest | null>(null);
	const [confirming, setConfirming]       = useState(false);
	// tracks which card's Approve button is in-flight (director)
	const [approvingId, setApprovingId]     = useState<string | null>(null);

	const fetchRequests = useCallback(() => {
		if (!token) return;

		const url = isEA
			? `${BASE_URL}/fuels_consumables/get_admin_ops_pending_requests`
			: `${BASE_URL}/fuels_consumables/get_director_pending_requests/${user?.id ?? ''}`;

		setLoading(true);
		setError(null);
		fetch(url, { headers: { Authorization: `Bearer ${token}` } })
			.then(r => r.json())
			.then((data: { pending_requests: FuelRequest[]; approved_requests?: FuelRequest[] }) => {
				setRequests(data?.pending_requests ?? []);
				setApprovedRequests(data?.approved_requests ?? []);
			})
			.catch((err: any) => {
				const msg = err?.message || 'Failed to load fuel requests';
				setError(msg);
				toast.error(msg);
			})
			.finally(() => setLoading(false));
	}, [token, isEA, user?.id]);

	useEffect(() => { fetchRequests(); }, [fetchRequests]);

	const handleReject = (id: string) => {
		setRequests(prev => prev.filter(r => r.request_id !== id));
		toast.error('Fuel request rejected');
	};

	const handleApprove = async (id: string) => {
		if (!token) return;

		const now  = new Date();
		const dd   = String(now.getDate()).padStart(2, '0');
		const mm   = String(now.getMonth() + 1).padStart(2, '0');
		const yyyy = now.getFullYear();
		const h    = now.getHours();
		const min  = String(now.getMinutes()).padStart(2, '0');
		const ampm = h >= 12 ? 'pm' : 'am';
		const h12  = String(h % 12 || 12).padStart(2, '0');

		const payload = {
			request_id: [id],
			approval_details: {
				approved_date:        `${dd}/${mm}/${yyyy}`,
				approved_time:        `${h12}:${min} ${ampm}`,
				approver_designation: user?.designation ?? '',
				approver_name:        user?.name        ?? '',
			},
			staff_id: user?.id ?? '',
		};

		setApprovingId(id);
		try {
			const res = await fetch(`${BASE_URL}/fuels_consumables/director_approval`, {
				method:  'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization:  `Bearer ${token}`,
				},
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err?.message || `HTTP ${res.status}`);
			}

			setRequests(prev => prev.filter(r => r.request_id !== id));
			toast.success('Fuel request approved');
		} catch (err: any) {
			toast.error(err?.message || 'Failed to approve request');
		} finally {
			setApprovingId(null);
		}
	};

	// Called when EA confirms directors in the picker
	const handleForwardConfirm = async (directors: Director[]) => {
		if (!forwardingReq || !token) return;

		const now   = new Date();
		const dd    = String(now.getDate()).padStart(2, '0');
		const mm    = String(now.getMonth() + 1).padStart(2, '0');
		const yyyy  = now.getFullYear();
		const h     = now.getHours();
		const min   = String(now.getMinutes()).padStart(2, '0');
		const ampm  = h >= 12 ? 'pm' : 'am';
		const h12   = String(h % 12 || 12).padStart(2, '0');

		const payload = {
			request_id: [forwardingReq.request_id],
			approval_details: {
				approved_date:        `${dd}/${mm}/${yyyy}`,
				approved_time:        `${h12}:${min} ${ampm}`,
				approver_designation: user?.designation ?? '',
				approver_name:        user?.name        ?? '',
			},
			forwarded_director: directors.map(d => ({
				staff_id:      d.staff_id,
				staff_name:    d.staff_name,
				staff_contact: d.staff_contact,
			})),
		};

		setConfirming(true);
		try {
			const res = await fetch(`${BASE_URL}/fuels_consumables/admin_ops_approval`, {
				method:  'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization:  `Bearer ${token}`,
				},
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err?.message || `HTTP ${res.status}`);
			}

			setRequests(prev => prev.filter(r => r.request_id !== forwardingReq.request_id));
			toast.success(`Forwarded to ${directors.map(d => d.staff_name).join(', ')}`);
			setForwardingReq(null);
		} catch (err: any) {
			toast.error(err?.message || 'Failed to forward request');
		} finally {
			setConfirming(false);
		}
	};

	return (
		<div className="flex flex-col h-full">

			{/* ── Header ── */}
			<div className="px-4 pt-5 pb-3 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
						<Fuel className="w-4 h-4 text-amber-600" />
					</div>
					<div>
						<h1 className="text-base font-bold text-gray-900 leading-none">
							Fuel Requests
						</h1>
						<p className="text-[11px] text-gray-400 mt-0.5">
							{loading
								? 'Loading…'
								: requests.length > 0
									? `${requests.length} pending · ${approvedRequests.length} approved`
									: 'All clear'}
						</p>
					</div>
				</div>
				<button
					onClick={fetchRequests}
					disabled={loading}
					className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors disabled:opacity-40"
					title="Refresh"
				>
					<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
				</button>
			</div>

			{/* ── Cards ── */}
			<div className="flex-1 overflow-auto px-4 pb-6 space-y-3">
				{loading ? (
					<div className="flex flex-col items-center justify-center py-24 gap-2 text-gray-400">
						<RefreshCw className="w-7 h-7 animate-spin opacity-30" />
						<p className="text-sm">Loading fuel requests…</p>
					</div>
				) : error ? (
					<div className="flex flex-col items-center justify-center py-24 gap-2">
						<p className="text-sm font-medium text-red-400">{error}</p>
						<button onClick={fetchRequests} className="text-xs font-semibold text-amber-600 underline">
							Retry
						</button>
					</div>
				) : requests.length === 0 && approvedRequests.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-24 gap-2">
						<Fuel className="w-10 h-10 text-gray-200" />
						<p className="text-sm font-medium text-gray-400">No pending fuel requests</p>
					</div>
				) : (
					<>
						{/* Pending requests */}
						{requests.length > 0 && (
							<>
								{!isEA && (
									<p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-1">
										Pending Approval
									</p>
								)}
								{requests.map(req => (
									<FuelCard
										key={req.request_id}
										req={req}
										isEA={isEA}
										approvingId={approvingId}
										onApproveForward={() => setForwardingReq(req)}
										onReject={handleReject}
										onApprove={handleApprove}
									/>
								))}
							</>
						)}

						{/* Approved requests — directors only */}
						{!isEA && approvedRequests.length > 0 && (
							<>
								<p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-1 pt-2">
									Approved
								</p>
								{approvedRequests.map(req => (
									<FuelCard
										key={req.request_id}
										req={req}
										isEA={false}
										approvingId={approvingId}
										onApproveForward={() => {}}
										onReject={handleReject}
										onApprove={handleApprove}
									/>
								))}
							</>
						)}
					</>
				)}
			</div>

			{/* ── Director picker modal (EA only) ── */}
			{forwardingReq && (
				<DirectorPickerModal
					token={token ?? ''}
					confirming={confirming}
					onConfirm={handleForwardConfirm}
					onClose={() => !confirming && setForwardingReq(null)}
				/>
			)}
		</div>
	);
};

// ─── Row Card ───────────────────────────────────────────────────

const FuelCard = ({
	req,
	isEA,
	approvingId,
	onApproveForward,
	onReject,
	onApprove,
}: {
	req:              FuelRequest;
	isEA:             boolean;
	approvingId:      string | null;
	onApproveForward: () => void;
	onReject:         (id: string) => void;
	onApprove:        (id: string) => void;
}) => {
	const isProcessed = isEA
		? req.admin_ops_status === 'approved_and_forwarded'
		: req.director_status  === 'approved_and_forwarded';

	const statusLabel = isProcessed
		? (isEA ? 'Forwarded' : 'Approved')
		: 'Pending';

	const statusClass = isProcessed
		? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
		: 'bg-amber-50 text-amber-700 ring-amber-200';

	return (
		<div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

			{/* Voucher # + date + status */}
			<div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
				<div className="flex items-center gap-1.5">
					<Hash className="w-3 h-3 text-gray-400" />
					<span className="text-[11px] font-mono font-bold text-gray-700 tracking-wide">
						{req.request_id}
					</span>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-[10px] text-gray-400">{fmtDate(req.date)}</span>
					<span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ${statusClass}`}>
						{statusLabel}
					</span>
				</div>
			</div>

			{/* Detail rows */}
			<div className="px-4 py-3 space-y-2.5">

				<DetailRow icon={<User className="w-3.5 h-3.5 text-blue-400" />} label="Person">
					<span className="text-sm font-semibold text-gray-900">{req.staff_details.name}</span>
					{req.staff_details.contact && (
						<span className="ml-1.5 text-[11px] text-gray-400">· {req.staff_details.contact}</span>
					)}
				</DetailRow>

				<DetailRow icon={<Package className="w-3.5 h-3.5 text-amber-500" />} label="Quantity">
					<span className="text-sm font-bold text-gray-900">{req.fuel_requested} L</span>
				</DetailRow>

				<DetailRow icon={<FileText className="w-3.5 h-3.5 text-gray-400" />} label="Purpose">
					<span className="text-sm text-gray-700 capitalize">{req.purpose}</span>
				</DetailRow>

				{req.vehicle_details?.vehicle_number && (
					<DetailRow icon={<Car className="w-3.5 h-3.5 text-gray-400" />} label="Vehicle">
						<span className="text-sm font-semibold text-gray-800">
							{req.vehicle_details.vehicle_number}
						</span>
						<span className="ml-1.5 text-[11px] text-gray-400 capitalize">
							· {req.vehicle_details.model} ({req.vehicle_details.company})
						</span>
					</DetailRow>
				)}

			</div>

			{/* Action buttons */}
			{!isProcessed && (
				<div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
					{isEA ? (
						/* EA: Reject + Approve & Forward */
						<>
							<button
								onClick={() => onReject(req.request_id)}
								className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-red-50 text-red-600 ring-1 ring-red-200 active:scale-95 transition-all"
							>
								<X className="w-3.5 h-3.5" />
								Reject
							</button>
							<button
								onClick={onApproveForward}
								className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all"
							>
								<ChevronRight className="w-3.5 h-3.5" />
								Approve & Forward
							</button>
						</>
					) : (
						/* Director: Approve only */
						(() => {
							const isApproving = approvingId === req.request_id;
							return (
								<button
									onClick={() => onApprove(req.request_id)}
									disabled={isApproving}
									className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 active:scale-95 transition-all"
								>
									{isApproving
										? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Approving…</>
										: <><Check className="w-3.5 h-3.5" /> Approve</>
									}
								</button>
							);
						})()
					)}
				</div>
			)}
		</div>
	);
};

// ─── Director picker modal ───────────────────────────────────────

const DirectorPickerModal = ({
	token,
	confirming,
	onConfirm,
	onClose,
}: {
	token:      string;
	confirming: boolean;
	onConfirm:  (directors: Director[]) => void;
	onClose:    () => void;
}) => {
	const [directors, setDirectors]   = useState<Director[]>([]);
	const [selected, setSelected]     = useState<Set<string>>(new Set());
	const [loading, setLoading]       = useState(true);
	const [error, setError]           = useState<string | null>(null);

	useEffect(() => {
		fetch(`${BASE_URL}/admin_staff/get_directors`, {
			headers: { Authorization: `Bearer ${token}` },
		})
			.then(r => r.json())
			.then((data: { directors: Director[] }) => {
				setDirectors(data?.directors ?? []);
			})
			.catch(() => setError('Failed to load directors'))
			.finally(() => setLoading(false));
	}, [token]);

	const toggle = (id: string) =>
		setSelected(prev => {
			const next = new Set(prev);
			next.has(id) ? next.delete(id) : next.add(id);
			return next;
		});

	const handleConfirm = () => {
		const chosen = directors.filter(d => selected.has(d.staff_id));
		onConfirm(chosen);
	};

	return (
		<div className="fixed inset-0 z-[100] flex items-end justify-center">
			{/* Backdrop */}
			<div className="absolute inset-0 bg-black/50" onClick={onClose} />

			{/* Sheet */}
			<div className="relative w-full max-w-md bg-white rounded-t-2xl shadow-2xl flex flex-col max-h-[70vh]">

				{/* Header */}
				<div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
					<div className="flex items-center gap-2">
						<UserCheck className="w-4 h-4 text-emerald-600" />
						<h2 className="text-sm font-bold text-gray-900">Forward to Director</h2>
					</div>
					<button
						onClick={onClose}
						className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				<p className="px-5 pt-3 pb-1 text-[11px] text-gray-400">
					Select one or more directors to forward this request to.
				</p>

				{/* Director list */}
				<div className="flex-1 overflow-auto px-5 py-2 space-y-2">
					{loading ? (
						<div className="flex items-center justify-center py-10 gap-2 text-gray-400">
							<Loader2 className="w-5 h-5 animate-spin" />
							<span className="text-sm">Loading directors…</span>
						</div>
					) : error ? (
						<div className="flex items-center justify-center py-10">
							<p className="text-sm text-red-400">{error}</p>
						</div>
					) : directors.length === 0 ? (
						<div className="flex items-center justify-center py-10">
							<p className="text-sm text-gray-400">No directors found</p>
						</div>
					) : (
						directors.map(d => {
							const isSelected = selected.has(d.staff_id);
							return (
								<button
									key={d.staff_id}
									type="button"
									onClick={() => toggle(d.staff_id)}
									className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
										isSelected
											? 'border-emerald-400 bg-emerald-50'
											: 'border-gray-200 bg-white hover:bg-gray-50'
									}`}
								>
									{/* Checkbox */}
									<div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
										isSelected
											? 'border-emerald-500 bg-emerald-500'
											: 'border-gray-300'
									}`}>
										{isSelected && <Check className="w-3 h-3 text-white" />}
									</div>

									{/* Avatar */}
									<div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
										<span className="text-xs font-bold text-emerald-700">
											{d.staff_name.charAt(0).toUpperCase()}
										</span>
									</div>

									{/* Name */}
									<span className={`text-sm font-semibold ${isSelected ? 'text-emerald-800' : 'text-gray-800'}`}>
										{d.staff_name}
									</span>
								</button>
							);
						})
					)}
				</div>

				{/* Footer */}
				<div className="px-5 py-4 border-t border-gray-100 flex gap-2 shrink-0">
					<button
						onClick={onClose}
						className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
					>
						Cancel
					</button>
					<button
						onClick={handleConfirm}
						disabled={selected.size === 0 || confirming}
						className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
					>
						{confirming ? (
							<><Loader2 className="w-4 h-4 animate-spin" /> Forwarding…</>
						) : (
							<><Send className="w-4 h-4" /> Forward{selected.size > 0 ? ` (${selected.size})` : ''}</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
};

// ─── Tiny layout helper ─────────────────────────────────────────

const DetailRow = ({
	icon,
	label,
	children,
}: {
	icon:     React.ReactNode;
	label:    string;
	children: React.ReactNode;
}) => (
	<div className="flex items-start gap-2">
		<div className="mt-0.5 shrink-0">{icon}</div>
		<div className="min-w-0">
			<p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">
				{label}
			</p>
			<div className="leading-snug">{children}</div>
		</div>
	</div>
);

export default FuelPage;
