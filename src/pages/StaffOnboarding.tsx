import { useEffect, useState } from 'react';
import { 
  Plus, Upload, Search, RefreshCw, Filter, Grid3X3, List,
  X, User, Mail, Phone, Calendar, 
  Briefcase, Building2, Users,
  Image as ImageIcon,
  IdCard,
  Landmark,
  IndianRupee,
  Hash,
  LayoutGrid,
  ShieldCheck, ChevronDown, MapPin, Droplet, Cake, ArrowRight, ChevronLeft, ChevronRight,
  UserCheck,
  WalletCards,
  Heart, Globe, Languages, Home
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/config';
import { toast } from 'sonner';
import CredentialsDialog, { type FarmerCredentials } from '@/components/farmers/CredentialsDialog';

// --- TYPES ---
interface VendorItem {
  vendor_id: string;
  vendor_name: string;
  vendor_contact: string;
  order_number: string;
}

interface StaffApiItem {
  staff_id: string;
  created_at: string;
  account_details: {
    bank_name: string;
    ifsc_code: string;
    account_number: string;
  };
  assigned_blocks: any[];
  assigned_vehicles: any[];
  staff_information: {
    staff_name: string;
    employment_type: Record<string, any> | string;
    staff_phone: string;
    staff_department: string;
    staff_designation: string;
    profile_image_url?: string;
    adhar_card_url?: string;
  };
  credentials?: FarmerCredentials | null;
}

type EditProfileDetails = {
  employeeScore: string;
  dob: string;
  age: string;
  gender: string;
  bloodGroup: string;
  fatherName: string;
  motherName: string;
  maritalStatus: string;
  religion: string;
  nationality: string;
  languagesKnown: string;
  presentAddress: string;
  permanentAddress: string;
  reportsToId: string;
  reportsToName: string;
  reportsToRole: string;
  aadhaarUrl: string;
  panUrl: string;
  offerLetterUrl: string;
  bankProofUrl: string;
  profileImageUrl: string;
};

const emptyEditProfileDetails: EditProfileDetails = {
  employeeScore: '',
  dob: '',
  age: '',
  gender: '',
  bloodGroup: '',
  fatherName: '',
  motherName: '',
  maritalStatus: '',
  religion: '',
  nationality: '',
  languagesKnown: '',
  presentAddress: '',
  permanentAddress: '',
  reportsToId: '',
  reportsToName: '',
  reportsToRole: '',
  aadhaarUrl: '',
  panUrl: '',
  offerLetterUrl: '',
  bankProofUrl: '',
  profileImageUrl: '',
};

const StaffOnboarding = () => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [staffList, setStaffList] = useState<StaffApiItem[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [activeProfileTab, setActiveProfileTab] = useState('Personal Details');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [joiningDate, setJoiningDate] = useState('2026-01-02');
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [employmentType, setEmploymentType] = useState<'Permanent' | 'Contract' | 'Consultant'>('Permanent');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [formStep, setFormStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [aadharImagePreview, setAadharImagePreview] = useState<string | null>(null);
  const [aadharImageFile, setAadharImageFile] = useState<File | null>(null);
  const [vendors, setVendors] = useState<VendorItem[]>([]);
  const [selectedVendorIndex, setSelectedVendorIndex] = useState<number | null>(null);
  const [isFetchingVendors, setIsFetchingVendors] = useState(false);
  const [credentialsDialogStaffId, setCredentialsDialogStaffId] = useState<string | null>(null);
  const [selectedProfileStaff, setSelectedProfileStaff] = useState<StaffApiItem | null>(null);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editProfileDetails, setEditProfileDetails] = useState<EditProfileDetails>(emptyEditProfileDetails);
  const [editProfileFiles, setEditProfileFiles] = useState<{
    profile?: File;
    aadhaar?: File;
    pan?: File;
    offer?: File;
    bankProof?: File;
  }>({});
  // Payroll config state
  const [payrollConfigs, setPayrollConfigs] = useState<Record<string, { baseSalary: number; deductions: number; additions: number }>>({});
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  const [payrollModalStaffId, setPayrollModalStaffId] = useState<string | null>(null);
  const [pBaseSalary, setPBaseSalary] = useState<number | ''>('');
  const [pDeductions, setPDeductions] = useState<number | ''>('');
  const [pAdditions, setPAdditions] = useState<number | ''>('');

  const resetForm = () => {
    setFormStep(1);
    setFullName('');
    setPhone('');
    setEmail('');
    setJoiningDate('2026-01-02');
    setDepartment('');
    setDesignation('');
    setEmploymentType('Permanent');
    setBankName('');
    setAccountNumber('');
    setIfscCode('');
    setProfileImagePreview(null);
    setProfileImageFile(null);
    setAadharImagePreview(null);
    setAadharImageFile(null);
    setVendors([]);
    setSelectedVendorIndex(null);
  };

  const handleBulkUpload = () => {
    toast.success("Bulk upload feature triggered");
  };

  const fetchActiveVendors = async () => {
    const BASE_URL = getBaseUrl().replace(/\/$/, '');
    try {
      setIsFetchingVendors(true);
      const res = await fetch(`${BASE_URL}/admin_cultivation/get_active_vendor`, {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || !data.success) { toast.error('Failed to fetch vendors'); return; }
      setVendors(data.vendors ?? []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to fetch vendors');
    } finally {
      setIsFetchingVendors(false);
    }
  };

  const handleEmploymentTypeChange = (type: 'Permanent' | 'Contract' | 'Consultant') => {
    setEmploymentType(type);
    setSelectedVendorIndex(null);
    if (type === 'Contract') {
      fetchActiveVendors();
    } else {
      setVendors([]);
    }
  };

  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileImagePreview(URL.createObjectURL(file));
    setProfileImageFile(file);
  };

  const handleAadharImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAadharImagePreview(URL.createObjectURL(file));
    setAadharImageFile(file);
  };

  const uploadImageToS3 = async (file: File, documentType: string): Promise<string> => {
    const BASE_URL = getBaseUrl().replace(/\/$/, '');
    const formData = new FormData();
    formData.append('image', file);
    formData.append('document_type', documentType);
    const res = await fetch(`${BASE_URL}/admin_staff/add_document_to_s3`, { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data?.message || 'Image upload failed');
    return data.image_url as string;
  };

  const fetchAllStaff = async () => {
    const BASE_URL = getBaseUrl().replace(/\/$/, '');
    try {
      setIsLoadingStaff(true);
      const res = await fetch(`${BASE_URL}/admin_staff/get_all_staff`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });
      const data = await res.json();

      if (!res.ok) {
        const message = data?.message || data?.error || 'Failed to fetch staff';
        toast.error(message);
        return;
      }

      if (!Array.isArray(data)) {
        toast.error('Invalid staff response');
        return;
      }

      setStaffList(data);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to fetch staff');
    } finally {
      setIsLoadingStaff(false);
    }
  };

  useEffect(() => {
    fetchAllStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const form = document.getElementById('add-staff-form') as HTMLFormElement | null;
    if (form && !form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const BASE_URL = getBaseUrl().replace(/\/$/, '');

    try {
      setIsSubmitting(true);

      const [profileImageUrl, aadharCardUrl] = await Promise.all([
        profileImageFile ? uploadImageToS3(profileImageFile, 'profile_picture') : Promise.resolve(''),
        aadharImageFile  ? uploadImageToS3(aadharImageFile,  'adhaar_card')      : Promise.resolve(''),
      ]);

      const payload = {
        staff_information: {
          staff_name: fullName.trim(),
          staff_phone: phone.trim(),
          staff_department: department,
          staff_designation: designation,
          employment_type: employmentType === 'Contract'
            ? {
                type: 'Contract',
                vendor: selectedVendorIndex !== null ? vendors[selectedVendorIndex].vendor_name : '',
                order_number: selectedVendorIndex !== null ? vendors[selectedVendorIndex].order_number : null,
              }
            : { type: employmentType, vendor: 'Sai Bioresources Pvt Ltd', order_number: null },
          profile_image_url: profileImageUrl,
          adhar_card_url: aadharCardUrl,
        },
        account_details: {
          bank_name: bankName.trim(),
          account_number: accountNumber.trim(),
          ifsc_code: ifscCode.trim().toUpperCase(),
        },
        assigned_vehicles: [],
        assigned_blocks: [],
      };
      const res = await fetch(`${BASE_URL}/admin_staff/add_staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // ignore non-JSON responses
      }

      if (!res.ok || (data?.status && data.status !== 'success')) {
        const message = data?.message || data?.error || 'Failed to add employee';
        toast.error(message);
        return;
      }

      toast.success('New employee added successfully');
      await fetchAllStaff();
      setIsAddModalOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add employee');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    setIsAddModalOpen(false);
    resetForm();
  };

  const handleNextStep = () => {
    const form = document.getElementById('add-staff-form') as HTMLFormElement | null;
    if (form && !form.checkValidity()) {
      form.reportValidity();
      return;
    }
    setFormStep(2);
  };

  const handleOpenModal = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const handleOpenEditProfile = (staff: StaffApiItem) => {
    const rawType = staff.staff_information?.employment_type;
    const nextType = typeof rawType === 'object' && rawType !== null
      ? (rawType as any).type ?? 'Permanent'
      : rawType ?? 'Permanent';

    setFullName(staff.staff_information?.staff_name ?? '');
    setPhone(staff.staff_information?.staff_phone ?? '');
    setEmail(getStaffField(staff, ['staff_email', 'email'], ''));
    setJoiningDate(getStaffField(staff, ['joining_date', 'join_date'], staff.created_at || '2026-01-02'));
    setDepartment(staff.staff_information?.staff_department ?? '');
    setDesignation(staff.staff_information?.staff_designation ?? '');
    const normalizedType = nextType === 'Temporary' ? 'Consultant' : nextType;
    setEmploymentType((['Permanent', 'Contract', 'Consultant'].includes(normalizedType) ? normalizedType : 'Permanent') as any);
    setBankName(staff.account_details?.bank_name ?? '');
    setAccountNumber(staff.account_details?.account_number ?? '');
    setIfscCode(staff.account_details?.ifsc_code ?? '');
    setEditProfileDetails({
      employeeScore: getStaffField(staff, ['employee_score', 'employeeScore', 'score'], ''),
      dob: getStaffField(staff, ['dob', 'date_of_birth', 'dateOfBirth'], ''),
      age: getStaffField(staff, ['age'], ''),
      gender: getStaffField(staff, ['gender'], ''),
      bloodGroup: getStaffField(staff, ['blood_group', 'bloodGroup'], ''),
      fatherName: getStaffField(staff, ['father_name', 'fatherName'], ''),
      motherName: getStaffField(staff, ['mother_name', 'motherName'], ''),
      maritalStatus: getStaffField(staff, ['marital_status', 'maritalStatus'], ''),
      religion: getStaffField(staff, ['religion'], ''),
      nationality: getStaffField(staff, ['nationality'], ''),
      languagesKnown: getStaffField(staff, ['languages_known', 'languagesKnown'], ''),
      presentAddress: getStaffField(staff, ['present_address', 'presentAddress'], ''),
      permanentAddress: getStaffField(staff, ['permanent_address', 'permanentAddress'], ''),
      reportsToId: getStaffField(staff, ['reports_to_id', 'reportsToId'], ''),
      reportsToName: getStaffField(staff, ['reports_to_name', 'reportsToName'], ''),
      reportsToRole: getStaffField(staff, ['reports_to_role', 'reportsToRole'], ''),
      aadhaarUrl: getStaffField(staff, ['adhar_card_url', 'aadhar_card_url', 'adhaar_card_url'], ''),
      panUrl: getStaffField(staff, ['pan_card_url'], ''),
      offerLetterUrl: getStaffField(staff, ['agreement_url', 'offer_letter_url', 'document_url'], ''),
      bankProofUrl: getStaffField(staff, ['bank_proof_url', 'bankProofUrl'], ''),
      profileImageUrl: staff.staff_information?.profile_image_url ?? '',
    });
    setEditProfileFiles({});
    setIsEditProfileOpen(true);
  };

  const handleSaveProfileEdit = async () => {
    if (!selectedProfileStaff) return;
    const [nextProfileUrl, nextAadhaarUrl, nextPanUrl, nextOfferUrl, nextBankProofUrl] = await Promise.all([
      editProfileFiles.profile ? uploadImageToS3(editProfileFiles.profile, 'profile_picture') : Promise.resolve(editProfileDetails.profileImageUrl.trim()),
      editProfileFiles.aadhaar ? uploadImageToS3(editProfileFiles.aadhaar, 'adhaar_card') : Promise.resolve(editProfileDetails.aadhaarUrl.trim()),
      editProfileFiles.pan ? uploadImageToS3(editProfileFiles.pan, 'pan_card') : Promise.resolve(editProfileDetails.panUrl.trim()),
      editProfileFiles.offer ? uploadImageToS3(editProfileFiles.offer, employmentType === 'Consultant' ? 'agreement' : 'offer_letter') : Promise.resolve(editProfileDetails.offerLetterUrl.trim()),
      editProfileFiles.bankProof ? uploadImageToS3(editProfileFiles.bankProof, 'bank_proof') : Promise.resolve(editProfileDetails.bankProofUrl.trim()),
    ]);

    const nextStaff: StaffApiItem = {
      ...selectedProfileStaff,
      account_details: {
        ...selectedProfileStaff.account_details,
        bank_name: bankName.trim(),
        account_number: accountNumber.trim(),
        ifsc_code: ifscCode.trim().toUpperCase(),
      },
      staff_information: {
        ...selectedProfileStaff.staff_information,
        staff_name: fullName.trim(),
        staff_phone: phone.trim(),
        staff_department: department,
        staff_designation: designation,
        employment_type: { type: employmentType, vendor: employmentType === 'Contract' ? 'Contract Vendor' : 'Sai Bioresources Pvt Ltd', order_number: null },
      },
    };
    (nextStaff.staff_information as any).staff_email = email.trim();
    (nextStaff.staff_information as any).joining_date = joiningDate;
    (nextStaff.staff_information as any).employee_score = editProfileDetails.employeeScore.trim();
    (nextStaff.staff_information as any).dob = editProfileDetails.dob.trim();
    (nextStaff.staff_information as any).age = editProfileDetails.age.trim();
    (nextStaff.staff_information as any).gender = editProfileDetails.gender.trim();
    (nextStaff.staff_information as any).blood_group = editProfileDetails.bloodGroup.trim();
    (nextStaff.staff_information as any).father_name = editProfileDetails.fatherName.trim();
    (nextStaff.staff_information as any).mother_name = editProfileDetails.motherName.trim();
    (nextStaff.staff_information as any).marital_status = editProfileDetails.maritalStatus.trim();
    (nextStaff.staff_information as any).religion = editProfileDetails.religion.trim();
    (nextStaff.staff_information as any).nationality = editProfileDetails.nationality.trim();
    (nextStaff.staff_information as any).languages_known = editProfileDetails.languagesKnown.trim();
    (nextStaff.staff_information as any).present_address = editProfileDetails.presentAddress.trim();
    (nextStaff.staff_information as any).permanent_address = editProfileDetails.permanentAddress.trim();
    (nextStaff.staff_information as any).reports_to_id = editProfileDetails.reportsToId.trim();
    (nextStaff.staff_information as any).reports_to_name = editProfileDetails.reportsToName.trim();
    (nextStaff.staff_information as any).reports_to_role = editProfileDetails.reportsToRole.trim();
    (nextStaff.staff_information as any).adhar_card_url = nextAadhaarUrl;
    (nextStaff.staff_information as any).pan_card_url = nextPanUrl;
    (nextStaff.staff_information as any).offer_letter_url = nextOfferUrl;
    (nextStaff.staff_information as any).agreement_url = employmentType === 'Consultant' ? nextOfferUrl : (selectedProfileStaff.staff_information as any)?.agreement_url;
    (nextStaff.staff_information as any).bank_proof_url = nextBankProofUrl;
    nextStaff.staff_information.profile_image_url = nextProfileUrl;

    setStaffList(prev => prev.map(staff => (staff.staff_id === nextStaff.staff_id ? nextStaff : staff)));
    setSelectedProfileStaff(nextStaff);
    setIsEditProfileOpen(false);
    setEditProfileFiles({});
    toast.success('Profile updated');
  };

  const filteredStaff = staffList.filter((staff) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const name = staff.staff_information?.staff_name?.toLowerCase() ?? '';
    const id = staff.staff_id?.toLowerCase() ?? '';
    const department = staff.staff_information?.staff_department?.toLowerCase() ?? '';
    const designation = staff.staff_information?.staff_designation?.toLowerCase() ?? '';
    const phone = staff.staff_information?.staff_phone?.toLowerCase() ?? '';
    return name.includes(q) || id.includes(q) || department.includes(q) || designation.includes(q) || phone.includes(q);
  });

  const getStaffType = (staff: StaffApiItem) => {
    const rawType = staff.staff_information?.employment_type;
    const type = typeof rawType === 'object' && rawType !== null
      ? (rawType as any).type ?? '-'
      : rawType ?? '-';
    return type === 'Temporary' ? 'Consultant' : type;
  };

  const formatTwoDigit = (value: number) => String(value).padStart(2, '0');

  const formatDisplayDate = (raw?: string) => {
    if (!raw) return '-';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getStaffField = (staff: StaffApiItem, keys: string[], fallback = '-') => {
    const staffAny = staff as any;
    const infoAny = staff.staff_information as any;
    for (const key of keys) {
      const value = infoAny?.[key] ?? staffAny?.[key];
      if (value !== undefined && value !== null && String(value).trim()) return String(value);
    }
    return fallback;
  };

  const isFieldStaff = (staff: StaffApiItem) => {
    const designation = staff.staff_information?.staff_designation?.toLowerCase() ?? '';
    const department = staff.staff_information?.staff_department?.toLowerCase() ?? '';
    const fieldRoles = ['field', 'driver', 'labour', 'labor', 'operator', 'supervisor', 'coordinator'];
    return fieldRoles.some(role => designation.includes(role) || department.includes(role));
  };

  const managementStaff = filteredStaff.filter(staff => !isFieldStaff(staff));
  const fieldStaff = filteredStaff.filter(isFieldStaff);

  const statCards = [
    {
      label: 'Total Employees',
      value: formatTwoDigit(staffList.length),
      hint: 'View all employees',
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      ring: 'ring-blue-100',
    },
    {
      label: 'Permanent',
      value: formatTwoDigit(staffList.filter(staff => getStaffType(staff) === 'Permanent').length),
      hint: 'Full-time employees',
      icon: Briefcase,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      ring: 'ring-emerald-100',
    },
    {
      label: 'Contract',
      value: formatTwoDigit(staffList.filter(staff => getStaffType(staff) === 'Contract').length),
      hint: 'Contractual employees',
      icon: WalletCards,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      ring: 'ring-orange-100',
    },
    {
      label: 'Departments',
      value: formatTwoDigit(new Set(staffList.map(staff => staff.staff_information?.staff_department).filter(Boolean)).size),
      hint: 'Active departments',
      icon: Building2,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      ring: 'ring-violet-100',
    },
    {
      label: 'Active',
      value: formatTwoDigit(staffList.length),
      hint: 'Currently working',
      icon: ShieldCheck,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      ring: 'ring-emerald-100',
    },
    {
      label: 'On Leave',
      value: '00',
      hint: 'Not in office',
      icon: UserCheck,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
      ring: 'ring-rose-100',
    },
  ];

  const renderStaffCard = (staff: StaffApiItem) => {
    const staffName = staff.staff_information?.staff_name ?? '-';
    const staffDesignation = staff.staff_information?.staff_designation ?? '-';
    const staffDepartment = staff.staff_information?.staff_department ?? '-';
    const staffPhone = staff.staff_information?.staff_phone ?? '-';
    const staffType = getStaffType(staff);
    const profileImage = staff.staff_information?.profile_image_url;
    const initials = staffName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase())
      .join('') || '?';
    const employeeCode = getStaffField(staff, ['employee_code', 'employeeCode'], staff.staff_id || '-');
    const staffEmail = getStaffField(staff, ['staff_email', 'email'], `${staffName.toLowerCase().replace(/\s+/g, '.')}@sbrpl.com`);
    const location = getStaffField(staff, ['location', 'address', 'staff_location'], 'Chhattisgarh');
    const joinDate = getStaffField(staff, ['joining_date', 'join_date'], staff.created_at);
    const bloodGroup = getStaffField(staff, ['blood_group', 'bloodGroup'], '-');
    const dob = getStaffField(staff, ['dob', 'date_of_birth', 'dateOfBirth'], '-');
    const age = getStaffField(staff, ['age'], '');
    const dobAge = dob === '-' ? '-' : `${formatDisplayDate(dob)}${age ? ` (${age})` : ''}`;

    return (
      <div
        key={staff.staff_id}
        className="group relative flex min-h-[530px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white px-6 py-6 shadow-[0_14px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_52px_rgba(15,23,42,0.10)]"
      >
        <div className="pointer-events-none absolute right-0 top-20 h-24 w-48 opacity-50">
          <div className="h-full w-full rounded-[100%] border-t border-emerald-100" />
          <div className="-mt-20 ml-8 h-full w-full rounded-[100%] border-t border-emerald-100" />
          <div className="-mt-20 ml-16 h-full w-full rounded-[100%] border-t border-emerald-100" />
          <div className="-mt-20 ml-24 h-full w-full rounded-[100%] border-t border-emerald-100" />
        </div>

        <div className="relative flex min-h-[165px] items-start gap-5">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-emerald-50 ring-2 ring-slate-100">
            {profileImage ? (
              <img src={profileImage} alt={staffName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-emerald-700">
                {initials}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 pt-4">
            <h3 className="truncate text-lg font-bold text-slate-950">{staffName}</h3>
            <p className="mt-1 truncate text-sm font-semibold text-slate-600">{staffDesignation}</p>
            <div className="mt-3 space-y-2 text-sm font-bold">
              <p className="line-clamp-2 break-words text-emerald-700">{employeeCode}</p>
              <div className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-slate-400" />
                <span className="truncate text-slate-600">{staffDepartment}</span>
              </div>
            </div>
          </div>
          <span className="rounded-full bg-[#0D3A35] px-3 py-1 text-xs font-bold text-white">
            Active
          </span>
        </div>

        <div className="relative mt-5 min-h-[104px] space-y-4 text-sm font-semibold text-slate-600">
          <div className="flex min-h-5 items-center gap-4">
            <Phone className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate">{staffPhone}</span>
          </div>
          <div className="flex min-h-5 items-center gap-4">
            <Mail className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate">{staffEmail}</span>
          </div>
          <div className="flex min-h-5 items-center gap-4">
            <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate">{location}</span>
          </div>
        </div>

        <div className="relative mt-5 min-h-[145px] border-t border-slate-200 pt-5">
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <div className="flex gap-3">
              <Calendar className="mt-0.5 h-4 w-4 text-slate-400" />
              <div>
                <p className="text-xs font-bold text-slate-500">Join Date</p>
                <p className="mt-1 text-sm font-bold text-slate-700">{formatDisplayDate(joinDate)}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <IdCard className="mt-0.5 h-4 w-4 text-slate-400" />
              <div>
                <p className="text-xs font-bold text-slate-500">Type</p>
                <p className="mt-1 text-sm font-bold text-slate-700">{staffType}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Droplet className="mt-0.5 h-4 w-4 text-slate-400" />
              <div>
                <p className="text-xs font-bold text-slate-500">Blood Group</p>
                <p className="mt-1 text-sm font-bold text-slate-700">{bloodGroup}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Cake className="mt-0.5 h-4 w-4 text-slate-400" />
              <div>
                <p className="text-xs font-bold text-slate-500">DOB / Age</p>
                <p className="mt-1 text-sm font-bold text-slate-700">{dobAge}</p>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setActiveProfileTab('Personal Details');
            setSelectedProfileStaff(staff);
          }}
          className="relative mt-auto flex h-11 w-full items-center justify-center rounded-lg bg-[#0D3A35] text-sm font-bold text-white transition hover:bg-[#092b27]"
        >
          View Profile
          <ArrowRight className="absolute right-4 h-4 w-4" />
        </button>
      </div>
    );
  };

  const renderStaffSection = (
    title: string,
    subtitle: string,
    employees: StaffApiItem[],
    Icon: typeof Users,
  ) => (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0D3A35] text-white shadow-sm">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p>
          </div>
        </div>
        <span className="w-fit rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-bold text-slate-600 shadow-sm">
          {formatTwoDigit(employees.length)} Employees
        </span>
      </div>

      {employees.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-7 items-start">
          {employees.map(renderStaffCard)}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center text-sm font-semibold text-slate-400">
          No employees in this section.
        </div>
      )}
    </section>
  );

  return (
    <div className="min-h-screen bg-[#fbfcfd] p-8 space-y-8 animate-in fade-in duration-300 relative text-slate-900">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm font-bold text-emerald-700">Organization</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Employee Directory</h1>
          <p className="mt-3 text-base font-medium text-slate-600">Manage and view all employee information</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button className="flex h-12 min-w-[220px] items-center justify-between rounded-lg border border-slate-200 bg-white px-5 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50">
            All Departments
            <ChevronDown className="h-4 w-4 text-slate-500" />
          </button>
          <button className="flex h-12 min-w-[250px] items-center justify-between rounded-lg border border-slate-200 bg-white px-5 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50">
            All Employment Types
            <ChevronDown className="h-4 w-4 text-slate-500" />
          </button>
          <button className="flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-5 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50">
            <Filter className="h-5 w-5 text-slate-500" />
            Filters
          </button>
          <div className="flex h-12 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <button className="flex w-14 items-center justify-center bg-[#0D3A35] text-white">
              <Grid3X3 className="h-5 w-5" />
            </button>
            <button className="flex w-14 items-center justify-center text-slate-500 hover:bg-slate-50">
              <List className="h-5 w-5" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleOpenModal}
            className="flex h-12 items-center gap-3 rounded-lg bg-[#0D3A35] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#092b27]"
          >
            <Plus className="h-5 w-5" />
            New Employee
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {statCards.map(stat => (
          <div key={stat.label} className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-5">
              <div className={cn("flex h-12 w-12 items-center justify-center rounded-full ring-2", stat.bg, stat.ring)}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-500">{stat.label}</p>
                <p className="mt-2 text-3xl font-bold leading-none text-slate-950">{stat.value}</p>
                <p className="mt-3 text-sm font-medium text-slate-500">{stat.hint}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, ID, role, department..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-11 pr-4 text-sm font-semibold text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
        />
      </div>

      {/* Content */}
      {isLoadingStaff ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
          <RefreshCw className="w-8 h-8 animate-spin opacity-40" />
          <p className="text-sm">Loading staff...</p>
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <p className="text-sm">No staff found.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {renderStaffSection(
            'Management Staff',
            'Office, administration, finance, HR, leadership, and coordination roles',
            managementStaff,
            Users,
          )}
          {renderStaffSection(
            'Field Staff',
            'Field-facing teams, supervisors, operators, drivers, and site roles',
            fieldStaff,
            MapPin,
          )}
        </div>
      )}

      <div className="flex flex-col gap-4 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-slate-500">
          Showing 1 to {filteredStaff.length} of {filteredStaff.length} employees
        </p>
        <div className="flex items-center gap-3">
          <button className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#0D3A35] text-sm font-bold text-white shadow-sm">
            1
          </button>
          <button className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* --- EMPLOYEE PROFILE MODAL --- */}
      {selectedProfileStaff && (() => {
        const staff = selectedProfileStaff;
        const info = staff.staff_information ?? {};
        const infoAny = info as any;
        const staffAny = staff as any;
        const staffName = info.staff_name ?? '-';
        const staffDesignation = info.staff_designation ?? '-';
        const staffDepartment = info.staff_department ?? '-';
        const staffPhone = info.staff_phone ?? '-';
        const staffType = getStaffType(staff);
        const showEmployeeScore = isFieldStaff(staff);
        const payrollConfig = payrollConfigs[staff.staff_id];
        const profileImage = info.profile_image_url;
        const employeeCode = getStaffField(staff, ['employee_code', 'employeeCode'], staff.staff_id || '-');
        const rawScore = getStaffField(staff, ['employee_score', 'employeeScore', 'score'], '');
        const employeeScore = rawScore
          ? Math.max(0, Math.min(100, Number(rawScore) || 0))
          : 70 + (Array.from(staff.staff_id || employeeCode).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 26);
        const employeeScoreDash = Math.round((employeeScore / 100) * 301.59);
        const staffEmail = getStaffField(staff, ['staff_email', 'email'], `${staffName.toLowerCase().replace(/\s+/g, '.')}@sbrpl.com`);
        const location = getStaffField(staff, ['location', 'address', 'staff_location'], 'Chhattisgarh');
        const joinDate = getStaffField(staff, ['joining_date', 'join_date'], staff.created_at);
        const bloodGroup = getStaffField(staff, ['blood_group', 'bloodGroup'], '-');
        const dob = getStaffField(staff, ['dob', 'date_of_birth', 'dateOfBirth'], '-');
        const age = getStaffField(staff, ['age'], '');
        const gender = getStaffField(staff, ['gender'], '-');
        const fatherName = getStaffField(staff, ['father_name', 'fatherName'], '-');
        const motherName = getStaffField(staff, ['mother_name', 'motherName'], '-');
        const maritalStatus = getStaffField(staff, ['marital_status', 'maritalStatus'], '-');
        const religion = getStaffField(staff, ['religion'], '-');
        const nationality = getStaffField(staff, ['nationality'], '-');
        const languages = getStaffField(staff, ['languages_known', 'languagesKnown'], '-');
        const presentAddress = getStaffField(staff, ['present_address', 'presentAddress'], location);
        const permanentAddress = getStaffField(staff, ['permanent_address', 'permanentAddress'], presentAddress);
        const reportsToName = getStaffField(staff, ['reports_to_name', 'reportsToName'], '-');
        const reportsToRole = getStaffField(staff, ['reports_to_role', 'reportsToRole'], '-');
        const firstAssignedBlock = Array.isArray(staff.assigned_blocks) ? staff.assigned_blocks[0] as any : null;
        const allocatedCluster = getStaffField(staff, ['allocated_cluster', 'allocatedCluster', 'cluster_name', 'clusterName', 'cluster'], '')
          || firstAssignedBlock?.cluster_name
          || firstAssignedBlock?.clusterName
          || firstAssignedBlock?.cluster
          || '-';
        const allocatedZone = getStaffField(staff, ['allocated_zone', 'allocatedZone', 'zone_name', 'zoneName', 'zone'], '')
          || firstAssignedBlock?.zone_name
          || firstAssignedBlock?.zoneName
          || firstAssignedBlock?.zone
          || '-';
        const employmentDocumentLabel = staffType === 'Consultant' ? 'Agreement' : 'Offer Letter';
        const initials = staffName
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map(part => part[0]?.toUpperCase())
          .join('') || '?';
        const docCards = [
          { label: 'Aadhaar Card', url: info.adhar_card_url ?? infoAny.aadhar_card_url ?? infoAny.adhaar_card_url },
          { label: 'PAN Card', url: infoAny.pan_card_url ?? staffAny.pan_card_url },
          { label: employmentDocumentLabel, url: infoAny.agreement_url ?? staffAny.agreement_url ?? infoAny.offer_letter_url ?? staffAny.offer_letter_url ?? infoAny.document_url ?? staffAny.document_url },
          { label: 'Bank Proof', url: infoAny.bank_proof_url ?? staffAny.bank_proof_url },
        ];
        const profileTabs = ['Personal Details', 'Job Details', 'Experience', 'Documents', 'Leave Balance', 'Payroll'];
        const aboutItems = [
          { label: 'Employee ID', value: employeeCode, Icon: IdCard },
          { label: 'Join Date', value: formatDisplayDate(joinDate), Icon: Calendar },
          { label: 'Date of Birth', value: dob === '-' ? '-' : `${formatDisplayDate(dob)}${age ? ` (${age})` : ''}`, Icon: Cake },
          { label: 'Employment Type', value: staffType, Icon: Briefcase },
          { label: 'Blood Group', value: bloodGroup, Icon: Droplet },
          { label: 'Gender', value: gender, Icon: User },
        ];
        const personalRows = [
          ['Father’s Name', fatherName, 'Mother’s Name', motherName],
          ['Marital Status', maritalStatus, 'Religion', religion],
          ['Nationality', nationality, 'Languages Known', languages],
          ['Present Address', presentAddress, 'Permanent Address', permanentAddress],
        ];
        const renderDocumentStrip = (large = false) => (
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-0 gap-3">
              {docCards.map((doc) => (
                <a
                  key={doc.label}
                  href={doc.url ? String(doc.url) : undefined}
                  target={doc.url ? '_blank' : undefined}
                  rel="noreferrer"
                  className={cn(
                    "shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-[#0D3A35]",
                    large ? "w-56" : "w-44"
                  )}
                >
                  <div className={cn("flex items-center justify-center bg-slate-50", large ? "h-28" : "h-16")}>
                    {doc.url ? (
                      <img src={String(doc.url)} alt={doc.label} className="h-full w-full object-cover" />
                    ) : (
                      <IdCard className={cn("text-slate-400", large ? "h-8 w-8" : "h-6 w-6")} />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-bold text-slate-950">{doc.label}</p>
                    <p className={cn("mt-1 text-xs font-bold", doc.url ? "text-emerald-700" : "text-slate-400")}>
                      {doc.url ? 'Uploaded' : 'Pending'}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        );

        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-[2px]">
            <div className="grid max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl lg:grid-cols-[270px_1fr]">
              <aside className="relative flex flex-col overflow-hidden bg-[#0D3A35] px-5 py-6 text-white">
                <div className="pointer-events-none absolute bottom-44 left-0 h-40 w-full opacity-10">
                  <div className="h-full w-[150%] rounded-[100%] border-t border-white" />
                  <div className="-mt-40 ml-8 h-full w-[150%] rounded-[100%] border-t border-white" />
                  <div className="-mt-40 ml-16 h-full w-[150%] rounded-[100%] border-t border-white" />
                  <div className="-mt-40 ml-24 h-full w-[150%] rounded-[100%] border-t border-white" />
                </div>

                <div className="relative flex flex-col items-center">
                  <div className="h-28 w-28 overflow-hidden rounded-full border-4 border-white bg-emerald-50 shadow-xl">
                    {profileImage ? (
                      <img src={profileImage} alt={staffName} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-[#0D3A35]">
                        {initials}
                      </div>
                    )}
                  </div>
                  <h2 className="mt-5 text-center text-xl font-bold">{staffName}</h2>
                  <p className="mt-1.5 text-center text-sm font-bold text-white/90">{staffDesignation}</p>
                  <span className="mt-4 rounded-full bg-white/15 px-4 py-1.5 text-xs font-bold text-white ring-1 ring-white/15">
                    Active
                  </span>
                </div>

                <div className="relative mt-7 space-y-4 border-y border-white/20 py-5 text-sm font-bold">
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-white/90" />
                    <span>{staffDepartment}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-white/90" />
                    <span>{staffPhone}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-white/90" />
                    <span className="break-all">{staffEmail}</span>
                  </div>
	                  <div className="flex items-center gap-3">
	                    <MapPin className="h-4 w-4 text-white/90" />
	                    <span>{location}</span>
	                  </div>
	                </div>

	                <div className="relative space-y-4 border-b border-white/20 py-5 text-sm">
	                  <div className="flex items-start gap-3">
	                    <LayoutGrid className="mt-0.5 h-4 w-4 shrink-0 text-white/90" />
	                    <div>
	                      <p className="text-xs font-bold uppercase tracking-wide text-white/60">Allocated Cluster</p>
	                      <p className="mt-1 font-bold text-white">{allocatedCluster}</p>
	                    </div>
	                  </div>
	                  <div className="flex items-start gap-3">
	                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/90" />
	                    <div>
	                      <p className="text-xs font-bold uppercase tracking-wide text-white/60">Allocated Zone</p>
	                      <p className="mt-1 font-bold text-white">{allocatedZone}</p>
	                    </div>
	                  </div>
	                </div>

	                <div className="relative mt-auto border-t border-white/20 pt-5">
                  <p className="text-sm font-bold text-white/90">Reports To</p>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-sm font-bold">
                      {reportsToName !== '-' ? reportsToName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() : 'NA'}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{reportsToName}</p>
                      <p className="mt-1 text-sm text-white/80">{reportsToRole}</p>
                    </div>
                  </div>
                  <button className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/25 text-sm font-bold text-white transition hover:bg-white/10">
                    <Upload className="h-4 w-4 rotate-180" />
                    Download Profile
                  </button>
                </div>
              </aside>

              <main className="relative overflow-y-auto px-6 py-5">
                <button
                  type="button"
                  onClick={() => setSelectedProfileStaff(null)}
                  className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 shadow-md transition hover:bg-slate-50"
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="mb-5 border-b border-slate-200 pr-12">
                  {profileTabs.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveProfileTab(tab)}
                      className={cn(
                        "mr-6 border-b-2 px-0 pb-3 text-sm font-bold transition",
                        activeProfileTab === tab ? "border-[#0D3A35] text-slate-950" : "border-transparent text-slate-500 hover:text-slate-800"
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {activeProfileTab === 'Personal Details' && (
                  <>
                    <section>
                      <h3 className="text-sm font-bold text-slate-950">About</h3>
                      <div className="mt-4 rounded-xl border border-slate-200 p-4">
                        <div className={cn("grid gap-5", showEmployeeScore && "lg:grid-cols-[1fr_190px]")}>
                          <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
                            {aboutItems.map(({ label, value, Icon }) => (
                              <div key={label} className="flex gap-3">
                                <Icon className="mt-1 h-4 w-4 shrink-0 text-[#0D3A35]" />
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-500">{label}</p>
                                  <p className="mt-1 text-sm font-bold text-slate-950">{value}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                          {showEmployeeScore && (
                            <div className="flex items-center justify-center border-t border-slate-200 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                              <div className="text-center">
                                <div className="relative mx-auto h-28 w-28">
                                  <svg viewBox="0 0 120 120" className="h-28 w-28 -rotate-90">
                                    <circle cx="60" cy="60" r="48" fill="none" stroke="#e5efeb" strokeWidth="12" />
                                    <circle
                                      cx="60"
                                      cy="60"
                                      r="48"
                                      fill="none"
                                      stroke="#0D3A35"
                                      strokeWidth="12"
                                      strokeLinecap="round"
                                      strokeDasharray={`${employeeScoreDash} 301.59`}
                                    />
                                  </svg>
                                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-3xl font-extrabold text-slate-950">{employeeScore}</span>
                                    <span className="-mt-1 text-sm font-bold text-slate-500">/100</span>
                                  </div>
                                </div>
                                <div className="mt-3 flex items-center justify-center gap-2">
                                  <span className="text-sm font-extrabold text-[#0D3A35]">Employee Score</span>
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs font-bold text-slate-500">i</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </section>

                    <section className="mt-5">
                      <h3 className="text-sm font-bold text-slate-950">Documents</h3>
                      <div className="mt-3">{renderDocumentStrip(false)}</div>
                    </section>

                    <section className="mt-5 space-y-4">
                      {personalRows.map(([leftLabel, leftValue, rightLabel, rightValue]) => (
                        <div key={leftLabel} className="grid gap-6 md:grid-cols-2">
                          <div className="grid grid-cols-[140px_1fr] gap-4">
                            <p className="text-sm font-bold text-slate-500">{leftLabel}</p>
                            <p className="text-sm font-bold text-slate-950">{leftValue}</p>
                          </div>
                          <div className="grid grid-cols-[150px_1fr] gap-4">
                            <p className="text-sm font-bold text-slate-500">{rightLabel}</p>
                            <p className="text-sm font-bold text-slate-950">{rightValue}</p>
                          </div>
                        </div>
                      ))}
                    </section>
                  </>
                )}

                {activeProfileTab === 'Job Details' && (
                  <section>
                    <h3 className="text-sm font-bold text-slate-950">Department & Role</h3>
                    <div className="mt-3 rounded-xl border border-slate-200 p-4">
                      <div className="grid gap-7 sm:grid-cols-2">
                        <div className="flex gap-3">
                          <Users className="mt-1 h-4 w-4 text-[#0D3A35]" />
                          <div>
                            <p className="text-xs font-bold text-slate-500">Department</p>
                            <p className="mt-1 text-sm font-bold text-slate-950">{staffDepartment}</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <Briefcase className="mt-1 h-4 w-4 text-[#0D3A35]" />
                          <div>
                            <p className="text-xs font-bold text-slate-500">Designation</p>
                            <p className="mt-1 text-sm font-bold text-slate-950">{staffDesignation}</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <Calendar className="mt-1 h-4 w-4 text-[#0D3A35]" />
                          <div>
                            <p className="text-xs font-bold text-slate-500">Join Date</p>
                            <p className="mt-1 text-sm font-bold text-slate-950">{formatDisplayDate(joinDate)}</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <IdCard className="mt-1 h-4 w-4 text-[#0D3A35]" />
                          <div>
                            <p className="text-xs font-bold text-slate-500">Employment Type</p>
                            <p className="mt-1 text-sm font-bold text-slate-950">{staffType}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {activeProfileTab === 'Experience' && (
                  <section className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">
                    No experience history added.
                  </section>
                )}

                {activeProfileTab === 'Documents' && (
                  <section>
                    <h3 className="text-sm font-bold text-slate-950">Document Preview</h3>
                    <div className="mt-3">{renderDocumentStrip(true)}</div>
                  </section>
                )}

                {activeProfileTab === 'Leave Balance' && (
                  <section className="grid gap-3 sm:grid-cols-3">
                    {['Casual Leave', 'Sick Leave', 'Earned Leave'].map((label) => (
                      <div key={label} className="rounded-xl border border-slate-200 p-4">
                        <p className="text-xs font-bold text-slate-500">{label}</p>
                        <p className="mt-2 text-2xl font-bold text-slate-950">0</p>
                      </div>
                    ))}
                  </section>
                )}

                {activeProfileTab === 'Payroll' && (
                  <section className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 p-4">
                      <p className="text-xs font-bold text-slate-500">Base Salary</p>
                      <p className="mt-2 text-lg font-bold text-slate-950">{payrollConfig ? `₹${payrollConfig.baseSalary.toLocaleString('en-IN')}` : '-'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <p className="text-xs font-bold text-slate-500">Additions</p>
                      <p className="mt-2 text-lg font-bold text-slate-950">{payrollConfig ? `₹${payrollConfig.additions.toLocaleString('en-IN')}` : '-'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <p className="text-xs font-bold text-slate-500">Deductions</p>
                      <p className="mt-2 text-lg font-bold text-slate-950">{payrollConfig ? `₹${payrollConfig.deductions.toLocaleString('en-IN')}` : '-'}</p>
                    </div>
                  </section>
                )}

                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleOpenEditProfile(staff)}
                    className="flex h-10 items-center gap-2 rounded-lg bg-[#0D3A35] px-6 text-sm font-bold text-white shadow-md transition hover:bg-[#092b27]"
                  >
                    <Hash className="h-4 w-4 rotate-45" />
                    Edit Profile
                  </button>
                </div>
              </main>
            </div>
          </div>
        );
      })()}

      {/* --- EDIT PROFILE MODAL --- */}
      {isEditProfileOpen && selectedProfileStaff && (() => {
        const reportToOptions = staffList.filter(staff => staff.staff_id !== selectedProfileStaff.staff_id);
        const selectedReportToId = editProfileDetails.reportsToId
          || reportToOptions.find(staff => staff.staff_information?.staff_name === editProfileDetails.reportsToName)?.staff_id
          || '';
        const employmentDocumentLabel = employmentType === 'Consultant' ? 'Agreement' : 'Offer Letter';
        const uploadCard = (
          label: string,
          fileKey: keyof typeof editProfileFiles,
          currentUrl: string,
          currentFile?: File,
        ) => (
          <label className="flex min-h-[92px] cursor-pointer items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 transition hover:border-[#0D3A35] hover:bg-emerald-50">
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setEditProfileFiles(prev => ({ ...prev, [fileKey]: file }));
              }}
            />
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white ring-1 ring-slate-200">
              <Upload className="h-5 w-5 text-[#0D3A35]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-slate-900">{label}</p>
              <p className={cn("mt-1 truncate text-xs font-bold", currentFile || currentUrl ? "text-emerald-700" : "text-slate-400")}>
                {currentFile ? currentFile.name : currentUrl ? 'Uploaded' : 'Click to upload'}
              </p>
            </div>
          </label>
        );

        const field = (label: string, Icon: React.ElementType, input: React.ReactNode, span?: boolean) => (
          <div className={cn("space-y-2", span && "sm:col-span-2")}>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
              <Icon className="h-3.5 w-3.5 text-[#0D3A35]" />
              {label}
            </label>
            {input}
          </div>
        );
        const inputClass = "h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#0D3A35]";
        const textareaClass = "min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-[#0D3A35]";
        const sectionCard = (title: string, Icon: React.ElementType, children: React.ReactNode) => (
          <section>
            <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-950">
              <Icon className="h-4 w-4 text-[#0D3A35]" />
              {title}
            </h4>
            <div className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
              {children}
            </div>
          </section>
        );

        return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-[2px]">
          <div className="grid max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0D3A35]/10">
                  <Hash className="h-5 w-5 rotate-45 text-[#0D3A35]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-950">Edit Profile</h3>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">{selectedProfileStaff.staff_id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditProfileOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white shadow-md transition hover:bg-slate-50"
              >
                <X className="h-5 w-5 text-slate-600" />
              </button>
            </div>

            <div className="space-y-5 overflow-y-auto p-6">
              {sectionCard('Basic Information', User, <>
                {field('Full Name', User, <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />)}
                {field('Phone', Phone, <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />)}
                {field('Email', Mail, <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />)}
                {field('Joining Date', Calendar, <input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} className={inputClass} />)}
                {field('Employee Score', ShieldCheck, (
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editProfileDetails.employeeScore}
                    onChange={(e) => setEditProfileDetails(prev => ({ ...prev, employeeScore: e.target.value }))}
                    className={inputClass}
                    placeholder="0-100"
                  />
                ))}
                {field('Profile Image URL', ImageIcon, (
                  <input
                    value={editProfileDetails.profileImageUrl}
                    onChange={(e) => setEditProfileDetails(prev => ({ ...prev, profileImageUrl: e.target.value }))}
                    className={inputClass}
                    placeholder="https://..."
                  />
                ))}
              </>)}

              {sectionCard('Job Details', Briefcase, <>
                {field('Department', Building2, (
                  <select value={department} onChange={(e) => setDepartment(e.target.value)} className={inputClass}>
                    <option value="Admin">Admin</option>
                    <option value="Finance">Finance</option>
                    <option value="HR">HR</option>
                    <option value="Logistics">Logistics</option>
                    <option value="Operations">Operations</option>
                    <option value="Directors Office">Directors Office</option>
                  </select>
                ))}
                {field('Designation', Briefcase, (
                  <select value={designation} onChange={(e) => setDesignation(e.target.value)} className={inputClass}>
                    <option value="Driver">Driver</option>
                    <option value="Executive">Executive</option>
                    <option value="EA To Director">EA To Director</option>
                    <option value="Field Manager">Field Manager</option>
                    <option value="Labour">Labour</option>
                    <option value="Manager">Manager</option>
                    <option value="Operator">Operator</option>
                    <option value="Supervisor">Supervisor</option>
                    <option value="Director">Director</option>
                  </select>
                ))}
                {field('Employment Type', IdCard, (
                  <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value as any)} className={inputClass}>
                    <option value="Permanent">Permanent</option>
                    <option value="Contract">Contract</option>
                    <option value="Consultant">Consultant</option>
                  </select>
                ))}
                {field('Reports To Name', Users, (
                  <div className="relative">
                    <select
                      value={selectedReportToId}
                      onChange={(e) => {
                        const manager = reportToOptions.find(staff => staff.staff_id === e.target.value);
                        setEditProfileDetails(prev => ({
                          ...prev,
                          reportsToId: manager?.staff_id ?? '',
                          reportsToName: manager?.staff_information?.staff_name ?? '',
                          reportsToRole: manager?.staff_information?.staff_designation ?? '',
                        }));
                      }}
                      className="h-11 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-10 text-sm font-semibold outline-none focus:border-[#0D3A35]"
                    >
                      <option value="">Select reporting manager</option>
                      {reportToOptions.map(staff => (
                        <option key={staff.staff_id} value={staff.staff_id}>
                          {staff.staff_information?.staff_name ?? staff.staff_id} - {staff.staff_information?.staff_designation ?? 'Staff'}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  </div>
                ))}
                {field('Reports To Role', UserCheck, (
                  <input
                    value={editProfileDetails.reportsToRole}
                    readOnly
                    placeholder="Auto-filled after manager selection"
                    className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600 outline-none"
                  />
                ))}
              </>)}

              {sectionCard('Personal Details', IdCard, <>
                {field('Date of Birth', Cake, <input type="date" value={editProfileDetails.dob} onChange={(e) => setEditProfileDetails(prev => ({ ...prev, dob: e.target.value }))} className={inputClass} />)}
                {field('Age', Hash, <input value={editProfileDetails.age} onChange={(e) => setEditProfileDetails(prev => ({ ...prev, age: e.target.value }))} className={inputClass} />)}
                {field('Gender', Users, (
                  <select value={editProfileDetails.gender} onChange={(e) => setEditProfileDetails(prev => ({ ...prev, gender: e.target.value }))} className={inputClass}>
                    <option value="">Select gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                ))}
                {field('Blood Group', Droplet, <input value={editProfileDetails.bloodGroup} onChange={(e) => setEditProfileDetails(prev => ({ ...prev, bloodGroup: e.target.value }))} className={inputClass} placeholder="A+, B-, O+" />)}
                {field("Father's Name", User, <input value={editProfileDetails.fatherName} onChange={(e) => setEditProfileDetails(prev => ({ ...prev, fatherName: e.target.value }))} className={inputClass} />)}
                {field("Mother's Name", User, <input value={editProfileDetails.motherName} onChange={(e) => setEditProfileDetails(prev => ({ ...prev, motherName: e.target.value }))} className={inputClass} />)}
                {field('Marital Status', Heart, <input value={editProfileDetails.maritalStatus} onChange={(e) => setEditProfileDetails(prev => ({ ...prev, maritalStatus: e.target.value }))} className={inputClass} />)}
                {field('Religion', Landmark, <input value={editProfileDetails.religion} onChange={(e) => setEditProfileDetails(prev => ({ ...prev, religion: e.target.value }))} className={inputClass} />)}
                {field('Nationality', Globe, <input value={editProfileDetails.nationality} onChange={(e) => setEditProfileDetails(prev => ({ ...prev, nationality: e.target.value }))} className={inputClass} />)}
                {field('Languages Known', Languages, <input value={editProfileDetails.languagesKnown} onChange={(e) => setEditProfileDetails(prev => ({ ...prev, languagesKnown: e.target.value }))} className={inputClass} />)}
                {field('Present Address', Home, <textarea value={editProfileDetails.presentAddress} onChange={(e) => setEditProfileDetails(prev => ({ ...prev, presentAddress: e.target.value }))} className={textareaClass} />, true)}
                {field('Permanent Address', MapPin, <textarea value={editProfileDetails.permanentAddress} onChange={(e) => setEditProfileDetails(prev => ({ ...prev, permanentAddress: e.target.value }))} className={textareaClass} />, true)}
              </>)}

              <section>
                <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-950">
                  <Upload className="h-4 w-4 text-[#0D3A35]" />
                  Document Uploads
                </h4>
                <div className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
                  {uploadCard('Profile Photo', 'profile', editProfileDetails.profileImageUrl, editProfileFiles.profile)}
                  {uploadCard('Aadhaar Card', 'aadhaar', editProfileDetails.aadhaarUrl, editProfileFiles.aadhaar)}
                  {uploadCard('PAN Card', 'pan', editProfileDetails.panUrl, editProfileFiles.pan)}
                  {uploadCard(employmentDocumentLabel, 'offer', editProfileDetails.offerLetterUrl, editProfileFiles.offer)}
                  {uploadCard('Bank Proof', 'bankProof', editProfileDetails.bankProofUrl, editProfileFiles.bankProof)}
                </div>
              </section>

              {sectionCard('Bank Details', Landmark, <>
                {field('Bank Name', Landmark, <input value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputClass} />)}
                {field('Account Number', WalletCards, <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className={inputClass} />)}
                {field('IFSC Code', Hash, <input value={ifscCode} onChange={(e) => setIfscCode(e.target.value)} className={inputClass} />)}
              </>)}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button type="button" onClick={() => setIsEditProfileOpen(false)} className="h-10 rounded-lg border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" onClick={handleSaveProfileEdit} className="h-10 rounded-lg bg-[#0D3A35] px-5 text-sm font-bold text-white hover:bg-[#092b27]">
                Save Changes
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* --- ADD EMPLOYEE MODAL --- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-background w-full max-w-2xl rounded-xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-white sticky top-0 z-10">
              <div>
                <h3 className="font-bold text-xl text-foreground">Add New Employee</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Step {formStep} of 2</p>
              </div>
              <button 
                onClick={handleCloseModal} 
                className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Content */}
            <div className="p-6 overflow-y-auto">
              <form id="add-staff-form" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {formStep === 1 ? (
                  <>
                    {/* Profile Image */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Profile Image</label>
                      <div className="flex flex-col items-center gap-2">
                        <div
                          onClick={() => document.getElementById('profile-image-input')?.click()}
                          className="relative w-24 h-24 rounded-full border-2 border-dashed border-input bg-muted/30 flex items-center justify-center cursor-pointer hover:border-primary/60 hover:bg-muted/50 transition-all overflow-hidden"
                        >
                          {profileImagePreview ? (
                            <img src={profileImagePreview} alt="Profile" className="w-full h-full object-cover" />
                          ) : (
                            <div className="flex flex-col items-center gap-1 text-muted-foreground">
                              <ImageIcon className="w-6 h-6" />
                              <span className="text-[10px]">Upload</span>
                            </div>
                          )}
                          {isSubmitting && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-full">
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                        </div>
                        <input
                          id="profile-image-input"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleProfileImageChange}
                        />
                        <p className="text-[11px] text-muted-foreground">Click to upload a face photo</p>
                      </div>
                    </div>

                    {/* Aadhaar Card Photo */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Aadhaar Card Photo</label>
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all pl-10 file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/80"
                          onChange={handleAadharImageChange}
                        />
                        <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      </div>
                      {aadharImagePreview && (
                        <div className="relative rounded-lg overflow-hidden border border-border">
                          <img src={aadharImagePreview} alt="Aadhaar card" className="w-full h-28 object-cover" />
                          {isSubmitting && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                        </div>
                      )}
                      <p className="text-[11px] text-muted-foreground">Upload front side (preferred).</p>
                    </div>
                
                {/* Full Name */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Full Name *</label>
                  <div className="relative">
                    <input
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-3 py-2.5 border border-input rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all pl-10"
                      placeholder="e.g. John Doe"
                    />
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  </div>
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Phone *</label>
                  <div className="relative">
                    <input
                      required
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3 py-2.5 border border-input rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all pl-10"
                      placeholder="+91 00000 00000"
                    />
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Email</label>
                  <div className="relative">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2.5 border border-input rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all pl-10"
                      placeholder="john@example.com"
                    />
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  </div>
                </div>

                {/* Joining Date */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Joining Date *</label>
                  <div className="relative">
                    <input
                      required
                      type="date"
                      value={joiningDate}
                      onChange={(e) => setJoiningDate(e.target.value)}
                      className="w-full px-3 py-2.5 border border-input rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all pl-10"
                    />
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                {/* Department */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Department *</label>
                  <div className="relative">
                    <select
                      required
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full px-3 py-2.5 border border-input rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all pl-10 appearance-none"
                    >
                      <option value="">Select department</option>
                      <option value="Admin">Admin</option>
                      <option value="Finance">Finance</option>
                      <option value="HR">HR</option>
                      <option value="Logistics">Logistics</option>
                      <option value="Operations">Operations</option>
                      <option value="Directors Office">Directors Office</option>
                    </select>
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                {/* Designation */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Designation *</label>
                  <div className="relative">
                    <select
                      required
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      className="w-full px-3 py-2.5 border border-input rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all pl-10 appearance-none"
                    >
                      <option value="">Select designation</option>
                      <option value="Driver">Driver</option>
                      <option value="Executive">Executive</option>
                      <option value="EA To Director">EA To Director</option>
                      <option value="Field Manager">Field Manager</option>
                      <option value="Labour">Labour</option>
                      <option value="Manager">Manager</option>
                      <option value="Operator">Operator</option>
                      <option value="Supervisor">Supervisor</option>
                      <option value="Director">Director</option>
                    </select>
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                {/* Driving Licence Photo (Driver only) */}
                {designation === 'Driver' && (
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-foreground">Driving Licence Photo</label>
                    <div className="relative">
                      <input
                        type="file"
                        accept="image/*"
                        className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/80"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Required for drivers.</p>
                  </div>
                )}

                {/* Employment Type */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Employment Type</label>
                  <select
                    value={employmentType}
                    onChange={(e) => handleEmploymentTypeChange(e.target.value as any)}
                    className="w-full px-3 py-2.5 border border-input rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  >
                    <option value="Permanent">Permanent</option>
                    <option value="Contract">Contract</option>
                    <option value="Consultant">Consultant</option>
                  </select>
                </div>

                {/* Vendor / Work Order (Contract only) */}
                {employmentType === 'Contract' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Work Order / Vendor</label>
                    {isFetchingVendors ? (
                      <div className="flex items-center gap-2 px-3 py-2.5 border border-input rounded-lg text-sm text-muted-foreground bg-muted/30">
                        <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        Loading work orders...
                      </div>
                    ) : (
                      <select
                        value={selectedVendorIndex !== null ? String(selectedVendorIndex) : ''}
                        onChange={(e) => setSelectedVendorIndex(e.target.value === '' ? null : Number(e.target.value))}
                        className="w-full px-3 py-2.5 border border-input rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      >
                        <option value="">Select work order</option>
                        {vendors.map((v, i) => (
                          <option key={`${v.vendor_id}-${v.order_number}`} value={i}>
                            {v.vendor_name} • {v.order_number} • {v.vendor_contact}
                          </option>
                        ))}
                      </select>
                    )}
                    {selectedVendorIndex !== null && (
                      <p className="text-[11px] text-muted-foreground">
                        Order: <span className="font-medium text-foreground">{vendors[selectedVendorIndex]?.order_number}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* User Account Link */}
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-foreground">Link to User Account</label>
                  <div className="relative">
                    <select className="w-full px-3 py-2.5 border border-input rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all pl-10 appearance-none">
                      <option value="">Select user account (optional)</option>
                      <option value="user1">rajesh.kumar@sbr.com</option>
                      <option value="user2">amit.singh@sbr.com</option>
                    </select>
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Link this employee to a user account to enable self-service attendance.</p>
                </div>

                  </>
                ) : (
                  <>
                    {/* Bank Name */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Bank Name *</label>
                      <div className="relative">
                        <input
                          required
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                          className="w-full px-3 py-2.5 border border-input rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all pl-10"
                          placeholder="e.g. State Bank of India"
                        />
                        <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>

                    {/* Account Number */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Account Number *</label>
                      <div className="relative">
                        <input
                          required
                          inputMode="numeric"
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value)}
                          className="w-full px-3 py-2.5 border border-input rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all pl-10"
                          placeholder="e.g. 1234567890"
                        />
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>

                    {/* IFSC */}
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-medium text-foreground">IFSC Code *</label>
                      <div className="relative">
                        <input
                          required
                          value={ifscCode}
                          onChange={(e) => setIfscCode(e.target.value)}
                          className="w-full px-3 py-2.5 border border-input rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                          placeholder="e.g. SBIN0001234"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">Used for bank transfers / salary payments.</p>
                    </div>
                  </>
                )}

              </form>
            </div>

            {/* Footer Buttons */}
            <div className="px-6 py-4 border-t border-border bg-gray-50 flex justify-end gap-3">
              <button 
                type="button" 
                onClick={handleCloseModal} 
                className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
              >
                Cancel
              </button>

              {formStep === 2 && (
                <button
                  type="button"
                  onClick={() => setFormStep(1)}
                  disabled={isSubmitting}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                >
                  Back
                </button>
              )}

              {formStep === 1 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  disabled={isSubmitting}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
                >
                  Next
                </button>
              ) : (
                <button
                  type="submit"
                  form="add-staff-form"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
                >
                  {isSubmitting ? 'Creating...' : 'Create Employee'}
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* --- PAYROLL CONFIG MODAL --- */}
      {isPayrollModalOpen && payrollModalStaffId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-background w-full max-w-md rounded-xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-white sticky top-0 z-10">
              <div>
                <h3 className="font-bold text-lg text-foreground">Payroll Configuration</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Configure salary for this employee</p>
              </div>
              <button onClick={() => setIsPayrollModalOpen(false)} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">Base Salary (₹)</label>
                <input
                  type="number"
                  value={pBaseSalary as any}
                  onChange={(e) => setPBaseSalary(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Deductions (₹)</label>
                <input
                  type="number"
                  value={pDeductions as any}
                  onChange={(e) => setPDeductions(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Additions (₹)</label>
                <input
                  type="number"
                  value={pAdditions as any}
                  onChange={(e) => setPAdditions(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border bg-gray-50 flex justify-end gap-3">
              <button onClick={() => setIsPayrollModalOpen(false)} className="px-4 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg">Cancel</button>
              <button
                onClick={() => {
                  if (!payrollModalStaffId) return;
                  const bs = Number(pBaseSalary) || 0;
                  const ded = Number(pDeductions) || 0;
                  const add = Number(pAdditions) || 0;
                  setPayrollConfigs(prev => ({ ...prev, [payrollModalStaffId]: { baseSalary: bs, deductions: ded, additions: add } }));
                  setIsPayrollModalOpen(false);
                  toast.success('Payroll config saved');
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffOnboarding;
