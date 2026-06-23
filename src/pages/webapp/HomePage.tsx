import { useState, useEffect, useMemo } from 'react';
import {
	MapPin, Map, Leaf, Wheat, Sprout, TrendingUp,
	RefreshCw, Search, Maximize2, X, Video, LayoutGrid,
	ChevronDown, ChevronUp, User,
} from 'lucide-react';
import { MapContainer, TileLayer, Polygon, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '@/context/AuthContext';
import { getBaseUrl } from '@/lib/config';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
type FarmInvestmentEntry = {
	amount: number;
	date: string;
	description: string;
	voucher_number: string;
	item_description: { item_code: string; item_unit: string; item_name: string };
};
type VendorScope = {
	start_date: string;
	end_date: string;
	activities: string[];
	vendor_details: { vendor_name: string; vendor_contact: string };
};
type LandPlot = {
	plot_name: string;
	plot_area: number;
	plot_coordinates: [number, number][];
};
type AdditionalMapping = {
	mapping_name: string;
	mapping_type: string;
	mapping_coordinates: string[];
	shape_details: 'polygon' | 'line' | 'point';
};
type Farm = {
	farm_id: string;
	farmer_id: string;
	farmer_name?: string;
	block_id: string;
	crop_type: string;
	area: number;
	priority: number;
	created_at: string;
	land_data: {
		land_coordinates: [number, number][];
		farming_option: string;
		state: string;
		village: string;
		district: string;
		land_media: { images: string[]; video: string };
	};
	land_plots?: LandPlot[];
	additional_mappings?: AdditionalMapping[];
	scope_of_work?: Record<string, VendorScope>;
	farm_investment_ledger?: FarmInvestmentEntry[];
};

// ─────────────────────────────────────────────────────────────
// Map utilities
// ─────────────────────────────────────────────────────────────
const PLOT_COLORS = ['#f59e0b','#a855f7','#06b6d4','#ec4899','#f97316','#14b8a6','#6366f1','#84cc16'];
const MAPPING_COLORS: Record<string, string> = {
	'narrow road': '#f97316', 'narrow path': '#f97316',
	'small shelter': '#eab308', 'bore well': '#3b82f6', 'borewell': '#3b82f6',
	'canal': '#06b6d4', 'huge pipe': '#8b5cf6', 'ditch': '#b45309',
	'unwanted tree': '#16a34a', 'boundary wall': '#6b7280',
	'pond': '#0ea5e9', 'electric pole': '#facc15',
};
const getMappingColor = (type: string) => MAPPING_COLORS[type.toLowerCase()] ?? '#ef4444';
const parseCoords = (raw: string[]): [number, number][] =>
	raw.map(s => { const [a, b] = s.split(',').map(Number); return [a, b]; });

const FitBounds = ({ coords }: { coords: [number, number][] }) => {
	const map = useMap();
	useEffect(() => {
		if (coords.length > 0) map.fitBounds(L.latLngBounds(coords as L.LatLngTuple[]), { padding: [14, 14] });
	}, [map]);
	return null;
};

const FarmMiniMap = ({
	landCoords,
	plots = [],
	mappings = [],
}: {
	landCoords: [number, number][];
	plots?: LandPlot[];
	mappings?: AdditionalMapping[];
}) => {
	const parsedMappings = mappings.map(m => ({ ...m, coords: parseCoords(m.mapping_coordinates) }));
	const allCoords: [number, number][] = [
		...landCoords,
		...(plots ?? []).flatMap(p => p.plot_coordinates),
		...parsedMappings.flatMap(m => m.coords),
	];
	const center: [number, number] = allCoords.length > 0
		? [allCoords.reduce((s, c) => s + c[0], 0) / allCoords.length, allCoords.reduce((s, c) => s + c[1], 0) / allCoords.length]
		: [20.5937, 78.9629];

	if (landCoords.length === 0) {
		return (
			<div className="h-full w-full flex flex-col items-center justify-center bg-gray-900 gap-1">
				<Map className="h-7 w-7 text-gray-600" />
				<span className="text-[10px] text-gray-500">No coordinates</span>
			</div>
		);
	}
	return (
		<MapContainer
			key={`mini-${landCoords[0]?.[0]}-${landCoords[0]?.[1]}`}
			center={center} zoom={14}
			style={{ height: '100%', width: '100%' }}
			zoomControl={false} dragging={false} scrollWheelZoom={false}
			doubleClickZoom={false} touchZoom={false} attributionControl={false}
		>
			<TileLayer
				url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
				maxZoom={19}
			/>
			{landCoords.length >= 3 && (
				<Polygon
					positions={landCoords}
					pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: plots.length > 0 ? 0.08 : 0.22, weight: 2.5 }}
				/>
			)}
			{plots.map((plot, i) =>
				plot.plot_coordinates.length >= 3
					? <Polygon key={i} positions={plot.plot_coordinates} pathOptions={{ color: PLOT_COLORS[i % PLOT_COLORS.length], fillColor: PLOT_COLORS[i % PLOT_COLORS.length], fillOpacity: 0.35, weight: 2 }} />
					: null
			)}
			{parsedMappings.map((m, i) => {
				const color = getMappingColor(m.mapping_type);
				if (m.shape_details === 'polygon' && m.coords.length >= 3)
					return <Polygon key={i} positions={m.coords} pathOptions={{ color, fillColor: color, fillOpacity: 0.3, weight: 1.5 }} />;
				if (m.shape_details === 'line' && m.coords.length >= 2)
					return <Polyline key={i} positions={m.coords} pathOptions={{ color, weight: 2 }} />;
				return m.coords.map((pt, j) =>
					<CircleMarker key={`${i}-${j}`} center={pt} radius={4} pathOptions={{ color, fillColor: color, fillOpacity: 0.9, weight: 1.5 }} />
				);
			})}
			<FitBounds coords={allCoords} />
		</MapContainer>
	);
};

