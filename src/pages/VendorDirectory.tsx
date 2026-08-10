import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ContactRound,
  CreditCard,
  Edit2,
  ExternalLink,
  Eye,
  FileCheck2,
  FileImage,
  FileText,
  Landmark,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Tags,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { getBaseUrl } from '@/lib/config';
import { toast } from 'sonner';

type VendorType = 'Machinery' | 'Seeds' | 'Fertilizer' | 'Chemicals' | 'Services' | 'Transport' | 'Other';
type VendorConstitution =
  | 'Individual'
  | 'Sole Proprietorship'
  | 'Partnership Firm'
  | 'Limited Liability Partnership (LLP)'
  | 'Private Limited Company'
  | 'Public Limited Company'
  | 'Trust / Society'
  | 'Co-operative Society'
  | 'HUF'
  | 'Government / PSU'
  | 'Other';

type Vendor = {
  id: string;
  name: string;
  type: VendorType;
  legalConstitution?: VendorConstitution;
  registrationNumber?: string;
  dateOfIncorporation?: string;
  principalPersonName?: string;
  authorisedSignatoryName?: string;
  authorisedSignatoryDesignation?: string;
  // primary contact
  phone?: string;
  contactEmail?: string;
  gst?: string;
  // identity
  pan?: string;
  aadhar?: string;
  // address fields (stored as concatenated string for backward compatibility)
  address?: string;
  placeOfSupplyAddress?: string;
  // bank and contacts
  bankName?: string;
  bankBranch?: string;
  ifsCode?: string;
  accountType?: string;
  accountNumber?: string;
  // primary contact number stored separately
  contactNumber?: string;
  salesContactName?: string;
  salesContactMobile?: string;
  salesContactEmail?: string;
  commercialContactName?: string;
  commercialContactMobile?: string;
  commercialContactEmail?: string;
  masmeUdyamNo?: string;
  // supply contact
  supplyContactNumber?: string;
  supplyContactEmail?: string;
  // documents (store file names)
  panFile?: string;
  aadharFile?: string;
  gstFile?: string;
  cancelledChequeFile?: string;
  udyamCertificateFile?: string;
  entityRegistrationFile?: string;
  constitutionDocumentFile?: string;
  authorizationLetterFile?: string;
  addressProofFile?: string;
  // tags
  tags?: string[];
};

type VendorDocumentPreview = {
  name: string;
  file?: string;
};

