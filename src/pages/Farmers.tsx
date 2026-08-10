import { useMemo, useState, useEffect, useRef } from 'react';
import { Search, Filter, Users, MapPin, Phone, Mail, FileText, ShieldCheck, NotebookText, Wallet, Check, Flag, Leaf, Wheat, Sprout, Image as ImageIcon, Map, Pencil, Trash2, KeyRound, IdCard, BookOpen, FileBadge2, Landmark, Info, Navigation, Loader2, UploadCloud, X, Camera, Save, UserRound, Home, Banknote, Eye, FileUp, ArrowRight, ChevronDown, Droplets, Zap, Ruler, Layers3, IndianRupee, CalendarDays, Timer, Plus } from 'lucide-react';
import { Fragment } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, Tooltip, FeatureGroup, useMap } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import * as L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import getBaseUrl from '@/lib/config';
import { parseKmlFile } from '@/lib/kmlParser';
import { useToast } from '@/hooks/use-toast';

type CropValue = 'napier' | 'paddy' | 'ragi' | '';
type CropSelectValue = Exclude<CropValue, ''> | 'none';

type FarmerRow = {
  id: string;
  fullName: string;
  phoneNumber: string;
  email?: string | null;
  alternatePhone?: string | null;
  village: string;
  taluka?: string | null;
  district: string;
  state: string;
  profileImageUrl?: string;
  // `kyc` can include the full KYC object returned by backend (adhar, pan, IFSC, etc.)
  kyc?: any;
  landMapping?: { totalArea: number; coordinates: unknown[] };
  agreements: unknown[];
  credentials?: { userId: string | null; password: string | null; saved: boolean } | null;
  clusterAssigned?: string | null;
  zoneAssigned?: string | null;
  blockAssigned?: string | null;
  createdAt: Date;
  documents?: Record<string, any> | null;
  bankDetails?: any[];
  farms?: any[];
  // True once farmer_details/{id} has resolved (success or failure) for this row — until then,
  // land-derived fields (acres, parcel count) are still defaults, not confirmed zeroes.
  detailsLoaded?: boolean;
  crop?: CropValue;
  farmingOption?: string;
  farmerAddress?: string;
  coOwner?: {
    fullName?: string | null;
    phoneNumber?: string | null;
    relationship?: string | null;
    aadhaarNumber?: string | null;
    panNumber?: string | null;
  } | null;
};

const normalizeProfilePhotoUrl = (value?: string | null) => {
  const source = String(value || '').trim();
  if (!source) return '';
  try {
    const url = new URL(source);
    const expiresAt = Number(url.searchParams.get('Expires'));
    const isAmazonS3 = url.hostname.endsWith('.amazonaws.com');
    if (isAmazonS3 && Number.isFinite(expiresAt) && expiresAt <= Math.floor(Date.now() / 1000)) {
      url.search = '';
      return url.toString();
    }
  } catch {
    // Keep blob URLs, relative paths and other browser-supported sources unchanged.
  }
  return source;
};

const ProfileAvatar = ({
  src,
  name,
  imageClassName = 'h-full w-full object-cover',
  fallbackClassName = 'text-2xl font-bold text-emerald-700',
}: {
  src?: string | null;
  name: string;
  imageClassName?: string;
  fallbackClassName?: string;
}) => {
  const normalizedSrc = normalizeProfilePhotoUrl(src);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [normalizedSrc]);
  const initials = name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'FR';

  if (!normalizedSrc || failed) {
    return <div className={`flex h-full w-full items-center justify-center ${fallbackClassName}`}>{initials}</div>;
  }

  return <img src={normalizedSrc} alt="" className={imageClassName} onError={() => setFailed(true)} />;
};

type FarmCardData = {
  id: string;
  location: string;
  cropType: CropValue;
  acres: number;
  mediaUrl?: string;
  landMapping?: { totalArea: number; coordinates: unknown[] } | null;
  leaseStart?: string | null;
  leaseEnd?: string | null;
  leaseRate?: number | string | null;
  lockInStart?: string | null;
  lockInEnd?: string | null;
  cluster?: string | null;
  zone?: string | null;
  block?: string | null;
};

// Shape returned by GET /farmer_managment/get_co_owners_for_farm/{farm_id} — the authoritative
// source for a parcel's co-owners (a separate table from the farm's own co_owner_details).
type ParcelCoOwnerApi = {
  co_owner_id: string;
  farm_id: string;
  co_owner_name: string;
  co_owner_contact: string;
  co_owner_address: string;
  co_owner_email?: string | null;
  co_owner_adhar_number: string;
  co_owner_pan_number: string;
  co_owner_share_percentage: number;
  co_owner_bank_details?: { bank_name?: string; account_number?: string; ifsc_code?: string; holder_name?: string } | null;
  created_at?: string;
};

type LandCoOwner = {
  fullName: string;
  relationship: string;
  phoneNumber: string;
  aadhaarNumber: string;
  panNumber: string;
  ownershipShare: string;
};

const createEmptyLandCoOwner = (): LandCoOwner => ({
  fullName: '',
  relationship: '',
  phoneNumber: '',
  aadhaarNumber: '',
  panNumber: '',
  ownershipShare: '',
});

const normalizeLandCoOwners = (farm: any): LandCoOwner[] => {
  const source = farm?.co_owners ?? farm?.co_owner_details ?? farm?.land_co_owners ?? [];
  const entries = Array.isArray(source) ? source : source && typeof source === 'object' ? [source] : [];
  return entries.map((coOwner: any) => ({
    fullName: String(coOwner?.full_name ?? coOwner?.name ?? coOwner?.owner_name ?? ''),
    relationship: String(coOwner?.relationship ?? coOwner?.relation ?? ''),
    phoneNumber: String(coOwner?.phone_number ?? coOwner?.contact_number ?? coOwner?.mobile_number ?? ''),
    aadhaarNumber: String(coOwner?.adhar_number ?? coOwner?.aadhaar_number ?? ''),
    panNumber: String(coOwner?.pan_number ?? ''),
    ownershipShare: String(coOwner?.ownership_share ?? coOwner?.share_percentage ?? coOwner?.share ?? ''),
  }));
};

const serializeLandCoOwners = (coOwners: LandCoOwner[]) => coOwners
  .filter((coOwner) => Object.values(coOwner).some((value) => String(value).trim()))
  .map((coOwner) => ({
    full_name: coOwner.fullName.trim(),
    relationship: coOwner.relationship.trim(),
    phone_number: coOwner.phoneNumber.trim(),
    aadhaar_number: coOwner.aadhaarNumber.trim(),
    pan_number: coOwner.panNumber.trim().toUpperCase(),
    ownership_share: coOwner.ownershipShare === '' ? null : Number(coOwner.ownershipShare),
  }));

const formatLandDate = (value?: string | null) => {
  if (!value) return 'N/A';
  const raw = String(value).slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : raw;
};

const validateLockInPeriod = (leaseStart: string, leaseEnd: string, lockInStart: string, lockInEnd: string) => {
  if (!lockInStart && !lockInEnd) return null;
  if (!lockInStart || !lockInEnd) return 'Enter both lock-in start and end dates.';
  if (lockInStart > lockInEnd) return 'Lock-in end date must be on or after its start date.';
  if (leaseStart && lockInStart < leaseStart) return 'Lock-in period cannot start before the lease tenure.';
  if (leaseEnd && lockInEnd > leaseEnd) return 'Lock-in period cannot end after the lease tenure.';
  return null;
};

const cropOptions: Array<{ value: Exclude<CropValue, ''>; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'napier', label: 'Napier', Icon: Leaf },
  { value: 'paddy', label: 'Paddy', Icon: Wheat },
  { value: 'ragi', label: 'Ragi', Icon: Sprout },
];

// Segment colors for a parcel's owner/co-owner acreage split (owner is always the brand color).
const LAND_DISTRIBUTION_OWNER_COLOR = '#0D3A35';
const LAND_DISTRIBUTION_CO_OWNER_COLORS = ['#f59e0b', '#0ea5e9', '#e11d48', '#8b5cf6', '#059669'];

const CEO_CULTIVATION_CROP_COLORS: Record<string, string> = {
  paddy: 'var(--crop-paddy-color, #22c55e)',
  napier: 'var(--crop-napier-color, #22c55e)',
  rahar: 'var(--crop-rahar-color, #800000)',
  unspecified: '#94a3b8',
};
const CEO_CULTIVATION_FALLBACK_COLORS = ['#2563eb', '#6d28d9', '#0891b2', '#dc2626', '#0f766e'];

const FlyToBounds = ({ coords }: { coords: { lat: number; lng: number }[] | null }) => {
  const map = useMap();
  // Drop non-finite entries before building the key — otherwise a NaN pair survives as the
  // literal string "NaN,NaN" (still a truthy, non-empty key) and crashes Leaflet's flyToBounds.
  const validCoords = (coords ?? []).filter(({ lat, lng }) => Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)));
  const coordinatesKey = validCoords.map(({ lat, lng }) => `${Number(lat)},${Number(lng)}`).join('|');

  useEffect(() => {
    if (!coordinatesKey) return;
    // The parcels grid stays mounted but CSS-hidden (`hidden` class) while land data is still
    // loading — a map inside a display:none container has zero rendered size, and Leaflet's
    // flyTo animation does projection math that divides by that size, producing NaN and
    // crashing with no error boundary to catch it. Skip the fly-to until the map actually
    // has pixels to animate within; AutoResizeMap's ResizeObserver will fix the view once
    // the container becomes visible and gets a real size.
    const container = map.getContainer();
    if (!container || container.offsetWidth === 0 || container.offsetHeight === 0) return;
    const latLngs = coordinatesKey.split('|').map((pair) => {
      const [lat, lng] = pair.split(',').map(Number);
      return L.latLng(lat, lng);
    });
    if (latLngs.length === 0) return;
    map.flyToBounds(L.latLngBounds(latLngs), { padding: [40, 40], duration: 1.4, animate: true });
  }, [coordinatesKey, map]);
  return null;
};

const AutoResizeMap = () => {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    let animationFrame: number | null = null;

    const refreshMapSize = () => {
      if (animationFrame != null) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        map.invalidateSize({ pan: false, animate: false });
      });
    };

    const observer = new ResizeObserver(refreshMapSize);
    observer.observe(container);
    refreshMapSize();

    return () => {
      observer.disconnect();
      if (animationFrame != null) window.cancelAnimationFrame(animationFrame);
    };
  }, [map]);

  return null;
};

const EditSectionHeader = ({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) => (
  <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700 shadow-sm ring-1 ring-slate-200">
      <Icon className="h-4 w-4" />
    </div>
    <div>
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  </div>
);

const EditField = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-slate-600">
      {label}
      {hint ? <span className="ml-1 font-medium text-slate-400">{hint}</span> : null}
    </label>
    {children}
  </div>
);