const FarmExpandMapFull = ({
	landCoords,
	plots = [],
	mappings = [],
	visibleLayers,
}: {
	landCoords: [number, number][];
	plots?: LandPlot[];
	mappings?: AdditionalMapping[];
	visibleLayers: Set<string>;
}) => {
	const parsedMappings = mappings
		.filter(m => visibleLayers.has(m.mapping_type.toLowerCase()))
		.map(m => ({ ...m, coords: parseCoords(m.mapping_coordinates) }));
	const allCoords: [number, number][] = [
		...landCoords,
		...(plots ?? []).flatMap(p => p.plot_coordinates),
		...parsedMappings.flatMap(m => m.coords),
	];
	const center: [number, number] = allCoords.length > 0
		? [allCoords.reduce((s, c) => s + c[0], 0) / allCoords.length, allCoords.reduce((s, c) => s + c[1], 0) / allCoords.length]
		: [20.5937, 78.9629];

	if (landCoords.length === 0) {
		return <div className="h-full w-full flex items-center justify-center bg-gray-900"><Map className="h-10 w-10 text-gray-600" /></div>;
	}
	return (
		<MapContainer
			key={`expand-${landCoords[0]?.[0]}-${landCoords[0]?.[1]}`}
			center={center} zoom={15}
			style={{ height: '100%', width: '100%' }}
			zoomControl dragging scrollWheelZoom doubleClickZoom touchZoom attributionControl={false}
		>
			<TileLayer
				url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
				maxZoom={21}
			/>
			{visibleLayers.has('land') && landCoords.length >= 3 && (
				<Polygon positions={landCoords} pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: plots.length > 0 ? 0.06 : 0.20, weight: 2.5 }} />
			)}
			{visibleLayers.has('plots') && plots.map((plot, i) =>
				plot.plot_coordinates.length >= 3
					? <Polygon key={i} positions={plot.plot_coordinates} pathOptions={{ color: PLOT_COLORS[i % PLOT_COLORS.length], fillColor: PLOT_COLORS[i % PLOT_COLORS.length], fillOpacity: 0.35, weight: 2 }} />
					: null
			)}
			{parsedMappings.map((m, i) => {
				const color = getMappingColor(m.mapping_type);
				if (m.shape_details === 'polygon' && m.coords.length >= 3)
					return <Polygon key={i} positions={m.coords} pathOptions={{ color, fillColor: color, fillOpacity: 0.3, weight: 2 }} />;
				if (m.shape_details === 'line' && m.coords.length >= 2)
					return <Polyline key={i} positions={m.coords} pathOptions={{ color, weight: 3 }} />;
				return m.coords.map((pt, j) =>
					<CircleMarker key={`${i}-${j}`} center={pt} radius={6} pathOptions={{ color, fillColor: color, fillOpacity: 0.9, weight: 2 }} />
				);
			})}
			<FitBounds coords={allCoords} />
		</MapContainer>
	);
};

