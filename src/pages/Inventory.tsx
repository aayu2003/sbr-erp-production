import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import {
  Plus,
  Search,
  Edit3,
  ArrowDownToLine,
  ArrowUpFromLine,
  Lock,
  PackageCheck,
  History,
  Boxes,
  Layers,
  X,
  Upload,
  Trash2,
  ChevronDown,
  AlertTriangle,
  ClipboardList,
  Undo2,
  IndianRupee,
  ShieldAlert,
  Settings,
  ArrowRightLeft,
  ShieldCheck,
  MessageCircle,
  FileCheck,
  Send,
  Info,
  Printer,
  TrendingUp,
  PackageX,
  Clock3,
  Split,
  ArrowDown,
  ArrowRight,
  Map as MapIcon,
  FileText,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MapContainer, TileLayer, Polygon, Marker, Polyline, Tooltip as LeafletTooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from '@/lib/dateFormat';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  createInventoryApproval,
  InventoryApprovalSignature,
  InventoryTransferApproval,
  readInventoryApprovals,
  subscribeToInventoryApprovals,
  updateInventoryApproval,
} from '@/lib/inventoryApprovalStore';
import { SignatureBox } from '@/components/inventory/SignatureBox';
import {
  TransferSlipDocument,
  transferSlipDataFromApproval,
  transferSlipDataFromStockTransfer,
  type StockTransfer,
} from '@/components/inventory/TransferSlipDocument';
import logo3f from '@/Assets/3f-logo.png';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
type StockTransaction = {
  id: string;
  type: 'incoming' | 'outgoing' | 'issued' | 'adjustment';
  qty: number;
  date: string;
  note: string;
  by: string;
  costPerUnit?: number;
};

type StockItem = {
  id: string;
  name: string;
  category: string;
  sku: string;
  unit: string;
  currentStock: number;
  stockInPipeline?: number;
  minStock: number;
  inventoryGroup?: string;
  subCategory?: string;
  expenseClassification?: string;
  inventoryClassification?: string;
  issueClassification?: string;
  stockIssueMethod?: string;
  packingSize?: string;
  shelf?: string;
  batchTracking?: boolean;
  expiryTracking?: boolean;
  batchNumber?: string;
  manufacturingDate?: string;
  expiryDate?: string;
  supplier?: string;
  storageLocation?: string;
  imageUrl: string;
  location: string;
  description: string;
  // Vendor tiers (L1, L2, L3)
  vendors: {
    level: string;
    company: string;
    msmeCertificate: string;
    gstNumber: string;
    contact?: string;
  }[];
  // Series number like SBR/INV/P2/
  seriesNumber: string;
  transactions: StockTransaction[];
  // Real per-store quantity + batch breakdown, straight off the backend Inventory
  // record — the authoritative source for where this item's stock actually sits,
  // since logistics-approved transfers only ever update this map (not `currentStock`).
  dissociation?: ItemDissociation;
  fifoList?: {
    stock: number;
    per_unit_cost: number;
    po_number: string;
    batch_number?: string;
    manufacturing_date?: string;
    expiry_date?: string;
    supplier?: string;
    storage_location?: string;
  }[];
};

const INVENTORY_DASHBOARD_COLORS = ['#0D3A35', '#2563eb', '#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#64748b'];

type RequestMapFarm = {
  farm_id: string;
  crop_type: string;
  village: string;
  district: string;
  block_id: string;
  land_coordinates: [number, number][];
};

// ─────────────────────────────────────────────────────────────
// BLOCK INVENTORY REQUESTS — GET /inventory/get_a_block_inventory_requests
// returns every pending request project-wide; each one carries a
// land_wise_item_list mapping items to the specific farms they're needed for.
// ─────────────────────────────────────────────────────────────
type BlockLandItem = {
  farm_id: string;
  owner_name?: string;
  product_id: string;
  item_name: string;
  quantity: number;
  unit?: string;
};

type BlockPendingRequest = {
  item_list: { equipment_id: string; quantity: number; equipment_name?: string }[];
  task_id: string;
  equipment_otp: string | null;
  task_type: string;
  land_wise_item_list: BlockLandItem[];
};

const TASK_TYPE_LABELS: Record<string, string> = {
  on_demand: 'On-Demand Task',
  cultivation: 'Cultivation Calendar',
};

// GET /inventory/get_inventory_item_dissociation/{item_id} — where an item's
// stock physically sits across warehouses.
type ItemDissociationEntry = {
  quantity: number;
  batches: { per_unit_cost: number; stock: number; po_number: string }[];
};

type ItemDissociation = Record<string, ItemDissociationEntry>;

// ─────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────
const CATEGORIES = [
  'All',
  'Seeds',
  'Fertilizer',
  'Agro Chemicals',
  'Implements',
  'Machines',
  'Spare Parts',
  'Tools & Consumables',
  'Irrigation Materials',
  'Packaging Material',
  'Agro Equipments',
  'Electrical items',
  'Civil & Infra Equipments',
  'Storage Materials',
  'IT Assets',
  'Office & Administration',
  'Others',
];
const UNITS = ['KGS', 'Nos', 'L', 'ML', 'Grams', 'Tons', 'BAGS'];
const INVENTORY_LOCATIONS = [
  'Warehouse A',
  'Warehouse B',
  'Cold Storage',
  'Chemical Store',
  'Equipment Room',
  'Irrigation Store',
];
const INVENTORY_GROUPS = [
  'Farm Inputs',
  'Seeds and Planting Material',
  'Fertilisers and Manure',
  'Crop Protection Chemicals',
  'Fuel and Lubricants',
  'Agricultural Machinery',
  'Tools and Equipment',
  'Machinery Spares',
  'Irrigation Materials',
  'Fencing Materials',
  'Construction Materials',
  'Safety and PPE',
  'IT Assets',
  'Office Assets',
  'Office Consumables',
  'Electrical Materials',
  'Plumbing Materials',
  'Vehicle Spares',
  'Packaging Materials',
  'Scrap and Obsolete Stock',
];
const EXPENSE_CLASSIFICATIONS = ['CAPEX', 'OPEX'];
const INVENTORY_CLASSIFICATIONS = ['Asset', 'Consumable', 'Spare', 'Tool', 'Material'];
const ISSUE_CLASSIFICATIONS = ['Returnable', 'Non-Returnable'];

type StockIssueMethodOption = {
  value: string;
  label: string;
  explanation: string;
  example: string;
};

const STOCK_ISSUE_METHODS: StockIssueMethodOption[] = [
  {
    value: 'FIFO',
    label: 'FIFO, First In First Out',
    explanation: 'Issues the oldest received stock first.',
    example: 'Fertilisers, diesel, pipes and general materials.',
  },
  {
    value: 'FEFO',
    label: 'FEFO, First Expiry First Out',
    explanation: 'Issues the batch with the earliest expiry date first.',
    example: 'Pesticides, seeds, chemicals and biological inputs.',
  },
  {
    value: 'LIFO',
    label: 'LIFO, Last In First Out',
    explanation: 'Issues the most recently received stock first.',
    example: 'Materials physically stored in stacks where the latest stock is accessed first.',
  },
  {
    value: 'MOVING_WEIGHTED_AVERAGE',
    label: 'Moving Weighted Average',
    explanation: 'Uses the recalculated average cost after each stock receipt.',
    example: 'Bulk consumables purchased repeatedly at different rates.',
  },
  {
    value: 'SPECIFIC_IDENTIFICATION',
    label: 'Specific Identification',
    explanation: 'Tracks and issues each item at its exact individual cost.',
    example: 'Machinery, equipment and serial-number-controlled assets.',
  },
];

const getStockIssueMethodOption = (value?: string) => {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return STOCK_ISSUE_METHODS.find((option) => (
    option.value.toLowerCase() === normalized
    || option.label.toLowerCase() === String(value || '').trim().toLowerCase()
    || option.label.toLowerCase().startsWith(`${String(value || '').trim().toLowerCase()},`)
  ));
};

const getStockIssueMethodLabel = (value?: string) =>
  getStockIssueMethodOption(value)?.label || (value ? String(value) : 'Not Recorded');

const formatSlipDate = (value: string) => {
  if (!value || value === 'Unknown Date') return 'Unknown Date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
};

const ISSUE_SLIP_STATUS_LABEL: Record<StockTransfer['logistics_status'], string> = {
  pending_vehicle: 'Awaiting Vehicle',
  pending_approval: 'Awaiting Approval',
  approved: 'Dispatched',
};
const ISSUE_SLIP_STATUS_CLASS: Record<StockTransfer['logistics_status'], string> = {
  pending_vehicle: 'border-amber-200 bg-amber-50 text-amber-700',
  pending_approval: 'border-blue-200 bg-blue-50 text-blue-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const DEFAULT_CATEGORY_GROUPS: Record<string, string> = {
  Seeds: 'Seeds and Planting Material',
  Fertilizer: 'Fertilisers and Manure',
  'Agro Chemicals': 'Crop Protection Chemicals',
  Implements: 'Agricultural Machinery',
  Machines: 'Agricultural Machinery',
  'Spare Parts': 'Machinery Spares',
  'Tools & Consumables': 'Tools and Equipment',
  'Irrigation Materials': 'Irrigation Materials',
  'Packaging Material': 'Packaging Materials',
  'Agro Equipments': 'Agricultural Machinery',
  'Electrical items': 'Electrical Materials',
  'Civil & Infra Equipments': 'Construction Materials',
  'Storage Materials': 'Construction Materials',
  'IT Assets': 'IT Assets',
  'Office & Administration': 'Office Assets',
  Others: 'Farm Inputs',
};

type StoreBlock = { block_id: string; block_name: string };

type StoreLocation = { lat: number; lng: number };

type StoreEntry = { name: string; blocks: StoreBlock[]; location: StoreLocation | null };

type InventoryMasterConfig = {
  inventoryGroups: string[];
  categories: string[];
  categoryGroups: Record<string, string>;
  subCategories: { name: string; category: string }[];
  units: string[];
  stores: StoreEntry[];
  expenseClassifications: string[];
  inventoryClassifications: string[];
  issueClassifications: string[];
};

const INVENTORY_MASTER_CONFIG_KEY = 'farm-connect.inventory-master-config.v1';
const INVENTORY_ITEM_METADATA_KEY = 'farm-connect.inventory-item-metadata.v1';
const LEGACY_INVENTORY_ITEM_METADATA: Record<string, Partial<InventoryItemMetadata>> = {
  'SBR/TNC/001': { issueClassification: 'Returnable' },
};

type InventoryItemMetadata = Pick<StockItem,
  | 'inventoryGroup'
  | 'subCategory'
  | 'expenseClassification'
  | 'inventoryClassification'
  | 'issueClassification'
  | 'stockIssueMethod'
  | 'packingSize'
  | 'shelf'
>;

const readInventoryItemMetadata = (): Record<string, Partial<InventoryItemMetadata>> => {
  if (typeof window === 'undefined') return {};
  try {
    const stored = JSON.parse(window.localStorage.getItem(INVENTORY_ITEM_METADATA_KEY) || '{}');
    return stored && typeof stored === 'object' ? stored : {};
  } catch {
    return {};
  }
};

const saveInventoryItemMetadata = (item: StockItem) => {
  if (typeof window === 'undefined') return;
  const stored = readInventoryItemMetadata();
  const metadata: Partial<InventoryItemMetadata> = {
    inventoryGroup: item.inventoryGroup,
    subCategory: item.subCategory,
    expenseClassification: item.expenseClassification,
    inventoryClassification: item.inventoryClassification,
    issueClassification: item.issueClassification,
    stockIssueMethod: item.stockIssueMethod,
    packingSize: item.packingSize,
    shelf: item.shelf,
  };
  if (item.id) stored[item.id] = metadata;
  if (item.sku) stored[item.sku] = metadata;
  window.localStorage.setItem(INVENTORY_ITEM_METADATA_KEY, JSON.stringify(stored));
};
const DEFAULT_INVENTORY_MASTER_CONFIG: InventoryMasterConfig = {
  inventoryGroups: INVENTORY_GROUPS,
  categories: CATEGORIES.filter((category) => category !== 'All'),
  categoryGroups: DEFAULT_CATEGORY_GROUPS,
  subCategories: [],
  units: UNITS,
  stores: [],
  expenseClassifications: EXPENSE_CLASSIFICATIONS,
  inventoryClassifications: INVENTORY_CLASSIFICATIONS,
  issueClassifications: ISSUE_CLASSIFICATIONS,
};
// Category code map with normalization helper.
// Keys in the raw map may vary; we'll normalize lookup to handle variants (case, & vs and, plurals).
const CATEGORY_CODE_MAP_RAW: Record<string, string> = {
  // canonical category labels
  'Seeds': 'SED',
  'Fertilizer': 'FRT',
  'Fertilizers': 'FRT',
  'Agro Chemicals': 'AGC',
  'Implements': 'IMP',
  'Machines': 'MAC',
  'Spare Parts': 'SPR',
  'Tools & Consumables': 'TNC',
  'Tools and Consumables': 'TNC',
  'Tools': 'TNC',
  'Irrigation Materials': 'IRM',
  'Irrigation materials': 'IRM',
  'Packaging Material': 'PKG',
  'Packaging': 'PKG',
  'Agro Equipments': 'AGE',
  'Agro equipments': 'AGE',
  'Agro Equipment': 'AGE',
  'Equipment': 'EQP',
  'Equipments': 'EQP',
  'Electrical items': 'ELC',
  'Electrical Items': 'ELC',
  'Civil & Infra Equipments': 'CIV',
  'Civil and Infra Equipments': 'CIV',
  'Storage Materials': 'STR',
  'IT Assets': 'ITA',
  'IT assets': 'ITA',
  'Office & Administration': 'OFF',
  'Office and Administration': 'OFF',
  'Office and administratin': 'OFF',
  'Pesticides': 'PST',
  'Others': 'OTH',
};

const normalizeCategoryKey = (s: string) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '').trim();

const CATEGORY_CODE_MAP: Record<string, string> = Object.keys(CATEGORY_CODE_MAP_RAW).reduce((acc, k) => {
  acc[normalizeCategoryKey(k)] = CATEGORY_CODE_MAP_RAW[k];
  return acc;
}, {} as Record<string, string>);

const getCategoryCode = (category: string) => {
  if (!category) return 'OTH';
  const key = normalizeCategoryKey(category);
  return CATEGORY_CODE_MAP[key] || 'OTH';
};

const PLACEHOLDER_IMG =
  'https://placehold.co/300x200/e2e8f0/64748b?text=No+Image';
const BASE_URL = getBaseUrl().replace(/\/$/, '');

const initialItems: StockItem[] = [
  {
    id: '1',
    name: 'Urea Fertilizer',
    category: 'Fertilizers',
    sku: 'FRT-001',
    unit: 'kg',
    currentStock: 1200,
    stockInPipeline: 0,
    minStock: 200,
    imageUrl: 'https://placehold.co/300x200/dcfce7/16a34a?text=Urea+Fertilizer',
    location: 'Warehouse A – Shelf 3',
    description: '46% Nitrogen fertilizer, granular form.',
    vendors: [],
    seriesNumber: 'SBR/INV/P2/',
    transactions: [
      { id: 't1', type: 'incoming', qty: 500, date: '2026-02-10', note: 'Supplier delivery', by: 'Ramesh K.' },
      { id: 't2', type: 'outgoing', qty: 100, date: '2026-02-14', note: 'Field B application', by: 'Suresh P.' },
      { id: 't3', type: 'issued', qty: 200, date: '2026-02-18', note: 'Issued to cultivation team', by: 'Mohan V.' },
    ],
  },
  {
    id: '2',
    name: 'Paddy Seeds (IR-36)',
    category: 'Seeds',
    sku: 'SED-012',
    unit: 'kg',
    currentStock: 85,
    stockInPipeline: 0,
    minStock: 100,
    imageUrl: 'https://placehold.co/300x200/fef9c3/ca8a04?text=Paddy+Seeds',
    location: 'Cold Storage – Bay 1',
    description: 'High-yield IR-36 paddy seed variety.',
    vendors: [],
    seriesNumber: 'SBR/INV/P2/',
    transactions: [
      { id: 't4', type: 'incoming', qty: 300, date: '2026-01-20', note: 'ICAR purchase', by: 'Admin' },
      { id: 't5', type: 'issued', qty: 215, date: '2026-02-01', note: 'Kharif season sowing', by: 'Anil D.' },
    ],
  },
  {
    id: '3',
    name: 'Chlorpyrifos 20% EC',
    category: 'Pesticides',
    sku: 'PST-007',
    unit: 'litre',
    currentStock: 340,
    stockInPipeline: 0,
    minStock: 50,
    imageUrl: 'https://placehold.co/300x200/fee2e2/dc2626?text=Chlorpyrifos',
    location: 'Chemical Store – Rack 2',
    description: 'Broad-spectrum organophosphate insecticide.',
    vendors: [],
    seriesNumber: 'SBR/INV/P2/',
    transactions: [
      { id: 't6', type: 'incoming', qty: 200, date: '2026-02-05', note: 'BAYER supply', by: 'Admin' },
      { id: 't7', type: 'outgoing', qty: 60, date: '2026-02-22', note: 'Pest control – Block C', by: 'Rajan T.' },
    ],
  },
  {
    id: '4',
    name: 'Power Sprayer (Knapsack)',
    category: 'Equipment',
    sku: 'EQP-043',
    unit: 'units',
    currentStock: 12,
    stockInPipeline: 0,
    minStock: 3,
    imageUrl: 'https://placehold.co/300x200/dbeafe/1d4ed8?text=Power+Sprayer',
    location: 'Equipment Room – Row A',
    description: '16L battery-operated agricultural sprayer.',
    vendors: [],
    seriesNumber: 'SBR/INV/P2/',
    transactions: [
      { id: 't8', type: 'incoming', qty: 5, date: '2026-01-15', note: 'New procurement', by: 'Procurement' },
      { id: 't9', type: 'issued', qty: 3, date: '2026-02-12', note: 'Issued to field team', by: 'Suresh P.' },
    ],
  },
  {
    id: '5',
    name: 'HDPE Bags (50kg)',
    category: 'Packaging',
    sku: 'PKG-021',
    unit: 'bags',
    currentStock: 2500,
    stockInPipeline: 0,
    minStock: 500,
    imageUrl: 'https://placehold.co/300x200/f3e8ff/7c3aed?text=HDPE+Bags',
    location: 'Warehouse B – Pallet 5',
    description: 'Woven polypropylene bags for grain storage.',
    vendors: [],
    seriesNumber: 'SBR/INV/P2/',
    transactions: [
      { id: 't10', type: 'incoming', qty: 1000, date: '2026-02-01', note: 'Bulk supply', by: 'Admin' },
    ],
  },
  {
    id: '6',
    name: 'Drip Tape Roll (16mm)',
    category: 'Tools',
    sku: 'TLS-031',
    unit: 'rolls',
    currentStock: 38,
    stockInPipeline: 0,
    minStock: 10,
    imageUrl: 'https://placehold.co/300x200/ecfdf5/059669?text=Drip+Tape',
    location: 'Irrigation Store – Shelf 1',
    description: '16mm inline drip tape, 200m per roll.',
    vendors: [],
    seriesNumber: 'SBR/INV/P2/',
    transactions: [
      { id: 't11', type: 'incoming', qty: 20, date: '2026-02-08', note: 'Order #4412', by: 'Procurement' },
      { id: 't12', type: 'issued', qty: 2, date: '2026-02-20', note: 'New drip layout – Field D', by: 'Mohan V.' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────────────────────
const genId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const today = () => new Date().toISOString().split('T')[0];
const generateTransferSlipNumber = () => {
  const year = new Date().getFullYear();
  const prefix = `SBR/INV/TRF/${year}/`;
  const highestSequence = readInventoryApprovals().reduce((highest, approval) => {
    const slipNumber = approval.transfer?.transferSlipNumber ?? '';
    if (!slipNumber.startsWith(prefix)) return highest;
    const sequence = Number(slipNumber.slice(prefix.length));
    return Number.isFinite(sequence) ? Math.max(highest, sequence) : highest;
  }, 0);
  return `${prefix}${String(highestSequence + 1).padStart(4, '0')}`;
};

// SAI Bioresources' fixed letterhead — same as the WCC certificate header.
const COMPANY_NAME = 'SAI BIORESOURCES PRIVATE LIMITED';
const COMPANY_ADDRESS = 'Khasra No. 121/1, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh – 491001';

const txBadge: Record<StockTransaction['type'], { label: string; color: string }> = {
  incoming: { label: 'Incoming', color: 'bg-green-100 text-green-700' },
  outgoing: { label: 'Outgoing', color: 'bg-red-100 text-red-700' },
  issued: { label: 'Issued', color: 'bg-blue-100 text-blue-700' },
  adjustment: { label: 'Adjustment', color: 'bg-yellow-100 text-yellow-700' },
};

type MasterConfigValue = {
  id: string;
  label: string;
  meta?: string;
};

const MasterConfigCard = ({
  title,
  description,
  placeholder,
  icon: Icon,
  values,
  parentOptions,
  parentLabel,
  onAdd,
  onRemove,
}: {
  title: string;
  description: string;
  placeholder: string;
  icon: React.ElementType;
  values: MasterConfigValue[];
  parentOptions?: string[];
  parentLabel?: string;
  onAdd: (value: string, parent?: string) => void;
  onRemove: (id: string) => void;
}) => {
  const [draft, setDraft] = useState('');
  const [parent, setParent] = useState(parentOptions?.[0] ?? '');

  useEffect(() => {
    if (parentOptions?.length && !parentOptions.includes(parent)) setParent(parentOptions[0]);
  }, [parent, parentOptions]);

  const createValue = () => {
    const value = draft.trim();
    if (!value) return toast.error(`${title.replace(/s$/, '')} name is required`);
    if (parentOptions?.length && !parent) return toast.error(`Select ${parentLabel?.toLowerCase() || 'a parent'}`);
    onAdd(value, parent || undefined);
    setDraft('');
  };

  return (
    <section className="flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
      <div className="flex items-start gap-3 border-b border-slate-100 bg-slate-50/70 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0D3A35]/10 text-[#0D3A35]">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-950">{title}</h2>
          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{description}</p>
        </div>
      </div>

      <div className="space-y-3 border-b border-slate-100 p-4">
        {parentOptions && (
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {parentLabel}
            </span>
            <select
              value={parent}
              onChange={(event) => setParent(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-[#0D3A35]"
            >
              {parentOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        )}
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                createValue();
              }
            }}
            placeholder={placeholder}
            className="h-10 rounded-lg border-slate-200 text-sm"
          />
          <button
            type="button"
            onClick={createValue}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-[#0D3A35] px-3 text-xs font-bold text-white transition hover:bg-[#092e2a]"
          >
            <Plus className="h-3.5 w-3.5" />
            Create
          </button>
        </div>
      </div>

      <div className="flex-1 p-4">
        {values.length === 0 ? (
          <div className="flex h-full min-h-24 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 text-center text-xs font-semibold text-slate-400">
            No entries created yet
          </div>
        ) : (
          <div className="flex max-h-56 flex-wrap content-start gap-2 overflow-y-auto pr-1">
            {values.map((value) => (
              <div
                key={value.id}
                className="flex items-center gap-2 rounded-lg border border-[#0D3A35]/10 bg-[#0D3A35]/5 py-1.5 pl-3 pr-1.5"
              >
                <span className="text-xs font-bold text-[#0D3A35]">
                  {value.label}
                  {value.meta && <span className="ml-1 font-semibold text-slate-400">· {value.meta}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(value.id)}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  aria-label={`Remove ${value.label}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

const CreateStoreDialog = ({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (name: string, blocks: StoreBlock[], location: StoreLocation) => void;
}) => {
  const [draftName, setDraftName] = useState('');
  const [draftLat, setDraftLat] = useState('');
  const [draftLng, setDraftLng] = useState('');
  const [selectedBlocks, setSelectedBlocks] = useState<StoreBlock[]>([]);
  const [apiBlocks, setApiBlocks] = useState<StoreBlock[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setBlocksLoading(true);
    fetch(`${BASE_URL}/farmer_managment/get_blocks`)
      .then((res) => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then((data) => {
        if (mounted && data && Array.isArray(data.blocks)) {
          setApiBlocks(data.blocks.map((block: any) => ({
            block_id: block.block_id,
            block_name: block.block_name,
          })));
        }
      })
      .catch(() => {
        if (mounted) toast.error('Failed to load blocks');
      })
      .finally(() => {
        if (mounted) setBlocksLoading(false);
      });
    return () => { mounted = false; };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setDraftName('');
      setDraftLat('');
      setDraftLng('');
      setSelectedBlocks([]);
    }
  }, [open]);

  const toggleBlock = (block: StoreBlock) => {
    setSelectedBlocks((previous) => (
      previous.some((entry) => entry.block_id === block.block_id)
        ? previous.filter((entry) => entry.block_id !== block.block_id)
        : [...previous, block]
    ));
  };

  const createStore = () => {
    const name = draftName.trim();
    const lat = Number(draftLat);
    const lng = Number(draftLng);
    if (!name) return toast.error('Store name is required');
    if (!selectedBlocks.length) return toast.error('Select at least one block catering to this store');
    if (!draftLat.trim() || Number.isNaN(lat) || lat < -90 || lat > 90) return toast.error('Enter a valid latitude (-90 to 90)');
    if (!draftLng.trim() || Number.isNaN(lng) || lng < -180 || lng > 180) return toast.error('Enter a valid longitude (-180 to 180)');
    onAdd(name, selectedBlocks, { lat, lng });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl p-0">
        <DialogHeader className="border-b border-slate-100 p-5">
          <DialogTitle className="text-base font-bold text-slate-950">Create Store</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 p-5">
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Store Name
            </span>
            <Input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="Enter store name"
              className="h-10 rounded-lg border-slate-200 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Blocks Catering
            </span>
            {blocksLoading ? (
              <div className="text-xs font-semibold text-slate-400">Loading blocks…</div>
            ) : apiBlocks.length === 0 ? (
              <div className="text-xs font-semibold text-slate-400">No blocks found</div>
            ) : (
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {apiBlocks.map((block) => {
                  const active = selectedBlocks.some((entry) => entry.block_id === block.block_id);
                  return (
                    <button
                      key={block.block_id}
                      type="button"
                      onClick={() => toggleBlock(block)}
                      className={cn(
                        'whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors',
                        active
                          ? 'border-[#0D3A35] bg-[#0D3A35] text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-[#0D3A35]/30 hover:bg-[#0D3A35]/5 hover:text-[#0D3A35]',
                      )}
                    >
                      {block.block_name}
                    </button>
                  );
                })}
              </div>
            )}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Latitude
              </span>
              <Input
                type="number"
                step="any"
                value={draftLat}
                onChange={(event) => setDraftLat(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    createStore();
                  }
                }}
                placeholder="e.g. 21.2514"
                className="h-10 rounded-lg border-slate-200 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Longitude
              </span>
              <Input
                type="number"
                step="any"
                value={draftLng}
                onChange={(event) => setDraftLng(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    createStore();
                  }
                }}
                placeholder="e.g. 81.6296"
                className="h-10 rounded-lg border-slate-200 text-sm"
              />
            </label>
          </div>
        </div>
        <DialogFooter className="border-t border-slate-100 p-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={createStore}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-[#0D3A35] px-4 text-xs font-bold text-white transition hover:bg-[#092e2a]"
          >
            <Plus className="h-3.5 w-3.5" />
            Create
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const StoreConfigCard = ({
  values,
  onAdd,
  onRemove,
}: {
  values: StoreEntry[];
  onAdd: (name: string, blocks: StoreBlock[], location: string) => void;
  onRemove: (name: string) => void;
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <section className="flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/70 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0D3A35]/10 text-[#0D3A35]">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-950">Stores</h2>
            <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
              Create central warehouses, sub-stores, and storage locations.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#0D3A35] px-3 text-xs font-bold text-white transition hover:bg-[#092e2a]"
        >
          <Plus className="h-3.5 w-3.5" />
          Create Store
        </button>
      </div>

      <div className="flex-1 p-4">
        {values.length === 0 ? (
          <div className="flex h-full min-h-24 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 text-center text-xs font-semibold text-slate-400">
            No entries created yet
          </div>
        ) : (
          <div className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
            {values.map((store) => (
              <div
                key={store.name}
                className="flex items-start justify-between gap-2 rounded-lg border border-[#0D3A35]/10 bg-[#0D3A35]/5 p-2.5"
              >
                <div className="min-w-0">
                  <span className="text-xs font-bold text-[#0D3A35]">{store.name}</span>
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                    <MapIcon className="h-3 w-3 shrink-0" />
                    {store.location ? `${store.location.lat}, ${store.location.lng}` : 'No location set'}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                    {store.blocks.length
                      ? store.blocks.map((block) => block.block_name).join(', ')
                      : 'No blocks assigned'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(store.name)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  aria-label={`Remove ${store.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateStoreDialog open={dialogOpen} onOpenChange={setDialogOpen} onAdd={onAdd} />
    </section>
  );
};

const formatTransferDate = (value?: string, includeTime = false) => {
  if (!value) return '—';
  return includeTime ? formatDateTimeDDMMYYYY(value, value) : formatDateDDMMYYYY(value, value);
};

const TransferSlipDialog = ({
  record,
  onClose,
  onReply,
}: {
  record: InventoryTransferApproval | null;
  onClose: () => void;
  onReply: (questionId: string, reply: string) => void;
}) => {
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!record) setReplyDrafts({});
  }, [record]);

  if (!record) return null;
  const transfer = record.transfer;
  const statusClass = record.status === 'pending'
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : record.status === 'approved'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-red-200 bg-red-50 text-red-700';

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="h-[92vh] w-[96vw] max-w-[1480px] overflow-hidden rounded-2xl border-0 p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Stock Transfer Slip Details</DialogTitle>
        </DialogHeader>

        <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[1.06fr_0.94fr]">
          <section className="min-h-0 overflow-y-auto bg-slate-200/70 p-5 sm:p-7">
            <TransferSlipDocument data={transferSlipDataFromApproval(record)} />
          </section>

          <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-white">
            <div className="sticky top-0 z-10 border-b border-slate-100 bg-[#0D3A35] px-6 py-5 text-white">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black">Transfer Details</h2>
                <span className={cn('rounded-full border px-2.5 py-1 text-[10px] font-bold capitalize', statusClass)}>
                  {record.status}
                </span>
              </div>
              <p className="mt-1 text-xs font-semibold text-white/65">{transfer.transferSlipNumber}</p>
            </div>

            <div className="space-y-5 p-5 sm:p-6">
              <section className="overflow-hidden rounded-xl border border-slate-200">
                <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3 text-xs font-black text-slate-800">
                  Request &amp; Approval Status
                </div>
                <div className="grid grid-cols-2 gap-px bg-slate-100">
                  {[
                    ['Requested', formatTransferDate(record.requestedAt, true)],
                    ['Current Status', record.status.toUpperCase()],
                    ['Prepared By', record.preparedBy],
                    ['Approver', record.approverName],
                    ['Designation', record.approverDesignation],
                    ['Approved On', formatTransferDate(record.approvedAt, true)],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0 bg-white px-3 py-3">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                      <p className="mt-1 break-words text-xs font-bold text-slate-700">{value}</p>
                    </div>
                  ))}
                </div>
              </section>

              {record.rejectionReason && (
                <section className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-red-400">Rejection Reason</p>
                  <p className="mt-2 text-xs font-bold leading-relaxed text-red-700">{record.rejectionReason}</p>
                </section>
              )}

              {record.digitalSignature && (
                <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                    <div>
                      <p className="text-xs font-black text-emerald-900">Digitally Signed Approval</p>
                      <p className="mt-1 text-xs font-bold text-emerald-800">
                        {record.digitalSignature.signerName} · {record.digitalSignature.signerDesignation}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold text-emerald-700">
                        {formatTransferDate(record.digitalSignature.signedAt, true)}
                      </p>
                      <p className="mt-2 rounded-lg border border-emerald-200 bg-white/70 px-2.5 py-2 font-mono text-[9px] text-emerald-800">
                        {record.digitalSignature.signature}
                      </p>
                    </div>
                  </div>
                </section>
              )}

              <section className="overflow-hidden rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                  <MessageCircle className="h-4 w-4 text-[#0D3A35]" />
                  <div>
                    <p className="text-xs font-black text-slate-800">Questions &amp; Replies</p>
                    <p className="text-[10px] font-semibold text-slate-400">Reply to clarification requests from the approver</p>
                  </div>
                </div>

                {(record.questions?.length ?? 0) === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <MessageCircle className="mx-auto h-7 w-7 text-slate-300" />
                    <p className="mt-2 text-xs font-bold text-slate-400">No questions raised</p>
                  </div>
                ) : (
                  <div className="space-y-3 bg-slate-50/40 p-3">
                    {record.questions!.map((entry) => (
                      <div key={entry.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <div className="p-3">
                          <p className="text-[9px] font-black uppercase tracking-wide text-amber-700">Question from {entry.askedBy}</p>
                          <p className="mt-1.5 text-xs font-semibold leading-relaxed text-slate-700">{entry.question}</p>
                          <p className="mt-2 text-[9px] font-bold text-slate-400">{formatTransferDate(entry.askedAt, true)}</p>
                        </div>
                        {entry.reply ? (
                          <div className="border-t border-emerald-100 bg-emerald-50/70 p-3">
                            <p className="text-[9px] font-black uppercase tracking-wide text-emerald-700">
                              Reply from {entry.repliedBy || record.preparedBy}
                            </p>
                            <p className="mt-1.5 text-xs font-semibold leading-relaxed text-slate-700">{entry.reply}</p>
                            <p className="mt-2 text-[9px] font-bold text-slate-400">{formatTransferDate(entry.repliedAt, true)}</p>
                          </div>
                        ) : (
                          <div className="border-t border-slate-100 p-3">
                            <textarea
                              value={replyDrafts[entry.id] ?? ''}
                              onChange={(event) => setReplyDrafts((current) => ({ ...current, [entry.id]: event.target.value }))}
                              rows={2}
                              placeholder="Write your reply…"
                              className="w-full resize-none rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-[#0D3A35]"
                            />
                            <Button
                              type="button"
                              onClick={() => {
                                const reply = (replyDrafts[entry.id] ?? '').trim();
                                if (!reply) return toast.error('Enter a reply');
                                onReply(entry.id, reply);
                                setReplyDrafts((current) => ({ ...current, [entry.id]: '' }));
                              }}
                              className="mt-2 h-9 w-full gap-2 bg-[#0D3A35] text-xs font-bold text-white hover:bg-[#092e2a]"
                            >
                              <Send className="h-3.5 w-3.5" />Send Reply
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Issue Slip Directory — every stock transfer slip ever created (GET
// /inventory/get_stock_transfers), grouped by creation date. Picking one shows
// the read-only slip via the same TransferSlipDocument used everywhere else.
const IssueSlipDirectoryDialog = ({
  open,
  onOpenChange,
  loading,
  groupedByDate,
  selectedSlip,
  onSelectSlip,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  groupedByDate: (readonly [string, StockTransfer[]])[];
  selectedSlip: StockTransfer | null;
  onSelectSlip: (transferId: string | null) => void;
}) => (
  <Dialog open={open} onOpenChange={(nextOpen) => { onOpenChange(nextOpen); if (!nextOpen) onSelectSlip(null); }}>
    <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-slate-100 p-0">
      <DialogHeader className="border-b border-slate-200 bg-white px-6 py-4">
        <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-950">
          {selectedSlip && (
            <button
              type="button"
              onClick={() => onSelectSlip(null)}
              className="mr-1 rounded-full p-1 text-slate-500 hover:bg-slate-100"
            >
              <ArrowDown className="h-4 w-4 rotate-90" />
            </button>
          )}
          <FileText className="h-4 w-4 text-[#0D3A35]" />
          {selectedSlip ? selectedSlip.transfer_slip_number : 'Issue Slip Directory'}
        </DialogTitle>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {selectedSlip ? (
          <div className="p-5">
            <TransferSlipDocument data={transferSlipDataFromStockTransfer(selectedSlip)} />
          </div>
        ) : loading ? (
          <div className="flex h-40 items-center justify-center text-sm font-semibold text-slate-400">
            Loading issue slips…
          </div>
        ) : groupedByDate.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm font-semibold text-slate-400">
            No issue slips created yet
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {groupedByDate.map(([date, slips]) => (
              <div key={date} className="px-5 py-4">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  {formatSlipDate(date)}
                </p>
                <div className="space-y-2">
                  {slips.map((slip) => (
                    <button
                      key={slip.transfer_id}
                      type="button"
                      onClick={() => onSelectSlip(slip.transfer_id)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-[0_6px_18px_rgba(15,23,42,0.04)] transition hover:border-[#0D3A35]/30"
                    >
                      <div>
                        <p className="text-sm font-bold text-slate-950">{slip.transfer_slip_number}</p>
                        <p className="mt-0.5 text-xs font-medium text-slate-500">
                          {slip.items.length === 1
                            ? `${slip.items[0].item_name} · ${slip.items[0].quantity.toLocaleString('en-IN')} ${slip.items[0].unit}`
                            : `${slip.items.length} items`} · {slip.source_store} → {slip.destination_store}
                        </p>
                      </div>
                      <span className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold', ISSUE_SLIP_STATUS_CLASS[slip.logistics_status])}>
                        {ISSUE_SLIP_STATUS_LABEL[slip.logistics_status]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DialogContent>
  </Dialog>
);

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
const Inventory = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<StockItem[]>(initialItems);
  const [masterConfig, setMasterConfig] = useState<InventoryMasterConfig>(DEFAULT_INVENTORY_MASTER_CONFIG);
  const [masterConfigLoaded, setMasterConfigLoaded] = useState(false);
  const [activeInventoryTab, setActiveInventoryTab] = useState<'dashboard' | 'central-store' | 'sub-store' | 'inventory-request' | 'configure'>('dashboard');
  const [centralStoreView, setCentralStoreView] = useState<'stock' | 'transfers' | 'issued'>('stock');
  const [transferApprovals, setTransferApprovals] = useState<InventoryTransferApproval[]>(readInventoryApprovals);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeSubStore, setActiveSubStore] = useState('All Locations');
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);

  // inventory request (farm map + from/to warehouse stock transfer)
  const [requestFarms, setRequestFarms] = useState<RequestMapFarm[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(false);
  const [farmsLoaded, setFarmsLoaded] = useState(false);
  const [selectedRequestStoreName, setSelectedRequestStoreName] = useState('');
  const [blockRequests, setBlockRequests] = useState<BlockPendingRequest[]>([]);
  const [blockRequestsLoading, setBlockRequestsLoading] = useState(false);
  const [blockRequestsLoaded, setBlockRequestsLoaded] = useState(false);
  const [issueSlips, setIssueSlips] = useState<StockTransfer[]>([]);
  const [issueSlipsLoading, setIssueSlipsLoading] = useState(false);
  const [issueSlipsLoaded, setIssueSlipsLoaded] = useState(false);
  const [issueSlipDirectoryOpen, setIssueSlipDirectoryOpen] = useState(false);
  const [selectedIssueSlipId, setSelectedIssueSlipId] = useState<string | null>(null);
  const [fromStore, setFromStore] = useState('');
  const [toStore, setToStore] = useState('');
  const [transferLineItems, setTransferLineItems] = useState<{ itemId: string; quantity: string }[]>([{ itemId: '', quantity: '' }]);
  const [transferDissociationByItem, setTransferDissociationByItem] = useState<Record<string, ItemDissociation>>({});
  const [transferDissociationLoading, setTransferDissociationLoading] = useState(false);
  const [transferPrefill, setTransferPrefill] = useState<{ items: { itemId: string; quantity: string }[]; source: string; destination: string } | null>(null);

  const updateTransferLineItem = (index: number, patch: Partial<{ itemId: string; quantity: string }>) => {
    setTransferLineItems((previous) => previous.map((line, i) => (i === index ? { ...line, ...patch } : line)));
    // Changing the first (primary) item invalidates whichever From/To warehouses were
    // already picked for the previous item's stock — later rows just add to the same slip.
    if (index === 0 && patch.itemId !== undefined) {
      setFromStore('');
      setToStore('');
    }
  };
  const addTransferLineItem = () => {
    const usedIds = new Set(transferLineItems.map((line) => line.itemId));
    const nextItem = items.find((item) => !usedIds.has(item.id));
    if (!nextItem) return toast.error('Every available item is already added');
    setTransferLineItems((previous) => [...previous, { itemId: nextItem.id, quantity: '' }]);
  };
  const removeTransferLineItem = (index: number) => {
    setTransferLineItems((previous) => previous.filter((_, i) => i !== index));
  };

  // modals
  const [addOpen, setAddOpen] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [alertPanelOpen, setAlertPanelOpen] = useState(false);
  const [dashboardPieView, setDashboardPieView] = useState<'category' | 'item' | 'percentage'>('category');
  const [inventoryReportPeriodOpen, setInventoryReportPeriodOpen] = useState(false);
  const [inventoryReportFrom, setInventoryReportFrom] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [inventoryReportTo, setInventoryReportTo] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const prevStockRef = useRef<Record<string, number>>({});
  const [editItem, setEditItem] = useState<StockItem | null>(null);
  const [informationItem, setInformationItem] = useState<StockItem | null>(null);
  const [updateStockItem, setUpdateStockItem] = useState<StockItem | null>(null);
  const [ledgerItem, setLedgerItem] = useState<StockItem | null>(null);
  const [requestStockOpen, setRequestStockOpen] = useState(false);
  const [transferStockOpen, setTransferStockOpen] = useState(false);
  const [requestStockItems, setRequestStockItems] = useState<StockItem[]>([]);
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [allocationItem, setAllocationItem] = useState<StockItem | null>(null);
  const [issueStockItem, setIssueStockItem] = useState<StockItem | null>(null);
  const [issuedItemsOpen, setIssuedItemsOpen] = useState(false);
  const [incomingItem, setIncomingItem] = useState<StockItem | null>(null);
  const [outgoingItem, setOutgoingItem] = useState<StockItem | null>(null);
  const [returnEntryItem, setReturnEntryItem] = useState<StockItem | null>(null);
  const [damageItem, setDamageItem] = useState<StockItem | null>(null);
  const [issuedItem, setIssuedItem] = useState<StockItem | null>(null);
  const [historyItem, setHistoryItem] = useState<StockItem | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [deleteItem, setDeleteItem] = useState<StockItem | null>(null);
  const [openLedgersCount, setOpenLedgersCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchAllItems = async () => {
      try {
        const res = await fetch(`${BASE_URL}/inventory/get_all_item`);
        const data: any = await res.json().catch(() => null);
        if (!res.ok || !data?.success || !Array.isArray(data?.items)) {
          throw new Error(data?.message || 'Failed to fetch inventory items');
        }

        const savedMetadata = readInventoryItemMetadata();
        const mapped: StockItem[] = data.items.map((it: any, idx: number) => {
          const itemId = String(it?.Invent_id || it?.new_item_code || `inv_${idx}`);
          const itemCode = String(it?.new_item_code || '');
          const metadata = savedMetadata[itemId] || savedMetadata[itemCode] || {};
          const legacyMetadata = LEGACY_INVENTORY_ITEM_METADATA[itemCode] || {};
          const stockHistory: StockTransaction[] = Array.isArray(it?.stock_history)
            ? it.stock_history.map((entry: any) => {
                const ts = String(entry?.timestamp ?? '');
                const date = ts.includes('T') ? ts.split('T')[0] : ts || today();
                const po = String(entry?.po_number ?? '');
                const cost = entry?.per_unit_cost != null
                  ? `₹${Number(entry.per_unit_cost).toLocaleString('en-IN')}/unit`
                  : null;
                const note = [po ? `PO: ${po}` : '', cost].filter(Boolean).join(' · ');
                return {
                  id: `sh-${po}-${ts}`,
                  type: 'incoming' as const,
                  qty: Number(entry?.stock) || 0,
                  date,
                  note,
                  by: '',
                  costPerUnit: entry?.per_unit_cost != null ? Number(entry.per_unit_cost) : undefined,
                };
              })
            : [];

          const rawDissociation = it?.dissociation && typeof it.dissociation === 'object' ? it.dissociation : {};
          const dissociation: ItemDissociation = {};
          Object.entries(rawDissociation).forEach(([storeName, entry]: [string, any]) => {
            const methodKey = Object.keys(entry || {}).find((key) => key !== 'quantity');
            dissociation[storeName] = {
              quantity: Number(entry?.quantity) || 0,
              batches: methodKey && Array.isArray(entry[methodKey]) ? entry[methodKey] : [],
            };
          });

          return {
            id: itemId,
            name: String(it?.item_name || ''),
            category: String(it?.category || 'Others'),
            sku: String(it?.new_item_code || ''),
            unit: String(it?.unit || ''),
            currentStock: (() => {
              const apiStock = Number(it?.stock) || 0;
              const fifoStock = Array.isArray(it?.fifo_list)
                ? it.fifo_list.reduce((sum: number, entry: any) => sum + (Number(entry?.stock) || 0), 0)
                : 0;
              return apiStock === 0 && fifoStock > 0 ? fifoStock : apiStock;
            })(),
            stockInPipeline: Number(it?.stock_in_pipeline || it?.pipeline_stock || 0),
            minStock: Number(it?.threshold) || 0,
            inventoryGroup: String(metadata.inventoryGroup || it?.inventory_group || it?.inventoryGroup || ''),
            subCategory: String(metadata.subCategory || it?.sub_category || it?.subcategory || it?.subCategory || ''),
            expenseClassification: String(metadata.expenseClassification || it?.expense_classification || it?.expenseClassification || ''),
            inventoryClassification: String(metadata.inventoryClassification || it?.inventory_classification || it?.inventoryClassification || ''),
            issueClassification: String(
              metadata.issueClassification
              || it?.issue_classification
              || it?.issueClassification
              || legacyMetadata.issueClassification
              || '',
            ),
            stockIssueMethod: String(metadata.stockIssueMethod || it?.stock_issue_method || it?.stockIssueMethod || ''),
            packingSize: String(metadata.packingSize || it?.packing_size || it?.pack_size || it?.packingSize || ''),
            shelf: String(metadata.shelf || it?.shelf || it?.shelf_number || it?.rack || ''),
            batchTracking: typeof it?.batch_tracking === 'boolean' ? it.batch_tracking : undefined,
            expiryTracking: typeof it?.expiry_tracking === 'boolean' ? it.expiry_tracking : undefined,
            batchNumber: String(it?.batch_number || it?.batch_no || ''),
            manufacturingDate: String(it?.manufacturing_date || it?.mfg_date || ''),
            expiryDate: String(it?.expiry_date || it?.expiration_date || ''),
            supplier: String(it?.supplier || it?.supplier_name || ''),
            storageLocation: String(it?.storage_location || it?.bin_location || it?.shelf || ''),
            imageUrl: String(it?.item_image_url || ''),
            location: String(it?.location || ''),
            description: String(it?.description || ''),
            vendors: [],
            seriesNumber: '',
            transactions: stockHistory,
            dissociation,
            fifoList: Array.isArray(it?.fifo_list)
              ? it.fifo_list.map((e: any) => ({
                  stock: Number(e?.stock) || 0,
                  per_unit_cost: Number(e?.per_unit_cost) || 0,
                  po_number: String(e?.po_number || ''),
                  batch_number: String(e?.batch_number || e?.batch_no || ''),
                  manufacturing_date: String(e?.manufacturing_date || e?.mfg_date || ''),
                  expiry_date: String(e?.expiry_date || e?.expiration_date || ''),
                  supplier: String(e?.supplier || e?.supplier_name || ''),
                  storage_location: String(e?.storage_location || e?.bin_location || ''),
                }))
              : [],
          };
        });

        setItems(mapped);
      } catch (e: any) {
        toast.error(e?.message || 'Failed to load inventory items');
      }
    };

    fetchAllItems();
  }, []);

  useEffect(() => {
    const fetchOpenLedgers = async () => {
      try {
        const res = await fetch(`${BASE_URL}/inventory/get_issue_requests`);
        const data: any = await res.json().catch(() => null);
        if (res.ok && data?.success && Array.isArray(data?.issue_requests)) {
          const count = data.issue_requests.filter(
            (r: any) => r.status === 'pending' || r.status === 'issued',
          ).length;
          setOpenLedgersCount(count);
        }
      } catch {
        // silently fail — KPI shows '—'
      }
    };
    fetchOpenLedgers();
  }, []);

  // Load the master config from the backend once on mount — replaces the old localStorage read.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/inventory/get_inventory_config`);
        const data = await res.json().catch(() => null);
        if (mounted && data && typeof data === 'object') {
          setMasterConfig({
            inventoryGroups: Array.isArray(data.inventoryGroups) ? data.inventoryGroups : DEFAULT_INVENTORY_MASTER_CONFIG.inventoryGroups,
            categories: Array.isArray(data.categories) ? data.categories : DEFAULT_INVENTORY_MASTER_CONFIG.categories,
            categoryGroups: data.categoryGroups && typeof data.categoryGroups === 'object' ? data.categoryGroups : DEFAULT_INVENTORY_MASTER_CONFIG.categoryGroups,
            subCategories: Array.isArray(data.subCategories) ? data.subCategories : [],
            units: Array.isArray(data.units) ? data.units : DEFAULT_INVENTORY_MASTER_CONFIG.units,
            stores: Array.isArray(data.stores) && data.stores.every((entry: unknown) => typeof entry === 'object' && entry !== null)
              ? data.stores
              : DEFAULT_INVENTORY_MASTER_CONFIG.stores,
            expenseClassifications: Array.isArray(data.expenseClassifications) ? data.expenseClassifications : DEFAULT_INVENTORY_MASTER_CONFIG.expenseClassifications,
            inventoryClassifications: Array.isArray(data.inventoryClassifications) ? data.inventoryClassifications : DEFAULT_INVENTORY_MASTER_CONFIG.inventoryClassifications,
            issueClassifications: Array.isArray(data.issueClassifications) ? data.issueClassifications : DEFAULT_INVENTORY_MASTER_CONFIG.issueClassifications,
          });
        }
      } catch {
        toast.error('Failed to load inventory configuration');
      } finally {
        if (mounted) setMasterConfigLoaded(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Save on every change — but only after the initial load above has completed, so we don't
  // immediately overwrite the server's config with local defaults before the GET resolves.
  useEffect(() => {
    if (!masterConfigLoaded) return;
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/inventory/save_inventory_config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(masterConfig),
        });
        if (!res.ok) throw new Error('Failed to save');
      } catch {
        toast.error('Failed to save inventory configuration');
      }
    })();
  }, [masterConfig, masterConfigLoaded]);

  useEffect(() => {
    items.forEach(saveInventoryItemMetadata);
  }, [items]);

  useEffect(() => {
    const refreshTransfers = () => setTransferApprovals(readInventoryApprovals());
    return subscribeToInventoryApprovals(refreshTransfers);
  }, []);

  const approvedTransfers = useMemo(
    () => transferApprovals.filter((approval) => approval.status === 'approved'),
    [transferApprovals],
  );

  const centralStoreItems = useMemo(() => items.map((item) => {
    const matchingLines = approvedTransfers.flatMap((approval) => approval.transfer.items
      .filter((line) => line.itemId === item.id || (line.itemCode && line.itemCode === item.sku))
      .map((line) => ({ approval, line })));
    const transferredQuantity = matchingLines.reduce((total, { line }) => total + line.quantity, 0);
    if (transferredQuantity === 0) return item;
    return {
      ...item,
      currentStock: Math.max(0, item.currentStock - transferredQuantity),
      transactions: [
        ...matchingLines.map(({ approval, line }): StockTransaction => ({
          id: `transfer-out-${approval.id}-${line.itemId}`,
          type: 'outgoing',
          qty: line.quantity,
          date: approval.approvedAt?.slice(0, 10) || approval.transfer.transferDate,
          note: `${approval.transfer.transferSlipNumber} · Transfer to ${approval.transfer.destinationStore}`,
          by: approval.digitalSignature?.signerName || approval.approverName,
        })),
        ...item.transactions,
      ],
    };
  }), [approvedTransfers, items]);

  // Store-wise breakdown straight from each item's real `dissociation` map — the
  // only place that's actually updated once a Logistics-approved transfer physically
  // moves stock (see LogisticsRequest.tsx's approveLogistics). One row per store the
  // item currently has stock in, other than its own home/central location.
  const subStoreItems = useMemo(() => {
    const rows: StockItem[] = [];
    items.forEach((item) => {
      Object.entries(item.dissociation || {}).forEach(([storeName, entry]) => {
        if (!storeName || storeName === item.location || entry.quantity <= 0) return;
        rows.push({
          ...item,
          id: `sub-store-${storeName}::${item.id}`,
          currentStock: entry.quantity,
          location: storeName,
          fifoList: entry.batches,
          transactions: [],
        });
      });
    });
    return rows.sort((a, b) => (
      a.location.localeCompare(b.location) || a.name.localeCompare(b.name)
    ));
  }, [items]);

  // ── Low stock derived list ───────────────────────────────
  const lowStockItems = useMemo(
    () => centralStoreItems.filter((i) => i.currentStock < i.minStock && !dismissedAlerts.has(i.id)),
    [centralStoreItems, dismissedAlerts],
  );

  const inventoryValue = useMemo(
    () =>
      centralStoreItems.reduce((sum, item) => {
        const val = (item.fifoList ?? []).reduce((s, e) => s + e.stock * e.per_unit_cost, 0);
        return sum + val;
      }, 0),
    [centralStoreItems],
  );

  const inventoryDashboard = useMemo(() => {
    const valueOf = (item: StockItem) => (item.fifoList ?? []).reduce(
      (total, batch) => total + (Number(batch.stock) || 0) * (Number(batch.per_unit_cost) || 0),
      0,
    );
    const categoryMap = new Map<string, { category: string; value: number; stock: number; items: number; low: number; units: Set<string> }>();
    centralStoreItems.forEach((item) => {
      const category = item.category || 'Others';
      const current = categoryMap.get(category) ?? { category, value: 0, stock: 0, items: 0, low: 0, units: new Set<string>() };
      current.value += valueOf(item);
      current.stock += Math.max(0, Number(item.currentStock) || 0);
      current.items += 1;
      if (item.unit) current.units.add(item.unit);
      if (item.currentStock < item.minStock) current.low += 1;
      categoryMap.set(category, current);
    });
    const categories = Array.from(categoryMap.values()).sort((a, b) => b.value - a.value || b.stock - a.stock);
    const buildPieData = (mode: 'value' | 'stock') => {
      const source = [...categories].sort((a, b) => mode === 'value' ? b.value - a.value : b.stock - a.stock);
      const leading = source.slice(0, 7).map((entry) => ({
        name: entry.category,
        value: mode === 'value' ? entry.value : entry.stock,
        unit: entry.units.size === 1 ? Array.from(entry.units)[0] : 'Mixed UoM',
      }));
      const remainder = source.slice(7).reduce((sum, entry) => sum + (mode === 'value' ? entry.value : entry.stock), 0);
      if (remainder > 0) leading.push({ name: 'Other Categories', value: remainder, unit: 'Mixed UoM' });
      return leading.filter((entry) => entry.value > 0);
    };
    const buildItemPieData = (mode: 'value' | 'stock') => {
      const source = centralStoreItems
        .map((item) => ({
          name: item.name,
          value: mode === 'value' ? valueOf(item) : Math.max(0, Number(item.currentStock) || 0),
          unit: item.unit || 'Unit not recorded',
        }))
        .filter((entry) => entry.value > 0)
        .sort((a, b) => b.value - a.value);
      const leading = source.slice(0, 7);
      const remainder = source.slice(7).reduce((sum, entry) => sum + entry.value, 0);
      if (remainder > 0) leading.push({ name: 'Other Items', value: remainder, unit: 'Mixed UoM' });
      return leading;
    };

    const monthRows = Array.from({ length: 6 }, (_, offset) => {
      const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - (5 - offset));
      return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, month: date.toLocaleDateString('en-IN', { month: 'short' }), received: 0, issued: 0 };
    });
    const monthMap = new Map(monthRows.map((row) => [row.key, row]));
    centralStoreItems.forEach((item) => item.transactions.forEach((transaction) => {
      const row = monthMap.get(String(transaction.date || '').slice(0, 7));
      if (!row) return;
      if (transaction.type === 'incoming' || (transaction.type === 'adjustment' && transaction.qty > 0)) row.received += Math.abs(transaction.qty);
      if (transaction.type === 'outgoing' || transaction.type === 'issued' || (transaction.type === 'adjustment' && transaction.qty < 0)) row.issued += Math.abs(transaction.qty);
    }));

    const replenishment = centralStoreItems
      .filter((item) => item.currentStock < item.minStock)
      .map((item) => ({ ...item, shortfall: Math.max(0, item.minStock - item.currentStock) }))
      .sort((a, b) => b.shortfall - a.shortfall)
      .slice(0, 6);
    const todayMs = new Date().setHours(0, 0, 0, 0);
    const expiryItems = centralStoreItems.map((item) => {
      const batchExpiries = (item.fifoList ?? []).map((batch) => batch.expiry_date).filter(Boolean);
      const expiry = [item.expiryDate, ...batchExpiries].filter(Boolean).sort()[0] || '';
      const days = expiry ? Math.ceil((new Date(expiry).setHours(0, 0, 0, 0) - todayMs) / 86400000) : null;
      return { ...item, dashboardExpiry: expiry, daysToExpiry: days };
    }).filter((item) => item.daysToExpiry !== null && item.daysToExpiry <= 90).sort((a, b) => Number(a.daysToExpiry) - Number(b.daysToExpiry)).slice(0, 6);
    const pipeline = centralStoreItems.reduce((sum, item) => sum + (Number(item.stockInPipeline) || 0), 0);
    const valuePieData = buildPieData('value'); const stockPieData = buildPieData('stock');
    const itemValuePieData = buildItemPieData('value'); const itemStockPieData = buildItemPieData('stock');
    return {
      categories,
      valuePieData,
      stockPieData,
      itemValuePieData,
      itemStockPieData,
      valuePieTotal: valuePieData.reduce((sum, entry) => sum + entry.value, 0),
      stockPieTotal: stockPieData.reduce((sum, entry) => sum + entry.value, 0),
      itemValuePieTotal: itemValuePieData.reduce((sum, entry) => sum + entry.value, 0),
      itemStockPieTotal: itemStockPieData.reduce((sum, entry) => sum + entry.value, 0),
      movement: monthRows,
      replenishment,
      expiryItems,
      pipeline,
    };
  }, [centralStoreItems]);

  const availableCategories = useMemo(
    () => ['All', ...Array.from(new Set(masterConfig.categories))],
    [masterConfig.categories],
  );

  // ── Toast when an item crosses the low-stock threshold ──
  useEffect(() => {
    const prev = prevStockRef.current;
    centralStoreItems.forEach((item) => {
      const wasOk = prev[item.id] === undefined || prev[item.id] >= item.minStock;
      const isLow = item.currentStock < item.minStock;
      if (wasOk && isLow && !dismissedAlerts.has(item.id)) {
        toast.warning(`Low stock: ${item.name} is below minimum (${item.currentStock} / ${item.minStock} ${item.unit})`, {
          duration: 6000,
        });
      }
      prev[item.id] = item.currentStock;
    });
    prevStockRef.current = prev;
  }, [centralStoreItems]);

  // ── Filtered items ──────────────────────────────────────
  const inventoryItemsForActiveStore = activeInventoryTab === 'sub-store'
    ? subStoreItems
    : centralStoreItems;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return inventoryItemsForActiveStore.filter((item) => {
      const matchCat = activeCategory === 'All' || item.category === activeCategory;
      const matchSearch =
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.inventoryGroup || '').toLowerCase().includes(q) ||
        (item.subCategory || '').toLowerCase().includes(q) ||
        (item.expenseClassification || '').toLowerCase().includes(q) ||
        (item.inventoryClassification || '').toLowerCase().includes(q) ||
        (item.issueClassification || '').toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [inventoryItemsForActiveStore, search, activeCategory]);

  const subStoreLocations = useMemo(
    () => Array.from(new Set([
      ...masterConfig.stores.map((store) => store.name),
      ...subStoreItems.map((item) => item.location.trim()).filter(Boolean),
    ])).sort((a, b) => a.localeCompare(b)),
    [masterConfig.stores, subStoreItems],
  );

  const availableUnits = useMemo(
    () => Array.from(new Set(masterConfig.units)),
    [masterConfig.units],
  );

  const availableStores = useMemo(
    () => Array.from(new Set([
      ...masterConfig.stores.map((store) => store.name),
      ...items.map((item) => item.location.trim()).filter(Boolean),
      ...subStoreLocations,
    ])),
    [items, masterConfig.stores, subStoreLocations],
  );

  const displayedItems = useMemo(
    () => activeInventoryTab === 'sub-store' && activeSubStore !== 'All Locations'
      ? filtered.filter((item) => item.location === activeSubStore)
      : filtered,
    [activeInventoryTab, activeSubStore, filtered],
  );

  const visibleTransferApprovals = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transferApprovals.filter((approval) => {
      if (!query) return true;
      return [
        approval.transfer.transferSlipNumber,
        ...approval.transfer.items.map((line) => line.itemName),
        ...approval.transfer.items.map((line) => line.itemCode),
        approval.transfer.destinationStore,
        approval.approverName,
        approval.status,
      ].join(' ').toLowerCase().includes(query);
    });
  }, [search, transferApprovals]);

  const pendingTransferCount = useMemo(
    () => transferApprovals.filter((approval) => approval.status === 'pending').length,
    [transferApprovals],
  );

  // ── Inventory Request (farm map + from/to warehouse transfer) ──
  useEffect(() => {
    if (activeInventoryTab !== 'inventory-request' || farmsLoaded) return;
    setFarmsLoading(true);
    fetch(`${BASE_URL}/farmer_managment/get_farms`)
      .then((res) => res.json())
      .then((data: any) => {
        if (!Array.isArray(data?.farms)) throw new Error('Unexpected response');
        setRequestFarms(data.farms.map((farm: any) => ({
          farm_id: String(farm?.farm_id ?? ''),
          crop_type: String(farm?.crop_type ?? ''),
          village: String(farm?.land_data?.village ?? ''),
          district: String(farm?.land_data?.district ?? ''),
          block_id: String(farm?.block_id ?? ''),
          land_coordinates: Array.isArray(farm?.land_data?.land_coordinates) ? farm.land_data.land_coordinates : [],
        })));
      })
      .catch(() => toast.error('Failed to load farms for map view'))
      .finally(() => {
        setFarmsLoading(false);
        setFarmsLoaded(true);
      });
  }, [activeInventoryTab, farmsLoaded]);

  useEffect(() => {
    if (activeInventoryTab !== 'inventory-request' || blockRequestsLoaded) return;
    setBlockRequestsLoading(true);
    fetch(`${BASE_URL}/inventory/get_a_block_inventory_requests`)
      .then((res) => res.json())
      .then((data: any) => {
        if (!Array.isArray(data?.pending_requests)) throw new Error('Unexpected response');
        setBlockRequests(data.pending_requests);
      })
      .catch(() => toast.error('Failed to load block inventory requests'))
      .finally(() => {
        setBlockRequestsLoading(false);
        setBlockRequestsLoaded(true);
      });
  }, [activeInventoryTab, blockRequestsLoaded]);

  // Issue Slip Directory — every stock transfer slip ever created, fetched lazily
  // the first time the directory is opened.
  useEffect(() => {
    if (!issueSlipDirectoryOpen || issueSlipsLoaded) return;
    setIssueSlipsLoading(true);
    fetch(`${BASE_URL}/inventory/get_stock_transfers`)
      .then((res) => res.json())
      .then((data: any) => {
        if (!data?.success || !Array.isArray(data?.transfers)) throw new Error('Unexpected response');
        setIssueSlips(data.transfers);
      })
      .catch(() => toast.error('Failed to load issue slips'))
      .finally(() => {
        setIssueSlipsLoading(false);
        setIssueSlipsLoaded(true);
      });
  }, [issueSlipDirectoryOpen, issueSlipsLoaded]);

  const issueSlipsByDate = useMemo(() => {
    const groups = new Map<string, StockTransfer[]>();
    issueSlips.forEach((slip) => {
      const dateKey = (slip.creation_date || '').slice(0, 10) || 'Unknown Date';
      const list = groups.get(dateKey);
      if (list) list.push(slip);
      else groups.set(dateKey, [slip]);
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, slips]) => [
        date,
        [...slips].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
      ] as const);
  }, [issueSlips]);

  const selectedIssueSlip = useMemo(
    () => issueSlips.find((slip) => slip.transfer_id === selectedIssueSlipId) ?? null,
    [issueSlips, selectedIssueSlipId],
  );

  // Shared item-stock-location lookup for the From/To warehouse panels — one fetch per
  // selected item, checked against whichever store each panel has selected.
  useEffect(() => {
    const itemIds = Array.from(new Set(transferLineItems.map((line) => line.itemId).filter(Boolean)));
    if (itemIds.length === 0) {
      setTransferDissociationByItem({});
      return;
    }
    let mounted = true;
    setTransferDissociationLoading(true);
    Promise.all(itemIds.map((itemId) =>
      fetch(`${BASE_URL}/inventory/get_inventory_item_dissociation/${itemId}`)
        .then((res) => res.json())
        .then((data: any) => {
          const raw = data?.success && data?.dissociation && typeof data.dissociation === 'object' ? data.dissociation : {};
          const parsed: ItemDissociation = {};
          Object.entries(raw).forEach(([storeName, entry]: [string, any]) => {
            const methodKey = Object.keys(entry || {}).find((key) => key !== 'quantity');
            parsed[storeName] = {
              quantity: Number(entry?.quantity) || 0,
              batches: methodKey && Array.isArray(entry[methodKey]) ? entry[methodKey] : [],
            };
          });
          return [itemId, parsed] as const;
        })
        .catch(() => [itemId, {}] as const),
    )).then((results) => {
      if (!mounted) return;
      setTransferDissociationByItem(Object.fromEntries(results));
    }).finally(() => {
      if (mounted) setTransferDissociationLoading(false);
    });
    return () => { mounted = false; };
  }, [transferLineItems.map((line) => line.itemId).join('|')]);

  const requestWarehouseOptions = useMemo(
    () => ['Central Store', ...availableStores.filter((store) => store.toLowerCase() !== 'central store')],
    [availableStores],
  );

  const transferLineItemsResolved = useMemo(
    () => transferLineItems.map((line) => ({ item: items.find((item) => item.id === line.itemId) || null })),
    [transferLineItems, items],
  );

  const handleOpenTransferFromPanels = () => {
    if (!fromStore || !toStore) return toast.error('Select both a From and To warehouse');
    if (fromStore === toStore) return toast.error('From and To warehouse must be different');
    if (transferLineItems.length === 0) return toast.error('Add at least one item to transfer');

    const seenIds = new Set<string>();
    const resolvedItems: { itemId: string; quantity: string }[] = [];
    for (const line of transferLineItems) {
      const lineItem = items.find((item) => item.id === line.itemId);
      if (!lineItem) return toast.error('Select an item for every row');
      if (seenIds.has(lineItem.id)) return toast.error(`${lineItem.name} is added more than once`);
      seenIds.add(lineItem.id);
      const numericQuantity = Number(line.quantity);
      if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
        return toast.error(`Enter a valid quantity for ${lineItem.name}`);
      }
      const available = transferDissociationByItem[lineItem.id]?.[fromStore]?.quantity ?? 0;
      if (numericQuantity > available) {
        return toast.error(`Only ${available.toLocaleString()} ${lineItem.unit} of ${lineItem.name} available at ${fromStore}`);
      }
      resolvedItems.push({ itemId: lineItem.id, quantity: line.quantity });
    }

    setTransferPrefill({
      items: resolvedItems,
      source: fromStore,
      destination: toStore,
    });
    setTransferStockOpen(true);
  };

  const selectedTransfer = useMemo(
    () => transferApprovals.find((approval) => approval.id === selectedTransferId) ?? null,
    [selectedTransferId, transferApprovals],
  );

  type StringMasterSection =
    | 'inventoryGroups'
    | 'units'
    | 'expenseClassifications'
    | 'inventoryClassifications'
    | 'issueClassifications';

  const addMasterValue = (section: StringMasterSection, value: string) => {
    if (masterConfig[section].some((entry) => entry.toLowerCase() === value.toLowerCase())) {
      toast.error(`"${value}" already exists`);
      return;
    }
    setMasterConfig((previous) => ({ ...previous, [section]: [...previous[section], value] }));
    toast.success(`"${value}" created`);
  };

  const removeMasterValue = (section: StringMasterSection, value: string) => {
    setMasterConfig((previous) => ({
      ...previous,
      [section]: previous[section].filter((entry) => entry !== value),
      ...(section === 'inventoryGroups'
        ? {
          categoryGroups: Object.fromEntries(
            Object.entries(previous.categoryGroups).filter(([, group]) => group !== value),
          ),
        }
        : {}),
    }));
  };

  const addStore = (name: string, blocks: StoreBlock[], location: StoreLocation) => {
    if (masterConfig.stores.some((entry) => entry.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`"${name}" already exists`);
      return;
    }
    setMasterConfig((previous) => ({
      ...previous,
      stores: [...previous.stores, { name, blocks, location }],
    }));
    toast.success(`"${name}" created`);
  };

  const removeStore = (name: string) => {
    setMasterConfig((previous) => ({
      ...previous,
      stores: previous.stores.filter((entry) => entry.name !== name),
    }));
  };

  const addCategory = (name: string, inventoryGroup?: string) => {
    if (!inventoryGroup) return toast.error('Select a parent inventory group');
    if (masterConfig.categories.some((entry) => entry.toLowerCase() === name.toLowerCase())) {
      toast.error(`"${name}" already exists`);
      return;
    }
    setMasterConfig((previous) => ({
      ...previous,
      categories: [...previous.categories, name],
      categoryGroups: { ...previous.categoryGroups, [name]: inventoryGroup },
    }));
    toast.success(`"${name}" created under ${inventoryGroup}`);
  };

  const removeCategory = (value: string) => {
    setMasterConfig((previous) => {
      const categoryGroups = { ...previous.categoryGroups };
      delete categoryGroups[value];
      return {
        ...previous,
        categories: previous.categories.filter((entry) => entry !== value),
        categoryGroups,
        subCategories: previous.subCategories.filter((entry) => entry.category !== value),
      };
    });
  };

  const addSubCategory = (name: string, category?: string) => {
    if (!category) return toast.error('Select a parent category');
    if (masterConfig.subCategories.some(
      (entry) => entry.name.toLowerCase() === name.toLowerCase() && entry.category === category,
    )) {
      toast.error(`"${name}" already exists under ${category}`);
      return;
    }
    setMasterConfig((previous) => ({
      ...previous,
      subCategories: [...previous.subCategories, { name, category }],
    }));
    toast.success(`"${name}" created under ${category}`);
  };

  // ── Helpers to mutate items ─────────────────────────────
  const addTransaction = (itemId: string, tx: Omit<StockTransaction, 'id'>) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const delta =
          tx.type === 'incoming' ? tx.qty
          : tx.type === 'adjustment' ? tx.qty
          : -tx.qty;
        return {
          ...it,
          currentStock: Math.max(0, it.currentStock + delta),
          transactions: [{ ...tx, id: genId() }, ...it.transactions],
        };
      }),
    );
  };

  const printInventoryReport = () => {
    if (!inventoryReportFrom || !inventoryReportTo) {
      toast.error('Please select both From and To dates');
      return;
    }
    if (inventoryReportFrom > inventoryReportTo) {
      toast.error('From Date cannot be after To Date');
      return;
    }

    const escapeHtml = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    const transactionDelta = (transaction: StockTransaction) => (
      transaction.type === 'incoming' || (transaction.type === 'adjustment' && transaction.qty >= 0)
        ? Math.abs(Number(transaction.qty) || 0)
        : -Math.abs(Number(transaction.qty) || 0)
    );

    const reportRows = [...centralStoreItems]
      .sort((first, second) => first.category.localeCompare(second.category) || first.name.localeCompare(second.name))
      .map((item) => {
        const transactions = item.transactions ?? [];
        const openingDelta = transactions
          .filter((transaction) => String(transaction.date || '').slice(0, 10) >= inventoryReportFrom)
          .reduce((sum, transaction) => sum + transactionDelta(transaction), 0);
        const afterPeriodDelta = transactions
          .filter((transaction) => String(transaction.date || '').slice(0, 10) > inventoryReportTo)
          .reduce((sum, transaction) => sum + transactionDelta(transaction), 0);
        const periodTransactions = transactions.filter((transaction) => {
          const date = String(transaction.date || '').slice(0, 10);
          return date >= inventoryReportFrom && date <= inventoryReportTo;
        });
        const received = periodTransactions
          .filter((transaction) => transactionDelta(transaction) > 0)
          .reduce((sum, transaction) => sum + transactionDelta(transaction), 0);
        const issued = periodTransactions
          .filter((transaction) => transactionDelta(transaction) < 0)
          .reduce((sum, transaction) => sum + Math.abs(transactionDelta(transaction)), 0);
        const opening = Math.max(0, (Number(item.currentStock) || 0) - openingDelta);
        const closing = Math.max(0, (Number(item.currentStock) || 0) - afterPeriodDelta);
        const fifoValue = (item.fifoList ?? []).reduce(
          (sum, batch) => sum + (Number(batch.stock) || 0) * (Number(batch.per_unit_cost) || 0),
          0,
        );
        const latestRate = transactions.find((transaction) => Number(transaction.costPerUnit) > 0)?.costPerUnit ?? 0;
        const unitRate = item.currentStock > 0 && fifoValue > 0 ? fifoValue / item.currentStock : Number(latestRate) || 0;
        const closingValue = closing * unitRate;
        const stockStatus = closing <= 0 ? 'Out of Stock' : closing < item.minStock ? 'Below Minimum' : 'Available';
        return { item, opening, received, issued, closing, unitRate, closingValue, stockStatus };
      });

    const totalClosingValue = reportRows.reduce((sum, row) => sum + row.closingValue, 0);
    const categoryCount = new Set(reportRows.map((row) => row.item.category || 'Others')).size;
    const belowMinimumCount = reportRows.filter((row) => row.closing < row.item.minStock).length;
    const generatedOn = new Date().toLocaleString('en-IN', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
    });
    const generatedBy = user?.name || user?.username || 'System User';
    const statementPeriod = `${formatDateDDMMYYYY(inventoryReportFrom)} to ${formatDateDDMMYYYY(inventoryReportTo)}`;
    const reportId = `INV-${inventoryReportFrom.replace(/-/g, '')}-${inventoryReportTo.replace(/-/g, '')}`;
    const logoUrl = new URL(logo3f, window.location.origin).href;
    const rows = reportRows.map(({ item, opening, received, issued, closing, unitRate, closingValue, stockStatus }, index) => `
      <tr>
        <td class="center">${index + 1}</td>
        <td><strong>${escapeHtml(item.sku || item.id)}</strong></td>
        <td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.description || '')}</small></td>
        <td>${escapeHtml(item.category || 'Others')}</td>
        <td>${escapeHtml(item.location || 'Not Recorded')}</td>
        <td class="center">${escapeHtml(item.unit || '—')}</td>
        <td class="num">${opening.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
        <td class="num received">${received > 0 ? received.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}</td>
        <td class="num issued">${issued > 0 ? issued.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}</td>
        <td class="num"><strong>${closing.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></td>
        <td class="num">${unitRate > 0 ? `₹${unitRate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A'}</td>
        <td class="num"><strong>₹${closingValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
        <td class="center"><span class="status ${stockStatus === 'Available' ? 'ok' : stockStatus === 'Below Minimum' ? 'low' : 'out'}">${escapeHtml(stockStatus)}</span></td>
      </tr>
    `).join('');

    const popup = window.open('', '_blank', 'width=1100,height=900');
    if (!popup) {
      toast.error('Pop-up blocked. Please allow pop-ups to print.');
      return;
    }
    popup.document.write(`<!doctype html><html><head><title>Inventory Report - ${escapeHtml(reportId)}</title><style>
      @page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}html,body{width:194mm;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;background:#fff;font-size:6.5pt}.sheet{width:194mm;min-height:281mm;border:.3mm solid #b8c5d1;padding:3mm}.header{text-align:center;border-bottom:.6mm solid #0D3A35;padding-bottom:2.2mm}.header img{height:13mm;width:auto}.company{margin-top:.5mm;font-size:13pt;font-weight:900;letter-spacing:.035em}.address{margin-top:.7mm;color:#526173;font-size:6.5pt}.company-meta{margin-top:.7mm;color:#526173;font-size:6.3pt}.title{margin-top:2.2mm;background:#0D3A35;color:#fff;padding:1.6mm;text-align:center;font-size:9pt;font-weight:900;letter-spacing:.12em}.meta{display:grid;grid-template-columns:1.25fr .65fr 1.4fr 1fr 1fr;border:.25mm solid #cbd5e1;border-top:0}.meta>div{min-width:0;padding:1.3mm 1.1mm;border-right:.25mm solid #cbd5e1;overflow-wrap:anywhere}.meta>div:last-child{border-right:0}.label{color:#64748b;font-size:5.1pt;font-weight:700;text-transform:uppercase;letter-spacing:.035em}.value{margin-top:.4mm;font-size:6.4pt;font-weight:800}.section{margin-top:2.2mm;border:.25mm solid #cbd5e1}.section-title{border-bottom:.25mm solid #cbd5e1;background:#f1f5f9;padding:1.2mm 1.5mm;color:#334155;font-size:6.7pt;font-weight:900;text-transform:uppercase;letter-spacing:.07em}.summary{display:grid;grid-template-columns:repeat(4,1fr)}.summary>div{padding:1.5mm;border-right:.25mm solid #cbd5e1}.summary>div:last-child{border-right:0}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:.25mm solid #cbd5e1;padding:1mm .55mm;vertical-align:middle;overflow-wrap:anywhere;word-break:break-word}th{background:#0D3A35;color:#fff;text-align:center;font-size:4.4pt;font-weight:700;line-height:1.2;text-transform:uppercase}td{font-size:4.9pt;line-height:1.2}td small{display:block;margin-top:.3mm;color:#64748b;font-size:4.3pt}.num{text-align:right}.center{text-align:center}.received{color:#047857}.issued{color:#b91c1c}.status{display:inline-block;border-radius:20px;padding:.5mm 1mm;font-size:4.2pt;font-weight:800;white-space:nowrap}.status.ok{background:#ecfdf5;color:#047857}.status.low{background:#fffbeb;color:#b45309}.status.out{background:#fef2f2;color:#b91c1c}.footer{display:flex;justify-content:space-between;margin-top:2.2mm;border-top:.25mm solid #cbd5e1;padding-top:1.3mm;color:#64748b;font-size:5.3pt}@media print{html,body{width:194mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{width:194mm;border-color:#b8c5d1}}</style></head><body><div class="sheet">
      <div class="header"><img src="${logoUrl}" alt="Sai Bioresources"><div class="company">SAI BIORESOURCES PRIVATE LIMITED</div><div class="address">Khasra No. 121/1, Amrit Dairy Farm, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh - 491001</div><div class="company-meta">GSTIN: 22ARPCS5442R1ZM &nbsp;|&nbsp; Phone: +91 75870 76870 &nbsp;|&nbsp; Email: rajendra.s@saiobioenergy.com</div></div>
      <div class="title">ITEM-WISE INVENTORY REPORT</div>
      <div class="meta"><div><div class="label">Report ID</div><div class="value">${escapeHtml(reportId)}</div></div><div><div class="label">Items</div><div class="value">${reportRows.length}</div></div><div><div class="label">Statement Period</div><div class="value">${escapeHtml(statementPeriod)}</div></div><div><div class="label">Generated On</div><div class="value">${escapeHtml(generatedOn)}</div></div><div><div class="label">Generated By</div><div class="value">${escapeHtml(generatedBy)}</div></div></div>
      <div class="section"><div class="section-title">Inventory Summary</div><div class="summary"><div><div class="label">Total Inventory Items</div><div class="value">${reportRows.length}</div></div><div><div class="label">Categories</div><div class="value">${categoryCount}</div></div><div><div class="label">Below Minimum Stock</div><div class="value">${belowMinimumCount}</div></div><div><div class="label">Closing Inventory Value</div><div class="value">₹${totalClosingValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div></div></div>
      <div class="section"><div class="section-title">Item-wise Inventory Position</div><table><colgroup><col style="width:3%"><col style="width:9%"><col style="width:14%"><col style="width:8%"><col style="width:10%"><col style="width:4%"><col style="width:7%"><col style="width:6%"><col style="width:6%"><col style="width:7%"><col style="width:8%"><col style="width:10%"><col style="width:8%"></colgroup><thead><tr><th>S. No.</th><th>Item Code</th><th>Item Name</th><th>Category</th><th>Store / Warehouse</th><th>UoM</th><th>Opening Stock</th><th>Received</th><th>Issued</th><th>Closing Stock</th><th>Unit Rate</th><th>Closing Value</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="footer"><span>System-generated Item-wise Inventory Report</span><span>Report ID: ${escapeHtml(reportId)}</span><span>Page 1 of 1</span></div>
      </div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));<\/script></body></html>`);
    popup.document.close();
    setInventoryReportPeriodOpen(false);
  };

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen space-y-7 bg-[#fbfcfd] p-4 text-slate-900 sm:p-6 lg:p-8">
      {/* ── Header ── */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-bold text-emerald-700">Inventory Operations</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Inventory Management</h1>
          <p className="mt-3 text-base font-medium text-slate-600">
            Track stock, issue materials, and manage equipment from one place
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeInventoryTab === 'dashboard' ? (
            <Button
              onClick={() => setInventoryReportPeriodOpen(true)}
              className="h-11 gap-2 rounded-xl bg-[#0D3A35] px-5 font-bold text-white shadow-sm hover:bg-[#092e2a]"
            >
              <Printer className="h-4 w-4" />
              Print Inventory Report
            </Button>
          ) : (
            <>
              <Button
                onClick={() => setIssuedItemsOpen(true)}
                className="h-11 gap-2 rounded-xl border border-[#0D3A35]/15 bg-white px-4 font-bold text-[#0D3A35] shadow-sm hover:bg-[#0D3A35]/5"
              >
                <ClipboardList className="h-4 w-4" />
                Issue Items
              </Button>
              <Button
                onClick={() => {
                  setAllocationItem(null);
                  setAllocationOpen(true);
                }}
                className="h-11 gap-2 rounded-xl border border-[#0D3A35]/15 bg-white px-4 font-bold text-[#0D3A35] shadow-sm hover:bg-[#0D3A35]/5"
              >
                <PackageCheck className="h-4 w-4" />
                Equipment Allocation
              </Button>
              <Button
                onClick={() => setAddOpen(true)}
                className="h-11 gap-2 rounded-xl bg-[#0D3A35] px-5 font-bold text-white shadow-sm hover:bg-[#092e2a]"
              >
                <Plus className="h-4 w-4" />
                Create New Product
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Inventory switch bar ── */}
      <div className="overflow-x-auto border-b border-slate-200 bg-white px-1">
        <div className="flex min-w-max items-center gap-10 px-4">
          {[
            { key: 'dashboard', label: 'Dashboard', icon: Boxes },
            { key: 'central-store', label: 'Central Store', icon: PackageCheck },
            { key: 'sub-store', label: 'Sub-Store', icon: Layers },
            { key: 'inventory-request', label: 'Inventory Request', icon: Split },
            { key: 'configure', label: 'Configure', icon: Settings },
          ].map((tab) => {
            const isActive = activeInventoryTab === tab.key;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveInventoryTab(tab.key as 'dashboard' | 'central-store' | 'sub-store' | 'inventory-request' | 'configure')}
                className={cn(
                  'relative flex h-14 items-center gap-2 px-1 text-sm font-bold transition-colors',
                  isActive ? 'text-slate-950' : 'text-slate-500 hover:text-[#0D3A35]',
                )}
              >
                <TabIcon className={cn('h-4 w-4', isActive && 'text-[#0D3A35]')} />
                {tab.label}
                {isActive && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#0D3A35]" />}
              </button>
            );
          })}
        </div>
      </div>

      {activeInventoryTab === 'dashboard' && (
        <>
      {/* ── Low Stock Alert Panel ── */}
      {lowStockItems.length > 0 && alertPanelOpen && (
        <div className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between border-b border-red-100 bg-red-50/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span className="text-sm font-semibold text-red-700">
                {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} below minimum stock level
              </span>
            </div>
            <button
              onClick={() => setAlertPanelOpen(false)}
              className="text-red-400 hover:text-red-700 transition-colors"
              title="Dismiss all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {lowStockItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-slate-50">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-red-200 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">{item.sku} · {item.location}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-3">
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Stock / Min</p>
                    <p className="text-sm font-bold text-red-600">
                      {item.currentStock}
                      <span className="text-gray-400 font-normal"> / {item.minStock} {item.unit}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => setDismissedAlerts((prev) => new Set([...prev, item.id]))}
                    className="text-red-300 hover:text-red-600 transition-colors"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {/* Total Inventory Value */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-500">Inventory Value</p>
              <p className="mt-3 text-2xl font-bold text-slate-950">
                ₹{inventoryValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-400">Based on FIFO cost</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0D3A35]/10 text-[#0D3A35] ring-2 ring-[#0D3A35]/10">
              <IndianRupee className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Total Items */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-500">Total Items</p>
              <p className="mt-3 text-2xl font-bold text-slate-950">{items.length}</p>
              <p className="mt-1 text-xs font-medium text-slate-400">{new Set(items.map((i) => i.category)).size} categories</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0D3A35]/10 text-[#0D3A35] ring-2 ring-[#0D3A35]/10">
              <Boxes className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Open Ledgers */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-500">Open Ledgers</p>
              <p className="mt-3 text-2xl font-bold text-slate-950">{openLedgersCount ?? '—'}</p>
              <p className="mt-1 text-xs font-medium text-slate-400">Pending &amp; active issues</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0D3A35]/10 text-[#0D3A35] ring-2 ring-[#0D3A35]/10">
              <ClipboardList className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Low Stock */}
        <div
          className={cn(
            'cursor-pointer rounded-2xl border bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)] transition-all hover:-translate-y-0.5',
            lowStockItems.length > 0 ? 'border-red-200 hover:border-red-300' : 'border-slate-200/80',
          )}
          onClick={() => { setDismissedAlerts(new Set()); setAlertPanelOpen(true); }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-500">Low Stock</p>
              <p className={cn('mt-3 text-2xl font-bold', lowStockItems.length > 0 ? 'text-red-600' : 'text-slate-950')}>
                {lowStockItems.length}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-400">Below minimum threshold</p>
            </div>
            <div className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-2',
              lowStockItems.length > 0
                ? 'bg-red-50 text-red-600 ring-red-100'
                : 'bg-[#0D3A35]/10 text-[#0D3A35] ring-[#0D3A35]/10',
            )}>
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Inventory intelligence dashboard ── */}
      <div className="space-y-3">
        <div className="flex justify-end">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm" aria-label="Inventory chart view">
            {([
              ['category', 'Category'],
              ['item', 'Item-wise'],
              ['percentage', 'Percentage'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDashboardPieView(value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[11px] font-bold transition',
                  dashboardPieView === value
                    ? 'bg-[#0D3A35] text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
        {([
          {
            key: 'value',
            title: 'Stock Value Distribution',
            description: dashboardPieView === 'item' ? 'FIFO inventory value by item' : 'FIFO inventory value by category',
            data: dashboardPieView === 'item' ? inventoryDashboard.itemValuePieData : inventoryDashboard.valuePieData,
            total: dashboardPieView === 'item' ? inventoryDashboard.itemValuePieTotal : inventoryDashboard.valuePieTotal,
            isValue: true,
          },
          {
            key: 'stock',
            title: 'Stock Item Distribution',
            description: dashboardPieView === 'item' ? 'Recorded stock quantity by item' : 'Recorded stock quantity by category',
            data: dashboardPieView === 'item' ? inventoryDashboard.itemStockPieData : inventoryDashboard.stockPieData,
            total: dashboardPieView === 'item' ? inventoryDashboard.itemStockPieTotal : inventoryDashboard.stockPieTotal,
            isValue: false,
          },
        ] as const).map((chart) => (
          <section key={chart.key} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-bold text-slate-950">{chart.title}</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">{chart.description}</p>
            </div>
            {chart.data.length > 0 ? (
              <>
                <div className="grid h-[350px] min-w-0 grid-cols-[minmax(112px,145px)_minmax(130px,1fr)_minmax(112px,145px)] items-center gap-2 bg-slate-50/40 px-4 py-5">
                  <div className="flex min-w-0 flex-col justify-center gap-2">
                    {chart.data.map((entry, index) => ({ entry, index })).filter(({ index }) => index % 2 === 0).map(({ entry, index }) => {
                      const percentage = chart.total > 0 ? (entry.value / chart.total) * 100 : 0;
                      const detail = dashboardPieView === 'percentage'
                        ? `${percentage.toFixed(1)}%`
                        : chart.isValue
                          ? `₹${entry.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })} · ${percentage.toFixed(1)}%`
                          : `${entry.value.toLocaleString('en-IN')} ${entry.unit} · ${percentage.toFixed(1)}%`;
                      return (
                        <div key={`${entry.name}-left`} className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: INVENTORY_DASHBOARD_COLORS[index % INVENTORY_DASHBOARD_COLORS.length] }} />
                            <p className="truncate text-[11px] font-bold text-slate-800" title={entry.name}>{entry.name}</p>
                          </div>
                          <p className="mt-1 truncate text-[10px] font-semibold text-slate-500" title={detail}>{detail}</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="h-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 12, right: 8, bottom: 12, left: 8 }}>
                      <Pie
                        data={chart.data}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={88}
                        paddingAngle={2}
                        stroke="#fff"
                        strokeWidth={2}
                        labelLine={false}
                        label={false}
                      >
                        {chart.data.map((entry, index) => (
                          <Cell key={entry.name} fill={INVENTORY_DASHBOARD_COLORS[index % INVENTORY_DASHBOARD_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(value: number) => chart.isValue
                          ? `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                          : Number(value).toLocaleString('en-IN')}
                        contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  </div>
                  <div className="flex min-w-0 flex-col justify-center gap-2">
                    {chart.data.map((entry, index) => ({ entry, index })).filter(({ index }) => index % 2 === 1).map(({ entry, index }) => {
                      const percentage = chart.total > 0 ? (entry.value / chart.total) * 100 : 0;
                      const detail = dashboardPieView === 'percentage'
                        ? `${percentage.toFixed(1)}%`
                        : chart.isValue
                          ? `₹${entry.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })} · ${percentage.toFixed(1)}%`
                          : `${entry.value.toLocaleString('en-IN')} ${entry.unit} · ${percentage.toFixed(1)}%`;
                      return (
                        <div key={`${entry.name}-right`} className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: INVENTORY_DASHBOARD_COLORS[index % INVENTORY_DASHBOARD_COLORS.length] }} />
                            <p className="truncate text-[11px] font-bold text-slate-800" title={entry.name}>{entry.name}</p>
                          </div>
                          <p className="mt-1 truncate text-[10px] font-semibold text-slate-500" title={detail}>{detail}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="grid gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-2">
                  {chart.data.map((entry, index) => {
                    const percentage = chart.total > 0 ? (entry.value / chart.total) * 100 : 0;
                    return (
                      <div key={entry.name} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 bg-white px-4 py-3">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: INVENTORY_DASHBOARD_COLORS[index % INVENTORY_DASHBOARD_COLORS.length] }} />
                        <p className="min-w-0 truncate text-xs font-bold text-slate-700" title={entry.name}>{entry.name}</p>
                        <div className="text-right">
                          <p className="text-xs font-black text-slate-900">{dashboardPieView === 'percentage' ? `${percentage.toFixed(1)}%` : chart.isValue ? `₹${entry.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : `${entry.value.toLocaleString('en-IN')} ${entry.unit}`}</p>
                          {dashboardPieView !== 'percentage' && <p className="text-[10px] font-bold text-slate-400">{percentage.toFixed(1)}%</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between bg-[#0D3A35] px-5 py-3 text-white">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/65">Total</span>
                  <span className="text-sm font-black">{dashboardPieView === 'percentage' ? '100%' : chart.isValue ? `₹${chart.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : `${chart.total.toLocaleString('en-IN')} ${new Set(chart.data.map((entry) => entry.unit)).size === 1 ? chart.data[0]?.unit : 'Mixed UoM'}`}</span>
                </div>
              </>
            ) : (
              <div className="grid h-[330px] place-items-center text-sm font-semibold text-slate-400">No {chart.isValue ? 'valued inventory' : 'stock'} data available</div>
            )}
          </section>
        ))}
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-bold text-slate-950">Stock Movement</h2><p className="mt-1 text-xs font-medium text-slate-500">Received versus issued quantity during the last six months</p></div><div className="flex items-center gap-4 text-xs font-bold"><span className="flex items-center gap-1.5 text-[#0D3A35]"><i className="h-2.5 w-2.5 rounded-sm bg-[#0D3A35]"/>Received</span><span className="flex items-center gap-1.5 text-amber-700"><i className="h-2.5 w-2.5 rounded-sm bg-amber-500"/>Issued</span></div></div>
        <div className="mt-4 h-[290px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={inventoryDashboard.movement} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}/><RechartsTooltip contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', fontSize: 12 }}/><Bar dataKey="received" fill="#0D3A35" radius={[5,5,0,0]} maxBarSize={42}/><Bar dataKey="issued" fill="#f59e0b" radius={[5,5,0,0]} maxBarSize={42}/></BarChart></ResponsiveContainer></div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-base font-bold text-slate-950">Replenishment Priority</h2><p className="mt-1 text-xs font-medium text-slate-500">Largest shortages against minimum stock</p></div><PackageX className="h-5 w-5 text-red-600"/></div>
          {inventoryDashboard.replenishment.length ? <div className="divide-y divide-slate-100">{inventoryDashboard.replenishment.map((item) => <div key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3.5"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{item.name}</p><p className="mt-0.5 text-xs text-slate-500">{item.sku} · {item.category}</p></div><div className="text-right"><p className="text-sm font-black text-red-600">Need {item.shortfall.toLocaleString('en-IN')} {item.unit}</p><p className="text-[10px] font-semibold text-slate-400">Stock {item.currentStock.toLocaleString('en-IN')} / Min {item.minStock.toLocaleString('en-IN')}</p></div></div>)}</div> : <div className="grid h-48 place-items-center"><div className="text-center"><ShieldCheck className="mx-auto h-7 w-7 text-emerald-600"/><p className="mt-2 text-sm font-bold text-slate-700">All items meet minimum stock</p></div></div>}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-base font-bold text-slate-950">Expiry Watch</h2><p className="mt-1 text-xs font-medium text-slate-500">Expired and next 90-day batch exposure</p></div><Clock3 className="h-5 w-5 text-amber-600"/></div>
          {inventoryDashboard.expiryItems.length ? <div className="divide-y divide-slate-100">{inventoryDashboard.expiryItems.map((item) => <div key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3.5"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{item.name}</p><p className="mt-0.5 text-xs text-slate-500">{item.batchNumber || item.fifoList?.[0]?.batch_number || 'Batch not recorded'} · {item.category}</p></div><div className="text-right"><p className={cn('text-xs font-black', Number(item.daysToExpiry) < 0 ? 'text-red-600' : 'text-amber-700')}>{Number(item.daysToExpiry) < 0 ? `${Math.abs(Number(item.daysToExpiry))} days expired` : `${item.daysToExpiry} days left`}</p><p className="mt-0.5 text-[10px] font-semibold text-slate-400">{formatDateDDMMYYYY(item.dashboardExpiry)}</p></div></div>)}</div> : <div className="grid h-48 place-items-center"><div className="text-center"><ShieldCheck className="mx-auto h-7 w-7 text-emerald-600"/><p className="mt-2 text-sm font-bold text-slate-700">No near-expiry stock recorded</p></div></div>}
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="text-base font-bold text-slate-950">Category Overview</h2><p className="mt-1 text-xs font-medium text-slate-500">Stock, valuation and exception summary by category</p></div><div className="flex gap-2"><Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">Pipeline: {inventoryDashboard.pipeline.toLocaleString('en-IN')}</Badge><Badge variant="outline">{inventoryDashboard.categories.length} categories</Badge></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{['Category','Items','Stock Quantity','Inventory Value','Low / Out of Stock','Value Share'].map((heading) => <th key={heading} className="px-5 py-3 text-right first:text-left">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{inventoryDashboard.categories.map((entry) => <tr key={entry.category} className="hover:bg-slate-50/70"><td className="px-5 py-3.5 font-bold text-slate-900">{entry.category}</td><td className="px-5 py-3.5 text-right font-semibold">{entry.items}</td><td className="px-5 py-3.5 text-right font-semibold">{entry.stock.toLocaleString('en-IN')}</td><td className="px-5 py-3.5 text-right font-bold">₹{entry.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td className="px-5 py-3.5 text-right"><span className={cn('rounded-full px-2 py-1 text-xs font-bold', entry.low ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>{entry.low}</span></td><td className="px-5 py-3.5 text-right font-semibold">{inventoryValue > 0 ? `${((entry.value / inventoryValue) * 100).toFixed(1)}%` : '0.0%'}</td></tr>)}</tbody></table></div>
      </section>
        </>
      )}

      {(activeInventoryTab === 'central-store' || activeInventoryTab === 'sub-store') && (
        <>
      {/* ── Search & Category Filter ── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_12px_35px_rgba(15,23,42,0.04)] sm:p-5">
        {activeInventoryTab === 'central-store' && (
          <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-950">Central Store Inventory</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">Manage stock held at the central store</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => { setCentralStoreView('stock'); setSearch(''); }}
                  className={cn(
                    'flex h-8 items-center gap-2 rounded-md px-3 text-xs font-bold transition',
                    centralStoreView === 'stock' ? 'bg-white text-[#0D3A35] shadow-sm' : 'text-slate-500',
                  )}
                >
                  <Boxes className="h-3.5 w-3.5" />Stock Items
                </button>
                <button
                  type="button"
                  onClick={() => { setCentralStoreView('transfers'); setSearch(''); }}
                  className={cn(
                    'flex h-8 items-center gap-2 rounded-md px-3 text-xs font-bold transition',
                    centralStoreView === 'transfers' ? 'bg-white text-[#0D3A35] shadow-sm' : 'text-slate-500',
                  )}
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Transfer Slips
                  {pendingTransferCount > 0 && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] text-amber-700">{pendingTransferCount}</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setCentralStoreView('issued'); setSearch(''); }}
                  className={cn(
                    'flex h-8 items-center gap-2 rounded-md px-3 text-xs font-bold transition',
                    centralStoreView === 'issued' ? 'bg-white text-[#0D3A35] shadow-sm' : 'text-slate-500',
                  )}
                >
                  <ArrowUpFromLine className="h-3.5 w-3.5" />
                  Allocated Items
                </button>
              </div>
              <button
                type="button"
                onClick={() => setTransferStockOpen(true)}
                className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#0D3A35] px-4 text-xs font-bold text-white shadow-sm transition hover:bg-[#092e2a]"
              >
                <ArrowRightLeft className="h-4 w-4" />
                Transfer Stock
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-md">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder={activeInventoryTab === 'central-store' && centralStoreView === 'transfers'
                ? 'Search transfer slip, item, store, or approver…'
                : activeInventoryTab === 'central-store' && centralStoreView === 'issued'
                  ? 'Search allocated item, recipient, reference, or status…'
                  : 'Search by name, SKU or category…'}
              className="h-12 rounded-xl border-slate-200 bg-slate-50/70 pl-11 text-sm font-semibold shadow-none focus-visible:ring-emerald-100"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {(activeInventoryTab === 'sub-store' || centralStoreView === 'stock') && (
          <div className="min-w-0 flex-1 overflow-x-auto pb-1">
            <div className="flex w-max items-center gap-2">
              {availableCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    'whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-bold transition-colors',
                    activeCategory === cat
                      ? 'border-[#0D3A35] bg-[#0D3A35] text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-[#0D3A35]/30 hover:bg-[#0D3A35]/5 hover:text-[#0D3A35]',
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          )}
        </div>
        {activeInventoryTab === 'sub-store' && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Store Location</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {['All Locations', ...availableStores].map((location) => (
                <button
                  key={location}
                  type="button"
                  onClick={() => setActiveSubStore(location)}
                  className={cn(
                    'whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-bold transition-colors',
                    activeSubStore === location
                      ? 'border-[#0D3A35] bg-[#0D3A35] text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {location}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-500">
            {activeInventoryTab === 'central-store' && centralStoreView === 'transfers' ? (
              <>Showing <span className="text-[#0D3A35]">{visibleTransferApprovals.length}</span> of {transferApprovals.length} transfer slips</>
            ) : activeInventoryTab === 'central-store' && centralStoreView === 'issued' ? (
              <>Issued stock records and return entries</>
            ) : (
              <>Showing <span className="text-[#0D3A35]">{displayedItems.length}</span> of {inventoryItemsForActiveStore.length} inventory items</>
            )}
          </p>
          {(search || (
            centralStoreView === 'stock'
            && (activeCategory !== 'All' || (activeInventoryTab === 'sub-store' && activeSubStore !== 'All Locations'))
          )) && (
            <button
              type="button"
              onClick={() => { setSearch(''); setActiveCategory('All'); setActiveSubStore('All Locations'); }}
              className="text-xs font-bold text-[#0D3A35] hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {activeInventoryTab === 'central-store' && centralStoreView === 'transfers' && (
        visibleTransferApprovals.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-slate-400">
            <ClipboardList className="mb-3 h-11 w-11 opacity-40" />
            <p className="text-base font-bold">No transfer slips found</p>
            <p className="mt-1 text-xs font-medium">Create a stock transfer request to see it here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-5">
            {visibleTransferApprovals.map((approval) => {
              const latestQuestion = approval.questions?.[approval.questions.length - 1];
              return (
                <article
                  key={approval.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedTransferId(approval.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setSelectedTransferId(approval.id);
                  }}
                  className="flex min-h-[310px] cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-[#0D3A35]/20"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0D3A35]/10 text-[#0D3A35]">
                        <ArrowRightLeft className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-black text-slate-950">{approval.transfer.transferSlipNumber}</h3>
                        <p className="mt-1 text-[10px] font-semibold text-slate-400">
                          Submitted {new Date(approval.requestedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      </div>
                    </div>
                    <span className={cn(
                      'shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold capitalize',
                      approval.status === 'pending'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : approval.status === 'approved'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-red-200 bg-red-50 text-red-700',
                    )}>
                      {approval.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-px bg-slate-100">
                    {[
                      ['Item(s)', approval.transfer.items.length === 1
                        ? approval.transfer.items[0].itemName
                        : `${approval.transfer.items.length} items`],
                      ['Quantity', approval.transfer.items.length === 1
                        ? `${approval.transfer.items[0].quantity.toLocaleString('en-IN')} ${approval.transfer.items[0].unit}`
                        : `${approval.transfer.items.length} line items`],
                      ['Destination', approval.transfer.destinationStore],
                      ['Vehicle', approval.transfer.vehicleNumber || 'N/A'],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0 bg-white px-4 py-3">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                        <p className="mt-1 truncate text-xs font-bold text-slate-700">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex-1 space-y-3 p-4">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-slate-400">Assigned Approver</span>
                      <strong className="truncate text-slate-700">{approval.approverName}</strong>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-slate-400">Approval Date</span>
                      <strong className="text-slate-700">
                        {approval.approvedAt
                          ? new Date(approval.approvedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                          : 'Pending'}
                      </strong>
                    </div>

                    {latestQuestion && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-amber-700">
                          <MessageCircle className="h-3.5 w-3.5" />
                          Question from {latestQuestion.askedBy}
                        </div>
                        <p className="mt-2 text-xs font-semibold leading-relaxed text-amber-900">{latestQuestion.question}</p>
                        {(approval.questions?.length ?? 0) > 1 && (
                          <p className="mt-2 text-[9px] font-bold text-amber-600">
                            +{approval.questions!.length - 1} earlier question{approval.questions!.length - 1 === 1 ? '' : 's'}
                          </p>
                        )}
                      </div>
                    )}

                    {approval.rejectionReason && (
                      <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                        Rejection reason: {approval.rejectionReason}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedTransferId(approval.id)}
                    className="flex items-center justify-center gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-xs font-black text-[#0D3A35] transition hover:bg-[#0D3A35]/5"
                  >
                    View Transfer Slip
                    <FileCheck className="h-4 w-4" />
                  </button>
                </article>
              );
            })}
          </div>
        )
      )}

      {activeInventoryTab === 'central-store' && centralStoreView === 'issued' && (
        <IssuedStockTab
          items={items}
          search={search}
          onStockReturned={(itemId, quantity) => {
            setItems((previous) => previous.map((stockItem) => (
              stockItem.id === itemId
                ? { ...stockItem, currentStock: stockItem.currentStock + quantity }
                : stockItem
            )));
          }}
          onStockHandedOver={(itemId, quantity, issueId) => {
            setItems((previous) => previous.map((stockItem) => (
              stockItem.id === itemId
                ? {
                  ...stockItem,
                  currentStock: Math.max(0, stockItem.currentStock - quantity),
                  transactions: [{
                    id: `allocation-handover-${issueId}`,
                    type: 'issued' as const,
                    qty: quantity,
                    date: today(),
                    note: `OTP-verified allocation handover · ${issueId}`,
                    by: user?.name || user?.username || 'System User',
                  }, ...stockItem.transactions],
                }
                : stockItem
            )));
          }}
        />
      )}

      {(activeInventoryTab === 'sub-store' || centralStoreView === 'stock') && (
        <>
      {/* ── Restore alerts link ── */}
      {(!alertPanelOpen || dismissedAlerts.size > 0) && centralStoreItems.some((i) => i.currentStock < i.minStock) && (
        <button
          onClick={() => {
            setDismissedAlerts(new Set());
            setAlertPanelOpen(true);
            setActiveInventoryTab('dashboard');
          }}
          className="mb-4 flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
        >
          <AlertTriangle className="w-3 h-3" />
          {centralStoreItems.filter((i) => i.currentStock < i.minStock).length} low-stock alert{centralStoreItems.filter((i) => i.currentStock < i.minStock).length > 1 ? 's' : ''} hidden — click to restore
        </button>
      )}

      {/* ── Card Grid ── */}
      {displayedItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Boxes className="w-12 h-12 mb-3 opacity-40" />
          <p className="text-lg font-medium">No items found</p>
          <p className="text-sm">Try a different search or category filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] items-stretch gap-6">
          {displayedItems.map((item) => (
            <InventoryCard
              key={item.id}
              item={item}
              onInfo={() => setInformationItem(item)}
              onAllocate={() => {
                setIssueStockItem(item);
              }}
              onUpdateStock={() => {
                setRequestStockItems([item]);
                setRequestStockOpen(true);
              }}
              onLedger={() => setLedgerItem(item)}
              onDamage={() => setDamageItem(item)}
              onReturnEntry={() => setReturnEntryItem(item)}
              onHistory={() => { setHistoryItem(item); setHistoryFilter('all'); }}
              onDelete={() => setDeleteItem(item)}
            />
          ))}
        </div>
      )}
        </>
      )}
        </>
      )}

      {activeInventoryTab === 'configure' && (
        <div className="space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Inventory Master Configuration</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Create and maintain the master values used across inventory forms.
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-400">Changes are saved automatically</span>
          </div>

          <div className="rounded-2xl border border-[#0D3A35]/15 bg-[#0D3A35]/5 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#0D3A35]">ERP Item Hierarchy</p>
            <p className="mt-2 text-sm font-bold text-slate-800">
              Inventory Group <span className="mx-2 text-slate-300">→</span>
              Item Category <span className="mx-2 text-slate-300">→</span>
              Item Subcategory <span className="mx-2 text-slate-300">→</span>
              Item
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              Example: Farm Inputs → Fertilisers → Nitrogen Fertilisers → Urea 46% N
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <MasterConfigCard
              title="Inventory Groups"
              description="Maintain the highest-level ERP grouping for every inventory item."
              placeholder="Enter inventory group"
              icon={Layers}
              values={masterConfig.inventoryGroups.map((value) => ({ id: value, label: value }))}
              onAdd={(value) => addMasterValue('inventoryGroups', value)}
              onRemove={(value) => removeMasterValue('inventoryGroups', value)}
            />
            <MasterConfigCard
              title="Item Categories"
              description="Create item categories and link each category to an inventory group."
              placeholder="Enter category name"
              icon={Boxes}
              parentLabel="Parent Inventory Group"
              parentOptions={masterConfig.inventoryGroups}
              values={masterConfig.categories.map((value) => ({
                id: value,
                label: value,
                meta: masterConfig.categoryGroups[value] || 'Unassigned group',
              }))}
              onAdd={addCategory}
              onRemove={removeCategory}
            />
            <MasterConfigCard
              title="Sub Categories"
              description="Create sub-categories and link each one to its parent category."
              placeholder="Enter sub-category name"
              icon={Layers}
              parentLabel="Parent Category"
              parentOptions={masterConfig.categories}
              values={masterConfig.subCategories.map((value) => ({
                id: `${value.category}::${value.name}`,
                label: value.name,
                meta: value.category,
              }))}
              onAdd={addSubCategory}
              onRemove={(id) => {
                const [category, name] = id.split('::');
                setMasterConfig((previous) => ({
                  ...previous,
                  subCategories: previous.subCategories.filter(
                    (entry) => !(entry.category === category && entry.name === name),
                  ),
                }));
              }}
            />
            <MasterConfigCard
              title="Measuring Units"
              description="Create quantity units available in product and stock forms."
              placeholder="Enter unit, e.g. Boxes"
              icon={PackageCheck}
              values={masterConfig.units.map((value) => ({ id: value, label: value }))}
              onAdd={(value) => addMasterValue('units', value)}
              onRemove={(value) => removeMasterValue('units', value)}
            />
            <StoreConfigCard
              values={masterConfig.stores}
              onAdd={addStore}
              onRemove={removeStore}
            />
          </div>

          <div className="pt-2">
            <h3 className="text-base font-bold text-slate-950">Classification Standards</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Standard classifications available when creating or editing an inventory item.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <MasterConfigCard
              title="Expense Classification"
              description="Classify purchasing and accounting treatment."
              placeholder="Enter expense class"
              icon={IndianRupee}
              values={masterConfig.expenseClassifications.map((value) => ({ id: value, label: value }))}
              onAdd={(value) => addMasterValue('expenseClassifications', value)}
              onRemove={(value) => removeMasterValue('expenseClassifications', value)}
            />
            <MasterConfigCard
              title="Inventory Classification"
              description="Classify the physical nature of inventory."
              placeholder="Enter inventory class"
              icon={Boxes}
              values={masterConfig.inventoryClassifications.map((value) => ({ id: value, label: value }))}
              onAdd={(value) => addMasterValue('inventoryClassifications', value)}
              onRemove={(value) => removeMasterValue('inventoryClassifications', value)}
            />
            <MasterConfigCard
              title="Issue Classification"
              description="Define whether issued stock must be returned."
              placeholder="Enter issue class"
              icon={Undo2}
              values={masterConfig.issueClassifications.map((value) => ({ id: value, label: value }))}
              onAdd={(value) => addMasterValue('issueClassifications', value)}
              onRemove={(value) => removeMasterValue('issueClassifications', value)}
            />
          </div>
        </div>
      )}

      {activeInventoryTab === 'inventory-request' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Inventory Request</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                View all farms on the map, then move stock from one warehouse to another.
              </p>
            </div>
            <Button
              variant="outline"
              className="gap-2 border-slate-200 text-slate-700 hover:bg-slate-50"
              onClick={() => setIssueSlipDirectoryOpen(true)}
            >
              <FileText className="h-4 w-4" />
              Issue Slip Directory
            </Button>
          </div>

          {/* ROW 1: Inventory Requests (25%) + Farm Map (75%) */}
          <div className="flex flex-col gap-5 lg:h-[640px] lg:flex-row lg:items-stretch">
            <div className="lg:h-full lg:w-1/4">
              <InventoryRequestPanel
                stores={masterConfig.stores}
                farms={requestFarms}
                items={items}
                requests={blockRequests}
                requestsLoading={blockRequestsLoading}
                selectedStoreName={selectedRequestStoreName}
                onSelectStore={setSelectedRequestStoreName}
              />
            </div>

            <div className="isolate flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)] lg:h-full lg:w-3/4">
              <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0D3A35]/10 text-[#0D3A35]">
                  <MapIcon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-950">Farm Map</h3>
                  <p className="text-xs font-medium text-slate-500">
                    {selectedRequestStoreName
                      ? `Lands in ${selectedRequestStoreName}'s blocks`
                      : 'All active farms and their land boundaries'}
                  </p>
                </div>
              </div>
              <div className="h-[560px] w-full lg:h-auto lg:min-h-0 lg:flex-1">
                {farmsLoading ? (
                  <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">
                    Loading farms…
                  </div>
                ) : (
                  <FarmsOverviewMap
                    farms={requestFarms}
                    stores={masterConfig.stores}
                    selectedStoreName={selectedRequestStoreName}
                  />
                )}
              </div>
            </div>
          </div>

          {/* ROW 2: Item Transfer — Item to Transfer, From Warehouse, To Warehouse side by side */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
            <div className="lg:w-1/3">
              <section className="h-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
                <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0D3A35]/10 text-[#0D3A35]">
                    <Boxes className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-950">
                    {transferLineItems.length > 1 ? 'Items to Transfer' : 'Item to Transfer'}
                  </h3>
                </div>
                <div className="p-4">
                  <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-0.5">
                    {transferLineItems.map((line, index) => {
                      const lineItem = items.find((item) => item.id === line.itemId) || null;
                      const available = fromStore && lineItem ? transferDissociationByItem[lineItem.id]?.[fromStore]?.quantity ?? 0 : 0;
                      return (
                        <div key={index} className="relative overflow-hidden rounded-xl border border-slate-100 bg-slate-50/40">
                          {transferLineItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeTransferLineItem(index)}
                              className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-slate-400 shadow hover:text-red-600"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                          <img
                            src={lineItem?.imageUrl || PLACEHOLDER_IMG}
                            alt={lineItem?.name || 'Select item'}
                            className="h-20 w-full object-cover"
                          />
                          <div className="space-y-1.5 p-2">
                            <div className="relative">
                              <select
                                value={line.itemId}
                                onChange={(event) => updateTransferLineItem(index, { itemId: event.target.value, quantity: '' })}
                                className="h-7 w-full appearance-none rounded-md border border-slate-200 bg-white px-1.5 pr-5 text-[10px] font-semibold text-slate-700 outline-none focus:border-[#0D3A35]"
                              >
                                <option value="">Select item</option>
                                {items.map((item) => (
                                  <option
                                    key={item.id}
                                    value={item.id}
                                    disabled={transferLineItems.some((other, i) => i !== index && other.itemId === item.id)}
                                  >
                                    {item.name}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                            </div>
                            <Input
                              type="number"
                              min={0}
                              max={fromStore ? available : undefined}
                              value={line.quantity}
                              onChange={(event) => updateTransferLineItem(index, { quantity: event.target.value })}
                              disabled={!line.itemId}
                              placeholder="Qty"
                              className="h-7 text-[10px]"
                            />
                            {fromStore && lineItem && (
                              <p className="text-[8px] font-semibold text-slate-400">Max {available.toLocaleString()}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={addTransferLineItem}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-[10px] font-bold uppercase tracking-wide text-[#0D3A35] hover:bg-slate-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Item
                  </button>
                </div>
              </section>
            </div>

            <div className="lg:w-1/3">
              <WarehouseStockPanel
                label="From Warehouse"
                icon={ArrowUpFromLine}
                stores={requestWarehouseOptions}
                store={fromStore}
                onStoreChange={setFromStore}
                lineItems={transferLineItemsResolved}
                dissociationByItem={transferDissociationByItem}
                dissociationLoading={transferDissociationLoading}
              />
            </div>

            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={handleOpenTransferFromPanels}
                title="Transfer stock"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0D3A35] text-white shadow-md transition hover:bg-[#092e2a]"
              >
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>

            <div className="lg:w-1/3">
              <WarehouseStockPanel
                label="To Warehouse"
                icon={ArrowDownToLine}
                stores={requestWarehouseOptions}
                store={toStore}
                onStoreChange={setToStore}
                lineItems={transferLineItemsResolved}
                dissociationByItem={transferDissociationByItem}
                dissociationLoading={transferDissociationLoading}
              />
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          MODALS
      ═══════════════════════════════════════════════ */}

      {/* Add New Stock */}
      <AddStockModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        inventoryGroups={masterConfig.inventoryGroups}
        categories={masterConfig.categories}
        categoryGroups={masterConfig.categoryGroups}
        subCategories={masterConfig.subCategories}
        expenseClassifications={masterConfig.expenseClassifications}
        inventoryClassifications={masterConfig.inventoryClassifications}
        issueClassifications={masterConfig.issueClassifications}
        units={availableUnits}
        locations={availableStores}
        onSave={async (data, imageFile, openingStocks) => {
          try {
            let itemImageUrl = '';
            if (imageFile) {
              const formData = new FormData();
              formData.append('doc', imageFile);
              const uploadRes = await fetch(`${BASE_URL}/inventory/upload_item_image`, {
                method: 'POST',
                body: formData,
              });
              const uploadData: any = await uploadRes.json().catch(() => null);
              if (!uploadRes.ok || !uploadData?.success || !uploadData?.public_url) {
                throw new Error(uploadData?.message || 'Failed to upload item image');
              }
              itemImageUrl = String(uploadData.public_url);
            }

            const validEntries = openingStocks.filter((e) => Number(e.quantity) > 0);
            const fifoList = validEntries.map((e) => ({
              stock: Number(e.quantity),
              per_unit_cost: Number(e.costPerUnit) || 0,
              po_number: e.poNumber || '',
            }));
            const totalOpeningStock = fifoList.reduce((sum, entry) => sum + entry.stock, 0);

            const createPayload: Record<string, unknown> = {
              item_name: data.name,
              new_item_code: data.sku,
              category: data.category,
              location: data.location,
              unit: data.unit,
              threshold: Number(data.minStock) || 0,
              item_image_url: itemImageUrl,
              description: data.description || '',
              stock_issue_method: data.stockIssueMethod,
              inventory_group: data.inventoryGroup || '',
              sub_category: data.subCategory || '',
              expense_classification: data.expenseClassification || '',
              inventory_classification: data.inventoryClassification || '',
              issue_classification: data.issueClassification || '',
              packing_size: data.packingSize || '',
              shelf: data.shelf || '',
            };

            if (validEntries.length > 0) {
              createPayload.total_opening_stock = totalOpeningStock;
              createPayload.fifo_list = fifoList;
            }

            const createRes = await fetch(`${BASE_URL}/inventory/create_new_item`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(createPayload),
            });
            const createData: any = await createRes.json().catch(() => null);
            if (!createRes.ok || !createData?.success) {
              throw new Error(createData?.message || 'Failed to create item');
            }

            const createdItem: StockItem = {
              ...data,
              imageUrl: itemImageUrl || data.imageUrl,
              id: String(createData?.Invent_id || createData?.item_id || genId()),
              currentStock: totalOpeningStock,
              fifoList,
              transactions: validEntries.map((entry) => ({
                id: genId(),
                type: 'incoming' as const,
                qty: Number(entry.quantity),
                date: today(),
                note: [
                  'Opening stock',
                  entry.poNumber ? `PO: ${entry.poNumber}` : '',
                ].filter(Boolean).join(' · '),
                by: user?.name || user?.username || 'System User',
                costPerUnit: Number(entry.costPerUnit) || 0,
              })),
            };
            saveInventoryItemMetadata(createdItem);
            setItems((prev) => [createdItem, ...prev]);
            setAddOpen(false);
            toast.success(createData?.message || `"${data.name}" added to inventory`);
          } catch (e: any) {
            toast.error(e?.message || 'Failed to create item');
            throw e;
          }
        }}
      />

      <TransferStockModal
        open={transferStockOpen}
        items={centralStoreItems}
        stores={availableStores}
        initialItems={transferPrefill?.items}
        initialSource={transferPrefill?.source}
        initialDestination={transferPrefill?.destination}
        onClose={() => {
          setTransferStockOpen(false);
          setTransferPrefill(null);
        }}
        onTransfer={(transfer) => {
          const resolvedItems = transfer.items.map((line) => {
            const item = centralStoreItems.find((entry) => entry.id === line.itemId);
            return item ? {
              itemId: item.id,
              itemName: item.name,
              itemCode: item.sku,
              category: item.category,
              unit: item.unit,
              quantity: line.quantity,
              availableStock: line.availableStock,
            } : null;
          });
          if (resolvedItems.some((line) => !line)) return toast.error('Selected inventory item is unavailable');
          createInventoryApproval({
            approvalType: 'stock-transfer',
            title: `Stock Transfer · ${transfer.transferSlipNumber}`,
            preparedBy: transfer.preparedBy,
            preparedById: transfer.preparedById,
            approverId: transfer.approverId,
            approverName: transfer.approvedBy,
            approverDesignation: transfer.approverDesignation,
            transfer: {
              transferSlipNumber: transfer.transferSlipNumber,
              transferDate: transfer.transferDate,
              sourceStore: transfer.source,
              destinationStore: transfer.destination,
              expectedArrival: transfer.expectedArrival,
              items: resolvedItems.filter((line): line is NonNullable<typeof line> => !!line),
              vehicleId: transfer.vehicleId,
              vehicleNumber: transfer.vehicleNumber,
              vehicleType: transfer.vehicleType,
              vehicleMake: transfer.vehicleMake,
              vehicleModel: transfer.vehicleModel,
              driverName: transfer.driverName,
              driverContact: transfer.driverContact,
              remarks: transfer.remarks,
              creationDate: transfer.creationDate,
              storeManagerSignature: transfer.storeManagerSignature,
            },
          });
          setTransferStockOpen(false);
          setTransferPrefill(null);
          setCentralStoreView('transfers');
          setSearch('');
          toast.success(`${transfer.transferSlipNumber} submitted to ${transfer.approvedBy} for approval`);
        }}
      />

      <TransferSlipDialog
        record={selectedTransfer}
        onClose={() => setSelectedTransferId(null)}
        onReply={(questionId, reply) => {
          if (!selectedTransfer) return;
          updateInventoryApproval(selectedTransfer.id, {
            questions: (selectedTransfer.questions ?? []).map((entry) => (
              entry.id === questionId
                ? {
                  ...entry,
                  reply,
                  repliedAt: new Date().toISOString(),
                  repliedBy: user?.name || user?.username || selectedTransfer.preparedBy,
                }
                : entry
            )),
          });
          toast.success('Reply sent to the approver');
        }}
      />

      <IssueSlipDirectoryDialog
        open={issueSlipDirectoryOpen}
        onOpenChange={setIssueSlipDirectoryOpen}
        loading={issueSlipsLoading}
        groupedByDate={issueSlipsByDate}
        selectedSlip={selectedIssueSlip}
        onSelectSlip={setSelectedIssueSlipId}
      />

      <ItemInformationDialog
        item={informationItem}
        onClose={() => setInformationItem(null)}
        onEdit={() => {
          if (!informationItem) return;
          setEditItem(informationItem);
          setInformationItem(null);
        }}
      />

      {/* Edit Item */}
      {editItem && (
        <EditItemModal
          item={editItem}
          inventoryGroups={masterConfig.inventoryGroups}
          categories={masterConfig.categories}
          categoryGroups={masterConfig.categoryGroups}
          subCategories={masterConfig.subCategories}
          expenseClassifications={masterConfig.expenseClassifications}
          inventoryClassifications={masterConfig.inventoryClassifications}
          issueClassifications={masterConfig.issueClassifications}
          units={availableUnits}
          locations={availableStores}
          onClose={() => setEditItem(null)}
          onSave={(updated) => {
            saveInventoryItemMetadata(updated);
            setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
            setEditItem(null);
            toast.success('Item updated');
          }}
        />
      )}

      {/* Update Stock (manual adjustment) */}
      {updateStockItem && (
        <TransactionModal
          title="Update Stock (Adjustment)"
          item={updateStockItem}
          txType="adjustment"
          description="Manually correct the current stock level."
          qtyLabel="Adjustment Qty (+/-)"
          onClose={() => setUpdateStockItem(null)}
          onSave={(tx) => {
            addTransaction(updateStockItem.id, tx);
            setUpdateStockItem(null);
            toast.success('Stock adjusted');
          }}
        />
      )}

      {/* Ledger */}
      {ledgerItem && (
        <LedgerModal item={ledgerItem} onClose={() => setLedgerItem(null)} />
      )}

      <RequestStockModal
        open={requestStockOpen}
        onClose={() => setRequestStockOpen(false)}
        selectedItems={requestStockItems}
        onChangeSelectedItems={setRequestStockItems}
        allItems={items}
        onContinue={() => {
          const payloadItems = requestStockItems.map((it) => ({
            itemCode: it.sku,
            uom: it.unit,
            itemName: it.name,
            category: it.category,
            specification: it.description,
            stock: it.currentStock,
          }));
          setRequestStockOpen(false);
          navigate('/inventory-indents', {
            state: {
              fromInventoryRequest: true,
              items: payloadItems,
            },
          });
        }}
      />

      <EquipmentAllocationModal
        open={allocationOpen}
        items={items}
        focusedItem={allocationItem}
        onAllocationSuccess={(itemId, quantity) => {
          setItems((prev) =>
            prev.map((stockItem) =>
              stockItem.id === itemId
                ? { ...stockItem, currentStock: Math.max(0, stockItem.currentStock - quantity) }
                : stockItem,
            ),
          );
        }}
        onClose={() => {
          setAllocationOpen(false);
          setAllocationItem(null);
        }}
      />

      {issueStockItem && (
        <IssueStockModal
          item={issueStockItem}
          onClose={() => setIssueStockItem(null)}
          onAllocated={() => {
            setIssueStockItem(null);
          }}
        />
      )}

      {/* Incoming Request */}
      {incomingItem && (
        <TransactionModal
          title="Incoming Stock"
          item={incomingItem}
          txType="incoming"
          description="Record stock received from a supplier or transfer."
          qtyLabel="Quantity Received"
          onClose={() => setIncomingItem(null)}
          onSave={(tx) => {
            addTransaction(incomingItem.id, tx);
            setIncomingItem(null);
            toast.success('Incoming stock recorded');
          }}
        />
      )}

      {/* Outgoing Stock */}
      {outgoingItem && (
        <TransactionModal
          title="Outgoing Stock"
          item={outgoingItem}
          txType="outgoing"
          description="Record stock dispatched or transferred out."
          qtyLabel="Quantity Dispatched"
          onClose={() => setOutgoingItem(null)}
          onSave={(tx) => {
            addTransaction(outgoingItem.id, tx);
            setOutgoingItem(null);
            toast.success('Outgoing stock recorded');
          }}
        />
      )}

      {/* Return Entry */}
      {returnEntryItem && (
        <ReturnEntryModal
          item={returnEntryItem}
          onClose={() => setReturnEntryItem(null)}
        />
      )}

      {/* Damage Entry */}
      {damageItem && (
        <DamageEntryModal
          item={damageItem}
          onClose={() => setDamageItem(null)}
        />
      )}

      {/* Issued Stock */}
      {issuedItem && (
        <TransactionModal
          title="Issue Stock"
          item={issuedItem}
          txType="issued"
          description="Issue stock to a team or field operation."
          qtyLabel="Quantity Issued"
          onClose={() => setIssuedItem(null)}
          onSave={(tx) => {
            addTransaction(issuedItem.id, tx);
            setIssuedItem(null);
            toast.success('Stock issued');
          }}
        />
      )}

      {/* History */}
      {historyItem && (
        <HistoryModal
          item={historyItem}
          filterType={historyFilter}
          onClose={() => { setHistoryItem(null); setHistoryFilter('all'); }}
        />
      )}

      {/* Delete Confirm */}
      {deleteItem && (
        <DeleteConfirmModal
          item={deleteItem}
          onClose={() => setDeleteItem(null)}
          onConfirm={() => {
            setItems((prev) => prev.filter((i) => i.id !== deleteItem.id));
            setDeleteItem(null);
            toast.success(`"${deleteItem.name}" removed from inventory`);
          }}
        />
      )}

      <Dialog open={inventoryReportPeriodOpen} onOpenChange={setInventoryReportPeriodOpen}>
        <DialogContent className="overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-2xl sm:max-w-lg">
          <DialogHeader className="bg-[#0D3A35] px-6 py-5 text-left">
            <DialogTitle className="flex items-center gap-3 text-xl font-bold text-white">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Printer className="h-5 w-5" />
              </span>
              Select Statement Period
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-white/75">
              Choose the period for the item-wise inventory report.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 px-6 py-6 sm:grid-cols-2">
            <Field label="From Date *">
              <Input
                type="date"
                value={inventoryReportFrom}
                max={inventoryReportTo || undefined}
                onChange={(event) => setInventoryReportFrom(event.target.value)}
                className="h-11 rounded-xl border-slate-200 bg-[#fbfaf7]"
              />
            </Field>
            <Field label="To Date *">
              <Input
                type="date"
                value={inventoryReportTo}
                min={inventoryReportFrom || undefined}
                onChange={(event) => setInventoryReportTo(event.target.value)}
                className="h-11 rounded-xl border-slate-200 bg-[#fbfaf7]"
              />
            </Field>
          </div>

          <DialogFooter className="border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setInventoryReportPeriodOpen(false)}
              className="h-10 rounded-xl border-slate-200 bg-white px-5 font-bold text-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={printInventoryReport}
              className="h-10 gap-2 rounded-xl bg-[#0D3A35] px-5 font-bold text-white hover:bg-[#092e2a]"
            >
              <Printer className="h-4 w-4" />
              Continue to Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issued Items */}
      <IssuedItemsModal
        open={issuedItemsOpen}
        items={items}
        onClose={() => setIssuedItemsOpen(false)}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// LEDGER MODAL
// ─────────────────────────────────────────────────────────────
type LedgerEntry = {
  quantity: number;
  date: string;
  lock_status?: string;
  input_id: string;
  per_unit_cost: number;
  output: number;
  returned?: number;
  input: number;
  amount: number;
  balance?: number;
  equipment_id: string;
  description: string;
  stock_issue_method?: string;
  stockIssueMethod?: string;
  issue_method?: string;
  method_used?: string;
  transaction_type?: string;
  batch_number?: string;
  batch_no?: string;
  manufacturing_date?: string;
  mfg_date?: string;
  expiry_date?: string;
  expiration_date?: string;
  supplier?: string;
  supplier_name?: string;
  storage_location?: string;
  running_stock_value?: number;
};

const LedgerModal = ({ item, onClose }: { item: StockItem; onClose: () => void }) => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [printPeriodOpen, setPrintPeriodOpen] = useState(false);
  const [printPeriodFrom, setPrintPeriodFrom] = useState('');
  const [printPeriodTo, setPrintPeriodTo] = useState('');

  useEffect(() => {
    const fetchLedger = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${BASE_URL}/inventory/get_item_ledger/${item.id}`);
        const data: any = await res.json().catch(() => null);
        if (!res.ok || !data?.success || !Array.isArray(data?.ledger)) {
          throw new Error(data?.message || 'Failed to fetch ledger');
        }
        setEntries(data.ledger);
      } catch (e: any) {
        setError(e?.message || 'Failed to fetch ledger');
      } finally {
        setLoading(false);
      }
    };
    fetchLedger();
  }, [item.id]);

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return iso; }
  };

  const orderedEntries = useMemo(
    () => entries
      .map((entry, originalIndex) => ({ entry, originalIndex }))
      .sort((first, second) => {
        const firstTime = new Date(first.entry.date).getTime();
        const secondTime = new Date(second.entry.date).getTime();
        if (Number.isNaN(firstTime) || Number.isNaN(secondTime)) return first.originalIndex - second.originalIndex;
        return firstTime - secondTime || first.originalIndex - second.originalIndex;
      })
      .map(({ entry }) => entry),
    [entries],
  );

  const isReturnEntry = (entry: LedgerEntry) => (
    Number(entry.returned) > 0 || /\breturn(?:ed)?\b/i.test(entry.description || '')
  );

  const getParticulars = (e: LedgerEntry) => {
    if (isReturnEntry(e)) return 'Stock Returned';
    if (e.input > 0) return 'Goods Received';
    if (e.output > 0) return 'Stock Issued';
    return 'Stock Adjustment';
  };
  const getTransactionType = (entry: LedgerEntry) => {
    if (entry.transaction_type) return entry.transaction_type;
    if (isReturnEntry(entry)) return 'Stock Return';
    if (entry.input > 0) return 'Receipt';
    if (entry.output > 0) return 'Issue';
    return 'Adjustment';
  };
  const getBatchNumber = (entry: LedgerEntry) => (
    entry.batch_number || entry.batch_no || item.batchNumber || 'Not Recorded'
  );

  const getVoucherNo = (e: LedgerEntry, idx: number) => {
    const sourceIndex = entries.indexOf(e);
    const n = String((sourceIndex >= 0 ? sourceIndex : idx) + 1).padStart(3, '0');
    if (isReturnEntry(e)) return `SRN-${n}`;
    if (e.input > 0)  return `GRN-${n}`;
    if (e.output > 0) return `ISS-${n}`;
    return `ADJ-${n}`;
  };

  const fifoStock = (item.fifoList ?? []).reduce((sum, batch) => sum + batch.stock, 0);
  const fifoValue = (item.fifoList ?? []).reduce(
    (sum, batch) => sum + batch.stock * batch.per_unit_cost,
    0,
  );
  const getEntryRate = (entry: LedgerEntry) => {
    if (entry.per_unit_cost > 0) return entry.per_unit_cost;
    const movedQuantity = entry.input || entry.output || entry.quantity || 0;
    return movedQuantity > 0 ? entry.amount / movedQuantity : 0;
  };
  const getTransactionValue = (entry: LedgerEntry) => {
    const movementQuantity = entry.input || entry.output || entry.quantity || 0;
    const rate = getEntryRate(entry);
    return movementQuantity > 0 && rate > 0 ? movementQuantity * rate : entry.amount;
  };
  const getRunningStockValue = (entry: LedgerEntry) => {
    if (Number(entry.running_stock_value) > 0) return Number(entry.running_stock_value);
    return (entry.balance ?? 0) * (getEntryRate(entry) || weightedAverageRate);
  };
  const getOpeningBalance = (entry: LedgerEntry) => (
    entry.balance != null ? entry.balance - entry.input + entry.output : undefined
  );
  const totalReceived = orderedEntries.reduce((sum, entry) => sum + entry.input, 0);
  const totalIssued = orderedEntries.reduce((sum, entry) => sum + entry.output, 0);
  const totalReceivedValue = orderedEntries.reduce(
    (sum, entry) => sum + (entry.input > 0 ? entry.input * getEntryRate(entry) : 0),
    0,
  );
  const totalIssuedValue = orderedEntries.reduce(
    (sum, entry) => sum + (entry.output > 0 ? entry.output * getEntryRate(entry) : 0),
    0,
  );
  const latestEntry = orderedEntries[orderedEntries.length - 1];
  const weightedAverageRate = fifoStock > 0
    ? fifoValue / fifoStock
    : totalReceived > 0
      ? totalReceivedValue / totalReceived
      : latestEntry
        ? getEntryRate(latestEntry)
        : 0;
  const closingValue = fifoValue > 0
    ? fifoValue
    : item.currentStock * weightedAverageRate;
  const openingQuantity = orderedEntries.length > 0
    ? getOpeningBalance(orderedEntries[0]) ?? 0
    : item.currentStock;
  const openingRate = orderedEntries.length > 0
    ? getEntryRate(orderedEntries[0]) || weightedAverageRate
    : weightedAverageRate;
  const openingValue = openingQuantity * openingRate;
  const netMovement = totalReceived - totalIssued;
  const stockIssueMethodCode = getStockIssueMethodLabel(item.stockIssueMethod).split(',')[0];
  const latestBatch = (item.fifoList ?? []).find((batch) => (
    batch.batch_number || batch.manufacturing_date || batch.expiry_date
  ));
  const itemBatchNumber = item.batchNumber
    || latestEntry?.batch_number
    || latestEntry?.batch_no
    || latestBatch?.batch_number
    || 'Not Recorded';
  const manufacturingDate = item.manufacturingDate
    || latestEntry?.manufacturing_date
    || latestEntry?.mfg_date
    || latestBatch?.manufacturing_date
    || '';
  const expiryDate = item.expiryDate
    || latestEntry?.expiry_date
    || latestEntry?.expiration_date
    || latestBatch?.expiry_date
    || '';
  const supplierName = item.supplier
    || latestEntry?.supplier
    || latestEntry?.supplier_name
    || latestBatch?.supplier
    || item.vendors?.[0]?.company
    || 'Not Recorded';
  const storageLocation = item.storageLocation
    || latestEntry?.storage_location
    || latestBatch?.storage_location
    || item.shelf
    || item.location
    || 'Not Recorded';
  const batchTrackingEnabled = item.batchTracking ?? itemBatchNumber !== 'Not Recorded';
  const expiryTrackingEnabled = item.expiryTracking ?? Boolean(expiryDate);
  const expiryTime = expiryDate ? new Date(expiryDate).getTime() : Number.NaN;
  const daysToExpiry = Number.isNaN(expiryTime)
    ? null
    : Math.ceil((expiryTime - Date.now()) / 86_400_000);
  const expiryStatus = daysToExpiry == null
    ? 'Not Recorded'
    : daysToExpiry < 0
      ? 'Expired'
      : daysToExpiry <= 30
        ? 'Expiring Soon'
        : 'Valid';
  const stockStatus = item.currentStock <= 0
    ? 'Out of Stock'
    : item.currentStock < item.minStock
      ? 'Low Stock'
      : 'Available';
  const showControlledInputDetails = /seed|pesticide|chemical/i.test(item.category);
  const firstTransactionDate = orderedEntries[0]?.date;
  const latestTransactionDate = orderedEntries[orderedEntries.length - 1]?.date;
  const statementStartDate = firstTransactionDate
    ? (() => {
      const date = new Date(firstTransactionDate);
      if (Number.isNaN(date.getTime())) return firstTransactionDate;
      date.setDate(1);
      return date.toISOString();
    })()
    : '';
  const statementPeriod = latestTransactionDate
    ? `${fmtDate(statementStartDate)} to ${fmtDate(latestTransactionDate)}`
    : '—';
  const formatCurrency = (value: number) => `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
  const toDateInputValue = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  };
  const openPrintPeriodDialog = () => {
    setPrintPeriodFrom(toDateInputValue(statementStartDate));
    setPrintPeriodTo(toDateInputValue(latestTransactionDate));
    setPrintPeriodOpen(true);
  };
  const printLedger = () => {
    if (!printPeriodFrom || !printPeriodTo) {
      toast.error('Select the statement start and end dates');
      return;
    }
    const selectedStart = new Date(`${printPeriodFrom}T00:00:00`);
    const selectedEnd = new Date(`${printPeriodTo}T23:59:59.999`);
    if (selectedStart > selectedEnd) {
      toast.error('Statement start date cannot be after the end date');
      return;
    }
    const printEntries = orderedEntries.filter((entry) => {
      const transactionDate = new Date(entry.date);
      return !Number.isNaN(transactionDate.getTime())
        && transactionDate >= selectedStart
        && transactionDate <= selectedEnd;
    });
    if (printEntries.length === 0) {
      toast.error('There are no ledger entries to print');
      return;
    }
    const printStatementPeriod = `${fmtDate(printPeriodFrom)} to ${fmtDate(printPeriodTo)}`;
    const printTotalReceived = printEntries.reduce((sum, entry) => sum + entry.input, 0);
    const printTotalIssued = printEntries.reduce((sum, entry) => sum + entry.output, 0);
    const printReceivedValue = printEntries.reduce(
      (sum, entry) => sum + (entry.input > 0 ? entry.input * getEntryRate(entry) : 0),
      0,
    );
    const printIssuedValue = printEntries.reduce(
      (sum, entry) => sum + (entry.output > 0 ? entry.output * getEntryRate(entry) : 0),
      0,
    );
    const printOpeningQuantity = getOpeningBalance(printEntries[0]) ?? 0;
    const printOpeningRate = getEntryRate(printEntries[0]) || weightedAverageRate;
    const printOpeningValue = printOpeningQuantity * printOpeningRate;
    const printClosingQuantity = printEntries[printEntries.length - 1]?.balance ?? item.currentStock;
    const printClosingValue = printClosingQuantity * weightedAverageRate;
    const printLastTransactionDate = printEntries[printEntries.length - 1]?.date;
    const printNetMovement = printTotalReceived - printTotalIssued;
    const generatedBy = user?.name || user?.username || 'System User';
    const reportCode = (item.sku || item.id || 'ITEM')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toUpperCase();
    const reportId = `STL-${reportCode}-${printPeriodTo.replace(/-/g, '')}`;

    const popup = window.open('', '_blank', 'width=1200,height=900');
    if (!popup) {
      toast.error('Pop-up blocked. Please allow pop-ups to print.');
      return;
    }

    const escapePrintHtml = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    const logoUrl = new URL(logo3f, window.location.origin).href;
    const detail = (label: string, value: unknown) =>
      `<div class="detail"><span>${escapePrintHtml(label)}</span><strong>${escapePrintHtml(value || '—')}</strong></div>`;
    const controlledInputDetails = showControlledInputDetails ? `
      ${detail('Batch Number', itemBatchNumber)}
      ${detail('Manufacturing Date', manufacturingDate ? fmtDate(manufacturingDate) : 'Not Recorded')}
      ${detail('Expiry Date', expiryDate ? fmtDate(expiryDate) : 'Not Recorded')}
      ${detail('Days to Expiry', daysToExpiry == null ? 'Not Recorded' : `${daysToExpiry} days`)}
      ${detail('Expiry Status', expiryStatus)}
      ${detail('Supplier', supplierName)}
      ${detail('Storage Location', storageLocation)}
    ` : '';
    const openingBalanceRow = `
      <tr class="opening-row">
        <td>${escapePrintHtml(fmtDate(printPeriodFrom))}</td>
        <td>OPENING</td>
        <td>Opening Balance</td>
        <td>Balance brought forward</td>
        <td>—</td>
        <td class="center">${escapePrintHtml(item.unit)}</td>
        <td class="num">${printOpeningRate > 0 ? escapePrintHtml(formatCurrency(printOpeningRate)) : 'N/A'}</td>
        <td class="num">${printOpeningQuantity.toLocaleString('en-IN')}</td>
        <td class="num">—</td>
        <td class="num">—</td>
        <td class="num">${printOpeningQuantity.toLocaleString('en-IN')}</td>
        <td class="num">${escapePrintHtml(formatCurrency(printOpeningValue))}</td>
        <td class="num">${escapePrintHtml(formatCurrency(printOpeningValue))}</td>
      </tr>
    `;
    const transactionRows = printEntries.map((entry, index) => `
      <tr>
        <td>${escapePrintHtml(fmtDate(entry.date))}</td>
        <td>${escapePrintHtml(getVoucherNo(entry, index))}</td>
        <td>${escapePrintHtml(getTransactionType(entry))}</td>
        <td><strong>${escapePrintHtml(getParticulars(entry))}</strong><small>${escapePrintHtml(entry.description || '')}</small></td>
        <td>${escapePrintHtml(getBatchNumber(entry))}</td>
        <td class="center">${escapePrintHtml(item.unit)}</td>
        <td class="num">${getEntryRate(entry) > 0 ? escapePrintHtml(formatCurrency(getEntryRate(entry))) : 'N/A'}</td>
        <td class="num">${getOpeningBalance(entry) != null ? getOpeningBalance(entry)!.toLocaleString('en-IN') : '—'}</td>
        <td class="num">${entry.input > 0 ? entry.input.toLocaleString('en-IN') : '—'}</td>
        <td class="num">${entry.output > 0 ? entry.output.toLocaleString('en-IN') : '—'}</td>
        <td class="num">${entry.balance != null ? entry.balance.toLocaleString('en-IN') : '—'}</td>
        <td class="num">${escapePrintHtml(formatCurrency(getTransactionValue(entry)))}</td>
        <td class="num">${escapePrintHtml(formatCurrency(getRunningStockValue(entry)))}</td>
      </tr>
    `).join('');
    const ledgerRows = `${openingBalanceRow}${transactionRows}`;

    popup.document.write(`<!DOCTYPE html><html><head>
      <title>Generated by: ${escapePrintHtml(generatedBy)} · Report ID: ${escapePrintHtml(reportId)}</title>
      <style>
        @page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}
        body{margin:0;font-family:Arial,sans-serif;color:#18212f;background:#fff;font-size:9px}
        .sheet{width:190mm;min-height:277mm;border:1px solid #b8c5d1;padding:12px;margin:0 auto}
        .header{text-align:center;border-bottom:2px solid #0D3A35;padding-bottom:10px}
        .header img{height:54px;width:auto}.company{font-size:17px;font-weight:900;letter-spacing:.04em;margin-top:3px}
        .address{font-size:9px;color:#526173;line-height:1.45;margin:3px auto 0;max-width:760px}
        .company-meta{font-size:8.5px;color:#526173;margin-top:3px}
        .title{background:#0D3A35;color:#fff;text-align:center;font-size:13px;font-weight:900;letter-spacing:.14em;padding:7px;margin-top:10px}
        .meta{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid #cbd5e1;border-top:0}
        .meta>div{padding:7px 9px;border-right:1px solid #cbd5e1}.meta>div:last-child{border-right:0}
        .label{font-size:8px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700}
        .value{font-size:10px;font-weight:800;margin-top:3px}
        .section{border:1px solid #cbd5e1;margin-top:9px;break-inside:avoid}
        .section-title{background:#f1f5f9;border-bottom:1px solid #cbd5e1;padding:5px 8px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#334155}
        .grid{display:grid;grid-template-columns:1fr 1fr 1fr}
        .detail{display:flex;gap:8px;justify-content:space-between;padding:6px 8px;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0}
        .detail span{color:#64748b;font-weight:700}.detail strong{text-align:right}
        table{width:100%;border-collapse:collapse;table-layout:fixed}
        thead{display:table-header-group}tr{break-inside:avoid}
        th,td{border:1px solid #cbd5e1;padding:4px 2.5px;text-align:left;vertical-align:middle;overflow-wrap:anywhere}
        th{background:#0D3A35;color:#fff;font-size:6px;text-transform:uppercase;font-weight:normal;letter-spacing:.01em}
        thead th{text-align:center!important}
        td{font-size:6.4px;font-weight:normal;color:#334155}td small{display:block;color:#64748b;margin-top:2px;line-height:1.2}
        td strong{font-weight:700;color:#1e293b}.num{text-align:right}.center{text-align:center}
        .opening-row td{background:#f8fafc}
        .summary-table th{width:25%;background:#f8fafc;color:#64748b;font-size:6.5px;font-weight:700;letter-spacing:.04em;padding:6px;text-align:left!important}
        .summary-table td{width:25%;background:#fff;color:#0f172a;font-size:8px;font-weight:700;padding:6px;text-align:right}
        @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.sheet{border-color:#b8c5d1}}
      </style></head><body><div class="sheet">
        <div class="header">
          <img src="${logoUrl}" alt="Sai Bioresources"/>
          <div class="company">SAI BIORESOURCES PRIVATE LIMITED</div>
          <div class="address">Khasra No. 121/1, Amrit Dairy Farm, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh - 491001</div>
          <div class="company-meta">GSTIN: 22ARPCS5442R1ZM &nbsp;|&nbsp; Phone: +91 75870 76870 &nbsp;|&nbsp; Email: rajendra.s@saiobioenergy.com</div>
        </div>
        <div class="title">ITEM STOCK LEDGER</div>
        <div class="meta">
          <div><div class="label">Item Code</div><div class="value">${escapePrintHtml(item.sku || item.id || '—')}</div></div>
          <div><div class="label">Item Category</div><div class="value">${escapePrintHtml(item.category || '—')}</div></div>
          <div><div class="label">Store / Warehouse</div><div class="value">${escapePrintHtml(item.location || '—')}</div></div>
          <div><div class="label">Statement Period</div><div class="value">${escapePrintHtml(printStatementPeriod)}</div></div>
          <div><div class="label">Stock Issue Method</div><div class="value">${escapePrintHtml(stockIssueMethodCode)}</div></div>
        </div>
        <div class="section">
          <div class="section-title">Stock Item Details</div>
          <div class="grid">
            ${detail('Item Name', item.name)}
            ${detail('Unit of Measure', item.unit)}
            ${detail('Opening Stock Qty.', `${printOpeningQuantity.toLocaleString('en-IN')} ${item.unit}`)}
            ${detail('Opening Stock Value', formatCurrency(printOpeningValue))}
            ${detail('Current Unit Rate', (weightedAverageRate || printOpeningRate) > 0 ? formatCurrency(weightedAverageRate || printOpeningRate) : 'N/A')}
            ${detail('Closing Stock Qty.', `${printClosingQuantity.toLocaleString('en-IN')} ${item.unit}`)}
            ${detail('Closing Stock Value', formatCurrency(printClosingValue))}
            ${detail('Batch Tracking', batchTrackingEnabled ? 'Enabled' : 'Disabled')}
            ${detail('Expiry Tracking', expiryTrackingEnabled ? 'Enabled' : 'Disabled')}
            ${detail('Stock Status', stockStatus)}
            ${detail('Last Transaction Date', printLastTransactionDate ? fmtDate(printLastTransactionDate) : 'Not Recorded')}
            ${controlledInputDetails}
          </div>
        </div>
        <div class="section">
          <div class="section-title">Ledger Transactions</div>
          <table>
            <colgroup>
              <col style="width:6%"><col style="width:6%"><col style="width:7%"><col style="width:14%">
              <col style="width:7%"><col style="width:4%"><col style="width:7%"><col style="width:7%">
              <col style="width:6%"><col style="width:6%"><col style="width:7%"><col style="width:10%">
              <col style="width:13%">
            </colgroup>
            <thead><tr>
              <th>Date</th><th>Voucher</th><th>Transaction Type</th><th>Particulars</th><th>Batch No.</th>
              <th class="center">Unit</th><th class="num">Unit Rate</th>
              <th>Opening Qty.</th><th>Receipt Qty.</th><th>Issue Qty.</th><th>Closing Qty.</th>
              <th class="num">Transaction Value</th><th class="num">Running Stock Value</th>
            </tr></thead>
            <tbody>${ledgerRows}</tbody>
          </table>
        </div>
        <div class="section">
          <div class="section-title">Ledger Summary</div>
          <table class="summary-table">
            <tbody>
              <tr><th>Opening Stock Qty.</th><td>${printOpeningQuantity.toLocaleString('en-IN')} ${escapePrintHtml(item.unit)}</td><th>Opening Stock Value</th><td>${escapePrintHtml(formatCurrency(printOpeningValue))}</td></tr>
              <tr><th>Total Received Qty.</th><td>${printTotalReceived.toLocaleString('en-IN')} ${escapePrintHtml(item.unit)}</td><th>Received Value</th><td>${escapePrintHtml(formatCurrency(printReceivedValue))}</td></tr>
              <tr><th>Total Issued Qty.</th><td>${printTotalIssued.toLocaleString('en-IN')} ${escapePrintHtml(item.unit)}</td><th>Issued Value</th><td>${escapePrintHtml(formatCurrency(printIssuedValue))}</td></tr>
              <tr><th>Net Movement</th><td>${printNetMovement.toLocaleString('en-IN')} ${escapePrintHtml(item.unit)}</td><th>Average / Closing Rate</th><td>${escapePrintHtml(formatCurrency(weightedAverageRate || printOpeningRate))}</td></tr>
              <tr><th>Closing Stock Qty.</th><td>${printClosingQuantity.toLocaleString('en-IN')} ${escapePrintHtml(item.unit)}</td><th>Closing Stock Value</th><td>${escapePrintHtml(formatCurrency(printClosingValue))}</td></tr>
            </tbody>
          </table>
        </div>
      </div></body></html>`);
    popup.document.close();
    setPrintPeriodOpen(false);
    popup.focus();
    setTimeout(() => {
      popup.print();
      popup.close();
    }, 450);
  };

  return (
    <>
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-7xl flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-slate-50 p-0 shadow-[0_28px_80px_rgba(13,58,53,0.30)]">
        <DialogHeader className="relative shrink-0 bg-[#0D3A35] px-6 py-5 text-white">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close stock ledger"
            className="absolute right-5 top-5 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex flex-col gap-4 pr-12 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black text-white">Item Stock Ledger</DialogTitle>
                <p className="mt-1 text-xs font-medium text-white/65">Chronological stock movement and valuation history</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5">
                <p className="text-sm font-black text-white">{item.name}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-white/60">
                  {item.sku || item.id || 'No item code'} · {item.unit} · {item.location || 'No store'}
                </p>
              </div>
              <button
                type="button"
                onClick={openPrintPeriodDialog}
                disabled={loading || entries.length === 0}
                className="flex h-11 items-center gap-2 rounded-xl border border-white/25 bg-white px-4 text-xs font-black text-[#0D3A35] shadow-sm transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                Print Ledger
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="grid shrink-0 grid-cols-5 border-b border-[#0D3A35]/10 bg-white">
          {[
            ['Item Code', item.sku || item.id || 'N/A'],
            ['Item Category', item.category || 'N/A'],
            ['Store / Warehouse', item.location || 'N/A'],
            ['Statement Period', statementPeriod],
            ['Stock Issue Method', stockIssueMethodCode],
          ].map(([label, value], index) => (
            <div
              key={label}
              className={cn(
                'min-w-0 px-4 py-3',
                index > 0 && 'border-l border-[#0D3A35]/10',
              )}
            >
              <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</p>
              <p className="mt-1 truncate text-xs font-bold text-slate-700" title={value}>{value}</p>
            </div>
          ))}
        </div>

        <div className="shrink-0 border-b border-[#0D3A35]/10 bg-[#0D3A35]/[0.035] p-4">
          <div className="overflow-hidden rounded-xl border border-[#0D3A35]/10 bg-white shadow-[0_8px_22px_rgba(13,58,53,0.04)]">
            <table className="w-full table-fixed border-collapse">
              <tbody>
                {[
                  ['Opening Stock Qty.', `${openingQuantity.toLocaleString('en-IN')} ${item.unit}`, 'Opening Stock Value', formatCurrency(openingValue)],
                  ['Total Received Qty.', `${totalReceived.toLocaleString('en-IN')} ${item.unit}`, 'Received Value', formatCurrency(totalReceivedValue)],
                  ['Total Issued Qty.', `${totalIssued.toLocaleString('en-IN')} ${item.unit}`, 'Issued Value', formatCurrency(totalIssuedValue)],
                  ['Net Movement', `${netMovement.toLocaleString('en-IN')} ${item.unit}`, 'Average / Closing Rate', formatCurrency(weightedAverageRate || openingRate)],
                  ['Closing Stock Qty.', `${item.currentStock.toLocaleString('en-IN')} ${item.unit}`, 'Closing Stock Value', formatCurrency(closingValue)],
                ].map(([firstLabel, firstValue, secondLabel, secondValue]) => (
                  <tr key={firstLabel} className="border-b border-slate-200 last:border-b-0">
                    <th className="border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wide text-slate-500">
                      {firstLabel}
                    </th>
                    <td className="border-r border-slate-200 px-3 py-2 text-right text-sm font-semibold text-slate-800">
                      {firstValue}
                    </td>
                    <th className="border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wide text-slate-500">
                      {secondLabel}
                    </th>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-slate-800">
                      {secondValue}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-white">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-24 text-sm font-semibold text-slate-400">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#0D3A35] border-t-transparent" />
              Loading ledger…
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 py-24 text-red-500">
              <AlertTriangle className="h-8 w-8 opacity-50" />
              <p className="text-sm font-bold">{error}</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <ClipboardList className="mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm font-bold">No ledger entries yet</p>
              <p className="mt-1 text-xs">Entries will appear here once stock is received or issued.</p>
            </div>
          ) : (
            <table className="w-full min-w-[1880px] border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-white/10 bg-[#0D3A35] text-white">
                  <th className="min-w-[110px] px-4 py-3 text-center text-[10px] font-normal uppercase tracking-wide text-white/75">Date</th>
                  <th className="min-w-[105px] px-4 py-3 text-center text-[10px] font-normal uppercase tracking-wide text-white/75">Voucher</th>
                  <th className="min-w-[130px] px-4 py-3 text-center text-[10px] font-normal uppercase tracking-wide text-white/75">Transaction Type</th>
                  <th className="min-w-[240px] px-4 py-3 text-center text-[10px] font-normal uppercase tracking-wide text-white/75">Particulars</th>
                  <th className="min-w-[125px] px-4 py-3 text-center text-[10px] font-normal uppercase tracking-wide text-white/75">Batch No.</th>
                  <th className="min-w-[70px] px-4 py-3 text-center text-[10px] font-normal uppercase tracking-wide text-white/75">Unit</th>
                  <th className="min-w-[115px] px-4 py-3 text-center text-[10px] font-normal uppercase tracking-wide text-white/75">Unit Rate</th>
                  <th className="min-w-[120px] px-4 py-3 text-center text-[10px] font-normal uppercase tracking-wide text-white/75">Opening Qty.</th>
                  <th className="min-w-[115px] px-4 py-3 text-center text-[10px] font-normal uppercase tracking-wide text-white/75">Receipt Qty.</th>
                  <th className="min-w-[105px] px-4 py-3 text-center text-[10px] font-normal uppercase tracking-wide text-white/75">Issue Qty.</th>
                  <th className="min-w-[110px] px-4 py-3 text-center text-[10px] font-normal uppercase tracking-wide text-white/75">Closing Qty.</th>
                  <th className="min-w-[140px] px-4 py-3 text-center text-[10px] font-normal uppercase tracking-wide text-white/75">Transaction Value</th>
                  <th className="min-w-[155px] px-4 py-3 text-center text-[10px] font-normal uppercase tracking-wide text-white/75">Running Stock Value</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-200 bg-slate-50/90">
                  <td className="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-slate-500">
                    {fmtDate(statementStartDate)}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs font-medium text-slate-700">OPENING</span>
                  </td>
                  <td className="px-4 py-3.5 text-xs font-semibold text-slate-700">Opening Balance</td>
                  <td className="max-w-[240px] px-4 py-3.5">
                    <p className="text-sm font-medium text-slate-800">Balance brought forward</p>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-400">—</td>
                  <td className="px-4 py-3.5 text-center text-xs font-medium text-slate-600">{item.unit}</td>
                  <td className="px-4 py-3.5 text-right text-sm font-medium text-slate-700">
                    {openingRate > 0 ? formatCurrency(openingRate) : 'N/A'}
                  </td>
                  <td className="px-4 py-3.5 text-right text-sm font-medium text-slate-700">
                    {openingQuantity.toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3.5 text-right text-sm text-slate-300">—</td>
                  <td className="px-4 py-3.5 text-right text-sm text-slate-300">—</td>
                  <td className="px-4 py-3.5 text-right text-sm font-medium text-slate-700">
                    {openingQuantity.toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3.5 text-right text-sm font-medium text-slate-700">
                    {formatCurrency(openingValue)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-sm font-medium text-slate-700">
                    {formatCurrency(openingValue)}
                  </td>
                </tr>
                {orderedEntries.map((entry, idx) => (
                  <tr key={`${entry.input_id}-${idx}`} className="border-b border-slate-100 transition-colors hover:bg-[#0D3A35]/[0.035]">
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-slate-500">{fmtDate(entry.date)}</td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-medium text-slate-700">{getVoucherNo(entry, idx)}</span>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-medium text-slate-700">
                      {getTransactionType(entry)}
                    </td>
                    <td className="max-w-[240px] px-4 py-3.5">
                      <p className="text-sm font-medium text-slate-800">{getParticulars(entry)}</p>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-400" title={entry.description}>{entry.description}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-medium text-slate-600">{getBatchNumber(entry)}</td>
                    <td className="px-4 py-3.5 text-center text-xs font-medium text-slate-600">{item.unit}</td>
                    <td className="px-4 py-3.5 text-right text-sm font-medium text-slate-700">
                      {getEntryRate(entry) > 0 ? formatCurrency(getEntryRate(entry)) : 'N/A'}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm font-medium text-slate-700">
                      {getOpeningBalance(entry) != null
                        ? getOpeningBalance(entry)!.toLocaleString('en-IN')
                        : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {entry.input > 0
                        ? <span className="text-sm font-medium text-slate-700">{entry.input.toLocaleString('en-IN')}</span>
                        : <span className="text-sm text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {entry.output > 0
                        ? <span className="text-sm font-medium text-slate-700">{entry.output.toLocaleString('en-IN')}</span>
                        : <span className="text-sm text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {entry.balance != null
                        ? <span className="text-sm font-medium text-slate-700">{entry.balance.toLocaleString('en-IN')}</span>
                        : <span className="text-sm text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm font-medium text-slate-700">
                      {formatCurrency(getTransactionValue(entry))}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm font-medium text-slate-700">
                      {formatCurrency(getRunningStockValue(entry))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-[#0D3A35]/10 bg-slate-50 px-5 py-3 text-[11px] font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span><strong className="text-emerald-700">Received</strong> stock added</span>
            <span><strong className="text-red-600">Issued</strong> stock removed</span>
            <span><strong className="text-amber-700">Unit Rate</strong> applicable per-unit cost</span>
          </div>
          <span className="font-bold text-slate-500">Statement Period: {statementPeriod}</span>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={printPeriodOpen} onOpenChange={setPrintPeriodOpen}>
      <DialogContent className="max-w-md rounded-2xl border-0 bg-white p-0 shadow-[0_24px_70px_rgba(13,58,53,0.28)]">
        <DialogHeader className="rounded-t-2xl bg-[#0D3A35] px-6 py-5 text-white">
          <DialogTitle className="text-lg font-black text-white">Select Statement Period</DialogTitle>
          <p className="mt-1 text-xs font-medium text-white/65">
            Choose the transaction period to include in the printable ledger.
          </p>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 px-6 py-5">
          <Field label="From Date" required>
            <Input
              type="date"
              value={printPeriodFrom}
              onChange={(event) => setPrintPeriodFrom(event.target.value)}
              max={printPeriodTo || undefined}
            />
          </Field>
          <Field label="To Date" required>
            <Input
              type="date"
              value={printPeriodTo}
              onChange={(event) => setPrintPeriodTo(event.target.value)}
              min={printPeriodFrom || undefined}
            />
          </Field>
        </div>
        <DialogFooter className="border-t border-slate-100 bg-slate-50 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => setPrintPeriodOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={printLedger} className="bg-[#0D3A35] hover:bg-[#0D3A35]/90">
            <Printer className="mr-2 h-4 w-4" />
            Continue to Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// INVENTORY CARD
// ─────────────────────────────────────────────────────────────
const ItemInformationDialog = ({
  item,
  onClose,
  onEdit,
}: {
  item: StockItem | null;
  onClose: () => void;
  onEdit: () => void;
}) => {
  if (!item) return null;

  const locationParts = item.location.split(/\s+[–—-]\s+/).map((part) => part.trim()).filter(Boolean);
  const storeName = locationParts[0] || item.location || 'N/A';
  const shelfName = item.shelf || locationParts.slice(1).join(' – ') || 'N/A';
  const inventoryValue = (item.fifoList ?? []).reduce(
    (sum, entry) => sum + entry.stock * entry.per_unit_cost,
    0,
  );
  const stockIssueMethodOption = getStockIssueMethodOption(item.stockIssueMethod);
  const details = [
    ['Item Code', item.sku || 'N/A'],
    ['Series Number', item.seriesNumber || 'N/A'],
    ['Inventory Group', item.inventoryGroup || DEFAULT_CATEGORY_GROUPS[item.category] || 'N/A'],
    ['Category', item.category || 'N/A'],
    ['Subcategory', item.subCategory || 'N/A'],
    ['Expense Classification', item.expenseClassification || 'N/A'],
    ['Inventory Classification', item.inventoryClassification || 'N/A'],
    ['Issue Classification', item.issueClassification || 'N/A'],
    ['Stock Issue Method', getStockIssueMethodLabel(item.stockIssueMethod)],
    ['Unit of Measure', item.unit || 'N/A'],
    ['Packing Size', item.packingSize || 'N/A'],
    ['Store', storeName],
    ['Shelf', shelfName],
  ];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto rounded-2xl border-0 bg-slate-50 p-0 shadow-[0_28px_80px_rgba(13,58,53,0.28)]">
        <DialogHeader className="sticky top-0 z-10 border-b border-white/10 bg-[#0D3A35] px-6 py-5 text-white shadow-sm">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${item.name}`}
            title="Edit item"
            className="absolute right-16 top-5 z-20 flex h-9 items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 text-xs font-bold text-white shadow-sm transition hover:border-white/50 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D3A35]"
          >
            <Edit3 className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close item information"
            title="Close"
            className="absolute right-5 top-5 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white shadow-sm transition hover:border-white/50 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D3A35]"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-start gap-4 pr-32">
            <img
              src={item.imageUrl || PLACEHOLDER_IMG}
              alt={item.name}
              className="h-16 w-20 shrink-0 rounded-xl border-2 border-white/30 object-cover shadow-md"
              onError={(event) => {
                event.currentTarget.src = PLACEHOLDER_IMG;
              }}
            />
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge className="border border-white/20 bg-white/15 text-white hover:bg-white/15">
                  {item.category || 'Uncategorised'}
                </Badge>
                {item.currentStock < item.minStock && (
                  <Badge className="border border-red-300/40 bg-red-500/90 text-white hover:bg-red-500/90">
                    Low Stock
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-xl font-black text-white">{item.name}</DialogTitle>
              <p className="mt-1 text-xs font-semibold text-white/65">{item.sku || 'No item code'}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 bg-gradient-to-b from-[#0D3A35]/[0.035] to-transparent px-6 py-5">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Current Stock', `${item.currentStock.toLocaleString('en-IN')} ${item.unit}`],
              ['Pipeline Stock', `${(item.stockInPipeline ?? 0).toLocaleString('en-IN')} ${item.unit}`],
              ['Minimum Stock', `${item.minStock.toLocaleString('en-IN')} ${item.unit}`],
              ['Inventory Value', inventoryValue > 0
                ? `₹${inventoryValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                : 'N/A'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[#0D3A35]/10 bg-white p-4 shadow-[0_8px_24px_rgba(13,58,53,0.05)]">
                <p className="text-[10px] font-black uppercase tracking-wide text-[#0D3A35]/55">{label}</p>
                <p className="mt-1.5 break-words text-base font-black text-[#0D3A35]">{value}</p>
              </div>
            ))}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-black text-[#0D3A35]">Item Details</h3>
            <div className="grid overflow-hidden rounded-xl border border-[#0D3A35]/10 bg-white shadow-[0_8px_24px_rgba(13,58,53,0.04)] sm:grid-cols-2">
              {details.map(([label, value], index) => (
                <div
                  key={label}
                  className={cn(
                    'grid grid-cols-[44%_56%] border-slate-100',
                    index > 0 && 'border-t',
                    index === 1 && 'sm:border-t-0',
                    index % 2 === 0 && 'sm:border-r',
                  )}
                >
                  <div className="bg-[#0D3A35]/[0.045] px-3 py-3 text-[10px] font-black uppercase tracking-wide text-[#0D3A35]/60">
                    {label}
                  </div>
                  <div className="min-w-0 break-words px-3 py-3 text-xs font-bold text-slate-700">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-[#0D3A35]/10 bg-[#0D3A35]/5 p-4">
              <p className="text-[10px] font-black uppercase tracking-wide text-[#0D3A35]/60">Stock Issue Method</p>
              <p className="mt-1 text-sm font-black text-[#0D3A35]">
                {getStockIssueMethodLabel(item.stockIssueMethod)}
              </p>
              {stockIssueMethodOption ? (
                <>
                  <p className="mt-1 text-xs font-semibold text-slate-600">{stockIssueMethodOption.explanation}</p>
                  <p className="mt-1 text-[11px] font-medium text-slate-500">
                    <span className="font-bold text-slate-600">Example:</span> {stockIssueMethodOption.example}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs font-medium text-slate-500">No stock issue method has been recorded for this item.</p>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-black text-[#0D3A35]">Description</h3>
            <p className="rounded-xl border border-[#0D3A35]/10 bg-white p-4 text-sm font-medium leading-relaxed text-slate-600 shadow-[0_8px_24px_rgba(13,58,53,0.04)]">
              {item.description || 'No description has been added for this item.'}
            </p>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-black text-[#0D3A35]">FIFO Stock Batches</h3>
            {(item.fifoList?.length ?? 0) === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs font-semibold text-slate-400">
                No FIFO stock batches available.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#0D3A35]/10 bg-white shadow-[0_8px_24px_rgba(13,58,53,0.04)]">
                <table className="w-full min-w-[560px] text-left">
                  <thead className="bg-[#0D3A35] text-[10px] font-black uppercase tracking-wide text-white/80">
                    <tr>
                      <th className="px-4 py-3">PO Number</th>
                      <th className="px-4 py-3 text-right">Stock</th>
                      <th className="px-4 py-3 text-right">Cost / Unit</th>
                      <th className="px-4 py-3 text-right">Batch Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.fifoList!.map((entry, index) => (
                      <tr key={`${entry.po_number}-${index}`} className="border-t border-slate-100 text-xs font-semibold text-slate-700">
                        <td className="px-4 py-3">{entry.po_number || 'N/A'}</td>
                        <td className="px-4 py-3 text-right">{entry.stock.toLocaleString('en-IN')} {item.unit}</td>
                        <td className="px-4 py-3 text-right">₹{entry.per_unit_cost.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-right font-black text-[#0D3A35]">
                          ₹{(entry.stock * entry.per_unit_cost).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-black text-[#0D3A35]">Approved Vendors</h3>
            {item.vendors.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs font-semibold text-slate-400">
                No vendor information available.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {item.vendors.map((vendor, index) => (
                  <div key={`${vendor.level}-${vendor.company}-${index}`} className="rounded-xl border border-[#0D3A35]/10 bg-white p-4 shadow-[0_8px_24px_rgba(13,58,53,0.04)]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-black text-slate-900">{vendor.company || 'Unnamed vendor'}</p>
                      <Badge variant="outline">{vendor.level || 'Vendor'}</Badge>
                    </div>
                    <div className="mt-3 space-y-1 text-xs font-semibold text-slate-500">
                      <p>GST: <span className="text-slate-700">{vendor.gstNumber || 'N/A'}</span></p>
                      <p>MSME: <span className="text-slate-700">{vendor.msmeCertificate || 'N/A'}</span></p>
                      <p>Contact: <span className="text-slate-700">{vendor.contact || 'N/A'}</span></p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-black text-[#0D3A35]">
              Stock History ({item.transactions.length})
            </h3>
            {item.transactions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs font-semibold text-slate-400">
                No stock transactions available.
              </p>
            ) : (
              <div className="space-y-2">
                {item.transactions.map((transaction) => (
                  <div key={transaction.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#0D3A35]/10 bg-white px-4 py-3 shadow-[0_8px_24px_rgba(13,58,53,0.035)]">
                    <Badge className={cn('border-0', txBadge[transaction.type].color)}>
                      {txBadge[transaction.type].label}
                    </Badge>
                    <p className="text-sm font-black text-slate-800">
                      {transaction.qty.toLocaleString('en-IN')} {item.unit}
                    </p>
                    <p className="text-xs font-semibold text-slate-500">{formatDateDDMMYYYY(transaction.date, 'No date')}</p>
                    <p className="min-w-[180px] flex-1 text-xs font-medium text-slate-500">
                      {transaction.note || 'No note'}
                    </p>
                    <p className="text-xs font-bold text-slate-600">{transaction.by || 'N/A'}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface CardProps {
  item: StockItem;
  onInfo: () => void;
  onAllocate: () => void;
  onUpdateStock: () => void;
  onLedger: () => void;
  onDamage: () => void;
  onReturnEntry: () => void;
  onHistory: () => void;
  onDelete: () => void;
}

const InventoryCard = ({
  item,
  onInfo,
  onAllocate,
  onUpdateStock,
  onLedger,
  onDamage,
  onReturnEntry,
  onHistory,
  onDelete,
}: CardProps) => {
  const isLow = item.currentStock < item.minStock;
  const inventoryValue = (item.fifoList ?? []).reduce((sum, entry) => sum + entry.stock * entry.per_unit_cost, 0);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_52px_rgba(15,23,42,0.10)]">
      {/* Image */}
      <div className="relative h-44 overflow-hidden border-b border-slate-100 bg-slate-50">
        <img
          src={item.imageUrl || PLACEHOLDER_IMG}
          alt={item.name}
          className="h-full w-full object-cover transition duration-300 hover:scale-[1.02]"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_IMG;
          }}
        />
        {isLow && (
          <div className="absolute left-3 top-3 flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
            <AlertTriangle className="w-3 h-3" />
            Low Stock
          </div>
        )}
        <button
          type="button"
          onClick={onInfo}
          aria-label={`View complete information for ${item.name}`}
          title="Item information"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/95 text-[#0D3A35] shadow-md backdrop-blur-sm transition hover:scale-105 hover:bg-[#0D3A35] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D3A35] focus-visible:ring-offset-2"
        >
          <Info className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-4 p-5">
        {/* Name & SKU */}
        <div>
          <h3 className="text-lg font-bold leading-tight text-slate-950">{item.name}</h3>
        </div>

        {/* Item information */}
        <div className="overflow-hidden rounded-xl border border-slate-200">
          {[
            ['Item Code', item.sku || 'N/A'],
            ['Inventory Group', item.inventoryGroup || DEFAULT_CATEGORY_GROUPS[item.category] || 'N/A'],
            ['Item Category', item.category || 'N/A'],
          ].map(([label, value], index) => (
            <div
              key={label}
              className={cn(
                'grid grid-cols-[42%_58%] items-center',
                index > 0 && 'border-t border-slate-100',
              )}
            >
              <div className="bg-slate-50/80 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {label}
              </div>
              <div className={cn(
                'min-w-0 break-words px-3 py-2.5 text-xs font-bold text-slate-700',
              )}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Stock summary chips */}
        <div className="flex flex-wrap gap-2">
          <div
            className={cn(
              'inline-flex min-w-0 flex-1 items-center gap-2 rounded-full border px-3 py-2',
              isLow
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-[#0D3A35]/15 bg-[#0D3A35]/5 text-[#0D3A35]',
            )}
          >
            <Boxes className="h-3.5 w-3.5 shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-wide opacity-65">Current Stock</span>
            <span className="ml-auto whitespace-nowrap text-xs font-black">
              {item.currentStock.toLocaleString('en-IN')} {item.unit}
            </span>
          </div>
          <div className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-full border border-[#0D3A35]/15 bg-[#0D3A35]/5 px-3 py-2 text-[#0D3A35]">
            <IndianRupee className="h-3.5 w-3.5 shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-wide opacity-65">Item Value</span>
            <span className="ml-auto whitespace-nowrap text-xs font-black">
              {inventoryValue > 0
                ? `₹${inventoryValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                : 'N/A'}
            </span>
          </div>
        </div>

        {/* Primary action row */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onAllocate}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-[#0D3A35]/15 bg-[#0D3A35]/5 py-2.5 text-xs font-bold text-[#0D3A35] transition-colors hover:bg-[#0D3A35]/10"
          >
            <ArrowUpFromLine className="w-3.5 h-3.5" />
            Allocate Item
          </button>
          <button
            onClick={onUpdateStock}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-[#0D3A35] bg-[#0D3A35] py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#092e2a]"
          >
            <Boxes className="w-3.5 h-3.5" />
            Request Stock
          </button>
        </div>

        {/* Secondary action row */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={onDamage}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-red-100 bg-red-50/70 py-2 text-[11px] font-bold text-red-600 transition-colors hover:bg-red-100"
          >
            <ShieldAlert className="w-4 h-4" />
            Damage
          </button>
          <button
            onClick={onReturnEntry}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-2 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-100"
          >
            <Undo2 className="w-4 h-4" />
            Return
          </button>
          <button
            onClick={onLedger}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-[#0D3A35]/15 bg-[#0D3A35]/5 py-2 text-[11px] font-bold text-[#0D3A35] transition-colors hover:bg-[#0D3A35]/10"
          >
            <ClipboardList className="w-4 h-4" />
            Ledger
          </button>
        </div>

        {/* Footer actions */}
        <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
          <button
            onClick={onHistory}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 transition-colors hover:text-[#0D3A35]"
          >
            <History className="w-3.5 h-3.5" />
            View History ({item.transactions.length})
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// ADD STOCK MODAL
// ─────────────────────────────────────────────────────────────
type OpeningStockEntry = {
  id: string;
  quantity: string;
  costPerUnit: string;
  poNumber: string;
};

type AddStockForm = Omit<StockItem, 'id' | 'transactions'>;
const emptyForm = (): AddStockForm => ({
  name: '',
  category: 'Seeds',
  sku: 'SBR/INV/SED/001',
  unit: 'KGS',
  currentStock: 0,
  minStock: 0,
  inventoryGroup: DEFAULT_CATEGORY_GROUPS.Seeds,
  subCategory: '',
  expenseClassification: EXPENSE_CLASSIFICATIONS[1],
  inventoryClassification: INVENTORY_CLASSIFICATIONS[1],
  issueClassification: ISSUE_CLASSIFICATIONS[1],
  stockIssueMethod: '',
  packingSize: '',
  shelf: '',
  imageUrl: '',
  location: INVENTORY_LOCATIONS[0],
  description: '',
  vendors: [],
  seriesNumber: '',
});

const AddStockModal = ({
  open,
  onClose,
  onSave,
  inventoryGroups,
  categories,
  categoryGroups,
  subCategories,
  expenseClassifications,
  inventoryClassifications,
  issueClassifications,
  units,
  locations,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: AddStockForm, imageFile: File | null, openingStocks: OpeningStockEntry[]) => Promise<void> | void;
  inventoryGroups: string[];
  categories: string[];
  categoryGroups: Record<string, string>;
  subCategories: { name: string; category: string }[];
  expenseClassifications: string[];
  inventoryClassifications: string[];
  issueClassifications: string[];
  units: string[];
  locations: string[];
}) => {
  const [form, setForm] = useState<AddStockForm>(emptyForm());
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [openingStocks, setOpeningStocks] = useState<OpeningStockEntry[]>([]);
  const categoryOptions = useMemo(() => {
    const mapped = categories.filter((category) => categoryGroups[category] === form.inventoryGroup);
    return mapped.length ? mapped : categories;
  }, [categories, categoryGroups, form.inventoryGroup]);
  const subCategoryOptions = useMemo(
    () => subCategories.filter((entry) => entry.category === form.category).map((entry) => entry.name),
    [form.category, subCategories],
  );

  useEffect(() => {
    if (!open) return;
    setForm((previous) => ({
      ...previous,
      inventoryGroup: inventoryGroups.includes(previous.inventoryGroup || '')
        ? previous.inventoryGroup
        : inventoryGroups[0] ?? '',
      category: categoryOptions.includes(previous.category) ? previous.category : categoryOptions[0] ?? '',
      subCategory: subCategoryOptions.includes(previous.subCategory || '') ? previous.subCategory : '',
      expenseClassification: expenseClassifications.includes(previous.expenseClassification || '')
        ? previous.expenseClassification
        : expenseClassifications[0] ?? '',
      inventoryClassification: inventoryClassifications.includes(previous.inventoryClassification || '')
        ? previous.inventoryClassification
        : inventoryClassifications[0] ?? '',
      issueClassification: issueClassifications.includes(previous.issueClassification || '')
        ? previous.issueClassification
        : issueClassifications[0] ?? '',
      unit: units.includes(previous.unit) ? previous.unit : units[0] ?? '',
      location: locations.includes(previous.location) ? previous.location : locations[0] ?? '',
    }));
  }, [
    categoryOptions,
    expenseClassifications,
    inventoryClassifications,
    inventoryGroups,
    issueClassifications,
    locations,
    open,
    subCategoryOptions,
    units,
  ]);

  const set = (k: keyof AddStockForm, v: string | number) =>
    setForm((p) => ({ ...p, [k]: v }));

  const addOpeningStock = () =>
    setOpeningStocks((prev) => [...prev, { id: genId(), quantity: '', costPerUnit: '', poNumber: '' }]);

  const removeOpeningStock = (id: string) =>
    setOpeningStocks((prev) => prev.filter((e) => e.id !== id));

  const updateOpeningStock = (id: string, field: keyof Omit<OpeningStockEntry, 'id'>, value: string) =>
    setOpeningStocks((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)));

  const generatedItemCode = useMemo(() => {
    const code = getCategoryCode(form.category);
    return `SBR/INV/${code}/001`;
  }, [form.category]);

  useEffect(() => {
    if (!open || !form.category) return;
    const fetchItemCode = async () => {
      const categoryCode = getCategoryCode(form.category);
      setCodeLoading(true);
      try {
        const res = await fetch(`${BASE_URL}/inventory/get_new_item_code/${categoryCode}`);
        const data: any = await res.json().catch(() => null);
        if (res.ok && data?.success && data?.new_item_code) {
          setForm((prev) => ({ ...prev, sku: String(data.new_item_code) }));
        } else {
          setForm((prev) => ({ ...prev, sku: generatedItemCode }));
        }
      } catch {
        setForm((prev) => ({ ...prev, sku: generatedItemCode }));
      } finally {
        setCodeLoading(false);
      }
    };
    fetchItemCode();
  }, [form.category, generatedItemCode, open]);

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Item name is required');
    if (!form.stockIssueMethod) return toast.error('Stock Issue Method is required');
    setIsCreating(true);
    try {
      await onSave({
        ...form,
        sku: form.sku || generatedItemCode,
        seriesNumber: `SBR/INV/${getCategoryCode(form.category)}/`,
        vendors: [],
      }, imageFile, openingStocks);
      setForm(emptyForm());
      setImageFile(null);
      setOpeningStocks([]);
    } catch {
      // Error is already handled by parent onSave with toast.
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-green-600" />
            Create New Product
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Product Name">
            <Input placeholder="e.g. Urea Fertilizer" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Inventory Group">
              <SelectField
                value={form.inventoryGroup || ''}
                options={inventoryGroups}
                onChange={(value) => {
                  const nextCategories = categories.filter((category) => categoryGroups[category] === value);
                  setForm((previous) => ({
                    ...previous,
                    inventoryGroup: value,
                    category: nextCategories[0] || categories[0] || '',
                    subCategory: '',
                  }));
                }}
              />
            </Field>
            <Field label="Category">
              <SelectField
                value={form.category}
                options={categoryOptions}
                onChange={(value) => setForm((previous) => ({ ...previous, category: value, subCategory: '' }))}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Subcategory">
              <SelectField
                value={form.subCategory || ''}
                options={subCategoryOptions.length ? subCategoryOptions : ['Not Configured']}
                onChange={(value) => set('subCategory', value === 'Not Configured' ? '' : value)}
              />
            </Field>
            <Field label="Item Code">
              <Input value={form.sku || generatedItemCode} readOnly className="bg-gray-50" />
              {codeLoading && <p className="text-[11px] text-gray-500 mt-1">Fetching item code...</p>}
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Expense Classification">
              <SelectField value={form.expenseClassification || ''} options={expenseClassifications} onChange={(value) => set('expenseClassification', value)} />
            </Field>
            <Field label="Inventory Classification">
              <SelectField value={form.inventoryClassification || ''} options={inventoryClassifications} onChange={(value) => set('inventoryClassification', value)} />
            </Field>
            <Field label="Issue Classification">
              <SelectField value={form.issueClassification || ''} options={issueClassifications} onChange={(value) => set('issueClassification', value)} />
            </Field>
          </div>

          <StockIssueMethodField
            value={form.stockIssueMethod || ''}
            onChange={(value) => set('stockIssueMethod', value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit">
              <SelectField value={form.unit} options={units} onChange={(v) => set('unit', v)} />
            </Field>
            <Field label="Location">
              <SelectField value={form.location} options={locations} onChange={(v) => set('location', v)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Packing Size">
              <Input
                value={form.packingSize || ''}
                onChange={(e) => set('packingSize', e.target.value)}
                placeholder="e.g. 50 kg bag"
              />
            </Field>
            <Field label="Shelf">
              <Input
                value={form.shelf || ''}
                onChange={(e) => set('shelf', e.target.value)}
                placeholder="e.g. Shelf A-03"
              />
            </Field>
          </div>

          <Field label="Threshold Quantity">
            <Input type="number" min={0} value={form.minStock} onChange={(e) => set('minStock', Number(e.target.value))} />
          </Field>

          {/* ── Opening Stock ── */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-700">Opening Stock</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Add one or more opening stock entries</p>
              </div>
              <button
                type="button"
                onClick={addOpeningStock}
                className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg px-2.5 py-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Entry
              </button>
            </div>

            {openingStocks.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-3">No entries yet — click "Add Entry" to begin.</p>
            ) : (
              <div className="space-y-2">
                {openingStocks.map((entry, idx) => (
                  <div key={entry.id} className="rounded-lg bg-white border border-gray-200 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Entry {idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeOpeningStock(entry.id)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label={`Stock Qty (${form.unit || 'units'})`}>
                        <Input
                          type="number"
                          min={0}
                          placeholder="0"
                          value={entry.quantity}
                          onChange={(e) => updateOpeningStock(entry.id, 'quantity', e.target.value)}
                        />
                      </Field>
                      <Field label="Cost / Unit (₹)">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="0.00"
                          value={entry.costPerUnit}
                          onChange={(e) => updateOpeningStock(entry.id, 'costPerUnit', e.target.value)}
                        />
                      </Field>
                      <Field label="Supporting PO No.">
                        <Input
                          placeholder="PO-…"
                          value={entry.poNumber}
                          onChange={(e) => updateOpeningStock(entry.id, 'poNumber', e.target.value)}
                        />
                      </Field>
                    </div>
                    {entry.quantity && entry.costPerUnit && Number(entry.quantity) > 0 && Number(entry.costPerUnit) > 0 && (
                      <p className="text-[11px] text-green-700 font-medium">
                        Total value: ₹{(Number(entry.quantity) * Number(entry.costPerUnit)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Field label="Product Media (1 image)">
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files && e.target.files[0];
                  if (file) {
                    setImageFile(file);
                    const url = URL.createObjectURL(file);
                    set('imageUrl', url);
                  }
                }}
              />
              {form.imageUrl && (
                <img src={form.imageUrl} alt="preview" className="w-16 h-10 object-cover rounded-md border" />
              )}
            </div>
          </Field>

          <Field label="Description">
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              rows={3}
              placeholder="Short description…"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleSave} disabled={isCreating}>
            {isCreating ? 'Creating...' : 'Create Product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────
// TRANSFER STOCK MODAL
// ─────────────────────────────────────────────────────────────
const TransferStockModal = ({
  open,
  items,
  stores,
  initialItems,
  initialSource,
  initialDestination,
  onClose,
  onTransfer,
}: {
  open: boolean;
  items: StockItem[];
  stores: string[];
  initialItems?: { itemId: string; quantity: string }[];
  initialSource?: string;
  initialDestination?: string;
  onClose: () => void;
  onTransfer: (transfer: {
    items: { itemId: string; quantity: number; availableStock: number }[];
    source: string;
    destination: string;
    transferDate: string;
    creationDate: string;
    vehicleId: string;
    vehicleNumber: string;
    vehicleType: string;
    vehicleMake: string;
    vehicleModel: string;
    transferSlipNumber: string;
    driverName: string;
    driverContact: string;
    expectedArrival: string;
    preparedBy: string;
    preparedById: string;
    approverId: string;
    approvedBy: string;
    approverDesignation: string;
    storeManagerSignature: InventoryApprovalSignature;
    remarks: string;
  }) => void;
}) => {
  const { user } = useAuth();
  const [lineItems, setLineItems] = useState<{ itemId: string; quantity: string }[]>([{ itemId: '', quantity: '' }]);
  const [destination, setDestination] = useState('');
  const [transferDate, setTransferDate] = useState(today());
  const [creationDate] = useState(today());
  const [transferSlipNumber, setTransferSlipNumber] = useState('');
  const [headOfOperationsId, setHeadOfOperationsId] = useState('');
  const [approverOptions, setApproverOptions] = useState<Array<{ id: string; name: string; designation: string }>>([]);
  const [approversLoading, setApproversLoading] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [dissociationByItem, setDissociationByItem] = useState<Record<string, ItemDissociation>>({});
  const [dissociationLoading, setDissociationLoading] = useState(false);
  // Rows seeded from the From/To warehouse panel are "locked" — their quantities were
  // already validated against a specific store's dissociation stock before this modal
  // opened; any rows added afterwards via "Add Item" are always free entry.
  const lockedCount = initialItems?.length ?? 0;
  // The store this slip actually ships from — whatever the From/To warehouse panel had
  // selected, or "Central Store" when opened via the plain "Transfer Stock" button.
  const sourceStore = initialSource || 'Central Store';

  const updateLineItem = (index: number, patch: Partial<{ itemId: string; quantity: string }>) => {
    setLineItems((previous) => previous.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };
  const addLineItem = () => {
    const usedIds = new Set(lineItems.map((line) => line.itemId));
    const nextItem = items.find((item) => !usedIds.has(item.id));
    if (!nextItem) return toast.error('Every available item is already on this slip');
    setLineItems((previous) => [...previous, { itemId: nextItem.id, quantity: '' }]);
  };
  const removeLineItem = (index: number) => {
    setLineItems((previous) => previous.filter((_, i) => i !== index));
  };
  const selectedHeadOfOperations = approverOptions.find((employee) => employee.id === headOfOperationsId);
  const preparedBy = user?.name || user?.username || 'Logged-in user';
  const preparedById = user?.id || user?.username || '';
  // Head of Operations is the actual approval-workflow routing signer; Store Manager is
  // the slip creator, auto-signed the moment "Send for Approval" is clicked.
  const approvedBy = selectedHeadOfOperations?.name ?? '';
  const approverDesignation = selectedHeadOfOperations?.designation ?? '';
  const destinationStores = stores.filter((store) => store.toLowerCase() !== sourceStore.toLowerCase());

  useEffect(() => {
    if (!open) return;
    setLineItems(
      initialItems && initialItems.length > 0
        ? initialItems.map((line) => ({ ...line }))
        : (previous) => {
          const firstId = previous[0]?.itemId;
          const stillValid = firstId && items.some((item) => item.id === firstId);
          return [{ itemId: stillValid ? firstId : items[0]?.id ?? '', quantity: stillValid ? previous[0].quantity : '' }];
        },
    );
    setDestination(
      initialDestination && destinationStores.includes(initialDestination)
        ? initialDestination
        : (previous) => destinationStores.includes(previous) ? previous : destinationStores[0] ?? '',
    );
    setTransferDate(today());
    setTransferSlipNumber(generateTransferSlipNumber());
    setHeadOfOperationsId('');
    setRemarks('');
  }, [destinationStores.join('|'), items, open, initialItems, initialDestination]);

  // "Available Stock" must reflect what's actually sitting in the source store —
  // not the item's project-wide `stock` total — so fetch each selected item's
  // real per-store dissociation, one fetch per unique item.
  useEffect(() => {
    if (!open) return;
    const itemIds = Array.from(new Set(lineItems.map((line) => line.itemId).filter(Boolean)));
    if (itemIds.length === 0) {
      setDissociationByItem({});
      return;
    }
    let mounted = true;
    setDissociationLoading(true);
    Promise.all(itemIds.map((itemId) =>
      fetch(`${BASE_URL}/inventory/get_inventory_item_dissociation/${itemId}`)
        .then((res) => res.json())
        .then((data: any) => {
          const raw = data?.success && data?.dissociation && typeof data.dissociation === 'object' ? data.dissociation : {};
          const parsed: ItemDissociation = {};
          Object.entries(raw).forEach(([storeName, entry]: [string, any]) => {
            const methodKey = Object.keys(entry || {}).find((key) => key !== 'quantity');
            parsed[storeName] = {
              quantity: Number(entry?.quantity) || 0,
              batches: methodKey && Array.isArray(entry[methodKey]) ? entry[methodKey] : [],
            };
          });
          return [itemId, parsed] as const;
        })
        .catch(() => [itemId, {}] as const),
    )).then((results) => {
      if (!mounted) return;
      setDissociationByItem(Object.fromEntries(results));
    }).finally(() => {
      if (mounted) setDissociationLoading(false);
    });
    return () => { mounted = false; };
  }, [open, lineItems.map((line) => line.itemId).join('|')]);

  useEffect(() => {
    if (!open) return;
    const fetchApprovers = async () => {
      setApproversLoading(true);
      try {
        const response = await fetch(`${BASE_URL}/admin_staff/get_all_staff`);
        const data: any = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(data)) throw new Error('Failed to load employees');
        setApproverOptions(
          data
            .map((staff: any) => ({
              id: String(staff?.staff_id ?? ''),
              name: String(staff?.staff_information?.staff_name ?? '').trim(),
              designation: String(staff?.staff_information?.staff_designation ?? '').trim(),
            }))
            .filter((staff: { id: string; name: string }) => staff.id && staff.name)
            .sort((first: { name: string }, second: { name: string }) => first.name.localeCompare(second.name)),
        );
      } catch (error: any) {
        setApproverOptions([]);
        toast.error(error?.message || 'Failed to load employees for approval');
      } finally {
        setApproversLoading(false);
      }
    };
    fetchApprovers();
  }, [open]);

  const submitTransfer = () => {
    if (!destination) return toast.error('Select a destination store');
    if (lineItems.length === 0) return toast.error('Add at least one item to transfer');
    if (!transferSlipNumber.trim()) return toast.error('Transfer slip number is required');
    if (!user?.id || !(user?.name || user?.username)) return toast.error('You must be logged in to sign as Store Manager');
    if (!selectedHeadOfOperations) return toast.error('Select a Head of Operations for approval');

    const seenIds = new Set<string>();
    const resolvedItems: { itemId: string; quantity: number; availableStock: number }[] = [];
    for (const line of lineItems) {
      const lineItem = items.find((item) => item.id === line.itemId);
      if (!lineItem) return toast.error('Select an inventory item for every row');
      if (seenIds.has(lineItem.id)) return toast.error(`${lineItem.name} is added more than once`);
      seenIds.add(lineItem.id);
      const numericQuantity = Number(line.quantity);
      if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
        return toast.error(`Enter a valid quantity for ${lineItem.name}`);
      }
      // Validate against what's actually sitting in the source store per its
      // dissociation record — the item's project-wide `stock` total isn't relevant here.
      const availableAtSource = dissociationByItem[lineItem.id]?.[sourceStore]?.quantity ?? 0;
      if (numericQuantity > availableAtSource) {
        return toast.error(`Only ${availableAtSource.toLocaleString()} ${lineItem.unit} of ${lineItem.name} is available at ${sourceStore}`);
      }
      resolvedItems.push({ itemId: lineItem.id, quantity: numericQuantity, availableStock: availableAtSource });
    }

    // Store Manager is the slip creator — signed the instant "Send for Approval" is clicked.
    const storeManagerSignature: InventoryApprovalSignature = {
      staffId: preparedById,
      staffName: preparedBy,
      staffDesignation: user.designation || '—',
      signedAt: new Date().toISOString(),
    };
    onTransfer({
      items: resolvedItems,
      source: sourceStore,
      destination,
      transferDate,
      creationDate,
      // Vehicle/driver details are filled in later by logistics, not at slip creation.
      vehicleId: '',
      vehicleNumber: '',
      vehicleType: '',
      vehicleMake: '',
      vehicleModel: '',
      transferSlipNumber: transferSlipNumber.trim(),
      driverName: '',
      driverContact: '',
      expectedArrival: '',
      preparedBy,
      preparedById,
      approverId: headOfOperationsId,
      approvedBy,
      approverDesignation,
      storeManagerSignature,
      remarks: remarks.trim(),
    });
  };

  const docLabelCls = 'text-[8px] font-bold uppercase tracking-wide text-slate-400';
  const docInputCls = 'w-full bg-transparent outline-none border-b border-dashed border-slate-300 focus:border-[#0D3A35] text-[10px] font-bold text-slate-800 py-0.5';

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl border-0 bg-slate-100 p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Stock Transfer Slip</DialogTitle>
        </DialogHeader>

        <div className="p-5">
          <div className="overflow-hidden rounded-lg border-2 border-gray-800 bg-white text-[10px] text-slate-800">
            {/* Letterhead — same header treatment as the WCC certificate */}
            <div className="border-b-2 border-gray-800 px-4 py-3 text-center">
              <img src={logo3f} alt="3F Logo" className="mx-auto mb-1 h-10 w-auto" />
              <h1 className="text-sm font-bold tracking-wide text-slate-900">{COMPANY_NAME}</h1>
              <p className="mt-0.5 text-[9px] text-slate-600">{COMPANY_ADDRESS}</p>
              <h2 className="mt-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-900">Stock Transfer Slip</h2>
            </div>

            {/* Slip No. / Date of Creation / Date of Transfer */}
            <div className="grid grid-cols-3 border-b border-gray-300">
              <div className="border-r border-gray-300 p-2">
                <p className={docLabelCls}>Slip No.</p>
                <p className="mt-1 font-bold text-[#0D3A35]">{transferSlipNumber}</p>
              </div>
              <div className="border-r border-gray-300 p-2">
                <p className={docLabelCls}>Date of Creation</p>
                <p className="mt-1 font-bold text-slate-800">{formatTransferDate(creationDate)}</p>
              </div>
              <div className="p-2">
                <p className={docLabelCls}>Date of Transfer</p>
                <input
                  type="date"
                  value={transferDate}
                  onChange={(event) => setTransferDate(event.target.value)}
                  className={cn(docInputCls, 'mt-1')}
                />
              </div>
            </div>

            {/* From / To / Prepared By */}
            <div className="grid grid-cols-3 border-b border-gray-300">
              <div className="border-r border-gray-300 p-2">
                <p className={docLabelCls}>From</p>
                <p className="mt-1 font-bold text-slate-800">{sourceStore}</p>
              </div>
              <div className="border-r border-gray-300 p-2">
                <p className={docLabelCls}>To</p>
                <select
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  className={cn(docInputCls, 'mt-1')}
                >
                  {destinationStores.length === 0
                    ? <option value="">No sub-store configured</option>
                    : destinationStores.map((store) => <option key={store} value={store}>{store}</option>)}
                </select>
              </div>
              <div className="p-2">
                <p className={docLabelCls}>Prepared By</p>
                <p className="mt-1 font-bold text-slate-800">{preparedBy}</p>
              </div>
            </div>

            {/* Items table */}
            <div className="border-b border-gray-300 bg-slate-100 px-2.5 py-1 text-center text-[9px] font-bold uppercase tracking-wide text-slate-600">
              {lineItems.length > 1 ? 'Items Being Transferred' : 'Item Being Transferred'}
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="px-2.5 py-1.5 text-left font-semibold">S.No</th>
                  <th className="px-2.5 py-1.5 text-left font-semibold">Item</th>
                  <th className="px-2.5 py-1.5 text-left font-semibold">Item Code</th>
                  <th className="px-2.5 py-1.5 text-center font-semibold">UOM</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">Quantity</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">Available</th>
                  <th className="w-6 px-1 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {lineItems.map((line, index) => {
                  const lineItem = items.find((item) => item.id === line.itemId);
                  const lineLocked = index < lockedCount;
                  const availableAtSource = lineItem ? dissociationByItem[lineItem.id]?.[sourceStore]?.quantity ?? 0 : 0;
                  return (
                    <tr key={index} className="border-b border-gray-200 last:border-b-0">
                      <td className="px-2.5 py-1.5">{index + 1}</td>
                      <td className="px-2.5 py-1.5">
                        <select
                          value={line.itemId}
                          onChange={(event) => updateLineItem(index, { itemId: event.target.value, quantity: '' })}
                          className={docInputCls}
                        >
                          <option value="">Select item</option>
                          {items.map((item) => (
                            <option
                              key={item.id}
                              value={item.id}
                              disabled={lineItems.some((other, i) => i !== index && other.itemId === item.id)}
                            >
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2.5 py-1.5">{lineItem?.sku || '—'}</td>
                      <td className="px-2.5 py-1.5 text-center">{lineItem?.unit || '—'}</td>
                      <td className="px-2.5 py-1.5 text-right">
                        {lineLocked ? (
                          <span className="font-bold text-slate-800">{line.quantity || '0'}</span>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            max={availableAtSource}
                            value={line.quantity}
                            onChange={(event) => updateLineItem(index, { quantity: event.target.value })}
                            placeholder="0"
                            className={cn(docInputCls, 'text-right')}
                          />
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 text-right text-slate-500">
                        {!lineItem ? '—' : dissociationLoading ? '…' : availableAtSource.toLocaleString()}
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        {!lineLocked && lineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLineItem(index)}
                            className="text-slate-400 hover:text-red-600"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button
              type="button"
              onClick={addLineItem}
              className="flex w-full items-center justify-center gap-1.5 border-b border-gray-300 bg-slate-50 py-2 text-[9px] font-bold uppercase tracking-wide text-[#0D3A35] hover:bg-slate-100"
            >
              <Plus className="h-3 w-3" /> Add Item
            </button>

            {/* Approval */}
            <div className="border-y border-gray-300 bg-slate-100 px-2.5 py-1 text-center text-[9px] font-bold uppercase tracking-wide text-slate-600">
              Approval
            </div>
            <div className="grid grid-cols-3 gap-2 p-2">
              <div className="rounded-md border border-gray-300 p-2 text-center">
                <p className={docLabelCls}>Store Manager</p>
                <p className="mt-1.5 text-[9px] font-semibold text-slate-700">{preparedBy}</p>
                <p className="text-[8px] font-semibold text-slate-400">{user?.designation || '—'}</p>
                <p className="mt-1 text-[7px] font-semibold text-slate-400">Signed automatically on submit</p>
              </div>
              <div className="rounded-md border border-gray-300 p-2 text-center">
                <p className={docLabelCls}>Head of Operations</p>
                <select
                  value={headOfOperationsId}
                  onChange={(event) => setHeadOfOperationsId(event.target.value)}
                  disabled={approversLoading}
                  className={cn(docInputCls, 'mt-1.5 text-center')}
                >
                  <option value="">{approversLoading ? 'Loading…' : 'Select employee'}</option>
                  {approverOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-[8px] font-semibold text-slate-400">{selectedHeadOfOperations?.designation || 'Designation'}</p>
                <p className="mt-1 text-[7px] font-semibold text-slate-400">Signs on approval in Inventory Approvals</p>
              </div>
              <SignatureBox role="Logistics Manager" signature={null} className="border-dashed" />
            </div>

            {/* Remarks */}
            <div className="border-t border-gray-300 p-2">
              <p className={docLabelCls}>Remarks / Handling Instructions</p>
              <textarea
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                rows={2}
                placeholder="Add transfer purpose or handling instructions"
                className={cn(docInputCls, 'mt-1 resize-none')}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4">
          <Button variant="outline" onClick={onClose} className="font-bold">Cancel</Button>
          <Button
            onClick={submitTransfer}
            disabled={!items.length || !destinationStores.length}
            className="gap-2 bg-[#0D3A35] font-bold text-white hover:bg-[#092e2a]"
          >
            <ShieldCheck className="h-4 w-4" />
            Submit for Approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────
// EDIT ITEM MODAL
// ─────────────────────────────────────────────────────────────
const EditItemModal = ({
  item,
  onClose,
  onSave,
  inventoryGroups,
  categories,
  categoryGroups,
  subCategories,
  expenseClassifications,
  inventoryClassifications,
  issueClassifications,
  units,
  locations,
}: {
  item: StockItem;
  onClose: () => void;
  onSave: (updated: StockItem) => void;
  inventoryGroups: string[];
  categories: string[];
  categoryGroups: Record<string, string>;
  subCategories: { name: string; category: string }[];
  expenseClassifications: string[];
  inventoryClassifications: string[];
  issueClassifications: string[];
  units: string[];
  locations: string[];
}) => {
  const [form, setForm] = useState<StockItem>(item);
  const categoryOptions = useMemo(() => {
    const mapped = categories.filter((category) => categoryGroups[category] === form.inventoryGroup);
    return mapped.length ? mapped : categories;
  }, [categories, categoryGroups, form.inventoryGroup]);
  const subCategoryOptions = useMemo(
    () => subCategories.filter((entry) => entry.category === form.category).map((entry) => entry.name),
    [form.category, subCategories],
  );
  const set = (k: keyof StockItem, v: string | number) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleSave = () => {
    if (!form.name.trim()) return toast.error('Item name is required');
    if (!form.stockIssueMethod) return toast.error('Stock Issue Method is required');
    onSave(form);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto rounded-2xl border-0 bg-slate-50 p-0 shadow-[0_28px_80px_rgba(13,58,53,0.28)]">
        <DialogHeader className="sticky top-0 z-20 bg-[#0D3A35] px-6 py-5 text-white">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close edit item"
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3 pr-12">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
              <Edit3 className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black text-white">Edit Item</DialogTitle>
              <p className="mt-1 text-xs font-medium text-white/65">Update item identity, classification, storage, and issue controls.</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <section className="grid gap-3 rounded-xl border border-[#0D3A35]/10 bg-white p-4 shadow-sm sm:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Editing Item</p>
              <p className="mt-1 truncate text-lg font-black text-slate-900">{item.name}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{item.sku || item.id} · {item.category} · {item.location || 'No store'}</p>
            </div>
            <div className="rounded-xl bg-[#0D3A35]/5 px-5 py-3 text-right">
              <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">Current Stock</p>
              <p className="mt-1 text-xl font-black text-[#0D3A35]">{item.currentStock.toLocaleString('en-IN')} {item.unit}</p>
              <p className="mt-1 text-[10px] font-semibold text-slate-400">Use stock transactions to adjust quantity</p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="mb-4 text-xs font-black uppercase tracking-[0.08em] text-slate-500">Basic Information</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2"><Field label="Item Name *"><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field></div>
              <Field label="Item Code"><Input value={form.sku} onChange={(e) => set('sku', e.target.value)} /></Field>
              <Field label="Inventory Group">
                <SelectField value={form.inventoryGroup || ''} options={inventoryGroups} onChange={(value) => {
                  const nextCategories = categories.filter((category) => categoryGroups[category] === value);
                  setForm((previous) => ({ ...previous, inventoryGroup: value, category: nextCategories[0] || categories[0] || '', subCategory: '' }));
                }} />
              </Field>
              <Field label="Category"><SelectField value={form.category} options={categoryOptions} onChange={(value) => setForm((previous) => ({ ...previous, category: value, subCategory: '' }))} /></Field>
              <Field label="Subcategory"><SelectField value={form.subCategory || ''} options={subCategoryOptions.length ? subCategoryOptions : ['Not Configured']} onChange={(value) => set('subCategory', value === 'Not Configured' ? '' : value)} /></Field>
              <Field label="Unit of Measure"><SelectField value={form.unit} options={units} onChange={(value) => set('unit', value)} /></Field>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="mb-4 text-xs font-black uppercase tracking-[0.08em] text-slate-500">Classification &amp; Issue Control</p>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Expense Classification"><SelectField value={form.expenseClassification || ''} options={expenseClassifications} onChange={(value) => set('expenseClassification', value)} /></Field>
              <Field label="Inventory Classification"><SelectField value={form.inventoryClassification || ''} options={inventoryClassifications} onChange={(value) => set('inventoryClassification', value)} /></Field>
              <Field label="Issue Classification"><SelectField value={form.issueClassification || ''} options={issueClassifications} onChange={(value) => set('issueClassification', value)} /></Field>
            </div>
            <div className="mt-4">
              <StockIssueMethodField value={form.stockIssueMethod || ''} onChange={(value) => set('stockIssueMethod', value)} />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="mb-4 text-xs font-black uppercase tracking-[0.08em] text-slate-500">Storage &amp; Stock Planning</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Store / Location"><SelectField value={form.location} options={locations} onChange={(value) => set('location', value)} /></Field>
              <Field label="Shelf"><Input value={form.shelf || ''} onChange={(e) => set('shelf', e.target.value)} placeholder="e.g. Shelf A-03" /></Field>
              <Field label="Packing Size"><Input value={form.packingSize || ''} onChange={(e) => set('packingSize', e.target.value)} placeholder="e.g. 50 kg bag" /></Field>
              <Field label="Minimum Stock Level"><Input type="number" min={0} value={form.minStock} onChange={(e) => set('minStock', Number(e.target.value))} /></Field>
              <div className="sm:col-span-2"><Field label="Image URL"><Input value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="https://..." /></Field></div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <Field label="Description">
              <textarea
                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#0D3A35] focus:ring-2 focus:ring-[#0D3A35]/15"
                rows={3}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Item description, handling notes, or specifications"
              />
            </Field>
          </section>
        </div>

        <DialogFooter className="sticky bottom-0 z-20 border-t border-slate-200 bg-white px-6 py-4">
          <Button variant="outline" onClick={onClose} className="font-bold">Cancel</Button>
          <Button className="gap-2 bg-[#0D3A35] font-bold text-white hover:bg-[#092e2a]" onClick={handleSave}>
            <Edit3 className="h-4 w-4" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────
// TRANSACTION MODAL  (incoming / outgoing / issued / adjustment)
// ─────────────────────────────────────────────────────────────
const TransactionModal = ({
  title,
  item,
  txType,
  description,
  qtyLabel,
  onClose,
  onSave,
}: {
  title: string;
  item: StockItem;
  txType: StockTransaction['type'];
  description: string;
  qtyLabel: string;
  onClose: () => void;
  onSave: (tx: Omit<StockTransaction, 'id'>) => void;
}) => {
  const [qty, setQty] = useState(0);
  const [note, setNote] = useState('');
  const [by, setBy] = useState('');

  // Issue-specific state
  const [issueTo, setIssueTo] = useState('');
  const [issueFarm, setIssueFarm] = useState('');
  const [issueStartDate, setIssueStartDate] = useState('');
  const [issueEndDate, setIssueEndDate] = useState('');
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string; designation: string }>>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [farmList, setFarmList] = useState<Array<{ id: string; label: string }>>([]);
  const [farmLoading, setFarmLoading] = useState(false);

  useEffect(() => {
    if (txType !== 'issued') return;
    const fetchStaff = async () => {
      setStaffLoading(true);
      try {
        const res = await fetch(`${BASE_URL}/admin_staff/get_all_staff`);
        const data: any = await res.json().catch(() => null);
        if (res.ok && Array.isArray(data)) {
          setStaffList(
            data.map((s: any) => ({
              id: String(s?.staff_id ?? ''),
              name: String(s?.staff_information?.staff_name ?? ''),
              designation: String(s?.staff_information?.staff_designation ?? ''),
            }))
          );
        }
      } catch {
        // staff list stays empty; user can still type
      } finally {
        setStaffLoading(false);
      }
    };
    const fetchFarms = async () => {
      setFarmLoading(true);
      try {
        const res = await fetch(`${BASE_URL}/farmer_managment/get_farms`);
        const data: any = await res.json().catch(() => null);
        if (res.ok && Array.isArray(data?.farms)) {
          setFarmList(
            data.farms.map((f: any) => ({
              id: String(f?.farm_id ?? ''),
              label: f?.land_data?.village
                ? `${f.farm_id} — ${f.land_data.village}`
                : String(f?.farm_id ?? ''),
            }))
          );
        }
      } catch {
        // farm list stays empty
      } finally {
        setFarmLoading(false);
      }
    };
    fetchStaff();
    fetchFarms();
  }, [txType]);

  const colorMap: Record<StockTransaction['type'], string> = {
    incoming: 'text-green-600',
    outgoing: 'text-red-600',
    issued: 'text-purple-600',
    adjustment: 'text-blue-600',
  };
  const btnMap: Record<StockTransaction['type'], string> = {
    incoming: 'bg-green-600 hover:bg-green-700',
    outgoing: 'bg-red-600 hover:bg-red-700',
    issued: 'bg-purple-600 hover:bg-purple-700',
    adjustment: 'bg-blue-600 hover:bg-blue-700',
  };

  const handleSave = () => {
    if (!qty || qty <= 0) return toast.error('Quantity must be greater than 0');
    if (txType === 'issued') {
      if (!issueTo) return toast.error('Please select a staff member');
      if (!issueFarm) return toast.error('Please select a farm');
      if (!issueStartDate || !issueEndDate) return toast.error('Please fill both issue dates');
      if (issueEndDate < issueStartDate) return toast.error('End date must be after start date');
      onSave({ type: txType, qty, date: issueStartDate, note: `${formatDateDDMMYYYY(issueStartDate)} → ${formatDateDDMMYYYY(issueEndDate)} | Farm: ${issueFarm}`, by: issueTo });
    } else {
      onSave({ type: txType, qty, date: today(), note, by });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className={cn('flex items-center gap-2', colorMap[txType])}>
            {title}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-500 -mt-1">{description}</p>

        <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between mb-2">
          <div>
            <p className="font-semibold text-gray-800">{item.name}</p>
            <p className="text-xs text-gray-400">{item.sku}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Current Stock</p>
            <p className="font-bold text-gray-800">{item.currentStock} {item.unit}</p>
          </div>
        </div>

        <div className="space-y-3">
          <Field label={qtyLabel}>
            <Input
              type="number"
              min={txType === 'adjustment' ? undefined : 1}
              value={qty || ''}
              onChange={(e) => setQty(Number(e.target.value))}
              placeholder="0"
            />
          </Field>

          {txType === 'issued' ? (
            <>
              <Field label="Issue To (Staff)">
                <div className="relative">
                  <select
                    className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 pr-8 disabled:bg-gray-50 disabled:text-gray-400"
                    value={issueTo}
                    onChange={(e) => setIssueTo(e.target.value)}
                    disabled={staffLoading}
                  >
                    <option value="">{staffLoading ? 'Loading staff…' : 'Select staff member'}</option>
                    {staffList.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}{s.designation ? ` — ${s.designation}` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </Field>

              <Field label="Issued for Farm">
                <div className="relative">
                  <select
                    className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 pr-8 disabled:bg-gray-50 disabled:text-gray-400"
                    value={issueFarm}
                    onChange={(e) => setIssueFarm(e.target.value)}
                    disabled={farmLoading}
                  >
                    <option value="">{farmLoading ? 'Loading farms…' : 'Select farm'}</option>
                    {farmList.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </Field>

              <div className="rounded-lg border border-purple-100 bg-purple-50/40 p-3 space-y-3">
                <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Issue Timeline</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start Date">
                    <Input
                      type="date"
                      value={issueStartDate}
                      onChange={(e) => setIssueStartDate(e.target.value)}
                    />
                  </Field>
                  <Field label="End Date">
                    <Input
                      type="date"
                      value={issueEndDate}
                      min={issueStartDate || undefined}
                      onChange={(e) => setIssueEndDate(e.target.value)}
                    />
                  </Field>
                </div>
                {issueStartDate && issueEndDate && issueEndDate >= issueStartDate && (
                  <p className="text-[11px] text-purple-600 font-medium">
                    Duration: {Math.round((new Date(issueEndDate).getTime() - new Date(issueStartDate).getTime()) / 86400000) + 1} day(s)
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <Field label="Performed By">
                <Input placeholder="Staff name" value={by} onChange={(e) => setBy(e.target.value)} />
              </Field>
              <Field label="Note / Reference">
                <Input placeholder="Purchase order, field, reason…" value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className={cn(btnMap[txType], 'text-white')} onClick={handleSave}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const RequestStockModal = ({
  open,
  onClose,
  selectedItems,
  onChangeSelectedItems,
  allItems,
  onContinue,
}: {
  open: boolean;
  onClose: () => void;
  selectedItems: StockItem[];
  onChangeSelectedItems: (items: StockItem[]) => void;
  allItems: StockItem[];
  onContinue: () => void;
}) => {
  const [addMode, setAddMode] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) {
      setAddMode(false);
      setQuery('');
    }
  }, [open]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const selectedIds = new Set(selectedItems.map((i) => i.id));
    return allItems
      .filter((item) => !selectedIds.has(item.id))
      .filter((item) => item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allItems, query, selectedItems]);

  const addItem = (item: StockItem) => {
    onChangeSelectedItems([...selectedItems, item]);
    setAddMode(false);
    setQuery('');
  };

  const removeItem = (itemId: string) => {
    onChangeSelectedItems(selectedItems.filter((i) => i.id !== itemId));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="w-5 h-5 text-blue-600" />
            Request Stock
          </DialogTitle>
          <p className="text-sm text-gray-500">Add more items to request for stock</p>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 py-2">
          {selectedItems.map((item) => (
            <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <img
                    src={item.imageUrl || PLACEHOLDER_IMG}
                    alt={item.name}
                    className="w-12 h-12 rounded-md object-cover border border-gray-200 shrink-0"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_IMG;
                    }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{item.sku}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{item.category} • {item.location}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
                  title="Remove"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-3 min-h-[96px]">
            {!addMode ? (
              <button
                type="button"
                onClick={() => setAddMode(true)}
                className="w-full h-full min-h-[84px] flex flex-col items-center justify-center gap-1 text-gray-500 hover:text-blue-600"
              >
                <Plus className="w-5 h-5" />
                <span className="text-xs font-medium">Add Item</span>
              </button>
            ) : (
              <div className="space-y-2">
                <Input
                  autoFocus
                  placeholder="Type item name or item code"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="max-h-40 overflow-y-auto rounded-md border border-gray-200 bg-white">
                  {suggestions.length > 0 ? (
                    suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => addItem(s)}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                      >
                        <div className="flex items-center gap-2">
                          <img
                            src={s.imageUrl || PLACEHOLDER_IMG}
                            alt={s.name}
                            className="w-8 h-8 rounded object-cover border border-gray-200 shrink-0"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_IMG;
                            }}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                            <p className="text-xs text-gray-500 truncate">{s.sku}</p>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-xs text-gray-500">No suggestions</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={onContinue} disabled={selectedItems.length === 0}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type IssueDestinationType = 'land' | 'vendor' | 'person';

type IssueDestinationOption = {
  id: string;
  label: string;
  detail: string;
  representatives?: IssueRepresentativeOption[];
};

type IssueRepresentativeOption = {
  id: string;
  name: string;
  detail: string;
};

type IssueEmployeeOption = {
  id: string;
  name: string;
  designation: string;
};

type IssueStockResult = {
  quantity: number;
  issueDate: string;
  issuedBy: string;
  note: string;
  allocationId: string;
  otp: string;
};

const OTHER_ISSUE_RECIPIENT_ID = '__other_issue_recipient__';

const IssueStockModal = ({
  item,
  onClose,
  onAllocated,
}: {
  item: StockItem;
  onClose: () => void;
  onAllocated: (result: IssueStockResult) => void;
}) => {
  const { user } = useAuth();
  const [destinationType, setDestinationType] = useState<IssueDestinationType>('land');
  const [destinationId, setDestinationId] = useState('');
  const [lands, setLands] = useState<IssueDestinationOption[]>([]);
  const [vendors, setVendors] = useState<IssueDestinationOption[]>([]);
  const [employees, setEmployees] = useState<IssueEmployeeOption[]>([]);
  const [loadingDestinations, setLoadingDestinations] = useState(false);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [issueDate, setIssueDate] = useState(today());
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [purpose, setPurpose] = useState('');
  const [reference, setReference] = useState('');
  const [batchNumber, setBatchNumber] = useState(item.batchNumber || '');
  const [receivedById, setReceivedById] = useState('');
  const [manualRepresentativeName, setManualRepresentativeName] = useState('');
  const [manualRepresentativeMobile, setManualRepresentativeMobile] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const issuedBy = user?.name || user?.username || 'System User';
  const isReturnable = String(item.issueClassification || '').toLowerCase() === 'returnable';
  const destinationOptions = destinationType === 'land' ? lands : destinationType === 'vendor' ? vendors : [];
  const loadingSelectedDestination = destinationType === 'vendor' ? loadingVendors : loadingDestinations;
  const selectedDestination = destinationOptions.find((option) => option.id === destinationId);
  const selectedEmployee = employees.find((employee) => employee.id === receivedById);
  const selectedVendorRepresentative = selectedDestination?.representatives?.find(
    (representative) => representative.id === receivedById,
  );
  const selectedReceiver = receivedById === OTHER_ISSUE_RECIPIENT_ID
      ? {
        id: OTHER_ISSUE_RECIPIENT_ID,
        name: manualRepresentativeName.trim(),
        detail: manualRepresentativeMobile.trim(),
      }
    : destinationType === 'vendor'
      ? selectedVendorRepresentative
      ? {
        id: selectedVendorRepresentative.id,
        name: selectedVendorRepresentative.name,
        detail: selectedVendorRepresentative.detail,
      }
      : null
    : selectedEmployee
      ? {
        id: selectedEmployee.id,
        name: selectedEmployee.name,
        detail: selectedEmployee.designation,
      }
      : null;
  const numericQuantity = Number(quantity) || 0;
  const remainingStock = Math.max(0, item.currentStock - numericQuantity);

  useEffect(() => {
    let cancelled = false;
    const getFirstArray = (value: any, keys: string[]) => {
      for (const key of keys) {
        if (Array.isArray(value?.[key])) return value[key];
      }
      return Array.isArray(value) ? value : [];
    };

    const loadDestinations = async () => {
      setLoadingDestinations(true);
      try {
        const [landResponse, staffResponse, ownerResponse] = await Promise.allSettled([
          fetch(`${BASE_URL}/farmer_managment/get_farms`),
          fetch(`${BASE_URL}/admin_staff/get_all_staff`),
          fetch(`${BASE_URL}/admin_ops_requests/get_farm_and_farmer`),
        ]);
        if (cancelled) return;

        const ownerByLandId = new Map<string, string>();
        if (ownerResponse.status === 'fulfilled') {
          const ownerData: any = await ownerResponse.value.json().catch(() => null);
          const ownerRows = getFirstArray(ownerData, ['farm_farmer_mapping', 'farms', 'data', 'items']);
          ownerRows.forEach((mapping: any) => {
            const landId = String(mapping?.farm_id || mapping?.land_id || mapping?.id || '');
            const ownerName = String(mapping?.owner_name || mapping?.farmer_name || mapping?.name || '');
            if (landId && ownerName) ownerByLandId.set(landId, ownerName);
          });
        }

        if (landResponse.status === 'fulfilled') {
          const data: any = await landResponse.value.json().catch(() => null);
          const rows = getFirstArray(data, ['farms', 'farm', 'lands', 'data', 'items']);
          setLands(rows.map((land: any, index: number) => {
            const basic = land?.basic_details || {};
            const id = String(land?.farm_id || land?.land_id || land?.lead_id || land?.id || `land-${index + 1}`);
            const village = String(land?.land_data?.village || basic?.village || land?.village || '');
            const owner = String(
              ownerByLandId.get(id)
              || land?.owner_name
              || land?.farmer_name
              || basic?.owner_name
              || '',
            );
            const area = Number(land?.area || land?.total_area || basic?.total_area || 0);
            return {
              id,
              label: `${id} — ${owner || 'Owner not recorded'}`,
              detail: [village, area > 0 ? `${area.toLocaleString('en-IN')} acres` : ''].filter(Boolean).join(' · '),
            };
          }).filter((land: IssueDestinationOption) => land.id));
        }

        if (staffResponse.status === 'fulfilled') {
          const data: any = await staffResponse.value.json().catch(() => null);
          const rows = getFirstArray(data, ['staff', 'employees', 'data', 'items']);
          setEmployees(rows.map((staff: any) => {
            const information = staff?.staff_information || {};
            return {
              id: String(staff?.staff_id || staff?.employee_id || staff?.id || ''),
              name: String(information?.staff_name || staff?.staff_name || staff?.employee_name || staff?.name || ''),
              designation: String(information?.staff_designation || staff?.staff_designation || staff?.designation || ''),
            };
          }).filter((employee: IssueEmployeeOption) => employee.id && employee.name));
        }
      } catch {
        toast.error('Unable to load issue destination details');
      } finally {
        if (!cancelled) setLoadingDestinations(false);
      }
    };

    loadDestinations();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (destinationType !== 'vendor') return;
    let cancelled = false;

    const loadVendors = async () => {
      setLoadingVendors(true);
      try {
        const response = await fetch(`${BASE_URL}/purchase_flow/get_vendors`);
        const data: any = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || 'Failed to load vendors');
        const rows = Array.isArray(data?.vendors)
          ? data.vendors
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data)
              ? data
              : [];
        if (cancelled) return;
        setVendors(rows.map((vendor: any) => {
          const vendorDetails = vendor?.vendor_details || vendor;
          const bankDetails = vendor?.bank_details || {};
          const id = String(vendor?.vendor_id || vendor?.id || '');
          const primaryName = String(vendorDetails?.vendor_name || vendor?.vendor_name || vendor?.name || '');
          const name = String(vendor?.firm_name || vendorDetails?.firm_name || primaryName || id);
          const contact = String(vendorDetails?.vendor_contact || vendor?.vendor_contact || vendor?.contact || vendor?.phone || '');
          const gst = String(vendorDetails?.gst_number || vendor?.gst_number || vendor?.gstin || '');
          const salesContact = bankDetails?.sales_service_contract_authorised_person || {};
          const commercialContact = bankDetails?.commercial_authorised_person || {};
          const representatives = [
            {
              id: `${id}:primary`,
              name: primaryName || name,
              detail: contact,
            },
            {
              id: `${id}:sales`,
              name: String(salesContact?.name || ''),
              detail: [salesContact?.mobile_number, 'Sales / Service Contact'].filter(Boolean).join(' · '),
            },
            {
              id: `${id}:commercial`,
              name: String(commercialContact?.name || ''),
              detail: [commercialContact?.mobile_number, 'Commercial Contact'].filter(Boolean).join(' · '),
            },
          ].filter((representative) => representative.name)
            .filter((representative, index, list) => (
              list.findIndex((entry) => entry.name === representative.name && entry.detail === representative.detail) === index
            ));
          return {
            id,
            label: name,
            detail: [id, contact, gst ? `GSTIN ${gst}` : ''].filter(Boolean).join(' · '),
            representatives,
          };
        }).filter((vendor: IssueDestinationOption) => vendor.id));
      } catch (error: any) {
        if (!cancelled) {
          setVendors([]);
          toast.error(error?.message || 'Unable to load vendor list');
        }
      } finally {
        if (!cancelled) setLoadingVendors(false);
      }
    };

    loadVendors();
    return () => {
      cancelled = true;
    };
  }, [destinationType]);

  useEffect(() => {
    setDestinationId('');
    setReceivedById('');
    setManualRepresentativeName('');
    setManualRepresentativeMobile('');
  }, [destinationType]);

  useEffect(() => {
    setReceivedById('');
    setManualRepresentativeName('');
    setManualRepresentativeMobile('');
  }, [destinationId]);

  const handleIssue = async () => {
    if (submitting) return;
    if (destinationType !== 'person' && (!destinationId || !selectedDestination)) {
      toast.error(`Select the ${destinationType === 'land' ? 'land parcel' : 'vendor'} receiving this stock`);
      return;
    }
    if (numericQuantity <= 0) {
      toast.error('Enter a quantity greater than zero');
      return;
    }
    if (numericQuantity > item.currentStock) {
      toast.error(`Only ${item.currentStock.toLocaleString('en-IN')} ${item.unit} is available`);
      return;
    }
    if (!issueDate) {
      toast.error('Select the issue date');
      return;
    }
    if (!purpose.trim()) {
      toast.error('Enter the purpose of issue');
      return;
    }
    if (!receivedById || !selectedReceiver) {
      toast.error(destinationType === 'vendor'
        ? 'Select the vendor representative receiving the stock'
        : destinationType === 'person'
          ? 'Select the person receiving the stock'
          : 'Select the employee receiving the stock');
      return;
    }
    if (receivedById === OTHER_ISSUE_RECIPIENT_ID) {
      if (!manualRepresentativeName.trim()) {
        toast.error(destinationType === 'vendor'
          ? 'Enter the vendor representative name'
          : 'Enter the recipient name');
        return;
      }
      const normalizedMobile = manualRepresentativeMobile.replace(/\D/g, '');
      if (normalizedMobile.length < 10 || normalizedMobile.length > 15) {
        toast.error(destinationType === 'vendor'
          ? 'Enter a valid vendor representative mobile number'
          : 'Enter a valid recipient mobile number');
        return;
      }
    }
    if (isReturnable && !expectedReturnDate) {
      toast.error('Select the expected return date for this returnable item');
      return;
    }
    if (expectedReturnDate && expectedReturnDate < issueDate) {
      toast.error('Expected return date cannot be before the issue date');
      return;
    }

    setSubmitting(true);
    try {
      const issueRequestPayload = {
        item_id: item.id,
        quantity: numericQuantity,
        issue_start_date: issueDate,
        issue_end_date: expectedReturnDate || issueDate,
        staff_id: selectedReceiver.id,
        recipient_type: destinationType,
        recipient_id: destinationType === 'person' ? selectedReceiver.id : selectedDestination!.id,
        recipient_name: destinationType === 'person' ? selectedReceiver.name : selectedDestination!.label,
        farm_id: destinationType === 'land' ? selectedDestination!.id : '',
        land_id: destinationType === 'land' ? selectedDestination!.id : '',
        vendor_id: destinationType === 'vendor' ? selectedDestination!.id : '',
        person_id: destinationType === 'person' ? selectedReceiver.id : '',
        issue_date: issueDate,
        expected_return_date: expectedReturnDate || null,
        purpose: purpose.trim(),
        reference: reference.trim(),
        batch_number: batchNumber.trim(),
        issued_by: issuedBy,
        received_by_id: selectedReceiver.id,
        received_by: selectedReceiver.name,
        received_by_mobile: receivedById === OTHER_ISSUE_RECIPIENT_ID || destinationType === 'vendor'
          ? selectedReceiver.detail
          : '',
        remarks: remarks.trim(),
        stock_issue_method: item.stockIssueMethod || '',
        issue_classification: item.issueClassification || '',
        is_returnable: isReturnable,
      };

      const requestResponse = await fetch(`${BASE_URL}/inventory/make_issue_request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(issueRequestPayload),
      });
      const requestText = await requestResponse.text();
      const requestData: any = (() => {
        try { return requestText ? JSON.parse(requestText) : null; } catch { return null; }
      })();
      if (!requestResponse.ok || !requestData?.success) {
        throw new Error(requestData?.message || requestText || 'Failed to create stock issue request');
      }

      let issueId = String(
        requestData?.issue_id
        || requestData?.request_id
        || requestData?.data?.issue_id
        || requestData?.data?.request_id
        || '',
      );

      if (!issueId) {
        const listResponse = await fetch(`${BASE_URL}/inventory/get_issue_requests`);
        const listData: any = await listResponse.json().catch(() => null);
        const matchingRequest = Array.isArray(listData?.issue_requests)
          ? [...listData.issue_requests]
            .filter((request: any) => (
              String(request?.item_id || '') === item.id
              && Number(request?.quantity) === numericQuantity
              && String(request?.status || '').toLowerCase() === 'pending'
            ))
            .sort((first: any, second: any) => (
              new Date(second?.created_at || 0).getTime() - new Date(first?.created_at || 0).getTime()
            ))[0]
          : null;
        issueId = String(matchingRequest?.issue_id || matchingRequest?.request_id || '');
      }

      if (!issueId) {
        throw new Error('Issue request was created, but its issue ID was not returned');
      }

      const note = [
        destinationType === 'person'
          ? `Issued to person: ${selectedReceiver.name}`
          : `Issued to ${destinationType}: ${selectedDestination!.label}`,
        `Purpose: ${purpose.trim()}`,
        reference.trim() ? `Reference: ${reference.trim()}` : '',
        batchNumber.trim() ? `Batch: ${batchNumber.trim()}` : '',
        `Received by: ${selectedReceiver.name}${selectedReceiver.detail ? ` (${selectedReceiver.detail})` : ''}`,
        expectedReturnDate ? `Expected return: ${formatDateDDMMYYYY(expectedReturnDate)}` : '',
        remarks.trim(),
      ].filter(Boolean).join(' · ');
      const handoverOtp = String(Math.floor(1000 + Math.random() * 9000));
      saveIssuedRecordOverride(issueId, {
        workflow_status: 'allocated',
        allocation_otp: handoverOtp,
        allocation_date: issueDate,
        recipient_type: destinationType,
        recipient_name: destinationType === 'person' ? selectedReceiver.name : selectedDestination!.label,
        received_by: selectedReceiver.name,
        received_by_mobile: selectedReceiver.detail || '',
        purpose: purpose.trim(),
        reference: reference.trim(),
        remarks: remarks.trim(),
        issue_classification: item.issueClassification || '',
        is_returnable: isReturnable,
      });
      onAllocated({
        quantity: numericQuantity,
        issueDate,
        issuedBy,
        note,
        allocationId: issueId,
        otp: handoverOtp,
      });
      toast.success(`Item allocated. Handover OTP: ${handoverOtp}`, { duration: 10000 });
    } catch (error: any) {
      toast.error(error?.message || 'Failed to issue stock');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(nextOpen) => { if (!nextOpen && !submitting) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto rounded-2xl border-0 bg-slate-50 p-0 shadow-[0_28px_80px_rgba(13,58,53,0.28)]">
        <DialogHeader className="relative bg-[#0D3A35] px-6 py-5 text-white">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close issue stock"
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3 pr-12">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
              <ArrowUpFromLine className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black text-white">Allocate Item</DialogTitle>
              <p className="mt-1 text-xs font-medium text-white/65">Allocate inventory to a land parcel, vendor, or person for OTP-verified handover.</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <section className="grid gap-3 rounded-xl border border-[#0D3A35]/10 bg-white p-4 shadow-sm sm:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Selected Item</p>
              <p className="mt-1 text-base font-black text-slate-900">{item.name}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {item.sku || item.id} · {item.category} · {item.location || 'No store'}
              </p>
              <Badge className="mt-2 border border-[#0D3A35]/10 bg-[#0D3A35]/5 text-[#0D3A35] hover:bg-[#0D3A35]/5">
                {getStockIssueMethodLabel(item.stockIssueMethod)}
              </Badge>
            </div>
            <div className="rounded-xl bg-[#0D3A35] px-5 py-3 text-right text-white">
              <p className="text-[9px] font-bold uppercase tracking-wide text-white/60">Available Stock</p>
              <p className="mt-1 text-xl font-black">{item.currentStock.toLocaleString('en-IN')} {item.unit}</p>
              {numericQuantity > 0 && numericQuantity <= item.currentStock && (
                <p className="mt-1 text-[10px] font-semibold text-white/65">
                  Balance after issue: {remainingStock.toLocaleString('en-IN')} {item.unit}
                </p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.08em] text-slate-500">Issue Destination</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                ['land', 'Issue to Land', 'Farm or land parcel'],
                ['vendor', 'Issue to Vendor', 'Approved external vendor'],
                ['person', 'Issue to Person', 'Employee or another person'],
              ] as const).map(([value, label, description]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDestinationType(value)}
                  className={cn(
                    'rounded-xl border px-4 py-3 text-left transition',
                    destinationType === value
                      ? 'border-[#0D3A35] bg-[#0D3A35]/5 ring-1 ring-[#0D3A35]'
                      : 'border-slate-200 hover:border-[#0D3A35]/30',
                  )}
                >
                  <p className="text-sm font-black text-slate-800">{label}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
                </button>
              ))}
            </div>
            {destinationType !== 'person' && (
              <div className="mt-4">
                <Field label={destinationType === 'land' ? 'Land / Farm *' : 'Vendor *'}>
                  <div className="relative">
                    <select
                      value={destinationId}
                      disabled={loadingSelectedDestination}
                      onChange={(event) => setDestinationId(event.target.value)}
                      className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-9 text-sm outline-none transition focus:border-[#0D3A35] focus:ring-2 focus:ring-[#0D3A35]/15 disabled:bg-slate-50"
                    >
                      <option value="">
                        {loadingSelectedDestination
                          ? 'Loading destinations…'
                          : `Select ${destinationType === 'land' ? 'land or farm' : 'vendor'}`}
                      </option>
                      {destinationOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}{option.detail ? ` — ${option.detail}` : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </Field>
              </div>
            )}
          </section>

          <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
            <Field label={`Quantity to Issue (${item.unit}) *`}>
              <Input
                type="number"
                min={0}
                max={item.currentStock}
                step="any"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder="Enter quantity"
              />
            </Field>
            <Field label="Allocation Date *">
              <Input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
            </Field>
            {isReturnable && (
              <Field label="Expected Return Date *">
                <Input
                  type="date"
                  min={issueDate}
                  value={expectedReturnDate}
                  onChange={(event) => setExpectedReturnDate(event.target.value)}
                />
              </Field>
            )}
            <Field label="Purpose / Usage *">
              <Input
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="e.g. Paddy sowing, field application"
              />
            </Field>
            <Field label="Reference / Task / Work Order">
              <Input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Enter reference number"
              />
            </Field>
            <Field label="Batch Number">
              <Input
                value={batchNumber}
                onChange={(event) => setBatchNumber(event.target.value)}
                placeholder={item.batchTracking ? 'Enter issued batch' : 'Optional'}
              />
            </Field>
            <Field label="Issued By">
              <Input value={issuedBy} readOnly className="bg-slate-50 text-slate-600" />
            </Field>
            <Field label={destinationType === 'vendor'
              ? 'Vendor Representative *'
              : destinationType === 'person'
                ? 'Issue To Person *'
                : 'Received By / Contact Person *'}>
              <div className="relative">
                <select
                  value={receivedById}
                  onChange={(event) => setReceivedById(event.target.value)}
                  disabled={destinationType === 'vendor' ? !selectedDestination : loadingDestinations}
                  className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-9 text-sm outline-none transition focus:border-[#0D3A35] focus:ring-2 focus:ring-[#0D3A35]/15 disabled:bg-slate-50"
                >
                  {destinationType === 'vendor' ? (
                    <>
                      <option value="">{selectedDestination ? 'Select vendor representative' : 'Select a vendor first'}</option>
                      {(selectedDestination?.representatives || []).map((representative) => (
                        <option key={representative.id} value={representative.id}>
                          {representative.name}{representative.detail ? ` — ${representative.detail}` : ''}
                        </option>
                      ))}
                      <option value={OTHER_ISSUE_RECIPIENT_ID}>Other — Enter manually</option>
                    </>
                  ) : (
                    <>
                      <option value="">{loadingDestinations ? 'Loading employees…' : 'Select employee'}</option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.name}{employee.designation ? ` — ${employee.designation}` : ''} · {employee.id}
                        </option>
                      ))}
                      <option value={OTHER_ISSUE_RECIPIENT_ID}>Other — Enter manually</option>
                    </>
                  )}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </Field>
            {receivedById === OTHER_ISSUE_RECIPIENT_ID && (
              <>
                <Field label={destinationType === 'vendor' ? 'Representative Name *' : 'Person Name *'}>
                  <Input
                    value={manualRepresentativeName}
                    onChange={(event) => setManualRepresentativeName(event.target.value)}
                    placeholder="Enter representative name"
                  />
                </Field>
                <Field label={destinationType === 'vendor' ? 'Representative Mobile No. *' : 'Person Mobile No. *'}>
                  <Input
                    type="tel"
                    inputMode="numeric"
                    value={manualRepresentativeMobile}
                    onChange={(event) => setManualRepresentativeMobile(event.target.value)}
                    placeholder="Enter mobile number"
                  />
                </Field>
              </>
            )}
            <div className="md:col-span-2">
              <Field label="Remarks">
                <textarea
                  rows={3}
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  placeholder="Handling instructions or additional notes"
                  className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#0D3A35] focus:ring-2 focus:ring-[#0D3A35]/15"
                />
              </Field>
            </div>
          </section>
        </div>

        <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            type="button"
            onClick={handleIssue}
            disabled={submitting || item.currentStock <= 0}
            className="min-w-36 bg-[#0D3A35] text-white hover:bg-[#092e2a]"
          >
            {submitting ? (
              <>
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Allocating…
              </>
            ) : (
              <>
                <ArrowUpFromLine className="mr-2 h-4 w-4" />
                Confirm Allocation
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type AllocationRowState = {
  quantity: number;
  providedQuantity: number;
  completed: boolean;
};

type AllocationItem = {
  equipment_name: string;
  equipment_id: string;
  quantity: number;
};

type AllocationDisplayRow = {
  itemId: string;
  itemName: string;
  quantity: number;
  availableStock: number;
  stockInPipeline: number;
  stockIssueMethod: string;
};

const EquipmentAllocationModal = ({
  open,
  items,
  focusedItem,
  onAllocationSuccess,
  onClose,
}: {
  open: boolean;
  items: StockItem[];
  focusedItem: StockItem | null;
  onAllocationSuccess: (itemId: string, quantity: number) => void;
  onClose: () => void;
}) => {
  const [otp, setOtp] = useState('');
  const [verified, setVerified] = useState(false);
  const [allocationItems, setAllocationItems] = useState<AllocationItem[]>([]);
  const [loadingAllocation, setLoadingAllocation] = useState(false);
  const [allocationError, setAllocationError] = useState('');
  const [completingItemId, setCompletingItemId] = useState('');
  const [rowState, setRowState] = useState<Record<string, AllocationRowState>>({});

  useEffect(() => {
    if (!open) {
      setOtp('');
      setVerified(false);
      setAllocationItems([]);
      setLoadingAllocation(false);
      setAllocationError('');
      setCompletingItemId('');
      setRowState({});
      return;
    }

    if (!verified) {
      setAllocationItems([]);
      setAllocationError('');
      setLoadingAllocation(false);
    }
  }, [open, verified]);

  useEffect(() => {
    if (!verified || otp.trim().length !== 4) return;

    const fetchAllocationItems = async () => {
      setLoadingAllocation(true);
      setAllocationError('');
      try {
        const res = await fetch(`${BASE_URL}/inventory/get_equipment_allocation/${otp.trim()}`);
        const data: any = await res.json().catch(() => null);
        if (!res.ok || !data?.success || !Array.isArray(data?.items)) {
          throw new Error(data?.message || 'Failed to fetch equipment allocation');
        }

        setAllocationItems(
          data.items.map((item: any) => ({
            equipment_name: String(item?.equipment_name || ''),
            equipment_id: String(item?.equipment_id || ''),
            quantity: Number(item?.quantity) || 0,
          })),
        );
      } catch (e: any) {
        setAllocationItems([]);
        setAllocationError(e?.message || 'Failed to fetch equipment allocation');
        toast.error(e?.message || 'Failed to fetch equipment allocation');
      } finally {
        setLoadingAllocation(false);
      }
    };

    fetchAllocationItems();
  }, [verified, otp]);

  const handleVerify = () => {
    if (otp.trim().length !== 4) {
      toast.error('Enter a 4-digit OTP to view the allocation list');
      return;
    }
    setVerified(true);
  };

  useEffect(() => {
    if (!verified) return;

    const nextState: Record<string, AllocationRowState> = {};
    allocationItems.forEach((item) => {
      nextState[item.equipment_id] = {
        quantity: item.quantity,
        providedQuantity: 0,
        completed: false,
      };
    });
    setRowState(nextState);
  }, [verified, allocationItems]);

  const allocationRows = useMemo<AllocationDisplayRow[]>(() => {
    const rows = allocationItems.map((allocationItem) => {
      const inventoryItem = items.find((item) => item.id === allocationItem.equipment_id);
      return {
        itemId: allocationItem.equipment_id,
        itemName: allocationItem.equipment_name || inventoryItem?.name || allocationItem.equipment_id,
        quantity: allocationItem.quantity,
        availableStock: inventoryItem?.currentStock ?? 0,
        stockInPipeline: inventoryItem?.stockInPipeline ?? 0,
        stockIssueMethod: inventoryItem?.stockIssueMethod || '',
      };
    });
    if (!focusedItem) return rows;
    return [...rows].sort((first, second) => (
      Number(second.itemId === focusedItem.id) - Number(first.itemId === focusedItem.id)
    ));
  }, [allocationItems, focusedItem, items]);

  const updateRow = (itemId: string, patch: Partial<AllocationRowState>) => {
    setRowState((prev) => ({
      ...prev,
      [itemId]: {
        quantity: 0,
        providedQuantity: 0,
        completed: false,
        ...prev[itemId],
        ...patch,
      },
    }));
  };

  const handleComplete = async (item: AllocationDisplayRow) => {
    if (completingItemId) return;

    const current = rowState[item.itemId];
    const quantity = Number(current?.quantity) || 0;

    if (quantity <= 0) {
      toast.error('Enter a quantity before marking the item completed');
      return;
    }

    setCompletingItemId(item.itemId);
    try {
      const res = await fetch(`${BASE_URL}/inventory/update_item_stock_on_allocation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: item.itemId,
          quantity_allocated: quantity,
          stock_issue_method: item.stockIssueMethod || '',
        }),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || 'Failed to update allocated stock');
      }

      onAllocationSuccess(item.itemId, quantity);

      updateRow(item.itemId, {
        providedQuantity: quantity,
        completed: true,
      });
      toast.success('Allocation updated successfully');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update allocated stock');
    } finally {
      setCompletingItemId('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-emerald-600" />
            {focusedItem ? `Allocate ${focusedItem.name}` : 'Equipment Allocation'}
          </DialogTitle>
          <p className="text-sm text-gray-500">
            Enter the OTP first. The allocation list stays hidden until the OTP is provided.
          </p>
        </DialogHeader>

        <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-emerald-50 to-white p-4 space-y-4">
          {focusedItem && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#0D3A35]/10 bg-white px-3 py-2.5">
              <PackageCheck className="h-4 w-4 text-[#0D3A35]" />
              <span className="text-xs font-bold text-slate-500">Selected stock:</span>
              <span className="text-xs font-black text-[#0D3A35]">{focusedItem.name}</span>
              <span className="text-xs font-semibold text-slate-400">
                {focusedItem.currentStock.toLocaleString('en-IN')} {focusedItem.unit} available
              </span>
            </div>
          )}
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Verify allocation access</p>
              <p className="text-xs text-gray-500">Use the OTP to unlock the equipment list.</p>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <InputOTP
                maxLength={4}
                value={otp}
                onChange={setOtp}
                containerClassName="justify-start"
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleVerify}>
                Verify OTP
              </Button>
            </div>
          </div>

          {verified ? (
            <Badge className="w-fit bg-emerald-100 text-emerald-700 hover:bg-emerald-100">OTP verified</Badge>
          ) : (
            <Badge variant="outline" className="w-fit border-dashed text-gray-500">
              Allocation locked
            </Badge>
          )}
        </div>

        {verified ? (
          <div className="rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Item id</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Item name</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Quantity</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Available stock</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Stock in pipeline</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Provided quantity</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Completed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {loadingAllocation ? (
                    <tr>
                      <td className="px-4 py-6 text-center text-gray-500" colSpan={7}>
                        Loading allocation items...
                      </td>
                    </tr>
                  ) : allocationError ? (
                    <tr>
                      <td className="px-4 py-6 text-center text-red-600" colSpan={7}>
                        {allocationError}
                      </td>
                    </tr>
                  ) : allocationRows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-center text-gray-500" colSpan={7}>
                        No allocation items found for this OTP.
                      </td>
                    </tr>
                  ) : allocationRows.map((item) => {
                    const state = rowState[item.itemId] || { quantity: item.quantity, providedQuantity: 0, completed: false };

                    return (
                      <tr
                        key={item.itemId}
                        className={cn(
                          state.completed && 'bg-emerald-50/50 opacity-70',
                          focusedItem?.id === item.itemId && !state.completed && 'bg-[#0D3A35]/[0.045]',
                        )}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">{item.itemId}</td>
                        <td className="px-4 py-3 text-gray-800">{item.itemName}</td>
                        <td className="px-4 py-3 text-gray-700">{item.quantity.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-700">{item.availableStock.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-700">{item.stockInPipeline.toLocaleString()}</td>
                        <td className="px-4 py-3 w-40">
                          <Input
                            type="number"
                            min={0}
                            value={state.quantity}
                            disabled={state.completed}
                            onChange={(e) => updateRow(item.itemId, { quantity: Number(e.target.value) })}
                            className="h-9"
                          />
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {state.completed ? state.providedQuantity.toLocaleString() : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            size="sm"
                            className={state.completed ? 'bg-gray-500 hover:bg-gray-500 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}
                            onClick={() => handleComplete(item)}
                            disabled={state.completed || completingItemId === item.itemId}
                          >
                            {state.completed ? 'Completed' : completingItemId === item.itemId ? 'Saving...' : 'Completed'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            No items are visible until the OTP is verified.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────
// HISTORY MODAL
// ─────────────────────────────────────────────────────────────
const HistoryModal = ({
  item,
  filterType = 'all',
  onClose,
}: {
  item: StockItem;
  filterType?: 'all' | 'incoming' | 'outgoing';
  onClose: () => void;
}) => {
  const [dateMode, setDateMode] = useState<'all' | 'custom'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filtered = filterType === 'all'
    ? item.transactions
    : item.transactions.filter((tx) => tx.type === filterType);

  // Apply date range only for incoming custom mode
  const dateFiltered = (filterType === 'incoming' && dateMode === 'custom')
    ? filtered.filter((tx) => {
        if (startDate && tx.date < startDate) return false;
        if (endDate && tx.date > endDate) return false;
        return true;
      })
    : filtered;

  const titleSuffix =
    filterType === 'incoming' ? ' — Incoming'
    : filterType === 'outgoing' ? ' — Outgoing'
    : '';

  // ── Incoming: totals + group by date (newest first) ──────
  const totalQty   = dateFiltered.reduce((sum, tx) => sum + tx.qty, 0);
  const totalValue = dateFiltered.reduce((sum, tx) => sum + tx.qty * (tx.costPerUnit ?? 0), 0);

  const byDate: [string, StockTransaction[]][] = (() => {
    if (filterType !== 'incoming') return [];
    const map = new Map<string, StockTransaction[]>();
    dateFiltered.forEach((tx) => {
      const list = map.get(tx.date) ?? [];
      list.push(tx);
      map.set(tx.date, list);
    });
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  })();

  return (
  <Dialog open onOpenChange={onClose}>
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <History className="w-5 h-5 text-gray-600" />
          Stock History – {item.name}{titleSuffix}
        </DialogTitle>
      </DialogHeader>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          {filterType === 'all' ? 'No transactions recorded yet.' : `No ${filterType} transactions recorded yet.`}
        </p>
      ) : filterType === 'incoming' ? (
        <div className="space-y-4 py-2">

          {/* ── Date range filter ── */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => { setDateMode('all'); setStartDate(''); setEndDate(''); }}
                className={cn(
                  'flex-1 rounded-lg py-1.5 text-xs font-semibold border transition-colors',
                  dateMode === 'all'
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-green-400',
                )}
              >
                All Time
              </button>
              <button
                onClick={() => setDateMode('custom')}
                className={cn(
                  'flex-1 rounded-lg py-1.5 text-xs font-semibold border transition-colors',
                  dateMode === 'custom'
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-green-400',
                )}
              >
                Custom Range
              </button>
            </div>
            {dateMode === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-gray-500">From</label>
                  <input
                    type="date"
                    value={startDate}
                    max={endDate || undefined}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-gray-500">To</label>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Summary card ── */}
          <div className="flex items-center justify-between rounded-xl bg-green-50 border border-green-100 px-4 py-3">
            <div>
              <p className="text-xs text-green-600 font-medium">Total Incoming Stock</p>
              <p className="text-2xl font-bold text-green-700">
                {totalQty.toLocaleString('en-IN')}
                <span className="text-sm font-normal text-green-500 ml-1">{item.unit}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-green-600 font-medium">Total Value</p>
              <p className="text-2xl font-bold text-green-700">
                ₹{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>

          {/* ── Grouped rows or empty ── */}
          {byDate.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No entries in the selected range.</p>
          ) : byDate.map(([date, txs]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-[11px] text-gray-400 whitespace-nowrap">
                  {txs.reduce((s, t) => s + t.qty, 0).toLocaleString('en-IN')} {item.unit}
                </span>
              </div>
              <div className="space-y-2">
                {txs.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 rounded-lg border border-green-100 bg-green-50/40 px-3 py-2.5">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                      <ArrowDownToLine className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">
                        +{tx.qty.toLocaleString('en-IN')} {item.unit}
                      </p>
                      {tx.note && <p className="text-xs text-gray-500 truncate mt-0.5">{tx.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2 py-2">
          {filtered.map((tx) => (
            <div
              key={tx.id}
              className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50"
            >
              <span
                className={cn(
                  'text-xs font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0 mt-0.5',
                  txBadge[tx.type].color,
                )}
              >
                {txBadge[tx.type].label}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">
                  {tx.type === 'outgoing' || tx.type === 'issued' ? '-' : '+'}
                  {tx.qty} {item.unit}
                </p>
                {tx.note && <p className="text-xs text-gray-500 truncate">{tx.note}</p>}
                {tx.by && <p className="text-xs text-gray-400">By: {tx.by}</p>}
              </div>
              <span className="text-xs text-gray-400 shrink-0">{formatDateDDMMYYYY(tx.date, tx.date)}</span>
            </div>
          ))}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────
// DELETE CONFIRM
// ─────────────────────────────────────────────────────────────
const DeleteConfirmModal = ({
  item,
  onClose,
  onConfirm,
}: {
  item: StockItem;
  onClose: () => void;
  onConfirm: () => void;
}) => (
  <Dialog open onOpenChange={onClose}>
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-red-600">
          <Trash2 className="w-5 h-5" />
          Remove Item
        </DialogTitle>
      </DialogHeader>
      <p className="text-sm text-gray-600">
        Are you sure you want to remove <strong>{item.name}</strong> from inventory? This action cannot be undone.
      </p>
      <DialogFooter className="mt-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={onConfirm}>
          Yes, Remove
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

// ─────────────────────────────────────────────────────────────
// ISSUED ITEMS MODAL
// ─────────────────────────────────────────────────────────────
type IssueRequest = {
  item_id: string;
  item_name: string;
  issue_id: string;
  quantity: number;
  issue_start_date: string;
  issue_end_date: string;
  status: 'pending' | 'allocated' | 'issued' | 'returned' | 'partially_returned' | 'rejected';
  created_at: string;
  staff_id: string;
  recipient_type?: string;
  recipient_id?: string;
  recipient_name?: string;
  received_by?: string;
  received_by_mobile?: string;
  farm_id?: string;
  land_id?: string;
  vendor_id?: string;
  person_id?: string;
  purpose?: string;
  reference?: string;
  batch_number?: string;
  issued_by?: string;
  remarks?: string;
  quantity_returned?: number;
  returned_quantity?: number;
  return_date?: string;
  returned_at?: string;
  return_note?: string;
  issue_classification?: string;
  is_returnable?: boolean;
  backend_status?: string;
  workflow_status?: 'allocated' | 'handed_over';
  allocation_otp?: string;
  allocation_date?: string;
  handover_date?: string;
  utilized_quantity?: number;
  utilization_date?: string;
  utilization_note?: string;
};

type IssueRecordOverride = Partial<Pick<IssueRequest,
  | 'issue_start_date'
  | 'issue_end_date'
  | 'purpose'
  | 'reference'
  | 'received_by'
  | 'received_by_mobile'
  | 'remarks'
  | 'return_date'
  | 'return_note'
  | 'quantity_returned'
  | 'recipient_type'
  | 'recipient_name'
  | 'issue_classification'
  | 'is_returnable'
  | 'workflow_status'
  | 'allocation_otp'
  | 'allocation_date'
  | 'handover_date'
  | 'utilized_quantity'
  | 'utilization_date'
  | 'utilization_note'
>>;

const ISSUED_RECORD_OVERRIDES_KEY = 'farm-connect.issued-record-overrides.v1';

const readIssuedRecordOverrides = (): Record<string, IssueRecordOverride> => {
  if (typeof window === 'undefined') return {};
  try {
    const stored = JSON.parse(window.localStorage.getItem(ISSUED_RECORD_OVERRIDES_KEY) || '{}');
    return stored && typeof stored === 'object' ? stored : {};
  } catch {
    return {};
  }
};

const saveIssuedRecordOverride = (issueId: string, override: IssueRecordOverride) => {
  if (typeof window === 'undefined' || !issueId) return;
  const stored = readIssuedRecordOverrides();
  stored[issueId] = { ...(stored[issueId] || {}), ...override };
  window.localStorage.setItem(ISSUED_RECORD_OVERRIDES_KEY, JSON.stringify(stored));
};

const normalizeIssueRequest = (record: any): IssueRequest => {
  const backendStatus = String(record?.status || 'pending').toLowerCase();
  const issueId = String(record?.issue_id || record?.request_id || '');
  const override = readIssuedRecordOverrides()[issueId] || {};
  return {
    ...record,
    ...override,
    issue_id: issueId,
    item_id: String(record?.item_id || ''),
    item_name: String(record?.item_name || ''),
    quantity: Number(record?.quantity) || 0,
    status: (
      override.workflow_status === 'allocated'
        ? 'allocated'
        : backendStatus === 'approved' || override.workflow_status === 'handed_over'
          ? 'issued'
          : backendStatus
    ) as IssueRequest['status'],
    backend_status: backendStatus,
  };
};

const findIssuedInventoryItem = (items: StockItem[], record: Pick<IssueRequest, 'item_id' | 'item_name'>) => {
  const recordId = String(record.item_id || '').trim().toLowerCase();
  const recordName = String(record.item_name || '').trim().toLowerCase();
  return items.find((item) => (
    (recordId && (
      String(item.id || '').trim().toLowerCase() === recordId
      || String(item.sku || '').trim().toLowerCase() === recordId
    ))
    || (recordName && String(item.name || '').trim().toLowerCase() === recordName)
  ));
};

const isIssuedItemReturnable = (item?: StockItem) => (
  String(item?.issueClassification || '').trim().toLowerCase() === 'returnable'
);

const isIssueRequestReturnable = (record: IssueRequest, item?: StockItem) => {
  if (typeof record.is_returnable === 'boolean') return record.is_returnable;
  const recordedClassification = String(record.issue_classification || '').trim().toLowerCase();
  if (recordedClassification) return recordedClassification === 'returnable';
  return isIssuedItemReturnable(item);
};

type IssueStatusTab = 'all' | IssueRequest['status'];

const STATUS_TABS: { key: IssueStatusTab; label: string; active: string; badge: string }[] = [
  { key: 'all',               label: 'All',               active: 'bg-gray-800 text-white border-gray-800',         badge: 'bg-white/20 text-white' },
  { key: 'pending',           label: 'Pending',           active: 'bg-amber-500 text-white border-amber-500',       badge: 'bg-white/20 text-white' },
  { key: 'allocated',         label: 'Allocated',         active: 'bg-cyan-600 text-white border-cyan-600',         badge: 'bg-white/20 text-white' },
  { key: 'issued',            label: 'Issued',            active: 'bg-blue-600 text-white border-blue-600',         badge: 'bg-white/20 text-white' },
  { key: 'returned',          label: 'Returned',          active: 'bg-emerald-600 text-white border-emerald-600',   badge: 'bg-white/20 text-white' },
  { key: 'partially_returned', label: 'Partial Return',  active: 'bg-violet-600 text-white border-violet-600',     badge: 'bg-white/20 text-white' },
  { key: 'rejected',          label: 'Rejected',          active: 'bg-red-600 text-white border-red-600',           badge: 'bg-white/20 text-white' },
];

const STATUS_PILL: Record<IssueRequest['status'], string> = {
  pending:            'bg-amber-50 text-amber-700 ring-amber-100',
  allocated:          'bg-cyan-50 text-cyan-700 ring-cyan-100',
  issued:             'bg-blue-50 text-blue-700 ring-blue-100',
  returned:           'bg-emerald-50 text-emerald-700 ring-emerald-100',
  partially_returned: 'bg-violet-50 text-violet-700 ring-violet-100',
  rejected:           'bg-red-50 text-red-700 ring-red-100',
};

const calcProgress = (start: string, end: string) => {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const n = Date.now();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  return Math.max(0, Math.min(100, ((n - s) / (e - s)) * 100));
};

const IssuedStockTab = ({
  items,
  search,
  onStockReturned,
  onStockHandedOver,
}: {
  items: StockItem[];
  search: string;
  onStockReturned: (itemId: string, quantity: number) => void;
  onStockHandedOver: (itemId: string, quantity: number, issueId: string) => void;
}) => {
  const [records, setRecords] = useState<IssueRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [returnRecord, setReturnRecord] = useState<IssueRequest | null>(null);
  const [returnQuantity, setReturnQuantity] = useState('');
  const [returnDate, setReturnDate] = useState(today());
  const [returnNote, setReturnNote] = useState('');
  const [returning, setReturning] = useState(false);
  const [infoRecord, setInfoRecord] = useState<IssueRequest | null>(null);
  const [editRecord, setEditRecord] = useState<IssueRequest | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<IssueRequest | null>(null);
  const [recordActionLoading, setRecordActionLoading] = useState(false);
  const [handoverRecord, setHandoverRecord] = useState<IssueRequest | null>(null);
  const [handoverOtp, setHandoverOtp] = useState('');
  const [utilizationRecord, setUtilizationRecord] = useState<IssueRequest | null>(null);
  const [utilizedQuantity, setUtilizedQuantity] = useState('');
  const [utilizationDate, setUtilizationDate] = useState(today());
  const [utilizationNote, setUtilizationNote] = useState('');

  const fetchRecords = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`${BASE_URL}/inventory/get_issue_requests`);
      const data: any = await response.json().catch(() => null);
      if (!response.ok || !data?.success || !Array.isArray(data?.issue_requests)) {
        throw new Error(data?.message || 'Failed to load allocated items');
      }
      setRecords(data.issue_requests.map(normalizeIssueRequest));
    } catch (error: any) {
      if (!silent) {
        toast.error(error?.message || 'Failed to load allocated items');
        setRecords([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
    const refreshSilently = () => { void fetchRecords(true); };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshSilently();
    };
    const intervalId = window.setInterval(refreshSilently, 15000);
    window.addEventListener('focus', refreshSilently);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshSilently);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  const issuedRecords = useMemo(() => records.filter((record) => (
    ['allocated', 'issued', 'returned', 'partially_returned'].includes(record.status)
  )), [records]);
  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return issuedRecords;
    return issuedRecords.filter((record) => {
      const item = findIssuedInventoryItem(items, record);
      return [
        record.item_name,
        item?.sku,
        record.issue_id,
        record.status,
        record.recipient_type,
        record.recipient_name,
        record.received_by,
        record.staff_id,
        record.farm_id,
        record.vendor_id,
        record.reference,
        record.purpose,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [issuedRecords, items, search]);

  const activeCount = issuedRecords.filter((record) => (
    record.status === 'allocated' || record.status === 'issued' || record.status === 'partially_returned'
  )).length;
  const returnedCount = issuedRecords.filter((record) => record.status === 'returned').length;
  const totalIssuedQuantity = issuedRecords.reduce((sum, record) => sum + record.quantity, 0);

  const openReturnDialog = (record: IssueRequest) => {
    const returned = Number(record.quantity_returned ?? record.returned_quantity ?? 0);
    const remaining = Math.max(0, record.quantity - returned);
    setReturnRecord(record);
    setReturnQuantity(String(remaining || record.quantity));
    setReturnDate(today());
    setReturnNote('');
  };

  const closeReturnDialog = () => {
    if (returning) return;
    setReturnRecord(null);
    setReturnQuantity('');
    setReturnNote('');
  };

  const submitReturn = async () => {
    if (!returnRecord || returning) return;
    const quantity = Number(returnQuantity) || 0;
    const previouslyReturned = Number(returnRecord.quantity_returned ?? returnRecord.returned_quantity ?? 0);
    const remaining = Math.max(0, returnRecord.quantity - previouslyReturned);
    if (quantity <= 0) return toast.error('Enter a return quantity greater than zero');
    if (quantity > remaining) return toast.error(`Maximum returnable quantity is ${remaining.toLocaleString('en-IN')}`);
    if (!returnDate) return toast.error('Select the return date');
    if (!returnNote.trim()) return toast.error('Enter a return note');

    setReturning(true);
    try {
      const inventoryItem = findIssuedInventoryItem(items, returnRecord);
      const newStatus = quantity >= remaining ? 'returned' : 'partially_returned';
      if (returnRecord.backend_status !== 'approved') {
        const approvalResponse = await fetch(`${BASE_URL}/inventory/update_issue_request_status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_id: inventoryItem?.id || returnRecord.item_id,
            issue_id: returnRecord.issue_id,
            new_status: 'approved',
          }),
        });
        const approvalText = await approvalResponse.text();
        const approvalData: any = (() => {
          try { return approvalText ? JSON.parse(approvalText) : null; } catch { return null; }
        })();
        if (!approvalResponse.ok || !approvalData?.success) {
          throw new Error(approvalData?.message || approvalData?.detail || approvalText || 'Failed to approve the issue before return');
        }
      }
      const response = await fetch(`${BASE_URL}/inventory/return_issued_item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: inventoryItem?.id || returnRecord.item_id,
          issue_id: returnRecord.issue_id,
          new_status: newStatus,
          quanity: quantity,
          return_date: returnDate,
          return_note: returnNote.trim(),
        }),
      });
      const responseText = await response.text();
      const data: any = (() => {
        try { return responseText ? JSON.parse(responseText) : null; } catch { return null; }
      })();
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || data?.detail || responseText || 'Failed to record return entry');
      }
      onStockReturned(inventoryItem?.id || returnRecord.item_id, quantity);
      saveIssuedRecordOverride(returnRecord.issue_id, {
        return_date: returnDate,
        return_note: returnNote.trim(),
        quantity_returned: previouslyReturned + quantity,
      });
      toast.success(`${quantity.toLocaleString('en-IN')} returned to inventory`);
      setReturnRecord(null);
      setReturnQuantity('');
      setReturnNote('');
      await fetchRecords();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to record return entry');
    } finally {
      setReturning(false);
    }
  };

  const verifyAllocationHandover = async () => {
    if (!handoverRecord || recordActionLoading) return;
    if (handoverOtp.trim().length !== 4) return toast.error('Enter the four-digit handover OTP');
    if (!handoverRecord.allocation_otp || handoverOtp.trim() !== handoverRecord.allocation_otp) {
      return toast.error('The handover OTP is incorrect');
    }
    const inventoryItem = findIssuedInventoryItem(items, handoverRecord);
    if (!inventoryItem) return toast.error('The allocated inventory item could not be found');
    setRecordActionLoading(true);
    try {
      const response = await fetch(`${BASE_URL}/inventory/update_issue_request_status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: inventoryItem.id,
          issue_id: handoverRecord.issue_id,
          new_status: 'approved',
        }),
      });
      const responseText = await response.text();
      const data: any = (() => {
        try { return responseText ? JSON.parse(responseText) : null; } catch { return null; }
      })();
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || data?.detail || responseText || 'Failed to verify allocation handover');
      }
      const handoverDate = today();
      saveIssuedRecordOverride(handoverRecord.issue_id, {
        workflow_status: 'handed_over',
        handover_date: handoverDate,
      });
      setRecords((current) => current.map((record) => (
        record.issue_id === handoverRecord.issue_id
          ? { ...record, status: 'issued', backend_status: 'approved', workflow_status: 'handed_over', handover_date: handoverDate }
          : record
      )));
      onStockHandedOver(inventoryItem.id, handoverRecord.quantity, handoverRecord.issue_id);
      setHandoverRecord(null);
      setHandoverOtp('');
      toast.success('OTP verified. Item handover completed');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to verify allocation handover');
    } finally {
      setRecordActionLoading(false);
    }
  };

  const saveUtilization = () => {
    if (!utilizationRecord) return;
    const quantity = Number(utilizedQuantity) || 0;
    if (quantity < 0) return toast.error('Utilized quantity cannot be negative');
    if (quantity > utilizationRecord.quantity) {
      return toast.error(`Utilization cannot exceed ${utilizationRecord.quantity.toLocaleString('en-IN')}`);
    }
    if (!utilizationDate) return toast.error('Select the utilization date');
    if (!utilizationNote.trim()) return toast.error('Enter utilization details');
    const override: IssueRecordOverride = {
      utilized_quantity: quantity,
      utilization_date: utilizationDate,
      utilization_note: utilizationNote.trim(),
    };
    saveIssuedRecordOverride(utilizationRecord.issue_id, override);
    setRecords((current) => current.map((record) => (
      record.issue_id === utilizationRecord.issue_id ? { ...record, ...override } : record
    )));
    setUtilizationRecord(null);
    setUtilizedQuantity('');
    setUtilizationNote('');
    toast.success('Actual utilization recorded');
  };

  const saveEditedRecord = () => {
    if (!editRecord) return;
    const editableItem = findIssuedInventoryItem(items, editRecord);
    const editableItemIsReturnable = isIssueRequestReturnable(editRecord, editableItem);
    if (!editRecord.issue_start_date) return toast.error('Select the issue date');
    if (editableItemIsReturnable && editRecord.issue_end_date && editRecord.issue_end_date < editRecord.issue_start_date) {
      return toast.error('Return due date cannot be before the issue date');
    }
    if (editableItemIsReturnable && editRecord.return_date && editRecord.return_date < editRecord.issue_start_date) {
      return toast.error('Return date cannot be before the issue date');
    }
    const override: IssueRecordOverride = {
      issue_start_date: editRecord.issue_start_date,
      issue_end_date: editableItemIsReturnable ? editRecord.issue_end_date : '',
      purpose: editRecord.purpose || '',
      reference: editRecord.reference || '',
      received_by: editRecord.received_by || '',
      received_by_mobile: editRecord.received_by_mobile || '',
      remarks: editRecord.remarks || '',
      return_date: editableItemIsReturnable ? (editRecord.return_date || '') : '',
    };
    saveIssuedRecordOverride(editRecord.issue_id, override);
    setRecords((current) => current.map((record) => (
      record.issue_id === editRecord.issue_id ? { ...record, ...override } : record
    )));
    setEditRecord(null);
    toast.success('Issued record updated');
  };

  const deleteIssuedRecord = async () => {
    if (!deleteRecord || recordActionLoading) return;
    setRecordActionLoading(true);
    try {
      const inventoryItem = findIssuedInventoryItem(items, deleteRecord);
      const response = await fetch(`${BASE_URL}/inventory/update_issue_request_status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: inventoryItem?.id || deleteRecord.item_id,
          issue_id: deleteRecord.issue_id,
          new_status: 'rejected',
        }),
      });
      const responseText = await response.text();
      const data: any = (() => {
        try { return responseText ? JSON.parse(responseText) : null; } catch { return null; }
      })();
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || data?.detail || responseText || 'Failed to delete issued record');
      }
      setRecords((current) => current.filter((record) => record.issue_id !== deleteRecord.issue_id));
      setDeleteRecord(null);
      toast.success('Issued record removed');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete issued record');
    } finally {
      setRecordActionLoading(false);
    }
  };

  return (
    <>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['Allocation Records', issuedRecords.length.toLocaleString('en-IN')],
            ['Active Allocations', activeCount.toLocaleString('en-IN')],
            ['Fully Returned', returnedCount.toLocaleString('en-IN')],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
              <p className="mt-2 text-2xl font-black text-[#0D3A35]">{value}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
          <div className="border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-sm font-black text-slate-900">Allocated Item Register</h3>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {filteredRecords.length} record{filteredRecords.length === 1 ? '' : 's'} · {totalIssuedQuantity.toLocaleString('en-IN')} total units issued
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-sm font-semibold text-slate-400">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#0D3A35] border-t-transparent" />
              Loading allocated items…
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <ArrowUpFromLine className="mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm font-bold">No allocation records found</p>
            </div>
          ) : (
            <div className="w-full overflow-hidden">
              <table className="w-full table-fixed border-collapse text-xs">
                <colgroup>
                  <col className="w-[9%]" />
                  <col className="w-[13%]" />
                  <col className="w-[10%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[6%]" />
                  <col className="w-[8%]" />
                  <col className="w-[10%]" />
                  <col className="w-[12%]" />
                </colgroup>
                <thead>
                  <tr className="bg-[#0D3A35] text-white">
                    {['Allocation ID', 'Item', 'Assigned To', 'Destination', 'Allocation Date', 'Return Due', 'Return Date', 'Allocated Qty.', 'Status', 'Returnability', 'Action'].map((heading) => (
                      <th key={heading} className="px-2 py-3 text-center text-[10px] font-normal uppercase leading-tight tracking-wide text-white/75">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => {
                    const item = findIssuedInventoryItem(items, record);
                    const returned = Number(record.quantity_returned ?? record.returned_quantity ?? 0);
                    const remaining = Math.max(0, record.quantity - returned);
                    const returnable = isIssueRequestReturnable(record, item);
                    const canReturn = returnable
                      && remaining > 0
                      && (record.status === 'issued' || record.status === 'partially_returned');
                    const canVerifyHandover = record.status === 'allocated';
                    const canRecordUtilization = record.status === 'issued'
                      || record.status === 'partially_returned'
                      || record.status === 'returned';
                    const destination = record.recipient_name
                      || record.farm_id
                      || record.land_id
                      || record.vendor_id
                      || record.person_id
                      || '—';
                    return (
                      <tr key={record.issue_id} className="border-b border-slate-100 align-middle transition hover:bg-[#0D3A35]/[0.025]">
                        <td className="px-2 py-3 text-[11px] font-bold text-slate-500">
                          <p className="truncate" title={record.issue_id}>{record.issue_id || '—'}</p>
                        </td>
                        <td className="break-words px-2 py-3">
                          <p className="font-bold text-slate-800">{record.item_name || item?.name || record.item_id}</p>
                          <p className="mt-0.5 text-[11px] text-slate-400">{item?.sku || record.item_id} · {item?.unit || 'Unit not recorded'}</p>
                          {(record.purpose || record.reference) && (
                            <p className="mt-1 max-w-[240px] truncate text-[10px] text-slate-400" title={[record.purpose, record.reference].filter(Boolean).join(' · ')}>
                              {[record.purpose, record.reference].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </td>
                        <td className="break-words px-2 py-3 text-[11px] font-semibold text-slate-600">
                          {record.received_by || record.staff_id || '—'}
                          {record.received_by_mobile && <span className="mt-0.5 block text-[10px] text-slate-400">{record.received_by_mobile}</span>}
                        </td>
                        <td className="break-words px-2 py-3 text-[11px] font-semibold text-slate-600">
                          <span className="capitalize">{record.recipient_type || 'Person'}</span>
                          <span className="mt-0.5 block max-w-[180px] truncate text-[10px] text-slate-400" title={destination}>{destination}</span>
                        </td>
                        <td className="px-2 py-3 text-center text-[11px] text-slate-600">{formatDateDDMMYYYY(record.issue_start_date)}</td>
                        <td className="px-2 py-3 text-center text-[11px] text-slate-600">{formatDateDDMMYYYY(record.issue_end_date)}</td>
                        <td className="px-2 py-3 text-center text-[11px] text-slate-600">{formatDateDDMMYYYY(record.return_date || record.returned_at, '—')}</td>
                        <td className="px-2 py-3 text-center font-bold text-slate-800">
                          {record.quantity.toLocaleString('en-IN')} {item?.unit || ''}
                          {returned > 0 && <span className="mt-0.5 block text-[10px] font-semibold text-emerald-600">Returned: {returned.toLocaleString('en-IN')}</span>}
                        </td>
                        <td className="px-2 py-3 text-center">
                          <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ring-1', STATUS_PILL[record.status])}>
                            {record.status === 'issued' ? 'Handed Over' : record.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-center">
                          <span className={cn(
                            'inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold',
                            returnable ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500',
                          )}>
                            {returnable ? 'Returnable' : 'Non-returnable'}
                          </span>
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => setInfoRecord(record)}
                              title="View issued record"
                              aria-label={`View ${record.issue_id}`}
                              className="h-8 w-8 border-slate-200 text-slate-600 hover:border-[#0D3A35]/30 hover:bg-[#0D3A35]/5 hover:text-[#0D3A35]"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => setEditRecord({ ...record })}
                              title="Edit issued record"
                              aria-label={`Edit ${record.issue_id}`}
                              className="h-8 w-8 border-slate-200 text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => setDeleteRecord(record)}
                              title="Delete issued record"
                              aria-label={`Delete ${record.issue_id}`}
                              className="h-8 w-8 border-red-100 text-red-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            {canVerifyHandover && (
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() => { setHandoverRecord(record); setHandoverOtp(''); }}
                                title="Verify OTP and hand over item"
                                aria-label={`Verify handover for ${record.issue_id}`}
                                className="h-8 w-8 border-cyan-200 text-cyan-700 hover:bg-cyan-50"
                              >
                                <PackageCheck className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canRecordUtilization && (
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() => {
                                  setUtilizationRecord(record);
                                  setUtilizedQuantity(String(record.utilized_quantity ?? ''));
                                  setUtilizationDate(record.utilization_date || today());
                                  setUtilizationNote(record.utilization_note || '');
                                }}
                                title="Record actual utilization"
                                aria-label={`Record utilization for ${record.issue_id}`}
                                className="h-8 w-8 border-violet-200 text-violet-700 hover:bg-violet-50"
                              >
                                <FileCheck className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canReturn && (
                              <Button size="sm" variant="outline" onClick={() => openReturnDialog(record)} title="Record Return" aria-label={`Record return for ${record.issue_id}`} className="h-8 w-8 gap-1.5 border-emerald-200 px-0 font-bold text-emerald-700 hover:bg-emerald-50 2xl:w-auto 2xl:px-2.5">
                                <Undo2 className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">Return</span>
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={Boolean(handoverRecord)} onOpenChange={(open) => { if (!open && !recordActionLoading) { setHandoverRecord(null); setHandoverOtp(''); } }}>
        <DialogContent className="max-w-md overflow-hidden rounded-2xl border-0 bg-slate-50 p-0 shadow-[0_28px_80px_rgba(13,58,53,0.28)]">
          <DialogHeader className="bg-[#0D3A35] px-6 py-5 text-white">
            <DialogTitle className="flex items-center gap-2 text-lg font-black text-white"><PackageCheck className="h-5 w-5" />Verify Item Handover</DialogTitle>
            <p className="mt-1 text-xs font-medium text-white/65">Enter the OTP shared with the assigned receiver.</p>
          </DialogHeader>
          {handoverRecord && (
            <div className="space-y-5 px-6 py-5">
              <div className="rounded-xl border border-[#0D3A35]/10 bg-white p-4">
                <p className="text-sm font-black text-slate-900">{handoverRecord.item_name}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{handoverRecord.quantity.toLocaleString('en-IN')} allocated · {handoverRecord.recipient_name || handoverRecord.received_by || 'Receiver not recorded'}</p>
              </div>
              <Field label="Four-digit Handover OTP *">
                <InputOTP maxLength={4} value={handoverOtp} onChange={setHandoverOtp} containerClassName="justify-center">
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                  </InputOTPGroup>
                </InputOTP>
              </Field>
            </div>
          )}
          <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4">
            <Button variant="outline" onClick={() => { setHandoverRecord(null); setHandoverOtp(''); }} disabled={recordActionLoading}>Cancel</Button>
            <Button onClick={verifyAllocationHandover} disabled={recordActionLoading} className="gap-2 bg-[#0D3A35] font-bold text-white hover:bg-[#092e2a]"><ShieldCheck className="h-4 w-4" />{recordActionLoading ? 'Verifying…' : 'Verify & Hand Over'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(utilizationRecord)} onOpenChange={(open) => { if (!open) setUtilizationRecord(null); }}>
        <DialogContent className="max-w-lg overflow-hidden rounded-2xl border-0 bg-slate-50 p-0 shadow-[0_28px_80px_rgba(13,58,53,0.28)]">
          <DialogHeader className="bg-[#0D3A35] px-6 py-5 text-white">
            <DialogTitle className="flex items-center gap-2 text-lg font-black text-white"><FileCheck className="h-5 w-5" />Record Actual Utilization</DialogTitle>
            <p className="mt-1 text-xs font-medium text-white/65">Record how much of the handed-over allocation was actually utilized.</p>
          </DialogHeader>
          {utilizationRecord && (
            <div className="space-y-4 px-6 py-5">
              <div className="rounded-xl border border-[#0D3A35]/10 bg-white p-4">
                <p className="text-sm font-black text-slate-900">{utilizationRecord.item_name}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">Allocated quantity: {utilizationRecord.quantity.toLocaleString('en-IN')}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Actually Utilized Quantity *">
                  <Input type="number" min={0} max={utilizationRecord.quantity} step="any" value={utilizedQuantity} onChange={(event) => setUtilizedQuantity(event.target.value)} />
                </Field>
                <Field label="Utilization Date *">
                  <Input type="date" value={utilizationDate} onChange={(event) => setUtilizationDate(event.target.value)} />
                </Field>
              </div>
              <Field label="Utilization Details *">
                <textarea rows={4} value={utilizationNote} onChange={(event) => setUtilizationNote(event.target.value)} placeholder="Where and how the item was utilized" className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0D3A35] focus:ring-2 focus:ring-[#0D3A35]/15" />
              </Field>
            </div>
          )}
          <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4">
            <Button variant="outline" onClick={() => setUtilizationRecord(null)}>Cancel</Button>
            <Button onClick={saveUtilization} className="gap-2 bg-[#0D3A35] font-bold text-white hover:bg-[#092e2a]"><FileCheck className="h-4 w-4" />Save Utilization</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(infoRecord)} onOpenChange={(open) => { if (!open) setInfoRecord(null); }}>
        <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto rounded-2xl border-0 bg-slate-50 p-0 shadow-[0_28px_80px_rgba(13,58,53,0.28)]">
          <DialogHeader className="sticky top-0 z-20 bg-[#0D3A35] px-6 py-4 text-white">
            <button type="button" onClick={() => setInfoRecord(null)} aria-label="Close issued record details" className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 hover:bg-white/20">
              <X className="h-4 w-4" />
            </button>
            <DialogTitle className="flex items-center gap-2 pr-10 text-lg font-black text-white">
              <Info className="h-5 w-5" />Allocation Details
            </DialogTitle>
            <p className="mt-1 text-xs font-medium text-white/65">Complete information recorded against this stock issue.</p>
          </DialogHeader>
          {infoRecord && (() => {
            const item = findIssuedInventoryItem(items, infoRecord);
            const destination = infoRecord.recipient_name || infoRecord.farm_id || infoRecord.land_id || infoRecord.vendor_id || infoRecord.person_id || 'Not Recorded';
            const returnable = isIssueRequestReturnable(infoRecord, item);
            const recordedReturnedQuantity = Number(infoRecord.quantity_returned ?? infoRecord.returned_quantity ?? 0);
            const returnedQuantity = recordedReturnedQuantity || (infoRecord.status === 'returned' ? infoRecord.quantity : 0);
            const remainingQuantity = Math.max(0, infoRecord.quantity - returnedQuantity);
            const utilized = Number(infoRecord.utilized_quantity || 0);
            const allocationDetails = [
              ['Allocation ID', infoRecord.issue_id],
              ['Item', infoRecord.item_name || item?.name || infoRecord.item_id],
              ['Item Code', item?.sku || infoRecord.item_id],
              ['Allocated Quantity', `${infoRecord.quantity.toLocaleString('en-IN')} ${item?.unit || ''}`],
              ['Allocation Date', formatDateDDMMYYYY(infoRecord.allocation_date || infoRecord.issue_start_date, 'Not Recorded')],
              ['Allocation Status', infoRecord.status === 'issued' ? 'Handed Over' : infoRecord.status.replace(/_/g, ' ')],
              ['Handover OTP', infoRecord.status === 'allocated' ? (infoRecord.allocation_otp || 'Not Recorded') : 'Verified'],
              ['Handover Date', formatDateDDMMYYYY(infoRecord.handover_date, 'Not Recorded')],
              ['Returnability', returnable ? 'Returnable' : 'Non-returnable'],
              ['Destination Type', infoRecord.recipient_type || 'Person'],
              ['Destination', destination],
              ['Received By', infoRecord.received_by || infoRecord.staff_id || 'Not Recorded'],
              ['Mobile Number', infoRecord.received_by_mobile || 'Not Recorded'],
              ['Purpose / Usage', infoRecord.purpose || 'Not Recorded'],
              ['Reference', infoRecord.reference || 'Not Recorded'],
              ['Batch Number', infoRecord.batch_number || 'Not Recorded'],
              ['Issued By', infoRecord.issued_by || 'Not Recorded'],
            ];
            const returnDetails = [
              ['Return Due', returnable ? formatDateDDMMYYYY(infoRecord.issue_end_date, 'Not Recorded') : 'Not Applicable'],
              ['Return Date', formatDateDDMMYYYY(infoRecord.return_date || infoRecord.returned_at, 'Not Recorded')],
              ['Returned Quantity', `${returnedQuantity.toLocaleString('en-IN')} ${item?.unit || ''}`],
              ['Pending Quantity', `${remainingQuantity.toLocaleString('en-IN')} ${item?.unit || ''}`],
              ['Return Status', !returnable
                ? 'Not Applicable'
                : infoRecord.status === 'returned'
                  ? 'Fully Returned'
                  : infoRecord.status === 'partially_returned'
                    ? 'Partially Returned'
                    : 'Awaiting Return'],
              ['Return Note', infoRecord.return_note || 'Not Recorded'],
            ];
            const utilizationDetails = [
              ['Actual Utilized Quantity', `${utilized.toLocaleString('en-IN')} ${item?.unit || ''}`],
              ['Unutilized Quantity', `${Math.max(0, infoRecord.quantity - utilized).toLocaleString('en-IN')} ${item?.unit || ''}`],
              ['Utilization Date', formatDateDDMMYYYY(infoRecord.utilization_date, 'Not Recorded')],
              ['Utilization Status', utilized <= 0 ? 'Not Recorded' : utilized >= infoRecord.quantity ? 'Fully Utilized' : 'Partially Utilized'],
              ['Utilization Details', infoRecord.utilization_note || 'Not Recorded'],
            ];
            const DetailSection = ({ title, rows }: { title: string; rows: string[][] }) => (
              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 bg-slate-100 px-4 py-2.5">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.08em] text-[#0D3A35]">{title}</h3>
                </div>
                <div className="grid gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-3">
                  {rows.map(([label, value]) => (
                    <div key={label} className="bg-white px-4 py-3">
                      <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</p>
                      <p className="mt-1 text-sm font-semibold capitalize text-slate-800">{value}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
            return (
              <div className="space-y-4 px-6 py-4">
                <DetailSection title="Allocation & Handover Details" rows={allocationDetails} />
                <DetailSection title="Actual Utilization" rows={utilizationDetails} />
                <DetailSection title="Return Details" rows={returnDetails} />
                {infoRecord.remarks && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">Remarks</p>
                    <p className="mt-1 text-sm text-slate-700">{infoRecord.remarks}</p>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter className="sticky bottom-0 z-20 border-t border-slate-200 bg-white px-6 py-3">
            <Button variant="outline" onClick={() => setInfoRecord(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editRecord)} onOpenChange={(open) => { if (!open) setEditRecord(null); }}>
        <DialogContent className="max-w-2xl overflow-hidden rounded-2xl border-0 bg-slate-50 p-0 shadow-[0_28px_80px_rgba(13,58,53,0.28)]">
          <DialogHeader className="bg-[#0D3A35] px-6 py-5 text-white">
            <DialogTitle className="flex items-center gap-2 text-lg font-black text-white">
              <Edit3 className="h-5 w-5" />Edit Issued Record
            </DialogTitle>
            <p className="mt-1 text-xs font-medium text-white/65">Update the operational details for this issue entry.</p>
          </DialogHeader>
          {editRecord && (
            <div className="space-y-4 px-6 py-5">
              <div className="rounded-xl border border-[#0D3A35]/10 bg-white p-4">
                <p className="text-sm font-black text-slate-900">{editRecord.item_name}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{editRecord.issue_id} · Quantity {editRecord.quantity.toLocaleString('en-IN')}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Allocation Date *">
                  <Input type="date" value={editRecord.issue_start_date || ''} onChange={(event) => setEditRecord((current) => current ? { ...current, issue_start_date: event.target.value } : current)} />
                </Field>
                {isIssueRequestReturnable(editRecord, findIssuedInventoryItem(items, editRecord)) && (
                  <>
                    <Field label="Return Due">
                      <Input type="date" min={editRecord.issue_start_date || undefined} value={editRecord.issue_end_date || ''} onChange={(event) => setEditRecord((current) => current ? { ...current, issue_end_date: event.target.value } : current)} />
                    </Field>
                    <Field label="Return Date">
                      <Input type="date" min={editRecord.issue_start_date || undefined} value={editRecord.return_date || ''} onChange={(event) => setEditRecord((current) => current ? { ...current, return_date: event.target.value } : current)} />
                    </Field>
                  </>
                )}
                <Field label="Received By">
                  <Input value={editRecord.received_by || ''} onChange={(event) => setEditRecord((current) => current ? { ...current, received_by: event.target.value } : current)} placeholder="Receiver name" />
                </Field>
                <Field label="Mobile Number">
                  <Input value={editRecord.received_by_mobile || ''} onChange={(event) => setEditRecord((current) => current ? { ...current, received_by_mobile: event.target.value } : current)} placeholder="Contact number" />
                </Field>
                <Field label="Purpose / Usage">
                  <Input value={editRecord.purpose || ''} onChange={(event) => setEditRecord((current) => current ? { ...current, purpose: event.target.value } : current)} placeholder="Purpose of issue" />
                </Field>
                <Field label="Reference">
                  <Input value={editRecord.reference || ''} onChange={(event) => setEditRecord((current) => current ? { ...current, reference: event.target.value } : current)} placeholder="Task or work order" />
                </Field>
              </div>
              <Field label="Remarks">
                <textarea rows={3} value={editRecord.remarks || ''} onChange={(event) => setEditRecord((current) => current ? { ...current, remarks: event.target.value } : current)} placeholder="Additional notes" className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0D3A35] focus:ring-2 focus:ring-[#0D3A35]/15" />
              </Field>
            </div>
          )}
          <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4">
            <Button variant="outline" onClick={() => setEditRecord(null)}>Cancel</Button>
            <Button onClick={saveEditedRecord} className="gap-2 bg-[#0D3A35] font-bold text-white hover:bg-[#092e2a]"><Edit3 className="h-4 w-4" />Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteRecord)} onOpenChange={(open) => { if (!open && !recordActionLoading) setDeleteRecord(null); }}>
        <DialogContent className="max-w-md overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-[0_28px_80px_rgba(15,23,42,0.25)]">
          <DialogHeader className="bg-red-600 px-6 py-5 text-white">
            <DialogTitle className="flex items-center gap-2 text-lg font-black text-white"><Trash2 className="h-5 w-5" />Delete Issued Record</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5">
            <p className="text-sm leading-6 text-slate-600">Remove issue <strong className="text-slate-900">{deleteRecord?.issue_id}</strong> for <strong className="text-slate-900">{deleteRecord?.item_name}</strong> from the issued register?</p>
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">The transaction will be retained as rejected for audit history.</p>
          </div>
          <DialogFooter className="border-t border-slate-200 px-6 py-4">
            <Button variant="outline" onClick={() => setDeleteRecord(null)} disabled={recordActionLoading}>Cancel</Button>
            <Button onClick={deleteIssuedRecord} disabled={recordActionLoading} className="gap-2 bg-red-600 font-bold text-white hover:bg-red-700"><Trash2 className="h-4 w-4" />{recordActionLoading ? 'Deleting…' : 'Delete'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(returnRecord)} onOpenChange={(open) => { if (!open) closeReturnDialog(); }}>
        <DialogContent className="max-w-lg overflow-hidden rounded-2xl border-0 bg-slate-50 p-0 shadow-[0_28px_80px_rgba(13,58,53,0.28)]">
          <DialogHeader className="bg-[#0D3A35] px-6 py-5 text-white">
            <DialogTitle className="flex items-center gap-2 text-lg font-black text-white">
              <Undo2 className="h-5 w-5" />Record Return Entry
            </DialogTitle>
            <p className="mt-1 text-xs font-medium text-white/65">Return issued stock to inventory and update its ledger.</p>
          </DialogHeader>
          {returnRecord && (() => {
            const item = findIssuedInventoryItem(items, returnRecord);
            const returned = Number(returnRecord.quantity_returned ?? returnRecord.returned_quantity ?? 0);
            const remaining = Math.max(0, returnRecord.quantity - returned);
            return (
              <div className="space-y-4 px-6 py-5">
                <div className="rounded-xl border border-[#0D3A35]/10 bg-white p-4">
                  <p className="text-sm font-black text-slate-900">{returnRecord.item_name || item?.name}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Issue {returnRecord.issue_id} · {remaining.toLocaleString('en-IN')} {item?.unit || ''} remaining</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label={`Return Quantity (${item?.unit || 'units'}) *`}>
                    <Input type="number" min={0} max={remaining} step="any" value={returnQuantity} onChange={(event) => setReturnQuantity(event.target.value)} />
                  </Field>
                  <Field label="Return Date *">
                    <Input type="date" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} />
                  </Field>
                </div>
                <Field label="Return Note *">
                  <textarea
                    rows={3}
                    value={returnNote}
                    onChange={(event) => setReturnNote(event.target.value)}
                    placeholder="Condition, reason, and return remarks"
                    className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0D3A35] focus:ring-2 focus:ring-[#0D3A35]/15"
                  />
                </Field>
              </div>
            );
          })()}
          <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4">
            <Button variant="outline" onClick={closeReturnDialog} disabled={returning}>Cancel</Button>
            <Button onClick={submitReturn} disabled={returning} className="gap-2 bg-[#0D3A35] font-bold text-white hover:bg-[#092e2a]">
              <Undo2 className="h-4 w-4" />{returning ? 'Recording…' : 'Record Return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const IssuedItemsModal = ({
  open,
  items,
  onClose,
}: {
  open: boolean;
  items: StockItem[];
  onClose: () => void;
}) => {
  const [requests, setRequests] = useState<IssueRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<IssueStatusTab>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/inventory/get_issue_requests`);
      const data: any = await res.json().catch(() => null);
      if (res.ok && data?.success && Array.isArray(data?.issue_requests)) {
        const normalizedRequests = data.issue_requests.map(normalizeIssueRequest);
        setRequests(normalizedRequests);
        const qtys: Record<string, number> = {};
        normalizedRequests.forEach((r: IssueRequest) => { qtys[r.issue_id] = r.quantity; });
        setReturnQtys(qtys);
      } else {
        toast.error(data?.message || 'Failed to fetch issue requests');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to fetch issue requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchRequests();
      setActiveTab('all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const getItemImage = (record: IssueRequest) =>
    findIssuedInventoryItem(items, record)?.imageUrl || PLACEHOLDER_IMG;

  const filtered = activeTab === 'all' ? requests : requests.filter((r) => r.status === activeTab);
  const countFor = (key: IssueStatusTab) =>
    key === 'all' ? requests.length : requests.filter((r) => r.status === key).length;

  const handleIssue = async (req: IssueRequest) => {
    setActionLoading(req.issue_id);
    try {
      const inventoryItem = findIssuedInventoryItem(items, req);
      const res = await fetch(`${BASE_URL}/inventory/update_issue_request_status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: req.item_id,
          issue_id: req.issue_id,
          new_status: 'approved',
          stock_issue_method: inventoryItem?.stockIssueMethod || '',
        }),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || 'Failed to issue item');
      toast.success(`"${req.item_name}" issued successfully`);
      await fetchRequests();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to issue item');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReturn = async (req: IssueRequest) => {
    const inventoryItem = findIssuedInventoryItem(items, req);
    if (!isIssueRequestReturnable(req, inventoryItem)) {
      toast.error('This item is classified as non-returnable');
      return;
    }
    const qtyReturned = returnQtys[req.issue_id] ?? req.quantity;
    if (!qtyReturned || qtyReturned <= 0) return toast.error('Enter a valid return quantity');
    setActionLoading(req.issue_id);
    try {
      if (req.backend_status !== 'approved') {
        const approvalResponse = await fetch(`${BASE_URL}/inventory/update_issue_request_status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_id: inventoryItem?.id || req.item_id,
            issue_id: req.issue_id,
            new_status: 'approved',
          }),
        });
        const approvalText = await approvalResponse.text();
        const approvalData: any = (() => {
          try { return approvalText ? JSON.parse(approvalText) : null; } catch { return null; }
        })();
        if (!approvalResponse.ok || !approvalData?.success) {
          throw new Error(approvalData?.message || approvalData?.detail || approvalText || 'Failed to approve the issue before return');
        }
      }
      const res = await fetch(`${BASE_URL}/inventory/return_issued_item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: inventoryItem?.id || req.item_id,
          issue_id: req.issue_id,
          new_status: qtyReturned >= req.quantity ? 'returned' : 'partially_returned',
          quanity: qtyReturned,
        }),
      });
      const responseText = await res.text();
      const data: any = (() => {
        try { return responseText ? JSON.parse(responseText) : null; } catch { return null; }
      })();
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.detail || responseText || 'Failed to return item');
      }
      saveIssuedRecordOverride(req.issue_id, {
        return_date: today(),
        quantity_returned: qtyReturned,
      });
      toast.success(`"${req.item_name}" marked as returned`);
      await fetchRequests();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to return item');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-purple-700">
            <ClipboardList className="w-5 h-5" />
            Issue Requests
          </DialogTitle>
          <p className="text-sm text-gray-500">Manage all inventory issue requests</p>
        </DialogHeader>

        {/* ── Status filter tabs ── */}
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = countFor(tab.key);
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors',
                  isActive ? tab.active : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                )}
              >
                {tab.label}
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  isActive ? tab.badge : 'bg-gray-100 text-gray-600'
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Content ── */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
            <ClipboardList className="w-10 h-10 opacity-30" />
            <p className="text-sm font-medium">No requests in this category</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 w-14">Image</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Item Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Issued To</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 min-w-[210px]">Issue Timeline</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Qty</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {filtered.map((req) => {
                    const progress = calcProgress(req.issue_start_date, req.issue_end_date);
                    const isOverdue = new Date(req.issue_end_date).getTime() < Date.now();
                    const isActing = actionLoading === req.issue_id;
                    const inventoryItem = findIssuedInventoryItem(items, req);
                    const isReturnable = isIssueRequestReturnable(req, inventoryItem);

                    return (
                      <tr key={req.issue_id} className="hover:bg-gray-50 transition-colors">

                        {/* Image */}
                        <td className="px-4 py-3">
                          <img
                            src={getItemImage(req)}
                            alt={req.item_name}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_IMG; }}
                            className="w-10 h-10 rounded-lg object-cover border border-gray-200"
                          />
                        </td>

                        {/* Item Name */}
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">{req.item_name}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">{req.item_id}</p>
                        </td>

                        {/* Issued To */}
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700 ring-1 ring-purple-100 max-w-[130px] truncate"
                            title={req.staff_id}
                          >
                            {req.staff_id.slice(0, 8)}…
                          </span>
                        </td>

                        {/* Timeline */}
                        <td className="px-4 py-3">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] text-gray-500">
                              <span>{formatDateDDMMYYYY(req.issue_start_date)}</span>
                              <span className={cn('font-semibold', req.status === 'issued' && isOverdue ? 'text-red-600' : 'text-gray-500')}>
                                {req.status === 'issued' && isOverdue ? 'Overdue' : `${Math.round(progress)}%`}
                              </span>
                              <span>{formatDateDDMMYYYY(req.issue_end_date)}</span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all',
                                  req.status === 'returned'           ? 'bg-emerald-500' :
                                  req.status === 'partially_returned' ? 'bg-violet-500'  :
                                  req.status === 'rejected'           ? 'bg-red-400'     :
                                  isOverdue                           ? 'bg-red-500'     :
                                  progress >= 75                      ? 'bg-amber-500'   : 'bg-purple-500'
                                )}
                                style={{ width: `${Math.min(100, progress)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Qty */}
                        <td className="px-4 py-3 font-bold text-gray-800">
                          {req.quantity.toLocaleString()}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 capitalize', STATUS_PILL[req.status])}>
                            {req.status.replace(/_/g, ' ')}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="px-4 py-3">
                          {req.status === 'pending' && (
                            <Button
                              size="sm"
                              onClick={() => handleIssue(req)}
                              disabled={isActing}
                              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm whitespace-nowrap"
                            >
                              <PackageCheck className="w-3.5 h-3.5" />
                              {isActing ? 'Issuing…' : 'Issue'}
                            </Button>
                          )}

                          {req.status === 'issued' && isReturnable && (
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="number"
                                min={1}
                                max={req.quantity}
                                value={returnQtys[req.issue_id] ?? req.quantity}
                                onChange={(e) =>
                                  setReturnQtys((prev) => ({ ...prev, [req.issue_id]: Number(e.target.value) }))
                                }
                                className="h-8 w-16 text-xs text-center px-1"
                                disabled={isActing}
                              />
                              <Button
                                size="sm"
                                onClick={() => handleReturn(req)}
                                disabled={isActing}
                                className="gap-1 bg-white border border-gray-200 text-gray-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 shadow-sm whitespace-nowrap"
                              >
                                <Undo2 className="w-3.5 h-3.5" />
                                {isActing ? 'Returning…' : 'Return'}
                              </Button>
                            </div>
                          )}

                          {req.status === 'issued' && !isReturnable && (
                            <span className="text-xs font-medium text-slate-400">Non-returnable</span>
                          )}

                          {(req.status === 'returned' || req.status === 'partially_returned' || req.status === 'rejected') && (
                            <span className="text-xs text-gray-400 italic">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────
// DAMAGE ENTRY MODAL
// ─────────────────────────────────────────────────────────────
type DamageType = 'before_application' | 'inventory';

const DAMAGE_OPTIONS: { value: DamageType; label: string; desc: string }[] = [
  { value: 'before_application', label: 'Damage Before Application', desc: 'Item was damaged at the farm before being applied — select the farm below' },
  { value: 'inventory',          label: 'Damage in Inventory',       desc: 'Item was damaged while in storage' },
];

const DamageEntryModal = ({
  item,
  onClose,
}: {
  item: StockItem;
  onClose: () => void;
}) => {
  const [damageQty, setDamageQty]       = useState(0);
  const [perUnitCost, setPerUnitCost]   = useState(0);
  const [reason, setReason]             = useState('');
  const [damageType, setDamageType]     = useState<DamageType | ''>('');

  const [farms, setFarms]               = useState<FarmOption[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(false);
  const [selectedFarmId, setSelectedFarmId] = useState('');

  const [saving, setSaving] = useState(false);

  const totalLoss = damageQty > 0 && perUnitCost > 0 ? damageQty * perUnitCost : 0;

  // Fetch farms only when "before_application" damage type selected
  useEffect(() => {
    if (damageType !== 'before_application') { setFarms([]); setSelectedFarmId(''); return; }
    const fetchFarms = async () => {
      setFarmsLoading(true);
      try {
        const res  = await fetch(`${BASE_URL}/admin_ops_requests/get_farm_and_farmer`);
        const data: any = await res.json().catch(() => null);
        if (res.ok && Array.isArray(data?.farm_farmer_mapping)) {
          setFarms(data.farm_farmer_mapping.map((f: any) => ({
            farm_id:    String(f.farm_id ?? ''),
            owner_name: String(f.owner_name ?? ''),
            crop_type:  String(f.crop_type ?? ''),
            area:       Number(f.area) || 0,
          })));
        }
      } catch { /* silently fail */ }
      finally { setFarmsLoading(false); }
    };
    fetchFarms();
  }, [damageType]);

  const handleSave = async () => {
    if (damageQty <= 0)    return toast.error('Quantity damaged must be greater than 0');
    if (perUnitCost <= 0)  return toast.error('Per unit cost must be greater than 0');
    if (!damageType)       return toast.error('Please select a damage type');
    if (damageType === 'before_application' && !selectedFarmId) return toast.error('Please select the farm');
    if (!reason.trim())    return toast.error('Please enter a reason for damage');
    setSaving(true);
    try {
      const otherDetails: Record<string, string> =
        damageType === 'before_application'
          ? { damage_type: 'Damage before Application', farm_id: selectedFarmId }
          : { damage_type: 'Damage in inventory' };
      const res  = await fetch(`${BASE_URL}/inventory/item_damage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id:             item.id,
          quantity:            damageQty,
          per_unit_cost:       perUnitCost,
          damage_description:  reason.trim(),
          other_details:       otherDetails,
        }),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || 'Failed to record damage');
      toast.success(`Damage of ${damageQty} ${item.unit} recorded for "${item.name}"`);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to record damage');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <ShieldAlert className="w-5 h-5" />
            Record Damage
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-500 -mt-1">Log damaged inventory and calculate total loss.</p>

        {/* Item info bar */}
        <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-800">{item.name}</p>
            <p className="text-xs text-gray-400">{item.sku}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Current Stock</p>
            <p className="font-bold text-gray-800">{item.currentStock} {item.unit}</p>
          </div>
        </div>

        <div className="space-y-3">
          {/* Damage type */}
          <Field label="Damage Type">
            <div className="space-y-2">
              {DAMAGE_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                    damageType === opt.value
                      ? 'border-red-400 bg-red-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="damageType"
                    value={opt.value}
                    checked={damageType === opt.value}
                    onChange={() => setDamageType(opt.value)}
                    className="mt-0.5 accent-red-600"
                  />
                  <div>
                    <p className={`text-sm font-medium ${damageType === opt.value ? 'text-red-700' : 'text-gray-700'}`}>
                      {opt.label}
                    </p>
                    <p className="text-[11px] text-gray-400">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </Field>

          {/* Farm dropdown — only for before_application */}
          {damageType === 'before_application' && (
            <Field label="Farm Where Damage Occurred">
              <div className="relative">
                <select
                  className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500 pr-8 disabled:bg-gray-50 disabled:text-gray-400"
                  value={selectedFarmId}
                  onChange={e => setSelectedFarmId(e.target.value)}
                  disabled={farmsLoading}
                >
                  <option value="">{farmsLoading ? 'Loading farms…' : 'Select farm'}</option>
                  {farms.map(f => (
                    <option key={f.farm_id} value={f.farm_id}>
                      {f.owner_name} — {f.crop_type} — {f.area} acres
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </Field>
          )}

          {/* Quantity damaged */}
          <Field label={`Quantity Damaged (${item.unit})`}>
            <Input
              type="number"
              min={1}
              max={item.currentStock}
              value={damageQty || ''}
              onChange={e => setDamageQty(Number(e.target.value))}
              placeholder="0"
            />
          </Field>

          {/* Per unit cost */}
          <Field label="Per Unit Cost (₹)">
            <Input
              type="number"
              min={0}
              value={perUnitCost || ''}
              onChange={e => setPerUnitCost(Number(e.target.value))}
              placeholder="0.00"
            />
          </Field>

          {/* Reason */}
          <Field label="Reason for Damage">
            <Input
              placeholder="Describe how the damage occurred…"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </Field>

          {/* Total Loss card */}
          <div className={`rounded-lg border px-4 py-3 flex items-center justify-between transition-colors ${
            totalLoss > 0 ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'
          }`}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total Loss</p>
              <p className={`text-2xl font-extrabold leading-tight ${totalLoss > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                ₹{totalLoss.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </p>
            </div>
            {totalLoss > 0 && (
              <div className="text-right text-[11px] text-red-400 space-y-0.5">
                <p>{damageQty} {item.unit}</p>
                <p>× ₹{perUnitCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Recording…' : 'Record Damage'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────
// RETURN ENTRY MODAL
// ─────────────────────────────────────────────────────────────
type FarmOption = {
  farm_id: string;
  owner_name: string;
  crop_type: string;
  area: number;
};

type FarmLedgerEntry = {
  voucher_number: string;
  date: string;
  input: number;
  output: number;
  amount: number;
  unit: string;
  description: string;
  investment: number;
  item_description: { item_code: string; item_unit: string; item_name: string };
};

const ReturnEntryModal = ({
  item,
  onClose,
}: {
  item: StockItem;
  onClose: () => void;
}) => {
  const [farms, setFarms]               = useState<FarmOption[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(false);
  const [selectedFarmId, setSelectedFarmId] = useState('');

  const [ledger, setLedger]               = useState<FarmLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState('');

  const [returnQty, setReturnQty] = useState(0);
  const [note, setNote]           = useState('');
  const [saving, setSaving]       = useState(false);

  // Fetch all farms on mount
  useEffect(() => {
    const fetchFarms = async () => {
      setFarmsLoading(true);
      try {
        const res  = await fetch(`${BASE_URL}/admin_ops_requests/get_farm_and_farmer`);
        const data: any = await res.json().catch(() => null);
        if (res.ok && Array.isArray(data?.farm_farmer_mapping)) {
          setFarms(data.farm_farmer_mapping.map((f: any) => ({
            farm_id:    String(f.farm_id ?? ''),
            owner_name: String(f.owner_name ?? ''),
            crop_type:  String(f.crop_type ?? ''),
            area:       Number(f.area) || 0,
          })));
        }
      } catch { /* silently fail */ }
      finally { setFarmsLoading(false); }
    };
    fetchFarms();
  }, []);

  // Fetch investment ledger when farm changes
  useEffect(() => {
    if (!selectedFarmId) { setLedger([]); setSelectedVoucher(''); setReturnQty(0); return; }
    const fetchLedger = async () => {
      setLedgerLoading(true);
      setLedger([]);
      setSelectedVoucher('');
      setReturnQty(0);
      try {
        const res  = await fetch(`${BASE_URL}/inventory/get_farm_investment_ledger/${selectedFarmId}`);
        const data: any = await res.json().catch(() => null);
        if (res.ok && data?.success && Array.isArray(data?.ledger) && data.ledger.length > 0) {
          setLedger(data.ledger);
        }
      } catch { /* silently fail */ }
      finally { setLedgerLoading(false); }
    };
    fetchLedger();
  }, [selectedFarmId]);

  const selectedEntry = ledger.find(e => e.voucher_number === selectedVoucher);

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return iso; }
  };

  const handleSave = async () => {
    if (!selectedFarmId)    return toast.error('Please select a farm');
    if (!selectedVoucher)   return toast.error('Please select a ledger entry');
    if (returnQty <= 0)     return toast.error('Return quantity must be greater than 0');
    setSaving(true);
    try {
      const res  = await fetch(`${BASE_URL}/inventory/inventory_item_return_ledger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investment:       selectedEntry?.investment ?? 0,
          input:            returnQty,
          item_description: selectedEntry?.item_description ?? {},
          farm_id:          selectedFarmId,
          unit:             selectedEntry?.unit ?? item.unit,
          voucher_number:   selectedVoucher,
        }),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || 'Failed to submit return entry');
      toast.success(`Return of ${returnQty} ${item.unit} recorded for "${item.name}"`);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to submit return entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-600">
            <Undo2 className="w-5 h-5" />
            Return Entry
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-500 -mt-1">Select the farm and ledger entry for the return.</p>

        {/* Item info bar */}
        <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-800">{item.name}</p>
            <p className="text-xs text-gray-400">{item.sku}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Current Stock</p>
            <p className="font-bold text-gray-800">{item.currentStock} {item.unit}</p>
          </div>
        </div>

        <div className="space-y-3">
          {/* Step 1 — Farm */}
          <Field label="Step 1 · Select Farm">
            <div className="relative">
              <select
                className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 pr-8 disabled:bg-gray-50 disabled:text-gray-400"
                value={selectedFarmId}
                onChange={e => setSelectedFarmId(e.target.value)}
                disabled={farmsLoading}
              >
                <option value="">{farmsLoading ? 'Loading farms…' : 'Select a farm'}</option>
                {farms.map(f => (
                  <option key={f.farm_id} value={f.farm_id}>
                    {f.owner_name} — {f.crop_type} — {f.area} acres
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </Field>

          {/* Step 2 — Ledger entry (shown after farm selected) */}
          {selectedFarmId && (
            ledgerLoading ? (
              <div className="flex items-center justify-center gap-2 py-5 text-sm text-gray-400">
                <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                Loading investment ledger…
              </div>
            ) : ledger.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-5 text-center">
                <p className="text-sm text-gray-400 font-medium">No investments found for this farm</p>
                <p className="text-xs text-gray-300 mt-0.5">No items have been sent to this farm yet</p>
              </div>
            ) : (
              <Field label="Step 2 · Select Ledger Entry">
                <div className="relative">
                  <select
                    className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 pr-8"
                    value={selectedVoucher}
                    onChange={e => {
                      setSelectedVoucher(e.target.value);
                      const entry = ledger.find(l => l.voucher_number === e.target.value);
                      if (entry) setReturnQty(entry.input || 1);
                    }}
                  >
                    <option value="">Select an entry</option>
                    {ledger.map(e => (
                      <option key={e.voucher_number} value={e.voucher_number}>
                        {e.item_description?.item_name?.trim()} — {e.input} {e.unit} — {fmtDate(e.date)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>

                {/* Entry detail card */}
                {selectedEntry && (() => {
                  const perUnit = selectedEntry.input > 0
                    ? selectedEntry.investment / selectedEntry.input
                    : selectedEntry.output > 0
                      ? selectedEntry.investment / selectedEntry.output
                      : null;
                  return (
                    <div className="mt-2 rounded-lg border border-orange-100 bg-orange-50 px-3 py-2.5 space-y-1">
                      <p className="text-xs font-semibold text-orange-800">{selectedEntry.item_description?.item_name?.trim()}</p>
                      <div className="flex items-center justify-between text-[11px] text-orange-600">
                        <span className="font-mono">{selectedEntry.item_description?.item_code}</span>
                        <span className="font-semibold">
                          {selectedEntry.input} {selectedEntry.unit} · ₹{selectedEntry.amount.toLocaleString('en-IN')}
                        </span>
                      </div>
                      {perUnit !== null && (
                        <p className="text-[11px] text-orange-500 font-medium">
                          ₹{perUnit.toLocaleString('en-IN', { maximumFractionDigits: 2 })} / {selectedEntry.unit}
                        </p>
                      )}
                      <p className="text-[10px] text-orange-400">{fmtDate(selectedEntry.date)}</p>
                    </div>
                  );
                })()}
              </Field>
            )
          )}

          {/* Step 3 — Qty + Note (shown after entry selected) */}
          {selectedVoucher && (
            <>
              <Field label={`Step 3 · Return Quantity (${item.unit})`}>
                <Input
                  type="number"
                  min={1}
                  max={selectedEntry?.input ?? undefined}
                  value={returnQty || ''}
                  onChange={e => setReturnQty(Number(e.target.value))}
                  placeholder="0"
                />
                {selectedEntry && (
                  <p className="text-[11px] text-gray-400 mt-0.5">Originally issued: {selectedEntry.input} {selectedEntry.unit}</p>
                )}
              </Field>
              <Field label="Note (optional)">
                <Input
                  placeholder="Reason for return, condition, etc."
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </Field>
            </>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-orange-600 hover:bg-orange-700 text-white"
            onClick={handleSave}
            disabled={saving || !selectedVoucher}
          >
            {saving ? 'Submitting…' : 'Submit Return'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────
// SMALL HELPERS
// ─────────────────────────────────────────────────────────────
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-medium text-gray-500">{label}</label>
    {children}
  </div>
);

const StockIssueMethodField = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => {
  const selectedMethod = getStockIssueMethodOption(value);

  return (
    <Field label="Stock Issue Method *">
      <div className="relative">
        <select
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="" disabled>Select stock issue method</option>
          {STOCK_ISSUE_METHODS.map((method) => (
            <option key={method.value} value={method.value}>{method.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      </div>
      {selectedMethod && (
        <div className="mt-1.5 rounded-lg border border-[#0D3A35]/10 bg-[#0D3A35]/5 px-3 py-2">
          <p className="text-xs font-semibold text-[#0D3A35]">{selectedMethod.explanation}</p>
          <p className="mt-1 text-[11px] font-medium text-slate-500">
            <span className="font-bold text-slate-600">Example:</span> {selectedMethod.example}
          </p>
        </div>
      )}
    </Field>
  );
};

const SelectField = ({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) => (
  <div className="relative">
    <select
      className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 pr-8"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
  </div>
);

// ─────────────────────────────────────────────────────────────
// FARMS OVERVIEW MAP — all farm boundaries on one satellite map
// ─────────────────────────────────────────────────────────────
const FARM_MAP_COLORS = ['#0D3A35', '#f59e0b', '#2563eb', '#dc2626', '#7c3aed', '#059669', '#db2777', '#0ea5e9'];

const FitAllBounds = ({ coords }: { coords: [number, number][] }) => {
  const map = useMap();
  useEffect(() => {
    if (coords.length > 0) {
      map.fitBounds(L.latLngBounds(coords as L.LatLngTuple[]), { padding: [24, 24] });
    }
  }, [map, coords]);
  return null;
};

// Leaflet measures its container once on mount and caches that size — if the
// container later resizes (e.g. a layout change widens its column) without this,
// the map keeps rendering at the old size, leaving a blank gray strip.
const MapResizeHandler = () => {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    map.invalidateSize();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
};

const farmCentroid = (coords: [number, number][]): [number, number] => [
  coords.reduce((sum, c) => sum + c[0], 0) / coords.length,
  coords.reduce((sum, c) => sum + c[1], 0) / coords.length,
];

const farmDotIcon = (color: string) => L.divIcon({
  className: 'farm-marker-icon',
  html: `<div style="width:12px;height:12px;border-radius:9999px;background-color:${color};border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const STORE_MARKER_COLOR = '#0D3A35';
const STORE_LINK_COLOR = '#facc15';

const storePinIcon = L.divIcon({
  className: 'store-marker-icon',
  html: `<div style="width:22px;height:22px;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);background-color:${STORE_MARKER_COLOR};border:2px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.45);"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

const FarmsOverviewMap = ({
  farms,
  stores,
  selectedStoreName,
}: {
  farms: RequestMapFarm[];
  stores: StoreEntry[];
  selectedStoreName?: string;
}) => {
  const allStoresWithLocation = stores.filter((store): store is StoreEntry & { location: StoreLocation } => !!store.location);
  const selectedStore = selectedStoreName
    ? allStoresWithLocation.find((store) => store.name === selectedStoreName)
    : undefined;
  const storesWithLocation = selectedStore ? [selectedStore] : allStoresWithLocation;

  const allFarmsWithCoords = farms.filter((farm) => farm.land_coordinates.length >= 3);
  const cateredBlockIds = selectedStore
    ? new Set(selectedStore.blocks.map((block) => block.block_id.trim()))
    : null;
  const farmsWithCoords = cateredBlockIds
    ? allFarmsWithCoords.filter((farm) => farm.block_id && cateredBlockIds.has(farm.block_id.trim()))
    : allFarmsWithCoords;

  const storeCoords = storesWithLocation.map((store) => [store.location.lat, store.location.lng] as [number, number]);
  const allCoords = [...farmsWithCoords.flatMap((farm) => farm.land_coordinates), ...storeCoords];
  const center: [number, number] = allCoords.length > 0
    ? [
      allCoords.reduce((sum, c) => sum + c[0], 0) / allCoords.length,
      allCoords.reduce((sum, c) => sum + c[1], 0) / allCoords.length,
    ]
    : [20.5937, 78.9629];

  if (farmsWithCoords.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-900">
        <MapIcon className="h-8 w-8 text-slate-600" />
        <span className="text-xs font-semibold text-slate-500">
          {selectedStore ? `No lands found in ${selectedStore.name}'s blocks` : 'No farm boundaries to display'}
        </span>
      </div>
    );
  }

  return (
    <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }} attributionControl={false}>
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        maxZoom={19}
      />
      {farmsWithCoords.map((farm, index) => {
        const color = FARM_MAP_COLORS[index % FARM_MAP_COLORS.length];
        const centroid = farmCentroid(farm.land_coordinates);
        const tooltipContent = (
          <span>
            <strong>{farm.farm_id}</strong>
            {farm.crop_type ? ` · ${farm.crop_type}` : ''}
            {(farm.village || farm.district) && <br />}
            {[farm.village, farm.district].filter(Boolean).join(', ')}
          </span>
        );
        return (
          <Fragment key={farm.farm_id || index}>
            <Polygon
              positions={farm.land_coordinates}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.3, weight: 2 }}
            >
              <LeafletTooltip sticky>{tooltipContent}</LeafletTooltip>
            </Polygon>
            <Marker position={centroid} icon={farmDotIcon(color)}>
              <LeafletTooltip sticky>{tooltipContent}</LeafletTooltip>
            </Marker>
          </Fragment>
        );
      })}

      {storesWithLocation.map((store) => {
        const storePosition: [number, number] = [store.location.lat, store.location.lng];
        const cateredBlockIds = new Set(store.blocks.map((block) => block.block_id.trim()));
        const cateredFarms = farmsWithCoords.filter((farm) => farm.block_id && cateredBlockIds.has(farm.block_id.trim()));
        return (
          <Fragment key={store.name}>
            {cateredFarms.map((farm, farmIndex) => (
              <Polyline
                key={`${store.name}-${farm.farm_id || farmIndex}`}
                positions={[storePosition, farmCentroid(farm.land_coordinates)]}
                pathOptions={{ color: STORE_LINK_COLOR, weight: 3, opacity: 0.95 }}
              />
            ))}
            <Marker position={storePosition} icon={storePinIcon}>
              <LeafletTooltip sticky>
                <span>
                  <strong>{store.name}</strong>
                  <br />
                  {store.blocks.map((block) => block.block_name).join(', ') || 'No blocks assigned'}
                </span>
              </LeafletTooltip>
            </Marker>
          </Fragment>
        );
      })}

      <FitAllBounds coords={allCoords} />
      <MapResizeHandler />
    </MapContainer>
  );
};

// ─────────────────────────────────────────────────────────────
// INVENTORY REQUEST PANEL — pick a store, see requests from lands in its blocks
// ─────────────────────────────────────────────────────────────
// product_id on a request is the inventory item's Invent_id, so it's looked up
// against the already-loaded `items` list for real name/unit/image details.
type LandRequestLineItem = {
  productId: string;
  itemName: string;
  unit: string;
  imageUrl: string;
  quantity: number;
  sources: string[];
};

type LandRequestGroup = {
  farmId: string;
  landLabel: string;
  items: LandRequestLineItem[];
};

const InventoryRequestPanel = ({
  stores,
  farms,
  items,
  requests,
  requestsLoading,
  selectedStoreName,
  onSelectStore,
}: {
  stores: StoreEntry[];
  farms: RequestMapFarm[];
  items: StockItem[];
  requests: BlockPendingRequest[];
  requestsLoading: boolean;
  selectedStoreName: string;
  onSelectStore: (name: string) => void;
}) => {
  const selectedStore = stores.find((store) => store.name === selectedStoreName) || null;

  const cateredGroups = useMemo((): LandRequestGroup[] => {
    if (!selectedStore) return [];
    const blockIds = new Set(selectedStore.blocks.map((block) => block.block_id.trim()));
    const farmById = new Map(farms.map((farm) => [farm.farm_id, farm]));
    const cateredFarmIds = new Set(
      farms.filter((farm) => farm.block_id && blockIds.has(farm.block_id.trim())).map((farm) => farm.farm_id),
    );
    const itemById = new Map(items.map((item) => [item.id, item]));

    const itemsByFarm = new Map<string, Map<string, LandRequestLineItem>>();
    const landLabelByFarm = new Map<string, string>();

    requests.forEach((request) => {
      const sourceLabel = TASK_TYPE_LABELS[request.task_type] || request.task_type;
      request.land_wise_item_list.forEach((landItem) => {
        if (!cateredFarmIds.has(landItem.farm_id)) return;

        if (!landLabelByFarm.has(landItem.farm_id)) {
          const farm = farmById.get(landItem.farm_id);
          landLabelByFarm.set(
            landItem.farm_id,
            farm && (farm.village || farm.district)
              ? [farm.village, farm.district].filter(Boolean).join(', ')
              : (landItem.owner_name || landItem.farm_id),
          );
        }

        const productDetails = itemById.get(landItem.product_id);
        const itemMap = itemsByFarm.get(landItem.farm_id) ?? new Map<string, LandRequestLineItem>();
        const existing = itemMap.get(landItem.product_id);
        if (existing) {
          existing.quantity += landItem.quantity;
          if (!existing.sources.includes(sourceLabel)) existing.sources.push(sourceLabel);
        } else {
          itemMap.set(landItem.product_id, {
            productId: landItem.product_id,
            itemName: productDetails?.name || landItem.item_name,
            unit: productDetails?.unit || landItem.unit || '',
            imageUrl: productDetails?.imageUrl || '',
            quantity: landItem.quantity,
            sources: [sourceLabel],
          });
        }
        itemsByFarm.set(landItem.farm_id, itemMap);
      });
    });

    return Array.from(itemsByFarm.entries()).map(([farmId, itemMap]) => ({
      farmId,
      landLabel: landLabelByFarm.get(farmId) || farmId,
      items: Array.from(itemMap.values()),
    }));
  }, [selectedStore, farms, items, requests]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0D3A35]/10 text-[#0D3A35]">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-950">Inventory Requests</h3>
          <p className="text-xs font-medium text-slate-500">Requests from lands in the store's blocks</p>
        </div>
      </div>

      <div className="border-b border-slate-100 p-4">
        <select
          value={selectedStoreName}
          onChange={(event) => onSelectStore(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-[#0D3A35]"
        >
          <option value="">Select a store</option>
          {stores.map((store) => (
            <option key={store.name} value={store.name}>{store.name}</option>
          ))}
        </select>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {!selectedStore ? (
          <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 text-center text-xs font-semibold text-slate-400">
            Select a store to view requests from its blocks
          </div>
        ) : requestsLoading ? (
          <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 text-center text-xs font-semibold text-slate-400">
            Loading requests…
          </div>
        ) : cateredGroups.length === 0 ? (
          <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 text-center text-xs font-semibold text-slate-400">
            No pending requests from this store's blocks
          </div>
        ) : (
          cateredGroups.map((group) => (
            <div key={group.farmId} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1 text-xs font-bold text-slate-900">
                  <MapIcon className="h-3 w-3 shrink-0 text-slate-400" />
                  {group.landLabel}
                </p>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                  Pending
                </span>
              </div>
              <div className="mt-2 space-y-1.5">
                {group.items.map((item) => (
                  <div
                    key={item.productId}
                    className="flex items-center gap-2 rounded-md border border-slate-200/80 bg-white p-2"
                  >
                    <img
                      src={item.imageUrl || PLACEHOLDER_IMG}
                      alt={item.itemName}
                      className="h-9 w-9 shrink-0 rounded-md border border-slate-200 object-cover"
                      onError={(event) => { event.currentTarget.src = PLACEHOLDER_IMG; }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-bold text-slate-900">{item.itemName}</p>
                      <p className="text-[10px] font-semibold text-slate-500">
                        {item.quantity}{item.unit ? ` ${item.unit}` : ''} · {item.sources.join(', ')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// WAREHOUSE STOCK PANEL — one item (shared across From/To), warehouse picked
// per panel; stock comes from the shared dissociation lookup (0 if the
// selected warehouse isn't one of the item's stock locations).
// ─────────────────────────────────────────────────────────────
const WarehouseStockPanel = ({
  label,
  icon: Icon,
  stores,
  store,
  onStoreChange,
  lineItems,
  dissociationByItem,
  dissociationLoading,
}: {
  label: string;
  icon: React.ElementType;
  stores: string[];
  store: string;
  onStoreChange: (value: string) => void;
  lineItems: { item: StockItem | null }[];
  dissociationByItem: Record<string, ItemDissociation>;
  dissociationLoading: boolean;
}) => {
  const resolvedItems = lineItems
    .map((line) => line.item)
    .filter((item): item is StockItem => !!item);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
      <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0D3A35]/10 text-[#0D3A35]">
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-bold text-slate-950">{label}</h3>
      </div>

      <div className="space-y-3 p-4">
        <div className="relative">
          <select
            value={store}
            onChange={(event) => onStoreChange(event.target.value)}
            disabled={resolvedItems.length === 0}
            className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white px-2.5 pr-7 text-xs font-semibold text-slate-700 outline-none focus:border-[#0D3A35] disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">{resolvedItems.length ? 'Select store' : 'Pick an item first'}</option>
            {stores.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        </div>

        {resolvedItems.length === 0 ? (
          <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-slate-200 text-center text-xs font-semibold text-slate-400">
            Select an item above to view stock
          </div>
        ) : (
          <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-0.5">
            {resolvedItems.map((item) => {
              const storeStock = store ? dissociationByItem[item.id]?.[store]?.quantity ?? 0 : 0;
              return (
                <div key={item.id} className="flex h-16 overflow-hidden rounded-xl border border-slate-100 bg-slate-50/60">
                  <img
                    src={item.imageUrl || PLACEHOLDER_IMG}
                    alt={item.name}
                    className="h-full w-16 shrink-0 border-r border-slate-100 object-cover"
                  />
                  <div className="min-w-0 flex-1 p-2">
                    <p className="truncate text-[10px] font-bold text-slate-900">{item.name}</p>
                    {!store ? (
                      <p className="mt-1 text-[9px] font-semibold text-slate-400">Pick a store</p>
                    ) : dissociationLoading ? (
                      <p className="mt-1 text-[9px] font-semibold text-slate-400">Loading…</p>
                    ) : (
                      <>
                        <p className="mt-1 text-xs font-black leading-none text-[#0D3A35]">{storeStock.toLocaleString()}</p>
                        <p className="mt-0.5 text-[9px] font-semibold text-slate-400">{item.unit} in stock</p>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default Inventory;