const LandCoOwnerEditor = ({
  coOwners,
  onChange,
}: {
  coOwners: LandCoOwner[];
  onChange: (coOwners: LandCoOwner[]) => void;
}) => {
  const updateCoOwner = (index: number, patch: Partial<LandCoOwner>) => {
    onChange(coOwners.map((coOwner, coOwnerIndex) => (
      coOwnerIndex === index ? { ...coOwner, ...patch } : coOwner
    )));
  };

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900">Land Co-owners</h4>
          <p className="mt-0.5 text-xs font-medium text-slate-500">These co-owners will be linked only to this land parcel.</p>
        </div>
        <Button
          type="button"
          onClick={() => onChange([...coOwners, createEmptyLandCoOwner()])}
          className="h-9 gap-1.5 rounded-lg bg-[#0D3A35] px-3 text-xs font-bold text-white hover:bg-[#092b27]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Co-owner
        </Button>
      </div>
      <div className="space-y-3 p-4">
        {coOwners.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs font-semibold text-slate-400">
            No co-owners added for this land.
          </div>
        ) : coOwners.map((coOwner, coOwnerIndex) => (
          <div key={coOwnerIndex} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Co-owner {coOwnerIndex + 1}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => onChange(coOwners.filter((_, index) => index !== coOwnerIndex))}
                className="h-8 w-8 border-red-100 p-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                title={`Remove co-owner ${coOwnerIndex + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <EditField label="Full Name">
                <Input value={coOwner.fullName} onChange={(event) => updateCoOwner(coOwnerIndex, { fullName: event.target.value })} placeholder="Enter full name" />
              </EditField>
              <EditField label="Relationship">
                <Input value={coOwner.relationship} onChange={(event) => updateCoOwner(coOwnerIndex, { relationship: event.target.value })} placeholder="e.g. Spouse, sibling" />
              </EditField>
              <EditField label="Phone Number">
                <Input value={coOwner.phoneNumber} onChange={(event) => updateCoOwner(coOwnerIndex, { phoneNumber: event.target.value })} placeholder="Enter mobile number" />
              </EditField>
              <EditField label="Aadhaar Number" hint="Optional">
                <Input value={coOwner.aadhaarNumber} onChange={(event) => updateCoOwner(coOwnerIndex, { aadhaarNumber: event.target.value.replace(/\D/g, '').slice(0, 12) })} placeholder="12-digit Aadhaar" inputMode="numeric" />
              </EditField>
              <EditField label="PAN Number" hint="Optional">
                <Input value={coOwner.panNumber} onChange={(event) => updateCoOwner(coOwnerIndex, { panNumber: event.target.value.toUpperCase().slice(0, 10) })} placeholder="e.g. ABCDE1234F" />
              </EditField>
              <EditField label="Ownership Share" hint="% Optional">
                <Input type="number" min="0" max="100" step="0.01" value={coOwner.ownershipShare} onChange={(event) => updateCoOwner(coOwnerIndex, { ownershipShare: event.target.value })} placeholder="e.g. 50" />
              </EditField>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

const Farmers = () => {
  // --- Existing State & Logic ---
  const [farmers, setFarmers] = useState<FarmerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disputed'>('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [landFilter, setLandFilter] = useState<'all' | 'with-land' | 'without-land'>('all');
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [flagging, setFlagging] = useState<Record<string, boolean>>({});
  const [cropSelections, setCropSelections] = useState<Record<string, CropValue>>({});
  const [cropUpdating, setCropUpdating] = useState<Record<string, boolean>>({});
  const [pendingCropChange, setPendingCropChange] = useState<{ farmerId: string; crop: CropValue } | null>(null);
  const [farmsPopupFarmerId, setFarmsPopupFarmerId] = useState<string | null>(null);
  const [viewProfileFarmerId, setViewProfileFarmerId] = useState<string | null>(null);
  const [profilePopupTab, setProfilePopupTab] = useState<'details' | 'documents' | 'parcels'>('details');
  const [parcelPlotView, setParcelPlotView] = useState<Record<string, boolean>>({});
  const [parcelPlotDetailsOpen, setParcelPlotDetailsOpen] = useState<Record<string, boolean>>({});
  // Cluster/zone/block names per farm_id, fetched lazily when the parcels tab is opened — acts
  // as a session-long cache keyed by farm_id so re-opening the same parcel doesn't refetch.
  const [parcelBlockZoneCluster, setParcelBlockZoneCluster] = useState<Record<string, { loading: boolean; block_name?: string | null; zone_name?: string | null; cluster_name?: string | null }>>({});
  // Co-owners per farm_id, fetched (one call per farm_id) as soon as the view-profile popup opens —
  // acts as a session-long cache keyed by farm_id so re-opening the same profile doesn't refetch.
  const [parcelCoOwners, setParcelCoOwners] = useState<Record<string, { loading: boolean; items: ParcelCoOwnerApi[] }>>({});
  const [newLandModal, setNewLandModal] = useState<{ open: boolean; farmerId: string | null }>({ open: false, farmerId: null });
  const [bankAddModal, setBankAddModal] = useState<{ open: boolean; farmerId: string | null }>({ open: false, farmerId: null });
  // Dedicated "Add Co-owner" popup — POSTs straight to add_co_owner_to_farm (a separate table
  // from the farm's own co_owner_details, so it isn't bundled into the land-parcel save flow).
  const [coOwnerAddModal, setCoOwnerAddModal] = useState<{ open: boolean; farmId: string; farmTotalAcres: number }>({ open: false, farmId: '', farmTotalAcres: 0 });
  const [coOwnerAddForm, setCoOwnerAddForm] = useState({
    name: '', contact: '', address: '', email: '', aadhaar: '', pan: '', shareAcres: '',
    bankName: '', bankHolderName: '', bankAccountNumber: '', bankIfsc: '',
  });
  const [coOwnerAddSaving, setCoOwnerAddSaving] = useState(false);
  const [localBankDetails, setLocalBankDetails] = useState<Record<string, Array<{ holderName: string; bankName: string; accountNumber: string; ifsc: string; passbookPdfName: string }>>>({});
  const [bankDrafts, setBankDrafts] = useState<Record<string, { holderName: string; bankName: string; accountNumber: string; ifsc: string; passbookPdf?: File | null }>>({});
  const [bankSaving, setBankSaving] = useState<Record<string, boolean>>({});
  const [newLandSaving, setNewLandSaving] = useState(false);
  const [newLandStep, setNewLandStep] = useState<1 | 2 | 3 | 4>(1);
  const [newLandLocationLoading, setNewLandLocationLoading] = useState(false);
  const [newLandLocation, setNewLandLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [newLandImagePreviews, setNewLandImagePreviews] = useState<Array<string | null>>([null, null, null]);
  const [newLandVideoPreview, setNewLandVideoPreview] = useState<string | null>(null);
  const newLandImageInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const newLandVideoInputRef = useRef<HTMLInputElement | null>(null);
  const newLandFeatureGroupRef = useRef<any>(null);
  const editProfilePhotoRef = useRef<HTMLInputElement | null>(null);
  const [newLandKmlCoordinates, setNewLandKmlCoordinates] = useState<{ lat: number; lng: number }[] | null>(null);
  const [newLandIsParsingKml, setNewLandIsParsingKml] = useState(false);
  const [newLandForm, setNewLandForm] = useState({
    state: '',
    district: '',
    village: '',
    cropType: '',
    acres: '',
    landLocation: '',
    landMapping: [] as Array<[number, number]>,
    leaseStart: '',
    leaseEnd: '',
    leaseAmount: '',
    lockInStart: '',
    lockInEnd: '',
    agreementPdf: null as File | null,
    b1Pdf: null as File | null,
    kisanBookPdf: null as File | null,
    landImages: [] as File[],
    landVideo: null as File | null,
    coOwners: [] as LandCoOwner[],
  });
  const { toast } = useToast();

  // --- Edit Farmer Modal ---
  const [editFarmerModal, setEditFarmerModal] = useState<{ open: boolean; farmerId: string | null }>({ open: false, farmerId: null });
  const [inlineProfileEditing, setInlineProfileEditing] = useState(false);
  const [editFarmerTab, setEditFarmerTab] = useState<'personal' | 'location' | 'kyc' | 'agreement' | 'bank' | 'farms'>('personal');
  const [editFarmerSaving, setEditFarmerSaving] = useState(false);
  const [editProfilePhotoPreview, setEditProfilePhotoPreview] = useState<string | null>(null);
  const [editFarmerForm, setEditFarmerForm] = useState({
    // Personal
    fullName: '',
    phoneNumber: '',
    alternatePhone: '',
    profilePhoto: null as File | null,
    // Location
    state: '',
    district: '',
    taluka: '',
    village: '',
    blockAssigned: '',
    farmingOption: '',
    // KYC
    aadhaarNumber: '',
    panNumber: '',
    aadhaarCardFile: null as File | null,
    panCardFile: null as File | null,
    kisanBookFile: null as File | null,
    b1RecordFile: null as File | null,
    // Agreement
    leaseRent: '',
    agreementStartDate: '',
    agreementEndDate: '',
    agreementFile: null as File | null,
    // Bank
    bankHolderName: '',
    bankName: '',
    bankAccountNumber: '',
    bankIfsc: '',
    passbookFile: null as File | null,
  });
  const [editFarmerFarms, setEditFarmerFarms] = useState<Array<{
    farmId: string;
    village: string;
    district: string;
    state: string;
    cropType: string;
    totalArea: string;
    images: (File | null)[];
    imagePreviews: (string | null)[];
    video: File | null;
    videoPreview: string | null;
    landCoordinates: [number, number][];
    kmlCoordinates: { lat: number; lng: number }[] | null;
    isParsingKml: boolean;
    coOwners: LandCoOwner[];
    leaseStart: string;
    leaseEnd: string;
    leaseRate: string;
    lockInStart: string;
    lockInEnd: string;
  }>>([]);
  const [editFarmIndex, setEditFarmIndex] = useState(0);
  // True while a farmer's authoritative land/farm data is being fetched in the
  // background (profile view or Edit Farmer open) — drives the spinner in the
  // Land Parcels and Farm Details tabs so stale/empty data isn't shown mid-fetch.
  const [farmerLandLoading, setFarmerLandLoading] = useState(false);

  useEffect(() => {
    loadFarmers();
  }, []);

  const loadFarmers = async () => {
    try {
      const base = getBaseUrl();
      const resp = await fetch(`${base.replace(/\/$/, '')}/farmer_managment/get_farmers`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!resp.ok) throw new Error(`Server responded ${resp.status}`);

      const result = await resp.json();

      const transformed: FarmerRow[] = (result.farmers || []).map((item: any) => {
        const fd = item.farmer_data || {};
        const kyc = item.kyc_data || null;
        const cropTypeRaw = String(item.crop_type ?? fd.crop_type ?? fd.crop ?? '').toLowerCase();
        const rawCreds = item.credentials_data ?? item.credentials ?? fd.credentials ?? null;
        const userId = rawCreds?.user_id ?? rawCreds?.userId ?? rawCreds?.username ?? null;
        const password = rawCreds?.password ?? rawCreds?.pass ?? null;
        const coOwnerSource = fd.co_owner_details ?? fd.co_owner ?? item.co_owner_data ?? {};
        const coOwner = {
          fullName: coOwnerSource?.full_name ?? coOwnerSource?.name ?? fd.co_owner_name ?? null,
          phoneNumber: coOwnerSource?.phone_number ?? coOwnerSource?.contact_number ?? fd.co_owner_phone ?? null,
          relationship: coOwnerSource?.relationship ?? coOwnerSource?.relation ?? fd.co_owner_relationship ?? null,
          aadhaarNumber: coOwnerSource?.adhar_number ?? coOwnerSource?.aadhaar_number ?? fd.co_owner_aadhaar ?? null,
          panNumber: coOwnerSource?.pan_number ?? fd.co_owner_pan ?? null,
        };
        const hasCoOwner = Object.values(coOwner).some(Boolean);

        return {
          id: item.farmer_id,
          fullName: fd.full_name || 'Unknown',
          phoneNumber: fd.phone_number || 'N/A',
          email: fd.email ?? fd.email_address ?? fd.email_id ?? null,
          alternatePhone: fd.alternate_phone_number ?? null,
          farmerAddress: fd.farmer_address || fd.address || '',
          village: fd.village || 'N/A',
          taluka: fd.taluka ?? null,
          district: fd.district || 'N/A',
          state: fd.state || 'N/A',
          // Try common places for profile photo URL returned by backend
          profileImageUrl:
            item.documents?.profile_photo?.url ||
            item.profile_photo ||
            fd.profile_photo_url ||
            fd.profile_image_url ||
            undefined,
          kyc: kyc || undefined,
          landMapping: fd.estimated_land_area != null
            ? { totalArea: fd.estimated_land_area, coordinates: fd.land_coordinates || [] }
            : undefined,
          agreements: item.agreement_data || [],
          credentials: userId != null || password != null ? { userId, password, saved: true } : null,
          clusterAssigned: fd.cluster_assigned ?? fd.cluster ?? fd.cluster_name ?? null,
          zoneAssigned: fd.zone_assigned ?? fd.zone ?? fd.zone_name ?? null,
          blockAssigned: fd.block_assigned ?? fd.block ?? fd.block_name ?? null,
          crop: cropTypeRaw === 'napier' || cropTypeRaw === 'paddy' || cropTypeRaw === 'ragi' ? (cropTypeRaw as CropValue) : '',
          createdAt: item.created_at ? new Date(item.created_at) : new Date(),
          documents: item.documents || null,
          bankDetails: [],
          farms: [],
          detailsLoaded: false,
          farmingOption: fd.farming_option ?? '',
          coOwner: hasCoOwner ? coOwner : null,
        };
      });

      const enrichFarmer = (farmer: FarmerRow, detail: any): FarmerRow => {
        const farmerDetail = detail?.farmer ?? {};
        const farmDetail = Array.isArray(detail?.farm) ? detail.farm : [];
        const detailKyc = farmerDetail?.kyc_data ?? farmer.kyc;
        const detailAgreements = farmerDetail?.agreement_data ?? farmer.agreements ?? [];
        const detailDocs = farmerDetail?.documents ?? farmer.documents ?? null;
        const detailBank = Array.isArray(farmerDetail?.bank_details) ? farmerDetail.bank_details : [];
        const detailArea = farmDetail.reduce((sum: number, f: any) => sum + Number(f?.total_area ?? 0), 0);
        const detailCoOwnerSource = farmerDetail?.co_owner_details ?? farmerDetail?.co_owner ?? {};
        const detailCoOwner = {
          fullName: detailCoOwnerSource?.full_name ?? detailCoOwnerSource?.name ?? farmerDetail?.co_owner_name ?? farmer.coOwner?.fullName ?? null,
          phoneNumber: detailCoOwnerSource?.phone_number ?? detailCoOwnerSource?.contact_number ?? farmerDetail?.co_owner_phone ?? farmer.coOwner?.phoneNumber ?? null,
          relationship: detailCoOwnerSource?.relationship ?? detailCoOwnerSource?.relation ?? farmerDetail?.co_owner_relationship ?? farmer.coOwner?.relationship ?? null,
          aadhaarNumber: detailCoOwnerSource?.adhar_number ?? detailCoOwnerSource?.aadhaar_number ?? farmerDetail?.co_owner_aadhaar ?? farmer.coOwner?.aadhaarNumber ?? null,
          panNumber: detailCoOwnerSource?.pan_number ?? farmerDetail?.co_owner_pan ?? farmer.coOwner?.panNumber ?? null,
        };
        const hasDetailCoOwner = Object.values(detailCoOwner).some(Boolean);

        return {
          ...farmer,
          fullName: farmerDetail?.farmer_name || farmer.fullName,
          phoneNumber: farmerDetail?.farmer_contact || farmer.phoneNumber,
          email:
            farmerDetail?.farmer_email ??
            farmerDetail?.email ??
            farmerDetail?.email_address ??
            farmer.email ??
            null,
          alternatePhone: farmerDetail?.farmer_alternate_contact ?? farmer.alternatePhone,
          farmerAddress: farmerDetail?.farmer_address ?? farmer.farmerAddress ?? '',
          kyc: detailKyc || farmer.kyc,
          agreements: detailAgreements,
          documents: detailDocs,
          bankDetails: detailBank,
          farms: farmDetail,
          farmingOption: farmerDetail?.farming_option || farmer.farmingOption || '',
          coOwner: hasDetailCoOwner ? detailCoOwner : farmer.coOwner ?? null,
          clusterAssigned:
            farmerDetail?.cluster_assigned ??
            farmerDetail?.cluster ??
            farmerDetail?.cluster_name ??
            farmDetail[0]?.cluster_name ??
            farmer.clusterAssigned ??
            null,
          zoneAssigned:
            farmerDetail?.zone_assigned ??
            farmerDetail?.zone ??
            farmerDetail?.zone_name ??
            farmDetail[0]?.zone_name ??
            farmer.zoneAssigned ??
            null,
          blockAssigned:
            farmerDetail?.block_assigned ??
            farmerDetail?.block ??
            farmerDetail?.block_name ??
            farmDetail[0]?.block_name ??
            farmer.blockAssigned ??
            null,
          landMapping: detailArea > 0
            ? { totalArea: detailArea, coordinates: farmDetail[0]?.land_coordinates || farmer.landMapping?.coordinates || [] }
            : farmer.landMapping,
          profileImageUrl: farmerDetail?.documents?.profile_photo?.url || farmer.profileImageUrl,
        };
      };

      setFarmers(transformed);
      setCropSelections(
        transformed.reduce<Record<string, CropValue>>((acc, farmer) => {
          acc[farmer.id] = farmer.crop ?? '';
          return acc;
        }, {})
      );
      // Initialize flagged state from backend response if present
      try {
        const flaggedMap: Record<string, boolean> = {};
        (result.farmers || []).forEach((it: any) => {
          if (it?.farmer_id && it?.flagged && (it.flagged.flagged === true || it.flagged === true)) {
            flaggedMap[it.farmer_id] = true;
          }
        });
        setFlagged(flaggedMap);
      } catch (e) {
        // ignore
      }
      setLoading(false);

      const fetchDetails = async (farmer: FarmerRow) => {
        try {
          const detailResp = await fetch(
            `${base.replace(/\/$/, '')}/farmer_managment/farmer_details/${farmer.id}`,
            {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
            }
          );
          if (!detailResp.ok) return { farmerId: farmer.id, details: null };
          const detailJson = await detailResp.json();
          return { farmerId: farmer.id, details: detailJson };
        } catch {
          return { farmerId: farmer.id, details: null };
        }
      };

      const batchSize = 10;
      for (let start = 0; start < transformed.length; start += batchSize) {
        const batch = transformed.slice(start, start + batchSize);
        const detailResults = await Promise.all(batch.map(fetchDetails));
        const detailMap = detailResults.reduce<Record<string, any>>((acc, item) => {
          acc[item.farmerId] = item.details;
          return acc;
        }, {});

        setFarmers((prev) =>
          prev.map((farmer) => {
            if (!(farmer.id in detailMap)) return farmer;
            const detail = detailMap[farmer.id];
            const next = detail ? enrichFarmer(farmer, detail) : farmer;
            return { ...next, detailsLoaded: true };
          })
        );
      }
    } catch (error) {
      console.error('Failed to load farmers:', error);
      toast({ title: 'Error', description: 'Failed to load farmers', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const toggleFlag = async (farmerId: string) => {
    if (flagged[farmerId]) {
      toast({ title: 'Already disputed', description: 'This land owner is already marked as disputed.', variant: 'default' });
      return;
    }

    setFlagging(prev => ({ ...prev, [farmerId]: true }));
    try {
      const base = getBaseUrl();
      const resp = await fetch(`${base.replace(/\/$/, '')}/farmer_managment/make_farmer_flagged`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmer_id: farmerId }),
      });

      let body: any = null;
      try { body = await resp.json(); } catch { body = null; }

      if (!resp.ok || body?.success !== true) {
        console.error('Failed to flag farmer', resp.status, body);
        toast({ title: 'Error', description: 'Failed to flag farmer', variant: 'destructive' });
        return;
      }

      setFlagged(prev => ({ ...prev, [farmerId]: true }));
      toast({ title: 'Dispute flagged', description: 'Land owner marked as disputed.', variant: 'success' });
    } catch (err) {
      console.error('Failed to call flag API', err);
      toast({ title: 'Error', description: 'Failed to flag farmer', variant: 'destructive' });
    } finally {
      setFlagging(prev => {
        const copy = { ...prev };
        delete copy[farmerId];
        return copy;
      });
    }
  };

  // --- Filtering & Stats ---
  const filteredFarmers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return farmers.filter((farmer) => {
      const matchesSearch = !q || [
        farmer.id,
        farmer.fullName,
        farmer.phoneNumber,
        farmer.email,
        farmer.village,
        farmer.district,
        farmer.state,
      ].some((value) => String(value ?? '').toLowerCase().includes(q));
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'disputed' && !!flagged[farmer.id]) ||
        (statusFilter === 'active' && !flagged[farmer.id]);
      const matchesState = stateFilter === 'all' || farmer.state === stateFilter;
      const matchesDistrict = districtFilter === 'all' || farmer.district === districtFilter;
      const landArea = Number(farmer.landMapping?.totalArea ?? 0);
      const parcelCount = Array.isArray(farmer.farms) ? farmer.farms.length : 0;
      const hasLand = landArea > 0 || parcelCount > 0;
      const matchesLand =
        landFilter === 'all' ||
        (landFilter === 'with-land' && hasLand) ||
        (landFilter === 'without-land' && !hasLand);

      return matchesSearch && matchesStatus && matchesState && matchesDistrict && matchesLand;
    });
  }, [districtFilter, farmers, flagged, landFilter, searchQuery, stateFilter, statusFilter]);
  const filterStates = Array.from(new Set(farmers.map((farmer) => farmer.state).filter(Boolean))).sort();
  const filterDistricts = Array.from(new Set(
    farmers
      .filter((farmer) => stateFilter === 'all' || farmer.state === stateFilter)
      .map((farmer) => farmer.district)
      .filter(Boolean)
  )).sort();
  const activeFilterCount = [
    statusFilter !== 'all',
    stateFilter !== 'all',
    districtFilter !== 'all',
    landFilter !== 'all',
  ].filter(Boolean).length;
  const clearFilters = () => {
    setStatusFilter('all');
    setStateFilter('all');
    setDistrictFilter('all');
    setLandFilter('all');
  };

  const totalArea = farmers.reduce((acc, f) => acc + (f.landMapping?.totalArea || 0), 0);
  const allAgreements = farmers.flatMap((farmer) => (
    Array.isArray(farmer.agreements)
      ? farmer.agreements
      : farmer.agreements
        ? [farmer.agreements]
        : []
  )) as any[];
  const average = (values: number[]) => (
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  );
  const leaseRates = allAgreements
    .map((agreement) => Number(agreement?.lease_rate ?? agreement?.lease_rent ?? agreement?.leaseRent))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const averageLeaseRate = average(leaseRates);
  const leasePeriodsInMonths = allAgreements
    .map((agreement) => {
      const start = new Date(agreement?.agreement_start_date ?? agreement?.agreementStart ?? '').getTime();
      const end = new Date(agreement?.agreement_end_date ?? agreement?.agreementEnd ?? '').getTime();
      return Number.isFinite(start) && Number.isFinite(end) && end > start
        ? (end - start) / (1000 * 60 * 60 * 24 * 30.4375)
        : NaN;
    })
    .filter((value) => Number.isFinite(value));
  const lockInPeriodsInMonths = allAgreements
    .map((agreement) => {
      const explicitMonths = Number(
        agreement?.lock_in_months ??
        agreement?.lockin_months
      );
      if (Number.isFinite(explicitMonths) && explicitMonths >= 0) return explicitMonths;

      const explicitYears = Number(
        agreement?.lock_in_years ??
        agreement?.lockin_years
      );
      if (Number.isFinite(explicitYears) && explicitYears >= 0) return explicitYears * 12;

      const rawDuration = agreement?.lock_in_period ?? agreement?.lockin_period ?? agreement?.lock_in_duration;
      if (rawDuration != null && String(rawDuration).trim() !== '') {
        const numericDuration = Number(String(rawDuration).match(/[\d.]+/)?.[0]);
        if (Number.isFinite(numericDuration)) {
          const unit = String(rawDuration).toLowerCase();
          if (unit.includes('month')) return numericDuration;
          if (unit.includes('day')) return numericDuration / 30.4375;
          return numericDuration * 12;
        }
      }

      const start = new Date(agreement?.lock_in_start_date ?? agreement?.lockin_start_date ?? '').getTime();
      const end = new Date(agreement?.lock_in_end_date ?? agreement?.lockin_end_date ?? '').getTime();
      return Number.isFinite(start) && Number.isFinite(end) && end > start
        ? (end - start) / (1000 * 60 * 60 * 24 * 30.4375)
        : NaN;
    })
    .filter((value) => Number.isFinite(value));
  const formatAveragePeriod = (months: number | null) => {
    if (months == null) return 'N/A';
    if (months >= 12) {
      return `${(months / 12).toLocaleString('en-IN', { maximumFractionDigits: 1 })} years`;
    }
    return `${months.toLocaleString('en-IN', { maximumFractionDigits: 1 })} months`;
  };
  const averageLeasePeriod = average(leasePeriodsInMonths);
  const averageLockInPeriod = average(lockInPeriodsInMonths);

  const renderDialogBody = (data: unknown) => {
    if (data == null) {
      return <div className="min-h-8" />;
    }

    if (Array.isArray(data) && data.length === 0) {
      return <div className="min-h-8" />;
    }

    return (
      <pre className="max-h-80 overflow-auto rounded-md bg-muted/30 p-3 text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  };

  const getCropOption = (value: CropValue) => {
    return cropOptions.find((option) => option.value === value) ?? null;
  };

  const getFarmCards = (farmer: FarmerRow): FarmCardData[] => {
    const selectedCrop = cropSelections[farmer.id] ?? farmer.crop ?? '';
    const agreement = Array.isArray(farmer.agreements) ? farmer.agreements[0] : farmer.agreements;
    const leaseStart = agreement?.agreement_start_date ?? agreement?.agreementStart ?? null;
    const leaseEnd = agreement?.agreement_end_date ?? agreement?.agreementEnd ?? null;
    const leaseRate = agreement?.lease_rate ?? agreement?.lease_rent ?? agreement?.leaseRent ?? null;
    const farms = Array.isArray(farmer.farms) ? farmer.farms : [];

    if (farms.length > 0) {
      return farms.map((farm: any, index: number) => ({
        id: `${farmer.id}-farm-${index + 1}`,
        location: [farm?.village, farm?.district, farm?.state].filter(Boolean).join(', ') || [farmer.village, farmer.district].filter(Boolean).join(', ') || 'N/A',
        cropType: selectedCrop,
        acres: Number(farm?.total_area ?? 0),
        mediaUrl: farm?.land_media?.images?.[0] || farm?.land_media?.video || '/placeholder.svg',
        landMapping: {
          totalArea: Number(farm?.total_area ?? 0),
          coordinates: farm?.land_coordinates || [],
        },
        leaseStart: farm?.lease_start_date ?? farm?.lease_start ?? leaseStart,
        leaseEnd: farm?.lease_end_date ?? farm?.lease_end ?? leaseEnd,
        leaseRate: farm?.lease_rate ?? farm?.lease_rent ?? leaseRate,
        lockInStart: farm?.lock_in_start_date ?? farm?.lock_in_start ?? null,
        lockInEnd: farm?.lock_in_end_date ?? farm?.lock_in_end ?? null,
        cluster: farm?.cluster_assigned ?? farm?.cluster ?? farm?.cluster_name ?? farmer.clusterAssigned ?? null,
        zone: farm?.zone_assigned ?? farm?.zone ?? farm?.zone_name ?? farmer.zoneAssigned ?? null,
        block: farm?.block_assigned ?? farm?.block ?? farm?.block_name ?? farmer.blockAssigned ?? null,
      }));
    }

    return [{
      id: `${farmer.id}-farm-1`,
      location: [farmer.village, farmer.district].filter(Boolean).join(', ') || 'N/A',
      cropType: selectedCrop,
      acres: Number(farmer.landMapping?.totalArea ?? 0),
      mediaUrl: farmer.documents?.land_image_1?.url || farmer.documents?.land_media?.url || '/placeholder.svg',
      landMapping: farmer.landMapping ?? null,
      leaseStart,
      leaseEnd,
      leaseRate,
      cluster: farmer.clusterAssigned ?? null,
      zone: farmer.zoneAssigned ?? null,
      block: farmer.blockAssigned ?? null,
    }];
  };

  const getAmountInvested = (farmer: FarmerRow) => {
    const agreements = Array.isArray(farmer.agreements)
      ? farmer.agreements
      : farmer.agreements
        ? [farmer.agreements]
        : [];
    const total = agreements.reduce((sum, item: any) => {
      const rent = Number(item?.lease_rent ?? item?.leaseRent ?? 0);
      return sum + (Number.isFinite(rent) ? rent : 0);
    }, 0);
    return total;
  };

  const getKycValue = (farmer: FarmerRow, key: string) => {
    const kyc = farmer.kyc;
    if (!kyc) return '';
    if (Array.isArray(kyc)) return String(kyc[0]?.[key] ?? '');
    return String(kyc?.[key] ?? '');
  };

  const getBankDetails = (farmer: FarmerRow) => {
    if (Array.isArray(farmer.bankDetails) && farmer.bankDetails.length > 0) {
      const bank = farmer.bankDetails[0];
      return {
        bankName: bank?.bank_name ?? bank?.name ?? 'N/A',
        accountNumber: bank?.account_number ?? bank?.accound_number ?? 'N/A',
        ifsc: bank?.ifsc_code ?? bank?.IFSC_code ?? 'N/A',
      };
    }
    const kyc = Array.isArray(farmer.kyc) ? farmer.kyc[0] : farmer.kyc;
    return {
      bankName: kyc?.bank_name ?? 'N/A',
      accountNumber: kyc?.accound_number ?? kyc?.account_number ?? 'N/A',
      ifsc: kyc?.IFSC_code ?? kyc?.ifsc_code ?? 'N/A',
    };
  };

  const getAllBankDetails = (farmer: FarmerRow) => {
    const backend = Array.isArray(farmer.bankDetails) && farmer.bankDetails.length > 0
      ? farmer.bankDetails.map((b: any) => ({
          holderName: b?.holder_name ?? b?.account_holder_name ?? 'N/A',
          bankName: b?.bank_name ?? b?.name ?? 'N/A',
          accountNumber: b?.account_number ?? b?.accound_number ?? 'N/A',
          ifsc: b?.ifsc_code ?? b?.IFSC_code ?? 'N/A',
          passbookPdfName: b?.passbook_pdf_name ?? 'Uploaded',
        }))
      : [];
    const fallback = backend.length === 0 ? [{
      holderName: 'N/A',
      bankName: getBankDetails(farmer).bankName,
      accountNumber: getBankDetails(farmer).accountNumber,
      ifsc: getBankDetails(farmer).ifsc,
      passbookPdfName: 'N/A',
    }] : [];
    const local = localBankDetails[farmer.id] ?? [];
    return [...backend, ...fallback, ...local].filter((account, index, accounts) => {
      const accountNumber = String(account.accountNumber ?? '').replace(/\s+/g, '').toLowerCase();
      const key = accountNumber && accountNumber !== 'n/a'
        ? accountNumber
        : `${String(account.bankName ?? '').toLowerCase()}-${String(account.ifsc ?? '').toLowerCase()}-${index}`;
      return accounts.findIndex((candidate, candidateIndex) => {
        const candidateNumber = String(candidate.accountNumber ?? '').replace(/\s+/g, '').toLowerCase();
        const candidateKey = candidateNumber && candidateNumber !== 'n/a'
          ? candidateNumber
          : `${String(candidate.bankName ?? '').toLowerCase()}-${String(candidate.ifsc ?? '').toLowerCase()}-${candidateIndex}`;
        return candidateKey === key;
      }) === index;
    });
  };

  type FarmerDocumentKey = 'adhar_card' | 'pand_card' | 'kisan_book' | 'B1_record' | 'agreement' | 'bank_passbook' | 'profile_photo';

  const getDocumentUrl = (farmer: FarmerRow, key: FarmerDocumentKey) => {
    const docs = farmer.documents ?? {};
    return docs?.[key]?.url || '';
  };

  const normalizeUploadedDocument = (body: any, documentType: FarmerDocumentKey) => {
    const direct = body?.documents?.[documentType] ?? body?.document ?? body?.[documentType] ?? null;
    if (direct && typeof direct === 'object') return direct;

    const url = body?.url ?? body?.document_url ?? body?.file_url ?? body?.data?.url ?? body?.data?.document_url;
    if (!url) return null;

    return {
      url,
      s3_key: body?.s3_key ?? body?.data?.s3_key,
      uploaded_at: body?.uploaded_at ?? body?.data?.uploaded_at ?? new Date().toISOString(),
    };
  };

  const fetchFarmerDetailSnapshot = async (farmerId: string) => {
    const base = getBaseUrl().replace(/\/$/, '');
    const resp = await fetch(`${base}/farmer_managment/farmer_details/${farmerId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!resp.ok) return null;
    return resp.json().catch(() => null);
  };

  const uploadFarmerDocument = async (farmerId: string, documentType: FarmerDocumentKey, file: File) => {
    const base = getBaseUrl().replace(/\/$/, '');
    const formData = new FormData();
    formData.append('document_type', documentType);
    formData.append('farmer_id', farmerId);
    formData.append('doc', file, file.name);

    const params = new URLSearchParams({ document_type: documentType, farmer_id: farmerId });
    const resp = await fetch(`${base}/farmer_managment/upload_documents?${params.toString()}`, {
      method: 'POST',
      body: formData,
    });
    const body = await resp.json().catch(() => null);
    if (!resp.ok || body?.success === false) {
      throw new Error(body?.message || `Failed to upload ${documentType}`);
    }
    return normalizeUploadedDocument(body, documentType);
  };

  const uploadFarmImages = async (files: File[]) => {
    if (files.length === 0) return [];

    const base = getBaseUrl().replace(/\/$/, '');
    const formData = new FormData();
    files.forEach((file) => formData.append('land_images', file, file.name));

    const resp = await fetch(`${base}/farmer_managment/upload_land_images`, {
      method: 'POST',
      body: formData,
    });
    const body = await resp.json().catch(() => null);
    if (!resp.ok || body?.success === false || !Array.isArray(body?.images)) {
      throw new Error(body?.message || 'Failed to upload farm images');
    }

    return body.images.map((item: any) => item?.url).filter((url: any) => typeof url === 'string' && url.length > 0);
  };

  const uploadFarmVideo = async (file: File) => {
    const base = getBaseUrl().replace(/\/$/, '');
    const formData = new FormData();
    formData.append('land_video', file, file.name);

    const resp = await fetch(`${base}/farmer_managment/upload_land_video`, {
      method: 'POST',
      body: formData,
    });
    const body = await resp.json().catch(() => null);
    if (!resp.ok || body?.success === false || !body?.video?.url) {
      throw new Error(body?.message || 'Failed to upload farm video');
    }

    return body.video.url as string;
  };

  const updateFarmDetails = async (payload: Record<string, any>) => {
    const base = getBaseUrl().replace(/\/$/, '');
    const resp = await fetch(`${base}/farmer_managment/update_farm_details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await resp.json().catch(() => null);
    if (!resp.ok || body?.success === false) {
      throw new Error(body?.message || `Failed to update farm ${payload.farm_id || ''}`.trim());
    }
    return body;
  };

  const fetchFarmDirectory = async () => {
    const base = getBaseUrl().replace(/\/$/, '');
    const resp = await fetch(`${base}/farmer_managment/get_farms`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const body = await resp.json().catch(() => null);
    if (!resp.ok) {
      throw new Error(body?.message || 'Failed to resolve farm IDs');
    }
    return Array.isArray(body?.farms) ? body.farms : [];
  };

  // Returns the refreshed farmer (or null on failure) so callers that need the
  // fresh data synchronously — not just whatever eventually lands in `farmers`
  // state — can use it directly instead of racing a re-render.
  const refreshFarmerDetails = async (farmerId: string): Promise<FarmerRow | null> => {
    const base = getBaseUrl();
    const resp = await fetch(`${base.replace(/\/$/, '')}/farmer_managment/farmer_details/${farmerId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!resp.ok) return null;
    const detailJson = await resp.json();
    const farmerDetail = detailJson?.farmer ?? {};
    const farmDetail = Array.isArray(detailJson?.farm) ? detailJson.farm : [];
    const detailArea = farmDetail.reduce((sum: number, f: any) => sum + Number(f?.total_area ?? 0), 0);

    let updatedFarmer: FarmerRow | null = null;
    setFarmers((prev) =>
      prev.map((farmer) => {
        if (farmer.id !== farmerId) return farmer;
        const next: FarmerRow = {
          ...farmer,
          fullName: farmerDetail?.farmer_name || farmer.fullName,
          phoneNumber: farmerDetail?.farmer_contact || farmer.phoneNumber,
          alternatePhone: farmerDetail?.farmer_alternate_contact ?? farmer.alternatePhone,
          farmerAddress: farmerDetail?.farmer_address ?? farmer.farmerAddress ?? '',
          kyc: farmerDetail?.kyc_data ?? farmer.kyc,
          agreements: farmerDetail?.agreement_data ?? farmer.agreements,
          documents: farmerDetail?.documents ?? farmer.documents,
          bankDetails: Array.isArray(farmerDetail?.bank_details) ? farmerDetail.bank_details : farmer.bankDetails,
          farms: farmDetail,
          farmingOption: farmerDetail?.farming_option || farmer.farmingOption || '',
          landMapping: detailArea > 0
            ? { totalArea: detailArea, coordinates: farmDetail[0]?.land_coordinates || farmer.landMapping?.coordinates || [] }
            : farmer.landMapping,
          profileImageUrl: farmerDetail?.documents?.profile_photo?.url || farmer.profileImageUrl,
        };
        updatedFarmer = next;
        return next;
      })
    );
    return updatedFarmer;
  };

  const handleAddBankDetail = async (farmer: FarmerRow) => {
    const draft = bankDrafts[farmer.id];
    if (!draft?.holderName || !draft?.bankName || !draft?.accountNumber || !draft?.ifsc || !draft?.passbookPdf) {
      toast({ title: 'Missing fields', description: 'Please fill all fields and upload passbook PDF.', variant: 'destructive' });
      return false;
    }
    if (draft.passbookPdf.type !== 'application/pdf') {
      toast({ title: 'Invalid file', description: 'Please upload a PDF file only.', variant: 'destructive' });
      return false;
    }

    setBankSaving((prev) => ({ ...prev, [farmer.id]: true }));
    try {
      const base = getBaseUrl().replace(/\/$/, '');

      const addResp = await fetch(`${base}/farmer_managment/add_new_bank_details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farmer_id: farmer.id,
          account_number: draft.accountNumber,
          IFSC_code: draft.ifsc,
          holder_name: draft.holderName,
          bank_name: draft.bankName,
        }),
      });
      const addBody = await addResp.json().catch(() => null);
      if (!addResp.ok || addBody?.success !== true) {
        toast({ title: 'Error', description: addBody?.message || 'Failed to add bank details.', variant: 'destructive' });
        return false;
      }

      const formData = new FormData();
      formData.append('doc', draft.passbookPdf);
      const passbookResp = await fetch(
        `${base}/farmer_managment/update_bank_passbook_document?farmer_id=${encodeURIComponent(farmer.id)}`,
        {
          method: 'POST',
          body: formData,
        }
      );
      const passbookBody = await passbookResp.json().catch(() => null);
      if (!passbookResp.ok || passbookBody?.success !== true) {
        toast({
          title: 'Partial Success',
          description: 'Bank details added, but passbook upload failed.',
          variant: 'destructive',
        });
        return false;
      }

      await refreshFarmerDetails(farmer.id);
      setLocalBankDetails((prev) => ({
        ...prev,
        [farmer.id]: [
          ...(prev[farmer.id] ?? []),
          {
            holderName: draft.holderName,
            bankName: draft.bankName,
            accountNumber: draft.accountNumber,
            ifsc: draft.ifsc,
            passbookPdfName: draft.passbookPdf?.name || 'Uploaded',
          },
        ],
      }));
      setBankDrafts((prev) => ({
        ...prev,
        [farmer.id]: { holderName: '', bankName: '', accountNumber: '', ifsc: '', passbookPdf: null },
      }));
      toast({ title: 'Success', description: 'Bank details and passbook uploaded successfully.', variant: 'success' });
      return true;
    } catch (error) {
      console.error('Failed to add bank details:', error);
      toast({ title: 'Error', description: 'Failed to add bank details.', variant: 'destructive' });
      return false;
    } finally {
      setBankSaving((prev) => {
        const copy = { ...prev };
        delete copy[farmer.id];
        return copy;
      });
    }
  };

  const openAddCoOwnerModal = (farmId: string, farmTotalAcres: number) => {
    setCoOwnerAddForm({
      name: '', contact: '', address: '', email: '', aadhaar: '', pan: '', shareAcres: '',
      bankName: '', bankHolderName: '', bankAccountNumber: '', bankIfsc: '',
    });
    setCoOwnerAddModal({ open: true, farmId: String(farmId), farmTotalAcres });
  };

  const closeAddCoOwnerModal = () => setCoOwnerAddModal({ open: false, farmId: '', farmTotalAcres: 0 });

  const handleSaveCoOwner = async () => {
    const form = coOwnerAddForm;
    if (!form.name.trim() || !form.contact.trim() || !form.address.trim() || !form.aadhaar.trim() || !form.pan.trim() || !form.shareAcres.trim()) {
      toast({ title: 'Missing fields', description: 'Fill in name, contact, address, Aadhaar, PAN and share before saving.', variant: 'destructive' });
      return;
    }
    const shareAcres = Number(form.shareAcres);
    if (!Number.isFinite(shareAcres) || shareAcres <= 0) {
      toast({ title: 'Invalid share', description: "Enter the co-owner's share in acres as a positive number.", variant: 'destructive' });
      return;
    }
    const bankFields = [form.bankName, form.bankHolderName, form.bankAccountNumber, form.bankIfsc];
    const anyBankFilled = bankFields.some((value) => value.trim());
    const allBankFilled = bankFields.every((value) => value.trim());
    if (anyBankFilled && !allBankFilled) {
      toast({ title: 'Incomplete bank details', description: 'Fill in bank name, holder name, account number and IFSC, or leave them all blank.', variant: 'destructive' });
      return;
    }

    setCoOwnerAddSaving(true);
    try {
      const base = getBaseUrl().replace(/\/$/, '');
      const resp = await fetch(`${base}/farmer_managment/add_co_owner_to_farm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farm_id: coOwnerAddModal.farmId,
          co_owner_name: form.name.trim(),
          co_owner_contact: form.contact.trim(),
          co_owner_address: form.address.trim(),
          co_owner_email: form.email.trim() || null,
          co_owner_adhar_number: form.aadhaar.trim(),
          co_owner_pan_number: form.pan.trim().toUpperCase(),
          co_owner_share_percentage: shareAcres,
          co_owner_bank_details: allBankFilled ? {
            bank_name: form.bankName.trim(),
            holder_name: form.bankHolderName.trim(),
            account_number: form.bankAccountNumber.trim(),
            ifsc_code: form.bankIfsc.trim().toUpperCase(),
          } : null,
        }),
      });
      const body = await resp.json().catch(() => null);
      if (!resp.ok || body?.success !== true) {
        throw new Error(body?.message || body?.detail || `Failed to add co-owner (${resp.status})`);
      }
      toast({ title: 'Success', description: body?.message || 'Co-owner added successfully.', variant: 'success' });
      // Drop the cached entry for this farm so the co-owners effect refetches and picks up the new one.
      setParcelCoOwners((prev) => {
        if (!(coOwnerAddModal.farmId in prev)) return prev;
        const { [coOwnerAddModal.farmId]: _removed, ...rest } = prev;
        return rest;
      });
      closeAddCoOwnerModal();
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to add co-owner.', variant: 'destructive' });
    } finally {
      setCoOwnerAddSaving(false);
    }
  };

  const DocumentPreview = ({ title, url }: { title: string; url: string }) => {
    const lower = url.toLowerCase();
    const isImage = /\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(lower);
    const isPdf = /\.pdf(\?|$)/i.test(lower);

    return (
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
            title={title}
          >
            {title === 'Aadhaar Card' && <IdCard className="h-4 w-4" />}
            {title === 'PAN Card' && <IdCard className="h-4 w-4" />}
            {title === 'Kisan Book' && <BookOpen className="h-4 w-4" />}
            {title === 'B1 Record' && <FileBadge2 className="h-4 w-4" />}
            {title === 'Agreement' && <FileText className="h-4 w-4" />}
            {title === 'Passbook' && <Landmark className="h-4 w-4" />}
            {!['Aadhaar Card', 'PAN Card', 'Kisan Book', 'B1 Record', 'Agreement', 'Passbook'].includes(title) && <Eye className="h-4 w-4" />}
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {!url ? (
            <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
              No document uploaded
            </div>
          ) : isImage ? (
            <div className="max-h-[70vh] overflow-auto rounded-md border bg-muted/10 p-2">
              <img src={url} alt={title} className="w-full h-auto rounded" />
            </div>
          ) : isPdf ? (
            <div className="h-[70vh] rounded-md border overflow-hidden">
              <iframe src={url} title={title} className="h-full w-full" />
            </div>
          ) : (
            <div className="h-56 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <span>Preview not supported for this file type.</span>
              <a href={url} target="_blank" rel="noreferrer" className="text-blue-600 underline">Open document</a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  };

  // Document card used in the "View Profile" popup — mirrors the Employee Directory
  // profile modal's document tiles (thumbnail/icon + label + Uploaded/Pending state).
  const ProfileDocumentCard = ({ title, url, Icon }: { title: string; url: string; Icon: typeof FileText }) => {
    const isImage = /\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(url.toLowerCase());

    return (
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            disabled={!url}
            className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-emerald-200 hover:shadow-md disabled:cursor-not-allowed"
          >
            <div className="flex h-24 items-center justify-center bg-slate-50">
              {url && isImage ? (
                <img src={url} alt={title} className="h-full w-full object-cover" />
              ) : (
                <Icon className="h-8 w-8 text-slate-300" />
              )}
            </div>
            <div className="p-3">
              <p className="text-sm font-bold text-slate-900">{title}</p>
              <p className={`mt-0.5 text-xs font-bold ${url ? 'text-emerald-600' : 'text-slate-400'}`}>
                {url ? 'Uploaded' : 'Pending'}
              </p>
            </div>
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {!url ? (
            <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
              No document uploaded
            </div>
          ) : isImage ? (
            <div className="max-h-[70vh] overflow-auto rounded-md border bg-muted/10 p-2">
              <img src={url} alt={title} className="w-full h-auto rounded" />
            </div>
          ) : (
            <div className="h-[70vh] rounded-md border overflow-hidden">
              <iframe src={url} title={title} className="h-full w-full" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  };

  const EditDocumentUploadCard = ({
    title,
    icon: Icon,
    existingUrl,
    file,
    accept,
    onFileChange,
  }: {
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    existingUrl: string;
    file: File | null;
    accept: string;
    onFileChange: (file: File | null) => void;
  }) => {
    const lowerUrl = existingUrl.toLowerCase();
    const isImage = /\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(lowerUrl);
    const isPdf = /\.pdf(\?|$)/i.test(lowerUrl);
    const statusText = file ? file.name : existingUrl ? 'Current document available' : 'No document uploaded';

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-blue-200 hover:shadow-md">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {isImage ? (
              <img src={existingUrl} alt={title} className="h-full w-full object-cover" />
            ) : isPdf ? (
              <FileText className="h-5 w-5 text-red-500" />
            ) : (
              <Icon className="h-5 w-5 text-slate-500" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-900">{title}</p>
                <p className={`mt-0.5 truncate text-[11px] ${file ? 'text-emerald-700' : existingUrl ? 'text-slate-500' : 'text-slate-400'}`}>
                  {statusText}
                </p>
              </div>
              {existingUrl ? (
                <DocumentPreview title={title} url={existingUrl} />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-slate-200 text-slate-300">
                  <Eye className="h-4 w-4" />
                </div>
              )}
            </div>
            <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">
              <FileUp className="h-3.5 w-3.5" />
              {file ? 'Replace selected file' : existingUrl ? 'Replace document' : 'Upload document'}
              <input type="file" accept={accept} className="hidden" onChange={(e) => onFileChange(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        </div>
      </div>
    );
  };

  const handleCropSelectionRequest = (farmerId: string, nextValue: CropSelectValue) => {
    const normalized: CropValue = nextValue === 'none' ? '' : (nextValue as CropValue);
    const current = cropSelections[farmerId] ?? '';
    if (normalized === current) return;
    setPendingCropChange({ farmerId, crop: normalized });
  };

  const openNewLandPopup = (farmerId: string) => {
    setNewLandForm({
      state: '',
      district: '',
      village: '',
      cropType: '',
      acres: '',
      landLocation: '',
      landMapping: [],
      leaseStart: '',
      leaseEnd: '',
      leaseAmount: '',
      lockInStart: '',
      lockInEnd: '',
      agreementPdf: null,
      b1Pdf: null,
      kisanBookPdf: null,
      landImages: [],
      landVideo: null,
      coOwners: [],
    });
    setNewLandLocation(null);
    setNewLandImagePreviews([null, null, null]);
    setNewLandVideoPreview(null);
    setNewLandKmlCoordinates(null);
    setNewLandStep(1);
    setNewLandModal({ open: true, farmerId });
  };

  const getNewLandUserLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: 'Location unavailable', description: 'Geolocation is not supported by your browser.', variant: 'destructive' });
      return;
    }
    setNewLandLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { lat: position.coords.latitude, lng: position.coords.longitude };
        setNewLandLocation(next);
        setNewLandForm((prev) => ({ ...prev, landLocation: `${next.lat}, ${next.lng}` }));
        setNewLandLocationLoading(false);
      },
      () => {
        toast({ title: 'Location error', description: 'Unable to fetch your current location.', variant: 'destructive' });
        setNewLandLocationLoading(false);
      }
    );
  };

  const handleNewLandImagePick = (index: number, file: File | null) => {
    const files = [...newLandForm.landImages];
    files[index] = file as File;
    const compact = files.filter(Boolean).slice(0, 3);
    setNewLandForm((prev) => ({ ...prev, landImages: compact }));

    const previews = [...newLandImagePreviews];
    previews[index] = file ? URL.createObjectURL(file) : null;
    setNewLandImagePreviews(previews);
  };

  const clearNewLandImagePick = (index: number) => {
    const previews = [...newLandImagePreviews];
    previews[index] = null;
    setNewLandImagePreviews(previews);
    const files = [...newLandForm.landImages];
    files[index] = undefined as any;
    setNewLandForm((prev) => ({ ...prev, landImages: files.filter(Boolean).slice(0, 3) }));
  };

  const handleNewLandVideoPick = (file: File | null) => {
    setNewLandForm((prev) => ({ ...prev, landVideo: file }));
    setNewLandVideoPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleNewLandKmlUpload = async (file: File) => {
    try {
      setNewLandIsParsingKml(true);
      const result = await parseKmlFile(file);
      const coords = result.land_coordinates.map(([lat, lng]: [number, number]) => ({ lat, lng }));
      setNewLandKmlCoordinates(coords);
      toast({ title: 'KML loaded', description: `${coords.length} boundary points mapped from file` });
    } catch (err: any) {
      toast({ title: 'KML Error', description: err?.message || 'Failed to read KML file', variant: 'destructive' });
    } finally {
      setNewLandIsParsingKml(false);
    }
  };

  const handleAddLandDetails = async () => {
    if (!newLandForm.state || !newLandForm.district || !newLandForm.village || !newLandForm.acres || !newLandForm.landLocation) {
      toast({ title: 'Missing fields', description: 'Please complete Step 1 fields.', variant: 'destructive' });
      return;
    }
    const effectiveLandMapping = (newLandKmlCoordinates && newLandKmlCoordinates.length >= 3)
      ? newLandKmlCoordinates.map(c => [c.lat, c.lng] as [number, number])
      : newLandForm.landMapping;
    if (!effectiveLandMapping || effectiveLandMapping.length < 3) {
      toast({ title: 'Missing mapping', description: 'Please complete land mapping in Step 2 (KML upload or draw on map).', variant: 'destructive' });
      return;
    }
    if (!newLandForm.leaseStart || !newLandForm.leaseEnd || !newLandForm.leaseAmount) {
      toast({ title: 'Missing fields', description: 'Please fill lease dates and amount in Step 4.', variant: 'destructive' });
      return;
    }
    const lockInError = validateLockInPeriod(
      newLandForm.leaseStart,
      newLandForm.leaseEnd,
      newLandForm.lockInStart,
      newLandForm.lockInEnd
    );
    if (lockInError) {
      toast({ title: 'Invalid lock-in period', description: lockInError, variant: 'destructive' });
      return;
    }
    if (!newLandModal.farmerId) {
      toast({ title: 'Error', description: 'Farmer ID missing.', variant: 'destructive' });
      return;
    }
    const incompleteCoOwner = newLandForm.coOwners.find((coOwner) => (
      Object.values(coOwner).some((value) => String(value).trim()) &&
      (!coOwner.fullName.trim() || !coOwner.phoneNumber.trim())
    ));
    if (incompleteCoOwner) {
      toast({ title: 'Incomplete co-owner', description: 'Full name and phone number are required for every co-owner.', variant: 'destructive' });
      return;
    }
    const invalidShare = newLandForm.coOwners.find((coOwner) => {
      if (coOwner.ownershipShare === '') return false;
      const share = Number(coOwner.ownershipShare);
      return !Number.isFinite(share) || share < 0 || share > 100;
    });
    if (invalidShare) {
      toast({ title: 'Invalid ownership share', description: 'Ownership share must be between 0 and 100.', variant: 'destructive' });
      return;
    }

    try {
      setNewLandSaving(true);
      const base = getBaseUrl().replace(/\/$/, '');
      const farmer = farmers.find((f) => f.id === newLandModal.farmerId);

      let imageUrls: string[] = [];
      if (newLandForm.landImages.length > 0) {
        const imagesFormData = new FormData();
        newLandForm.landImages.forEach((file) => imagesFormData.append('land_images', file, file.name));
        const imagesResp = await fetch(`${base}/farmer_managment/upload_land_images`, {
          method: 'POST',
          body: imagesFormData,
        });
        const imagesBody = await imagesResp.json().catch(() => null);
        if (!imagesResp.ok || imagesBody?.success !== true || !Array.isArray(imagesBody?.images)) {
          throw new Error(imagesBody?.message || 'Failed to upload land images');
        }
        imageUrls = imagesBody.images.map((x: any) => x?.url).filter((u: any) => typeof u === 'string' && u.length > 0);
      }

      let videoUrl = '';
      if (newLandForm.landVideo) {
        const videoFormData = new FormData();
        videoFormData.append('land_video', newLandForm.landVideo, newLandForm.landVideo.name);
        const videoResp = await fetch(`${base}/farmer_managment/upload_land_video`, {
          method: 'POST',
          body: videoFormData,
        });
        const videoBody = await videoResp.json().catch(() => null);
        if (!videoResp.ok || videoBody?.success !== true || !videoBody?.video?.url) {
          throw new Error(videoBody?.message || 'Failed to upload land video');
        }
        videoUrl = videoBody.video.url;
      }

      const totalArea = parseFloat(String(newLandForm.acres).trim());
      if (!Number.isFinite(totalArea)) {
        throw new Error('Invalid acres value');
      }

      const addLandPayload = {
        farmer_id: newLandModal.farmerId,
        land_coordinates: effectiveLandMapping,
        total_area: totalArea,
        state: newLandForm.state,
        district: newLandForm.district,
        village: newLandForm.village,
        crop_type: String(newLandForm.cropType || '').toLowerCase(),
        farming_option: farmer?.farmingOption || 'Lease Farming',
        land_photos_urls: imageUrls,
        land_video_url: videoUrl,
        co_owner_details: serializeLandCoOwners(newLandForm.coOwners),
        lease_start_date: newLandForm.leaseStart,
        lease_end_date: newLandForm.leaseEnd,
        lease_rate: Number(newLandForm.leaseAmount),
        lock_in_start_date: newLandForm.lockInStart || null,
        lock_in_end_date: newLandForm.lockInEnd || null,
      };
      const addLandResp = await fetch(`${base}/farmer_managment/add_new_land_to_existing_farmer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addLandPayload),
      });
      const addLandBody = await addLandResp.json().catch(() => null);
      if (!addLandResp.ok || addLandBody?.success !== true) {
        throw new Error(addLandBody?.message || 'Failed to add land');
      }

      const uploadDoc = async (path: string, doc: File) => {
        const fd = new FormData();
        fd.append('doc', doc, doc.name);
        const resp = await fetch(`${base}${path}?farmer_id=${encodeURIComponent(newLandModal.farmerId as string)}`, {
          method: 'POST',
          body: fd,
        });
        const body = await resp.json().catch(() => null);
        if (!resp.ok || body?.success !== true) throw new Error(body?.message || `Failed: ${path}`);
      };

      if (newLandForm.agreementPdf) await uploadDoc('/farmer_managment/upload_new_agreement_document', newLandForm.agreementPdf);
      if (newLandForm.b1Pdf) await uploadDoc('/farmer_managment/add_new_B1_record', newLandForm.b1Pdf);
      if (newLandForm.kisanBookPdf) await uploadDoc('/farmer_managment/add_new_kisan_book', newLandForm.kisanBookPdf);

      await refreshFarmerDetails(newLandModal.farmerId);
      toast({ title: 'Success', description: 'Land and documents added successfully.', variant: 'success' });
      setNewLandModal({ open: false, farmerId: null });
    } catch (error) {
      console.error('Failed to save new land:', error);
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to save land', variant: 'destructive' });
    } finally {
      setNewLandSaving(false);
    }
  };

  const confirmCropSelection = async () => {
    if (!pendingCropChange) return;
    const { farmerId, crop } = pendingCropChange;
    setCropUpdating((prev) => ({ ...prev, [farmerId]: true }));
    try {
      const base = getBaseUrl();
      const resp = await fetch(`${base.replace(/\/$/, '')}/farmer_managment/set_crop_type`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farmer_id: farmerId,
          crop_type: crop,
        }),
      });

      let body: any = null;
      try { body = await resp.json(); } catch { body = null; }

      if (resp.ok && body?.success === true && body?.message === 'Crop type update initiated') {
        setCropSelections((prev) => ({ ...prev, [farmerId]: crop }));
        setFarmers((prev) => prev.map((f) => (f.id === farmerId ? { ...f, crop } : f)));
        toast({ title: 'Success', description: 'Crop type has been added successfully', variant: 'success' });
      } else {
        toast({ title: 'Error', description: body?.message || 'Failed to update crop type', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Failed to set crop type:', error);
      toast({ title: 'Error', description: 'Failed to update crop type', variant: 'destructive' });
    } finally {
      setCropUpdating((prev) => {
        const copy = { ...prev };
        delete copy[farmerId];
        return copy;
      });
      setPendingCropChange(null);
    }
  };

  const activeFarmsPopupFarmer = useMemo(
    () => farmers.find((f) => f.id === farmsPopupFarmerId) ?? null,
    [farmers, farmsPopupFarmerId]
  );

  const viewProfileFarmer = useMemo(
    () => farmers.find((f) => f.id === viewProfileFarmerId) ?? null,
    [farmers, viewProfileFarmerId]
  );

  // Opening a profile shows whatever's cached locally first, then refreshes in the
  // background — viewProfileFarmer re-derives automatically once `farmers` updates.
  useEffect(() => {
    if (!viewProfileFarmerId) return;
    setFarmerLandLoading(true);
    refreshFarmerDetails(viewProfileFarmerId).finally(() => setFarmerLandLoading(false));
  }, [viewProfileFarmerId]);

  // Land Parcels tab: fetch cluster/zone/block names per parcel, lazily, once the tab is opened
  // and the farmer's farms have loaded — each parcel's grid cell spins until its own call resolves.
  useEffect(() => {
    if (profilePopupTab !== 'parcels' || !viewProfileFarmer) return;
    const farmList = Array.isArray(viewProfileFarmer.farms) ? viewProfileFarmer.farms : [];
    if (farmList.length === 0) return;
    const base = getBaseUrl().replace(/\/$/, '');

    farmList.forEach((rawFarm: any, index: number) => {
      const parcelId = String(rawFarm?.farm_id ?? rawFarm?.id ?? `${viewProfileFarmer.id}-farm-${index + 1}`);
      if (parcelBlockZoneCluster[parcelId]) return;

      setParcelBlockZoneCluster((prev) => (prev[parcelId] ? prev : { ...prev, [parcelId]: { loading: true } }));

      fetch(`${base}/farmer_managment/get_block_zone_cluster_for_farm/${parcelId}`)
        .then((resp) => (resp.ok ? resp.json() : null))
        .catch(() => null)
        .then((data) => {
          setParcelBlockZoneCluster((prev) => ({
            ...prev,
            [parcelId]: {
              loading: false,
              block_name: data?.block_name ?? null,
              zone_name: data?.zone_name ?? null,
              cluster_name: data?.cluster_name ?? null,
            },
          }));
        });
    });
  }, [profilePopupTab, viewProfileFarmer, parcelBlockZoneCluster]);

  // Co-owners: fetched once the view-profile popup is opened (not gated to a specific tab) —
  // one call per farm_id, so an owner with 3 lands fires 3 calls, each cached by farm_id.
  useEffect(() => {
    if (!viewProfileFarmerId || !viewProfileFarmer) return;
    const farmList = Array.isArray(viewProfileFarmer.farms) ? viewProfileFarmer.farms : [];
    if (farmList.length === 0) return;
    const base = getBaseUrl().replace(/\/$/, '');

    farmList.forEach((rawFarm: any, index: number) => {
      const farmId = String(rawFarm?.farm_id ?? rawFarm?.id ?? `${viewProfileFarmer.id}-farm-${index + 1}`);
      if (parcelCoOwners[farmId]) return;

      setParcelCoOwners((prev) => (prev[farmId] ? prev : { ...prev, [farmId]: { loading: true, items: [] } }));

      fetch(`${base}/farmer_managment/get_co_owners_for_farm/${farmId}`)
        .then((resp) => (resp.ok ? resp.json() : null))
        .catch(() => null)
        .then((data) => {
          setParcelCoOwners((prev) => ({
            ...prev,
            [farmId]: {
              loading: false,
              items: Array.isArray(data?.co_owners) ? data.co_owners : [],
            },
          }));
        });
    });
  }, [viewProfileFarmerId, viewProfileFarmer, parcelCoOwners]);

  // Flattens co-owners across every farm belonging to the viewed owner — used by both the
  // Co-Owner Details card and the Bank Details card in the Land Owner Details tab.
  const viewProfileFarmerCoOwners = useMemo(() => {
    if (!viewProfileFarmer) return { items: [] as Array<ParcelCoOwnerApi & { farmId: string }>, loading: false };
    const farmList = Array.isArray(viewProfileFarmer.farms) ? viewProfileFarmer.farms : [];
    if (farmList.length === 0) return { items: [] as Array<ParcelCoOwnerApi & { farmId: string }>, loading: false };
    let loading = false;
    const items: Array<ParcelCoOwnerApi & { farmId: string }> = [];
    farmList.forEach((rawFarm: any, index: number) => {
      const farmId = String(rawFarm?.farm_id ?? rawFarm?.id ?? `${viewProfileFarmer.id}-farm-${index + 1}`);
      const state = parcelCoOwners[farmId];
      if (!state || state.loading) { loading = true; return; }
      state.items.forEach((coOwner) => items.push({ ...coOwner, farmId }));
    });
    return { items, loading };
  }, [viewProfileFarmer, parcelCoOwners]);

  const activeEditFarmer = useMemo(
    () => farmers.find((f) => f.id === editFarmerModal.farmerId) ?? null,
    [farmers, editFarmerModal.farmerId]
  );

  // Shared by openEditModal (instant open with whatever's cached locally) and the
  // background refresh that follows it (swaps in the authoritative data once it lands).
  const buildEditFarmerFarms = (farmer: FarmerRow, agreement: any) => {
    const farms = Array.isArray(farmer.farms) ? farmer.farms : [];
    const normalizeCoords = (rawCoords: any[]): [number, number][] =>
      rawCoords
        .map((c: any) => Array.isArray(c) ? [Number(c[0]), Number(c[1])] : [Number(c?.lat), Number(c?.lng)])
        .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b)) as [number, number][];

    return farms.length > 0
      ? farms.map((farm: any) => ({
        farmId: farm.farm_id ?? farm.id ?? '',
        village: farm.village ?? '',
        district: farm.district ?? '',
        state: farm.state ?? '',
        cropType: farm.crop_type ?? '',
        totalArea: String(farm.total_area ?? ''),
        images: [null, null, null],
        imagePreviews: [
          farm.land_media?.images?.[0] ?? null,
          farm.land_media?.images?.[1] ?? null,
          farm.land_media?.images?.[2] ?? null,
        ],
        video: null,
        videoPreview: farm.land_media?.video ?? null,
        landCoordinates: normalizeCoords(Array.isArray(farm.land_coordinates) ? farm.land_coordinates : []),
        kmlCoordinates: null,
        isParsingKml: false,
        coOwners: normalizeLandCoOwners(farm),
        leaseStart: String(farm.lease_start_date ?? farm.lease_start ?? agreement?.agreement_start_date ?? agreement?.agreementStart ?? ''),
        leaseEnd: String(farm.lease_end_date ?? farm.lease_end ?? agreement?.agreement_end_date ?? agreement?.agreementEnd ?? ''),
        leaseRate: String(farm.lease_rate ?? farm.lease_rent ?? agreement?.lease_rate ?? agreement?.lease_rent ?? agreement?.leaseRent ?? ''),
        lockInStart: String(farm.lock_in_start_date ?? farm.lock_in_start ?? ''),
        lockInEnd: String(farm.lock_in_end_date ?? farm.lock_in_end ?? ''),
      }))
      // Legacy farmers whose land was never migrated into `farms[]` still carry it on
      // the top-level landMapping/documents/agreement fields — the read-only "Land
      // Parcels" tab (getFarmCards) already synthesizes one card from those; mirror
      // that here so Edit Land isn't empty for them. farmId stays '' — the save flow
      // creates a real farm record (via add_new_land_to_existing_farmer) the first
      // time this gets saved, since there's no existing farm_id to update.
      : [{
        farmId: '',
        village: farmer.village ?? '',
        district: farmer.district ?? '',
        state: farmer.state ?? '',
        cropType: cropSelections[farmer.id] ?? farmer.crop ?? '',
        totalArea: String(farmer.landMapping?.totalArea ?? ''),
        images: [null, null, null],
        imagePreviews: [farmer.documents?.land_image_1?.url ?? null, null, null],
        video: null,
        videoPreview: null,
        landCoordinates: normalizeCoords(Array.isArray(farmer.landMapping?.coordinates) ? farmer.landMapping.coordinates : []),
        kmlCoordinates: null,
        isParsingKml: false,
        coOwners: [],
        leaseStart: String(agreement?.agreement_start_date ?? agreement?.agreementStart ?? ''),
        leaseEnd: String(agreement?.agreement_end_date ?? agreement?.agreementEnd ?? ''),
        leaseRate: String(agreement?.lease_rate ?? agreement?.lease_rent ?? agreement?.leaseRent ?? ''),
        lockInStart: '',
        lockInEnd: '',
      }];
  };

  const openEditModal = (farmer: FarmerRow, openInSeparateDialog = true) => {
    const kyc = Array.isArray(farmer.kyc) ? farmer.kyc[0] : farmer.kyc;
    const agreement = Array.isArray(farmer.agreements) ? farmer.agreements[0] : farmer.agreements;
    const bank = Array.isArray(farmer.bankDetails) && farmer.bankDetails.length > 0 ? farmer.bankDetails[0] : null;

    setEditFarmerForm({
      fullName: farmer.fullName,
      phoneNumber: farmer.phoneNumber,
      alternatePhone: farmer.alternatePhone ?? '',
      profilePhoto: null,
      state: farmer.state,
      district: farmer.district,
      taluka: farmer.taluka ?? '',
      village: farmer.village,
      blockAssigned: farmer.blockAssigned ?? '',
      farmingOption: farmer.farmingOption ?? '',
      aadhaarNumber: kyc?.adhar_number ?? '',
      panNumber: kyc?.pan_numnber ?? kyc?.pan_number ?? '',
      aadhaarCardFile: null,
      panCardFile: null,
      kisanBookFile: null,
      b1RecordFile: null,
      leaseRent: String(agreement?.lease_rent ?? agreement?.leaseRent ?? ''),
      agreementStartDate: agreement?.agreement_start_date ?? agreement?.agreementStart ?? '',
      agreementEndDate: agreement?.agreement_end_date ?? agreement?.agreementEnd ?? '',
      agreementFile: null,
      bankHolderName: bank?.holder_name ?? bank?.account_holder_name ?? '',
      bankName: bank?.bank_name ?? bank?.name ?? '',
      bankAccountNumber: bank?.account_number ?? bank?.accound_number ?? '',
      bankIfsc: bank?.ifsc_code ?? bank?.IFSC_code ?? '',
      passbookFile: null,
    });
    setEditProfilePhotoPreview(null);
    setEditFarmerFarms(buildEditFarmerFarms(farmer, agreement));
    setEditFarmIndex(0);
    setEditFarmerTab('personal');
    setEditFarmerModal({ open: openInSeparateDialog, farmerId: farmer.id });
    setInlineProfileEditing(!openInSeparateDialog);

    // The modal opens instantly with whatever's cached locally; swap in the
    // authoritative land data (correct farm_ids included) once it lands, so a
    // stale/missing farm_id here can't silently break saving or hide a parcel.
    setFarmerLandLoading(true);
    refreshFarmerDetails(farmer.id)
      .then((refreshed) => {
        if (!refreshed) return;
        const refreshedAgreement = Array.isArray(refreshed.agreements) ? refreshed.agreements[0] : refreshed.agreements;
        setEditFarmerFarms(buildEditFarmerFarms(refreshed, refreshedAgreement));
      })
      .finally(() => setFarmerLandLoading(false));
  };

  const openLandEditModal = (farmer: FarmerRow, farmIndex: number, addCoOwner = false) => {
    openEditModal(farmer);
    setEditFarmerTab('farms');
    setEditFarmIndex(farmIndex);
    if (addCoOwner) {
      setEditFarmerFarms((previous) => previous.map((farm, index) => (
        index === farmIndex
          ? { ...farm, coOwners: [...farm.coOwners, createEmptyLandCoOwner()] }
          : farm
      )));
    }
  };

  const closeEditModal = () => {
    setEditFarmerSaving(false);
    setEditProfilePhotoPreview(null);
    setInlineProfileEditing(false);
    setEditFarmerModal({ open: false, farmerId: null });
  };

  const handleSaveEditFarmer = async () => {
    if (!activeEditFarmer) {
      toast({ title: 'Error', description: 'Farmer not found.', variant: 'destructive' });
      return;
    }

    const fullName = editFarmerForm.fullName.trim();
    const phoneNumber = editFarmerForm.phoneNumber.trim();
    if (!fullName || !phoneNumber) {
      toast({ title: 'Missing fields', description: 'Full name and phone number are required.', variant: 'destructive' });
      return;
    }

    setEditFarmerSaving(true);
    try {
      const farmerId = activeEditFarmer.id;
      const currentKyc = Array.isArray(activeEditFarmer.kyc) ? activeEditFarmer.kyc[0] : activeEditFarmer.kyc;
      const nextKyc = {
        ...(currentKyc ?? {}),
        adhar_number: editFarmerForm.aadhaarNumber.trim(),
        pan_numnber: editFarmerForm.panNumber.trim(),
        pan_number: editFarmerForm.panNumber.trim(),
      };
      const currentAgreement = Array.isArray(activeEditFarmer.agreements)
        ? activeEditFarmer.agreements[0] as any
        : activeEditFarmer.agreements as any;
      const nextAgreement = {
        ...(currentAgreement ?? {}),
        lease_rent: editFarmerForm.leaseRent === '' ? '' : Number(editFarmerForm.leaseRent),
        agreement_start_date: editFarmerForm.agreementStartDate,
        agreement_end_date: editFarmerForm.agreementEndDate,
      };
      const currentBanks = Array.isArray(activeEditFarmer.bankDetails) ? activeEditFarmer.bankDetails : [];
      const nextBank = {
        ...(currentBanks[0] ?? {}),
        holder_name: editFarmerForm.bankHolderName.trim(),
        bank_name: editFarmerForm.bankName.trim(),
        account_number: editFarmerForm.bankAccountNumber.trim(),
        ifsc_code: editFarmerForm.bankIfsc.trim(),
        IFSC_code: editFarmerForm.bankIfsc.trim(),
      };
      const shouldKeepBank = Object.values(nextBank).some((value) => String(value ?? '').trim().length > 0);
      const existingDocuments = activeEditFarmer.documents ?? {};
      const uploadedDocuments: Partial<Record<FarmerDocumentKey, any>> = {};
      const uploads: Array<{ key: FarmerDocumentKey; file: File | null }> = [
        { key: 'profile_photo', file: editFarmerForm.profilePhoto },
        { key: 'adhar_card', file: editFarmerForm.aadhaarCardFile },
        { key: 'pand_card', file: editFarmerForm.panCardFile },
        { key: 'kisan_book', file: editFarmerForm.kisanBookFile },
        { key: 'B1_record', file: editFarmerForm.b1RecordFile },
        { key: 'agreement', file: editFarmerForm.agreementFile },
        { key: 'bank_passbook', file: editFarmerForm.passbookFile },
      ];
      const hasDocumentChanges = uploads.some((upload) => upload.file);
      const hasFarmerDetailsChanges =
        fullName !== activeEditFarmer.fullName ||
        phoneNumber !== activeEditFarmer.phoneNumber ||
        editFarmerForm.alternatePhone.trim() !== (activeEditFarmer.alternatePhone ?? '') ||
        editFarmerForm.state !== activeEditFarmer.state ||
        editFarmerForm.district !== activeEditFarmer.district ||
        editFarmerForm.taluka.trim() !== (activeEditFarmer.taluka ?? '') ||
        editFarmerForm.village !== activeEditFarmer.village ||
        editFarmerForm.blockAssigned.trim() !== (activeEditFarmer.blockAssigned ?? '') ||
        editFarmerForm.farmingOption !== (activeEditFarmer.farmingOption ?? '') ||
        editFarmerForm.aadhaarNumber.trim() !== String(currentKyc?.adhar_number ?? '') ||
        editFarmerForm.panNumber.trim() !== String(currentKyc?.pan_numnber ?? currentKyc?.pan_number ?? '') ||
        editFarmerForm.leaseRent !== String(currentAgreement?.lease_rent ?? currentAgreement?.leaseRent ?? '') ||
        editFarmerForm.agreementStartDate !== String(currentAgreement?.agreement_start_date ?? currentAgreement?.agreementStart ?? '') ||
        editFarmerForm.agreementEndDate !== String(currentAgreement?.agreement_end_date ?? currentAgreement?.agreementEnd ?? '') ||
        editFarmerForm.bankHolderName.trim() !== String(currentBanks[0]?.holder_name ?? currentBanks[0]?.account_holder_name ?? '') ||
        editFarmerForm.bankName.trim() !== String(currentBanks[0]?.bank_name ?? currentBanks[0]?.name ?? '') ||
        editFarmerForm.bankAccountNumber.trim() !== String(currentBanks[0]?.account_number ?? currentBanks[0]?.accound_number ?? '') ||
        editFarmerForm.bankIfsc.trim() !== String(currentBanks[0]?.ifsc_code ?? currentBanks[0]?.IFSC_code ?? '');
      const hasFarmerChanges = hasFarmerDetailsChanges || hasDocumentChanges;

      if (hasFarmerChanges) {
        for (const upload of uploads) {
          if (!upload.file) continue;
          const uploadedDocument = await uploadFarmerDocument(farmerId, upload.key, upload.file);
          if (uploadedDocument) {
            uploadedDocuments[upload.key] = uploadedDocument;
          }
        }
      }

      const detailAfterUploads = hasDocumentChanges
        ? await fetchFarmerDetailSnapshot(farmerId)
        : null;
      const refreshedDocuments = detailAfterUploads?.farmer?.documents ?? {};
      const nextDocuments = {
        ...existingDocuments,
        ...refreshedDocuments,
        ...uploadedDocuments,
      };

      const updatePayload = {
        farmer_id: farmerId,
        kyc_data: [nextKyc],
        agreement_data: [nextAgreement],
        bank_details: shouldKeepBank ? [nextBank, ...currentBanks.slice(1)] : currentBanks,
        farmer_name: fullName,
        farmer_contact: phoneNumber,
        farmer_alternate_contact: editFarmerForm.alternatePhone.trim(),
        farmer_address: activeEditFarmer.farmerAddress ?? nextKyc?.permanent_address ?? '',
        documents: nextDocuments,
      };

      if (hasFarmerChanges) {
        const base = getBaseUrl().replace(/\/$/, '');
        const updateResp = await fetch(`${base}/farmer_managment/update_farmer_details`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        });
        const updateBody = await updateResp.json().catch(() => null);
        if (!updateResp.ok || updateBody?.success === false) {
          throw new Error(updateBody?.message || 'Failed to update farmer details');
        }
      }

      const updatedFarmPayloads: Array<{ index: number; payload: Record<string, any> }> = [];
      let farmDirectoryCache: any[] | null = null;
      const resolveFarmId = async (farm: (typeof editFarmerFarms)[number], originalFarm: any, index: number) => {
        const directId = farm.farmId || originalFarm.farm_id || originalFarm.id;
        if (directId) return directId;

        if (!farmDirectoryCache) {
          farmDirectoryCache = await fetchFarmDirectory();
        }

        const farmerFarms = farmDirectoryCache.filter((item) => String(item?.farmer_id ?? '') === farmerId);
        const coordinateMatch = farmerFarms.find((item) => {
          const itemCoords = JSON.stringify(Array.isArray(item?.land_coordinates) ? item.land_coordinates : []);
          const originalCoords = JSON.stringify(Array.isArray(originalFarm?.land_coordinates) ? originalFarm.land_coordinates : []);
          return originalCoords !== '[]' && itemCoords === originalCoords;
        });
        const fieldMatch = farmerFarms.find((item) =>
          String(item?.state ?? '') === String(farm.state ?? '') &&
          String(item?.district ?? '') === String(farm.district ?? '') &&
          String(item?.village ?? '') === String(farm.village ?? '') &&
          Number(item?.total_area ?? 0) === Number(farm.totalArea || 0)
        );
        const indexMatch = farmerFarms[index];
        return coordinateMatch?.farm_id || fieldMatch?.farm_id || indexMatch?.farm_id || '';
      };

      for (const [index, farm] of editFarmerFarms.entries()) {
        const originalFarm = Array.isArray(activeEditFarmer.farms) ? activeEditFarmer.farms[index] ?? {} : {};
        const lockInError = validateLockInPeriod(
          farm.leaseStart,
          farm.leaseEnd,
          farm.lockInStart,
          farm.lockInEnd
        );
        if (lockInError) {
          throw new Error(`${lockInError} (Farm ${index + 1})`);
        }
        const incompleteCoOwner = farm.coOwners.find((coOwner) => (
          Object.values(coOwner).some((value) => String(value).trim()) &&
          (!coOwner.fullName.trim() || !coOwner.phoneNumber.trim())
        ));
        if (incompleteCoOwner) {
          throw new Error(`Full name and phone number are required for every co-owner in Farm ${index + 1}`);
        }
        const invalidShare = farm.coOwners.find((coOwner) => {
          if (coOwner.ownershipShare === '') return false;
          const share = Number(coOwner.ownershipShare);
          return !Number.isFinite(share) || share < 0 || share > 100;
        });
        if (invalidShare) {
          throw new Error(`Ownership share must be between 0 and 100 for Farm ${index + 1}`);
        }
        let farmId = await resolveFarmId(farm, originalFarm, index);
        if (!farmId) {
          // No existing farm_id anywhere — this is a legacy single-parcel farmer
          // (land only ever lived on landMapping/agreements) being edited for the
          // first time. Create a real farm record so there's something to update.
          const base = getBaseUrl().replace(/\/$/, '');
          const createResp = await fetch(`${base}/farmer_managment/add_new_land_to_existing_farmer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              farmer_id: farmerId,
              land_coordinates: farm.kmlCoordinates
                ? farm.kmlCoordinates.map((coord) => [coord.lat, coord.lng])
                : farm.landCoordinates,
              total_area: farm.totalArea === '' ? 0 : Number(farm.totalArea),
              state: farm.state,
              district: farm.district,
              village: farm.village,
              crop_type: String(farm.cropType || '').toLowerCase(),
              farming_option: activeEditFarmer.farmingOption || 'Lease Farming',
              land_photos_urls: [],
              land_video_url: null,
              co_owner_details: serializeLandCoOwners(farm.coOwners),
              lease_start_date: farm.leaseStart || null,
              lease_end_date: farm.leaseEnd || null,
              lease_rate: farm.leaseRate === '' ? null : Number(farm.leaseRate),
              lock_in_start_date: farm.lockInStart || null,
              lock_in_end_date: farm.lockInEnd || null,
            }),
          });
          const createBody = await createResp.json().catch(() => null);
          if (!createResp.ok || createBody?.success !== true || !createBody?.farm_id) {
            throw new Error(createBody?.message || `Failed to create Farm ${index + 1}`);
          }
          farmId = String(createBody.farm_id);
          // The create endpoint only persists coordinates/state/district/village/crop_type/
          // media — fall through into the normal update call below so lease, lock-in, and
          // co-owner details (which it silently ignores) actually get saved too.
        }

        const originalMedia = originalFarm.land_media ?? {};
        const finalImages = Array.isArray(originalMedia.images) ? [...originalMedia.images] : [];
        const changedImageFiles = farm.images
          .map((file, imageIndex) => ({ file, imageIndex }))
          .filter((item): item is { file: File; imageIndex: number } => item.file instanceof File);
        const effectiveCoordinates = farm.kmlCoordinates
          ? farm.kmlCoordinates.map((coord) => [coord.lat, coord.lng])
          : farm.landCoordinates;
        const originalCoordinates = Array.isArray(originalFarm.land_coordinates) ? originalFarm.land_coordinates : [];
        const coOwnerPayload = serializeLandCoOwners(farm.coOwners);
        const originalCoOwnerPayload = serializeLandCoOwners(normalizeLandCoOwners(originalFarm));
        const normalizeCoordinates = (coords: any[]) =>
          coords.map((coord) => Array.isArray(coord) ? [Number(coord[0]), Number(coord[1])] : [Number(coord?.lat), Number(coord?.lng)]);
        const hasFarmMediaChanges =
          changedImageFiles.length > 0 ||
          farm.video instanceof File ||
          farm.imagePreviews.some((preview, imageIndex) => {
            const originalUrl = Array.isArray(originalMedia.images) ? originalMedia.images[imageIndex] ?? '' : '';
            if (!preview && originalUrl) return true;
            if (!preview || String(preview).startsWith('blob:')) return false;
            return preview !== originalUrl;
          }) ||
          ((farm.videoPreview && !String(farm.videoPreview).startsWith('blob:') ? farm.videoPreview : '') !== (originalMedia.video ?? ''));
        const hasFarmDetailsChanges =
          farm.state !== (originalFarm.state ?? '') ||
          farm.district !== (originalFarm.district ?? '') ||
          farm.village !== (originalFarm.village ?? '') ||
          farm.cropType !== String(originalFarm.crop_type ?? '') ||
          farm.leaseStart !== String(originalFarm.lease_start_date ?? originalFarm.lease_start ?? currentAgreement?.agreement_start_date ?? currentAgreement?.agreementStart ?? '') ||
          farm.leaseEnd !== String(originalFarm.lease_end_date ?? originalFarm.lease_end ?? currentAgreement?.agreement_end_date ?? currentAgreement?.agreementEnd ?? '') ||
          Number(farm.leaseRate || 0) !== Number(originalFarm.lease_rate ?? originalFarm.lease_rent ?? currentAgreement?.lease_rate ?? currentAgreement?.lease_rent ?? currentAgreement?.leaseRent ?? 0) ||
          farm.lockInStart !== String(originalFarm.lock_in_start_date ?? originalFarm.lock_in_start ?? '') ||
          farm.lockInEnd !== String(originalFarm.lock_in_end_date ?? originalFarm.lock_in_end ?? '') ||
          Number(farm.totalArea || 0) !== Number(originalFarm.total_area ?? 0) ||
          JSON.stringify(coOwnerPayload) !== JSON.stringify(originalCoOwnerPayload) ||
          JSON.stringify(normalizeCoordinates(effectiveCoordinates as any[])) !== JSON.stringify(normalizeCoordinates(originalCoordinates));
        const hasFarmChanges = hasFarmDetailsChanges || hasFarmMediaChanges;

        if (!hasFarmChanges) continue;

        if (changedImageFiles.length > 0) {
          const uploadedImageUrls = await uploadFarmImages(changedImageFiles.map((item) => item.file));
          if (uploadedImageUrls.length !== changedImageFiles.length) {
            throw new Error('Farm image upload did not return all image URLs');
          }
          changedImageFiles.forEach((item, uploadIndex) => {
            finalImages[item.imageIndex] = uploadedImageUrls[uploadIndex];
          });
        }

        farm.imagePreviews.forEach((preview, imageIndex) => {
          if (farm.images[imageIndex]) return;
          if (preview && !String(preview).startsWith('blob:')) {
            finalImages[imageIndex] = preview;
          } else if (!preview) {
            finalImages[imageIndex] = '';
          }
        });

        const finalVideo = farm.video
          ? await uploadFarmVideo(farm.video)
          : farm.videoPreview && !String(farm.videoPreview).startsWith('blob:')
            ? farm.videoPreview
            : '';

        const farmPayload = {
          farm_id: farmId,
          farmer_id: farmerId,
          land_coordinates: effectiveCoordinates,
          total_area: farm.totalArea === '' ? 0 : Number(farm.totalArea),
          crop_type: farm.cropType,
          co_owner_details: coOwnerPayload,
          lease_start_date: farm.leaseStart || null,
          lease_end_date: farm.leaseEnd || null,
          lease_rate: farm.leaseRate === '' ? null : Number(farm.leaseRate),
          lock_in_start_date: farm.lockInStart || null,
          lock_in_end_date: farm.lockInEnd || null,
          land_media: {
            ...originalMedia,
            images: finalImages.filter((url) => typeof url === 'string' && url.length > 0),
            video: finalVideo,
          },
          harvest_log: originalFarm.harvest_log ?? {},
          payment_log: originalFarm.payment_log ?? {},
          state: farm.state,
          district: farm.district,
          village: farm.village,
        };

        await updateFarmDetails(farmPayload);
        updatedFarmPayloads.push({ index, payload: farmPayload });
        if (!farm.farmId) {
          setEditFarmerFarms((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, farmId } : item)));
        }
      }

      setFarmers((prev) =>
        prev.map((farmer) => {
          if (farmer.id !== farmerId) return farmer;

          const nextFarms = editFarmerFarms.map((farm, index) => {
            const originalFarm = Array.isArray(farmer.farms) ? farmer.farms[index] ?? {} : {};
            const updatedFarmPayload = updatedFarmPayloads.find((item) => item.index === index)?.payload;
            const effectiveCoordinates = farm.kmlCoordinates
              ? farm.kmlCoordinates.map((coord) => [coord.lat, coord.lng])
              : farm.landCoordinates;
            return {
              ...originalFarm,
              farm_id: updatedFarmPayload?.farm_id || farm.farmId || originalFarm.farm_id,
              farmer_id: updatedFarmPayload?.farmer_id || farmerId,
              village: updatedFarmPayload?.village ?? farm.village,
              district: updatedFarmPayload?.district ?? farm.district,
              state: updatedFarmPayload?.state ?? farm.state,
              crop_type: farm.cropType,
              co_owner_details: updatedFarmPayload?.co_owner_details ?? serializeLandCoOwners(farm.coOwners),
              lease_start_date: updatedFarmPayload?.lease_start_date ?? farm.leaseStart,
              lease_end_date: updatedFarmPayload?.lease_end_date ?? farm.leaseEnd,
              lease_rate: updatedFarmPayload?.lease_rate ?? (farm.leaseRate === '' ? null : Number(farm.leaseRate)),
              lock_in_start_date: updatedFarmPayload?.lock_in_start_date ?? farm.lockInStart,
              lock_in_end_date: updatedFarmPayload?.lock_in_end_date ?? farm.lockInEnd,
              total_area: updatedFarmPayload?.total_area ?? (farm.totalArea === '' ? '' : Number(farm.totalArea)),
              land_coordinates: updatedFarmPayload?.land_coordinates ?? effectiveCoordinates,
              land_media: updatedFarmPayload?.land_media ?? originalFarm.land_media ?? {},
              harvest_log: updatedFarmPayload?.harvest_log ?? originalFarm.harvest_log,
              payment_log: updatedFarmPayload?.payment_log ?? originalFarm.payment_log,
            };
          });
          const totalArea = nextFarms.reduce((sum, farm: any) => sum + Number(farm?.total_area ?? 0), 0);

          return {
            ...farmer,
            fullName,
            phoneNumber,
            alternatePhone: editFarmerForm.alternatePhone.trim() || null,
            farmerAddress: updatePayload.farmer_address,
            state: editFarmerForm.state,
            district: editFarmerForm.district,
            taluka: editFarmerForm.taluka.trim() || null,
            village: editFarmerForm.village,
            blockAssigned: editFarmerForm.blockAssigned.trim() || null,
            farmingOption: editFarmerForm.farmingOption,
            profileImageUrl: nextDocuments?.profile_photo?.url || editProfilePhotoPreview || farmer.profileImageUrl,
            kyc: updatePayload.kyc_data,
            agreements: updatePayload.agreement_data,
            documents: nextDocuments,
            bankDetails: updatePayload.bank_details,
            farms: nextFarms,
            landMapping: nextFarms.length > 0
              ? { totalArea, coordinates: nextFarms[0]?.land_coordinates || [] }
              : farmer.landMapping,
          };
        })
      );

      await refreshFarmerDetails(farmerId);
      toast({ title: 'Saved', description: 'Farmer details updated successfully.', variant: 'success' });
      closeEditModal();
    } catch (error) {
      console.error('Failed to update farmer details:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update farmer details.',
        variant: 'destructive',
      });
    } finally {
      setEditFarmerSaving(false);
    }
  };

  const IconPopup = ({
    title,
    description,
    icon,
    data,
  }: {
    title: string;
    description?: string;
    icon: React.ReactNode;
    data: unknown;
  }) => {
    // Normalize possible coordinate shapes to [[lat,lng], ...]
    const normalizedCoords: [number, number][] | null = (() => {
      if (!data) return null;
      // If data is an object with coordinates property
      const asAny = data as any;
      const coords = asAny?.coordinates ?? asAny?.landCoordinates ?? asAny;
      if (!coords) return null;
      if (!Array.isArray(coords) || coords.length === 0) return null;
      // If elements are objects with lat/lng
      if (typeof coords[0] === 'object' && coords[0] !== null && 'lat' in coords[0]) {
        return coords.map((c: any) => [Number(c.lat), Number(c.lng)]);
      }
      // If elements are arrays [lat,lng] or [lng,lat] heuristics
      if (Array.isArray(coords[0]) && coords[0].length >= 2) {
        // Assume [lat,lng] ordering used across app
        return coords.map((c: any) => [Number(c[0]), Number(c[1])]);
      }
      // If coords is a flat numeric array [lat, lng]
      if (typeof coords[0] === 'number' && coords.length >= 2) {
        return [[Number(coords[0]), Number(coords[1])]];
      }
      return null;
    })();

    // Fix default marker icon paths for Leaflet inside this component
    const DefaultIcon = L.icon({
      iconUrl: iconUrl as string,
      shadowUrl: iconShadow as string,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
    });
    // @ts-ignore
    L.Marker.prototype.options.icon = DefaultIcon;

    const asAny = data as any;
    const kyc = asAny?.kyc ?? null;
    const documents = asAny?.documents ?? null;

    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button className="h-9 w-9 hover:bg-gray-100 bg-transparent p-0 text-black">
            {icon}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>

          {normalizedCoords ? (
            <div className="h-72 w-full rounded-md overflow-hidden">
              <MapContainer
                center={[normalizedCoords[0][0], normalizedCoords[0][1]]}
                zoom={15}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={false}
              >
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
                />
                <Polygon positions={normalizedCoords as any} pathOptions={{ color: 'var(--land-boundary-color, #fde047)', fillColor: 'var(--land-boundary-fill, #fef9c3)', fillOpacity: 0.28, weight: 3 }} />
                <Marker position={[normalizedCoords[0][0], normalizedCoords[0][1]] as any}>
                  <Popup>Land mapping (first point)</Popup>
                </Marker>
              </MapContainer>
            </div>
          ) : (() => {
            // Agreements view: if caller passed { agreement, documents }
            const agreementObj = (asAny?.agreement !== undefined) ? asAny.agreement : null;
            const docs = (asAny?.documents !== undefined) ? asAny.documents : documents;

            if (agreementObj) {
              // Agreement may be object or array
              const first = Array.isArray(agreementObj) ? agreementObj[0] : agreementObj;
              const lease = first?.lease_rent ?? first?.leaseRent ?? null;
              const start = first?.agreement_start_date ?? first?.agreementStart ?? null;
              const end = first?.agreement_end_date ?? first?.agreementEnd ?? null;

              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                      <h3 className="text-sm font-medium">Agreement Details</h3>
                    </div>
                    {lease != null && (
                      <div className="text-sm font-medium text-muted-foreground">Lease: â‚¹{Number(lease).toLocaleString('en-IN')}</div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-xs text-muted-foreground">Agreement Start</div>
                    <div className="text-sm">{start ?? 'â€”'}</div>
                    <div className="text-xs text-muted-foreground">Agreement End</div>
                    <div className="text-sm">{end ?? 'â€”'}</div>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Agreement Document</div>
                    {docs && (docs.agreement?.url || docs.agreement_file?.url || docs?.agreement_url) ? (
                      <div className="flex items-center gap-2">
                        <a href={docs.agreement?.url || docs.agreement_file?.url || docs?.agreement_url} target="_blank" rel="noreferrer">
                          <Button className="h-8 px-3 text-sm border border-gray-300 bg-white hover:bg-gray-50">View Agreement</Button>
                        </a>
                        <Check className="w-4 h-4 text-green-600" />
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">No agreement document available</div>
                    )}
                  </div>
                </div>
              );
            }

            // Fallback to KYC/documents rendering if present
            if (kyc || documents) {
              return (
                <div className="space-y-4">
                  {/* KYC summary */}
                  {kyc && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-5 h-5 text-muted-foreground" />
                          <h3 className="text-sm font-medium">KYC Details</h3>
                        </div>
                        {documents && Object.keys(documents).length > 0 && (
                          <div className="flex items-center gap-2 text-sm text-green-600">
                            <Check className="w-4 h-4" />
                            <span>Verified with documents</span>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="text-xs text-muted-foreground">Aadhaar Number</div>
                        <div className="text-sm">{kyc.adhar_number ?? 'â€”'}</div>

                        <div className="text-xs text-muted-foreground">PAN Number</div>
                        <div className="text-sm">{kyc.pan_numnber ?? 'â€”'}</div>

                        <div className="text-xs text-muted-foreground">Account Number</div>
                        <div className="text-sm">{kyc.accound_number ?? 'â€”'}</div>

                        <div className="text-xs text-muted-foreground">IFSC</div>
                        <div className="text-sm">{kyc.IFSC_code ?? 'â€”'}</div>

                        <div className="text-xs text-muted-foreground">Address</div>
                        <div className="text-sm col-span-1">{kyc.permanent_address ?? 'â€”'}</div>
                      </div>
                    </div>
                  )}

                  {/* Documents list */}
                  {documents && Object.keys(documents).length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <FileText className="w-4 h-4" />
                        <span>Documents</span>
                      </div>
                      <div className="space-y-2">
                        {Object.entries(documents).map(([key, val]) => {
                          const valTyped = val as any;
                          return (
                          <div key={key} className="flex items-center justify-between gap-3 rounded-md border p-2">
                            <div className="flex items-center gap-3">
                              <div className="text-sm font-medium">{key.replace(/_/g, ' ')}</div>
                              <div className="text-xs text-muted-foreground">{(function(key){
                                if (!key) return '';
                                try{
                                  const k = String(key);
                                  if (k.length <= 3) return k.replace(/./g, '*');
                                  return k.slice(0,3) + '***********';
                                }catch{ return '' }
                              })(valTyped?.s3_key)}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              {valTyped?.url ? (
                                <a href={valTyped.url} target="_blank" rel="noreferrer">
                                  <Button className="h-8 px-3 text-sm border border-gray-300 bg-white hover:bg-gray-50">View</Button>
                                </a>
                              ) : (
                                <Button className="h-8 px-3 text-sm border border-gray-300 bg-gray-100" disabled>View</Button>
                              )}
                              {valTyped?.url && <Check className="w-4 h-4 text-green-600" />}
                            </div>
                          </div>
                        );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            return <div className="py-6 text-center text-sm text-muted-foreground">No data found</div>;
          })()
          }
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <>
    <div className="min-h-screen space-y-8 bg-[#fbfcfd] p-4 text-slate-900 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-emerald-700">Land Records</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Land Owner Directory</h1>
          <p className="mt-3 text-base font-medium text-slate-600">Manage and view all land owner records</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'No. of Land Owners', value: farmers.length.toLocaleString('en-IN'), icon: Users },
          {
            label: 'Total Land Area',
            value: `${totalArea.toLocaleString('en-IN', { maximumFractionDigits: 2 })} acres`,
            icon: Ruler,
          },
          {
            label: 'Average Lease Rate',
            value: averageLeaseRate == null
              ? 'N/A'
              : `₹${averageLeaseRate.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
            icon: IndianRupee,
          },
          { label: 'Average Lease Period', value: formatAveragePeriod(averageLeasePeriod), icon: CalendarDays },
          { label: 'Average Lock In Period', value: formatAveragePeriod(averageLockInPeriod), icon: Timer },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-500">{stat.label}</p>
                <p className="mt-3 break-words text-2xl font-bold text-slate-950">{stat.value}</p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0D3A35]/10 text-[#0D3A35] ring-2 ring-[#0D3A35]/10">
                <stat.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-md flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Search by ID, name, contact, or location..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-11 pr-4 text-sm font-semibold text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold shadow-sm transition sm:w-auto ${
              filtersOpen || activeFilterCount > 0
                ? 'border-[#0D3A35] bg-[#0D3A35] text-white hover:bg-[#092b27]'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Filter className="h-4 w-4" />
            Filter
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[10px] font-bold text-[#0D3A35]">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {filtersOpen && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_rgba(15,23,42,0.06)]">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <EditField label="Status">
                <Select value={statusFilter} onValueChange={(value: 'all' | 'active' | 'disputed') => setStatusFilter(value)}>
                  <SelectTrigger><span>{statusFilter === 'all' ? 'All statuses' : statusFilter === 'active' ? 'Active' : 'Disputed'}</span></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="disputed">Disputed</SelectItem>
                  </SelectContent>
                </Select>
              </EditField>
              <EditField label="State">
                <Select
                  value={stateFilter}
                  onValueChange={(value) => {
                    setStateFilter(value);
                    setDistrictFilter('all');
                  }}
                >
                  <SelectTrigger><span>{stateFilter === 'all' ? 'All states' : stateFilter}</span></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All states</SelectItem>
                    {filterStates.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}
                  </SelectContent>
                </Select>
              </EditField>
              <EditField label="District">
                <Select value={districtFilter} onValueChange={setDistrictFilter}>
                  <SelectTrigger><span>{districtFilter === 'all' ? 'All districts' : districtFilter}</span></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All districts</SelectItem>
                    {filterDistricts.map((district) => <SelectItem key={district} value={district}>{district}</SelectItem>)}
                  </SelectContent>
                </Select>
              </EditField>
              <EditField label="Land Availability">
                <Select value={landFilter} onValueChange={(value: 'all' | 'with-land' | 'without-land') => setLandFilter(value)}>
                  <SelectTrigger>
                    <span>{landFilter === 'all' ? 'All land owners' : landFilter === 'with-land' ? 'With land' : 'Without land'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All land owners</SelectItem>
                    <SelectItem value="with-land">With land</SelectItem>
                    <SelectItem value="without-land">Without land</SelectItem>
                  </SelectContent>
                </Select>
              </EditField>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <p className="text-xs font-semibold text-slate-500">
                Showing {filteredFarmers.length} of {farmers.length} land owners
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={clearFilters}
                disabled={activeFilterCount === 0}
                className="h-9 border-slate-200 text-xs font-bold text-slate-700"
              >
                Clear filters
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Farmers Card Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-[#0D3A35] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,360px),1fr))] items-stretch gap-6">
          {filteredFarmers.map((farmer) => (
            <Fragment key={farmer.id}>
              <article className={`group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_14px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_52px_rgba(15,23,42,0.10)] ${flagged[farmer.id] ? 'border-rose-200 ring-1 ring-rose-100' : 'border-slate-200/80'}`}>
                {/* Decorative arcs, matching Employee Directory cards */}
                <div className="pointer-events-none absolute right-0 top-16 h-24 w-48 opacity-40">
                  <div className="h-full w-full rounded-[100%] border-t border-emerald-100" />
                  <div className="-mt-20 ml-8 h-full w-full rounded-[100%] border-t border-emerald-100" />
                  <div className="-mt-20 ml-16 h-full w-full rounded-[100%] border-t border-emerald-100" />
                  <div className="-mt-20 ml-24 h-full w-full rounded-[100%] border-t border-emerald-100" />
                </div>

                {/* Profile */}
                <div className="relative flex min-h-[132px] items-center gap-4 border-b border-slate-100 px-5 py-5">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-emerald-50 shadow-sm ring-2 ring-slate-100">
                    <ProfileAvatar src={farmer.profileImageUrl} name={farmer.fullName} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-lg font-bold leading-snug text-slate-950">{farmer.fullName}</h3>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-600">
                      {farmer.farmingOption || 'Land Owner'}
                    </p>
                    <p className="mt-2 break-all text-xs font-bold tracking-wide text-emerald-700">
                      <span className="text-slate-400">Land Owner ID: </span>{farmer.id}
                    </p>
                  </div>
                </div>

                {/* Contact rows */}
                <div className="relative mx-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <table className="w-full table-fixed border-collapse text-left">
                    <tbody className="divide-y divide-slate-100">
                      {[
                        { label: 'Contact No.', value: farmer.phoneNumber || 'N/A' },
                        { label: 'Email', value: farmer.email || 'N/A' },
                        { label: 'Aadhaar Card No.', value: getKycValue(farmer, 'adhar_number') || 'N/A' },
                        { label: 'PAN No.', value: getKycValue(farmer, 'pan_numnber') || getKycValue(farmer, 'pan_number') || 'N/A' },
                        { label: 'Address', value: farmer.farmerAddress || [farmer.village, farmer.taluka, farmer.district, farmer.state].filter(Boolean).join(', ') || 'N/A' },
                      ].map(({ label, value }) => (
                        <tr key={label} className="align-top">
                          <th className="w-[38%] bg-slate-50/80 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            {label}
                          </th>
                          <td className="break-words px-3 py-2.5 text-xs font-bold leading-relaxed text-slate-700">
                            {value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Land summary */}
                <div className="relative mx-5 mt-4 grid grid-cols-2 gap-3">
                    <div className="flex min-w-0 items-center justify-center gap-3 rounded-xl border border-[#0D3A35]/15 bg-[#0D3A35]/[0.04] p-3 text-center">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0D3A35]/10">
                        <Ruler className="h-4 w-4 text-[#0D3A35]" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#0D3A35]/65">Acres</p>
                        {farmer.detailsLoaded ? (
                          <p className="mt-0.5 text-sm font-bold text-[#0D3A35]">
                            {(Number(farmer.landMapping?.totalArea ?? 0) || 0).toLocaleString('en-IN', {
                              maximumFractionDigits: 3,
                            })}
                          </p>
                        ) : (
                          <Loader2 className="mt-1 h-4 w-4 animate-spin text-[#0D3A35]/50" />
                        )}
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center justify-center gap-3 rounded-xl border border-[#0D3A35]/15 bg-[#0D3A35]/[0.04] p-3 text-center">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0D3A35]/10">
                        <Layers3 className="h-4 w-4 text-[#0D3A35]" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#0D3A35]/65">Land Parcels</p>
                        {farmer.detailsLoaded ? (
                          <p className="mt-0.5 text-sm font-bold text-[#0D3A35]">{getFarmCards(farmer).length}</p>
                        ) : (
                          <Loader2 className="mt-1 h-4 w-4 animate-spin text-[#0D3A35]/50" />
                        )}
                      </div>
                    </div>
                </div>

                {/* Card actions */}
                <div className="relative mt-auto border-t border-slate-100 px-5 py-5">
                  <button
                    type="button"
                    onClick={() => {
                      setProfilePopupTab('details');
                      setParcelPlotView({});
                      setViewProfileFarmerId(farmer.id);
                    }}
                    className="relative flex h-11 w-full items-center justify-center rounded-lg bg-[#0D3A35] px-10 text-sm font-bold text-white shadow-sm transition hover:bg-[#092b27]"
                  >
                    View Profile
                    <ArrowRight className="absolute right-4 h-4 w-4" />
                  </button>
                </div>
              </article>
            </Fragment>
          ))}
        </div>
      )}
    </div>

    {/* View Profile — mirrors the Employee Directory profile popup layout */}
    <Dialog
      open={!!viewProfileFarmerId}
      onOpenChange={(open) => {
        if (!open) {
          setViewProfileFarmerId(null);
          setProfilePopupTab('details');
          setParcelPlotView({});
          if (inlineProfileEditing) closeEditModal();
        }
      }}
    >
      <DialogContent className="h-[85vh] w-[calc(100vw-2rem)] max-w-6xl overflow-hidden rounded-3xl border-0 p-0">
        {viewProfileFarmer && (
          <div className="flex h-full min-h-0 flex-col sm:flex-row">
            {/* Sidebar */}
            <div className="w-full shrink-0 overflow-y-auto bg-[#0D3A35] px-6 pb-6 pt-5 text-white sm:w-72 sm:pt-8">
              <div
                className={`group relative mx-auto mt-6 h-28 w-28 overflow-hidden rounded-full bg-white/10 ring-4 ring-white/15 ${
                  inlineProfileEditing ? 'cursor-pointer' : ''
                }`}
                onClick={() => inlineProfileEditing && editProfilePhotoRef.current?.click()}
              >
                <ProfileAvatar
                  src={editProfilePhotoPreview ?? viewProfileFarmer.profileImageUrl}
                  name={viewProfileFarmer.fullName}
                  fallbackClassName="text-3xl font-semibold text-white"
                />
                {inlineProfileEditing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <Camera className="h-5 w-5 text-white" />
                  </div>
                )}
              </div>
              {inlineProfileEditing && (
                <input
                  ref={editProfilePhotoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setEditFarmerForm((previous) => ({ ...previous, profilePhoto: file }));
                    setEditProfilePhotoPreview(file ? URL.createObjectURL(file) : null);
                  }}
                />
              )}
              <h2 className="mt-4 text-center text-xl font-bold">{viewProfileFarmer.fullName}</h2>
              <p className="mt-1 break-all text-center text-xs font-bold tracking-wide text-white/55">
                {viewProfileFarmer.id}
              </p>
              <p className="mt-2 text-center text-sm font-semibold text-white/75">Land Owner</p>
              <span className={`mx-auto mt-4 block w-fit rounded-full px-5 py-1.5 text-xs font-bold text-white ring-1 ring-inset ${
                flagged[viewProfileFarmer.id]
                  ? 'bg-red-600 ring-red-400/60'
                  : 'bg-white/15 ring-white/10'
              }`}>
                {flagged[viewProfileFarmer.id] ? 'Disputed' : 'Active'}
              </span>

              <div className="mt-10 space-y-4 border-t border-white/10 pt-6 text-sm font-semibold">
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 shrink-0 text-white/60" />
                  <span className="truncate">{viewProfileFarmer.phoneNumber}</span>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 shrink-0 text-white/60" />
                  <span className="truncate">{[viewProfileFarmer.village, viewProfileFarmer.district].filter(Boolean).join(', ') || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Navigation className="h-4 w-4 shrink-0 text-white/60" />
                  <span className="truncate">{viewProfileFarmer.state || 'N/A'}</span>
                </div>
              </div>

              <div className="mt-6 space-y-4 border-t border-white/10 pt-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-white/50">Total Land</p>
                  <p className="mt-1 text-sm font-bold">
                    {Number(viewProfileFarmer.landMapping?.totalArea ?? 0) || 0} acres · {getFarmCards(viewProfileFarmer).length} parcels
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-white/50">Lease/Rate/Acre</p>
                  <p className="mt-1 text-sm font-bold">Rs. {getAmountInvested(viewProfileFarmer).toLocaleString('en-IN')}</p>
                </div>
              </div>

            </div>

            {/* Right panel */}
            <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto bg-white p-5 sm:p-8">
              <div className="mb-6 flex w-full items-end gap-8 overflow-x-auto border-b border-slate-200 pr-12">
                <button
                  type="button"
                  onClick={() => setProfilePopupTab('details')}
                  className={`shrink-0 border-b-2 px-0 pb-3 pt-1 text-sm font-bold transition ${
                    profilePopupTab === 'details'
                      ? 'border-[#0D3A35] text-slate-950'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Land Owner Details
                </button>
                <button
                  type="button"
                  onClick={() => setProfilePopupTab('documents')}
                  className={`shrink-0 border-b-2 px-0 pb-3 pt-1 text-sm font-bold transition ${
                    profilePopupTab === 'documents'
                      ? 'border-[#0D3A35] text-slate-950'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Documents
                </button>
                <button
                  type="button"
                  onClick={() => setProfilePopupTab('parcels')}
                  className={`shrink-0 border-b-2 px-0 pb-3 pt-1 text-sm font-bold transition ${
                    profilePopupTab === 'parcels'
                      ? 'border-[#0D3A35] text-slate-950'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Land Parcels
                </button>
                <div className="ml-auto flex shrink-0 items-center gap-2 pb-2">
                  {inlineProfileEditing ? (
                    <>
                      <Button
                        onClick={handleSaveEditFarmer}
                        disabled={editFarmerSaving}
                        className="h-9 w-9 rounded-full bg-[#0D3A35] p-0 text-white shadow-sm hover:bg-[#092b27]"
                        title="Save changes"
                        aria-label="Save changes"
                      >
                        {editFarmerSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </Button>
                      <Button
                        onClick={closeEditModal}
                        disabled={editFarmerSaving}
                        className="h-9 w-9 rounded-full border border-[#0D3A35]/20 bg-white p-0 text-[#0D3A35] shadow-sm hover:bg-emerald-50"
                        title="Cancel editing"
                        aria-label="Cancel editing"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        onClick={() => {
                          openEditModal(viewProfileFarmer, false);
                        }}
                        className="h-9 w-9 rounded-full bg-[#0D3A35] p-0 text-white shadow-sm hover:bg-[#092b27]"
                        title="Edit"
                        aria-label="Edit land owner"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => toast({ title: 'Delete', description: 'Delete action is not connected yet.', variant: 'default' })}
                        className="h-9 w-9 rounded-full border border-[#0D3A35]/20 bg-white p-0 text-[#0D3A35] shadow-sm hover:bg-emerald-50"
                        title="Delete"
                        aria-label="Delete land owner"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => toggleFlag(viewProfileFarmer.id)}
                        disabled={!!flagging[viewProfileFarmer.id] || !!flagged[viewProfileFarmer.id]}
                        className={`h-9 w-9 rounded-full border p-0 shadow-sm ${
                          flagged[viewProfileFarmer.id]
                            ? 'border-red-200 bg-red-50 text-red-600'
                            : 'border-[#0D3A35]/20 bg-white text-[#0D3A35] hover:bg-emerald-50'
                        }`}
                        title={flagged[viewProfileFarmer.id] ? 'Dispute flagged' : 'Flag dispute'}
                        aria-label={flagged[viewProfileFarmer.id] ? 'Dispute flagged' : 'Flag dispute'}
                      >
                        {flagging[viewProfileFarmer.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {profilePopupTab === 'details' && (
                <>
              {(() => {
                const categories = [
                  {
                    title: 'Owner Details',
                    Icon: UserRound,
                    items: [
                      { label: 'Full Name', value: viewProfileFarmer.fullName || 'N/A', Icon: UserRound, field: 'fullName' as const },
                      { label: 'Phone Number', value: viewProfileFarmer.phoneNumber || 'N/A', Icon: Phone, field: 'phoneNumber' as const },
                      { label: 'Alternate Phone', value: viewProfileFarmer.alternatePhone || 'N/A', Icon: Phone, field: 'alternatePhone' as const },
                      { label: 'Email', value: viewProfileFarmer.email || 'N/A', Icon: Mail },
                      { label: 'Aadhaar Number', value: getKycValue(viewProfileFarmer, 'adhar_number') || 'N/A', Icon: IdCard, field: 'aadhaarNumber' as const },
                      { label: 'PAN Number', value: getKycValue(viewProfileFarmer, 'pan_numnber') || getKycValue(viewProfileFarmer, 'pan_number') || 'N/A', Icon: FileBadge2, field: 'panNumber' as const },
                    ],
                  },
                  {
                    title: 'Address',
                    Icon: MapPin,
                    items: [
                      { label: 'Full Address', value: viewProfileFarmer.farmerAddress || 'N/A', Icon: Home },
                      { label: 'Village', value: viewProfileFarmer.village || 'N/A', Icon: MapPin, field: 'village' as const },
                      { label: 'Taluka', value: viewProfileFarmer.taluka || 'N/A', Icon: Navigation, field: 'taluka' as const },
                      { label: 'District', value: viewProfileFarmer.district || 'N/A', Icon: MapPin, field: 'district' as const },
                      { label: 'State', value: viewProfileFarmer.state || 'N/A', Icon: Navigation, field: 'state' as const },
                      { label: 'Cluster', value: viewProfileFarmer.clusterAssigned || 'N/A', Icon: Home },
                      { label: 'Zone', value: viewProfileFarmer.zoneAssigned || 'N/A', Icon: Navigation },
                      { label: 'Block', value: viewProfileFarmer.blockAssigned || 'N/A', Icon: Map, field: 'blockAssigned' as const },
                    ],
                  },
                ];

                return (
                  <div className="mt-5 grid grid-cols-1 gap-4">
                    {categories.map(({ title, Icon: CategoryIcon, items }) => (
                      <section key={title} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                            <CategoryIcon className="h-4 w-4 text-emerald-700" />
                          </div>
                          <h4 className="text-sm font-bold text-slate-900">{title}</h4>
                        </div>
                        <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
                          {items.map((item) => {
                            const { label, value, Icon } = item;
                            const field = 'field' in item ? item.field : undefined;
                            return (
                            <div key={label} className="flex min-w-0 gap-3">
                              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-slate-500">{label}</p>
                                {inlineProfileEditing && field ? (
                                  <Input
                                    value={String(editFarmerForm[field] ?? '')}
                                    onChange={(event) => setEditFarmerForm((previous) => ({
                                      ...previous,
                                      [field]: field === 'panNumber' ? event.target.value.toUpperCase() : event.target.value,
                                    }))}
                                    maxLength={field === 'aadhaarNumber' ? 12 : field === 'panNumber' ? 10 : undefined}
                                    className="mt-1 h-9 border-slate-200 bg-white text-sm font-semibold"
                                  />
                                ) : (
                                  <p className="mt-1 break-words text-sm font-bold text-slate-800">{value}</p>
                                )}
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                );
              })()}

              <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                    <Users className="h-4 w-4 text-emerald-700" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">Co-Owner Details</h4>
                </div>
                <div className="p-5">
                  {viewProfileFarmerCoOwners.loading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                    </div>
                  ) : viewProfileFarmerCoOwners.items.length === 0 ? (
                    <p className="text-sm text-slate-500">No co-owners recorded across this land owner's parcels.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      {viewProfileFarmerCoOwners.items.map((coOwner) => (
                        <div key={coOwner.co_owner_id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900">{coOwner.co_owner_name || 'Name not recorded'}</p>
                              <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Parcel: {coOwner.farmId}</p>
                            </div>
                            {Number.isFinite(coOwner.co_owner_share_percentage) && (
                              <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                                {coOwner.co_owner_share_percentage} ac
                              </span>
                            )}
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-xs">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Contact</p>
                              <p className="mt-0.5 font-bold text-slate-700">{coOwner.co_owner_contact || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Email</p>
                              <p className="mt-0.5 font-bold text-slate-700">{coOwner.co_owner_email || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Aadhaar Number</p>
                              <p className="mt-0.5 font-bold text-slate-700">{coOwner.co_owner_adhar_number || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">PAN Number</p>
                              <p className="mt-0.5 font-bold text-slate-700">{coOwner.co_owner_pan_number || 'N/A'}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Address</p>
                              <p className="mt-0.5 break-words font-bold text-slate-700">{coOwner.co_owner_address || 'N/A'}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {(() => {
                const bank = getBankDetails(viewProfileFarmer);
                const bankAccounts = getAllBankDetails(viewProfileFarmer);
                const backendBankCount = Array.isArray(viewProfileFarmer.bankDetails) ? viewProfileFarmer.bankDetails.length : 0;
                const localBankCount = localBankDetails[viewProfileFarmer.id]?.length ?? 0;
                const hasKycBank = [bank.bankName, bank.accountNumber, bank.ifsc].some((value) => value && value !== 'N/A');
                const linkedAccountCount = Math.max(backendBankCount + localBankCount, hasKycBank ? 1 : 0);
                const items = [
                  { label: 'Account Holder', value: bankAccounts[0]?.holderName || 'N/A', Icon: UserRound, field: 'bankHolderName' as const },
                  { label: 'Bank Name', value: bank.bankName || 'N/A', Icon: Landmark, field: 'bankName' as const },
                  { label: 'Account Number', value: bank.accountNumber || 'N/A', Icon: Banknote, field: 'bankAccountNumber' as const },
                  { label: 'IFSC Code', value: bank.ifsc || 'N/A', Icon: Landmark, field: 'bankIfsc' as const },
                  { label: 'Linked Accounts', value: String(linkedAccountCount), Icon: Banknote },
                ];

                return (
                  <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                          <Landmark className="h-4 w-4 text-emerald-700" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-900">Bank Details</h4>
                      </div>
                      {!inlineProfileEditing && (
                        <Button
                          type="button"
                          onClick={() => setBankAddModal({ open: true, farmerId: viewProfileFarmer.id })}
                          className="h-9 gap-1.5 rounded-lg bg-[#0D3A35] px-3 text-xs font-bold text-white hover:bg-[#092b27]"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Bank Account
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
                      {items.map((item) => {
                        const { label, value, Icon } = item;
                        const field = 'field' in item ? item.field : undefined;
                        return (
                        <div key={label} className="flex min-w-0 gap-3">
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-500">{label}</p>
                            {inlineProfileEditing && field ? (
                              <Input
                                value={String(editFarmerForm[field] ?? '')}
                                onChange={(event) => setEditFarmerForm((previous) => ({
                                  ...previous,
                                  [field]: field === 'bankIfsc' ? event.target.value.toUpperCase() : event.target.value,
                                }))}
                                className="mt-1 h-9 border-slate-200 bg-white text-sm font-semibold"
                              />
                            ) : (
                              <p className="mt-1 break-words text-sm font-bold text-slate-800">{value}</p>
                            )}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                    {!inlineProfileEditing && bankAccounts.length > 0 && (
                      <div className="border-t border-slate-100 bg-slate-50/40 p-5">
                        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Linked Bank Accounts</p>
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                          {bankAccounts.map((account, accountIndex) => (
                            <div key={`${account.accountNumber}-${accountIndex}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-slate-900">{account.bankName || 'Bank not recorded'}</p>
                                  <p className="mt-1 truncate text-xs font-semibold text-slate-500">{account.holderName || 'Holder not recorded'}</p>
                                </div>
                                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                                  {accountIndex === 0 ? 'Primary' : `Account ${accountIndex + 1}`}
                                </span>
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Account Number</p>
                                  <p className="mt-1 break-all text-xs font-bold text-slate-700">{account.accountNumber || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">IFSC Code</p>
                                  <p className="mt-1 break-all text-xs font-bold uppercase text-slate-700">{account.ifsc || 'N/A'}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {!inlineProfileEditing && viewProfileFarmerCoOwners.items.some((co) => co.co_owner_bank_details) && (
                      <div className="border-t border-slate-100 bg-slate-50/40 p-5">
                        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Co-owner Bank Accounts</p>
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                          {viewProfileFarmerCoOwners.items
                            .filter((co) => co.co_owner_bank_details)
                            .map((co) => (
                              <div key={co.co_owner_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-900">{co.co_owner_bank_details?.bank_name || 'Bank not recorded'}</p>
                                    <p className="mt-1 truncate text-xs font-semibold text-slate-500">{co.co_owner_bank_details?.holder_name || 'Holder not recorded'}</p>
                                  </div>
                                  <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">
                                    Co-owner: {co.co_owner_name || 'Unnamed'}
                                  </span>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Account Number</p>
                                    <p className="mt-1 break-all text-xs font-bold text-slate-700">{co.co_owner_bank_details?.account_number || 'N/A'}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">IFSC Code</p>
                                    <p className="mt-1 break-all text-xs font-bold uppercase text-slate-700">{co.co_owner_bank_details?.ifsc_code || 'N/A'}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </section>
                );
              })()}

                </>
              )}

              {profilePopupTab === 'documents' && (
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                      <FileText className="h-4 w-4 text-emerald-700" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-900">Documents</h4>
                  </div>
                  {inlineProfileEditing ? (
                    <div className="grid grid-cols-1 gap-3 p-5 lg:grid-cols-2">
                      {([
                        { key: 'aadhaarCardFile', title: 'Aadhaar Card', Icon: IdCard, docKey: 'adhar_card' },
                        { key: 'panCardFile', title: 'PAN Card', Icon: FileBadge2, docKey: 'pand_card' },
                        { key: 'kisanBookFile', title: 'Kisan Book', Icon: BookOpen, docKey: 'kisan_book' },
                        { key: 'b1RecordFile', title: 'B1 Record', Icon: FileBadge2, docKey: 'B1_record' },
                        { key: 'agreementFile', title: 'Agreement', Icon: FileText, docKey: 'agreement' },
                        { key: 'passbookFile', title: 'Passbook', Icon: Landmark, docKey: 'bank_passbook' },
                      ] as const).map(({ key, title, Icon, docKey }) => (
                        <EditDocumentUploadCard
                          key={key}
                          title={title}
                          icon={Icon}
                          existingUrl={getDocumentUrl(viewProfileFarmer, docKey)}
                          file={editFarmerForm[key]}
                          accept={key === 'agreementFile' ? 'application/pdf' : 'application/pdf,image/*'}
                          onFileChange={(file) => setEditFarmerForm((previous) => ({ ...previous, [key]: file }))}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
                      <ProfileDocumentCard title="Aadhaar Card" url={getDocumentUrl(viewProfileFarmer, 'adhar_card')} Icon={IdCard} />
                      <ProfileDocumentCard title="PAN Card" url={getDocumentUrl(viewProfileFarmer, 'pand_card')} Icon={FileBadge2} />
                      <ProfileDocumentCard title="Kisan Book" url={getDocumentUrl(viewProfileFarmer, 'kisan_book')} Icon={BookOpen} />
                      <ProfileDocumentCard title="B1 Record" url={getDocumentUrl(viewProfileFarmer, 'B1_record')} Icon={FileBadge2} />
                      <ProfileDocumentCard title="Agreement" url={getDocumentUrl(viewProfileFarmer, 'agreement')} Icon={FileText} />
                      <ProfileDocumentCard title="Passbook" url={getDocumentUrl(viewProfileFarmer, 'bank_passbook')} Icon={Landmark} />
                    </div>
                  )}
                </section>
              )}

              {profilePopupTab === 'parcels' && (
                <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Land Parcels</h3>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">
                    {getFarmCards(viewProfileFarmer).length} parcel{getFarmCards(viewProfileFarmer).length === 1 ? '' : 's'} linked to {viewProfileFarmer.fullName}
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => openNewLandPopup(viewProfileFarmer.id)}
                  disabled={inlineProfileEditing}
                  className="h-10 gap-2 rounded-lg bg-[#0D3A35] px-4 text-sm font-bold text-white shadow-sm hover:bg-[#092b27]"
                >
                  <Plus className="h-4 w-4" />
                  Add Land
                </Button>
              </div>
              {farmerLandLoading && (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-4 border-[#0D3A35] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <div className={`grid grid-cols-1 gap-5 ${farmerLandLoading ? 'hidden' : ''}`}>
                {getFarmCards(viewProfileFarmer).map((farm, farmIndex) => {
                  const rawFarm = Array.isArray(viewProfileFarmer.farms) ? viewProfileFarmer.farms[farmIndex] : null;
                  const editableFarm = editFarmerFarms[farmIndex];
                  const updateEditableFarm = (patch: Partial<(typeof editFarmerFarms)[number]>) => {
                    setEditFarmerFarms((previous) => previous.map((item, index) => (
                      index === farmIndex ? { ...item, ...patch } : item
                    )));
                  };
                  const plots = Array.isArray(rawFarm?.plots) ? rawFarm.plots : [];
                  const images = Array.isArray(rawFarm?.land_media?.images) ? rawFarm.land_media.images : [];
                  const fallbackImage = farm.mediaUrl && farm.mediaUrl !== '/placeholder.svg' ? farm.mediaUrl : '';
                  const parcelImages = images.length > 0 ? images : (fallbackImage ? [fallbackImage] : []);
                  const videoUrl = rawFarm?.land_media?.video || '';
                  const parcelId = rawFarm?.farm_id ?? rawFarm?.id ?? farm.id;
                  const coOwnerState = parcelCoOwners[String(parcelId)];
                  const landCoOwners = coOwnerState?.items ?? [];
                  const landCoOwnersLoading = coOwnerState?.loading ?? true;
                  // A parcel itself carries no crop type — its plots do, and different plots can
                  // grow different crops. Show every distinct plot crop, e.g. "Paddy + Rahar".
                  const plotCropTypes = Array.from(new Set(
                    plots
                      .map((plot: any) => String(plot?.crop_type ?? '').trim())
                      .filter(Boolean)
                      .map((value: string) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase())
                  ));
                  const cropLabel = plotCropTypes.length > 0
                    ? plotCropTypes.join(' + ')
                    : (cropOptions.find((option) => option.value === farm.cropType)?.label || farm.cropType || 'Not assigned');
                  const farmCoords: [number, number][] = (Array.isArray(farm.landMapping?.coordinates) ? farm.landMapping.coordinates : [])
                    .map((coordinate: any) => {
                      if (Array.isArray(coordinate) && coordinate.length >= 2) {
                        return [Number(coordinate[0]), Number(coordinate[1])] as [number, number];
                      }
                      return [Number(coordinate?.lat), Number(coordinate?.lng)] as [number, number];
                    })
                    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
                  const hasBoundary = farmCoords.length >= 3;
                  const plotBoundaries = plots
                    .map((plot: any, plotIndex: number) => {
                      const coordinates: [number, number][] = (Array.isArray(plot?.plot_coordinates)
                        ? plot.plot_coordinates
                        : Array.isArray(plot?.coordinates)
                          ? plot.coordinates
                          : [])
                        .map((coordinate: any) => {
                          if (Array.isArray(coordinate) && coordinate.length >= 2) {
                            return [Number(coordinate[0]), Number(coordinate[1])] as [number, number];
                          }
                          return [Number(coordinate?.lat), Number(coordinate?.lng)] as [number, number];
                        })
                        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

                      return {
                        id: String(plot?.plot_id ?? plot?.id ?? `${farm.id}-plot-${plotIndex + 1}`),
                        label: (() => {
                          const value = String(plot?.plot_number ?? plot?.plot_no ?? plot?.plot_name ?? plotIndex + 1);
                          return value.toLowerCase().startsWith('plot') ? value : `Plot ${value}`;
                        })(),
                        area: (() => {
                          const value = Number(plot?.plot_area ?? plot?.area);
                          return Number.isFinite(value) ? `${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ac` : 'Area N/A';
                        })(),
                        crop: (() => {
                          const value = String(plot?.crop_type ?? rawFarm?.crop_type ?? farm.cropType ?? '').trim();
                          return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : 'Unspecified';
                        })(),
                        coordinates,
                        color: (() => {
                          const cropKey = String(plot?.crop_type ?? rawFarm?.crop_type ?? farm.cropType ?? '').trim().toLowerCase() || 'unspecified';
                          return CEO_CULTIVATION_CROP_COLORS[cropKey]
                            ?? CEO_CULTIVATION_FALLBACK_COLORS[plotIndex % CEO_CULTIVATION_FALLBACK_COLORS.length];
                        })(),
                      };
                    })
                    .filter((plot) => plot.coordinates.length >= 3);
                  const showPlots = parcelPlotView[farm.id] === true;
                  const plotDetailRows = plots
                    .map((plot: any, plotIndex: number) => {
                      const numberValue = String(plot?.plot_number ?? plot?.plot_no ?? plot?.plot_name ?? plotIndex + 1);
                      const plotNumber = numberValue.toLowerCase().startsWith('plot') ? numberValue : `Plot ${numberValue}`;
                      const areaValue = Number(plot?.plot_area ?? plot?.area);
                      const cropValue = String(plot?.crop_type ?? rawFarm?.crop_type ?? farm.cropType ?? '').trim();
                      return {
                        id: String(plot?.plot_id ?? plot?.id ?? `${farm.id}-plot-row-${plotIndex + 1}`),
                        number: plotNumber,
                        area: Number.isFinite(areaValue) ? `${areaValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ac` : 'N/A',
                        crop: cropValue ? cropValue.charAt(0).toUpperCase() + cropValue.slice(1).toLowerCase() : 'Unspecified',
                      };
                    })
                    .sort((first, second) =>
                      first.number.localeCompare(second.number, undefined, { numeric: true, sensitivity: 'base' })
                    );
                  const additionalMappings = Array.isArray(rawFarm?.additional_mappings)
                    ? rawFarm.additional_mappings
                    : Array.isArray(rawFarm?.land_data?.additional_mappings)
                      ? rawFarm.land_data.additional_mappings
                      : [];
                  const borewellMappings = additionalMappings.filter((mapping: any) =>
                    String(mapping?.mapping_type ?? mapping?.mapping_name ?? '').toLowerCase().includes('bore')
                  );
                  const electricityMappings = additionalMappings.filter((mapping: any) =>
                    String(mapping?.mapping_type ?? mapping?.mapping_name ?? '').toLowerCase().includes('electric')
                  );
                  const rawBorewellSource =
                    rawFarm?.borewells ??
                    rawFarm?.borewell_details ??
                    rawFarm?.bore_well_details ??
                    rawFarm?.borewell ??
                    [];
                  const electricitySource =
                    rawFarm?.electricity_connection_details ??
                    rawFarm?.electricity_connection ??
                    rawFarm?.electricity_details ??
                    rawFarm?.electricity ??
                    {};
                  const formatOtherDetail = (value: unknown) => {
                    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
                    if (value == null || String(value).trim() === '') return 'N/A';
                    return String(value);
                  };
                  const declaredBorewellCount = Number(
                    rawFarm?.borewell_count ??
                    (!Array.isArray(rawBorewellSource) ? rawBorewellSource?.count : 0)
                  );
                  const borewellEntries: any[] = Array.isArray(rawBorewellSource) && rawBorewellSource.length > 0
                    ? rawBorewellSource
                    : borewellMappings.length > 0
                      ? borewellMappings.map((mapping: any) => ({ ...mapping, ...(mapping?.details ?? {}) }))
                      : rawBorewellSource && typeof rawBorewellSource === 'object' && Object.keys(rawBorewellSource).length > 0
                        ? [rawBorewellSource]
                        : Number.isFinite(declaredBorewellCount) && declaredBorewellCount > 0
                          ? Array.from({ length: declaredBorewellCount }, () => ({}))
                          : rawFarm?.has_borewell
                            ? [{}]
                            : [];
                  const borewellDetailGroups = borewellEntries.map((borewell: any, borewellIndex: number) => ({
                    id: String(borewell?.borewell_id ?? borewell?.id ?? `${farm.id}-borewell-${borewellIndex + 1}`),
                    title: String(borewell?.borewell_name ?? borewell?.name ?? `Borewell ${borewellIndex + 1}`),
                    items: [
                      {
                        label: 'Borewell No.',
                        value: formatOtherDetail(
                          borewell?.borewell_number ??
                          borewell?.borewell_no ??
                          borewell?.number ??
                          borewellIndex + 1
                        ),
                      },
                      {
                        label: 'Status',
                        value: formatOtherDetail(borewell?.status ?? borewell?.available ?? rawFarm?.has_borewell),
                      },
                      {
                        label: 'Depth',
                        value: formatOtherDetail(
                          borewell?.depth ??
                          borewell?.depth_ft ??
                          (borewellEntries.length === 1 ? rawFarm?.borewell_depth : null)
                        ),
                      },
                      {
                        label: 'Water Status',
                        value: formatOtherDetail(
                          borewell?.water_status ??
                          borewell?.water_availability ??
                          (borewellEntries.length === 1 ? rawFarm?.water_availability : null)
                        ),
                      },
                      {
                        label: 'Type',
                        value: formatOtherDetail(borewell?.borewell_type ?? borewell?.type),
                      },
                      {
                        label: 'Pump Capacity',
                        value: formatOtherDetail(
                          borewell?.pump_capacity ??
                          borewell?.pump_hp ??
                          borewell?.motor_capacity
                        ),
                      },
                    ],
                  }));
                  const electricityDetails = [
                    {
                      label: 'Connection',
                      value: formatOtherDetail(
                        rawFarm?.has_electricity ??
                        electricitySource?.available ??
                        electricitySource?.connection_status ??
                        electricitySource?.status ??
                        (electricityMappings.length > 0 ? true : null)
                      ),
                    },
                    {
                      label: 'Consumer No.',
                      value: formatOtherDetail(
                        electricitySource?.consumer_number ??
                        electricitySource?.consumer_no ??
                        rawFarm?.electricity_consumer_number
                      ),
                    },
                    {
                      label: 'Meter No.',
                      value: formatOtherDetail(
                        electricitySource?.meter_number ??
                        electricitySource?.meter_no ??
                        rawFarm?.electricity_meter_number
                      ),
                    },
                    {
                      label: 'Connected Load',
                      value: formatOtherDetail(
                        electricitySource?.connected_load ??
                        electricitySource?.load ??
                        rawFarm?.electricity_load
                      ),
                    },
                  ];
                  const leaseRateNumber = Number(farm.leaseRate);
                  const leaseRateDisplay = farm.leaseRate == null || farm.leaseRate === ''
                    ? 'N/A'
                    : Number.isFinite(leaseRateNumber)
                      ? `Rs. ${leaseRateNumber.toLocaleString('en-IN')}`
                      : String(farm.leaseRate);
                  const nowMs = Date.now();
                  const leaseStartMs = farm.leaseStart ? new Date(farm.leaseStart).getTime() : NaN;
                  const leaseEndMs = farm.leaseEnd ? new Date(farm.leaseEnd).getTime() : NaN;
                  const hasLeaseRange = Number.isFinite(leaseStartMs) && Number.isFinite(leaseEndMs) && leaseEndMs > leaseStartMs;
                  const leaseRemainingPct = hasLeaseRange
                    ? Math.max(0, Math.min(100, ((leaseEndMs - nowMs) / (leaseEndMs - leaseStartMs)) * 100))
                    : 0;
                  const leaseStatus = !hasLeaseRange
                    ? 'Not available'
                    : nowMs < leaseStartMs
                      ? 'Upcoming'
                      : nowMs > leaseEndMs
                        ? 'Expired'
                        : 'Active';

                  return (
                    <article key={farm.id} className="grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:grid-cols-[minmax(280px,42%)_1fr]">
                      <div className="relative h-56 border-b border-slate-200 bg-slate-50 md:h-full md:min-h-[480px] md:border-b-0 md:border-r">
                        {hasBoundary ? (
                          <MapContainer
                            center={farmCoords[0]}
                            zoom={15}
                            style={{ height: '100%', width: '100%' }}
                            scrollWheelZoom={true}
                            dragging={true}
                            doubleClickZoom={true}
                            touchZoom={true}
                            zoomControl={true}
                            attributionControl={false}
                          >
                            <TileLayer
                              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                              attribution="Tiles &copy; Esri"
                            />
                            <FlyToBounds coords={farmCoords.map(([lat, lng]) => ({ lat, lng }))} />
                            <AutoResizeMap />
                            <Polygon
                              positions={farmCoords}
                              pathOptions={{ color: 'var(--land-boundary-color, #fde047)', fillColor: 'var(--land-boundary-fill, #fef9c3)', weight: 3, fillOpacity: 0.28 }}
                            />
                            {showPlots && plotBoundaries.map((plot) => (
                              <Polygon
                                key={plot.id}
                                positions={plot.coordinates}
                                pathOptions={{
                                  color: plot.color,
                                  fillColor: plot.color,
                                  weight: 2.5,
                                  fillOpacity: 0.55,
                                }}
                              >
                                <Tooltip permanent direction="center" opacity={1} className="plot-label-tooltip">
                                  <div className="text-center leading-tight">
                                    <div className="text-[11px] font-bold text-slate-900">{plot.label}</div>
                                    <div className="mt-0.5 text-[10px] font-semibold text-slate-600">{plot.area}</div>
                                  </div>
                                </Tooltip>
                              </Polygon>
                            ))}
                          </MapContainer>
                        ) : (
                          <div className="flex h-full items-center justify-center gap-2 text-xs font-semibold text-slate-400">
                            <Map className="h-5 w-5" />
                            Boundary mapping unavailable
                          </div>
                        )}
                        {hasBoundary && plotBoundaries.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setParcelPlotView((previous) => ({
                              ...previous,
                              [farm.id]: !previous[farm.id],
                            }))}
                            className="absolute bottom-3 left-3 z-[500] flex items-center gap-1.5 rounded-md bg-white/95 px-2.5 py-1.5 text-[10px] font-bold text-slate-700 shadow-sm transition hover:bg-white"
                            title={`${showPlots ? 'Hide' : 'Show'} plot boundaries`}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Change View · Plots {showPlots ? 'On' : 'Off'}
                          </button>
                        )}
                      </div>

                      <div className="min-w-0">
                      {inlineProfileEditing && editableFarm && (
                        <div className="border-b border-slate-200 bg-slate-50/70 p-4">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <EditField label="Village">
                              <Input
                                value={editableFarm.village}
                                onChange={(event) => updateEditableFarm({ village: event.target.value })}
                                placeholder="Village"
                              />
                            </EditField>
                            <EditField label="District">
                              <Input
                                value={editableFarm.district}
                                onChange={(event) => updateEditableFarm({ district: event.target.value })}
                                placeholder="District"
                              />
                            </EditField>
                            <EditField label="State">
                              <Input
                                value={editableFarm.state}
                                onChange={(event) => updateEditableFarm({ state: event.target.value })}
                                placeholder="State"
                              />
                            </EditField>
                            <EditField label="Total Area" hint="Acres">
                              <Input
                                type="number"
                                step="0.01"
                                value={editableFarm.totalArea}
                                onChange={(event) => updateEditableFarm({ totalArea: event.target.value })}
                                placeholder="Total area"
                              />
                            </EditField>
                            <EditField label="Lease Start">
                              <Input
                                type="date"
                                value={editFarmerForm.agreementStartDate}
                                onChange={(event) => setEditFarmerForm((previous) => ({ ...previous, agreementStartDate: event.target.value }))}
                              />
                            </EditField>
                            <EditField label="Lease End">
                              <Input
                                type="date"
                                value={editFarmerForm.agreementEndDate}
                                onChange={(event) => setEditFarmerForm((previous) => ({ ...previous, agreementEndDate: event.target.value }))}
                              />
                            </EditField>
                          </div>
                          <div className="mt-3">
                            <EditField label="Lease Rate" hint="Per acre">
                              <Input
                                type="number"
                                value={editFarmerForm.leaseRent}
                                onChange={(event) => setEditFarmerForm((previous) => ({ ...previous, leaseRent: event.target.value }))}
                                placeholder="Lease rate"
                              />
                            </EditField>
                          </div>
                          <div className="mt-4">
                            <p className="mb-2 text-xs font-bold text-slate-600">Land Media</p>
                            <div className="grid grid-cols-3 gap-2">
                              {[0, 1, 2].map((imageIndex) => (
                                <div key={`${farm.id}-edit-media-${imageIndex}`}>
                                  <label className="block h-20 cursor-pointer overflow-hidden rounded-lg border-2 border-dashed border-slate-200 bg-white transition hover:border-[#0D3A35]/40">
                                    {editableFarm.imagePreviews[imageIndex] ? (
                                      <img
                                        src={editableFarm.imagePreviews[imageIndex] as string}
                                        alt={`Land image ${imageIndex + 1}`}
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <span className="flex h-full items-center justify-center">
                                        <ImageIcon className="h-5 w-5 text-slate-300" />
                                      </span>
                                    )}
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(event) => {
                                        const file = event.target.files?.[0] ?? null;
                                        const images = [...editableFarm.images];
                                        const imagePreviews = [...editableFarm.imagePreviews];
                                        images[imageIndex] = file;
                                        imagePreviews[imageIndex] = file
                                          ? URL.createObjectURL(file)
                                          : imagePreviews[imageIndex];
                                        updateEditableFarm({ images, imagePreviews });
                                      }}
                                    />
                                  </label>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Parcel {farmIndex + 1}</p>
                          <h4 className="mt-1 truncate text-sm font-bold text-slate-950">{String(parcelId)}</h4>
                          <div className="mt-2 flex items-start gap-2 text-xs font-semibold text-slate-600">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="line-clamp-2">{farm.location || 'N/A'}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {!inlineProfileEditing && (
                            <Button
                              type="button"
                              onClick={() => openLandEditModal(viewProfileFarmer, farmIndex)}
                              className="h-9 gap-1.5 rounded-lg border border-[#0D3A35]/20 bg-white px-3 text-xs font-bold text-[#0D3A35] shadow-sm hover:bg-emerald-50"
                              title={`Edit parcel ${farmIndex + 1}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit Land
                            </Button>
                          )}
                          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-right ring-1 ring-inset ring-emerald-100">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Total Area</p>
                            <p className="mt-0.5 text-sm font-bold text-emerald-900">
                              {Number(farm.acres || 0).toLocaleString('en-IN')} acres
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-px border-y border-slate-100 bg-slate-100">
                        {(() => {
                          const bzc = parcelBlockZoneCluster[String(parcelId)];
                          return [
                            { label: 'Cluster', value: bzc?.cluster_name || farm.cluster || 'N/A', loading: bzc?.loading ?? true },
                            { label: 'Zone', value: bzc?.zone_name || farm.zone || 'N/A', loading: bzc?.loading ?? true },
                            { label: 'Block', value: bzc?.block_name || farm.block || 'N/A', loading: bzc?.loading ?? true },
                            { label: 'Crop', value: cropLabel, loading: false },
                            { label: 'Plots', value: String(plots.length), loading: false },
                            { label: 'Lease Rate', value: leaseRateDisplay, loading: false },
                          ];
                        })().map((item) => (
                          <div key={item.label} className="min-w-0 bg-white px-3 py-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.label}</p>
                            {item.loading ? (
                              <Loader2 className="mt-1 h-3.5 w-3.5 animate-spin text-slate-300" />
                            ) : (
                              <p className="mt-0.5 truncate text-xs font-bold text-slate-700">{item.value}</p>
                            )}
                          </div>
                        ))}
                      </div>

                      <section className="border-b border-slate-100 bg-white px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold text-slate-700">Land Co-owners</p>
                            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                              {landCoOwnersLoading
                                ? 'Loading co-owners…'
                                : landCoOwners.length > 0
                                  ? `${landCoOwners.length} co-owner${landCoOwners.length === 1 ? '' : 's'} linked to this parcel`
                                  : 'No co-owners linked to this parcel'}
                            </p>
                          </div>
                          {!inlineProfileEditing && (
                            <Button
                              type="button"
                              onClick={() => openAddCoOwnerModal(String(parcelId), Number(farm.acres) || 0)}
                              className="h-8 gap-1.5 rounded-lg border border-[#0D3A35]/20 bg-white px-3 text-[11px] font-bold text-[#0D3A35] shadow-sm hover:bg-emerald-50"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Add Co-owner
                            </Button>
                          )}
                        </div>
                        {landCoOwnersLoading ? (
                          <div className="mt-3 flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                          </div>
                        ) : landCoOwners.length > 0 && (
                          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {landCoOwners.map((coOwner) => (
                              <div key={coOwner.co_owner_id} className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-bold text-slate-800">{coOwner.co_owner_name || 'Name not recorded'}</p>
                                    <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">
                                      {coOwner.co_owner_contact || 'Contact not recorded'}
                                    </p>
                                  </div>
                                  {Number.isFinite(coOwner.co_owner_share_percentage) && (
                                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                      {coOwner.co_owner_share_percentage} ac
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>

                      <section className="border-b border-slate-100 bg-white px-4 py-3">
                        <p className="text-xs font-bold text-slate-700">Land Distribution</p>
                        {landCoOwnersLoading ? (
                          <div className="mt-3 flex items-center justify-center py-2">
                            <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                          </div>
                        ) : (() => {
                          const totalAcres = Number(farm.acres) || 0;
                          const coOwnerSegments = landCoOwners.map((coOwner, coOwnerIndex) => ({
                            label: coOwner.co_owner_name || `Co-owner ${coOwnerIndex + 1}`,
                            acres: Number(coOwner.co_owner_share_percentage) || 0,
                            color: LAND_DISTRIBUTION_CO_OWNER_COLORS[coOwnerIndex % LAND_DISTRIBUTION_CO_OWNER_COLORS.length],
                          }));
                          const coOwnerAcresSum = coOwnerSegments.reduce((sum, seg) => sum + seg.acres, 0);
                          const ownerAcres = Math.max(totalAcres - coOwnerAcresSum, 0);
                          const segments = [
                            { label: 'Owner', acres: ownerAcres, color: LAND_DISTRIBUTION_OWNER_COLOR },
                            ...coOwnerSegments,
                          ].filter((segment) => segment.acres > 0);

                          if (totalAcres <= 0 || segments.length === 0) {
                            return <p className="mt-2 text-[11px] italic text-slate-400">No distribution data available for this parcel.</p>;
                          }

                          return (
                            <>
                              <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                                {segments.map((segment) => (
                                  <div
                                    key={segment.label}
                                    style={{ width: `${Math.min((segment.acres / totalAcres) * 100, 100)}%`, backgroundColor: segment.color }}
                                    title={`${segment.label}: ${segment.acres.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ac`}
                                  />
                                ))}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                                {segments.map((segment) => (
                                  <div key={segment.label} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
                                    {segment.label}: {segment.acres.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ac ({((segment.acres / totalAcres) * 100).toFixed(1)}%)
                                  </div>
                                ))}
                              </div>
                            </>
                          );
                        })()}
                      </section>

                      <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold text-slate-700">Lease Agreement</p>
                            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                              {formatLandDate(farm.leaseStart)} to {formatLandDate(farm.leaseEnd)}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800 ring-1 ring-inset ring-emerald-100">
                              {leaseStatus}
                            </span>
                            <p className="mt-1.5 text-[10px] font-bold text-slate-500">
                              {hasLeaseRange ? `${Math.round(leaseRemainingPct)}% remaining` : 'Lease dates unavailable'}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-[#0D3A35] transition-all duration-500"
                            style={{ width: `${leaseRemainingPct}%` }}
                          />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Lock-in Period</p>
                            <p className="mt-1 text-xs font-bold text-slate-700">
                              {farm.lockInStart && farm.lockInEnd
                                ? `${formatLandDate(farm.lockInStart)} to ${formatLandDate(farm.lockInEnd)}`
                                : 'Not configured'}
                            </p>
                          </div>
                          <Timer className="h-4 w-4 shrink-0 text-emerald-700" />
                        </div>
                      </div>

                      <div className="p-4">
                        <div>
                          <h5 className="text-sm font-bold text-slate-900">Land Media</h5>
                          <p className="mt-0.5 text-xs font-medium text-slate-500">
                            {parcelImages.length} image{parcelImages.length === 1 ? '' : 's'}{videoUrl ? ' · 1 video' : ''}
                          </p>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {[0, 1, 2].map((imageIndex) => (
                            <div key={`${farm.id}-media-${imageIndex}`} className="relative h-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                              {parcelImages[imageIndex] ? (
                                <>
                                  <img
                                    src={parcelImages[imageIndex]}
                                    alt={`Parcel ${farmIndex + 1} land image ${imageIndex + 1}`}
                                    className="h-full w-full object-cover transition duration-300 hover:scale-105"
                                  />
                                  {imageIndex === 2 && parcelImages.length > 3 && (
                                    <span className="absolute inset-0 flex items-center justify-center bg-slate-950/55 text-xs font-bold text-white">
                                      +{parcelImages.length - 3}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <div className="flex h-full flex-col items-center justify-center gap-1 text-[10px] font-semibold text-slate-400">
                                  <ImageIcon className="h-4 w-4" />
                                  Image {imageIndex + 1}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        {videoUrl && (
                          <div className="mt-2 h-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
                            <video src={videoUrl} className="h-full w-full object-cover" controls muted />
                          </div>
                        )}
                      </div>
                      </div>

                      <div className="border-t border-slate-100 md:col-span-2">
                        <button
                          type="button"
                          onClick={() => setParcelPlotDetailsOpen((previous) => ({
                            ...previous,
                            [farm.id]: !previous[farm.id],
                          }))}
                          className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition hover:bg-slate-50"
                          aria-expanded={!!parcelPlotDetailsOpen[farm.id]}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-700">Other Details</span>
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              {plotDetailRows.length} plot{plotDetailRows.length === 1 ? '' : 's'}
                            </span>
                          </div>
                          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${
                            parcelPlotDetailsOpen[farm.id] ? 'rotate-180' : ''
                          }`} />
                        </button>

                        {parcelPlotDetailsOpen[farm.id] && (
                          <div className="grid border-t border-slate-100 lg:grid-cols-2">
                            <section className="min-w-0 border-b border-slate-100 lg:border-b-0 lg:border-r">
                              <div className="flex items-center gap-2 bg-slate-50/80 px-5 py-3">
                                <Map className="h-4 w-4 text-emerald-700" />
                                <h5 className="text-xs font-bold text-slate-800">Plot Information</h5>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                  <thead>
                                    <tr>
                                      {['Plot No.', 'Area', 'Crop'].map((heading) => (
                                        <th key={heading} className="border-b border-slate-100 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                          {heading}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {plotDetailRows.length > 0 ? (
                                      plotDetailRows.map((plot) => (
                                        <tr key={plot.id}>
                                          <td className="px-5 py-3 text-xs font-bold text-slate-700">{plot.number}</td>
                                          <td className="px-5 py-3 text-xs font-semibold text-slate-600">{plot.area}</td>
                                          <td className="px-5 py-3 text-xs font-semibold text-slate-600">{plot.crop}</td>
                                        </tr>
                                      ))
                                    ) : (
                                      <tr>
                                        <td colSpan={3} className="px-5 py-5 text-center text-xs font-semibold text-slate-400">
                                          No plots available
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </section>

                            <div className="space-y-3 p-4">
                              <section className="overflow-hidden rounded-lg border border-slate-200">
                                <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <Droplets className="h-4 w-4 text-emerald-700" />
                                    <h5 className="text-xs font-bold text-slate-800">Borewell Details</h5>
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-500">
                                    {borewellDetailGroups.length} borewell{borewellDetailGroups.length === 1 ? '' : 's'}
                                  </span>
                                </div>
                                <div className="space-y-3 p-3">
                                  {borewellDetailGroups.length > 0 ? (
                                    borewellDetailGroups.map((borewell) => (
                                      <div key={borewell.id} className="overflow-hidden rounded-md border border-slate-100">
                                        <div className="border-b border-slate-100 bg-emerald-50/50 px-3 py-2 text-[11px] font-bold text-emerald-800">
                                          {borewell.title}
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-5 gap-y-3 p-3">
                                          {borewell.items.map((item) => (
                                            <div key={item.label} className="min-w-0">
                                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.label}</p>
                                              <p className="mt-1 truncate text-xs font-bold text-slate-700">{item.value}</p>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="py-3 text-center text-xs font-semibold text-slate-400">No borewell details available</div>
                                  )}
                                </div>
                              </section>

                              <section className="overflow-hidden rounded-lg border border-slate-200">
                                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
                                  <Zap className="h-4 w-4 text-emerald-700" />
                                  <h5 className="text-xs font-bold text-slate-800">Electricity Connection Details</h5>
                                </div>
                                <div className="grid grid-cols-2 gap-x-5 gap-y-3 p-4">
                                  {electricityDetails.map((item) => (
                                      <div key={item.label} className="min-w-0">
                                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.label}</p>
                                        <p className="mt-1 truncate text-xs font-bold text-slate-700">{item.value}</p>
                                      </div>
                                  ))}
                                </div>
                              </section>
                            </div>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!pendingCropChange} onOpenChange={(open) => !open && setPendingCropChange(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Crop Selection</AlertDialogTitle>
          <AlertDialogDescription>
            This action will set crop type for this farmer and send it to the server. Do you want to continue?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={!!(pendingCropChange && cropUpdating[pendingCropChange.farmerId])}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmCropSelection}
            disabled={!!(pendingCropChange && cropUpdating[pendingCropChange.farmerId])}
          >
            I Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Dialog open={newLandModal.open} onOpenChange={(open) => setNewLandModal({ open, farmerId: open ? newLandModal.farmerId : null })}>
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col overflow-hidden rounded-2xl">
        <DialogHeader>
          <DialogTitle>Add Land Details</DialogTitle>
          <DialogDescription>Complete all 4 steps to add new land.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className={`rounded-md border px-3 py-2 text-xs font-medium text-center ${newLandStep === s ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'text-muted-foreground'}`}>
                Step {s}
              </div>
            ))}
          </div>

          {newLandStep === 1 && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">State</label>
                  <Select value={newLandForm.state || 'none'} onValueChange={(value) => setNewLandForm((p) => ({ ...p, state: value === 'none' ? '' : value }))}>
                    <SelectTrigger><span>{newLandForm.state || 'Select state'}</span></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select state</SelectItem>
                      <SelectItem value="Andhra Pradesh">Andhra Pradesh</SelectItem>
                      <SelectItem value="Bihar">Bihar</SelectItem>
                      <SelectItem value="Chhattisgarh">Chhattisgarh</SelectItem>
                      <SelectItem value="Maharashtra">Maharashtra</SelectItem>
                      <SelectItem value="Rajasthan">Rajasthan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">District</label>
                  <Input value={newLandForm.district} onChange={(e) => setNewLandForm((p) => ({ ...p, district: e.target.value }))} placeholder="Enter district" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Village</label>
                  <Input value={newLandForm.village} onChange={(e) => setNewLandForm((p) => ({ ...p, village: e.target.value }))} placeholder="Enter village" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Acres of Land</label>
                  <Input type="number" step="0.01" placeholder="Enter acres (e.g. 10.75)" value={newLandForm.acres} onChange={(e) => setNewLandForm((p) => ({ ...p, acres: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Crop Type <span className="text-muted-foreground/60">(Optional)</span></label>
                  <Select value={newLandForm.cropType || 'none'} onValueChange={(value) => setNewLandForm((p) => ({ ...p, cropType: value === 'none' ? '' : value }))}>
                    <SelectTrigger><span>{newLandForm.cropType || 'Select crop type'}</span></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="Napier">Napier</SelectItem>
                      <SelectItem value="Paddy">Paddy</SelectItem>
                      <SelectItem value="Rahar">Rahar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Land Location</label>
                <Button type="button" variant="outline" onClick={getNewLandUserLocation} disabled={newLandLocationLoading} className="gap-2 w-full">
                  {newLandLocationLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                  {newLandLocationLoading ? 'Getting Current Location...' : 'Use My Current Location'}
                </Button>
                <div className="relative border-2 border-border rounded-lg overflow-hidden h-72">
                  <MapContainer center={newLandLocation || { lat: 22.5726, lng: 78.9629 }} zoom={16} style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      attribution="&copy; Esri"
                    />
                    <Marker
                      position={newLandLocation || { lat: 22.5726, lng: 78.9629 }}
                      draggable={true}
                      eventHandlers={{
                        dragend: (e: any) => {
                          const pos = e.target.getLatLng();
                          setNewLandLocation({ lat: pos.lat, lng: pos.lng });
                          setNewLandForm((prev) => ({ ...prev, landLocation: `${pos.lat}, ${pos.lng}` }));
                        },
                      }}
                    />
                  </MapContainer>
                </div>
                <Input
                  value={newLandForm.landLocation}
                  onChange={(e) => setNewLandForm((p) => ({ ...p, landLocation: e.target.value }))}
                  placeholder="Selected coordinates (editable)"
                />
              </div>
            </div>
          )}

          {newLandStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-info/10 rounded-lg border border-info/20">
                <Info className="w-5 h-5 text-info mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Upload a KML file to auto-map the boundary, or draw it manually on the map using the polygon/rectangle/circle tools.
                </p>
              </div>

              {/* KML Upload */}
              <div className="space-y-2">
                <label
                  className={`flex items-center justify-center gap-3 w-full rounded-lg border-2 border-dashed py-4 px-4 cursor-pointer transition-colors ${
                    newLandIsParsingKml
                      ? 'border-primary/40 bg-primary/5 cursor-wait'
                      : newLandKmlCoordinates
                      ? 'border-green-400 bg-green-50'
                      : 'border-border hover:border-primary/50 hover:bg-muted/30'
                  }`}
                >
                  {newLandIsParsingKml ? (
                    <>
                      <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                      <span className="text-sm font-medium text-primary">Reading KML fileâ€¦</span>
                    </>
                  ) : newLandKmlCoordinates ? (
                    <>
                      <Check className="w-5 h-5 text-green-600 shrink-0" />
                      <span className="text-sm font-medium text-green-700">
                        KML loaded â€” {newLandKmlCoordinates.length} boundary points
                      </span>
                      <button
                        type="button"
                        onClick={e => { e.preventDefault(); setNewLandKmlCoordinates(null); }}
                        className="ml-auto text-muted-foreground hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Upload KML file</p>
                        <p className="text-xs text-muted-foreground">Auto-maps the land boundary from the file</p>
                      </div>
                    </>
                  )}
                  {!newLandKmlCoordinates && (
                    <input
                      type="file"
                      accept=".kml,.kmz"
                      className="hidden"
                      disabled={newLandIsParsingKml}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleNewLandKmlUpload(file);
                        e.target.value = '';
                      }}
                    />
                  )}
                </label>
                {newLandKmlCoordinates && (
                  <p className="text-xs text-muted-foreground px-1">
                    KML boundary will be used for land mapping. You can still draw manually on the map to override it.
                  </p>
                )}
              </div>

              <Button type="button" variant="outline" onClick={getNewLandUserLocation} disabled={newLandLocationLoading} className="gap-2 w-full">
                {newLandLocationLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                {newLandLocationLoading ? 'Getting Location...' : 'Use My Location'}
              </Button>
              <div className="relative border-2 border-border rounded-lg overflow-hidden h-80">
                <MapContainer center={newLandLocation || { lat: 22.5726, lng: 78.9629 }} zoom={16} style={{ height: '100%', width: '100%' }}>
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    attribution="&copy; Esri"
                  />
                  <FlyToBounds coords={newLandKmlCoordinates} />
                  {newLandKmlCoordinates && newLandKmlCoordinates.length >= 3 && (
                    <Polygon
                      positions={newLandKmlCoordinates.map(c => [c.lat, c.lng] as [number, number])}
                      pathOptions={{ color: 'var(--land-boundary-color, #fde047)', fillColor: 'var(--land-boundary-fill, #fef9c3)', fillOpacity: 0.28, weight: 3 }}
                    />
                  )}
                  {newLandKmlCoordinates && newLandKmlCoordinates.length > 0 && (() => {
                    const lat = newLandKmlCoordinates.reduce((s, c) => s + c.lat, 0) / newLandKmlCoordinates.length;
                    const lng = newLandKmlCoordinates.reduce((s, c) => s + c.lng, 0) / newLandKmlCoordinates.length;
                    return <Marker position={[lat, lng]} />;
                  })()}
                  <FeatureGroup ref={newLandFeatureGroupRef}>
                    <EditControl
                      position="topleft"
                      onCreated={(e: any) => {
                        const layer = e.layer;
                        const latlngs = layer.getLatLngs?.();
                        if (Array.isArray(latlngs) && Array.isArray(latlngs[0])) {
                          const coords = latlngs[0].map((p: any) => [p.lat, p.lng]);
                          setNewLandForm((prev) => ({ ...prev, landMapping: coords }));
                        }
                      }}
                      onEdited={(e: any) => {
                        e.layers.eachLayer((layer: any) => {
                          const latlngs = layer.getLatLngs?.();
                          if (Array.isArray(latlngs) && Array.isArray(latlngs[0])) {
                            const coords = latlngs[0].map((p: any) => [p.lat, p.lng]);
                            setNewLandForm((prev) => ({ ...prev, landMapping: coords }));
                          }
                        });
                      }}
                      onDeleted={() => setNewLandForm((prev) => ({ ...prev, landMapping: [] }))}
                      draw={{
                        rectangle: true,
                        polygon: true,
                        circle: true,
                        polyline: false,
                        marker: false,
                        circlemarker: false,
                      }}
                    />
                  </FeatureGroup>
                </MapContainer>
              </div>
            </div>
          )}

          {newLandStep === 3 && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-info/10 rounded-lg border border-info/20">
                <Info className="w-5 h-5 text-info mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">Photos and video are <span className="font-semibold text-foreground">optional</span>. You can skip this step and add media later.</p>
              </div>
              <label className="text-xs font-medium text-muted-foreground">Land Images <span className="text-muted-foreground/60">(Optional â€” up to 3)</span></label>
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((index) => (
                  <div key={index}>
                    <input
                      ref={(el) => { newLandImageInputRefs.current[index] = el; }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleNewLandImagePick(index, e.target.files?.[0] || null)}
                    />
                    <button
                      type="button"
                      onClick={() => newLandImageInputRefs.current[index]?.click()}
                      className="w-full h-28 rounded-lg border-2 border-dashed border-border hover:border-primary/60 bg-muted/20 flex items-center justify-center overflow-hidden"
                    >
                      {newLandImagePreviews[index] ? (
                        <img src={newLandImagePreviews[index] as string} alt={`Land image ${index + 1}`} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-2xl text-muted-foreground">+</span>
                      )}
                    </button>
                    {newLandImagePreviews[index] && (
                      <button type="button" onClick={() => clearNewLandImagePick(index)} className="mt-1 flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                        <X className="w-3 h-3" /> Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Land Video <span className="text-muted-foreground/60">(Optional)</span></label>
                <input
                  ref={newLandVideoInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => handleNewLandVideoPick(e.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  onClick={() => newLandVideoInputRef.current?.click()}
                  className="w-full h-32 rounded-lg border-2 border-dashed border-border hover:border-primary/60 bg-muted/20 flex items-center justify-center overflow-hidden"
                >
                  {newLandVideoPreview ? (
                    <video src={newLandVideoPreview} className="h-full w-full object-cover" controls />
                  ) : (
                    <span className="text-2xl text-muted-foreground">+</span>
                  )}
                </button>
                {newLandVideoPreview && (
                  <button type="button" onClick={() => handleNewLandVideoPick(null)} className="mt-1 flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                    <X className="w-3 h-3" /> Remove video
                  </button>
                )}
              </div>
            </div>
          )}

          {newLandStep === 4 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Agreement Start Date</label>
                  <Input type="date" value={newLandForm.leaseStart} onChange={(e) => setNewLandForm((p) => ({ ...p, leaseStart: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Agreement End Date</label>
                  <Input type="date" value={newLandForm.leaseEnd} onChange={(e) => setNewLandForm((p) => ({ ...p, leaseEnd: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Lease Amount (Per Acre Per Annum)</label>
                <Input type="number" placeholder="Enter lease amount" value={newLandForm.leaseAmount} onChange={(e) => setNewLandForm((p) => ({ ...p, leaseAmount: e.target.value }))} />
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3">
                  <p className="text-sm font-bold text-slate-900">Lock-in Period</p>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">Optional period during which this land lease cannot be ended early.</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <EditField label="Lock-in Start Date">
                    <Input
                      type="date"
                      min={newLandForm.leaseStart || undefined}
                      max={newLandForm.lockInEnd || newLandForm.leaseEnd || undefined}
                      value={newLandForm.lockInStart}
                      onChange={(event) => setNewLandForm((previous) => ({ ...previous, lockInStart: event.target.value }))}
                    />
                  </EditField>
                  <EditField label="Lock-in End Date">
                    <Input
                      type="date"
                      min={newLandForm.lockInStart || newLandForm.leaseStart || undefined}
                      max={newLandForm.leaseEnd || undefined}
                      value={newLandForm.lockInEnd}
                      onChange={(event) => setNewLandForm((previous) => ({ ...previous, lockInEnd: event.target.value }))}
                    />
                  </EditField>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: 'agreementPdf', label: 'New Agreement' },
                  { key: 'b1Pdf', label: 'B1 Record' },
                  { key: 'kisanBookPdf', label: 'Kisan Book' },
                ].map((doc) => (
                  <div key={doc.key} className="space-y-1">
                    <label className="text-xs text-muted-foreground">{doc.label} <span className="text-muted-foreground/60">(Optional)</span></label>
                    <Input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setNewLandForm((p) => ({ ...p, [doc.key]: e.target.files?.[0] ?? null }))}
                    />
                  </div>
                ))}
              </div>
              <LandCoOwnerEditor
                coOwners={newLandForm.coOwners}
                onChange={(coOwners) => setNewLandForm((previous) => ({ ...previous, coOwners }))}
              />
            </div>
          )}

          <div className="flex justify-between gap-2 pt-2">
            <Button variant="outline" onClick={() => setNewLandModal({ open: false, farmerId: null })}>Cancel</Button>
            <div className="flex items-center gap-2">
              {newLandStep > 1 && (
                <Button variant="outline" onClick={() => setNewLandStep((s) => (s - 1) as 1 | 2 | 3 | 4)}>Back</Button>
              )}
              {newLandStep < 4 ? (
                <Button onClick={() => setNewLandStep((s) => (s + 1) as 1 | 2 | 3 | 4)}>Next</Button>
              ) : (
                <Button onClick={handleAddLandDetails} disabled={newLandSaving}>
                  {newLandSaving ? 'Saving...' : 'Save Land'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={!!farmsPopupFarmerId} onOpenChange={(open) => !open && setFarmsPopupFarmerId(null)}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Farm Details - {activeFarmsPopupFarmer?.fullName ?? ''}</DialogTitle>
          <DialogDescription>All land cards for this farmer</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-4 max-h-[70vh] overflow-y-auto pr-1">
          {activeFarmsPopupFarmer && getFarmCards(activeFarmsPopupFarmer).map((farm, farmIndex) => {
            const rawFarm   = activeFarmsPopupFarmer.farms?.[farmIndex];
            const landPlots: any[] = Array.isArray(rawFarm?.plots) ? rawFarm.plots : [];
            const plotStats = [
              { key: 'napier', label: 'Napier', color: 'var(--crop-napier-color, #22c55e)' },
              { key: 'rahar',  label: 'Rahar',  color: 'var(--crop-rahar-color, #800000)' },
              { key: 'paddy',  label: 'Paddy',  color: 'var(--crop-paddy-color, #22c55e)' },
            ].map(({ key, label, color }) => {
              const matched = landPlots.filter((p: any) => p.crop_type === key);
              return {
                label, color,
                count: matched.length,
                acres: matched.reduce((s: number, p: any) => s + (Number(p.plot_area) || 0), 0),
              };
            });
            const acresValue = Number(farm.acres);
            const acresDisplay = Number.isFinite(acresValue) && acresValue > 0 ? `${acresValue.toLocaleString('en-IN')} acres` : 'N/A';
            const now = Date.now();
            const leaseStartMs = farm.leaseStart ? new Date(farm.leaseStart).getTime() : NaN;
            const leaseEndMs = farm.leaseEnd ? new Date(farm.leaseEnd).getTime() : NaN;
            const hasLeaseRange = Number.isFinite(leaseStartMs) && Number.isFinite(leaseEndMs) && leaseEndMs > leaseStartMs;
            const leaseProgressPct = hasLeaseRange
              ? Math.max(0, Math.min(100, ((now - leaseStartMs) / (leaseEndMs - leaseStartMs)) * 100))
              : 0;
            const farmCoords: [number, number][] = Array.isArray(farm.landMapping?.coordinates)
              ? (farm.landMapping?.coordinates as any[])
                  .filter((c: any) => Array.isArray(c) && c.length >= 2)
                  .map((c: any) => [Number(c[0]), Number(c[1])])
                  .filter((c: [number, number]) => Number.isFinite(c[0]) && Number.isFinite(c[1]))
              : [];
            return (
              <div key={farm.id} className="w-[340px] h-[430px] rounded-lg border bg-white shadow-sm overflow-hidden shrink-0">
                <div className="h-[140px] w-full bg-muted/20 relative overflow-hidden">
                  {farmCoords.length > 0 ? (
                    <MapContainer
                      center={[farmCoords[0][0], farmCoords[0][1]]}
                      zoom={15}
                      style={{ height: '100%', width: '100%' }}
                      scrollWheelZoom={false}
                    >
                      <TileLayer
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        attribution='Tiles &copy; Esri'
                      />
                      <Polygon positions={farmCoords as any} pathOptions={{ color: 'var(--land-boundary-color, #fde047)', fillColor: 'var(--land-boundary-fill, #fef9c3)', fillOpacity: 0.28, weight: 3 }} />
                      <Marker position={[farmCoords[0][0], farmCoords[0][1]] as any}>
                        <Popup>Land boundary</Popup>
                      </Marker>
                    </MapContainer>
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                      <Map className="h-8 w-8" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 rounded bg-black/70 text-white text-[10px] px-2 py-1 inline-flex items-center gap-1">
                    <Map className="h-3 w-3" />
                    Land Mapping
                  </div>
                </div>
                <div className="p-3 space-y-2 text-sm h-[290px] overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm">Land Data</div>
                    <div className="text-xs text-muted-foreground">
                      Block: <span className="font-medium text-foreground">{farm.block || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 text-black" />
                    <span className="truncate">{farm.location}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Acres</span>
                    <span className="font-medium">{acresDisplay}</span>
                  </div>
                  {/* Plot crop stats */}
                  <div className="pt-2 border-t space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Plots</span>
                      <span className="text-xs font-bold text-foreground">{landPlots.length} total</span>
                    </div>
                    {plotStats.map(({ label, color, count, acres }) => (
                      <div key={label} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                          <span className="text-xs text-muted-foreground">{label}</span>
                        </div>
                        {count > 0 ? (
                          <span className="text-xs font-semibold" style={{ color }}>
                            {count} plot{count > 1 ? 's' : ''} Â· {acres.toFixed(2)} ac
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">â€”</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t">
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Land Mapping</div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Area Map</span>
                      <IconPopup
                        title="Land Mapping"
                        description={farm.landMapping?.totalArea != null ? `${farm.landMapping.totalArea} acres` : undefined}
                        icon={<Map className="h-4 w-4 text-black" />}
                        data={farm.landMapping ?? null}
                      />
                    </div>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Lease Tenure Timeline</div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-green-600 transition-all" style={{ width: `${leaseProgressPct}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-[11px] mt-1">
                      <span className="text-muted-foreground">{formatLandDate(farm.leaseStart)}</span>
                      <span className="text-muted-foreground">{Math.round(leaseProgressPct)}%</span>
                      <span className="text-muted-foreground">{formatLandDate(farm.leaseEnd)}</span>
                    </div>
                    <div className="mt-2 rounded-md border bg-muted/20 px-2.5 py-2">
                      <p className="text-[10px] font-semibold text-muted-foreground">Lock-in Period</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-foreground">
                        {farm.lockInStart && farm.lockInEnd
                          ? `${formatLandDate(farm.lockInStart)} to ${formatLandDate(farm.lockInEnd)}`
                          : 'Not configured'}
                      </p>
                    </div>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Payments</div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Payment Records</span>
                      <IconPopup title="Payments" icon={<Wallet className="h-4 w-4 text-black" />} data={null} />
                    </div>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Harvest Logs</div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Harvest Entries</span>
                      <IconPopup title="Harvest Logs" icon={<NotebookText className="h-4 w-4 text-black" />} data={null} />
                    </div>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Land Media</div>
                    {(() => {
                      const farmerFarms = Array.isArray(activeFarmsPopupFarmer?.farms) ? activeFarmsPopupFarmer.farms : [];
                      const farmIndex = Number(String(farm.id).split('-').pop() || '1') - 1;
                      const rawFarm = farmerFarms[farmIndex] ?? null;
                      const images: string[] = Array.isArray(rawFarm?.land_media?.images) ? rawFarm.land_media.images.slice(0, 3) : [];
                      const video: string = rawFarm?.land_media?.video || '';

                      return (
                        <div className="space-y-2">
                          <div className="grid grid-cols-3 gap-2">
                            {[0, 1, 2].map((idx) => (
                              <div key={`${farm.id}-img-${idx}`} className="h-16 rounded-md border bg-muted/10 overflow-hidden">
                                {images[idx] ? (
                                  <img src={images[idx]} alt={`Land image ${idx + 1}`} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">
                                    No image
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="h-20 rounded-md border bg-muted/10 overflow-hidden">
                            {video ? (
                              <video src={video} className="h-full w-full object-cover" controls muted />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">
                                No video
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          })}
          {activeFarmsPopupFarmer && (
            <button
              type="button"
              className="w-[340px] h-[430px] rounded-lg border-2 border-dashed border-gray-300 bg-white hover:bg-gray-50 transition flex flex-col items-center justify-center gap-3 shrink-0"
              onClick={() => openNewLandPopup(activeFarmsPopupFarmer.id)}
            >
              <div className="h-14 w-14 rounded-full border border-gray-300 flex items-center justify-center text-3xl text-gray-700">+</div>
              <div className="text-sm font-medium text-gray-700">Add New Land</div>
              <div className="text-xs text-muted-foreground">Click to add land details</div>
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
    {/* â”€â”€ Edit Farmer Modal â”€â”€ */}
    <Dialog open={editFarmerModal.open} onOpenChange={(open) => (open ? setEditFarmerModal({ open, farmerId: editFarmerModal.farmerId }) : closeEditModal())}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-5xl flex-col overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-2xl">
        <DialogHeader className="shrink-0">
          <div className="bg-slate-950 px-6 py-5 text-white">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="relative group cursor-pointer shrink-0" onClick={() => editProfilePhotoRef.current?.click()}>
                  <div className="h-16 w-16 overflow-hidden rounded-2xl border border-white/20 bg-white/10 shadow">
                    <ProfileAvatar
                      src={editProfilePhotoPreview ?? activeEditFarmer?.profileImageUrl}
                      name={activeEditFarmer?.fullName || 'Farmer'}
                      fallbackClassName="text-lg font-bold text-white"
                    />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                    <Camera className="h-5 w-5 text-white" />
                  </div>
                  <input
                    ref={editProfilePhotoRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setEditFarmerForm((p) => ({ ...p, profilePhoto: file }));
                      setEditProfilePhotoPreview(file ? URL.createObjectURL(file) : null);
                    }}
                  />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold text-white">Edit Farmer</DialogTitle>
                  <p className="mt-1 text-sm text-slate-300">{activeEditFarmer?.fullName} - FRM-{activeEditFarmer?.id.slice(0, 3).toUpperCase()}</p>
                  <p className="mt-1 text-[11px] text-slate-400">Update profile, documents, bank details, and farm records from one place.</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-left sm:min-w-[300px]">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Farms</p>
                  <p className="mt-1 text-lg font-semibold text-white">{editFarmerFarms.length}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Area</p>
                  <p className="mt-1 text-lg font-semibold text-white">{activeEditFarmer?.landMapping?.totalArea ?? 0}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">KYC</p>
                  <p className="mt-1 text-lg font-semibold text-white">{activeEditFarmer?.kyc ? 'Yes' : 'No'}</p>
                </div>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Tab row */}
        <div className="flex shrink-0 overflow-x-auto border-b border-slate-200 bg-slate-50 px-2">
          {(
            [
              { key: 'personal',  label: 'Personal',     Icon: Users },
              { key: 'location',  label: 'Location',     Icon: MapPin },
              { key: 'kyc',       label: 'KYC & Docs',   Icon: ShieldCheck },
              { key: 'agreement', label: 'Agreement',    Icon: FileText },
              { key: 'bank',      label: 'Bank',         Icon: Landmark },
              { key: 'farms',     label: 'Farm Details', Icon: Leaf },
            ] as { key: 'personal' | 'location' | 'kyc' | 'agreement' | 'bank' | 'farms'; label: string; Icon: React.ComponentType<{ className?: string }> }[]
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setEditFarmerTab(key)}
              className={`my-2 flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                editFarmerTab === key
                  ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 px-4 py-5 sm:px-6">

          {/* â”€â”€ Personal â”€â”€ */}
          {editFarmerTab === 'personal' && (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <EditSectionHeader icon={UserRound} title="Personal Information" description="Keep the farmer identity and contact details clean and easy to verify." />
              <EditField label="Full Name">
                <Input value={editFarmerForm.fullName} onChange={(e) => setEditFarmerForm((p) => ({ ...p, fullName: e.target.value }))} placeholder="Enter full name" />
              </EditField>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <EditField label="Phone Number">
                  <Input value={editFarmerForm.phoneNumber} onChange={(e) => setEditFarmerForm((p) => ({ ...p, phoneNumber: e.target.value }))} placeholder="Enter phone number" />
                </EditField>
                <EditField label="Alternate Phone" hint="Optional">
                  <Input value={editFarmerForm.alternatePhone} onChange={(e) => setEditFarmerForm((p) => ({ ...p, alternatePhone: e.target.value }))} placeholder="Enter alternate phone" />
                </EditField>
              </div>
            </div>
          )}

          {/* â”€â”€ Location â”€â”€ */}
          {editFarmerTab === 'location' && (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <EditSectionHeader icon={Home} title="Location & Farming" description="Organize the farmer's administrative location, assigned block, and farming model." />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <EditField label="State">
                  <Select value={editFarmerForm.state || 'none'} onValueChange={(v) => setEditFarmerForm((p) => ({ ...p, state: v === 'none' ? '' : v }))}>
                    <SelectTrigger><span>{editFarmerForm.state || 'Select state'}</span></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select state</SelectItem>
                      <SelectItem value="Andhra Pradesh">Andhra Pradesh</SelectItem>
                      <SelectItem value="Bihar">Bihar</SelectItem>
                      <SelectItem value="Chhattisgarh">Chhattisgarh</SelectItem>
                      <SelectItem value="Maharashtra">Maharashtra</SelectItem>
                      <SelectItem value="Rajasthan">Rajasthan</SelectItem>
                    </SelectContent>
                  </Select>
                </EditField>
                <EditField label="District">
                  <Input value={editFarmerForm.district} onChange={(e) => setEditFarmerForm((p) => ({ ...p, district: e.target.value }))} placeholder="Enter district" />
                </EditField>
                <EditField label="Taluka" hint="Optional">
                  <Input value={editFarmerForm.taluka} onChange={(e) => setEditFarmerForm((p) => ({ ...p, taluka: e.target.value }))} placeholder="Enter taluka" />
                </EditField>
                <EditField label="Village">
                  <Input value={editFarmerForm.village} onChange={(e) => setEditFarmerForm((p) => ({ ...p, village: e.target.value }))} placeholder="Enter village" />
                </EditField>
                <EditField label="Block Assigned" hint="Optional">
                  <Input value={editFarmerForm.blockAssigned} onChange={(e) => setEditFarmerForm((p) => ({ ...p, blockAssigned: e.target.value }))} placeholder="Enter block" />
                </EditField>
                <EditField label="Farming Option">
                  <Select value={editFarmerForm.farmingOption || 'none'} onValueChange={(v) => setEditFarmerForm((p) => ({ ...p, farmingOption: v === 'none' ? '' : v }))}>
                    <SelectTrigger><span>{editFarmerForm.farmingOption || 'Select option'}</span></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select option</SelectItem>
                      <SelectItem value="Lease Farming">Lease Farming</SelectItem>
                      <SelectItem value="Contract Farming">Contract Farming</SelectItem>
                    </SelectContent>
                  </Select>
                </EditField>
              </div>
            </div>
          )}

          {/* â”€â”€ KYC & Documents â”€â”€ */}
          {editFarmerTab === 'kyc' && (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <EditSectionHeader icon={ShieldCheck} title="KYC & Documents" description="Review identification numbers and preview existing documents before replacing them." />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <EditField label="Aadhaar Number">
                  <Input value={editFarmerForm.aadhaarNumber} onChange={(e) => setEditFarmerForm((p) => ({ ...p, aadhaarNumber: e.target.value }))} placeholder="12-digit Aadhaar" maxLength={12} />
                </EditField>
                <EditField label="PAN Number">
                  <Input value={editFarmerForm.panNumber} onChange={(e) => setEditFarmerForm((p) => ({ ...p, panNumber: e.target.value.toUpperCase() }))} placeholder="e.g. ABCDE1234F" maxLength={10} />
                </EditField>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {(
                  [
                    { key: 'aadhaarCardFile', label: 'Aadhaar Card', Icon: IdCard,     docKey: 'adhar_card' },
                    { key: 'panCardFile',     label: 'PAN Card',     Icon: IdCard,     docKey: 'pand_card'  },
                    { key: 'kisanBookFile',   label: 'Kisan Book',   Icon: BookOpen,   docKey: 'kisan_book' },
                    { key: 'b1RecordFile',    label: 'B1 Record',    Icon: FileBadge2, docKey: 'B1_record'  },
                  ] as { key: 'aadhaarCardFile' | 'panCardFile' | 'kisanBookFile' | 'b1RecordFile'; label: string; Icon: React.ComponentType<{ className?: string }>; docKey: Parameters<typeof getDocumentUrl>[1] }[]
                ).map(({ key, label, Icon, docKey }) => (
                  <EditDocumentUploadCard
                    key={key}
                    title={label}
                    icon={Icon}
                    existingUrl={activeEditFarmer ? getDocumentUrl(activeEditFarmer, docKey) : ''}
                    file={editFarmerForm[key] as File | null}
                    accept="application/pdf,image/*"
                    onFileChange={(file) => setEditFarmerForm((p) => ({ ...p, [key]: file }))}
                  />
                ))}
              </div>
            </div>
          )}

          {/* â”€â”€ Agreement â”€â”€ */}
          {editFarmerTab === 'agreement' && (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <EditSectionHeader icon={FileText} title="Agreement Details" description="Manage lease tenure, rent, and the signed agreement document." />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <EditField label="Agreement Start Date">
                  <Input type="date" value={editFarmerForm.agreementStartDate} onChange={(e) => setEditFarmerForm((p) => ({ ...p, agreementStartDate: e.target.value }))} />
                </EditField>
                <EditField label="Agreement End Date">
                  <Input type="date" value={editFarmerForm.agreementEndDate} onChange={(e) => setEditFarmerForm((p) => ({ ...p, agreementEndDate: e.target.value }))} />
                </EditField>
              </div>
              <EditField label="Lease Amount" hint="Per acre per annum">
                <Input type="number" value={editFarmerForm.leaseRent} onChange={(e) => setEditFarmerForm((p) => ({ ...p, leaseRent: e.target.value }))} placeholder="Enter lease amount" />
              </EditField>
              <EditDocumentUploadCard
                title="Agreement Document"
                icon={FileText}
                existingUrl={activeEditFarmer ? getDocumentUrl(activeEditFarmer, 'agreement') : ''}
                file={editFarmerForm.agreementFile}
                accept="application/pdf"
                onFileChange={(file) => setEditFarmerForm((p) => ({ ...p, agreementFile: file }))}
              />
            </div>
          )}

          {/* â”€â”€ Bank Details â”€â”€ */}
          {editFarmerTab === 'bank' && (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <EditSectionHeader icon={Banknote} title="Bank Details" description="Maintain the primary payout account and add other linked bank accounts." />
                {activeEditFarmer && (
                  <Button
                    type="button"
                    onClick={() => setBankAddModal({ open: true, farmerId: activeEditFarmer.id })}
                    className="h-9 shrink-0 gap-1.5 rounded-lg bg-[#0D3A35] px-3 text-xs font-bold text-white hover:bg-[#092b27]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Bank Account
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <EditField label="Account Holder Name">
                  <Input value={editFarmerForm.bankHolderName} onChange={(e) => setEditFarmerForm((p) => ({ ...p, bankHolderName: e.target.value }))} placeholder="Holder name" />
                </EditField>
                <EditField label="Bank Name">
                  <Input value={editFarmerForm.bankName} onChange={(e) => setEditFarmerForm((p) => ({ ...p, bankName: e.target.value }))} placeholder="Bank name" />
                </EditField>
                <EditField label="Account Number">
                  <Input value={editFarmerForm.bankAccountNumber} onChange={(e) => setEditFarmerForm((p) => ({ ...p, bankAccountNumber: e.target.value }))} placeholder="Account number" />
                </EditField>
                <EditField label="IFSC Code">
                  <Input value={editFarmerForm.bankIfsc} onChange={(e) => setEditFarmerForm((p) => ({ ...p, bankIfsc: e.target.value.toUpperCase() }))} placeholder="IFSC code" />
                </EditField>
              </div>
              <EditDocumentUploadCard
                title="Passbook Front Page"
                icon={Landmark}
                existingUrl={activeEditFarmer ? getDocumentUrl(activeEditFarmer, 'bank_passbook') : ''}
                file={editFarmerForm.passbookFile}
                accept="application/pdf"
                onFileChange={(file) => setEditFarmerForm((p) => ({ ...p, passbookFile: file }))}
              />
              {activeEditFarmer && getAllBankDetails(activeEditFarmer).length > 1 && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Other Linked Accounts</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {getAllBankDetails(activeEditFarmer).slice(1).map((account, accountIndex) => (
                      <div key={`${account.accountNumber}-${accountIndex}`} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                        <p className="text-sm font-bold text-slate-900">{account.bankName || 'Bank not recorded'}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{account.holderName || 'Holder not recorded'}</p>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Account Number</p>
                            <p className="mt-1 break-all text-xs font-bold text-slate-700">{account.accountNumber || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">IFSC</p>
                            <p className="mt-1 break-all text-xs font-bold uppercase text-slate-700">{account.ifsc || 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* â”€â”€ Farm Details â”€â”€ */}
          {editFarmerTab === 'farms' && (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <EditSectionHeader icon={Leaf} title="Farm Details" description="Review farm parcels, media, crop type, acreage, and land boundary mapping." />
              {farmerLandLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-4 border-[#0D3A35] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : editFarmerFarms.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Leaf className="h-8 w-8 opacity-30" />
                  <span className="text-sm">No farms registered for this farmer.</span>
                </div>
              ) : (
                <>
                  {editFarmerFarms.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {editFarmerFarms.map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setEditFarmIndex(idx)}
                          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            editFarmIndex === idx ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                          }`}
                        >
                          Farm {idx + 1}
                        </button>
                      ))}
                    </div>
                  )}
                  {(() => {
                    const farm = editFarmerFarms[editFarmIndex];
                    if (!farm) return null;
                    const updateFarm = (patch: Partial<typeof farm>) =>
                      setEditFarmerFarms((prev) => prev.map((f, i) => (i === editFarmIndex ? { ...f, ...patch } : f)));
                    return (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">State</label>
                            <Input value={farm.state} onChange={(e) => updateFarm({ state: e.target.value })} placeholder="State" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">District</label>
                            <Input value={farm.district} onChange={(e) => updateFarm({ district: e.target.value })} placeholder="District" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Village</label>
                            <Input value={farm.village} onChange={(e) => updateFarm({ village: e.target.value })} placeholder="Village" />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Total Area (Acres)</label>
                            <Input type="number" step="0.01" value={farm.totalArea} onChange={(e) => updateFarm({ totalArea: e.target.value })} placeholder="e.g. 10.5" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Crop Type <span className="text-muted-foreground/60">(Optional)</span></label>
                            <Select value={farm.cropType || 'none'} onValueChange={(v) => updateFarm({ cropType: v === 'none' ? '' : v })}>
                              <SelectTrigger><span>{farm.cropType || 'Select crop'}</span></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <SelectItem value="napier">Napier</SelectItem>
                                <SelectItem value="paddy">Paddy</SelectItem>
                                <SelectItem value="ragi">Ragi</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50">
                          <div className="border-b border-slate-200 bg-white px-4 py-3">
                            <h4 className="text-sm font-bold text-slate-900">Lease Tenure & Lock-in Period</h4>
                            <p className="mt-0.5 text-xs font-medium text-slate-500">Maintain lease dates, rate, and the parcel-specific lock-in period.</p>
                          </div>
                          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                            <EditField label="Lease Start Date">
                              <Input type="date" value={farm.leaseStart} onChange={(event) => updateFarm({ leaseStart: event.target.value })} />
                            </EditField>
                            <EditField label="Lease End Date">
                              <Input type="date" min={farm.leaseStart || undefined} value={farm.leaseEnd} onChange={(event) => updateFarm({ leaseEnd: event.target.value })} />
                            </EditField>
                            <EditField label="Lease Rate" hint="Per acre/year">
                              <Input type="number" min="0" value={farm.leaseRate} onChange={(event) => updateFarm({ leaseRate: event.target.value })} placeholder="Enter rate" />
                            </EditField>
                            <EditField label="Lock-in Start Date" hint="Optional">
                              <Input
                                type="date"
                                min={farm.leaseStart || undefined}
                                max={farm.lockInEnd || farm.leaseEnd || undefined}
                                value={farm.lockInStart}
                                onChange={(event) => updateFarm({ lockInStart: event.target.value })}
                              />
                            </EditField>
                            <EditField label="Lock-in End Date" hint="Optional">
                              <Input
                                type="date"
                                min={farm.lockInStart || farm.leaseStart || undefined}
                                max={farm.leaseEnd || undefined}
                                value={farm.lockInEnd}
                                onChange={(event) => updateFarm({ lockInEnd: event.target.value })}
                              />
                            </EditField>
                          </div>
                        </section>
                        <LandCoOwnerEditor
                          coOwners={farm.coOwners}
                          onChange={(coOwners) => updateFarm({ coOwners })}
                        />
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">Land Images <span className="text-muted-foreground/60">(up to 3 â€” click to replace)</span></label>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            {[0, 1, 2].map((imgIdx) => (
                              <div key={imgIdx}>
                                <label className="block w-full h-24 rounded-lg border-2 border-dashed border-border hover:border-primary/60 bg-muted/20 overflow-hidden cursor-pointer">
                                  {farm.imagePreviews[imgIdx] ? (
                                    <img src={farm.imagePreviews[imgIdx] as string} alt={`img ${imgIdx + 1}`} className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center">
                                      <ImageIcon className="h-6 w-6 text-muted-foreground opacity-40" />
                                    </div>
                                  )}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0] ?? null;
                                      const imgs = [...farm.images]; imgs[imgIdx] = file;
                                      const prev = [...farm.imagePreviews]; prev[imgIdx] = file ? URL.createObjectURL(file) : farm.imagePreviews[imgIdx];
                                      updateFarm({ images: imgs, imagePreviews: prev });
                                    }}
                                  />
                                </label>
                                {farm.images[imgIdx] && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const imgs = [...farm.images]; imgs[imgIdx] = null;
                                      const prev = [...farm.imagePreviews]; prev[imgIdx] = null;
                                      updateFarm({ images: imgs, imagePreviews: prev });
                                    }}
                                    className="mt-1 flex items-center gap-1 text-[10px] text-red-500 hover:text-red-700"
                                  >
                                    <X className="w-3 h-3" /> Remove
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">Land Video <span className="text-muted-foreground/60">(click to replace)</span></label>
                          <label className="block w-full h-28 rounded-lg border-2 border-dashed border-border hover:border-primary/60 bg-muted/20 overflow-hidden cursor-pointer">
                            {farm.videoPreview ? (
                              <video src={farm.videoPreview} className="h-full w-full object-cover" muted />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center"><ImageIcon className="h-7 w-7 text-muted-foreground opacity-30" /></div>
                            )}
                            <input
                              type="file"
                              accept="video/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0] ?? null;
                                updateFarm({ video: file, videoPreview: file ? URL.createObjectURL(file) : farm.videoPreview });
                              }}
                            />
                          </label>
                          {farm.video && (
                            <button type="button" onClick={() => updateFarm({ video: null, videoPreview: null })} className="flex items-center gap-1 text-[10px] text-red-500 hover:text-red-700">
                              <X className="w-3 h-3" /> Remove video
                            </button>
                          )}
                        </div>

                        {/* â”€â”€ Land Mapping â”€â”€ */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-muted-foreground">Land Mapping</label>
                            {(farm.kmlCoordinates ?? farm.landCoordinates).length > 0 && (
                              <span className="text-[10px] font-medium text-emerald-700">
                                {(farm.kmlCoordinates ?? farm.landCoordinates).length} boundary points
                              </span>
                            )}
                          </div>

                          {/* KML upload */}
                          <label className={`flex items-center gap-3 w-full rounded-lg border-2 border-dashed py-3 px-4 cursor-pointer transition-colors ${
                            farm.isParsingKml
                              ? 'border-primary/40 bg-primary/5 cursor-wait'
                              : farm.kmlCoordinates
                              ? 'border-green-400 bg-green-50'
                              : 'border-border hover:border-primary/50 hover:bg-muted/30'
                          }`}>
                            {farm.isParsingKml ? (
                              <><Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" /><span className="text-xs font-medium text-primary">Reading KMLâ€¦</span></>
                            ) : farm.kmlCoordinates ? (
                              <>
                                <Check className="w-4 h-4 text-green-600 shrink-0" />
                                <span className="text-xs font-medium text-green-700">KML loaded â€” {farm.kmlCoordinates.length} points</span>
                                <button
                                  type="button"
                                  onClick={(e) => { e.preventDefault(); updateFarm({ kmlCoordinates: null }); }}
                                  className="ml-auto text-muted-foreground hover:text-red-500 transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <UploadCloud className="w-4 h-4 text-muted-foreground shrink-0" />
                                <div>
                                  <p className="text-xs font-medium text-foreground">Upload KML file</p>
                                  <p className="text-[10px] text-muted-foreground">Auto-maps boundary from file</p>
                                </div>
                              </>
                            )}
                            {!farm.kmlCoordinates && (
                              <input
                                type="file"
                                accept=".kml,.kmz"
                                className="hidden"
                                disabled={farm.isParsingKml}
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  updateFarm({ isParsingKml: true });
                                  try {
                                    const result = await parseKmlFile(file);
                                    const coords = result.land_coordinates.map(([lat, lng]: [number, number]) => ({ lat, lng }));
                                    updateFarm({ kmlCoordinates: coords, isParsingKml: false });
                                    toast({ title: 'KML loaded', description: `${coords.length} boundary points mapped` });
                                  } catch (err: any) {
                                    toast({ title: 'KML Error', description: err?.message || 'Failed to read KML file', variant: 'destructive' });
                                    updateFarm({ isParsingKml: false });
                                  }
                                  e.target.value = '';
                                }}
                              />
                            )}
                          </label>

                          {/* Map with existing polygon + draw tools */}
                          <div className="relative border-2 border-border rounded-lg overflow-hidden h-64">
                            {(() => {
                              const effectiveCoords: { lat: number; lng: number }[] =
                                farm.kmlCoordinates
                                  ?? farm.landCoordinates.map(([lat, lng]) => ({ lat, lng }));
                              const center = effectiveCoords.length > 0
                                ? { lat: effectiveCoords[0].lat, lng: effectiveCoords[0].lng }
                                : { lat: 22.5726, lng: 78.9629 };
                              return (
                                <MapContainer center={center} zoom={15} style={{ height: '100%', width: '100%' }}>
                                  <TileLayer
                                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                    attribution="&copy; Esri"
                                  />
                                  <FlyToBounds coords={farm.kmlCoordinates} />
                                  {effectiveCoords.length >= 3 && (
                                    <Polygon
                                      positions={effectiveCoords.map((c) => [c.lat, c.lng] as [number, number])}
                                      pathOptions={{ color: 'var(--land-boundary-color, #fde047)', fillColor: 'var(--land-boundary-fill, #fef9c3)', fillOpacity: 0.28, weight: 3 }}
                                    />
                                  )}
                                  <FeatureGroup>
                                    <EditControl
                                      position="topleft"
                                      onCreated={(e: any) => {
                                        const latlngs = e.layer.getLatLngs?.();
                                        if (Array.isArray(latlngs) && Array.isArray(latlngs[0])) {
                                          updateFarm({ landCoordinates: latlngs[0].map((p: any) => [p.lat, p.lng]), kmlCoordinates: null });
                                        }
                                      }}
                                      onEdited={(e: any) => {
                                        e.layers.eachLayer((layer: any) => {
                                          const latlngs = layer.getLatLngs?.();
                                          if (Array.isArray(latlngs) && Array.isArray(latlngs[0])) {
                                            updateFarm({ landCoordinates: latlngs[0].map((p: any) => [p.lat, p.lng]) });
                                          }
                                        });
                                      }}
                                      onDeleted={() => updateFarm({ landCoordinates: [], kmlCoordinates: null })}
                                      draw={{ rectangle: true, polygon: true, circle: false, polyline: false, marker: false, circlemarker: false }}
                                    />
                                  </FeatureGroup>
                                </MapContainer>
                              );
                            })()}
                          </div>
                          <p className="text-[10px] text-muted-foreground">Upload KML to auto-map, or draw/edit the boundary directly on the map.</p>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-4 py-4 shadow-[0_-8px_24px_rgba(15,23,42,0.04)] sm:px-6">
          <Button variant="outline" onClick={closeEditModal} disabled={editFarmerSaving} className="gap-2 border-slate-200 text-slate-700 hover:bg-slate-50">
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button
            className="gap-2 bg-blue-600 text-white shadow-sm hover:bg-blue-700"
            onClick={handleSaveEditFarmer}
            disabled={editFarmerSaving}
          >
            {editFarmerSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {editFarmerSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={bankAddModal.open} onOpenChange={(open) => setBankAddModal({ open, farmerId: open ? bankAddModal.farmerId : null })}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle>Add Bank Account</DialogTitle>
          <DialogDescription>Add another account for this land owner and upload its passbook front page.</DialogDescription>
        </DialogHeader>
        {(() => {
          const farmer = farmers.find((f) => f.id === bankAddModal.farmerId) ?? null;
          if (!farmer) {
            return <div className="text-sm text-muted-foreground">Farmer not found.</div>;
          }
          return (
            <div className="space-y-3">
              <Input
                placeholder="Holder's name"
                value={bankDrafts[farmer.id]?.holderName ?? ''}
                onChange={(e) => setBankDrafts((prev) => ({
                  ...prev,
                  [farmer.id]: {
                    holderName: e.target.value,
                    bankName: prev[farmer.id]?.bankName ?? '',
                    accountNumber: prev[farmer.id]?.accountNumber ?? '',
                    ifsc: prev[farmer.id]?.ifsc ?? '',
                    passbookPdf: prev[farmer.id]?.passbookPdf ?? null,
                  },
                }))}
              />
              <Input
                placeholder="Bank name"
                value={bankDrafts[farmer.id]?.bankName ?? ''}
                onChange={(e) => setBankDrafts((prev) => ({
                  ...prev,
                  [farmer.id]: {
                    holderName: prev[farmer.id]?.holderName ?? '',
                    bankName: e.target.value,
                    accountNumber: prev[farmer.id]?.accountNumber ?? '',
                    ifsc: prev[farmer.id]?.ifsc ?? '',
                    passbookPdf: prev[farmer.id]?.passbookPdf ?? null,
                  },
                }))}
              />
              <Input
                placeholder="Account number"
                value={bankDrafts[farmer.id]?.accountNumber ?? ''}
                onChange={(e) => setBankDrafts((prev) => ({
                  ...prev,
                  [farmer.id]: {
                    holderName: prev[farmer.id]?.holderName ?? '',
                    bankName: prev[farmer.id]?.bankName ?? '',
                    accountNumber: e.target.value,
                    ifsc: prev[farmer.id]?.ifsc ?? '',
                    passbookPdf: prev[farmer.id]?.passbookPdf ?? null,
                  },
                }))}
              />
              <Input
                placeholder="IFSC code"
                value={bankDrafts[farmer.id]?.ifsc ?? ''}
                onChange={(e) => setBankDrafts((prev) => ({
                  ...prev,
                  [farmer.id]: {
                    holderName: prev[farmer.id]?.holderName ?? '',
                    bankName: prev[farmer.id]?.bankName ?? '',
                    accountNumber: prev[farmer.id]?.accountNumber ?? '',
                    ifsc: e.target.value,
                    passbookPdf: prev[farmer.id]?.passbookPdf ?? null,
                  },
                }))}
              />
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Passbook Front Page (PDF)</label>
                <Input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setBankDrafts((prev) => ({
                      ...prev,
                      [farmer.id]: {
                        holderName: prev[farmer.id]?.holderName ?? '',
                        bankName: prev[farmer.id]?.bankName ?? '',
                        accountNumber: prev[farmer.id]?.accountNumber ?? '',
                        ifsc: prev[farmer.id]?.ifsc ?? '',
                        passbookPdf: file,
                      },
                    }));
                  }}
                />
                {bankDrafts[farmer.id]?.passbookPdf?.name ? (
                  <p className="text-[11px] text-muted-foreground truncate">
                    Selected: {bankDrafts[farmer.id]?.passbookPdf?.name}
                  </p>
                ) : null}
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  className="h-9 bg-[#0D3A35] px-4 text-xs text-white hover:bg-[#092b27]"
                  onClick={async () => {
                    const success = await handleAddBankDetail(farmer);
                    if (success) {
                      setBankAddModal({ open: false, farmerId: null });
                    }
                  }}
                  disabled={!!bankSaving[farmer.id]}
                >
                  {bankSaving[farmer.id] ? 'Saving...' : 'Add Bank Account'}
                </Button>
              </div>
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>

    <Dialog open={coOwnerAddModal.open} onOpenChange={(open) => (open ? null : closeAddCoOwnerModal())}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle>Add Co-owner</DialogTitle>
          <DialogDescription>
            Add a co-owner for this parcel{coOwnerAddModal.farmTotalAcres > 0 ? ` (${coOwnerAddModal.farmTotalAcres.toLocaleString('en-IN')} ac total)` : ''}. Share is entered in acres, e.g. Co-owner 1: 72 ac, Owner: 28 ac.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Co-owner name"
            value={coOwnerAddForm.name}
            onChange={(e) => setCoOwnerAddForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <Input
            placeholder="Contact number"
            value={coOwnerAddForm.contact}
            onChange={(e) => setCoOwnerAddForm((prev) => ({ ...prev, contact: e.target.value }))}
          />
          <Input
            placeholder="Address"
            value={coOwnerAddForm.address}
            onChange={(e) => setCoOwnerAddForm((prev) => ({ ...prev, address: e.target.value }))}
          />
          <Input
            type="email"
            placeholder="Email (optional)"
            value={coOwnerAddForm.email}
            onChange={(e) => setCoOwnerAddForm((prev) => ({ ...prev, email: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              placeholder="Aadhaar number"
              value={coOwnerAddForm.aadhaar}
              onChange={(e) => setCoOwnerAddForm((prev) => ({ ...prev, aadhaar: e.target.value.replace(/\D/g, '').slice(0, 12) }))}
              inputMode="numeric"
            />
            <Input
              placeholder="PAN number"
              value={coOwnerAddForm.pan}
              onChange={(e) => setCoOwnerAddForm((prev) => ({ ...prev, pan: e.target.value.toUpperCase().slice(0, 10) }))}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Share (in acres)</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 72"
              value={coOwnerAddForm.shareAcres}
              onChange={(e) => setCoOwnerAddForm((prev) => ({ ...prev, shareAcres: e.target.value }))}
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
            <p className="text-xs font-bold text-slate-700">Bank Details (optional)</p>
            <Input
              placeholder="Bank name"
              value={coOwnerAddForm.bankName}
              onChange={(e) => setCoOwnerAddForm((prev) => ({ ...prev, bankName: e.target.value }))}
            />
            <Input
              placeholder="Holder's name"
              value={coOwnerAddForm.bankHolderName}
              onChange={(e) => setCoOwnerAddForm((prev) => ({ ...prev, bankHolderName: e.target.value }))}
            />
            <Input
              placeholder="Account number"
              value={coOwnerAddForm.bankAccountNumber}
              onChange={(e) => setCoOwnerAddForm((prev) => ({ ...prev, bankAccountNumber: e.target.value }))}
            />
            <Input
              placeholder="IFSC code"
              value={coOwnerAddForm.bankIfsc}
              onChange={(e) => setCoOwnerAddForm((prev) => ({ ...prev, bankIfsc: e.target.value.toUpperCase() }))}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeAddCoOwnerModal} disabled={coOwnerAddSaving}>
              Cancel
            </Button>
            <Button
              type="button"
              className="h-9 bg-[#0D3A35] px-4 text-xs text-white hover:bg-[#092b27]"
              onClick={handleSaveCoOwner}
              disabled={coOwnerAddSaving}
            >
              {coOwnerAddSaving ? 'Saving...' : 'Save Co-owner'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default Farmers;