// ─────────────────────────────────────────────────────────────
// Map expand modal — fullscreen on mobile
// ─────────────────────────────────────────────────────────────
const MapExpandModal = ({ farm, onClose }: { farm: Farm; onClose: () => void }) => {
	const plots    = farm.land_plots ?? [];
	const mappings = farm.additional_mappings ?? [];
	const coords   = farm.land_data?.land_coordinates ?? [];

	const uniqueMappingTypes = Array.from(new Set(mappings.map(m => m.mapping_type.toLowerCase())));
	const allLayers = ['land', ...(plots.length > 0 ? ['plots'] : []), ...uniqueMappingTypes];
	const [visibleLayers, setVisibleLayers] = useState<Set<string>>(() => new Set(allLayers));

	const toggleLayer = (key: string) => setVisibleLayers(prev => {
		const next = new Set(prev);
		next.has(key) ? next.delete(key) : next.add(key);
		return next;
	});

	const filterPills = [
		{ key: 'land',  label: 'Land',  color: '#22c55e' },
		...(plots.length > 0 ? [{ key: 'plots', label: 'Plots', color: PLOT_COLORS[0] }] : []),
		...uniqueMappingTypes.map(t => ({
			key: t,
			label: t.split(' ').map((w: string) => w[0].toUpperCase() + w.slice(1)).join(' '),
			color: getMappingColor(t),
		})),
	];

	const ownerName = farm.farmer_name ?? (farm as any).farmer_data?.full_name ?? null;
	const location = [farm.land_data?.village, farm.land_data?.district, farm.land_data?.state].filter(Boolean).join(', ');

	return (
		<div className="fixed inset-0 z-[2000] flex flex-col bg-black">
			<div className="flex items-center justify-between px-4 py-3 bg-gray-900 shrink-0">
				<div className="min-w-0 pr-3">
					{ownerName
						? <p className="text-sm font-semibold text-white truncate">{ownerName}</p>
						: <p className="text-[10px] font-mono text-emerald-400">{(farm.farm_id ?? '').slice(0, 8).toUpperCase()}…</p>
					}
					<p className="text-[10px] text-gray-400 truncate mt-0.5">{location || 'Farm Map'}</p>
				</div>
				<button
					onClick={onClose}
					className="shrink-0 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20 transition-colors"
				>
					<X className="w-4 h-4 text-white" />
				</button>
			</div>

			{filterPills.length > 1 && (
				<div className="flex items-center gap-2 overflow-x-auto px-4 py-2.5 bg-gray-900/90 shrink-0">
					<span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 shrink-0 mr-1">Layers</span>
					{filterPills.map(pill => {
						const active = visibleLayers.has(pill.key);
						return (
							<button
								key={pill.key}
								onClick={() => toggleLayer(pill.key)}
								className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[11px] font-semibold transition-all"
								style={{
									borderColor: active ? pill.color : '#4b5563',
									backgroundColor: active ? pill.color + '33' : 'transparent',
									color: active ? pill.color : '#9ca3af',
								}}
							>
								<span className="w-2 h-2 rounded-full shrink-0" style={{ background: active ? pill.color : '#4b5563' }} />
								{pill.label}
							</button>
						);
					})}
				</div>
			)}

			<div className="flex-1 relative min-h-0">
				<FarmExpandMapFull landCoords={coords} plots={plots} mappings={mappings} visibleLayers={visibleLayers} />
			</div>

			{plots.length > 0 && (
				<div className="shrink-0 bg-gray-900/90 px-4 py-3 overflow-x-auto">
					<div className="flex items-center gap-4">
						<span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 shrink-0">Plots</span>
						{plots.map((plot, i) => (
							<div key={i} className="flex items-center gap-1.5 shrink-0">
								<span className="w-3 h-3 rounded-sm" style={{ background: PLOT_COLORS[i % PLOT_COLORS.length] }} />
								<span className="text-xs text-white font-semibold">{plot.plot_name}</span>
								<span className="text-[10px] text-gray-400">{plot.plot_area} ac</span>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
};

// ─────────────────────────────────────────────────────────────
// Crop + option metadata
// ─────────────────────────────────────────────────────────────
type KnownCrop = 'napier' | 'paddy' | 'ragi';
const cropMeta: Record<KnownCrop, { label: string; Icon: React.ComponentType<{ className?: string }>; color: string }> = {
	napier: { label: 'Napier', Icon: Leaf,   color: 'text-green-700 bg-green-50 ring-green-100'    },
	paddy:  { label: 'Paddy',  Icon: Wheat,  color: 'text-yellow-700 bg-yellow-50 ring-yellow-100' },
	ragi:   { label: 'Ragi',   Icon: Sprout, color: 'text-orange-700 bg-orange-50 ring-orange-100' },
};
const farmingOptionMeta: Record<string, { color: string }> = {
	'Lease Farming':    { color: 'text-blue-700 bg-blue-50 ring-blue-200'       },
	'Contract Farming': { color: 'text-purple-700 bg-purple-50 ring-purple-200' },
};

const shortId = (id: string) => (id ?? '').slice(0, 8).toUpperCase();
const fmtDate = (iso: string) => {
	try { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
	catch { return iso; }
};

// ─────────────────────────────────────────────────────────────
// Farm card — collapsed by default
// ─────────────────────────────────────────────────────────────
const FarmCard = ({ farm, onViewMap }: { farm: Farm; onViewMap: (farm: Farm) => void }) => {
	const [expanded, setExpanded] = useState(false);

	const ld         = farm.land_data;
	const coords     = ld?.land_coordinates ?? [];
	const images     = ld?.land_media?.images ?? [];
	const video      = ld?.land_media?.video ?? '';
	const cropKey    = (farm.crop_type ?? '').toLowerCase() as KnownCrop;
	const crop       = cropMeta[cropKey] ?? null;
	const optionMeta = farmingOptionMeta[ld?.farming_option ?? ''] ?? { color: 'text-gray-600 bg-gray-50 ring-gray-200' };
	const location   = [ld?.village, ld?.district, ld?.state].filter(Boolean).join(', ');

	// Resolve owner name from whichever field the API provides
	const ownerName: string =
		farm.farmer_name ??
		(farm as any).farmer_data?.full_name ??
		(farm as any).owner_name ??
		`Farm ${shortId(farm.farm_id)}`;

	const scopeEntries = Object.entries(farm.scope_of_work ?? {});
	const isSelf = (s: VendorScope) =>
		!!(s.vendor_details?.vendor_name ?? '').toLowerCase().match(/sai|sbr/);
	const selfEntries   = scopeEntries.filter(([k, s]) => k === 'self' || isSelf(s));
	const vendorEntries = scopeEntries.filter(([k, s]) => k !== 'self' && !isSelf(s));

	const ledger   = farm.farm_investment_ledger ?? [];
	const totalAmt = ledger.reduce((s, e) => s + (e.amount ?? 0), 0);

	return (
		<div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">

			{/* ── Satellite mini map ── */}
			<div className="h-[210px] w-full relative overflow-hidden">
				<FarmMiniMap landCoords={coords} plots={farm.land_plots} mappings={farm.additional_mappings} />

				{/* Farming option badge */}
				<span className={`absolute top-2.5 left-2.5 z-[1000] inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 backdrop-blur-sm bg-white/90 ${optionMeta.color}`}>
					{ld?.farming_option || 'Unknown'}
				</span>

				{/* Priority badge */}
				{(farm.priority ?? 0) > 0 && (
					<span className="absolute top-2.5 right-2.5 z-[1000] rounded-full bg-amber-500 text-white text-[10px] font-bold px-2.5 py-1 shadow">
						P{farm.priority}
					</span>
				)}

				{/* View Map button */}
				<button
					onClick={() => onViewMap(farm)}
					className="absolute bottom-2.5 left-2.5 z-[1000] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/65 active:bg-black/85 text-white text-[11px] font-semibold backdrop-blur-sm"
				>
					<Maximize2 className="w-3.5 h-3.5" />
					View Map
				</button>

				{/* Plot count */}
				{(farm.land_plots?.length ?? 0) > 0 && (
					<span className="absolute bottom-2.5 right-2.5 z-[1000] rounded-md bg-black/65 text-white text-[10px] font-semibold px-2 py-1">
						{farm.land_plots!.length} plot{farm.land_plots!.length !== 1 ? 's' : ''}
					</span>
				)}
			</div>

			{/* ── Always-visible strip: owner + area ── */}
			<div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
				<div className="flex items-center gap-2 min-w-0">
					<div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
						<User className="w-3.5 h-3.5 text-emerald-600" />
					</div>
					<div className="min-w-0">
						<p className="text-sm font-bold text-gray-900 truncate">{ownerName}</p>
						<p className="text-[10px] text-gray-400 leading-none mt-0.5">{fmtDate(farm.created_at)}</p>
					</div>
				</div>
				<div className="shrink-0 text-right ml-3">
					<p className="text-lg font-extrabold text-gray-900 leading-tight">
						{(farm.area ?? 0).toLocaleString('en-IN')}
					</p>
					<p className="text-[10px] font-semibold text-gray-400 leading-none">acres</p>
				</div>
			</div>

			{/* ── Collapsible toggle ── */}
			<button
				onClick={() => setExpanded(prev => !prev)}
				className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 active:bg-gray-100 transition-colors"
			>
				<span className="text-xs font-semibold text-gray-500">
					{expanded ? 'Show less' : 'View all details'}
				</span>
				{expanded
					? <ChevronUp className="w-4 h-4 text-gray-400" />
					: <ChevronDown className="w-4 h-4 text-gray-400" />
				}
			</button>

			{/* ── Collapsible body ── */}
			{expanded && (
				<div className="px-4 pb-4 pt-3 space-y-3.5 border-t border-gray-100">

					{/* Farm ID + Block */}
					<div className="flex items-center justify-between gap-2">
						<span className="font-bold text-xs text-gray-500 font-mono tracking-tight">
							ID: {shortId(farm.farm_id)}…
						</span>
						<span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-mono font-semibold text-slate-600 ring-1 ring-slate-200 max-w-[140px] truncate">
							{shortId(farm.block_id)}…
						</span>
					</div>

					{/* Location */}
					<div className="flex items-start gap-1.5">
						<MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
						<span className="text-xs text-gray-600 leading-snug">{location || '—'}</span>
					</div>

					{/* Crop */}
					{crop ? (
						<span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ring-1 ${crop.color}`}>
							<crop.Icon className="h-3 w-3" />
							{crop.label}
						</span>
					) : (
						<span className="inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-bold ring-1 bg-gray-50 text-gray-600 ring-gray-200 capitalize">
							{farm.crop_type || 'Unknown'}
						</span>
					)}

					{/* Scope of Work — SBR self */}
					{selfEntries.length > 0 && (
						<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 space-y-2">
							<div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Scope of Work</div>
							<div className="flex items-center justify-between">
								<span className="text-[11px] font-semibold text-gray-800">Sai BioResources</span>
								<span className="text-[10px] font-mono text-emerald-600 bg-emerald-100 rounded px-1.5 py-0.5">self</span>
							</div>
							<div className="flex flex-wrap gap-1">
								{(selfEntries[0][1].activities ?? []).slice(0, 5).map(act => (
									<span key={act} className="rounded-full bg-white border border-emerald-200 text-[10px] px-1.5 py-0.5 text-emerald-700 font-medium">
										{act}
									</span>
								))}
								{(selfEntries[0][1].activities ?? []).length > 5 && (
									<span className="text-[10px] text-gray-400 self-center">
										+{selfEntries[0][1].activities.length - 5} more
									</span>
								)}
							</div>
						</div>
					)}

					{/* Scope of Work — external vendor */}
					{vendorEntries.length > 0 && (
						<div className="rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5 space-y-2">
							<div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Vendor Scope</div>
							{vendorEntries.map(([vendorId, scope]) => (
								<div key={vendorId}>
									<div className="flex items-center justify-between gap-1 mb-1">
										<span className="text-[11px] font-semibold text-gray-800 truncate">{scope.vendor_details?.vendor_name}</span>
										<span className="shrink-0 text-[10px] font-mono text-gray-400">{vendorId}</span>
									</div>
									<div className="flex flex-wrap gap-1">
										{(scope.activities ?? []).slice(0, 4).map(act => (
											<span key={act} className="rounded-full bg-white border border-blue-200 text-[10px] px-1.5 py-0.5 text-blue-700 font-medium">
												{act}
											</span>
										))}
										{(scope.activities ?? []).length > 4 && (
											<span className="text-[10px] text-gray-400 self-center">+{scope.activities.length - 4} more</span>
										)}
									</div>
								</div>
							))}
						</div>
					)}

					{/* Investment summary */}
					{totalAmt > 0 ? (
						<div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 flex items-center gap-3">
							<TrendingUp className="w-4 h-4 text-rose-600 shrink-0" />
							<div className="flex-1 min-w-0">
								<p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Total Investment</p>
								<p className="text-lg font-extrabold text-rose-700 leading-tight">
									₹{totalAmt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
								</p>
							</div>
							<span className="shrink-0 text-[10px] text-rose-400 font-medium">
								{ledger.length} entr{ledger.length !== 1 ? 'ies' : 'y'}
							</span>
						</div>
					) : (
						<div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5 flex items-center gap-2">
							<TrendingUp className="w-3.5 h-3.5 text-gray-300 shrink-0" />
							<p className="text-[11px] text-gray-400 italic">No investment recorded yet</p>
						</div>
					)}

					{/* Land Media */}
					<div>
						<p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Land Media</p>
						<div className="grid grid-cols-3 gap-1.5">
							{[0, 1, 2].map(idx => (
								<div key={idx} className="h-16 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
									{images[idx] ? (
										<img
											src={images[idx]}
											alt={`Photo ${idx + 1}`}
											className="h-full w-full object-cover cursor-pointer active:opacity-80"
											onClick={() => window.open(images[idx], '_blank')}
										/>
									) : (
										<span className="text-[9px] text-gray-400 font-medium">No image</span>
									)}
								</div>
							))}
						</div>
						{video ? (
							<div className="mt-1.5 rounded-lg border border-gray-200 overflow-hidden bg-black">
								<div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-900">
									<Video className="w-3 h-3 text-gray-400" />
									<span className="text-[10px] text-gray-400 font-medium">Land Video</span>
								</div>
								<video src={video} controls className="w-full block" style={{ maxHeight: 130 }} />
							</div>
						) : (
							<div className="mt-1.5 h-10 rounded-lg border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center gap-1.5">
								<Video className="w-3.5 h-3.5 text-gray-300" />
								<span className="text-[10px] text-gray-400">No video</span>
							</div>
						)}
					</div>

				</div>
			)}
		</div>
	);
};

// ─────────────────────────────────────────────────────────────
// HomePage
// ─────────────────────────────────────────────────────────────
const HomePage = () => {
	const { token } = useAuth();
	const [farms, setFarms]           = useState<Farm[]>([]);
	const [loading, setLoading]       = useState(true);
	const [error, setError]           = useState<string | null>(null);
	const [search, setSearch]         = useState('');
	const [expandFarm, setExpandFarm] = useState<Farm | null>(null);

	useEffect(() => {
		const base = getBaseUrl().replace(/\/$/, '');
		fetch(`${base}/farmer_managment/get_farms`, {
			headers: token ? { Authorization: `Bearer ${token}` } : {},
		})
			.then(r => r.json())
			.then((data: any) => {
				if (Array.isArray(data?.farms)) setFarms(data.farms);
				else throw new Error(data?.message || 'Unexpected response format');
			})
			.catch((e: any) => setError(e?.message ?? 'Failed to load farms'))
			.finally(() => setLoading(false));
	}, [token]);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return farms;
		return farms.filter(f =>
			f.farm_id.toLowerCase().includes(q) ||
			(f.farmer_name ?? '').toLowerCase().includes(q) ||
			(f.land_data?.village ?? '').toLowerCase().includes(q) ||
			(f.land_data?.district ?? '').toLowerCase().includes(q) ||
			(f.land_data?.state ?? '').toLowerCase().includes(q) ||
			(f.crop_type ?? '').toLowerCase().includes(q) ||
			(f.land_data?.farming_option ?? '').toLowerCase().includes(q)
		);
	}, [farms, search]);

	const totalArea       = farms.reduce((s, f) => s + (f.area ?? 0), 0);
	const leaseFarms      = farms.filter(f => f.land_data?.farming_option === 'Lease Farming').length;
	const contractFarms   = farms.filter(f => f.land_data?.farming_option === 'Contract Farming').length;
	const totalInvestment = farms.reduce((s, f) =>
		s + (f.farm_investment_ledger ?? []).reduce((si, e) => si + (e.amount ?? 0), 0), 0);

	return (
		<div className="pb-4">

			{/* ── Hero strip ── */}
			<div className="bg-gradient-to-br from-emerald-600 to-emerald-800 px-4 pt-5 pb-6">
				<div className="flex items-center justify-between mb-4">
					<div>
						<h1 className="text-xl font-bold text-white leading-tight">Farm Portfolio</h1>
						<p className="text-emerald-300 text-xs mt-0.5">All registered farm parcels</p>
					</div>
					<div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center">
						<LayoutGrid className="w-5 h-5 text-white" />
					</div>
				</div>

				<div className="grid grid-cols-2 gap-2 mb-2">
					{[
						{ label: 'Total Farms',   value: String(farms.length) },
						{ label: 'Total Area',    value: `${totalArea.toLocaleString('en-IN')} ac` },
						{ label: 'Lease Farming', value: String(leaseFarms) },
						{ label: 'Contract',      value: String(contractFarms) },
					].map(kpi => (
						<div key={kpi.label} className="rounded-xl bg-white/15 px-3 py-2.5">
							<p className="text-[10px] font-semibold text-emerald-200 leading-none">{kpi.label}</p>
							<p className="text-xl font-extrabold text-white leading-tight mt-0.5">{kpi.value}</p>
						</div>
					))}
				</div>

				{totalInvestment > 0 && (
					<div className="rounded-xl bg-white/10 px-3 py-2.5 flex items-center justify-between">
						<div className="flex items-center gap-2">
							<TrendingUp className="w-4 h-4 text-emerald-300" />
							<span className="text-xs font-semibold text-emerald-200">Total Investment</span>
						</div>
						<span className="text-base font-extrabold text-white">
							₹{totalInvestment.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
						</span>
					</div>
				)}
			</div>

			{/* ── Search bar ── */}
			<div className="px-4 -mt-4 relative z-10">
				<div className="relative shadow-lg">
					<Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
					<input
						value={search}
						onChange={e => setSearch(e.target.value)}
						placeholder="Search by name, village, crop…"
						className="w-full pl-10 pr-10 py-3 rounded-xl bg-white border border-gray-200 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
					/>
					{search && (
						<button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5">
							<X className="w-4 h-4 text-gray-400" />
						</button>
					)}
				</div>
			</div>

			{/* ── Farm list ── */}
			<div className="px-4 mt-5 space-y-4">
				{loading ? (
					<div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
						<RefreshCw className="w-8 h-8 animate-spin opacity-40" />
						<p className="text-sm font-medium">Loading farms…</p>
					</div>
				) : error ? (
					<div className="flex flex-col items-center justify-center py-24">
						<p className="text-sm text-red-500 font-medium">{error}</p>
					</div>
				) : filtered.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-24 text-gray-400">
						<Map className="w-10 h-10 mb-3 opacity-25" />
						<p className="text-sm font-medium">No farms found</p>
					</div>
				) : (
					<>
						{search && (
							<p className="text-xs text-gray-500 font-semibold">
								{filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{search}"
							</p>
						)}
						{filtered.map(farm => (
							<FarmCard
								key={farm.farm_id}
								farm={farm}
								onViewMap={setExpandFarm}
							/>
						))}
					</>
				)}
			</div>

			{expandFarm && <MapExpandModal farm={expandFarm} onClose={() => setExpandFarm(null)} />}
		</div>
	);
};

export default HomePage;
