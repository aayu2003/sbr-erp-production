import { useMemo, useState, useEffect, useRef } from 'react';
import { Search, Filter, Users, MapPin, Phone, FileText, ShieldCheck, NotebookText, Wallet, Check, Flag, Leaf, Wheat, Sprout, Image as ImageIcon, Map, Pencil, Trash2, KeyRound, MoreVertical, IdCard, BookOpen, FileBadge2, Landmark, Info, Navigation, Loader2, UploadCloud, X, Camera, Save, UserRound, Home, Banknote, Eye, FileUp } from 'lucide-react';
import { Fragment } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, FeatureGroup, useMap } from 'react-leaflet';
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
  blockAssigned?: string | null;
  createdAt: Date;
  documents?: Record<string, any> | null;
  bankDetails?: any[];
  farms?: any[];
  crop?: CropValue;
  farmingOption?: string;
  farmerAddress?: string;
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
  block?: string | null;
};

const cropOptions: Array<{ value: Exclude<CropValue, ''>; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'napier', label: 'Napier', Icon: Leaf },
  { value: 'paddy', label: 'Paddy', Icon: Wheat },
  { value: 'ragi', label: 'Ragi', Icon: Sprout },
];

const FlyToBounds = ({ coords }: { coords: { lat: number; lng: number }[] | null }) => {
  const map = useMap();
  useEffect(() => {
    if (!coords || coords.length === 0) return;
    const latLngs = coords.map(c => L.latLng(c.lat, c.lng));
    map.flyToBounds(L.latLngBounds(latLngs), { padding: [40, 40], duration: 1.4, animate: true });
  }, [coords]);
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

const Farmers = () => {
  // --- Existing State & Logic ---
  const [farmers, setFarmers] = useState<FarmerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [flagging, setFlagging] = useState<Record<string, boolean>>({});
  const [cropSelections, setCropSelections] = useState<Record<string, CropValue>>({});
  const [cropUpdating, setCropUpdating] = useState<Record<string, boolean>>({});
  const [pendingCropChange, setPendingCropChange] = useState<{ farmerId: string; crop: CropValue } | null>(null);
  const [farmsPopupFarmerId, setFarmsPopupFarmerId] = useState<string | null>(null);
  const [newLandModal, setNewLandModal] = useState<{ open: boolean; farmerId: string | null }>({ open: false, farmerId: null });
  const [bankAddModal, setBankAddModal] = useState<{ open: boolean; farmerId: string | null }>({ open: false, farmerId: null });
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
    agreementPdf: null as File | null,
    b1Pdf: null as File | null,
    kisanBookPdf: null as File | null,
    landImages: [] as File[],
    landVideo: null as File | null,
  });
  const { toast } = useToast();

  // --- Edit Farmer Modal ---
  const [editFarmerModal, setEditFarmerModal] = useState<{ open: boolean; farmerId: string | null }>({ open: false, farmerId: null });
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
  }>>([]);
  const [editFarmIndex, setEditFarmIndex] = useState(0);

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

        return {
          id: item.farmer_id,
          fullName: fd.full_name || 'Unknown',
          phoneNumber: fd.phone_number || 'N/A',
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
          blockAssigned: fd.block_assigned ?? fd.block ?? fd.block_name ?? null,
          crop: cropTypeRaw === 'napier' || cropTypeRaw === 'paddy' || cropTypeRaw === 'ragi' ? (cropTypeRaw as CropValue) : '',
          createdAt: item.created_at ? new Date(item.created_at) : new Date(),
          documents: item.documents || null,
          bankDetails: [],
          farms: [],
          farmingOption: fd.farming_option ?? '',
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

        return {
          ...farmer,
          fullName: farmerDetail?.farmer_name || farmer.fullName,
          phoneNumber: farmerDetail?.farmer_contact || farmer.phoneNumber,
          alternatePhone: farmerDetail?.farmer_alternate_contact ?? farmer.alternatePhone,
          farmerAddress: farmerDetail?.farmer_address ?? farmer.farmerAddress ?? '',
          kyc: detailKyc || farmer.kyc,
          agreements: detailAgreements,
          documents: detailDocs,
          bankDetails: detailBank,
          farms: farmDetail,
          farmingOption: farmerDetail?.farming_option || farmer.farmingOption || '',
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
            const detail = detailMap[farmer.id];
            return detail ? enrichFarmer(farmer, detail) : farmer;
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
    // If currently flagged, just unflag locally
    if (flagged[farmerId]) {
      setFlagged(prev => ({ ...prev, [farmerId]: false }));
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
      toast({ title: 'Success', description: 'Farmer flagged', variant: 'success' });
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
    if (!q) return farmers;

    return farmers.filter(farmer =>
      farmer.fullName.toLowerCase().includes(q) ||
      farmer.village.toLowerCase().includes(q) ||
      farmer.district.toLowerCase().includes(q)
    );
  }, [farmers, searchQuery]);

  const totalArea = farmers.reduce((acc, f) => acc + (f.landMapping?.totalArea || 0), 0);
  // consider KYC present if backend returned kyc_data
  const verifiedKYC = farmers.filter(f => !!f.kyc).length;
  const totalAgreements = farmers.reduce((acc, f) => acc + f.agreements.length, 0);

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
        leaseStart,
        leaseEnd,
        block: farmer.blockAssigned ?? null,
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

  const getLandMediaItems = (farmer: FarmerRow) => {
    const docs = farmer.documents ?? {};
    const farms = Array.isArray(farmer.farms) ? farmer.farms : [];

    const farmImages = farms.flatMap((farm: any) =>
      Array.isArray(farm?.land_media?.images) ? farm.land_media.images : []
    );
    const farmVideos = farms
      .map((farm: any) => farm?.land_media?.video)
      .filter(Boolean) as string[];

    const docImages = [
      docs?.land_image_1?.url,
      docs?.land_image_2?.url,
      docs?.land_image_3?.url,
      docs?.land_media?.url,
    ].filter(Boolean) as string[];
    const docVideo = docs?.land_video?.url ? [docs.land_video.url] : [];

    const images = [...farmImages, ...docImages];
    const videos = [...farmVideos, ...docVideo];
    const media = [
      ...images.map((url) => ({ type: 'image' as const, url })),
      ...videos.map((url) => ({ type: 'video' as const, url })),
    ];
    return media.slice(0, 6);
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
    return [...backend, ...fallback, ...local];
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

  const refreshFarmerDetails = async (farmerId: string) => {
    const base = getBaseUrl();
    const resp = await fetch(`${base.replace(/\/$/, '')}/farmer_managment/farmer_details/${farmerId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!resp.ok) return;
    const detailJson = await resp.json();
    const farmerDetail = detailJson?.farmer ?? {};
    const farmDetail = Array.isArray(detailJson?.farm) ? detailJson.farm : [];
    const detailArea = farmDetail.reduce((sum: number, f: any) => sum + Number(f?.total_area ?? 0), 0);

    setFarmers((prev) =>
      prev.map((farmer) =>
        farmer.id === farmerId
          ? {
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
            }
          : farmer
      )
    );
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
      agreementPdf: null,
      b1Pdf: null,
      kisanBookPdf: null,
      landImages: [],
      landVideo: null,
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
    if (!newLandModal.farmerId) {
      toast({ title: 'Error', description: 'Farmer ID missing.', variant: 'destructive' });
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

  const activeEditFarmer = useMemo(
    () => farmers.find((f) => f.id === editFarmerModal.farmerId) ?? null,
    [farmers, editFarmerModal.farmerId]
  );

  const openEditModal = (farmer: FarmerRow) => {
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

    const farms = Array.isArray(farmer.farms) ? farmer.farms : [];
    setEditFarmerFarms(
      farms.map((farm: any) => {
        const rawCoords: any[] = Array.isArray(farm.land_coordinates) ? farm.land_coordinates : [];
        const landCoordinates: [number, number][] = rawCoords
          .map((c: any) => Array.isArray(c) ? [Number(c[0]), Number(c[1])] : [Number(c?.lat), Number(c?.lng)])
          .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b)) as [number, number][];
        return {
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
          landCoordinates,
          kmlCoordinates: null,
          isParsingKml: false,
        };
      })
    );
    setEditFarmIndex(0);
    setEditFarmerTab('personal');
    setEditFarmerModal({ open: true, farmerId: farmer.id });
  };

  const closeEditModal = () => {
    setEditFarmerSaving(false);
    setEditProfilePhotoPreview(null);
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
        const farmId = await resolveFarmId(farm, originalFarm, index);
        if (!farmId) {
          throw new Error(`Farm ID missing for Farm ${index + 1}`);
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
          Number(farm.totalArea || 0) !== Number(originalFarm.total_area ?? 0) ||
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
                <Polygon positions={normalizedCoords as any} pathOptions={{ color: '#f03' }} />
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
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Farmers</h1>
          <p className="text-muted-foreground mt-1">Manage registered farmers</p>
        </div>
      </div>

      {/* Stats - Exact Layout Preserved */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Farmers', value: farmers.length, icon: Users, color: 'text-primary' },
          { label: 'Total Land Area', value: `${totalArea} acres`, icon: null, color: 'text-blue-600' }, 
          { label: 'KYC Verified', value: verifiedKYC, icon: null, color: 'text-green-600' }, 
          { label: 'Agreements', value: totalAgreements, icon: null, color: 'text-orange-600' },
        ].map(stat => (
          <div key={stat.label} className="bg-card rounded-xl p-5 shadow-sm border border-border bg-white">
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Search & Filter - Exact Layout Preserved */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, village, or district..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button className="gap-2 border border-gray-300 bg-white hover:bg-gray-50">
          <Filter className="w-4 h-4" />
          Filter
        </Button>
      </div>

      {/* Farmers Card Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredFarmers.map((farmer) => (
            <Fragment key={farmer.id}>
              <div className={`group overflow-hidden rounded-xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${flagged[farmer.id] ? 'border-red-200 ring-1 ring-red-100' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-emerald-50/80 via-white to-white px-4 py-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {farmer.profileImageUrl ? (
                      <img src={farmer.profileImageUrl} alt="profile" className="h-14 w-14 rounded-full object-cover border-2 border-white shadow-sm ring-1 ring-emerald-100" />
                    ) : (
                      <div className="h-14 w-14 rounded-full border-2 border-white bg-emerald-50 shadow-sm ring-1 ring-emerald-100 flex items-center justify-center text-sm font-semibold text-emerald-800">
                        {farmer.fullName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'FR'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-base leading-5 truncate text-gray-950">{farmer.fullName}</div>
                      <div className="mt-0.5 inline-flex items-center rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-gray-500 ring-1 ring-gray-200">
                        FRM-{farmer.id.slice(0, 3).toUpperCase()}
                      </div>
                      {farmer.farmingOption && (
                        <div
                          className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
                            farmer.farmingOption.toLowerCase() === 'lease farming'
                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                              : farmer.farmingOption.toLowerCase() === 'contract farming'
                                ? 'bg-blue-50 text-blue-700 ring-blue-100'
                                : 'bg-gray-50 text-gray-700 ring-gray-200'
                          }`}
                        >
                          {farmer.farmingOption.toLowerCase() === 'lease farming'
                            ? 'Lease Farming'
                            : farmer.farmingOption.toLowerCase() === 'contract farming'
                              ? 'Contract Farming'
                              : farmer.farmingOption}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      onClick={() => openEditModal(farmer)}
                      className="h-8 w-8 rounded-full p-0 bg-white text-blue-700 border border-blue-100 hover:bg-blue-50 shadow-sm"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => toast({ title: 'Delete', description: 'Delete action will be connected next.', variant: 'default' })}
                      className="h-8 w-8 rounded-full p-0 bg-white text-red-700 border border-red-100 hover:bg-red-50 shadow-sm"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => toggleFlag(farmer.id)}
                      disabled={!!flagging[farmer.id]}
                      className={`h-8 w-8 rounded-full p-0 bg-white border shadow-sm ${flagged[farmer.id] ? 'text-red-600 border-red-100 hover:bg-red-50' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                      title="Flag"
                    >
                      <Flag className="h-4 w-4" />
                    </Button>
                    <Button className="h-8 w-8 rounded-full p-0 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 shadow-sm" title="More">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="mx-4 mt-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Farmer Details</div>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button className="h-7 px-2.5 rounded-md border border-emerald-200 bg-white hover:bg-emerald-50 text-xs text-emerald-700">
                          <Landmark className="mr-1 h-3.5 w-3.5" />
                          Bank Details
                        </Button>
                      </DialogTrigger>
                          <DialogContent className="max-w-2xl rounded-2xl border-0 p-0 overflow-hidden">
                            <DialogHeader>
                              <div className="bg-gradient-to-r from-emerald-600 to-green-600 px-6 py-4 text-white">
                                <DialogTitle className="text-lg font-semibold">Bank Details</DialogTitle>
                                <p className="text-xs text-emerald-50 mt-1">Manage linked bank accounts and passbook documents.</p>
                              </div>
                            </DialogHeader>
                            <div className="space-y-4 text-sm p-6 bg-white">
                              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                {getAllBankDetails(farmer).map((bank, idx) => (
                                  <div key={`${farmer.id}-bank-${idx}`} className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 space-y-2">
                                    <div className="flex items-center justify-between pb-1 border-b border-emerald-100">
                                      <span className="text-[11px] font-semibold text-emerald-700">Bank Account {idx + 1}</span>
                                      <span className="text-[11px] text-emerald-700 bg-white border border-emerald-200 rounded-full px-2 py-0.5">Verified</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-muted-foreground text-xs">Holder's Name</span>
                                      <span className="font-medium">{bank.holderName || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-muted-foreground text-xs">Bank Name</span>
                                      <span className="font-medium">{bank.bankName || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-muted-foreground text-xs">Account Number</span>
                                      <span className="font-medium">{bank.accountNumber || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-muted-foreground text-xs">IFSC</span>
                                      <span className="font-medium">{bank.ifsc || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-muted-foreground text-xs">Passbook PDF</span>
                                      <span className="font-medium truncate max-w-[180px] text-right">{bank.passbookPdfName || 'N/A'}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="flex justify-end pt-1">
                                <Button
                                  type="button"
                                  className="h-9 px-4 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                  onClick={() => setBankAddModal({ open: true, farmerId: farmer.id })}
                                >
                                  Add +
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
                      <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Phone className="h-3.5 w-3.5 text-gray-500" />
                        Phone Number
                      </div>
                      <div className="mt-0.5 truncate text-sm font-semibold text-gray-950">{farmer.phoneNumber}</div>
                    </div>
                    <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
                      <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <IdCard className="h-3.5 w-3.5 text-gray-500" />
                        Aadhaar Card
                      </div>
                      <div className="mt-0.5 truncate text-sm font-semibold text-gray-950">{getKycValue(farmer, 'adhar_number') || 'N/A'}</div>
                    </div>
                    <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
                      <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 text-gray-500" />
                        Location
                      </div>
                      <div className="mt-0.5 truncate text-sm font-semibold text-gray-950">{[farmer.village, farmer.district].filter(Boolean).join(', ')}</div>
                    </div>
                    <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
                      <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <FileBadge2 className="h-3.5 w-3.5 text-gray-500" />
                        PAN Card
                      </div>
                      <div className="mt-0.5 truncate text-sm font-semibold text-gray-950">{getKycValue(farmer, 'pan_numnber') || getKycValue(farmer, 'pan_number') || 'N/A'}</div>
                    </div>
                  </div>
                </div>

                <div className="mx-4 mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-gray-200 bg-white px-2 py-2.5 text-center">
                    <div className="text-lg font-bold leading-5 text-gray-950">{Number(farmer.landMapping?.totalArea ?? 0) || 0}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">Acres</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white px-2 py-2.5 text-center">
                    <div className="text-lg font-bold leading-5 text-gray-950">{getFarmCards(farmer).length}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">Lands</div>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-2 py-2.5 text-center">
                    <div className="text-lg font-bold leading-5 text-emerald-800">
                      Rs. {getAmountInvested(farmer).toLocaleString('en-IN')}
                    </div>
                    <div className="mt-1 text-[11px] text-emerald-700">Agreeme  nt Amount</div>
                  </div>
                </div>

                <div className="mx-4 mt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Land Media</span>
                    <span className="text-[11px] text-muted-foreground">{getLandMediaItems(farmer).length} files</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {getLandMediaItems(farmer).length > 0 ? (
                      getLandMediaItems(farmer).map((media, idx) => (
                        <div key={`${farmer.id}-media-${idx}`} className="h-20 w-28 rounded-lg border border-gray-200 bg-muted/10 shrink-0 overflow-hidden shadow-sm">
                          {media.type === 'image' ? (
                            <img src={media.url} alt="Land media" className="h-full w-full object-cover" />
                          ) : (
                            <video src={media.url} className="h-full w-full object-cover" controls={false} muted />
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="h-20 w-full rounded-lg border border-dashed bg-muted/10 text-xs text-muted-foreground flex items-center justify-center">
                        No land media
                      </div>
                    )}
                  </div>
                </div>

                <div className="mx-4 mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 text-green-700 px-2.5 py-1 text-xs font-medium ring-1 ring-green-100">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    KYC Verified
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 text-green-700 px-2.5 py-1 text-xs font-medium ring-1 ring-green-100">
                    <Check className="h-3.5 w-3.5" />
                    Agreement Active
                  </span>
                </div>

                <div className="mt-3 border-t border-gray-100 bg-gray-50/70 px-4 py-3 flex items-center gap-3 overflow-x-auto">
                  <span className="inline-flex shrink-0 flex-col items-center gap-1 text-[11px] text-gray-700 font-medium">
                    <DocumentPreview title="Aadhaar Card" url={getDocumentUrl(farmer, 'adhar_card')} />
                    <span>Adhar Card</span>
                  </span>
                  <span className="inline-flex shrink-0 flex-col items-center gap-1 text-[11px] text-gray-700 font-medium">
                    <DocumentPreview title="PAN Card" url={getDocumentUrl(farmer, 'pand_card')} />
                    <span>PAN Card</span>
                  </span>
                  <span className="inline-flex shrink-0 flex-col items-center gap-1 text-[11px] text-gray-700 font-medium">
                    <DocumentPreview title="Kisan Book" url={getDocumentUrl(farmer, 'kisan_book')} />
                    <span>Kisan Book</span>
                  </span>
                  <span className="inline-flex shrink-0 flex-col items-center gap-1 text-[11px] text-gray-700 font-medium">
                    <DocumentPreview title="B1 Record" url={getDocumentUrl(farmer, 'B1_record')} />
                    <span>B1 Record</span>
                  </span>
                  <span className="inline-flex shrink-0 flex-col items-center gap-1 text-[11px] text-gray-700 font-medium">
                    <DocumentPreview title="Agreement" url={getDocumentUrl(farmer, 'agreement')} />
                    <span>Agreement</span>
                  </span>
                  <span className="inline-flex shrink-0 flex-col items-center gap-1 text-[11px] text-gray-700 font-medium">
                    <DocumentPreview title="Passbook" url={getDocumentUrl(farmer, 'bank_passbook')} />
                    <span>Passbook</span>
                  </span>
                  <Button
                    type="button"
                    onClick={() => setFarmsPopupFarmerId(farmer.id)}
                    className="ml-auto inline-flex shrink-0 h-9 px-3 gap-1 rounded-md border border-green-200 bg-green-600 text-white hover:bg-green-700 text-xs shadow-sm"
                  >
                    View Land
                  </Button>
                </div>
              </div>
            </Fragment>
          ))}
        </div>
      )}
    </div>
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Land Details</DialogTitle>
          <DialogDescription>Complete all 3 steps to add new land.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
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
                      pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.2, weight: 2.5 }}
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
              { key: 'napier', label: 'Napier', color: '#22c55e' },
              { key: 'rahar',  label: 'Rahar',  color: '#f97316' },
              { key: 'paddy',  label: 'Paddy',  color: '#f59e0b' },
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
                      <Polygon positions={farmCoords as any} pathOptions={{ color: '#16a34a', weight: 2 }} />
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
                      <span className="text-muted-foreground">{farm.leaseStart ?? 'N/A'}</span>
                      <span className="text-muted-foreground">{Math.round(leaseProgressPct)}%</span>
                      <span className="text-muted-foreground">{farm.leaseEnd ?? 'N/A'}</span>
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
                    {editProfilePhotoPreview || activeEditFarmer?.profileImageUrl ? (
                      <img src={editProfilePhotoPreview ?? activeEditFarmer?.profileImageUrl} alt="profile" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg font-bold text-white">
                        {activeEditFarmer?.fullName.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() || 'FR'}
                      </div>
                    )}
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
              <EditSectionHeader icon={Banknote} title="Bank Details" description="Maintain the payout account and preview the current passbook document." />
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
            </div>
          )}

          {/* â”€â”€ Farm Details â”€â”€ */}
          {editFarmerTab === 'farms' && (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <EditSectionHeader icon={Leaf} title="Farm Details" description="Review farm parcels, media, crop type, acreage, and land boundary mapping." />
              {editFarmerFarms.length === 0 ? (
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
                                      pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.2, weight: 2.5 }}
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
          <DialogTitle>Add Bank Details</DialogTitle>
          <DialogDescription>Provide account details and passbook front page PDF.</DialogDescription>
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
                  className="h-9 px-4 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={async () => {
                    const success = await handleAddBankDetail(farmer);
                    if (success) {
                      setBankAddModal({ open: false, farmerId: null });
                    }
                  }}
                  disabled={!!bankSaving[farmer.id]}
                >
                  {bankSaving[farmer.id] ? 'Saving...' : 'Add Bank Detail'}
                </Button>
              </div>
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
    </>
  );
};

export default Farmers;
