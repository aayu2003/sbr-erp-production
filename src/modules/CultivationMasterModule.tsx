// ============================================================
// CULTIVATION MASTER MODULE - SINGLE FILE EXPORT
// ============================================================
// This file contains everything needed for the Cultivation Master module.
// Copy this entire file and adjust imports based on your project structure.
// 
// Required dependencies:
// - react-router-dom
// - lucide-react
// - date-fns
// - sonner (for toast notifications)
// - shadcn/ui components: Button, Card, Input, Select, Table
// ============================================================

import { useState, useEffect, Fragment } from 'react';
import { useNavigate, useParams, Routes, Route } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
	Plus,
	Calendar,
	Edit,
	Trash2,
	Eye,
	ArrowLeft,
	Save,
	Rows3,
	Rows4,
	Footprints,
	Scissors,
	Tractor,
	Flower2,
	Droplets,
	Layers,
	Shovel,
	Hammer,
	Sprout,
	HelpCircle,
	ListPlus,
	Image as ImageIcon,
	Upload,
	GripVertical,
	Lock,
	Unlock,
	ChevronDown,
	ChevronRight,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import getBaseUrl from '@/lib/config';
import Blocks from '@/pages/Blocks';

// ============================================================
// TYPES
// ============================================================

export type ActivityCategory =
	| 'Cleaning'
	| 'Land Preparation'
	| 'Fertilizer Spreading'
	| 'Agro Chemical Spreading'
	| 'Irrigation'
	| 'Sowing'
	| 'Crop Maintenance'
	| 'Harvesting'
	| 'Post Harvest'
	| 'Mulching'
	| 'Other';

export interface Activity {
	id: string;
	name: string;
	category: ActivityCategory;
	icon: string;
	crop_type?: string[];
	dosage?: {
		item_id: string;
		per_acre_dosage: number;
		UOM: string;
	};
}

export type FrequencyType = 'once' | 'every_n_days' | 'weekly';

export interface PlannerActivity {
	id: string;
	sno: number;
	activityId: string;
	dayOffset: number;
	frequency: FrequencyType;
	frequencyValue?: number;
	workQty: number;
}

export interface MasterPlanner {
	id: string;
	name: string;
	cropType?: 'Paddy' | 'Rahar' | 'Napier' | 'Maize';
	activities: PlannerActivity[];
	createdAt: Date;
	updatedAt: Date;
}

const CROP_TYPE_API_MAP: Record<'Paddy' | 'Rahar' | 'Napier' | 'Maize', 'paddy' | 'rahar' | 'napier' | 'maize'> = {
	Paddy: 'paddy',
	Rahar: 'rahar',
	Napier: 'napier',
	Maize: 'maize',
};

// ============================================================
// CONSTANTS - ACTIVITIES LIST
// ============================================================

export const ACTIVITY_CATEGORIES: ActivityCategory[] = [
	'Cleaning',
	'Land Preparation',
	'Fertilizer Spreading',
	'Agro Chemical Spreading',
	'Irrigation',
	'Sowing',
	'Crop Maintenance',
	'Harvesting',
	'Post Harvest',
	'Mulching',
	'Other',
];

const normalizeActivityCategory = (category: string): ActivityCategory => {
	if (ACTIVITY_CATEGORIES.includes(category as ActivityCategory)) return category as ActivityCategory;
	if (category === 'Crop Care') return 'Crop Maintenance';
	if (category === 'Plantation') return 'Crop Maintenance';
	return 'Other';
};

// Activities are fetched from and persisted to the backend (admin_cultivation/get_cultivation_activities,
// admin_cultivation/add_cultivation_activity) rather than the bundled activities.json.
const ACTIVITY_ORDER_STORAGE_KEY = 'operations-master-activity-order-by-crop';
const ERP_APPLICABLE_CROPS_STORAGE_KEY = 'operations-master-applicable-crops';
const ERP_CUSTOM_CROPS_STORAGE_KEY = 'operations-master-custom-crops';
const ERP_BASE_CROP_EDITS_STORAGE_KEY = 'operations-master-base-crop-edits';
const DOSAGE_CONTROLS_STORAGE_KEY = 'operations-master-dosage-controls';

function loadFromStorage<T>(key: string, fallback: T): T {
	try {
		const stored = localStorage.getItem(key);
		return stored ? JSON.parse(stored) : fallback;
	} catch {
		return fallback;
	}
}

function saveToStorage<T>(key: string, value: T) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// ignore storage failures (e.g. private browsing quota)
	}
}

// ============================================================
// DEMO DATA
// ============================================================

export const demoMasterPlanners: MasterPlanner[] = [
	{
		id: 'planner-1',
		name: 'Tomato Cultivation Plan',
		activities: [
			{ id: 'a1', sno: 1, activityId: 'initial-ploughing', dayOffset: 0, frequency: 'once', workQty: 5 },
			{ id: 'a2', sno: 2, activityId: 'soil-pulverization', dayOffset: 3, frequency: 'once', workQty: 5 },
			{ id: 'a3', sno: 3, activityId: 'bed-making-land', dayOffset: 5, frequency: 'once', workQty: 5 },
			{ id: 'a4', sno: 4, activityId: 'sowing', dayOffset: 7, frequency: 'once', workQty: 5 },
			{ id: 'a5', sno: 5, activityId: 'irrigation', dayOffset: 7, frequency: 'every_n_days', frequencyValue: 3, workQty: 5 },
			{ id: 'a6', sno: 6, activityId: 'field-visits', dayOffset: 14, frequency: 'weekly', workQty: 5 },
			{ id: 'a7', sno: 7, activityId: 'interweeding-fertilization', dayOffset: 21, frequency: 'every_n_days', frequencyValue: 14, workQty: 3 },
			{ id: 'a8', sno: 8, activityId: 'mulching', dayOffset: 30, frequency: 'once', workQty: 5 },
			{ id: 'a9', sno: 9, activityId: 'harvesting', dayOffset: 90, frequency: 'every_n_days', frequencyValue: 7, workQty: 2 },
		],
		createdAt: new Date('2024-12-01'),
		updatedAt: new Date('2024-12-15'),
	},
	{
		id: 'planner-2',
		name: 'Rice Paddy Schedule',
		activities: [
			{ id: 'b1', sno: 1, activityId: 'ploughing', dayOffset: 0, frequency: 'once', workQty: 10 },
			{ id: 'b2', sno: 2, activityId: 'bed-making-land', dayOffset: 5, frequency: 'once', workQty: 10 },
			{ id: 'b3', sno: 3, activityId: 'sowing', dayOffset: 10, frequency: 'once', workQty: 10 },
			{ id: 'b4', sno: 4, activityId: 'irrigation', dayOffset: 10, frequency: 'every_n_days', frequencyValue: 2, workQty: 10 },
			{ id: 'b5', sno: 5, activityId: 'harvesting', dayOffset: 100, frequency: 'once', workQty: 10 },
		],
		createdAt: new Date('2024-11-20'),
		updatedAt: new Date('2024-11-25'),
	},
];

// ============================================================
// ACTIVITY ICON COMPONENT
// ============================================================

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
	Rows3,
	Rows4,
	Footprints,
	Scissors,
	Tractor,
	Flower2,
	Droplets,
	Layers,
	Shovel,
	Hammer,
	Sprout,
};

interface ActivityIconProps {
	iconName: string;
	className?: string;
}

const ActivityIcon = ({ iconName, className }: ActivityIconProps) => {
	const IconComponent = iconMap[iconName] || HelpCircle;
	return <IconComponent className={cn('h-4 w-4', className)} />;
};

// ============================================================
// CREATE/EDIT MASTER PLANNER PAGE
// ============================================================

interface CreateMasterPlannerProps {
	planners: MasterPlanner[];
	availableActivities: Activity[];
	orderedActivitiesByCrop?: Record<string, Activity[]>;
	onSave: (planner: MasterPlanner) => void;
	embedded?: boolean;
	onClose?: () => void;
}