const isImageDocument = (file?: string) => /\.(png|jpe?g|webp|gif|bmp|svg)(?:[?#].*)?$/i.test(file || '');
const isPdfDocument = (file?: string) => /\.pdf(?:[?#].*)?$/i.test(file || '');
const isViewableDocumentUrl = (file?: string) => /^(https?:\/\/|data:|blob:|\/)/i.test(file || '');
const formatRecordDate = (value?: string) => {
  if (!value) return 'Not Recorded';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
};

const genId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const getApiBaseUrl = () => String(getBaseUrl() ?? '').replace(/\/$/, '');

const VENDOR_TYPES: VendorType[] = ['Machinery', 'Seeds', 'Fertilizer', 'Chemicals', 'Services', 'Transport', 'Other'];
const VENDOR_CONSTITUTIONS: VendorConstitution[] = [
  'Individual',
  'Sole Proprietorship',
  'Partnership Firm',
  'Limited Liability Partnership (LLP)',
  'Private Limited Company',
  'Public Limited Company',
  'Trust / Society',
  'Co-operative Society',
  'HUF',
  'Government / PSU',
  'Other',
];

const asVendorConstitution = (value: unknown): VendorConstitution | undefined => {
  const s = String(value ?? '').trim();
  return (VENDOR_CONSTITUTIONS as readonly string[]).includes(s) ? (s as VendorConstitution) : undefined;
};

const registrationLabelFor = (constitution: VendorConstitution) => {
  if (constitution === 'Limited Liability Partnership (LLP)') return 'LLPIN';
  if (constitution.includes('Limited Company')) return 'CIN';
  if (constitution === 'Partnership Firm') return 'Firm Registration Number';
  if (constitution === 'Trust / Society') return 'Trust / Society Registration Number';
  if (constitution === 'Co-operative Society') return 'Co-operative Registration Number';
  if (constitution === 'Government / PSU') return 'Government / PSU Registration Reference';
  if (constitution === 'Sole Proprietorship') return 'Shop Act / Establishment Registration No.';
  return 'Registration Number';
};

const principalPersonLabelFor = (constitution: VendorConstitution) => {
  if (constitution === 'Sole Proprietorship') return 'Proprietor Name';
  if (constitution === 'Partnership Firm') return 'Managing Partner Name';
  if (constitution === 'HUF') return 'Karta Name';
  if (constitution === 'Trust / Society') return 'Managing Trustee / Secretary';
  if (constitution === 'Co-operative Society') return 'Chairperson / Secretary';
  if (constitution === 'Government / PSU') return 'Nodal Officer Name';
  if (constitution.includes('Limited Company') || constitution.includes('Partnership (LLP)')) return 'Director / Designated Partner';
  return 'Principal Person Name';
};

const entityDocumentLabelFor = (constitution: VendorConstitution) => {
  if (constitution === 'Sole Proprietorship') return 'Shop Act / Establishment Certificate';
  if (constitution === 'Partnership Firm') return 'Firm Registration Certificate';
  if (constitution === 'Limited Liability Partnership (LLP)') return 'LLP Incorporation Certificate';
  if (constitution.includes('Limited Company')) return 'Certificate of Incorporation';
  if (constitution === 'Trust / Society') return 'Trust / Society Registration Certificate';
  if (constitution === 'Co-operative Society') return 'Co-operative Registration Certificate';
  if (constitution === 'Government / PSU') return 'Formation Order / Government Authorization';
  return 'Entity Registration Certificate';
};

const constitutionDocumentLabelFor = (constitution: VendorConstitution) => {
  if (constitution === 'Partnership Firm') return 'Partnership Deed';
  if (constitution === 'Limited Liability Partnership (LLP)') return 'LLP Agreement';
  if (constitution.includes('Limited Company')) return 'MOA & AOA';
  if (constitution === 'Trust / Society') return 'Trust Deed / Society Bye-laws';
  if (constitution === 'Co-operative Society') return 'Co-operative Bye-laws';
  if (constitution === 'HUF') return 'HUF Declaration / Deed';
  return 'Constitution Document';
};

const asVendorType = (value: unknown): VendorType => {
  const s = String(value ?? '').trim();
  return (VENDOR_TYPES as readonly string[]).includes(s) ? (s as VendorType) : 'Other';
};

const str = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  return s ? s : undefined;
};

const formatAddress = (addr: any): string | undefined => {
  if (!addr || typeof addr !== 'object') return undefined;
  const parts = [
    addr.plot_flat_unit_no_and_floor,
    addr.name_of_premises,
    addr.road,
    addr.taluka_locality,
    addr.district,
    addr.state,
    addr.pin_code,
  ]
    .map((x) => str(x))
    .filter(Boolean) as string[];

  return parts.length ? parts.join(', ') : undefined;
};

const mapVendorRawToVendor = (raw: any): Vendor => {
  const vendorDetails = raw?.vendor_details ?? {};
  const bankDetails = raw?.bank_details ?? {};
  const documentUrl = raw?.document_url ?? {};
  const supply = vendorDetails?.address_for_place_of_supply_of_goods_services ?? {};

  const tags = Array.isArray(raw?.tags) ? raw.tags.map(String) : undefined;

  return {
    id: String(raw?.vendor_id ?? raw?.id ?? genId()),
    name: String(vendorDetails?.vendor_name ?? '').trim(),
    type: asVendorType(vendorDetails?.nature_of_vendor),
    legalConstitution: asVendorConstitution(vendorDetails?.legal_constitution ?? vendorDetails?.vendor_entity_type),
    registrationNumber: str(vendorDetails?.registration_number),
    dateOfIncorporation: str(vendorDetails?.date_of_incorporation),
    principalPersonName: str(vendorDetails?.principal_person_name),
    authorisedSignatoryName: str(vendorDetails?.authorised_signatory_name),
    authorisedSignatoryDesignation: str(vendorDetails?.authorised_signatory_designation),
    contactNumber: str(vendorDetails?.vendor_contact),
    phone: str(vendorDetails?.vendor_contact),
    contactEmail: str(vendorDetails?.e_mail_id),
    gst: str(vendorDetails?.gst_number),
    pan: str(vendorDetails?.income_tax_pan),
    aadhar: str(vendorDetails?.aadhar_card_number),
    address: str(vendorDetails?.vendor_address) ?? formatAddress(vendorDetails?.address),
    placeOfSupplyAddress: formatAddress(vendorDetails?.address_for_place_of_supply_of_goods_services),
    supplyContactNumber: str(supply?.contact_number),
    supplyContactEmail: str(supply?.e_mail_id),
    bankName: str(bankDetails?.name_of_bank),
    bankBranch: str(bankDetails?.branch_address_with_pin_code),
    ifsCode: str(bankDetails?.ifs_code),
    accountType: str(bankDetails?.account_type),
    accountNumber: str(bankDetails?.account_number),
    salesContactName: str(bankDetails?.sales_service_contract_authorised_person?.name),
    salesContactMobile: str(bankDetails?.sales_service_contract_authorised_person?.mobile_number),
    salesContactEmail: str(bankDetails?.sales_service_contract_authorised_person?.e_mail_id),
    commercialContactName: str(bankDetails?.commercial_authorised_person?.name),
    commercialContactMobile: str(bankDetails?.commercial_authorised_person?.mobile_number),
    commercialContactEmail: str(bankDetails?.commercial_authorised_person?.e_mail_id),
    masmeUdyamNo: str(bankDetails?.masme_udyam_no),
    panFile: str(documentUrl?.pan_card),
    aadharFile: str(documentUrl?.aadhar_card),
    gstFile: str(documentUrl?.gst_registration_certificate),
    cancelledChequeFile: str(documentUrl?.cancelled_cheque_or_passbook_front_page),
    udyamCertificateFile: str(documentUrl?.udyam_akansha_msme_certificate),
    entityRegistrationFile: str(documentUrl?.entity_registration_certificate),
    constitutionDocumentFile: str(documentUrl?.constitution_document),
    authorizationLetterFile: str(documentUrl?.authorization_letter_or_board_resolution),
    addressProofFile: str(documentUrl?.registered_address_proof),
    tags,
  };
};

const defaultVendors: Vendor[] = [
  {
    id: 'v1',
    name: 'Vishwakarma Engineering Pvt Ltd',
    type: 'Machinery',
    phone: '080-2345-6789',
    contactNumber: '08023456789',
    contactEmail: 'contact@vishwakarma.example',
    gst: '27ABCDE1234F1Z5',
    address: 'Plot 12, Industrial Estate, Pune, Maharashtra - 411001',
    bankName: 'State Bank of India',
    bankBranch: 'Pune Main Branch, 411001',
    ifsCode: 'SBIN0001234',
    accountType: 'Current',
    accountNumber: '123456789012',
    masmeUdyamNo: 'UDYAM-MH-12-0012345',
    tags: ['machinery', 'services'],
  },
  {
    id: 'v2',
    name: 'GreenSeeds Pvt Ltd',
    type: 'Seeds',
    phone: '091-9988-7766',
    contactNumber: '9199887766',
    contactEmail: 'sales@greenseeds.example',
    gst: '27FGHIJ5678K2Z6',
    address: 'Block B, Agro Park, Nashik, Maharashtra - 422001',
    bankName: 'HDFC Bank',
    bankBranch: 'Nashik City Branch, 422001',
    ifsCode: 'HDFC0000456',
    accountType: 'Current',
    accountNumber: '045612340987',
    masmeUdyamNo: 'UDYAM-MH-15-0098765',
    tags: ['seeds', 'agriculture equipments'],
  },
  {
    id: 'v3',
    name: 'AgriTech Solutions',
    type: 'Services',
    phone: '022-4444-5555',
    contactNumber: '2244445555',
    contactEmail: 'info@agritech.example',
    gst: '27KLMNO9012P3Z7',
    address: '3rd Floor, Tech Park, Mumbai, Maharashtra - 400001',
    bankName: 'ICICI Bank',
    bankBranch: 'Mumbai Fort Branch, 400001',
    ifsCode: 'ICIC0000789',
    accountType: 'Current',
    accountNumber: '078912340056',
    masmeUdyamNo: 'UDYAM-MH-22-0045678',
    tags: ['IOT devices', 'electronics', 'computer'],
  },
  {
    id: 'v4',
    name: 'Fertico Industries',
    type: 'Fertilizer',
    phone: '033-6677-8899',
    contactNumber: '3366778899',
    contactEmail: 'support@fertico.example',
    gst: '19PQRST3456U4Z8',
    address: 'Village Road, Kolkata, West Bengal - 700001',
    bankName: 'Axis Bank',
    bankBranch: 'Kolkata Central Branch, 700001',
    ifsCode: 'UTIB0000123',
    accountType: 'Current',
    accountNumber: '012300987654',
    masmeUdyamNo: 'UDYAM-WB-10-0076543',
    tags: ['fertilizer', 'chemicals'],
  },
  {
    id: 'v5',
    name: 'Rapid Agro Logistics',
    type: 'Transport',
    phone: '044-5566-7788',
    contactNumber: '4455667788',
    contactEmail: 'ops@rapidlogistics.example',
    gst: '33UVWXY6789Z5Z1',
    address: 'Warehouse 7, Outer Ring Road, Chennai, Tamil Nadu - 600001',
    bankName: 'Canara Bank',
    bankBranch: 'Chennai Main Branch, 600001',
    ifsCode: 'CNRB0000567',
    accountType: 'Current',
    accountNumber: '056712349999',
    masmeUdyamNo: 'UDYAM-TN-02-0032109',
    tags: ['transport', 'services'],
  },
];

const fetchVendorsFromApi = async (): Promise<Vendor[]> => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error('API base URL is not set');

  const url = `${baseUrl}/purchase_flow/get_vendors_raw`;

  const doFetch = (method: 'GET' | 'POST') =>
    fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
      },
    });

  let res = await doFetch('GET');
  if (res.status === 405) res = await doFetch('POST');

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `HTTP ${res.status}`);
  }

  const data: any = await res.json().catch(() => null);
  const list = Array.isArray(data?.vendors) ? data.vendors : [];
  const mapped = list.map(mapVendorRawToVendor).filter((v: Vendor) => v.name.trim());
  return mapped;
};

const DocumentUploadField = ({
  label,
  file,
  onFileChange,
  required = false,
  hint,
}: {
  label: string;
  file?: string;
  onFileChange: (file?: string) => void;
  required?: boolean;
  hint?: string;
}) => (
  <label className="block rounded-xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-emerald-200 hover:bg-emerald-50/30">
    <span className="flex items-center justify-between gap-3">
      <span className="text-sm font-black text-slate-800">{label}{required && <span className="ml-1 text-red-500">*</span>}</span>
      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${file ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{file ? 'Selected' : required ? 'Required' : 'Optional'}</span>
    </span>
    {hint && <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{hint}</span>}
    <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(event) => onFileChange(event.target.files?.[0]?.name)} className="mt-3 block w-full text-xs font-semibold text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-[#0D3A35] file:px-3 file:py-2 file:font-bold file:text-white hover:file:bg-[#092b27]" />
    {file && <span className="mt-2 block truncate text-xs font-bold text-emerald-700">{file}</span>}
  </label>
);

