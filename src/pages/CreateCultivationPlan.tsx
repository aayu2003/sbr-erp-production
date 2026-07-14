import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  addDays,
  isToday,
  isBefore,
  startOfDay,
  getDay,
} from 'date-fns';
import {
  Calendar,
  Save,
  X,
  Tractor,
  Droplets,
  Sprout,
  Scissors,
  Footprints,
  Flower2,
  Layers,
  Shovel,
  Hammer,
  Rows3,
  Rows4,
  MapPin,
  Info,
  AlertCircle,
  ArrowLeft,
  Clock,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Loader2,
  Plus,
  Lock,
  Eye,
  EyeOff,
  LandPlot,
  UserSquare2,
  Wheat,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area'; // New component
import getBaseUrl from '@/lib/config';
import ResourceAllocationPanel from '@/components/cultivation/ResourceAllocationPanel';

type LivePlanStepStatus = 'idle' | 'loading' | 'success' | 'error';
type CardSaveStatus = 'pending' | 'assigning' | 'saving' | 'done' | 'error';

type RentalServiceOption = {
  id: string;
  name: string;
  isLive: boolean;
};

type CropType = 'paddy' | 'rahar' | 'napier';

type CropPlannerCard = {
  id: string;
  blockId: string;
  cropType: CropType | '';
  plannerId: string;
  color: string;
  selectedFarmTags: string[];
  selectNew: boolean;
  selectOld: boolean;
  selectAll: boolean;
  mappedStartDate?: string;
  showOnCalendar: boolean;
  mappingLocked: boolean;
  locked: boolean;
};

// Keyed by `${blockId}::${cropType}` since lands are now fetched per block+crop combo.
type BlockLandsMap = Record<string, LandTag[]>;

type LandTag = {
  id: string; // farm_id
  name?: string;
  area: number; // total area across the farm's plots
  plotNames: string[];
  landType: 'new' | 'old';
  cropType: CropType;
};

// ============================================================================
// TYPES
// ============================================================================

export type ActivityCategory = 
  | 'Land Preparation'
  | 'Crop Care'
  | 'Irrigation'
  | 'Plantation'
  | 'Other';

export interface Activity {
  id: string;
  name: string;
  category: ActivityCategory;
  icon: string;
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
  activities: PlannerActivity[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Farm {
  id: string;
  name: string;
  location: string;
  acres: number;
}

export interface PlannedActivity {
  date: Date;
  activityId: string;
  activityName: string;
  category: ActivityCategory;
  icon: string;
  workQty: number;
}

export interface CultivationPlan {
  id: string;
  farmId: string;
  farmName: string;
  masterPlannerId: string;
  masterPlannerName: string;
  startDate: Date;
  activities: PlannedActivity[];
  carryForwardProbability: number;
  createdAt: Date;
}

// ============================================================================
// CONSTANTS - ACTIVITIES LIST (Re-adding needed constant for helpers)
// ============================================================================

export const ACTIVITIES: Activity[] = [
    { id: 'bed-making-land', name: 'Bed Making', category: 'Land Preparation', icon: 'Rows3' },
    { id: 'bed-making-other', name: 'Bed Making', category: 'Other', icon: 'Rows4' },
    { id: 'field-visits', name: 'Field Visits', category: 'Crop Care', icon: 'Footprints' },
    { id: 'harvesting', name: 'Harvesting', category: 'Other', icon: 'Scissors' },
    { id: 'initial-ploughing', name: 'Initial Ploughing', category: 'Land Preparation', icon: 'Tractor' },
    { id: 'interweeding-fertilization', name: 'Interweeding + Fertilization', category: 'Crop Care', icon: 'Flower2' },
    { id: 'irrigation', name: 'Irrigation', category: 'Irrigation', icon: 'Droplets' },
    { id: 'mulching', name: 'Mulching', category: 'Crop Care', icon: 'Layers' },
    { id: 'ploughing', name: 'Ploughing', category: 'Plantation', icon: 'Shovel' },
    { id: 'soil-pulverization', name: 'Soil Pulverization', category: 'Land Preparation', icon: 'Hammer' },
    { id: 'sowing', name: 'Sowing', category: 'Plantation', icon: 'Sprout' },
];

// ============================================================================
// DEMO DATA (Restored fully)
// ============================================================================

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

// ============================================================================
// ICON COMPONENT
// ============================================================================
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Tractor,
  Droplets,
  Sprout,
  Scissors,
  Footprints,
  Flower2,
  Layers,
  Shovel,
  Hammer,
  Rows3,
  Rows4,
};

interface ActivityIconProps {
  iconName: string;
  className?: string;
}

const ActivityIcon: React.FC<ActivityIconProps> = ({ iconName, className = 'h-4 w-4' }) => {
  const IconComponent = iconMap[iconName];
  if (!IconComponent) {
    return <Calendar className={className} />;
  }
  return <IconComponent className={className} />;
};

// ============================================================================
// HELPER FUNCTIONS (Restored fully)
// ============================================================================
const MAX_PLAN_DAYS = 120;

const generatePlannedActivities = (
  masterPlan: MasterPlanner,
  startDate: Date
): PlannedActivity[] => {
  const activities: PlannedActivity[] = [];
  masterPlan.activities.forEach((plannerActivity) => {
    const activity = ACTIVITIES.find((a) => a.id === plannerActivity.activityId);
    if (!activity) return;
    if (plannerActivity.frequency === 'once') {
      const activityDate = addDays(startDate, plannerActivity.dayOffset);
      if (plannerActivity.dayOffset <= MAX_PLAN_DAYS) {
        activities.push({
          date: activityDate,
          activityId: activity.id,
          activityName: activity.name,
          category: activity.category,
          icon: activity.icon,
          workQty: plannerActivity.workQty,
        });
      }
    } else if (plannerActivity.frequency === 'every_n_days' && plannerActivity.frequencyValue) {
      let currentOffset = plannerActivity.dayOffset;
      while (currentOffset <= MAX_PLAN_DAYS) {
        const activityDate = addDays(startDate, currentOffset);
        activities.push({
          date: activityDate,
          activityId: activity.id,
          activityName: activity.name,
          category: activity.category,
          icon: activity.icon,
          workQty: plannerActivity.workQty,
        });
        currentOffset += plannerActivity.frequencyValue;
      }
    } else if (plannerActivity.frequency === 'weekly') {
      let currentOffset = plannerActivity.dayOffset;
      while (currentOffset <= MAX_PLAN_DAYS) {
        const activityDate = addDays(startDate, currentOffset);
        activities.push({
          date: activityDate,
          activityId: activity.id,
          activityName: activity.name,
          category: activity.category,
          icon: activity.icon,
          workQty: plannerActivity.workQty,
        });
        currentOffset += 7;
      }
    }
  });
  return activities;
};

const calculateCarryForwardProbability = (activities: PlannedActivity[]): number => {
  if (activities.length === 0) return 0;
  const uniqueDates = new Set(activities.map((a) => format(a.date, 'yyyy-MM-dd'))).size;
  const totalActivities = activities.length;
  const density = totalActivities / uniqueDates;
  const probability = Math.min(Math.round((density - 1) * 20 + 10), 95);
  return Math.max(probability, 5);
};

// ============================================================================
// INFO BOX COMPONENT (Restored)
// ============================================================================

interface InfoBoxProps {
  carryForwardProbability: number;
  selectedDate: Date | null;
  activitiesCount: number;
}

const InfoBox: React.FC<InfoBoxProps> = ({
  carryForwardProbability,
  selectedDate,
  activitiesCount,
}) => {
  return (
    <Card className="fixed top-20 right-4 w-64 shadow-lg z-50">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Info className="h-4 w-4" />
          Plan Information
        </CardTitle>
      </CardHeader>
      <CardContent className="py-2 px-4 space-y-3">
        {selectedDate && (
          <div className="text-sm">
            <span className="text-muted-foreground">Start Date (Day 0):</span>
            <p className="font-medium">{format(selectedDate, 'dd MMM yyyy')}</p>
          </div>
        )}

        <div className="text-sm">
          <span className="text-muted-foreground">Total Activities:</span>
          <p className="font-medium">{activitiesCount}</p>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Carry Forward Probability:</span>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  carryForwardProbability > 60 ? 'bg-amber-500' :
                  carryForwardProbability > 30 ? 'bg-yellow-500' :
                  'bg-emerald-500'
                }`}
                style={{ width: `${carryForwardProbability}%` }}
              />
            </div>
            <span className="font-medium text-sm">{carryForwardProbability}%</span>
          </div>
        </div>
        {carryForwardProbability > 50 && (
          <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 p-2 rounded">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>High activity density may cause delays</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ============================================================================
// MONTH CALENDAR COMPONENT
// ============================================================================

const MonthCalendar: React.FC<{
  month: Date;
  selectedDate: Date | null;
  onDateClick?: (date: Date) => void;
  isSelectionMode?: boolean;
  highlighted?: { [date: string]: string };
  highlightCounts?: { [date: string]: number };
  highlightColors?: { [date: string]: string };
  highlightCardColors?: { [date: string]: string[] };
  hoverDetailsByDate?: {
    [date: string]: Array<{ cardLabel: string; acres: number; activities: string[] }>;
  };
  blockedDates?: { [date: string]: boolean };
}> = ({ month, selectedDate, onDateClick, isSelectionMode, highlighted, highlightCounts, highlightColors, highlightCardColors, hoverDetailsByDate, blockedDates }) => {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);
  const emptySlots = Array(startDayOfWeek).fill(null);
  const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  return (
    <Card className="overflow-visible">
      <CardHeader className="py-2 px-3 bg-muted/50">
        <CardTitle className="text-sm font-medium text-center">
          {format(month, 'MMMM yyyy')}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2">
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {weekDays.map((day) => (
            <div
              key={day}
              className="text-[10px] font-medium text-muted-foreground text-center py-1"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {emptySlots.map((_, index) => (
            <div key={`empty-${index}`} className="aspect-square" />
          ))}
          {days.map((day) => {
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isPast = isBefore(day, new Date());
            const today = isToday(day);
            const highlight = highlighted && highlighted[format(day, 'yyyy-MM-dd')];
            const highlightCount = highlightCounts ? highlightCounts[format(day, 'yyyy-MM-dd')] || 0 : 0;
            const dateCardColors = highlightCardColors ? (highlightCardColors[format(day, 'yyyy-MM-dd')] || []) : [];
            const cardCount = dateCardColors.length;
            const hoverDetails = hoverDetailsByDate ? (hoverDetailsByDate[format(day, 'yyyy-MM-dd')] || []) : [];
            const isBlocked = blockedDates && blockedDates[format(day, 'yyyy-MM-dd')];
            return (
              <button
                key={day.toISOString()}
                onClick={() => (!isSelectionMode || !isBlocked) && onDateClick && onDateClick(day)}
                disabled={isSelectionMode && isBlocked}
                className={`group aspect-square p-0.5 rounded text-[10px] relative transition-all
                  border border-slate-200
                  ${(isSelectionMode || highlight) ? 'cursor-pointer hover:bg-primary/10' : 'cursor-default'}
                  ${isSelected ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1' : ''}
                  ${today && !isSelected ? 'bg-accent font-bold' : ''}
                  ${isPast && !isSelected ? 'text-muted-foreground/50' : ''}
                  ${isBlocked ? 'bg-red-100 border border-red-500 text-red-700' : ''}
                `}
                style={undefined}
              >
                <span className="block">{format(day, 'd')}</span>
                {!isSelected && !isBlocked && cardCount > 0 && (
                  <span className="absolute left-1/2 -translate-x-1/2 bottom-[3px] flex items-center gap-[3px] pointer-events-none">
                    {dateCardColors.slice(0, 3).map((clr, idx) => (
                      <span
                        key={`${format(day, 'yyyy-MM-dd')}-${idx}`}
                        className="h-[10px] w-[15px] rounded-[3px] border border-slate-500 saturate-[2.3] contrast-[1.35] brightness-[0.85]"
                        style={{ backgroundColor: clr }}
                      />
                    ))}
                    {cardCount > 3 && (
                      <span className="h-[10px] min-w-[15px] px-[3px] rounded-[3px] border border-slate-300 bg-slate-200 text-[8px] leading-[10px] text-slate-700 font-bold">
                        +{cardCount - 3}
                      </span>
                    )}
                  </span>
                )}
                {isBlocked && (
                  <span className="block text-[8px] text-red-700 font-semibold truncate">Blocked</span>
                )}
                {hoverDetails.length > 0 && (
                  <span className="hidden group-hover:block absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1 w-56 rounded-md border border-slate-300 bg-white p-2 text-left shadow-lg">
                    {hoverDetails.map((d, idx) => (
                      <span key={`${format(day, 'yyyy-MM-dd')}-h-${idx}`} className="block mb-1 last:mb-0">
                        <span className="block text-[10px] font-semibold text-slate-800">{d.cardLabel} ({d.acres.toFixed(2)} ac)</span>
                        <span className="block text-[9px] text-slate-600 truncate">{d.activities.join(', ')}</span>
                      </span>
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const CreateCultivationPlan: React.FC = () => {
  const [selectedFarm, setSelectedFarm] = useState<Farm | null>(null);
  const [selectedMasterPlanner, setSelectedMasterPlanner] = useState<MasterPlanner | null>(
    null
  );
  const [startDate, setStartDate] = useState<Date | null>(new Date());
  const [plannedActivities, setPlannedActivities] = useState<PlannedActivity[]>([]);
  const [carryForwardProbability, setCarryForwardProbability] = useState<number | null>(null);
  
  // --- New State for Dialog/Selections ---
  const [dialogOpen, setDialogOpen] = useState(false);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [masterPlanId, setMasterPlanId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [day0, setDay0] = useState<Date | null>(null);
  const [highlighted, setHighlighted] = useState<{ [date: string]: string }>({});
  const [highlightCounts, setHighlightCounts] = useState<{ [date: string]: number }>({});
  const [highlightColors, setHighlightColors] = useState<{ [date: string]: string }>({});
  const [highlightCardColors, setHighlightCardColors] = useState<{ [date: string]: string[] }>({});
  const [hoverDetailsByDate, setHoverDetailsByDate] = useState<{
    [date: string]: Array<{ cardLabel: string; acres: number; activities: string[] }>;
  }>({});
  const [mappedByCard, setMappedByCard] = useState<Record<string, any[]>>({});
  const [mappedByCardRaw, setMappedByCardRaw] = useState<Record<string, any[]>>({});
  const [activeMappingCard, setActiveMappingCard] = useState<string | null>(null);
  const [mappingCardLoading, setMappingCardLoading] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [blockedDates, setBlockedDates] = useState<{ [date: string]: boolean }>({});
  const [showBlockedDates, setShowBlockedDates] = useState(true);

  const [livePlanUiRunning, setLivePlanUiRunning] = useState(false);
  const [livePlanUiCardIndex, setLivePlanUiCardIndex] = useState<number>(-1);
  const [livePlanUiStage, setLivePlanUiStage] = useState<'idle' | 'assigning' | 'saving' | 'done'>('idle');
  const [livePlanUiDescription, setLivePlanUiDescription] = useState<string>('Ready to start saving plan.');
  const [livePlanUiSavedAcres, setLivePlanUiSavedAcres] = useState<number>(0);
  const [livePlanProgressOpen, setLivePlanProgressOpen] = useState(false);
  const [livePlanStep, setLivePlanStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [savePlanStatus, setSavePlanStatus] = useState<LivePlanStepStatus>('idle');
  const [assignFarmsStatus, setAssignFarmsStatus] = useState<LivePlanStepStatus>('idle');
  const [assignContractFarmersStatus, setAssignContractFarmersStatus] = useState<LivePlanStepStatus>('idle');
  const [adjustRentalServicesStatus, setAdjustRentalServicesStatus] = useState<LivePlanStepStatus>('idle');
  const [livePlanError, setLivePlanError] = useState<string | null>(null);
  const [resourcePanelOpen, setResourcePanelOpen] = useState(false);
  const [saveFlowCards, setSaveFlowCards] = useState<Array<{
    id: string;
    label: string;
    acres: number;
    status: CardSaveStatus;
    blockName: string;
    blockTotalArea: number;
    cropType: string;
    masterName: string;
    color: string;
    farmIds: string[];
    planId: string;
    dateMapping: any[];
  }>>([]);
  const [saveFlowDescription, setSaveFlowDescription] = useState<string>('Preparing save flow...');
  const [saveFlowTotalAcres, setSaveFlowTotalAcres] = useState<number>(0);
  const [saveFlowSavedAcres, setSaveFlowSavedAcres] = useState<number>(0);

  // --- State for mapped data (no popup) ---
  const [rawMappedData, setRawMappedData] = useState<any[]>([]);

  // Add state for fetched master plans
  const [apiMasterPlans, setApiMasterPlans] = useState<{ id: string; name: string; plan_list: any[] }[]>([]);
  // Add state for fetched blocks
  const [apiBlocks, setApiBlocks] = useState<{ block_id: string; block_name: string; total_area: number }[]>([]);
  // Add state for zones
  const [apiZones, setApiZones] = useState<{ zone_id: string; zone_name: string; total_area: number }[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [blocksInZone, setBlocksInZone] = useState<{ block_id: string; block_name: string; total_area: number }[]>([]);
  const [planMode, setPlanMode] = useState<'zone' | 'group'>('group');
  const [plannerCards, setPlannerCards] = useState<CropPlannerCard[]>([]);
  const [blockLandsById, setBlockLandsById] = useState<BlockLandsMap>({});
  const usedBlockIds = useMemo(
    () => Array.from(new Set(plannerCards.map((c) => c.blockId).filter(Boolean))),
    [plannerCards]
  );

  // Rental services (multi-select)
  const [rentalServices, setRentalServices] = useState<RentalServiceOption[]>([]);
  const [selectedRentalServiceIds, setSelectedRentalServiceIds] = useState<string[]>([]);

  // Plan metadata state and loading
  const [planMetaLoading, setPlanMetaLoading] = useState(false);
  type DayPerTaskMap = Record<string, { days_needed: number; day_offset: number; work_quantity: number }>;
  const [planMeta, setPlanMeta] = useState<{ day_per_task: DayPerTaskMap; average_work_quantity: number } | null>(null);

  const workQtyByActivity = useMemo(() => {
    const map = new Map<string, number>();
    const src = planMeta?.day_per_task;
    if (!src) return map;
    for (const [name, meta] of Object.entries(src)) {
      map.set(String(name).trim().toLowerCase(), Number((meta as any)?.work_quantity) || 0);
    }
    return map;
  }, [planMeta?.day_per_task]);

  const navigate = useNavigate();

  // Fetch master plans from API on mount
  const BASE_URL = getBaseUrl(); // <-- Use shared config
  const CARD_LIGHT_TINTS = ['#fef3c7', '#dbeafe', '#dcfce7', '#fee2e2', '#f3e8ff', '#e0f2fe', '#ecfccb', '#ffe4e6'];

  const addPlannerCard = () => {
    setPlannerCards((prev) => {
      const newCard: CropPlannerCard = {
        id: `card-${Date.now()}-${Math.random()}`,
        blockId: '',
        cropType: '',
        plannerId: '',
        color: CARD_LIGHT_TINTS[prev.length % CARD_LIGHT_TINTS.length],
        selectedFarmTags: [],
        selectNew: false,
        selectOld: false,
        selectAll: false,
        showOnCalendar: false,
        mappingLocked: false,
        locked: false,
      };
      return [...prev, newCard];
    });
  };

  const updatePlannerCard = (cardId: string, patch: Partial<CropPlannerCard>) => {
    setPlannerCards((prev) => prev.map((card) => (card.id === cardId ? { ...card, ...patch } : card)));
  };

  const removePlannerCard = (cardId: string) => {
    setPlannerCards((prev) => prev.filter((card) => card.id !== cardId));
  };

  const getCropTags = (blockId: string, crop: CropType | ''): LandTag[] => {
    if (!blockId || !crop) return [];
    return blockLandsById[`${blockId}::${crop}`] || [];
  };

  const isTagUsedInOtherCard = (cardId: string, tagId: string) => {
    const current = plannerCards.find((c) => c.id === cardId);
    if (!current) return false;
    return plannerCards.some(
      (card) => card.id !== cardId && card.blockId === current.blockId && card.selectedFarmTags.includes(tagId)
    );
  };

  const toggleCardFarmTag = (cardId: string, tag: string) => {
    setPlannerCards((prev) =>
      prev.map((card) => {
        if (card.id !== cardId) return card;
        const exists = card.selectedFarmTags.includes(tag);
        return {
          ...card,
          selectedFarmTags: exists ? card.selectedFarmTags.filter((t) => t !== tag) : [...card.selectedFarmTags, tag],
        };
      })
    );
  };

  const applyLandFilter = (cardId: string, filter: 'new' | 'old' | 'all', checked: boolean) => {
    setPlannerCards((prev) => {
      const current = prev.find((c) => c.id === cardId);
      if (!current) return prev;

      const cropTags = getCropTags(current.blockId, current.cropType);
      let nextSelectNew = current.selectNew;
      let nextSelectOld = current.selectOld;
      let nextSelectAll = current.selectAll;

      if (filter === 'all') {
        nextSelectAll = checked;
        nextSelectNew = checked;
        nextSelectOld = checked;
      } else if (filter === 'new') {
        nextSelectNew = checked;
        nextSelectAll = checked && current.selectOld;
      } else {
        nextSelectOld = checked;
        nextSelectAll = checked && current.selectNew;
      }

      const eligibleTags = cropTags.filter((tag) =>
        nextSelectAll ? true : (nextSelectNew && tag.landType === 'new') || (nextSelectOld && tag.landType === 'old')
      );
      const selectedForFilter = eligibleTags
        .filter((tag) => !isTagUsedInOtherCard(cardId, tag.id))
        .map((tag) => tag.id);

      return prev.map((card) =>
        card.id === cardId
          ? {
              ...card,
              selectNew: nextSelectNew,
              selectOld: nextSelectOld,
              selectAll: nextSelectAll,
              selectedFarmTags: selectedForFilter,
            }
          : card
      );
    });
  };

  const getFirstCardPlannerId = () => {
    const matched = plannerCards.find((card) => !!card.plannerId);
    return matched?.plannerId || null;
  };

  useEffect(() => {
    // Only fetch once a card has both a block and a crop type chosen.
    const activePairs = new Set<string>();
    plannerCards.forEach((card) => {
      if (card.blockId && card.cropType) activePairs.add(`${card.blockId}::${card.cropType}`);
    });

    setBlockLandsById((prev) => {
      const next: BlockLandsMap = {};
      activePairs.forEach((key) => {
        if (prev[key]) next[key] = prev[key];
      });
      return next;
    });

    const pairsToFetch = Array.from(activePairs).filter((key) => !blockLandsById[key]);
    if (pairsToFetch.length === 0) return;

    Promise.all(
      pairsToFetch.map(async (key) => {
        const [blockId, cropType] = key.split('::');
        try {
          const resp = await fetch(`${BASE_URL}/admin_cultivation/farms_and_land_for_block`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ block_id: blockId, crop_type: cropType }),
          });
          if (!resp.ok) throw new Error(`Server responded ${resp.status}`);
          const data = await resp.json();
          const availableLands =
            data?.available_lands && typeof data.available_lands === 'object' ? data.available_lands : {};

          const lands: LandTag[] = Object.entries(availableLands)
            .map(([farmId, plots]) => {
              const plotArr = Array.isArray(plots) ? plots : [];
              if (plotArr.length === 0) return null; // no plots of this crop on this farm

              const totalArea = plotArr.reduce((sum: number, p: any) => sum + (Number(p?.plot_area) || 0), 0);
              const plotNames = plotArr.map((p: any) => String(p?.plot_name ?? '')).filter(Boolean);
              const name = (plotArr[0] as any)?.name || (plotArr[0] as any)?.farmer_name || undefined;

              return {
                id: farmId,
                name,
                area: Number(totalArea.toFixed(3)),
                plotNames,
                landType: 'old', // not provided by this API; kept so the New/Old filter still functions
                cropType: cropType as CropType,
              } as LandTag;
            })
            .filter(Boolean) as LandTag[];

          return { key, lands };
        } catch (error) {
          console.error('Failed to fetch farms/land for block+crop:', key, error);
          return { key, lands: [] as LandTag[] };
        }
      })
    ).then((results) => {
      setBlockLandsById((prev) => {
        const next = { ...prev };
        results.forEach(({ key, lands }) => {
          next[key] = lands;
        });
        return next;
      });
    });
  }, [plannerCards, BASE_URL]);

  useEffect(() => {
    fetch(`${BASE_URL}/admin_cultivation/get_master_cultivation_plans`)
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(data => {
        if (data && data.plan) {
          const plans = Object.entries(data.plan).map(([id, plan]: any) => ({
            id,
            name: plan.plan_name,
            plan_list: plan.plan_list || [],
          }));
          setApiMasterPlans(plans);
        }
      })
      .catch(err => {
        console.error('Failed to fetch master plans:', err);
      });

    // Fetch blocks
    fetch(`${BASE_URL}/farmer_managment/get_blocks`)
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(data => {
        if (data && Array.isArray(data.blocks)) {
          setApiBlocks(data.blocks.map((block: any) => ({
            block_id: block.block_id,
            block_name: block.block_name,
            total_area: block.total_area,
          })));
        }
      })
      .catch(err => {
        console.error('Failed to fetch blocks:', err);
      });

    // Fetch zones
    fetch(`${BASE_URL}/farmer_managment/get_zones`)
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(data => {
        if (data && Array.isArray(data.zones)) {
          setApiZones(data.zones.map((zone: any) => ({
            zone_id: zone.zone_id,
            zone_name: zone.zone_name,
            total_area: zone.total_area,
          })));
        }
      })
      .catch(err => {
        console.error('Failed to fetch zones:', err);
      });

    // Fetch rental services (rate cards)
    fetch(`${BASE_URL}/admin_rental/get_all_rental_rate_cards`)
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(data => {
        if (!Array.isArray(data)) return;
        const mapped: RentalServiceOption[] = data
          .map((item: any) => {
            const id = String(item?.rental_id ?? '').trim();
            const name = String(item?.service_name ?? '').trim();
            const status = String(item?.status ?? '').trim().toLowerCase();
            if (!id || !name) return null;
            return { id, name, isLive: status === 'live' };
          })
          .filter(Boolean) as RentalServiceOption[];

        // Prefer live services; if none are marked live, show all.
        const live = mapped.filter((s) => s.isLive);
        setRentalServices(live.length ? live : mapped);
      })
      .catch(err => {
        console.error('Failed to fetch rental services:', err);
      });

    // Fetch blocked dates
    fetch(`${BASE_URL}/admin_cultivation/blocked_dates`)
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(data => {
        if (data && Array.isArray(data.blocked_dates)) {
          const map: { [date: string]: boolean } = {};
          data.blocked_dates.forEach((d: string) => { if (d) map[String(d)] = true; });
          setBlockedDates(map);
        }
      })
      .catch(err => {
        console.error('Failed to fetch blocked dates:', err);
        setBlockedDates({});
      });
  }, []);

  const selectedRentalServices = useMemo(() => {
    if (!selectedRentalServiceIds.length) return [];
    const byId = new Map(rentalServices.map((s) => [s.id, s] as const));
    return selectedRentalServiceIds.map((id) => byId.get(id)).filter(Boolean) as RentalServiceOption[];
  }, [rentalServices, selectedRentalServiceIds]);

  const toggleRentalService = (id: string) => {
    setSelectedRentalServiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Helper to get selected master plan from API data
  const selectedApiMasterPlan = useMemo(() => {
    if (!masterPlanId) return null;
    return apiMasterPlans.find((p) => p.id === masterPlanId) || null;
  }, [apiMasterPlans, masterPlanId]);

  // Fallback: calculate average work quantity from master plan (if API meta isn't available)
  const avgWorkQtyFallback = useMemo(() => {
    if (!selectedApiMasterPlan || !selectedApiMasterPlan.plan_list || !selectedApiMasterPlan.plan_list.length) return null;
    // Try to find a numeric workQty property in each activity
    const total = selectedApiMasterPlan.plan_list.reduce((sum: number, act: any) => sum + (Number(act.workQty) || 0), 0);
    return (total / selectedApiMasterPlan.plan_list.length).toFixed(2);
  }, [selectedApiMasterPlan]);

  const avgWorkQtyDisplay = useMemo(() => {
    if (planMetaLoading) return 'Loading...';
    if (typeof planMeta?.average_work_quantity === 'number') {
      return planMeta.average_work_quantity.toFixed(2);
    }
    return avgWorkQtyFallback ?? '--';
  }, [avgWorkQtyFallback, planMeta?.average_work_quantity, planMetaLoading]);

  // Helper to get selected master plan's activities for highlighting (local logic)
  const getHighlights = (baseDate: Date | null, planId: string | null) => {
    if (!baseDate || !planId) return {};
    const plan = demoMasterPlanners.find(p => p.id === planId);
    if (!plan) return {};
    const highlights: { [date: string]: string } = {};
    plan.activities.forEach(activity => {
      // Use activity.dayOffset from the master plan
      const activityDate = addDays(baseDate, activity.dayOffset);
      if (activity.dayOffset <= 120) {
        highlights[format(activityDate, 'yyyy-MM-dd')] = activity.activityId;
      }
    });
    return highlights;
  };
  
  // --- Activity details inspection state (used by openActivityDetails) ---
  const [activityDetailsOpen, setActivityDetailsOpen] = useState(false);
  const [inspectedDate, setInspectedDate] = useState<Date | null>(null);
  const [inspectPresent, setInspectPresent] = useState<any[]>([]);
  const [inspectPending, setInspectPending] = useState<any[]>([]);

  const handleFarmSelect = (farm: Farm) => {
    setSelectedFarm(farm);
  };

  const handleMasterPlannerSelect = (planner: MasterPlanner) => {
    setSelectedMasterPlanner(planner);
  };

  const handleStartDateChange = (date: Date) => {
    setStartDate(date);
  };

  const handleGeneratePlan = () => {
    if (!selectedMasterPlanner || !startDate) return;
    const activities = generatePlannedActivities(selectedMasterPlanner, startDate);
    setPlannedActivities(activities);
    const probability = calculateCarryForwardProbability(activities);
    setCarryForwardProbability(probability);
    toast.success('Plan generated successfully!');
  };

  const handleSavePlan = () => {
    if (!selectedFarm || !selectedMasterPlanner || !startDate) return;
    // Save logic here
    toast.success('Cultivation plan saved successfully!');
  };

  const handleSaveLivePlan = async () => {
    const cards = plannerCards
      .map((card, idx) => {
        const block = apiBlocks.find((b) => b.block_id === card.blockId);
        const acres = (blockLandsById[`${card.blockId}::${card.cropType}`] || [])
          .filter((land) => card.selectedFarmTags.includes(land.id))
          .reduce((sum, land) => sum + Number(land.area || 0), 0);
        return {
          id: card.id,
          label: `${block?.block_name || card.blockId} - Card ${idx + 1}`,
          acres: Number(acres.toFixed(2)),
          status: 'pending' as CardSaveStatus,
          blockName: block?.block_name || card.blockId,
          blockTotalArea: Number(block?.total_area || 0),
          cropType: String(card.cropType || '-').toUpperCase(),
          masterName: apiMasterPlans.find((p) => p.id === card.plannerId)?.name || '-',
          color: card.color || '#f8fafc',
          farmIds: [...card.selectedFarmTags],
          planId: String(card.plannerId || ''),
          dateMapping: Array.isArray(mappedByCardRaw[card.id]) ? mappedByCardRaw[card.id] : (Array.isArray(mappedByCard[card.id]) ? mappedByCard[card.id] : []),
        };
      })
      .filter((c) => c.acres > 0 && c.planId && c.farmIds.length > 0 && c.dateMapping.length > 0);

    if (cards.length === 0) {
      toast.error('No mapped cards found to save. Please map cards first.');
      return;
    }

    const total = Number(cards.reduce((sum, c) => sum + c.acres, 0).toFixed(2));
    setSaveFlowCards(cards);
    setSaveFlowTotalAcres(total);
    setSaveFlowSavedAcres(0);
    setSaveFlowDescription('Preparing planner save queue...');
    setLivePlanProgressOpen(true);
    setSavingPlan(true);
    setLivePlanError(null);

    let saved = 0;
    const base = BASE_URL.replace(/\/$/, '');

    for (const card of cards) {
      try {
        setSaveFlowCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, status: 'saving' } : c)));
        setSaveFlowDescription(`Saving plan for ${card.acres} acres`);

        const payload = {
          farm_id: card.farmIds,
          date_mapping: card.dateMapping,
          plan_id: card.planId,
        };

        const saveResp = await fetch(`${base}/admin_cultivation/save_plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!saveResp.ok) throw new Error(`Save plan failed for ${card.label}`);
        const saveBody = await saveResp.json();
        if (!(saveBody && saveBody.status === 'success')) {
          throw new Error(`Save plan returned non-success for ${card.label}`);
        }

        saved += card.acres;
        setSaveFlowSavedAcres(Number(saved.toFixed(2)));
        setSaveFlowCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, status: 'done' } : c)));
      } catch (error) {
        setSaveFlowCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, status: 'error' } : c)));
        setLivePlanError(error instanceof Error ? error.message : 'Failed during card save flow');
        setSavingPlan(false);
        toast.error(error instanceof Error ? error.message : 'Failed during card save flow');
        return;
      }
    }

    setSaveFlowDescription('All card plans saved successfully.');
    setSavingPlan(false);
  };

  const handleNavigateBack = () => {
    navigate(-1);
  };

  const activityCategories = useMemo(
    () => Array.from(new Set(plannedActivities.map((a) => a.category))),
    [plannedActivities]
  );

  const getTotalAreaForDateMapping = () => {
    if (planMode === 'group') {
      const selectedTagIds = new Set<string>();
      plannerCards.forEach((card) => {
        card.selectedFarmTags.forEach((tagId) => selectedTagIds.add(tagId));
      });

      let totalFromTags = 0;
      Object.values(blockLandsById).forEach((lands) => {
        lands.forEach((land) => {
          if (selectedTagIds.has(land.id)) totalFromTags += Number(land.area || 0);
        });
      });

      if (totalFromTags > 0) return Number(totalFromTags.toFixed(2));

      const selectedBlocksArea = usedBlockIds.reduce((sum, id) => {
        const block = apiBlocks.find((b) => b.block_id === id);
        return sum + Number(block?.total_area || 0);
      }, 0);
      return Number(selectedBlocksArea.toFixed(2));
    }

    if (planMode === 'zone') {
      const zoneArea = blocksInZone.reduce((sum, block) => sum + Number(block.total_area || 0), 0);
      if (zoneArea > 0) return Number(zoneArea.toFixed(2));
    }

    const singleBlockArea = Number(apiBlocks.find((b) => b.block_id === farmId)?.total_area || 0);
    return Number(singleBlockArea.toFixed(2));
  };

  const setCalendarFromMappings = (source: Record<string, any[]>, selectedCardIds: string[]) => {
    const mappedEntries =
      selectedCardIds.length === 0
        ? Object.values(source).flat()
        : selectedCardIds.flatMap((id) => source[id] || []);

    setRawMappedData(mappedEntries);
    const highlights: { [date: string]: string } = {};
    const counts: { [date: string]: number } = {};
    const colors: { [date: string]: string } = {};
    const cardColorsByDate: { [date: string]: Record<string, string> } = {};
    const hoverByDate: {
      [date: string]: Record<string, { cardLabel: string; acres: number; activities: Set<string> }>;
    } = {};
    mappedEntries.forEach((item: any) => {
      if (!item || !item.date || !item.activity) return;
      const dates = Array.isArray(item.date) ? item.date : [item.date];
      dates.forEach((d: string) => {
        if (!d) return;
        highlights[d] = highlights[d] || item.activity;
        counts[d] = (counts[d] || 0) + 1;
        if (!colors[d] && item.card_color) colors[d] = item.card_color;
        if (!cardColorsByDate[d]) cardColorsByDate[d] = {};
        if (item.card_id && item.card_color) {
          cardColorsByDate[d][String(item.card_id)] = String(item.card_color);
        }
        if (!hoverByDate[d]) hoverByDate[d] = {};
        const key = String(item.card_id || 'unknown');
        if (!hoverByDate[d][key]) {
          hoverByDate[d][key] = {
            cardLabel: String(item.card_label || `Card ${key}`),
            acres: Number(item.selected_area || 0),
            activities: new Set<string>(),
          };
        }
        hoverByDate[d][key].activities.add(String(item.activity));
      });
    });
    setHighlighted(highlights);
    setHighlightCounts(counts);
    setHighlightColors(colors);
    setHighlightCardColors(
      Object.fromEntries(
        Object.entries(cardColorsByDate).map(([date, byCard]) => [date, Object.values(byCard)])
      )
    );
    setHoverDetailsByDate(
      Object.fromEntries(
        Object.entries(hoverByDate).map(([date, byCard]) => [
          date,
          Object.values(byCard).map((entry) => ({
            cardLabel: entry.cardLabel,
            acres: entry.acres,
            activities: Array.from(entry.activities),
          })),
        ])
      )
    );
  };

  const refreshCalendarFromCardViews = (source: Record<string, any[]>, cardsSource: CropPlannerCard[]) => {
    const selectedIds = cardsSource.filter((card) => card.showOnCalendar).map((card) => card.id);
    setCalendarFromMappings(source, selectedIds);
  };

  const handleMapSingleCard = async (cardId: string, day0Date: string) => {
    const card = plannerCards.find((c) => c.id === cardId);
    if (!card) throw new Error('Card not found');
    if (!card.blockId) throw new Error('Select a block first');
    if (!card.plannerId) throw new Error('Select master cultivation first');
    if (!card.selectedFarmTags.length) throw new Error('Select at least one land tag');
    if (!day0Date) throw new Error('Select a start date');

    setMappingCardLoading(true);
    try {
      const cardLands = (blockLandsById[`${card.blockId}::${card.cropType}`] || []).filter((land) => card.selectedFarmTags.includes(land.id));
      const totalArea = cardLands.reduce((sum, land) => sum + Number(land.area || 0), 0);

      const metaResp = await fetch(`${BASE_URL}/admin_cultivation/plan_metadata_finder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block_id: card.blockId, master_plan_id: card.plannerId }),
      });
      if (!metaResp.ok) throw new Error('Failed to fetch plan metadata');
      const metaData = await metaResp.json();
      setPlanMeta(metaData);

      const mapResp = await fetch(`${BASE_URL}/admin_cultivation/date_mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day_0_date: day0Date,
          master_cultivation_plan_id: card.plannerId,
          total_area: Number(totalArea.toFixed(2)),
          day_per_task: metaData?.day_per_task ?? {},
        }),
      });
      if (!mapResp.ok) throw new Error('Failed to fetch date mapping');
      const mapData = await mapResp.json();

      const rawList = Array.isArray(mapData?.date_mapping) ? mapData.date_mapping : [];
      const enriched = rawList.map((item: any) => ({
        ...item,
        card_id: card.id,
        card_label: `${apiBlocks.find((b) => b.block_id === card.blockId)?.block_name || card.blockId} - ${String(card.cropType || '').toUpperCase() || 'CARD'}`,
        card_color: card.color,
        selected_area: Number(totalArea.toFixed(2)),
        block_id: card.blockId,
        crop_type: card.cropType,
        work_quantity: workQtyByActivity.get(String(item?.activity || '').trim().toLowerCase()) ?? 0,
      }));

      const nextMapped = { ...mappedByCard, [card.id]: enriched };
      setMappedByCard(nextMapped);
      setMappedByCardRaw((prev) => ({ ...prev, [card.id]: rawList }));
      const nextCards = plannerCards.map((c) =>
        c.id === cardId ? { ...c, mappedStartDate: day0Date, showOnCalendar: true } : c
      );
      setPlannerCards(nextCards);
      refreshCalendarFromCardViews(nextMapped, nextCards);
      setSelectionMode(true);
      setDialogOpen(false);
      toast.success('Land mapping generated for this card');
    } finally {
      setMappingCardLoading(false);
    }
  };

  // Handle day click: always remap activities and highlight, no popup
  const handleDayClick = async (date: Date) => {
    if (selectionMode && masterPlanId) {
      if (planMode === 'group' && activeMappingCard) {
        try {
          await handleMapSingleCard(activeMappingCard, format(date, 'yyyy-MM-dd'));
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Failed to map selected card');
        }
        return;
      }
      if (planMode === 'group' && Object.keys(mappedByCard).length > 0) {
        setDay0(date);
        return;
      }
      setDay0(date);
      try {
        const totalArea = getTotalAreaForDateMapping();
        const response = await fetch(`${BASE_URL}/admin_cultivation/date_mapping`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            day_0_date: format(date, 'yyyy-MM-dd'),
            master_cultivation_plan_id: masterPlanId,
            total_area: totalArea,
            day_per_task: planMeta?.day_per_task ?? {},
          }),
        });
        if (!response.ok) throw new Error('Failed to fetch date mapping');
        const data = await response.json();
        if (data && Array.isArray(data.date_mapping)) {
          const enriched = data.date_mapping.map((item: any) => {
            const activityName = String(item?.activity || '').trim();
            const work_quantity = workQtyByActivity.get(activityName.toLowerCase()) ?? 0;
            return { ...item, work_quantity };
          });
          setRawMappedData(enriched);
          const highlights: { [date: string]: string } = {};
          const counts: { [date: string]: number } = {};
          enriched.forEach((item: any) => {
            if (!item || !item.date || !item.activity) return;
            const dates = Array.isArray(item.date) ? item.date : [item.date];
            dates.forEach((d: string) => {
              if (!d) return;
              highlights[d] = highlights[d] || item.activity;
              counts[d] = (counts[d] || 0) + 1;
            });
          });
          setHighlighted(highlights);
          setHighlightCounts(counts);
          toast.success("Plan generated!");
        } else {
          setHighlighted({});
          setHighlightCounts({});
        }
      } catch (err) {
        setHighlighted({});
        setHighlightCounts({});
        console.error('Failed to fetch date mapping:', err);
      }
    }
  };

  const openActivityDetails = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    // Present: Activities happening exactly on this date
    const present = rawMappedData.filter(d => d.date === dateStr);
    
    // Pending: Activities scheduled strictly before this date
    // You might want to filter this further based on 'status' if your API returned it
    const pending = rawMappedData.filter(d => d.date < dateStr);

    setInspectedDate(date);
    setInspectPresent(present);
    setInspectPending(pending);
    setActivityDetailsOpen(true);
  };

  // Generate 3 months before the current month (so back-dated plans, e.g. for a month
  // that already started, can still be created) through 12 months ahead.
  const months = useMemo(() => {
    const today = new Date();
    const pastMonthsToShow = 3;
    return Array.from({ length: pastMonthsToShow + 13 }, (_, i) =>
      addMonths(startOfMonth(today), i - pastMonthsToShow)
    );
  }, []);

  // `blockedDates` is populated from the API (`/admin_cultivation/blocked_dates`)

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Cultivation Plan</h1>
          {day0 && <p className="text-muted-foreground mt-1 text-sm">Start Date: {format(day0, 'PPP')}</p>}
        </div>
        <div className="flex items-center gap-3">
          {(day0 || Object.keys(mappedByCard).length > 0) && (
            <Button
              size="lg"
              className="gap-2 px-8 py-3 text-white font-extrabold text-lg bg-gradient-to-r from-green-600 via-emerald-500 to-lime-500 shadow-lg shadow-green-300/40 border-2 border-green-700 ring-4 ring-green-200 focus:ring-green-400 focus:outline-none transition-all duration-200 hover:scale-105 hover:bg-gradient-to-br hover:from-green-700 hover:to-lime-600"
              onClick={handleSaveLivePlan}
              disabled={savingPlan}
            >
              <CircleDot className="h-6 w-6 animate-pulse text-white drop-shadow" />
              Live Plan
            </Button>
          )}
          <Button onClick={() => setDialogOpen(true)} size="lg" className="gap-2">
            + Create Plan
          </Button>
        </div>
      </div>

      {/* Carry Forward Probability & Average Work Quantity Side by Side */}
      <div className="w-full max-w-3xl mx-auto mb-8 flex flex-col sm:flex-row gap-4">
        <div className="flex-1 bg-white border border-gray-200 rounded-xl shadow p-5 flex items-center justify-between">
          <span className="text-lg font-medium text-gray-700">Carry Forward Probability:</span>
          <span className="text-2xl font-bold text-green-700">{carryForwardProbability !== null ? `${carryForwardProbability}%` : '--'}</span>
        </div>
        <div className="flex-1 bg-white border border-gray-200 rounded-xl shadow p-5 flex items-center justify-between">
          <span className="text-lg font-medium text-gray-700">Average Work Quantity:</span>
          <span className="text-2xl font-bold text-blue-700">{avgWorkQtyDisplay}</span>
        </div>
      </div>

      {/* --- DIALOG: Select Farm/Plan with Tabs --- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto border-0 shadow-2xl">
          <div className="-m-6 mb-4 rounded-t-lg bg-emerald-700 px-6 py-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-2xl font-bold text-white">
                <Sprout className="h-6 w-6" />
                Create Cultivation Plan
              </DialogTitle>
              <DialogDescription className="text-white/80">
                Pick your blocks, configure crop cards, and tag the farms/plots to plant.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-5 mt-2">
            <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-700">
                  <Layers className="h-4 w-4" /> Crop Planner Cards
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1 bg-emerald-700 hover:bg-emerald-800 text-white"
                  onClick={() => addPlannerCard()}
                >
                  <Plus className="h-4 w-4" /> Add Card
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                For each card: pick a block, crop type, cultivation master, then tag the farms/plots to plant.
              </p>

              {plannerCards.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center text-xs text-gray-500">
                  No cards yet. Click "Add Card" to start planning.
                </div>
              ) : (
                <ScrollArea className="h-[460px] pr-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {plannerCards.map((card) => {
                      const block = apiBlocks.find((b) => b.block_id === card.blockId);
                      const cropTags = getCropTags(card.blockId, card.cropType);
                      const selectedArea = cropTags
                        .filter((tag) => card.selectedFarmTags.includes(tag.id))
                        .reduce((sum, tag) => sum + tag.area, 0);

                      return (
                        <div key={card.id} className="rounded-xl border border-gray-200 p-3 bg-white">
                          <div className="grid grid-cols-1 gap-2">
                            {/* Step 1: Block */}
                            <div className="relative">
                              <LandPlot className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-700" />
                              <Select
                                value={card.blockId || ''}
                                onValueChange={(value) =>
                                  updatePlannerCard(card.id, {
                                    blockId: value,
                                    cropType: '',
                                    plannerId: '',
                                    selectedFarmTags: [],
                                    selectNew: false,
                                    selectOld: false,
                                    selectAll: false,
                                  })
                                }
                                disabled={card.locked}
                              >
                                <SelectTrigger className="h-9 border border-gray-300 pl-8">
                                  <SelectValue placeholder="Select block" />
                                </SelectTrigger>
                                <SelectContent>
                                  {apiBlocks.map((b) => (
                                    <SelectItem key={b.block_id} value={b.block_id}>{b.block_name} ({b.total_area} acres)</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {block && (
                              <div className="grid grid-cols-2 gap-2 rounded-lg bg-emerald-700 p-2 text-white">
                                <div className="flex items-center gap-1 text-xs font-semibold"><LandPlot className="h-3 w-3" /> Block</div>
                                <div className="text-right text-xs font-semibold">{block.block_name}</div>
                                <div className="text-xs font-semibold">Total Land Area</div>
                                <div className="text-right text-xs font-semibold">{block.total_area} acres</div>
                              </div>
                            )}

                            {/* Step 2: Crop Type */}
                            <div className="relative">
                              {card.cropType && <Sprout className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-700" />}
                              <Select
                                value={card.cropType || ''}
                                onValueChange={(value) =>
                                  updatePlannerCard(card.id, {
                                    cropType: value as CropType,
                                    selectedFarmTags: [],
                                    selectNew: false,
                                    selectOld: false,
                                    selectAll: false,
                                  })
                                }
                                disabled={card.locked || !card.blockId}
                              >
                                <SelectTrigger className={cn('h-9 border border-gray-300', card.cropType && 'pl-8')}>
                                  <SelectValue placeholder="Select crop type" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="paddy">Paddy</SelectItem>
                                  <SelectItem value="rahar">Rahar</SelectItem>
                                  <SelectItem value="napier">Napier</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Step 3: Master Plan */}
                            <div className="relative">
                              <Calendar className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-700" />
                              <Select
                                value={card.plannerId}
                                onValueChange={(value) => updatePlannerCard(card.id, { plannerId: value })}
                                disabled={card.locked || !card.cropType}
                              >
                                <SelectTrigger className="h-9 border border-gray-300 pl-8">
                                  <SelectValue placeholder="Select cultivation master" />
                                </SelectTrigger>
                                <SelectContent>
                                  {apiMasterPlans.map((plan) => (
                                    <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Step 4: Farms & Plots */}
                            <div className="rounded-lg bg-white border border-gray-200 p-2">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="flex items-center gap-1 text-xs font-bold text-emerald-700">
                                  <Rows3 className="h-3.5 w-3.5" /> Farms &amp; Plots
                                </p>
                                <div className="flex items-center gap-1">
                                  {(['new', 'old', 'all'] as const).map((filter) => {
                                    const checked = filter === 'new' ? card.selectNew : filter === 'old' ? card.selectOld : card.selectAll;
                                    return (
                                      <button
                                        key={filter}
                                        type="button"
                                        disabled={card.locked || !card.plannerId}
                                        onClick={() => applyLandFilter(card.id, filter, !checked)}
                                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize transition-colors ${
                                          checked
                                            ? 'border-emerald-700 bg-emerald-700 text-white'
                                            : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                                        }`}
                                      >
                                        {filter}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {!card.blockId ? (
                                <p className="px-1 py-2 text-xs text-muted-foreground">Select a block to begin</p>
                              ) : !card.plannerId ? (
                                <p className="px-1 py-2 text-xs text-muted-foreground">
                                  {!card.cropType ? 'Select crop type to continue' : 'Select cultivation master to see farms'}
                                </p>
                              ) : cropTags.length === 0 ? (
                                <p className="px-1 py-2 text-xs text-muted-foreground">No lands found for selected crop</p>
                              ) : (
                                <div className="overflow-hidden rounded-lg border border-gray-200">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-emerald-700 text-white">
                                        <th className="px-2 py-1.5 text-left font-semibold">Farm ID</th>
                                        <th className="px-2 py-1.5 text-left font-semibold">
                                          {card.cropType ? `${card.cropType.charAt(0).toUpperCase()}${card.cropType.slice(1)} Area` : 'Area'}
                                        </th>
                                        <th className="px-2 py-1.5 text-left font-semibold">Plots</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white">
                                      {cropTags.map((tag) => {
                                        const selected = card.selectedFarmTags.includes(tag.id);
                                        const usedElsewhere = isTagUsedInOtherCard(card.id, tag.id);
                                        const disabled = card.locked || usedElsewhere;
                                        return (
                                          <tr
                                            key={tag.id}
                                            onClick={() => !disabled && toggleCardFarmTag(card.id, tag.id)}
                                            className={`transition-colors ${
                                              disabled
                                                ? 'opacity-40 cursor-not-allowed'
                                                : selected
                                                  ? 'bg-emerald-50 cursor-pointer'
                                                  : 'cursor-pointer hover:bg-emerald-50/60'
                                            }`}
                                          >
                                            <td className="px-2 py-1.5 font-medium text-slate-800">
                                              <span className="flex items-center gap-1">
                                                {selected && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />}
                                                {tag.name || tag.id}
                                              </span>
                                              {tag.name && <div className="text-[10px] text-slate-400">{tag.id}</div>}
                                            </td>
                                            <td className="px-2 py-1.5 font-semibold text-slate-700">{tag.area} ac</td>
                                            <td className="px-2 py-1.5 text-slate-600">
                                              {tag.plotNames.length > 0 ? tag.plotNames.join(', ') : '—'}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-end gap-2">
                              <Badge className="bg-emerald-700 text-white border-0">
                                Selected Area: {selectedArea.toFixed(2)} acres
                              </Badge>
                              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => removePlannerCard(card.id)}>
                                <X className="h-3.5 w-3.5" /> Cancel
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>

          <DialogFooter className="gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="font-semibold gap-1">
              <X className="h-4 w-4" /> Cancel
            </Button>
            <Button
              onClick={async () => {
                if (usedBlockIds.length === 0) {
                  toast.error('Please add at least one card and select a block');
                  return;
                }
                const matrixPlanId = getFirstCardPlannerId();
                if (!matrixPlanId) {
                  toast.error('Please configure at least one card with cultivation master');
                  return;
                }
                setMasterPlanId(matrixPlanId);
                // Use first selected block as farmId for metadata
                setFarmId(usedBlockIds[0]);

                setPlanMetaLoading(true);
                setPlanMeta(null);
                try {
                  const cardsConfigured = plannerCards.filter(
                    (card) => card.blockId && card.plannerId && card.selectedFarmTags.length > 0
                  );
                  if (cardsConfigured.length === 0) {
                    throw new Error('Please configure at least one card with planner and lands');
                  }
                  const lockedCards = plannerCards.map((c) => ({ ...c, locked: true }));
                  setPlannerCards(lockedCards);
                  setDialogOpen(false);
                  setSelectionMode(true);
                  setDay0(null);
                  refreshCalendarFromCardViews(mappedByCard, lockedCards);
                  toast.success('Group card setup complete! Use "Make Land Mapping" on each card.');
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Failed to load plan metadata');
                } finally {
                  setPlanMetaLoading(false);
                }
              }}
              disabled={planMetaLoading || usedBlockIds.length === 0}
              className="gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold px-6"
            >
              <CheckCircle2 className="h-4 w-4" />
              {planMetaLoading ? 'Loading...' : 'Continue to Calendar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- DIALOG: Live Plan Progress --- */}
      <Dialog
        open={livePlanProgressOpen}
        onOpenChange={(open) => {
          // Prevent accidental close while working
          if (savingPlan) return;
          setLivePlanProgressOpen(open);
          if (!open) {
            setLivePlanStep(1);
            setSavePlanStatus('idle');
            setAssignFarmsStatus('idle');
            setAssignContractFarmersStatus('idle');
            setAdjustRentalServicesStatus('idle');
            setLivePlanError(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Saving Plan</DialogTitle>
            <DialogDescription>
              Card-wise save progress (UI flow only).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm font-semibold text-slate-800">
                Making planner for total selected area: {saveFlowTotalAcres.toFixed(2)} acres
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Card View</div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {saveFlowCards.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-md border p-2 text-xs"
                    style={{
                      backgroundColor: c.color,
                      borderColor:
                        c.status === 'done'
                          ? '#22c55e'
                          : c.status === 'error'
                            ? '#ef4444'
                          : c.status === 'saving' || c.status === 'assigning'
                            ? '#3b82f6'
                            : '#94a3b8',
                      color: '#1f2937',
                    }}
                  >
                    <div className="rounded bg-white/70 p-2">
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                        <span className="font-medium text-slate-700">Block</span>
                        <span className="text-right font-bold text-slate-900">{c.blockName || '-'}</span>
                        <span className="font-medium text-slate-700">Total Area</span>
                        <span className="text-right font-bold text-slate-900">{c.blockTotalArea || 0} ac</span>
                        <span className="font-medium text-slate-700">Crop</span>
                        <span className="text-right font-bold text-slate-900">{c.cropType || '-'}</span>
                        <span className="font-medium text-slate-700">Master</span>
                        <span className="text-right font-bold text-slate-900 truncate">{c.masterName || '-'}</span>
                      </div>
                    </div>
                    <div className="mt-1 text-right font-semibold">Selected: {c.acres} ac</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-sm text-slate-700">{saveFlowDescription}</div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">Progress</span>
                <span className="font-semibold text-slate-900">
                  {saveFlowTotalAcres > 0 ? Math.round((saveFlowSavedAcres / saveFlowTotalAcres) * 100) : 0}%
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                  style={{ width: `${saveFlowTotalAcres > 0 ? (saveFlowSavedAcres / saveFlowTotalAcres) * 100 : 0}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-slate-600">
                {saveFlowSavedAcres.toFixed(2)} / {saveFlowTotalAcres.toFixed(2)} acres saved
              </div>
            </div>
          </div>

          <div className="hidden space-y-4 py-2">
            {/* Step 1 */}
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="mt-0.5">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">Step 1: Plan made and ready to save</div>
                <div className="text-sm text-muted-foreground">Ready</div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
              <div className="mt-0.5">
                {savePlanStatus === 'loading' ? (
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                ) : savePlanStatus === 'success' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : savePlanStatus === 'error' ? (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                ) : (
                  <CircleDot className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <div className="font-semibold">Step 2: Saving plan</div>
                <div className="text-sm text-muted-foreground">
                  {savePlanStatus === 'loading'
                    ? 'Saving plan…'
                    : savePlanStatus === 'success'
                      ? 'Plan saved'
                      : savePlanStatus === 'error'
                        ? 'Failed to save plan'
                        : 'Pending'}
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
              <div className="mt-0.5">
                {assignFarmsStatus === 'loading' ? (
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                ) : assignFarmsStatus === 'success' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : assignFarmsStatus === 'error' ? (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                ) : (
                  <CircleDot className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <div className="font-semibold">Step 3: Assigning farms</div>
                <div className="text-sm text-muted-foreground">
                  {assignFarmsStatus === 'loading'
                    ? 'Assigning farms…'
                    : assignFarmsStatus === 'success'
                      ? 'Farms assigned successfully'
                      : assignFarmsStatus === 'error'
                        ? 'Failed to assign farms'
                        : 'Pending'}
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
              <div className="mt-0.5">
                {assignContractFarmersStatus === 'loading' ? (
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                ) : assignContractFarmersStatus === 'success' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : assignContractFarmersStatus === 'error' ? (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                ) : (
                  <CircleDot className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <div className="font-semibold">Step 4: Assigning contract farmers</div>
                <div className="text-sm text-muted-foreground">
                  {assignContractFarmersStatus === 'loading'
                    ? 'Assigning contract farmers…'
                    : assignContractFarmersStatus === 'success'
                      ? 'Contract farmers assigned successfully'
                      : assignContractFarmersStatus === 'error'
                        ? 'Failed to assign contract farmers'
                        : 'Pending'}
                </div>
              </div>
            </div>

            {/* Step 5 */}
            <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
              <div className="mt-0.5">
                {adjustRentalServicesStatus === 'loading' ? (
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                ) : adjustRentalServicesStatus === 'success' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : adjustRentalServicesStatus === 'error' ? (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                ) : (
                  <CircleDot className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <div className="font-semibold">Step 5: Adjusting rental services</div>
                <div className="text-sm text-muted-foreground">
                  {adjustRentalServicesStatus === 'loading'
                    ? 'Adjusting rental services…'
                    : adjustRentalServicesStatus === 'success'
                      ? 'Rental services adjusted successfully'
                      : adjustRentalServicesStatus === 'error'
                        ? 'Failed to adjust rental services'
                        : 'Pending'}
                </div>
              </div>
            </div>

            {livePlanError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {livePlanError}
              </div>
            )}
          </div>

          <DialogFooter>
            {!savingPlan && saveFlowTotalAcres > 0 && saveFlowSavedAcres >= saveFlowTotalAcres ? (
              <Button
                className="bg-green-700 hover:bg-green-800"
                onClick={() => {
                  setLivePlanProgressOpen(false);
                  toast.success('UI save flow completed.');
                }}
              >
                Done
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => setLivePlanProgressOpen(false)}
                disabled={savingPlan}
              >
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Show selected farm and master plan above the calendar */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        {farmId && (
          <span className="inline-flex items-center px-3 py-1 rounded bg-muted text-foreground text-sm font-medium">
            <MapPin className="h-4 w-4 mr-1 text-muted-foreground" />
            {apiBlocks.find(b => b.block_id === farmId)?.block_name}
            {apiBlocks.find(b => b.block_id === farmId) && (
              <span className="ml-2 text-xs">{apiBlocks.find(b => b.block_id === farmId)?.total_area} acres</span>
            )}
          </span>
        )}
        {masterPlanId && (
          <span className="inline-flex items-center px-3 py-1 rounded bg-muted text-foreground text-sm font-medium">
            <Calendar className="h-4 w-4 mr-1 text-muted-foreground" />
            {apiMasterPlans.find(p => p.id === masterPlanId)?.name}
          </span>
        )}

        {selectedRentalServices.length > 0 && (
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded bg-muted text-foreground text-sm font-medium">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Rental Services:</span>
            <span className="font-semibold">
              {selectedRentalServices.length === 1
                ? selectedRentalServices[0].name
                : `${selectedRentalServices.length} selected`}
            </span>
          </span>
        )}

        {planMode === 'zone' && farmId && masterPlanId && !day0 && (
          <span className="text-muted-foreground text-xs animate-pulse font-semibold text-blue-600">
             &larr; Please click a date below to set Day 0
          </span>
        )}
        {planMode === 'group' && activeMappingCard && (
          <span className="text-muted-foreground text-xs animate-pulse font-semibold text-blue-600">
            &larr; Click a date on calendar to map selected card
          </span>
        )}
      </div>

      {planMode === 'group' && plannerCards.length > 0 && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-slate-800">Configured Cards Mapping</p>
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-3 min-w-max">
              {plannerCards.map((card) => {
                const block = apiBlocks.find((b) => b.block_id === card.blockId);
                if (!block) return null;
                const selectedArea = (blockLandsById[`${card.blockId}::${card.cropType}`] || [])
                  .filter((land) => card.selectedFarmTags.includes(land.id))
                  .reduce((sum, land) => sum + Number(land.area || 0), 0);
                const canMap = !!card.cropType && !!card.plannerId && card.selectedFarmTags.length > 0;
                const isActive = activeMappingCard === card.id;
                return (
                  <div
                    key={`map-card-${card.id}`}
                    className="w-[31%] min-w-[300px] max-w-[360px] shrink-0 rounded-lg border p-3"
                    style={{ backgroundColor: card.color, borderColor: '#c4b5fd' }}
                  >
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 text-slate-500"><LandPlot className="h-3.5 w-3.5" /> Block</span>
                        <span className="font-semibold text-slate-900 truncate max-w-[170px]">{block.block_name}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 text-slate-500"><Wheat className="h-3.5 w-3.5" /> Total Area</span>
                        <span className="font-semibold text-slate-900">{block.total_area} ac</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 text-slate-500"><Sprout className="h-3.5 w-3.5" /> Crop</span>
                        <span className="font-semibold text-slate-900 uppercase">{card.cropType || '-'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 text-slate-500"><UserSquare2 className="h-3.5 w-3.5" /> Master</span>
                        <span className="font-semibold text-slate-900 truncate max-w-[170px]">{apiMasterPlans.find((p) => p.id === card.plannerId)?.name || '-'}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-slate-600">Selected: {selectedArea.toFixed(2)} ac</div>
                    {card.mappedStartDate && <div className="mt-1 text-xs text-slate-600">Mapped: {card.mappedStartDate}</div>}

                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={isActive ? 'default' : 'outline'}
                        onClick={() => setActiveMappingCard(isActive ? null : card.id)}
                        disabled={!canMap || card.mappingLocked || mappingCardLoading}
                      >
                        <Calendar className="mr-1 h-4 w-4" /> Map
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={card.showOnCalendar ? 'default' : 'outline'}
                        onClick={() => {
                          const nextCards = plannerCards.map((c) =>
                            c.id === card.id ? { ...c, showOnCalendar: !c.showOnCalendar } : c
                          );
                          setPlannerCards(nextCards);
                          refreshCalendarFromCardViews(mappedByCard, nextCards);
                        }}
                        disabled={!mappedByCard[card.id]?.length}
                      >
                        {card.showOnCalendar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={card.mappingLocked ? 'default' : 'outline'}
                        onClick={() => {
                          const nextLocked = !card.mappingLocked;
                          setPlannerCards((prev) =>
                            prev.map((c) => (c.id === card.id ? { ...c, mappingLocked: nextLocked } : c))
                          );
                          if (nextLocked && activeMappingCard === card.id) {
                            setActiveMappingCard(null);
                          }
                        }}
                        disabled={!mappedByCard[card.id]?.length}
                      >
                        <Lock className="mr-1 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowBlockedDates((prev) => !prev)}
        >
          {showBlockedDates ? 'Hide Block Dates' : 'Show Block Dates'}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {months.map((month) => (
          <MonthCalendar
            key={month.toISOString()}
            month={month}
            selectedDate={day0}
            onDateClick={planMetaLoading ? undefined : handleDayClick}
            isSelectionMode={selectionMode}
            highlighted={highlighted}
            highlightCounts={highlightCounts}
            highlightColors={highlightColors}
            highlightCardColors={highlightCardColors}
            hoverDetailsByDate={hoverDetailsByDate}
            blockedDates={showBlockedDates ? blockedDates : {}}
          />
        ))}
      </div>

      {/* ResourceAllocationPanel temporarily hidden */}
    </div>
  );
};

export default CreateCultivationPlan;