const CreateMasterPlanner = ({ planners, availableActivities, orderedActivitiesByCrop, onSave, embedded = false, onClose }: CreateMasterPlannerProps) => {
	const navigate = useNavigate();
	const { id } = useParams();

	const existingPlanner = id ? planners.find((p) => p.id === id) : null;

	const [plannerName, setPlannerName] = useState(existingPlanner?.name || '');
	const [cropType, setCropType] = useState<'Paddy' | 'Rahar' | 'Napier' | 'Maize' | ''>(existingPlanner?.cropType || '');
	const [activities, setActivities] = useState<PlannerActivity[]>(
		existingPlanner?.activities || []
	);

	const applySuggestedPlannerName = () => {
		if (!cropType) return;
		setPlannerName(`${cropType} Cultivation Master Plan`);
	};

	const addActivity = () => {
		const newActivity: PlannerActivity = {
			id: `activity-${Date.now()}`,
			sno: activities.length + 1,
			activityId: availableActivities[0]?.id || '',
			dayOffset: 0,
			frequency: 'once',
			workQty: 1,
		};
		setActivities([...activities, newActivity]);
	};

	const loadCropActivities = () => {
		if (!cropType) {
			toast.error('Please select a crop type first');
			return;
		}

		const cropActivities = orderedActivitiesByCrop?.[cropType] || availableActivities.filter((activity) => {
			const crops = activity.crop_type?.length ? activity.crop_type : [];
			return crops.includes(cropType);
		});

		if (cropActivities.length === 0) {
			toast.error(`No activities found for ${cropType}`);
			return;
		}

		setActivities(cropActivities.map((activity, index) => ({
			id: `planner-${cropType}-${activity.id}-${Date.now()}-${index}`,
			sno: index + 1,
			activityId: activity.id,
			dayOffset: index,
			frequency: 'once',
			workQty: 1,
		})));
		toast.success(`${cropActivities.length} ${cropType} activities loaded`);
	};

	const removeActivity = (activityId: string) => {
		const updated = activities
			.filter((a) => a.id !== activityId)
			.map((a, idx) => ({ ...a, sno: idx + 1 }));
		setActivities(updated);
	};

	const updateActivity = (activityId: string, field: keyof PlannerActivity, value: any) => {
		setActivities(activities.map((a) => (a.id === activityId ? { ...a, [field]: value } : a)));
	};


	const handleSave = async () => {
		if (!plannerName.trim()) {
			toast.error('Please enter a planner name');
			return;
		}
		if (!cropType) {
			toast.error('Please select a crop type');
			return;
		}
		if (activities.length === 0) {
			toast.error('Please add at least one activity');
			return;
		}

		// Prepare API payload
		const payload = {
			plan_name: plannerName,
			crop_type: CROP_TYPE_API_MAP[cropType],
			plan_list: activities.map((a, idx) => ({
				index: idx + 1,
				activity: getActivity(a.activityId)?.name || a.activityId,
				day_offset: a.dayOffset,
				work_quantity: a.workQty,
				frequency: a.frequency === 'every_n_days' ? 'daily' : a.frequency, // Map to 'daily' if needed
				every_n_days: a.frequency === 'every_n_days' ? (a.frequencyValue || 0) : 0
			}))
		};

		try {
			const baseUrl = getBaseUrl();
			const response = await fetch(`${baseUrl}/admin_cultivation/save_master_cultivation_plan`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
			});
			if (!response.ok) {
				throw new Error('Failed to save plan');
			}
			toast.success('Plan saved to server!');
		} catch (err) {
			toast.error('Failed to save plan to server');
			return;
		}

		const planner: MasterPlanner = {
			id: existingPlanner?.id || `planner-${Date.now()}`,
			name: plannerName,
			cropType,
			activities,
			createdAt: existingPlanner?.createdAt || new Date(),
			updatedAt: new Date(),
		};

		onSave(planner);
		toast.success(existingPlanner ? 'Planner updated successfully!' : 'Planner created successfully!');
		if (embedded) {
			onClose?.();
		} else {
			navigate('/cultivation-master');
		}
	};

	const getActivity = (activityId: string) => {
		return availableActivities.find((a) => a.id === activityId);
	};

	const getActivityLabel = (activityId: string) => {
		const activity = getActivity(activityId);
		return activity ? `${activity.name} (${activity.category})` : '';
	};

	return (
		<div className={embedded ? '' : 'min-h-screen bg-background'}>
			<div className={embedded ? '' : 'container mx-auto px-4 py-8'}>
				{!embedded && (
					<Button variant="ghost" onClick={() => navigate('/cultivation-master')} className="mb-6 gap-2">
						<ArrowLeft className="h-4 w-4" />
						Back to Planners
					</Button>
				)}

				<Card className={cn('rounded-2xl bg-white', embedded ? 'border-0 shadow-none' : 'border border-slate-200 shadow-sm')}>
					{!embedded && (
						<CardHeader className="px-6 pt-6 md:px-8 md:pt-8">
							<CardTitle className="text-2xl font-bold text-[#0D3A35] md:text-3xl">
								{existingPlanner ? 'Edit Master Planner' : 'Create New Master Planner'}
							</CardTitle>
						</CardHeader>
					)}
					<CardContent className={cn(embedded ? 'space-y-5 p-0' : 'space-y-7 px-6 pb-6 md:px-8 md:pb-8')}>
						<div className={cn('rounded-xl bg-white', embedded ? 'p-0' : 'p-5 md:p-6')}>
							{cropType && (
								<div className="mb-3 flex justify-end">
									<Button type="button" variant="outline" size="sm" className="h-8 border-[#0D3A35]/20 text-[#0D3A35] hover:bg-[#0D3A35]/5" onClick={applySuggestedPlannerName}>
										Use Smart Name
									</Button>
								</div>
							)}
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div className="space-y-1.5">
									<label className="flex items-center gap-2 text-sm font-bold text-[#0D3A35]">
										<Calendar className="h-4 w-4" />
										Planner Name
									</label>
									<Input
										placeholder="e.g., Kharif Paddy Plan - East Block"
										value={plannerName}
										onChange={(e) => setPlannerName(e.target.value)}
										className="h-10 rounded-xl border-slate-200 bg-white text-sm"
									/>
									<p className="text-xs font-medium text-emerald-900/60">
										{plannerName.trim() ? `${plannerName.trim().length} characters` : 'Give this planner a clear, season-ready name'}
									</p>
								</div>
								<div className="space-y-1.5">
									<label className="flex items-center gap-2 text-sm font-bold text-[#0D3A35]">
										<Sprout className="h-4 w-4" />
										Crop Type
									</label>
									<Select value={cropType || 'none'} onValueChange={(value) => setCropType(value === 'none' ? '' : value as 'Paddy' | 'Rahar' | 'Napier' | 'Maize')}>
										<SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm">
											<SelectValue placeholder="Select crop type" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">Select crop type</SelectItem>
											<SelectItem value="Paddy">
												<div className="flex items-center gap-2">
													<Droplets className="h-4 w-4 text-sky-600" />
													<span>Paddy</span>
												</div>
											</SelectItem>
											<SelectItem value="Rahar">
												<div className="flex items-center gap-2">
													<Flower2 className="h-4 w-4 text-amber-600" />
													<span>Rahar</span>
												</div>
											</SelectItem>
											<SelectItem value="Napier">
												<div className="flex items-center gap-2">
													<Layers className="h-4 w-4 text-lime-700" />
													<span>Napier</span>
												</div>
											</SelectItem>
											<SelectItem value="Maize">
												<div className="flex items-center gap-2">
													<Sprout className="h-4 w-4 text-yellow-600" />
													<span>Maize</span>
												</div>
											</SelectItem>
										</SelectContent>
									</Select>
									<p className="text-xs font-medium text-emerald-900/60">
										{cropType ? `Selected crop: ${cropType}` : 'Choose crop to tailor this master planner'}
									</p>
								</div>
							</div>
						</div>

						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<h3 className="text-xl font-bold text-[#0D3A35]">Activities</h3>
								<Button onClick={addActivity} className="h-10 gap-2 rounded-xl bg-[#0D3A35] px-5 font-bold hover:bg-[#092b27]">
									<Plus className="h-4 w-4" />
									Add Activity
								</Button>
							</div>

							{activities.length === 0 ? (
								<div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-5 text-center">
									<p className="mb-4 text-base font-medium text-emerald-900/60">No activities loaded yet</p>
									<Button onClick={loadCropActivities} variant="outline" className="h-10 gap-2 rounded-xl border-slate-200 px-5 font-bold text-[#0D3A35] hover:bg-[#0D3A35]/5">
										<Plus className="h-4 w-4" />
										Load Activities
									</Button>
								</div>
							) : (
								<div className="overflow-hidden rounded-2xl border border-slate-200">
									<Table>
										<TableHeader>
											<TableRow className="bg-[#0D3A35] hover:bg-[#0D3A35]">
												<TableHead className="w-16 text-white/80">S.No</TableHead>
												<TableHead className="min-w-[250px] text-white">Activity</TableHead>
												<TableHead className="w-32 text-white">Day Offset</TableHead>
												<TableHead className="w-32 text-white">Work Qty</TableHead>
												<TableHead className="w-48 text-white">Frequency</TableHead>
												<TableHead className="w-32 text-white">Every N Days</TableHead>
												<TableHead className="w-16 text-white"></TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{activities.map((activity) => (
												<TableRow key={activity.id}>
													<TableCell className="font-medium">{activity.sno}</TableCell>
													<TableCell>
														<Select
															value={activity.activityId}
															onValueChange={(value) => updateActivity(activity.id, 'activityId', value)}
														>
															<SelectTrigger>
																<div className="flex items-center gap-2">
																	<ActivityIcon iconName={getActivity(activity.activityId)?.icon || ''} className="text-primary" />
																	<span>{getActivityLabel(activity.activityId)}</span>
																</div>
															</SelectTrigger>
															<SelectContent>
																{availableActivities.map((act) => (
																	<SelectItem key={act.id} value={act.id}>
																		<div className="flex items-center gap-2">
																			<ActivityIcon iconName={act.icon} className="text-primary" />
																			<span>{act.name} ({act.category})</span>
																		</div>
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
													</TableCell>
													<TableCell>
														<Input
															type="number"
															min={0}
															max={100}
															value={activity.dayOffset}
															onChange={(e) => updateActivity(activity.id, 'dayOffset', parseInt(e.target.value) || 0)}
															className="w-24 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
														/>
													</TableCell>
													<TableCell>
														<Input
															type="number"
															min={0.1}
															step={0.1}
															value={activity.workQty}
															onChange={(e) => updateActivity(activity.id, 'workQty', parseFloat(e.target.value) || 1)}
															className="w-24 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
														/>
													</TableCell>
													<TableCell>
														<Select
															value={activity.frequency}
															onValueChange={(value: FrequencyType) => updateActivity(activity.id, 'frequency', value)}
														>
															<SelectTrigger>
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value="once">Once</SelectItem>
																<SelectItem value="every_n_days">Every N Days</SelectItem>
																<SelectItem value="weekly">Weekly</SelectItem>
															</SelectContent>
														</Select>
													</TableCell>
													<TableCell>
														{activity.frequency === 'every_n_days' && (
															<Input
																type="number"
																min={1}
																value={activity.frequencyValue || 1}
																onChange={(e) => updateActivity(activity.id, 'frequencyValue', parseInt(e.target.value) || 1)}
																className="w-20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
															/>
														)}
													</TableCell>
													<TableCell>
														<Button
															variant="ghost"
															size="sm"
															onClick={() => removeActivity(activity.id)}
															className="text-destructive hover:text-destructive hover:bg-destructive/10"
														>
															<Trash2 className="h-4 w-4" />
														</Button>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							)}
						</div>

						<div className="flex justify-end border-t border-slate-200 pt-4">
							<Button onClick={handleSave} size="lg" className="h-11 gap-2 rounded-xl bg-[#0D3A35] px-8 font-bold hover:bg-[#092b27]">
								<Save className="h-4 w-4" />
								Save Planner
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
};

// ============================================================
// PLANNER LIST PAGE
// ============================================================

interface PlannerListProps {
	planners: MasterPlanner[];
	activities: Activity[];
	onDelete: (id: string) => void;
	onSavePlanner: (planner: MasterPlanner) => void;
	onSaveActivity: (activity: Activity) => void;
	onDeleteActivity: (id: string) => void;
}

type DosageControlRow = {
	id: string;
	cropName: string;
	activityId: string;
	inventoryItemId: string;
	uom: string;
	dosagePerAcre: string;
	locked: boolean;
};

type DosageInventoryItem = {
	id: string;
	name: string;
	uom: string;
	category?: string;
};

type LandDistributionFarm = {
	farm_id: string;
	farmer_id?: string;
	ownerName?: string;
	block_id?: string;
	crop_type?: string;
	area?: number;
	plotLabel?: string;
	plotName?: string;
	land_data?: {
		village?: string;
		district?: string;
		state?: string;
		farming_option?: string;
	};
};

const getFirstArray = (value: any, keys: string[]) => {
	for (const key of keys) {
		if (Array.isArray(value?.[key])) return value[key];
	}
	return [];
};

// Farms from /farmer_managment/get_farms carry crop_type & area per plot inside
// `land_plots`, not on the farm record itself, and a single farm can span multiple
// crops. Expand each farm into one distribution row per plot; fall back to the
// farm-level fields (used by /lead_making/get_land_mappings) when land_plots is absent.
const toLandDistributionRows = (item: any, index: number): LandDistributionFarm[] => {
	const basicDetails = item?.basic_details || {};
	const farm_id = String(item?.farm_id || item?.land_id || item?.lead_id || item?.id || `land-${index + 1}`);
	const shared = {
		farm_id,
		farmer_id: item?.farmer_id ? String(item.farmer_id) : undefined,
		ownerName: String(item?.owner_name || item?.farmer_name || item?.farmerName || item?.land_owner || item?.ownerName || basicDetails?.owner_name || basicDetails?.farmer_name || ''),
		block_id: item?.block_id ? String(item.block_id) : undefined,
		land_data: {
			village: String(item?.land_data?.village || basicDetails?.village || basicDetails?.address || item?.village || ''),
			district: String(item?.land_data?.district || basicDetails?.district || item?.district || ''),
			state: String(item?.land_data?.state || basicDetails?.state || item?.state || ''),
			farming_option: String(item?.land_data?.farming_option || basicDetails?.farming_option || item?.farming_option || ''),
		},
	};

	const plots = Array.isArray(item?.land_plots) ? item.land_plots.filter((plot: any) => plot?.crop_type) : [];
	if (plots.length > 0) {
		return plots.map((plot: any) => ({
			...shared,
			crop_type: String(plot?.crop_type || ''),
			area: Number.isFinite(Number(plot?.plot_area)) ? Number(plot.plot_area) : 0,
			plotLabel: plot?.plot_name ? `Plot ${plot.plot_name}` : undefined,
			plotName: plot?.plot_name ? String(plot.plot_name) : undefined,
		}));
	}

	const area = Number(
		item?.area ??
		item?.total_area ??
		item?.areaAcres ??
		item?.acres ??
		item?.landMapping?.totalArea ??
		basicDetails?.total_area ??
		basicDetails?.area ??
		0
	);

	return [{
		...shared,
		crop_type: String(item?.crop_type || item?.crop || item?.cropName || basicDetails?.crop_type || basicDetails?.crop || ''),
		area: Number.isFinite(area) ? area : 0,
	}];
};

const FALLBACK_DOSAGE_INVENTORY_ITEMS: DosageInventoryItem[] = [
	{ name: 'SSP', uom: 'Kg' },
	{ name: 'DAP', uom: 'Kg' },
	{ name: 'Urea', uom: 'Kg' },
	{ name: 'MOP', uom: 'Kg' },
	{ name: 'NPK', uom: 'Kg' },
	{ name: 'Micronutrients', uom: 'Kg' },
	{ name: 'Organic Manure', uom: 'Kg' },
	{ name: 'Paddy Seed', uom: 'Kg' },
	{ name: 'Rahar Seed', uom: 'Kg' },
	{ name: 'Napier Slips', uom: 'Nos' },
	{ name: 'Maize Seed', uom: 'Kg' },
	{ name: 'Glyphosate 71%', uom: 'Ml' },
	{ name: 'Saathi Herbicide', uom: 'Gm' },
	{ name: 'Pesticide', uom: 'Ml' },
	{ name: 'Fungicide', uom: 'Ml' },
	{ name: 'Diesel', uom: 'Litres' },
	{ name: 'Water', uom: 'Litres' },
	{ name: 'Mulching Sheet', uom: 'Rolls' },
	{ name: 'Labour', uom: 'Mandays' },
].map((item) => ({ id: item.name, ...item }));

const PlannerList = ({ planners, activities, onDelete, onSavePlanner, onSaveActivity, onDeleteActivity }: PlannerListProps) => {
	const navigate = useNavigate();

	const [activeMasterTab, setActiveMasterTab] = useState<'Cultivation Setup' | 'Dosage Control' | 'Land Heirarchy'>('Cultivation Setup');
	const [applicableCrops, setApplicableCrops] = useState<string[]>(() =>
		loadFromStorage(ERP_APPLICABLE_CROPS_STORAGE_KEY, ['Paddy', 'Rahar', 'Napier'])
	);
	const [customCropOptions, setCustomCropOptions] = useState<Array<{ name: string; description: string; imageUrl?: string }>>(() =>
		loadFromStorage(ERP_CUSTOM_CROPS_STORAGE_KEY, [])
	);
	const [baseCropEdits, setBaseCropEdits] = useState<Record<string, { name: string; description: string; imageUrl?: string }>>(() =>
		loadFromStorage(ERP_BASE_CROP_EDITS_STORAGE_KEY, {})
	);
	const [newCropName, setNewCropName] = useState('');
	const [newCropDescription, setNewCropDescription] = useState('');
	const [newCropImage, setNewCropImage] = useState('');
	const [editingCropName, setEditingCropName] = useState<string | null>(null);
	const [editingCropBaseName, setEditingCropBaseName] = useState<string | null>(null);
	const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
	const [newActivityName, setNewActivityName] = useState('');
	const [newActivityCategory, setNewActivityCategory] = useState<ActivityCategory>('Other');
	const [newActivityIcon, setNewActivityIcon] = useState<string>('Sprout');
	const [newActivityCropNames, setNewActivityCropNames] = useState<string[]>(['All Crops']);
	const [isSavingActivity, setIsSavingActivity] = useState(false);
	const [activityOrderByCrop, setActivityOrderByCrop] = useState<Record<string, string[]>>(() =>
		loadFromStorage(ACTIVITY_ORDER_STORAGE_KEY, {})
	);
	const [draggedActivity, setDraggedActivity] = useState<{ id: string; cropName: string } | null>(null);
	const [dosageControls, setDosageControls] = useState<DosageControlRow[]>(() =>
		loadFromStorage(DOSAGE_CONTROLS_STORAGE_KEY, [] as DosageControlRow[])
	);
	const [savingDosageLockIds, setSavingDosageLockIds] = useState<Record<string, boolean>>({});
	const [inventoryItems, setInventoryItems] = useState<DosageInventoryItem[]>(FALLBACK_DOSAGE_INVENTORY_ITEMS);
	const [isLoadingInventoryItems, setIsLoadingInventoryItems] = useState(false);
	const [landParcels, setLandParcels] = useState<LandDistributionFarm[]>([]);
	const [isLoadingLandParcels, setIsLoadingLandParcels] = useState(false);
	const [selectedDistributionItemId, setSelectedDistributionItemId] = useState('');
	const [expandedLandParcels, setExpandedLandParcels] = useState<Set<string>>(new Set());
	const toggleLandParcelExpanded = (farmId: string) => {
		setExpandedLandParcels((current) => {
			const next = new Set(current);
			if (next.has(farmId)) next.delete(farmId);
			else next.add(farmId);
			return next;
		});
	};

	const masterTabs = [
		{ label: 'Cultivation Setup' as const, icon: Sprout },
		{ label: 'Dosage Control' as const, icon: Droplets },
		{ label: 'Land Heirarchy' as const, icon: Layers },
	];

	const defaultBaseCropOptions = [
		{ name: 'Paddy', icon: Droplets, description: 'Wetland cultivation crop', imageUrl: '' },
		{ name: 'Rahar', icon: Flower2, description: 'Pulse crop operations', imageUrl: '' },
		{ name: 'Napier', icon: Layers, description: 'Fodder crop planning', imageUrl: '' },
	];

	const baseCropOptions = defaultBaseCropOptions.map((crop) => ({
		...crop,
		...(baseCropEdits[crop.name] || {}),
		baseName: crop.name,
	}));

	const cropOptions = [
		...baseCropOptions,
		...customCropOptions.map((crop) => ({
			...crop,
			icon: Sprout,
			baseName: null,
		})),
	];

	useEffect(() => {
		const fetchInventoryItems = async () => {
			setIsLoadingInventoryItems(true);
			try {
				const response = await fetch(`${getBaseUrl()}/inventory/get_all_item`);
				const data: any = await response.json().catch(() => null);
				const apiItems = Array.isArray(data?.items) ? data.items : [];

				if (!response.ok || !apiItems.length) {
					setInventoryItems(FALLBACK_DOSAGE_INVENTORY_ITEMS);
					return;
				}

				setInventoryItems(apiItems.map((item: any, index: number) => ({
					id: String(item?.Invent_id || item?.new_item_code || item?.id || `inventory-${index}`),
					name: String(item?.item_name || item?.name || item?.item || item?.new_item_code || `Inventory Item ${index + 1}`),
					uom: String(item?.unit || item?.uom || 'Nos'),
					category: String(item?.category || 'Inventory'),
				})));
			} catch {
				setInventoryItems(FALLBACK_DOSAGE_INVENTORY_ITEMS);
			} finally {
				setIsLoadingInventoryItems(false);
			}
		};

		fetchInventoryItems();
	}, []);

	useEffect(() => {
		const fetchLandParcels = async () => {
			setIsLoadingLandParcels(true);
			try {
				const base = getBaseUrl().replace(/\/$/, '');
				const farmResponse = await fetch(`${base}/farmer_managment/get_farms`);
				const farmData: any = await farmResponse.json().catch(() => null);
				const farms = getFirstArray(farmData, ['farms', 'farm', 'lands', 'data', 'items']);

				if (farms.length > 0) {
					setLandParcels(farms.flatMap(toLandDistributionRows));
					return;
				}

				const mappingResponse = await fetch(`${base}/lead_making/get_land_mappings`);
				const mappingData: any = await mappingResponse.json().catch(() => null);
				const mappings = getFirstArray(mappingData, ['data', 'lands', 'farms', 'items']);
				setLandParcels(mappings.flatMap(toLandDistributionRows));
			} catch {
				setLandParcels([]);
			} finally {
				setIsLoadingLandParcels(false);
			}
		};

		fetchLandParcels();
	}, []);

	useEffect(() => {
		const missingOwnerFarms = landParcels.filter((land) => land.farm_id && !land.ownerName);
		const uniqueFarmIds = Array.from(new Set(missingOwnerFarms.map((land) => land.farm_id)));
		if (uniqueFarmIds.length === 0) return;

		const base = getBaseUrl().replace(/\/$/, '');
		uniqueFarmIds.forEach((farmId) => {
			fetch(`${base}/farmer_managment/get_farmer_details_from_farm_id/${farmId}`)
				.then((response) => response.json())
				.then((data: any) => {
					const ownerName = String(
						data?.farmer?.farmer_name ||
						data?.farmer?.owner_name ||
						data?.farmer_name ||
						data?.owner_name ||
						''
					).trim();
					if (!ownerName) return;
					setLandParcels((current) =>
						current.map((entry) => entry.farm_id === farmId ? { ...entry, ownerName } : entry)
					);
				})
				.catch(() => undefined);
		});
	}, [landParcels]);

	const dosageRows = activities.map((activity) => ({
		...activity,
		defaultUnit:
			activity.category === 'Irrigation'
				? 'Litres / acre'
				: activity.category === 'Fertilizer Spreading'
					? 'Kg / acre'
					: activity.category === 'Agro Chemical Spreading'
						? 'Ml / acre'
						: 'As per SOP',
		controlType:
			activity.category === 'Irrigation'
				? 'Water dosage'
				: activity.category === 'Fertilizer Spreading'
					? 'Nutrient dosage'
					: activity.category === 'Agro Chemical Spreading'
						? 'Application dosage'
						: 'Operational control',
	}));

	const addDosageControl = () => {
		const defaultCropName = activityTableCropColumns[0] || '';
		const defaultInventoryItem = inventoryItems[0] || FALLBACK_DOSAGE_INVENTORY_ITEMS[0];
		setDosageControls((current) => [
			...current,
			{
				id: `dosage-${Date.now()}`,
				cropName: defaultCropName,
				activityId: activitiesByCrop[defaultCropName]?.[0]?.id || '',
				inventoryItemId: defaultInventoryItem.id,
				uom: defaultInventoryItem.uom,
				dosagePerAcre: '',
				locked: false,
			},
		]);
	};

	const updateDosageControl = (id: string, field: Exclude<keyof DosageControlRow, 'locked'>, value: string) => {
		setDosageControls((current) =>
			current.map((row) => {
				if (row.id !== id) return row;
				if (row.locked) return row;
				if (field === 'cropName') {
					return {
						...row,
						cropName: value,
						activityId: activitiesByCrop[value]?.[0]?.id || '',
					};
				}
				if (field === 'inventoryItemId') {
					const item = inventoryItems.find((inventoryItem) => inventoryItem.id === value);
					return { ...row, inventoryItemId: value, uom: item?.uom || '' };
				}
				return { ...row, [field]: value };
			})
		);
	};

	const toggleDosageLock = async (id: string) => {
		const row = dosageControls.find((r) => r.id === id);
		if (!row) return;

		if (row.locked) {
			setDosageControls((current) => current.map((r) => (r.id === id ? { ...r, locked: false } : r)));
			return;
		}

		const item = getInventoryItemForDosage(row);
		const perAcreDosage = parseFloat(row.dosagePerAcre);

		if (!row.activityId || !item?.id || !Number.isFinite(perAcreDosage) || perAcreDosage <= 0) {
			toast.error('Select an activity, item, and a valid dosage before locking');
			return;
		}

		setSavingDosageLockIds((prev) => ({ ...prev, [id]: true }));
		try {
			const baseUrl = getBaseUrl();
			const response = await fetch(`${baseUrl}/admin_cultivation/add_dosage_to_activity`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: row.activityId,
					// The backend resolves the activity by this field's value, which must be the activity id (not its display name).
					activity: row.activityId,
					item_id: item.id,
					per_acre_dosage: perAcreDosage,
					UOM: item.uom || row.uom || '',
				}),
			});
			if (!response.ok) throw new Error('Failed to save dosage');
		} catch (err) {
			toast.error('Failed to save dosage to server');
			return;
		} finally {
			setSavingDosageLockIds((prev) => {
				const next = { ...prev };
				delete next[id];
				return next;
			});
		}

		setDosageControls((current) => current.map((r) => (r.id === id ? { ...r, locked: true } : r)));
		toast.success('Dosage locked');
	};

	const deleteDosageControl = (id: string) => {
		setDosageControls((current) => current.filter((row) => row.id !== id));
	};

	useEffect(() => {
		saveToStorage(DOSAGE_CONTROLS_STORAGE_KEY, dosageControls);
	}, [dosageControls]);

	const normalizeCropName = (value?: string) => {
		const crop = String(value || '').trim().toLowerCase();
		if (crop === 'ragi') return 'rahar';
		return crop;
	};

	const getDosageInventoryKey = (row: DosageControlRow) => String(row.inventoryItemId || (row as any).inventoryItem || '');
	const getInventoryItemForDosage = (row: DosageControlRow) => {
		const key = getDosageInventoryKey(row).toLowerCase();
		return inventoryItems.find((item) => item.id.toLowerCase() === key || item.name.toLowerCase() === key);
	};
	const getDistributionItemKey = (row: DosageControlRow) => getInventoryItemForDosage(row)?.id || getDosageInventoryKey(row);
	const distributionItemOptions = dosageControls.reduce<DosageInventoryItem[]>((options, row) => {
		const item = getInventoryItemForDosage(row) || {
			id: getDosageInventoryKey(row),
			name: getDosageInventoryKey(row),
			uom: row.uom || '-',
			category: 'Dosage Item',
		};
		if (!options.some((entry) => entry.id === item.id)) options.push(item);
		return options;
	}, []);
	const effectiveDistributionItemId = selectedDistributionItemId && distributionItemOptions.some((item) => item.id === selectedDistributionItemId)
		? selectedDistributionItemId
		: distributionItemOptions[0]?.id || '';
	const selectedDistributionItem = inventoryItems.find((item) => item.id === effectiveDistributionItemId);
	const dosageDistributionRows = landParcels
		.map((land, landIndex) => {
			const landCrop = normalizeCropName(land.crop_type);
			const area = Number(land.area || 0);
			const matchingRows = dosageControls.filter((row) =>
				getDistributionItemKey(row) === effectiveDistributionItemId && normalizeCropName(row.cropName) === landCrop
			);
			const dosage = matchingRows.reduce((sum, row) => sum + Number(row.dosagePerAcre || 0), 0);
			const uom = selectedDistributionItem?.uom || matchingRows[0]?.uom || '-';

			return {
				id: `${land.farm_id}-${landIndex}-${effectiveDistributionItemId || 'no-item'}`,
				farmId: land.farm_id,
				plotLabel: land.plotLabel,
				plotName: land.plotName,
				ownerName: land.ownerName || '-',
				location: [land.land_data?.village, land.land_data?.district, land.land_data?.state].filter(Boolean).join(', '),
				area,
				uom,
				dosage,
				requiredQuantity: area * dosage,
				hasDosage: matchingRows.length > 0,
			};
		})
		.filter((row) => row.hasDosage);

	const dosageDistributionGroups = (() => {
		const groups = new Map<string, {
			farmId: string;
			ownerName: string;
			location: string;
			totalArea: number;
			totalRequiredQuantity: number;
			uom: string;
			plots: typeof dosageDistributionRows;
		}>();

		dosageDistributionRows.forEach((row) => {
			if (!groups.has(row.farmId)) {
				groups.set(row.farmId, {
					farmId: row.farmId,
					ownerName: row.ownerName,
					location: row.location,
					totalArea: 0,
					totalRequiredQuantity: 0,
					uom: row.uom,
					plots: [],
				});
			}
			const group = groups.get(row.farmId)!;
			group.totalArea += row.area;
			group.totalRequiredQuantity += row.requiredQuantity;
			group.plots.push(row);
		});

		const result = Array.from(groups.values());
		result.forEach((group) => {
			group.plots.sort((a, b) => (a.plotName || '').localeCompare(b.plotName || '', undefined, { numeric: true }));
		});
		result.sort((a, b) => a.farmId.localeCompare(b.farmId, undefined, { numeric: true }));
		return result;
	})();

	const activityCropOptions = ['All Crops', ...cropOptions.map((crop) => crop.name)];
	const activityTableCropColumns = cropOptions.map((crop) => crop.name);
	const getActivityCropNames = (activity: Activity) => {
		if (activity.crop_type?.length) return activity.crop_type;
		return activityTableCropColumns;
	};
	const rawActivitiesByCrop = activityTableCropColumns.reduce<Record<string, Activity[]>>((acc, cropName) => {
		acc[cropName] = activities.filter((activity) => {
			return getActivityCropNames(activity).includes(cropName);
		});
		return acc;
	}, {});
	const activitiesByCrop = activityTableCropColumns.reduce<Record<string, Activity[]>>((acc, cropName) => {
		const cropActivities = rawActivitiesByCrop[cropName] || [];
		const order = activityOrderByCrop[cropName] || [];
		acc[cropName] = [
			...order
				.map((activityId) => cropActivities.find((activity) => activity.id === activityId))
				.filter((activity): activity is Activity => Boolean(activity)),
			...cropActivities.filter((activity) => !order.includes(activity.id)),
		];
		return acc;
	}, {});
	const activityTableRowCount = Math.max(0, ...Object.values(activitiesByCrop).map((cropActivities) => cropActivities.length));
	const visibleActivityCropColumns = Math.max(1, Math.min(activityTableCropColumns.length, 4));
	const activityTableMinWidth = activityTableCropColumns.length > 4
		? `${72 + activityTableCropColumns.length * 180}px`
		: '100%';
	const activityCropColumnWidth = activityTableCropColumns.length > 4
		? '180px'
		: `calc((100% - 4.5rem) / ${visibleActivityCropColumns})`;

	// The backend returns each activity's saved dosage inline (admin_cultivation/get_cultivation_activities).
	// Hydrate/reconcile the dosage control rows from that so a locked dosage shows up for everyone,
	// not just in the browser that originally locked it.
	useEffect(() => {
		setDosageControls((current) => {
			let changed = false;
			const next = [...current];

			activities.forEach((activity) => {
				if (!activity.dosage) return;
				const crops = getActivityCropNames(activity);
				crops.forEach((cropName) => {
					const existingIndex = next.findIndex((row) => row.activityId === activity.id && row.cropName === cropName);
					const serverRow: DosageControlRow = {
						id: existingIndex >= 0 ? next[existingIndex].id : `server-${activity.id}-${cropName}`,
						cropName,
						activityId: activity.id,
						inventoryItemId: activity.dosage!.item_id,
						uom: activity.dosage!.UOM,
						dosagePerAcre: String(activity.dosage!.per_acre_dosage),
						locked: true,
					};
					if (existingIndex >= 0) {
						const existing = next[existingIndex];
						const isSame =
							existing.inventoryItemId === serverRow.inventoryItemId &&
							existing.uom === serverRow.uom &&
							existing.dosagePerAcre === serverRow.dosagePerAcre &&
							existing.locked === true;
						if (!isSame) {
							next[existingIndex] = serverRow;
							changed = true;
						}
					} else {
						next.push(serverRow);
						changed = true;
					}
				});
			});

			return changed ? next : current;
		});
	}, [activities]);

	const resetNewActivityForm = () => {
		setEditingActivityId(null);
		setNewActivityName('');
		setNewActivityCategory('Other');
		setNewActivityIcon('Sprout');
		setNewActivityCropNames(['All Crops']);
	};

	const startEditActivity = (activity: Activity) => {
		setEditingActivityId(activity.id);
		setNewActivityName(activity.name);
		setNewActivityCategory(activity.category);
		setNewActivityIcon(activity.icon);
		setNewActivityCropNames(activity.crop_type?.length ? activity.crop_type : ['All Crops']);
	};

	const toggleActivityCropSelection = (cropName: string) => {
		setNewActivityCropNames((current) => {
			if (cropName === 'All Crops') return ['All Crops'];
			const withoutAll = current.filter((crop) => crop !== 'All Crops');
			const next = withoutAll.includes(cropName)
				? withoutAll.filter((crop) => crop !== cropName)
				: [...withoutAll, cropName];
			return next.length ? next : ['All Crops'];
		});
	};

	const handleAddActivitySubmit = async () => {
		if (!newActivityName.trim()) {
			toast.error('Please enter an activity name');
			return;
		}
		if (newActivityCropNames.length === 0) {
			toast.error('Please select at least one crop');
			return;
		}

		const resolvedCropNames = newActivityCropNames.includes('All Crops') ? activityTableCropColumns : newActivityCropNames;

		const activity: Activity = {
			id: editingActivityId || `custom-${newActivityName.trim().toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
			name: newActivityName.trim(),
			category: newActivityCategory,
			icon: newActivityIcon,
			crop_type: resolvedCropNames,
		};

		setIsSavingActivity(true);
		try {
			const baseUrl = getBaseUrl();
			const response = await fetch(`${baseUrl}/admin_cultivation/add_cultivation_activity`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(activity),
			});
			if (!response.ok) throw new Error('Failed to save activity');
		} catch (err) {
			toast.error('Failed to save activity to server');
			return;
		} finally {
			setIsSavingActivity(false);
		}

		onSaveActivity(activity);
		toast.success(editingActivityId ? 'Activity updated' : 'Activity type added');
		resetNewActivityForm();
	};

	const handleDeleteActivityClick = (id: string, cropName?: string) => {
		if (cropName) {
			const activity = activities.find((item) => item.id === id);
			if (activity) {
				const nextCropNames = getActivityCropNames(activity).filter((crop) => crop !== cropName);
				if (nextCropNames.length > 0) {
					onSaveActivity({
						...activity,
						crop_type: nextCropNames,
					});
					if (editingActivityId === id) setNewActivityCropNames(nextCropNames);
					toast.success('Activity removed from crop');
					return;
				}
			}
		}
		onDeleteActivity(id);
		if (editingActivityId === id) resetNewActivityForm();
		toast.success('Activity deleted');
	};

	const handleActivityDrop = (targetCropName: string, targetIndex: number) => {
		if (!draggedActivity || draggedActivity.cropName !== targetCropName) return;

		const currentOrder = activitiesByCrop[targetCropName]?.map((activity) => activity.id) || [];
		const nextOrder = currentOrder.filter((activityId) => activityId !== draggedActivity.id);
		nextOrder.splice(targetIndex, 0, draggedActivity.id);

		const nextOrderByCrop = {
			...activityOrderByCrop,
			[targetCropName]: nextOrder,
		};
		setActivityOrderByCrop(nextOrderByCrop);
		saveToStorage(ACTIVITY_ORDER_STORAGE_KEY, nextOrderByCrop);
		setDraggedActivity(null);
		toast.success('Activity sequence updated');
	};

	const toggleApplicableCrop = (cropName: string) => {
		const nextCrops = applicableCrops.includes(cropName)
			? applicableCrops.filter((crop) => crop !== cropName)
			: [...applicableCrops, cropName];
		setApplicableCrops(nextCrops);
		saveToStorage(ERP_APPLICABLE_CROPS_STORAGE_KEY, nextCrops);
	};

	const handleCreateCropItem = () => {
		const cropName = newCropName.trim();
		if (!cropName) {
			toast.error('Please enter a crop name');
			return;
		}

		const alreadyExists = cropOptions.some(
			(crop) => crop.name.toLowerCase() === cropName.toLowerCase() && crop.name !== editingCropName
		);
		if (alreadyExists) {
			toast.error('This crop already exists');
			return;
		}

		const cropItem = {
			name: cropName,
			description: newCropDescription.trim() || 'Custom ERP crop item',
			imageUrl: newCropImage,
		};

		if (editingCropBaseName) {
			const nextBaseCropEdits = {
				...baseCropEdits,
				[editingCropBaseName]: cropItem,
			};
			const nextApplicableCrops = applicableCrops.map((crop) => (crop === editingCropName ? cropName : crop));
			setBaseCropEdits(nextBaseCropEdits);
			setApplicableCrops(nextApplicableCrops);
			saveToStorage(ERP_BASE_CROP_EDITS_STORAGE_KEY, nextBaseCropEdits);
			saveToStorage(ERP_APPLICABLE_CROPS_STORAGE_KEY, nextApplicableCrops);
			resetCropForm();
			toast.success('Crop item updated');
			return;
		}

		const nextCustomCrops = editingCropName
			? customCropOptions.map((crop) => (crop.name === editingCropName ? cropItem : crop))
			: [...customCropOptions, cropItem];
		const nextApplicableCrops = editingCropName
			? applicableCrops.map((crop) => (crop === editingCropName ? cropName : crop))
			: [...applicableCrops, cropName];
		setCustomCropOptions(nextCustomCrops);
		setApplicableCrops(nextApplicableCrops);
		saveToStorage(ERP_CUSTOM_CROPS_STORAGE_KEY, nextCustomCrops);
		saveToStorage(ERP_APPLICABLE_CROPS_STORAGE_KEY, nextApplicableCrops);
		setNewCropName('');
		setNewCropDescription('');
		setNewCropImage('');
		setEditingCropName(null);
		setEditingCropBaseName(null);
		toast.success(editingCropName ? 'Crop item updated' : 'Crop item created');
	};

	const startEditCropItem = (crop: { name: string; description: string; imageUrl?: string; baseName?: string | null }) => {
		setEditingCropName(crop.name);
		setEditingCropBaseName(crop.baseName || null);
		setNewCropName(crop.name);
		setNewCropDescription(crop.description);
		setNewCropImage(crop.imageUrl || '');
	};

	const resetCropForm = () => {
		setEditingCropName(null);
		setEditingCropBaseName(null);
		setNewCropName('');
		setNewCropDescription('');
		setNewCropImage('');
	};

	const handleCropImageUpload = (file?: File) => {
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			toast.error('Please upload an image file');
			return;
		}

		const reader = new FileReader();
		reader.onload = () => {
			setNewCropImage(typeof reader.result === 'string' ? reader.result : '');
		};
		reader.onerror = () => toast.error('Unable to read crop image');
		reader.readAsDataURL(file);
	};

	const handleDeleteCropItem = (cropName: string) => {
		const nextCustomCrops = customCropOptions.filter((crop) => crop.name !== cropName);
		const nextApplicableCrops = applicableCrops.filter((crop) => crop !== cropName);
		setCustomCropOptions(nextCustomCrops);
		setApplicableCrops(nextApplicableCrops);
		saveToStorage(ERP_CUSTOM_CROPS_STORAGE_KEY, nextCustomCrops);
		saveToStorage(ERP_APPLICABLE_CROPS_STORAGE_KEY, nextApplicableCrops);
		if (editingCropName === cropName) resetCropForm();
		toast.success('Crop item deleted');
	};

	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto px-4 py-8">
				<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
					<div>
						<h1 className="text-3xl font-bold text-foreground">Operations Master</h1>
						<p className="text-muted-foreground mt-1">
							Manage cultivation setup, dosage controls, and land hierarchy references
						</p>
					</div>
				</div>

				<div className="mb-6 overflow-x-auto">
					<div className="inline-flex min-w-max rounded-xl border border-border bg-card p-1 shadow-sm">
						{masterTabs.map(({ label, icon: Icon }) => {
							const isActive = activeMasterTab === label;
							return (
								<button
									key={label}
									type="button"
									onClick={() => setActiveMasterTab(label)}
									className={cn(
										'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
										isActive
											? 'bg-[#0D3A35] text-white shadow-sm'
											: 'text-muted-foreground hover:bg-muted hover:text-foreground'
									)}
								>
									<Icon className="h-4 w-4" />
									{label}
								</button>
							);
						})}
					</div>
				</div>

				{activeMasterTab === 'Cultivation Setup' && (
					<div className="space-y-6">
						<section className="rounded-xl border bg-card p-5 shadow-sm">
							<div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
								<div>
									<h2 className="text-xl font-semibold text-foreground">Crop Selector</h2>
									<p className="text-sm text-muted-foreground">Choose which crops will be applicable across this ERP.</p>
								</div>
								<div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground">
									<Sprout className="h-4 w-4" />
									{applicableCrops.length} Active Crops
								</div>
							</div>
							<div className="mb-5 rounded-lg border bg-muted/20 p-4">
								<div className="mb-3 flex items-center gap-2">
									{editingCropName ? <Edit className="h-4 w-4 text-[#0D3A35]" /> : <Plus className="h-4 w-4 text-[#0D3A35]" />}
									<h3 className="text-sm font-semibold text-foreground">
										{editingCropName ? 'Edit Crop Item' : 'Create Crop Item'}
									</h3>
								</div>
								<div className="grid gap-3 md:grid-cols-[1fr_1.4fr_auto]">
									<Input
										placeholder="Crop name"
										value={newCropName}
										onChange={(event) => setNewCropName(event.target.value)}
									/>
									<Input
										placeholder="Short description"
										value={newCropDescription}
										onChange={(event) => setNewCropDescription(event.target.value)}
									/>
									<Button onClick={handleCreateCropItem} className="gap-2 bg-[#0D3A35] hover:bg-[#0b302c]">
										{editingCropName ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
										{editingCropName ? 'Save Crop' : 'Create Crop'}
									</Button>
								</div>
								<div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
									<label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
										<Upload className="h-4 w-4" />
										Upload Crop Image
										<input
											type="file"
											accept="image/*"
											className="hidden"
											onChange={(event) => handleCropImageUpload(event.target.files?.[0])}
										/>
									</label>
									{newCropImage && (
										<div className="flex items-center gap-3 rounded-lg border bg-background p-2">
											<img src={newCropImage} alt="Crop preview" className="h-14 w-20 rounded-md object-cover" />
											<Button type="button" variant="ghost" size="sm" onClick={() => setNewCropImage('')}>
												Remove Image
											</Button>
										</div>
									)}
									{editingCropName && (
										<Button type="button" variant="outline" onClick={resetCropForm}>
											Cancel Edit
										</Button>
									)}
								</div>
							</div>
							<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
								{cropOptions.map(({ name, icon: Icon, description, imageUrl, baseName }) => {
									const isSelected = applicableCrops.includes(name);
									const isCustomCrop = customCropOptions.some((crop) => crop.name === name);
									return (
										<div
											key={name}
											className={cn(
												'flex h-56 flex-col overflow-hidden rounded-xl border bg-background text-left transition-all',
												isSelected
													? 'border-[#0D3A35] bg-[#0D3A35]/5 shadow-sm'
													: 'border-border bg-background hover:border-[#0D3A35]/40 hover:bg-muted/40'
											)}
										>
											<div className="flex h-3/4 items-center justify-center bg-muted/40">
												{imageUrl ? (
													<img src={imageUrl} alt={name} className="h-full w-full object-cover" />
												) : (
													<div
														className={cn(
															'flex h-12 w-12 items-center justify-center rounded-full',
															isSelected ? 'bg-[#0D3A35] text-white' : 'bg-muted text-muted-foreground'
														)}
													>
														{isCustomCrop ? <ImageIcon className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
													</div>
												)}
											</div>
											<div className="flex h-1/4 items-center justify-between gap-2 bg-[#0D3A35] px-3 py-2 text-white">
												<div className="min-w-0">
													<h3 className="truncate text-sm font-semibold leading-tight text-white">{name}</h3>
													<p className="truncate text-[11px] leading-tight text-white/70">{description}</p>
												</div>
												<div className="flex shrink-0 items-center gap-1">
													<button
														type="button"
														onClick={() => toggleApplicableCrop(name)}
														className={cn(
															'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors',
															isSelected ? 'bg-white text-[#0D3A35]' : 'bg-white/15 text-white hover:bg-white/25'
														)}
													>
														{isSelected ? 'Active' : 'Inactive'}
													</button>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														className="h-7 w-7 text-white hover:bg-white/15 hover:text-white"
														onClick={() => startEditCropItem({ name, description, imageUrl, baseName })}
													>
														<Edit className="h-4 w-4" />
													</Button>
													{isCustomCrop && (
														<Button
															type="button"
															variant="ghost"
															size="icon"
															className="h-7 w-7 text-red-300 hover:bg-white/15 hover:text-red-200"
															onClick={() => handleDeleteCropItem(name)}
														>
															<Trash2 className="h-4 w-4" />
														</Button>
													)}
												</div>
											</div>
										</div>
									);
								})}
							</div>
						</section>

						<section className="rounded-xl border bg-card p-5 shadow-sm">
							<div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
								<div>
									<h2 className="text-xl font-semibold text-foreground">Create Cultivation Activities</h2>
									<p className="text-sm text-muted-foreground">Create activity types and bifurcate them crop wise for cultivation plans.</p>
								</div>
								<div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground">
									<ListPlus className="h-4 w-4" />
									{activities.length} Activity Types
								</div>
							</div>
							<div className="mb-5 rounded-lg border bg-muted/20 p-4">
								<div className="mb-3 flex items-center gap-2">
									{editingActivityId ? <Edit className="h-4 w-4 text-[#0D3A35]" /> : <ListPlus className="h-4 w-4 text-[#0D3A35]" />}
									<h3 className="text-sm font-semibold text-foreground">
										{editingActivityId ? 'Edit Cultivation Activity' : 'Create Cultivation Activity'}
									</h3>
								</div>
								<div className="grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr_auto]">
									<Input
										placeholder="e.g., Pest Scouting"
										value={newActivityName}
										onChange={(e) => setNewActivityName(e.target.value)}
									/>
									<Select
										value={newActivityCategory}
										onValueChange={(value) => setNewActivityCategory(value as ActivityCategory)}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{ACTIVITY_CATEGORIES.map((category) => (
												<SelectItem key={category} value={category}>
													{category}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<Select value={newActivityIcon} onValueChange={setNewActivityIcon}>
										<SelectTrigger>
											<div className="flex items-center gap-2">
												<ActivityIcon iconName={newActivityIcon} className="text-primary" />
												<span>{newActivityIcon}</span>
											</div>
										</SelectTrigger>
										<SelectContent>
											{Object.keys(iconMap).map((iconName) => (
												<SelectItem key={iconName} value={iconName}>
													<div className="flex items-center gap-2">
														<ActivityIcon iconName={iconName} className="text-primary" />
														<span>{iconName}</span>
													</div>
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<Button onClick={handleAddActivitySubmit} disabled={isSavingActivity} className="gap-2 bg-[#0D3A35] hover:bg-[#0b302c]">
										{editingActivityId ? <Save className="h-4 w-4" /> : <ListPlus className="h-4 w-4" />}
										{isSavingActivity ? 'Saving...' : editingActivityId ? 'Save' : 'Create'}
									</Button>
								</div>
								<div className="mt-3 space-y-2">
									<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Applicable Crops</label>
									<div className="flex flex-wrap gap-2">
										{activityCropOptions.map((cropName) => {
											const isSelected = newActivityCropNames.includes(cropName);
											return (
												<button
													key={cropName}
													type="button"
													onClick={() => toggleActivityCropSelection(cropName)}
													className={cn(
														'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
														isSelected
															? 'border-[#0D3A35] bg-[#0D3A35] text-white'
															: 'border-border bg-background text-muted-foreground hover:border-[#0D3A35]/50 hover:text-foreground'
													)}
												>
													{cropName}
												</button>
											);
										})}
									</div>
								</div>
								{editingActivityId && (
									<Button variant="outline" className="mt-3" onClick={resetNewActivityForm}>
										Cancel Edit
									</Button>
								)}
							</div>

							<div className="space-y-6">
								{activityTableRowCount === 0 ? (
									<div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
										No cultivation activities yet.
									</div>
								) : (
									<div className="overflow-x-auto rounded-xl border">
										<Table className="table-fixed" style={{ minWidth: activityTableMinWidth }}>
											<TableHeader>
												<TableRow className="bg-[#0D3A35] hover:bg-[#0D3A35]">
													<TableHead className="w-[72px] px-2 text-center text-white/80">S.No.</TableHead>
													{activityTableCropColumns.map((cropName) => (
														<TableHead
															key={cropName}
															className="px-2 text-center text-white"
															style={{ width: activityCropColumnWidth }}
														>
															{cropName}
														</TableHead>
													))}
												</TableRow>
											</TableHeader>
											<TableBody>
												{Array.from({ length: activityTableRowCount }).map((_, rowIndex) => (
													<TableRow key={rowIndex}>
														<TableCell className="px-2 py-2 text-center font-medium text-muted-foreground">{rowIndex + 1}</TableCell>
														{activityTableCropColumns.map((cropName) => {
															const activity = activitiesByCrop[cropName]?.[rowIndex];
															return (
																<TableCell
																	key={`${cropName}-${rowIndex}`}
																	className="px-2 py-2 align-top"
																	onDragOver={(event) => event.preventDefault()}
																	onDrop={() => handleActivityDrop(cropName, rowIndex)}
																>
																	{activity ? (
																		<div
																			draggable
																			onDragStart={() => setDraggedActivity({ id: activity.id, cropName })}
																			onDragEnd={() => setDraggedActivity(null)}
																			className={cn(
																				'flex cursor-grab items-center justify-between gap-1 rounded-lg border bg-background px-2 py-1.5 active:cursor-grabbing',
																				draggedActivity?.id === activity.id && draggedActivity.cropName === cropName && 'opacity-60'
																			)}
																		>
																			<div className="flex min-w-0 items-center gap-1">
																				<GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
																				<div className="flex min-w-0 items-center gap-1.5">
																					<ActivityIcon iconName={activity.icon} className="shrink-0 text-[#0D3A35]" />
																					<div className="min-w-0">
																						<p className="truncate text-xs font-semibold text-foreground">{activity.name}</p>
																						<p className="truncate text-[11px] text-muted-foreground">{activity.category}</p>
																					</div>
																				</div>
																			</div>
																			<div className="flex shrink-0 gap-0.5">
																				<Button
																					type="button"
																					variant="ghost"
																					size="icon"
																					className="h-6 w-6"
																					onClick={() => startEditActivity(activity)}
																				>
																					<Edit className="h-3 w-3" />
																				</Button>
																				<Button
																					type="button"
																					variant="ghost"
																					size="icon"
																					className="h-6 w-6 text-destructive hover:text-destructive"
																					onClick={() => handleDeleteActivityClick(activity.id, cropName)}
																				>
																					<Trash2 className="h-3 w-3" />
																				</Button>
																			</div>
																		</div>
																	) : (
																		<span className="text-sm text-muted-foreground">-</span>
																	)}
																</TableCell>
															);
														})}
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								)}
							</div>
						</section>

						<section className="rounded-xl border bg-card p-5 shadow-sm">
							<div className="mb-5">
								<div>
									<h2 className="text-xl font-semibold text-foreground">Create Cultivation Plan</h2>
									<p className="text-sm text-muted-foreground">Create and manage week-wise cultivation planners using the existing plan workflow.</p>
								</div>
							</div>
							<div className="mb-6">
								<CreateMasterPlanner
									embedded
									planners={planners}
									availableActivities={activities}
									orderedActivitiesByCrop={activitiesByCrop}
									onSave={onSavePlanner}
								/>
							</div>
							{planners.length === 0 ? (
								<div className="rounded-lg border border-dashed py-14 text-center">
									<Calendar className="mx-auto mb-4 h-14 w-14 text-muted-foreground/50" />
									<h3 className="mb-2 text-lg font-medium text-foreground">No Planners Yet</h3>
									<p className="mb-6 text-muted-foreground">Create your first master planner to schedule farm activities</p>
								</div>
							) : (
								<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
									{planners.map((planner) => {
										const maxDayOffset = planner.activities.length
											? Math.max(...planner.activities.map((a) => a.dayOffset))
											: 0;

										return (
											<Card key={planner.id} className="overflow-hidden rounded-xl border border-[#0D3A35]/15 bg-white shadow-sm transition-shadow hover:shadow-md">
												<div className="h-1.5 bg-[#0D3A35]" />
												<CardHeader className="space-y-2 px-4 pb-2 pt-4">
													<div className="flex items-start justify-between gap-3">
														<div className="flex min-w-0 items-start gap-2">
															<div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0D3A35]/10 text-[#0D3A35]">
																<Calendar className="h-4 w-4" />
															</div>
															<div className="min-w-0">
																<CardTitle className="line-clamp-2 text-lg font-extrabold leading-tight text-[#0D3A35]">
																	{planner.name}
																</CardTitle>
																<CardDescription className="mt-1 text-xs font-semibold text-[#0D3A35]/60">
																	{planner.activities.length} activities • Updated {format(planner.updatedAt, 'MMM d, yyyy')}
																</CardDescription>
															</div>
														</div>
														{planner.cropType && (
															<span className="shrink-0 rounded-full bg-[#0D3A35]/10 px-2.5 py-1 text-xs font-bold text-[#0D3A35]">
																{planner.cropType}
															</span>
														)}
													</div>
												</CardHeader>
												<CardContent className="px-4 pb-4">
													<div className="space-y-3">
														<div className="grid grid-cols-2 gap-2 text-sm">
															<div className="rounded-lg bg-[#0D3A35]/5 px-3 py-2">
																<p className="text-xs font-semibold text-[#0D3A35]/55">Day Range</p>
																<p className="font-bold text-[#0D3A35]">0 - {maxDayOffset} days</p>
															</div>
															<div className="rounded-lg bg-[#0D3A35]/5 px-3 py-2">
																<p className="text-xs font-semibold text-[#0D3A35]/55">Plan Steps</p>
																<p className="font-bold text-[#0D3A35]">{planner.activities.length}</p>
															</div>
														</div>
														<div className="flex gap-2">
															<Button
																variant="outline"
																size="sm"
																className="h-9 flex-1 gap-1 rounded-lg border-[#0D3A35]/15 font-bold text-[#0D3A35] hover:bg-[#0D3A35]/5"
																onClick={() => navigate(`/cultivation-master/edit/${planner.id}`)}
															>
																<Edit className="h-3.5 w-3.5" />
																Edit
															</Button>
															<Button
																variant="outline"
																size="sm"
																onClick={() => onDelete(planner.id)}
																className="h-9 rounded-lg border-red-100 px-3 text-destructive hover:bg-red-50 hover:text-destructive"
															>
																<Trash2 className="h-3.5 w-3.5" />
															</Button>
														</div>
												</div>
											</CardContent>
										</Card>
										);
									})}
								</div>
							)}
						</section>
					</div>
				)}

				{activeMasterTab === 'Dosage Control' && (
					<div className="space-y-6">
						<div className="grid gap-4 md:grid-cols-3">
							<Card className="border-[#0D3A35]/15">
								<CardHeader className="pb-2">
									<CardDescription>Configured Dosages</CardDescription>
									<CardTitle className="text-3xl text-[#0D3A35]">{dosageControls.length}</CardTitle>
								</CardHeader>
								<CardContent className="text-sm text-muted-foreground">
									Inventory item dosage rows
								</CardContent>
							</Card>
							<Card className="border-[#0D3A35]/15">
								<CardHeader className="pb-2">
									<CardDescription>Applicable Activities</CardDescription>
									<CardTitle className="text-3xl text-[#0D3A35]">
										{dosageRows.length}
									</CardTitle>
								</CardHeader>
								<CardContent className="text-sm text-muted-foreground">
									Activities that can be mapped
								</CardContent>
							</Card>
							<Card className="border-[#0D3A35]/15">
								<CardHeader className="pb-2">
									<CardDescription>Inventory Items</CardDescription>
									<CardTitle className="text-3xl text-[#0D3A35]">{inventoryItems.length}</CardTitle>
								</CardHeader>
								<CardContent className="text-sm text-muted-foreground">
									{isLoadingInventoryItems ? 'Loading inventory...' : 'Selectable inventory references'}
								</CardContent>
							</Card>
						</div>
						<Card className="overflow-hidden rounded-xl border-[#0D3A35]/15 shadow-sm">
							<div className="h-1.5 bg-[#0D3A35]" />
							<CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
								<div>
									<CardTitle className="text-[#0D3A35]">Dosage Control</CardTitle>
									<CardDescription>Map activities to fertilizers, seeds, diesel, chemicals, labour, and other inventory inputs.</CardDescription>
								</div>
								<div className="flex flex-wrap gap-2">
									<Button onClick={addDosageControl} className="h-10 gap-2 rounded-lg bg-[#0D3A35] px-4 font-bold hover:bg-[#092b27]">
										<Plus className="h-4 w-4" />
										Add Dosage
									</Button>
								</div>
							</CardHeader>
							<CardContent>
								{dosageControls.length === 0 ? (
									<div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
										<Droplets className="mb-3 h-9 w-9 text-[#0D3A35]/40" />
										<p className="font-bold text-[#0D3A35]">No dosage rows added</p>
										<p className="mt-1 text-sm text-muted-foreground">Click Add Dosage to map an activity with an inventory item.</p>
									</div>
								) : (
									<div className="overflow-x-auto rounded-xl border border-slate-200">
										<Table>
											<TableHeader>
												<TableRow className="bg-[#0D3A35] hover:bg-[#0D3A35]">
													<TableHead className="w-16 text-center text-white/80">S.No.</TableHead>
													<TableHead className="min-w-[170px] text-white">Crop</TableHead>
													<TableHead className="min-w-[260px] text-white">Activity</TableHead>
													<TableHead className="min-w-[220px] text-white">Item from Inventory</TableHead>
													<TableHead className="w-40 text-white">UoM</TableHead>
													<TableHead className="w-44 text-white">Dosage/Acre</TableHead>
													<TableHead className="w-24 text-white">Lock</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{dosageControls.map((row, index) => {
													const selectedInventoryItem = getInventoryItemForDosage(row);
													const resolvedUom = selectedInventoryItem?.uom || row.uom || '-';

													return (
													<TableRow key={row.id}>
														<TableCell className="text-center font-bold text-[#0D3A35]">{index + 1}</TableCell>
														<TableCell>
															<Select value={row.cropName} onValueChange={(value) => updateDosageControl(row.id, 'cropName', value)} disabled={row.locked}>
																<SelectTrigger className="h-10 rounded-lg border-slate-200">
																	<SelectValue placeholder="Choose crop" />
																</SelectTrigger>
																<SelectContent>
																	{activityTableCropColumns.map((cropName) => (
																		<SelectItem key={cropName} value={cropName}>
																			{cropName}
																		</SelectItem>
																	))}
																</SelectContent>
															</Select>
														</TableCell>
														<TableCell>
															<Select value={row.activityId} onValueChange={(value) => updateDosageControl(row.id, 'activityId', value)} disabled={row.locked}>
																<SelectTrigger className="h-10 rounded-lg border-slate-200">
																	<SelectValue placeholder="Choose activity" />
																</SelectTrigger>
																<SelectContent>
																	{(activitiesByCrop[row.cropName] || []).map((activity) => (
																		<SelectItem key={activity.id} value={activity.id}>
																			<div className="flex items-center gap-2">
																				<ActivityIcon iconName={activity.icon} className="text-[#0D3A35]" />
																				<span>{activity.name}</span>
																			</div>
																		</SelectItem>
																	))}
																</SelectContent>
															</Select>
														</TableCell>
														<TableCell>
															<Select value={selectedInventoryItem?.id || getDosageInventoryKey(row)} onValueChange={(value) => updateDosageControl(row.id, 'inventoryItemId', value)} disabled={row.locked}>
																<SelectTrigger className="h-10 rounded-lg border-slate-200">
																	<SelectValue placeholder="Choose item" />
																</SelectTrigger>
																<SelectContent>
																	{inventoryItems.map((item) => (
																		<SelectItem key={item.id} value={item.id}>
																			<div className="flex flex-col">
																				<span>{item.name}</span>
																				{item.category && <span className="text-xs text-muted-foreground">{item.category}</span>}
																			</div>
																		</SelectItem>
																	))}
																</SelectContent>
															</Select>
														</TableCell>
														<TableCell>
															<Input
																value={resolvedUom}
																readOnly
																className="h-10 rounded-lg border-slate-200 bg-slate-50 font-semibold text-[#0D3A35]"
															/>
														</TableCell>
														<TableCell>
															<Input
																type="number"
																min={0}
																value={row.dosagePerAcre}
																onChange={(e) => updateDosageControl(row.id, 'dosagePerAcre', e.target.value)}
																placeholder="0"
																disabled={row.locked}
																className="h-10 rounded-lg border-slate-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
															/>
														</TableCell>
														<TableCell>
															<div className="flex items-center gap-1">
																<Button
																	type="button"
																	variant="ghost"
																	size="icon"
																	className={cn(
																		'h-9 w-9',
																		row.locked
																			? 'bg-[#0D3A35]/10 text-[#0D3A35] hover:bg-[#0D3A35]/15'
																			: 'text-slate-500 hover:bg-slate-50 hover:text-[#0D3A35]'
																	)}
																	disabled={!!savingDosageLockIds[row.id]}
																	onClick={() => toggleDosageLock(row.id)}
																>
																	{row.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
																</Button>
																<Button
																	type="button"
																	variant="ghost"
																	size="icon"
																	disabled={row.locked}
																	className="h-9 w-9 text-destructive hover:bg-red-50 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
																	onClick={() => deleteDosageControl(row.id)}
																>
																	<Trash2 className="h-4 w-4" />
																</Button>
															</div>
														</TableCell>
													</TableRow>
													);
												})}
											</TableBody>
										</Table>
									</div>
								)}
							</CardContent>
						</Card>
						<Card className="overflow-hidden rounded-xl border-[#0D3A35]/15 shadow-sm">
							<div className="h-1.5 bg-[#0D3A35]" />
							<CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
								<div>
									<CardTitle className="text-[#0D3A35]">Land Wise Distribution</CardTitle>
									<CardDescription>
										Auto-calculates required quantities for each land parcel using saved dosage per acre.
									</CardDescription>
								</div>
								<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
									<div className="min-w-[240px]">
										<Select value={effectiveDistributionItemId} onValueChange={setSelectedDistributionItemId}>
											<SelectTrigger className="h-10 rounded-lg border-[#0D3A35]/20">
												<SelectValue placeholder="Choose inventory item" />
											</SelectTrigger>
											<SelectContent>
												{distributionItemOptions.map((item) => (
													<SelectItem key={item.id} value={item.id}>
														{item.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="rounded-lg bg-[#0D3A35]/5 px-3 py-2">
										<p className="text-xs font-semibold text-[#0D3A35]/55">Land Parcels</p>
										<p className="font-bold text-[#0D3A35]">{new Set(landParcels.map((land) => land.farm_id)).size}</p>
									</div>
									<div className="rounded-lg bg-[#0D3A35]/5 px-3 py-2">
										<p className="text-xs font-semibold text-[#0D3A35]/55">Matching Lands</p>
										<p className="font-bold text-[#0D3A35]">{dosageDistributionGroups.length}</p>
									</div>
									<div className="rounded-lg bg-[#0D3A35]/5 px-3 py-2">
										<p className="text-xs font-semibold text-[#0D3A35]/55">Total Quantity</p>
										<p className="font-bold text-[#0D3A35]">
											{dosageDistributionRows.reduce((sum, row) => sum + row.requiredQuantity, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
											{' '}{selectedDistributionItem?.uom || dosageDistributionRows[0]?.uom || ''}
										</p>
									</div>
								</div>
							</CardHeader>
							<CardContent>
								{isLoadingLandParcels ? (
									<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-sm font-semibold text-muted-foreground">
										Loading land parcels...
									</div>
								) : landParcels.length === 0 ? (
									<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
										<Layers className="mx-auto mb-3 h-9 w-9 text-[#0D3A35]/40" />
										<p className="font-bold text-[#0D3A35]">No land parcels found</p>
										<p className="mt-1 text-sm text-muted-foreground">
											Land Directory did not return any parcels yet.
										</p>
									</div>
								) : !effectiveDistributionItemId ? (
									<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
										<Layers className="mx-auto mb-3 h-9 w-9 text-[#0D3A35]/40" />
										<p className="font-bold text-[#0D3A35]">Choose an inventory item</p>
										<p className="mt-1 text-sm text-muted-foreground">
											Add a dosage entry first, then select its inventory item to view land-wise quantities.
										</p>
									</div>
								) : dosageDistributionGroups.length === 0 ? (
									<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
										<Layers className="mx-auto mb-3 h-9 w-9 text-[#0D3A35]/40" />
										<p className="font-bold text-[#0D3A35]">No matching land parcels</p>
										<p className="mt-1 text-sm text-muted-foreground">
											No land parcel is cultivating a crop that has a dosage configured for {selectedDistributionItem?.name || 'this item'}.
										</p>
									</div>
								) : (
									<div className="overflow-x-auto rounded-xl border border-slate-200">
										<Table>
											<TableHeader>
												<TableRow className="bg-[#0D3A35] hover:bg-[#0D3A35]">
													<TableHead className="min-w-[190px] text-white">Land Parcel</TableHead>
													<TableHead className="min-w-[180px] text-white">Land Owner</TableHead>
													<TableHead className="min-w-[220px] text-white">Location</TableHead>
													<TableHead className="w-28 text-right text-white">Total Area</TableHead>
													<TableHead className="w-20 text-right text-white">Plots</TableHead>
													<TableHead className="w-40 text-right text-white">Required Qty</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{dosageDistributionGroups.map((group) => {
													const isExpanded = expandedLandParcels.has(group.farmId);
													return (
														<Fragment key={group.farmId}>
															<TableRow
																className="cursor-pointer"
																onClick={() => toggleLandParcelExpanded(group.farmId)}
															>
																<TableCell className="font-bold text-[#0D3A35]">
																	<span className="flex items-center gap-1.5">
																		{isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
																		{group.farmId}
																	</span>
																</TableCell>
																<TableCell className="font-semibold text-foreground">{group.ownerName}</TableCell>
																<TableCell className="text-sm text-muted-foreground">{group.location || '-'}</TableCell>
																<TableCell className="text-right font-semibold">{group.totalArea.toFixed(2)} ac</TableCell>
																<TableCell className="text-right font-semibold">{group.plots.length}</TableCell>
																<TableCell className="text-right font-extrabold text-[#0D3A35]">
																	{group.totalRequiredQuantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {group.uom}
																</TableCell>
															</TableRow>
															{isExpanded && (
																<TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
																	<TableCell colSpan={6} className="p-0">
																		<div className="px-4 py-3 pl-12">
																			<Table>
																				<TableHeader>
																					<TableRow className="hover:bg-transparent">
																						<TableHead className="h-8 text-xs">Plot</TableHead>
																						<TableHead className="h-8 w-32 text-right text-xs">Area</TableHead>
																						<TableHead className="h-8 w-36 text-right text-xs">Dosage/Acre</TableHead>
																						<TableHead className="h-8 w-40 text-right text-xs">Required Qty</TableHead>
																					</TableRow>
																				</TableHeader>
																				<TableBody>
																					{group.plots.map((plot) => (
																						<TableRow key={plot.id} className="hover:bg-transparent">
																							<TableCell className="text-sm font-semibold text-slate-700">{plot.plotLabel || '-'}</TableCell>
																							<TableCell className="text-right text-sm">{plot.area.toFixed(2)} ac</TableCell>
																							<TableCell className="text-right text-sm">{plot.dosage.toLocaleString('en-IN')} {plot.uom}</TableCell>
																							<TableCell className="text-right text-sm font-bold text-[#0D3A35]">
																								{plot.requiredQuantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {plot.uom}
																							</TableCell>
																						</TableRow>
																					))}
																				</TableBody>
																			</Table>
																		</div>
																	</TableCell>
																</TableRow>
															)}
														</Fragment>
													);
												})}
											</TableBody>
										</Table>
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				)}

				{activeMasterTab === 'Land Heirarchy' && (
					<div className="-mx-4 -my-8 sm:-mx-4">
						<Blocks />
					</div>
				)}
			</div>
		</div>
	);
};

// ============================================================
// MAIN CULTIVATION MASTER MODULE COMPONENT
// ============================================================
// Use this as the main entry point. Add these routes to your router:
// <Route path="/cultivation-master/*" element={<CultivationMasterModule />} />
// ============================================================

const CultivationMasterModule = () => {
	const [planners, setPlanners] = useState<MasterPlanner[]>([]);
	const [availableActivities, setAvailableActivities] = useState<Activity[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchAll = async () => {
			setLoading(true);
			const baseUrl = getBaseUrl();
			let fetchedActivities: Activity[] = [];

			try {
				const activitiesResponse = await fetch(`${baseUrl}/admin_cultivation/get_cultivation_activities`);
				if (!activitiesResponse.ok) throw new Error('Failed to fetch activities');
				const activitiesData = await activitiesResponse.json();
				fetchedActivities = (activitiesData.activities || []).map((activity: any) => ({
					...activity,
					category: normalizeActivityCategory(activity.category),
				}));
				setAvailableActivities(fetchedActivities);
			} catch (err) {
				setAvailableActivities([]);
			}

			try {
				const response = await fetch(`${baseUrl}/admin_cultivation/get_master_cultivation_plans`);
				if (!response.ok) throw new Error('Failed to fetch plans');
				const data = await response.json();
				// Convert API response to MasterPlanner[]
				const plans: MasterPlanner[] = Object.entries(data.plan || {}).map(([id, plan]: any) => ({
					id,
					name: plan.plan_name,
					activities: (plan.plan_list || []).map((item: any) => {
						// Find activityId by name
						const act = fetchedActivities.find((a) => a.name === item.activity);
						return {
							id: `${id}-a${item.index}`,
							sno: item.index,
							activityId: act ? act.id : item.activity,
							dayOffset: item.day_offset,
							frequency: item.frequency === 'daily' ? 'every_n_days' : item.frequency,
							frequencyValue: item.every_n_days || undefined,
							workQty: item.work_quantity,
						};
					}),
					createdAt: plan.created_at ? new Date(plan.created_at) : new Date(),
					updatedAt: plan.created_at ? new Date(plan.created_at) : new Date(),
				}));
				setPlanners(plans);
			} catch (err) {
				setPlanners([]);
			} finally {
				setLoading(false);
			}
		};
		fetchAll();
	}, []);

	const handleDelete = (id: string) => {
		setPlanners(planners.filter((p) => p.id !== id));
	};

	const handleSave = (planner: MasterPlanner) => {
		const exists = planners.find((p) => p.id === planner.id);
		if (exists) {
			setPlanners(planners.map((p) => (p.id === planner.id ? planner : p)));
		} else {
			setPlanners([...planners, planner]);
		}
	};

	const handleSaveActivity = (activity: Activity) => {
		setAvailableActivities((prev) => {
			const exists = prev.some((a) => a.id === activity.id);
			return exists ? prev.map((a) => (a.id === activity.id ? activity : a)) : [...prev, activity];
		});
	};

	const handleDeleteActivity = (id: string) => {
		setAvailableActivities((prev) => prev.filter((a) => a.id !== id));
	};

	if (loading) {
		return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
	}

	return (
		<Routes>
			<Route
				path="/"
				element={
					<PlannerList
						planners={planners}
						activities={availableActivities}
						onDelete={handleDelete}
						onSavePlanner={handleSave}
						onSaveActivity={handleSaveActivity}
						onDeleteActivity={handleDeleteActivity}
					/>
				}
			/>
			<Route path="/create" element={<CreateMasterPlanner planners={planners} availableActivities={availableActivities} onSave={handleSave} />} />
			<Route path="/edit/:id" element={<CreateMasterPlanner planners={planners} availableActivities={availableActivities} onSave={handleSave} />} />
		</Routes>
	);
};

export default CultivationMasterModule;