const VendorDirectory = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [q, setQ] = useState('');
  const [type, setType] = useState<VendorType | 'All'>('All');
  const [open, setOpen] = useState(false);

  // create form
  const [name, setName] = useState('');
  const [vType, setVType] = useState<VendorType>('Other');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gst, setGst] = useState('');
  const [address, setAddress] = useState('');
  // step management
  const [step, setStep] = useState(1);

  // step 1 additional fields
  const [legalConstitution, setLegalConstitution] = useState<VendorConstitution>('Individual');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [dateOfIncorporation, setDateOfIncorporation] = useState('');
  const [principalPersonName, setPrincipalPersonName] = useState('');
  const [authorisedSignatoryName, setAuthorisedSignatoryName] = useState('');
  const [authorisedSignatoryDesignation, setAuthorisedSignatoryDesignation] = useState('');
  const [pan, setPan] = useState('');
  const [aadhar, setAadhar] = useState('');
  // primary address split fields (simple strings)
  const [addressPlot, setAddressPlot] = useState('');
  const [addressPremises, setAddressPremises] = useState('');
  const [addressRoad, setAddressRoad] = useState('');
  const [addressLocality, setAddressLocality] = useState('');
  const [addressDistrict, setAddressDistrict] = useState('');
  const [addressState, setAddressState] = useState('');
  const [addressPin, setAddressPin] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  // place of supply address fields
  const [supplyPlot, setSupplyPlot] = useState('');
  const [supplyPremises, setSupplyPremises] = useState('');
  const [supplyRoad, setSupplyRoad] = useState('');
  const [supplyLocality, setSupplyLocality] = useState('');
  const [supplyDistrict, setSupplyDistrict] = useState('');
  const [supplyState, setSupplyState] = useState('');
  const [supplyPin, setSupplyPin] = useState('');
  const [supplyContactNumber, setSupplyContactNumber] = useState('');
  const [supplyContactEmail, setSupplyContactEmail] = useState('');
  const [supplyGst, setSupplyGst] = useState('');

  // step 2 bank/contact details
  const [bankName, setBankName] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [ifsCode, setIfsCode] = useState('');
  const [accountType, setAccountType] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [salesName, setSalesName] = useState('');
  const [salesMobile, setSalesMobile] = useState('');
  const [salesEmail, setSalesEmail] = useState('');
  const [commercialName, setCommercialName] = useState('');
  const [commercialMobile, setCommercialMobile] = useState('');
  const [commercialEmail, setCommercialEmail] = useState('');
  const [masmeUdyamNo, setMasmeUdyamNo] = useState('');

  // step 3 documents (store file names)
  const [panFile, setPanFile] = useState<string | undefined>(undefined);
  const [aadharFile, setAadharFile] = useState<string | undefined>(undefined);
  const [gstFile, setGstFile] = useState<string | undefined>(undefined);
  const [cancelledChequeFile, setCancelledChequeFile] = useState<string | undefined>(undefined);
  const [udyamCertificateFile, setUdyamCertificateFile] = useState<string | undefined>(undefined);
  const [entityRegistrationFile, setEntityRegistrationFile] = useState<string | undefined>(undefined);
  const [constitutionDocumentFile, setConstitutionDocumentFile] = useState<string | undefined>(undefined);
  const [authorizationLetterFile, setAuthorizationLetterFile] = useState<string | undefined>(undefined);
  const [addressProofFile, setAddressProofFile] = useState<string | undefined>(undefined);

  // step 4 tags
  const availableTags = [
    'computer', 'electronics', 'agriculture equipments', 'IOT devices', 'seeds', 'fertilizer', 'chemicals', 'transport', 'services', 'machinery'
  ];
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsVendor, setDetailsVendor] = useState<Vendor | null>(null);
  const [detailsTab, setDetailsTab] = useState<'Overview' | 'Banking' | 'Contacts' | 'Documents'>('Overview');
  const [documentPreview, setDocumentPreview] = useState<VendorDocumentPreview | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const refreshVendors = async () => {
    try {
      const serverVendors = await fetchVendorsFromApi();
      setVendors(serverVendors);
    } catch (e: any) {
      const message = e?.message ? String(e.message) : 'Failed to fetch vendors';
      toast.error(`Failed to load vendors${message ? `: ${message}` : ''}`);
      setVendors((prev) => (prev.length ? prev : defaultVendors));
    }
  };

  useEffect(() => {
    void refreshVendors();
  }, []);

  const types = useMemo(() => {
    const set = new Set<VendorType>();
    vendors.forEach((v) => set.add(v.type));
    return Array.from(set);
  }, [vendors]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return vendors.filter((v) => {
      const matchesType = type === 'All' ? true : v.type === type;
      const matchesQuery = !query
        ? true
        : [v.name, v.phone, v.contactEmail, v.gst, v.address, v.type].some((x) => String(x ?? '').toLowerCase().includes(query));
      return matchesType && matchesQuery;
    });
  }, [vendors, q, type]);

  const resetForm = () => {
    setName('');
    setVType('Other');
    setPhone('');
    setEmail('');
    setGst('');
    setAddress('');
    setStep(1);
    setLegalConstitution('Individual');
    setRegistrationNumber('');
    setDateOfIncorporation('');
    setPrincipalPersonName('');
    setAuthorisedSignatoryName('');
    setAuthorisedSignatoryDesignation('');
    setPan('');
    setAadhar('');
    setAddressPlot('');
    setAddressPremises('');
    setAddressRoad('');
    setAddressLocality('');
    setAddressDistrict('');
    setAddressState('');
    setAddressPin('');
    setContactNumber('');
    setContactEmail('');
    setSupplyPlot('');
    setSupplyPremises('');
    setSupplyRoad('');
    setSupplyLocality('');
    setSupplyDistrict('');
    setSupplyState('');
    setSupplyPin('');
    setSupplyContactNumber('');
    setSupplyContactEmail('');
    setSupplyGst('');
    setBankName('');
    setBankBranch('');
    setIfsCode('');
    setAccountType('');
    setAccountNumber('');
    setSalesName('');
    setSalesMobile('');
    setSalesEmail('');
    setCommercialName('');
    setCommercialMobile('');
    setCommercialEmail('');
    setMasmeUdyamNo('');
    setPanFile(undefined);
    setAadharFile(undefined);
    setGstFile(undefined);
    setCancelledChequeFile(undefined);
    setUdyamCertificateFile(undefined);
    setEntityRegistrationFile(undefined);
    setConstitutionDocumentFile(undefined);
    setAuthorizationLetterFile(undefined);
    setAddressProofFile(undefined);
    setSelectedTags([]);
  };

  const addVendor = async () => {
    if (!name.trim()) return toast.error('Vendor name is required');
    if (!legalConstitution) return toast.error('Vendor legal type is required');
    if (!pan.trim()) return toast.error('Income Tax PAN is required');
    if (['Individual', 'Sole Proprietorship', 'HUF'].includes(legalConstitution) && !aadhar.trim()) {
      return toast.error(`Aadhaar number is required for ${legalConstitution} vendors`);
    }
    if (needsEntityRegistration && !registrationNumber.trim()) {
      return toast.error(`${registrationLabelFor(legalConstitution)} is required`);
    }
    if (legalConstitution !== 'Individual' && !principalPersonName.trim()) {
      return toast.error(`${principalPersonLabelFor(legalConstitution)} is required`);
    }
    if (needsAuthorisation && !authorisedSignatoryName.trim()) {
      return toast.error('Authorised signatory name is required');
    }
    const next: Vendor = {
      id: genId(),
      name: name.trim(),
      type: vType,
      legalConstitution,
      registrationNumber: registrationNumber.trim() || undefined,
      dateOfIncorporation: dateOfIncorporation || undefined,
      principalPersonName: principalPersonName.trim() || undefined,
      authorisedSignatoryName: authorisedSignatoryName.trim() || undefined,
      authorisedSignatoryDesignation: authorisedSignatoryDesignation.trim() || undefined,
      phone: phone.trim() || undefined,
      gst: gst.trim() || undefined,
      pan: pan.trim() || undefined,
      aadhar: aadhar.trim() || undefined,
      // combine address pieces for storage
      address: [addressPlot, addressPremises, addressRoad, addressLocality, addressDistrict, addressState, addressPin].filter(Boolean).join(', ') || address.trim() || undefined,
      placeOfSupplyAddress: [supplyPlot, supplyPremises, supplyRoad, supplyLocality, supplyDistrict, supplyState, supplyPin].filter(Boolean).join(', ') || undefined,
      contactNumber: contactNumber.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
      supplyContactNumber: supplyContactNumber.trim() || undefined,
      supplyContactEmail: supplyContactEmail.trim() || undefined,
      bankName: bankName.trim() || undefined,
      bankBranch: bankBranch.trim() || undefined,
      ifsCode: ifsCode.trim() || undefined,
      accountType: accountType.trim() || undefined,
      accountNumber: accountNumber.trim() || undefined,
      salesContactName: salesName.trim() || undefined,
      salesContactMobile: salesMobile.trim() || undefined,
      salesContactEmail: salesEmail.trim() || undefined,
      commercialContactName: commercialName.trim() || undefined,
      commercialContactMobile: commercialMobile.trim() || undefined,
      commercialContactEmail: commercialEmail.trim() || undefined,
      masmeUdyamNo: masmeUdyamNo.trim() || undefined,
      panFile: panFile,
      aadharFile: aadharFile,
      gstFile: gstFile,
      cancelledChequeFile: cancelledChequeFile,
      udyamCertificateFile: udyamCertificateFile,
      entityRegistrationFile,
      constitutionDocumentFile,
      authorizationLetterFile,
      addressProofFile,
      tags: selectedTags.length ? selectedTags : undefined,
    };
    if (editingId) {
      setVendors((p) => p.map((x) => x.id === editingId ? { ...x, ...next, id: editingId } : x));
      toast.success('Vendor updated');
      setEditingId(null);
    } else {
      const baseUrl = getApiBaseUrl();
      if (!baseUrl) return toast.error('API base URL is not set');

      const payload = {
        vendor_details: {
          nature_of_vendor: vType,
          legal_constitution: legalConstitution,
          vendor_entity_type: legalConstitution,
          registration_number: registrationNumber,
          date_of_incorporation: dateOfIncorporation,
          principal_person_name: principalPersonName,
          authorised_signatory_name: authorisedSignatoryName,
          authorised_signatory_designation: authorisedSignatoryDesignation,
          vendor_name: name,
          income_tax_pan: pan,
          gst_number: gst,
          aadhar_card_number: aadhar,
          vendor_contact: contactNumber || phone,
          e_mail_id: contactEmail,
          address: {
            plot_flat_unit_no_and_floor: addressPlot,
            name_of_premises: addressPremises,
            road: addressRoad,
            taluka_locality: addressLocality,
            district: addressDistrict,
            state: addressState,
            pin_code: addressPin,
          },
          address_for_place_of_supply_of_goods_services: {
            plot_flat_unit_no_and_floor: supplyPlot,
            name_of_premises: supplyPremises,
            road: supplyRoad,
            taluka_locality: supplyLocality,
            district: supplyDistrict,
            state: supplyState,
            pin_code: supplyPin,
            contact_number: supplyContactNumber,
            e_mail_id: supplyContactEmail,
            gst_number: supplyGst,
          },
          vendor_address: next.address ?? '',
        },
        bank_details: {
          name_of_bank: bankName,
          branch_address_with_pin_code: bankBranch,
          ifs_code: ifsCode,
          account_type: accountType,
          account_number: accountNumber,
          sales_service_contract_authorised_person: {
            name: salesName,
            mobile_number: salesMobile,
            e_mail_id: salesEmail,
          },
          commercial_authorised_person: {
            name: commercialName,
            mobile_number: commercialMobile,
            e_mail_id: commercialEmail,
          },
          masme_udyam_no: masmeUdyamNo,
        },
        document_url: {
          pan_card: panFile ?? '',
          aadhar_card: aadharFile ?? '',
          gst_registration_certificate: gstFile ?? '',
          cancelled_cheque_or_passbook_front_page: cancelledChequeFile ?? '',
          udyam_akansha_msme_certificate: udyamCertificateFile ?? '',
          entity_registration_certificate: entityRegistrationFile ?? '',
          constitution_document: constitutionDocumentFile ?? '',
          authorization_letter_or_board_resolution: authorizationLetterFile ?? '',
          registered_address_proof: addressProofFile ?? '',
        },
        tags: selectedTags,
      };

      setIsSaving(true);
      try {
        const res = await fetch(`${baseUrl}/purchase_flow/add_new_vendor`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          toast.error(`Failed to add vendor${errText ? `: ${errText}` : ''}`);
          return;
        }

        const data: any = await res.json().catch(() => null);
        const returnedId = data?.vendor_id ?? data?.id;
        const vendorToAdd = returnedId ? { ...next, id: String(returnedId) } : next;
        setVendors((p) => [vendorToAdd, ...p]);
        toast.success('Vendor added');
        void refreshVendors();
      } catch (e: any) {
        toast.error(`Failed to add vendor${e?.message ? `: ${e.message}` : ''}`);
        return;
      } finally {
        setIsSaving(false);
      }
    }
    setOpen(false);
    resetForm();
  };

  const openEdit = (v: Vendor) => {
    setEditingId(v.id);
    // populate form fields from vendor
    setName(v.name || '');
    setVType(v.type || 'Other');
    setLegalConstitution(v.legalConstitution || 'Other');
    setRegistrationNumber(v.registrationNumber || '');
    setDateOfIncorporation(v.dateOfIncorporation || '');
    setPrincipalPersonName(v.principalPersonName || '');
    setAuthorisedSignatoryName(v.authorisedSignatoryName || '');
    setAuthorisedSignatoryDesignation(v.authorisedSignatoryDesignation || '');
    setPhone(v.phone || '');
    setEmail(v.contactEmail || '');
    setGst(v.gst || '');
    setPan(v.pan || '');
    setAadhar(v.aadhar || '');
    setAddress(v.address || '');
    // try to split address into first piece for plot if possible
    if (v.address) {
      const parts = String(v.address).split(',');
      setAddressPlot(parts[0] || '');
    }
    setContactNumber(v.contactNumber || '');
    setContactEmail(v.contactEmail || '');
    setSupplyPlot(v.placeOfSupplyAddress || '');
    setSupplyContactNumber(v.supplyContactNumber || '');
    setSupplyContactEmail(v.supplyContactEmail || '');
    setBankName(v.bankName || '');
    setBankBranch(v.bankBranch || '');
    setIfsCode(v.ifsCode || '');
    setAccountType(v.accountType || '');
    setAccountNumber(v.accountNumber || '');
    setSalesName(v.salesContactName || '');
    setSalesMobile(v.salesContactMobile || '');
    setSalesEmail(v.salesContactEmail || '');
    setCommercialName(v.commercialContactName || '');
    setCommercialMobile(v.commercialContactMobile || '');
    setCommercialEmail(v.commercialContactEmail || '');
    setMasmeUdyamNo(v.masmeUdyamNo || '');
    setPanFile(v.panFile || undefined);
    setAadharFile(v.aadharFile || undefined);
    setGstFile(v.gstFile || undefined);
    setCancelledChequeFile(v.cancelledChequeFile || undefined);
    setUdyamCertificateFile(v.udyamCertificateFile || undefined);
    setEntityRegistrationFile(v.entityRegistrationFile || undefined);
    setConstitutionDocumentFile(v.constitutionDocumentFile || undefined);
    setAuthorizationLetterFile(v.authorizationLetterFile || undefined);
    setAddressProofFile(v.addressProofFile || undefined);
    setSelectedTags(v.tags || []);
    setStep(1);
    setOpen(true);
  };

  const openDetails = (v: Vendor) => {
    setDetailsVendor(v);
    setDetailsTab('Overview');
    setDetailsOpen(true);
  };

  const removeVendor = (id: string) => {
    setVendors((p) => p.filter((x) => x.id !== id));
    setDeleteConfirmId(null);
    toast.success('Vendor removed');
  };

  const isPersonalConstitution = ['Individual', 'Sole Proprietorship', 'HUF'].includes(legalConstitution);
  const needsEntityRegistration = !['Individual', 'HUF', 'Other'].includes(legalConstitution);
  const needsConstitutionDocument = [
    'Partnership Firm',
    'Limited Liability Partnership (LLP)',
    'Private Limited Company',
    'Public Limited Company',
    'Trust / Society',
    'Co-operative Society',
    'HUF',
  ].includes(legalConstitution);
  const needsAuthorisation = !['Individual', 'Sole Proprietorship', 'HUF'].includes(legalConstitution);

  return (
    <div className="min-h-screen space-y-8 bg-[#fbfcfd] p-4 text-slate-900 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm font-bold text-emerald-700">Purchase Operations</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Vendor Directory</h1>
          <p className="mt-3 text-base font-medium text-slate-600">Manage vendor profiles, statutory records, contacts, banking and documents</p>
        </div>
        <Button
          onClick={() => { resetForm(); setEditingId(null); setOpen(true); }}
          className="h-12 gap-3 rounded-lg bg-[#0D3A35] px-5 text-sm font-bold text-white shadow-sm hover:bg-[#092b27]"
        >
          <Plus className="h-5 w-5" /> New Vendor
        </Button>
      </header>

      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total Vendors', value: vendors.length, hint: 'Active vendor profiles', Icon: Building2, tone: 'bg-[#0D3A35]/10 text-[#0D3A35]' },
          { label: 'GST Registered', value: vendors.filter((vendor) => vendor.gst).length, hint: 'GST details recorded', Icon: ShieldCheck, tone: 'bg-blue-50 text-blue-700' },
          { label: 'MSME Registered', value: vendors.filter((vendor) => vendor.masmeUdyamNo).length, hint: 'Udyam number recorded', Icon: FileCheck2, tone: 'bg-emerald-50 text-emerald-700' },
          { label: 'Vendor Types', value: types.length, hint: 'Supply and service groups', Icon: Tags, tone: 'bg-amber-50 text-amber-700' },
        ].map(({ label, value, hint, Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-sm font-bold text-slate-500">{label}</p><p className="mt-3 text-3xl font-bold text-slate-950">{value}</p><p className="mt-2 text-xs font-semibold text-slate-400">{hint}</p></div>
              <span className={`flex h-11 w-11 items-center justify-center rounded-full ${tone}`}><Icon className="h-5 w-5" /></span>
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-lg">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="h-12 rounded-lg border-slate-200 bg-white pl-11 pr-4 font-semibold shadow-sm focus-visible:ring-emerald-100" placeholder="Search by name, ID, GST, contact or address" value={q} onChange={(event) => setQ(event.target.value)} />
        </div>
        <select
          value={type}
          onChange={(event) => setType(event.target.value as VendorType | 'All')}
          className="h-12 min-w-[220px] rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 shadow-sm outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
        >
          <option value="All">All Vendor Types</option>
          {types.map((vendorType) => <option key={vendorType} value={vendorType}>{vendorType}</option>)}
        </select>
      </section>

      {filtered.length > 0 ? (
        <section className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] items-start gap-7">
          {filtered.map((vendor) => {
            const initials = vendor.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'V';
            return (
              <article key={vendor.id} className="group relative flex min-h-[500px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white px-6 py-6 shadow-[0_14px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_52px_rgba(15,23,42,0.10)]">
                <div className="pointer-events-none absolute right-0 top-20 h-24 w-48 opacity-50"><div className="h-full w-full rounded-[100%] border-t border-emerald-100" /><div className="-mt-20 ml-8 h-full w-full rounded-[100%] border-t border-emerald-100" /><div className="-mt-20 ml-16 h-full w-full rounded-[100%] border-t border-emerald-100" /></div>
                <div className="relative flex min-h-[150px] items-start gap-5">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-3xl font-semibold text-emerald-700 ring-2 ring-slate-100">{initials}</div>
                  <div className="min-w-0 flex-1 pt-3">
                    <h2 className="line-clamp-2 text-lg font-bold text-slate-950">{vendor.name}</h2>
                    <p className="mt-2 font-mono text-sm font-bold text-emerald-700">{vendor.id}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-600">{vendor.type}</p>
                    <p className="mt-1 truncate text-xs font-bold text-slate-400">{vendor.legalConstitution || 'Legal type not recorded'}</p>
                  </div>
                  <span className="rounded-full bg-[#0D3A35] px-3 py-1 text-xs font-bold text-white">Active</span>
                </div>

                <div className="relative mt-4 min-h-[105px] space-y-4 text-sm font-semibold text-slate-600">
                  <div className="flex items-center gap-4"><Phone className="h-4 w-4 shrink-0 text-slate-400" /><span className="truncate">{vendor.contactNumber || vendor.phone || 'Not Recorded'}</span></div>
                  <div className="flex items-center gap-4"><Mail className="h-4 w-4 shrink-0 text-slate-400" /><span className="truncate">{vendor.contactEmail || 'Not Recorded'}</span></div>
                  <div className="flex items-start gap-4"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><span className="line-clamp-2">{vendor.address || 'Address not recorded'}</span></div>
                </div>

                <div className="relative mt-5 grid grid-cols-2 gap-x-5 gap-y-5 border-t border-slate-200 pt-5">
                  {[
                    ['GST Number', vendor.gst || 'Not Recorded', ShieldCheck],
                    ['PAN Number', vendor.pan || 'Not Recorded', FileText],
                    ['Bank', vendor.bankName || 'Not Recorded', Landmark],
                    ['MSME / Udyam', vendor.masmeUdyamNo || 'Not Recorded', FileCheck2],
                  ].map(([label, value, Icon]) => {
                    const DetailIcon = Icon as typeof FileText;
                    return <div key={String(label)} className="flex min-w-0 gap-3"><DetailIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><div className="min-w-0"><p className="text-xs font-bold text-slate-500">{label as string}</p><p className="mt-1 truncate text-sm font-bold text-slate-700">{value as string}</p></div></div>;
                  })}
                </div>

                <div className="relative mt-auto flex items-center gap-2 pt-6">
                  <button type="button" onClick={() => openDetails(vendor)} className="relative flex h-11 flex-1 items-center justify-center rounded-lg bg-[#0D3A35] text-sm font-bold text-white transition hover:bg-[#092b27]">View Profile<ArrowRight className="absolute right-4 h-4 w-4" /></button>
                  <button type="button" onClick={() => openEdit(vendor)} title="Edit vendor" className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-[#0D3A35] transition hover:bg-[#0D3A35]/5"><Edit2 className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setDeleteConfirmId(vendor.id)} title="Delete vendor" className="flex h-11 w-11 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-center text-slate-400"><Building2 className="h-10 w-10 opacity-40" /><p className="mt-4 text-sm font-semibold">No vendors found.</p></div>
      )}

      <div className="flex items-center justify-between pb-2"><p className="text-sm font-semibold text-slate-500">Showing {filtered.length} of {vendors.length} vendors</p><span className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-bold text-slate-600 shadow-sm">{filtered.length.toString().padStart(2, '0')} Vendors</span></div>

        <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); resetForm(); } }}>
          <DialogContent className="max-h-[92vh] max-w-4xl overflow-hidden rounded-2xl border-0 bg-[#f6f8fa] p-0 shadow-2xl">
            <DialogHeader className="bg-[#0D3A35] px-6 py-5 text-left">
              <DialogTitle className="flex items-center gap-3 text-xl font-bold text-white"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"><Building2 className="h-5 w-5" /></span>{editingId ? 'Edit Vendor Profile' : 'Create Vendor Profile'}</DialogTitle>
              <DialogDescription className="pl-[52px] text-sm font-medium text-white/70">Record statutory, banking, contact and document information.</DialogDescription>
            </DialogHeader>

            <div className="max-h-[calc(92vh-166px)] overflow-y-auto px-6 py-5">
              <div className="mb-5 grid grid-cols-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {['Entity & Address', 'Banking & Contacts', 'Documents', 'Classification'].map((label, index) => (
                  <button key={label} type="button" onClick={() => setStep(index + 1)} className={`flex min-h-14 items-center justify-center gap-2 border-r border-slate-200 px-3 text-center text-xs font-bold last:border-r-0 ${step === index + 1 ? 'bg-[#0D3A35] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${step === index + 1 ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>{index + 1}</span>{label}
                  </button>
                ))}
              </div>

              {step === 1 && (
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                    <label className="text-xs font-black uppercase tracking-wider text-[#0D3A35]">Vendor Legal Type *</label>
                    <select
                      value={legalConstitution}
                      onChange={(event) => setLegalConstitution(event.target.value as VendorConstitution)}
                      className="mt-2 h-11 w-full rounded-lg border border-emerald-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                    >
                      {VENDOR_CONSTITUTIONS.map((constitution) => <option key={constitution} value={constitution}>{constitution}</option>)}
                    </select>
                    <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">Information and document requirements below are adjusted for the selected legal constitution.</p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-xs font-bold text-slate-500">{legalConstitution === 'Individual' ? 'Individual / Vendor Name' : 'Registered Vendor Name'} *</label>
                      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={legalConstitution === 'Individual' ? 'Full legal name' : 'Name as per registration certificate'} className="mt-1" />
                    </div>
                    {legalConstitution !== 'Individual' && (
                      <div>
                        <label className="text-xs font-bold text-slate-500">{principalPersonLabelFor(legalConstitution)} *</label>
                        <Input value={principalPersonName} onChange={(e) => setPrincipalPersonName(e.target.value)} placeholder={principalPersonLabelFor(legalConstitution)} className="mt-1" />
                      </div>
                    )}
                    {needsEntityRegistration && (
                      <div>
                        <label className="text-xs font-bold text-slate-500">{registrationLabelFor(legalConstitution)} *</label>
                        <Input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value.toUpperCase())} placeholder={registrationLabelFor(legalConstitution)} className="mt-1" />
                      </div>
                    )}
                    {legalConstitution !== 'Individual' && legalConstitution !== 'HUF' && (
                      <div>
                        <label className="text-xs font-bold text-slate-500">Date of Incorporation / Registration</label>
                        <Input type="date" value={dateOfIncorporation} onChange={(e) => setDateOfIncorporation(e.target.value)} className="mt-1" />
                      </div>
                    )}
                    {needsAuthorisation && (
                      <>
                        <div>
                          <label className="text-xs font-bold text-slate-500">Authorised Signatory Name *</label>
                          <Input value={authorisedSignatoryName} onChange={(e) => setAuthorisedSignatoryName(e.target.value)} placeholder="Full name" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-500">Authorised Signatory Designation</label>
                          <Input value={authorisedSignatoryDesignation} onChange={(e) => setAuthorisedSignatoryDesignation(e.target.value)} placeholder="Designation" className="mt-1" />
                        </div>
                      </>
                    )}
                    <div>
                      <label className="text-xs font-bold text-slate-500">Income Tax PAN *</label>
                      <Input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="PAN as per legal entity" className="mt-1" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500">GST Number</label>
                      <Input value={gst} onChange={(e) => setGst(e.target.value.toUpperCase())} placeholder="GSTIN, where applicable" className="mt-1" />
                    </div>
                    {isPersonalConstitution && (
                      <div>
                        <label className="text-xs font-bold text-slate-500">Aadhaar Card Number *</label>
                        <Input value={aadhar} onChange={(e) => setAadhar(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="12-digit Aadhaar number" className="mt-1" />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-500">Address (Primary)</label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={addressPlot} onChange={(e) => setAddressPlot(e.target.value)} placeholder="Plot/Flat/Unit No. & Floor" />
                      <Input value={addressPremises} onChange={(e) => setAddressPremises(e.target.value)} placeholder="Name of the Premises" />
                      <Input value={addressRoad} onChange={(e) => setAddressRoad(e.target.value)} placeholder="Road" />
                      <Input value={addressLocality} onChange={(e) => setAddressLocality(e.target.value)} placeholder="Taluka / Locality" />
                      <Input value={addressDistrict} onChange={(e) => setAddressDistrict(e.target.value)} placeholder="District" />
                      <Input value={addressState} onChange={(e) => setAddressState(e.target.value)} placeholder="State" />
                      <Input value={addressPin} onChange={(e) => setAddressPin(e.target.value)} placeholder="Pin Code" />
                      <Input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} placeholder="Contact Number" />
                      <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="e-mail ID" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-500">Address for Place of Supply of Goods & Services</label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={supplyPlot} onChange={(e) => setSupplyPlot(e.target.value)} placeholder="Plot/Flat/Unit No. & Floor" />
                      <Input value={supplyPremises} onChange={(e) => setSupplyPremises(e.target.value)} placeholder="Name of the Premises" />
                      <Input value={supplyRoad} onChange={(e) => setSupplyRoad(e.target.value)} placeholder="Road" />
                      <Input value={supplyLocality} onChange={(e) => setSupplyLocality(e.target.value)} placeholder="Taluka / Locality" />
                      <Input value={supplyDistrict} onChange={(e) => setSupplyDistrict(e.target.value)} placeholder="District" />
                      <Input value={supplyState} onChange={(e) => setSupplyState(e.target.value)} placeholder="State" />
                      <Input value={supplyPin} onChange={(e) => setSupplyPin(e.target.value)} placeholder="Pin Code" />
                      <Input value={supplyContactNumber} onChange={(e) => setSupplyContactNumber(e.target.value)} placeholder="Contact Number" />
                      <Input value={supplyContactEmail} onChange={(e) => setSupplyContactEmail(e.target.value)} placeholder="e-mail ID" />
                      <Input value={supplyGst} onChange={(e) => setSupplyGst(e.target.value)} placeholder="GST Number" />
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div>
                    <label className="text-xs font-medium text-gray-500">Bankers Details (RTGS)</label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Name of the Bank" />
                      <Input value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} placeholder="Branch Address (With PIN Code)" />
                      <Input value={ifsCode} onChange={(e) => setIfsCode(e.target.value)} placeholder="IFS Code" />
                      <Input value={accountType} onChange={(e) => setAccountType(e.target.value)} placeholder="Account Type" />
                      <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Account Number" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-500">Details of the Sales/Service/Contract Authorised Person</label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={salesName} onChange={(e) => setSalesName(e.target.value)} placeholder="Name" />
                      <Input value={salesMobile} onChange={(e) => setSalesMobile(e.target.value)} placeholder="Mobile Number" />
                      <Input value={salesEmail} onChange={(e) => setSalesEmail(e.target.value)} placeholder="e-mail ID" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-500">Details of the Commercial Authorised Person</label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={commercialName} onChange={(e) => setCommercialName(e.target.value)} placeholder="Name" />
                      <Input value={commercialMobile} onChange={(e) => setCommercialMobile(e.target.value)} placeholder="Mobile Number" />
                      <Input value={commercialEmail} onChange={(e) => setCommercialEmail(e.target.value)} placeholder="e-mail ID" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-500">MASME - Udyam No.</label>
                    <Input value={masmeUdyamNo} onChange={(e) => setMasmeUdyamNo(e.target.value)} />
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-black text-[#0D3A35]">Documents for {legalConstitution}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">Only documents relevant to the selected vendor legal type are listed.</p>
                    </div>
                    <button type="button" onClick={() => setStep(1)} className="text-xs font-black text-emerald-700 hover:underline">Change Vendor Type</button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <DocumentUploadField label="PAN Card" file={panFile} onFileChange={setPanFile} required hint="PAN must match the registered vendor or individual name." />
                    {isPersonalConstitution && <DocumentUploadField label="Aadhaar Card" file={aadharFile} onFileChange={setAadharFile} required hint={`Identity proof for the ${legalConstitution === 'HUF' ? 'Karta' : legalConstitution === 'Sole Proprietorship' ? 'proprietor' : 'individual'}.`} />}
                    {needsEntityRegistration && <DocumentUploadField label={entityDocumentLabelFor(legalConstitution)} file={entityRegistrationFile} onFileChange={setEntityRegistrationFile} required />}
                    {needsConstitutionDocument && <DocumentUploadField label={constitutionDocumentLabelFor(legalConstitution)} file={constitutionDocumentFile} onFileChange={setConstitutionDocumentFile} required />}
                    {needsAuthorisation && <DocumentUploadField label="Authorisation Letter / Board Resolution" file={authorizationLetterFile} onFileChange={setAuthorizationLetterFile} required hint="Must authorise the person signing and transacting with the company." />}
                    <DocumentUploadField label="GST Registration Certificate" file={gstFile} onFileChange={setGstFile} required={Boolean(gst.trim())} hint="Required when a GSTIN is entered." />
                    <DocumentUploadField label="Registered Address Proof" file={addressProofFile} onFileChange={setAddressProofFile} required />
                    <DocumentUploadField label="Cancelled Cheque / Passbook Front Page" file={cancelledChequeFile} onFileChange={setCancelledChequeFile} required hint="Bank account holder name should match the vendor record." />
                    <DocumentUploadField label="Udyam / MSME Certificate" file={udyamCertificateFile} onFileChange={setUdyamCertificateFile} hint="Upload where the vendor is MSME registered." />
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div>
                    <label className="text-xs font-black uppercase tracking-wider text-slate-500">Vendor Supply / Service Category *</label>
                    <select value={vType} onChange={(event) => setVType(event.target.value as VendorType)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100">
                      {VENDOR_TYPES.map((vendorType) => <option key={vendorType} value={vendorType}>{vendorType}</option>)}
                    </select>
                    <p className="mt-2 text-xs font-semibold text-slate-500">This operational category is separate from the legal vendor type selected in Step 1.</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">Add Tags</label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {availableTags.map((t) => {
                        const selected = selectedTags.includes(t);
                        return (
                          <button key={t} type="button" onClick={() => {
                            setSelectedTags((s) => selected ? s.filter(x => x !== t) : [...s, t]);
                          }} className={`rounded-full px-3 py-1.5 text-sm font-bold ${selected ? 'bg-[#0D3A35] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4">
              <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }} className="h-10 rounded-xl border-slate-200 px-5 font-bold">Cancel</Button>
              <div className="flex items-center gap-2">
                {step > 1 && <Button variant="outline" onClick={() => setStep((s) => s - 1)} className="h-10 rounded-xl border-slate-200 px-5 font-bold">Back</Button>}
                {step < 4 && <Button className="h-10 rounded-xl bg-[#0D3A35] px-6 font-bold text-white hover:bg-[#092b27]" onClick={() => setStep((s) => Math.min(4, s + 1))}>Save &amp; Continue</Button>}
                {step === 4 && (
                  <Button
                    className="h-10 rounded-xl bg-[#0D3A35] px-6 font-bold text-white hover:bg-[#092b27]"
                    onClick={addVendor}
                    disabled={isSaving}
                  >
                    {editingId ? 'Update Vendor' : (isSaving ? 'Saving…' : 'Create Vendor')}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </DialogContent>
      </Dialog>

        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-h-[92vh] max-w-[min(96vw,1120px)] overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-2xl">
            {detailsVendor ? (
              <div className="grid max-h-[92vh] min-h-[650px] lg:grid-cols-[290px_minmax(0,1fr)]">
                <aside className="relative overflow-hidden bg-[#0D3A35] px-6 py-8 text-white">
                  <div className="pointer-events-none absolute -right-24 top-20 h-64 w-64 rounded-full border border-white/10" />
                  <div className="pointer-events-none absolute -right-16 top-32 h-64 w-64 rounded-full border border-white/10" />
                  <div className="relative flex h-full flex-col">
                    <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white/15 bg-white/10 text-3xl font-black">
                      {detailsVendor.name.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase() || 'V'}
                    </div>
                    <h2 className="mt-5 text-2xl font-black leading-tight">{detailsVendor.name}</h2>
                    <p className="mt-1 text-sm font-semibold text-white/65">{detailsVendor.id}</p>
                    <span className="mt-4 w-fit rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-bold text-emerald-100">
                      Active · {detailsVendor.type}
                    </span>
                    <p className="mt-3 text-xs font-bold leading-5 text-white/55">{detailsVendor.legalConstitution || 'Legal constitution not recorded'}</p>

                    <div className="mt-7 space-y-4 border-t border-white/10 pt-6 text-sm">
                      <div className="flex items-start gap-3">
                        <Phone className="mt-0.5 h-4 w-4 shrink-0 text-white/55" />
                        <span className="break-all font-semibold text-white/85">{detailsVendor.contactNumber || detailsVendor.phone || 'Not Recorded'}</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-white/55" />
                        <span className="break-all font-semibold text-white/85">{detailsVendor.contactEmail || 'Not Recorded'}</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/55" />
                        <span className="leading-relaxed text-white/75">{detailsVendor.address || 'Address not recorded'}</span>
                      </div>
                    </div>

                    {(detailsVendor.tags || []).length > 0 && (
                      <div className="mt-7 border-t border-white/10 pt-5">
                        <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/45">Vendor Tags</p>
                        <div className="flex flex-wrap gap-2">
                          {(detailsVendor.tags || []).map((tag) => (
                            <span key={tag} className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-white/80">{tag}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    <Button
                      type="button"
                      className="mt-auto h-11 rounded-xl bg-white font-black text-[#0D3A35] hover:bg-emerald-50"
                      onClick={() => {
                        setDetailsOpen(false);
                        openEdit(detailsVendor);
                      }}
                    >
                      <Edit2 className="mr-2 h-4 w-4" /> Edit Vendor
                    </Button>
                  </div>
                </aside>

                <section className="min-w-0 overflow-y-auto bg-[#fbfcfd]">
                  <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 pt-6">
                    <DialogHeader className="pr-10 text-left">
                      <DialogTitle className="text-2xl font-black text-slate-900">Vendor Profile</DialogTitle>
                      <DialogDescription className="text-sm text-slate-500">Complete statutory, banking, contact and document information.</DialogDescription>
                    </DialogHeader>
                    <div className="mt-5 flex gap-1 overflow-x-auto">
                      {([
                        ['Overview', UserRound],
                        ['Banking', Landmark],
                        ['Contacts', ContactRound],
                        ['Documents', FileText],
                      ] as const).map(([tab, Icon]) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setDetailsTab(tab)}
                          className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-black transition-colors ${detailsTab === tab ? 'border-[#0D3A35] text-[#0D3A35]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                        >
                          <Icon className="h-4 w-4" /> {tab}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-5 p-6">
                    {detailsTab === 'Overview' && (
                      <>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                          {[
                            ['Vendor ID', detailsVendor.id],
                            ['Legal Vendor Type', detailsVendor.legalConstitution || 'Not Recorded'],
                            ['Supply / Service Category', detailsVendor.type],
                            ['Registration Number', detailsVendor.registrationNumber || 'Not Recorded'],
                            ['Date of Incorporation', formatRecordDate(detailsVendor.dateOfIncorporation)],
                            [detailsVendor.legalConstitution ? principalPersonLabelFor(detailsVendor.legalConstitution) : 'Principal Person', detailsVendor.principalPersonName || 'Not Recorded'],
                            ['Authorised Signatory', detailsVendor.authorisedSignatoryName ? `${detailsVendor.authorisedSignatoryName}${detailsVendor.authorisedSignatoryDesignation ? ` · ${detailsVendor.authorisedSignatoryDesignation}` : ''}` : 'Not Recorded'],
                            ['GST Number', detailsVendor.gst || 'Not Recorded'],
                            ['PAN Number', detailsVendor.pan || 'Not Recorded'],
                            ['Aadhaar Number', detailsVendor.aadhar || 'Not Recorded'],
                            ['MSME / Udyam No.', detailsVendor.masmeUdyamNo || 'Not Recorded'],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
                              <p className="mt-2 break-words text-sm font-extrabold text-slate-800">{value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                          <div className="border-b border-slate-200 px-5 py-4">
                            <h3 className="flex items-center gap-2 font-black text-slate-900"><MapPin className="h-4 w-4 text-[#0D3A35]" /> Address Details</h3>
                          </div>
                          <div className="grid gap-5 p-5 md:grid-cols-2">
                            <div>
                              <p className="text-xs font-black uppercase tracking-wider text-slate-400">Registered Address</p>
                              <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">{detailsVendor.address || 'Not Recorded'}</p>
                            </div>
                            <div>
                              <p className="text-xs font-black uppercase tracking-wider text-slate-400">Place of Supply</p>
                              <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">{detailsVendor.placeOfSupplyAddress || 'Same as registered address / Not Recorded'}</p>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {detailsTab === 'Banking' && (
                      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-[#0D3A35]"><CreditCard className="h-5 w-5" /></span>
                          <div><h3 className="font-black text-slate-900">Settlement Bank Account</h3><p className="text-xs text-slate-500">Account registered for vendor payments.</p></div>
                        </div>
                        <div className="grid sm:grid-cols-2">
                          {[
                            ['Bank Name', detailsVendor.bankName || 'Not Recorded'],
                            ['Branch', detailsVendor.bankBranch || 'Not Recorded'],
                            ['IFSC Code', detailsVendor.ifsCode || 'Not Recorded'],
                            ['Account Type', detailsVendor.accountType || 'Not Recorded'],
                            ['Account Number', detailsVendor.accountNumber || 'Not Recorded'],
                          ].map(([label, value], index) => (
                            <div key={label} className={`border-slate-200 p-5 ${index < 4 ? 'border-b' : ''} ${index % 2 === 0 ? 'sm:border-r' : ''}`}>
                              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                              <p className="mt-2 break-words font-extrabold text-slate-800">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {detailsTab === 'Contacts' && (
                      <div className="grid gap-4 md:grid-cols-2">
                        {[
                          ['Primary Contact', detailsVendor.name, detailsVendor.contactNumber || detailsVendor.phone, detailsVendor.contactEmail],
                          ['Sales / Service Contact', detailsVendor.salesContactName, detailsVendor.salesContactMobile, detailsVendor.salesContactEmail],
                          ['Commercial Contact', detailsVendor.commercialContactName, detailsVendor.commercialContactMobile, detailsVendor.commercialContactEmail],
                          ['Supply Location Contact', undefined, detailsVendor.supplyContactNumber, detailsVendor.supplyContactEmail],
                        ].map(([title, contactName, mobile, contactMail]) => (
                          <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="mb-4 flex items-center gap-3">
                              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-[#0D3A35]"><UserRound className="h-5 w-5" /></span>
                              <h3 className="font-black text-slate-900">{title}</h3>
                            </div>
                            <p className="font-extrabold text-slate-800">{contactName || 'Name Not Recorded'}</p>
                            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-600"><Phone className="h-4 w-4 text-slate-400" />{mobile || 'Not Recorded'}</p>
                            <p className="mt-2 flex items-start gap-2 break-all text-sm font-semibold text-slate-600"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{contactMail || 'Not Recorded'}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {detailsTab === 'Documents' && (
                      <div className="grid gap-4 md:grid-cols-2">
                        {[
                          ['PAN Card', detailsVendor.panFile],
                          ['Aadhaar Card', detailsVendor.aadharFile],
                          ['GST Registration Certificate', detailsVendor.gstFile],
                          ['Cancelled Cheque / Passbook', detailsVendor.cancelledChequeFile],
                          ['MSME / Udyam Certificate', detailsVendor.udyamCertificateFile],
                          [detailsVendor.legalConstitution ? entityDocumentLabelFor(detailsVendor.legalConstitution) : 'Entity Registration Certificate', detailsVendor.entityRegistrationFile],
                          [detailsVendor.legalConstitution ? constitutionDocumentLabelFor(detailsVendor.legalConstitution) : 'Constitution Document', detailsVendor.constitutionDocumentFile],
                          ['Authorisation Letter / Board Resolution', detailsVendor.authorizationLetterFile],
                          ['Registered Address Proof', detailsVendor.addressProofFile],
                        ].map(([documentName, fileName]) => {
                          const canRenderFile = Boolean(fileName && isViewableDocumentUrl(fileName));
                          return (
                            <button
                              key={documentName}
                              type="button"
                              disabled={!fileName}
                              onClick={() => fileName && setDocumentPreview({ name: documentName, file: fileName })}
                              className="group min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition enabled:hover:-translate-y-0.5 enabled:hover:border-[#0D3A35]/30 enabled:hover:shadow-md disabled:cursor-default"
                            >
                              <div className="relative flex h-40 items-center justify-center overflow-hidden border-b border-slate-200 bg-slate-50">
                                {fileName && canRenderFile && isImageDocument(fileName) ? (
                                  <img src={fileName} alt={`${documentName} preview`} className="h-full w-full object-contain p-3" />
                                ) : fileName ? (
                                  <div className="relative flex h-28 w-24 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm">
                                    <span className="absolute right-0 top-0 h-5 w-5 rounded-bl-md border-b border-l border-slate-200 bg-slate-50" />
                                    {isImageDocument(fileName) ? <FileImage className="h-8 w-8 text-[#0D3A35]" /> : <FileText className="h-8 w-8 text-[#0D3A35]" />}
                                    <span className="mt-2 text-[10px] font-black uppercase tracking-wider text-slate-500">{isPdfDocument(fileName) ? 'PDF' : isImageDocument(fileName) ? 'Image' : 'Document'}</span>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center text-slate-400">
                                    <FileText className="h-9 w-9" />
                                    <span className="mt-2 text-xs font-bold">No preview available</span>
                                  </div>
                                )}
                                {fileName && (
                                  <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[#0D3A35] shadow-sm transition group-hover:bg-[#0D3A35] group-hover:text-white">
                                    <Eye className="h-4 w-4" />
                                  </span>
                                )}
                              </div>
                              <div className="flex min-w-0 items-center gap-3 p-4">
                                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${fileName ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                  {fileName ? <CheckCircle2 className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-black text-slate-900">{documentName}</p>
                                  <p className={`mt-1 truncate text-xs font-bold ${fileName ? 'text-emerald-700' : 'text-slate-400'}`}>{fileName || 'Not Uploaded'}</p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ) : (
              <div className="p-8 text-center font-semibold text-slate-500">Vendor details are unavailable.</div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(documentPreview)} onOpenChange={(value) => { if (!value) setDocumentPreview(null); }}>
          <DialogContent className="max-h-[92vh] max-w-[min(94vw,900px)] overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-2xl">
            <DialogHeader className="bg-[#0D3A35] px-6 py-5 pr-12 text-left">
              <DialogTitle className="text-xl font-black text-white">{documentPreview?.name || 'Document Preview'}</DialogTitle>
              <DialogDescription className="truncate text-sm font-semibold text-white/65">{documentPreview?.file || 'No document uploaded'}</DialogDescription>
            </DialogHeader>
            <div className="flex min-h-[520px] items-center justify-center bg-slate-100 p-5">
              {documentPreview?.file && isViewableDocumentUrl(documentPreview.file) && isImageDocument(documentPreview.file) ? (
                <img src={documentPreview.file} alt={`${documentPreview.name} preview`} className="max-h-[66vh] max-w-full rounded-xl bg-white object-contain shadow-sm" />
              ) : documentPreview?.file && isViewableDocumentUrl(documentPreview.file) && isPdfDocument(documentPreview.file) ? (
                <iframe title={`${documentPreview.name} preview`} src={documentPreview.file} className="h-[66vh] w-full rounded-xl border border-slate-200 bg-white" />
              ) : (
                <div className="flex max-w-md flex-col items-center rounded-2xl border border-slate-200 bg-white px-10 py-12 text-center shadow-sm">
                  <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50 text-[#0D3A35]">
                    {isImageDocument(documentPreview?.file) ? <FileImage className="h-9 w-9" /> : <FileText className="h-9 w-9" />}
                  </span>
                  <h3 className="mt-5 text-lg font-black text-slate-900">{documentPreview?.name}</h3>
                  <p className="mt-2 break-all text-sm font-semibold text-slate-500">{documentPreview?.file}</p>
                  <p className="mt-4 text-xs leading-5 text-slate-400">The document reference is recorded, but the server has not provided a viewable file URL.</p>
                </div>
              )}
            </div>
            <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4">
              <Button variant="outline" onClick={() => setDocumentPreview(null)} className="h-10 rounded-xl border-slate-200 px-5 font-bold">Close</Button>
              {documentPreview?.file && isViewableDocumentUrl(documentPreview.file) && (
                <Button asChild className="h-10 rounded-xl bg-[#0D3A35] px-5 font-black text-white hover:bg-[#092b27]">
                  <a href={documentPreview.file} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Open Document</a>
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation dialog */}
        <Dialog open={!!deleteConfirmId} onOpenChange={(value) => { if (!value) setDeleteConfirmId(null); }}>
          <DialogContent className="overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-2xl sm:max-w-md">
            <DialogHeader className="bg-[#0D3A35] px-6 py-5 pr-12 text-left">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white"><Trash2 className="h-5 w-5" /></div>
              <DialogTitle className="text-xl font-black text-white">Delete Vendor</DialogTitle>
              <DialogDescription className="text-sm text-white/65">This action permanently removes the vendor from this directory.</DialogDescription>
            </DialogHeader>
            <div className="px-6 py-5">
              <p className="text-sm font-semibold leading-6 text-slate-600">Are you sure you want to delete this vendor?</p>
              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/60 p-4">
                <p className="font-black text-slate-900">{vendors.find((vendor) => vendor.id === deleteConfirmId)?.name ?? 'Selected vendor'}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">{vendors.find((vendor) => vendor.id === deleteConfirmId)?.id}</p>
              </div>
            </div>
            <DialogFooter className="gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)} className="h-10 rounded-xl border-slate-200 px-5 font-bold">Cancel</Button>
              <Button className="h-10 rounded-xl bg-red-600 px-5 font-black text-white hover:bg-red-700" onClick={() => deleteConfirmId && removeVendor(deleteConfirmId)}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete Vendor
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
};

export default VendorDirectory;
